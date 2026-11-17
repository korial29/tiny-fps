// The knot of the ninja's sash (the user, 2026-11-17: a redesign of his belt; it was a round steel
// buckle), on him and on her: a flat knot of the sash's black cloth on the middle of its front, a
// band of the team's colour wrapped over it, and its two long ends hanging from under it, one
// longer than the other, that float: they sway at rest and fly out and flutter as he runs
// (tails(), drawn each frame). Carried by the pelvis, as the pouch, on the own body and the others'.
import { SASH } from './armor';
import { SHINE, STRIDE, capsule, dress, place, smooth, unit } from './mesh';
import type { Vec3 } from './mesh';
import { JOINT as J, rest, solve, turn } from './rig';
import type { Quat } from './rig';
import { room } from './verts';
import type { Out } from './verts';

const BALL = dress(capsule(0, [1], 12, [4, 4]), [1, 1, 1]);

/**
 * The throwing blades tucked in the sash on the right hip (the user, 2026-11-17): a leaf of
 * polished steel point down, a wrapped grip and a ring over the sash's top. Their places round the
 * waist from the front (radians), the waist's half width (the knot gives its depth), and their
 * blade's and grip's lengths.
 */
const KUNAI = { a: [0.5, 0.72, 0.94], wide: 0.172, blade: 0.075, grip: 0.04, off: 0.021 };
const steel = (v: number[]) => {
  for (let i = 0; i < v.length; i += STRIDE) {
    v[i + 8] = SHINE;
  }
  return v;
};
const LEAF = steel(
  dress(
    smooth(
      [
        [0, 0],
        [1, 0.3],
        [0, 1],
      ],
      4,
    ),
    [0.66, 0.68, 0.72],
  ),
);
const GRIP = dress(capsule(1, [1, 1], 8, [0, 0]), [0.04, 0.04, 0.045]);
const RING = steel(dress(capsule(0, [1], 10, [3, 3]), [0.6, 0.62, 0.66]));

/** The height of its middle at rest, on the middle of the sash. */
export const BUCKLE_Y = 1.008;
/** Where the knot sits, from the pelvis in the rest pose, on him and on her, sunk a millimetre into the sash's front. */
const AT: Vec3[] = [0.134, 0.126].map(z => [
  0,
  BUCKLE_Y - solve(rest()).pos[J.PELVIS][1],
  -z + 0.001,
]);
/** The knot's half width and its depth (m): what the vest's last lame is cut round (armor.ts). */
export const BUCKLE = [0.032, 0.012];
/** Its ends: across from the knot's middle, lean from straight down (radians), length, half width. */
export const ENDS = [
  [-0.01, -0.3, 0.34, 0.017],
  [0.01, 0.2, 0.27, 0.016],
];
/** How much lighter the ends and the knot are than the sash's plain grey, to match its weave as lit. */
const LIFT = 1.6;
/** The pieces of an end, and the speed (m/s) at which it flies out in full. */
const [PIECES, FAST] = [8, 7];

/** Appends the knot for build b's pelvis at `at` turned by `q`, its band in `team`. */
export const buckle = (out: Out, at: Vec3, q: Quat, b: number) => {
  const ax = [turn(q, [1, 0, 0]), turn(q, [0, 1, 0]), turn(q, [0, 0, -1])];
  const o = turn(q, AT[b]);
  const m: Vec3 = [at[0] + o[0], at[1] + o[1], at[2] + o[2]];
  const [r, d] = BUCKLE;
  place(
    out,
    BALL,
    m,
    ax,
    [0, 0, 0.002],
    [r * 0.8, r * 0.62, d],
    SASH.map(c => c * LIFT),
  );
  // The band over it in the sash's grey too, a shade down (the user, 2026-11-17: it was the team's colour).
  place(
    out,
    BALL,
    m,
    ax,
    [0, 0, 0.006],
    [r * 0.34, r * 0.74, d * 0.95],
    SASH.map(c => c * 0.7),
  );
  for (const a of KUNAI.a) {
    const [sn, cs] = [Math.sin(a), Math.cos(a)];
    // Out of the waist there, down the body leaning a little back, and across.
    const n = unit([sn * -AT[b][2], 0, -cs * KUNAI.wide]);
    const down = turn(q, unit([0.12 * cs, -1, 0.12 * sn]));
    const outw = turn(q, n);
    const across = turn(q, [-n[2], 0, n[0]]);
    const k = turn(q, [
      KUNAI.wide * sn + n[0] * KUNAI.off,
      AT[b][1] + 0.022,
      AT[b][2] * cs + n[2] * KUNAI.off,
    ]);
    const c: Vec3 = [at[0] + k[0], at[1] + k[1], at[2] + k[2]];
    const f = [across, outw, down];
    place(out, LEAF, c, f, [0, 0, 0], [0.013, 0.0028, KUNAI.blade]);
    place(out, GRIP, c, f, [0, 0, -KUNAI.grip], [0.0045, 0.0045, KUNAI.grip]);
    place(out, RING, c, f, [0, 0, -KUNAI.grip - 0.008], [0.009, 0.003, 0.009]);
  }
};

/**
 * Appends the sash's two ends under the knot, at the clock `t` (s) of a runner going at `speed`
 * (m/s): ribbons of PIECES pieces, each leaning a little more than the one above it, by a wave that
 * runs down it; out of the body and wider apart, faster, the faster he goes. Two faces each.
 */
export const tails = (out: Out, at: Vec3, q: Quat, b: number, t: number, speed: number) => {
  const o = AT[b];
  const fly = Math.min(speed / FAST, 1);
  ENDS.forEach(([x, lean, len, w], e) => {
    const side = Math.sign(x);
    let p: Vec3 = [o[0] + x, o[1] - 0.006, o[2] - 0.006];
    const rows: Vec3[][] = [];
    for (let i = 0; i <= PIECES; i++) {
      const k = i / PIECES;
      const wave = Math.sin(t * (2.2 + 9 * fly) - i * 0.9 + e * 2.1);
      // Round the body's upright axis from straight down, and out of the body.
      const a = lean + side * 0.45 * fly * k + (0.07 + 0.3 * fly) * wave * k;
      const up =
        0.1 +
        0.75 * fly * Math.min(1, k * 2) +
        (0.05 + 0.2 * fly) * k * Math.cos(t * (3.1 + 8 * fly) - i * 0.8 + e);
      const d: Vec3 = [Math.sin(a) * Math.cos(up), -Math.cos(a) * Math.cos(up), -Math.sin(up)];
      const ac: Vec3 = [Math.cos(a), Math.sin(a), 0];
      const h = w * (0.8 + 0.25 * k);
      rows.push([
        [p[0] - ac[0] * h, p[1] - ac[1] * h, p[2]],
        [p[0] + ac[0] * h, p[1] + ac[1] * h, p[2]],
        [ac[1] * d[2] - ac[2] * d[1], ac[2] * d[0] - ac[0] * d[2], ac[0] * d[1] - ac[1] * d[0]],
      ]);
      p = [
        p[0] + (d[0] * len) / PIECES,
        p[1] + (d[1] * len) / PIECES,
        p[2] + (d[2] * len) / PIECES,
      ];
    }
    let n = out.length;
    const dst = room(out, PIECES * 12 * STRIDE);
    const put = (v: Vec3, m: Vec3, s: number) => {
      const [c, g] = [turn(q, v), turn(q, m)];
      for (let j = 0; j < 3; j++) {
        dst[n + j] = at[j] + c[j];
        dst[n + 3 + j] = g[j] * s;
      }
      // A touch over the sash's colour: its weave reads lighter than its plain grey.
      [dst[n + 6], dst[n + 7], dst[n + 8], dst[n + 9]] = [
        SASH[0] * LIFT,
        SASH[1] * LIFT,
        -1,
        SASH[2] * LIFT,
      ];
      n += STRIDE;
    };
    for (let i = 0; i < PIECES; i++) {
      const [[l0, r0, m0], [l1, r1, m1]] = [rows[i], rows[i + 1]];
      for (const s of [1, -1]) {
        const tri: [Vec3, Vec3][] = [
          [l0, m0],
          [r0, m0],
          [r1, m1],
          [l0, m0],
          [r1, m1],
          [l1, m1],
        ];
        // Both faces lit as the one that faces out (the user, 2026-11-17: they were darker than the
        // sash): the two lie in one plane, and the one that faced the body was drawn over the other.
        (s > 0 ? tri : tri.reverse()).forEach(([v, m]) => put(v, m, 1));
      }
    }
    out.length = n;
  });
};
