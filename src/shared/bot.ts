// A bot: a player the host plays itself, one Input a tick, through the same step() as everyone.
// It picks a goal from the flags (take theirs, bring it home, chase the one who has ours, return a
// lying flag, guard the base), goes there along nav.ts's legs, and shoots the enemies it sees. It
// fights after UT2004's bots (docs/BOTS.md): a character drawn from its id and the room's skill,
// strafes, jumps and dashes aside in a fight, and a dash out of the way of a ball coming at it.
import {
  CUTS,
  FALL_SAFE,
  JUMP_SPEED,
  PLASMA_SPEED,
  PLAYER_R,
  RIFLE_SPEED,
  STEP_H,
  TICK_HZ,
} from './constants';
import { eyeHeight, floorAt, forward, gravity, norm } from './physics';
import { locate, navOf, path, ROUTES } from './nav';
import type { Step, Vec3 } from './nav';
import type { Flying } from './plasma';
import { stepOf } from './plasma';
import { Sortie } from './sortie';
import type { Errand } from './sortie';
import type { Kit } from './kit';
import type { Leg } from './routes';
import { CUT, EV, FLAG, KEY, MODE } from './types';
import type { FlagState, PlayerState } from './types';
import { hidden, ray } from './world';
import type { World } from './world';

const { FORWARD, BACK, LEFT, RIGHT, JUMP, SPRINT, DASH, CROUCH, FIRE, RELOAD, BLADE, SPECIAL } =
  KEY;

/** A player as a bot sees him: the host's own state, no rewind. */
export interface Seen {
  id: number;
  team: number;
  state: PlayerState;
  /** A bot: one the team's roles are handed out to (squad()). */
  bot?: boolean;
}

/** What a bot knows each tick. */
export interface Sight {
  me: Seen;
  others: Seen[];
  flags: readonly FlagState[];
  world: World;
  /** The balls in flight, to get out of their way. */
  balls?: readonly Flying[];
  /** What the room asks of it at the orbital station (sortie.ts). */
  errand?: Errand;
  /** The numbers of its class (kit.ts): the marine's when absent. */
  kit?: Kit;
  /** Its team's roles this tick, worked out once by the room (squad()); else its own reckoning. */
  squad?: Squad;
  /** The health packs there now, not taken. */
  packs?: readonly Vec3[];
  /** The bots that shot to hit each enemy last tick, by the enemy's id (Bot.hunting): TOKENS of them hit, the others miss. */
  hunters?: ReadonlyMap<number, readonly number[]>;
}

export type Intent = { keys: number; yaw: number; pitch: number };

/** What a bot is up to, sent to a player who watches it (the room's 'bot' text). */
export interface BotView {
  id: number;
  /** Why it goes where it goes: 'take flag', 'chase carrier', 'gun rack'… */
  why: string;
  /** Its way: the entry, the nodes it goes through, then its goal; `next` is the point it goes to now. */
  path: Vec3[];
  next: number;
  /** What it does on the way: 'to entry', a leg's kind ('go', 'leap', 'slide'), 'walk', 'to goal', 'no way'. */
  doing: string;
  /** The enemy it fights, -1 for none. */
  foe: number;
  /** The KEY bits it last pressed. */
  keys: number;
}

/** How far a bot shoots, metres, and how far it sees an enemy to fight. */
const RANGE = 35;
/** Radians off the target a bot still shoots. */
const CONE = 0.06;
/** Half the angle a bot sees ahead of its look, radians, and metres all round it hears an enemy. */
const VIEW = 1.1;
const HEAR = 5;
/** Ticks a bot remembers an enemy it fought: met again within them, he gets no warning shot. */
const MEMORY = 180;
/** Bots that shoot to hit the same enemy at once; the others shoot past him. */
const TOKENS = 2;
/** Metres a second across a bot's view (its own speed with the target's) that double its aim's wander. */
const CROSS = 6;
/** Metres a shot that is meant to miss passes beside the body. */
const PAST = 1.6;
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
  /** Shots it fires past a new target before it shoots to hit. */
  warn: number;
  /** Radians its aim wanders about the target, about. */
  shake: number;
  /** The share of a target's flight time it leads him by. */
  lead: number;
  /** The share of a target's change of speed it catches up with a tick. */
  track: number;
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
    react: Math.round((40 - 24 * s) * (0.75 + 0.5 * r(2))),
    turn: 0.04 + 0.06 * s,
    jumpy: 0.003 + 0.012 * r(3),
    strafe: Math.round(25 + 45 * r(4)),
    duck: 0.1 + 0.6 * s,
    warn: Math.round(1 + 2 * (1 - s) + r(5)),
    shake: (0.15 - 0.1 * s) * (0.75 + 0.5 * r(6)),
    lead: 0.3 + 0.6 * s,
    track: 0.03 + 0.09 * s,
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
/** Metres off a bot that takes no gun goes for an enemy in sight, and the most he may be above or below. */
const HUNT = 15;
const HUNT_Y = 2;
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
/** Health a player is in trouble at or under, and metres off him an enemy makes it trouble. */
const LOW = 3;
const NEAR = 12;
/** Metres a bot goes out of its way to a health pack when it is in trouble, or to help a teammate. */
const MEND = 30;
const HELP = 40;

/** Metres round its flag a guard walks, the points of its round, and the ticks it stands at one. */
const ROUND = 5;
const POSTS = 8;
const PAUSE = 90;

/** Metres off its flag the ways in are watched from, and radians a guard's look sweeps either side. */
const ENTRY = 12;
const SWEEP = 0.35;

/**
 * A guard's round about `base`: up to POSTS points on the flag's own floor, each with the yaw it
 * watches from there. That is the way in nearest its side: where the ways from the enemy's base,
 * one by each route, come within ENTRY of the flag.
 */
const round = (w: World, base: Vec3, from: Vec3): { at: Vec3; look: number }[] => {
  const nav = navOf(w);
  const ins = [-1, ...ROUTES.keys()].map(r => {
    const pts = [from, ...path(nav, w, from, base, r).map(st => st.to)];
    return pts.reverse().find(q => flat(q[0], q[2], base[0], base[2]) > ENTRY) ?? from;
  });
  const out: { at: Vec3; look: number }[] = [];
  for (let k = 0; k < POSTS; k++) {
    const a = (k * 2 * Math.PI) / POSTS;
    const v: Vec3 = [base[0] + ROUND * Math.sin(a), base[1], base[2] + ROUND * Math.cos(a)];
    const [i, on] = locate(nav, w, v);
    if (i >= 0 && Math.abs(on[1] - base[1]) < 0.6 && flat(on[0], on[2], v[0], v[2]) < 0.5) {
      const away = toward(base[0], base[2], on[0], on[2]);
      const side = (q: Vec3) => Math.abs(turn(away, toward(base[0], base[2], q[0], q[2])));
      const q = ins.reduce((m, c) => (side(c) < side(m) ? c : m));
      out.push({ at: on, look: toward(on[0], on[2], q[0], q[2]) });
    }
  }
  return out;
};

/** What a bot of a team does, handed out by squad(). */
type Role = 'chase' | 'return' | 'escort' | 'help' | 'guard' | 'attack';
/** A team's roles by bot id, and the teammate the 'help' goes to. */
export type Squad = { roles: Map<number, Role>; trouble?: Seen };

/**
 * The roles of a team's bots this tick, the same in every bot's head (they see the same team):
 * the nearest to each job takes it, the most pressing jobs first. Half the team or more chase the
 * enemy who has the flag (all but an escort when ours has theirs too: no capture till ours is
 * home), one or two return a lying flag, two escort the carrier, one goes to a teammate an enemy
 * is on while he is low, one guards home in a squad of three or more, and the rest attack.
 */
export const squad = (
  team: number,
  players: readonly Seen[],
  flags: readonly FlagState[],
  world: World,
): Squad => {
  const [mine, theirs] = [flags[team], flags[1 - team]];
  const roles = new Map<number, Role>();
  const up = players.filter(o => !o.state.down);
  const by = (id: number) => up.find(o => o.id === id);
  const ours = theirs.state === FLAG.CARRIED ? by(theirs.by) : undefined;
  const enemy = mine.state === FLAG.CARRIED ? by(mine.by) : undefined;
  // A teammate low with an enemy on him: the lowest first. He is given no job.
  let trouble: Seen | undefined;
  for (const o of up) {
    if (
      o.team === team &&
      o.state.hp <= LOW &&
      (!trouble || o.state.hp < trouble.state.hp) &&
      up.some(f => f.team !== team && flat(f.state.x, f.state.z, o.state.x, o.state.z) < NEAR)
    ) {
      trouble = o;
    }
  }
  // Sorted by id, so a tie goes the same way in every head (the sort keeps the order).
  const free = up
    .filter(o => o.team === team && o.bot && o !== ours && o !== trouble)
    .sort((a, b) => a.id - b.id);
  const n = free.length;
  const take = (role: Role, count: number, x: number, z: number, far = Infinity) => {
    while (count-- > 0) {
      let nearest: Seen | undefined;
      let distance = far;
      for (const o of free) {
        if (!roles.has(o.id)) {
          const d = flat(o.state.x, o.state.z, x, z);
          if (d < distance) {
            nearest = o;
            distance = d;
          }
        }
      }
      if (!nearest) {
        break;
      }
      roles.set(nearest.id, role);
    }
  };
  if (enemy) {
    take('chase', ours ? Math.max(1, n - 1) : Math.ceil(n / 2), enemy.state.x, enemy.state.z);
  }
  if (mine.state === FLAG.DROPPED) {
    take('return', n >= 4 ? 2 : 1, mine.x, mine.z);
  }
  if (ours) {
    take('escort', 2, ours.state.x, ours.state.z);
  }
  if (trouble) {
    take('help', 1, trouble.state.x, trouble.state.z, HELP);
  }
  if (n >= 3 && !enemy) {
    const [x, , z] = world.def.teams[team].base;
    take('guard', 1, x, z);
  }
  free.forEach(o => roles.has(o.id) || roles.set(o.id, 'attack'));
  return { roles, trouble };
};

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
  /** Its way: the points it goes through, walking or on a leg; the last is its goal or as near as it gets. */
  private steps: Step[] = [];
  /** The goal of the way, and the tick it was planned. */
  private goal: Vec3 | undefined;
  private planned = 0;
  /** The step it is on; steps.length once there. */
  private step = 0;
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
  /** Its aim's wander off the target, yaw and pitch, and the target's speed as it has made it out. */
  private err = 0;
  private errUp = 0;
  private speed: Vec3 = [0, 0, 0];
  /** Its shot count when it met the target, the shots it fires past him first, and to which side. */
  private shot = 0;
  private warned = 0;
  private past = 1;
  /** A guard's flag and round, the point it goes to, the tick it leaves it, and where it looks there. */
  private base: Vec3 | undefined;
  private posts: { at: Vec3; look: number }[] = [];
  private post = 0;
  private stop = 0;
  private gaze: number | undefined;
  /** The tick it last fought each enemy, by id. */
  private met = new Map<number, number>();
  /** The enemy it shot to hit this tick, -1 for none: the room hands it to the others as `hunters`. */
  public hunting = -1;
  private last: Vec3 = [0, 0, 0];
  private world: World | undefined;
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
  /** Why it goes where it goes, and the keys it last pressed: for its view(). */
  private why = '';
  private keys = 0;
  /** The balls it has weighed, by shooter and count: it decides once whether to get out of the way. */
  private weighed = new Set<number>();
  /** Its errand to the orbital station, when it has one. */
  private sortie = new Sortie();
  /**
   * Whether it jumps unlike the marine the routes were flown with (the ninja, the xenomorph): it
   * steers every leap in the air to come down on its point, as the moon's (`land`).
   */
  private steer = false;

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
    const i = this.decide(s);
    if (s.kit?.katana && s.me.state.blade && !s.me.state.down) {
      i.keys |= BLADE;
    } else if (!s.me.state.down) {
      if ((s.me.state.rail ?? -1) > 0) {
        i.keys |= KEY.RAIL;
      } else if ((s.me.state.rifle ?? -1) > 0) {
        i.keys |= KEY.RIFLE;
      }
    }
    this.keys = i.keys;
    return i;
  }

  /**
   * What it is up to, for a player who watches it (the client's bot view): its goal and why, the
   * way there as points (its entry, the nodes of the edges, the goal), the index of the point it
   * goes to now, what it is doing on the way, the enemy it fights and the keys it last pressed.
   */
  public view(): BotView {
    const r = (v: Vec3): Vec3 => [v[0], v[1], v[2]].map(n => Math.round(n * 10) / 10) as Vec3;
    const s = this.steps[this.step];
    return {
      id: this.id,
      why: this.why,
      path: this.steps.map(st => r(st.to)),
      next: Math.max(0, Math.min(this.step, this.steps.length - 1)),
      doing: !this.goal
        ? 'no way'
        : !s
          ? 'there'
          : s.leg
            ? s.leg.k
            : this.step === this.steps.length - 1
              ? 'to goal'
              : 'walk',
      foe: this.foe,
      keys: this.keys,
    };
  }

  /** think()'s work. */
  private decide(s: Sight): Intent {
    const t = ++this.ticks;
    const p = s.me.state;
    this.hunting = -1;
    this.world = s.world;
    this.steer = !!s.kit && s.kit.jump !== JUMP_SPEED;
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
    if (s.errand) {
      const e = this.sortie.think(this.id, p, s.errand, t);
      // On guard at the post, it fights whoever comes in sight.
      const f = e && s.errand.go === 'guard' && !e.keys ? this.fight(s, true) : undefined;
      if (f) {
        return { keys: f.keys, yaw: this.aim, pitch: this.pitch };
      }
      if (e) {
        this.look = this.aim = e.yaw;
        return e;
      }
    } else {
      this.sortie.board = undefined;
    }
    this.gaze = undefined;
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
        (!this.steps.some(st => st.leg) && t - this.planned > REPLAN))
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
      this.why = 'flag home';
      return home.base;
    }
    if (this.sortie.board) {
      this.why = 'station';
      return this.sortie.board;
    }
    const gear = s.kit?.gear ?? true;
    // Claws reach no farther than an arm: it runs at the enemy it sees close by.
    const eye: Vec3 = [p.x, p.y + eyeHeight(p), p.z];
    const prey =
      gear && !s.kit?.katana
        ? undefined
        : others.find(
            o =>
              o.team !== team &&
              !o.state.down &&
              Math.abs(o.state.y - p.y) < HUNT_Y &&
              flat(p.x, p.z, o.state.x, o.state.z) < HUNT &&
              !hidden(world, eye, [o.state.x, o.state.y + 1.2, o.state.z]),
          );
    if (prey) {
      this.why = 'hunt';
      return at(prey.state);
    }
    const { roles, trouble } =
      s.squad ?? squad(team, [{ ...me, bot: true }, ...others], flags, world);
    const role = roles.get(me.id);
    // Low itself, a pack close by: mended first, but for the chase of our flag.
    if (p.hp <= LOW && role !== 'chase') {
      let pack: Vec3 | undefined;
      let nearest = MEND;
      for (const q of s.packs ?? []) {
        const d = flat(p.x, p.z, q[0], q[2]);
        if (d < nearest) {
          [pack, nearest] = [q, d];
        }
      }
      if (pack) {
        this.why = 'health';
        return pack;
      }
    }
    const h = role === 'chase' ? holder(mine) : role === 'escort' ? holder(theirs) : undefined;
    if (h) {
      this.why = role === 'chase' ? 'chase carrier' : 'escort';
      return h;
    }
    if (role === 'return') {
      this.why = 'return flag';
      return [mine.x, mine.y, mine.z];
    }
    if (role === 'help' && trouble) {
      this.why = 'help';
      return at(trouble.state);
    }
    if (
      p.ammo <= 0 &&
      (p.rail ?? 0) <= 0 &&
      (p.rifle ?? 0) <= 0 &&
      !p.rack &&
      gear &&
      !s.kit?.katana &&
      home.rack &&
      flat(p.x, p.z, home.rack[0], home.rack[2]) < ARM
    ) {
      this.why = 'gun rack';
      return home.rack;
    }
    // Detour for a weapon not yet carried, without abandoning urgent flag duties.
    if (gear && !s.kit?.katana && role === 'attack') {
      const choices: [Vec3 | undefined, boolean, string][] = [
        [home.rail, (p.rail ?? -1) < 0, 'rail rack'],
        [home.rifle, (p.rifle ?? -1) < 0, 'rifle rack'],
        [home.blade, !p.blade, 'katana rack'],
      ];
      let nearest = 14;
      let target: Vec3 | undefined;
      for (const [point, missing, why] of choices) {
        if (!point || !missing) {
          continue;
        }
        const d = flat(p.x, p.z, point[0], point[2]);
        if (d >= nearest) {
          continue;
        }
        const from = at(p);
        const steps = path(navOf(world), world, from, point);
        const end = steps.at(-1)?.to;
        let length = 0;
        let last = from;
        for (const { to } of steps) {
          length += Math.hypot(to[0] - last[0], to[1] - last[1], to[2] - last[2]);
          last = to;
        }
        if (
          length < nearest &&
          end &&
          Math.hypot(end[0] - point[0], end[1] - point[1], end[2] - point[2]) < 1
        ) {
          nearest = length;
          target = point;
          this.why = why;
        }
      }
      if (target) {
        return target;
      }
    }
    if (role === 'guard') {
      this.why = 'guard';
      return this.patrol(world, p, home.base, world.def.teams[1 - team].base);
    }
    this.why = 'take flag';
    return theirs.state === FLAG.DROPPED
      ? [theirs.x, theirs.y, theirs.z]
      : world.def.teams[1 - team].base;
  }

  /** The guard's point: round its flag, a stop at each point, one way or the other by its id. */
  private patrol(w: World, p: PlayerState, base: Vec3, from: Vec3): Vec3 {
    if (this.base !== base) {
      [this.base, this.posts, this.post] = [base, round(w, base, from), 0];
    }
    const n = this.posts.length;
    if (!n) {
      return base;
    }
    const { at, look } = this.posts[this.post];
    if (flat(p.x, p.z, at[0], at[2]) < 1.5) {
      // Stood at the point, it watches its way in, the look sweeping slowly across it.
      this.gaze = norm(look + SWEEP * Math.sin(this.ticks / 50 + this.id));
      this.stop ||= this.ticks + PAUSE + Math.floor(this.rnd() * PAUSE);
      if (this.ticks > this.stop) {
        this.post = (this.post + (this.id & 1 ? 1 : n - 1)) % n;
        this.stop = 0;
      }
    }
    return this.posts[this.post].at;
  }

  private plan(w: World, p: PlayerState, goal: Vec3): void {
    this.goal = goal;
    this.planned = this.ticks;
    // The carrier goes home the quickest way: its route was for spreading the attack. Not a body
    // that jumps unlike the marine the links were flown with: it keeps to the route it knows.
    const direct = (this.why === 'flag home' && !this.steer) || this.why.endsWith(' rack');
    const prefer = direct ? -1 : this.prefer;
    this.steps = path(navOf(w), w, at(p), goal, prefer);
    this.step = 0;
    this.flight = undefined;
    this.best = Infinity;
    this.better = this.ticks;
  }

  /**
   * The keys and yaw of the move, whether the bot may look away from it to shoot, and whether the
   * yaw must be kept to the letter (a leg of a route, as the tests fly it).
   */
  private pilot(p: PlayerState): Move {
    const s = this.steps[this.step];
    if (s?.leg) {
      return this.fly(p, s.leg);
    }
    if (!s) {
      return { keys: 0, yaw: this.aim, free: true, exact: false };
    }
    const [x, y, z] = s.to;
    const d = flat(p.x, p.z, x, z);
    // Off a drop or onto a box: it steers to come down on the point, and starts no leg in the air.
    if (!p.ground) {
      return {
        keys: this.alight(p, x, y, z),
        yaw: toward(p.x, p.z, x, z),
        free: false,
        exact: false,
      };
    }
    const last = this.step === this.steps.length - 1;
    // A point where a jump lands may stand against a wall: blocked close to it is there.
    const near = d < 2 && this.ticks - this.better > STUCK_JUMP;
    if (d < (last ? 1 : 0.5) || (near && !last)) {
      if (!last) {
        this.next();
        return this.pilot(p);
      }
      return { keys: 0, yaw: this.gaze ?? this.aim, free: true, exact: false };
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
    if (Math.abs(turn(this.look, yaw)) < 0.15 && !this.steps[this.step + 1]?.leg) {
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
    // A floor under any part of the body holds it, as the physics has it: along a beam's edge too.
    for (let t = 0.5; t <= far; t += 0.5) {
      const [x, z] = [p.x + fx * t, p.z + fz * t];
      const y = p.y + HOP;
      const under = Math.max(
        floorAt(w, x, z, y),
        floorAt(w, x - fz * PLAYER_R, z + fx * PLAYER_R, y),
        floorAt(w, x + fz * PLAYER_R, z - fx * PLAYER_R, y),
      );
      if (under < p.y - hurts) {
        return false;
      }
    }
    const reach = Math.min(ahead, AHEAD);
    if (ray(w, [p.x, p.y + 1.9, p.z], [fx, 0, fz], reach) < reach) {
      return false;
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
    this.step++;
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
      // The next way round goes the other side.
      this.side = -this.side;
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
        const next = this.steps[this.step + 1]?.leg;
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
    const n = leg.run ? (f.ended < 0 ? -1 : f.k - f.ended) : f.k;
    const extra = (n === leg.dash ? DASH : 0) | (n === leg.double ? JUMP : 0);
    // A body that jumps unlike the marine steers to come down on the point once the leg's dash and
    // double jump are spent: braked before them, a dash falls short of the far roof.
    const spent = n > Math.max(leg.dash ?? -1, leg.double ?? -1);
    if (leg.land || (this.steer && spent)) {
      return {
        keys: this.alight(p, leg.to[0], leg.y, leg.to[1]) | (leg.land ? 0 : extra),
        yaw,
        free: false,
        exact: true,
      };
    }
    return {
      keys: keys | extra,
      yaw,
      free: false,
      exact: true,
    };
  }

  /**
   * FORWARD or BACK in the air to come down on (x, y, z) facing it: will the flight carry it past
   * the point, or short of it, by the time it is down at its height? 0 when it will land there.
   */
  private alight(p: PlayerState, x: number, y: number, z: number): number {
    const d = flat(p.x, p.z, x, z);
    const v = (p.vx * (x - p.x) + p.vz * (z - p.z)) / (d || 1);
    const g = gravity(this.world!);
    const t = Math.max((p.vy + Math.sqrt(Math.max(p.vy ** 2 + 2 * g * (p.y - y), 0))) / g, 0.05);
    return v * t < d - 0.3 ? FORWARD : v * t > d + 0.3 ? BACK : 0;
  }

  /** Whether the edge after this one is a jump that wants the run-up of this one. */
  private leapNext(): boolean {
    const l = this.steps[this.step + 1]?.leg;
    return l?.k === 'leap' && l.sprint;
  }

  /** A leg is over: on to the next on its roof, else a new way from where the bot came down. */
  private landed(p: PlayerState, leg: Leg): Move {
    if (Math.abs(p.y - leg.y) > 0.3) {
      // Came down elsewhere: the link costs more for the rest of the room's life.
      const e = this.steps[this.step]?.edge;
      if (e) {
        e.fails = (e.fails ?? 0) + 1;
      }
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
    // A route leg and a flag carrier keep their movement keys instead of fighting.
    const theirs = flags[1 - me.team];
    if (!p.ground || !free || (theirs.state === FLAG.CARRIED && theirs.by === me.id)) {
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
      // It sees ahead of its look and hears close by; the one it fights it follows round.
      if (
        d >= RANGE ||
        (o.id !== this.foe &&
          d >= HEAR &&
          Math.abs(turn(p.yaw, toward(p.x, p.z, q.x, q.z))) >= VIEW)
      ) {
        continue;
      }
      // The one who has our flag first, then one on a teammate who carries theirs or is low, then the nearest.
      const onMate = others.some(
        m =>
          m.team === me.team &&
          !m.state.down &&
          (m.state.hp <= LOW || (theirs.state === FLAG.CARRIED && theirs.by === m.id)) &&
          flat(m.state.x, m.state.z, q.x, q.z) < NEAR,
      );
      const score = o.id === carrier ? d - RANGE : onMate ? d - RANGE / 2 : d;
      if (score < best && !hidden(world, eye, [q.x, q.y + 1.2, q.z])) {
        [foe, best] = [o, score];
      }
    }
    if (!foe) {
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
      this.speed = [0, 0, 0];
      // One it has just fought knows it is there: no warning again.
      const known = this.ticks - (this.met.get(foe.id) ?? -MEMORY) < MEMORY;
      [this.shot, this.warned, this.past] = [p.shots, known ? 0 : this.persona.warn, 1];
      if (this.rnd() < 0.5) {
        this.past = -1;
      }
    }
    this.met.set(foe.id, this.ticks);
    const d = flat(p.x, p.z, q.x, q.z);
    const blade = !!s.kit?.katana && !!p.blade;
    // His speed as it makes it out, late; the lead a share of the ball's flight.
    const v = this.speed;
    const k = this.persona.track;
    [v[0], v[1], v[2]] = [
      v[0] + (q.vx - v[0]) * k,
      v[1] + (q.vy - v[1]) * k,
      v[2] + (q.vz - v[2]) * k,
    ];
    const lead =
      blade || p.railed ? 0 : (this.persona.lead * d) / (p.rifled ? RIFLE_SPEED : PLASMA_SPEED);
    const [tx, ty, tz] = [q.x + v[0] * lead, q.y + 1.1 + v[1] * lead, q.z + v[2] * lead];
    // The aim wanders about him, never still on him, the more as he crosses its view or it moves.
    const [ux, uz] = [(q.x - p.x) / Math.max(d, 0.1), (q.z - p.z) / Math.max(d, 0.1)];
    const across = Math.abs((q.vx - p.vx) * uz - (q.vz - p.vz) * ux);
    const shake = this.persona.shake * (1 + across / CROSS);
    this.err = this.err * 0.94 + (this.rnd() * 2 - 1) * shake * 0.35;
    this.errUp = this.errUp * 0.94 + (this.rnd() * 2 - 1) * shake * 0.2;
    // Shots past him first, and past him too when TOKENS of its team already shoot to hit him.
    const hunters = s.hunters?.get(foe.id) ?? [];
    const before = hunters.filter(id => id < this.id).length;
    // The count wraps at 256.
    const warning = ((p.shots - this.shot) & 255) < this.warned;
    const hit = !warning && before < TOKENS;
    // A shot meant to miss leaves the wander out: on the wrong side it would put it on him.
    const off = hit ? this.err : this.past * Math.atan2(PAST, Math.max(d, 1));
    const want = norm(toward(p.x, p.z, tx, tz) + off);
    const rate = this.persona.turn;
    this.aim = norm(this.aim + Math.max(-rate, Math.min(rate, turn(this.aim, want))));
    this.pitch = Math.atan2(ty - eye[1], Math.max(d, 0.1)) + this.errUp;
    const ready =
      this.ticks - this.since > this.persona.react && Math.abs(turn(this.aim, want)) < CONE;
    if (foe.id === carrier && d < TACKLE && p.ground && !(p.held & DASH)) {
      return { keys: FORWARD | DASH };
    }
    if (blade) {
      const inReach = d < CUTS[CUT.SLASH].reach && Math.abs(q.y - p.y) < HUNT_Y;
      return { keys: ready && inReach && !p.swing ? (this.rnd() < 0.25 ? SPECIAL : FIRE) : 0 };
    }
    const armed = p.ammo > 0 && (p.mag ?? 0) > 0 && !p.wield;
    // The gun fires on letting go: a tap, held one step in two.
    const pull = (armed && d < RANGE) || (!armed && d < 1.4);
    // A token is held only by a bot that shoots: not one empty, still reacting or turning.
    if (!warning && ready && pull) {
      this.hunting = foe.id;
    }
    return { keys: ready && pull && this.ticks & 1 ? FIRE : 0 };
  }
}
