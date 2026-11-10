// The armour of the moon's space suit (the user, 2026-11-10: the shoulder pads part of an armour,
// white hard plates over the suit as the troopers of space operas wear, not copied; then: fitted to
// the body's shape, the chest and the belly pieces 2 cm apart). Each plate is cut out of the skin
// as drawn this frame: its triangles in the plate's region of the body at rest are clipped to the
// region's edges exactly, then set off the skin along its normals, glossy white; a grey copy of a
// slightly larger region, nearer the skin, shows round it as its edge. So a plate has the body's
// own shape and bends with it. No state: a pure function of the skin just drawn.
import { LIMB } from '../shared/types';
import { GLOSS, STRIDE } from './mesh';
import type { Skin } from './skin';

/** Why a plate applies to a triangle: the trunk, an arm or a leg (both sides). */
const PART = { TRUNK: 0, ARM: 1, LEG: 2 } as const;

/**
 * A plate's region on the body at rest (metres, -z the front, +x the right): the part it is on,
 * the heights it spans (its top may dip with the angle, `dip` at the front), and the angles round
 * the part it spans (degrees from the front, + outward on a limb, toward +x on the trunk), round
 * the part's middle line at `cx` across (mirrored on the left).
 */
interface Region {
  part: number;
  cx: number;
  y: [number, number];
  a: [number, number];
  /** How much the top comes down at the front: the neck's cut. */
  dip?: number;
  /** How much further out the plate swells at the rest point (x, y): the chest plate's pecs. */
  swell?: (x: number, y: number) => number;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min((x - a) / (b - a), 1));
  return t * t * (3 - 2 * t);
};

/**
 * The chest plate's pecs (the user, 2026-11-10: fuller toward the bottom): a lobe each side of the
 * sternum, rising sharply from the line under the pecs, fullest just above it, fading to the
 * collar; `PEC` metres at most.
 */
export const PEC = 0.017;
const pecs = (x: number, y: number) =>
  PEC *
  Math.exp(-(((Math.abs(x) - 0.072) / 0.058) ** 2)) *
  smooth(1.245, 1.285, y) *
  (1 - smooth(1.36, 1.46, y));

/** The gap the user asked between the chest plate and the belly's plates, and between those. */
export const GAP = 0.02;

export const REGIONS: Region[] = [
  // The chest plate, from under the ribs to the collar, cut round the neck.
  { part: PART.TRUNK, cx: 0, y: [1.195, 1.5], a: [-64, 64], dip: 0.045, swell: pecs },
  // The belly's two plates, GAP apart and GAP under the chest's.
  { part: PART.TRUNK, cx: 0, y: [1.115, 1.195 - GAP], a: [-54, 54] },
  { part: PART.TRUNK, cx: 0, y: [1.035, 1.115 - GAP], a: [-54, 54] },
  // The front of each thigh, the knees, the outer side of each forearm.
  { part: PART.LEG, cx: 0.1, y: [0.61, 0.85], a: [-62, 78] },
  { part: PART.LEG, cx: 0.1, y: [0.462, 0.565], a: [-55, 55] },
  { part: PART.ARM, cx: 0.222, y: [1.005, 1.15], a: [20, 160] },
];

/** How far the plates stand off the skin, and their edge; how much larger the edge's region is. */
const OFF = 0.01;
const EDGE_OFF = 0.005;
const MARGIN = { y: 0.003, a: 2.5 };

const WHITE = [0.9, 0.91, 0.93];
const EDGE = [0.26, 0.27, 0.3];

const partOf = (l: number) =>
  l == LIMB.NONE
    ? PART.TRUNK
    : l == LIMB.ARM_L || l == LIMB.ARM_R
      ? PART.ARM
      : l == LIMB.LEG_L || l == LIMB.LEG_R
        ? PART.LEG
        : -1;

/** A corner being clipped: its place at rest, then as drawn and its normal, then its normal at rest. */
type Corner = number[];

/** The angle of the rest point (x, z) round the region's middle line, degrees: + outward on a limb, toward +x on the trunk. */
const angle = (g: Region, x: number, z: number) => {
  const side = g.part == PART.TRUNK ? 1 : Math.sign(x) || 1;
  return (Math.atan2((x - g.cx * side) * side, -z) * 180) / Math.PI;
};

/** The region's constraints on a rest point, each >= 0 inside, grown by `grow` (0 or 1 margin). */
const limits = (g: Region, grow: number) => {
  const [dy, da] = [MARGIN.y * grow, MARGIN.a * grow];
  return [
    (c: Corner) => c[1] - (g.y[0] - dy),
    (c: Corner) => {
      const a = angle(g, c[0], c[2]);
      const top = g.y[1] - (g.dip ?? 0) * Math.cos((a * Math.PI * 1.4) / 180) ** 2;
      return top + dy - c[1];
    },
    (c: Corner) => angle(g, c[0], c[2]) - (g.a[0] - da),
    (c: Corner) => g.a[1] + da - angle(g, c[0], c[2]),
  ];
};

const mix = (p: Corner, q: Corner, t: number) => p.map((v, i) => v + (q[i] - v) * t);

/** Clips the polygon `poly` to where `f` >= 0 (Sutherland-Hodgman, corners eased along the edges). */
const clip = (poly: Corner[], f: (c: Corner) => number) => {
  const out: Corner[] = [];
  for (let i = 0; i < poly.length; i++) {
    const [p, q] = [poly[i], poly[(i + 1) % poly.length]];
    const [fp, fq] = [f(p), f(q)];
    if (fp >= 0) {
      out.push(p);
    }
    if (fp >= 0 != fq >= 0) {
      out.push(mix(p, q, fp / (fp - fq)));
    }
  }
  return out;
};

/**
 * Appends the polygon as a fan, each corner set `off` along its normal (plus the region's swell),
 * in `col` on `layer`. A swell tilts the normal by its slope, carried from the rest pose to the
 * drawn one by the turn between the corner's two normals.
 */
const emit = (
  out: number[],
  poly: Corner[],
  off: number,
  col: number[],
  layer: number,
  swell?: (x: number, y: number) => number,
) => {
  const put = (c: Corner) => {
    const unitOf = (x: number, y: number, z: number) => {
      const l = Math.hypot(x, y, z) || 1;
      return [x / l, y / l, z / l];
    };
    let [nx, ny, nz] = unitOf(c[6], c[7], c[8]);
    let d = off;
    if (swell) {
      const e = 1e-3;
      d += swell(c[0], c[1]);
      // The slope at rest, in the plane touching the skin there.
      const r = unitOf(c[9], c[10], c[11]);
      let g = [
        (swell(c[0] + e, c[1]) - swell(c[0] - e, c[1])) / (2 * e),
        (swell(c[0], c[1] + e) - swell(c[0], c[1] - e)) / (2 * e),
        0,
      ];
      const gn = g[0] * r[0] + g[1] * r[1];
      g = g.map((v, i) => v - r[i] * gn);
      // Turned as the normal turned from rest to drawn (Rodrigues).
      const k = [r[1] * nz - r[2] * ny, r[2] * nx - r[0] * nz, r[0] * ny - r[1] * nx];
      const sn = Math.hypot(...k);
      const cs = r[0] * nx + r[1] * ny + r[2] * nz;
      if (sn > 1e-6) {
        const u = k.map(v => v / sn);
        const ug = u[0] * g[0] + u[1] * g[1] + u[2] * g[2];
        const x = [u[1] * g[2] - u[2] * g[1], u[2] * g[0] - u[0] * g[2], u[0] * g[1] - u[1] * g[0]];
        g = g.map((v, i) => v * cs + x[i] * sn + u[i] * ug * (1 - cs));
      }
      const [px, py, pz] = [c[3] + nx * d, c[4] + ny * d, c[5] + nz * d];
      [nx, ny, nz] = unitOf(nx - g[0], ny - g[1], nz - g[2]);
      out.push(px, py, pz, nx, ny, nz, col[0], col[1], layer, col[2]);
      return;
    }
    out.push(
      c[3] + nx * d,
      c[4] + ny * d,
      c[5] + nz * d,
      nx,
      ny,
      nz,
      col[0],
      col[1],
      layer,
      col[2],
    );
  };
  for (let i = 1; i + 1 < poly.length; i++) {
    put(poly[0]);
    put(poly[i]);
    put(poly[i + 1]);
  }
};

const LIMITS = [0, 1].map(grow => REGIONS.map(g => limits(g, grow)));
/** Each region's heights with its margin, to pass over the triangles out of all reach at once. */
const SPANS = REGIONS.map(g => [g.y[0] - MARGIN.y, g.y[1] + MARGIN.y]);

/**
 * Appends the armour cut out of the skin `s` drawn into `out` from the float `from` on (skin()
 * writes three vertices per triangle of s.t, in order).
 */
export const armor = (out: number[], from: number, s: Skin) => {
  const { t, v, l } = s;
  if (!l) {
    return;
  }
  const end = out.length;
  for (let k = 0; k < t.length / 3; k++) {
    const part = partOf(l[k]);
    if (part < 0) {
      continue;
    }
    const ys = [0, 1, 2].map(c => v[t[k * 3 + c] * 6 + 1]);
    const [lo, hi] = [Math.min(...ys), Math.max(...ys)];
    for (let g = 0; g < REGIONS.length; g++) {
      if (REGIONS[g].part != part || hi < SPANS[g][0] || lo > SPANS[g][1]) {
        continue;
      }
      const tri: Corner[] = [0, 1, 2].map(c => {
        const i = t[k * 3 + c] * 6;
        const o = from + (k * 3 + c) * STRIDE;
        return [
          v[i],
          v[i + 1],
          v[i + 2],
          out[o],
          out[o + 1],
          out[o + 2],
          out[o + 3],
          out[o + 4],
          out[o + 5],
          v[i + 3],
          v[i + 4],
          v[i + 5],
        ];
      });
      for (const grow of [1, 0]) {
        const poly = LIMITS[grow][g].reduce(clip, tri);
        if (poly.length >= 3) {
          emit(
            out,
            poly,
            grow ? EDGE_OFF : OFF,
            grow ? EDGE : WHITE,
            grow ? -1 : GLOSS,
            REGIONS[g].swell,
          );
        }
      }
    }
  }
  return out.length - end;
};
