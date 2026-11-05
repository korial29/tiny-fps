// The human rig shared by the own body and the other runners: named joints in a tree, their rest
// offsets for a 1.8 m runner, a pose as local rotations, and the forward kinematics that turn a
// pose into joint positions and axes. The skin (skin.ts) and the animation (gait.ts) build on it.
import type { Vec3 } from './mesh';

/** A unit quaternion, x, y, z, w. */
export type Quat = [number, number, number, number];

/**
 * Joints, parents before children. Rest pose: standing, arms down a little away from the body,
 * facing -z (yaw 0), +x to the runner's right, y up, feet on y = 0.
 */
export const JOINT = {
  PELVIS: 0,
  SPINE: 1,
  CHEST: 2,
  NECK: 3,
  HEAD: 4,
  CLAVICLE_L: 5,
  ARM_L: 6,
  FOREARM_L: 7,
  HAND_L: 8,
  CLAVICLE_R: 9,
  ARM_R: 10,
  FOREARM_R: 11,
  HAND_R: 12,
  THIGH_L: 13,
  SHIN_L: 14,
  FOOT_L: 15,
  TOE_L: 16,
  THIGH_R: 17,
  SHIN_R: 18,
  FOOT_R: 19,
  TOE_R: 20,
} as const;

export const JOINTS = Object.keys(JOINT).length;

/** The parent of each joint, -1 for the pelvis (the root). */
export const PARENT = [-1, 0, 1, 2, 3, 2, 5, 6, 7, 2, 9, 10, 11, 0, 13, 14, 15, 0, 17, 18, 19];

/** Each joint's offset from its parent in the rest pose, metres; the pelvis's from the feet origin. */
export const REST: Vec3[] = [
  [0, 0.98, 0],
  [0, 0.12, 0],
  [0, 0.2, 0],
  [0, 0.22, 0],
  [0, 0.1, 0],
  [-0.04, 0.17, 0],
  [-0.15, 0, 0],
  [-0.03, -0.29, 0],
  [0, -0.26, 0],
  [0.04, 0.17, 0],
  [0.15, 0, 0],
  [0.03, -0.29, 0],
  [0, -0.26, 0],
  [-0.1, -0.05, 0],
  [0, -0.44, 0],
  [0, -0.43, 0],
  [0, -0.04, -0.13],
  [0.1, -0.05, 0],
  [0, -0.44, 0],
  [0, -0.43, 0],
  [0, -0.04, -0.13],
];

/** A pose: where the runner stands, how it faces, and each joint's rotation from its rest. */
export interface Pose {
  /** The feet origin in the world (the player's position). */
  at: Vec3;
  yaw: number;
  /** Offset of the pelvis from its rest place, in the runner's frame (a crouch lowers it). */
  hips: Vec3;
  /** Local rotation of each joint, relative to its rest, in its parent's frame. */
  rot: Quat[];
}

export const IDENTITY: Quat = [0, 0, 0, 1];

/** The rest pose at `at`, facing `yaw`. */
export const rest = (at: Vec3 = [0, 0, 0], yaw = 0): Pose => ({
  at,
  yaw,
  hips: [0, 0, 0],
  rot: Array.from({ length: JOINTS }, () => [...IDENTITY] as Quat),
});

/** a then b: the rotation b applied in a's frame. */
export const mul = ([ax, ay, az, aw]: Quat, [bx, by, bz, bw]: Quat): Quat => [
  aw * bx + ax * bw + ay * bz - az * by,
  aw * by - ax * bz + ay * bw + az * bx,
  aw * bz + ax * by - ay * bx + az * bw,
  aw * bw - ax * bx - ay * by - az * bz,
];

/** The rotation of `angle` radians about the unit `axis`. */
export const axis = ([x, y, z]: Vec3, angle: number): Quat => {
  const s = Math.sin(angle / 2);
  return [x * s, y * s, z * s, Math.cos(angle / 2)];
};

/** v turned by q. */
export const turn = (q: Quat, [x, y, z]: Vec3): Vec3 => {
  const [qx, qy, qz, qw] = q;
  const [tx, ty, tz] = [2 * (qy * z - qz * y), 2 * (qz * x - qx * z), 2 * (qx * y - qy * x)];
  return [
    x + qw * tx + qy * tz - qz * ty,
    y + qw * ty + qz * tx - qx * tz,
    z + qw * tz + qx * ty - qy * tx,
  ];
};

/** Spherical blend of two rotations, t in [0, 1]. */
export const slerp = (a: Quat, b: Quat, t: number): Quat => {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const s = d < 0 ? -1 : 1;
  d *= s;
  if (d > 0.9995) {
    const q = a.map((v, i) => v + (s * b[i] - v) * t) as Quat;
    const n = Math.hypot(...q);
    return q.map(v => v / n) as Quat;
  }
  const th = Math.acos(d);
  const [u, w] = [Math.sin((1 - t) * th), Math.sin(t * th) * s];
  const k = 1 / Math.sin(th);
  return a.map((v, i) => (v * u + b[i] * w) * k) as Quat;
};

/** Every joint's world position and world rotation for the pose. */
export const solve = (p: Pose): { pos: Vec3[]; rot: Quat[] } => {
  const pos: Vec3[] = [];
  const rot: Quat[] = [];
  const root = axis([0, 1, 0], p.yaw);
  for (let j = 0; j < JOINTS; j++) {
    const up = PARENT[j];
    const base = up < 0 ? root : rot[up];
    rot[j] = mul(base, p.rot[j]);
    const off = j === 0 ? (REST[0].map((v, i) => v + p.hips[i]) as Vec3) : REST[j];
    const o = turn(base, off);
    const from = up < 0 ? p.at : pos[up];
    pos[j] = [from[0] + o[0], from[1] + o[1], from[2] + o[2]];
  }
  return { pos, rot };
};
