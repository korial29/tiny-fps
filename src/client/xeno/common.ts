import { TAU } from '../../shared/physics';
import { cross } from '../helmet';
import type { Spot } from '../helmet';
import { unit } from '../mesh';
import type { Vec3 } from '../mesh';
import { turn } from '../rig';
import type { Quat } from '../rig';

/**
 * Its chitin: a near black with a cold sheen, one colour from the skull to the tail: a lighter head
 * drew a collar's line round the neck.
 */
export const CHITIN_X = [0.06, 0.065, 0.078];

/** Sides round a piece at each level of detail (far, near, the own body, close), by how fine it is. */
export const SIDES = [
  [3, 4, 5, 6],
  [3, 5, 7, 9],
  [4, 6, 9, 12],
];

/** A point of a piece in the frame (at, q) of its joint. */
export const on = (at: Vec3, q: Quat, v: Vec3): Vec3 => {
  const w = turn(q, v);
  return [at[0] + w[0], at[1] + w[1], at[2] + w[2]];
};

/** A ring of `n` spots round `c` square to the unit `tan`, `side` steadying it, of radius `r`. */
export const ring = (c: Vec3, tan: Vec3, side: Vec3, r: number, n: number): Spot[] => {
  const a = unit(cross(tan, side));
  const b = cross(a, tan);
  return Array.from({ length: n }, (_, i) => {
    const [cs, sn] = [Math.cos((i / n) * TAU), Math.sin((i / n) * TAU)];
    const m: Vec3 = [a[0] * cs + b[0] * sn, a[1] * cs + b[1] * sn, a[2] * cs + b[2] * sn];
    return [[c[0] + m[0] * r, c[1] + m[1] * r, c[2] + m[2] * r], m];
  });
};

/** A solved skeleton (solve() in rig.ts): each joint's place and turn in the world. */
export interface Solved {
  pos: Vec3[];
  rot: Quat[];
}

/** A point of the column: where, out of the back (a unit vector), and how thick. */
export type Bone = [p: Vec3, up: Vec3, r: number];

export const mix3 = (a: Vec3, b: Vec3, k: number): Vec3 => [
  a[0] + (b[0] - a[0]) * k,
  a[1] + (b[1] - a[1]) * k,
  a[2] + (b[2] - a[2]) * k,
];
export const far = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/**
 * A smooth curve through `pts` (Catmull-Rom), three more points between each two; `mid(i, u)` is
 * what else a point carries, `u` of the way from point i to the next.
 */
export const smooth = <T>(pts: Vec3[], mid: (i: number, u: number) => T): [Vec3, T][] =>
  pts.flatMap((b, i) => {
    const [a, c, d] = [pts[i - 1] ?? b, pts[i + 1], pts[i + 2] ?? pts[i + 1]];
    return c
      ? [0, 0.25, 0.5, 0.75].map((u): [Vec3, T] => {
          const [u2, u3] = [u * u, u * u * u];
          const w = [-u3 + 2 * u2 - u, 3 * u3 - 5 * u2 + 2, -3 * u3 + 4 * u2 + u, u3 - u2];
          return [
            [0, 1, 2].map(j => (a[j] * w[0] + b[j] * w[1] + c[j] * w[2] + d[j] * w[3]) / 2) as Vec3,
            mid(i, u),
          ];
        })
      : [[b, mid(i, 0)]];
  });
