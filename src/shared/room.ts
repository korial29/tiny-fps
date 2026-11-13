import {
  AMMO_BACK,
  AMMO_PACK,
  ARC_KNOCK,
  CUTS,
  DOWN_TICKS,
  FLOOR_TICKS,
  HEAVY,
  HP_MAX,
  INPUT_BURST,
  LOCK_BREAK,
  LOCK_HP,
  LOCK_TICKS,
  LOCK_WIN,
  MAX_NAME,
  MAX_REWIND,
  NADE_HP,
  NADE_R,
  PACK_BACK,
  PACK_HP,
  PACK_R,
  PLASMA_MAX,
  PLAYER_R,
  RAIL_CELL,
  RAIL_DRAIN,
  RAIL_TICKS,
  NADE,
  RIFLE_CLIP,
  RIFLE_HITS,
  RULES,
  SHOCK_KNOCK,
  SHOCK_TICKS,
  STUMBLE_KNOCK,
  STUMBLE_TICKS,
  SNAP_EVERY,
  TACKLE_COOLDOWN,
  TEAM_COLOR,
  TICK_HZ,
  VEHICLE,
  BOLT,
  PUNCHES,
  PUNCH_HITS,
  PUNCH_MEMORY,
  PUNCH_STUN,
} from './constants';
import { CHEST, crossing, knock, limbOf, strike, swingOf } from './blade';
import { Bot } from './bot';
import { Ctf } from './ctf';
import { kitOf } from './kit';
import { shut, swing } from './doors';
import { STRIKE, felled, step, within } from './gun';
import { MAPS, mapKey, mapOf } from './maps';
import { navOf } from './nav';
import { bruise, floorAt, forward, heightOf, respawn, spawn, speedOf, stumble } from './physics';
import { PLASMA_LAG, blast, cylinder, fly, launch, lob, stepOf, toss, wave } from './plasma';
import type { Flying } from './plasma';
import { FRAG, decodeInput, encodeSnapshot, onWire, parseText } from './protocol';
import type { ClientText, ServerText } from './protocol';
import { beam } from './rail';
import {
  board,
  bolts,
  drive,
  footprint,
  free,
  gap2,
  homeOf,
  leave,
  missile,
  park,
  reach,
  ride,
  ROVER,
  seat,
  skid,
  slashed,
  solid,
  struck,
  nearby,
} from './rover';
import type { Sight } from './rover';
import { SHIP } from './ship';
import { reaches, tackling } from './tackle';
import { BODY, CUT, EV, FALL, HAIRS_N, KEY, LIMB, MODE, NOBODY, TONES_N } from './types';
import type { Choice, Conn, Every, Input, PlayerInfo, PlayerState, Rover, Rules } from './types';
import { build, hidden, ray } from './world';
import type { World, WorldDef } from './world';

interface Player {
  conn: Conn;
  info: PlayerInfo;
  /** A bot's mind: the host plays this player itself (bot.ts). */
  bot?: Bot;
  /** A bot's last seq. */
  seq?: number;
  state: PlayerState;
  /** The order he joined in: the oldest player is the host. */
  since: number;
  /** Inputs the player may still apply: +1 per tick, at most INPUT_BURST. */
  bank: number;
  /** Seq of the last applied input. Starts at 65535, the seq before the client's first (0). */
  ack: number;
  /** The id of the player who tackled this one, while the stumble runs. */
  by: number;
  /** The host tick of the last tackle this player made. */
  tackled: number;
  /** The host tick a rover last ran him over. */
  run: number;
  /** Ticks drained by the rail gun's bolt since its first touch, while `slow` runs. */
  burn?: number;
  /** The laser rifle's hits on him toward the next hp: every RIFLE_HITS take one. */
  graze?: number;
  /** Half points of damage on him toward the next hp, a ninja's guns' (shot()); and who last railed him. */
  halves?: number;
  railer?: Player;
  /** The punches he took toward the next hp (every PUNCH_HITS take one), those toward a stun, and the host tick of the last. */
  bruise?: number;
  blows?: number;
  punched?: number;
  /** At a rover's wheel: his inputs left before its lasers fire again, and the count that names their bolts. */
  gun?: number;
  bolt?: number;
  /** At a ship's stick: his inputs left before a missile goes again, and the pod it leaves from. */
  pod?: number;
  side?: number;
}

/** Ticks run at most this many times per timer callback, so a stalled host does not spiral. */
const MAX_CATCH_UP = 20;
/** A new player does not spawn within this many metres of another one. */
const SPAWN_CLEAR = 2;
/** Ticks before a rover can run the same player over again. */
const SPLAT_COOLDOWN = TACKLE_COOLDOWN;
/**
 * What the host alone keeps of a vehicle's damage: the bolts on its hull toward the next hp, the
 * ticks the rail gun's bolt still drains it and those since its first touch, and whose it is.
 */
interface Wear {
  graze: number;
  sear: number;
  burn: number;
  by: number;
  team: number;
}
/** The names of the bots, in turn. */
const BOT_NAMES = ['Ada', 'Bix', 'Cog', 'Dot', 'Echo', 'Flux', 'Gear', 'Hex'];

/** The two seats of a rover, the driver's first. */
const SEATS = ['driver', 'rider'] as const;

/** An index in [0, n), or undefined. */
const index = (v: unknown, n: number): number | undefined =>
  Number.isInteger(v) && (v as number) >= 0 && (v as number) < n ? (v as number) : undefined;

/**
 * What a player picked, only what the game knows: the woman's body (the man's is no field, so an old
 * roster is unchanged), a skin, a haircut of that body and a class (ROLE: the map says which it offers).
 */
export const chosen = (m: Record<string, unknown>): Choice => {
  const body = m.body === BODY.FEMALE ? BODY.FEMALE : undefined;
  const [tone, hair, role] = [
    index(m.tone, TONES_N),
    index(m.hair, HAIRS_N[body ?? 0]),
    index(m.role, 3),
  ];
  return {
    ...(body !== undefined ? { body } : {}),
    ...(tone !== undefined ? { tone } : {}),
    ...(hair !== undefined ? { hair } : {}),
    ...(role !== undefined ? { role } : {}),
  };
};

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

const len = (x: number, z: number): number => Math.sqrt(x * x + z * z);

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
 * - The host is the player in the room the longest; when he leaves, the next oldest. Only his
 *   { t: 'map', map } counts: the map (a MAPS key) is played from the next match on, or from the
 *   next join once the room is empty. The roster tells everyone the host and the map picked.
 * - The map's rovers (rover.ts) are in every snapshot. A press of USE near one seats a player; a
 *   driven rover is stepped by its driver's inputs alone (ride()), a driverless one by the tick.
 *   A player on foot walks into the rovers as they stand when his input arrives (hull()); a rover
 *   stops on the others as they stand when it steps.
 *   seats() keeps the seats and the players' MODE.RIDE in step.
 * - A vehicle has VEHICLE.HP of health, the host's alone like a player's hp: every weapon takes
 *   some from the hull of one that is not of the shooter's team (teamOf()), and a shot the hull
 *   stops does not reach its crew. At 0 it blows up (wreck()): its crew goes down, a blast hurts
 *   who is near, and its wreck lies VEHICLE.WRECK ticks, moved by the tick alone, before the
 *   vehicle is parked afresh.
 */
/** A vehicle parked afresh, for the host's own count of its damage. */
const NEW: Wear = { graze: 0, sear: 0, burn: 0, by: NOBODY, team: -1 };
/** A player out of any saber lock. */
const FREE = { lock: 0, foe: 0, pushes: 0, pressed: false, away: 0 };
/** Where a rewound copy of a player stood and looked, to put over his live state. */
const pick = ({ x, y, z, yaw }: PlayerState) => ({ x, y, z, yaw });
/** Where a player stands. */
const spot = ({ x, y, z }: PlayerState) => ({ x, y, z });

export class Room {
  /** Every connected peer; null until it joins. */
  private peers = new Map<Conn, Player | null>();
  private ticks = 0;
  /** The players and the vehicles as each snapshot of the last MAX_REWIND ticks sent them. */
  private history: { tick: number; players: PlayerState[]; rovers: Rover[] }[] = [];
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
  /** The map's rovers, in the order of WorldDef.rovers, then its ships (ship.ts). */
  private rovers: Rover[] = [];
  /** Ticks toward each ship's next missile, by index in `rovers`. */
  private rearm: number[] = [];
  /** Each vehicle's damage short of a whole hp, by index in `rovers`. */
  private wear: Wear[] = [];

  /** The key of the map being played, which the roster tells the clients. */
  private mapName: string;
  /** The map the host picked for the next match, when it is another one. */
  private next: string | undefined;
  /** Joins so far: each player's `since`. */
  private joins = 0;
  /** Ids of bots let go this tick, not given again before the next: the person who takes a bot's place would be drawn where it stood. */
  private freed = new Set<number>();

  /** Missing rules fall back to RULES. The map is the rules' one, unless a definition is given. */
  public constructor(rules: Partial<Rules> = {}, def?: WorldDef) {
    this.rules = { ...RULES, ...rules };
    this.mapName = mapKey(this.rules.map);
    this.world = build(def ?? mapOf(this.mapName));
    this.ctf = new Ctf(this.world, this.rules);
    this.gone = this.spots();
    this.fresh();
    this.guide();
  }

  /** Every vehicle of the map parked afresh: whole, empty, on its spawn. */
  private fresh(): void {
    this.rovers = park(this.world);
    this.rearm = [];
    this.wear = this.rovers.map(() => ({ ...NEW }));
  }

  /** The health, ammo and cell packs of the map, all there (0 ticks before each is back). */
  private spots(): number[] {
    const { packs = [], ammo = [], cells = [] } = this.world.def;
    return [...packs, ...ammo, ...cells].map(() => 0);
  }

  /** The host: the player in the room the longest. */
  private host(): Player | undefined {
    return this.humans().reduce<Player | undefined>(
      (h, p) => (h && h.since < p.since ? h : p),
      undefined,
    );
  }

  /** The map the host picked, from now on: a new world and a new match, the players in it. */
  private load(): void {
    if (this.next === undefined) {
      return;
    }
    this.mapName = this.next;
    this.next = undefined;
    this.world = build(mapOf(this.mapName));
    this.ctf = new Ctf(this.world, this.rules);
    this.gone = this.spots();
    this.fresh();
    this.guide();
    this.history = [];
    this.balls = [];
    for (const p of this.players()) {
      this.ctf.join(p.info.id, p.info.team, p.state);
    }
    this.roster();
  }

  /** Number of joined players, the bots left out: a room of bots alone is empty. */
  public get size(): number {
    return this.humans().length;
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
        this.join(conn, msg.name, msg);
      } else if (p && msg?.t === 'map' && p === this.host() && Object.hasOwn(MAPS, msg.map)) {
        this.next = msg.map === this.mapName ? undefined : msg.map;
        this.roster();
      } else if (p && msg?.t === 'body') {
        // It changes at once, and the roster tells everyone; the class is the next step's.
        const { id, name, team, color } = p.info;
        const info = { id, name, team, color, ...chosen(msg) };
        if (JSON.stringify(info) !== JSON.stringify(p.info)) {
          p.info = info;
          this.roster();
        }
      }
      return;
    }
    const input = p && decodeInput(data);
    if (input) {
      this.apply(p, input);
    }
  }

  /** One input of a player, moved at once. An input beyond the bank is dropped, and not acked. */
  private apply(p: Player, input: Input): void {
    if (p.bank > 0) {
      p.bank--;
      const slow = p.state.slow ?? 0;
      const use = (input.keys & KEY.USE) !== 0 && (p.state.held & KEY.USE) === 0;
      const [r, s] = this.seatOf(p);
      if (r && !s) {
        // At the wheel: his input is the rover's clock, and nothing else moves it.
        const fell = ride(p.state, r, input, this.world, p.info.team, this.rovers, j =>
          this.crash(r, j),
        );
        this.ctf.moved(p.state);
        if (fell) {
          this.sink(r);
        } else {
          this.carry(r);
          if (r.ship) {
            this.launch(p, r, input);
          } else {
            this.splat(p, r, input.view);
          }
          this.lase(p, r, input);
        }
      } else {
        const lying = p.state.down > 0;
        const struck = step(
          p.state,
          input,
          this.world,
          p.info.team,
          !this.ctf.over,
          solid(this.rovers, p.state),
          kitOf(p.info.role, this.world.def),
        );
        this.ctf.moved(p.state);
        // A hard landing hurts, and counts as nobody's hit; one that puts him down drops his flag.
        const fall = p.state.ev & EV.LAND && !lying && !this.ctf.over ? bruise(p.state.fall) : 0;
        if (fall) {
          this.harm(p, fall);
        }
        this.tackle(p, input.view);
        // A rider's strike starts from the seat he was drawn in at his view tick, not where the
        // rover has got to since.
        const here = spot(p.state);
        const seen = r && struck ? this.past(input.view).find(q => q.id === p.info.id) : undefined;
        Object.assign(p.state, seen && spot(seen));
        if (struck === STRIKE.SHOT) {
          this.shoot(p, input.view);
        } else if (struck === STRIKE.CUT) {
          this.cut(p, input.view);
        } else if (struck === STRIKE.RAIL) {
          this.rail(p, input.view);
        } else if (struck === STRIKE.LASER) {
          this.shoot(p, input.view);
        } else if (struck === STRIKE.NADE) {
          this.shoot(p, input.view, lob(p.state, p.info.team));
        }
        Object.assign(p.state, here);
        if (use && r && p.state.mode === MODE.RIDE) {
          leave(p.state, r, 1, this.world);
        } else if (use) {
          this.enter(p);
        }
      }
      // The bolt drains him: 1 hp each RAIL_DRAIN ticks after its first touch.
      p.burn = slow ? (p.burn ?? 0) + 1 : 0;
      if (slow && !(p.burn % RAIL_DRAIN)) {
        this.fry(p);
      }
      this.duel(p);
      p.ack = input.seq;
      this.seats();
    }
  }

  /** A peer left: its player goes, the roster goes out again. */
  public disconnect(conn: Conn): void {
    const p = this.peers.get(conn);
    this.peers.delete(conn);
    if (p) {
      this.ctf.leave(p.info.id);
      this.fill();
      if (!this.size) {
        // Nobody is left to see an id taken again.
        this.freed.clear();
        this.ctf.reset();
        this.gone.fill(0);
        this.fresh();
        this.load();
      }
      this.seats();
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
    this.freed.clear();
    const players = this.players();
    if (!players.length) {
      this.balls = [];
      return;
    }
    const now = ++this.ticks;
    for (const p of players) {
      p.bank = Math.min(INPUT_BURST, p.bank + 1);
    }
    this.think(players);
    for (const b of this.balls) {
      if (!b.burst && b.left > 0) {
        this.fly(b, stepOf(b));
      }
    }
    this.heal(players);
    // The doors open to who is up, and to a rover that is driven.
    swing(
      this.world,
      players.filter(p => !p.state.down).map(p => [p.state.x, p.state.y, p.state.z]),
      this.rovers.filter(r => r.driver !== NOBODY).map(r => [r.x, r.y, r.z]),
    );
    // Someone lying down touches no flag, nor does a driver.
    const turn = this.ctf.tick(
      players
        .filter(p => !p.state.down && !this.rovers.some(r => r.driver === p.info.id))
        .map(p => ({ id: p.info.id, team: p.info.team, state: p.state })),
    );
    if (turn === 'end') {
      this.end(players);
    } else if (turn === 'start') {
      this.load();
      this.restart(players);
    }
    this.seats();
    this.rovers.forEach((r, k) => this.dock(r, k));
    for (const r of this.rovers) {
      // A driven rover waits for its driver's inputs.
      if (r.driver !== NOBODY) {
        this.carry(r);
        continue;
      }
      if (r.wreck) {
        skid(r);
      }
      if (drive(r, undefined, this.world, this.rovers, j => this.crash(r, j))) {
        this.sink(r);
      } else {
        this.carry(r);
      }
    }
    this.seats();
    if (now % SNAP_EVERY === 0) {
      this.history.push({
        tick: now,
        players: players.map(p => ({ ...p.state })),
        rovers: this.rovers.map(r => ({ ...r })),
      });
      while (this.history[0].tick < now - MAX_REWIND) {
        this.history.shift();
      }
      // One buffer for everyone: transports must not mutate it.
      const snap = encodeSnapshot({
        tick: now,
        players: players.map(p => ({ ...p.state, ack: p.ack, by: p.state.stun ? p.by : 0 })),
        ...this.ctf.wire(),
        packs: this.gone.reduce((m, t, k) => (t ? m : m + 2 ** k), 0),
        balls: this.balls,
        rovers: this.rovers,
        doors: this.world.doors?.map(d => d.open),
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
    return this.past(view).filter(p => p.id !== id);
  }

  /** Every player as the snapshots around the view tick `view` showed him: rewind(), the asker included. */
  private past(view = 0): PlayerState[] {
    const now = this.players().map(p => p.state);
    const at = this.around(view);
    if (!at) {
      return now;
    }
    const [a, b, l] = at;
    return now.map(p => {
      const pa = a.players.find(q => q.id === p.id);
      const pb = b.players.find(q => q.id === p.id);
      return pa && pb
        ? { ...pb, x: l(pa.x, pb.x), y: l(pa.y, pb.y), z: l(pa.z, pb.z) }
        : (pb ?? pa ?? p);
    });
  }

  /** The two kept snapshots around the view tick `view`, and the mix between them; nothing with no history. */
  private around(view: number) {
    const [first, last] = [this.history[0], this.history.at(-1)];
    if (!first || !last) {
      return undefined;
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
    return [a, b, (m: number, n: number): number => m + (n - m) * u] as const;
  }

  /**
   * The vehicles a shooter of `team` may hurt, each with its index, as he drew them at the view
   * tick `view` (the place interpolated like a player's, the angles the later snapshot's); as
   * they are now with no `view`. For the katana and the rail gun, which strike where he saw.
   */
  private hulls(team: number, view?: number): [seen: Rover, k: number][] {
    const at = view === undefined ? undefined : this.around(view);
    return this.targets(team).map(r => {
      const k = this.rovers.indexOf(r);
      const [ra, rb] = [at?.[0].rovers[k], at?.[1].rovers[k]];
      // One parked afresh since then is not where it was drawn.
      if (!at || !ra || !rb || ra.wreck || rb.wreck) {
        return [r, k];
      }
      const l = at[2];
      return [{ ...r, ...rb, x: l(ra.x, rb.x), y: l(ra.y, rb.y), z: l(ra.z, rb.z) }, k];
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
   * `hp` of a gun's damage to `foe` from `by`: as his class deals it (Kit.damage, a ninja's half), the
   * half points kept on `foe` toward the next, the hit going (dx, dz). True when he went down; `how`
   * is the FRAG then.
   */
  private shot(
    foe: Player,
    hp: number,
    by: Player | undefined,
    dx: number,
    dz: number,
    how: number = FRAG.GUN,
  ): boolean {
    const bank = (foe.halves ?? 0) + hp * 2 * (by ? kitOf(by.info.role, this.world.def).damage : 1);
    foe.halves = bank % 2;
    return bank >= 2 && this.harm(foe, Math.floor(bank / 2), by, how, felled(FALL.SHOT, dx, dz));
  }

  /**
   * `hp` of damage to `foe`; the last one puts him down: he lies where he fell, without the gun or
   * the katana, a flag he carries drops with the lock, and `lost` is NONE (a cut sets it after).
   * True when he went down: an enemy `by` scores a frag made `how` (FRAG), told to everyone. `fell`
   * is how he falls (felled()).
   */
  private harm(foe: Player, hp: number, by?: Player, how: number = FRAG.GUN, fell = 0): boolean {
    if ((foe.state.hp -= hp) > 0) {
      return false;
    }
    [foe.graze, foe.bruise, foe.blows, foe.halves] = [0, 0, 0, 0];
    // Out of his seat, in the air with the rover's speed (his own since the last seat()).
    if (foe.state.mode === MODE.RIDE) {
      this.unseat(foe);
    }
    Object.assign(foe.state, {
      hp: 0,
      down: DOWN_TICKS,
      ammo: -1,
      cool: 0,
      charge: 0,
      mag: 0,
      cap: 0,
      reload: 0,
      blade: false,
      wield: false,
      swing: 0,
      lost: LIMB.NONE,
      fell,
      rail: -1,
      railed: false,
      rifle: -1,
      clip: 0,
      rifled: false,
      nades: 0,
      lob: 0,
      zapping: false,
      slow: 0,
    });
    this.ctf.drop(foe.state);
    const n = by && by.info.team !== foe.info.team ? this.ctf.frag(by.info.id) : 0;
    if (by && n) {
      const msg = JSON.stringify({
        t: 'frag',
        by: by.info.id,
        who: foe.info.id,
        how,
        n,
        ...(this.ctf.frags === 1 && { first: true as const }),
      } satisfies ServerText);
      this.players().forEach(p => p.conn.send(msg));
    }
    return true;
  }

  /**
   * A shot of `p` went off at the view tick `view`: its ball (or the arc `b` of an ARC cut) starts
   * where `p` saw it start, flown on by his lag (the view tick to now, at most PLASMA_LAG ticks)
   * against the others as they are now. Past PLASMA_MAX balls in flight, the oldest bursts. A
   * grenade (lob()) is flown on the same way, a tick of its arc at a time.
   */
  private shoot(p: Player, view = 0, b = launch(p.state, p.info.team)): void {
    // Ticks back, on the u16 circle; a view ahead of now is no lag.
    const lag = (this.ticks - view + 0x10000) % 0x10000;
    this.balls.push(b);
    const ticks = Math.min(lag < 0x8000 ? lag : 0, PLASMA_LAG);
    if (b.power === NADE) {
      for (let k = 0; k < ticks && !b.burst; k++) {
        this.fly(b, 0);
      }
    } else {
      this.fly(b, ticks * stepOf(b));
    }
    const live = this.balls.filter(q => !q.burst);
    if (live.length > PLASMA_MAX) {
      live[0].burst = true;
    }
  }

  /**
   * Flies the ball `b` on by `m` metres: one that bursts on an enemy who is up takes its power in hp
   * from him, and counts a hit to its shooter. An arc takes its cut's hp; one it does not put down
   * is floored (FLOOR_TICKS, `zap`), thrown ARC_KNOCK m/s the way it flies, and drops the flag.
   * A grenade flies one tick of its arc whatever `m`, and its burst is a blast (boom()); one hit
   * for the shooter when it hurt an enemy or his vehicle. A ball an enemy vehicle's hull stops
   * (ram()) hurts the hull, not the crew behind it.
   */
  private fly(b: Flying, m: number): void {
    const peers = this.players();
    const foes = peers.filter(q => q.info.team !== b.team && !q.state.down);
    const by = peers.find(q => q.info.id === b.by);
    const o: [number, number, number] = [b.x, b.y, b.z];
    if (b.power === NADE) {
      toss(
        this.world,
        b,
        foes.map(f => f.state),
      );
      this.ram(b, o);
      if (b.burst && this.boom([b.x, b.y, b.z], b.by, b.team) && by) {
        by.state.hits = (by.state.hits + 1) & 255;
      }
      return;
    }
    const hit = fly(
      this.world,
      b,
      m,
      foes.map(f => f.state),
    );
    const hull = this.ram(b, o);
    if (hull) {
      if (by) {
        by.state.hits = (by.state.hits + 1) & 255;
      }
      if (b.power === 0 || b.power === BOLT) {
        // Bolts and rounds graze a hull: every VEHICLE.GRAZE on it (from anyone) take 1 hp.
        const w = this.wear[this.rovers.indexOf(hull)];
        w.graze = (w.graze + 1) % VEHICLE.GRAZE;
        if (!w.graze) {
          this.hurt(hull, 1, b.by, b.team);
        }
      } else {
        this.hurt(hull, b.arc ? CUTS[b.arc].hp : (b.power ?? 1), b.by, b.team);
      }
      return;
    }
    const foe = foes.find(q => q.state === hit);
    if (!foe) {
      return;
    }
    if (by) {
      by.state.hits = (by.state.hits + 1) & 255;
    }
    if (b.power === 0 || b.power === BOLT) {
      // The laser rifle's: every RIFLE_HITS on him (from anyone, until he goes down) take 1 hp.
      foe.graze = ((foe.graze ?? 0) + 1) % RIFLE_HITS;
      if (!foe.graze) {
        this.shot(foe, 1, by, b.dx, b.dz);
      }
    } else if (!b.arc) {
      this.shot(foe, b.power ?? 1, by, b.dx, b.dz);
    } else if (this.harm(foe, CUTS[b.arc].hp, by, FRAG.BLADE, felled(FALL.STRUCK, b.dx, b.dz))) {
      // The limb a blade would take along the arc's line, swung from a metre back on it.
      const from = by && { ...by.state, cut: b.arc, yaw: Math.atan2(-b.dx, -b.dz) };
      foe.state.lost = from
        ? limbOf(
            Object.assign(from, {
              x: b.x - b.dx,
              y: b.y - b.dy - CHEST * heightOf(from),
              z: b.z - b.dz,
              pitch: Math.asin(b.dy),
            }),
            foe.state,
          )
        : LIMB.NONE;
    } else {
      const n = Math.hypot(b.dx, b.dz) || 1;
      stumble(foe.state, b.dx / n, b.dz / n, FLOOR_TICKS, ARC_KNOCK);
      foe.state.zap = true;
      foe.by = b.by;
      this.ctf.drop(foe.state);
    }
  }

  /**
   * A cut of `p` struck at the view tick `view`: every enemy it reaches as `p` drew him is hit
   * (`strike`), and the `hits` count goes up once. Each takes the cut's hp; one it does not put
   * down is shocked: a stumble of SHOCK_TICKS thrown SHOCK_KNOCK m/s the way the blade throws him, with
   * `zap`, and `by` the attacker. A shock drops no flag. One it puts down loses the limb the blade
   * crosses where `p` drew him (`limbOf`). An enemy vehicle's hull the cut meets (slashed(), where
   * `p` drew it) takes the cut's hp, and its crew none of it.
   */
  private cut(p: Player, view: number | undefined): void {
    if (!p.state.blade) {
      this.punch(p, view);
      return;
    }
    if (p.state.cut === CUT.ARC_L || p.state.cut === CUT.ARC_R) {
      this.shoot(p, view, wave(p.state, p.info.team));
      return;
    }
    // The hulls it meets take the cut; their crews are behind them.
    const cars = this.hulls(p.info.team, view).filter(([r]) =>
      slashed(this.world, r, p.state, swingOf(p.state)),
    );
    const crew = cars.flatMap(([, k]) => SEATS.map(s => this.rovers[k][s]));
    const seen = strike(this.world, p.state, this.enemies(p, view)).filter(
      s => !crew.includes(s.id),
    );
    let foes = this.players().filter(q => seen.some(s => s.id === q.info.id));
    // A foe whose own cut meets this one locks blades with him instead (crossing()).
    const locked = foes.find(q =>
      crossing(p.state, { ...q.state, ...pick(seen.find(s => s.id === q.info.id)!) }),
    );
    if (locked) {
      for (const [a, b] of [
        [p, locked],
        [locked, p],
      ]) {
        Object.assign(a.state, { ...FREE, lock: LOCK_TICKS, foe: b.info.id, pressed: true });
        Object.assign(a.state, { swing: 0, charge: 0, stun: 0, zap: false, vx: 0, vz: 0 });
      }
      foes = foes.filter(q => q !== locked);
    }
    if (!foes.length && !cars.length) {
      return;
    }
    p.state.hits = (p.state.hits + 1) & 255;
    for (const [, k] of cars) {
      this.hurt(this.rovers[k], swingOf(p.state).hp, p.info.id, p.info.team);
    }
    for (const foe of foes) {
      const drawn = seen.find(s => s.id === foe.info.id)!;
      if (
        this.harm(foe, swingOf(p.state).hp, p, FRAG.BLADE, felled(FALL.STRUCK, ...knock(p.state)))
      ) {
        foe.state.lost = limbOf(p.state, drawn);
      } else {
        const [dx, dz] = knock(p.state);
        stumble(foe.state, dx, dz, SHOCK_TICKS, SHOCK_KNOCK * (p.state.heavy ? HEAVY : 1));
        foe.state.zap = true;
        foe.by = p.info.id;
      }
    }
  }

  /**
   * A punch of `p` struck at the view tick `view`: every enemy its blow (PUNCHES by `cut`) reaches
   * as `p` drew him (the strike test, with the blow's reach and arc) is hit; the `hits` count goes
   * up once. A jab or a cross takes half a point, 1 hp every PUNCH_HITS of them; a hook or a lunge a
   * whole one. The PUNCH_STUN-th blow he takes with no more than PUNCH_MEMORY ticks between two, or
   * a blow with a `knock`, stuns him as a tackle does: a stumble thrown the way `p` faces (`knock`
   * times as hard), the flag dropped, `by` the puncher.
   */
  private punch(p: Player, view: number | undefined): void {
    const blow = PUNCHES[p.state.cut ?? 0] ?? PUNCHES[0];
    const seen = strike(this.world, p.state, this.enemies(p, view), blow);
    const foes = this.players().filter(q => seen.some(s => s.id === q.info.id));
    if (!foes.length) {
      return;
    }
    p.state.hits = (p.state.hits + 1) & 255;
    for (const foe of foes) {
      const fresh = this.ticks - (foe.punched ?? -Infinity) <= PUNCH_MEMORY;
      foe.blows = (fresh ? (foe.blows ?? 0) : 0) + 1;
      foe.punched = this.ticks;
      if (!blow.hp) {
        foe.bruise = ((foe.bruise ?? 0) + 1) % PUNCH_HITS;
      }
      const fell = felled(FALL.STRUCK, ...forward(p.state.yaw));
      if ((blow.hp || !foe.bruise) && this.harm(foe, 1, p, FRAG.FIST, fell)) {
        continue;
      }
      if (blow.knock || foe.blows >= PUNCH_STUN) {
        foe.blows = 0;
        this.drop(foe.info.id);
        const [dx, dz] = forward(p.state.yaw);
        stumble(foe.state, dx, dz, STUMBLE_TICKS, STUMBLE_KNOCK * (blow.knock || 1));
        foe.state.zap = false;
        foe.by = p.info.id;
      }
    }
  }

  /**
   * The rail gun's bolt of `p` at the view tick `view`: the first enemy it enters as `p` drew him is
   * drained for RAIL_TICKS more (`slow`). A first touch, when he was not drained, takes 1 hp at once
   * and counts a hit. An enemy vehicle's hull is drained the same way, and shields who is behind it.
   */
  private rail(p: Player, view: number | undefined): void {
    const { o, d, t, hit } = beam(this.world, p.state, this.enemies(p, view));
    // An enemy hull before the body or the wall takes the bolt: seared RAIL_TICKS more (dock()).
    const [s, k] = this.hulls(p.info.team, view).reduce(
      (best, [r, n]) => {
        const u = struck(r, o, d, best[0]);
        return u < best[0] ? [u, n] : best;
      },
      [t, -1],
    );
    if (s < t) {
      const w = this.wear[k];
      const fresh = !w.sear;
      Object.assign(w, { sear: RAIL_TICKS, by: p.info.id, team: p.info.team });
      if (fresh) {
        p.state.hits = (p.state.hits + 1) & 255;
        w.burn = 0;
        this.hurt(this.rovers[k], 1, p.info.id, p.info.team);
      }
      return;
    }
    const foe = this.players().find(q => q.info.id === hit?.id);
    if (foe) {
      const fresh = !foe.state.slow;
      foe.state.slow = RAIL_TICKS;
      if (fresh) {
        p.state.hits = (p.state.hits + 1) & 255;
        [foe.burn, foe.railer] = [0, p];
        this.fry(foe);
      }
    }
  }

  /** 1 hp of the bolt's drain to `foe`, as his railer deals it; if it puts him down he is disintegrated (`fried`). */
  private fry(foe: Player): void {
    const r = foe.railer?.state ?? foe.state;
    foe.state.fried = this.shot(
      foe,
      1,
      foe.railer,
      foe.state.x - r.x,
      foe.state.z - r.z,
      FRAG.RAIL,
    );
  }

  /**
   * A saber lock of `p`, after his input: it ends when a side leads by LOCK_WIN presses (the other
   * takes LOCK_HP and the katana's shock, thrown along the winner's look), when one has stepped out
   * (LOCK_BREAK ticks of a side or back key: both are free), or when it has run its LOCK_TICKS (both
   * stumble apart). A lock whose other side is gone, down or no longer locked with him ends too.
   */
  private duel(p: Player): void {
    const q = p.state;
    if (!q.lock) {
      return;
    }
    const o = this.players().find(r => r.info.id === q.foe);
    if (!o || o.state.foe !== p.info.id || !o.state.lock || o.state.down || q.down) {
      Object.assign(q, FREE);
      return;
    }
    const lead = (q.pushes ?? 0) - (o.state.pushes ?? 0);
    const out = (q.away ?? 0) >= LOCK_BREAK || (o.state.away ?? 0) >= LOCK_BREAK;
    if (Math.abs(lead) < LOCK_WIN && !out && q.lock > 1) {
      return;
    }
    Object.assign(q, FREE);
    Object.assign(o.state, FREE);
    if (Math.abs(lead) >= LOCK_WIN) {
      const [w, l] = lead > 0 ? [p, o] : [o, p];
      w.state.hits = (w.state.hits + 1) & 255;
      if (!this.harm(l, LOCK_HP, w, FRAG.BLADE, felled(FALL.STRUCK, ...forward(w.state.yaw)))) {
        const [dx, dz] = forward(w.state.yaw);
        stumble(l.state, dx, dz, SHOCK_TICKS, SHOCK_KNOCK);
        l.state.zap = true;
        l.by = w.info.id;
      }
    } else if (!out) {
      // Run out: each thrown back from the other.
      const [dx, dz] = [o.state.x - q.x, o.state.z - q.z];
      const d = Math.hypot(dx, dz) || 1;
      stumble(q, -dx / d, -dz / d);
      stumble(o.state, dx / d, dz / d);
    }
  }

  /**
   * The packs, health ones first, then the ammo ones, then the rail cells: one that is gone comes
   * back after PACK_BACK s, an ammo pack after AMMO_BACK s. A health pack goes to a hurt player standing at it, an ammo pack to one
   * with the gun short of AMMO_MAX or the laser rifle short of RIFLE_MAX (RIFLE_CLIP more rounds), a rail cell to one with the rail gun and less than
   * RAIL_MAX of lightning. Both change the state between two inputs, like a hit: the snapshot
   * carries the result and the predictor replays its unacked inputs on it.
   */
  private heal(players: Player[]): void {
    const { packs = [], ammo = [], cells = [] } = this.world.def;
    [...packs, ...ammo, ...cells].forEach((at, k) => {
      if (this.gone[k] > 0) {
        this.gone[k]--;
        return;
      }
      // 0 health, 1 ammo, 2 a rail cell.
      const kind = +(k >= packs.length) + +(k >= packs.length + ammo.length);
      // Up to what his class carries (kit.ts).
      const wants = ({ state: q, info }: Player) => {
        const kit = kitOf(info.role, this.world.def);
        return [
          q.hp < HP_MAX,
          (q.ammo >= 0 && q.ammo < kit.ammo) || ((q.rifle ?? -1) >= 0 && q.rifle! < kit.rifle),
          (q.rail ?? -1) >= 0 && q.rail! < kit.rail,
        ][kind];
      };
      const p = players.find(o => !o.state.down && wants(o) && within(o.state, at, PACK_R));
      if (p) {
        const q = p.state;
        const kit = kitOf(p.info.role, this.world.def);
        if (kind == 0) {
          q.hp = Math.min(HP_MAX, q.hp + PACK_HP);
        } else if (kind == 1) {
          // It fills the gun and the laser rifle, whichever he has.
          q.ammo = q.ammo < 0 ? -1 : Math.min(kit.ammo, q.ammo + AMMO_PACK);
          q.rifle = (q.rifle ?? -1) < 0 ? -1 : Math.min(kit.rifle, q.rifle! + RIFLE_CLIP);
        } else {
          q.rail = Math.min(kit.rail, q.rail! + RAIL_CELL);
        }
        this.gone[k] = (kind == 1 ? AMMO_BACK : PACK_BACK) * TICK_HZ;
      }
    });
  }

  /** The rover `p` is seated in and his seat (0 the driver's), or nothing on foot. */
  private seatOf(p: Player): [Rover, 0 | 1] | [] {
    if (p.state.mode === MODE.RIDE) {
      for (const r of this.rovers) {
        const s = SEATS.findIndex(k => r[k] === p.info.id);
        if (s >= 0) {
          return [r, s as 0 | 1];
        }
      }
    }
    return [];
  }

  /** Takes `p` off his seat: in the air where he sat. */
  private unseat(p: Player): void {
    for (const r of this.rovers) {
      SEATS.forEach(k => (r[k] = r[k] === p.info.id ? NOBODY : r[k]));
    }
    Object.assign(p.state, { mode: MODE.AIR, t: 0, coyote: 0 });
  }

  /**
   * The one place seats are kept true: a seat is held by a player who is there and rides, and who
   * rides holds a seat. So a leaver's seat is free before his id is given again, and one put down,
   * respawned or stumbled out is off the rover.
   */
  /**
   * The first enemy vehicle on the way the ball `b` flew this tick, from `o` to where it is now: the
   * ball bursts on its hull, short of a body or a wall further on.
   */
  private ram(b: Flying, o: [number, number, number]): Rover | undefined {
    const d = [b.x - o[0], b.y - o[1], b.z - o[2]];
    const m = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);
    if (!m) {
      return undefined;
    }
    const u: [number, number, number] = [d[0] / m, d[1] / m, d[2] / m];
    let [t, hit] = [m, undefined as Rover | undefined];
    for (const r of this.targets(b.team)) {
      const s = struck(r, o, u, t);
      if (s < t) {
        [t, hit] = [s, r];
      }
    }
    if (hit) {
      b.left += m - t;
      [b.x, b.y, b.z] = [o[0] + u[0] * t, o[1] + u[1] * t, o[2] + u[2] * t];
      b.burst = true;
    }
    return hit;
  }

  private seats(): void {
    const players = this.players();
    for (const r of this.rovers) {
      for (const k of SEATS) {
        if (!players.some(p => p.info.id === r[k] && p.state.mode === MODE.RIDE)) {
          r[k] = NOBODY;
        }
      }
    }
    for (const p of players) {
      if (p.state.mode === MODE.RIDE && !this.seatOf(p).length) {
        this.unseat(p);
      }
    }
  }

  /**
   * A press of USE on foot: the nearest rover within ROVER.ENTER_R on the floor plane with a seat
   * for him, the wheel first; a flag carrier only rides. Not while down, stumbling or in a lock.
   */
  private enter(p: Player): void {
    const q = p.state;
    if (q.down || q.stun || q.lock || q.mode === MODE.RIDE) {
      return;
    }
    const carrier = this.ctf.carrying(p.info.id) >= 0;
    const r = this.rovers
      .filter(r => nearby(r, q) && free(r, carrier) >= 0)
      .sort((a, b) => gap2(a, q) - gap2(b, q))[0];
    if (r) {
      board(q, r, free(r, carrier) as 0 | 1);
    }
  }

  /**
   * The rider follows the rover on his seat. Over a floor, that is his last ground: where a flag he
   * carries lies if he is put down or falls with the rover.
   */
  private carry(r: Rover): void {
    const p = this.players().find(q => q.info.id === r.rider);
    if (p?.state.mode === MODE.RIDE) {
      seat(p.state, r, 1);
      const y = floorAt(this.world, r.x, r.z, r.y);
      if (y > this.world.def.floor) {
        this.ctf.place(p.info.id, { ...p.state, y });
      }
    }
  }

  /** The rover fell under the kill floor: who was aboard is back at a spawn, it is parked again. */
  private sink(r: Rover): void {
    for (const p of this.players()) {
      if (this.seatOf(p)[0] === r) {
        respawn(p.state, this.world, p.info.team);
        this.ctf.moved(p.state);
      }
    }
    this.renew(this.rovers.indexOf(r));
  }

  /** Vehicle `k` parked afresh on its spawn: whole, empty. */
  private renew(k: number): void {
    Object.assign(this.rovers[k], park(this.world)[k]);
    this.rearm[k] = 0;
    this.wear[k] = { ...NEW };
  }

  /**
   * After a step of the driver `p` at the view tick `view`: the rover's body (footprint()) over an
   * enemy on foot, as `p` drew him, runs him over. Closing on him at ROVER.SPLAT_KILL or more puts
   * him down; from ROVER.SPLAT_MIN it takes 1 hp and throws him the rover's way in a stumble. Once
   * per SPLAT_COOLDOWN ticks a victim; a hit counts for the driver. The rover is never changed.
   */
  /**
   * The rover's lasers: while its driver holds FIRE, a salvo of two bolts each ROVER.GUN_COOL of his
   * inputs, toward where he looks. Not once the match is over. The rover is not changed.
   */
  private lase(p: Player, r: Rover, i: Input): void {
    p.gun = Math.max(0, (p.gun ?? 0) - 1);
    if (!(i.keys & KEY.FIRE) || p.gun || this.ctf.over || p.state.mode !== MODE.RIDE) {
      return;
    }
    p.gun = r.ship ? SHIP.GUN_COOL : ROVER.GUN_COOL;
    p.bolt = ((p.bolt ?? 0) + 2) & 255;
    for (const b of bolts(r, p.info.id, p.info.team, i.yaw, i.pitch, p.bolt, this.sight(p, i))) {
      this.shoot(p, i.view, b);
    }
  }

  /**
   * A ship's missiles: while its pilot holds SPECIAL (G), one each SHIP.MISSILE_COOL of his inputs
   * while it has any, from the left pod then the right, toward where its lasers cross.
   */
  private launch(p: Player, r: Rover, i: Input): void {
    p.pod = Math.max(0, (p.pod ?? 0) - 1);
    if (!(i.keys & KEY.SPECIAL) || p.pod || !r.nades || this.ctf.over) {
      return;
    }
    if (p.state.mode !== MODE.RIDE) {
      return;
    }
    p.pod = SHIP.MISSILE_COOL;
    p.side = (p.side ?? 0) ^ 1;
    r.nades--;
    p.bolt = ((p.bolt ?? 0) + 1) & 255;
    this.shoot(
      p,
      i.view,
      missile(r, p.info.id, p.info.team, i.yaw, i.pitch, p.bolt, p.side, this.sight(p, i)),
    );
  }

  /**
   * What the look of the driver `p` meets for his guns' aim (aimOf()): a brush, an enemy vehicle's
   * hull where it is, or an enemy on foot who is up as `p` drew him at the input's view tick.
   */
  private sight(p: Player, i: Input): Sight {
    const foes = new Set(
      this.players()
        .filter(q => q.info.team !== p.info.team)
        .map(q => q.info.id),
    );
    const drawn = this.past(i.view).filter(q => foes.has(q.id) && !q.down && q.mode !== MODE.RIDE);
    const hulls = this.targets(p.info.team);
    return (o, d, m) =>
      Math.min(
        ray(this.world, o, d, m),
        ...hulls.map(v => struck(v, o, d, m)),
        ...drawn.map(q => cylinder(o, d, q, PLAYER_R, heightOf(q))),
      );
  }

  /**
   * A vehicle's clock outside its driver's inputs: a wreck is parked afresh after VEHICLE.WRECK
   * ticks; a hull the rail gun's bolt sears loses 1 hp each RAIL_DRAIN ticks after its first touch;
   * a ship short of missiles loads one each SHIP.RELOAD ticks.
   */
  private dock(r: Rover, k: number): void {
    if (r.wreck) {
      if (!--r.wreck) {
        this.renew(k);
      }
      return;
    }
    const w = this.wear[k];
    if (w.sear) {
      w.sear--;
      if (!(++w.burn % RAIL_DRAIN)) {
        this.hurt(r, 1, w.by, w.team);
      }
    }
    if (!r.ship || r.wreck) {
      return;
    }
    this.rearm[k] = (r.nades ?? 0) < SHIP.MISSILES ? (this.rearm[k] ?? 0) + 1 : 0;
    if (this.rearm[k] >= SHIP.RELOAD) {
      r.nades = (r.nades ?? 0) + 1;
      this.rearm[k] = 0;
    }
  }

  /** The team a vehicle is of: its driver's, else its rider's, else the one whose base it is parked at. */
  private teamOf(r: Rover): number {
    const who = this.players().find(p => p.info.id === (r.driver === NOBODY ? r.rider : r.driver));
    return who ? who.info.team : homeOf(this.world, this.rovers.indexOf(r));
  }

  /** The vehicles a shooter of `team` hurts: whole, and not of his team. */
  private targets(team: number): Rover[] {
    return this.rovers.filter(r => !r.wreck && this.teamOf(r) !== team);
  }

  /**
   * A vehicle that crashed with a jolt of `jolt` m/s: a ship into a brush, the ground or another
   * vehicle (pilot()), a rover into a wall or a vehicle (drive()). 1 hp each CRASH_HP past CRASH
   * (SHIP's, ROVER's), nobody's shot; at 0 it blows up as its team's, so its blast spares its mates.
   */
  private crash(r: Rover, jolt: number): void {
    const [from, per] = r.ship ? [SHIP.CRASH, SHIP.CRASH_HP] : [ROVER.CRASH, ROVER.CRASH_HP];
    this.hurt(r, Math.ceil((jolt - from) / per), NOBODY, this.teamOf(r));
  }

  /** The vehicle `r` loses `hp` to player `by` of `team`; at 0 it blows up (wreck()). */
  private hurt(r: Rover, hp: number, by: number, team: number): void {
    if (r.wreck) {
      return;
    }
    r.hp = Math.max(0, (r.hp ?? VEHICLE.HP) - hp);
    if (!r.hp) {
      this.wreck(r, by, team);
    }
  }

  /**
   * The vehicle blows up where it is, by the hand of player `by` of `team`: who is aboard goes
   * down on the spot, and it is a wreck for VEHICLE.WRECK ticks, with no seat, moved by the tick
   * alone. Its blast is a grenade of `by` at its centre (boom()).
   */
  private wreck(r: Rover, by: number, team: number): void {
    const crew = this.players().filter(q => this.seatOf(q)[0] === r);
    Object.assign(r, { hp: 0, wreck: VEHICLE.WRECK, driver: NOBODY, rider: NOBODY });
    if (r.ship) {
      r.nades = 0;
    }
    this.wear[this.rovers.indexOf(r)] = { ...NEW };
    const killer = this.players().find(q => q.info.id === by);
    for (const q of crew) {
      this.harm(q, q.state.hp, killer, FRAG.VEHICLE);
    }
    const hit = this.boom([r.x, r.y, r.z], by, team);
    if (killer && (hit || crew.length)) {
      killer.state.hits = (killer.state.hits + 1) & 255;
    }
  }

  /**
   * A blast at `c`, the grenade's rule, of player `by` of `team`: every enemy on foot who is up,
   * and `by` himself, lose what blast() gives where they stand now; every enemy vehicle loses
   * NADE_HP at its hull, less with the distance to it, nothing from NADE_R on or behind a brush.
   * Who is seated is behind his hull: the blast takes nothing from him. True when it hurt an enemy
   * or his vehicle.
   */
  private boom(c: [number, number, number], by: number, team: number): boolean {
    let hit = false;
    for (const r of this.targets(team)) {
      const d = reach(r, c);
      if (d < NADE_R && !hidden(this.world, c, [r.x, r.y, r.z])) {
        this.hurt(r, Math.ceil(NADE_HP * (1 - d / NADE_R)), by, team);
        hit = true;
      }
    }
    for (const q of this.players()) {
      const own = q.info.id === by;
      const hp =
        !q.state.down && q.state.mode !== MODE.RIDE && (own || q.info.team !== team)
          ? blast(this.world, c, q.state)
          : 0;
      if (hp) {
        this.shot(
          q,
          hp,
          this.players().find(o => o.info.id === by),
          q.state.x - c[0],
          q.state.z - c[2],
          FRAG.NADE,
        );
        hit ||= !own;
      }
    }
    return hit;
  }

  private splat(p: Player, r: Rover, view: number | undefined): void {
    if (len(r.vx, r.vz) < ROVER.SPLAT_MIN) {
      return;
    }
    const body = footprint(r);
    for (const seen of this.enemies(p, view)) {
      const foe = this.players().find(q => q.info.id === seen.id);
      if (!foe || foe.state.mode === MODE.RIDE || this.ticks - foe.run < SPLAT_COOLDOWN) {
        continue;
      }
      const hit = body.find(
        ([x, y, z]) =>
          len(seen.x - x, seen.z - z) < ROVER.RB + PLAYER_R &&
          seen.y < y + ROVER.BODY_H &&
          seen.y + heightOf(seen) > y,
      );
      if (!hit) {
        continue;
      }
      // The speed the rover closes on him at, along the line from its centre to him.
      const [dx, dz] = [seen.x - r.x, seen.z - r.z];
      const d = len(dx, dz) || 1;
      const closing = ((r.vx - seen.vx) * dx + (r.vz - seen.vz) * dz) / d;
      if (closing < ROVER.SPLAT_MIN) {
        continue;
      }
      foe.run = this.ticks;
      p.state.hits = (p.state.hits + 1) & 255;
      const fell = felled(FALL.SHOT, r.vx, r.vz);
      const hp = closing < ROVER.SPLAT_KILL ? 1 : foe.state.hp;
      if (!this.harm(foe, hp, p, FRAG.VEHICLE, fell)) {
        const v = len(r.vx, r.vz);
        stumble(foe.state, r.vx / v, r.vz / v);
        foe.state.zap = false;
        foe.by = p.info.id;
      }
    }
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
    this.fresh();
    shut(this.world);
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

  private humans(): Player[] {
    return this.players().filter(p => !p.bot);
  }

  /** Each bot's input of this tick, applied as a client's would be on arrival. */
  private think(players: Player[]): void {
    const others = players.map(q => ({ id: q.info.id, team: q.info.team, state: q.state }));
    // The vehicles as a bot up on its feet walks into them.
    const bodies = solid(this.rovers, { down: 0 });
    for (const p of players) {
      if (p.bot) {
        const me = others.find(o => o.id === p.info.id)!;
        const i = p.bot.think({
          me,
          others: others.filter(o => o !== me),
          flags: this.ctf.flags,
          world: this.world,
          balls: this.balls,
          bodies,
        });
        p.seq = ((p.seq ?? -1) + 1) & 0xffff;
        this.apply(p, onWire({ ...i, seq: p.seq, view: this.ticks & 0xffff }));
      }
    }
  }

  /** The bots' map of the world, built when it loads rather than in the tick of a bot's first plan. */
  private guide(): void {
    if (this.rules.bots) {
      navOf(this.world);
    }
  }

  /** The players the bots fill the room up to: none with no human. */
  private wanted(): number {
    return this.size ? Math.min(this.rules.bots ?? 0, this.rules.maxPlayers) : 0;
  }

  /**
   * Bots in and out so that there are `want` players, the humans first, the teams even: a bot comes
   * on the smaller team and leaves the larger one.
   */
  private fill(want = this.wanted()): void {
    for (;;) {
      const players = this.players();
      const reds = players.filter(p => p.info.team === 0).length;
      const bots = players.filter(p => p.bot);
      if (players.length > want && bots.length) {
        const big = reds > players.length - reds ? 0 : 1;
        const out = bots.reverse().find(p => p.info.team === big) ?? bots[0];
        this.peers.delete(out.conn);
        this.ctf.leave(out.info.id);
        this.freed.add(out.info.id);
      } else if (players.length < want) {
        // What the room sends a bot is of no use: it reads the room itself.
        const conn: Conn = { send: () => undefined };
        this.peers.set(conn, null);
        // The first name no bot here bears.
        const names = players.map(p => p.info.name);
        const name = BOT_NAMES.map(n => `${n} (bot)`).find(n => !names.includes(n)) ?? 'Bot';
        this.join(conn, name, {}, true);
      } else {
        return;
      }
    }
  }

  private join(conn: Conn, name: unknown, picked: Record<string, unknown> = {}, bot = false): void {
    // A human takes a bot's place: one goes first, from the larger team.
    if (!bot && this.players().some(p => p.bot)) {
      this.fill(Math.min(this.wanted(), this.players().length) - 1);
    }
    const players = this.players();
    if (players.length >= this.rules.maxPlayers) {
      conn.send(JSON.stringify({ t: 'full' } satisfies ServerText));
      return;
    }
    // Smallest free id.
    let id = 0;
    while (players.some(p => p.info.id === id) || this.freed.has(id)) {
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
        ...chosen(picked),
        ...(bot ? { bot } : {}),
      },
      state: this.place(
        id,
        team,
        players.map(p => p.state),
      ),
      since: this.joins++,
      bank: INPUT_BURST,
      ack: 0xffff,
      by: 0,
      tackled: -TACKLE_COOLDOWN,
      run: -SPLAT_COOLDOWN,
      ...(bot ? { bot: new Bot(id, this.rules.botSkill) } : {}),
    };
    this.peers.set(conn, player);
    this.ctf.join(id, team, player.state);
    // One roster for a person's join and the bots it moves; fill()'s callers send it.
    if (!bot) {
      this.fill();
      this.roster();
    }
  }

  /** Each joined peer gets the full roster with its own id. */
  private roster(): void {
    const list = this.players()
      .map(p => p.info)
      .sort((a, b) => a.id - b.id);
    this.humans().forEach(p =>
      p.conn.send(
        JSON.stringify({
          t: 'roster',
          you: p.info.id,
          players: list,
          map: this.mapName,
          host: this.host()?.info.id,
          next: this.next,
        } satisfies ServerText),
      ),
    );
  }
}
