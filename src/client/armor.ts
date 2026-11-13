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
import { BUST, BUST_Y, body } from './skin';
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
  /** Its bottom and top at each angle (degrees from the front, + outward) or rest point, when not level: a leg's opening. */
  low?: (a: number, c: Corner) => number;
  high?: (a: number, c: Corner) => number;
  /** Only on the woman's skin. */
  fem?: boolean;
  /** Only on the man's. */
  man?: boolean;
  /** A round plate: its outline an ellipse in (angle, height), [half the angle, middle height, half height]. */
  round?: [number, number, number];
  /** Moulded: a smooth shell round the trunk rather than the skin's facets (moulding()). */
  mould?: boolean;
  /** The ninja's own armour (the user, 2026-11-13), worn by him alone; he wears no other plate. */
  alone?: boolean;
  /** How far it stands off the skin, when not OFF. */
  off?: number;
  /** On the trunk, its angles are measured round the leg of that side, as a leg's plate's. */
  legs?: boolean;
  /** No plate: the suit's dark ribbed cloth, a hair off the skin, with no wall (the gusset). */
  thin?: boolean;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min((x - a) / (b - a), 1));
  return t * t * (3 - 2 * t);
};

/** A bell either side of the middle line, `c` out, `w` wide: no crease down the middle, as |x| would make. */
const twin = (x: number, c: number, w: number) =>
  Math.exp(-(((x - c) / w) ** 2)) + Math.exp(-(((x + c) / w) ** 2));

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
 * The woman's chest plate (the user, 2026-11-11: a more feminine armour, with the chest; until then
 * one moulded piece with the sternum filled): a cup each side over the bust skin.ts shapes, `CUP`
 * metres out at most, fullest low with a firm line under it, the sternum left hollow between them.
 */
export const CUP = 0.014;
/** The cups' fullest height, 3 mm under the bust's (BUST_Y, skin.ts). */
export const CUP_Y = 1.367;
export const bust = (x: number, y: number) =>
  CUP * twin(x, 0.068, 0.038) * Math.exp(-(((y - CUP_Y) / (y < CUP_Y ? 0.036 : 0.06)) ** 2));

/**
 * The forearm's plate (the user, 2026-11-13: its shape worked, after a trooper's armour, and down
 * to the wrist, `wrist`, the hand's joint being at 0.92 m): its top is
 * cut low in the crook of the elbow, at `y`, and rises by `rise` round to the elbow's point behind,
 * between the angles `a` round the arm; it flares by `flare` toward the elbow; and a flat ridge
 * `ridge` high runs down its outer side, from `x` out from the body's middle, fading to the wrist.
 */
export const CUFF = {
  wrist: 0.935,
  y: 1.122,
  rise: 0.045,
  a: [35, 150],
  flare: 0.004,
  ridge: 0.005,
  x: 0.253,
};
const cuff = (a: number) => CUFF.y + CUFF.rise * smooth(CUFF.a[0], CUFF.a[1], Math.abs(a));
const vambrace = (x: number, y: number) =>
  CUFF.flare * smooth(1.09, 1.15, y) +
  CUFF.ridge *
    smooth(CUFF.x, CUFF.x + 0.008, Math.abs(x)) *
    smooth(0.985, 0.998, y) *
    (1 - smooth(1.12, 1.135, y));

/**
 * The biceps' plate (the user, 2026-11-13: worked too, and thinner): the heights of its edges'
 * middles, how far they slant (`cut`), and how far it stands off the arm, not OFF.
 */
export const BICEPS = { y: [1.203, 1.315], cut: 0.018, off: 0.007 };

/** The knee pad's dome: up to 8 mm out at the kneecap. */
const knee = (x: number, y: number) =>
  0.008 * Math.max(0, 1 - ((Math.abs(x) - 0.1) / 0.07) ** 2 - ((y - 0.515) / 0.055) ** 2);

/**
 * The briefs (the user, 2026-11-10: round the hips under the belt, the leg's opening rising from the
 * crotch to the hip and lower behind, never between the thighs; 2026-11-12: thinner on the sides,
 * and no glitches). One opening line for all their pieces, the band on the trunk and the piece on
 * each thigh, by the angle of the rest point round the trunk (0 the front, 180 the back, either
 * side): the pieces met at the border of the trunk's skin and the legs' (0.93 m) on two lines that
 * did not agree, and left gaps, overlaps and slivers there. Lowest at the crotch, before and
 * behind, it rises to `side`, under the band's top (0.982), between the angles `at`.
 */
export const BRIEFS = { front: 0.85, back: 0.86, side: 0.972, at: [14, 66, 114, 168] };
/** The angle round the trunk of a rest point, degrees from the front, either side. */
const round = (c: Corner) => (Math.abs(Math.atan2(c[0], -c[2])) * 180) / Math.PI;
const opening = (_a: number, c: Corner) => {
  const [s, [f0, f1, b1, b0]] = [round(c), BRIEFS.at];
  return s <= 90
    ? BRIEFS.front + (BRIEFS.side - BRIEFS.front) * smooth(f0, f1, s)
    : BRIEFS.back + (BRIEFS.side - BRIEFS.back) * smooth(b0, b1, s);
};
/** How far the inside of a leg is from the angle a round it: 1 there, 0 from 60 degrees off. */
const inside = (a: number) => 1 - smooth(25, 60, Math.abs(((a + 630) % 360) - 180));

/**
 * On a thigh the opening also rises over its inside (a, round the leg, -90), above the leg's skin:
 * never between the thighs, with a curved edge where an angle limit cut it straight, a sliver of
 * plate standing by a wedge of suit at the back.
 */
const legOpening = (a: number, c: Corner) => opening(a, c) + (0.95 - opening(a, c)) * inside(a);

/** The gap between the briefs' thin sides and the thigh plates going up the hips: there is little room. */
const SIDE_GAP = 0.01;

/**
 * The thigh plates' top (the user, 2026-11-13, on a picture of a trooper's hips: a slant from the
 * hip down to the inside of the thigh, a crescent of dark ribbed suit between it and the briefs):
 * a line of its own by the angle round the trunk, on the thighs and up the hips' sides alike, so one
 * line across the border too. Lowest at the inside of the thigh, `front` and `back`, under the
 * crotch; SIDE_GAP under the briefs at the hip; between the angles `at`.
 */
export const THIGH = { front: 0.775, back: 0.815, at: [20, 86, 96, 166] };
const plates = (_a: number, c: Corner) => {
  const [s, [f0, f1, b1, b0], top] = [round(c), THIGH.at, BRIEFS.side - SIDE_GAP];
  return s <= 90
    ? THIGH.front + (top - THIGH.front) * smooth(f0, f1, s)
    : THIGH.back + (top - THIGH.back) * smooth(b0, b1, s);
};

/**
 * The gusset: dark cloth from under the briefs to under the thigh plates' top, where the grey suit
 * showed and, at the crotch, the stripes of the legs' insides. Its bottom is under the plates by
 * `under`, and as low all round the inside of the thigh, where no plate is.
 */
const GUSSET = { under: 0.025, off: 0.003, rib: 0.005 };
const gusset = (a: number, c: Corner) => {
  const p = plates(a, c);
  return p + (THIGH.front - p) * inside(a) - GUSSET.under;
};
/** The rib a rest point is in: slanted bands, down toward the crotch, both sides alike. */
const rib = (c: Corner) => (Math.abs(c[0]) + c[1] * 0.7) / GUSSET.rib;
/** The cloth's two shades, rib after rib. */
const CLOTH = [
  [0.04, 0.04, 0.045],
  [0.075, 0.075, 0.085],
];

/** The chest plate's top at angle a round the trunk (degrees, 0 the front): the neck's V. */
const chestTop = (a: number) => 1.5 - 0.045 * Math.cos((a * Math.PI * 1.4) / 180) ** 2;

/**
 * The chest plate's armholes (the user, 2026-11-12: a triangle came through the plate under the
 * armpit; 2026-11-13: small triangles on its sides): the shoulder's skin stands out of the trunk's
 * at the split (1.41 m, skin.ts), and a plate's edge across the two was cut in steps. Its top falls
 * to `y`, under the split, between the first two angles `a`, before the shoulder's skin starts; it
 * stays there over the pecs, then rounds down to `low` between the last two: no corner standing
 * out under the arm. The shoulder's bell (pads.ts) is over what is left bare. The breach that ran
 * across the plate by the armpits (2026-11-13) was the rim of the arm's hole in the trunk's skin:
 * see TURN in cook().
 */
export const ARMPIT = { a: [45, 52, 54, 64], y: 1.385, low: 1.34 };
const chestHigh = (a: number) => {
  const [q, top, [a0, a1, a2, a3]] = [Math.abs(a), chestTop(a), ARMPIT.a];
  return top - (top - ARMPIT.y) * smooth(a0, a1, q) - (ARMPIT.y - ARMPIT.low) * smooth(a2, a3, q);
};

/** The gap round the collar piece and over the back plate: there is little room up there. */
const COLLAR_GAP = 0.012;

/** The gap the user asked between the chest plate and the belly's plate. */
export const GAP = 0.02;

/**
 * The belly's plate (the user, 2026-11-13: worked, rounder): its bottom at the middle, how far it
 * goes round each side (degrees), how much its bottom rises to its corners, rounding them off, and
 * how far it domes at its middle.
 */
export const BELLY = { y: 1.035, a: 50, round: 0.07, dome: 0.007 };
const belly = (x: number, y: number) =>
  BELLY.dome * Math.max(0, 1 - (x / 0.14) ** 2 - ((y - 1.095) / 0.1) ** 2);

/** The chest plate's bottom: its height at the middle, and how much higher at the sides. */
export const CHEST = { y: 1.165, rise: 0.03 };
const chestLow = (a: number) => CHEST.y + CHEST.rise * smooth(0, 60, Math.abs(a));

/**
 * The ninja's vest: the bottom of its chest piece at the sides, how far its chevron dips at the
 * middle (and the lames' under it), the bottom of the V at its neck and its top beside it on the woman, the lames' height and the gap
 * between two pieces.
 */
export const VEST = { y: 1.278, dip: 0.035, neck: 1.385, top: 1.462, lame: 0.06, gap: 0.012 };
/** How far a piece of the vest dips at the angle a: a chevron, its point down the middle. */
const chevron = (a: number) => VEST.dip * Math.max(0, 1 - Math.abs(a) / 40);
/**
 * The vest's armholes (the user, 2026-11-13: a crack in the chest piece by the armpit): over the
 * trunk's split (1.41 m) the skin is the shoulder's and goes with the arm, away from the piece under
 * it. Its top falls to `y`, under the split, between the angles `a`, where the shoulder's skin starts.
 */
export const ARMHOLE = { a: [22, 32, 41], y: 1.398 };
/** The top of the vest's chest piece at the angle a: the V at the neck, then down into the armhole; hers lower, round over each breast (`fem`). */
const vestTop = (a: number, fem: number) => {
  const [q, top] = [Math.abs(a), fem ? VEST.top : 1.5];
  return Math.min(
    VEST.neck + (top - VEST.neck) * smooth(0, 25, q),
    top - (top - ARMHOLE.y) * smooth(ARMHOLE.a[1 - fem], ARMHOLE.a[2], q),
  );
};
/** How far the ninja's bracers stand off the forearm: half a plate's thickness. */
export const BRACER = 0.006;
export const REGIONS: Region[] = [
  // The chest plate, from under the ribs to the collar, cut round the neck; its bottom dips to the
  // middle (the user, 2026-11-13, on a picture of a trooper's armour).
  {
    part: PART.TRUNK,
    cx: 0,
    y: [CHEST.y, 1.5],
    a: [-64, 64],
    high: chestHigh,
    low: chestLow,
    swell: pecs,
    mould: true,
  },
  // The belly's plate, one piece (2026-11-13), GAP under the chest's along its bottom; rounded (BELLY).
  {
    part: PART.TRUNK,
    cx: 0,
    y: [BELLY.y, CHEST.y + CHEST.rise],
    a: [-BELLY.a, BELLY.a],
    high: a => chestLow(a) - GAP,
    low: a => BELLY.y + BELLY.round * (Math.abs(a) / BELLY.a) ** 3,
    swell: belly,
  },
  // The front of each thigh down to GAP over the knee pad, the knees, the outer side of each forearm.
  { part: PART.LEG, cx: 0.1, y: [0.585, 0.94], a: [-62, 78], high: plates },
  // The ninja's shin guards (the user, 2026-11-13), from under the knee to the boot.
  { part: PART.LEG, cx: 0.1, y: [0.17, 0.44], a: [-62, 62], alone: true },
  // The knees: round (the user, 2026-11-10), domed.
  { part: PART.LEG, cx: 0.1, y: [0.46, 0.57], a: [-60, 60], round: [56, 0.515, 0.05], swell: knee },
  // The forearms, down to the gloves (the user, 2026-11-10), all round the arm (2026-11-12).
  {
    part: PART.ARM,
    cx: 0.222,
    y: [CUFF.wrist, CUFF.y + CUFF.rise],
    a: [-181, 181],
    high: cuff,
    swell: vambrace,
  },
  // The user, 2026-11-10: a small plate on the biceps, under the shoulder plate; one on the back of
  // each thigh; and the shorts cut as briefs: round the hips under the belt, on each thigh the leg's
  // opening rising from the crotch to the hip and lower behind, never between the thighs; a cup at
  // the crotch (crotch()).
  // The biceps' goes all round the arm too (the user, 2026-11-12).
  {
    part: PART.ARM,
    cx: 0.207,
    y: [BICEPS.y[0] - BICEPS.cut, BICEPS.y[1] + BICEPS.cut],
    a: [-181, 181],
    // Higher on the outside, under the shoulder's bell, than in the armpit; lower behind, toward
    // the elbow's point, than in its crook.
    high: a => BICEPS.y[1] + BICEPS.cut * Math.sin((a * Math.PI) / 180),
    low: a => BICEPS.y[0] + BICEPS.cut * Math.cos((a * Math.PI) / 180),
    off: BICEPS.off,
  },
  { part: PART.LEG, cx: 0.1, y: [0.6, 0.94], a: [-58, 58], face: 180, high: plates },
  { part: PART.TRUNK, cx: 0, y: [0.925, 0.982], a: [-181, 181], low: opening },
  // The user, 2026-11-10: a piece over the collarbones up to the neck, following the chest plate's
  // V a little over it, out to the shoulder plates; and one on each shoulder blade, over the back's,
  // a groove down the spine between them.
  {
    part: PART.TRUNK,
    cx: 0,
    y: [1.47, 1.528],
    a: [-78, 78],
    low: a => chestTop(a) + COLLAR_GAP,
  },
  { part: PART.TRUNK, cx: 0, y: [1.4 + COLLAR_GAP, 1.505], a: [-62, -5], face: 180 },
  { part: PART.TRUNK, cx: 0, y: [1.4 + COLLAR_GAP, 1.505], a: [5, 62], face: 180 },
  // The shoulders have a bell each (pads.ts), hers slimmer.
  // The back (the user, 2026-11-10, for Highline, where no pack covers it): a plate between the
  // shoulder blades and one on the small of the back, GAP apart.
  { part: PART.TRUNK, cx: 0, y: [1.2, 1.4], a: [-58, 58], face: 180 },
  { part: PART.TRUNK, cx: 0, y: [1.035, 1.2 - GAP], a: [-52, 52], face: 180 },
  // The thigh plates go on up the hips' sides, SIDE_GAP under the briefs' thin sides (the user): the
  // same two plates on the trunk's skin, cut at the same angles round the leg, so the edges of each
  // run on across the border (one piece spanning both left a tab over the stripe between them).
  { part: PART.TRUNK, cx: 0.1, y: [0.92, 0.975], a: [-62, 78], high: plates, legs: true },
  {
    part: PART.TRUNK,
    cx: 0.1,
    y: [0.92, 0.975],
    a: [-58, 58],
    face: 180,
    high: plates,
    legs: true,
  },
  { part: PART.LEG, cx: 0.1, y: [0.845, 0.935], a: [-181, 181], low: legOpening },
  // The gusset under them (GUSSET): on the trunk and round the top of each thigh.
  { part: PART.TRUNK, cx: 0, y: [0.8, 0.98], a: [-181, 181], thin: true },
  { part: PART.LEG, cx: 0.1, y: [0.74, 0.94], a: [-181, 181], low: gusset, thin: true },
  // The ninja's vest (the user, 2026-11-13, on his picture of a ninja's armour): a chest piece open in
  // a deep V at the neck, its bottom a chevron; three lames down the belly nested under it, each
  // narrower; a plate on the back and one on the small of it; and a bracer on each forearm. His
  // shoulder pads and his collar are pieces of their own (pads.ts).
  ...[0, 1].map((fem): Region => ({
    part: PART.TRUNK,
    cx: 0,
    y: [VEST.y - VEST.dip, 1.5],
    a: [-60, 60],
    high: a => vestTop(a, fem),
    low: a => VEST.y - chevron(a),
    swell: pecs,
    mould: true,
    alone: true,
    fem: !!fem,
    man: !fem,
  })),
  ...[0, 1, 2].map((k): Region => {
    const top = VEST.y - VEST.gap - k * (VEST.lame + VEST.gap);
    return {
      part: PART.TRUNK,
      cx: 0,
      y: [top - VEST.lame - VEST.dip, top],
      a: [-46 + k * 4, 46 - k * 4],
      high: a => top - chevron(a),
      low: a => top - VEST.lame - chevron(a),
      alone: true,
    };
  }),
  { part: PART.TRUNK, cx: 0, y: [1.2, 1.46], a: [-58, 58], face: 180, alone: true },
  { part: PART.TRUNK, cx: 0, y: [1.035, 1.2 - GAP], a: [-50, 50], face: 180, alone: true },
  // His bracers, thinner (the user, 2026-11-13).
  { part: PART.ARM, cx: 0.222, y: [0.99, 1.14], a: [-181, 181], alone: true, off: BRACER },
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
  const side = g.part == PART.TRUNK && !g.legs ? 1 : Math.sign(x) || 1;
  const a = (Math.atan2((x - g.cx * side) * side, -z) * 180) / Math.PI;
  return g.face ? ((a - g.face + 540) % 360) - 180 : a;
};

/** The region's constraints on a rest point, each >= 0 inside. */
const limits = (g: Region) => {
  const raw = (c: Corner) => angle({ ...g, face: 0 }, c[0], c[2]);
  return [
    (c: Corner) => c[1] - (g.low ? g.low(raw(c), c) : g.y[0]),
    (c: Corner) => (g.high ? Math.min(g.high(raw(c), c), g.y[1]) : g.y[1]) - c[1],
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

/** Where the corner `c` of a moulded plate lies at rest: set off by `m` (moulding()), as a point to test against a region's limits. */
const landed = (c: Corner, m: number[]): Corner => [
  c[0] + m[4] * m[0],
  c[1] + m[5] * m[0],
  c[2] + m[6] * m[0],
  0,
  0,
  0,
  0,
  0,
  0,
  0,
];

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
      // Where the limit is nil between them: by halves, for a limit that is no straight line
      // (a curved edge cut by straight-line guesses came out in teeth).
      let [lo, hi] = [0, 1];
      for (let i = 0; i < 7; i++) {
        const mid = (lo + hi) / 2;
        if (f(mix(p, q, mid)) >= 0 == fp >= 0) {
          lo = mid;
        } else {
          hi = mid;
        }
      }
      const c = mix(p, q, (lo + hi) / 2);
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
 * colour, layer, whether it is a wall (its normal its own, flat) and its region (-1: a scratch).
 */
interface Recipe {
  c: number[];
  t: number[];
}
const CORNER = 11;
const TRI = 6;
/** A triangle's kind, bits: 1 a wall (its normal its own, flat); from TURN on, one for each corner of its skin triangle whose normal is taken the other way. */
const TURN = 2;

const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let z = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) ^ z;
  return ((z ^ (z >>> 14)) >>> 0) / 2 ** 32;
};

/** The region as the skin's build wears it: the woman's chest plate has her own swell. */
const shaped = (g: Region, s: Skin): Region =>
  s.b && g.swell === pecs ? { ...g, swell: bust } : g;

/** A moulded corner: how far off the skin, the tilt of its normal (rest normal less the shell's), its rest normal. */
type Moulded = number[];

const bell = (a: number, w: number) => Math.exp(-((a / w) ** 2));
const unit = (x: number, y: number, z: number) => {
  const n = Math.hypot(x, y, z) || 1;
  return [x / n, y / n, z / n];
};

/**
 * The share of the skin a moulded plate may come closer to than OFF, how close it comes to any and
 * how far it stands off at most, and the least the skin must face out from the trunk's axis (the
 * cosine) to be moulded: the eye's skin (body(2)) closes the trunk with a cap over the shoulders
 * whose normals point up, and set off to the shell along them the plate rose over the head (the
 * user, 2026-11-12, climbing: "the legs go up").
 */
const [CLEAR, FLOOR, CEIL, FACING] = [0.03, 0.004, 0.08, 0.5];

/** A moulded plate's shell: its axis, the fit's weights, its clearance, per build and region. */
interface Shell {
  z0: number;
  w: number[];
  clear: number;
}
const shells = new Map<number, Shell>();

/** The fit's terms: even powers of the angle round the axis by powers of the height. */
const [POW_A, POW_Y] = [4, 5];
const fitAt = (w: number[], a: number, y: number) => {
  const [a2, h] = [a * a, (y - 1.35) / 0.2];
  let [sum, pa] = [0, 1];
  for (let i = 0, p = 0; i < POW_A; i++, pa *= a2) {
    let py = pa;
    for (let j = 0; j < POW_Y; j++, p++, py *= h) {
      sum += w[p] * py;
    }
  }
  return sum;
};

/** Her bust on the skin where it faces forward by `ahead` (retarget() in skin.ts), along -z. */
const sag = (b: number, x: number, y: number, ahead: number) =>
  b
    ? BUST *
      Math.min(Math.max(ahead * 1.6, 0), 1) *
      bell(Math.abs(x) - 0.066, 0.05) *
      bell(y - BUST_Y, y < BUST_Y ? 0.042 : 0.065)
    : 0;

/**
 * Her bust as the shell has it (the user, 2026-11-12: keep the bust on the woman, smooth the man):
 * as deep as on her skin, the same bells but smooth across the sternum and round the sides.
 */
const bustR = (b: number, a: number, r: number, y: number) =>
  b
    ? BUST *
      smooth(0, 0.625, Math.cos(a)) *
      twin(r * Math.sin(a), 0.066, 0.05) *
      bell(y - BUST_Y, y < BUST_Y ? 0.042 : 0.065) *
      Math.cos(a)
    : 0;

/**
 * Her breasts on the shell (the user, 2026-11-12: a uniform dome each, a little bigger): a round
 * dome each side, `h` out at its middle (x, y) and falling to nothing `r` away, smooth at its rim;
 * it stands in for the skin's bust and bust()'s cups.
 */
export const DOME = { x: 0.07, y: 1.362, r: 0.078, h: 0.05 };
const dome = (x: number, y: number) =>
  [x - DOME.x, x + DOME.x].reduce((sum, dx) => {
    const q = 1 - (dx * dx + (y - DOME.y) ** 2) / DOME.r ** 2;
    return sum + DOME.h * Math.max(0, q) ** 2;
  }, 0);
/** The ninja's vest has them a little smaller (the user, 2026-11-13): this much of their height. */
export const SLIM = 0.8;

const polar = (z0: number, x: number, z: number) => [Math.atan2(x, z0 - z), Math.hypot(x, z - z0)];

/** The skin's radius at a point of the man's rest skin, its normal's z given: hers has the bust on. */
const skinR = (b: number, z0: number, x: number, y: number, z: number, nz: number) => {
  const [a, r] = polar(z0, x, z);
  return r + sag(b, x, y, -nz) * Math.cos(a);
};

/**
 * The marine's chest shell swells toward the shoulders (the user, 2026-11-13: the plate on over the
 * top of the pecs, near the shoulders): there the shoulder's skin stands out of the trunk's, and a
 * plate held off it stood a step over the plate under the split. `out` more, from the first angle
 * `a` (degrees) to the second and the first height `y` to the second, so the two are one surface;
 * less again up to the collar piece (`top`), which it would cover.
 */
export const SWELL = { out: 0.008, a: [32, 52], y: [1.33, 1.41], top: [1.44, 1.5] };

/** The shell's radius at angle a and height y, its clearance left out. */
const rawR = (b: number, gi: number, w: number[], a: number, y: number) => {
  const f = fitAt(w, a, y);
  const swell = b ? dome : REGIONS[gi].swell;
  // The marine's swells toward the shoulders (SWELL).
  const out = REGIONS[gi].alone
    ? 0
    : SWELL.out *
      smooth(SWELL.a[0], SWELL.a[1], (Math.abs(a) * 180) / Math.PI) *
      smooth(SWELL.y[0], SWELL.y[1], y) *
      (1 - 0.6 * smooth(SWELL.top[0], SWELL.top[1], y));
  return f + out + (swell ? swell(f * Math.sin(a), y) : 0) * (b && REGIONS[gi].alone ? SLIM : 1);
};

/**
 * The shell of build b's region gi, fitted once on the near skin, whatever the level drawn: points
 * all over its trunk's triangles, the corners and between them, the bust taken off, fitted by least
 * squares; then OFF clear of the region's points but the closest CLEAR of them.
 */
const shellOf = (b: number, gi: number): Shell => {
  const key = b * REGIONS.length + gi;
  const had = shells.get(key);
  if (had) {
    return had;
  }
  const { t, l, u, v: own } = body(1, b);
  const v = u ?? own;
  const W = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
    [1 / 3, 1 / 3, 1 / 3],
    [2 / 3, 1 / 6, 1 / 6],
    [1 / 6, 2 / 3, 1 / 6],
    [1 / 6, 1 / 6, 2 / 3],
  ];
  const pts: number[][] = [];
  for (let k = 0; k < t.length / 3; k++) {
    if (partOf(l![k]) == PART.TRUNK) {
      for (const c of W) {
        const p = [0, 1, 2, 5].map(j =>
          [0, 1, 2].reduce((sum, q) => sum + v[t[k * 3 + q] * 6 + j] * c[q], 0),
        );
        if (p[1] > 1.15 && p[1] < 1.55) {
          pts.push(p);
        }
      }
    }
  }
  let [front, back] = [Infinity, -Infinity];
  for (const p of pts) {
    if (p[1] > 1.2 && p[1] < 1.5) {
      front = Math.min(front, p[2]);
      back = Math.max(back, p[2]);
    }
  }
  // The axis, up through the middle of the chest.
  const z0 = (front + back) / 2;
  const M = POW_A * POW_Y;
  const A = Array.from({ length: M }, () => new Array<number>(M + 1).fill(0));
  const e = new Array<number>(M).fill(0);
  for (const [x, y, z, nz] of pts) {
    const [a, r] = polar(z0, x, z);
    if (Math.abs(a) < 1.35) {
      const f = e.map((_, p) => {
        e.fill(0);
        e[p] = 1;
        return fitAt(e, a, y);
      });
      const hgt = skinR(b, z0, x, y, z, nz) - bustR(b, a, r, y);
      for (let p = 0; p < M; p++) {
        for (let q = 0; q < M; q++) {
          A[p][q] += f[p] * f[q];
        }
        A[p][M] += f[p] * hgt;
      }
    }
  }
  // Gauss-Jordan with partial pivoting.
  for (let p = 0; p < M; p++) {
    let m = p;
    for (let q = p + 1; q < M; q++) {
      m = Math.abs(A[q][p]) > Math.abs(A[m][p]) ? q : m;
    }
    [A[p], A[m]] = [A[m], A[p]];
    for (let q = 0; q < M; q++) {
      if (q != p) {
        const f = A[q][p] / A[p][p];
        for (let r = p; r <= M; r++) {
          A[q][r] -= f * A[p][r];
        }
      }
    }
  }
  const w = A.map((row, p) => row[M] / row[p]);
  // Not clear of all of it: the step at the armpits (the trunk's split) would push the whole shell
  // out; the few corners there keep FLOOR.
  const over: number[] = [];
  for (const [x, y, z, nz] of pts) {
    if (LIMITS[gi].every(f => f([x, y, z, 0, 0, 0, 0, 0, 0, 0]) >= 0)) {
      over.push(skinR(b, z0, x, y, z, nz) - rawR(b, gi, w, polar(z0, x, z)[0], y));
    }
  }
  over.sort((p, q) => q - p);
  const shell = { z0, w, clear: over[Math.floor(over.length * CLEAR)] + OFF };
  shells.set(key, shell);
  return shell;
};

/**
 * A moulded plate (the user, 2026-11-12: the chest uneven, as the plate followed every facet of the
 * skin, its creases and the line under the bust): a shell round the trunk (shellOf()), its radius
 * smooth in the angle (even: both sides alike) and the height. Each corner of the region on the
 * skin `s` is set off to the shell, with the shell's normal, turned as the skin turns.
 */
const moulding = (s: Skin, gi: number) => {
  const b = s.b ?? 0;
  const { z0, w, clear } = shellOf(b, gi);
  const shell = (a: number, y: number) => rawR(b, gi, w, a, y) + clear;
  const done = new WeakMap<Corner, Moulded>();
  const { t } = s;
  const facing = (x: number, z: number, n: number[]) => {
    const a = polar(z0, x, z)[0];
    return n[0] * Math.sin(a) - n[2] * Math.cos(a);
  };
  return (c: Corner, k: number, turned = 0): Moulded => {
    const had = done.get(c);
    if (had) {
      return had;
    }
    const [x, y, z] = c;
    // The rest normal of the skin as drawn, the build's own: the plate is set off along it. A
    // corner on the rim of a hole has its own the other way (`turned`, cook()).
    const o = unit(
      ...([0, 1, 2].map(j =>
        [0, 1, 2].reduce(
          (sum, q) =>
            sum + s.v[t[k * 3 + q] * 6 + 3 + j] * c[3 + q] * (turned & (TURN << q) ? -(j != 1) : 1),
          0,
        ),
      ) as [number, number, number]),
    );
    if (facing(x, z, o) < FACING) {
      // Not facing out: set off as an unmoulded plate, along the skin, with its normal.
      const m = [OFF, 0, 0, 0, ...o];
      done.set(c, m);
      return m;
    }
    // Her bust is on the skin as drawn (retarget(), by the man's normal): the plate starts from it.
    const base = [x, y, z - sag(b, x, y, -unit(c[6], c[7], c[8])[2])];
    // Onto the shell where the normal meets it, not where it leaves the skin: on her bust the
    // normals fan out, and the plate set off by the gap at its foot was uneven (the user, 2026-11-13).
    /** How far the shell is past the point `d` along the normal, and the shell there. */
    const gap = (d: number) => {
      const p = base.map((c, j) => c + o[j] * d);
      const [a, r] = polar(z0, p[0], p[2]);
      const R = shell(a, p[1]);
      return [R - r, a, R, p[1]];
    };
    let [g, a, R, py] = gap(0);
    let [lo, hi] = [0, CEIL];
    // Her alone (his chest is flat enough, and his plate is left as it was): where the normal
    // crosses the shell, by halving; a dome's slope is too steep to walk down.
    for (let i = 0; b && i < 12; i++) {
      const m = (lo + hi) / 2;
      [g, a, R, py] = gap(m);
      if (g > 0) {
        lo = m;
      } else {
        hi = m;
      }
    }
    const d = Math.min(CEIL, Math.max(FLOOR, b ? lo : g / facing(x, z, o)));
    const [sa, ca] = [Math.sin(a), Math.cos(a)];
    const e = 1e-3;
    const Ra = (shell(a + e, py) - shell(a - e, py)) / (2 * e);
    const Ry = (shell(a, py + e) - shell(a, py - e)) / (2 * e);
    // The shell's normal: its slope round the axis crossed with its slope up it.
    const Pa = [Ra * sa + R * ca, 0, -Ra * ca + R * sa];
    const Py = [Ry * sa, 1, -Ry * ca];
    const N = unit(
      Pa[1] * Py[2] - Pa[2] * Py[1],
      Pa[2] * Py[0] - Pa[0] * Py[2],
      Pa[0] * Py[1] - Pa[1] * Py[0],
    );
    const out = N[0] * sa - N[2] * ca >= 0 ? N : N.map(q => -q);
    const m = [d, o[0] - out[0], o[1] - out[1], o[2] - out[2], ...o];
    done.set(c, m);
    return m;
  };
};

/** The recipe of the armour on the skin `s`, `fine` (curved outlines refined, scratches) or not. */

const cook = (s: Skin, fine: boolean): Recipe => {
  // The regions are written on the man's rest mesh: another build's plates are cut there and sit
  // on its own skin, corner for corner.
  const { t, l } = s;
  const v = s.u ?? s.v;
  const r: Recipe = { c: [], t: [] };
  if (!l) {
    return r;
  }
  /** The region of the triangles added now: -1 for the scratches. */
  let at = -1;
  /** The corners turned (TURN) of the skin triangle the triangles added now are cut out of. */
  let flat = 0;
  const add = (
    cs: Corner[],
    offs: number[],
    swell: Region['swell'],
    col: number[],
    layer: number,
    wall: number,
    k: number,
    moulded?: Moulded[],
  ) => {
    cs.forEach((c, i) => {
      let g = [0, 0, 0];
      if (moulded) {
        const m = moulded[i];
        r.c.push(k, c[3], c[4], c[5], offs[i], m[1], m[2], m[3], m[4], m[5], m[6]);
        return;
      }
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
    r.t.push(col[0], col[1], col[2], layer, wall | flat, at);
  };
  /** A corner at rest set `d` off along its rest normal: to wind the walls out. */
  const lift = (c: Corner, d: number) => {
    const nl = Math.hypot(c[6], c[7], c[8]) || 1;
    return [0, 1, 2].map(j => c[j] + (c[6 + j] / nl) * d);
  };
  const moulds = REGIONS.map((g, i) => (g.mould ? moulding(s, i) : undefined));
  for (let k = 0; k < t.length / 3; k++) {
    const part = partOf(l[k]);
    if (part < 0) {
      continue;
    }
    const ys = [0, 1, 2].map(c => v[t[k * 3 + c] * 6 + 1]);
    const [lo, hi] = [Math.min(...ys), Math.max(...ys)];
    for (let g = 0; g < REGIONS.length; g++) {
      const region = shaped(REGIONS[g], s);
      at = g;
      if (
        region.part != part ||
        hi < SPANS[g][0] ||
        lo > SPANS[g][1] ||
        (region.fem && !s.b) ||
        (region.man && s.b)
      ) {
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
      // A triangle on the rim of a hole of the trunk's skin (the arm's): the rim's normals point
      // in, against its face. A plate set off along them dived into the body, a breach across it
      // (the user, 2026-11-13): such a corner's normal is taken the other way, level (TURN, a bit a
      // corner of the skin triangle), the same for every triangle that shares it, so they still meet.
      flat = 0;
      if (part == PART.TRUNK) {
        const [p, q, w] = tri;
        const [e, f] = [q.map((x, j) => x - p[j]), w.map((x, j) => x - p[j])];
        const n = [e[1] * f[2] - e[2] * f[1], e[2] * f[0] - e[0] * f[2], e[0] * f[1] - e[1] * f[0]];
        // Its face, the way out of the trunk; one that faces up or down has no rim to tell.
        const out =
          (n[0] * p[0] + n[2] * p[2]) / ((Math.hypot(...n) || 1) * Math.hypot(p[0], p[2]));
        const sign = out < 0 ? -1 : 1;
        if (Math.abs(out) > 0.3) {
          tri.forEach((c, i) => {
            if ((n[0] * c[6] + n[1] * c[7] + n[2] * c[8]) * sign < 0) {
              flat |= TURN << i;
            }
          });
        }
        // All three against it: a face of the skin turned in, not a rim. Left as it was.
        if (flat == TURN * 7) {
          flat = 0;
        }
        // The other way, and level: tilted up or down it made a point on the plate's edge.
        tri.forEach((c, i) => {
          if (flat & (TURN << i)) {
            [c[6], c[7], c[8]] = [-c[6], 0, -c[8]];
          }
        });
      }
      // A triangle across the turn opposite the plate's face, where its angles jump by 360, would
      // seem to cross the plate's edges: it is out of every plate short of a whole ring.
      if (region.a[1] - region.a[0] < 360) {
        const as = tri.map(c => angle(region, c[0], c[2]));
        if (Math.max(...as) - Math.min(...as) > 180) {
          continue;
        }
      }
      // A round or curved outline needs finer pieces than the skin's, close up.
      // A moulded plate's curves, finer still: the woman's domes.
      const pieces = !fine
        ? [tri]
        : region.mould
          ? split(split([tri]))
          : region.round || region.low || region.high
            ? split([tri])
            : [tri];
      for (const piece of pieces) {
        const shell = moulds[g];
        const mould = shell && ((c: Corner, k: number) => shell(c, k, flat));
        // A moulded plate is cut where it lies, on its shell, not where its skin is: set off some
        // centimetres along normals that fan out, the edges of two pieces of skin (the trunk's and
        // the shoulder's) did not meet, a triangle standing out by the armpit (the user, 2026-11-13).
        const poly = LIMITS[g].reduce(
          (p, f, i) => clip(p, mould ? c => f(landed(c, mould(c, k))) : f, 1 << i),
          piece,
        );
        if (poly.length < 3) {
          continue;
        }
        if (region.thin) {
          // Cloth: no wall; close up, cut in ribs of two shades.
          const js = poly.map(rib);
          const [j0, j1] = fine
            ? [Math.floor(Math.min(...js)), Math.floor(Math.max(...js))]
            : [0, 0];
          for (let j = j0; j <= j1; j++) {
            const band = fine
              ? clip(
                  clip(poly, c => rib(c) - j, 0),
                  c => j + 1 - rib(c),
                  0,
                )
              : poly;
            for (let i = 1; i + 1 < band.length; i++) {
              add(
                [band[0], band[i], band[i + 1]],
                [GUSSET.off, GUSSET.off, GUSSET.off],
                undefined,
                CLOTH[j & 1],
                -1,
                0,
                k,
              );
            }
          }
          continue;
        }
        const off = (c: Corner) =>
          mould
            ? mould(c, k)[0]
            : (region.off ?? OFF) + (region.swell ? region.swell(c[0], c[1]) : 0);
        for (let i = 1; i + 1 < poly.length; i++) {
          const cs = [poly[0], poly[i], poly[i + 1]];
          add(cs, cs.map(off), region.swell, WHITE, GLOSS, 0, k, mould && cs.map(c => mould(c, k)));
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
  at = -1;
  flat = 0;
  if (fine) {
    scratchesOn(s, add, moulds, g => (at = g));
    at = -1;
  }
  return r;
};

/**
 * The plates' details (the user, 2026-11-13, on a picture of a trooper's armour: discreet, on the
 * chest plate and the forearms): dark strokes drawn as the scratches are. Each is [the part, its
 * middle line across, the angle round it (degrees, 0 the front, + outward), its height, its tilt
 * from upright (degrees), its length, its half width, the side it is on (0: both)].
 */
export const DETAILS = [
  // A row of slits on the right of the chest, under the collar; a small V at the collar's middle.
  ...[0, 1, 2, 3, 4, 5].map(i => [PART.TRUNK, 0, 14 + i * 3.4, 1.435, 0, 0.012, 0.0013, 1]),
  [PART.TRUNK, 0, 4.6, 1.438, 62, 0.022, 0.0013, 0],
  // On the ridge of each forearm: three slits across under the elbow and a small port by the wrist;
  // a groove along each side of the ridge.
  ...[1.092, 1.102, 1.112].map(y => [PART.ARM, 0.222, 90, y, 90, 0.022, 0.0012, 0]),
  [PART.ARM, 0.222, 90, 1.012, 0, 0.012, 0.004, 0],
  ...[62, 118].flatMap(a => [1.035, 1.068].map(y => [PART.ARM, 0.222, a, y, 0, 0.03, 0.0012, 0])),
];
const DARK = [0.07, 0.07, 0.08];

/**
 * Adds to the recipe the scratches on the plates of the skin `s`: short strokes at random (the
 * same each time) on its triangles inside a plate, each lying on one triangle, wholly inside its
 * plate, a hair over it, matte. Then its details (DETAILS), each tagged with its plate (`tag`): they
 * keep their colour on a plate in a team's.
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
    moulded?: Moulded[],
  ) => void,
  moulds: (((c: Corner, k: number) => Moulded) | undefined)[],
  tag: (g: number) => void,
) => {
  const { t, l } = s;
  const v = s.u ?? s.v;
  const rand = seeded(0xa4f0);
  const n = t.length / 3;
  const probe = (x: number[]): Corner => [...x, 0, 0, 0, 0, 0, 0, 0];
  const dot = (p: number[], q: number[]) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  const corners = (k: number) => [0, 1, 2].map(c => [0, 1, 2].map(j => v[t[k * 3 + c] * 6 + j]));
  /**
   * A stroke on the skin triangle k at `at`, L long and W half wide, turned by `a` in the
   * triangle's plane from its first edge, or from upright when `up`; in `col`, tagged as a detail
   * when `mark`. Whether it was drawn: it is wholly inside one plate.
   */
  const stroke = (
    k: number,
    at: number[],
    a: number,
    L: number,
    W: number,
    col: number[],
    up = false,
    mark = false,
  ) => {
    const part = partOf(l![k]);
    const P = corners(k);
    const N = [0, 1, 2].map(c => [0, 1, 2].map(j => v[t[k * 3 + c] * 6 + 3 + j]));
    const g = REGIONS.findIndex(
      (rg, i) =>
        rg.part == part &&
        !rg.alone &&
        !rg.thin &&
        !(rg.fem && !s.b) &&
        !(rg.man && s.b) &&
        LIMITS[i].every(f => f(probe(at)) >= 0),
    );
    if (g < 0) {
      return false;
    }
    const e1 = P[1].map((x, j) => x - P[0][j]);
    const e2 = P[2].map((x, j) => x - P[0][j]);
    const nn = [
      e1[1] * e2[2] - e1[2] * e2[1],
      e1[2] * e2[0] - e1[0] * e2[2],
      e1[0] * e2[1] - e1[1] * e2[0],
    ];
    const nl = Math.hypot(...nn);
    if (nl < 1e-9) {
      return false;
    }
    // The plane's axes: its first edge, or upright in it.
    const x0 = up ? [0, 1, 0].map((q, j) => q - (nn[j] * nn[1]) / (nl * nl)) : e1;
    const l1 = Math.hypot(...x0);
    if (l1 < 1e-6) {
      return false;
    }
    const x = x0.map(q => q / l1);
    const y = [
      nn[1] * x[2] - nn[2] * x[1],
      nn[2] * x[0] - nn[0] * x[2],
      nn[0] * x[1] - nn[1] * x[0],
    ].map(q => q / nl);
    const d = x.map((q, j) => q * Math.cos(a) + y[j] * Math.sin(a));
    const sd = x.map((q, j) => -q * Math.sin(a) + y[j] * Math.cos(a));
    const quad = [
      [-0.5, -1],
      [0.5, -1],
      [0.5, 1],
      [-0.5, 1],
    ].map(([f, h]) => at.map((q, j) => q + d[j] * L * f + sd[j] * W * h));
    if (!quad.every(c => LIMITS[g].every(f => f(probe(c)) >= 0))) {
      return false;
    }
    // Weights: solve corner - P0 = c1 e1 + c2 e2 in the plane.
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
    const mould = moulds[g];
    const ms = mould && cs.map(c => mould(c, k));
    // On a moulded plate, inside it where it lies (cook()).
    if (ms && !cs.every((c, i) => LIMITS[g].every(f => f(landed(c, ms[i])) >= 0))) {
      return false;
    }
    const offs = cs.map(
      (c, i) =>
        (ms ? ms[i][0] : (REGIONS[g].off ?? OFF) + (swell ? swell(c[0], c[1]) : 0)) + 0.0008,
    );
    const pick = (...i: number[]) => ms && i.map(j => ms[j]);
    tag(mark ? g : -1);
    add(
      [cs[0], cs[1], cs[2]],
      [offs[0], offs[1], offs[2]],
      undefined,
      col,
      -1,
      0,
      k,
      pick(0, 1, 2),
    );
    add(
      [cs[0], cs[2], cs[3]],
      [offs[0], offs[2], offs[3]],
      undefined,
      col,
      -1,
      0,
      k,
      pick(0, 2, 3),
    );
    return true;
  };
  let made = 0;
  for (let tries = 0; tries < SCRATCHES * 60 && made < SCRATCHES; tries++) {
    const k = Math.floor(rand() * n);
    const P = corners(k);
    const [u, w] = [rand(), rand()];
    const [b1, b2] = u + w > 1 ? [1 - u, 1 - w] : [u, w];
    const at = [0, 1, 2].map(j => P[0][j] + (P[1][j] - P[0][j]) * b1 + (P[2][j] - P[0][j]) * b2);
    const a = rand() * Math.PI;
    const [L, W] = [0.008 + rand() * 0.022, 0.0005 + rand() * 0.0006];
    made += +stroke(k, at, a, L, W, WORN[Math.floor(rand() * WORN.length)]);
  }
  for (const [part, cx, ang, y, tilt, L, W, only] of DETAILS) {
    for (const side of only ? [only] : [1, -1]) {
      // Where a ray out from the part's middle line leaves the skin: its furthest triangle.
      const r = (ang * Math.PI) / 180;
      const [o, w] = [
        [cx * side, y, 0],
        [Math.sin(r) * side, 0, -Math.cos(r)],
      ];
      let best = [-1, 0];
      for (let k = 0; k < n; k++) {
        if (partOf(l![k]) != part) {
          continue;
        }
        const P = corners(k);
        const [e1, e2] = [P[1].map((q, j) => q - P[0][j]), P[2].map((q, j) => q - P[0][j])];
        const h = [
          w[1] * e2[2] - w[2] * e2[1],
          w[2] * e2[0] - w[0] * e2[2],
          w[0] * e2[1] - w[1] * e2[0],
        ];
        const det = dot(e1, h);
        if (Math.abs(det) < 1e-12) {
          continue;
        }
        const q = o.map((c, j) => c - P[0][j]);
        const bu = dot(q, h) / det;
        const c = [
          q[1] * e1[2] - q[2] * e1[1],
          q[2] * e1[0] - q[0] * e1[2],
          q[0] * e1[1] - q[1] * e1[0],
        ];
        const [bv, far] = [dot(w, c) / det, dot(e2, c) / det];
        if (bu >= 0 && bv >= 0 && bu + bv <= 1 && far > best[1]) {
          best = [k, far];
        }
      }
      if (best[0] >= 0) {
        const at = o.map((c, j) => c + w[j] * best[1]);
        stroke(best[0], at, ((tilt * Math.PI) / 180) * side, L, W, DARK, true, true);
      }
    }
  }
};

const recipes = [new WeakMap<Skin, Recipe>(), new WeakMap<Skin, Recipe>()];

/**
 * Appends the armour cut out of the skin `s` drawn into `out` from the float `from` on (skin()
 * writes three vertices per triangle of s.t, in order). Not `fine` (a runner not close by), curved
 * outlines follow the skin's own triangles, unrefined, and there are no scratches. `plate` is the
 * plates' colour (their walls a shade darker): white when absent. The `ninja` wears his own armour.
 */
export const armor = (
  out: number[],
  from: number,
  s: Skin,
  fine = true,
  plate?: number[],
  ninja = false,
) => {
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
    // The ninja's own armour alone, without scratches, and none of it on another.
    if (ninja != !!REGIONS[t[i + 5]]?.alone) {
      ci += 3 * CORNER;
      continue;
    }
    for (let j = 0; j < 3; j++, ci += CORNER) {
      const o = from + c[ci] * 3 * STRIDE;
      // A weight is the other way for a corner whose normal is turned (cook()): the place is not.
      const kind = t[i + 4];
      const b0 = c[ci + 1];
      const b1 = c[ci + 2];
      const b2 = c[ci + 3];
      const [m0, m1, m2] = [
        kind & TURN ? -b0 : b0,
        kind & (TURN << 1) ? -b1 : b1,
        kind & (TURN << 2) ? -b2 : b2,
      ];
      const o1 = o + STRIDE;
      const o2 = o1 + STRIDE;
      const x = out[o] * b0 + out[o1] * b1 + out[o2] * b2;
      const y = out[o + 1] * b0 + out[o1 + 1] * b1 + out[o2 + 1] * b2;
      const z = out[o + 2] * b0 + out[o1 + 2] * b1 + out[o2 + 2] * b2;
      let nx = out[o + 3] * m0 + out[o1 + 3] * m1 + out[o2 + 3] * m2;
      // A turned normal is level too (the world's level: a runner mostly stands).
      let ny =
        out[o + 4] * (m0 > 0 ? m0 : 0) +
        out[o1 + 4] * (m1 > 0 ? m1 : 0) +
        out[o2 + 4] * (m2 > 0 ? m2 : 0);
      let nz = out[o + 5] * m0 + out[o1 + 5] * m1 + out[o2 + 5] * m2;
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
    if (t[i + 4] & 1) {
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
    } else if (plate && t[i + 4] & 1) {
      [cr, cg, cb] = [plate[0] * 0.75, plate[1] * 0.75, plate[2] * 0.75];
    } else if (plate && t[i + 5] < 0) {
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
