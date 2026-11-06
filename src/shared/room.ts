import {
  AMMO_MAX,
  AMMO_PACK,
  CUTS,
  DOWN_TICKS,
  HP_MAX,
  INPUT_BURST,
  MAX_NAME,
  MAX_REWIND,
  PACK_BACK,
  PACK_HP,
  PACK_R,
  PLASMA_MAX,
  RULES,
  SHOCK_KNOCK,
  SHOCK_TICKS,
  SNAP_EVERY,
  TACKLE_COOLDOWN,
  TEAM_COLOR,
  TICK_HZ,
} from './constants';
import { knock, limbOf, strike } from './blade';
import { Ctf } from './ctf';
import { STRIKE, step, within } from './gun';
import { HIGHLINE } from './map';
import { forward, spawn, speedOf, stumble } from './physics';
import { PLASMA_LAG, PLASMA_STEP, fly, launch } from './plasma';
import type { Flying } from './plasma';
import { decodeInput, encodeSnapshot, parseText } from './protocol';
import type { ClientText, ServerText } from './protocol';
import { reaches, tackling } from './tackle';
import { LIMB } from './types';
import type { Conn, Every, PlayerInfo, PlayerState, Rules } from './types';
import { build } from './world';
import type { World, WorldDef } from './world';

interface Player {
  conn: Conn;
  info: PlayerInfo;
  state: PlayerState;
  /** Inputs the player may still apply: +1 per tick, at most INPUT_BURST. */
  bank: number;
  /** Seq of the last applied input. Starts at 65535, the seq before the client's first (0). */
  ack: number;
  /** The id of the player who tackled this one, while the stumble runs. */
  by: number;
  /** The host tick of the last tackle this player made. */
  tackled: number;
}

/** Ticks run at most this many times per timer callback, so a stalled host does not spiral. */
const MAX_CATCH_UP = 20;
/** A new player does not spawn within this many metres of another one. */
const SPAWN_CLEAR = 2;

/** First n characters (code points) of s, trimmed. */
const cut = (s: string, n: number): string => Array.from(s).slice(0, n).join('').trim();

const cleanName = (raw: unknown): string =>
  cut(
    (typeof raw === 'string' ? raw : '')
      .replace(/\s+/g, ' ')
      .replace(/\p{Cc}/gu, '')
      .trim(),
    MAX_NAME,
  );

/** name, or name 2, name 3… (base cut to stay within MAX_NAME) when it is taken. */
const unique = (name: string, taken: string[]): string => {
  let out = name;
  for (let n = 2; taken.includes(out); n++) {
    out = `${cut(name, MAX_NAME - 1 - `${n}`.length)} ${n}`;
  }
  return out;
};

const setEvery: Every = (cb, ms) => {
  const id = setInterval(cb, ms);
  return () => clearInterval(id);
};

/**
 * One game, transport-agnostic. The Node server and the local host tab both drive a Room: they
 * feed it connections and frames, the room answers through Conn.send.
 *
 * - A peer joins with { t: 'join', name }: unique name (`Bob 2`), the smaller team (red on a tie)
 *   and its colour, a spawn point of the team not taken by another player; 'full' beyond
 *   rules.maxPlayers. Everyone gets a fresh 'roster' on every join and leave. Teams are not
 *   rebalanced when someone leaves: the next join fills the smaller one.
 * - Each input frame moves its player at once with move(); the INPUT_BURST bank drops the excess.
 *   rewind() answers where the others were drawn at the view tick of an input (lag compensation,
 *   at most MAX_REWIND ticks back).
 * - Every SNAP_EVERY ticks of TICK_HZ, one snapshot with every player, the score, the clock and
 *   the two flags goes to every peer. The flag rules and the match are ctf.ts's: a match ends at
 *   rules.scoreLimit or rules.timeLimit ('end' text to everyone), the end screen runs END_SCREEN
 *   seconds, then everyone is put back at a spawn of his team and the score starts again.
 *   drop(id) makes a carrier drop the flag: the hook of the tackle (step 7).
 */
export class Room {
  /** Every connected peer; null until it joins. */
  private peers = new Map<Conn, Player | null>();
  private ticks = 0;
  /** The players as each snapshot of the last MAX_REWIND ticks sent them. */
  private history: { tick: number; players: PlayerState[] }[] = [];
  private world: World;
  private ctf: Ctf;
  private halt: (() => void) | undefined;
  private rules: Rules;
  /** Round-robin cursor over the spawn points of each team, used once they are all taken. */
  private rr = [0, 0];
  /** Ticks before each health pack of the map is back: 0 when it is there to take. */
  private gone: number[];
  /** The plasma balls in flight, and the ones that burst since the last snapshot, which sends them once more. */
  private balls: Flying[] = [];

  /** Missing rules fall back to RULES. */
  public constructor(rules: Partial<Rules> = {}, map: WorldDef = HIGHLINE) {
    this.rules = { ...RULES, ...rules };
    this.world = build(map);
    this.ctf = new Ctf(this.world, this.rules);
    this.gone = [...(map.packs ?? []), ...(map.ammo ?? [])].map(() => 0);
  }

  /** Number of joined players. */
  public get size(): number {
    return this.players().length;
  }

  /** A peer opened. Nothing is sent until it joins. */
  public connect(conn: Conn): void {
    this.peers.set(conn, null);
  }

  /** A text (JSON) or binary frame from a peer. */
  public receive(conn: Conn, data: string | ArrayBuffer): void {
    const p = this.peers.get(conn);
    if (typeof data === 'string') {
      const msg = parseText<ClientText>(data);
      if (p === null && msg?.t === 'join') {
        this.join(conn, msg.name);
      }
      return;
    }
    const input = p && decodeInput(data);
    // An input beyond the bank is dropped, and not acked.
    if (input && p.bank > 0) {
      p.bank--;
      const struck = step(p.state, input, this.world, p.info.team, !this.ctf.over);
      this.ctf.moved(p.state);
      this.tackle(p, input.view);
      if (struck === STRIKE.SHOT) {
        this.shoot(p, input.view);
      } else if (struck === STRIKE.CUT) {
        this.cut(p, input.view);
      }
      p.ack = input.seq;
    }
  }

  /** A peer left: its player goes, the roster goes out again. */
  public disconnect(conn: Conn): void {
    const p = this.peers.get(conn);
    this.peers.delete(conn);
    if (p) {
      this.ctf.leave(p.info.id);
      if (!this.size) {
        this.ctf.reset();
        this.gone.fill(0);
      }
      this.roster();
    }
  }

  /**
   * Makes the player `id` drop the flag he carries, where he stands (the tackle of step 7).
   * False when he carries none or is not there.
   */
  public drop(id: number): boolean {
    const p = this.players().find(q => q.info.id === id);
    return !!p && this.ctf.drop(p.state);
  }

  /** One host tick. Public so tests can drive the room without a timer. */
  public tick(): void {
    const players = this.players();
    if (!players.length) {
      this.balls = [];
      return;
    }
    const now = ++this.ticks;
    for (const p of players) {
      p.bank = Math.min(INPUT_BURST, p.bank + 1);
    }
    for (const b of this.balls) {
      if (!b.burst && b.left > 0) {
        this.fly(b, PLASMA_STEP);
      }
    }
    this.heal(players);
    // Someone lying down touches no flag.
    const turn = this.ctf.tick(
      players
        .filter(p => !p.state.down)
        .map(p => ({ id: p.info.id, team: p.info.team, state: p.state })),
    );
    if (turn === 'end') {
      this.end(players);
    } else if (turn === 'start') {
      this.restart(players);
    }
    if (now % SNAP_EVERY === 0) {
      this.history.push({ tick: now, players: players.map(p => ({ ...p.state })) });
      while (this.history[0].tick < now - MAX_REWIND) {
        this.history.shift();
      }
      // One buffer for everyone: transports must not mutate it.
      const snap = encodeSnapshot({
        tick: now,
        players: players.map(p => ({ ...p.state, ack: p.ack, by: p.state.stun ? p.by : 0 })),
        ...this.ctf.wire(),
        packs: this.gone.reduce((m, t, k) => (t ? m : m | (1 << k)), 0) >>> 0,
        balls: this.balls,
      });
      players.forEach(p => p.conn.send(snap));
      // Every snapshot reaches every peer (WebSocket, BroadcastChannel): a burst is sent once.
      this.balls = this.balls.filter(b => !b.burst && b.left > 0);
    }
  }

  /**
   * Drives tick() with a timer. An accumulator on performance.now() keeps the
   * simulation at TICK_HZ whatever the timer jitter; after a stall at most
   * MAX_CATCH_UP ticks are replayed and the rest of the backlog is dropped.
   * `every` replaces setInterval, e.g. with a Worker-backed timer that
   * background tabs do not throttle.
   */
  public start(every: Every = setEvery): void {
    if (this.halt) {
      return;
    }
    const dt = 1000 / TICK_HZ;
    let last = performance.now();
    let acc = 0;
    this.halt = every(() => {
      const now = performance.now();
      acc += now - last;
      last = now;
      for (let n = 0; acc >= dt && n < MAX_CATCH_UP; n++) {
        this.tick();
        acc -= dt;
      }
      acc %= dt;
    }, dt);
  }

  public stop(): void {
    this.halt?.();
    this.halt = undefined;
  }

  /**
   * The players other than `id` as player `id` drew them at `view`, the view tick of
   * one of its inputs (a u16 tick, fractional, read against the current tick and clamped to the
   * kept history): x, y, z interpolated between the two snapshots around it like the client does.
   * One the history does not hold stands where it is.
   */
  public rewind(id: number, view = 0): PlayerState[] {
    const now = this.players()
      .filter(p => p.info.id !== id)
      .map(p => p.state);
    const [first, last] = [this.history[0], this.history.at(-1)];
    if (!first || !last) {
      return now;
    }
    // Ticks back, on the u16 circle: in [-0x8000, 0x8000).
    const back = ((((this.ticks - view + 0x8000) % 0x10000) + 0x10000) % 0x10000) - 0x8000;
    const t = Math.min(Math.max(this.ticks - back, first.tick), last.tick);
    let k = 0;
    while (k + 1 < this.history.length && this.history[k + 1].tick <= t) {
      k++;
    }
    const [a, b] = [this.history[k], this.history[k + 1] ?? this.history[k]];
    const u = b.tick > a.tick ? (t - a.tick) / (b.tick - a.tick) : 0;
    const l = (m: number, n: number): number => m + (n - m) * u;
    return now.map(p => {
      const pa = a.players.find(q => q.id === p.id);
      const pb = b.players.find(q => q.id === p.id);
      return pa && pb
        ? { ...pb, x: l(pa.x, pb.x), y: l(pa.y, pb.y), z: l(pa.z, pb.z) }
        : (pb ?? pa ?? p);
    });
  }

  /**
   * After a move of `p` at the view tick `view`: a dash or a slide that overlaps an enemy carrier
   * tackles him. The carrier is where `p` drew him (lag compensation), so a tackle that hit on
   * the tackler's screen counts; the carrier drops the flag and stumbles, thrown the way the
   * tackler goes. Once per TACKLE_COOLDOWN ticks, for the first carrier hit.
   */
  private tackle(p: Player, view: number | undefined): void {
    const me = p.state;
    if (me.down || !tackling(me) || this.ticks - p.tackled < TACKLE_COOLDOWN) {
      return;
    }
    const foes = this.players().filter(q => q.info.team !== p.info.team);
    const hit = this.rewind(p.info.id, view).find(
      seen =>
        reaches(me, seen) &&
        foes.some(q => q.info.id === seen.id && this.ctf.carrying(q.info.id) >= 0),
    );
    const foe = foes.find(q => q.info.id === hit?.id);
    if (!foe || !this.drop(foe.info.id)) {
      return;
    }
    // His way: the tackler's speed, or the way he faces when he has none.
    const v = speedOf(me);
    const [dx, dz] = v > 1e-3 ? [me.vx / v, me.vz / v] : forward(me.yaw);
    stumble(foe.state, dx, dz);
    foe.state.zap = false;
    foe.by = p.info.id;
    p.tackled = this.ticks;
  }

  /**
   * The enemies of `p` as `p` drew them at the view tick `view` (lag compensation), without one who
   * lies down now or did then.
   */
  private enemies(p: Player, view: number | undefined): PlayerState[] {
    const peers = this.players();
    return this.rewind(p.info.id, view).filter(seen => {
      const q = peers.find(r => r.info.id === seen.id);
      return q && q.info.team !== p.info.team && !q.state.down && !seen.down;
    });
  }

  /**
   * `hp` of damage to `foe`; the last one puts him down: he lies where he fell, without the gun or
   * the katana, a flag he carries drops with the lock, and `lost` is NONE (a cut sets it after).
   * True when he went down.
   */
  private harm(foe: Player, hp: number): boolean {
    if ((foe.state.hp -= hp) > 0) {
      return false;
    }
    Object.assign(foe.state, {
      hp: 0,
      down: DOWN_TICKS,
      ammo: -1,
      cool: 0,
      blade: false,
      wield: false,
      swing: 0,
      lost: LIMB.NONE,
    });
    this.ctf.drop(foe.state);
    return true;
  }

  /**
   * A shot of `p` went off at the view tick `view`: its ball starts where `p` saw it start, flown
   * on by his lag (the view tick to now, at most PLASMA_LAG ticks) against the others as they are
   * now. Past PLASMA_MAX balls in flight, the oldest bursts.
   */
  private shoot(p: Player, view = 0): void {
    const b = launch(p.state, p.info.team);
    // Ticks back, on the u16 circle; a view ahead of now is no lag.
    const lag = (this.ticks - view + 0x10000) % 0x10000;
    this.balls.push(b);
    this.fly(b, Math.min(lag < 0x8000 ? lag : 0, PLASMA_LAG) * PLASMA_STEP);
    const live = this.balls.filter(q => !q.burst);
    if (live.length > PLASMA_MAX) {
      live[0].burst = true;
    }
  }

  /** Flies the ball `b` on by `m` metres: one that bursts on an enemy who is up takes 1 hp from him, and counts a hit to its shooter. */
  private fly(b: Flying, m: number): void {
    const peers = this.players();
    const foes = peers.filter(q => q.info.team !== b.team && !q.state.down);
    const hit = fly(
      this.world,
      b,
      m,
      foes.map(f => f.state),
    );
    const foe = foes.find(q => q.state === hit);
    if (!foe) {
      return;
    }
    const by = peers.find(q => q.info.id === b.by);
    if (by) {
      by.state.hits = (by.state.hits + 1) & 255;
    }
    this.harm(foe, 1);
  }

  /**
   * A cut of `p` struck at the view tick `view`: every enemy it reaches as `p` drew him is hit
   * (`strike`), and the `hits` count goes up once. Each takes the cut's hp; one it does not put
   * down is shocked: a stumble of SHOCK_TICKS thrown SHOCK_KNOCK m/s the way the blade goes, with
   * `zap`, and `by` the attacker. A shock drops no flag. One it puts down loses the limb the blade
   * crosses where `p` drew him (`limbOf`).
   */
  private cut(p: Player, view: number | undefined): void {
    const seen = strike(this.world, p.state, this.enemies(p, view));
    const foes = this.players().filter(q => seen.some(s => s.id === q.info.id));
    if (!foes.length) {
      return;
    }
    p.state.hits = (p.state.hits + 1) & 255;
    const [dx, dz] = knock(p.state);
    for (const foe of foes) {
      if (this.harm(foe, CUTS[p.state.cut ?? 0].hp)) {
        const drawn = seen.find(s => s.id === foe.info.id)!;
        foe.state.lost = limbOf(p.state, drawn);
      } else {
        stumble(foe.state, dx, dz, SHOCK_TICKS, SHOCK_KNOCK);
        foe.state.zap = true;
        foe.by = p.info.id;
      }
    }
  }

  /**
   * The packs, health ones first, then the ammo ones: one that is gone comes back after PACK_BACK
   * s. A health pack goes to a hurt player standing at it, an ammo pack to one with the gun and
   * less than AMMO_MAX shots. Both change the state between two inputs, like a hit: the snapshot
   * carries the result and the predictor replays its unacked inputs on it.
   */
  private heal(players: Player[]): void {
    const { packs = [], ammo = [] } = this.world.def;
    [...packs, ...ammo].forEach((at, k) => {
      if (this.gone[k] > 0) {
        this.gone[k]--;
        return;
      }
      const health = k < packs.length;
      const p = players.find(
        ({ state: q }) =>
          !q.down &&
          (health ? q.hp < HP_MAX : q.ammo >= 0 && q.ammo < AMMO_MAX) &&
          within(q, at, PACK_R),
      );
      if (p) {
        const q = p.state;
        if (health) {
          q.hp = Math.min(HP_MAX, q.hp + PACK_HP);
        } else {
          q.ammo = Math.min(AMMO_MAX, q.ammo + AMMO_PACK);
        }
        this.gone[k] = PACK_BACK * TICK_HZ;
      }
    });
  }

  /** The first spawn point of the team with none of `others` within SPAWN_CLEAR, else the next one round-robin. */
  private place(id: number, team: number, others: PlayerState[]): PlayerState {
    const n = this.world.def.teams[team].spawns.findIndex((_, k) => {
      const { x, z } = spawn(id, this.world, k, team);
      return !others.some(o => Math.hypot(o.x - x, o.z - z) < SPAWN_CLEAR);
    });
    return spawn(id, this.world, n < 0 ? this.rr[team]++ : n, team);
  }

  /** The match is over: everyone gets the result and what each player did. */
  private end(players: Player[]): void {
    const tally = this.ctf.tally().flatMap(t => {
      const info = players.find(p => p.info.id === t.id)?.info;
      return info ? [{ ...t, name: info.name, team: info.team }] : [];
    });
    const msg = JSON.stringify({
      t: 'end',
      score: this.ctf.score,
      players: tally,
    } satisfies ServerText);
    players.forEach(p => p.conn.send(msg));
  }

  /** A new match: everyone back at a spawn of his team. */
  private restart(players: Player[]): void {
    const put: PlayerState[] = [];
    this.rr = [0, 0];
    this.gone.fill(0);
    for (const p of players) {
      const { shots, hits } = p.state;
      p.state = { ...this.place(p.info.id, p.info.team, put), shots, hits };
      put.push(p.state);
      this.ctf.place(p.info.id, p.state);
    }
  }

  private players(): Player[] {
    return [...this.peers.values()].filter(p => p !== null);
  }

  private join(conn: Conn, name: unknown): void {
    const players = this.players();
    if (players.length >= this.rules.maxPlayers) {
      conn.send(JSON.stringify({ t: 'full' } satisfies ServerText));
      return;
    }
    // Smallest free id.
    let id = 0;
    while (players.some(p => p.info.id === id)) {
      id++;
    }
    // The smaller team, red when they are equal.
    const reds = players.filter(p => p.info.team === 0).length;
    const team = reds > players.length - reds ? 1 : 0;
    const player: Player = {
      conn,
      info: {
        id,
        // Two present players never share a name.
        name: unique(
          cleanName(name) || `Player ${id}`,
          players.map(p => p.info.name),
        ),
        team,
        color: TEAM_COLOR[team],
      },
      state: this.place(
        id,
        team,
        players.map(p => p.state),
      ),
      bank: INPUT_BURST,
      ack: 0xffff,
      by: 0,
      tackled: -TACKLE_COOLDOWN,
    };
    this.peers.set(conn, player);
    this.ctf.join(id, team, player.state);
    this.roster();
  }

  /** Each joined peer gets the full roster with its own id. */
  private roster(): void {
    const players = this.players();
    const list = players.map(p => p.info).sort((a, b) => a.id - b.id);
    players.forEach(p =>
      p.conn.send(
        JSON.stringify({ t: 'roster', you: p.info.id, players: list } satisfies ServerText),
      ),
    );
  }
}
