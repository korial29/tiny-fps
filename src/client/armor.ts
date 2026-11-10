// The armour of the moon's space suit (the user, 2026-11-10: the shoulder pads part of an armour,
// white hard plates over the suit as the troopers of space operas wear, not copied): a chest plate
// cut round the neck, three bands over the belly, a plate on each thigh, the knees and the
// forearms. Each plate is a piece of the skin's own sections (skin.ts), grown out a little and
// carried by one joint, so it goes with the body; a grey backing a little larger shows round it as
// its edge. Built once per level of detail in each joint's rest frame (metres, -z the front).
import { cross, pow, sub, unit } from './helmet';
import type { Spot } from './helmet';
import { GLOSS, STRIDE, aim, place } from './mesh';
import type { Vec3 } from './mesh';
import { JOINT as J, turn } from './rig';
import type { Quat } from './rig';

/**
 * A plate: the joint carrying it and that joint's rest place, then sections up its piece of the
 * body, each [height, centre ahead, half width, half depth] as the skin's rings (world rest pose,
 * the right side), the cross-section's exponent, the angles it spans round the body (0 the front,
 * 90 the right, degrees), its bottom and top at each angle (a), and how far out of the skin.
 */
interface Plate {
  joint: number;
  at: Vec3;
  rings: number[][];
  e: number;
  span: [number, number];
  low: (a: number) => number;
  high: (a: number) => number;
  off: number;
  /** Built for the right side, and again mirrored on the left joint. */
  mirror?: number;
}

const flat = (y: number) => () => y;
const rad = (d: number) => (d * Math.PI) / 180;

export const PLATES: Plate[] = [
  // The chest plate, from under the ribs to the collar, dipping round the neck.
  {
    joint: J.CHEST,
    at: [0, 1.3, 0],
    rings: [
      [1.19, 0.012, 0.156, 0.122],
      [1.25, 0.011, 0.158, 0.127],
      [1.3, 0.014, 0.162, 0.131],
      [1.37, 0.015, 0.166, 0.137],
      [1.41, 0.007, 0.175, 0.138],
      [1.445, -0.003, 0.2, 0.135],
      [1.475, -0.0085, 0.19, 0.1265],
      [1.5, -0.0115, 0.175, 0.114],
    ],
    e: 2.3,
    span: [-64, 64],
    low: flat(1.205),
    high: a => 1.5 - 0.045 * Math.cos(rad(a) * 1.4) ** 2,
    off: 0.014,
  },
  // The belly's three bands, a gap between each, on the spine.
  ...[
    [1.03, 1.077],
    [1.085, 1.132],
    [1.14, 1.19],
  ].map(([lo, hi]): Plate => ({
    joint: J.SPINE,
    at: [0, 1.1, 0],
    rings: [
      [1.02, 0.011, 0.166, 0.12],
      [1.075, 0.012, 0.159, 0.12],
      [1.12, 0.012, 0.156, 0.121],
      [1.2, 0.012, 0.157, 0.124],
    ],
    e: 2.3,
    span: [-52, 52],
    low: flat(lo),
    high: flat(hi),
    off: 0.012,
  })),
  // A plate down the front of each thigh.
  {
    joint: J.THIGH_R,
    mirror: J.THIGH_L,
    at: [0.1, 0.93, 0],
    rings: [
      [0.87, 0.008, 0.09, 0.106],
      [0.85, 0.006, 0.087, 0.103],
      [0.79, 0.002, 0.079, 0.093],
      [0.72, -0.002, 0.074, 0.084],
      [0.66, -0.002, 0.072, 0.086],
      [0.6, -0.003, 0.072, 0.088],
    ],
    e: 2,
    span: [-62, 78],
    low: flat(0.61),
    high: a => 0.85 + 0.012 * Math.sin(rad(a)),
    off: 0.011,
  },
  // The knees.
  {
    joint: J.SHIN_R,
    mirror: J.SHIN_L,
    at: [0.1, 0.49, 0],
    rings: [
      [0.57, -0.003, 0.077, 0.084],
      [0.55, -0.003, 0.081, 0.081],
      [0.52, -0.004, 0.083, 0.082],
      [0.49, -0.004, 0.083, 0.082],
      [0.455, -0.001, 0.08, 0.079],
    ],
    e: 2,
    span: [-55, 55],
    low: a => 0.462 + 0.01 * Math.abs(rad(a)),
    high: a => 0.565 - 0.012 * Math.abs(rad(a)),
    off: 0.013,
  },
  // The outer side of each forearm.
  {
    joint: J.FOREARM_R,
    mirror: J.FOREARM_L,
    at: [0.222, 1.18, 0],
    rings: [
      [1.16, -0.002, 0.051, 0.058],
      [1.135, -0.002, 0.049, 0.056],
      [1.09, -0.001, 0.05, 0.058],
      [1.05, -0.001, 0.044, 0.055],
      [1.0, 0, 0.041, 0.05],
    ],
    e: 2,
    span: [20, 160],
    low: flat(1.005),
    high: flat(1.15),
    off: 0.009,
  },
];

const WHITE = [0.9, 0.91, 0.93];
const EDGE = [0.42, 0.44, 0.48];

/** Columns round and rows up of a plate, far, near, close. */
const DETAIL = [
  [5, 2],
  [10, 4],
  [18, 8],
];

/** The section of `p` at height y, eased between its rings: [centre ahead, half width, half depth]. */
const section = (p: Plate, y: number) => {
  const r = p.rings;
  const below = r.findIndex(q => q[0] < y);
  const i = Math.max(0, Math.min((below < 0 ? r.length : below) - 1, r.length - 2));
  const [a, b] = [r[i], r[i + 1]];
  const k = Math.max(0, Math.min((a[0] - y) / (a[0] - b[0]), 1));
  return [1, 2, 3].map(j => a[j] + (b[j] - a[j]) * k);
};

/** The plate's surface at angle a (degrees) and height y, `off` out of the skin, in the joint's frame (the right side; `m` -1 mirrors it). */
const point = (p: Plate, a: number, y: number, off: number, m: number): Vec3 => {
  const [co, w, d] = section(p, y);
  const t = rad(a);
  return [
    m * (w + off) * pow(Math.sin(t), 2 / p.e),
    y - p.at[1],
    -co - (d + off) * pow(Math.cos(t), 2 / p.e),
  ];
};

/** The plate as triangles: its face, and the grey backing round it. */
const build = (p: Plate, m: number, [cols, rows]: number[]) => {
  const out: number[] = [];
  const grid = (grow: number, off: number, col: number[]) => {
    const [a0, a1] = [p.span[0] - grow * 4, p.span[1] + grow * 4];
    const at = (i: number, j: number) => {
      const a = a0 + ((a1 - a0) * i) / cols;
      const [lo, hi] = [p.low(a) - grow * 0.004, p.high(a) + grow * 0.004];
      return point(p, a, lo + ((hi - lo) * j) / rows, off, m);
    };
    // Rows along the angle, open: each a strip of quads.
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const q = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)];
        const n = unit(cross(sub(q[1], q[0]), sub(q[3], q[0])));
        // Out of the body: away from the section's middle.
        const mid: Vec3 = [0, q[0][1], 0];
        const o = sub(q[0], mid);
        const s = n[0] * o[0] + n[2] * o[2] < 0 ? -1 : 1;
        const nn: Vec3 = [n[0] * s, n[1] * s, n[2] * s];
        const spots = q.map((v, k) => {
          // Smooth across: the normal of the section's curve at each corner.
          const [ii, jj] = [[i, i + 1, i + 1, i][k], [j, j, j + 1, j + 1][k]];
          const [l, r] = [at(Math.max(ii - 0.5, 0), jj), at(Math.min(ii + 0.5, cols), jj)];
          const [dn, up] = [at(ii, Math.max(jj - 0.5, 0)), at(ii, Math.min(jj + 0.5, rows))];
          let c = unit(cross(sub(r, l), sub(up, dn)));
          if (c[0] * nn[0] + c[1] * nn[1] + c[2] * nn[2] < 0) {
            c = [-c[0], -c[1], -c[2]];
          }
          return [v, c] as Spot;
        });
        for (const tri of [
          [spots[0], spots[1], spots[2]],
          [spots[0], spots[2], spots[3]],
        ]) {
          const c = cross(sub(tri[1][0], tri[0][0]), sub(tri[2][0], tri[0][0]));
          if (Math.hypot(...c) < 1e-10) {
            continue;
          }
          const flip = c[0] * tri[0][1][0] + c[1] * tri[0][1][1] + c[2] * tri[0][1][2] < 0;
          (flip ? [tri[0], tri[2], tri[1]] : tri).forEach(([v, n]) =>
            out.push(...v, ...n, col[0], col[1], -1, col[2]),
          );
        }
      }
    }
  };
  grid(1, p.off - 0.004, EDGE);
  const from = out.length;
  grid(0, p.off, WHITE);
  for (let i = from + 8; i < out.length; i += STRIDE) {
    out[i] = GLOSS;
  }
  return out;
};

const kits = new Map<number, [number, number[]][]>();

const kit = (lod: number) => {
  const level = Math.min(lod, 2);
  let k = kits.get(level);
  if (!k) {
    k = PLATES.flatMap(p => [
      [p.joint, build(p, 1, DETAIL[level])] as [number, number[]],
      ...(p.mirror === undefined
        ? []
        : [[p.mirror, build(p, -1, DETAIL[level])] as [number, number[]]]),
    ]);
    kits.set(level, k);
  }
  return k;
};

/** Appends the armour at level of detail `lod` on the solved skeleton's joints (`pos`, `rot`). */
export const armor = (out: number[], pos: Vec3[], rot: Quat[], lod: number) => {
  const [r, u, f] = aim([0, 0, -1], [1, 0, 0]);
  for (const [j, src] of kit(lod)) {
    const q = rot[j];
    place(out, src, pos[j], [turn(q, r), turn(q, u), turn(q, f)], [0, 0, 0], 1);
  }
};
