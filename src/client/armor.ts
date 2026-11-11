// The armour of the moon's space suit (the user, 2026-11-10: the shoulder pads part of an armour,
// white hard plates over the suit as the troopers of space operas wear, not copied; then: fitted to
// the body's shape, the chest and the belly pieces 2 cm apart, thick, scratched). Each plate is cut
// out of the skin: its triangles in the plate's region of the body at rest are clipped to the
// region's edges exactly, once per skin (a recipe: each corner a skin triangle and its weights);
// each frame the corners are found on the skin as drawn and set off it along its normals, glossy
// white, with a wall down to the skin round the plate's edge as its thickness. So a plate has the
// body's own shape and bends with it.
import { LIMB } from '../shared/types';
import { GLOSS, STRIDE } from './mesh';
import type { Skin } from './skin';

/** Why a plate applies to a triangle: the trunk, an arm or a leg (both sides). */
const PART = { TRUNK: 0, ARM: 1, LEG: 2 } as const;

/**
 * A plate's region on the body at rest (metres, -z the front, +x the right): the part it is on,
 * the heights it spans, and the angles round
 * the part it spans (degrees from the front, + outward on a limb, toward +x on the trunk), round
 * the part's middle line at `cx` across (mirrored on the left).
 */
interface Region {
  part: number;
  cx: number;
  y: [number, number];
  a: [number, number];
  /** How much further out the plate swells at the rest point (x, y): the chest plate's pecs. */
  swell?: (x: number, y: number) => number;
  /** Where its angles are measured from, degrees (0 the front): 180 for a plate on the back. */
  face?: number;
  /** Its bottom and top at each angle (degrees from the front, + outward), when not level: a leg's opening. */
  low?: (a: number) => number;
  high?: (a: number) => number;
  /** A round plate: its outline an ellipse in (angle, height), [half the angle, middle height, half height]. */
  round?: [number, number, number];
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min((x - a) / (b - a), 1));
  return t * t * (3 - 2 * t);
};

/**
 * The chest plate's pecs (the user, 2026-11-10: fuller toward the bottom, then the round part too
 * low, flattened): a lobe each side of the sternum, high on the chest, rising from the line under
 * the pecs and fading to the collar, the plate flat below; `PEC` metres at most.
 */
export const PEC = 0.011;
const pecs = (x: number, y: number) =>
  PEC *
  Math.exp(-(((Math.abs(x) - 0.072) / 0.06) ** 2)) *
  smooth(1.3, 1.36, y) *
  (1 - smooth(1.41, 1.48, y));

/**
 * The woman's chest plate (skin.ts shapes her bust under it): one moulded piece, the hollow of the
 * sternum filled a little, not two cups.
 */
const bust = (x: number, y: number) =>
  0.007 * Math.exp(-((x / 0.034) ** 2)) * Math.exp(-(((y - 1.35) / 0.05) ** 2));

/** The knee pad's dome: up to 8 mm out at the kneecap. */
const knee = (x: number, y: number) =>
  0.008 * Math.max(0, 1 - ((Math.abs(x) - 0.1) / 0.07) ** 2 - ((y - 0.515) / 0.055) ** 2);

/**
 * The briefs' leg opening on a thigh at angle a (degrees from the front, + outward, -90 the inside):
 * lowest at the crotch, in front of the inside, rising straight to the top of the hip outside, then
 * down again over the buttock behind. The thigh plates follow it GAP under.
 */
const brief = (a: number) => {
  // Round from the inside front (-80) through the front and the outside (90) to the inside back (-110 = 250).
  const b = a < -95 ? a + 360 : a;
  return b <= 55
    ? 0.85 + (0.085 * (b + 80)) / 135
    : b < 125
      ? 0.94
      : 0.94 - (0.08 * (b - 125)) / 125;
};

/** A thigh plate's top at angle a: GAP under the briefs' opening, closing up on the outside, where the plate goes on up the hip. */
const thigh = (a: number) => {
  const b = a < -95 ? a + 360 : a;
  return brief(a) - GAP * (b <= 90 ? 1 - smooth(25, 55, b) : 1 - smooth(155, 125, b));
};

/**
 * The briefs' band round the hips: its bottom at angle a round the trunk (degrees, 0 the front): low
 * in front and behind, up at the sides, where the band is thin (the user, 2026-11-10).
 */
const hips = (a: number) => {
  const s = Math.abs(a);
  return 0.925 + 0.046 * smooth(48, 85, s) * (1 - smooth(95, 132, s));
};

/** The gap between the briefs' thin sides and the thigh plates going up the hips: there is little room. */
const SIDE_GAP = 0.01;

/** The chest plate's top at angle a round the trunk (degrees, 0 the front): the neck's V. */
const chestTop = (a: number) => 1.5 - 0.045 * Math.cos((a * Math.PI * 1.4) / 180) ** 2;

/** The gap round the collar piece and over the back plate: there is little room up there. */
const COLLAR_GAP = 0.012;

/** The gap the user asked between the chest plate and the belly's plates, and between those. */
export const GAP = 0.02;

export const REGIONS: Region[] = [
  // The chest plate, from under the ribs to the collar, cut round the neck.
  { part: PART.TRUNK, cx: 0, y: [1.195, 1.5], a: [-64, 64], high: chestTop, swell: pecs },
  // The belly's two plates, GAP apart and GAP under the chest's.
  { part: PART.TRUNK, cx: 0, y: [1.115, 1.195 - GAP], a: [-54, 54] },
  { part: PART.TRUNK, cx: 0, y: [1.035, 1.115 - GAP], a: [-54, 54] },
  // The front of each thigh down to GAP over the knee pad, the knees, the outer side of each forearm.
  { part: PART.LEG, cx: 0.1, y: [0.585, 0.94], a: [-62, 78], high: thigh },
  // The knees: round (the user, 2026-11-10), domed.
  { part: PART.LEG, cx: 0.1, y: [0.46, 0.57], a: [-60, 60], round: [56, 0.515, 0.05], swell: knee },
  // The forearms, down to the gloves (the user, 2026-11-10).
  { part: PART.ARM, cx: 0.222, y: [0.979, 1.15], a: [20, 160] },
  // The user, 2026-11-10: a small plate on the biceps, under the shoulder plate; one on the back of
  // each thigh; and the shorts cut as briefs: round the hips under the belt, on each thigh the leg's
  // opening rising from the crotch to the hip and lower behind, never between the thighs; a cup at
  // the crotch (crotch()).
  { part: PART.ARM, cx: 0.207, y: [1.215, 1.325], a: [-25, 95] },
  { part: PART.LEG, cx: 0.1, y: [0.6, 0.94], a: [-58, 58], face: 180, high: thigh },
  { part: PART.TRUNK, cx: 0, y: [0.925, 0.982], a: [-181, 181], low: hips },
  // The user, 2026-11-10: a piece over the collarbones up to the neck, following the chest plate's
  // V a little over it, out to the shoulder plates; and one on each shoulder blade, over the back's,
  // a groove down the spine between them.
  { part: PART.TRUNK, cx: 0, y: [1.47, 1.528], a: [-78, 78], low: a => chestTop(a) + COLLAR_GAP },
  { part: PART.TRUNK, cx: 0, y: [1.4 + COLLAR_GAP, 1.505], a: [-62, -5], face: 180 },
  { part: PART.TRUNK, cx: 0, y: [1.4 + COLLAR_GAP, 1.505], a: [5, 62], face: 180 },
  // The back (the user, 2026-11-10, for Highline, where no pack covers it): a plate between the
  // shoulder blades and one on the small of the back, GAP apart.
  { part: PART.TRUNK, cx: 0, y: [1.2, 1.4], a: [-58, 58], face: 180 },
  { part: PART.TRUNK, cx: 0, y: [1.035, 1.2 - GAP], a: [-52, 52], face: 180 },
  // The thigh plates go on up the hips' sides, SIDE_GAP under the briefs' thin sides (the user).
  ...[90, -90].map((face): Region => ({
    part: PART.TRUNK,
    cx: 0,
    y: [0.92, 0.96],
    a: [-32, 32],
    face,
    high: a => hips(a) - SIDE_GAP,
  })),
  { part: PART.LEG, cx: 0.1, y: [0.845, 0.935], a: [-150, 150], face: 70, low: brief },
];

/** How far the plates stand off the skin: their thickness. */
const OFF = 0.012;

const WHITE = [0.9, 0.91, 0.93];
/** The plates' edges seen side on: their thickness. */
const WALL = [0.7, 0.71, 0.74];

const partOf = (l: number) =>
  l == LIMB.NONE
    ? PART.TRUNK
    : l == LIMB.ARM_L || l == LIMB.ARM_R
      ? PART.ARM
      : l == LIMB.LEG_L || l == LIMB.LEG_R
        ? PART.LEG
        : -1;

/** A corner being clipped: its place at rest, its weights of its skin triangle's corners, its normal at rest, then the limits it lies on (BITS). */
type Corner = number[];

/** The angle of the rest point (x, z) round the region's middle line, degrees: + outward on a limb, toward +x on the trunk; from the region's face. */
const angle = (g: Region, x: number, z: number) => {
  const side = g.part == PART.TRUNK ? 1 : Math.sign(x) || 1;
  const a = (Math.atan2((x - g.cx * side) * side, -z) * 180) / Math.PI;
  return g.face ? ((a - g.face + 540) % 360) - 180 : a;
};

/** The region's constraints on a rest point, each >= 0 inside. */
const limits = (g: Region) => {
  const raw = (c: Corner) => angle({ ...g, face: 0 }, c[0], c[2]);
  return [
    (c: Corner) => c[1] - (g.low ? g.low(raw(c)) : g.y[0]),
    (c: Corner) => (g.high ? Math.min(g.high(raw(c)), g.y[1]) : g.y[1]) - c[1],
    (c: Corner) => angle(g, c[0], c[2]) - g.a[0],
    (c: Corner) => g.a[1] - angle(g, c[0], c[2]),
    ...(g.round
      ? [
          (c: Corner) => {
            const [ha, cy, hy] = g.round!;
            return 1 - (angle(g, c[0], c[2]) / ha) ** 2 - ((c[1] - cy) / hy) ** 2;
          },
        ]
      : []),
  ];
};

const mix = (p: Corner, q: Corner, t: number) => p.map((v, i) => v + (q[i] - v) * t);

/** Each triangle in four, by its edges' middles. */
const split = (tris: Corner[][]) =>
  tris.flatMap(([a, b, c]) => {
    const [ab, bc, ca] = [mix(a, b, 0.5), mix(b, c, 0.5), mix(c, a, 0.5)];
    return [
      [a, ab, ca],
      [ab, b, bc],
      [ca, bc, c],
      [ab, bc, ca],
    ];
  });

/** Clips the polygon `poly` to where `f` >= 0 (Sutherland-Hodgman, corners eased along the edges). */
const clip = (poly: Corner[], f: (c: Corner) => number, bit: number) => {
  const out: Corner[] = [];
  for (let i = 0; i < poly.length; i++) {
    const [p, q] = [poly[i], poly[(i + 1) % poly.length]];
    const [fp, fq] = [f(p), f(q)];
    if (fp >= 0) {
      out.push(p);
    }
    if (fp >= 0 != fq >= 0) {
      // A corner on the region's edge: marked with the limit that made it (BITS).
      const c = mix(p, q, fp / (fp - fq));
      c[BITS] = (p[BITS] & q[BITS]) | bit;
      out.push(c);
    }
  }
  return out;
};

/** Where a corner keeps the limits it lies on (a bit each): two corners sharing one make an edge of the plate. */
const BITS = 9;

const LIMITS = REGIONS.map(g => limits(g));
/** Each region's heights, to pass over the triangles out of all reach at once. */
const SPANS = REGIONS.map(g => [g.y[0] - 0.003, g.y[1] + 0.003]);

/** How many scratches the plates have close up, and their colours: worn to the grey, or paler. */
const SCRATCHES = 110;
const WORN = [
  [0.46, 0.47, 0.5],
  [0.62, 0.63, 0.66],
];
/** The scratches' colours on coloured plates: the white under the paint, and paler. */
export const SCRATCHED = [
  [0.86, 0.87, 0.89],
  [0.97, 0.97, 0.98],
];

/**
 * A recipe: triangles of corners, each [skin triangle, its three weights, how far off the skin,
 * the slope of the swell at rest (x, y, z), the normal at rest (x, y, z)], and per triangle its
 * colour, layer and whether it is a wall (its normal its own, flat).
 */
interface Recipe {
  c: number[];
  t: number[];
}
const CORNER = 11;
const TRI = 5;

const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let z = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) ^ z;
  return ((z ^ (z >>> 14)) >>> 0) / 2 ** 32;
};

/** The recipe of the armour on the skin `s`, `fine` (curved outlines refined, scratches) or not. */
/** The region as the skin's build wears it: the woman's chest plate has her own swell. */
const shaped = (g: Region, s: Skin): Region =>
  s.b && g.swell === pecs ? { ...g, swell: bust } : g;

const cook = (s: Skin, fine: boolean): Recipe => {
  // The regions are written on the man's rest mesh: another build's plates are cut there and sit
  // on its own skin, corner for corner.
  const { t, l } = s;
  const v = s.u ?? s.v;
  const r: Recipe = { c: [], t: [] };
  if (!l) {
    return r;
  }
  const add = (
    cs: Corner[],
    offs: number[],
    swell: Region['swell'],
    col: number[],
    layer: number,
    wall: number,
    k: number,
  ) => {
    cs.forEach((c, i) => {
      let g = [0, 0, 0];
      if (swell) {
        const e = 1e-3;
        g = [
          (swell(c[0] + e, c[1]) - swell(c[0] - e, c[1])) / (2 * e),
          (swell(c[0], c[1] + e) - swell(c[0], c[1] - e)) / (2 * e),
          0,
        ];
        const nl = Math.hypot(c[6], c[7], c[8]) || 1;
        const n = [c[6] / nl, c[7] / nl, c[8] / nl];
        const gn = g[0] * n[0] + g[1] * n[1];
        g = g.map((x, j) => x - n[j] * gn);
      }
      r.c.push(k, c[3], c[4], c[5], offs[i], g[0], g[1], g[2], c[6], c[7], c[8]);
    });
    r.t.push(col[0], col[1], col[2], layer, wall);
  };
  /** A corner at rest set `d` off along its rest normal: to wind the walls out. */
  const lift = (c: Corner, d: number) => {
    const nl = Math.hypot(c[6], c[7], c[8]) || 1;
    return [0, 1, 2].map(j => c[j] + (c[6 + j] / nl) * d);
  };
  for (let k = 0; k < t.length / 3; k++) {
    const part = partOf(l[k]);
    if (part < 0) {
      continue;
    }
    const ys = [0, 1, 2].map(c => v[t[k * 3 + c] * 6 + 1]);
    const [lo, hi] = [Math.min(...ys), Math.max(...ys)];
    for (let g = 0; g < REGIONS.length; g++) {
      const region = shaped(REGIONS[g], s);
      if (region.part != part || hi < SPANS[g][0] || lo > SPANS[g][1]) {
        continue;
      }
      const tri: Corner[] = [0, 1, 2].map(c => {
        const i = t[k * 3 + c] * 6;
        return [
          v[i],
          v[i + 1],
          v[i + 2],
          +(c == 0),
          +(c == 1),
          +(c == 2),
          v[i + 3],
          v[i + 4],
          v[i + 5],
          0,
        ];
      });
      // A triangle across the turn opposite the plate's face, where its angles jump by 360, would
      // seem to cross the plate's edges: it is out of every plate short of a whole ring.
      if (region.a[1] - region.a[0] < 360) {
        const as = tri.map(c => angle(region, c[0], c[2]));
        if (Math.max(...as) - Math.min(...as) > 180) {
          continue;
        }
      }
      // A round or curved outline needs finer pieces than the skin's, close up.
      const pieces = fine && (region.round || region.low || region.high) ? split([tri]) : [tri];
      for (const piece of pieces) {
        const poly = LIMITS[g].reduce((p, f, i) => clip(p, f, 1 << i), piece);
        if (poly.length < 3) {
          continue;
        }
        const off = (c: Corner) => OFF + (region.swell ? region.swell(c[0], c[1]) : 0);
        for (let i = 1; i + 1 < poly.length; i++) {
          const cs = [poly[0], poly[i], poly[i + 1]];
          add(cs, cs.map(off), region.swell, WHITE, GLOSS, 0, k);
        }
        // The walls along the plate's edge, wound outward (away from its middle, at rest).
        const mid = [0, 1, 2].map(j => poly.reduce((sum, c) => sum + c[j], 0) / poly.length);
        for (let i = 0; i < poly.length; i++) {
          const [p, q] = [poly[i], poly[(i + 1) % poly.length]];
          if (!(p[BITS] & q[BITS])) {
            continue;
          }
          const [pt, qt, qb] = [lift(p, off(p)), lift(q, off(q)), lift(q, 0.0015)];
          const f = [
            (qt[1] - pt[1]) * (qb[2] - pt[2]) - (qt[2] - pt[2]) * (qb[1] - pt[1]),
            (qt[2] - pt[2]) * (qb[0] - pt[0]) - (qt[0] - pt[0]) * (qb[2] - pt[2]),
            (qt[0] - pt[0]) * (qb[1] - pt[1]) - (qt[1] - pt[1]) * (qb[0] - pt[0]),
          ];
          const outward =
            f[0] * (p[0] - mid[0]) + f[1] * (p[1] - mid[1]) + f[2] * (p[2] - mid[2]) >= 0;
          const [P, Q] = outward ? [p, q] : [q, p];
          add([P, Q, Q], [off(P), off(Q), 0.0015], undefined, WALL, -1, 1, k);
          add([P, Q, P], [off(P), 0.0015, 0.0015], undefined, WALL, -1, 1, k);
        }
      }
    }
  }
  if (fine) {
    scratchesOn(s, add);
  }
  return r;
};

/**
 * Adds to the recipe the scratches on the plates of the skin `s`: short strokes at random (the
 * same each time) on its triangles inside a plate, each lying on one triangle, wholly inside its
 * plate, a hair over it, matte.
 */
const scratchesOn = (
  s: Skin,
  add: (
    cs: Corner[],
    offs: number[],
    swell: Region['swell'],
    col: number[],
    layer: number,
    wall: number,
    k: number,
  ) => void,
) => {
  const { t, l } = s;
  const v = s.u ?? s.v;
  const rand = seeded(0xa4f0);
  const n = t.length / 3;
  let made = 0;
  for (let tries = 0; tries < SCRATCHES * 60 && made < SCRATCHES; tries++) {
    const k = Math.floor(rand() * n);
    const part = partOf(l![k]);
    const P = [0, 1, 2].map(c => [0, 1, 2].map(j => v[t[k * 3 + c] * 6 + j]));
    const N = [0, 1, 2].map(c => [0, 1, 2].map(j => v[t[k * 3 + c] * 6 + 3 + j]));
    const [u, w] = [rand(), rand()];
    const [b1, b2] = u + w > 1 ? [1 - u, 1 - w] : [u, w];
    const at = [0, 1, 2].map(j => P[0][j] + (P[1][j] - P[0][j]) * b1 + (P[2][j] - P[0][j]) * b2);
    const probe = (x: number[]): Corner => [...x, 0, 0, 0, 0, 0, 0, 0];
    const g = REGIONS.findIndex(
      (rg, i) => rg.part == part && LIMITS[i].every(f => f(probe(at)) >= 0),
    );
    if (g < 0) {
      continue;
    }
    const e1 = P[1].map((x, j) => x - P[0][j]);
    const e2 = P[2].map((x, j) => x - P[0][j]);
    const nn = [
      e1[1] * e2[2] - e1[2] * e2[1],
      e1[2] * e2[0] - e1[0] * e2[2],
      e1[0] * e2[1] - e1[1] * e2[0],
    ];
    const [l1, nl] = [Math.hypot(...e1), Math.hypot(...nn)];
    if (nl < 1e-9) {
      continue;
    }
    const x = e1.map(q => q / l1);
    const y = [
      nn[1] * x[2] - nn[2] * x[1],
      nn[2] * x[0] - nn[0] * x[2],
      nn[0] * x[1] - nn[1] * x[0],
    ].map(q => q / nl);
    const a = rand() * Math.PI;
    const [L, W] = [0.008 + rand() * 0.022, 0.0005 + rand() * 0.0006];
    const d = x.map((q, j) => q * Math.cos(a) + y[j] * Math.sin(a));
    const sd = x.map((q, j) => -q * Math.sin(a) + y[j] * Math.cos(a));
    const quad = [
      [-0.5, -1],
      [0.5, -1],
      [0.5, 1],
      [-0.5, 1],
    ].map(([f, h]) => at.map((q, j) => q + d[j] * L * f + sd[j] * W * h));
    if (!quad.every(c => LIMITS[g].every(f => f(probe(c)) >= 0))) {
      continue;
    }
    // Weights: solve corner - P0 = c1 e1 + c2 e2 in the plane.
    const dot = (p: number[], q: number[]) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
    const [d11, d12, d22] = [dot(e1, e1), dot(e1, e2), dot(e2, e2)];
    const det = d11 * d22 - d12 * d12;
    const swell = shaped(REGIONS[g], s).swell;
    const cs: Corner[] = quad.map(c => {
      const rr = c.map((q, j) => q - P[0][j]);
      const [r1, r2] = [dot(rr, e1), dot(rr, e2)];
      const c1 = (r1 * d22 - r2 * d12) / det;
      const c2 = (r2 * d11 - r1 * d12) / det;
      const b = [1 - c1 - c2, c1, c2];
      const nr = [0, 1, 2].map(j => N[0][j] * b[0] + N[1][j] * b[1] + N[2][j] * b[2]);
      return [...c, ...b, ...nr, 0];
    });
    const offs = cs.map(c => OFF + (swell ? swell(c[0], c[1]) : 0) + 0.0008);
    const col = WORN[Math.floor(rand() * WORN.length)];
    add([cs[0], cs[1], cs[2]], [offs[0], offs[1], offs[2]], undefined, col, -1, 0, k);
    add([cs[0], cs[2], cs[3]], [offs[0], offs[2], offs[3]], undefined, col, -1, 0, k);
    made++;
  }
};

const recipes = [new WeakMap<Skin, Recipe>(), new WeakMap<Skin, Recipe>()];

/**
 * Appends the armour cut out of the skin `s` drawn into `out` from the float `from` on (skin()
 * writes three vertices per triangle of s.t, in order). Not `fine` (a runner not close by), curved
 * outlines follow the skin's own triangles, unrefined, and there are no scratches. `plate` is the
 * plates' colour (their walls a shade darker): white when absent.
 */
export const armor = (out: number[], from: number, s: Skin, fine = true, plate?: number[]) => {
  const book = recipes[+fine];
  let r = book.get(s);
  if (!r) {
    r = cook(s, fine);
    book.set(s, r);
  }
  const { c, t } = r;
  const P = new Float64Array(9);
  const N = new Float64Array(9);
  let w = out.length;
  for (let i = 0, ci = 0; i < t.length; i += TRI) {
    for (let j = 0; j < 3; j++, ci += CORNER) {
      const o = from + c[ci] * 3 * STRIDE;
      const b0 = c[ci + 1];
      const b1 = c[ci + 2];
      const b2 = c[ci + 3];
      const o1 = o + STRIDE;
      const o2 = o1 + STRIDE;
      const x = out[o] * b0 + out[o1] * b1 + out[o2] * b2;
      const y = out[o + 1] * b0 + out[o1 + 1] * b1 + out[o2 + 1] * b2;
      const z = out[o + 2] * b0 + out[o1 + 2] * b1 + out[o2 + 2] * b2;
      let nx = out[o + 3] * b0 + out[o1 + 3] * b1 + out[o2 + 3] * b2;
      let ny = out[o + 4] * b0 + out[o1 + 4] * b1 + out[o2 + 4] * b2;
      let nz = out[o + 5] * b0 + out[o1 + 5] * b1 + out[o2 + 5] * b2;
      const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nx /= nl;
      ny /= nl;
      nz /= nl;
      const d = c[ci + 4];
      P[j * 3] = x + nx * d;
      P[j * 3 + 1] = y + ny * d;
      P[j * 3 + 2] = z + nz * d;
      let gx = c[ci + 5];
      let gy = c[ci + 6];
      let gz = c[ci + 7];
      if (gx || gy || gz) {
        // The swell's slope, turned as the normal turned from rest to drawn (Rodrigues), tilts it.
        const rl = Math.sqrt(c[ci + 8] ** 2 + c[ci + 9] ** 2 + c[ci + 10] ** 2) || 1;
        const rx = c[ci + 8] / rl;
        const ry = c[ci + 9] / rl;
        const rz = c[ci + 10] / rl;
        const kx = ry * nz - rz * ny;
        const ky = rz * nx - rx * nz;
        const kz = rx * ny - ry * nx;
        const sn = Math.sqrt(kx * kx + ky * ky + kz * kz);
        if (sn > 1e-6) {
          const cs = rx * nx + ry * ny + rz * nz;
          const ux = kx / sn;
          const uy = ky / sn;
          const uz = kz / sn;
          const ug = (ux * gx + uy * gy + uz * gz) * (1 - cs);
          const wx = uy * gz - uz * gy;
          const wy = uz * gx - ux * gz;
          const wz = ux * gy - uy * gx;
          gx = gx * cs + wx * sn + ux * ug;
          gy = gy * cs + wy * sn + uy * ug;
          gz = gz * cs + wz * sn + uz * ug;
        }
        nx -= gx;
        ny -= gy;
        nz -= gz;
        const ml = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        nx /= ml;
        ny /= ml;
        nz /= ml;
      }
      N[j * 3] = nx;
      N[j * 3 + 1] = ny;
      N[j * 3 + 2] = nz;
    }
    if (t[i + 4]) {
      // A wall: its own flat normal, as wound.
      const ax = P[3] - P[0];
      const ay = P[4] - P[1];
      const az = P[5] - P[2];
      const bx = P[6] - P[0];
      const by = P[7] - P[1];
      const bz = P[8] - P[2];
      const fx = ay * bz - az * by;
      const fy = az * bx - ax * bz;
      const fz = ax * by - ay * bx;
      const fl = Math.sqrt(fx * fx + fy * fy + fz * fz);
      if (fl < 1e-12) {
        continue;
      }
      for (let j = 0; j < 9; j += 3) {
        N[j] = fx / fl;
        N[j + 1] = fy / fl;
        N[j + 2] = fz / fl;
      }
    }
    // The plates and their walls in `plate` when given; the scratches in their own.
    let [cr, cg, cb] = [t[i], t[i + 1], t[i + 2]];
    if (plate && t[i + 3] == GLOSS) {
      [cr, cg, cb] = plate;
    } else if (plate && t[i + 4]) {
      [cr, cg, cb] = [plate[0] * 0.75, plate[1] * 0.75, plate[2] * 0.75];
    } else if (plate) {
      // On coloured plates the scratches are white (the user, 2026-11-10); on white ones, grey.
      [cr, cg, cb] = SCRATCHED[+(cr > 0.55)];
    }
    // Written by index rather than pushed: the close armour is some 20 000 vertices.
    for (let j = 0; j < 9; j += 3, w += STRIDE) {
      out[w] = P[j];
      out[w + 1] = P[j + 1];
      out[w + 2] = P[j + 2];
      out[w + 3] = N[j];
      out[w + 4] = N[j + 1];
      out[w + 5] = N[j + 2];
      out[w + 6] = cr;
      out[w + 7] = cg;
      out[w + 8] = t[i + 3];
      out[w + 9] = cb;
    }
  }
};
