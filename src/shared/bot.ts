// A bot: a player the host plays itself, one Input a tick, through the same step() as everyone.
// It picks a goal from the flags (take theirs, bring it home, chase the one who has ours, return a
// lying flag, guard the base), goes there along nav.ts's legs, and shoots the enemies it sees. It
// fights after UT2004's bots (docs/BOTS.md): a character drawn from its id and the room's skill,
// strafes, jumps and dashes aside in a fight, and a dash out of the way of a ball coming at it.
import { FALL_SAFE, PLASMA_SPEED, PLAYER_H, PLAYER_R, STEP_H, TICK_HZ } from './constants';
import { eyeHeight, floorAt, forward, gapTo, gravity, norm } from './physics';
import type { Body } from './physics';
import { navOf, path, ROUTES } from './nav';
import type { Edge, Nav, Vec3, Way } from './nav';
import type { Flying } from './plasma';
import { stepOf } from './plasma';
import type { Leg } from './routes';
import { EV, FLAG, KEY, MODE } from './types';
import type { FlagState, PlayerState } from './types';
import { hidden, ray } from './world';
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
  /** The balls in flight, to get out of their way. */
  balls?: readonly Flying[];
  /** The vehicles' bodies, which a body on foot walks into as into a wall (rover.ts's solid()). */
  bodies?: readonly Body[];
}

export type Intent = { keys: number; yaw: number; pitch: number };

/** How far a bot shoots, metres, and how far it sees an enemy to fight. */
const RANGE = 35;
/** Radians off the target a bot still shoots. */
const CONE = 0.06;
/** The skill of a room's bots when its rules give none: 0 (novice) to 7 (godlike), as in UT2004. */
export const SKILL = 4;

/**
 * A bot's character, after UT2004's (Accuracy, ReactionTime, Jumpiness, StrafingAbility): drawn
 * from its id, the same on every host, and scaled by the room's skill.
 */
export interface Persona {
  /** Radians its aim starts off a new target. */
  miss: number;
  /** Ticks a new target must be in sight before its first shot. */
  react: number;
  /** The most its aim turns in a tick. */
  turn: number;
  /** Its chance a tick, while it fights, of a jump; a dash aside is one in DASHY of them. */
  jumpy: number;
  /** The fewest ticks it strafes one way before it may turn back. */
  strafe: number;
  /** Its chance of dashing out of the way of a ball coming at it. */
  duck: number;
}

/** A number in [0, 1) that looks random, the same for the same n. */
const frac = (n: number): number => {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
};

/** The character of the bot `id` in a room of this skill. */
export const personaOf = (id: number, skill = SKILL): Persona => {
  const r = (k: number) => frac((id + 1) * 7.31 + k);
  const s = Math.max(0, Math.min(7, skill)) / 7;
  return {
    miss: (0.3 - 0.22 * s) * (0.75 + 0.5 * r(1)),
    react: Math.round((36 - 28 * s) * (0.75 + 0.5 * r(2))),
    turn: 0.05 + 0.09 * s,
    jumpy: 0.003 + 0.012 * r(3),
    strafe: Math.round(25 + 45 * r(4)),
    duck: 0.15 + 0.75 * s,
  };
};

/** One jump in DASHY that a fighting bot makes is a dash aside instead; metres it wants open for it. */
const DASHY = 2;
const ASIDE = 3;
/** Seconds ahead a bot looks for a ball coming at it, and how close it must pass, metres, to dash. */
const WARN = 0.5;
const CLOSE = 1.3;
/** Ticks without a metre of progress before a point close by counts as reached, and before a new way. */
const STUCK_JUMP = 45;
const STUCK_PLAN = 180;
/** Ticks an entry a bot could not get to is left out of its ways. */
const SHUN = 1200;
/**
 * Ticks a straight run to a goal is kept before a way is looked for again, and the metres the goal
 * may move before a new way: DRIFT, or that share of the way to it when it is farther.
 */
const REPLAN = 120;
const DRIFT = 4;
const SHARE = 0.25;
/** Metres over the floor under a player in the air past which he is over a gap, not jumping on a roof. */
const HOVER = 4;
/** Metres from the enemy carrier a bot dashes into him: the tackle. */
const TACKLE = 4;
/** Metres a bot without a gun goes out of its way to the rack. */
const ARM = 30;
/**
 * Metres ahead a walking bot looks for a wall or a drop, the seconds of its speed it looks for the
 * floor further on (it does not stop at once), and the share of the drop that hurts it will walk into.
 */
const AHEAD = 1.5;
const BRAKE = 0.3;
const SAFE = 0.8;
/** The turns off its way a walking bot tries round a wall or a drop, radians, nearest first: back a little, last. */
const DETOURS = [0, 0.5, -0.5, 1, -1, 1.5, -1.5, 2, -2];
/** The highest box a bot jumps onto on its way, metres (a standing jump lands on 1.7 m), and the floor it wants behind its edge. */
const HOP = 1.6;
const HOP_DEPTH = 2.5;
/** The most a walking bot turns in a tick (12 rad/s), and the turn past which it stops sprinting to strafe. */
const WALK_TURN = 0.2;
const SWING = 0.6;
/** Metres of open floor a bot wants ahead to dash, the least way left to bother, and ticks between two of its dashes. */
const DASH_RUN = 7;
/** Metres more a dash on a route's run wants before the run's end: its speed takes that to fall back. */
const LEG_ROOM = 6;
/** Metres of floor a dash wants each side of its run. */
const WIDE = 1.2;
const DASH_FAR = 8;
const DASH_GAP = 120;
/** Metres of floor a bot wants on the side it strafes to. */
const SIDE = 1.5;
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

/** A step of the pilot: its keys and yaw, whether it may look away to shoot, and whether its yaw is to the letter. */
interface Move {
  keys: number;
  yaw: number;
  free: boolean;
  exact: boolean;
}

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
  private world: World | undefined;
  private bodies: readonly Body[] = [];
  /** Where it looks walking, turned a little each tick; the side of its last detour; its last dash. */
  private look = 0;
  private side = 1;
  private dashed = -DASH_GAP;
  private readonly persona: Persona;
  /** Its own random numbers, seeded by its id: the same match plays the same on every host. */
  private seed: number;
  /** The way it strafes in a fight (1 left, -1 right) and the tick it may turn back. */
  private strafing = 1;
  private turnBack = 0;
  /** The nodes it could not get to as an entry, and the tick each may be one again. */
  private shun = new Map<number, number>();
  /** The balls it has weighed, by shooter and count: it decides once whether to get out of the way. */
  private weighed = new Set<number>();

  public constructor(id: number, skill = SKILL) {
    this.id = id;
    this.prefer = id % ROUTES.length;
    this.persona = personaOf(id, skill);
    this.seed = id * 2654435761 + 1;
  }

  /** A number in [0, 1) from its own sequence. */
  private rnd(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 2 ** 32;
  }

  /** The input of this tick. */
  public think(s: Sight): Intent {
    const t = ++this.ticks;
    const p = s.me.state;
    this.world = s.world;
    this.bodies = s.bodies ?? [];
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
    // Forward is kept till then, so a jump over a gap does not fall short of it.
    if (!this.goal && !p.ground) {
      return { keys: FORWARD, yaw: p.yaw, pitch: 0 };
    }
    if (
      p.ground &&
      (!this.goal ||
        flat(goal[0], goal[2], this.goal[0], this.goal[2]) >
          Math.max(DRIFT, SHARE * flat(p.x, p.z, goal[0], goal[2])) ||
        (!this.way.edges.length && t - this.planned > REPLAN))
    ) {
      this.plan(s.world, p, goal);
    }
    const move = this.pilot(p);
    const fight = this.fight(s, move.free);
    // The battery is flat: a fresh one, every other step so each is a press.
    const reload = p.ammo > 0 && !p.mag && !p.reload && t & 1 ? RELOAD : 0;
    if (!fight) {
      this.pitch = 0;
      // The carrier turns at once: a swing would cost him the sprint as he runs for it.
      const runs =
        s.flags[1 - s.me.team].state === FLAG.CARRIED && s.flags[1 - s.me.team].by === s.me.id;
      if (move.exact || runs) {
        this.look = this.aim = move.yaw;
        return this.evade(s, { keys: move.keys | reload, yaw: move.yaw, pitch: 0 }, move.exact);
      }
      // Walking, it turns as a player does: the look swings round, the feet go the way meanwhile.
      const off = turn(this.look, move.yaw);
      this.look = this.aim = norm(this.look + Math.max(-WALK_TURN, Math.min(WALK_TURN, off)));
      const keys =
        Math.abs(off) > SWING && move.keys & FORWARD
          ? (move.keys & ~(FORWARD | SPRINT | DASH)) | keysFor(this.look, move.yaw)
          : move.keys;
      return this.evade(s, { keys: keys | reload, yaw: this.look, pitch: 0 }, false);
    }
    this.look = this.aim;
    if (fight.keys & DASH) {
      return { keys: fight.keys, yaw: this.aim, pitch: 0 };
    }
    // Aiming elsewhere: the move keys turn with the look, and the sprint goes (it wants forward).
    const keys = move.keys & ~(FORWARD | BACK | LEFT | RIGHT | SPRINT);
    const dirs = move.keys & FORWARD ? keysFor(this.aim, move.yaw) : 0;
    const out = {
      keys: (dirs & ~(LEFT | RIGHT)) | this.dodge(s.world, p) | keys | fight.keys | reload,
      yaw: this.aim,
      pitch: this.pitch,
    };
    return this.evade(s, out, false);
  }

  /**
   * How it moves while it fights, as UT2004's bots do: it strafes, one way for a while then the
   * other, never toward a drop, and now and then jumps or dashes aside (its Jumpiness).
   */
  private dodge(w: World, p: PlayerState): number {
    if (this.ticks >= this.turnBack) {
      this.strafing = -this.strafing;
      this.turnBack =
        this.ticks + this.persona.strafe + Math.floor(this.rnd() * this.persona.strafe);
    }
    for (const k of [this.strafing, -this.strafing]) {
      const yaw = norm(this.aim + k * (Math.PI / 2));
      const [x, z] = forward(yaw);
      if (floorAt(w, p.x + x * SIDE, p.z + z * SIDE, p.y + STEP_H) <= p.y - STEP_H) {
        continue;
      }
      this.strafing = k;
      const side = k > 0 ? LEFT : RIGHT;
      if (!p.ground || this.rnd() >= this.persona.jumpy) {
        return side;
      }
      if (
        this.rnd() * DASHY < 1 &&
        !(p.held & DASH) &&
        this.ticks - this.dashed > DASH_GAP &&
        this.open(w, p, yaw, ASIDE) === 'open'
      ) {
        this.dashed = this.ticks;
        return side | DASH;
      }
      return p.held & JUMP ? side : side | JUMP;
    }
    return 0;
  }

  /**
   * Out of the way of a ball coming at it, as UT2004's bots dodge a rocket: an enemy ball that will
   * pass within CLOSE of its chest in the next WARN seconds is weighed once, and with the bot's
   * chance it dashes aside, across the ball's way and away from it, where the floor is open.
   * Not on a leg of a route, nor in the air.
   */
  private evade(s: Sight, out: Intent, exact: boolean): Intent {
    const p = s.me.state;
    if (exact || !p.ground || p.held & DASH || !s.balls?.length) {
      return out;
    }
    const chest = p.y + 1.1;
    for (const b of s.balls) {
      if (b.team === s.me.team || b.burst || b.v !== undefined) {
        continue;
      }
      const [ox, oy, oz] = [p.x - b.x, chest - b.y, p.z - b.z];
      const along = ox * b.dx + oy * b.dy + oz * b.dz;
      const [mx, my, mz] = [ox - b.dx * along, oy - b.dy * along, oz - b.dz * along];
      const soon = along > 0 && along / (stepOf(b) * TICK_HZ) < WARN;
      if (!soon || mx * mx + my * my + mz * mz > CLOSE * CLOSE) {
        continue;
      }
      const key = b.by * 256 + b.id;
      if (this.weighed.has(key)) {
        continue;
      }
      if (this.weighed.size > 64) {
        this.weighed.clear();
      }
      this.weighed.add(key);
      if (this.rnd() >= this.persona.duck) {
        continue;
      }
      // Across the ball's way, on the side the bot already stands off it; the other if that is shut.
      const first = mx * -b.dz + mz * b.dx >= 0 ? 1 : -1;
      for (const k of [first, -first]) {
        // The side (-dz, dx) of the ball's way, or its opposite, as a yaw.
        const yaw = norm(Math.atan2(k * b.dz, -k * b.dx));
        if (this.open(s.world, p, yaw, ASIDE) === 'open') {
          this.dashed = this.ticks;
          const keys = out.keys & ~(FORWARD | BACK | LEFT | RIGHT | SPRINT | JUMP);
          return { ...out, keys: keys | keysFor(out.yaw, yaw) | DASH };
        }
      }
    }
    return out;
  }

  /** Where it wants to be. */
  private goalOf(s: Sight): Vec3 {
    const { me, others, flags, world } = s;
    const p = me.state;
    const { team } = me;
    const home = world.def.teams[team];
    const [mine, theirs] = [flags[team], flags[1 - team]];
    // A player is chased where he stands, or will stand: on the floor under him when he is in the
    // air, unless that is the void of a gap he is jumping.
    const holder = (f: FlagState): Vec3 | undefined => {
      const h = others.find(o => o.id === f.by)?.state;
      const y = h && floorAt(world, h.x, h.z, h.y + STEP_H);
      return h && [h.x, y! > h.y - HOVER ? y! : h.y, h.z];
    };
    if (theirs.state === FLAG.CARRIED && theirs.by === me.id) {
      return home.base;
    }
    if (p.ammo < 0 && home.rack && flat(p.x, p.z, home.rack[0], home.rack[2]) < ARM) {
      return home.rack;
    }
    if (mine.state === FLAG.CARRIED) {
      const h = holder(mine);
      if (h) {
        return h;
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
        return h;
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
    for (const [i, until] of this.shun) {
      if (until < this.ticks) {
        this.shun.delete(i);
      }
    }
    this.way = path(this.nav, w, at(p), goal, this.prefer, new Set(this.shun.keys()));
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

  /**
   * The keys and yaw of the move, whether the bot may look away from it to shoot, and whether the
   * yaw must be kept to the letter (a leg of a route, as the tests fly it).
   */
  private pilot(p: PlayerState): Move {
    const e = this.leg >= 0 ? this.way.edges[this.leg] : undefined;
    if (e?.leg) {
      return this.fly(p, e.leg);
    }
    const [x, , z] = this.target();
    const d = flat(p.x, p.z, x, z);
    // A node where a jump lands may stand against a wall: blocked close to it is there.
    const near = d < 2 && this.ticks - this.better > STUCK_JUMP;
    if (d < (e || this.leg < 0 ? 0.5 : 1) || (near && this.leg < this.way.edges.length)) {
      if (this.leg < this.way.edges.length) {
        this.next();
        return this.pilot(p);
      }
      return { keys: 0, yaw: this.aim, free: true, exact: false };
    }
    this.unstick(d);
    return this.walk(p, toward(p.x, p.z, x, z), d);
  }

  /**
   * A straight walk toward `want`: round a wall or a drop that hurts by the nearest turn that is open
   * (on the side it last went round, first), up a box low enough to jump onto, and a dash when the
   * way ahead is long, straight and open. It steps down onto a lower roof.
   */
  private walk(p: PlayerState, want: number, d: number): Move {
    const w = this.world!;
    let yaw = want;
    let hop = false;
    let shut = true;
    for (const a of DETOURS) {
      const way = this.open(w, p, norm(want + a * this.side), AHEAD);
      if (way) {
        yaw = norm(want + a * this.side);
        hop = way === 'hop';
        shut = false;
        if (a) {
          this.side = Math.sign(a * this.side);
        }
        break;
      }
    }
    // Shut every way, it stands: a new way comes when that lasts.
    if (shut && p.ground) {
      return { keys: 0, yaw, free: true, exact: false };
    }
    let keys = FORWARD | SPRINT;
    if (p.ground && hop && !(p.held & JUMP)) {
      keys |= JUMP;
    }
    if (Math.abs(turn(this.look, yaw)) < 0.15 && !this.way.edges[this.leg + 1]?.leg) {
      keys |= this.dash(w, p, yaw, d);
    }
    return { keys, yaw, free: true, exact: false };
  }

  /** DASH when the way ahead is long, open and wide and the last dash is a while back, else 0. */
  private dash(w: World, p: PlayerState, yaw: number, d: number): number {
    if (
      p.ground &&
      d > DASH_FAR &&
      !(p.held & DASH) &&
      this.ticks - this.dashed > DASH_GAP + (this.id % 4) * 15 &&
      this.open(w, p, yaw, DASH_RUN) === 'open' &&
      this.wide(w, p, yaw)
    ) {
      this.dashed = this.ticks;
      return DASH;
    }
    return 0;
  }

  /** Whether the floor of a dash's run is wide: a metre each side of it, all along, no edge or beam. */
  private wide(w: World, p: PlayerState, yaw: number): boolean {
    const [fx, fz] = forward(yaw);
    for (let t = 1; t <= DASH_RUN; t++) {
      for (const s of [-WIDE, WIDE]) {
        if (floorAt(w, p.x + fx * t - fz * s, p.z + fz * t + fx * s, p.y + STEP_H) < p.y - STEP_H) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Whether a body may walk `ahead` metres along `yaw` from where it stands: 'open', 'hop' over a box
   * it can jump onto, or false at a wall, the void or a drop that hurts.
   */
  private open(w: World, p: PlayerState, yaw: number, ahead: number): 'open' | 'hop' | false {
    const [fx, fz] = forward(yaw);
    const hurts = (SAFE * FALL_SAFE ** 2) / (2 * gravity(w));
    const far = Math.max(ahead, AHEAD + BRAKE * Math.sqrt(p.vx ** 2 + p.vz ** 2));
    for (let t = 0.5; t <= far; t += 0.5) {
      if (floorAt(w, p.x + fx * t, p.z + fz * t, p.y + HOP) < p.y - hurts) {
        return false;
      }
    }
    const reach = Math.min(ahead, AHEAD);
    if (ray(w, [p.x, p.y + 1.9, p.z], [fx, 0, fz], reach) < reach) {
      return false;
    }
    // A parked rover or ship is a wall too: its hull and wings, between the knees and the head.
    for (let t = 0.5; t <= ahead; t += 0.5) {
      for (const o of this.bodies) {
        const [dx, dz, y] = gapTo(o, p.x + fx * t, p.z + fz * t);
        if (
          dx * dx + dz * dz < (o.r + PLAYER_R) ** 2 &&
          y < p.y + PLAYER_H &&
          y + o.h > p.y + STEP_H
        ) {
          return false;
        }
      }
    }
    if (ray(w, [p.x, p.y + STEP_H + 0.1, p.z], [fx, 0, fz], ahead) >= ahead) {
      return 'open';
    }
    // A box to jump onto: low enough, with a floor behind it no lower than the bot stands, not a
    // trim or a beam over the void.
    if (ahead !== AHEAD) {
      return false;
    }
    for (let t = 1; t <= HOP_DEPTH; t += 0.5) {
      if (floorAt(w, p.x + fx * t, p.z + fz * t, p.y + HOP) < p.y - STEP_H) {
        return false;
      }
    }
    return 'hop';
  }

  private next(): void {
    this.leg++;
    this.flight = undefined;
    this.best = Infinity;
    this.better = this.ticks;
  }

  /** Counts the progress toward the point it goes to: a new way when there has been none for a while. */
  private unstick(d: number): void {
    if (d < this.best - 1) {
      [this.best, this.better] = [d, this.ticks];
    }
    if (this.ticks - this.better > STUCK_PLAN) {
      this.goal = undefined;
      // The next way round goes the other side, and an entry it could not get to is none for a while.
      this.side = -this.side;
      const entry = this.leg < 0 && this.way.entry ? this.nav!.nodes.indexOf(this.way.entry) : -1;
      if (entry >= 0) {
        this.shun.set(entry, this.ticks + SHUN);
      }
    }
  }

  /** One step of a leg of a route, the way test/routes.ts flies it. */
  private fly(p: PlayerState, leg: Leg): Move {
    const f = (this.flight ??= { leg, k: -1, ran: false, ended: -1 });
    // A point blocked close by is reached too: a take-off can stand in a wall's lee.
    const go = (x: number, z: number, r: number, keys: number) => {
      const d = flat(p.x, p.z, x, z);
      if (d < r || (d < 2 && this.ticks - this.better > STUCK_JUMP)) {
        return undefined;
      }
      this.unstick(d);
      return { keys, yaw: toward(p.x, p.z, x, z), free: false, exact: true };
    };
    if (leg.k === 'go') {
      const run = go(
        leg.to[0],
        leg.to[1],
        leg.sprint ? 0.4 : 0.15,
        FORWARD | (leg.sprint ? SPRINT : 0),
      );
      // A route's runs are run to the letter: its lines keep to beams and ledges. A sprint dashes
      // where the roof is wide and no jump comes next, the carrier as his chasers do.
      if (run) {
        const next = this.way.edges[this.leg + 1]?.leg;
        const dash =
          leg.sprint && next?.k !== 'leap'
            ? this.dash(this.world!, p, run.yaw, flat(p.x, p.z, ...leg.to) - LEG_ROOM)
            : 0;
        return { ...run, keys: run.keys | dash, free: !this.leapNext() };
      }
      if (!p.ground) {
        return { keys: 0, yaw: p.yaw, free: false, exact: true };
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
      return p.ground ? this.landed(p, leg) : { keys: 0, yaw: p.yaw, free: false, exact: true };
    }
    const keys = FORWARD | (leg.sprint ? SPRINT : 0);
    const yaw = toward(p.x, p.z, leg.to[0], leg.to[1]);
    if (f.k < 0) {
      const run = go(leg.at[0], leg.at[1], leg.land ? 1 : 0.2, keys);
      if (run) {
        return run;
      }
      f.k = 0;
      return { keys: keys | JUMP, yaw, free: false, exact: true };
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
    if (leg.land) {
      // Will the flight carry it past the point, or short of it, by the time it is down at its height?
      const [tx, tz] = leg.to;
      const d = flat(p.x, p.z, tx, tz);
      const v = (p.vx * (tx - p.x) + p.vz * (tz - p.z)) / (d || 1);
      const g = gravity(this.world!);
      const t = Math.max(
        (p.vy + Math.sqrt(Math.max(p.vy ** 2 + 2 * g * (p.y - leg.y), 0))) / g,
        0.05,
      );
      return {
        keys: v * t < d - 0.3 ? FORWARD : v * t > d + 0.3 ? BACK : 0,
        yaw,
        free: false,
        exact: true,
      };
    }
    const n = leg.run ? (f.ended < 0 ? -1 : f.k - f.ended) : f.k;
    return {
      keys: (n === leg.dash ? keys | DASH : keys) | (n === leg.double ? JUMP : 0),
      yaw,
      free: false,
      exact: true,
    };
  }

  /** Whether the edge after this one is a jump that wants the run-up of this one. */
  private leapNext(): boolean {
    const l = this.way.edges[this.leg + 1]?.leg;
    return l?.k === 'leap' && l.sprint;
  }

  /** A leg is over: on to the next on its roof, else a new way from where the bot came down. */
  private landed(p: PlayerState, leg: Leg): Move {
    if (Math.abs(p.y - leg.y) > 0.3) {
      this.goal = undefined;
      return { keys: 0, yaw: p.yaw, free: false, exact: true };
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
    // On a leg the keys are the leg's: a jump's run-up wants its sprint, even past the carrier. And
    // the carrier runs: a fight would cost him the sprint.
    const carrying = flags[1 - me.team].state === FLAG.CARRIED && flags[1 - me.team].by === me.id;
    if (!foe || !free || carrying) {
      this.foe = -1;
      return undefined;
    }
    const q = foe.state;
    if (foe.id !== this.foe) {
      // A new target: the aim starts off it, and the trigger waits for the reaction.
      this.foe = foe.id;
      this.since = this.ticks;
      const miss = this.persona.miss;
      this.aim = norm(p.yaw + (this.rnd() < 0.5 ? miss : -miss));
    }
    const d = flat(p.x, p.z, q.x, q.z);
    // Lead him by the ball's flight.
    const lead = d / PLASMA_SPEED;
    const [tx, ty, tz] = [q.x + q.vx * lead, q.y + 1.1 + q.vy * lead, q.z + q.vz * lead];
    const want = toward(p.x, p.z, tx, tz);
    const rate = this.persona.turn;
    this.aim = norm(this.aim + Math.max(-rate, Math.min(rate, turn(this.aim, want))));
    this.pitch = Math.atan2(ty - eye[1], Math.max(d, 0.1));
    const ready =
      this.ticks - this.since > this.persona.react && Math.abs(turn(this.aim, want)) < CONE;
    if (foe.id === carrier && d < TACKLE && p.ground && !(p.held & DASH)) {
      return { keys: FORWARD | DASH };
    }
    const armed = p.ammo > 0 && (p.mag ?? 0) > 0 && !p.wield;
    // The gun fires on letting go: a tap, held one step in two.
    const pull = (armed && d < RANGE) || (!armed && d < 1.4);
    return { keys: ready && pull && this.ticks & 1 ? FIRE : 0 };
  }
}
