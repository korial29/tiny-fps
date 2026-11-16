// The xenomorph's glory kill as drawn (the user, 2026-11-16: it climbs onto its prey and eats his
// head; then its legs on the floor, its head just by his): after its dash it lunges into him and
// stands up against him, its claws over his shoulders, rears its head back and bites; he bends back
// under it, his hands up against its chest. After the kill it lets go of him as he falls. Poses only: the host still holds the two a metre apart and
// nothing of it is on the wire. Pure, no DOM.
import { GLORY_TICKS } from '../shared/constants';
import { reach } from './body';
import { basis, mix } from './mesh';
import type { Vec3 } from './mesh';
import { JOINT as J, axis, mul, solve } from './rig';
import type { Pose } from './rig';

export const FEAST = {
  /** The tick of the lock its lunge starts on (its dash is over at GLORY_DASH, 20), and the ticks it takes. */
  LEAP: [18, 18],
  /** Seconds it takes to let go of him after the kill. */
  DROP: 0.45,
  /** Its pelvis in front of his feet, toward it, metres: its feet stay on the floor (the user, 2026-11-16). */
  CLING: 0.5,
  /** The tip back of its pelvis that stands its bent back up against him, radians. */
  UPRIGHT: 0.2,
  /** Its claws over his shoulders: across, toward it (negative: behind his front), and up. */
  CLAWS: [0.19, -0.08, 1.52],
  /** His bend back under its weight, spine to head (radians), and how far his hips sink (metres). */
  BEND: [0.16, 0.2, 0.12, 0.22],
  SINK: 0.1,
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
 * to him, stood up and up against him, its legs as they were on the floor, its claws over his
 * shoulders.
 */
export const seize = (pose: Pose, prey: Vec3, m: number): Pose => {
  if (m <= 0) {
    return pose;
  }
  const [yaw, f, r] = facing(pose.at, prey);
  const rot = pose.rot.slice();
  rot[J.PELVIS] = mul(rot[J.PELVIS], axis(X, FEAST.UPRIGHT * m));
  const q: Pose = { ...pose, yaw: pose.yaw + wrap(yaw - pose.yaw) * m, rot };
  // The whole of it, feet and all, from where it is up to him.
  const pelvis = solve(q).pos[J.PELVIS];
  const want = off(prey, r, f, 0, -FEAST.CLING, 0);
  q.at = [q.at[0] + (want[0] - pelvis[0]) * m, q.at[1], q.at[2] + (want[2] - pelvis[2]) * m];
  const claws = FEAST.CLAWS;
  for (const [side, arm] of [
    [-1, J.ARM_L],
    [1, J.ARM_R],
  ]) {
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
 * bent back with his hips sunk, his feet where they were, his hands up against its chest.
 */
export const clutched = (pose: Pose, eater: Vec3, m: number): Pose => {
  if (m <= 0) {
    return pose;
  }
  const [yaw, f, r] = facing(pose.at, eater);
  const rot = pose.rot.slice();
  FEAST.BEND.forEach((a, i) => (rot[J.SPINE + i] = mul(rot[J.SPINE + i], axis(X, a * m))));
  const q: Pose = { ...pose, yaw: pose.yaw + wrap(yaw - pose.yaw) * m, rot };
  const feet = solve(q);
  q.hips = [q.hips[0], q.hips[1] - FEAST.SINK * m, q.hips[2]];
  for (const [side, thigh, arm] of [
    [-1, J.THIGH_L, J.ARM_L],
    [1, J.THIGH_R, J.ARM_R],
  ]) {
    // Each foot back where it stood, the knee bent ahead.
    reach(q, solve(q), thigh, feet.pos[thigh + 2], f);
    const push = FEAST.PUSH;
    limb(
      q,
      arm,
      off(pose.at, r, f, side * push[0], push[1], push[2]),
      off([0, 0, 0], r, f, side, -0.3, -1),
      m,
    );
  }
  return q;
};
