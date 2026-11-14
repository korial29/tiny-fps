// The ninja's hood and face guard (the user, 2026-11-12). The hood is painted on the head's own skin
// (dress()), black from the neck to the crown but round the eyes and down the upper cheeks, so it
// takes the face's shape; the ideogram 忍 (shinobi) in the team's colour on it behind each temple. The
// guard over the mouth is a piece of its own in the team's colour (reshaped on the user's picture,
// 2026-11-13): its top edge low under the eyes with a small peak up the nose, swept up to a point
// beside each eye; its sides round the cheeks, drawn in to a narrow chin; jutting out down its
// middle, with a kite of black mesh over the mouth under the nose, and a big hollow on each cheek
// sunk in the shell inside a thin rim, plain in the team's colour; the face under it is pressed in. Built once, carried by the head joint like the hair
// (hair.ts), the woman's scaled to her head.
import { HEAD_SCALE } from './hair';
import { JOINT as J, turn } from './rig';
import type { Quat } from './rig';
import type { Vec3 } from './mesh';
import { STRIDE } from './mesh';
import { REGION, TOP, bindOf, scalp } from './skin';
import type { Skin } from './skin';

/** The suit's and the hood's black, a touch of blue in it; the guard's rim, a shade lighter; the disc's ink. */
export const CLOTH = [0.035, 0.036, 0.042];
const [GUARD, INK] = [
  [0.06, 0.062, 0.07],
  [0.012, 0.012, 0.014],
];
/** Shades that are no shade: the team's colour, the meshes' ink, their wire, and the team's colour in a groove. */
const [TEAM, BLACK, WIRE, GROOVE] = [-1, -2, -3, -4];
/** The face opening's bottom, the top of its arch over the brows, and how far round it goes either side of the front (radians). */
const [SLIT_LO, SLIT_HI, SLIT] = [1.668, 1.73, 1.02];
/** The opening's edge round the face at `a`: an arch over the brows, down to the guard at the cheeks. */
const arch = (a: number) =>
  SLIT_LO + (SLIT_HI - SLIT_LO) * Math.sqrt(Math.max(1 - (a / SLIT) ** 2, 0));
/** How far out of the skull the ideograms stand, and the guard's inner and outer faces, metres. */
const [HOOD, IN, OUT] = [0.003, 0.005, 0.009];
/**
 * 忍, its strokes as lines in a unit square, y up: 刃 (the turn and hook, the sweep down to the
 * left, its dot), then 心 (the left dot, the hook along the bottom, the middle and the right dots).
 */
export const KANJI = [
  [0.12, 0.92, 0.84, 0.92, 0.78, 0.5, 0.68, 0.56],
  [0.52, 0.98, 0.46, 0.72, 0.14, 0.48],
  [0.26, 0.76, 0.34, 0.64],
  [0.14, 0.32, 0.08, 0.14],
  [0.3, 0.38, 0.34, 0.06, 0.82, 0.06, 0.88, 0.2],
  [0.5, 0.38, 0.56, 0.26],
  [0.8, 0.36, 0.9, 0.24],
];

const sub = (p: Vec3, q: Vec3): Vec3 => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
const add = (p: Vec3, q: Vec3, k = 1): Vec3 => [p[0] + q[0] * k, p[1] + q[1] * k, p[2] + q[2] * k];
const unit = (m: Vec3): Vec3 => {
  const l = Math.hypot(...m) || 1;
  return [m[0] / l, m[1] / l, m[2] / l];
};
const cross = (u: Vec3, v: Vec3): Vec3 =>
  unit([u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]);
const dot = (u: Vec3, v: Vec3) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
const clamp = (v: number) => Math.min(Math.max(v, 0), 1);

/** The skull at `a` round it and the height `y`, `off` out of it; under the jaw, the skull's base straight down. */
const skull = (a: number, y: number, off: number): Vec3 => {
  const p = scalp(a, Math.min(Math.max(y, 1.557), TOP - 0.002), off);
  return [p[0], y < 1.557 ? y : p[1], p[2]];
};
/**
 * The opening's bottom round the face: all of the face under the guard's top edge is black (the
 * user, 2026-11-13: no skin beside the guard), level under the eyes and up with the guard's sweep
 * to its points beside them.
 */
const under = (a: number) => PT + HORN * clamp((Math.abs(a) / AT - 0.4) / 0.6) ** 1.6;
/** The guard over the mouth: its top (under the eyes) and bottom (under the chin, the user 2026-11-13), and its half widths there (radians round; then wider, over the jaw and the cheeks). */
const [PT, PB, AT, AB] = [1.662, 1.575, 1.25, 0.85];
/** How high its points beside the eyes stand over its top, and the power that rounds its sides out over the cheeks. */
const [HORN, ROUND] = [0.045, 0.55];
const half = (y: number) => AB + (AT - AB) * clamp((y - PB) / (PT - PB)) ** ROUND;
/**
 * How far its top edge rises at `x` across it (-1 to 1): a peak up the bridge of the nose, `NOSE`
 * high, sloping straight down over the cheekbones to `LOW` (the user, 2026-11-13, on a picture), then
 * the sweep up to the point at each end.
 */
const [NOSE, LOW] = [0.026, 0.45];
const crest = (x: number) =>
  NOSE * clamp(1 - Math.abs(x) / LOW) + HORN * clamp((Math.abs(x) - LOW) / (1 - LOW)) ** 1.4;
/** Its bottom corners drawn up: round at the chin. */
const CHIN = 0.016;
/** The height of its side edge at `q` round from the front. */
const edge = (q: number) => {
  const s = clamp((q - AB) / (AT - AB)) ** (1 / ROUND);
  return PB + s * (PT - PB + HORN) + CHIN * (1 - s) ** 3;
};
/** The hollow in each cheek (the user, 2026-11-13: sunk as on his picture, the middle and the rim left proud): its depth and its bevel's width (in x). */
const [DENT, BEVEL] = [0.005, 0.045];
/** The hollow's inner edge at `v` down the guard (0 to 1), in x: from under the point to the chin; its outer edge is CHEEK. */
const CHEEK = 0.94;
const [V0, V1] = [0.1, 0.95];
/**
 * How far in it reaches at most, and the power that squares it off (the user, 2026-11-13, on a
 * picture: a big panel each side, its inner edge straight down beside the middle, round at its ends).
 */
const [WIDE, SQUARE] = [0.6, 0.3];
const inner = (v: number) =>
  CHEEK - WIDE * Math.sin(Math.PI * clamp((v - V0) / (V1 - V0)) ** 0.8) ** SQUARE;
/** Where across a half of the shell (0 the middle, 1 its side) its columns meet the hollow's inner edge, its floor's two edges and its outer edge. */
const KNOTS = [0, 0.5, 0.6, 0.8, 0.9, 1];
/** How deep the guard is sunk at `x` across and `v` down. */
const dent = (x: number, v: number) => {
  const d = clamp(Math.min(Math.abs(x) - inner(v), CHEEK - Math.abs(x)) / BEVEL);
  return DENT * d * d * (3 - 2 * d);
};
/** Whether the guard is in front of the skull at `q` round from the front and `y` high. */
const covers = (q: number, y: number) =>
  q < AT && y > PB - 0.004 && y < PT + crest(q / AT) && (q < AB || y > edge(q) - 0.004);
/**
 * The guard's prow (the user, 2026-11-13: its very front stands out; then less, it stood out too
 * much): how far out of the skull its shell is pushed at `a` round and `y` high, most down its
 * middle and at the mouth and the chin.
 */
const PROW = 0.014;
const prow = (a: number, y: number) =>
  PROW *
  clamp(1 - Math.abs(a) / 1.0) ** 1.3 *
  // From the nose to the chin an arc (the user, 2026-11-13): furthest out at the mouth.
  (0.3 + 0.7 * Math.sin(Math.PI * clamp((PT + 0.014 - y) / (PT + 0.014 - PB + 0.004))));

/** The grooves at the mouth: their places round (radians), their bottom and top, their width (m). */
export const MOUTH = { a: [-0.1, 0, 0.1], y: [1.598, 1.624], w: 0.0026 };

/** The middle of the head: the normals point away from it. */
const MID: Vec3 = [0, 1.66, 0.03];

let made: number[] | undefined;
/** The head's axis, metres along z. */
let axis: number | undefined;

/** The hood and the guard in the man's rest pose: triangles of [x, y, z, nx, ny, nz, shade]. */
const make = (): number[] => {
  const mid: Vec3 = [0, 1.66, (skull(0, 1.66, 0)[2] + skull(Math.PI, 1.66, 0)[2]) / 2];
  Object.assign(MID, mid);
  const out: number[] = [];
  /** A quad of corners `p` and their normals `n`, turned to face the way they point. */
  const quad = (p: Vec3[], n: Vec3[], shade: number) => {
    const o =
      dot(cross(sub(p[1], p[0]), sub(p[2], p[0])), n[0]) < 0
        ? [0, 3, 2, 0, 2, 1]
        : [0, 1, 2, 0, 2, 3];
    o.forEach(i => out.push(...p[i], ...n[i], shade));
  };
  const e = 1e-3;
  /** The normal of the surface f at (u, v), out of the head, or into it with `side` -1. */
  const normal = (f: (u: number, v: number) => Vec3, u: number, v: number, side = 1): Vec3 => {
    const p = f(u, v);
    let n = cross(sub(f(u + e, v), f(u - e, v)), sub(f(u, v + e), f(u, v - e)));
    n = Math.hypot(...n) > 0.5 ? n : unit(sub(p, MID));
    return n.map(c => c * side * Math.sign(dot(n, sub(p, MID)) || 1)) as Vec3;
  };
  /** A grid of `cols` by `rows` quads over f(u, v), u and v in [0, 1]. */
  const sheet = (
    f: (u: number, v: number) => Vec3,
    cols: number,
    rows: number,
    shade: number,
    side = 1,
  ) => {
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const uv = [
          [c / cols, r / rows],
          [c / cols, (r + 1) / rows],
          [(c + 1) / cols, (r + 1) / rows],
          [(c + 1) / cols, r / rows],
        ];
        quad(
          uv.map(([u, v]) => f(u, v)),
          uv.map(([u, v]) => normal(f, u, v, side)),
          shade,
        );
      }
    }
  };
  const round = (u: number, from: number, to: number) => from + (to - from) * u;

  // The guard: its outer face, its inner one, and the rim round it.
  /** The guard `off` out of the skull, its prow in full (`k` 1) or none (0): its walls close it on the face. */
  const guard =
    (off: number, k = 1) =>
    (u: number, v: number) => {
      const [t, x] = [round(v, PT, PB), 2 * u - 1];
      const a = x * half(t);
      const y = t + CHIN * v ** 3 * x * x + crest(x) * (1 - v);
      return skull(a, y, off + (prow(a, y) - dent(x, v)) * k);
    };
  // Its columns follow the hollows' edges (KNOTS), so the bevels are whole quads: no staircase.
  sheet(
    (u, v) => {
      const m = Math.abs(2 * u - 1);
      const [w, i] = [CHEEK - inner(v), Math.min(KNOTS.findIndex(k => k >= m) || 1, 5)];
      const b = Math.min(BEVEL, w / 2);
      const xs = [0, CHEEK - w, CHEEK - w + b, CHEEK - b, CHEEK, 1];
      const x = xs[i - 1] + ((xs[i] - xs[i - 1]) * (m - KNOTS[i - 1])) / (KNOTS[i] - KNOTS[i - 1]);
      return guard(OUT)((1 + Math.sign(2 * u - 1) * x) / 2, v);
    },
    40,
    18,
    TEAM,
  );
  // Its walls, from its edge straight back to the face: a closed mask.
  const wall = (t: number) => guard(-0.003 + (OUT + 0.003) * t, t);
  sheet(guard(IN), 48, 8, 0.5, -1);
  const rim = (f: (w: number, t: number) => Vec3) => sheet(f, 1, 1, 0.75);
  for (let c = 0; c < 48; c++) {
    for (const v of [0, 1]) {
      const [u0, u1] = [c / 48, (c + 1) / 48];
      sheet((w, t) => wall(t)(round(w, u0, u1), v), 1, 1, 0.75);
    }
  }
  for (const u of [0, 1]) {
    for (let r = 0; r < 8; r++) {
      rim((w, t) => wall(t)(u, (r + w) / 8));
    }
  }

  // On the guard's face (or the hood's, `on` HOOD), 0.8 mm out, `a` round and `y` high, and its normal there.
  const face = (a: number, y: number, off = 0.0008, on = OUT): [Vec3, Vec3] => {
    const f = (u: number, v: number) => skull(u, v, on + off + (on == OUT ? prow(u, v) : 0));
    return [f(a, y), normal(f, a, y)];
  };
  /** A line `w` wide along the points `pts` ([a, y] each) on the guard or the hood, in pieces of 3 mm at most. */
  const line = (pts: [number, number][], w: number, shade: number, on = OUT) => {
    for (let i = 0; i + 1 < pts.length; i++) {
      const [[a0, y0], [a1, y1]] = [pts[i], pts[i + 1]];
      const n = Math.max(1, Math.ceil(Math.hypot((a1 - a0) * 0.085, y1 - y0) / 0.003));
      for (let k = 0; k < n; k++) {
        const [[p, np], [q, nq]] = [k / n, (k + 1) / n].map(t =>
          face(a0 + (a1 - a0) * t, y0 + (y1 - y0) * t, 0.0008, on),
        );
        const [sp, sq] = [cross(sub(q, p), np), cross(sub(q, p), nq)];
        quad(
          [add(p, sp, -w / 2), add(p, sp, w / 2), add(q, sq, w / 2), add(q, sq, -w / 2)],
          [np, np, nq, nq],
          shade,
        );
      }
    }
  };
  // 忍 on the hood each side, read from that side: its left toward the front on the right cheek, toward the back on the left.
  const [S, YK, AK] = [0.03, 1.745, 1.8];
  for (const side of [1, -1]) {
    for (const stroke of KANJI) {
      const pts: [number, number][] = [];
      for (let i = 0; i < stroke.length; i += 2) {
        pts.push([side * AK - ((stroke[i] - 0.5) * S) / 0.085, YK + (stroke[i + 1] - 0.5) * S]);
      }
      line(pts, 0.0024, TEAM, HOOD);
    }
  }
  /** A panel of black mesh over p(off)(u, v): the ink, `n` wires each way `w` wide (in u, v) on it, and a painted groove round it with `groove`. */
  const mesh = (
    p: (off: number) => (u: number, v: number) => Vec3,
    n: number,
    w: number,
    groove = false,
  ) => {
    sheet(p(0.0008), 6, 12, BLACK);
    for (let k = 1; k < 2 * n; k++) {
      const [c, wire] = [((k % n) + 0.5 * +(k > n)) / n, p(0.0013)];
      if (k != n) {
        sheet(
          (u, v) => (k < n ? wire(c + (v - 0.5) * w, u) : wire(u, c + (v - 0.5) * w)),
          8,
          1,
          WIRE,
        );
      }
    }
    for (const c of groove ? [0, 1] : []) {
      sheet((u, v) => p(0.0013)(c + (v - 0.5) * w * 2, u), 8, 1, GROOVE);
      sheet((u, v) => p(0.0013)(u, c + (v - 0.5) * w * 2), 8, 1, GROOVE);
    }
  };
  // The kite over the mouth: its point up the nose, its widest low; raised to the nose and smaller
  // (the user, 2026-11-13, on a picture).
  const KITE = [
    [0, 1.666],
    [0.008, 1.648],
    [0, 1.637],
    [-0.008, 1.648],
  ];
  mesh(
    off => (u, v) => {
      const k = [(1 - u) * (1 - v), u * (1 - v), u * v, (1 - u) * v];
      return face(
        KITE.reduce((s, c, i) => s + c[0] * k[i], 0) / 0.09,
        KITE.reduce((s, c, i) => s + c[1] * k[i], 0),
        off,
      )[0];
    },
    4,
    0.07,
    true,
  );
  // Three grooves down the guard at the mouth, under the kite (the user, 2026-11-13).
  for (const a of MOUTH.a) {
    line(
      [
        [a, MOUTH.y[0]],
        [a, MOUTH.y[1]],
      ],
      MOUTH.w,
      GROOVE,
    );
  }
  // The hollow on each cheek is the shell's own, plain in the team's colour (the user, 2026-11-13:
  // no mesh there).
  return out;
};

/**
 * Dresses the head of the skin `s` just drawn into `out` from `from` (skin(), in the order of its
 * triangles' corners), on the head joint at `at` turned by `q`: the hood painted on it (the head,
 * the neck and the skin at the neck's foot, but the opening round the eyes, soft at its edge), and
 * the face under the guard pressed in behind it.
 */
export const dress = (out: number[], from: number, s: Skin, at: Vec3, q: Quat, build = 0) => {
  const o = bindOf(0)[J.HEAD];
  const k = build ? HEAD_SCALE : 1;
  const back: Quat = [-q[0], -q[1], -q[2], q[3]];
  const cz = (axis ??= (skull(0, 1.66, 0)[2] + skull(Math.PI, 1.66, 0)[2]) / 2);
  for (let h = 0; h < s.t.length; h++) {
    const i = s.t[h];
    const [j0, j1] = [s.j[i * 2], s.j[i * 2 + 1]];
    const onHead = j0 == J.HEAD || j1 == J.HEAD || j0 == J.NECK || j1 == J.NECK;
    if (!onHead && s.c[h] != REGION.FLESH) {
      continue;
    }
    const w = from + h * STRIDE;
    const l = turn(back, [out[w] - at[0], out[w + 1] - at[1], out[w + 2] - at[2]]);
    const [x, y, z] = [l[0] / k + o[0], l[1] / k + o[1], l[2] / k + o[2]];
    if (!onHead && (y > 1.56 || y < 1.38)) {
      continue;
    }
    const a = Math.atan2(x, cz - z);
    const qa = Math.abs(a);
    // How far inside the opening, metres: bare beyond 12 mm, eased, the hood's black outside it.
    const inside = Math.min(y - under(a), arch(a) - y, (SLIT - qa) * 0.08);
    const bare = clamp(inside / 0.012) ** 2 * (3 - 2 * clamp(inside / 0.012));
    for (const c of [6, 7, 9]) {
      out[w + c] = CLOTH[c == 9 ? 2 : c - 6] + (out[w + c] - CLOTH[c == 9 ? 2 : c - 6]) * bare;
    }
    // Under the guard: drawn in behind its inner face.
    if (covers(qa, y)) {
      const p = skull(a, y, IN - 0.002 + prow(a, y));
      const [r, d] = [Math.hypot(p[0], p[2] - cz), Math.hypot(x, z - cz)];
      if (d > r) {
        const f = r / d;
        const m = turn(q, [(x * f - o[0]) * k, (y - o[1]) * k, (cz + (z - cz) * f - o[2]) * k]);
        [out[w], out[w + 1], out[w + 2]] = [at[0] + m[0], at[1] + m[1], at[2] + m[2]];
      }
    }
  }
};

/** Appends the guard and the ideograms on the head joint at `at` turned by `q` (see solve()), on the woman's smaller head with `build`, in the team's `color`. */
export const mask = (out: number[], at: Vec3, q: Quat, build = 0, color = GUARD) => {
  const m = (made ??= make());
  const o = bindOf(0)[J.HEAD];
  const k = build ? HEAD_SCALE : 1;
  let w = out.length;
  for (let i = 0; i < m.length; i += 7, w += 10) {
    const p = turn(q, [(m[i] - o[0]) * k, (m[i + 1] - o[1]) * k, (m[i + 2] - o[2]) * k]);
    const n = turn(q, [m[i + 3], m[i + 4], m[i + 5]]);
    const shade = m[i + 6];
    const rgb =
      shade == TEAM
        ? color
        : shade == WIRE
          ? GUARD.map(c => c * 2.6)
          : shade == BLACK
            ? INK
            : shade == GROOVE
              ? color.map(c => c * 0.45)
              : GUARD.map(c => (c * shade) / 0.9);
    out[w] = at[0] + p[0];
    out[w + 1] = at[1] + p[1];
    out[w + 2] = at[2] + p[2];
    out[w + 3] = n[0];
    out[w + 4] = n[1];
    out[w + 5] = n[2];
    out[w + 6] = rgb[0];
    out[w + 7] = rgb[1];
    out[w + 8] = -1;
    out[w + 9] = rgb[2];
  }
};
