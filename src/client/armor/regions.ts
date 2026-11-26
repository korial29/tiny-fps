import { LIMB } from '../../shared/types';
import type { Corner } from './types';
import { NOTCH, FLAT } from './fit';

/** Why a plate applies to a triangle: the trunk, an arm or a leg (both sides). */
export const PART = { TRUNK: 0, ARM: 1, LEG: 2 } as const;

/**
 * A plate's region on the body at rest (metres, -z the front, +x the right): the part it is on,
 * the heights it spans, and the angles round
 * the part it spans (degrees from the front, + outward on a limb, toward +x on the trunk), round
 * the part's middle line at `cx` across (mirrored on the left).
 */
export interface Region {
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
  /** No plate: the ninja's sash, cloth in its own grey (SASH) off the skin (beltOff()), with no wall. */
  belt?: boolean;
}

export const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min((x - a) / (b - a), 1));
  return t * t * (3 - 2 * t);
};

/** A bell either side of the middle line, `c` out, `w` wide: no crease down the middle, as |x| would make. */
export const twin = (x: number, c: number, w: number) =>
  Math.exp(-(((x - c) / w) ** 2)) + Math.exp(-(((x + c) / w) ** 2));

/**
 * The chest plate's pecs (the user, 2026-11-10: fuller toward the bottom, then the round part too
 * low, flattened): a lobe each side of the sternum, high on the chest, rising from the line under
 * the pecs and fading to the collar, the plate flat below; `PEC` metres at most.
 */
export const PEC = 0.011;
export const pecs = (x: number, y: number) =>
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
  flare: 0.002,
  ridge: 0.003,
  x: 0.253,
  off: 0.006,
};
/**
 * The forearm's plate cast straight (the user, 2026-11-14: rectilinear, aggressive, not in rolls
 * over the muscles, still flared): its section a rounded square (`n`, a superellipse) round the
 * arm's line at `cx`, its half sizes across (`x`) and front to back (`z`) in straight lines between
 * the heights `y`: a steep taper from the wrist, then an angular break and the long run to the elbow
 * (the user, 2026-11-14: thin, an angular slope toward the hands, aggressive, down to the end of the
 * wrist, kept thin by its shape: a bevel pressed onto the skin lay on the arm in a tongue), at least
 * `floor` off the skin; then the flare and the ridge. Its end is cut to a point over the back of the
 * hand, an arrow (the user liked it: more), `cut` higher on the inside of the arm, in straight lines.
 */
export const CAST = {
  cx: 0.222,
  y: [0.935, 0.985, 1.14],
  x: [0.038, 0.045, 0.052],
  z: [0.039, 0.05, 0.059],
  floor: 0.002,
  n: 3,
  cut: 0.095,
};

/** The cast forearm plate's bottom by the angle `a` round the arm (degrees, + outward): lowest on the outside. */
const castLow = (a: number) =>
  CUFF.wrist + (CAST.cut * Math.abs(((a - 90 + 540) % 360) - 180)) / 180;

const cuff = (a: number) => CUFF.y + CUFF.rise * smooth(CUFF.a[0], CUFF.a[1], Math.abs(a));
export const vambrace = (x: number, y: number) =>
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

/** The knee pad's dome: up to 5 mm out at the kneecap (8 until the knee under it got leaner, 2026-11-19: it stood out as a ball). */
const knee = (x: number, y: number) =>
  0.005 * Math.max(0, 1 - ((Math.abs(x) - 0.1) / 0.06) ** 2 - ((y - 0.512) / 0.048) ** 2);

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
export const round = (c: Corner) => (Math.abs(Math.atan2(c[0], -c[2])) * 180) / Math.PI;
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
export const inside = (a: number) => 1 - smooth(25, 60, Math.abs(((a + 630) % 360) - 180));

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
export const plates = (_a: number, c: Corner) => {
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
export const GUSSET = { under: 0.025, off: 0.003, tuck: 0.006 };
/**
 * The ninja's belt, a wide sash (the user, 2026-11-24, on a picture: a big cloth belt with folds; it
 * was a narrow band, knotted in front, since 2026-11-17): woven cloth in his shoulder pads' grey
 * (SASH; the user, 2026-11-24: grey as the pads, it was his team's colour for a day) wound
 * round the waist, from the hips up over the bottom of his vest, pleated by the shader (render.ts).
 * Its bottom at the front's middle, rising `rise` to the hips, then down round the back to `back`
 * over the front's; its height, and how far it stands off the skin: over the vest's plates. Its top
 * rolls in to `thin` off the skin over `lip`; the tabard and the skirt (sash.ts) hang from under its
 * bottom. Cut as the gusset is, so drawn on every map, armour or none (armor()'s `bare`).
 */
export const BELT = {
  y: 0.962,
  rise: 0.012,
  back: 0.004,
  h: 0.112,
  off: 0.02,
  lip: 0.022,
  thin: 0.003,
};
const beltLow = (a: number) =>
  BELT.y +
  BELT.rise * smooth(0, 90, Math.abs(a)) -
  (BELT.rise - BELT.back) * smooth(90, 180, Math.abs(a));
/** The sash's bands up from its bottom, as shares of its height: its body, then its top's roll in two. */
const BANDS = [0, 1 - BELT.lip / BELT.h, 1 - (0.35 * BELT.lip) / BELT.h, 1];
/** How far the sash stands off the skin at the height y, at the angle a: its top rolled in, a quarter round. */
export const beltOff = (a: number, y: number) => {
  const t = Math.min(Math.max((beltLow(a) + BELT.h - y) / BELT.lip, 0), 1);
  return BELT.thin + (BELT.off - BELT.thin) * Math.sqrt(t * (2 - t));
};
const gusset = (a: number, c: Corner) => {
  const p = plates(a, c);
  return p + (THIGH.front - p) * inside(a) - GUSSET.under;
};
/** The dark grey of the ninja's sash, and of his face guard and shoulder pads (mask.ts, pads.ts). */
export const SASH = [0.24, 0.235, 0.25];
/** The cloth: plain black, as the suit's legs (the user, 2026-11-14: it was ribbed in two shades). */
export const CLOTH = [0.07, 0.07, 0.08];

/** The chest plate's top at angle a round the trunk (degrees, 0 the front): the neck's V. */
const chestTop = (a: number) => 1.5 - 0.045 * Math.cos((a * Math.PI * 1.4) / 180) ** 2;

/**
 * The chest plate's armholes (the user, 2026-11-12: a triangle came through the plate under the
 * armpit; 2026-11-13: small triangles on its sides): the shoulder's skin stands out of the trunk's
 * at the split (1.41 m, skin.ts), and a plate's edge across the two was cut in steps. Its top falls
 * from the neckline's to `low` between the two angles `a`, in one round curve with no corner at
 * either end (the user, 2026-11-17: it fell in two steps, a block and a ledge with walls under the
 * bell), steep enough to be under the split before the shoulder's skin starts (52 degrees). The
 * shoulder's bell (pads.ts) is over what is left bare. The breach that ran across the plate by the
 * armpits (2026-11-13) was the rim of the arm's hole in the trunk's skin: see TURN in cooking().
 */
export const ARMPIT = { a: [36, 66], low: 1.34, round: [50, 64], r: 0.03 };
export const chestHigh = (a: number) => {
  const [top, q, [r0, r1]] = [chestTop(a), Math.abs(a), ARMPIT.round];
  // Its corner with the plate's side (64 degrees) rounded off (the user, 2026-11-17): a quarter
  // circle down to it, met upright.
  const t = Math.min(Math.max((q - r0) / (r1 - r0), 0), 1);
  return (
    top -
    (top - ARMPIT.low) * smooth(ARMPIT.a[0], ARMPIT.a[1], q) ** 0.7 -
    ARMPIT.r * (1 - Math.sqrt(1 - t * t))
  );
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
export const belly = (x: number, y: number) =>
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
export const chevron = (a: number) => VEST.dip * Math.max(0, 1 - Math.abs(a) / 40);
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
 * The ninja's back piece (the user, 2026-11-17: one piece as the front's, where plates by halves
 * stood each side of a spine of blocks, with a plate on each flank): its top is at `top` at the
 * spine and rises by `rise` beside it, before it falls (SHIELD).
 */
export const BACK = { top: 1.475, rise: 0.03 };
/** How far round the lames go, from the front and from the back (degrees): they meet at the flank, a seam between them. */
export const FLANK = 88.5;
/** The back piece's shield: the angles off the spine between which its top falls. */
export const SHIELD = [9, 34];
/** The back piece's top at `b` degrees off the spine, before the shield's fall. */
const bladeTop = (b: number) => BACK.top + BACK.rise * smooth(0, 35, b);
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
  // The knees: round (the user, 2026-11-10), domed; smaller on the leaner knee (2026-11-19).
  {
    part: PART.LEG,
    cx: 0.1,
    y: [0.46, 0.57],
    a: [-60, 60],
    round: [47, 0.512, 0.043],
    swell: knee,
  },
  // The forearms, down to the gloves (the user, 2026-11-10), all round the arm (2026-11-12).
  {
    part: PART.ARM,
    cx: 0.222,
    y: [CUFF.wrist, CUFF.y + CUFF.rise],
    a: [-181, 181],
    high: cuff,
    low: a => castLow(a),
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
  // The ninja's sash (BELT), in bands (BANDS).
  ...[0, 1, 2].map((k): Region => ({
    part: PART.TRUNK,
    cx: 0,
    y: [BELT.y + BELT.back, BELT.y + BELT.rise + BELT.h],
    a: [-181, 181],
    low: a => beltLow(a) + BELT.h * BANDS[k],
    high: a => beltLow(a) + BELT.h * BANDS[k + 1],
    belt: true,
    alone: true,
  })),
  // The ninja's vest (the user, 2026-11-13, on his picture of a ninja's armour): a chest piece up to
  // the neck in one block, its bottom a chevron; three lames down the belly nested under it, round
  // to the flanks; the same on his back (below); and a bracer on each forearm. His shoulder pads and
  // his collar are pieces of their own (pads.ts).
  ...[0, 1].map((fem): Region => ({
    part: PART.TRUNK,
    cx: 0,
    y: [VEST.y - VEST.dip, VEST.top[fem]],
    a: fem ? [-60, 60] : [-74, 74],
    // Cut open down the sternum from the middle of its top (the user, 2026-11-18: a hole there, a
    // nice shape): a blade's point, its sides hollow, the suit showing in it.
    high: a => vestTop(a, fem) - NOTCH.deep * Math.max(0, 1 - Math.abs(a) / NOTCH.a) ** NOTCH.curve,
    low: a => VEST.y - chevron(a),
    // Flatter than the marine's (the user, 2026-11-18: reduce the armour's pecs).
    swell: (x, y) => pecs(x, y) * FLAT,
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
      // Round to the flank (the user, 2026-11-17: the front and the back as one on the sides): they
      // stopped 46 degrees round, the back's too, with two plates of other heights between them.
      a: [-FLANK, FLANK],
      high: a => top - chevron(a),
      low: a => top - VEST.lame - chevron(a),
      alone: true,
    };
  }),
  // His back as his front (the user, 2026-11-17: it was plates by halves each side of a spine of
  // blocks, not of a piece with the rest): a piece across the shoulder blades in one block, its top
  // BACK's, its bottom the chest piece's chevron, its point down the spine; and the belly's three
  // lames under it, across the small of the back.
  {
    part: PART.TRUNK,
    cx: 0,
    y: [VEST.y - VEST.dip, BACK.top + BACK.rise],
    a: [-46, 46],
    face: 180,
    // Lighter (the user, 2026-11-17: clear the shoulder blades): a shield over the spine, its top
    // falling from SHIELD[0] degrees off it to a low band at SHIELD[1], the blades left bare.
    high: a => {
      const b = 180 - Math.abs(a);
      return bladeTop(b) - (bladeTop(b) - VEST.y - 0.02) * smooth(SHIELD[0], SHIELD[1], b);
    },
    low: a => VEST.y - chevron(180 - Math.abs(a)),
    mould: true,
    alone: true,
  },
  ...[0, 1, 2].map((k): Region => {
    const top = VEST.y - VEST.gap - k * (VEST.lame + VEST.gap);
    return {
      part: PART.TRUNK,
      cx: 0,
      y: [top - VEST.lame - VEST.dip, top],
      a: [-FLANK, FLANK],
      face: 180,
      high: a => top - chevron(180 - Math.abs(a)),
      low: a => top - VEST.lame - chevron(180 - Math.abs(a)),
      alone: true,
    };
  }),
  // His bracers, thinner (the user, 2026-11-13).
  { part: PART.ARM, cx: 0.222, y: [0.99, 1.14], a: [-181, 181], alone: true, off: BRACER },
];

/** How far the plates stand off the skin: their thickness. */
export const OFF = 0.012;

/** The astronaut's white, a shade under full: in the moon's sun the plates burnt out to flat white (the user, 2026-11-13). */
export const WHITE = [0.85, 0.86, 0.88];
/** The plates' edges seen side on: their thickness. */
export const WALL = [0.7, 0.71, 0.74];

export const partOf = (l: number) =>
  l == LIMB.NONE
    ? PART.TRUNK
    : l == LIMB.ARM_L || l == LIMB.ARM_R
      ? PART.ARM
      : l == LIMB.LEG_L || l == LIMB.LEG_R
        ? PART.LEG
        : -1;
