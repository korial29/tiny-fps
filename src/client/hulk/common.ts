import { ZED } from '../../shared/beach';
import type { Piece } from '../../shared/beach';
import { hash, noise } from '../../shared/relief';
import { TEX } from '../../shared/types';
import { SHINE, place } from '../mesh';
import type { Vec3 } from '../mesh';
import { CANOPY, HULL } from '../paint';
import { SAND } from '../shore';
import type { V, Mat } from './types';

export const tex = (l: number, k = 1, s = 1, r?: boolean): Mat => ({ l, c: [k], s, r });
export const ink = (c: V, k = 1, l = -1): Mat => ({ l, c: c.map(v => v * k), s: 1 });

export const MID = ZED / 2;
export const WHITE = ink([0.68, 0.69, 0.71], 1, HULL);
export const SKIN = WHITE;
export const GIRDER = tex(TEX.STEEL, 0.45);
export const PLATE = tex(TEX.METAL, 0.7);
export const SOOT = ink([0.03, 0.03, 0.035]);
export const IRON = ink([0.13, 0.135, 0.15]);
export const STRIPE = [0.8, 0.3, 0.04];
export const BELT = ink([1, 0.36, 0.05], 1, HULL);
export const GLASS = ink([0.03, 0.06, 0.09], 1, SHINE);
/** The canopy's glass: the shader's own layer, drawn blended (paint.ts); no colour of its own here. */
export const PANE = ink([0, 0, 0], 1, CANOPY);
/** Dry sand, as shore.ts paints it. */
export const DUNE = ink([0.64, 0.59, 0.48], 1, SAND);
/** An emergency lamp's glow. */
export const LAMP = ink([1, 0.62, 0.25], 1, -2);
export const DOWN = [0, -99, 0];

export const sm = (t: number) => {
  t = Math.min(Math.max(t, 0), 1);
  return t * t * (3 - 2 * t);
};
export const sub = (a: V, b: V) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const cross = (a: V, b: V) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const unit = (a: V) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const mid = (a: V, b: V) => a.map((v, i) => (v + b[i]) / 2);
/** `a` moved by k times `d`. */
export const off = (a: V, d: V, k = 1) => a.map((v, i) => v + d[i] * k);
/** A rectangle across two axes: corner `i` of 4 picks a or b on each. */
export const QUAD = [0, 1, 3, 2];

/** What is being drawn. */
export let o: number[] = [];
/** The sand's height. */
export let gy = (_x: number, _z: number) => 0;

export const put = (p: V, n: V, m: Mat, k: number) => {
  if (m.l < 0) {
    o.push(p[0], p[1], p[2], n[0], n[1], n[2], m.c[0] * k, m.c[1] * k, m.l, m.c[2] * k);
  } else {
    // A texture runs in world metres on the plane the face is nearest, as on a brush.
    const [u, v] =
      Math.abs(n[1]) > 0.7 ? [p[0], p[2]] : Math.abs(n[0]) > 0.7 ? [p[2], p[1]] : [p[0], p[1]];
    const [a, b] = m.r ? [v, u] : [u, v];
    o.push(p[0], p[1], p[2], n[0], n[1], n[2], a * m.s, b * m.s, m.l, Math.min(m.c[0] * k, 1.99));
  }
};

/** A flat face, a fan from its first corner, turned away from the point `c`; `k` dims it, or each corner. */
export const face = (q: V[], m: Mat, c: V, k: number | number[] = 1) => {
  let n = [0, 0, 0];
  q.forEach((a, i) => {
    const b = q[(i + 1) % q.length];
    n = off(n, [
      (a[1] - b[1]) * (a[2] + b[2]),
      (a[2] - b[2]) * (a[0] + b[0]),
      (a[0] - b[0]) * (a[1] + b[1]),
    ]);
  });
  if (Math.hypot(n[0], n[1], n[2]) < 1e-9) {
    return;
  }
  n = unit(n);
  const d = sub(mid(q[0], q[2]), c);
  if (n[0] * d[0] + n[1] * d[1] + n[2] * d[2] < 0) {
    n = n.map(v => -v);
  }
  for (let i = 1; i < q.length - 1; i++) {
    for (const j of [0, i, i + 1]) {
      put(q[j], n, m, typeof k == 'number' ? k : k[j]);
    }
  }
};

/** The skin between two lines of as many points, away from `c` (toward it with `inv`): `m` each strip's material, or none; ka and kb the points' light. */
export const loft = (
  a: V[],
  b: V[],
  m: (j: number) => Mat | undefined,
  c: V,
  ka?: number[],
  kb = ka,
  inv = false,
) => {
  for (let j = 0; j < a.length - 1; j++) {
    const mat = m(j);
    if (mat) {
      face(
        [a[j], a[j + 1], b[j + 1], b[j]],
        mat,
        inv ? off(a[j], sub(a[j], c)) : c,
        ka && kb ? [ka[j], ka[j + 1], kb[j + 1], kb[j]] : 1,
      );
    }
  }
};

/** A box's faces, less those of `skip` (a bit each: 1 and 2 across x, 4 the bottom, 8 the top, 16 and 32 across z). */
export const box = (a: V, b: V, m: Mat, top = m, skip = 4) => {
  const c = mid(a, b);
  for (let i = 0; i < 6; i++) {
    if (!((skip >> i) & 1)) {
      const [x, p, q] = [i >> 1, ((i >> 1) + 1) % 3, ((i >> 1) + 2) % 3];
      face(
        QUAD.map(e => {
          const v = [0, 0, 0];
          [v[x], v[p], v[q]] = [(i & 1 ? b : a)[x], (e & 1 ? b : a)[p], (e & 2 ? b : a)[q]];
          return v;
        }),
        i == 3 ? top : m,
        c,
      );
    }
  }
};

/** A beam from a to b, w across and h deep. */
export const bar = (a: V, b: V, w: number, m: Mat, h = w) => {
  const d = unit(sub(b, a));
  const s = unit(cross(d, Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]));
  const u = cross(s, d);
  const [p, q] = [a, b].map(e =>
    QUAD.map(i => off(off(e, s, ((i & 1) - 0.5) * w), u, ((i >> 1) - 0.5) * h)),
  );
  const c = mid(a, b);
  loft([...p, p[0]], [...q, q[0]], () => m, c);
  face(p, m, c);
  face(q, m, c);
};

/** Torn metal: n teeth on the edge a to b, each reaching as far as `d` at most, turned away from `c`. */
export const teeth = (a: V, b: V, d: V, n: number, m: Mat, k = 1, c = DOWN) => {
  for (let i = 0; i < n; i++) {
    const [p, q] = [off(a, sub(b, a), i / n), off(a, sub(b, a), (i + 1) / n)];
    face([p, q, off(mid(p, q), d, 0.3 + 0.7 * hash(i, a[0] * 7 + a[2] * 3 + a[1], 11))], m, c, k);
  }
};

/** A box with its upright edges cut by `cut`, grown by `grow`: its sides, lit `k` at the foot and at the top, and its top in `top`. */
export const prism = (a: V, b: V, cut: number, m: Mat, top?: Mat, grow = 0, k = [1, 1]) => {
  const [x0, x1, z0, z1] = [a[0] - grow, b[0] + grow, a[2] - grow, b[2] + grow];
  const ring = (y: number) =>
    [
      [x0 + cut, z0],
      [x1 - cut, z0],
      [x1, z0 + cut],
      [x1, z1 - cut],
      [x1 - cut, z1],
      [x0 + cut, z1],
      [x0, z1 - cut],
      [x0, z0 + cut],
      [x0 + cut, z0],
    ].map(([x, z]) => [x, y, z]);
  const [p, q] = [ring(a[1]), ring(b[1])];
  loft(
    p,
    q,
    () => m,
    mid(a, b),
    p.map(() => k[0]),
    p.map(() => k[1]),
  );
  if (top) {
    face(q.slice(1), top, a);
  }
};

/** Sand blown against the foot of a box that stands in the dry beach. */
export const drift = ({ min: a, max: b }: Piece) => {
  const c = mid(a, b);
  if (gy(c[0], c[2]) < 0.3 || a[1] > gy(c[0], c[2])) {
    return;
  }
  const at = (i: number, out: number) => {
    const [x, z] = [(i + 1) & 2 ? b[0] + out : a[0] - out, i & 2 ? b[2] + out : a[2] - out];
    const g = gy(x, z);
    return [
      x,
      g + (out ? -0.04 : Math.min(0.12 + 0.35 * hash(i % 4, c[0] + c[2], 5), b[1] - g)),
      z,
    ];
  };
  for (let i = 0; i < 4; i++) {
    const q = [at(i, 0), at(i + 1, 0), at(i + 1, 0.9), at(i, 0.9)];
    face(
      q,
      DUNE,
      DOWN,
      q.map(p => 0.92 + 0.16 * noise(p[0] / 11, p[2] / 11, 5)),
    );
  }
};

/** A model of mesh.ts set at `at`, its length (-z) along `f`, level: `k` its scale across, up and along. */
export const stand = (src: number[], at: V, f: V, k: V = [1, 1, 1]) =>
  place(o, src, at as Vec3, [[-f[2], 0, f[0]], [0, 1, 0], f as Vec3], [0, 0, 0], k as Vec3);
/** A module cannot reassign another's `let`: what is being drawn. */
export const setO = (v: number[]) => {
  o = v;
};
/** The sand's height. */
export const setGy = (v: (x: number, z: number) => number) => {
  gy = v;
};
