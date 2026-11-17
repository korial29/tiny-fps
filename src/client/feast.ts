// The xenomorph's glory kill as drawn (the user, 2026-11-16: it climbs onto its prey and eats his
// head; not as high as his chest, its head over his, its knees bent as knees bend): after its dash
// it lunges into him and climbs a little on him, its feet on his thighs, its claws over his
// shoulders, leaning over his head, rears its head back and bites; he bends back under it, his
// hands up against its chest. After the kill it lets go of him as he falls. Poses only: the host
// still holds the two a metre apart and nothing of it is on the wire. Pure, no DOM.
import { CUTS, EXEC, GLORY_TICKS } from '../shared/constants';
import { CUT } from '../shared/types';
import { BITE, reach } from './body';
import { basis, mix } from './mesh';
import type { Vec3 } from './mesh';
import { JOINT as J, axis, mul, solve } from './rig';
import type { Pose } from './rig';

export const FEAST = {
  /** The tick of the lock its lunge starts on (its dash is over at GLORY_DASH, 20), and the ticks it takes. */
  LEAP: [18, 18],
  /** Seconds it takes to let go of him after the kill. */
  DROP: 0.45,
  /** Its pelvis in front of his feet, toward it, and how far it climbs, metres: a little, its head over his (the user, 2026-11-16). */
  CLING: 0.5,
  LIFT: 0.35,
  /** The tip back of its pelvis that stands its bent back up against him, radians. */
  UPRIGHT: 0.05,
  /** Its feet on the front of his thighs: across from his middle, toward it, and up; its knees forward and apart, as a knee bends. */
  FEET: [0.17, 0.22, 0.6],
  /** Its claws over his shoulders: across, toward it (negative: behind his front), and up. */
  CLAWS: [0.19, -0.08, 1.52],
  /** His bend back under its weight, spine to head (radians), and how far his hips sink (metres). */
  BEND: [0.16, 0.2, 0.12, 0.22],
  SINK: 0.1,
  /** His head thrown about in panic: the most it turns (radians) left and right, up and down, and over. */
  PANIC: [0.55, 0.35, 0.3],
  /**
   * His body fighting it (the user, 2026-11-16): the jerk back as it seizes him (radians, at the
   * middle of its lunge), then his chest twisting and his trunk rocking (radians), his hands shoving (metres).
   */
  STARTLE: 0.35,
  STRUGGLE: [0.3, 0.12, 0.07],
  /** Its head shaken left and right as it eats (the user, 2026-11-16): the most it turns (radians) and how often (Hz). */
  CHEW: [0.32, 6],
  /** Drops of blood a second from his head as it eats, and in the burst when his head goes. */
  GORE: [110, 40],
  /** His hands against its chest: across, toward it, and up. */
  PUSH: [0.16, 0.34, 1.58],
} as const;

const clamp = (v: number) => Math.min(Math.max(v, 0), 1);
const ease = (u: number) => u * u * (3 - 2 * u);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const X: Vec3 = [1, 0, 0];

/** How far onto its prey the xenomorph is with `lock` ticks of its glory kill left: 0 on its feet, 1 on him. */
export const mounted = (lock: number): number =>
  ease(clamp((GLORY_TICKS - lock - FEAST.LEAP[0]) / FEAST.LEAP[1]));

/** Where `at` is from the other one, `to`: the yaw that faces him, the unit way to him, its right. */
const facing = (at: Vec3, to: Vec3): [number, Vec3, Vec3] => {
  const yaw = Math.atan2(-(to[0] - at[0]), -(to[2] - at[2]));
  const [right, , fwd] = basis(yaw, 0);
  return [yaw, fwd, right];
};

/** The point `side` across, `toward` along `f` and `up` over the floor from `o`. */
const off = (o: Vec3, r: Vec3, f: Vec3, side: number, toward: number, up: number): Vec3 => [
  o[0] + r[0] * side + f[0] * toward,
  o[1] + up,
  o[2] + r[2] * side + f[2] * toward,
];

/** The pose's limb from `j` (thigh or upper arm) onto `to`, the share `m` of the way from where it is. */
const limb = (q: Pose, j: number, to: Vec3, pole: Vec3, m: number) => {
  const s = solve(q);
  reach(q, s, j, mix(s.pos[j + 2], to, m), pole);
};

/**
 * The xenomorph's `pose` on its prey, whose feet are at `prey`, by the share `m` (mounted()): turned
 * to him and up on him, its feet on his thighs, its claws over his shoulders, leaning over his head.
 */
export const seize = (pose: Pose, prey: Vec3, m: number): Pose => {
  if (m <= 0) {
    return pose;
  }
  const [yaw, f, r] = facing(pose.at, prey);
  const rot = pose.rot.slice();
  rot[J.PELVIS] = mul(rot[J.PELVIS], axis(X, FEAST.UPRIGHT * m));
  const q: Pose = { ...pose, yaw: pose.yaw + wrap(yaw - pose.yaw) * m, rot };
  // The whole of it from where it is up to him, and up on him.
  const pelvis = solve(q).pos[J.PELVIS];
  const want = off(prey, r, f, 0, -FEAST.CLING, 0);
  q.at = [0, 1, 2].map(i => q.at[i] + (i == 1 ? FEAST.LIFT : want[i] - pelvis[i]) * m) as Vec3;
  const [feet, claws] = [FEAST.FEET, FEAST.CLAWS];
  for (const [side, thigh, arm] of [
    [-1, J.THIGH_L, J.ARM_L],
    [1, J.THIGH_R, J.ARM_R],
  ]) {
    limb(
      q,
      thigh,
      off(prey, r, f, side * feet[0], -feet[1], feet[2]),
      off([0, 0, 0], r, f, 0.6 * side, 1, 0.4),
      m,
    );
    // The elbows out and back.
    limb(
      q,
      arm,
      off(prey, r, f, side * claws[0], -claws[1], claws[2]),
      off([0, 0, 0], r, f, side, -0.5, -0.4),
      m,
    );
  }
  return q;
};

/**
 * The prey's `pose` under the xenomorph whose feet are at `eater`, by the share `m`: turned to it,
 * bent back with his hips sunk, his feet where they were, his hands up against its chest, jerked
 * back as it seizes him, then fighting it, his head thrown about in panic, at `t` seconds (the
 * user, 2026-11-16).
 */
export const clutched = (pose: Pose, eater: Vec3, m: number, t = 0): Pose => {
  if (m <= 0) {
    return pose;
  }
  const [yaw, f, r] = facing(pose.at, eater);
  const rot = pose.rot.slice();
  FEAST.BEND.forEach((a, i) => (rot[J.SPINE + i] = mul(rot[J.SPINE + i], axis(X, a * m))));
  const [tw, rk, shove] = FEAST.STRUGGLE.map(a => a * m);
  rot[J.SPINE] = mul(
    rot[J.SPINE],
    mul(
      axis(X, FEAST.STARTLE * Math.sin(Math.PI * m)),
      axis([0, 0, 1], rk * Math.sin(4.3 * t + 1)),
    ),
  );
  rot[J.CHEST] = mul(
    rot[J.CHEST],
    axis([0, 1, 0], tw * (0.6 * Math.sin(5.7 * t) + 0.4 * Math.sin(9.1 * t + 2))),
  );
  // Each way at its own pace, so it never repeats the same jerk.
  const [yw, pt, rl] = FEAST.PANIC.map(a => a * m);
  rot[J.HEAD] = mul(
    rot[J.HEAD],
    mul(
      axis([0, 1, 0], yw * (0.7 * Math.sin(11.3 * t) + 0.3 * Math.sin(17.9 * t + 1))),
      mul(axis(X, pt * Math.sin(8.7 * t + 2)), axis([0, 0, 1], rl * Math.sin(6.1 * t + 4))),
    ),
  );
  const q: Pose = { ...pose, yaw: pose.yaw + wrap(yaw - pose.yaw) * m, rot };
  const feet = solve(q);
  q.hips = [q.hips[0], q.hips[1] - FEAST.SINK * m, q.hips[2]];
  for (const [side, thigh, arm] of [
    [-1, J.THIGH_L, J.ARM_L],
    [1, J.THIGH_R, J.ARM_R],
  ]) {
    // Each foot back where it stood, the knee bent ahead.
    reach(q, solve(q), thigh, feet.pos[thigh + 2], f);
    // Each hand shoving at its own time.
    const push = FEAST.PUSH;
    const jab = shove * Math.max(Math.sin(7.9 * t + (side - 1) * 1.7), 0);
    limb(
      q,
      arm,
      off(pose.at, r, f, side * push[0], push[1] + jab, push[2] + 0.4 * jab),
      off([0, 0, 0], r, f, side, -0.3, -1),
      m,
    );
  }
  return q;
};

/**
 * How hard the xenomorph eats, 0 to 1: from its strike (BITE[1]) to the kill with `lock` ticks
 * left, then `mount` as it lets go of him (lock 0).
 */
export const eating = (lock: number, mount: number): number =>
  lock ? +(GLORY_TICKS - lock >= BITE[1]) * mount : mount;

/** The xenomorph's `pose` with its head shaken left and right, `a` of the way (eating()), at `t` seconds. */
export const chew = (pose: Pose, a: number, t: number): Pose => {
  if (a <= 0) {
    return pose;
  }
  const rot = pose.rot.slice();
  const w = 2 * Math.PI * FEAST.CHEW[1] * t;
  rot[J.NECK] = mul(rot[J.NECK], axis([0, 1, 0], 0.4 * FEAST.CHEW[0] * a * Math.sin(w - 0.6)));
  rot[J.HEAD] = mul(rot[J.HEAD], axis([0, 1, 0], FEAST.CHEW[0] * a * Math.sin(w)));
  return { ...pose, rot };
};

/**
 * The katana's execution as drawn (EXEC, the user 2026-11-17): its victim turns to the swordsman as
 * he dashes in (TURN ticks), drops to his knees on the strike of the cut down (KNEEL: from that tick,
 * over so many), his trunk bowed and his head down (BOW, radians) and his hips LOW metres lower;
 * the swordsman spins a whole turn into the cut across, ending on its strike (SPIN); on the cut down
 * a spurt of WOUND drops of blood, and when his head goes NECK drops, then BLEED a second from the
 * neck for BLEEDING seconds.
 */
export const EXECUTE = {
  TURN: 8,
  KNEEL: [EXEC.CUTS[0] + CUTS[CUT.SLASH].strike, 10],
  BOW: [0.3, 0.35],
  LOW: 0.45,
  SPIN: [EXEC.CUTS[1], CUTS[CUT.RIGHT].strike],
  WOUND: 25,
  NECK: 45,
  BLEED: 60,
  BLEEDING: 0.8,
} as const;

/** Ticks into the execution with `lock` ticks of it left. */
const into = (lock: number) => EXEC.TICKS - lock;

/** How far down on his knees its victim is with `lock` ticks left, 0 to 1. */
export const kneeling = (lock: number): number =>
  ease(clamp((into(lock) - EXECUTE.KNEEL[0]) / EXECUTE.KNEEL[1]));

/** How far the swordsman has spun into his cut across with `lock` ticks left, radians (a whole turn at its strike). */
export const spun = (lock: number): number =>
  2 * Math.PI * ease(clamp((into(lock) - EXECUTE.SPIN[0]) / EXECUTE.SPIN[1]));

/**
 * The victim's `pose` before the swordsman whose feet are at `killer`, with `lock` ticks of the
 * execution left: turned to him, then on his knees (his feet behind them on the floor), bowed, his
 * head down.
 */
export const kneel = (pose: Pose, killer: Vec3, lock: number): Pose => {
  const [turn, k] = [clamp(into(lock) / EXECUTE.TURN), kneeling(lock)];
  const [yaw, f] = facing(pose.at, killer);
  const rot = pose.rot.slice();
  rot[J.CHEST] = mul(rot[J.CHEST], axis(X, -EXECUTE.BOW[0] * k));
  rot[J.NECK] = mul(rot[J.NECK], axis(X, -EXECUTE.BOW[1] * k));
  const q: Pose = { ...pose, yaw: pose.yaw + wrap(yaw - pose.yaw) * turn, rot };
  if (k <= 0) {
    return q;
  }
  q.hips = [q.hips[0], q.hips[1] - EXECUTE.LOW * k, q.hips[2]];
  for (const thigh of [J.THIGH_L, J.THIGH_R]) {
    // The foot behind the hip, flat on the floor; the knee forward, down on it.
    const s = solve(q);
    const hip = s.pos[thigh];
    const to: Vec3 = [hip[0] - f[0] * 0.42, q.at[1] + 0.1, hip[2] - f[2] * 0.42];
    reach(q, s, thigh, mix(s.pos[thigh + 2], to, k), f);
  }
  return q;
};
