// A bot: a player the host plays itself, one Input a tick, through the same step() as everyone.
// It picks a goal from the flags (take theirs, bring it home, chase the one who has ours, return a
// lying flag, guard the base), goes there along nav.ts's legs, and shoots the enemies it sees.
import { PLASMA_SPEED } from './constants';
import { eyeHeight, norm } from './physics';
import { navOf, path, ROUTES } from './nav';
import type { Edge, Nav, Vec3, Way } from './nav';
import type { Leg } from './routes';
import { EV, FLAG, KEY, MODE } from './types';
import type { FlagState, PlayerState } from './types';
import { hidden } from './world';
import type { World } from './world';

const { FORWARD, BACK, LEFT, RIGHT, JUMP, SPRINT, DASH, CROUCH, FIRE, RELOAD } = KEY;

/** A player as a bot sees him: the host's own state, no rewind. */
export interface Seen {
  id: number;
  team: number;
  state: PlayerState;
}

/** What a bot knows each tick. */
export interface Sight {
  me: Seen;
  others: Seen[];
  flags: readonly FlagState[];
  world: World;
}

export type Intent = { keys: number; yaw: number; pitch: number };

/** How far a bot shoots, metres, and how far it sees an enemy to fight. */
const RANGE = 35;
/** Ticks an enemy must be in sight before the first shot: the reaction time. */
const REACT = 15;
/** The most a bot turns its aim in a tick, radians (6 rad/s). */
const TURN = 0.1;
/** Radians off the target a bot still shoots, and the error its aim starts with on a new target. */
const CONE = 0.06;
const MISS = 0.12;
/** Ticks without a metre of progress before a jump, and before a new way. */
const STUCK_JUMP = 45;
const STUCK_PLAN = 180;
/** Ticks a straight run to a goal is kept before a way is looked for again, and metres the goal may move before a new way. */
const REPLAN = 120;
const DRIFT = 4;
/** Metres from the enemy carrier a bot dashes into him: the tackle. */
const TACKLE = 4;
/** Metres a bot without a gun goes out of its way to the rack. */
const ARM = 30;
/** The bots whose id is GUARD - 1 modulo GUARD stay home. */
const GUARD = 8;

const flat = (ax: number, az: number, bx: number, bz: number): number =>
  Math.sqrt((bx - ax) ** 2 + (bz - az) ** 2);
/** Yaw that faces from (x0, z0) toward (x1, z1): yaw 0 looks toward -z. */
const toward = (x0: number, z0: number, x1: number, z1: number): number =>
  norm(Math.atan2(-(x1 - x0), -(z1 - z0)));
/** The signed turn from a to b, in (-π, π]. */
const turn = (a: number, b: number): number => {
  const d = norm(b - a);
  return d > Math.PI ? d - 2 * Math.PI : d;
};
/** Where a player stands. */
const at = (p: PlayerState): Vec3 => [p.x, p.y, p.z];

/** The keys that move toward the yaw `dir` while looking along `yaw`: one of eight. */
const keysFor = (yaw: number, dir: number): number => {
  const k = Math.round(norm(dir - yaw) / (Math.PI / 4)) % 8;
  // Counter-clockwise from ahead: yaw grows to the left.
  return [FORWARD, FORWARD | LEFT, LEFT, BACK | LEFT, BACK, BACK | RIGHT, RIGHT, FORWARD | RIGHT][
    k
  ];
};

/** The run of one leg, as test/routes.ts flies it. */
interface Flight {
  leg: Leg;
  /** Steps since the take-off, -1 before it; whether a wall-run came, and the step it ended. */
  k: number;
  ran: boolean;
  ended: number;
  /** Where a slide's run-in ended. */
  x0?: number;
  z0?: number;
}

export class Bot {
  public readonly id: number;
  /** The route it prefers, an index of nav.ts's ROUTES. */
  private prefer: number;
  private nav: Nav | undefined;
  private way: Way = { edges: [] };
  /** The goal of the way, and the tick it was planned. */
  private goal: Vec3 | undefined;
  private planned = 0;
  /** -1 walking to the way's entry, then the edge it is on; edges.length walking to the goal. */
  private leg = 0;
  private flight: Flight | undefined;
  /** The best distance to the point it walks to, and the tick it was last bettered. */
  private best = Infinity;
  private better = 0;
  private ticks = 0;
  /** Where it aims, the enemy it aims at and since when. */
  private aim = 0;
  private pitch = 0;
  private foe = -1;
  private since = 0;
  private last: Vec3 = [0, 0, 0];

  public constructor(id: number) {
    this.id = id;
    this.prefer = id % ROUTES.length;
  }

  /** The input of this tick. */
  public think(s: Sight): Intent {
    const t = ++this.ticks;
    const p = s.me.state;
    if (p.down) {
      this.goal = undefined;
      this.foe = -1;
      return { keys: 0, yaw: this.aim, pitch: 0 };
    }
    // Put back at a spawn: whatever way it was on is gone.
    if (p.ev & EV.RESPAWN || flat(p.x, p.z, this.last[0], this.last[2]) > 5) {
      this.goal = undefined;
    }
    this.last = at(p);
    const goal = this.goalOf(s);
    // A way is planned from a floor: from the air it would start where the bot is not going to be.
    if (!this.goal && !p.ground) {
      return { keys: 0, yaw: this.aim, pitch: 0 };
    }
    if (
      p.ground &&
      (!this.goal ||
        flat(goal[0], goal[2], this.goal[0], this.goal[2]) > DRIFT ||
        (!this.way.edges.length && t - this.planned > REPLAN))
    ) {
      this.plan(s.world, p, goal);
    }
    const move = this.pilot(p);
    const fight = this.fight(s, move.free);
    // The battery is flat: a fresh one, every other step so each is a press.
    const reload = p.ammo > 0 && !p.mag && !p.reload && t & 1 ? RELOAD : 0;
    if (!fight) {
      this.aim = move.yaw;
      this.pitch = 0;
      return { keys: move.keys | reload, yaw: move.yaw, pitch: 0 };
    }
    if (fight.keys & DASH) {
      return { keys: fight.keys, yaw: this.aim, pitch: 0 };
    }
    // Aiming elsewhere: the move keys turn with the look, and the sprint goes (it wants forward).
    const keys = move.keys & ~(FORWARD | BACK | LEFT | RIGHT | SPRINT);
    const dirs = move.keys & FORWARD ? keysFor(this.aim, move.yaw) : 0;
    return { keys: keys | dirs | fight.keys | reload, yaw: this.aim, pitch: this.pitch };
  }

  /** Where it wants to be. */
  private goalOf(s: Sight): Vec3 {
    const { me, others, flags, world } = s;
    const p = me.state;
    const { team } = me;
    const home = world.def.teams[team];
    const [mine, theirs] = [flags[team], flags[1 - team]];
    const holder = (f: FlagState) => others.find(o => o.id === f.by)?.state;
    if (theirs.state === FLAG.CARRIED && theirs.by === me.id) {
      return home.base;
    }
    if (p.ammo < 0 && home.rack && flat(p.x, p.z, home.rack[0], home.rack[2]) < ARM) {
      return home.rack;
    }
    if (mine.state === FLAG.CARRIED) {
      const h = holder(mine);
      if (h) {
        return at(h);
      }
    }
    if (mine.state === FLAG.DROPPED) {
      return [mine.x, mine.y, mine.z];
    }
    if (this.id % GUARD === GUARD - 1) {
      return home.base;
    }
    if (theirs.state === FLAG.CARRIED) {
      const h = holder(theirs);
      if (h) {
        return at(h);
      }
    }
    if (theirs.state === FLAG.DROPPED) {
      return [theirs.x, theirs.y, theirs.z];
    }
    return world.def.teams[1 - team].base;
  }

  private plan(w: World, p: PlayerState, goal: Vec3): void {
    this.goal = goal;
    this.planned = this.ticks;
    this.nav = navOf(w);
    this.way = path(this.nav, w, at(p), goal, this.prefer);
    this.leg = this.way.entry ? -1 : 0;
    this.flight = undefined;
    this.best = Infinity;
    this.better = this.ticks;
  }

  /** The point it walks straight to now: the entry, a walk's end, or the goal past the last edge. */
  private target(): Vec3 {
    const { edges, entry } = this.way;
    if (this.leg < 0) {
      return entry!;
    }
    const e: Edge | undefined = edges[this.leg];
    return e ? this.nav!.nodes[e.to] : this.goal!;
  }

  /** The keys and yaw of the move, and whether the bot may look away from it to shoot. */
  private pilot(p: PlayerState): { keys: number; yaw: number; free: boolean } {
    const e = this.leg >= 0 ? this.way.edges[this.leg] : undefined;
    if (e?.leg) {
      return this.fly(p, e.leg);
    }
    const [x, , z] = this.target();
    const d = flat(p.x, p.z, x, z);
    if (d < (e || this.leg < 0 ? 0.5 : 1)) {
      if (this.leg < this.way.edges.length) {
        this.next();
        return this.pilot(p);
      }
      return { keys: 0, yaw: this.aim, free: true };
    }
    return { keys: this.unstick(p, d, FORWARD | SPRINT), yaw: toward(p.x, p.z, x, z), free: true };
  }

  private next(): void {
    this.leg++;
    this.flight = undefined;
    this.best = Infinity;
    this.better = this.ticks;
  }

  /** `keys`, with a jump when it has not got closer for a while; a new way when that does not help. */
  private unstick(p: PlayerState, d: number, keys: number): number {
    if (d < this.best - 1) {
      [this.best, this.better] = [d, this.ticks];
    }
    const idle = this.ticks - this.better;
    if (idle > STUCK_PLAN) {
      this.goal = undefined;
      return keys;
    }
    // Hanging from a ledge, forward climbs it; on a floor, a jump every half second while stuck.
    return idle > STUCK_JUMP && p.mode !== MODE.HANG && idle % 30 === 0 ? keys | JUMP : keys;
  }

  /** One step of a leg of a route, the way test/routes.ts flies it. */
  private fly(p: PlayerState, leg: Leg): { keys: number; yaw: number; free: boolean } {
    const f = (this.flight ??= { leg, k: -1, ran: false, ended: -1 });
    const go = (x: number, z: number, r: number, keys: number) => {
      const d = flat(p.x, p.z, x, z);
      return d < r
        ? undefined
        : { keys: this.unstick(p, d, keys), yaw: toward(p.x, p.z, x, z), free: false };
    };
    if (leg.k === 'go') {
      const run = go(
        leg.to[0],
        leg.to[1],
        leg.sprint ? 0.4 : 0.15,
        FORWARD | (leg.sprint ? SPRINT : 0),
      );
      if (run) {
        return { ...run, free: !this.leapNext() };
      }
      if (!p.ground) {
        return { keys: 0, yaw: p.yaw, free: false };
      }
      return this.landed(p, leg);
    }
    if (leg.k === 'slide') {
      if (f.x0 === undefined) {
        const run = go(leg.from[0], leg.from[1], 0.4, FORWARD | SPRINT);
        if (run) {
          return run;
        }
        [f.x0, f.z0] = [p.x, p.z];
      }
      const d = flat(p.x, p.z, f.x0, f.z0!);
      const run = go(
        leg.to[0],
        leg.to[1],
        0.4,
        FORWARD | SPRINT | (d >= leg.c[0] && d <= leg.c[1] ? CROUCH : 0),
      );
      if (run) {
        return run;
      }
      return p.ground ? this.landed(p, leg) : { keys: 0, yaw: p.yaw, free: false };
    }
    const keys = FORWARD | (leg.sprint ? SPRINT : 0);
    const yaw = toward(p.x, p.z, leg.to[0], leg.to[1]);
    if (f.k < 0) {
      const run = go(leg.at[0], leg.at[1], 0.2, keys);
      if (run) {
        return run;
      }
      f.k = 0;
      return { keys: keys | JUMP, yaw, free: false };
    }
    if (p.ground) {
      return this.landed(p, leg);
    }
    f.k++;
    if (p.mode === MODE.WALLRUN) {
      f.ran = true;
    } else if (f.ran && f.ended < 0) {
      f.ended = f.k;
    }
    const n = leg.run ? (f.ended < 0 ? -1 : f.k - f.ended) : f.k;
    return {
      keys: (n === leg.dash ? keys | DASH : keys) | (n === leg.double ? JUMP : 0),
      yaw,
      free: false,
    };
  }

  /** Whether the edge after this one is a jump that wants the run-up of this one. */
  private leapNext(): boolean {
    const l = this.way.edges[this.leg + 1]?.leg;
    return l?.k === 'leap' && l.sprint;
  }

  /** A leg is over: on to the next on its roof, else a new way from where the bot came down. */
  private landed(p: PlayerState, leg: Leg): { keys: number; yaw: number; free: boolean } {
    if (Math.abs(p.y - leg.y) > 0.3) {
      this.goal = undefined;
      return { keys: 0, yaw: p.yaw, free: false };
    }
    this.next();
    return this.pilot(p);
  }

  /** The look and the trigger at the enemy to fight now, if any. */
  private fight(s: Sight, free: boolean): { keys: number } | undefined {
    const { me, others, world, flags } = s;
    const p = me.state;
    if (!p.ground) {
      this.foe = -1;
      return undefined;
    }
    const eye: Vec3 = [p.x, p.y + eyeHeight(p), p.z];
    const carrier = flags[me.team].state === FLAG.CARRIED ? flags[me.team].by : -1;
    let foe: Seen | undefined;
    let best = Infinity;
    for (const o of others) {
      const q = o.state;
      if (o.team === me.team || q.down) {
        continue;
      }
      const d = flat(p.x, p.z, q.x, q.z);
      // The one who has our flag first, then the nearest.
      const score = o.id === carrier ? d - RANGE : d;
      if (d < RANGE && score < best && !hidden(world, eye, [q.x, q.y + 1.2, q.z])) {
        [foe, best] = [o, score];
      }
    }
    if (!foe || (!free && foe.id !== carrier)) {
      this.foe = -1;
      return undefined;
    }
    const q = foe.state;
    if (foe.id !== this.foe) {
      // A new target: the aim starts off it, and the trigger waits for the reaction.
      this.foe = foe.id;
      this.since = this.ticks;
      this.aim = norm(p.yaw + (this.id & 1 ? MISS : -MISS));
    }
    const d = flat(p.x, p.z, q.x, q.z);
    // Lead him by the ball's flight.
    const lead = d / PLASMA_SPEED;
    const [tx, ty, tz] = [q.x + q.vx * lead, q.y + 1.1 + q.vy * lead, q.z + q.vz * lead];
    const want = toward(p.x, p.z, tx, tz);
    this.aim = norm(this.aim + Math.max(-TURN, Math.min(TURN, turn(this.aim, want))));
    this.pitch = Math.atan2(ty - eye[1], Math.max(d, 0.1));
    const ready = this.ticks - this.since > REACT && Math.abs(turn(this.aim, want)) < CONE;
    if (foe.id === carrier && d < TACKLE && p.ground && !(p.held & DASH)) {
      return { keys: FORWARD | DASH };
    }
    const armed = p.ammo > 0 && (p.mag ?? 0) > 0 && !p.wield;
    // The gun fires on letting go: a tap, held one step in two.
    const pull = (armed && d < RANGE) || (!armed && d < 1.4);
    return { keys: ready && pull && this.ticks & 1 ? FIRE : 0 };
  }
}
