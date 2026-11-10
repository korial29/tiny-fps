// Ground that is not flat: a lattice of heights round the brushes, for the moon's crater floor.
// The host, the predictor and the drawing all read the same nodes: ground() is the plane of the
// lattice triangle over a point, and the scenery draws those triangles. No DOM, no Node API.
import type { World } from './world';

type Vec3 = [number, number, number];
type Quad = [number, number, number, number];

export interface ReliefDef {
  /** A rectangle with no relief, x0, z0, x1, z1: the brushes are the floor there and a gap between them stays open (the moon's rille). */
  hole: Quad;
  /** More of them, small: the notches in the rille's lips. Absent: none. */
  pits?: Quad[];
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
  /** The definition's pits and the box round them all (none: an empty box). */
  pits: Quad[];
  box: Quad;
  bound: Quad;
  /** The highest node: a ray above it meets no ground. */
  top: number;
}

/** Integer hash of a lattice point to [0, 1): the same on every engine. */
export const hash = (x: number, y: number, s: number): number => {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 144665)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Smooth value noise on the integer lattice, in [0, 1): flat across every lattice line, so a fold along one leaves no crease. */
export const noise = (x: number, y: number, s: number): number => {
  const [i, j] = [Math.floor(x), Math.floor(y)];
  const [u, v] = [x - i, y - j].map(t => t * t * (3 - 2 * t));
  const h = (a: number, b: number) => hash(i + a, j + b, s);
  return (h(0, 0) * (1 - u) + h(1, 0) * u) * (1 - v) + (h(0, 1) * (1 - u) + h(1, 1) * u) * v;
};

const made = new WeakMap<ReliefDef, Relief>();

/** Builds the lattice over the box of the bound, once per definition. */
export const raise = (def: ReliefDef): Relief => {
  const old = made.get(def);
  if (old) {
    return old;
  }
  const { hole, bound, cell, at, pits = [] } = def;
  const box = pits.reduce<Quad>(
    (b, q) => [
      Math.min(b[0], q[0]),
      Math.min(b[1], q[1]),
      Math.max(b[2], q[2]),
      Math.max(b[3], q[3]),
    ],
    [Infinity, Infinity, -Infinity, -Infinity],
  );
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
  const r = { x0, z0, cell, nx, nz, h, hole, pits, box, bound, top };
  made.set(def, r);
  return r;
};

/**
 * The height of the ground at (x, z), or -Infinity where there is none: a world without relief,
 * inside the hole and inside a pit. Each lattice square is two triangles split from node (i, j) to (i + 1, j + 1).
 */
export const ground = (w: World, x: number, z: number): number => {
  const r = w.relief;
  // A pit's edge has no ground either: two pits side by side leave no line to walk between them.
  const pit = (q: Quad) => x >= q[0] && x <= q[2] && z >= q[1] && z <= q[3];
  if (
    !r ||
    (x > r.hole[0] && x < r.hole[2] && z > r.hole[1] && z < r.hole[3]) ||
    (pit(r.box) && r.pits.some(pit))
  ) {
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
 * sphere of that radius. Sampled every MARCH metres: a crest thinner than that is missed. The
 * stretch over the hole is skipped: a ray that stays in the arena costs no sample.
 */
export const trace = (w: World, o: Vec3, d: Vec3, max: number, grow = 0): number => {
  const r = w.relief;
  if (!r || Math.min(o[1], o[1] + d[1] * max) - grow > r.top) {
    return max;
  }
  // Where the ray is over the hole, from t0 to t1 (the slabs of its rectangle).
  let [t0, t1] = [0, max];
  for (const a of [0, 1]) {
    const [p, v, lo, hi] = [o[a * 2], d[a * 2], r.hole[a], r.hole[a + 2]];
    if (v) {
      const [m, n] = [(lo - p) / v, (hi - p) / v];
      t0 = Math.max(t0, Math.min(m, n));
      t1 = Math.min(t1, Math.max(m, n));
    } else if (p <= lo || p >= hi) {
      t1 = -1;
    }
  }
  const over = (t: number): number =>
    o[1] + d[1] * t - grow - ground(w, o[0] + d[0] * t, o[2] + d[2] * t);
  if (!d[0] && !d[2]) {
    // Straight down (or up): one height.
    const h = over(0);
    return h < 0 ? 0 : d[1] < 0 ? Math.min(max, h / -d[1]) : max;
  }
  // The stretches outside the hole: the whole ray, or what is before and after the hole.
  for (const [from, to] of t0 < t1
    ? [
        [0, t0],
        [t1, max],
      ]
    : [[0, max]]) {
    if (from < to && over(from) < 0) {
      return from;
    }
    for (let t = from; t < to; t += MARCH) {
      const next = Math.min(t + MARCH, to);
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
  }
  return max;
};
