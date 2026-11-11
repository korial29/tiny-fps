// The runners' natural gait on the rig (rig.ts). Walk, run and sprint are a few numbers per gait,
// blended by speed. A foot on the ground stays where it landed (two-bone IK), the pelvis sits where
// the stance legs put it, and a swing foot flies from where it left to where the stride will land
// it. The other moves are static poses (MOVES) eased in by critically damped springs, so a switch
// never pops. Everything is in the runner's frame: x right, y up, -z ahead. No DOM.
import { DASH_COOLDOWN, DASH_TICKS } from '../shared/constants';
import { floored } from '../shared/physics';
import { MODE } from '../shared/types';
import type { PlayerState } from '../shared/types';
import type { Vec3 } from './mesh';
import { JOINT as J, PARENT, REST, axis, mul, rest, slerp, solve, turn } from './rig';
import type { Pose, Quat } from './rig';
import { grips } from './rover';
import { damp } from './spring';

/** The height of the ground at (x, z), for feet that stand on stairs and slopes. */
export type Floor = (x: number, z: number) => number;

/** The seat of a player in a rover (MODE.RIDE): the rover's attitude and its front wheels' angle, and the seat, 0 the driver's, 1 the rider's. */
export interface Seat {
  yaw: number;
  pitch: number;
  roll: number;
  steer: number;
  s: number;
}

export interface Gait {
  /**
   * Moves to the state `p` after dt seconds. Without `floor` the feet stand on y = p.y. `seat` is
   * where a player who rides sits: without it he sits level, a rider, facing his look.
   */
  update(p: PlayerState, dt: number, floor?: Floor, seat?: Seat): void;
  /** The pose now: one object, rewritten by each call. */
  pose(): Pose;
  /** Stride phase, in cycles: the left foot lands at 0 and the right one at a half. */
  readonly phase: number;
  /** Footsteps so far: a foot set down, or along a wall each half of the stride. */
  readonly steps: number;
}

const TAU = Math.PI * 2;
const [X, Y, Z]: Vec3[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
/** Thigh and shin, and the ankle above the floor when the foot is flat. */
const [THIGH, SHIN, SOLE] = [0.44, 0.43, 0.06];
/** Upper arm and forearm (the rest offsets of the elbow and the wrist). */
const [ARM, FORE] = [0.2915, 0.26];
const LEG = THIGH + SHIN;
const clamp = (v: number, lo = 0, hi = 1) => Math.min(Math.max(v, lo), hi);
const ease = (v: number) => (v = clamp(v)) * v * (3 - 2 * v);
const arc = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const inv = (q: Quat): Quat => [-q[0], -q[1], -q[2], q[3]];
/** Per player and per number, in [0, 1). */
const rnd = (id: number, n: number) => {
  const x = Math.sin(id * 78.233 + n * 37.719) * 43758.5453;
  return x - Math.floor(x);
};
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
/** p a + q b. */
const lin = (a: Vec3, p: number, b: Vec3, q = 0) => a.map((v, i) => v * p + b[i] * q) as Vec3;
const unit = (a: Vec3) => lin(a, 1 / (Math.hypot(...a) || 1), a);
/** The part of `v` across the unit vector `u`. */
const perp = (v: Vec3, u: Vec3) => lin(v, 1, u, -(v[0] * u[0] + v[1] * u[1] + v[2] * u[2]));
/** Smooth minimum: the lower of two, rounded over a band of k. */
const low = (a: number, b: number, k: number) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - (h * h * k) / 4;
};

/** The rotation whose x axis is `x` and whose y axis points up the bone, opposite to `d`. */
export const frame = (x: Vec3, d: Vec3): Quat => {
  const y: Vec3 = [-d[0], -d[1], -d[2]];
  const z = cross(x, y);
  // The matrix of the axes as a quaternion, through its largest term, which stays sound at a half turn.
  const t = [x[0] + y[1] + z[2], x[0] - y[1] - z[2], y[1] - x[0] - z[2], z[2] - x[0] - y[1]];
  const i = t.indexOf(Math.max(...t));
  const [h, a, b, c] = [1 + t[i], y[2] - z[1], z[0] - x[2], x[1] - y[0]];
  const [u, v, w] = [y[0] + x[1], z[0] + x[2], z[1] + y[2]];
  const q = [
    [a, b, c, h],
    [h, u, v, a],
    [u, h, w, b],
    [v, w, h, c],
  ][i];
  const n = Math.hypot(...q);
  return q.map(e => e / n) as Quat;
};

/**
 * The world rotations of the two bones of a limb (lengths `a` and `b`, a leg by default) that put
 * the end at `t` from the root at `h`, the middle joint toward `f`. A knee or an elbow bends about
 * the one axis (`k` -1 for an arm, which folds the other way), so it never turns backward; a target
 * out of reach leaves the limb straight.
 */
const limb = (h: Vec3, t: Vec3, f: Vec3, a_ = THIGH, b_ = SHIN, k = 1): [Quat, Quat] => {
  const v = lin(t, 1, h, -1);
  const len = Math.hypot(...v) || 1e-6;
  const d = clamp(len, 0.2, (a_ + b_) * 0.999);
  const u = lin(v, 1 / len, v);
  const w = unit(perp(f, u));
  const c = clamp((a_ * a_ + d * d - b_ * b_) / (2 * a_ * d), -1, 1);
  const a = lin(u, c, w, Math.sqrt(1 - c * c));
  const b = unit(lin(u, d, a, -a_));
  const x = lin(cross(u, w), k, u);
  return [frame(x, a), frame(x, b)];
};

/**
 * How far the ankle moves forward and up from where it stands with the foot flat, when the foot
 * is pitched `t` (toes up positive): it turns about the heel, or about the ball once the toes
 * point down. The heel is 7 cm behind the ankle and the ball 13 cm ahead, the sole 6 cm below.
 */
const roll = (t: number): [number, number] => {
  const [a, d] = [Math.abs(t), t > 0 ? 0.07 : 0.13];
  const [s, c] = [Math.sin(a), Math.cos(a)];
  return [(t > 0 ? -1 : 1) * (d * (1 - c) + SOLE * s), SOLE * (c - 1) + d * s];
};

/**
 * The gaits, as numbers at three speeds: a walk at 1.4 m/s, a run at 5 and a sprint at 9, linear
 * between, held beyond. Angles in radians, lengths in metres. Real running: cadence and stride
 * both grow with speed, the foot lands nearer the body and leaves higher, the knees bend deeper in
 * stance and swing, the elbows fold to a right angle and beyond.
 */
const SPEEDS = [1.4, 5, 9];
const GAITS = {
  /** Stride frequency, cycles per second (two steps). */
  f: [0.95, 1.4, 1.8],
  /** Stance travel: how far the body goes while one foot is down. It sets the contact time. */
  s: [0.88, 0.95, 1],
  /** The part of it that the foot lands ahead of the hip. */
  k: [0.45, 0.42, 0.4],
  /** Foot sideways from the midline. */
  lat: [0.11, 0.09, 0.07],
  /** Swing foot clearance: the ankle's peak above its resting height. */
  lift: [0.09, 0.3, 0.4],
  /** Leg shortening (a fraction of the leg) at touchdown, and the extra loading at mid-stance. */
  d0: [0.002, 0.01, 0.01],
  d1: [0.008, 0.075, 0.05],
  /** Ankle at touchdown (toes up positive) and at toe-off. */
  td: [0.12, 0.1, -0.12],
  to: [-0.45, -0.6, -0.8],
  /** Pelvis turn, obliquity (the swing side drops), mean tilt and the twice-a-stride tilt. */
  pr: [0.07, 0.1, 0.14],
  po: [0.06, 0.06, 0.05],
  pt: [0.04, 0.1, 0.16],
  pa: [0.02, 0.05, 0.06],
  /** Shoulder line turn against the pelvis. */
  cc: [0.1, 0.16, 0.22],
  /** Arm swing, mean shoulder flexion, mean and swing of the elbow, arm abduction. */
  aa: [0.35, 0.8, 1],
  am: [-0.05, 0.12, 0.25],
  em: [0.3, 1.4, 1.75],
  ea: [0.12, 0.25, 0.3],
  ab: [0.1, 0.12, 0.1],
  /** Hips sway toward the stance foot, and the flight bump of the pelvis. */
  sw: [0.025, 0.012, 0.008],
  hop: [0, 0.02, 0.025],
};
type Key = keyof typeof GAITS;

/** The moves other than the stride, in layering order: a later one covers an earlier one. */
export const MOVE = {
  AIR: 0,
  RISE: 1,
  DASH: 2,
  WALL_L: 3,
  WALL_R: 4,
  HANG: 5,
  CLIMB: 6,
  SLIDE: 7,
  STUN: 8,
  TUCK: 9,
  /** Out of health: the knees give and the body topples (see `lie` in build). */
  DOWN: 10,
  /** Seated in a rover: the rough of it, the hands and the feet are placed in `reach`. */
  RIDE: 11,
} as const;

/**
 * A seated body, from the seat point (the player's position, the feet of shared/rover.ts' seat())
 * in the rover's frame: the pelvis above it and behind it (on a cushion whose top is 0.13 m up,
 * before a back 0.3 m behind that leans away), the trunk's lean back, the ankles ahead and above,
 * half the feet's spread, and the toes' pitch up against the footwell's slope.
 */
export const SIT = {
  up: 0.25,
  back: 0.15,
  lean: 0.14,
  ahead: 0.6,
  ankle: 0.0,
  wide: 0.11,
  toes: 0.3,
  /** The driver sits up to the yoke: his pelvis this far ahead of a rider's, his trunk this far forward of it. */
  reach: 0.07,
  hunch: 0.26,
};

/**
 * A move's pose, in radians (metres for the offsets): drop of the pelvis, lean forward, lean to the
 * left, hip and knee flexion of the left then the right leg, shoulder and elbow flexion of the left
 * then the right arm, both arms out sideways, then the pelvis forward and to the right. Hands and
 * feet that touch the world are placed over it (see `reach`). A stumble poses the arms only: the
 * trunk and the legs follow the knock.
 */
export const MOVES: number[][] = [
  [-0.05, 0.12, 0, 0.35, 0.5, 0.15, 0.7, 0.25, 0.5, 0.25, 0.5, 1.15, 0, 0],
  [0, 0.1, 0, 1.2, 1.5, -0.35, 0.3, 2.4, 0.3, 2.2, 0.3, 0.35, 0, 0],
  [-0.35, 1.25, 0, 1.1, 1.3, -0.6, 0.25, -1, 0.3, -1, 0.3, 0.25, 0, 0],
  [],
  [-0.02, 0.2, 0.7, 0.9, 1.2, 0.6, 1.3, 0.8, 1, 0.3, 0.5, 0.6, 0, 0.1],
  [0.07, 0.05, 0, 0.2, 0.3, 0.1, 0.2, 3, 0.2, 3, 0.2, 0.2, -0.22, 0],
  [0, 0.5, 0, 0.2, 0.4, 1.4, 1.7, 1, 1.4, 1, 1.4, 0.15, -0.1, 0],
  [-0.78, -1.1, 0, 1.1, 1.8, 1.4, 0.1, 0.5, 0.8, 0.4, 0.5, 0.8, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0.8, 1.6, 0.8, 1.6, 0.2, 0, 0],
  [-0.05, 0.9, 0, 1.7, 2, 1.7, 2, 0.8, 1.6, 0.8, 1.6, 0.2, 0, 0],
  [-0.5, 0.35, 0, 1.3, 0.3, 1.1, 0.2, 0.4, 0.4, 0.2, 0.3, 0.6, 0, 0],
  [SIT.up - 0.98, -SIT.lean, 0, 1.75, 1.5, 1.75, 1.5, 0.75, 0.75, 0.75, 0.75, 0.1, SIT.back, 0],
];
// A wall on the left is the wall on the right seen in a mirror.
const m = MOVES[MOVE.WALL_R];
MOVES[MOVE.WALL_L] = [
  m[0],
  m[1],
  -m[2],
  m[5],
  m[6],
  m[3],
  m[4],
  m[9],
  m[10],
  m[7],
  m[8],
  m[11],
  m[12],
  -m[13],
];

/** What a move poses: the pelvis, the spine, the arms and the legs, and nothing of the head. */
const FK = [
  J.PELVIS,
  J.SPINE,
  J.CHEST,
  J.ARM_L,
  J.FOREARM_L,
  J.ARM_R,
  J.FOREARM_R,
  J.THIGH_L,
  J.SHIN_L,
  J.FOOT_L,
  J.TOE_L,
  J.THIGH_R,
  J.SHIN_R,
  J.FOOT_R,
  J.TOE_R,
];
const fk = (c: number[]): Quat[] => {
  const q: Quat[] = [];
  const [lean, roll_, abd] = [c[1], c[2], c[11]];
  q[J.PELVIS] = mul(axis(Z, roll_ * 0.4), axis(X, -0.3 * lean));
  q[J.SPINE] = mul(axis(Z, roll_ * 0.3), axis(X, -0.35 * lean));
  q[J.CHEST] = q[J.SPINE];
  q[J.ARM_L] = mul(axis(Z, -abd), axis(X, c[7]));
  q[J.FOREARM_L] = axis(X, c[8]);
  q[J.ARM_R] = mul(axis(Z, abd), axis(X, c[9]));
  q[J.FOREARM_R] = axis(X, c[10]);
  [J.THIGH_L, J.THIGH_R].forEach((j, i) => {
    q[j] = axis(X, c[3 + 2 * i] + 0.3 * lean);
    q[j + 1] = axis(X, -c[4 + 2 * i]);
    q[j + 2] = axis(X, -0.35);
    q[j + 3] = IDENT;
  });
  return q;
};
const IDENT: Quat = [0, 0, 0, 1];

/** The unit vector toward a wall on each SIDE of PlayerState.wall, on the floor plane. */
const TOWARD = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** The rover's lean in the frame of its yaw, `k` of the way: the nose up by its pitch, the right side down by its roll (basis() in mesh.ts). */
const tipped = (s: Seat, k: number): Quat =>
  slerp(IDENT, mul(axis(X, s.pitch), axis(Z, -s.roll)), k);

/** Spring slots, a value and its speed each: lean, bank, yaw offset, landing dip, crouch, the velocity the stride sees, the pelvis height, how far up a ledge the climb is, the knock ahead and to the right, then one per move. */
const [LEAN, BANK, YAW, DIP, LOW, VX, VZ, HY, UP, KA, KR, W] = [
  0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22,
];
/** Metres a respawn moves a player in a frame, at the least. */
const TELEPORT = 5;
/** Half of a hip joint's distance from the middle: the feet stand under the hips on the move. */
const HIP = 0.1;
/**
 * The guard a still runner stands in, not straight as a post (the user, 2026-11-08): half the
 * feet's spread (metres), how far the right foot stands ahead and the left behind (metres), the
 * trunk's lean forward (radians), and how far the legs give.
 */
const [WIDE, STEP, BOW, GIVE] = [0.16, 0.12, 0.2, 0.05];
/** How much wider, longer, further forward and lower the guard of one with nothing in his hands is: a fighter's stance (FISTS). */
const LOW_GUARD = [0.03, 0.08, 0.06, 0.035];
/**
 * The guard of one with nothing in his hands (the user, 2026-11-11: the arms out before him as in
 * karate, not along the body, not a boxer's fists by the chin): the lead arm (the right, as the
 * right foot) nearly straight ahead at the chest's height, the rear hand half way out before the
 * solar plexus. Per arm, the lead then the rear: the upper arm's lift forward and out to the side,
 * its turn inward, and the elbow's bend (radians).
 */
const FISTS = [
  [1.15, 0.05, 0.12, 0.4],
  [0.5, 0.1, 0.3, 1.25],
];
/**
 * The breath of one standing still (the user, 2026-11-11: see him breathe): breaths a second, the
 * chest's lift (radians), the shoulders' (radians), and the rise of the whole body on its legs (metres).
 */
const BREATH = [0.3, 0.035, 0.03, 0.007];
/**
 * The guard with the katana in hand, a swordsman's middle guard (the user, 2026-11-10: stand like
 * a samurai): how much further ahead the right foot stands and behind the left (metres), the pitch
 * of the left foot, its heel off the floor (radians), the share of the lean forward that is left,
 * the back straight, and how much more the legs give, the knees soft.
 */
const KAMAE = [0.02, 0.28, 0.4, -0.025];

interface Foot {
  /** The ankle now. */
  x: number;
  y: number;
  z: number;
  /** Planted: where the flat foot stands, and the ground height there. */
  px: number;
  pz: number;
  gy: number;
  /** Swing: where the ankle left, the stride phase it left at, and the ground height it lands on. */
  lx: number;
  ly: number;
  lz: number;
  dl: number;
  tg: number;
  /** Stride phase last frame, how far along the stance (0 to 1), and the weight it has on the pelvis. */
  u: number;
  x0: number;
  w: number;
  /** Pitch of the foot, toes up positive, and how much of the toes' bend against it holds. */
  th: number;
  tw: number;
  on: boolean;
}

/** `bow` is the guard's lean forward: none for the eye's own body, whose arms hold to the view and which stands in no sword guard. */
export const createGait = (bow = BOW): Gait => {
  const out = rest();
  const P = {} as Record<Key, number>;
  /** After the moves' springs, the sword guard's. */
  const KEN = W + 2 * MOVES.length;
  /** After it, the bare fists' guard's. */
  const BARE = KEN + 2;
  const sp = new Array<number>(BARE + 2).fill(0);
  const feet: Foot[] = [0, 1].map(() => ({
    x: 0,
    y: 0,
    z: 0,
    px: 0,
    pz: 0,
    gy: 0,
    lx: 0,
    ly: 0,
    lz: 0,
    dl: 0,
    tg: 0,
    u: 0,
    x0: 0,
    w: 0,
    th: 0,
    tw: 1,
    on: true,
  }));
  /** The state of the last frame, once there is one. */
  const q = {} as PlayerState;
  let known = false;
  let [ph, steps, time, v, yaw, wall, heading] = [0, 0, 0, 0, 0, 0, 0];
  let [kick, fall, flip, duty, gate] = [0, 0, 0, 0.6, 0];
  let [grounded, fresh, dirty, built] = [false, true, true, -1];
  /** Per player: cadence, arm swing of each side, mean tilt, toe-out, the phase of a hang's sway. */
  let who = [1, 1, 1, 0, 0.06, 0];
  let [look, pitch, at] = [0, 0, [0, 0, 0]];
  /** The wall of a wall-run: its side of the runner (-1 left, 1 right) and its normal. The ledge held: where the hands took it, the normal and the height of its top. */
  let [side, wn, lip, held] = [1, [1, 0], [0, 0, 0, -1, 0], false];
  /** The seat he rides in, and whether a weapon keeps his right hand. */
  let sat: Seat | undefined;
  let armed = false;

  const update = (p: PlayerState, dt: number, floor?: Floor, seat?: Seat) => {
    dt = clamp(dt, 0, 0.1);
    fresh = !known || Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) > TELEPORT;
    const walks = p.mode == MODE.GROUND || p.mode == MODE.CROUCH;
    const air = p.mode == MODE.AIR;
    // The stride sees the velocity a moment late, so that a stop or a turn moves the feet smoothly.
    const set = (i: number, to: number, w: number) => {
      if (fresh) {
        [sp[i], sp[i + 1]] = [to, 0];
      } else {
        damp(sp, i, to, w, dt);
      }
    };
    set(VX, p.vx, 12);
    set(VZ, p.vz, 12);
    const [vx, vz] = [sp[VX], sp[VZ]];
    v = Math.sqrt(vx * vx + vz * vz);
    const way = v > 1 ? Math.atan2(-vx, -vz) : p.yaw;
    if (fresh) {
      const id = p.id;
      who = [
        1 + 0.08 * (rnd(id, 0) - 0.5),
        1 + 0.16 * (rnd(id, 1) - 0.5),
        1 + 0.16 * (rnd(id, 2) - 0.5),
        0.03 * (rnd(id, 3) - 0.5),
        0.05 + 0.04 * rnd(id, 4),
        rnd(id, 6),
      ];
      ph = v > 0.25 ? rnd(id, 5) : rnd(id, 5) < 0.5 ? 0.05 : 0.55;
      [steps, time, flip, kick, fall, grounded, built] = [0, 0, 0, 0, 0, false, -1];
      heading = way;
      wall = p.yaw;
    } else {
      if (air && q.mode == MODE.AIR && p.jumps < q.jumps && p.vy > q.vy) {
        flip = 1e-3;
      }
      if (air) {
        fall = Math.min(fall, p.vy);
      } else {
        if (q.mode == MODE.AIR && (walks || p.mode == MODE.SLIDE) && fall < -3) {
          kick = clamp(-fall / 12, 0.3);
        }
        fall = 0;
      }
      if (flip) {
        flip += dt * (air ? 2.2 : 8);
        flip = flip >= 1 ? 0 : flip;
      }
    }
    time += dt;
    kick *= Math.exp(-dt * 7);

    // The moves other than the stride.
    const dir = TOWARD[p.wall];
    const wr = p.mode == MODE.WALLRUN;
    const hold = p.mode == MODE.HANG || p.mode == MODE.CLIMB;
    if (wr) {
      [side, wn] = [dir[0] * Math.cos(way) - dir[1] * Math.sin(way) < 0 ? -1 : 1, dir];
    }
    if (hold && p.wall) {
      wall = Math.atan2(-dir[0], -dir[1]);
      if (p.mode == MODE.HANG || !held) {
        lip = [p.x, p.z, dir[0], dir[1], 0];
      }
      lip[4] = p.edge;
    }
    held = hold;
    [
      air,
      air && p.vy > 0.5,
      p.dash > DASH_COOLDOWN - DASH_TICKS,
      wr && side < 0,
      wr && side > 0,
      p.mode == MODE.HANG,
      p.mode == MODE.CLIMB,
      p.mode == MODE.SLIDE,
      p.stun > 0,
      flip && Math.sqrt(Math.sin(Math.PI * flip)),
    ].forEach((g, i) => set(W + 2 * i, +g, 12));
    // Floored by an arc, he lies as one down, falling faster.
    set(W + 2 * MOVE.DOWN, +(p.down > 0 || floored(p)), floored(p) ? 9 : 5);
    const rides = p.mode == MODE.RIDE;
    set(W + 2 * MOVE.RIDE, +rides, 14);
    sat = rides ? (seat ?? { yaw: p.yaw, pitch: 0, roll: 0, steer: 0, s: 1 }) : sat;
    armed = p.ammo >= 0 || !!p.railed || !!p.rifled || !!p.wield;
    set(KEN, +(!!p.wield && bow > 0), 10);
    set(BARE, +(!armed && bow > 0 && !p.down), 8);
    set(LOW, +(p.mode == MODE.CROUCH), 12);
    set(UP, hold ? clamp((1.7 - lip[4] + p.y) / 1.2) : 0, 14);
    set(DIP, kick, 26);

    // Lean with speed and acceleration, bank with the turn of the heading.
    const turnRate = fresh || v < 2 ? 0 : arc(heading, way) / Math.max(dt, 1e-3);
    heading = way;
    const accel = fresh
      ? 0
      : -((p.vx - q.vx) * Math.sin(yaw) + (p.vz - q.vz) * Math.cos(yaw)) / Math.max(dt, 1e-3);
    const ahead = -(vx * Math.sin(yaw) + vz * Math.cos(yaw));
    const run = Math.sign(ahead) * clamp((Math.abs(ahead) - 1.5) * 0.028, 0, 0.22);
    set(LEAN, (ahead > 0 ? run : run / 2) + clamp(accel * 0.012, -0.3, 0.3), 7);
    set(BANK, clamp(0.3 * Math.atan((v * turnRate) / 9.8), -0.4, 0.4), 8);
    set(YAW, 0.5 * Math.sin(arc(p.yaw, way)) * clamp(v / 2), 10);
    const sw = (k: number) => sp[W + 2 * k];
    const turned = clamp(sw(MOVE.DASH) + sw(MOVE.WALL_L) + sw(MOVE.WALL_R) + sw(MOVE.SLIDE));
    const face = p.yaw + arc(p.yaw, way) * turned;
    yaw = face + arc(face, wall) * clamp(sw(MOVE.HANG) + sw(MOVE.CLIMB));
    yaw += sp[YAW] * (1 - turned);
    // Seated, the body faces the rover's nose.
    if (sat) {
      yaw += arc(yaw, sat.yaw) * clamp(sw(MOVE.RIDE));
    }
    // The push of a tackle in the body's frame, taken off the velocity as it lands and eased out as it slides away.
    const [kc, ks] = [Math.cos(yaw), Math.sin(yaw)];
    set(KA, p.stun > 0 ? clamp(-(p.vx * ks + p.vz * kc) / 4.2, -1, 1) : 0, 18);
    set(KR, p.stun > 0 ? clamp((p.vx * kc - p.vz * ks) / 4.2, -1, 1) : 0, 18);
    [look, pitch, at] = [p.yaw, p.pitch, [p.x, p.y, p.z]];

    // The stride's numbers at this speed.
    const i = v < SPEEDS[1] ? 0 : 1;
    const t = clamp((v - SPEEDS[i]) / (SPEEDS[i + 1] - SPEEDS[i]));
    for (const k in GAITS) {
      const r = GAITS[k as Key];
      P[k as Key] = r[i] + (r[i + 1] - r[i]) * t;
    }
    gate = ease((v - 0.2) / 1.2);
    // A stumble takes quick catching steps.
    const cadence = P.f * who[0] * (0.35 + 0.65 * clamp(v / 1.4)) * (1 + 0.5 * sw(MOVE.STUN));
    duty = clamp((P.s * cadence) / Math.max(v, 0.1), 0.2, 0.62);
    const [rx, rz] = [Math.cos(yaw), -Math.sin(yaw)];
    const ground = (x: number, z: number) => {
      const g = floor ? floor(x, z) : p.y;
      return Math.abs(g - p.y) < 0.6 ? g : p.y;
    };
    const idle = v <= 0.25;
    const advance = walks && (!idle || !feet[0].on || !feet[1].on);
    if (advance || wr) {
      const h = Math.floor(ph * 2);
      ph = (ph + (idle && !wr ? 0.9 : cadence) * dt) % 1;
      // Along a wall the feet plant nowhere: a step each half of the stride, as they swing.
      steps += +(wr && Math.floor(ph * 2) != h);
    }
    feet.forEach((f, n) => {
      const s = n ? 1 : -1;
      const u = (ph + n / 2) % 1;
      const [wide, ahead] = idle
        ? [
            WIDE + LOW_GUARD[0] * sp[BARE],
            s * (STEP + KAMAE[0] * sp[KEN] + LOW_GUARD[1] * sp[BARE]),
          ]
        : [HIP, 0];
      const [hx, hz] = [
        p.x + rx * s * wide - Math.sin(yaw) * ahead,
        p.z + rz * s * wide - Math.cos(yaw) * ahead,
      ];
      const fy = yaw - s * who[4];
      const [fx, fz] = [-Math.sin(fy), -Math.cos(fy)];
      if (!walks) {
        // Off the ground the foot rides with the body and eases to hanging under the hip.
        const k = fresh ? 0 : Math.exp(-10 * dt);
        const o = fresh ? [0, 0, 0] : [f.x - q.x, f.y - q.y, f.z - q.z];
        f.x = p.x + o[0] * k + (hx - p.x) * (1 - k);
        f.y = p.y + o[1] * k + SOLE * (1 - k);
        f.z = p.z + o[2] * k + (hz - p.z) * (1 - k);
        [f.th, f.tw, f.w, f.on, f.u] = [f.th * k, f.tw * k, 0, false, u];
        return;
      }
      if (!grounded) {
        [f.px, f.pz, f.gy, f.on] = [hx, hz, ground(hx, hz), true];
        if (fresh) {
          [f.x, f.y, f.z, f.th, f.tw] = [hx, f.gy + SOLE, hz, 0, 1];
        }
      }
      if (f.on && advance && (u >= duty || Math.hypot(f.x - hx, f.z - hz) > 0.56)) {
        [f.on, f.lx, f.ly, f.lz, f.dl] = [false, f.x - p.x, f.y, f.z - p.z, u];
      } else if (!f.on && u < f.u) {
        const [df] = roll(P.td * gate);
        [f.on, f.px, f.pz, f.gy] = [true, f.x - fx * df, f.z - fz * df, f.tg];
        steps++;
      }
      f.u = u;
      if (f.on) {
        if (idle && feet[0].on && feet[1].on) {
          const k = 1 - Math.exp(-8 * dt);
          f.px += (hx - f.px) * k;
          f.pz += (hz - f.pz) * k;
          f.gy += (ground(hx, hz) - f.gy) * k;
        }
        f.x0 = clamp(u / duty);
        // In the sword guard the left heel is off the floor.
        f.th =
          gate * (P.td * (1 - ease(f.x0 / 0.25)) + P.to * ease((f.x0 - 0.55) / 0.45)) -
          (n ? 0 : KAMAE[1] * sp[KEN] * (1 - gate));
        const [df, dy] = roll(f.th);
        [f.x, f.y, f.z] = [f.px + fx * df, f.gy + SOLE + dy, f.pz + fz * df];
        f.w = 1 - gate * (1 - ease(Math.min(f.x0, 1 - f.x0) / 0.12));
        f.tw = ease(f.x0 * 10);
      } else {
        // Fly from where the foot left to where it will land, both measured from the pelvis: the
        // foot rides with the body and swings forward once the heel is up.
        const sw = clamp((u - f.dl) / (1 - f.dl + 1e-6));
        const [ax, az] = [(P.k * duty) / cadence, (1 - u) / cadence + (P.k * duty) / cadence];
        const [tx, tz] = [vx * ax + rx * s * P.lat, vz * ax + rz * s * P.lat];
        f.tg = ground(p.x + vx * az + rx * s * P.lat, p.z + vz * az + rz * s * P.lat);
        const [td, to] = [P.td * gate, P.to * gate];
        const e = ease((sw - 0.12) / 0.78);
        f.x = p.x + f.lx + (tx - f.lx) * e;
        f.z = p.z + f.lz + (tz - f.lz) * e;
        f.y =
          f.ly +
          (f.tg + SOLE + roll(td)[1] - f.ly) * ease(sw * 1.5) +
          P.lift * Math.sin(Math.PI * Math.pow(sw, 0.6));
        f.th = to + (td - to) * ease(sw) + 0.15 * Math.sin(Math.PI * sw);
        f.tw = 1 - ease(sw * 4);
        f.w = 0;
      }
    });
    grounded = walks;
    dirty = true;
    Object.assign(q, p);
    known = true;
  };

  /**
   * Places the hands and feet that touch the world, by two-bone IK over the pose built so far, as
   * much as their move has blended in: the hands on a ledge, a foot over its lip, the sole and the
   * hand on a wall, the lead foot and a hand of a slide. Elbows point back and out, knees ahead.
   */
  const reach = () => {
    const sw = (k: number) => sp[W + 2 * k];
    const { rot } = out;
    const [cs, sn] = [Math.cos(yaw), Math.sin(yaw)];
    /** The point `x` right, `z` back of `b` (the feet origin), at the height `y`. */
    const R = (x: number, y: number, z: number, b = at): Vec3 => [
      b[0] + x * cs + z * sn,
      y,
      b[2] + z * cs - x * sn,
    ];
    /** A direction: the same, from nowhere. */
    const D = (x: number, y: number, z: number) => R(x, y, z, [0, 0, 0]);
    const goals: [number, number, Vec3, Vec3, Quat][] = [];
    const { pos, rot: wr } = solve(out);
    const pel = pos[J.PELVIS];
    const hand = (s: number) => (s < 0 ? J.HAND_L : J.HAND_R);
    const foot = (s: number) => (s < 0 ? J.FOOT_L : J.FOOT_R);
    const flat = mul(axis(Y, yaw), axis(X, -0.2));
    const hang = clamp(sw(MOVE.HANG) + sw(MOVE.CLIMB));
    if (hang > 0.002) {
      const [gx, gz, nx, nz, e] = lip;
      const d = 0.4 + 0.14 * sp[UP];
      // The hands stay on the lip and, once the shoulders pass over it, slide in under them. The
      // body rises no higher than the arms let it: it is held there, the arms straight, until the
      // climb is over, then stands up fast.
      const ends = [-1, 1].map(s => {
        const a = pos[hand(s) - 2];
        const k = Math.max(d, (a[0] - gx) * nx + (a[2] - gz) * nz);
        const t: Vec3 = [gx + nx * k - nz * s * 0.21, e + 0.03, gz + nz * k + nx * s * 0.21];
        const h = (a[0] - t[0]) ** 2 + (a[2] - t[2]) ** 2;
        return [t, a[1] - t[1] - Math.sqrt(Math.max(((ARM + FORE) * 0.97) ** 2 - h, 0))] as const;
      });
      const drop = hang ** 4 * clamp(Math.max(...ends.map(c => c[1]))); // a metre at most
      out.at[1] -= drop;
      pos.forEach(q => (q[1] -= drop));
      [-1, 1].forEach((s, i) =>
        goals.push([hand(s), hang, ends[i][0], D(s * 0.8, 0, 0.6), frame([0, s, 0], [nx, 0, nz])]),
      );
      // The feet come up on the ledge, the left one when the hips are over its lip, and ahead of them as they go in.
      const pa = (pel[0] - gx) * nx + (pel[2] - gz) * nz;
      const f = Math.max(0.58, pa + 0.45);
      [-1, 1].forEach(s =>
        goals.push([
          foot(s),
          sw(MOVE.CLIMB) * (s < 0 ? clamp((pa - 0.25) * 4) : clamp(sp[UP] * 2 - 0.4)),
          [gx + nx * f - nz * s * 0.1, e + SOLE, gz + nz * f + nx * s * 0.1],
          [nx, 0.5, nz],
          frame([-nz, 0, nx], [0, -1, 0]),
        ]),
      );
    }
    [-1, 1].forEach(s => {
      const w = sw(s < 0 ? MOVE.WALL_L : MOVE.WALL_R);
      if (w > 0.002) {
        const [wx, wz] = wn;
        // Each foot on the wall in its stance, flat against it, and off it in the swing, the body
        // leaning out over them (the user, 2026-11-09); the far hand free.
        [s, -s].forEach((k, i) => {
          const u = (ph + 0.5 * i) % 1;
          const down = u < 0.55;
          const t = down ? u / 0.55 : (u - 0.55) / 0.45;
          const lift = down ? 0 : Math.sin(Math.PI * t);
          const z = (down ? 2 * t - 1 : 1 - 2 * ease(t)) * (i ? 0.4 : 0.3);
          goals.push([
            foot(k),
            w,
            R(s * (0.34 - 0.2 * lift), pel[1] - (i ? 0.62 : 0.52) + 0.3 * lift, z),
            D(-s * 0.7, 1, -1),
            slerp(flat, frame(cross([wx, 0, wz], D(0, 0, -1)), [wx, 0, wz]), 1 - lift),
          ]);
          const v = Math.cos(TAU * (ph + 0.5 * (1 - i)));
          goals.push([
            hand(k),
            w,
            i
              ? R(-s * 0.5, pel[1] + 0.3 + 0.12 * v, 0.2 * v)
              : R(s * 0.37, pel[1] + 0.3 + 0.05 * v, 0.1 * v),
            D(i ? -s * 0.7 : 0, i ? 0 : -0.5, 0.7),
            i ? frame([0, k, 0], D(0, 0, -1)) : frame([-k * wx, 0, -k * wz], D(0, 0, -1)),
          ]);
        });
      }
    });
    const slide = sw(MOVE.SLIDE);
    if (slide > 0.002) {
      // On the back hip: the right leg out ahead, the left foot flat by the hip, the left hand down behind.
      const y = at[1];
      goals.push(
        [J.FOOT_R, slide, R(0.12, y + SOLE + 0.14, -0.85, pel), D(0.1, 1, -0.3), flat],
        [J.FOOT_L, slide, R(-0.2, y + SOLE, -0.3, pel), D(-0.4, 1, -0.1), flat],
        [
          J.HAND_L,
          slide,
          R(-0.4, y + 0.03, 0.4, pel),
          D(-0.7, 0, 0.7),
          frame([0, -1, 0], D(-1, 0, 0)),
        ],
      );
    }
    const ride = clamp(sw(MOVE.RIDE));
    if (ride > 0.002 && sat) {
      // The feet in the footwell, the knees up; the driver's hands on the yoke, which turns with
      // the wheels.
      const q = mul(axis(Y, yaw), tipped(sat, ride));
      const S = (x: number, y: number, a: number): Vec3 =>
        lin(at as Vec3, 1, turn(q, [x, y, -a]), 1);
      const V = (x: number, y: number, a: number) => turn(q, [x, y, -a]);
      const flat = mul(q, axis(X, SIT.toes));
      [-1, 1].forEach(s =>
        goals.push([
          foot(s),
          ride,
          S(s * SIT.wide, SIT.ankle, SIT.ahead),
          V(s * 0.25, 1, 0.4),
          flat,
        ]),
      );
      const grip = frame(V(1, 0, 0), V(0, 0.35, 0.94));
      if (!sat.s) {
        grips(sat.steer).forEach(([x, y, a], i) =>
          goals.push([
            hand(i ? 1 : -1),
            ride,
            S(x, y, a - 0.075),
            V(i ? 0.7 : -0.7, -1, -0.2),
            grip,
          ]),
        );
      } else {
        // A rider's left hand lies on his thigh; the right one too with a weapon in it, its barrel
        // ahead, and holds the rail beside him without.
        const lap = frame(V(1, 0, 0), V(0, -0.25, 0.97));
        goals.push([J.HAND_L, ride, S(-0.13, 0.4, 0.2), V(-0.8, -0.4, -1), lap]);
        goals.push(
          armed
            ? [J.HAND_R, ride, S(0.15, 0.42, 0.22), V(0.8, -0.4, -1), lap]
            : [
                J.HAND_R,
                ride,
                S(0.27, 0.4, 0.22),
                V(0.6, -0.5, -1),
                frame(V(0, 0.3, 1), V(0.35, -0.5, 0.8)),
              ],
        );
      }
    }
    goals.forEach(([j, k, t, h, o]) => {
      const [a, arm, w] = [j - 2, j < J.THIGH_L, k * k];
      // The end and the bend of the limb as the pose built so far has them, moved toward the goal.
      const bend = lin(lin(pos[a + 1], 1, pos[a], -1), 1, turn(wr[a], [0, 0, arm ? 1 : -1]), 0.05);
      const [e, u] = [lin(pos[j], 1 - w, t, w), (v: Vec3) => unit(lin(v, 1, pos[a], -1))];
      const f = lin(unit(perp(bend, u(pos[j]))), 1 - w, unit(perp(h, u(t))), w);
      const [qa, qb] = arm ? limb(pos[a], e, f, ARM, FORE, -1) : limb(pos[a], e, f);
      // The upper arm's rest bone leans 0.1 rad off the vertical: turn it back before aiming.
      const ua = arm ? mul(qa, axis(Z, a == J.ARM_L ? 0.1 : -0.1)) : qa;
      rot[a] = mul(inv(wr[PARENT[a]]), ua);
      rot[a + 1] = mul(inv(ua), qb);
      rot[j] = slerp(rot[j], mul(inv(qb), o), w);
    });
  };

  const build = () => {
    const { rot } = out;
    const g = gate;
    const sw = (k: number) => sp[W + 2 * k];
    const [lean, bank, yo, dip, crouch] = [sp[LEAN], sp[BANK], sp[YAW], sp[DIP], sp[LOW]];
    const [c1, c2] = [Math.cos(TAU * ph), Math.cos(2 * TAU * ph)];
    // Positive turns about z lean to the left; negative about x lean forward.
    const side = Math.cos(TAU * (ph - (1 + duty) / 2));
    const obl = P.po * g * side;
    const tilt = P.pt + who[3] + P.pa * g * c2;
    const turn_ = (P.cc + P.pr) * g * c1;
    const idle = 1 - g;
    // In faster than out: a second harmonic leans the wave.
    const wave = TAU * BREATH[0] * time + who[1] * 5;
    const air = idle * (Math.sin(wave) + 0.25 * Math.sin(2 * wave));
    const breath = air * BREATH[1];
    const shift = idle * 0.012 * Math.sin(TAU * 0.17 * time + who[1] * 9);
    const ken = sp[KEN];
    const guard = idle * (bow * (1 - (1 - KAMAE[2]) * ken) + LOW_GUARD[2] * sp[BARE]);
    const hipX = P.sw * g * side + shift;
    out.at[0] = at[0];
    out.at[1] = at[1];
    out.at[2] = at[2];
    out.yaw = yaw;

    rot[J.PELVIS] = mul(
      mul(axis(Y, -P.pr * g * c1), axis(Z, obl + 0.4 * bank)),
      axis(X, -(tilt + 0.25 * (lean + guard) + 0.3 * crouch + 0.5 * dip)),
    );
    const body = tilt - 0.75 * (lean + guard) - 0.7 * crouch - 0.8 * dip;
    rot[J.SPINE] = mul(
      mul(axis(Y, 0.4 * turn_ - 0.25 * yo), axis(Z, 0.25 * bank - 0.8 * obl + 0.5 * shift)),
      axis(X, 0.45 * body + breath * 0.5),
    );
    rot[J.CHEST] = mul(
      mul(axis(Y, 0.6 * turn_ - 0.25 * yo), axis(Z, 0.25 * bank - 0.8 * obl - 0.5 * shift)),
      axis(X, 0.55 * body + breath),
    );
    const bare = idle * sp[BARE];
    [-1, 1].forEach(s => {
      const k = Math.cos(TAU * (ph - (s < 0 ? 0.5 : 0)));
      const a = who[s < 0 ? 1 : 2];
      // The fists' guard, breathing with the chest: the elbows open a little as it fills.
      const [lift, out2, inward, bend] = FISTS[s < 0 ? 1 : 0].map(v => v * bare);
      // The shoulders rise with the breath.
      // Not with a weapon in hand: a long gun's butt stays in the shoulder.
      rot[s < 0 ? J.CLAVICLE_L : J.CLAVICLE_R] = axis(Z, s * air * BREATH[2] * sp[BARE]);
      rot[s < 0 ? J.ARM_L : J.ARM_R] = mul(
        mul(
          axis(Z, s * (0.06 + P.ab * g + 0.5 * dip + out2 + 0.3 * breath)),
          axis(
            X,
            (P.am + P.aa * a * k) * g +
              0.05 * idle * s * Math.sin(time * 1.3) * (1 - sp[BARE]) +
              dip +
              0.5 * crouch +
              lift,
          ),
        ),
        axis(Y, s * inward),
      );
      rot[s < 0 ? J.FOREARM_L : J.FOREARM_R] = axis(
        X,
        0.15 * idle + g * (P.em + P.ea * k) + dip + 0.5 * crouch + bend - 0.8 * breath * sp[BARE],
      );
    });

    // Pelvis: as high as the stance legs allow, then the legs by IK.
    const R = axis(Y, yaw);
    const pw = mul(R, rot[J.PELVIS]);
    const [rx, rz] = [Math.cos(yaw), -Math.sin(yaw)];
    const base: Vec3 = [at[0] + rx * hipX, 0, at[2] + rz * hipX];
    const off = [J.THIGH_L, J.THIGH_R].map(j => turn(pw, REST[j]));
    const stand =
      1 -
      0.25 * crouch -
      0.7 * dip -
      (GIVE + KAMAE[3] * ken + LOW_GUARD[3] * sp[BARE]) * idle +
      (air * BREATH[3]) / LEG;
    const flight =
      at[1] +
      0.05 +
      SOLE +
      LEG * (stand - P.d0 - 0.6 * P.d1 * g) +
      P.hop * g * (0.5 - 0.5 * Math.cos(2 * TAU * ph - (2 * TAU * duty) / 2));
    const cand = feet.map((f, n) => {
      const [dx, dz] = [f.x - base[0] - off[n][0], f.z - base[2] - off[n][2]];
      const deficit = P.d0 + P.d1 * g * Math.sin(Math.PI * f.x0) + 1 - stand;
      const reach = Math.min(LEG * (1 - deficit), LEG * 0.99);
      const hip = f.y + Math.sqrt(Math.max(reach * reach - dx * dx - dz * dz, 0.04));
      return flight + (hip - off[n][1] - flight) * f.w;
    });
    // A pelvis that must drop does at once; one that rises is held back a moment, so that a foot
    // set free does not throw it up.
    const top = low(cand[0], cand[1], 0.05);
    const gap = time - built;
    built = time;
    if (gap > 0.1) {
      [sp[HY], sp[HY + 1]] = [top, 0];
    } else {
      damp(sp, HY, top, 30, gap);
    }
    base[1] = Math.min(top, sp[HY]);
    out.hips = [hipX, base[1] - at[1] - REST[0][1], 0];
    feet.forEach((f, n) => {
      const s = n ? 1 : -1;
      const hip: Vec3 = [base[0] + off[n][0], base[1] + off[n][1], base[2] + off[n][2]];
      const fy = yaw - s * who[4];
      const [a, b] = limb(hip, [f.x, f.y, f.z], [-Math.sin(fy), 0, -Math.cos(fy)]);
      const j = n ? J.THIGH_R : J.THIGH_L;
      rot[j] = mul(inv(pw), a);
      rot[j + 1] = mul(inv(a), b);
      rot[j + 2] = mul(inv(b), mul(axis(Y, fy), axis(X, f.th)));
      rot[j + 3] = axis(X, f.th < 0 ? -f.th * f.tw : 0);
    });

    // The other moves, laid over the stride.
    MOVES.forEach((c, k) => {
      const w = sw(k);
      if (w > 0.002) {
        // Along a wall the body leans well out (the user, 2026-11-09), less with the rail gun's bolt
        // going out, so that both hands keep it.
        const out2 = (k == MOVE.WALL_L || k == MOVE.WALL_R) && q.railed && q.zapping;
        const to = fk(out2 ? c.map((v, i) => (i == 2 ? v * 0.6 : v)) : c);
        const arms = k == MOVE.STUN;
        FK.slice(arms ? 3 : 0, arms ? 7 : 15).forEach(j => (rot[j] = slerp(rot[j], to[j], w)));
        if (!arms) {
          [c[13], c[0], c[12]].forEach((v, i) => (out.hips[i] += (v - out.hips[i]) * w));
        }
      }
    });
    const ride = clamp(sw(MOVE.RIDE));
    if (ride > 0.002 && sat) {
      // The seat leans with the rover: the pelvis, and all it carries, about the seat point.
      const tilt = tipped(sat, ride);
      rot[J.PELVIS] = mul(tilt, rot[J.PELVIS]);
      const d = sat.s ? 0 : ride;
      const h = turn(tilt, [out.hips[0], out.hips[1] + REST[0][1], out.hips[2] - SIT.reach * d]);
      out.hips = [h[0], h[1] - REST[0][1], h[2]];
      // The driver bends to the yoke; a rider turns his shoulders part of the way to where he looks.
      if (d) {
        [J.SPINE, J.CHEST].forEach(j => (rot[j] = mul(rot[j], axis(X, (-SIT.hunch * d) / 2))));
      } else if (sat.s) {
        const t = 0.3 * ride * clamp(arc(yaw, look), -1.3, 1.3);
        [J.SPINE, J.CHEST].forEach(j => (rot[j] = mul(rot[j], axis(Y, t))));
      }
    }
    const hang = sw(MOVE.HANG);
    if (hang > 0.002) {
      // A hang sways: the body swings about the hands, a metre above the pelvis, the legs a little more. The hands go back on the lip in `reach`.
      const [a, b] = [
        0.01 * Math.sin(TAU * (0.3 * time + who[5])),
        0.006 * Math.sin(TAU * (0.2 * time + 3 * who[5])),
      ].map(v => v * hang);
      rot[J.PELVIS] = mul(mul(axis(Z, b), axis(X, a)), rot[J.PELVIS]);
      [J.THIGH_L, J.THIGH_R].forEach(j => (rot[j] = mul(rot[j], axis(X, a))));
      out.hips[0] += b;
      out.hips[2] -= a;
    }
    const stun = sw(MOVE.STUN);
    if (stun) {
      // Reeling: the trunk is thrown the way the knock goes. The arms flail against each other, the shoulders sway.
      [J.SPINE, J.CHEST].forEach((j, i) => {
        const a = 0.3 + 0.1 * i;
        rot[j] = mul(rot[j], mul(axis(Z, -a * sp[KR]), axis(X, -a * sp[KA])));
      });
      const k = Math.sin(time * 13);
      [J.ARM_L, J.ARM_R].forEach((j, i) => (rot[j] = mul(rot[j], axis(X, stun * (i ? k : -k)))));
      rot[J.CHEST] = mul(rot[J.CHEST], axis(Y, 0.3 * stun * Math.sin(time * 8)));
    }
    reach();
    // Down: the knees buckle, then the body goes over about the pelvis onto the floor.
    const lie = ease((sw(MOVE.DOWN) - 0.35) / 0.65);
    if (lie) {
      rot[J.PELVIS] = mul(axis(X, -1.45 * lie), rot[J.PELVIS]);
      out.hips[1] += (0.21 - REST[0][1] - out.hips[1]) * lie;
      // The hips straighten as the body goes over, so that the legs trail behind it.
      [J.THIGH_L, J.THIGH_R].forEach(j => (rot[j] = mul(rot[j], axis(X, -1.25 * lie))));
      [J.ARM_L, J.ARM_R].forEach(j => (rot[j] = mul(rot[j], axis(X, -0.5 * lie))));
    }

    // The head holds the way the player looks, whatever the trunk does.
    const chest = mul(mul(R, rot[J.PELVIS]), mul(rot[J.SPINE], rot[J.CHEST]));
    // A neck turns so far: seated, the trunk does not follow the look.
    const aim = mul(
      axis(Y, ride > 0.5 ? yaw + clamp(arc(yaw, look), -1.3, 1.3) : look),
      axis(X, clamp(pitch, -1, 1) * 0.9),
    );
    const rel = mul(
      inv(chest),
      slerp(chest, aim, 0.85 * (1 - sw(MOVE.TUCK)) * (1 - 0.5 * stun) * (1 - sw(MOVE.DOWN))),
    );
    rot[J.NECK] = slerp([0, 0, 0, 1], rel, 0.4);
    rot[J.HEAD] = mul(inv(rot[J.NECK]), rel);
    dirty = false;
    return out;
  };

  return {
    update,
    pose: () => (dirty ? build() : out),
    get phase() {
      return ph;
    },
    get steps() {
      return steps;
    },
  };
};
