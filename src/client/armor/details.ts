import { KANJI } from '../mask';
import { GLOSS } from '../mesh';
import { PART, VEST, chevron } from './regions';

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
export const SIGNS = SIGN.map(({ x: cx, y: cy, size, w, d }) =>
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
export const VENTS = [0, 1].map(b =>
  [1.37, 1.352, 1.334].map(y => [PART.TRUNK, 0, 26, y, 62, 0.032, 0.0014, b]),
);

/**
 * The ninja's details (the user, 2026-11-13: more detail on his armour), as DETAILS on his own
 * pieces: a seam down the chest piece, what its cut down the sternum leaves of it (NOTCH); a rivet
 * each side of each lame; a groove down each side of the back piece, a rivet each side of each back
 * lame, as the belly's; a band at each end of the bracers with three slits between them; a groove
 * down each shin guard, a rivet each side of its top. And by build, the vents (VENTS) and 忍 on the
 * left pec (SIGNS).
 */
export const NINJA_DETAILS = [
  [PART.TRUNK, 0, 0, 1.38, 0, 0.1, 0.0012, 1],
  // The lames' rivets, then a groove down each side of the back piece.
  ...[0, 180].flatMap(face =>
    [0, 1, 2].map(k => {
      const a = 39 - k * 4;
      const y = VEST.y - VEST.gap - k * (VEST.lame + VEST.gap) - VEST.lame / 2 - chevron(a);
      // The back's are the belly's, mirrored: at the old lames' heights one fell in a gap.
      return [PART.TRUNK, 0, Math.abs(face - a), y, 0, 0.007, 0.0035, 0];
    }),
  ),
  [PART.TRUNK, 0, 160, 1.33, 0, 0.09, 0.0013, 0],
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
  ...[1.03, 1.042, 1.054].map((y, i) => [
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
export const KIT: [number[], number][] = [
  [[0.1, 0.1, 0.11], GLOSS],
  [[0.25, 1, 0.4], -2],
  [[1, 0.65, 0.1], -2],
  [[0.2, 0.8, 1], -2],
  [[0.07, 0.07, 0.08], -1],
];
/** A detail's colour that is the team's, told by its red under 0 (armor() swaps it). */
export const ACCENT = [-1, 0, 0];
/** A triangle's kind bit: the astronaut's alone (ASTRO_DETAILS). */
export const ASTRO = 16;
/** A triangle's kind bit: the marine's alone (MARINE_DETAILS). */
export const MARINE = 32;
/** A triangle's kind bit: in its own colour on any plate (the marine's details). */
export const OWN = 64;
export const DARK = [0.07, 0.07, 0.08];
/** The longest piece a detail is laid in (m). */
export const PIECE = 0.012;

/**
 * Adds to the recipe the scratches on the plates of the skin `s`: short strokes at random (the
 * same each time) on its triangles inside a plate, each lying on one triangle, wholly inside its
 * plate, a hair over it, matte. Then its details (DETAILS, and the ninja's NINJA_DETAILS on his own
 * pieces), each tagged with its plate (`tag`): they keep their colour on a plate in a team's.
 */
