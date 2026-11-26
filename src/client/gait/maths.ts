import type { Vec3 } from '../mesh';
import type { Quat } from '../rig';

export const TAU = Math.PI * 2;
export const [X, Y, Z]: Vec3[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
/** Thigh and shin, and the ankle above the floor when the foot is flat. */
export const [THIGH, SHIN, SOLE] = [0.44, 0.43, 0.06];
/** Upper arm and forearm (the rest offsets of the elbow and the wrist). */
export const [ARM_M, FORE_M] = [0.2915, 0.26];
export const LEG = THIGH + SHIN;
export const clamp = (v: number, lo = 0, hi = 1) => Math.min(Math.max(v, lo), hi);
export const ease = (v: number) => (v = clamp(v)) * v * (3 - 2 * v);
export const arc = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
export const inv = (q: Quat): Quat => [-q[0], -q[1], -q[2], q[3]];
/** Per player and per number, in [0, 1). */
export const rnd = (id: number, n: number) => {
  const x = Math.sin(id * 78.233 + n * 37.719) * 43758.5453;
  return x - Math.floor(x);
};
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
/** p a + q b. */
export const lin = (a: Vec3, p: number, b: Vec3, q = 0) =>
  a.map((v, i) => v * p + b[i] * q) as Vec3;
export const unit = (a: Vec3) => lin(a, 1 / (Math.hypot(...a) || 1), a);
/** The part of `v` across the unit vector `u`. */
export const perp = (v: Vec3, u: Vec3) => lin(v, 1, u, -(v[0] * u[0] + v[1] * u[1] + v[2] * u[2]));
/** Smooth minimum: the lower of two, rounded over a band of k. */
export const low = (a: number, b: number, k: number) => {
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
export const limb = (h: Vec3, t: Vec3, f: Vec3, a_ = THIGH, b_ = SHIN, k = 1): [Quat, Quat] => {
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
export const roll = (t: number): [number, number] => {
  const [a, d] = [Math.abs(t), t > 0 ? 0.07 : 0.13];
  const [s, c] = [Math.sin(a), Math.cos(a)];
  return [(t > 0 ? -1 : 1) * (d * (1 - c) + SOLE * s), SOLE * (c - 1) + d * s];
};
