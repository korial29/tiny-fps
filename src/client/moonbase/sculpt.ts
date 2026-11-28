// Helpers for the hall's statues (eagle.ts, ram.ts): a frame on top of a plinth and the shapes they
// are carved from, balls, rods, flat pieces seen from both sides and lofts through outlines.
import type { Brush } from '../../shared/world';
import { capsule, dress, place, segment } from '../mesh';
import { face } from '../brick';
import type { Vec3 } from '../mesh';
import type { Out } from '../verts';

const BALL = dress(capsule(0, [1, 1], 10, [1, 1]), [1, 1, 1]);
const SMALL = dress(capsule(0, [1, 1], 6, [1, 1]), [1, 1, 1]);
export const ROD = dress(capsule(1, [1, 1], 6, [0, 0]), [1, 1, 1]);
export const CONE = dress(capsule(1, [1, 0], 6, [0, 0]), [1, 1, 1]);

/**
 * The tools to carve a statue standing on top of the box b, facing -z: P(a, y, b) is a across (+x),
 * y over the box's top and b forward.
 */
export const sculpt = (o: Out, { min, max }: Brush) => {
  const [x, z, top] = [(min[0] + max[0]) / 2, (min[2] + max[2]) / 2, max[1]];
  const P = (a: number, y: number, b: number): Vec3 => [x + a, top + y, z - b];
  const axes: Vec3[] = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, -1],
  ];
  /** An ellipsoid at (a, y, b), r its radii across, up and forward; `small` with fewer sides. */
  const ball = (a: number, y: number, b: number, r: Vec3, rgb: number[], small = false) =>
    place(o, small ? SMALL : BALL, P(a, y, b), axes, [0, 0, 0], r, rgb);
  /** A rod (or a cone) from p to q, r its radius. */
  const limb = (p: number[], q: number[], r: number, rgb: number[], mesh = ROD) =>
    segment(o, mesh, P(p[0], p[1], p[2]), P(q[0], q[1], q[2]), [1, 0, 0], 1, r, rgb);
  /** A flat convex piece, its points as (a, y, b), seen from both sides. */
  const both = (pts: number[][], rgb: number[]) => {
    const q = pts.map(p => P(p[0], p[1], p[2]));
    const c = [0, 1, 2].map(i => q.reduce((s, p) => s + p[i], 0) / q.length);
    const [u, v] = [q[1].map((w, j) => w - q[0][j]), q[2].map((w, j) => w - q[0][j])];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    face(o, q, rgb, c.map((w, i) => w + n[i]) as Vec3);
    face(o, q, rgb, c.map((w, i) => w - n[i]) as Vec3);
  };
  /**
   * A solid through outlines (each points as (a, y, b), the same count, round its own axis), its
   * sides facing out from each outline's middle, capped at both ends; `rgb` may vary by side.
   */
  const loft = (rings: number[][][], rgb: (side: number, ring: number) => number[]) => {
    const w = rings.map(r => r.map(p => P(p[0], p[1], p[2])));
    const mid = w.map(r => [0, 1, 2].map(i => r.reduce((s, p) => s + p[i], 0) / r.length) as Vec3);
    for (let r = 0; r + 1 < w.length; r++) {
      const c = mid[r].map((v, i) => (v + mid[r + 1][i]) / 2) as Vec3;
      const n = w[r].length;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        face(o, [w[r][i], w[r][j], w[r + 1][j], w[r + 1][i]], rgb(i, r), c);
      }
    }
    for (const [r, toward] of [
      [0, 1],
      [w.length - 1, w.length - 2],
    ]) {
      face(o, w[r], rgb(0, r), mid[toward]);
    }
  };
  return { P, ball, limb, both, loft };
};
