import { BEACH, CABIN, ZED } from '../../shared/beach';
import { tints } from '../../shared/world';
import type { Piece } from '../../shared/beach';
import { hash, noise } from '../../shared/relief';
import { TEX } from '../../shared/types';
import { SHINE, place } from '../mesh';
import type { Vec3 } from '../mesh';
import { CANOPY, HULL } from '../paint';
import { SAND } from '../shore';
import type { V, Mat } from './types';

export const tex = (l: number, k = 1, s = 1, r?: boolean): Mat => ({ l, c: [k], s, r });
/** The palette's slots of Landfall's tints: first after white, whatever brushes the renderer adds. */
const SLOTS = tints(BEACH).map(String);
/** A texture tinted `tint`, one of the world's (CABIN): its light k, s tiles a metre. */
export const tinted = (l: number, tint: V, k = 1, s = 1): Mat => ({
  ...tex(l, k, s),
  t: Math.max(0, SLOTS.indexOf(`${tint}`)),
});
export const ink = (c: V, k = 1, l = -1): Mat => ({ l, c: c.map(v => v * k), s: 1 });

export const MID = ZED / 2;
export const WHITE = ink([0.48, 0.49, 0.51], 1, HULL);
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
/**
 * An airliner's cabin (the user, 2026-11-27): the walls and ceilings one light grey, in painted
 * 1 m panels, a dark blue-grey carpet, and the edges of the panels and floors a mid grey. The thin
 * edges round the holes and the small parts in flat paint (FLAT): a texture's fine lines
 * shimmered on them.
 */
export const WALL = tex(TEX.PAINT, 1.37);
export const CEIL = WALL;
export const FLAT = ink([1.3, 1.33, 1.38]);
/** A ceiling, facing down: lit only by the light bounced from below, dim and blue, so as strong as a texture's light goes. */
export const UNDER = tex(TEX.PAINT, 1.99);
export const TRIM = ink([0.42, 0.43, 0.45]);
export const CARPET = tinted(TEX.FABRIC, CABIN.carpet, 1, 2);
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
    o.push(
      p[0],
      p[1],
      p[2],
      n[0],
      n[1],
      n[2],
      a * m.s,
      b * m.s,
      m.l,
      Math.min(m.c[0] * k, 1.99) + 2 * (m.t ?? 0),
    );
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

/** Bare metal, where a torn sheet shows its back. */
export const RAW = tex(TEX.STEEL, 0.6);

/**
 * Torn metal: n petals on the edge a to b, each reaching as far as `d` at most, turned away from
 * `c`. A petal is a sheet torn in two rows: its root on the edge, a shoulder pinched in by a
 * random share, a ragged tip (one point, two, or a fork), curled on toward the side `d` already
 * leans and twisted a little about its length. Its face is `m` lit `k`, darker toward the tip;
 * its back, a centimetre behind, is bare metal (glass has none).
 */
export const teeth = (a: V, b: V, d: V, n: number, m: Mat, k = 1, c = DOWN, back = RAW) => {
  // Red's and blue's twins tear alike: the seed is the same either side of the line.
  const seed = a[0] * 7 + Math.abs(a[2] - MID) * 3 + a[1];
  const h = (i: number, j: number) => hash(i, seed + j * 1.37, 11 + j);
  const along = sub(b, a);
  const reach = Math.hypot(d[0], d[1], d[2]);
  // The sheet's side away from c, and the way the petals curl: on, the way d leans off the edge's plane.
  let nrm = unit(cross(along, d));
  const out = sub(mid(a, b), c);
  if (nrm[0] * out[0] + nrm[1] * out[1] + nrm[2] * out[2] < 0) {
    nrm = nrm.map(v => -v);
  }
  const lean = Math.sign(nrm[0] * d[0] + nrm[1] * d[1] + nrm[2] * d[2]) || 1;
  const w = 1 / n;
  for (let i = 0; i < n; i++) {
    // Petals of uneven width: their roots overlap or leave a notch between them.
    const t0 = (i + 0.3 * (h(i, 0) - 0.5) * (i > 0 ? 1 : 0)) * w;
    const t1 = (i + 1 + 0.3 * (h(i + 1, 0) - 0.5) * (i < n - 1 ? 1 : 0)) * w;
    const s = 0.3 + 0.7 * h(i, 1);
    const curl = lean * reach * (0.15 + 0.5 * h(i, 2));
    const twist = (h(i, 3) - 0.5) * 0.5 * reach;
    // A point of the petal: u across it (0 to 1), v along its reach (0 to 1).
    const at = (u: number, v: number) =>
      off(
        off(off(a, along, t0 + (t1 - t0) * u), d, s * v),
        nrm,
        curl * v * v * s + twist * (u - 0.5) * v * s,
      );
    const pinch = [0.08 + 0.3 * h(i, 4), 0.92 - 0.3 * h(i, 5)];
    const v1 = 0.35 + 0.25 * h(i, 6);
    const tip = h(i, 7);
    const outline: number[][] = [
      [0, 0],
      [1, 0],
      [pinch[1], v1],
      ...(tip < 0.45
        ? [[0.25 + 0.5 * h(i, 8), 1]]
        : tip < 0.8
          ? [
              [0.55 + 0.3 * h(i, 8), 0.75 + 0.25 * h(i, 9)],
              [0.15 + 0.3 * h(i, 9), 1],
            ]
          : [
              [0.7 + 0.2 * h(i, 8), 1],
              [0.5, 0.55 + 0.15 * h(i, 9)],
              [0.1 + 0.2 * h(i, 9), 0.9],
            ]),
      [pinch[0], v1 + 0.1 * (h(i, 10) - 0.5)],
    ];
    const pts = outline.map(([u, v]) => at(u, v));
    const lit = outline.map(([, v]) => k * (1 - 0.45 * v));
    // A fan from the root's first corner, which sees the whole outline, forked tips too.
    for (let j = 1; j < pts.length - 1; j++) {
      const tri = [pts[0], pts[j], pts[j + 1]];
      const kk = [lit[0], lit[j], lit[j + 1]];
      face(tri, m, c, kk);
      // Glass has no back of its own: the canopy's layer shows from both sides.
      if (m.l != CANOPY) {
        face(
          tri.map(p => off(p, nrm, -0.012)),
          back,
          off(pts[0], nrm, 9),
          kk.map(v => Math.min(1, 0.5 + v)),
        );
      }
    }
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

/** How far a drift runs out from its box's foot, metres; and its rings across that, its points round each corner. */
const [REACH, RINGS, ARC] = [1.3, 3, 3];

/**
 * Sand blown against the foot of a box that stands in the dry beach: a soft bank all round it,
 * its height over the sand set by the distance to the box's footprint (so it rounds the corners)
 * and falling to the sand with a smoothstep, level at both ends, so it shows no crease against
 * the box nor where it meets the beach. Its height wanders round the box; its normals are the
 * bank's own, smooth from one strip to the next.
 */
export const drift = ({ min: a, max: b }: Piece) => {
  const c = mid(a, b);
  const g0 = gy(c[0], c[2]);
  if (g0 < 0.3 || a[1] > g0) {
    return;
  }
  const s = c[0] + c[2];
  /** The bank's crest against the box at (x, z), under the box's top. */
  const crest = (x: number, z: number) =>
    Math.min(0.1 + 0.3 * noise(x / 1.6 + s, z / 1.6, 5), b[1] - g0 - 0.04);
  const y = (x: number, z: number) => {
    const d = Math.hypot(Math.max(a[0] - x, 0, x - b[0]), Math.max(a[2] - z, 0, z - b[2]));
    // A touch under the sand at its rim, which hides the seam.
    return gy(x, z) + (crest(x, z) + 0.05) * (1 - sm(d / REACH)) - 0.05;
  };
  const normal = (x: number, z: number) =>
    unit([y(x - 0.05, z) - y(x + 0.05, z), 0.1, y(x, z - 0.05) - y(x, z + 0.05)]);
  // Round the footprint: each corner's arc of ARC + 1 outward directions, the sides split every 1.5 m.
  const foot: [number, number, number, number][] = [];
  const corners = [
    [b[0], a[2]],
    [b[0], b[2]],
    [a[0], b[2]],
    [a[0], a[2]],
  ];
  corners.forEach(([x, z], i) => {
    for (let j = 0; j <= ARC; j++) {
      const t = ((i - 1 + j / ARC) * Math.PI) / 2;
      foot.push([x, z, Math.cos(t), Math.sin(t)]);
    }
    const [nx, nz] = corners[(i + 1) % 4];
    const n = Math.ceil(Math.hypot(nx - x, nz - z) / 1.5);
    const [ox, oz] = [Math.cos((i * Math.PI) / 2), Math.sin((i * Math.PI) / 2)];
    for (let j = 1; j < n; j++) {
      foot.push([x + ((nx - x) * j) / n, z + ((nz - z) * j) / n, ox, oz]);
    }
  });
  const ring = (r: number) =>
    foot.map(([x, z, dx, dz]) => {
      const [px, pz] = [x + dx * r, z + dz * r];
      return {
        p: [px, y(px, pz), pz],
        n: normal(px, pz),
        k: 0.92 + 0.16 * noise(px / 11, pz / 11, 5),
      };
    });
  let inner = ring(0);
  for (let r = 1; r <= RINGS; r++) {
    // Closer rings near the box, where the bank turns over.
    const outer = ring(REACH * (r / RINGS) ** 1.3);
    for (let i = 0; i < foot.length; i++) {
      const j = (i + 1) % foot.length;
      for (const v of [inner[i], inner[j], outer[j], inner[i], outer[j], outer[i]]) {
        put(v.p, v.n, DUNE, v.k);
      }
    }
    inner = outer;
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
