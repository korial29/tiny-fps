// The runner's body: one closed surface generated once per level of detail in the rest pose from
// rings (a cross-section at stations along the trunk, each limb), weighted to the rig's joints and
// deformed on the CPU by dual quaternion skinning, which keeps the volume of a bent joint. The
// trunk runs from the crotch to the crown; the arms hang on it at the armpits and the legs at the
// crotch by sharing its vertices, so normals flow over the joins. Clothes are colour regions of
// the triangles. See rig.ts for the joints and the pose.
import { LIMB } from '../shared/types';
import { JOINT as J, JOINTS, REST, mul, rest, solve, turn } from './rig';
import type { Quat } from './rig';
import type { Vec3 } from './mesh';

const SKIN = [0.66, 0.45, 0.35];

/** The space suit's dark grey under its armour (the user, 2026-11-10: white, then a mid grey so the plates stand out) and its black (gloves, boots, belt): see palette(). */
const SUIT = [0.36, 0.37, 0.4];
const BLACK = [0.05, 0.05, 0.055];

/** The colour regions of a palette. */
const [
  JACKET,
  TRIM,
  PANTS,
  FLESH,
  HAIR,
  UPPER,
  SOLE,
  GLOVE,
  WHITE,
  IRIS,
  LIP,
  SHADE,
  BROW,
  STUBBLE,
  SHADOW,
  LINE,
  STRIPE,
  STRIPE_LOW,
  BELT,
  GLINT,
  CAP,
] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

/** Hair colours, one per runner (hairOf()): black, dark and mid brown, chestnut, red, dark and light blond, grey, and a shaved head, the skin's in its shadow. */
const HAIRS = [
  [0.03, 0.03, 0.035],
  [0.09, 0.07, 0.06],
  [0.2, 0.12, 0.07],
  [0.36, 0.18, 0.08],
  [0.55, 0.16, 0.06],
  [0.58, 0.43, 0.2],
  [0.86, 0.72, 0.44],
  [0.6, 0.6, 0.58],
  [0.47, 0.33, 0.27],
];

/** Iris colours, one per runner (eyesOf()): dark and mid brown, hazel, grey-blue, pale blue. */
const IRISES = [
  [0.12, 0.07, 0.04],
  [0.25, 0.14, 0.06],
  [0.3, 0.24, 0.1],
  [0.3, 0.38, 0.45],
  [0.38, 0.55, 0.75],
];

const pick = (id: number, salt: number, n: number) =>
  (Math.imul(id + 1, 0x9e3779b1 + salt) >>> 0) % n;

/** A hair colour for the runner `id`, picked at random from HAIRS but the same for everyone who sees him. */
export const hairOf = (id: number): number[] => HAIRS[pick(id, 0, HAIRS.length)];

/** An iris colour for the runner `id`, as hairOf(). */
export const eyesOf = (id: number): number[] => IRISES[pick(id, 0x2468, IRISES.length)];

/** Jacket, its darker trim, trousers (the suit's legs, darker), skin, hair, boots, sole, gloves, the whites of the eyes and their irises, the lips, the skin in its folds (nostrils, the mouth, the ears' hollows), the brows, between the hair and the skin, the shaved beard's shadow and its edge, the line between the lips (as the folds), the side stripe on the jacket and on the trousers and the belt (the jacket's and the trousers' own colours but on a space suit), the light caught in the eyes, which glows, and the cut's cauterized face, which glows too. */
/**
 * With `suit` (the moon's, the user 2026-11-10), a dark grey space suit under white armour: the
 * team's colour only in a stripe down each side, black gloves, boots and belt.
 */
export const palette = (
  jacket: number[],
  hair = HAIRS[1],
  iris = IRISES[0],
  suit = false,
): number[][] => {
  const [coat, legs] = suit ? [SUIT, SUIT.map(v => v * 0.94)] : [jacket, jacket.map(v => v * 0.62)];
  return [
    coat,
    coat.map(v => v * 0.5),
    legs,
    SKIN,
    hair,
    suit ? BLACK : [0.2, 0.19, 0.14],
    suit ? [0.03, 0.03, 0.035] : [0.09, 0.085, 0.07],
    suit ? BLACK : [0.22, 0.21, 0.16],
    [0.85, 0.83, 0.8],
    iris,
    [0.5, 0.3, 0.26],
    SKIN.map(v => v * 0.55),
    hair.map((v, i) => v * 0.4 + SKIN[i] * 0.3),
    SKIN.map((v, i) => v * 0.62 + hair[i] * 0.1 + [0, 0.01, 0.03][i]),
    SKIN.map((v, i) => v * 0.81 + hair[i] * 0.05 + [0, 0.005, 0.015][i]),
    SKIN.map(v => v * 0.55),
    suit ? jacket : coat,
    suit ? jacket : legs,
    suit ? BLACK : coat,
    [1.3, 1.3, 1.3],
    [2.8, 0.5, 0.12],
  ];
};

/**
 * A ring: where it is along the loft (y, or z), the centre of its ellipse across the loft (x, then
 * z, or y), its half widths in the same order (x first), `u` its place along the loft's chain of
 * joints (its integer part the joint, the rest the blend toward the next), the colour of the strip
 * after it, then rules for that strip: [limit, colour] pairs on the angle in degrees from the loft's
 * first side, beyond a positive limit, within a negative one. A ring with no radius is a point.
 */
type Ring = number[];

interface Loft {
  rings: Ring[];
  /** The joints u runs along. */
  chain: number[];
  /** Sides around, far, near then close (and the eye's); the rings kept in the far level. */
  n: [number, number, number];
  far: number[];
  /** Superellipse exponent of the cross-section, 2 an ellipse. */
  e?: number;
  /** Rings run along z, not y. */
  z?: boolean;
  /** Rings run along x (out to the right), across them y then z. */
  x?: boolean;
  /** Built twice, the second time mirrored for the left side. */
  m?: boolean;
}

// Metres, rest pose, +x the runner's right, the right limbs written and the left mirrored.
// The trunk's sections and the limbs' widths down to the wrists and ankles are measured on a rigged
// low-poly base mesh (the user, 2026-11-08), each limb along its own bone, carried onto this rig,
// then taken half way to a muscular soldier in a tactical vest (the user: toned down): broader
// shoulders and chest, thicker arms, knee pads. The arms hang a little further out to clear it.
// Trunk: from the crotch to the crown. Its first ring is the pelvis, whose halves are the tops of
// the legs. Two rings at the armpits' height, 10 cm under the shoulder joint, are the split: the
// first is the torso alone, the second takes in the shoulders, and the sleeves hang from the
// shoulders' sides, ending in the torso's own side vertices.
/**
 * Rules for a side stripe (angle 0 the front, 90 the sides), in the jacket's or the trousers'
 * stripe colour: their own but on a space suit.
 */
const SIDE = [108, JACKET, 72, STRIPE];
const SIDE_LOW = [108, PANTS, 72, STRIPE_LOW];

/** The height of the armpits, where the trunk splits into the shoulders and the arms hang. */
const SPLIT = 1.41;

const TRUNK: Loft = {
  chain: [J.PELVIS, J.SPINE, J.CHEST, J.NECK, J.HEAD],
  n: [8, 12, 20],
  e: 2.3,
  far: [0, 2, 4, 5, 8, 9, 10, 15],
  // A bare bust (the user, 2026-11-09: no pieces on the trunk, smooth, a human one): the waist, the
  // ribs, the chest fullest at 1.37 m under the armpits, which are at 1.41 (4 cm higher than they
  // were), the shoulders falling gently to the neck. Each ring's centre forward and half depth from
  // the front and the back it is measured to.
  // The belt at the waist and a stripe down each side (both only on a space suit: see palette()).
  rings: [
    [0.93, 0, 0.013, 0.178, 0.111, 0, PANTS],
    [0.99, 0, 0.015, 0.176, 0.111, 0.25, BELT],
    [1.03, 0, 0.011, 0.165, 0.12, 0.5, JACKET, ...SIDE],
    [1.075, 0, 0.012, 0.159, 0.12, 0.75, JACKET, ...SIDE],
    [1.12, 0, 0.012, 0.156, 0.121, 1, JACKET, ...SIDE],
    [1.25, 0, 0.011, 0.158, 0.127, 1.73, JACKET, ...SIDE],
    [1.3, 0, 0.014, 0.162, 0.131, 1.85, JACKET, ...SIDE],
    [1.37, 0, 0.015, 0.166, 0.137, 1.97, JACKET, ...SIDE],
    [1.41, 0, 0.007, 0.172, 0.138, 2, JACKET, ...SIDE],
    [1.41, 0, 0.007, 0.249, 0.138, 2, JACKET],
    [1.445, 0, -0.003, 0.238, 0.135, 2, JACKET],
    [1.475, 0, -0.0085, 0.223, 0.1265, 2.03, JACKET],
    [1.495, 0, -0.0115, 0.205, 0.1165, 2.07, JACKET],
    [1.512, 0, -0.011, 0.173, 0.103, 2.1, JACKET],
    [1.532, 0, -0.01, 0.12, 0.085, 2.25, TRIM],
    [1.555, 0, 0, 0.068, 0.066, 2.6, FLESH],
  ],
};

// A leg to the sole: the shoe is its last rings. Its first ring is the pelvis' half, and it is not
// written here.
const LEG: Loft = {
  chain: [J.PELVIS, J.THIGH_R, J.SHIN_R, J.FOOT_R, J.TOE_R],
  n: [6, 10, 16],
  m: true,
  far: [0, 3, 8, 11, 15, 18, 20, 22],
  rings: [
    [0.93, 0.1, 0, 0, 0, 0, PANTS, ...SIDE_LOW],
    [0.85, 0.1, 0.006, 0.087, 0.103, 0.6, PANTS, ...SIDE_LOW],
    [0.79, 0.1, 0.002, 0.079, 0.093, 0.785, PANTS, ...SIDE_LOW],
    [0.72, 0.1, -0.002, 0.074, 0.084, 1, PANTS, ...SIDE_LOW],
    [0.66, 0.1, -0.002, 0.072, 0.086, 1.088, PANTS, ...SIDE_LOW],
    [0.6, 0.1, -0.003, 0.072, 0.088, 1.176, PANTS, ...SIDE_LOW],
    [0.55, 0.1, -0.003, 0.081, 0.081, 1.25, PANTS, ...SIDE_LOW],
    [0.52, 0.1, -0.004, 0.083, 0.082, 1.375, PANTS, ...SIDE_LOW],
    [0.49, 0.1, -0.004, 0.083, 0.082, 1.5, PANTS, ...SIDE_LOW],
    [0.455, 0.1, -0.001, 0.08, 0.079, 1.65, PANTS, ...SIDE_LOW],
    [0.425, 0.1, 0.002, 0.082, 0.08, 1.779, UPPER],
    [0.415, 0.1, 0.003, 0.079, 0.078, 1.811, UPPER],
    [0.375, 0.1, 0.007, 0.064, 0.068, 1.9, UPPER],
    [0.33, 0.1, 0.012, 0.057, 0.062, 2, UPPER],
    [0.26, 0.1, 0.008, 0.05, 0.058, 2.025, UPPER],
    [0.19, 0.1, 0.003, 0.054, 0.066, 2.05, UPPER],
    [0.105, 0.1, 0, 0.048, 0.05, 2.3, UPPER],
    [0.085, 0.1, 0.003, 0.048, 0.047, 2.5, UPPER],
    [0.065, 0.1, 0.02, 0.054, 0.108, 3, UPPER],
    [0.045, 0.1, 0.039, 0.057, 0.146, 3, UPPER],
    [0.026, 0.1, 0.059, 0.057, 0.164, 3, SOLE],
    [0.008, 0.1, 0.062, 0.037, 0.152, 3, SOLE],
    [0, 0.1, 0.062, 0, 0, 3, SOLE],
  ],
};

/**
 * Two joints of the skin's own after the rig's, the right then the left: the upper arm without its
 * turn about itself, which the deltoid over the shoulder takes (skin() makes them). A humerus
 * turns in its socket under the shoulder's cap; the turn shows down the arm, to the elbow.
 */
const [SWING_R, SWING_L] = [JOINTS, JOINTS + 1];

// A sleeve to the glove. Its first ring is the shoulder's, and it is not written here either.
// Shaped on the arm under it: the deltoid at the shoulder, the biceps' belly, a narrower elbow
// with its point a little behind, the forearm's muscles swelling just below it and tapering to the
// wrist. Each segment hangs on its own bone alone; only the rings around the elbow blend the arm
// and the forearm, and those around the wrist the forearm and the hand, so a bent elbow folds in
// one place and both segments stay straight.
const ARM: Loft = {
  chain: [SWING_R, J.ARM_R, J.FOREARM_R, J.HAND_R],
  // More sides than the shoulder's side it hangs from (4, 8, 16) near and close: rounder (the user,
  // 2026-11-08); close, the eye's own arms included, 24 (17 until the user, 2026-11-09: fewer angles).
  n: [4, 10, 24],
  m: true,
  far: [0, 2, 4, 7, 9, 10, 12, 14],
  rings: [
    [SPLIT, 0.195, 0, 0, 0, 0, JACKET],
    [1.36, 0.2, 0.004, 0.054, 0.063, 0.38, JACKET, ...SIDE],
    [1.31, 0.2, 0.006, 0.053, 0.061, 0.5, JACKET, ...SIDE],
    [1.225, 0.208, -0.002, 0.055, 0.063, 1.12, JACKET, ...SIDE],
    [1.18, 0.214, 0.003, 0.052, 0.062, 1.5, JACKET, ...SIDE],
    [1.135, 0.222, -0.002, 0.049, 0.056, 1.9, JACKET, ...SIDE],
    [1.09, 0.222, -0.001, 0.05, 0.058, 2, JACKET, ...SIDE],
    [1.05, 0.222, -0.001, 0.044, 0.055, 2, JACKET, ...SIDE],
    [1.01, 0.222, 0, 0.04, 0.049, 2, JACKET, ...SIDE],
    [0.975, 0.222, 0, 0.043, 0.048, 2.05, GLOVE],
    [0.935, 0.222, 0, 0.038, 0.04, 2.6, GLOVE],
    [0.885, 0.222, -0.004, 0.032, 0.046, 3, GLOVE],
    [0.84, 0.222, -0.008, 0.033, 0.05, 3, GLOVE],
    [0.795, 0.222, -0.012, 0.029, 0.042, 3, GLOVE],
    [0.772, 0.222, -0.014, 0, 0, 3, GLOVE],
  ],
};

/** The ring where the eye's sleeve ends in the glove, which body.ts starts the palm on, and its sides: the close ones (the eye's body is close). A thin wrist (3.2 cm until the user, 2026-11-09). */
export const CUFF = [0.925, 0.222, 0, 0.0265, 0.0265, 3, GLOVE];
export const CUFF_SIDES = ARM.n[2];

// The eyes are small pieces of their own, the left the right one mirrored, buried in the sockets
// of the face (face()): a white almond just out of it with a dark iris at its front.
const EYE: Loft = {
  chain: [J.HEAD],
  n: [0, 5, 8],
  z: true,
  m: true,
  far: [],
  rings: [
    [-0.068, 0.032, 1.69, 0.013, 0.0058, 0, WHITE],
    [-0.0832, 0.032, 1.69, 0.013, 0.0058, 0, WHITE],
    [-0.0843, 0.032, 1.69, 0.0062, 0.0058, 0, IRIS],
    [-0.0849, 0.032, 1.69, 0.003, 0.003, 0, IRIS],
    [-0.0852, 0.032, 1.69, 0, 0, 0, IRIS],
  ],
};

// The light caught in each eye, close only: a speck on the iris over the pupil, toward the nose. It glows.
const SPECK: Loft = {
  chain: [J.HEAD],
  n: [0, 0, 6],
  z: true,
  m: true,
  far: [],
  rings: [
    [-0.0851, 0.0305, 1.6905, 0, 0, 0, GLINT],
    [-0.0855, 0.0305, 1.6905, 0.0011, 0.0011, 0, GLINT],
    [-0.0857, 0.0305, 1.6905, 0, 0, 0, GLINT],
  ],
};

// The ears are pieces of their own too, half in the head a little behind its sides: a flat oval
// standing out, leaning back.
const EAR: Loft = {
  chain: [J.HEAD],
  n: [0, 6, 10],
  m: true,
  far: [],
  rings: [
    [1.646, 0.075, -0.006, 0, 0, 0, FLESH],
    [1.652, 0.077, -0.008, 0.005, 0.007, 0, FLESH],
    [1.664, 0.08, -0.011, 0.0075, 0.011, 0, FLESH],
    [1.683, 0.082, -0.015, 0.008, 0.0135, 0, FLESH],
    [1.701, 0.081, -0.019, 0.0075, 0.012, 0, FLESH],
    [1.71, 0.079, -0.021, 0.0055, 0.008, 0, FLESH],
    [1.714, 0.077, -0.022, 0, 0, 0, FLESH],
  ],
};

// The hollow of each ear, a dark oval just out of its outer face, under the rim.
const CONCHA: Loft = {
  chain: [J.HEAD],
  n: [0, 0, 8],
  m: true,
  far: [],
  rings: [
    [1.657, 0.0875, -0.011, 0, 0, 0, SHADE],
    [1.662, 0.0878, -0.012, 0.0016, 0.0041, 0, SHADE],
    [1.675, 0.0882, -0.014, 0.0021, 0.007, 0, SHADE],
    [1.69, 0.0882, -0.016, 0.0019, 0.0061, 0, SHADE],
    [1.699, 0.0878, -0.018, 0.0014, 0.0037, 0, SHADE],
    [1.703, 0.0875, -0.019, 0, 0, 0, SHADE],
  ],
};

/**
 * The rings with one more between each two, on a Catmull-Rom curve through them, for the near
 * level. None across a split (two rings at one height) or out of a limb's first ring (the trunk's
 * row); the new ring takes the colour and the rules of the strip it splits.
 */
const finer = (rings: Ring[], limb: boolean): Ring[] => {
  const gap = (k: number) => rings[k][0] == rings[k + 1]?.[0] || (limb && !k);
  return rings.flatMap((b, k) => {
    const c = rings[k + 1];
    if (!c || gap(k)) {
      return [b];
    }
    const a = k && !gap(k - 1) ? rings[k - 1] : b;
    const d = rings[k + 2] && !gap(k + 1) ? rings[k + 2] : c;
    const mid = b.map((v, i) =>
      i < 5 ? (9 * (v + c[i]) - a[i] - d[i]) / 16 : i == 5 ? (v + c[i]) / 2 : v,
    );
    return [b, mid];
  });
};

// The head is not a loft of rings written by hand but a surface: per height a cross-section from
// SKULL (half width, depth to the front and to the back), flatter at the front, then the face carved
// into it along its normal (face()); under the jaw line (jaw()) it is the neck's. Near, its sides
// crowd to the front and its rings to the face.
const [NECK_Y, CROWN] = [1.555, 1.803];
const SKULL = [
  [1.555, 0.068, 0.085, 0.07],
  [1.575, 0.068, 0.088, 0.07],
  [1.59, 0.07, 0.091, 0.072],
  [1.605, 0.072, 0.093, 0.075],
  [1.625, 0.075, 0.095, 0.08],
  [1.645, 0.078, 0.095, 0.086],
  [1.665, 0.08, 0.094, 0.092],
  [1.69, 0.08, 0.093, 0.098],
  [1.715, 0.079, 0.092, 0.102],
  [1.74, 0.077, 0.087, 0.102],
];
/** The neck's section under the jaw (half width, front and back depth), the trunk's last ring's. */
const NECK = [0.068, 0.066, 0.066];

/**
 * The jaw line by the angle from the front: under the chin, rising to the corner of the jaw under
 * the ear, then the base of the skull behind; and how wide the blend from the neck to the head is
 * there, sharp under the jaw, soft at the nape.
 */
const jaw = (aq: number) => [
  1.588 + 0.032 * clamp(aq / 1.75) ** 1.5 + 0.025 * clamp((aq - 1.75) / 1.39),
  0.0035 + 0.011 * clamp((aq - 1.6) / 1.2),
];
const DOME = SKULL[SKULL.length - 1][0];

/** [half width, front depth, back depth, centre z] at height y: a smooth curve through SKULL, a dome above it. */
const section = (y: number): number[] => {
  if (y >= DOME) {
    const s = Math.sqrt(Math.max(1 - ((y - DOME) / (CROWN - DOME)) ** 2, 0));
    return [
      ...SKULL[SKULL.length - 1].slice(1).map(v => v * s),
      (0.012 * (y - DOME)) / (CROWN - DOME),
    ];
  }
  const k = Math.max(SKULL.findIndex(r => r[0] > y) - 1, 0);
  const [a, b] = [SKULL[k], SKULL[k + 1]];
  const [p, n] = [SKULL[k - 1] ?? a, SKULL[k + 2] ?? b];
  const h = b[0] - a[0];
  const t = (y - a[0]) / h;
  return [
    ...[1, 2, 3].map(i => {
      const [m0, m1] = [
        ((b[i] - p[i]) / (b[0] - p[0] || 1)) * h,
        ((n[i] - a[i]) / (n[0] - a[0] || 1)) * h,
      ];
      return (
        (2 * t ** 3 - 3 * t ** 2 + 1) * a[i] +
        (t ** 3 - 2 * t ** 2 + t) * m0 +
        (-2 * t ** 3 + 3 * t ** 2) * b[i] +
        (t ** 3 - t ** 2) * m1
      );
    }),
    0,
  ];
};

/** Where the hair starts, by the angle from the front (0 to pi): the forehead, the temples, a short sideburn, over the ear, the nape. */
const HAIRLINE = [
  [0, 1.757],
  [0.5, 1.752],
  [0.8, 1.738],
  [1.1, 1.718],
  [1.3, 1.672],
  [1.45, 1.672],
  [1.55, 1.712],
  [1.95, 1.712],
  [2.25, 1.64],
  [Math.PI, 1.625],
];
const hairline = (aq: number) => {
  const k = HAIRLINE.findIndex(r => r[0] >= aq);
  const [a, b] = [HAIRLINE[Math.max(k - 1, 0)], HAIRLINE[Math.max(k, 0)]];
  return a[1] + (b[1] - a[1]) * clamp((aq - a[0]) / (b[0] - a[0] || 1));
};

const bell = (a: number, s: number) => Math.exp(-((a / s) ** 2));

/** 0 below a, 1 above b, smooth between. */
const step = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** The brow ridge's crest at ax across: an arch over each eye, down to the nose and the temple. The brows follow it. */
const arcade = (ax: number) => 1.708 + 0.004 * (1 - ((ax - 0.032) / 0.024) ** 2);

/**
 * How far the surface of the head stands out of its section at (x, y), aq radians from the front:
 * the hair's thickness, fuller on top, and near the features of the face (centimetres, as bells).
 */
const face = (x: number, y: number, aq: number, fine: boolean) => {
  let d = (0.0015 + 0.0015 * step(1.72, 1.78, y)) * step(-0.003, 0.004, y - hairline(aq));
  if (!fine) {
    return d;
  }
  const ax = Math.abs(x);
  const f = Math.max(Math.cos(aq), 0);
  // The nose: set in at its bridge between the eyes, a ridge to the tip, its underside back to the
  // lip, a wing each side of the tip.
  const [bridge, tip, base] = [1.702, 1.652, 1.641];
  const k = clamp((bridge - y) / (bridge - tip));
  const h =
    y < tip
      ? 0.023 * step(base, tip, y) ** 0.6
      : y < bridge
        ? 0.002 + 0.021 * k ** 1.3
        : 0.002 * bell(y - bridge, 0.004);
  d +=
    f ** 4 *
    (h * bell(x, 0.0045 + 0.004 * k) +
      0.0042 * bell(ax - 0.0095, 0.0036) * bell(y - 1.6475, 0.0042));
  // The brow over deep sockets, cheekbones and the hollow under them, the jaw's corners, the lips,
  // a square chin; the forehead leaning back over the brow. A soldier's face (the user, 2026-11-08).
  d +=
    f ** 2 *
    (-0.013 * bell(ax - 0.032, 0.014) * bell(y - 1.69, 0.009) +
      0.01 * bell(ax - 0.026, 0.03) * bell(y - arcade(ax), 0.007) +
      0.0065 * bell(ax - 0.048, 0.012) * bell(y - 1.668, 0.011) +
      0.008 * bell(ax - 0.056, 0.014) * bell(y - 1.598, 0.013) -
      0.002 * bell(ax - 0.05, 0.012) * bell(y - 1.632, 0.01) +
      0.006 * bell(x, 0.021) * bell(y - 1.627, 0.007) +
      0.003 * bell(x, 0.019) * bell(y - 1.6215, 0.003) +
      0.004 * bell(x, 0.018) * bell(y - 1.6115, 0.0035) -
      0.002 * bell(x, 0.016) * bell(y - 1.6035, 0.003) +
      0.0075 * bell(x, 0.026) * bell(y - 1.593, 0.008) -
      0.006 * step(1.715, 1.75, y));
  // The nostrils set in under the tip, the groove from the nose to the upper lip, the line between
  // the lips, and a fold each side from the nose's wing to the corner of the mouth.
  const fold = clamp((1.646 - y) / 0.028);
  d +=
    f ** 4 *
    (-0.0022 * bell(ax - 0.006, 0.0022) * bell(y - 1.6425, 0.0022) -
      0.0008 * bell(x, 0.0025) * bell(y - 1.633, 0.006) -
      0.0015 * bell(x, 0.02) * bell(y - 1.6168, 0.0012) -
      0.0016 *
        bell(ax - 0.014 - 0.014 * fold, 0.0028) *
        step(1.614, 1.62, y) *
        (1 - step(1.644, 1.65, y)));
  // A hard look: the brows' inner ends drawn down and in over the nose, two furrows between them,
  // two lines across the forehead, the mouth's corners pulled down.
  d +=
    f ** 4 *
    (0.0035 * bell(ax - 0.012, 0.007) * bell(y - 1.704, 0.005) -
      0.002 * bell(ax - 0.004, 0.0025) * bell(y - 1.708, 0.007) -
      0.001 * bell(x, 0.035) * (bell(y - 1.727, 0.0022) + bell(y - 1.737, 0.0022)) -
      0.0014 * bell(ax - 0.021, 0.003) * bell(y - 1.611, 0.004));
  // The lids over the eyes, narrowed: the upper one down over the top of the iris, the lower one
  // up to its bottom.
  d +=
    f ** 2 *
    bell(ax - 0.032, 0.0105) *
    (0.0072 * step(1.6892, 1.6912, y) * (1 - step(1.697, 1.703, y)) +
      0.0046 * (1 - step(1.6868, 1.6882, y)) * step(1.679, 1.683, y));
  return d;
};

/** The colour of the head at a point of it: hair above the hairline, near the brows and the lips. */
const tint = (x: number, y: number, aq: number, fine: boolean) => {
  if (y > hairline(aq)) {
    return HAIR;
  }
  const ax = Math.abs(x);
  if (fine && aq < 1) {
    const [nx, ny] = [(ax - 0.006) / 0.0025, (y - 1.6428) / 0.0018];
    if (nx * nx + ny * ny < 1) {
      return SHADE;
    }
    if (Math.abs(y - 1.6168 + 6 * ax * ax) < 0.0009 && ax < 0.019) {
      return LINE;
    }
    const dy = (y - 1.6168) / 0.0082;
    if (dy * dy < 1 && ax < 0.021 * Math.sqrt(1 - dy * dy)) {
      return LIP;
    }
  }
  // The shaved beard: under the nose and the cheekbones, along the jaw to the sideburns.
  const b = Math.min(1.637 + 0.034 * clamp((aq - 0.35) / 0.95) - y, y - jaw(aq)[0] + 0.014);
  if (fine && aq < 1.75 && b > 0) {
    return b > 0.004 ? STUBBLE : SHADOW;
  }
  return FLESH;
};

/** The rest mesh: per vertex a position and a normal, two joints and the weight of the second. */
export interface Skin {
  v: Float32Array;
  j: Uint8Array;
  w: Float32Array;
  /** Three vertex indices per triangle, and the palette colour of each of its corners: the colour blends across it. */
  t: Uint16Array;
  c: Uint8Array;
  /** Per vertex the light it gets, 1 in the open and less in another part's shadow. */
  o: Float32Array;
  /** Per triangle the LIMB it comes off with, NONE for the trunk's. */
  l?: Uint8Array;
  /** Per vertex how far it turns with the jaw when the mouth opens (radians, see skin()). */
  d: Float32Array;
  /**
   * The eye's own body only: the vertices round its shoulders that skin() relaxes once posed, how
   * much (0 to 1), and per each (offsets into the lists) its neighbours and its triangles.
   */
  r?: {
    k: Uint32Array;
    g: Float32Array;
    no: Uint32Array;
    n: Uint32Array;
    to: Uint32Array;
    t: Uint32Array;
  };
}

const sgn = (v: number, e: number) => Math.sign(v) * Math.abs(v) ** (2 / e);
const clamp = (v: number) => Math.min(Math.max(v, 0), 1);

/** How far out the face is (its z) at x across, height y: the carved surface, found by halving. */
const onHead = (x: number, y: number) => {
  const [rx, zf] = section(y);
  const e = 1.9 + 0.45 * clamp((y - 1.59) / 0.07);
  let [lo, hi, z] = [0, 1.6, 0];
  for (let i = 0; i < 24; i++) {
    const q = (lo + hi) / 2;
    const p = [rx * sgn(Math.sin(q), e), -zf * sgn(Math.cos(q), e)];
    const n = [p[0] / rx ** 2, p[1] / zf ** 2];
    const k = face(p[0], y, q, true) / Math.hypot(n[0], n[1]);
    z = p[1] + n[1] * k;
    [lo, hi] = p[0] + n[0] * k < x ? [q, hi] : [lo, q];
  }
  return z;
};

// The brows, pieces of their own along x laid on the brow ridge (a colour on the head's grid
// steps), along the ridge's arch (arcade()): low over the eyes, the inner ends a little lower, thin, thinner out to
// the tail. A hard look.
const BROWS: Loft = {
  chain: [J.HEAD],
  n: [0, 3, 6],
  x: true,
  m: true,
  far: [],
  rings: [0.008, 0.0095, 0.014, 0.021, 0.028, 0.035, 0.042, 0.049, 0.055].map((x, i) => {
    const y = arcade(x) + 0.0015 - 0.08 * Math.max(0.02 - x, 0);
    const h = i % 8 ? 0.0034 - 0.06 * Math.max(x - 0.03, 0) : 0;
    return [x, y, onHead(x, y) + 0.0002, h, h && 0.0008, 0, BROW];
  }),
};

const LOFTS = [TRUNK, LEG, ARM, EYE, SPECK, BROWS, EAR, CONCHA];

const generate = (lod: number): Skin => {
  const [v, j, w, t, c, l, d]: number[][] = [[], [], [], [], [], [], []];
  /** Far, near, or close; the eye's own body is near: the camera's near plane and the hands' budget hold it. */
  // The eye's own body is close too: its chest, seen looking down, is round (the user, 2026-11-09).
  const tier = [0, 1, 2, 2][lod];
  const N = TRUNK.n[tier];
  /** The back vertex of a ring, and the last of the shoulder's side. */
  const [H, A] = [N / 2, N / 2 - 1];
  /** The trunk's rows of vertices, where it splits, and the crotch vertices both legs share. */
  let T: number[][] = [];
  let S = 0;
  const crotch: number[] = [];
  const put = (p: number[], a: number, b: number, k: number) => {
    v.push(...p, 0, 0, 0);
    d.push(0);
    j.push(a, b);
    w.push(k);
    return w.length - 1;
  };
  for (const L of LOFTS) {
    // The eye's own arms have their rings doubled too (the user, 2026-11-09: smoother arms).
    const arm = lod == 2 && L === ARM;
    const n = L.n[tier];
    // The eye's own body has no head.
    if (!n || (lod == 2 && (L.z || L.x || L === EAR || L === CONCHA))) {
      continue;
    }
    // The eye's own body ends the trunk in a cap on the shoulders and each sleeve in a cuff over a
    // thin wrist, where body.ts puts a hand.
    const base =
      lod == 2 && L === TRUNK
        ? [...L.rings.filter(r => r[0] < 1.45), [1.462, 0, 0, 0, 0, 2, JACKET]]
        : lod == 2 && L === ARM
          ? [
              ...L.rings.filter(r => r[0] > 0.96),
              [0.95, 0.222, 0, 0.035, 0.036, 2.6, GLOVE],
              CUFF,
              [0.91, 0.222, 0, 0, 0, 3, GLOVE],
            ]
          : lod
            ? L.rings
            : L.far.map(i => L.rings[i]);
    // Close, the trunk's rings doubled; the eye's arms' too.
    // Not the eye's trunk: doubled, its rings would come in front of the near plane.
    const rings = (lod == 3 && L === TRUNK) || arm ? finer(base, arm) : base;
    const up = rings[rings.length - 1][0] > rings[0][0];
    if (L === TRUNK) {
      S = rings.findIndex((r, i) => i && r[0] == rings[i - 1][0]);
    }
    for (const m of L.m ? [1, -1] : [1]) {
      /** The left joints are the right ones' four ids before. */
      const side = (b: number) => (m > 0 ? b : b == SWING_R ? SWING_L : b > J.HEAD ? b - 4 : b);
      /** A vertex of a trunk row, seen from this side. */
      const col = (row: number[], i: number) => row[m < 0 ? (N - i) % N : i];
      const vertex = (x: number, y: number, z: number, u: number) => {
        // The toe bends the front of the foot.
        u = L === LEG && y < 0.12 ? 3 + clamp((-z - 0.04) / 0.14) : u;
        const g = Math.min(Math.floor(u), L.chain.length - 2);
        // The shoulder is a chain like the arm under it: the chest, the collarbone and the shoulder
        // blade (the top of the shoulder, up to the neck, which rises in a shrug), then the
        // deltoid's cap over the joint, which goes with the arm, the armpit's skin half.
        const ax = Math.abs(x);
        const ease = (k: number) => clamp(k) ** 2 * (3 - 2 * clamp(k));
        const top = clamp((1.535 - y) / 0.05);
        // The arm's side of a slanting line through the humerus' head (0.19, 1.47), from the
        // armpit up over the point of the shoulder; the folds in front of the armpit and behind
        // it (the chest's and the back's muscles to the arm) stretch between, half and half, and
        // the deltoid over them, round the joint, is the arm's.
        const q =
          L === TRUNK
            ? ease(
                (0.85 * (ax - 0.19) -
                  0.53 * (y - 1.47) -
                  1.2 * Math.abs(z) * clamp((1.47 - y) / 0.08) +
                  0.03) /
                  0.13,
              ) *
              top *
              clamp((y - SPLIT + 0.03) / 0.04)
            : 0;
        const k =
          L === TRUNK ? ease((ax - 0.06) / 0.08) * top * clamp((y - SPLIT - 0.02) / 0.03) : 0;
        const [clav, arm] = x < 0 ? [J.CLAVICLE_L, SWING_L] : [J.CLAVICLE_R, SWING_R];
        return q
          ? put([x, y, z], k > 0.5 ? clav : J.CHEST, arm, q)
          : k
            ? put([x, y, z], J.CHEST, clav, k)
            : put(
                [x, y, z],
                side(L.chain[Math.max(g, 0)]),
                side(L.chain[g + 1] ?? L.chain[0]),
                g < 0 ? 0 : u - g,
              );
      };
      const grid = rings.map(([at, cx, co, rx, ro, u], r) => {
        const row: number[] = [];
        if (!r && L === ARM) {
          // The shoulder's side, then the torso's own side vertices, from the back to the front.
          for (let i = 1; i <= A; i++) {
            row.push(col(T[S], i));
          }
          for (let i = A - 1; i > 1; i--) {
            row.push(col(T[S - 1], i));
          }
        } else if (!r && L === LEG) {
          // The pelvis' half, then the crotch from its back to its front.
          for (let i = 0; i <= H; i++) {
            row.push(col(T[0], i));
          }
          const [f, b] = [T[0][0] * 6, T[0][H] * 6];
          for (let i = 0; i < n - H - 1; i++) {
            const g = (i + 1) / (n - H);
            crotch[i] ??= put(
              [0, 1, 2].map(k => v[b + k] + (v[f + k] - v[b + k]) * g - (k == 1 ? 0.04 : 0)),
              J.PELVIS,
              J.PELVIS,
              0,
            );
            row.push(crotch[i]);
          }
          // Turned to start at the side, as the next ring does, so the strip does not twist.
          row.push(row.shift()!);
        } else {
          for (let i = 0; i < (rx ? n : 1); i++) {
            // The torso's ring at the split gets its other vertices from the shoulders' ring.
            if (L === TRUNK && r == S - 1 && !(i > 1 && i < A) && !(i > N - A && i < N - 1)) {
              row.push(-1);
              continue;
            }
            const q = (i * 2 * Math.PI) / n;
            // The shoe is squarer than the leg, so its toe is not a point.
            // The shoulders are rounder than the chest under them: the deltoids' caps.
            // Eased over 8 cm, or the back creases in a line across the shoulder blades.
            const e =
              L === TRUNK && rx > 0.19
                ? lod == 2
                  ? 2.6
                  : 1.9 + 0.1 * clamp((at - SPLIT) / 0.07)
                : (L.e ?? 2) * (L === LEG && at < 0.12 ? 2 : 1);
            // The back widens over the 12 cm under the armpits toward the shoulders' ring, whose
            // vertices it takes at the split: no ridge across the shoulder blades. The chest does
            // not: it would stand out of the shoulders' front (the user, 2026-11-09: no shelf).
            const flare =
              L === TRUNK && rx < 0.2 && at <= SPLIT && Math.cos(q) < 0
                ? 1 +
                  0.65 *
                    clamp((at - SPLIT + 0.12) / 0.12) *
                    clamp((Math.abs(Math.cos(q)) - 0.83) / 0.03)
                : 1;
            const x = cx + rx * sgn(Math.sin(q), e) * flare;
            const o = co + ro * sgn(Math.cos(q), e);
            row.push(
              L.x
                ? vertex(m * at, x, o, u)
                : L.z
                  ? vertex(m * x, o, at, u)
                  : vertex(m * x, at, -o, u),
            );
          }
        }
        return row;
      });
      if (L === TRUNK) {
        grid[S - 1] = grid[S - 1].map((k, i) => (k < 0 ? grid[S][i] : k));
        T = grid;
      }
      grid.slice(1).forEach((b, k) => {
        if (L === TRUNK && k == S - 1) {
          return;
        }
        const a = grid[k];
        const [, , , , , , col, ...rules] = rings[k];
        // The head comes off at the neck, an arm at the shoulder, a leg at the hip: where its loft
        // meets the trunk.
        const part =
          L === TRUNK
            ? LIMB.NONE
            : L === EYE || L === SPECK || L === BROWS || L === EAR || L === CONCHA
              ? LIMB.HEAD
              : (L === ARM ? LIMB.ARM_L : LIMB.LEG_L) + +(m > 0);
        const emit = (tri: number[], u: number) => {
          const angle = Math.abs(((u * 360 + 180) % 360) - 180);
          const h = rules.findIndex((l, g) => !(g % 2) && (l > 0 ? angle > l : angle < -l));
          if (new Set(tri).size > 2) {
            t.push(...(up !== m < 0 ? [tri[0], tri[2], tri[1]] : tri));
            c.push(...Array<number>(3).fill(h < 0 ? col : rules[h + 1]));
            l.push(part);
          }
        };
        if (a.length > 1 && b.length > 1 && a.length != b.length) {
          // A sleeve's first strip, from the shoulder's side to a ring of more sides: each step
          // goes along whichever ring is behind in its turn, so the triangles fan evenly.
          for (let i = 0, j = 0; i < a.length || j < b.length;) {
            if (i >= a.length || (j < b.length && (j + 1) / b.length <= (i + 1) / a.length)) {
              emit([a[i % a.length], b[(j + 1) % b.length], b[j]], (j + 0.5) / b.length);
              j++;
            } else {
              emit([a[i], a[(i + 1) % a.length], b[j % b.length]], (j + 0.5) / b.length);
              i++;
            }
          }
          return;
        }
        for (let i = 0; i < n; i++) {
          const [p, q, r, s] = [
            a[i % a.length],
            a[(i + 1) % a.length],
            b[(i + 1) % b.length],
            b[i % b.length],
          ];
          const angle = Math.abs(((((i + 0.5) / n) * 360 + 180) % 360) - 180);
          const h = rules.findIndex((l, g) => !(g % 2) && (l > 0 ? angle > l : angle < -l));
          for (const tri of [
            [p, q, r],
            [p, r, s],
          ]) {
            if (new Set(tri).size > 2) {
              t.push(...(up !== m < 0 ? [tri[0], tri[2], tri[1]] : tri));
              c.push(...Array<number>(3).fill(h < 0 ? col : rules[h + 1]));
              l.push(part);
            }
          }
        }
      });
    }
  }
  if (lod != 2) {
    // The head, from the trunk's last row (the neck) to a point at the crown. Its first ring has
    // twice the neck's sides, on the neck's angles and between them (2.5 times close, for the
    // face's detail: 3 times cost 80 % more skinning for no visible gain); the next crowd to the face.
    const fine = tier > 0;
    const M = (tier > 1 ? 2.5 : 2) * N;
    const rows: number[][] = [T[T.length - 1]];
    const tri = (a: number, b: number, d: number, col: number) => {
      if (new Set([a, b, d]).size < 3) {
        return;
      }
      // Wound as the trunk's; each corner coloured where it is, so the hairline, the brows and the
      // lips blend over a triangle instead of stepping.
      for (const k of [a, d, b]) {
        const [x, y, z] = [v[k * 6], v[k * 6 + 1], v[k * 6 + 2]];
        t.push(k);
        c.push(col < 0 ? tint(x, y, Math.atan2(Math.abs(x), -z), fine) : col);
      }
      l.push(LIMB.HEAD);
    };
    /** The joints along the trunk's chain: the chest and the neck at the neck, the head from the jaw up. */
    const hang = (p: number[]) => {
      const u =
        p[1] < 1.6 ? 2.6 + (0.9 * (p[1] - NECK_Y)) / 0.045 : Math.min(3.5 + (p[1] - 1.6) / 0.07, 4);
      const g = Math.min(Math.floor(u), 3);
      return put(p, TRUNK.chain[g], TRUNK.chain[g + 1], u - g);
    };
    for (let y = NECK_Y; ;) {
      y += [
        [0.035, 0.035, 0.035],
        [0.014, 0.009, 0.007],
        [0.006, 0.0042, 0.003],
      ][tier][+(y > 1.575 && y < 1.745) + +((y > 1.6 && y < 1.66) || (y > 1.678 && y < 1.712))];
      if (y > CROWN - 0.003) {
        break;
      }
      const [rx, zf, zb, cz] = section(y);
      const ramp = clamp((y - NECK_Y) / 0.025);
      const warp = fine ? -0.6 * ramp : 0;
      const [ef, eb] = [1.9 + 0.45 * clamp((y - 1.59) / 0.07), 2.1];
      rows.push(
        Array.from({ length: M }, (_, i) => {
          const a = (2 * Math.PI * i) / M;
          const q = a + warp * Math.sin(a);
          const [sn, cs] = [Math.sin(q), Math.cos(q)];
          const [rz, e] = cs > 0 ? [zf, ef] : [zb, eb];
          const [x, z] = [rx * sgn(sn, e), -rz * sgn(cs, e)];
          const n = [x / rx ** 2, z / rz ** 2];
          const aq = Math.acos(cs);
          const k = face(x, y, aq, fine) / Math.hypot(n[0], n[1]);
          const [line, soft] = jaw(aq);
          const w = step(line - soft, line + soft, y);
          const [nx, nz] = [NECK[0] * sgn(sn, 2.3), -NECK[cs > 0 ? 1 : 2] * sgn(cs, 2.3)];
          const h = hang([nx + (x + n[0] * k - nx) * w, y, nz + (cz + z + n[1] * k - nz) * w]);
          // The jaw: under the line between the lips, out from its corners down to the jaw's
          // angle, the line itself half; the neck under it not.
          const ax = Math.abs(x);
          d[h] = fine
            ? 0.22 * w * clamp((1.618 - 6 * ax * ax - 0.5 * Math.max(ax - 0.019, 0) - y) / 0.004)
            : 0;
          return h;
        }),
      );
    }
    rows.push([hang([0, CROWN, 0.012])]);
    rows.slice(1).forEach((b, r) => {
      const a = rows[r];
      if (b.length > 2 * a.length) {
        // From the neck to the close head's first ring: each step along whichever ring is behind.
        for (let i = 0, j = 0; i < a.length || j < b.length;) {
          if (i >= a.length || (j < b.length && (j + 1) / b.length <= (i + 1) / a.length)) {
            tri(a[i % a.length], b[(j + 1) % b.length], b[j], FLESH);
            j++;
          } else {
            tri(a[i], a[(i + 1) % a.length], b[j % b.length], FLESH);
            i++;
          }
        }
        return;
      }
      for (let i = 0; i < a.length; i++) {
        const j = (i + 1) % a.length;
        if (b.length == 2 * a.length) {
          tri(a[i], a[j], b[2 * i + 1], FLESH);
          tri(a[i], b[2 * i + 1], b[2 * i], FLESH);
          tri(a[j], b[(2 * i + 2) % b.length], b[2 * i + 1], FLESH);
        } else {
          tri(a[i], a[j], b[j % b.length], -1);
          tri(a[i], b[j % b.length], b[i % b.length], -1);
        }
      }
    });
  }
  // The armpits relaxed: each vertex round them drawn toward the mean of its neighbours, the
  // shrinking undone every other pass (Taubin), fading out from the middle of the region. The
  // trunk splits at one height, so the shoulder stood out over the armpit in a step; relaxed, it
  // is a fold (the user, 2026-11-09).
  const near = Array.from({ length: w.length }, () => new Set<number>());
  for (let i = 0; i < t.length; i += 3) {
    for (let e = 0; e < 3; e++) {
      near[t[i + e]].add(t[i + ((e + 1) % 3)]).add(t[i + ((e + 2) % 3)]);
    }
  }
  const soft = (k: number) => clamp(k) ** 2 * (3 - 2 * clamp(k));
  const pull = Array.from({ length: w.length }, (_, k) => {
    const [ax, y] = [Math.abs(v[k * 6]), v[k * 6 + 1]];
    return (
      soft((0.075 - Math.abs(y - SPLIT + 0.01)) / 0.035) *
      soft(Math.min(ax - 0.05, 0.255 - ax) / 0.03)
    );
  });
  // Close only: farther the step does not show, and the eye's own body never sees its armpits.
  for (let pass = 0; pass < (lod == 3 ? 24 : 0); pass++) {
    const k0 = pass % 2 ? -0.53 : 0.5;
    const next = v.slice();
    pull.forEach((g, k) => {
      if (g > 0 && near[k].size) {
        // Across and in depth only: each keeps its height, so no row crosses another.
        for (const r of [0, 2]) {
          let m = 0;
          near[k].forEach(n => (m += v[n * 6 + r]));
          next[k * 6 + r] += g * k0 * (m / near[k].size - v[k * 6 + r]);
        }
      }
    });
    next.forEach((c, i) => (v[i] = c));
  }
  // Smooth normals: the area-weighted mean of the triangles around a vertex.
  for (let i = 0; i < t.length; i += 3) {
    const [a, b, d] = [t[i], t[i + 1], t[i + 2]].map(k => k * 6);
    const e = [0, 1, 2].map(r => [v[b + r] - v[a + r], v[d + r] - v[a + r]]);
    const f = [
      e[1][0] * e[2][1] - e[2][0] * e[1][1],
      e[2][0] * e[0][1] - e[0][0] * e[2][1],
      e[0][0] * e[1][1] - e[1][0] * e[0][1],
    ];
    for (const k of [a, b, d]) {
      for (let r = 0; r < 3; r++) {
        v[k + 3 + r] += f[r];
      }
    }
  }
  for (let k = 0; k < v.length; k += 6) {
    const l = Math.hypot(v[k + 3], v[k + 4], v[k + 5]) || 1;
    for (let r = 3; r < 6; r++) {
      v[k + r] /= l;
    }
  }
  // Occlusion, baked in the rest pose so the arms stand off the chest: the torso's sides in the
  // shadow of the upper arms hanging by them, the insides of the sleeves and the armpits in the
  // torso's. Each occluder shades a vertex by the cosine toward its closest point and by how near
  // its surface is.
  const ARMS: number[] = [J.ARM_L, J.FOREARM_L, J.HAND_L, J.ARM_R, J.FOREARM_R, J.HAND_R];
  const o = new Float32Array(w.length);
  for (let i = 0; i < w.length; i++) {
    const [x, y, z, nx, ny, nz] = v.slice(i * 6, i * 6 + 6);
    const arm = +ARMS.includes(j[2 * i]) * (1 - w[i]) + +ARMS.includes(j[2 * i + 1]) * w[i];
    const at = (lo: number, hi: number) => Math.min(Math.max(y, lo), hi);
    // The torso, an elliptic cylinder from the waist to the armpits; the upper arm, a capsule.
    // The torso's fades out under the elbow: the hands swing far from it.
    const [cx, cy, cz, r, k, reach] =
      arm > 0.5
        ? [0, at(1.05, 1.33), 0, 0.152, 0.152 / 0.12, 0.15 * clamp((y - 0.97) / 0.1)]
        : [Math.sign(x) * 0.212, at(1.08, 1.3), 0, 0.044, 1, 0.1];
    const d = [cx - x, cy - y, (cz - z) * k];
    const l = Math.hypot(...d);
    // Half the sphere still shades a vertex turned a little away from its centre.
    const cos = clamp(((nx * d[0] + ny * d[1] + nz * d[2]) / l + 0.6) / 1.6);
    // Gone some centimetres off its surface, so the rest of the body keeps the palette's colours.
    o[i] = reach ? 1 - 0.9 * cos * clamp((r + reach - l) / reach) ** 0.8 : 1;
  }
  // The eye's own shoulders bend hard when its arms come up (a katana held before it), on few
  // rows: the vertices round them are relaxed once posed, in skin() (the user, 2026-11-09).
  let r: Skin['r'];
  if (lod == 2) {
    const tris = Array.from({ length: w.length }, () => [] as number[]);
    for (let i = 0; i < t.length; i += 3) {
      for (let e = 0; e < 3; e++) {
        tris[t[i + e]].push(i);
      }
    }
    const ks: number[] = [];
    const gs: number[] = [];
    for (let k = 0; k < w.length; k++) {
      const [ax, y] = [Math.abs(v[k * 6]), v[k * 6 + 1]];
      const g =
        soft(Math.min(ax - 0.07, 0.34 - ax) / 0.04) * soft(Math.min(y - 1.2, 1.6 - y) / 0.06);
      // Not the poles, where many triangles meet: drawn to their ring, they would sink in a dimple.
      if (g > 0 && near[k].size && near[k].size <= 8) {
        ks.push(k);
        gs.push(g);
      }
    }
    const [no, n, to, tt] = [[0], [] as number[], [0], [] as number[]];
    for (const k of ks) {
      n.push(...near[k]);
      no.push(n.length);
      tt.push(...tris[k]);
      to.push(tt.length);
    }
    r = {
      k: new Uint32Array(ks),
      g: new Float32Array(gs),
      no: new Uint32Array(no),
      n: new Uint32Array(n),
      to: new Uint32Array(to),
      t: new Uint32Array(tt),
    };
  }
  return {
    v: new Float32Array(v),
    o,
    j: new Uint8Array(j),
    w: new Float32Array(w),
    t: new Uint16Array(t),
    c: new Uint8Array(c),
    l: new Uint8Array(l),
    d: new Float32Array(d),
    r,
  };
};

const skins: Skin[] = [];
/**
 * The skin at a level of detail: 0 far, 1 near (see DETAIL in mesh.ts), 2 near, headless and
 * handless, for the eye, 3 close (CLOSE in render.ts), twice the rings and half more sides, the
 * face carved finest. Built once.
 */
export const body = (lod: number) => (skins[lod] ??= generate(lod));

/** Per LIMB the joint the centre of its cut face hangs on. */
const ROOT = [0, J.NECK, J.CHEST, J.CHEST, J.PELVIS, J.PELVIS];

/**
 * The skin less a limb, and the limb alone. The edges of the limb's triangles whose other side is
 * the body's are the cut; a fan from one new vertex at its middle closes each side in CAP.
 */
const sever = (s: Skin, limb: number): Skin[] => {
  const n = s.w.length;
  const [t, c]: number[][][] = [
    [[], []],
    [[], []],
  ];
  const [own, other] = [new Set<number>(), new Set<number>()];
  s.l!.forEach((part, i) => {
    const k = +(part == limb);
    for (let e = 0; e < 3; e++) {
      t[k].push(s.t[i * 3 + e]);
      c[k].push(s.c[i * 3 + e]);
      [other, own][k].add((s.t[i * 3 + e] << 16) | s.t[i * 3 + ((e + 1) % 3)]);
    }
  });
  const v = new Float32Array(n * 6 + 6);
  v.set(s.v);
  let m = 0;
  for (const e of own) {
    const [a, b] = [e >> 16, e & 65535];
    // The nose's base is open, buried in the face: no other side, no cut.
    if (other.has((b << 16) | a)) {
      t[0].push(a, b, n);
      t[1].push(b, a, n);
      c[0].push(CAP, CAP, CAP);
      c[1].push(CAP, CAP, CAP);
      for (let r = 0; r < 3; r++) {
        v[n * 6 + r] += s.v[a * 6 + r];
      }
      m++;
    }
  }
  for (let r = 0; r < 3; r++) {
    v[n * 6 + r] /= m;
  }
  v[n * 6 + 4] = 1;
  const j = new Uint8Array([...s.j, ROOT[limb], ROOT[limb]]);
  const w = new Float32Array([...s.w, 0]);
  const o = new Float32Array([...s.o, 1]);
  const d = new Float32Array([...s.d, 0]);
  return t.map((x, k) => ({ v, o, j, w, d, t: new Uint16Array(x), c: new Uint8Array(c[k]) }));
};

const parts: Skin[][] = [];
/**
 * The skin at a level of detail without the LIMB `limb`, then the limb alone, each closed by a
 * glowing cut face whose middle is the last vertex of the last triangle. Built once.
 */
export const cut = (lod: number, limb: number) =>
  (parts[lod * 8 + limb] ??= sever(body(lod), limb));

const BIND = solve(rest()).pos;
BIND.push(BIND[J.ARM_R], BIND[J.ARM_L]);

/**
 * The upper arm of shoulder joint `j` in the world without its turn about itself: the swing of
 * its rotation from the collarbone's, about the bone's rest axis, on the collarbone's.
 */
const swing = (rot: Quat[], j: number): Quat => {
  const c = rot[j - 1];
  const l = mul([-c[0], -c[1], -c[2], c[3]], rot[j]);
  const b = REST[j + 1];
  const n = Math.hypot(...b);
  const p = (l[0] * b[0] + l[1] * b[1] + l[2] * b[2]) / (n * n);
  const t = [b[0] * p, b[1] * p, b[2] * p, l[3]];
  const h = Math.hypot(...t) || 1;
  return mul(c, mul(l, [-t[0] / h, -t[1] / h, -t[2] / h, t[3] / h]));
};
/** The inside of an open mouth. */
const MOUTH = [0.09, 0.03, 0.03];

/**
 * The posed vertices `r` lists (Q) relaxed: drawn toward the mean of their neighbours, the
 * shrinking undone every other pass (Taubin), then their normals the area-weighted mean of their
 * triangles' again.
 */
const relax = (s: Skin, r: NonNullable<Skin['r']>) => {
  const P = new Float32Array(r.k.length * 3);
  for (let pass = 0; pass < 14; pass++) {
    const f = pass % 2 ? -0.53 : 0.5;
    r.k.forEach((k, i) => {
      for (let d = 0; d < 3; d++) {
        let m = 0;
        for (let e = r.no[i]; e < r.no[i + 1]; e++) {
          m += Q[r.n[e] * 6 + d];
        }
        P[i * 3 + d] = Q[k * 6 + d] + r.g[i] * f * (m / (r.no[i + 1] - r.no[i]) - Q[k * 6 + d]);
      }
    });
    r.k.forEach((k, i) => {
      for (let d = 0; d < 3; d++) {
        Q[k * 6 + d] = P[i * 3 + d];
      }
    });
  }
  r.k.forEach((k, i) => {
    const n = [0, 0, 0];
    for (let e = r.to[i]; e < r.to[i + 1]; e++) {
      const [a, b, c] = [0, 1, 2].map(j => s.t[r.t[e] + j] * 6);
      const [u, v] = [b, c].map(o => [0, 1, 2].map(d => Q[o + d] - Q[a + d]));
      n[0] += u[1] * v[2] - u[2] * v[1];
      n[1] += u[2] * v[0] - u[0] * v[2];
      n[2] += u[0] * v[1] - u[1] * v[0];
    }
    const l = Math.hypot(...n) || 1;
    for (let d = 0; d < 3; d++) {
      Q[k * 6 + 3 + d] = n[d] / l;
    }
  });
};

/** Per joint the dual quaternion that carries the rest pose to the pose: the rotation, then its dual. */
const D = new Float64Array((JOINTS + 2) * 8);
const E = new Float64Array(8);
let Q = new Float32Array(0);

/**
 * Appends the skin in the pose `solved` (see solve()) to `out` as triangles in the renderer's
 * vertex format, each in its palette colour: a vertex goes where the two joints it hangs on would
 * carry it, their dual quaternions mixed by the weights (so a bent joint keeps its thickness), its
 * normal turned the same way.
 */
export const skin = (
  out: number[],
  s: Skin,
  { pos, rot }: { pos: Vec3[]; rot: Quat[] },
  colors: number[][],
  shut = 0,
  open = 0,
) => {
  for (let k = 0; k < JOINTS + 2; k++) {
    const r = k < JOINTS ? rot[k] : swing(rot, k == SWING_R ? J.ARM_R : J.ARM_L);
    const p = pos[k < JOINTS ? k : k == SWING_R ? J.ARM_R : J.ARM_L];
    const t = turn(r, BIND[k]);
    D.set(r, k * 8);
    D.set(mul([(p[0] - t[0]) / 2, (p[1] - t[1]) / 2, (p[2] - t[2]) / 2, 0], r), k * 8 + 4);
  }
  const n = s.w.length;
  if (Q.length < n * 6) {
    Q = new Float32Array(n * 6);
  }
  for (let i = 0; i < n; i++) {
    const [a, b, u, k] = [s.j[i * 2] * 8, s.j[i * 2 + 1] * 8, s.w[i], i * 6];
    // The shorter way round.
    const f =
      D[a] * D[b] + D[a + 1] * D[b + 1] + D[a + 2] * D[b + 2] + D[a + 3] * D[b + 3] < 0 ? -u : u;
    for (let r = 0; r < 8; r++) {
      E[r] = (1 - u) * D[a + r] + f * D[b + r];
    }
    const l = Math.hypot(E[0], E[1], E[2], E[3]);
    for (let r = 0; r < 8; r++) {
      E[r] /= l;
    }
    // The translation is twice the dual part times the rotation's conjugate.
    const m = [
      E[3] * E[4] - E[7] * E[0] - (E[5] * E[2] - E[6] * E[1]),
      E[3] * E[5] - E[7] * E[1] - (E[6] * E[0] - E[4] * E[2]),
      E[3] * E[6] - E[7] * E[2] - (E[4] * E[1] - E[5] * E[0]),
    ];
    // The mouth `open` turns the jaw down about its hinge under the ears: the position (e 2).
    const dj = (s.d[i] * open) / 2;
    for (const h of [k, k + 3]) {
      const e = h == k ? 2 : 0;
      const [x, y, z] = [
        s.v[h],
        s.v[h + 1] + e * dj * s.v[h + 2],
        s.v[h + 2] - e * dj * (s.v[h + 1] - 1.665),
      ];
      const [p, q, r] = [E[1] * z - E[2] * y, E[2] * x - E[0] * z, E[0] * y - E[1] * x];
      Q[h] = x + 2 * (E[3] * p + E[1] * r - E[2] * q) + e * m[0];
      Q[h + 1] = y + 2 * (E[3] * q + E[2] * p - E[0] * r) + e * m[1];
      Q[h + 2] = z + 2 * (E[3] * r + E[0] * q - E[1] * p) + e * m[2];
    }
  }
  if (s.r) {
    relax(s, s.r);
  }
  // Eyes `shut`: the lids, the skin, over the whites, the irises and their specks (unlit). Open,
  // the line between the lips is the mouth's dark.
  const pal = colors.slice();
  if (shut) {
    pal[WHITE] = pal[IRIS] = pal[GLINT] = colors[FLESH];
  }
  if (open > 0.2) {
    pal[LINE] = MOUTH;
  }
  // Written by index rather than pushed: the close skin is some 20 000 vertices.
  let o = out.length;
  for (let h = 0; h < s.t.length; h++, o += 10) {
    const [col, k, g] = [pal[s.c[h]], s.t[h] * 6, s.o[s.t[h]]];
    out[o] = Q[k];
    out[o + 1] = Q[k + 1];
    out[o + 2] = Q[k + 2];
    out[o + 3] = Q[k + 3];
    out[o + 4] = Q[k + 4];
    out[o + 5] = Q[k + 5];
    out[o + 6] = col[0] * g;
    out[o + 7] = col[1] * g;
    // The cut's face and the eyes' specks glow: unlit.
    out[o + 8] = s.c[h] >= GLINT + shut ? -2 : -1;
    out[o + 9] = col[2] * g;
  }
};
