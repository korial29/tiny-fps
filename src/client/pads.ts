// The ninja's shoulder pads (the user, 2026-11-13, on his picture of a ninja's armour): on each
// shoulder three lames one over the other, the lowest the longest, each a kite seen from above with
// its point just past the arm, creased down its middle like a roof, sloping down over the shoulder
// to cover it (the user: discreet, but over the shoulders) with its point kicked up. A
// piece of their own, built once for the right shoulder and mirrored: carried at the arm's joint,
// turned as the collarbone is and a little as the arm (so it lifts when the arm does). And his collar,
// on the chest at the neck's foot.
import { GLOSS, STRIDE } from './mesh';
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
  return 0.038 - 0.4 * x - out * (0.5 + 18 * out) - 1.5 * z * z;
};
const [CLEAR, STACK] = [0.013, 0.009];

/** The lame `i` at `u` across it (-1 its front edge, 1 its back) and `v` along it, `d` under its top. */
const at = (i: number, u: number, v: number, d = 0): Vec3 => {
  const l = LAMES[i];
  const w = v < WIDE ? 0.75 + (0.25 * v) / WIDE : (1 - v) / (1 - WIDE);
  const [x, z] = [l[0] + (l[1] - l[0]) * v, 0.01 + u * w * l[2]];
  const y = l[3] - SLOPE * v + RISE * v ** 3 - FALL * w * Math.abs(u) ** 1.3;
  return [x, Math.max(y, shoulder(x, z) + CLEAR + i * STACK) - d, z];
};

/** The collar at `u` round it (-1 to 1) and `v` up it, `d` inside its outer face. */
const ring = (u: number, v: number, d = 0): Vec3 => {
  const { a, r, flare, foot, back, end } = COLLAR;
  const h = v * (back - (back - end) * u * u);
  const q = r + (flare * h) / back - d;
  return [q * Math.sin(u * a), foot + h, 0.008 + q * Math.cos(u * a)];
};

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
  const [COLS, ROWS] = [6, 6];
  for (let l = 0; l < LAMES.length; l++) {
    for (let c = 0; c < COLS; c++) {
      const [u0, u1] = [(2 * c) / COLS - 1, (2 * (c + 1)) / COLS - 1];
      for (let r = 0; r < ROWS; r++) {
        const [v0, v1] = [r / ROWS, (r + 1) / ROWS];
        // Its top, wound to face up; its underside.
        quad([at(l, u0, v0), at(l, u0, v1), at(l, u1, v1), at(l, u1, v0)], 1);
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
  return [pad, out];
};

/** Appends the ninja's shoulder pads and his collar on the solved pose `s`, in the team's `color`; smaller on the woman (`build`). */
export const pads = (
  out: number[],
  s: { pos: Vec3[]; rot: Quat[] },
  build = 0,
  color = [0.5, 0.5, 0.5],
) => {
  const [pad, collar] = (made ??= make());
  const k = build ? 0.9 : 1;
  let w = out.length;
  /** The piece `m` at `o` turned by `rot`, mirrored with `side` -1. */
  const place = (m: number[], o: Vec3, rot: Quat, side: number) => {
    for (let i = 0; i < m.length; i += 7 * 3) {
      // Mirrored: its corners in the other order.
      for (const c of side > 0 ? [0, 1, 2] : [0, 2, 1]) {
        const j = i + c * 7;
        const p = turn(rot, [m[j] * k * side, m[j + 1] * k, m[j + 2] * k]);
        const d = turn(rot, [m[j + 3] * side, m[j + 4], m[j + 5]]);
        const shade = m[j + 6];
        out[w] = o[0] + p[0];
        out[w + 1] = o[1] + p[1];
        out[w + 2] = o[2] + p[2];
        out[w + 3] = d[0];
        out[w + 4] = d[1];
        out[w + 5] = d[2];
        out[w + 6] = color[0] * shade;
        out[w + 7] = color[1] * shade;
        out[w + 8] = shade == 1 ? GLOSS : -1;
        out[w + 9] = color[2] * shade;
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
  place(collar, s.pos[J.NECK], s.rot[J.CHEST], 1);
};
