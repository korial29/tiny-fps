// The ninja's hood and face guard (the user, 2026-11-12). The hood is cloth of its own over the head
// on a near runner (COWL: a shell off the skull with a hem over the brows, a seam, folds; the ears
// drawn in under it), and on every runner it is painted on the head's own skin
// (dress()), black from the neck to the crown but round the eyes and down the upper cheeks, so it
// takes the face's shape; the ideogram 忍 (shinobi) in the team's colour on it behind each temple. The
// guard over the mouth is a piece of its own in the sash's grey, brushed metal (reshaped on the user's
// pictures, 2026-11-13 and 2026-11-17): its top edge level under the eyes with a small peak up the
// nose, swept up in a hollow curve to a tall point by each temple; its sides round the cheeks, drawn
// in to a narrow chin; jutting out down its middle, with a kite of black mesh under the nose, three
// grooves at the mouth,
// and a big hollow on each cheek sunk in the shell inside a thin rim, its floor black mesh; the face
// under it is pressed in. Built once, carried by the head joint like the hair
// (hair.ts), the woman's scaled to her head.
import { HEAD_SCALE } from './hair';
import { JOINT as J, turn } from './rig';
import type { Quat } from './rig';
import type { Vec3 } from './mesh';
import { STRIDE, TWILL, WEAVE } from './mesh';
import { REGION, TOP, bindOf, scalp } from './skin';
import type { Skin } from './skin';
import { room } from './verts';
import type { Out } from './verts';

/** The suit's and the hood's black, a touch of blue in it; the guard's rim, a shade lighter; the disc's ink. */
export const CLOTH = [0.035, 0.036, 0.042];
const [GUARD, INK] = [
  [0.06, 0.062, 0.07],
  [0.012, 0.012, 0.014],
];
/** Shades that are no shade: the team's colour, the meshes' ink, their wire, and the team's colour in a groove. */
const [TEAM, BLACK, WIRE, GROOVE, SIGN] = [-1, -2, -3, -4, -5];
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
const under = (a: number) => PT + sweep(a / AT);
/** The guard over the mouth: its top (under the eyes) and bottom (under the chin, the user 2026-11-13), and its half widths there (radians round; then wider, over the jaw and the cheeks). */
const [PT, PB, AT, AB] = [1.662, 1.575, 1.25, 0.85];
/** How high its points beside the eyes stand over its top, and the power that rounds its sides out over the cheeks. */
const [HORN, ROUND] = [0.058, 0.55];
const half = (y: number) => AB + (AT - AB) * clamp((y - PB) / (PT - PB)) ** ROUND;
/**
 * How far its top edge rises at `x` across it (-1 to 1): a small peak up the bridge of the nose,
 * `NOSE` high, down to `LOW`, then level under the eye and a hollow sweep up to a tall point at each
 * end, by the temple (the user, 2026-11-17, on a picture: it went straight up from the cheekbone).
 */
const [NOSE, LOW] = [0.02, 0.3];
const sweep = (x: number) => HORN * clamp((Math.abs(x) - LOW) / (1 - LOW)) ** 2.1;
const crest = (x: number) => NOSE * clamp(1 - Math.abs(x) / LOW) ** 1.5 + sweep(x);
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

/**
 * The hood's cloth (the user, 2026-11-17: it was paint on the head): a shell of its own off the
 * skull, `off` out at rest, a seam `SEAM` proud over the crown from the brow to the nape, hanging
 * `DRAPE` looser down the back of the head, with soft folds there, down to `NECK` round the throat.
 * Tucked in behind the guard. A far runner's is the paint alone.
 */
const COWL = { off: 0.006, seam: 0.0035, drape: 0.011, fold: 0.003, neck: 1.558, hem: 0.0045 };
const cowl = (a: number, y: number) => {
  if (covers(Math.abs(a), y)) {
    return 0.001;
  }
  const low = clamp((1.7 - y) / 0.12);
  return (
    COWL.off +
    // The seam is as wide in metres all the way: by the angle it was a knob on the crown.
    COWL.seam * Math.exp(-((skull(a, y, 0)[0] / 0.008) ** 2)) * clamp((y - 1.7) / 0.03) +
    COWL.drape * ((1 - Math.cos(a)) / 2) * low * low +
    COWL.fold * Math.sin(y * 230 + 2.5 * Math.cos(2 * a)) * low * (0.35 + 0.65 * Math.sin(a) ** 2)
  );
};
/** Where the ears are, drawn in under the cloth: from and to round the head (radians), and their bottom and top. */
const EARS = [1.3, 2.1, 1.6, 1.74];
/** The cloth's grey, as a shade of the guard's rim: a little lighter than the suit, so its folds show. */
const WOVEN = 1;

/** The grooves at the mouth: their places round (radians), their bottom and top, their width (m). */
export const MOUTH = { a: [-0.1, 0, 0.1], y: [1.598, 1.624], w: 0.0026 };

/** The middle of the head: the normals point away from it. */
const MID: Vec3 = [0, 1.66, 0.03];

/** Built once at each level: the full one and the far one (`mask()`'s `far`). */
const made: number[][] = [];
/**
 * A far runner's guard: its quads across and down its face (its columns still on the hollows'
 * edges, KNOTS), round and down its inner face and its walls, and the longest piece of a line.
 */
const FAR = { cols: 20, rows: 6, round: 16, down: 2, piece: 0.009 };
/** The head's axis, metres along z. */
let axis: number | undefined;

/** The hood and the guard in the man's rest pose: triangles of [x, y, z, nx, ny, nz, shade]. Coarser `far`. */
const make = (far: boolean): number[] => {
  const [COLS, ROWS, ROUND, DOWN, PIECE] = far
    ? [FAR.cols, FAR.rows, FAR.round, FAR.down, FAR.piece]
    : [40, 18, 48, 8, 0.003];
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
    COLS,
    ROWS,
    TEAM,
  );
  // Its walls, from its edge straight back to the face: a closed mask.
  const wall = (t: number) => guard(-0.003 + (OUT + 0.003) * t, t);
  sheet(guard(IN), ROUND, DOWN, 0.5, -1);
  const rim = (f: (w: number, t: number) => Vec3) => sheet(f, 1, 1, 0.75);
  for (let c = 0; c < ROUND; c++) {
    for (const v of [0, 1]) {
      const [u0, u1] = [c / ROUND, (c + 1) / ROUND];
      sheet((w, t) => wall(t)(round(w, u0, u1), v), 1, 1, 0.75);
    }
  }
  for (const u of [0, 1]) {
    for (let r = 0; r < DOWN; r++) {
      rim((w, t) => wall(t)(u, (r + w) / DOWN));
    }
  }

  // The hood's cloth: over the brows and the crown, round the sides and the back down to the neck,
  // and under the guard round the throat; a rolled hem along its edge over the brows, thinner as it
  // goes in behind the guard.
  const cloth =
    (a0: number, a1: number, lo: (a: number) => number, hi: number) => (u: number, v: number) => {
      const a = round(u, a0, a1);
      const y = round(1 - (1 - v) ** 2, lo(a), hi);
      return skull(a, y, cowl(a, y));
    };
  if (!far) {
    sheet(cloth(-SLIT, SLIT, arch, TOP - 0.002), 32, 10, WOVEN);
    sheet(
      cloth(SLIT, 2 * Math.PI - SLIT, () => COWL.neck, TOP - 0.002),
      48,
      26,
      WOVEN,
    );
    // In front it stops at the guard's bottom (the user, 2026-11-17: a black veil hung before the
    // neck: the skull's base straight down under the chin, off the throat).
    sheet(
      cloth(-SLIT, SLIT, () => PB - 0.003, PT),
      24,
      6,
      WOVEN,
    );
    sheet(
      (u, v) => {
        const a = round(u, -SLIT, SLIT);
        const [y, t] = [arch(a), Math.PI * v];
        const r = COWL.hem * clamp((y - PT - crest(a / AT)) / 0.012);
        return skull(
          a,
          y + r * (1 - Math.cos(t)) - 0.001,
          t ? COWL.off + 0.7 * r * Math.sin(t) : 0,
        );
      },
      24,
      5,
      WOVEN,
    );
  }
  // On the guard's face (or the hood's, `on` HOOD), 0.8 mm out, `a` round and `y` high, and its normal there.
  const face = (a: number, y: number, off = 0.0008, on = OUT): [Vec3, Vec3] => {
    const f = (u: number, v: number) =>
      skull(u, v, off + (on == OUT ? on + prow(u, v) : far ? on : cowl(u, v)));
    return [f(a, y), normal(f, a, y)];
  };
  /** A line `w` wide along the points `pts` ([a, y] each) on the guard or the hood, in pieces of PIECE at most. */
  const line = (pts: [number, number][], w: number, shade: number, on = OUT) => {
    for (let i = 0; i + 1 < pts.length; i++) {
      const [[a0, y0], [a1, y1]] = [pts[i], pts[i + 1]];
      const n = Math.max(1, Math.ceil(Math.hypot((a1 - a0) * 0.085, y1 - y0) / PIECE));
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
      line(pts, 0.0024, SIGN, HOOD);
    }
  }
  /**
   * A panel of black mesh over p(off)(u, v): the ink, `nu` wires down it and `nv` across, `wu` and
   * `wv` wide (in u, in v), and a painted groove round it with `groove`. No wire with `bare`.
   */
  const mesh = (
    p: (off: number) => (u: number, v: number) => Vec3,
    [nu, nv]: number[],
    [wu, wv]: number[],
    groove = false,
    bare = false,
  ) => {
    sheet(p(0.0008), far ? 2 : 6, far ? 3 : 12, BLACK);
    const wire = p(0.0013);
    for (let k = 1; k < nu && !bare; k++) {
      sheet((u, v) => wire(k / nu + (v - 0.5) * wu, u), far ? 2 : 8, 1, WIRE);
    }
    for (let k = 1; k < nv && !bare; k++) {
      sheet((u, v) => wire(u, (k + 0.5) / nv + (v - 0.5) * wv), far ? 2 : 8, 1, WIRE);
    }
    for (const c of groove ? [0, 1] : []) {
      sheet((u, v) => wire(c + (v - 0.5) * wu * 2, u), far ? 2 : 8, 1, GROOVE);
      sheet((u, v) => wire(u, c + (v - 0.5) * wv * 2), far ? 2 : 8, 1, GROOVE);
    }
  };
  // The kite over the mouth: its point up the nose, its widest low; raised to the nose and smaller
  // (the user, 2026-11-13, on a picture).
  const KITE = [
    [0, 1.668],
    [0.0105, 1.645],
    [0, 1.632],
    [-0.0105, 1.645],
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
    [5, 5],
    [0.06, 0.06],
    true,
  );
  // Three grooves down the guard at the mouth, under the kite (the user, 2026-11-13; kept, 2026-11-17).
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
  // The floor of the hollow on each cheek is black mesh too (the user, 2026-11-17, on a picture; it
  // was plain), the shell's rim left round it. A far runner's has no wire.
  for (const side of [1, -1]) {
    mesh(
      off => (u, v) => {
        const t = V0 + (V1 - V0) * v;
        const w = CHEEK - inner(t);
        const b = Math.min(BEVEL, w / 2);
        return guard(OUT + off)((1 + side * (CHEEK - w + b + (w - 2 * b) * u)) / 2, t);
      },
      [8, 18],
      [0.045, 0.018],
      false,
      far,
    );
  }
  return out;
};

/**
 * Dresses the head of the skin `s` just drawn into `out` from `from` (skin(), in the order of its
 * triangles' corners), on the head joint at `at` turned by `q`: the hood painted on it (the head,
 * the neck and the skin at the neck's foot, but the opening round the eyes, soft at its edge), and
 * the face under the guard pressed in behind it.
 */
export const dress = (out: Out, from: number, s: Skin, at: Vec3, q: Quat, build = 0) => {
  const o = bindOf(0)[J.HEAD];
  const k = build ? HEAD_SCALE : 1;
  const back: Quat = [-q[0], -q[1], -q[2], q[3]];
  const cz = (axis ??= (skull(0, 1.66, 0)[2] + skull(Math.PI, 1.66, 0)[2]) / 2);
  // A vertex is the corner of some six triangles, all at the same place: each is worked out once.
  const n = s.w.length;
  if (DONE.length < n) {
    [DONE, BARE, PRESS] = [new Int32Array(n), new Float64Array(n), new Float64Array(n * 3)];
  }
  const stamp = ++dressed;
  const buf = room(out, 0);
  for (let h = 0; h < s.t.length; h++) {
    const i = s.t[h];
    const [j0, j1] = [s.j[i * 2], s.j[i * 2 + 1]];
    const onHead = j0 == J.HEAD || j1 == J.HEAD || j0 == J.NECK || j1 == J.NECK;
    if (!onHead && s.c[h] != REGION.FLESH) {
      continue;
    }
    const w = from + h * STRIDE;
    if (DONE[i] != stamp) {
      DONE[i] = stamp;
      BARE[i] = -1;
      PRESS[i * 3] = NaN;
      const l = turn(back, [buf[w] - at[0], buf[w + 1] - at[1], buf[w + 2] - at[2]]);
      const [x, y, z] = [l[0] / k + o[0], l[1] / k + o[1], l[2] / k + o[2]];
      if (!onHead && (y > 1.56 || y < 1.38)) {
        continue;
      }
      const a = Math.atan2(x, cz - z);
      const qa = Math.abs(a);
      // How far inside the opening, metres: bare beyond 12 mm, eased, the hood's black outside it.
      const inside = Math.min(y - under(a), arch(a) - y, (SLIT - qa) * 0.08);
      BARE[i] = clamp(inside / 0.012) ** 2 * (3 - 2 * clamp(inside / 0.012));
      // Under the guard: drawn in behind its inner face. Under the hood's cloth: what stands out
      // of the skull (the ears) is drawn in under it.
      const guarded = covers(qa, y);
      // Only what the head alone carries: a vertex the neck shares is elsewhere on a turned head
      // than at rest, where the shader's skin is dressed (flesh.ts), and the two fell apart there.
      const whole = (j0 == J.HEAD ? 1 - s.w[i] : 0) + (j1 == J.HEAD ? s.w[i] : 0) > 0.999;
      const ear = whole && !BARE[i] && qa > EARS[0] && qa < EARS[1] && y > EARS[2] && y < EARS[3];
      if (guarded || ear) {
        const p = skull(a, y, guarded ? IN - 0.002 + prow(a, y) : 0.003);
        const [r, d] = [Math.hypot(p[0], p[2] - cz), Math.hypot(x, z - cz)];
        if (d > r) {
          const f = r / d;
          const m = turn(q, [(x * f - o[0]) * k, (y - o[1]) * k, (cz + (z - cz) * f - o[2]) * k]);
          [PRESS[i * 3], PRESS[i * 3 + 1], PRESS[i * 3 + 2]] = [
            at[0] + m[0],
            at[1] + m[1],
            at[2] + m[2],
          ];
        }
      }
    }
    const bare = BARE[i];
    if (bare < 0) {
      continue;
    }
    buf[w + 6] = CLOTH[0] + (buf[w + 6] - CLOTH[0]) * bare;
    buf[w + 7] = CLOTH[1] + (buf[w + 7] - CLOTH[1]) * bare;
    buf[w + 9] = CLOTH[2] + (buf[w + 9] - CLOTH[2]) * bare;
    if (PRESS[i * 3] === PRESS[i * 3]) {
      [buf[w], buf[w + 1], buf[w + 2]] = [PRESS[i * 3], PRESS[i * 3 + 1], PRESS[i * 3 + 2]];
    }
  }
};
/** dress()'s work per vertex of the skin: the call that did it, its bare share (-1: none), and where it is pressed in (NaN: not). */
let [DONE, BARE, PRESS] = [new Int32Array(0), new Float64Array(0), new Float64Array(0)];
let dressed = 0;

/** What the last dress() made of each of the `n` vertices of its skin: its bare share (-1: none), where it was pressed in (NaN: not). */
export const dressedOf = (n: number): [Float64Array, Float64Array] => {
  const [bare, press] = [new Float64Array(n).fill(-1), new Float64Array(n * 3).fill(NaN)];
  for (let i = 0; i < n; i++) {
    if (DONE[i] == dressed) {
      bare[i] = BARE[i];
      press.set(PRESS.subarray(i * 3, i * 3 + 3), i * 3);
    }
  }
  return [bare, press];
};

/** Appends the guard and the ideograms on the head joint at `at` turned by `q` (see solve()), on the woman's smaller head with `build`, in the team's `color`. */
export const mask = (
  out: Out,
  at: Vec3,
  q: Quat,
  build = 0,
  color = GUARD,
  /** A far runner's: fewer quads. */
  far = false,
  /** The guard's shell, when not in `color` (the user, 2026-11-17: the sash's grey); the ideograms stay in `color`. */
  shell = color,
) => {
  const m = (made[+far] ??= make(far));
  const o = bindOf(0)[J.HEAD];
  const k = build ? HEAD_SCALE : 1;
  let w = out.length;
  const dst = room(out, (m.length / 7) * STRIDE);
  const [wire, groove] = [GUARD.map(c => c * 2.6), shell.map(c => c * 0.45)];
  const [qx, qy, qz, qw] = q;
  for (let i = 0; i < m.length; i += 7, w += 10) {
    // turn() written out, twice, in plain numbers: the guard is some nine thousand vertices a frame.
    const x = (m[i] - o[0]) * k;
    const y = (m[i + 1] - o[1]) * k;
    const z = (m[i + 2] - o[2]) * k;
    const tx = 2 * (qy * z - qz * y);
    const ty = 2 * (qz * x - qx * z);
    const tz = 2 * (qx * y - qy * x);
    dst[w] = at[0] + (x + qw * tx + qy * tz - qz * ty);
    dst[w + 1] = at[1] + (y + qw * ty + qz * tx - qx * tz);
    dst[w + 2] = at[2] + (z + qw * tz + qx * ty - qy * tx);
    const nx = m[i + 3];
    const ny = m[i + 4];
    const nz = m[i + 5];
    const sx = 2 * (qy * nz - qz * ny);
    const sy = 2 * (qz * nx - qx * nz);
    const sz = 2 * (qx * ny - qy * nx);
    dst[w + 3] = nx + qw * sx + qy * sz - qz * sy;
    dst[w + 4] = ny + qw * sy + qz * sx - qx * sz;
    dst[w + 5] = nz + qw * sz + qx * sy - qy * sx;
    const shade = m[i + 6];
    const rgb =
      shade == TEAM
        ? shell
        : shade == SIGN
          ? color
          : shade == WIRE
            ? wire
            : shade == BLACK
              ? INK
              : shade == GROOVE
                ? groove
                : GUARD.map(c => (c * shade) / 0.9);
    dst[w + 6] = rgb[0];
    dst[w + 7] = rgb[1];
    // The shell is brushed metal (the user, 2026-11-17), the hood's cloth woven; the rest is matte.
    dst[w + 8] = shade == TEAM ? TWILL : shade == WOVEN ? WEAVE : -1;
    dst[w + 9] = rgb[2];
  }
  out.length = w;
};
