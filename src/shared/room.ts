import {
  GOAL_R,
  HEAL,
  HEALTH,
  HIT_COOLDOWN,
  INPUT_BURST,
  MAX_NAME,
  MAX_REWIND,
  PICKUP_R,
  PLAYER_H,
  PLAYER_RESPAWN,
  RULES,
  SNAP_EVERY,
  TICK_HZ,
} from './constants';
import { bar, compile, sectorAt } from './level';
import { HALL } from './map';
import { move, spawn } from './physics';
import { decodeInput, encodeSnapshot, parseText } from './protocol';
import type { ClientText, ServerText } from './protocol';
import { body, fire } from './shoot';
import { ITEM, PHASE } from './types';
import type {
  Body,
  Conn,
  Every,
  Item,
  Level,
  MapDef,
  PlayerInfo,
  PlayerState,
  Rules,
  Shot,
} from './types';

interface Player {
  conn: Conn;
  info: PlayerInfo;
  state: PlayerState;
  /** Inputs the player may still apply: +1 per tick, at most INPUT_BURST. */
  bank: number;
  /** Seq of the last applied input. Starts at 65535, the seq before the client's first (0). */
  ack: number;
  /** Health: 0 is dead, until PLAYER_RESPAWN ticks after `hurt`. */
  hp: number;
  /** Host tick of the last hit that took health (the death, once hp is 0). */
  hurt: number;
}

/** Ticks run at most this many times per timer callback, so a stalled host does not spiral. */
const MAX_CATCH_UP = 20;
/** A pickup is this tall, standing on the floor: a body touches it when their heights overlap. */
const ITEM_H = 0.5;
/** A new player does not spawn within this many metres of another one. */
const SPAWN_CLEAR = 2;

const COLORS = [
  '#e6194b',
  '#3cb44b',
  '#ffe119',
  '#4363d8',
  '#f58231',
  '#911eb4',
  '#42d4f4',
  '#f032e6',
  '#bfef45',
  '#fabed4',
  '#469990',
  '#dcbeff',
  '#9a6324',
  '#800000',
  '#aaffc3',
  '#808000',
];

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

/** Whether the player's body is within r of (x, z) on the floor plane and meets a thing resting on y. */
const reach = (p: PlayerState, x: number, y: number, z: number, r: number): boolean =>
  Math.hypot(p.x - x, p.z - z) <= r && p.y < y + ITEM_H && y < p.y + PLAYER_H;

const setEvery: Every = (cb, ms) => {
  const id = setInterval(cb, ms);
  return () => clearInterval(id);
};

/**
 * One game, transport-agnostic. The Node server and the local host tab both drive a Room: they
 * feed it connections and frames, the room answers through Conn.send.
 *
 * - A peer joins with { t: 'join', name }: unique name (`Bob 2`), unique colour, a spawn point not
 *   taken by another player; 'full' beyond rules.maxPlayers. Everyone gets a fresh 'roster' on
 *   every join and leave.
 * - Each input frame moves its player at once with move(); the INPUT_BURST bank drops the excess.
 *   A step that fires resolves its shot at once with fire(), the other players rewound to the
 *   view tick of the input (lag compensation, at most MAX_REWIND ticks back).
 * - A player has HEALTH. A dead player moves, shoots and counts for nothing until PLAYER_RESPAWN
 *   ticks later, when it is back at a spawn.
 * - The level's items lie in it. A key taken opens its gates for the team, a pack heals below full
 *   health.
 * - Touching the goal turns the level from HUNT to RETURN (the exit opens).
 * - Every SNAP_EVERY ticks of TICK_HZ, one snapshot with every player, the shots resolved since
 *   the last one and the items goes to every peer.
 */
export class Room {
  /** Every connected peer; null until it joins. */
  private peers = new Map<Conn, Player | null>();
  private ticks = 0;
  /** The players as each snapshot of the last MAX_REWIND ticks sent them. */
  private history: { tick: number; players: PlayerState[] }[] = [];
  private lvl: Level;
  private phase: number = PHASE.HUNT;
  /** The team's key bits (1 << ITEM.KEY_*). */
  private keys = 0;
  private items: Item[] = [];
  private nextItem = 0;
  /** Shots resolved since the last snapshot. */
  private shots: Shot[] = [];
  private halt: (() => void) | undefined;
  private rules: Rules;
  /** Round-robin cursor over the spawn points, used once they are all taken. */
  private rr = 0;

  /** Missing rules fall back to RULES. */
  public constructor(rules: Partial<Rules> = {}, map: MapDef = HALL) {
    this.rules = { ...RULES, ...rules };
    this.lvl = compile(map);
    map.items?.forEach(([x, z, kind]) => this.drop(kind, x, z));
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
      // A dead player's inputs are acked and move nothing.
      if (p.hp && move(p.state, input, this.lvl)) {
        const shot = fire(this.lvl, p.state, input.seq, this.rewind(p, input.view));
        this.shots.push(shot);
      }
      p.ack = input.seq;
    }
  }

  /** A peer left: its player goes, the roster goes out again. */
  public disconnect(conn: Conn): void {
    const p = this.peers.get(conn);
    this.peers.delete(conn);
    if (p) {
      this.roster();
    }
  }

  /** One host tick. Public so tests can drive the room without a timer. */
  public tick(): void {
    const players = this.players();
    if (!players.length) {
      return;
    }
    const now = ++this.ticks;
    for (const p of players) {
      p.bank = Math.min(INPUT_BURST, p.bank + 1);
      if (!p.hp && now - p.hurt >= PLAYER_RESPAWN) {
        p.hp = HEALTH;
        p.state = this.place(
          p.info.id,
          players.filter(q => q.hp && q !== p).map(q => q.state),
        );
      }
    }
    this.progress(players.filter(p => p.hp));
    if (now % SNAP_EVERY === 0) {
      this.history.push({ tick: now, players: players.map(p => ({ ...p.state })) });
      while (this.history[0].tick < now - MAX_REWIND) {
        this.history.shift();
      }
      // One buffer for everyone: transports must not mutate it.
      const snap = encodeSnapshot({
        tick: now,
        players: players.map(p => ({ ...p.state, ack: p.ack, hp: p.hp })),
        shots: this.shots,
        phase: this.phase,
        keys: this.keys,
        items: this.items,
      });
      this.shots = [];
      players.forEach(p => p.conn.send(snap));
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
   * The bodies a shot of `shooter` can hit as the shooter drew them at `view` (a u16 tick,
   * fractional, read against the current tick and clamped to the kept history): the other players,
   * x, y, z interpolated between the two snapshots around it like the client does. One the
   * history does not hold stands where it is.
   */
  private rewind(shooter: Player, view = 0): Body[] {
    const now = this.players()
      .filter(p => p !== shooter && p.hp)
      .map(p => p.state);
    const [first, last] = [this.history[0], this.history.at(-1)];
    if (!first || !last) {
      return now.map(body);
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
      return body(
        pa && pb
          ? { ...pb, x: l(pa.x, pb.x), y: l(pa.y, pb.y), z: l(pa.z, pb.z) }
          : (pb ?? pa ?? p),
      );
    });
  }

  /** The first spawn point with none of `others` within SPAWN_CLEAR, else the next one round-robin. */
  private place(id: number, others: PlayerState[]): PlayerState {
    const n = this.lvl.map.spawns.findIndex((_, k) => {
      const { x, z } = spawn(id, this.lvl, k);
      return !others.some(o => Math.hypot(o.x - x, o.z - z) < SPAWN_CLEAR);
    });
    return spawn(id, this.lvl, n < 0 ? this.rr++ : n);
  }

  /** The floor of the sector holding (x, z). */
  private floor(x: number, z: number): number {
    return this.lvl.map.sectors[Math.max(sectorAt(this.lvl, x, z), 0)].floor;
  }

  /** Leaves an item of `kind` on the floor at (x, z). */
  private drop(kind: number, x: number, z: number): void {
    const f = Math.fround;
    this.items.push({ id: this.nextItem++, kind, x: f(x), y: f(this.floor(x, z)), z: f(z) });
  }

  /** What the living players do to the level: pick things up, touch the goal, win. */
  private progress(alive: Player[]): void {
    const { goal } = this.lvl.map;
    let bars = false;
    this.items = this.items.filter(t => {
      const who = alive.find(
        p => reach(p.state, t.x, t.y, t.z, PICKUP_R) && (t.kind !== ITEM.HEALTH || p.hp < HEALTH),
      );
      if (who && t.kind === ITEM.HEALTH) {
        who.hp = Math.min(HEALTH, who.hp + HEAL);
      } else if (who) {
        this.keys |= 1 << t.kind;
        bars = true;
      }
      return !who;
    });
    if (
      this.phase === PHASE.HUNT &&
      goal &&
      alive.some(p => reach(p.state, goal[0], this.floor(...goal), goal[1], GOAL_R))
    ) {
      this.phase = PHASE.RETURN;
      bars = true;
    }
    if (bars) {
      bar(this.lvl, this.keys, this.phase);
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
    // First colour nobody wears (all of them taken only when maxPlayers exceeds the palette).
    const color =
      COLORS.find(c => !players.some(p => p.info.color === c)) ?? COLORS[id % COLORS.length];
    const player: Player = {
      conn,
      info: {
        id,
        // Two present players never share a name.
        name: unique(
          cleanName(name) || `Player ${id}`,
          players.map(p => p.info.name),
        ),
        color,
      },
      state: this.place(
        id,
        players.filter(p => p.hp).map(p => p.state),
      ),
      bank: INPUT_BURST,
      ack: 0xffff,
      hp: HEALTH,
      hurt: -HIT_COOLDOWN,
    };
    this.peers.set(conn, player);
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
