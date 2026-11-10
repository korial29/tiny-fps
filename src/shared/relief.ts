// Ground that is not flat: a lattice of heights round the brushes, for the moon's crater floor.
// The host, the predictor and the drawing all read the same nodes: ground() is the plane of the
// lattice triangle over a point, and the scenery draws those triangles. No DOM, no Node API.
import type { World } from './world';

type Vec3 = [number, number, number];
type Quad = [number, number, number, number];

export interface ReliefDef {
  /** The arena, x0, z0, x1, z1: no relief inside, the brushes are the floor there and a gap between them stays open. */
  hole: Quad;
  /** The edge nobody crosses, an ellipse: its centre x, z and its half axes along x and z. */
  bound: Quad;
  /** Metres between two nodes. */
  cell: number;
  /**
   * The height of the ground at a node. Only + - * /, Math.sqrt and integer hashes: Math.sin and **
   * round differently from one engine to the next, and every side must build the same lattice.
   */
  at: (x: number, z: number) => number;
}

/** The lattice built from a ReliefDef: node (i, j) is at (x0 + i * cell, z0 + j * cell), its height h[i + j * nx]. */
export interface Relief {
  x0: number;
  z0: number;
  cell: number;
  nx: number;
  nz: number;
  h: Float32Array;
  hole: Quad;
  bound: Quad;
  /** The highest node: a ray above it meets no ground. */
  top: number;
}

/** Builds the lattice over the box of the bound. */
export const raise = ({ hole, bound, cell, at }: ReliefDef): Relief => {
  const [cx, cz, a, b] = bound;
  const x0 = Math.floor((cx - a) / cell) * cell;
  const z0 = Math.floor((cz - b) / cell) * cell;
  const nx = Math.ceil((cx + a - x0) / cell) + 1;
  const nz = Math.ceil((cz + b - z0) / cell) + 1;
  const h = new Float32Array(nx * nz);
  let top = -Infinity;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      h[i + j * nx] = at(x0 + i * cell, z0 + j * cell);
      top = Math.max(top, h[i + j * nx]);
    }
  }
  return { x0, z0, cell, nx, nz, h, hole, bound, top };
};

/**
 * The height of the ground at (x, z), or -Infinity where there is none: a world without relief,
 * and inside the hole. Each lattice square is two triangles split from node (i, j) to (i + 1, j + 1).
 */
export const ground = (w: World, x: number, z: number): number => {
  const r = w.relief;
  if (!r || (x > r.hole[0] && x < r.hole[2] && z > r.hole[1] && z < r.hole[3])) {
    return -Infinity;
  }
  const u = Math.min(Math.max((x - r.x0) / r.cell, 0), r.nx - 1);
  const v = Math.min(Math.max((z - r.z0) / r.cell, 0), r.nz - 1);
  const i = Math.min(Math.floor(u), r.nx - 2);
  const j = Math.min(Math.floor(v), r.nz - 2);
  const [fu, fv] = [u - i, v - j];
  const n = i + j * r.nx;
  const [a, b, c, d] = [r.h[n], r.h[n + 1], r.h[n + r.nx], r.h[n + r.nx + 1]];
  return fu >= fv ? a + (b - a) * fu + (d - b) * fv : a + (c - a) * fv + (d - c) * fu;
};

/** Keeps a body inside the bound: put back on the ellipse, its speed out of it taken away. */
export const bound = (p: { x: number; z: number; vx: number; vz: number }, w: World): void => {
  if (!w.relief) {
    return;
  }
  const [cx, cz, a, b] = w.relief.bound;
  const [dx, dz] = [(p.x - cx) / a, (p.z - cz) / b];
  const k = dx * dx + dz * dz;
  if (k <= 1) {
    return;
  }
  const s = 1 / Math.sqrt(k);
  p.x = cx + dx * s * a;
  p.z = cz + dz * s * b;
  // The ellipse's normal there.
  const [nx, nz] = [(dx * s) / a, (dz * s) / b];
  const out = (p.vx * nx + p.vz * nz) / (nx * nx + nz * nz);
  if (out > 0) {
    p.vx -= out * nx;
    p.vz -= out * nz;
  }
};

/** Metres between two samples of a ray, and the halvings that then close in on the ground. */
const MARCH = 1;
const HALVINGS = 6;

/**
 * Distance along the ray from o in the unit direction d to the ground, at most max: for ray(),
 * after the brushes. A ray that starts under the ground hits at 0. With `grow`, the path of a
 * sphere of that radius. Sampled every MARCH metres: a crest thinner than that is missed.
 */
export const trace = (w: World, o: Vec3, d: Vec3, max: number, grow = 0): number => {
  const r = w.relief;
  if (!r || Math.min(o[1], o[1] + d[1] * max) - grow > r.top) {
    return max;
  }
  const over = (t: number): number =>
    o[1] + d[1] * t - grow - ground(w, o[0] + d[0] * t, o[2] + d[2] * t);
  if (over(0) < 0) {
    return 0;
  }
  if (!d[0] && !d[2]) {
    // Straight down (or up): one height.
    return d[1] < 0 ? Math.min(max, over(0) / -d[1]) : max;
  }
  for (let t = 0; t < max; t += MARCH) {
    const next = Math.min(t + MARCH, max);
    if (over(next) < 0) {
      let [lo, hi] = [t, next];
      for (let n = 0; n < HALVINGS; n++) {
        const mid = (lo + hi) / 2;
        if (over(mid) < 0) {
          hi = mid;
        } else {
          lo = mid;
        }
      }
      return lo;
    }
  }
  return max;
};
