import { SWIM_SPEED } from '../../shared/constants';
import { JOINT as J, axis, mul, slerp } from '../rig';
import type { Quat } from '../rig';
import type { Seat } from './types';
import { TAU, X, Z, clamp, ease } from './maths';

/**
 * The gaits, as numbers at three speeds: a walk at 1.4 m/s, a run at 5 and a sprint at 9, linear
 * between, held beyond. Angles in radians, lengths in metres. Real running: cadence and stride
 * both grow with speed, the foot lands nearer the body and leaves higher, the knees bend deeper in
 * stance and swing, the elbows fold to a right angle and beyond.
 */
export const SPEEDS = [1.4, 5, 9];
export const GAITS = {
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
  po: [0.07, 0.08, 0.07],
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
  sw: [0.025, 0.018, 0.012],
  hop: [0, 0.02, 0.025],
};
export type Key = keyof typeof GAITS;

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
  /** The xenomorph on a wall (MODE.CLING): facing it, the hands and the feet on it (`reach`). */
  CLING: 12,
  /** Swimming (MODE.SWIM): prone on the water, a breaststroke (see STROKE). */
  SWIM: 13,
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
  [0, 0.15, 0, 1, 1.4, 1, 1.4, 2.6, 0.5, 2.6, 0.5, 0.35, 0, 0],
  // Swimming: the glide, which is also the stroke's start (see STROKE).
  [0.1, 0.15, 0, 0.1, 0.1, 0.1, 0.1, 3, 0.1, 3, 0.1, 0.12, 0, 0],
];

/**
 * The breaststroke, a row of MOVES (the prone body: SWIM_PITCH, the pelvis tipped forward, so a
 * shoulder at 3 points the arm ahead and a hip at 0 trails the leg behind) at each of six evenly
 * spaced keys of the cycle: the arms reaching ahead, the pull (swept out and back, elbows bent), the
 * legs drawn up with the hands joined under the chin, the kick with the arms shooting ahead and
 * straight into the next pull. The cycle is a closed Catmull-Rom curve through them, so no joint
 * ever stops at a key, and the arms hold no glide.
 */
/** How far the pelvis tips forward for a body lying prone on the water (radians). */
export const SWIM_PITCH = 1.3;

const STROKE: number[][] = [
  [0.1, 0.15, 0, 0.1, 0.1, 0.1, 0.1, 3, 0.1, 3, 0.1, 0.12, 0, 0],
  [0.1, 0.1, 0, 0.25, 0.5, 0.25, 0.5, 2.2, 0.9, 2.2, 0.9, 0.8, 0, 0],
  [0.09, 0.05, -0.03, 0.7, 1.4, 0.7, 1.4, 1.9, 1.6, 1.9, 1.6, 0.55, 0, 0],
  [0.09, 0.05, 0, 0.9, 1.9, 0.9, 1.9, 2.4, 1.9, 2.4, 1.9, 0.25, 0, 0],
  [0.1, 0.12, 0.03, 0.3, 0.7, 0.3, 0.7, 2.9, 0.6, 2.9, 0.6, 0.15, 0, 0],
  [0.11, 0.14, 0, 0.12, 0.2, 0.12, 0.2, 3, 0.15, 3, 0.15, 0.12, 0, 0],
];

/** Strokes per second at a speed (m/s): never still, a treading water's slow one up to one every 1.2 s. */
export const strokeRate = (v: number): number => 0.4 + 0.45 * clamp(v / SWIM_SPEED);

/** How much of the full stroke a speed gets (the rest is treading water): all of it from 2/3 of the top speed. */
export const strokeShare = (v: number): number => clamp((v / SWIM_SPEED) * 1.5);

/**
 * Fills `row` with the swimmer's pose at phase `u` (0 to 1): the stroke, `m` of the way from a
 * treading water (arms sculling in turn, the legs fluttering, the body bobbing) to it.
 */
export const stroke = (row: number[], u: number, m: number): number[] => {
  const n = STROKE.length;
  const x = u * n;
  const i = Math.floor(x) % n;
  const t = x - Math.floor(x);
  const [k0, k1, k2, k3] = [-1, 0, 1, 2].map(d => STROKE[(i + d + n) % n]);
  const sin = (f: number, o = 0) => Math.sin(TAU * (u * f + o));
  const tread = [
    0.1 + 0.04 * sin(1),
    0.2,
    0.05 * sin(1, 0.25),
    0.25 + 0.2 * sin(2),
    0.6 + 0.3 * sin(2, 0.1),
    0.25 + 0.2 * sin(2, 0.5),
    0.6 + 0.3 * sin(2, 0.6),
    2.4 + 0.3 * sin(1),
    1.2 + 0.4 * sin(1, 0.2),
    2.4 + 0.3 * sin(1, 0.5),
    1.2 + 0.4 * sin(1, 0.7),
    0.5 + 0.2 * sin(1, 0.1),
    0,
    0,
  ];
  for (let j = 0; j < row.length; j++) {
    const full =
      0.5 *
      (2 * k1[j] +
        (k2[j] - k0[j]) * t +
        (2 * k0[j] - 5 * k1[j] + 4 * k2[j] - k3[j]) * t * t +
        (3 * k1[j] - k0[j] - 3 * k2[j] + k3[j]) * t * t * t);
    // The body rolls a little with the stroke and rides up and down on it.
    row[j] = tread[j] + (full - tread[j]) * m;
  }
  row[0] += 0.03 * Math.sin(TAU * u * 2);
  row[2] += 0.05 * m * Math.sin(TAU * u);
  return row;
};
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
export const FK = [
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
export const fk = (c: number[]): Quat[] => {
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
export const IDENT: Quat = [0, 0, 0, 1];

/**
 * The falls of one put down shot or struck (FALL, less one), keys of the seconds since he went
 * down: the pelvis's tip (forward or back) and roll to the side, its height over the floor and how
 * far it has gone along the throw (metres), the bend of the hips and the knees, the arms' lift
 * forward and out, the elbows' bend, the spine's slump. Shot: thrown off his feet along the hit,
 * flat on his back or his face, the arms flung out; struck: down on his knees, a sway, then over
 * on his side, curled.
 */
export const FALLS = [
  [
    [0, 0, 0, 0.98, 0, 0, 0.1, 0.2, 0.2, 0.3, 0],
    [0.12, 0.35, 0, 1.05, 0.35, 0.5, 0.6, 1.2, 0.6, 0.6, 0.3],
    [0.45, 1.57, 0, 0.3, 1.4, 0.6, 0.5, 1, 1, 0.5, 0],
    [0.55, 1.57, 0, 0.18, 1.55, 0.1, 0.2, 0.5, 1.2, 0.3, 0],
    [0.65, 1.5, 0, 0.25, 1.62, 0.05, 0.15, 0.3, 1.25, 0.3, 0],
    [0.9, 1.57, 0, 0.16, 1.66, 0, 0.08, 0.1, 1.3, 0.2, 0],
  ],
  [
    [0, 0, 0, 0.98, 0, 0, 0.1, 0.1, 0.2, 0.3, 0],
    [0.3, 0.25, 0, 0.55, 0, 0.25, 1.55, 0.1, 0.15, 0.3, 0.3],
    [0.6, 0.3, 0.12, 0.53, 0, 0.3, 1.55, 0.15, 0.15, 0.4, 0.3],
    [1.1, 0.1, 1.57, 0.17, 0, 1, 1.4, 0.7, 0.3, 0.6, 0.2],
  ],
];
/** The farthest a shot throws a body, metres: no further than the floor goes on at his height. */
export const THROW = 1.6;

/** The keys K at the time t, eased from one to the next. */
export const keyed = (K: number[][], t: number): number[] => {
  let i = 1;
  while (i < K.length - 1 && K[i][0] < t) {
    i++;
  }
  const [a, b] = [K[i - 1], K[i]];
  return a.map((v, j) => v + (b[j] - v) * ease((t - a[0]) / (b[0] - a[0])));
};

/** The rover's lean in the frame of its yaw, `k` of the way: the nose up by its pitch, the right side down by its roll (basis() in mesh.ts). */
export const tipped = (s: Seat, k: number): Quat =>
  slerp(IDENT, mul(axis(X, s.pitch), axis(Z, -s.roll)), k);
