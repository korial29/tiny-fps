// The ninja's shoulder pads (the user, 2026-11-13, on his picture of a ninja's armour): on each
// shoulder three lames one over the other, the lowest the longest, each a kite seen from above with
// its point just past the arm, creased down its middle like a roof, sloping down over the shoulder
// to cover it (the user: discreet, but over the shoulders) with its point kicked up. A
// piece of their own, built once for the right shoulder and mirrored: carried at the arm's joint,
// turned as the collarbone is and a little as the arm (so it lifts when the arm does). And his collar,
// on the chest at the neck's foot.
import { GILT, GLOSS, STRIDE } from './mesh';
import type { Vec3 } from './mesh';
import { JOINT as J, turn } from './rig';
import type { Quat } from './rig';

/**
 * A lame, from the arm's joint at rest (metres, +x out): where it starts and ends across, its half
 * width fore and aft, and its height at its start.
 */
export const LAMES = [
  [-0.05, 0.09, 0.115, 0.075],
  [-0.058, 0.06, 0.102, 0.086],
  [-0.066, 0.03, 0.089, 0.097],
];
/**
 * His collar, standing round the back of the neck and open in front: how far round from the back it
 * goes each side (rad), its radius at its foot and how much wider at its top, its foot under the
 * neck's joint, and its height at the back and at its ends.
 */
export const COLLAR = { a: 2.5, r: 0.085, flare: 0.035, foot: -0.035, back: 0.12, end: 0.05 };
/** How far a lame rises to its point, how far its edges fall from its crease, its thickness, and the share of the arm's turn it takes. */
const [RISE, FALL, THICK, LIFT] = [0.03, 0.075, 0.007, 0.55];
/** Where along a lame it is widest. */
const WIDE = 0.45;
/** How far a lame slopes down along the shoulder before its point kicks up. */
const SLOPE = 0.07;

/**
 * The shoulder under the pads (the user, 2026-11-13: the pads went into the shoulder): the top of
 * the skin round the arm's joint as he stands, measured on it: rising to the neck, falling fast past
 * the joint, and fore and aft.
 * A lame stays `CLEAR` over it, each one `STACK` more than the one under.
 */
const shoulder = (x: number, z: number) => {
  const out = Math.max(x - 0.02, 0);
  const front = FRONT[0] + (FRONT[1] - FRONT[0]) * Math.min(Math.max((x + 0.04) / 0.06, 0), 1);
  return 0.038 - 0.4 * x - out * (0.5 + 18 * out) - (z < 0 ? front : 1.5) * z * z;
};
/**
 * How fast it falls in front (the user, 2026-11-13: wrap the front of the shoulders), by the neck
 * and from over the joint on: there the skin falls some 4 cm in 6, by the neck far less.
 */
const FRONT = [3, 9];
const [CLEAR, STACK] = [0.015, 0.009];
/** How round the lame's turn onto the shoulder is (m): the width of the smooth maximum. */
const EASE = 0.03;

/**
 * The lames' front half (the user, 2026-11-13: wrap the front of the shoulders more): this much
 * wider than their back half, and falling this much further, down over the front of the shoulder
 * (1.6 plunged too steeply, the user, 2026-11-13), down onto the chest piece (the user: fill the
 * gap between the pads and the plates).
 */
export const FORE = { wide: 1.35, fall: 1.35 };
/** Their back half (the user, 2026-11-13: the pads go on behind too): as FORE, over the shoulder blade. */
export const AFT = { wide: 1.4, fall: 1.25 };
/**
 * How a lame falls from its crease to its edges, as a power of the way across: round over the
 * shoulder, not a roof's straight slope (the user, 2026-11-13: round the slope; it was 1.3).
 */
export const CROWN = 2;

/** The lame `i` at `u` across it (-1 its front edge, 1 its back) and `v` along it, `d` under its top. */
const at = (i: number, u: number, v: number, d = 0): Vec3 => {
  const l = LAMES[i];
  const w = v < WIDE ? 0.75 + (0.25 * v) / WIDE : (1 - v) / (1 - WIDE);
  const fore = u < 0;
  const half = fore ? FORE : AFT;
  const [x, z] = [l[0] + (l[1] - l[0]) * v, 0.01 + u * w * l[2] * half.wide];
  const y = l[3] - SLOPE * v + RISE * v ** 3 - FALL * w * Math.abs(u) ** CROWN * half.fall;
  // Eased onto the shoulder rather than bent onto it at once: no kink where it starts to follow it.
  const [a, b] = [y, shoulder(x, z) + CLEAR + i * STACK];
  return [x, (a + b + Math.sqrt((a - b) ** 2 + EASE * EASE)) / 2 - d, z];
};

/** The lame's top's normal at `u`, `v`, off its slopes: shaded round, not in facets. */
const atN = (i: number, u: number, v: number): Vec3 => {
  const e = 1e-3;
  const [p, q] = [at(i, Math.min(u + e, 1), v), at(i, Math.max(u - e, -1), v)];
  const [f, g] = [at(i, u, Math.min(v + e, 1)), at(i, u, Math.max(v - e, 0))];
  const [s, t] = [p.map((c, j) => c - q[j]), f.map((c, j) => c - g[j])];
  const n = [s[1] * t[2] - s[2] * t[1], s[2] * t[0] - s[0] * t[2], s[0] * t[1] - s[1] * t[0]];
  const k = (Math.hypot(...n) || 1) * (n[1] < 0 ? -1 : 1);
  return [n[0] / k, n[1] / k, n[2] / k];
};

/** The collar at `u` round it (-1 to 1) and `v` up it, `d` inside its outer face. */
const ring = (u: number, v: number, d = 0): Vec3 => {
  const { a, r, flare, foot, back, end } = COLLAR;
  const h = v * (back - (back - end) * u * u);
  const q = r + (flare * h) / back - d;
  return [q * Math.sin(u * a), foot + h, 0.008 + q * Math.cos(u * a)];
};

/**
 * The marine's shoulder bell (the user, 2026-11-13, on a picture of a trooper's armour: a big round
 * shell over each shoulder, hanging over the top of the arm): from the arm's joint at rest, its
 * middle across, its radius out and fore and aft, its top, how far round it goes each side of
 * straight out (rad), its length at its outer middle and how much shorter at its ends, and how much
 * it flares at its rim; and her bell's size to his.
 */
export const BELL = {
  x: -0.012,
  r: [0.09, 0.092],
  top: 0.064,
  a: 1.9,
  len: 0.2,
  cut: 0.075,
  flare: 0.06,
  fem: 0.8,
};
/** The share of its length that is its dome, a quarter of a round; under it the bell is straight. */
const DOME = 0.55;

/** The bell at `u` round it (-1 its front end, 1 its back) and `v` down it, `d` inside its outer face. */
const bell = (u: number, v: number, d = 0): Vec3 => {
  const { x, r, top, a, len, cut, flare } = BELL;
  const [l, t] = [len - cut * u * u, (Math.min(v / DOME, 1) * Math.PI) / 2];
  // Round as a ball down to its widest, then straight, flaring a little.
  const w = Math.sin(t) + flare * Math.max(v - DOME, 0);
  const drop = l * DOME * (1 - Math.cos(t)) + l * Math.max(v - DOME, 0);
  return [
    x + (r[0] - d) * w * Math.cos(u * a),
    top - d * Math.cos(t) - drop,
    (r[1] - d) * w * Math.sin(u * a),
  ];
};
/** Its outer face's normal there, off its slopes: smooth shading, no facets. */
const bellN = (u: number, v: number): Vec3 => {
  const e = 1e-3;
  const [p, q] = [bell(u + e, v), bell(u - e, v)];
  const [f, g] = [bell(u, Math.min(v + e, 1)), bell(u, Math.max(v - e, 1e-4))];
  const [s, t] = [p.map((c, i) => c - q[i]), f.map((c, i) => c - g[i])];
  const n = [s[1] * t[2] - s[2] * t[1], s[2] * t[0] - s[0] * t[2], s[0] * t[1] - s[1] * t[0]];
  const k = Math.hypot(...n);
  // At its top the slopes round it are nil: up.
  return k < 1e-12 ? [0, 1, 0] : [n[0] / k, n[1] / k, n[2] / k];
};

/**
 * The band round the bell (the user, 2026-11-13: more detail on the astronaut): its rows of the
 * bell's outer face, drawn in `pads()`'s `band` colour, and the shade that tells them.
 */
export const BAND = { rows: [8], shade: 2 };

/** A lame's quads across and along it (its top shaded round, so ten across). */
const [COLS, ROWS] = [10, 6];
/** A lame's quads: its top and underside, its inner end, its front and back edges. */
export const LAME_QUADS = COLS * ROWS * 2 + COLS + ROWS * 2;

/**
 * The ninja's colours (the user, 2026-11-13: vary them): gold shoulder pads that shine (GILT; a darker
 * gold, the user), and a
 * collar of brown cloth, matte.
 */
export const GOLD = [0.6, 0.4, 0.09];
export const COLLAR_CLOTH = [0.3, 0.18, 0.1];

let made: number[][] | undefined;

/** The right pad at rest: triangles of [x, y, z, nx, ny, nz, shade], the shade 1 on top. */
const make = () => {
  let out: number[] = [];
  const quad = (p: Vec3[], shade: number) => {
    // Its normal off its diagonals; its corners wound to face that way.
    const [e, f] = [p[2].map((c, j) => c - p[0][j]), p[1].map((c, j) => c - p[3][j])];
    const n = [e[1] * f[2] - e[2] * f[1], e[2] * f[0] - e[0] * f[2], e[0] * f[1] - e[1] * f[0]];
    const k = Math.hypot(...n) || 1;
    [0, 2, 1, 0, 3, 2].forEach(i => out.push(...p[i], n[0] / k, n[1] / k, n[2] / k, shade));
  };
  for (let l = 0; l < LAMES.length; l++) {
    for (let c = 0; c < COLS; c++) {
      const [u0, u1] = [(2 * c) / COLS - 1, (2 * (c + 1)) / COLS - 1];
      for (let r = 0; r < ROWS; r++) {
        const [v0, v1] = [r / ROWS, (r + 1) / ROWS];
        // Its top, wound to face up, each corner with the surface's own normal; its underside.
        const from = out.length;
        quad([at(l, u0, v0), at(l, u0, v1), at(l, u1, v1), at(l, u1, v0)], 1);
        [
          [u0, v0],
          [u1, v1],
          [u0, v1],
          [u0, v0],
          [u1, v0],
          [u1, v1],
        ].forEach(([u, v], k) => {
          const o = from + k * 7 + 3;
          [out[o], out[o + 1], out[o + 2]] = atN(l, u, v);
        });
        quad(
          [at(l, u0, v0, THICK), at(l, u1, v0, THICK), at(l, u1, v1, THICK), at(l, u0, v1, THICK)],
          0.4,
        );
      }
      // Its inner end's edge.
      quad([at(l, u0, 0), at(l, u1, 0), at(l, u1, 0, THICK), at(l, u0, 0, THICK)], 0.7);
    }
    for (let r = 0; r < ROWS; r++) {
      const [v0, v1] = [r / ROWS, (r + 1) / ROWS];
      // Its front and back edges.
      quad([at(l, -1, v1), at(l, -1, v0), at(l, -1, v0, THICK), at(l, -1, v1, THICK)], 0.7);
      quad([at(l, 1, v0), at(l, 1, v1), at(l, 1, v1, THICK), at(l, 1, v0, THICK)], 0.7);
    }
  }
  const pad = out;
  out = [];
  for (let c = 0; c < 16; c++) {
    const [u0, u1] = [c / 8 - 1, (c + 1) / 8 - 1];
    for (const [v0, v1] of [
      [0, 0.5],
      [0.5, 1],
    ]) {
      quad([ring(u0, v0), ring(u0, v1), ring(u1, v1), ring(u1, v0)], 1);
      quad(
        [ring(u0, v0, THICK), ring(u1, v0, THICK), ring(u1, v1, THICK), ring(u0, v1, THICK)],
        0.4,
      );
    }
    quad([ring(u0, 1), ring(u0, 1, THICK), ring(u1, 1, THICK), ring(u1, 1)], 0.7);
  }
  for (const u of [-1, 1]) {
    const p = [ring(u, 0), ring(u, 1), ring(u, 1, THICK), ring(u, 0, THICK)];
    quad(u < 0 ? p.reverse() : p, 0.7);
  }
  const collar = out;
  out = [];
  const [BC, BR] = [20, 12];
  for (let c = 0; c < BC; c++) {
    const [u0, u1] = [(2 * c) / BC - 1, (2 * (c + 1)) / BC - 1];
    for (let r = 0; r < BR; r++) {
      const [v0, v1] = [r / BR, (r + 1) / BR];
      // Its outer face, each corner with the surface's own normal.
      const from = out.length;
      quad(
        [bell(u0, v0), bell(u0, v1), bell(u1, v1), bell(u1, v0)],
        BAND.rows.includes(r) ? BAND.shade : 1,
      );
      [
        [u0, v0],
        [u1, v1],
        [u0, v1],
        [u0, v0],
        [u1, v0],
        [u1, v1],
      ].forEach(([u, v], i) => {
        const [n, o] = [bellN(u, v), from + i * 7 + 3];
        // Out, as the flat normal the quad was wound by.
        const k = n[0] * out[o] + n[1] * out[o + 1] + n[2] * out[o + 2] < 0 ? -1 : 1;
        [out[o], out[o + 1], out[o + 2]] = [n[0] * k, n[1] * k, n[2] * k];
      });
      quad(
        [bell(u0, v0, THICK), bell(u1, v0, THICK), bell(u1, v1, THICK), bell(u0, v1, THICK)],
        0.4,
      );
    }
    quad([bell(u0, 1), bell(u1, 1), bell(u1, 1, THICK), bell(u0, 1, THICK)], 0.7);
  }
  return [pad, collar, out];
};

/**
 * Appends the ninja's shoulder pads and his collar on the solved pose `s`, the pads in `color` (GOLD
 * for him), the collar in COLLAR_CLOTH;
 * smaller on the woman (`build`). Or the `marine`'s shoulder bells, and no collar, with a band
 * round them in `band` (the astronaut's team colour on his white bells).
 */
export const pads = (
  out: number[],
  s: { pos: Vec3[]; rot: Quat[] },
  build = 0,
  color = [0.5, 0.5, 0.5],
  marine = false,
  band = color,
) => {
  const [lames, collar, shell] = (made ??= make());
  const pad = marine ? shell : lames;
  // Hers smaller; her bells slimmer still (the user, 2026-11-13: over the shoulder, but finer).
  const k = build ? (marine ? BELL.fem : 0.9) : 1;
  let w = out.length;
  /** The piece `m` at `o` turned by `rot`, mirrored with `side` -1; of `cloth` when given, matte. */
  const place = (m: number[], o: Vec3, rot: Quat, side: number, cloth?: number[]) => {
    for (let i = 0; i < m.length; i += 7 * 3) {
      // Mirrored: its corners in the other order.
      for (const c of side > 0 ? [0, 1, 2] : [0, 2, 1]) {
        const j = i + c * 7;
        const p = turn(rot, [m[j] * k * side, m[j + 1] * k, m[j + 2] * k]);
        const d = turn(rot, [m[j + 3] * side, m[j + 4], m[j + 5]]);
        const banded = m[j + 6] == BAND.shade;
        const [rgb, shade] = banded ? [band, 1] : [cloth ?? color, m[j + 6]];
        out[w] = o[0] + p[0];
        out[w + 1] = o[1] + p[1];
        out[w + 2] = o[2] + p[2];
        out[w + 3] = d[0];
        out[w + 4] = d[1];
        out[w + 5] = d[2];
        out[w + 6] = rgb[0] * shade;
        out[w + 7] = rgb[1] * shade;
        out[w + 8] = shade != 1 || cloth ? -1 : marine ? GLOSS : GILT;
        out[w + 9] = rgb[2] * shade;
        w += STRIDE;
      }
    }
  };
  for (const side of [1, -1]) {
    const [arm, clavicle] = side > 0 ? [J.ARM_R, J.CLAVICLE_R] : [J.ARM_L, J.CLAVICLE_L];
    const [a, b] = [s.rot[clavicle], s.rot[arm]];
    const f = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? -1 : 1) * LIFT;
    const q = a.map((c, i) => c * (1 - LIFT) + b[i] * f);
    const n = Math.hypot(...q) || 1;
    place(pad, s.pos[arm], q.map(c => c / n) as Quat, side);
  }
  if (!marine) {
    place(collar, s.pos[J.NECK], s.rot[J.CHEST], 1, COLLAR_CLOTH);
  }
};
