// The life support pack of the moon's space suit (the user, 2026-11-10: one big breathing hose
// instead of two, to a big pack on the back as real astronauts wear): a tall box strapped on the
// back of the chest, and one ribbed hose from under the helmet's right ear plate, out over the shoulder, to the pack's top.
// The pack is built once per level of detail in the chest joint's frame (rest pose, metres, +z the
// back); the hose is built each frame between the head and the chest, which move apart.
import { TAU } from '../shared/physics';
import { GLOW, glow } from './flag';
import { cross, loft, pow, quad, sheet, shrunk, sub, unit } from './helmet';
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
const put = (
  out: number[],
  src: number[],
  at: Vec3,
  q: Quat,
  tint?: number[],
  scale: number | Vec3 = 1,
) => {
  const [r, u, f] = aim([0, 0, -1], [1, 0, 0]);
  place(out, src, at, [turn(q, r), turn(q, u), turn(q, f)], [0, 0, 0], scale, tint);
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
  // Rings along it, each square to it, kept steady by the chest's right; ribs close.
  const right = turn(cq, [1, 0, 0]);
  const ribs = D.steps > 20 ? Math.round(span / 0.018) : 0;
  const radius = (s: number) =>
    HOSE.r *
    (1 + (ribs ? 0.12 * Math.cos(s * TAU * ribs) ** 6 : 0) + 0.2 * Math.max(1 - s * 14, 0));
  const rows: [Vec3, Vec3][][] = [];
  for (let k = 0; k <= D.steps; k++) {
    const s = k / D.steps;
    const u = 1 - s;
    const m = [u * u * u, 3 * s * u * u, 3 * s * s * u, s * s * s];
    // The derivative of the Bezier: its way along.
    const dm = [-3 * u * u, 3 * u * u - 6 * s * u, 6 * s * u - 3 * s * s, 3 * s * s];
    const c = [0, 1, 2].map(j => P[0][j] * m[0] + P[1][j] * m[1] + P[2][j] * m[2] + P[3][j] * m[3]);
    const tan = unit(
      [0, 1, 2].map(
        j => P[0][j] * dm[0] + P[1][j] * dm[1] + P[2][j] * dm[2] + P[3][j] * dm[3],
      ) as Vec3,
    );
    const a = unit(cross(tan, right));
    const b = cross(a, tan);
    const r = radius(s);
    rows.push(
      Array.from({ length: D.hose }, (_, i) => {
        const [cs, sn] = [Math.cos((i / D.hose) * TAU), Math.sin((i / D.hose) * TAU)];
        const n: Vec3 = [a[0] * cs + b[0] * sn, a[1] * cs + b[1] * sn, a[2] * cs + b[2] * sn];
        return [[c[0] + n[0] * r, c[1] + n[1] * r, c[2] + n[2] * r], n] as [Vec3, Vec3];
      }),
    );
  }
  // The ends, closed flat.
  const t0 = unit(sub(P[1] as Vec3, P[0] as Vec3));
  const t1 = unit(sub(P[3] as Vec3, P[2] as Vec3));
  sheet([[[P[0] as Vec3, [-t0[0], -t0[1], -t0[2]]]], ...rows, [[P[3] as Vec3, t1]]], IRON, -1, out);
};

/** The tint that turns a white piece into `plate` (white when absent). */
const tintOf = (plate?: number[]) => plate?.map((v, i) => v / WHITE[i]);

/** The woman's cup, scaled about its joint: flatter. */
export const CUP_F: Vec3 = [0.92, 0.94, 0.96];

/**
 * The cup at the crotch of the briefs (the user, 2026-11-10, after a trooper's armour, not copied):
 * a rounded shield narrowing down between the thighs, on the pelvis joint (0.98 m at rest). Its
 * rings from the top down: [height from the joint, half width, front (z), back (z)].
 */
const CUP = [
  [-0.035, 0.058, -0.139, -0.1],
  [-0.06, 0.052, -0.137, -0.098],
  [-0.085, 0.042, -0.131, -0.096],
  [-0.106, 0.03, -0.122, -0.094],
  [-0.124, 0.014, -0.11, -0.094],
];

const cups = new Map<number, number[]>();

/** Appends the crotch cup at level of detail `lod` on the pelvis joint at `at` turned by `q`, in `plate` (white when absent). */
export const crotch = (
  out: number[],
  at: Vec3,
  q: Quat,
  lod: number,
  plate?: number[],
  scale: number | Vec3 = 1,
) => {
  const level = Math.min(lod, 2);
  let v = cups.get(level);
  if (!v) {
    v = [];
    const ring = (s: number) => {
      const f = s * (CUP.length - 1);
      const i = Math.min(Math.floor(f), CUP.length - 2);
      const k = f - i;
      return CUP[i].map((w, j) => w + (CUP[i + 1][j] - w) * k);
    };
    const rows = [6, 10, 16][level];
    loft(
      (t, s) => {
        const [y, w, front, back] = ring(s);
        const th = t * TAU;
        const [zc, d] = [(front + back) / 2, (back - front) / 2];
        return [w * pow(Math.sin(th), 2 / 3), y, zc - d * pow(Math.cos(th), 2 / 3)];
      },
      s => {
        const [y, , front, back] = ring(s);
        return [0, y, (front + back) / 2];
      },
      [8, 14, 22][level],
      Array.from({ length: rows + 1 }, (_, i) => i / rows),
      [
        [0, CUP[0][0] + 0.003, (CUP[0][2] + CUP[0][3]) / 2],
        [0, CUP[CUP.length - 1][0] - 0.004, (CUP[CUP.length - 1][2] + CUP[CUP.length - 1][3]) / 2],
      ],
      WHITE,
      v,
    );
    for (let i = 8; i < v.length; i += STRIDE) {
      v[i] = GLOSS;
    }
    cups.set(level, v);
  }
  put(out, v, at, q, tintOf(plate), scale);
};
