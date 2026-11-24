// What the ninja wears on his sash (armor.ts's BELT; the user, 2026-11-24, on a picture: in place of
// the knot and its two ends of 2026-11-17), on him and on her: the throwing blades tucked in it on
// the right hip (blades(), rigid on the pelvis), and the cloth that hangs from under it (drape(),
// drawn each frame): a wide quilted tabard down the middle of the front in his team's colour, edged
// in black, and a black skirt in three panels round the hips and the back. The cloth hangs by the
// world's down from the pelvis and is kept out of the hips and the legs, so a thigh that comes up
// lifts it. On the own body and the others'.
import { SHINE, STRIDE, capsule, dress, place, smooth, unit } from './mesh';
import type { Vec3 } from './mesh';
import { JOINT as J, rest, solve, turn } from './rig';
import type { Quat } from './rig';
import { room } from './verts';
import type { Out } from './verts';

/**
 * The throwing blades tucked in the sash on the right hip (the user, 2026-11-17): a leaf of
 * polished steel point down, a wrapped grip and a ring over the sash's top. Their places round the
 * waist from the front (radians), the waist's half width and its depth on him and on her, how far
 * out of the waist they stand (on the sash), and their blade's and grip's lengths.
 */
const KUNAI = {
  a: [0.62, 0.84, 1.06],
  wide: 0.172,
  deep: [0.134, 0.126],
  blade: 0.075,
  grip: 0.04,
  off: 0.031,
};
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

/** The height at rest of the sash's middle, where the blades are tucked in. */
export const SASH_Y = 1.018;
/** The pelvis' height at rest. */
const PELVIS_Y = solve(rest()).pos[J.PELVIS][1];

/** Appends the blades for build b's pelvis at `at` turned by `q`. */
export const blades = (out: Out, at: Vec3, q: Quat, b: number) => {
  const deep = KUNAI.deep[b];
  for (const a of KUNAI.a) {
    const [sn, cs] = [Math.sin(a), Math.cos(a)];
    // Out of the waist there, down the body leaning a little back, and across.
    const n = unit([sn * deep, 0, -cs * KUNAI.wide]);
    const down = turn(q, unit([0.12 * cs, -1, 0.12 * sn]));
    const outw = turn(q, n);
    const across = turn(q, [-n[2], 0, n[0]]);
    const k = turn(q, [
      KUNAI.wide * sn + n[0] * KUNAI.off,
      SASH_Y - PELVIS_Y + 0.03,
      -deep * cs + n[2] * KUNAI.off,
    ]);
    const c: Vec3 = [at[0] + k[0], at[1] + k[1], at[2] + k[2]];
    const f = [across, outw, down];
    place(out, LEAF, c, f, [0, 0, 0], [0.013, 0.0028, KUNAI.blade]);
    place(out, GRIP, c, f, [0, 0, -KUNAI.grip], [0.0045, 0.0045, KUNAI.grip]);
    place(out, RING, c, f, [0, 0, -KUNAI.grip - 0.008], [0.009, 0.003, 0.009]);
  }
};

/**
 * The body the cloth is kept out of, in the pelvis' frame (x across, y up, -z the front), measured
 * on the skin at rest: the waist's half width, depth in front and behind, on him and on her, where
 * the cloth is hung (`y` from the pelvis, under the sash's bottom); the hips' the same, `drop` under
 * it, the body's ending `end` under it (the legs' capsules from there); the radii of a thigh and of
 * a shin at their two ends.
 */
export const HIPS = {
  y: 0.012,
  waist: [
    [0.182, 0.126, 0.122],
    [0.186, 0.122, 0.12],
  ],
  hips: [
    [0.197, 0.128, 0.156],
    [0.21, 0.128, 0.16],
  ],
  drop: 0.07,
  end: 0.2,
  thigh: [0.125, 0.082],
  shin: [0.07, 0.052],
};
/**
 * The tabard: its width, its length, the width of its black edge, the size of a diamond of its
 * quilting across and down and how far it puffs out; how far off the body it hangs, and how far
 * down its top is bent round the waist (under the sash); its pieces down
 * (close and near, far).
 */
export const TABARD = {
  w: 0.112,
  len: 0.41,
  edge: 0.009,
  quilt: [0.0313, 0.046],
  puff: 0.0045,
  off: 0.008,
  wrap: 0.09,
  rows: [8, 3],
};
/**
 * The skirt: its panels' two ends round the waist from the front (degrees: one over each hip, one
 * round the back, split at the sides), its length, how far it flares in front and behind (not at
 * the sides: the hands hang there, their palms 23 cm from the middle), how far off the body it is
 * hung and is kept (more: a piece is straight, the body under it round), and how much less at the
 * very sides, where the thigh's capsule is wider than the thigh (the user, 2026-11-24: narrower,
 * clear of the hands); its columns a panel and its pieces down
 * (close, near, far).
 */
export const SKIRT = {
  panels: [
    [-88, -20],
    [20, 88],
    [94, 266],
  ],
  len: 0.3,
  flare: 0.05,
  off: 0.006,
  clear: 0.016,
  side: 0.028,
  cols: [
    [6, 9],
    [4, 6],
    [2, 3],
  ],
  rows: [5, 4, 2],
};
/** The cloth's black, a shade over the suit's so it shows on it, and the tabard's edge and lining. */
const CLOTH = [0.085, 0.085, 0.098];
const EDGE = [0.06, 0.06, 0.07];
/** The speed (m/s) at which the cloth trails in full. */
const FAST = 7;

/** The legs' four capsules in the pelvis' frame: two ends, two radii, eight numbers each. */
const CAPS = new Float64Array(32);
const LEGS = [
  [J.THIGH_L, J.SHIN_L],
  [J.SHIN_L, J.FOOT_L],
  [J.THIGH_R, J.SHIN_R],
  [J.SHIN_R, J.FOOT_R],
];
const sm = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

/**
 * How far the point (x, y, z) of the pelvis' frame has to go along the level direction (ux, uz) to
 * be `m` clear of the body: the trunk from the waist to the hips, then the legs.
 */
const clear = (x: number, y: number, z: number, ux: number, uz: number, m: number) => {
  let s = 0;
  const waist = HIPS.waist[ENV[4]];
  const hips = HIPS.hips[ENV[4]];
  const dy = HIPS.y - y;
  if (dy < HIPS.end) {
    const k = sm(0, HIPS.drop, dy);
    // Out of the body's end under the hips over a few centimetres: no step there.
    const e = m - 0.06 * sm(HIPS.end - 0.05, HIPS.end, dy);
    const d = uz > 0 ? 2 : 1;
    const w = waist[0] + (hips[0] - waist[0]) * k + e;
    const h = waist[d] + (hips[d] - waist[d]) * k + e;
    // The ellipse as a circle: the half chord from the point along the direction.
    const a = (ux * ux) / (w * w) + (uz * uz) / (h * h);
    const b = (x * ux) / (w * w) + (z * uz) / (h * h);
    const c = (x * x) / (w * w) + (z * z) / (h * h) - 1;
    if (c < 0) {
      s = (Math.sqrt(b * b - a * c) - b) / a;
    }
  }
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < 32; i += 8) {
      const px = x + s * ux - CAPS[i];
      const py = y - CAPS[i + 1];
      const pz = z + s * uz - CAPS[i + 2];
      const ex = CAPS[i + 3] - CAPS[i];
      const ey = CAPS[i + 4] - CAPS[i + 1];
      const ez = CAPS[i + 5] - CAPS[i + 2];
      const t = Math.min(
        Math.max((px * ex + py * ey + pz * ez) / (ex * ex + ey * ey + ez * ez || 1), 0),
        1,
      );
      const r = CAPS[i + 6] + (CAPS[i + 7] - CAPS[i + 6]) * t + m;
      const wx = px - ex * t;
      const wy = py - ey * t;
      const wz = pz - ez * t;
      const far = wx * wx + wy * wy + wz * wz - r * r;
      if (far < 0) {
        const wu = wx * ux + wz * uz;
        s += -wu + Math.sqrt(wu * wu - far);
      }
    }
  }
  return s;
};

/** A hung column's points in the pelvis' frame, three numbers each: the most a chain has, and one more. */
const CHAIN = new Float64Array(3 * 16);
/** The world's down in the pelvis' frame, the build (4), the pose's clock (6) and how much the cloth trails, back along the pelvis' z (7). */
const ENV = new Float64Array(8);

/**
 * Hangs a chain of `n` pieces, `len` long in all, from (x, y, z) of the pelvis' frame into CHAIN:
 * each piece goes down (ENV), `flare` out along the level direction (ux, uz), trails behind him and
 * wavers on its phase `ph`; then it is put clear of the body (by `m0` at its top, `m` lower) along that direction, at each of
 * the places `half` either side of it across (the tabard is as wide as a thigh).
 */
const hang = (
  x: number,
  y: number,
  z: number,
  ux: number,
  uz: number,
  n: number,
  len: number,
  flare: number,
  m0: number,
  m: number,
  half: number,
  ph: number,
) => {
  const fly = ENV[7];
  const l = len / n;
  CHAIN[0] = x;
  CHAIN[1] = y;
  CHAIN[2] = z;
  for (let i = 1; i <= n; i++) {
    const k = i / n;
    const wave = (0.02 + 0.1 * fly) * k * Math.sin(ENV[6] * (2.1 + 7 * fly) - i * 0.9 + ph);
    let dx = ENV[0] + ux * (flare + wave);
    let dy = ENV[1];
    let dz = ENV[2] + uz * (flare + wave) + fly * 0.3;
    const o = i * 3;
    let px = 0;
    let py = 0;
    let pz = 0;
    // Out of the body, back to the piece's length, and out again: a raised thigh lifts it.
    for (let pass = 0; pass < 2; pass++) {
      const dl = l / (Math.sqrt(dx * dx + dy * dy + dz * dz) || 1);
      px = CHAIN[o - 3] + dx * dl;
      py = CHAIN[o - 2] + dy * dl;
      pz = CHAIN[o - 1] + dz * dl;
      // Close to the body under the sash, `m` clear of it from under its bottom.
      const mi = m0 + (m - m0) * sm(0.01, 0.05, y - py);
      let s = clear(px, py, pz, ux, uz, mi);
      if (half) {
        s = Math.max(
          s,
          clear(px - uz * half, py, pz + ux * half, ux, uz, mi),
          clear(px + uz * half, py, pz - ux * half, ux, uz, mi),
        );
      }
      px += ux * s;
      pz += uz * s;
      dx = px - CHAIN[o - 3];
      dy = py - CHAIN[o - 2];
      dz = pz - CHAIN[o - 1];
    }
    CHAIN[o] = px;
    CHAIN[o + 1] = py;
    CHAIN[o + 2] = pz;
  }
};

/** A corner of the tabard's quilting at rest: across from its middle, down from its top, how far it puffs out, its normal's lean across and down, its shade. */
type Knot = number[];
/** The tabard's front at rest, three knots a triangle: the diamonds of its quilting cut to it, or with `flat` two triangles a piece of `rows`; then its black edge down each side and along its bottom. */
const quilting = (flat: boolean, rows: number): Knot[] => {
  const [w, len, e] = [TABARD.w / 2 - TABARD.edge, TABARD.len - TABARD.edge, TABARD.w / 2];
  const out: Knot[] = [];
  /** A flat band across from u0 to u1, cut at each piece down to `to`, `h` out, of shade `sh`. */
  const band = (u0: number, u1: number, from: number, to: number, h: number, sh: number) => {
    for (let i = 0; i < rows; i++) {
      const [v0, v1] = [i, i + 1].map(k => from + ((to - from) * k) / rows);
      const at = (u: number, v: number) => [u, v, h, 0, 0, sh];
      out.push(at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v0), at(u1, v1), at(u0, v1));
    }
  };
  if (flat) {
    band(-w, w, 0, len, 0, 0.85);
  } else {
    const [qu, qv] = [TABARD.quilt[0] / 2, TABARD.quilt[1] / 2];
    // Cut to the cloth: each side in turn (Sutherland-Hodgman).
    const cut = (poly: Knot[], j: number, sign: number, lim: number) => {
      const res: Knot[] = [];
      poly.forEach((p, i) => {
        const q = poly[(i + 1) % poly.length];
        const [fp, fq] = [(lim - p[j]) * sign, (lim - q[j]) * sign];
        if (fp >= 0) {
          res.push(p);
        }
        if (fp >= 0 != fq >= 0) {
          res.push(p.map((x, k) => x + ((q[k] - x) * fp) / (fp - fq)));
        }
      });
      return res;
    };
    for (let r = 0; r * qv < len + qv; r++) {
      for (let c = -3; c <= 3; c++) {
        const u = (c * 2 + (r % 2)) * qu;
        const v = r * qv;
        // Seams darker and leaning away from the diamond's middle: a pillow. Flat under the sash,
        // where it is hung.
        const mid = [u, v, TABARD.puff * sm(0.015, 0.05, v), 0, 0, 0.92];
        const tips = [
          [u - qu, v, 0, -0.8, 0, 0.5],
          [u, v + qv, 0, 0, 0.8, 0.5],
          [u + qu, v, 0, 0.8, 0, 0.5],
          [u, v - qv, 0, 0, -0.8, 0.5],
        ];
        tips.forEach((p, i) => {
          const poly = cut(
            cut(cut(cut([mid, p, tips[(i + 1) % 4]], 0, 1, w), 0, -1, -w), 1, 1, len),
            1,
            -1,
            0,
          );
          for (let k = 1; k + 1 < poly.length; k++) {
            out.push(poly[0], poly[k], poly[k + 1]);
          }
        });
      }
    }
  }
  // The edge down each side and along the bottom (shade 0: drawn black), and the lining, a hair behind.
  band(-e, -w, 0, len, 0.002, 0);
  band(w, e, 0, len, 0.002, 0);
  band(-e, e, len, TABARD.len, 0.002, 0);
  band(-e, e, 0, TABARD.len, -0.003, 0);
  return out;
};
/** The tabard's knots as numbers, six a corner: close and near, then far. */
const QUILTS = [false, true].map(flat =>
  Float64Array.from(quilting(flat, TABARD.rows[+flat]).flat()),
);

/** Turns (x, y, z) by the quaternion in Q (or back, by its inverse, with `s` -1) into V. */
const Q = new Float64Array(4);
const V = new Float64Array(3);
const spin = (x: number, y: number, z: number, s: number) => {
  const qx = Q[0] * s;
  const qy = Q[1] * s;
  const qz = Q[2] * s;
  const tx = 2 * (qy * z - qz * y);
  const ty = 2 * (qz * x - qx * z);
  const tz = 2 * (qx * y - qy * x);
  V[0] = x + Q[3] * tx + qy * tz - qz * ty;
  V[1] = y + Q[3] * ty + qz * tx - qx * tz;
  V[2] = z + Q[3] * tz + qx * ty - qy * tx;
};

/** The skirt's grid of a frame, in the pelvis' frame: three numbers a point, a column after the other. */
const GRID = new Float64Array(3 * 10 * 6);

/**
 * Appends the tabard and the skirt hung from the sash of the build `b` posed as `s`, at the clock
 * `t` (s) of a runner going at `speed` (m/s), the tabard in `color`; at the level of detail `lod`
 * (0 far: a flat tabard, a quarter of the skirt). Written with no allocation: every frame.
 */
export const drape = (
  out: Out,
  s: { pos: Vec3[]; rot: Quat[] },
  b: number,
  t: number,
  speed: number,
  color: number[],
  lod: number,
) => {
  const at = s.pos[J.PELVIS];
  const q = s.rot[J.PELVIS];
  Q.set(q);
  // The legs, the world's down and the way back in the pelvis' frame.
  for (let i = 0; i < 4; i++) {
    // A thigh, then its shin.
    const r = i & 1 ? HIPS.shin : HIPS.thigh;
    for (let e = 0; e < 2; e++) {
      const p = s.pos[LEGS[i][e]];
      spin(p[0] - at[0], p[1] - at[1], p[2] - at[2], -1);
      CAPS.set(V, i * 8 + e * 3);
      CAPS[i * 8 + 6 + e] = r[e];
    }
  }
  spin(0, -1, 0, -1);
  // Mostly the world's down, a share of the body's own: lying down it does not stand on end.
  ENV[0] = V[0] * 0.8;
  ENV[1] = V[1] * 0.8 - 0.2;
  ENV[2] = V[2] * 0.8;
  ENV[4] = b;
  ENV[6] = t;
  ENV[7] = Math.min(speed / FAST, 1);
  // The level of detail's place in SKIRT's lists: close, near, far.
  const level = lod > 2 ? 0 : lod ? 1 : 2;
  const waist = HIPS.waist[b];
  const [cr, cg, cb] = color;

  // The tabard: one chain down the middle of the front, as wide as it is.
  const far = +!lod;
  const rows = TABARD.rows[far];
  const z0 = -(waist[1] + TABARD.off);
  hang(0, HIPS.y, z0, 0, -1, rows, TABARD.len, 0.02, TABARD.off, TABARD.off, TABARD.w / 2, 0);
  const K = QUILTS[far];
  let w = out.length;
  let a = room(out, (K.length / 6) * STRIDE);
  const piece = TABARD.len / rows;
  for (let i = 0; i < K.length; i += 6) {
    const f = Math.min(K[i + 1] / piece, rows - 1e-6);
    const k = Math.floor(f) * 3;
    // Along the piece it lies on, and out of it: across is the body's.
    let tx = CHAIN[k + 3] - CHAIN[k];
    let ty = CHAIN[k + 4] - CHAIN[k + 1];
    let tz = CHAIN[k + 5] - CHAIN[k + 2];
    const tl = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1;
    tx /= tl;
    ty /= tl;
    tz /= tl;
    const e = (f - k / 3) * tl;
    // Its top bent round the waist, under the sash; flat from `wrap` down.
    const h =
      K[i + 2] -
      waist[1] *
        (1 - Math.sqrt(1 - (K[i] * K[i]) / (waist[0] * waist[0]))) *
        (1 - sm(0, TABARD.wrap, K[i + 1]));
    // The normal: across (1, 0, 0) by the piece's way.
    const px = CHAIN[k] + tx * e + K[i];
    const py = CHAIN[k + 1] + ty * e - tz * h;
    const pz = CHAIN[k + 2] + tz * e + ty * h;
    let nx = K[i + 3] + tx * K[i + 4];
    let ny = ty * K[i + 4] - tz;
    let nz = tz * K[i + 4] + ty;
    const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    nx /= nl;
    ny /= nl;
    nz /= nl;
    spin(px, py, pz, 1);
    a[w] = at[0] + V[0];
    a[w + 1] = at[1] + V[1];
    a[w + 2] = at[2] + V[2];
    spin(nx, ny, nz, 1);
    a[w + 3] = V[0];
    a[w + 4] = V[1];
    a[w + 5] = V[2];
    const sh = K[i + 5];
    a[w + 6] = sh ? cr * sh : EDGE[0];
    a[w + 7] = sh ? cg * sh : EDGE[1];
    a[w + 8] = -1;
    a[w + 9] = sh ? cb * sh : EDGE[2];
    w += STRIDE;
  }
  out.length = w;

  // The skirt: a chain a column, panel by panel.
  const nr = SKIRT.rows[level];
  for (let pi = 0; pi < SKIRT.panels.length; pi++) {
    const a0 = SKIRT.panels[pi][0];
    const a1 = SKIRT.panels[pi][1];
    const nc = SKIRT.cols[level][+(pi > 1)];
    for (let c = 0; c < nc; c++) {
      const an = ((a0 + ((a1 - a0) * c) / (nc - 1)) * Math.PI) / 180;
      const sn = Math.sin(an);
      const cs = Math.cos(an);
      const d = waist[cs > 0 ? 1 : 2] + SKIRT.off;
      const wd = waist[0] + SKIRT.off;
      // The way out of the waist's ellipse there, level.
      let ux = sn / wd;
      let uz = -cs / d;
      const ul = Math.sqrt(ux * ux + uz * uz);
      ux /= ul;
      uz /= ul;
      hang(
        wd * sn,
        HIPS.y,
        -d * cs,
        ux,
        uz,
        nr,
        SKIRT.len,
        SKIRT.flare * uz * uz,
        SKIRT.off,
        SKIRT.clear - SKIRT.side * ux ** 6,
        0,
        c * 1.7 + pi,
      );
      for (let i = 0; i < (nr + 1) * 3; i++) {
        GRID[c * (nr + 1) * 3 + i] = CHAIN[i];
      }
    }
    w = out.length;
    a = room(out, (nc - 1) * nr * 6 * STRIDE);
    for (let c = 0; c + 1 < nc; c++) {
      for (let r = 0; r < nr; r++) {
        for (let v = 0; v < 6; v++) {
          // Two triangles a square: its corners across (1, 2 and 4) then down (2, 4 and 5).
          const cc = c + ((22 >> v) & 1);
          const rr = r + ((52 >> v) & 1);
          const o = (cc * (nr + 1) + rr) * 3;
          // The normal at a point of the grid: across by down, from its neighbours.
          const l = (Math.max(cc - 1, 0) * (nr + 1) + rr) * 3;
          const g = (Math.min(cc + 1, nc - 1) * (nr + 1) + rr) * 3;
          const u = (cc * (nr + 1) + Math.max(rr - 1, 0)) * 3;
          const dn = (cc * (nr + 1) + Math.min(rr + 1, nr)) * 3;
          const ax = GRID[g] - GRID[l];
          const ay = GRID[g + 1] - GRID[l + 1];
          const az = GRID[g + 2] - GRID[l + 2];
          const bx = GRID[dn] - GRID[u];
          const by = GRID[dn + 1] - GRID[u + 1];
          const bz = GRID[dn + 2] - GRID[u + 2];
          let nx = ay * bz - az * by;
          let ny = az * bx - ax * bz;
          let nz = ax * by - ay * bx;
          const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
          nx /= nl;
          ny /= nl;
          nz /= nl;
          spin(GRID[o], GRID[o + 1], GRID[o + 2], 1);
          a[w] = at[0] + V[0];
          a[w + 1] = at[1] + V[1];
          a[w + 2] = at[2] + V[2];
          spin(nx, ny, nz, 1);
          a[w + 3] = V[0];
          a[w + 4] = V[1];
          a[w + 5] = V[2];
          a[w + 6] = CLOTH[0];
          a[w + 7] = CLOTH[1];
          a[w + 8] = -1;
          a[w + 9] = CLOTH[2];
          w += STRIDE;
        }
      }
    }
    out.length = w;
  }
};
