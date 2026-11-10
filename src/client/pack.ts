// The life support pack of the moon's space suit (the user, 2026-11-10: one big breathing hose
// instead of two, to a big pack on the back as real astronauts wear): a tall box strapped on the
// back of the chest, and one ribbed hose from under the helmet's right ear plate, out over the shoulder, to the pack's top.
// The pack is built once per level of detail in the chest joint's frame (rest pose, metres, +z the
// back); the hose is built each frame between the head and the chest, which move apart.
import { TAU } from '../shared/physics';
import { GLOW, glow } from './flag';
import { cross, loft, pow, quad, shrunk, sub, unit } from './helmet';
import { GLOSS, STRIDE, aim, place } from './mesh';
import type { Vec3 } from './mesh';
import { turn } from './rig';
import type { Quat } from './rig';

/**
 * The pack's body in the chest joint's frame (at 1.30 m; the back of the trunk is about 0.12
 * behind it), its front sunk a little in the back: its centre, half width, height and depth, and how square its corners are.
 */
export const PACK = { c: [0, -0.03, 0.17] as Vec3, r: [0.155, 0.25, 0.095] as Vec3, e: 8 };

/** The hose: where it leaves the helmet (the head joint's frame) and the way it goes, where it enters the pack (the chest's) and its way in, its radius. */
export const HOSE = {
  from: [0.118, -0.05, 0.005] as Vec3,
  out: [0.85, -0.45, 0.25] as Vec3,
  to: [0.11, PACK.c[1] + PACK.r[1] + 0.012, PACK.c[2] - 0.01] as Vec3,
  r: 0.024,
};

const WHITE = [0.88, 0.89, 0.92];
const PALE = [0.74, 0.76, 0.8];
const IRON = [0.25, 0.27, 0.3];
const VENT = [0.05, 0.05, 0.06];

/** Sides round the pack's body and the hose, the hose's steps along, and whether the details are there. */
const DETAIL = [
  { body: 8, hose: 0, steps: 0, rows: 4, details: false },
  { body: 16, hose: 8, steps: 14, rows: 8, details: true },
  { body: 28, hose: 14, steps: 48, rows: 12, details: true },
];

interface Kit {
  body: number[];
  strips: number[];
}

const kits = new Map<number, Kit>();

const kit = (lod: number): Kit => {
  const level = Math.min(lod, 2);
  const k = kits.get(level);
  if (k) {
    return k;
  }
  const D = DETAIL[level];
  const [cx, cy, cz] = PACK.c;
  const [a, b, d] = PACK.r;
  const e = PACK.e;
  const out: Kit = { body: [], strips: [] };
  // The body: square rings along y, rounded in at the top and the bottom.
  const shrink = (s: number) => 1 - 0.06 * Math.abs(2 * s - 1) ** 10;
  loft(
    (t, s) => {
      const th = t * TAU;
      const k = shrink(s);
      return [
        cx + a * k * pow(Math.sin(th), 2 / e),
        cy - b + 2 * b * s,
        cz - d * k * pow(Math.cos(th), 2 / e),
      ];
    },
    s => [cx, cy - b + 2 * b * s, cz],
    D.body,
    Array.from({ length: D.rows + 1 }, (_, i) => i / D.rows),
    [
      [cx, cy - b - 0.004, cz],
      [cx, cy + b + 0.004, cz],
    ],
    WHITE,
    out.body,
  );
  if (D.details) {
    const back = cz + d + 0.0008;
    // On its back: a pale panel, and two columns of vents on it.
    const panel = (x0: number, y0: number, x1: number, y1: number, z: number, col: number[]) =>
      quad(
        out.body,
        [
          [x0, y0, z],
          [x1, y0, z],
          [x1, y1, z],
          [x0, y1, z],
        ],
        [0, 0, 1],
        col,
      );
    panel(-a * 0.7, cy - b * 0.55, a * 0.7, cy + b * 0.75, back, PALE);
    for (let i = 0; i < 6; i++) {
      const y = cy + b * 0.6 - i * 0.03;
      for (const x of [-1, 1]) {
        panel(x * a * 0.12, y - 0.005, x * a * 0.55, y + 0.005, back + 0.0006, VENT);
      }
    }
    // The port the hose plugs into, on the top: a collar.
    const [px, py, pz] = HOSE.to;
    loft(
      (t, s) => [
        px + HOSE.r * 1.35 * Math.cos(t * TAU),
        py - 0.02 + 0.02 * s,
        pz + HOSE.r * 1.35 * Math.sin(t * TAU),
      ],
      s => [px, py - 0.02 + 0.02 * s, pz],
      D.hose,
      [0, 1],
      [
        [px, py - 0.021, pz],
        [px, py + 0.0005, pz],
      ],
      IRON,
      out.body,
    );
    // A light strip down each side, in the team's colour (tinted when placed).
    for (const x of [-1, 1]) {
      const sx = x * (a + 0.0008);
      quad(
        out.strips,
        [
          [sx, cy - b * 0.6, cz + d * 0.55],
          [sx, cy - b * 0.6, cz + d * 0.7],
          [sx, cy + b * 0.6, cz + d * 0.7],
          [sx, cy + b * 0.6, cz + d * 0.55],
        ],
        [x, 0, 0],
        [1, 1, 1],
      );
    }
  }
  // A hard glossy shell, as the helmet's.
  for (let i = 8; i < out.body.length; i += STRIDE) {
    out.body[i] = out.body[i] == -1 ? GLOSS : out.body[i];
  }
  kits.set(level, out);
  return out;
};

/** Places `src`, built in a joint's frame, at that joint `at` turned by `q`. */
const put = (out: number[], src: number[], at: Vec3, q: Quat, tint?: number[]) => {
  const [r, u, f] = aim([0, 0, -1], [1, 0, 0]);
  place(out, src, at, [turn(q, r), turn(q, u), turn(q, f)], [0, 0, 0], 1, tint);
};

/**
 * Appends the pack at level of detail `lod` on the chest joint at `at` turned by `q` (see solve()
 * in rig.ts); its light strips glow in `rgb`, the team's colour.
 */
export const pack = (out: number[], at: Vec3, q: Quat, rgb: number[], lod: number) => {
  const k = kit(lod);
  put(out, k.body, at, q);
  const from = out.length;
  put(out, k.strips, at, q, rgb);
  glow(out, from, GLOW);
};

/**
 * Appends the hose from the helmet on the head joint (`head`, `hq`) to the pack on the chest joint
 * (`chest`, `cq`), at level of detail `lod`: a Bezier leaving the helmet out and down and entering
 * the pack's port from above, ribbed close up. None far.
 */
export const hose = (out: number[], head: Vec3, hq: Quat, chest: Vec3, cq: Quat, lod: number) => {
  const D = DETAIL[Math.min(lod, 2)];
  if (!D.hose) {
    return;
  }
  const on = (at: Vec3, q: Quat, v: Vec3): Vec3 => {
    const w = turn(q, v);
    return [at[0] + w[0], at[1] + w[1], at[2] + w[2]];
  };
  const way = (q: Quat, v: Vec3, k: number): Vec3 => turn(q, unit(v)).map(x => x * k) as Vec3;
  const p0 = on(head, hq, shrunk(HOSE.from));
  const p3 = on(chest, cq, HOSE.to);
  const span = Math.hypot(...sub(p3, p0));
  const o = way(hq, HOSE.out, span * 0.5);
  const i = way(cq, [0, 1, 0], span * 0.45);
  const P = [
    p0,
    [p0[0] + o[0], p0[1] + o[1], p0[2] + o[2]],
    [p3[0] + i[0], p3[1] + i[1], p3[2] + i[2]],
    p3,
  ];
  const B = (s: number): Vec3 => {
    const m = [(1 - s) ** 3, 3 * s * (1 - s) ** 2, 3 * s * s * (1 - s), s ** 3];
    return [0, 1, 2].map(k => P.reduce((v, pt, j) => v + pt[k] * m[j], 0)) as Vec3;
  };
  // Across it, kept steady by the chest's right.
  const right = turn(cq, [1, 0, 0]);
  const ribs = D.steps > 20 ? Math.round(span / 0.018) : 0;
  const r = (s: number) =>
    HOSE.r *
    (1 + (ribs ? 0.12 * Math.cos(s * TAU * ribs) ** 6 : 0) + 0.2 * Math.max(1 - s * 14, 0));
  loft(
    (t, s) => {
      const c = B(s);
      const tan = unit(sub(B(Math.min(s + 1e-3, 1)), B(Math.max(s - 1e-3, 0))));
      const a = unit(cross(tan, right));
      const b = cross(a, tan);
      const [x, y] = [Math.cos(t * TAU) * r(s), Math.sin(t * TAU) * r(s)];
      return [0, 1, 2].map(k => c[k] + a[k] * x + b[k] * y) as Vec3;
    },
    B,
    D.hose,
    Array.from({ length: D.steps + 1 }, (_, k) => k / D.steps),
    [B(0), B(1)],
    IRON,
    out,
  );
};

/**
 * The shoulder pads (the user, 2026-11-10: white and glossy, then worked, less of a shell, cut a
 * third of the way in from the neck, smaller): a plate over each shoulder, flat on top and rounded
 * to its rim, which turns down; two grooves along its outer edge; its inner third, toward the
 * neck, cut off straight. On the arm's joint so it goes with the arm. For the right one (the left
 * is mirrored): its middle from the joint, the way it faces, its half length along the shoulder
 * and half width across it, its height, and the cut (a share of the half length, from the middle
 * toward the neck).
 */
export const PAD = {
  at: [0.012, -0.03, 0] as Vec3,
  out: [0.72, 0.7, 0] as Vec3,
  r: [0.13, 0.085] as [number, number],
  h: 0.05,
  cut: 1 / 3,
};
/** How deep the grooves are and where across the plate (share of its radius), and their width. */
const GROOVES = [0.62, 0.8];
const GROOVE = [0.0035, 0.03];
const LIP = 0.012;
const GROOVED = [0.66, 0.67, 0.7];

/** Columns round, rows out from the middle, and whether it is grooved: far, near, close. */
const PAD_DETAIL = [
  [10, 3, 0],
  [18, 10, 1],
  [32, 24, 1],
];

const pads = new Map<number, number[][]>();

/** The right pad and the left one, built in their arm joint's frame. */
const padOf = (lod: number) => {
  const level = Math.min(lod, 2);
  let v = pads.get(level);
  if (v) {
    return v;
  }
  const [cols, rows, grooved] = PAD_DETAIL[level];
  const [Ra, Rb] = PAD.r;
  const Z = unit(PAD.out);
  const N: Vec3 = [-1, 0.25, 0];
  const nz = N[0] * Z[0] + N[1] * Z[1] + N[2] * Z[2];
  const X = unit([N[0] - Z[0] * nz, N[1] - Z[1] * nz, N[2] - Z[2] * nz]);
  const Y = cross(Z, X);
  const norm = (a: number, b: number) => ((a / Ra) ** 4 + (b / Rb) ** 4) ** 0.25;
  const dip = (r: number) =>
    grooved ? GROOVES.reduce((d, g) => d + Math.exp(-(((r - g) / GROOVE[1]) ** 2)), 0) : 0;
  const height = (a: number, b: number) => {
    const r = Math.min(norm(a, b), 1);
    return PAD.h * Math.sqrt(Math.max(1 - r ** 3, 0)) - GROOVE[0] * dip(r);
  };
  const at = (a: number, b: number, h: number): Vec3 =>
    [0, 1, 2].map(k => PAD.at[k] + X[k] * a + Y[k] * b + Z[k] * h) as Vec3;
  /** The plate's edge at angle t round its middle: the superellipse, or the cut, nearer. */
  const edge = (t: number) => {
    const [c, s] = [Math.cos(t), Math.sin(t)];
    const r = ((Math.abs(c) / Ra) ** 4 + (Math.abs(s) / Rb) ** 4) ** -0.25;
    return c > 0 ? Math.min(r, (PAD.cut * Ra) / c) : r;
  };
  // Corners: [place, normal, colour], row by row from the middle out, then the lip.
  type C = [Vec3, Vec3, number[]];
  const corner = (a: number, b: number, lip = false): C => {
    const e = 1e-4;
    const h = height(a, b);
    const p = at(a, b, lip ? Math.max(h, 0) - LIP : h);
    let n: Vec3;
    if (lip) {
      n = unit(sub(at(a, b, 0), at(0, 0, 0)));
    } else {
      const du = sub(at(a + e, b, height(a + e, b)), at(a - e, b, height(a - e, b)));
      const dv = sub(at(a, b + e, height(a, b + e)), at(a, b - e, height(a, b - e)));
      n = unit(cross(du, dv));
      if (n[0] * Z[0] + n[1] * Z[1] + n[2] * Z[2] < 0) {
        n = [-n[0], -n[1], -n[2]];
      }
    }
    const g = Math.min(dip(Math.min(norm(a, b), 1)), 1);
    const col = WHITE.map((w, k) => w + (GROOVED[k] - w) * g);
    return [p, n, col];
  };
  const grid: C[][] = Array.from({ length: rows + 1 }, (_, k) =>
    Array.from({ length: cols }, (_, i) => {
      const t = (i / cols) * TAU;
      const r = (edge(t) * k) / rows;
      return corner(r * Math.cos(t), r * Math.sin(t));
    }),
  );
  grid.push(
    Array.from({ length: cols }, (_, i) => {
      const t = (i / cols) * TAU;
      return corner(edge(t) * Math.cos(t), edge(t) * Math.sin(t), true);
    }),
  );
  const build = (m: number) => {
    const out: number[] = [];
    const put = ([p, n, c]: C) =>
      out.push(p[0] * m, p[1], p[2], n[0] * m, n[1], n[2], c[0], c[1], GLOSS, c[2]);
    const tri = (a: C, b: C, c: C) => {
      const f = cross(sub(b[0], a[0]), sub(c[0], a[0]));
      if (Math.hypot(...f) < 1e-12) {
        return;
      }
      // Wound as the normal faces; a mirror turns the winding over.
      const facing = f[0] * a[1][0] + f[1] * a[1][1] + f[2] * a[1][2] >= 0;
      (facing == m > 0 ? [a, b, c] : [a, c, b]).forEach(put);
    };
    grid.slice(1).forEach((row, k) => {
      const prev = grid[k];
      for (let i = 0; i < cols; i++) {
        const j = (i + 1) % cols;
        tri(prev[i], row[i], row[j]);
        tri(prev[i], row[j], prev[j]);
      }
    });
    return out;
  };
  v = [build(-1), build(1)];
  pads.set(level, v);
  return v;
};

/** Appends both shoulder pads at level of detail `lod` on the arm joints (`arms`: the left's and the right's place and turn). */
export const shoulders = (out: number[], arms: [Vec3, Quat][], lod: number) => {
  const src = padOf(lod);
  arms.forEach(([at, q], i) => put(out, src[i], at, q));
};
