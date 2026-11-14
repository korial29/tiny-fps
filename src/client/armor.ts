// The armour of the moon's space suit (the user, 2026-11-10: the shoulder pads part of an armour,
// white hard plates over the suit as the troopers of space operas wear, not copied; then: fitted to
// the body's shape, the chest and the belly pieces 2 cm apart, thick, scratched). Each plate is cut
// out of the skin: its triangles in the plate's region of the body at rest are clipped to the
// region's edges exactly, once per skin (a recipe: each corner a skin triangle and its weights);
// each frame the corners are found on the skin as drawn and set off it along its normals, glossy
// white, with a wall down to the skin round the plate's edge as its thickness. So a plate has the
// body's own shape and bends with it.
import { LIMB } from '../shared/types';
import { BUCKLE, BUCKLE_Y } from './buckle';
import { KANJI } from './mask';
import { GLOSS, STRIDE } from './mesh';
import { BUST, BUST_Y, body } from './skin';
import type { Skin } from './skin';
import { room } from './verts';
import type { Out } from './verts';

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
  swell?: (x: number, y: number, z: number) => number;
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
  /** Cast: the forearm's straight plate rather than the skin's shape (casting()). */
  cast?: boolean;
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
  /** No plate: the ninja's belt, cloth in the team's colour a hair off the skin, with no wall. */
  belt?: boolean;
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
 * It stands `off` the arm, half a chest plate's thickness (the user, 2026-11-14: thinner).
 */
export const CUFF = {
  wrist: 0.935,
  y: 1.122,
  rise: 0.045,
  a: [35, 150],
  flare: 0.003,
  ridge: 0.004,
  x: 0.253,
  off: 0.006,
};
/**
 * The forearm's plate cast straight (the user, 2026-11-14: rectilinear, aggressive, not in rolls
 * over the muscles, still flared): its section a rounded square (`n`, a superellipse) round the
 * arm's line at `cx`, its half sizes across (`x`) and front to back (`z`) growing in a straight line
 * from the wrist to the elbow, the heights `y`, clear of the skin; then the flare and the ridge.
 */
export const CAST = { cx: 0.222, y: [0.935, 1.14], x: [0.047, 0.06], z: [0.055, 0.069], n: 3 };
const cuff = (a: number) => CUFF.y + CUFF.rise * smooth(CUFF.a[0], CUFF.a[1], Math.abs(a));
const vambrace = (x: number, y: number) =>
  CUFF.flare * smooth(1.09, 1.15, y) +
  CUFF.ridge *
    smooth(CUFF.x, CUFF.x + 0.008, Math.abs(x)) *
    smooth(0.985, 0.998, y) *
    (1 - smooth(1.12, 1.135, y));

/**
 * The biceps' plate (the user, 2026-11-13: worked too, and thinner; 2026-11-14: thinner again): the
 * heights of its edges' middles, how far they slant (`cut`), and how far it stands off the arm, not
 * OFF.
 */
export const BICEPS = { y: [1.203, 1.315], cut: 0.018, off: 0.0045 };

/** The knee pad's dome: up to 8 mm out at the kneecap. */
const knee = (x: number, y: number) =>
  0.008 * Math.max(0, 1 - ((Math.abs(x) - 0.1) / 0.07) ** 2 - ((y - 0.515) / 0.055) ** 2);

/**
 * The briefs (the user, 2026-11-10: round the hips under the belt, the leg's opening rising from the
 * crotch to the hip and lower behind, never between the thighs; 2026-11-12: thinner on the sides,
 * and no glitches; 2026-11-14: their sides up higher toward the hips, then a little less). One opening line for all
 * their pieces, the band on the trunk and the piece on each thigh, by the angle of the rest point
 * round the trunk (0 the front, 180 the back, either side): the pieces met at the border of the
 * trunk's skin and the legs' (0.93 m) on two lines that did not agree, and left gaps, overlaps and
 * slivers there. Their top is at `top` before and behind and climbs to `hip` over the hip between
 * the angles `rise`; the opening, lowest at the crotch, before and behind, rises between the angles
 * `at` to a strap `strap` high under that top.
 */
export const BRIEFS = {
  front: 0.85,
  back: 0.86,
  top: 0.982,
  hip: 1.02,
  strap: 0.012,
  at: [14, 66, 114, 168],
  rise: [20, 75, 105, 145],
};
/** The angle round the trunk of a rest point, degrees from the front, either side. */
const round = (c: Corner) => (Math.abs(Math.atan2(c[0], -c[2])) * 180) / Math.PI;
const briefsTop = (_a: number, c: Corner) => {
  const [s, [f0, f1, b1, b0]] = [round(c), BRIEFS.rise];
  return BRIEFS.top + (BRIEFS.hip - BRIEFS.top) * (s <= 90 ? smooth(f0, f1, s) : smooth(b0, b1, s));
};
/**
 * The seat (the user, 2026-11-14: one piece, rounded, no breach in the middle, then one block): behind,
 * the opening rises over the cleft in a small round arch to `top`, `r` either side of the middle,
 * where the legs' insides rose in a V and parted the seat in two points.
 */
export const SEAT = { top: 0.865, r: 0.03, fill: 0.02, w: 0.03, y: [0.9, 0.95] };
/**
 * The seat in one block (the user: no parting): the plate on each side of the cleft set off further
 * the nearer the middle, `fill` at most, `w` wide, up to the heights `y`, so that the two halves
 * meet over it; its slope turns their normals back.
 */
const seat = (x: number, y: number, z: number) =>
  z > 0 ? SEAT.fill * Math.exp(-((x / SEAT.w) ** 2)) * (1 - smooth(SEAT.y[0], SEAT.y[1], y)) : 0;
const opening = (a: number, c: Corner) => {
  const [s, [f0, f1, b1, b0], side] = [round(c), BRIEFS.at, briefsTop(a, c) - BRIEFS.strap];
  if (s <= 90) {
    return BRIEFS.front + (side - BRIEFS.front) * smooth(f0, f1, s);
  }
  const back = BRIEFS.back + (side - BRIEFS.back) * smooth(b0, b1, s);
  const q = Math.min(Math.abs(c[0]) / SEAT.r, 1);
  return Math.max(back, back + ((SEAT.top - back) * (1 + Math.cos(Math.PI * q))) / 2);
};
/** How far the inside of a leg is from the angle a round it: 1 there, 0 from 60 degrees off. */
const inside = (a: number) => 1 - smooth(25, 60, Math.abs(((a + 630) % 360) - 180));

/**
 * On a thigh the opening also rises over its inside (a, round the leg, -90), above the leg's skin:
 * never between the thighs, with a curved edge where an angle limit cut it straight, a sliver of
 * plate standing by a wedge of suit at the back. Behind, the seat's arch does it (SEAT).
 */
const legOpening = (a: number, c: Corner) =>
  round(c) > 90 ? opening(a, c) : opening(a, c) + (0.95 - opening(a, c)) * inside(a);

/**
 * The thigh plates' top (the user, 2026-11-13, on a picture of a trooper's hips: a slant from the
 * hip down to the inside of the thigh, a crescent of dark ribbed suit between it and the briefs):
 * a line of its own by the angle round the trunk, on the thighs and up the hips' sides alike, so one
 * line across the border too. Lowest at the inside of the thigh, `front` and `back`, under the
 * crotch; `hip` at the hip, where the briefs' strap climbs on over it; between the angles `at`.
 */
export const THIGH = { front: 0.775, back: 0.815, hip: 0.962, at: [20, 86, 96, 166] };
const plates = (_a: number, c: Corner) => {
  const [s, [f0, f1, b1, b0], top] = [round(c), THIGH.at, THIGH.hip];
  return s <= 90
    ? THIGH.front + (top - THIGH.front) * smooth(f0, f1, s)
    : THIGH.back + (top - THIGH.back) * smooth(b0, b1, s);
};

/**
 * The gusset: dark cloth from under the briefs to under the thigh plates' top, where the grey suit
 * showed and, at the crotch, the stripes of the legs' insides. Its bottom is under the plates by
 * `under`, and as low all round the inside of the thigh, where no plate is.
 */
const GUSSET = { under: 0.025, off: 0.003, tuck: 0.006 };
/**
 * The ninja's belt (the user, 2026-11-13: a V on the sides, then deeper, on him and on her): its
 * bottom at the front's middle, under the buckle's middle (buckle.ts), rising `rise` to the hips,
 * then down round the back to `back` from the front's (over it, the back's last lames would meet
 * it); its height, and how far it stands off the skin. Cut as the gusset is, so drawn on every
 * map, armour or none (armor()'s `bare`).
 */
export const BELT = { y: 0.988, rise: 0.05, back: -0.008, h: 0.04, off: 0.004 };
const beltLow = (a: number) =>
  BELT.y +
  BELT.rise * smooth(0, 90, Math.abs(a)) -
  (BELT.rise - BELT.back) * smooth(90, 180, Math.abs(a));
const gusset = (a: number, c: Corner) => {
  const p = plates(a, c);
  return p + (THIGH.front - p) * inside(a) - GUSSET.under;
};
/** The cloth: plain black, as the suit's legs (the user, 2026-11-14: it was ribbed in two shades). */
const CLOTH = [0.07, 0.07, 0.08];

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

/** The marine's shoulder blade plates: ovals `at` degrees either side of the spine, `a` degrees and `h` metres half wide and high, their middle at `y`. */
export const BLADE = { at: 32, a: 19, y: 1.458, h: 0.036 };

/** The gap round the collar piece and over the back plate: there is little room up there. */
const COLLAR_GAP = 0.012;

/** The gap the user asked between the chest plate and the belly's plate. */
export const GAP = 0.02;

/**
 * The belly's plate (the user, 2026-11-13: worked, rounder; 2026-11-14: its shape to fit the chest
 * plate's as puzzle pieces fit): its bottom at the middle, how far it goes round each side
 * (degrees: out to under the chest plate's corners), how much its bottom rises to its corners,
 * rounding them off, and how far it domes at its middle.
 */
export const BELLY = { y: 1.035, a: 60, round: 0.075, dome: 0.007 };
const belly = (x: number, y: number) =>
  BELLY.dome * Math.max(0, 1 - (x / 0.15) ** 2 - ((y - 1.085) / 0.1) ** 2);

/**
 * The chest plate's bottom (the user, 2026-11-13: dipped at the middle; 2026-11-14: the belly's
 * plate to lock into it): a tab hangs down the middle to `y`, flat out to the first angle of `tab`
 * and rounding up by `drop` to the second; beside it the bottom rises by `rise` more to the sides.
 * The belly's top follows it GAP under, so the tab sits in a notch of the belly's plate.
 */
export const CHEST = { y: 1.125, drop: 0.04, tab: [11, 22], rise: 0.03 };
const chestLow = (a: number) => {
  const q = Math.abs(a);
  return (
    CHEST.y +
    CHEST.drop * smooth(CHEST.tab[0], CHEST.tab[1], q) +
    CHEST.rise * smooth(CHEST.tab[1], 60, q)
  );
};

/**
 * The ninja's vest: the bottom of its chest piece at the sides, how far its chevron dips at the
 * middle (and the lames' under it), how far its neckline dips at the middle, its top over the chest
 * on him and on her, the lames' height and the gap between two pieces.
 */
export const VEST = {
  y: 1.278,
  dip: 0.035,
  neck: 0.015,
  top: [1.5, 1.462],
  lame: 0.06,
  gap: 0.012,
};
/** How far a piece of the vest dips at the angle a: a chevron, its point down the middle. */
const chevron = (a: number) => VEST.dip * Math.max(0, 1 - Math.abs(a) / 40);
/**
 * The last lame's point cut round over the belt's buckle (buckle.ts; the user, 2026-11-13: they met,
 * fix the armour, not the buckle): an arch `clear` over its rim, the angle turned into a place
 * across on the waist's front, `waist` out from the axis.
 */
export const ARCH = { clear: 0.016, waist: 0.13 };
const arch = (a: number) => {
  const [x, r] = [ARCH.waist * Math.sin((a * Math.PI) / 180), BUCKLE[0] + ARCH.clear];
  return Math.abs(x) < r ? BUCKLE_Y + Math.sqrt(r * r - x * x) : 0;
};
/**
 * The vest's armholes (the user, 2026-11-13: a crack in the chest piece by the armpit): over the
 * trunk's split (1.41 m) the skin is the shoulder's and goes with the arm, away from the piece under
 * it. Its top is down to `y`, under the split, at the angle `a` on him and on her; from the top over
 * the pec it falls there from the angle `fall` (hers sooner, round over each breast); its outer
 * corner rounds off by `corner` between the angles `round`. His holds its height out to the
 * shoulders, over all of the pecs, under the pads (the user, 2026-11-13: it fell from 22 to 42
 * degrees and left their top bare); the skin there is the chest's and the collarbone's, not yet
 * the arm's.
 */
export const ARMHOLE = {
  a: [60, 42],
  y: 1.398,
  fall: [42, 10],
  corner: 0.04,
  round: [
    [62, 72],
    [46, 60],
  ],
};
/**
 * The top of the vest's chest piece at the angle a (the user, 2026-11-13: smooth the stairs on the
 * pecs, then all in one block): one curve, a shallow neckline, over the chest and down into the
 * armhole, rounding the corner. It was open in a deep V, and came down by a cliff into the armhole,
 * then a shelf, then the side, in steps.
 */
const vestTop = (a: number, fem: number) => {
  const [q, top] = [Math.abs(a), VEST.top[fem]];
  return (
    top -
    VEST.neck * (1 - smooth(0, 14, q)) -
    (top - ARMHOLE.y) * smooth(ARMHOLE.fall[fem], ARMHOLE.a[fem], q) -
    ARMHOLE.corner * smooth(ARMHOLE.round[fem][0], ARMHOLE.round[fem][1], q) ** 2
  );
};
/**
 * The ninja's back (the user, 2026-11-13: one big block, not pretty): two plates on each shoulder
 * blade, from `spine` degrees off the spine (a groove down it) to `a`, parted at the trunk's split
 * (`split`, 1.41 m: one plate across it showed the step between the two rings): the upper one up to
 * `top` by the spine, rising `rise` toward the shoulder and rounding off by `corner` at its outer
 * end; the lower one from `low` by the spine, rising `wing` to its outer end. Under them three lames
 * as the belly's, the first's top at `lames`, each `lame` high, their point `dip` down at the spine.
 */
export const BACK = {
  spine: 6,
  a: 62,
  split: [1.4, 1.414],
  top: 1.475,
  rise: 0.03,
  corner: 0.045,
  low: 1.245,
  wing: 0.06,
  lames: 1.222,
  lame: 0.048,
  dip: 0.025,
};
/**
 * The blocks down the spine, in the back's groove: how many, the first's top, their height and the
 * gap between two (none across the split), their half width (degrees) and how far they stand off
 * the skin.
 */
export const SPINE = { n: 15, top: 1.47, h: 0.022, gap: 0.008, a: 3.5, off: 0.017 };
/** The plates on the flanks: their heights, and the angles round from the front they span. */
export const SIDES = {
  y: [
    [1.215, 1.33],
    [1.09, 1.2],
  ],
  a: [82, 116],
};
/** The blade plates' top and bottom at `b` degrees off the spine. */
const bladeTop = (b: number) =>
  BACK.top + BACK.rise * smooth(0, 35, b) - BACK.corner * smooth(40, BACK.a, b) ** 2;
const bladeLow = (b: number) => BACK.low + BACK.wing * smooth(BACK.spine, BACK.a, b) ** 1.5;
/** How far a back lame dips at `b` degrees off the spine. */
const spineDip = (b: number) => BACK.dip * Math.max(0, 1 - b / 40);
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
  // The belly's plate, one piece (2026-11-13), GAP under the chest's along its bottom, notched
  // round its tab; rounded (BELLY).
  {
    part: PART.TRUNK,
    cx: 0,
    y: [BELLY.y, CHEST.y + CHEST.drop + CHEST.rise],
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
    cast: true,
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
  {
    part: PART.TRUNK,
    cx: 0,
    y: [0.925, BRIEFS.hip],
    a: [-181, 181],
    low: opening,
    high: briefsTop,
    swell: seat,
  },
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
  // Smaller and oval (the user, 2026-11-14: they spanned the back's top from the spine out).
  ...[-1, 1].map((k): Region => ({
    part: PART.TRUNK,
    cx: 0,
    y: [BLADE.y - BLADE.h, BLADE.y + BLADE.h],
    a: [-BLADE.a, BLADE.a],
    face: 180 + k * BLADE.at,
    round: [BLADE.a, BLADE.y, BLADE.h],
  })),
  // The shoulders have a bell each (pads.ts), hers slimmer.
  // The back (the user, 2026-11-10, for Highline, where no pack covers it): a plate between the
  // shoulder blades and one on the small of the back, GAP apart.
  { part: PART.TRUNK, cx: 0, y: [1.2, 1.4], a: [-58, 58], face: 180 },
  { part: PART.TRUNK, cx: 0, y: [1.035, 1.2 - GAP], a: [-52, 52], face: 180 },
  // The thigh plates go on up the hips' sides, under the briefs' strap (the user): the
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
  { part: PART.LEG, cx: 0.1, y: [0.845, 0.935], a: [-181, 181], low: legOpening, swell: seat },
  // The gusset under them (GUSSET): on the trunk, up under the briefs' strap over the hip, and
  // round the top of each thigh.
  {
    part: PART.TRUNK,
    cx: 0,
    y: [0.8, BRIEFS.hip],
    a: [-181, 181],
    high: (a, c) => opening(a, c) + GUSSET.tuck,
    thin: true,
  },
  { part: PART.LEG, cx: 0.1, y: [0.74, 0.94], a: [-181, 181], low: gusset, thin: true },
  // The ninja's belt, in a V (BELT).
  {
    part: PART.TRUNK,
    cx: 0,
    y: [BELT.y + BELT.back, BELT.y + BELT.rise + BELT.h],
    a: [-181, 181],
    low: beltLow,
    high: a => beltLow(a) + BELT.h,
    belt: true,
    alone: true,
  },
  // The ninja's vest (the user, 2026-11-13, on his picture of a ninja's armour): a chest piece up to
  // the neck in one block, its bottom a chevron; three lames down the belly nested under it, each
  // narrower; a plate on the back and one on the small of it; and a bracer on each forearm. His
  // shoulder pads and his collar are pieces of their own (pads.ts).
  ...[0, 1].map((fem): Region => ({
    part: PART.TRUNK,
    cx: 0,
    y: [VEST.y - VEST.dip, VEST.top[fem]],
    a: fem ? [-60, 60] : [-74, 74],
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
      low: a => Math.max(top - VEST.lame - chevron(a), k == 2 ? arch(a) : 0),
      alone: true,
    };
  }),
  // His back (the user, 2026-11-13: it was one big block): a plate on each shoulder blade, BACK, a
  // groove down the spine between them.
  ...[-1, 1].flatMap(side =>
    [0, 1].map((up): Region => ({
      part: PART.TRUNK,
      cx: 0,
      y: up ? [BACK.split[1], BACK.top + BACK.rise] : [BACK.low, BACK.split[0]],
      a: side > 0 ? [BACK.spine, BACK.a] : [-BACK.a, -BACK.spine],
      face: 180,
      ...(up
        ? { high: (a: number) => bladeTop(180 - Math.abs(a)) }
        : { low: (a: number) => bladeLow(180 - Math.abs(a)) }),
      alone: true,
    })),
  ),
  // And three lames down the small of it, as the belly's, their point down at the spine, each side
  // of it.
  ...[0, 1, 2].flatMap(k =>
    [-1, 1].map((side): Region => {
      const top = BACK.lames - k * (BACK.lame + VEST.gap);
      return {
        part: PART.TRUNK,
        cx: 0,
        y: [top - BACK.lame - BACK.dip, top],
        a: side > 0 ? [BACK.spine, 50 - k * 4] : [-50 + k * 4, -BACK.spine],
        face: 180,
        high: a => top - spineDip(180 - Math.abs(a)),
        low: a => top - BACK.lame - spineDip(180 - Math.abs(a)),
        alone: true,
      };
    }),
  ),
  // Small blocks down the spine between them, standing out further (the user, 2026-11-13).
  ...Array.from({ length: SPINE.n }, (_, i): Region => {
    // Under the split, the blocks start again at its foot.
    const k = Math.floor((SPINE.top - BACK.split[1]) / (SPINE.h + SPINE.gap)) + 1;
    const top =
      i < k
        ? SPINE.top - i * (SPINE.h + SPINE.gap)
        : BACK.split[0] - (i - k) * (SPINE.h + SPINE.gap);
    return {
      part: PART.TRUNK,
      cx: 0,
      y: [top - SPINE.h, top],
      a: [-SPINE.a, SPINE.a],
      face: 180,
      off: SPINE.off,
      alone: true,
    };
  }),
  // A plate on each flank under the arm, two high (the user, 2026-11-13: plates on the sides).
  ...SIDES.y.flatMap(y =>
    [-1, 1].map((side): Region => ({
      part: PART.TRUNK,
      cx: 0,
      y: y as [number, number],
      a: side > 0 ? [SIDES.a[0], SIDES.a[1]] : [-SIDES.a[1], -SIDES.a[0]],
      alone: true,
    })),
  ),
  // His bracers, thinner (the user, 2026-11-13).
  { part: PART.ARM, cx: 0.222, y: [0.99, 1.14], a: [-181, 181], alone: true, off: BRACER },
];

/** How far the plates stand off the skin: their thickness. */
const OFF = 0.012;

/** The astronaut's white, a shade under full: in the moon's sun the plates burnt out to flat white (the user, 2026-11-13). */
const WHITE = [0.85, 0.86, 0.88];
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
  // Each corner's once: a moulded plate's limit looks for its place on the shell.
  const fs = poly.map(f);
  for (let i = 0; i < poly.length; i++) {
    const [p, q] = [poly[i], poly[(i + 1) % poly.length]];
    const [fp, fq] = [fs[i], fs[(i + 1) % poly.length]];
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

/** How far round past a plate's side a skin triangle may lie and still be cut (degrees). */
const REACH = 40;

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
export interface Recipe {
  c: number[];
  t: number[];
  /** The triangles each kind of wearer has (armor()'s `ninja`, astronaut and `bare` bits), listed on first use. */
  k?: Int32Array[];
}
export const CORNER = 11;
export const TRI = 6;
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
/** How far round from the front the shell is fitted (radians): past it its polynomial runs wild. */
const FIT = 1.35;

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
  return f + out + (swell ? swell(f * Math.sin(a), y, 0) : 0) * (b && REGIONS[gi].alone ? SLIM : 1);
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
    if (Math.abs(a) < FIT) {
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
    if (facing(x, z, o) < FACING || Math.abs(polar(z0, x, z)[0]) > FIT) {
      // Not facing out, or round past the fit (shellOf()): set off as an unmoulded plate, along
      // the skin, with its normal.
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

/** The cast forearm plate's radius at the angle `t` round the arm (0 out to the side, toward +z) and height `y`, on the side `side`. */
const castR = (t: number, y: number, side: number) => {
  const f = Math.min(Math.max((y - CAST.y[0]) / (CAST.y[1] - CAST.y[0]), 0), 1.2);
  const [ax, az] = [
    CAST.x[0] + (CAST.x[1] - CAST.x[0]) * f,
    CAST.z[0] + (CAST.z[1] - CAST.z[0]) * f,
  ];
  const [c, s] = [Math.cos(t), Math.sin(t)];
  const r = (Math.abs(c / ax) ** CAST.n + Math.abs(s / az) ** CAST.n) ** (-1 / CAST.n);
  return r + vambrace(side * (CAST.cx + r * c), y);
};

/**
 * The forearm's plate on the skin `s` (CAST): each corner set off along the skin's rest normal to
 * the cast's radius, with the cast's normal, as moulding() does the chest's.
 */
const casting = (s: Skin) => {
  const { t } = s;
  return (c: Corner, k: number, turned = 0): Moulded => {
    const [x, y, z] = c;
    const side = Math.sign(x) || 1;
    const o = unit(
      ...([0, 1, 2].map(j =>
        [0, 1, 2].reduce(
          (sum, q) =>
            sum + s.v[t[k * 3 + q] * 6 + 3 + j] * c[3 + q] * (turned & (TURN << q) ? -(j != 1) : 1),
          0,
        ),
      ) as [number, number, number]),
    );
    const dx = x * side - CAST.cx;
    const a = Math.atan2(z, dx);
    const d = Math.max(FLOOR, castR(a, y, side) - Math.hypot(dx, z));
    // The cast's normal, from its slopes round the arm and up it.
    const at = (q: number, h: number) => {
      const r = castR(q, h, side);
      return [side * r * Math.cos(q), h, r * Math.sin(q)];
    };
    const e = 1e-3;
    const [p0, p1, h0, h1] = [at(a - e, y), at(a + e, y), at(a, y - e), at(a, y + e)];
    const ta = p1.map((v, j) => v - p0[j]);
    const ty = h1.map((v, j) => v - h0[j]);
    let N = unit(
      ta[1] * ty[2] - ta[2] * ty[1],
      ta[2] * ty[0] - ta[0] * ty[2],
      ta[0] * ty[1] - ta[1] * ty[0],
    );
    if (N[0] * side * Math.cos(a) + N[2] * Math.sin(a) < 0) {
      N = N.map(v => -v);
    }
    return [d, o[0] - N[0], o[1] - N[1], o[2] - N[2], ...o];
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
          (swell(c[0] + e, c[1], c[2]) - swell(c[0] - e, c[1], c[2])) / (2 * e),
          (swell(c[0], c[1] + e, c[2]) - swell(c[0], c[1] - e, c[2])) / (2 * e),
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
  const moulds = REGIONS.map((g, i) =>
    g.mould ? moulding(s, i) : g.cast ? casting(s) : undefined,
  );
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
      // Nor is one wholly far round from it: the middle of the back reads +180 or -180 by the sign
      // of a hair, and a moulded plate's corners set off there flipped across it, the clip taking
      // that jump for its edge and leaving slivers 8 cm out behind the back (the user, 2026-11-13).
      if (region.a[1] - region.a[0] < 360) {
        const as = tri.map(c => angle(region, c[0], c[2]));
        if (
          Math.max(...as) - Math.min(...as) > 180 ||
          as.every(q => q < region.a[0] - REACH) ||
          as.every(q => q > region.a[1] + REACH)
        ) {
          continue;
        }
      }
      // A round or curved outline needs finer pieces than the skin's, close up.
      // A moulded plate's curves, finer still: the woman's domes. Not close up too: on the near
      // skin its outline went by the skin's big triangles, in steps, and the V at the neck was gone
      // (the user, 2026-11-13: smooth the stairs on the pecs).
      const pieces =
        region.mould || region.cast
          ? split(fine ? split([tri]) : [tri])
          : fine && (region.round || region.low || region.high)
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
        if (region.belt) {
          // The belt: cloth in the team's colour (ACCENT), no wall.
          for (let i = 1; i + 1 < poly.length; i++) {
            add(
              [poly[0], poly[i], poly[i + 1]],
              [BELT.off, BELT.off, BELT.off],
              undefined,
              ACCENT,
              -1,
              0,
              k,
            );
          }
          continue;
        }
        if (region.thin) {
          // Cloth: no wall.
          for (let i = 1; i + 1 < poly.length; i++) {
            add(
              [poly[0], poly[i], poly[i + 1]],
              [GUSSET.off, GUSSET.off, GUSSET.off],
              undefined,
              CLOTH,
              -1,
              0,
              k,
            );
          }
          continue;
        }
        const off = (c: Corner) =>
          mould
            ? mould(c, k)[0]
            : (region.off ?? OFF) + (region.swell ? region.swell(c[0], c[1], c[2]) : 0);
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
/**
 * 忍 on the left pec of the ninja's chest piece (the user, 2026-11-13: the hood's ideogram on the
 * chest too), dark, over the vents and read from the front, on him and on her: its middle across
 * (m, - the left) and up, its size, and the trunk's half width and depth there that turn a place
 * across into an angle round it. Hers in the middle of her left breast, in place of its vents
 * (VENTS): her piece is moulded over the dome and set where the skin's normal meets it, so a stroke
 * over the top of the breast landed past the piece's top and was dropped.
 */
export const SIGN = [
  { x: -0.088, y: 1.428, size: 0.05, w: 0.2, d: 0.13 },
  { x: -0.064, y: 1.357, size: 0.034, w: 0.18, d: 0.13 },
];
/** Each segment of KANJI's strokes as a detail on the left side, for build b (a stroke of the hood is 2.4 mm wide on 3 cm). */
const SIGNS = SIGN.map(({ x: cx, y: cy, size, w, d }) =>
  KANJI.flatMap(k =>
    k.slice(2).flatMap((_, i) => {
      if (i % 2) {
        return [];
      }
      const [u0, v0, u1, v1] = k.slice(i, i + 4);
      const [du, dv] = [u1 - u0, v1 - v0];
      // Read from the front: the left is the reader's right, so across goes toward -x.
      const x = cx - ((u0 + u1) / 2 - 0.5) * size;
      const y = cy + ((v0 + v1) / 2 - 0.5) * size;
      const a = Math.atan2(-x, d * Math.sqrt(1 - (x / w) ** 2));
      const W = 0.038 * size;
      const L = Math.hypot(du, dv) * size + W;
      return [
        [PART.TRUNK, 0, (a * 180) / Math.PI, y, (Math.atan2(du, dv) * 180) / Math.PI, L, W, -1],
      ];
    }),
  ),
);

/** The three vents on each pec, as DETAILS, on him and on her: hers on the right alone (SIGN). */
const VENTS = [0, 1].map(b =>
  [1.37, 1.352, 1.334].map(y => [PART.TRUNK, 0, 26, y, 62, 0.032, 0.0014, b]),
);

/**
 * The ninja's details (the user, 2026-11-13: more detail on his armour), as DETAILS on his own
 * pieces: a seam down the chest piece; a rivet at each end of each lame;
 * a groove down each of the back's blade plates, a rivet at each end of each back lame; a band at each end of the bracers with
 * three slits between them; a groove down each shin guard, a rivet each side of its top. And by
 * build, the vents (VENTS) and 忍 on the left pec (SIGNS).
 */
export const NINJA_DETAILS = [
  [PART.TRUNK, 0, 0, 1.38, 0, 0.1, 0.0012, 1],
  ...[0, 1, 2].map(k => {
    const a = 39 - k * 4;
    const y = VEST.y - VEST.gap - k * (VEST.lame + VEST.gap) - VEST.lame / 2 - chevron(a);
    return [PART.TRUNK, 0, a, y, 0, 0.007, 0.0035, 0];
  }),
  // A groove down each blade plate, and a rivet at each end of each back lame.
  [PART.TRUNK, 0, 160, 1.33, 0, 0.09, 0.0013, 0],
  ...[0, 1, 2].map(k => {
    const a = 180 - (45 - k * 4);
    const y = BACK.lames - k * (BACK.lame + VEST.gap) - BACK.lame / 2;
    return [PART.TRUNK, 0, a, y, 0, 0.007, 0.0035, 0];
  }),
  ...[1.005, 1.125].map(y => [PART.ARM, 0.222, 90, y, 90, 0.05, 0.0013, 0]),
  ...[1.05, 1.065, 1.08].map(y => [PART.ARM, 0.222, 90, y, 90, 0.018, 0.0011, 0]),
  [PART.LEG, 0.1, 0, 0.3, 0, 0.2, 0.0013, 0],
  ...[-40, 40].map(a => [PART.LEG, 0.1, a, 0.415, 0, 0.007, 0.0035, 0]),
];
/**
 * The astronaut's details (the user, 2026-11-13: more detail on his armour), as DETAILS, then 1 for
 * the team's colour (ACCENT) or 0 dark: three rank bars on the left of the chest; a band of the
 * team's colour round each wrist; a patch on the left biceps; a dark control panel on the left
 * forearm with a row of keys beside it; a rivet at each corner of the belly's plate; two grooves
 * down the front of each thigh plate.
 */
export const ASTRO_DETAILS = [
  ...[1.41, 1.398, 1.386].map(y => [PART.TRUNK, 0, 32, y, 90, 0.034, 0.0032, -1, 1]),
  ...[-135, -90, -45, 0, 45, 90, 135, 180].map(a => [
    PART.ARM,
    0.222,
    a,
    0.962,
    90,
    0.04,
    0.0035,
    0,
    1,
  ]),
  [PART.ARM, 0.207, 90, 1.262, 0, 0.026, 0.009, -1, 1],
  [PART.ARM, 0.222, 20, 1.05, 0, 0.045, 0.011, -1, 0],
  ...[1.012, 1.026, 1.04, 1.054, 1.068].map(y => [PART.ARM, 0.222, 55, y, 90, 0.008, 0.002, -1, 0]),
  ...[1.09, 1.13].map(y => [PART.TRUNK, 0, 38, y, 0, 0.006, 0.003, 0, 0]),
  ...[-12, 12].map(a => [PART.LEG, 0.1, a, 0.74, 0, 0.13, 0.0012, 0, 0]),
];
/**
 * The marine's details (the user, 2026-11-14: coloured buttons, boxes, grooves), as DETAILS, then
 * how far it stands over the plate (a box, walled, when not 0) and its look in `KIT`: a control box
 * on the left of the chest with three lit buttons (none on the belly: smooth, the user); a
 * power box on the back with two lights, two
 * grooves across the small of the back; a box on the outside of each thigh with a light; three
 * lit buttons alone on the left forearm by the wrist (the user: no black box there).
 */
export const MARINE_DETAILS = [
  [PART.TRUNK, 0, 24, 1.425, 90, 0.034, 0.01, -1, 0.004, 0],
  ...[19.5, 24, 28.5].map((a, i) => [
    PART.TRUNK,
    0,
    a,
    1.425,
    90,
    0.005,
    0.0025,
    -1,
    0.0052,
    i + 1,
  ]),
  [PART.TRUNK, 0, 180, 1.29, 0, 0.09, 0.035, 1, 0.007, 0],
  ...[-1, 1].map((k, i) => [PART.TRUNK, 0, 180 + 5 * k, 1.322, 0, 0.007, 0.0035, 1, 0.0105, i + 1]),
  ...[1.08, 1.12].map(y => [PART.TRUNK, 0, 180, y, 90, 0.18, 0.0012, 1, 0, 4]),
  [PART.LEG, 0.1, 60, 0.82, 0, 0.05, 0.015, 0, 0.006, 0],
  [PART.LEG, 0.1, 60, 0.835, 0, 0.005, 0.0025, 0, 0.0072, 1],
  ...[0.988, 1.0, 1.012].map((y, i) => [
    PART.ARM,
    0.222,
    0,
    y,
    0,
    0.005,
    0.0025,
    -1,
    0.0015,
    i + 1,
  ]),
];
/** The marine's details' looks: [colour, layer]: the boxes dark and glossy, the buttons lit (green, amber, cyan), the grooves dark. */
const KIT: [number[], number][] = [
  [[0.1, 0.1, 0.11], GLOSS],
  [[0.25, 1, 0.4], -2],
  [[1, 0.65, 0.1], -2],
  [[0.2, 0.8, 1], -2],
  [[0.07, 0.07, 0.08], -1],
];
/** A detail's colour that is the team's, told by its red under 0 (armor() swaps it). */
const ACCENT = [-1, 0, 0];
/** A triangle's kind bit: the astronaut's alone (ASTRO_DETAILS). */
const ASTRO = 16;
/** A triangle's kind bit: the marine's alone (MARINE_DETAILS), in its own colour on any plate. */
export const MARINE = 32;
const DARK = [0.07, 0.07, 0.08];
/** The longest piece a detail is laid in (m). */
const PIECE = 0.012;

/**
 * Adds to the recipe the scratches on the plates of the skin `s`: short strokes at random (the
 * same each time) on its triangles inside a plate, each lying on one triangle, wholly inside its
 * plate, a hair over it, matte. Then its details (DETAILS, and the ninja's NINJA_DETAILS on his own
 * pieces), each tagged with its plate (`tag`): they keep their colour on a plate in a team's.
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
  const cross = (p: number[], q: number[]) => [
    p[1] * q[2] - p[2] * q[1],
    p[2] * q[0] - p[0] * q[2],
    p[0] * q[1] - p[1] * q[0],
  ];
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
    own = false,
    kind = 0,
    layer = -1,
    raise = 0,
  ) => {
    const part = partOf(l![k]);
    const P = corners(k);
    const N = [0, 1, 2].map(c => [0, 1, 2].map(j => v[t[k * 3 + c] * 6 + 3 + j]));
    const g = REGIONS.findIndex(
      (rg, i) =>
        rg.part == part &&
        !rg.alone == !own &&
        !rg.thin &&
        !rg.belt &&
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
        (ms ? ms[i][0] : (REGIONS[g].off ?? OFF) + (swell ? swell(c[0], c[1], c[2]) : 0)) + 0.0008,
    );
    const pick = (...i: number[]) => ms && i.map(j => ms[j]);
    const top = offs.map(o => o + raise);
    tag(mark ? g : -1);
    add(
      [cs[0], cs[1], cs[2]],
      [top[0], top[1], top[2]],
      undefined,
      col,
      layer,
      kind,
      k,
      pick(0, 1, 2),
    );
    add(
      [cs[0], cs[2], cs[3]],
      [top[0], top[2], top[3]],
      undefined,
      col,
      layer,
      kind,
      k,
      pick(0, 2, 3),
    );
    if (raise) {
      // A box: walls from the plate up to its top, wound outward as the plates' (cook()).
      const lift = (i: number, d: number) => {
        const c = cs[i];
        const nl = Math.hypot(c[6], c[7], c[8]) || 1;
        return [0, 1, 2].map(j => c[j] + (c[6 + j] / nl) * d);
      };
      const side = col.map(q => q * 0.6);
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        const [pt, qt, qb] = [lift(i, top[i]), lift(j, top[j]), lift(j, offs[j])];
        const f = cross(
          qt.map((q, m) => q - pt[m]),
          qb.map((q, m) => q - pt[m]),
        );
        const [p, q] =
          dot(
            f,
            cs[i].map((c, m) => c - at[m]),
          ) >= 0
            ? [i, j]
            : [j, i];
        const [P, Q] = [cs[p], cs[q]];
        add(
          [P, Q, Q],
          [top[p], top[q], offs[q] - 0.001],
          undefined,
          side,
          -1,
          kind | 1,
          k,
          pick(p, q, q),
        );
        add(
          [P, Q, P],
          [top[p], offs[q] - 0.001, offs[p] - 0.001],
          undefined,
          side,
          -1,
          kind | 1,
          k,
          pick(p, q, p),
        );
      }
    }
    return true;
  };
  /** Each triangle's part, and its corners' places, nine numbers each: hitOf() goes through them all, many times. */
  const parts = Int8Array.from({ length: n }, (_, k) => partOf(l![k]));
  const T = new Float64Array(n * 9);
  for (let k = 0; k < n; k++) {
    for (let c = 0; c < 3; c++) {
      for (let j = 0; j < 3; j++) {
        T[k * 9 + c * 3 + j] = v[t[k * 3 + c] * 6 + j];
      }
    }
  }
  /** Where a ray from `o` along `w` leaves the skin of the part: its furthest triangle, and the point. */
  const hitOf = (part: number, o: number[], w: number[]): [number, number[]] | undefined => {
    let [best, most] = [-1, 0];
    const [wx, wy, wz] = [w[0], w[1], w[2]];
    for (let k = 0; k < n; k++) {
      if (parts[k] != part) {
        continue;
      }
      // cross() and dot() written out, in the same order.
      const i = k * 9;
      const [px, py, pz] = [T[i], T[i + 1], T[i + 2]];
      const [ax, ay, az] = [T[i + 3] - px, T[i + 4] - py, T[i + 5] - pz];
      const [bx, by, bz] = [T[i + 6] - px, T[i + 7] - py, T[i + 8] - pz];
      const [hx, hy, hz] = [wy * bz - wz * by, wz * bx - wx * bz, wx * by - wy * bx];
      const det = ax * hx + ay * hy + az * hz;
      if (Math.abs(det) < 1e-12) {
        continue;
      }
      const [qx, qy, qz] = [o[0] - px, o[1] - py, o[2] - pz];
      const bu = (qx * hx + qy * hy + qz * hz) / det;
      const [cx, cy, cz] = [qy * az - qz * ay, qz * ax - qx * az, qx * ay - qy * ax];
      const bv = (wx * cx + wy * cy + wz * cz) / det;
      const far = (bx * cx + by * cy + bz * cz) / det;
      if (bu >= 0 && bv >= 0 && bu + bv <= 1 && far > most) {
        [best, most] = [k, far];
      }
    }
    return best < 0 ? undefined : [best, o.map((c, j) => c + w[j] * most)];
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
  for (const [part, cx, ang, y, tilt, L, W, only, own, astro, lit, marine, raise, look] of [
    ...DETAILS,
    ...[...NINJA_DETAILS, ...VENTS[s.b ? 1 : 0], ...SIGNS[s.b ? 1 : 0]].map(d => [...d, 1]),
    ...ASTRO_DETAILS.map(d => [...d.slice(0, 8), 0, 1, d[8]]),
    ...MARINE_DETAILS.map(d => [...d.slice(0, 8), 0, 0, 0, 1, d[8], d[9]]),
  ]) {
    const [col, layer] = marine ? KIT[look] : [lit ? ACCENT : DARK, -1];
    const kind = astro ? ASTRO : marine ? MARINE : 0;
    for (const side of only ? [only] : [1, -1]) {
      const r = (ang * Math.PI) / 180;
      const hit = hitOf(part, [cx * side, y, 0], [Math.sin(r) * side, 0, -Math.cos(r)]);
      if (!hit) {
        continue;
      }
      // A long one in short pieces, each laid on the skin where it is: one stroke flat on a skin
      // triangle went under a curved plate, in dashes.
      const parts = Math.ceil(L / PIECE);
      const P = corners(hit[0]);
      const nn = cross(
        P[1].map((q, j) => q - P[0][j]),
        P[2].map((q, j) => q - P[0][j]),
      );
      const across = cross(nn, [0, 1, 0]);
      const al = Math.hypot(...across) || 1;
      const [ct, st] = [Math.cos((tilt * Math.PI) / 180), Math.sin((tilt * Math.PI) / 180) * side];
      for (let i = 0; i < parts; i++) {
        const f = ((i + 0.5) / parts - 0.5) * L;
        const q = hit[1].map((c, j) => c + f * (ct * +(j == 1) + (st * across[j]) / al));
        const out = [q[0] - cx * side, 0, q[2]];
        const ol = Math.hypot(...out) || 1;
        const at =
          parts > 1
            ? hitOf(
                part,
                [cx * side, q[1], 0],
                out.map(c => c / ol),
              )
            : hit;
        if (at) {
          const len = L / parts + (parts > 1 ? 0.0008 : 0);
          stroke(
            at[0],
            at[1],
            ((tilt * Math.PI) / 180) * side,
            len,
            W,
            col,
            true,
            true,
            !!own,
            kind,
            layer,
            raise,
          );
        }
      }
    }
  }
};

const recipes = [new WeakMap<Skin, Recipe>(), new WeakMap<Skin, Recipe>()];

/** The triangles of the recipe's `t` (their first number's index) that a wearer has: armor()'s rules. */
const wearing = (t: number[], ninja: boolean, astro: boolean, bare: boolean) => {
  const keep: number[] = [];
  for (let i = 0; i < t.length; i += TRI) {
    // The ninja's own armour alone, without scratches, and none of it on another.
    // With `bare`, his belt alone: a map with no armour.
    if (
      ninja != !!REGIONS[t[i + 5]]?.alone ||
      (t[i + 4] & ASTRO && !astro) ||
      (t[i + 4] & MARINE && (astro || ninja)) ||
      (bare && !REGIONS[t[i + 5]]?.belt)
    ) {
      continue;
    }
    keep.push(i);
  }
  return Int32Array.from(keep);
};

/** The armour's recipe on the skin `s`, `fine` or not (armor()), made now if it is not yet: the close one takes a quarter of a second. */
export const prepare = (s: Skin, fine: boolean) => {
  const book = recipes[+fine];
  let r = book.get(s);
  if (!r) {
    r = cook(s, fine);
    book.set(s, r);
  }
  return r;
};

/**
 * Appends the armour cut out of the skin `s` drawn into `out` from the float `from` on (skin()
 * writes three vertices per triangle of s.t, in order). Not `fine` (a runner not close by), curved
 * outlines follow the skin's own triangles, unrefined, and there are no scratches. `plate` is the
 * plates' colour (their walls a shade darker): white when absent, the astronaut's, who has his own
 * details in his team's colour `accent` too. The `ninja` wears his own armour.
 */
/** The recipe on the skin `s` (`fine` or not) and the triangles of it a wearer has (armor()'s rules): its first numbers' indices. */
export const wornOf = (
  s: Skin,
  fine: boolean,
  ninja: boolean,
  astro: boolean,
  bare: boolean,
): [Recipe, Int32Array] => {
  const r = prepare(s, fine);
  const wearer = +ninja | (+astro << 1) | (+bare << 2);
  return [r, ((r.k ??= [])[wearer] ??= wearing(r.t, ninja, astro, bare))];
};

export const armor = (
  out: Out,
  from: number,
  s: Skin,
  fine = true,
  plate?: number[],
  ninja = false,
  accent = [0.8, 0.8, 0.82],
  bare = false,
) => {
  const astro = !plate && !ninja;
  const [r, list] = wornOf(s, fine, ninja, astro, bare);
  const { c, t } = r;
  const P = new Float64Array(9);
  const N = new Float64Array(9);
  let w = out.length;
  const a = room(out, list.length * 3 * STRIDE);
  for (let n = 0; n < list.length; n++) {
    const i = list[n];
    let ci = (i / TRI) * 3 * CORNER;
    // A weight is the other way for a corner whose normal is turned (cook()): the place is not.
    const kind = t[i + 4];
    for (let j = 0; j < 3; j++, ci += CORNER) {
      const o = from + c[ci] * 3 * STRIDE;
      const b0 = c[ci + 1];
      const b1 = c[ci + 2];
      const b2 = c[ci + 3];
      const m0 = kind & TURN ? -b0 : b0;
      const m1 = kind & (TURN << 1) ? -b1 : b1;
      const m2 = kind & (TURN << 2) ? -b2 : b2;
      const o1 = o + STRIDE;
      const o2 = o1 + STRIDE;
      const x = a[o] * b0 + a[o1] * b1 + a[o2] * b2;
      const y = a[o + 1] * b0 + a[o1 + 1] * b1 + a[o2 + 1] * b2;
      const z = a[o + 2] * b0 + a[o1 + 2] * b1 + a[o2 + 2] * b2;
      let nx = a[o + 3] * m0 + a[o1 + 3] * m1 + a[o2 + 3] * m2;
      // A turned normal is level too (the world's level: a runner mostly stands).
      let ny =
        a[o + 4] * (m0 > 0 ? m0 : 0) +
        a[o1 + 4] * (m1 > 0 ? m1 : 0) +
        a[o2 + 4] * (m2 > 0 ? m2 : 0);
      let nz = a[o + 5] * m0 + a[o1 + 5] * m1 + a[o2 + 5] * m2;
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
    if (kind & 1) {
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
    let cr = t[i];
    let cg = t[i + 1];
    let cb = t[i + 2];
    // Plain numbers, no array a triangle (as below).
    // The marine's details keep their own colours.
    const tone =
      kind & MARINE
        ? undefined
        : cr < 0
          ? accent
          : plate && t[i + 3] == GLOSS
            ? plate
            : plate && !(kind & 1) && t[i + 5] < 0
              ? // On coloured plates the scratches are white (the user, 2026-11-10); on white ones, grey.
                SCRATCHED[+(cr > 0.55)]
              : undefined;
    if (tone) {
      cr = tone[0];
      cg = tone[1];
      cb = tone[2];
    } else if (plate && kind & 1 && !(kind & MARINE)) {
      cr = plate[0] * 0.75;
      cg = plate[1] * 0.75;
      cb = plate[2] * 0.75;
    }
    // Written by index rather than pushed: the close armour is some 20 000 vertices.
    for (let j = 0; j < 9; j += 3, w += STRIDE) {
      a[w] = P[j];
      a[w + 1] = P[j + 1];
      a[w + 2] = P[j + 2];
      a[w + 3] = N[j];
      a[w + 4] = N[j + 1];
      a[w + 5] = N[j + 2];
      a[w + 6] = cr;
      a[w + 7] = cg;
      a[w + 8] = t[i + 3];
      a[w + 9] = cb;
    }
  }
  out.length = w;
};
