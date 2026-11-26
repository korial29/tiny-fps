import { JOINT as J, JOINTS } from '../rig';

import {
  JACKET,
  TRIM,
  PANTS,
  FLESH,
  HAIR,
  UPPER,
  SOLE,
  GLOVE,
  STRIPE,
  STRIPE_LOW,
  BELT,
} from './head';

/**
 * A ring: where it is along the loft (y, or z), the centre of its ellipse across the loft (x, then
 * z, or y), its half widths in the same order (x first), `u` its place along the loft's chain of
 * joints (its integer part the joint, the rest the blend toward the next), the colour of the strip
 * after it, then rules for that strip: [limit, colour] pairs on the angle in degrees from the loft's
 * first side, beyond a positive limit, within a negative one. A ring with no radius is a point.
 */
export type Ring = number[];

export interface Loft {
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
  /** Per corner a second palette colour and how much of it is blended into the first. */
  c2: Uint8Array;
  cm: Float32Array;
  /** Per vertex the KIND of part it is (features.ts). */
  g: Uint8Array;
  /** The BUILD it is (rig.ts), the man's when absent; and, for another, the man's rest mesh it was made from, as `v`: the armour's regions are written on him. */
  b?: number;
  u?: Float32Array;
  /**
   * Per channel (CH in features.ts) the vertices it moves and, six floats each, how far at full
   * weight: the position's shift, then the normal's. skin() adds them to the rest mesh.
   */
  m: { i: Uint16Array; d: Float32Array }[];
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
export const SIDE = [108, JACKET, 72, STRIPE];
export const SIDE_LOW = [108, PANTS, 72, STRIPE_LOW];

/** The height of the armpits, where the trunk splits into the shoulders and the arms hang. */
export const SPLIT = 1.41;

export const TRUNK: Loft = {
  chain: [J.PELVIS, J.SPINE, J.CHEST, J.NECK, J.HEAD],
  n: [8, 12, 20],
  e: 2.3,
  far: [0, 2, 4, 5, 8, 9, 10, 15],
  // A bare bust (the user, 2026-11-09: no pieces on the trunk, smooth, a human one): the waist, the
  // ribs, the chest fullest at 1.37 m under the armpits, which are at 1.41 (4 cm higher than they
  // were), the shoulders falling gently to the neck. Each ring's centre forward and half depth from
  // the front and the back it is measured to.
  // Flared (the user, 2026-11-18: less of a block, a trunk): 35 cm across under the armpits down to 29
  // at the waist, where it was 33 to 31, and the waist thinner front to back; the hips wider under it.
  // The belt at the waist and a stripe down each side (both only on a space suit: see palette()).
  rings: [
    [0.93, 0, -0.013, 0.19, 0.137, 0, PANTS],
    [0.99, 0, 0.002, 0.182, 0.124, 0.25, BELT],
    [1.03, 0, 0.0155, 0.152, 0.111, 0.5, JACKET, ...SIDE],
    [1.075, 0, 0.016, 0.146, 0.109, 0.75, JACKET, ...SIDE],
    [1.12, 0, 0.012, 0.147, 0.113, 1, JACKET, ...SIDE],
    [1.25, 0, 0.011, 0.161, 0.126, 1.73, JACKET, ...SIDE],
    [1.3, 0, 0.014, 0.169, 0.131, 1.85, JACKET, ...SIDE],
    [1.37, 0, 0.015, 0.175, 0.137, 1.97, JACKET, ...SIDE],
    [1.41, 0, 0.007, 0.179, 0.138, 2, JACKET, ...SIDE],
    [1.41, 0, 0.007, 0.249, 0.138, 2, JACKET],
    [1.445, 0, -0.003, 0.238, 0.135, 2, JACKET],
    [1.475, 0, -0.0085, 0.223, 0.1265, 2.03, JACKET],
    [1.495, 0, -0.0115, 0.205, 0.1165, 2.07, JACKET],
    [1.512, 0, -0.011, 0.173, 0.103, 2.1, JACKET],
    [1.532, 0, -0.01, 0.12, 0.085, 2.25, TRIM],
    [1.555, 0, 0, 0.068, 0.066, 2.6, FLESH],
  ],
};

// Muscled and shapely (the user, 2026-11-17: they were sausages, a tube of a thigh over a knee wider
// than it): a full thigh, its quadriceps forward, tapering to a lean knee; a calf bulging behind the
// shin under it, lean again down to the ankle.
// The knee (the user, 2026-11-17): its cap stands forward of the thigh's end and the shin's top, a
// little wider there over the joint's knobs, a hollow under it.
// Boots (the user, 2026-11-17: model boots): a lip round the shaft's top under the knee, a stouter
// ankle, a shorter foot with a round toe box, and a thick sole as wide at the ground as at its welt
// (it tapered to a point, a slipper's).
// It bends in one place (the user, 2026-11-17: the fold's break): the thigh and the shin blend over
// the 15 cm round the joint, not the 40 they did, which bent the leg in a curve.
// Muscled buttocks (the user, 2026-11-17: they were flat): the pelvis' ring and the top two of each
// leg stand 5 cm further back (then more), each cheek round on its own leg, a fold under them where the thigh
// starts; the small of the back over them drawn in, so they stand out from it.
// Rounder (the user, 2026-11-17: round the thighs and the buttocks): the thighs as wide as they are
// deep nearly, the hips wider over them, the back of the thigh full under the buttock.
// A leg to the sole: the shoe is its last rings. Its first ring is the pelvis' half, and it is not
// written here.
export const LEG: Loft = {
  chain: [J.PELVIS, J.THIGH_R, J.SHIN_R, J.FOOT_R, J.TOE_R],
  n: [6, 10, 16],
  m: true,
  far: [0, 3, 7, 9, 13, 16, 18, 20],
  rings: [
    [0.93, 0.1, 0, 0, 0, 0, PANTS, ...SIDE_LOW],
    [0.85, 0.1, -0.017, 0.098, 0.131, 0.6, PANTS, ...SIDE_LOW],
    [0.79, 0.1, -0.003, 0.097, 0.119, 0.785, PANTS, ...SIDE_LOW],
    [0.72, 0.1, 0.004, 0.091, 0.106, 1, PANTS, ...SIDE_LOW],
    [0.6, 0.1, 0.003, 0.074, 0.087, 1.03, PANTS, ...SIDE_LOW],
    [0.55, 0.1, 0.001, 0.064, 0.075, 1.12, PANTS, ...SIDE_LOW],
    [0.52, 0.1, 0.005, 0.064, 0.078, 1.3, PANTS, ...SIDE_LOW],
    [0.49, 0.1, 0.006, 0.063, 0.078, 1.5, PANTS, ...SIDE_LOW],
    [0.455, 0.1, 0, 0.057, 0.068, 1.72, PANTS, ...SIDE_LOW],
    [0.425, 0.1, -0.005, 0.064, 0.074, 1.9, UPPER],
    [0.375, 0.1, -0.01, 0.064, 0.076, 2, UPPER],
    [0.33, 0.1, -0.011, 0.061, 0.074, 2, UPPER],
    [0.26, 0.1, -0.005, 0.051, 0.061, 2.025, UPPER],
    [0.19, 0.1, 0, 0.045, 0.054, 2.05, UPPER],
    [0.105, 0.1, 0, 0.047, 0.053, 2.3, UPPER],
    [0.085, 0.1, 0.004, 0.05, 0.055, 2.5, UPPER],
    [0.065, 0.1, 0.022, 0.054, 0.098, 3, UPPER],
    [0.045, 0.1, 0.045, 0.057, 0.132, 3, UPPER],
    [0.026, 0.1, 0.058, 0.059, 0.146, 3, SOLE],
    [0.008, 0.1, 0.058, 0.055, 0.143, 3, SOLE],
    [0, 0.1, 0.058, 0, 0, 3, SOLE],
  ],
};

/**
 * Two joints of the skin's own after the rig's, the right then the left: the upper arm without its
 * turn about itself, which the deltoid over the shoulder takes (skin() makes them). A humerus
 * turns in its socket under the shoulder's cap; the turn shows down the arm, to the elbow.
 */
export const [SWING_R, SWING_L] = [JOINTS, JOINTS + 1];

// A sleeve to the glove. Its first ring is the shoulder's, and it is not written here either.
// Shaped on the arm under it: the deltoid at the shoulder, the biceps' belly, a narrower elbow
// with its point a little behind, the forearm's muscles swelling just below it and tapering to the
// wrist. Each segment hangs on its own bone alone; only the rings around the elbow blend the arm
// and the forearm, and those around the wrist the forearm and the hand, so a bent elbow folds in
// one place and both segments stay straight.
// Muscled (the user, 2026-11-17: the elbow, the muscles, the fold): a full shoulder and a biceps
// that stands forward over a lean arm above the elbow; the elbow narrow, its point behind; the
// forearm's belly just under it, wider than it is deep, tapering to a lean wrist; the fold a little
// tighter round the joint. The forearm leaner (the user, 2026-11-17: too big for the wrist and the
// hand): 9 cm across under the elbow, 6.5 at the wrist, with no wide cuff over the glove.
export const ARM: Loft = {
  chain: [SWING_R, J.ARM_R, J.FOREARM_R, J.HAND_R],
  // More sides than the shoulder's side it hangs from (4, 8, 16) near and close: rounder (the user,
  // 2026-11-08); close, the eye's own arms included, 24 (17 until the user, 2026-11-09: fewer angles).
  n: [4, 10, 24],
  m: true,
  far: [0, 2, 5, 8, 10, 11, 13, 15],
  rings: [
    [SPLIT, 0.195, 0, 0, 0, 0, JACKET],
    // Its front no further forward than it was: 7 mm more came inside the own view's near plane
    // as he hangs from a ledge (body.view.test.ts). The fuller arm is behind, the triceps.
    [1.36, 0.2, 0.001, 0.057, 0.066, 0.38, JACKET, ...SIDE],
    [1.31, 0.2, 0, 0.056, 0.068, 0.5, JACKET, ...SIDE],
    [1.225, 0.208, 0.002, 0.047, 0.055, 1, JACKET, ...SIDE],
    // The fold (the user, 2026-11-17: the arms' folds): a ring close each side of the elbow's, so the
    // arm and the forearm blend over 4 cm and the arm breaks there, not in a curve over 9.
    [1.2, 0.211, -0.002, 0.044, 0.052, 1.2, JACKET, ...SIDE],
    [1.18, 0.214, -0.006, 0.041, 0.049, 1.5, JACKET, ...SIDE],
    [1.16, 0.218, -0.004, 0.043, 0.048, 1.8, JACKET, ...SIDE],
    [1.135, 0.222, 0, 0.045, 0.048, 2, JACKET, ...SIDE],
    [1.05, 0.222, 0, 0.037, 0.04, 2, JACKET, ...SIDE],
    [1.01, 0.222, 0, 0.033, 0.035, 2, JACKET, ...SIDE],
    [0.975, 0.222, 0, 0.033, 0.035, 2.05, GLOVE],
    [0.935, 0.222, 0, 0.03, 0.031, 2.6, GLOVE],
    [0.885, 0.222, -0.004, 0.032, 0.046, 3, GLOVE],
    [0.84, 0.222, -0.008, 0.033, 0.05, 3, GLOVE],
    [0.795, 0.222, -0.012, 0.029, 0.042, 3, GLOVE],
    [0.772, 0.222, -0.014, 0, 0, 3, GLOVE],
  ],
};

/** The ring where a sleeve ends in the glove, which body.ts starts the palm on, and its sides: the close ones (the eye's body is close), and the near ones. A thin wrist (3.2 cm until the user, 2026-11-09). */
export const CUFF = [0.925, 0.222, 0, 0.0265, 0.0265, 3, GLOVE];
export const CUFF_SIDES = ARM.n[2];
export const CUFF_NEAR = ARM.n[1];

/**
 * The rings with one more between each two, on a Catmull-Rom curve through them, for the near
 * level. None across a split (two rings at one height) or out of a limb's first ring (the trunk's
 * row); the new ring takes the colour and the rules of the strip it splits.
 */
export const finer = (rings: Ring[], limb: boolean): Ring[] => {
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

export const LOFTS = [TRUNK, LEG, ARM];

/** A loft with its rings remade by `f`, the rest as `L`'s, or as `more` says. */
export const remake = (L: Loft, f: (r: Ring) => Ring, more: Partial<Loft> = {}): Loft => ({
  ...L,
  rings: L.rings.map(r => f([...r])),
  ...more,
});

// The lofts the xenomorph was shaped on: the man's as they were before his body was reworked (the
// user, 2026-11-17 and 18: muscled legs and arms, a waist). Its own shape is a scale of these
// (TRUNK_X, LEG_X, ARM_X), tuned on them, so they stay as they were.
export const TRUNK_0: Loft = {
  ...TRUNK,
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
export const LEG_0: Loft = {
  ...LEG,
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
export const ARM_0: Loft = {
  ...ARM,
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
// The xenomorph (ROLE.XENO, the user 2026-11-15): the runner's lofts made gaunt, on the same joints,
// so the gait and the skinning are the man's. A narrow waist under banded ribs, thin limbs with
// straight shins (a curve down them read as a bowed leg) over a long narrow foot, the neck closed
// under a skull of its own (CREST).
export const TRUNK_X = remake(
  TRUNK_0,
  r => {
    const at = r[0];
    // One smooth scale by height (the user, 2026-11-15: harmonious shoulders): a starved waist
    // widening to the chest and the shoulders, then in to the neck. The torso's ring and the
    // shoulders' at the armpits' height take the same, and no ring under the neck is cut in alone:
    // steps there drew a line across the chest and a crease down each shoulder.
    const e = (a: number, b: number) => {
      const t = Math.min(Math.max((at - a) / (b - a), 0), 1);
      return t * t * (3 - 2 * t);
    };
    const [up, neck] = [e(1.1, 1.38), e(1.49, 1.56)];
    // Wide hips and a full rear under the starved waist (the user, 2026-11-15): wider and deeper
    // round the pelvis, the depth thrown back.
    const hip = Math.exp(-(((at - 0.95) / 0.09) ** 2));
    // Its shoulders narrower, the arm's start with them (the user, 2026-11-16: skeletal).
    const sh = Math.exp(-(((at - 1.36) / 0.07) ** 2));
    // A bony girdle round the top of the pelvis (the user, 2026-11-17: a shape that carries the
    // hips' tubes, hips() in xeno.ts, clear of the thighs): a ledge over the top of the legs.
    // Its crests flare out at the sides at a sharp angle (the user, 2026-11-17: aggressive, angled
    // upward): widening slowly up from the legs to their point, cut in sharply over it.
    const girdle = Math.exp(-(((at - 1.03) / (at < 1.03 ? 0.07 : 0.02)) ** 2));
    r[3] *= 0.72 + 0.2 * up - 0.2 * neck + 0.4 * hip - 0.1 * sh + 0.16 * girdle ** 2.2;
    r[4] *= 0.8 + 0.18 * up - 0.15 * neck + 0.3 * hip + 0.14 * girdle;
    r[2] -= 0.018 * hip;
    // One chitin up to the skull: a lighter neck drew a collar's line round it, and the ribs are
    // xeno.ts's (painted strips under them read as a belt).
    return [...r.slice(0, 6), JACKET];
  },
  // More sides near and close: the shoulders' outline round, not in facets (14 near and 28 close
  // still drew their corners).
  { far: [...TRUNK_0.far, 16], n: [8, 18, 36] },
);
// The neck runs on up into the skull, where its top is hidden: no flat ring under the jaw.
// A long neck under the head carried high (xeno.ts: HEAD_UP), running up into it.
TRUNK_X.rings.push(
  // A muscled neck (the user, 2026-11-15).
  [1.6, 0, 0.004, 0.052, 0.05, 2.75, TRIM],
  [1.655, 0, 0.008, 0.049, 0.047, 2.9, TRIM],
  [1.715, 0, 0.012, 0.044, 0.042, 3, TRIM],
  [1.745, 0, 0.014, 0, 0, 3, TRIM],
);
// The leg ends at the ankle, closed: its foot is xeno.ts's metatarsal(), longer than the rig's.
export const LEG_X = remake(
  // Its end a dome into the ankle's ball (metatarsal()): a flat cap drew a boot's sole there.
  {
    ...LEG_0,
    rings: [
      ...LEG_0.rings.filter(r => r[0] > 0.1),
      [0.088, 0.1, 0, 0.04, 0.042, 3, UPPER],
      [0.072, 0.1, 0, 0, 0, 3, UPPER],
    ],
  },
  r => {
    const [at] = r;
    // The thighs set wider at the top, under the wide hips.
    r[1] *= 1 + 0.3 * Math.min(Math.max((at - 0.6) / 0.33, 0), 1) ** 1.5;
    // Muscled (the user, 2026-11-15): a full thigh swelling in front, a lean knee, a calf bulging
    // behind the shin under it, the shin lean again down to the ankle.
    const g = (c: number, w: number) => Math.exp(-(((at - c) / w) ** 2));
    // One smooth profile down the leg, no steps: the thigh's share fading out over the knee.
    const e = (a: number, b: number) => {
      const t = Math.min(Math.max((at - a) / (b - a), 0), 1);
      return t * t * (3 - 2 * t);
    };
    const thigh = e(0.44, 0.6);
    // Its skeleton showing through (the user, 2026-11-16: as a human skeleton's): full at the
    // hip, a lean thigh down to the knee's knobs and its kneecap in front, a lean shin with a little
    // calf behind, and the ankle's knobs.
    const hip = e(0.72, 0.88);
    r[3] *=
      0.58 +
      // Muscled thighs (the user, 2026-11-17): fuller all round, the quadriceps bulging in front.
      0.24 * thigh +
      0.12 * g(0.72, 0.11) +
      // Lean under the pelvis' girdle (the user, 2026-11-17): the leg's top tucks in under it.
      0.07 * hip +
      0.16 * g(0.495, 0.03) +
      // Muscled calves (the user, 2026-11-17): wider, and bulging behind the shin.
      0.17 * g(0.34, 0.08) +
      0.14 * g(0.095, 0.02);
    r[4] *=
      0.64 +
      0.26 * thigh +
      0.2 * g(0.72, 0.11) +
      0.07 * hip +
      0.1 * g(0.495, 0.03) +
      0.36 * g(0.34, 0.08) +
      0.08 * g(0.095, 0.02);
    r[2] += 0.006 * g(0.5, 0.025) - 0.019 * g(0.34, 0.08) - 0.012 * g(0.72, 0.11);
    // A knee that bends in one place (the user, 2026-11-15: an angle, not a curve): the man's rings
    // blend the thigh and the shin over 40 cm round it; here only the 8 cm across it do, and the
    // shin hangs on its own bone down to the ankle.
    const u = r[5];
    // The shin's end hangs on the shin alone: the foot under it turns far (prowl()), and a share of
    // it bent the ankle into a kink.
    r[5] = u < 1 ? u : at >= 0.53 ? 1 : at > 0.45 ? 1 + (0.53 - at) / 0.08 : 2;
    return [...r.slice(0, 6), at > 0.11 ? PANTS : UPPER];
  },
  { far: [0, 3, 8, 11, 15, 18], n: [6, 12, 22] },
);
// Real shoulders (the user, 2026-11-15: no angle there): the deltoid's cap near the man's, round
// over the joint, then the arm thinning under it down to the wrist.
export const ARM_X = remake(ARM_0, r => {
  const at = r[0];
  const g = (c: number, w: number) => Math.exp(-(((at - c) / w) ** 2));
  // Full where it meets the shoulder, easing down to a lean bone (the user, 2026-11-16: the top of
  // the arm too thick, skeletal, an insect's; over 7 cm it left an edge down its side).
  const t = Math.min(Math.max((at - 1.2) / 0.17, 0), 1);
  const top = t * t * (3 - 2 * t);
  // Its skeleton showing through (the user, 2026-11-16: as a human skeleton's, no pieces laid on
  // it): the top as thick as the shoulder it hangs from (a thinner one left a slanting facet
  // there), then a lean shaft down to the elbow's knobs, wide across with its point behind, a
  // thin forearm and the wrist's knobs. The sides are the man's, so the first strip fans from the
  // shoulder's side evenly.
  // A lean biceps and forearm under it (the user, 2026-11-16: too thin, out of balance), each
  // swelling a little in its middle, the joints' knobs between.
  const meat = 0.16 * g(1.245, 0.05) * (1 - top) + 0.14 * g(1.06, 0.055);
  r[3] *= 0.58 + 0.28 * top + meat + 0.18 * g(1.175, 0.028) + 0.1 * g(0.965, 0.02);
  r[4] *= 0.6 + 0.28 * top + meat + 0.13 * g(1.17, 0.028) + 0.06 * g(0.965, 0.02);
  r[2] -= 0.005 * g(1.165, 0.025);
  // Its top drawn in with the narrower shoulder (TRUNK_X): out where it was, it stood past the
  // shoulder's side, an edge down it.
  r[1] -= 0.02 * g(1.36, 0.09);
  return [...r.slice(0, 6), r[0] < 0.98 ? GLOVE : JACKET];
});
/**
 * Its skull's dome, on the head joint, from the back to the middle of the head (rings along z):
 * long, swelling then tapering as it sweeps back over the crown and curves down toward the nape
 * (the user, 2026-11-15: more curves, the back bending down, not up). Its front ring is the edge of its face, xeno.ts's
 * skull(), a human skull's, which covers the front half: one smooth block, no seam.
 */
/**
 * The xenomorph's dome's profile (the user, 2026-11-15: the back's curve carrying on the front's): its length
 * behind the face's edge, the height of the face's middle (xeno.ts: EY over the head joint), how far
 * the tip falls, and the face's half width and height (EA, EB). Its top runs on from the face's own
 * ellipse, level where they meet, and falls along one arc to the tip; its underside rises faster,
 * clear of the neck.
 */
// A lower skull (the user, 2026-11-24: no egg seen from the front; 4 cm off was too much, then 2):
// the face's section 1 cm less high, its chin where it was, and squarer (CREST_E).
export const PROFILE = [0.42, 1.685, 0.21, 0.084, 0.095];
/** The exponent of the dome's sections, 2 an ellipse: over it, a flatter top and fuller corners (the user, 2026-11-24: flatten the top a little, no egg). */
export const CREST_E = 2.5;
/**
 * How much larger its head is than it was drawn (the user, 2026-11-16: a bigger head, 2026-11-24:
 * a little bigger still), about the head joint: the dome here (CREST), the face's pieces in xeno.ts (grow()).
 */
export const HEAD_K = 1.2;
/** And how much narrower (the user, 2026-11-16: less round, the sides in), across it alone. */
// Narrower again (the user, 2026-11-24: a narrower head, as the reference seen from the front).
export const HEAD_X = 0.78;
/** The dome's length behind the face's edge, metres, before the head is grown. */
export const CREST_LEN = PROFILE[0];
/** The radius of the round end of the dome, and the banana's thickness and half width behind the face. */
export const TIP = 0.062;
// Thinner with it: as thick, its underside came lower over the neck.
export const BANANA = [0.16, 0.09];

/**
 * The dome's section `z` behind the face's edge (0 to PROFILE[0]), in the rest pose: its centre's
 * height, half width and half height (a superellipse of exponent CREST_E). xeno.ts lays its hoses on it.
 */
export const domeAt = (z: number): [number, number, number] => {
  const k = Math.sqrt(Math.max(0, 1 - (z / PROFILE[0]) ** 2));
  const c = PROFILE[1] - PROFILE[2] * (z / PROFILE[0]) ** 2;
  // The top as it is (the user, 2026-11-15: perfect); the underside curves up toward the tip,
  // thinning the back of the head into a blade clear of the neck and the back.
  const top = c + PROFILE[4] * k;
  // A banana (the user, 2026-11-15): from the face's full edge (no seam) down to a body of a
  // nearly even thickness along the top's curve, tapering a little, and a round end.
  // Out of the face's edge with no slope of its own (the user, 2026-11-15: no line between the
  // banana and the face), eased over several rings.
  const e = Math.min(Math.max(z / 0.16, 0), 1);
  const f = e * e * (3 - 2 * e);
  const along = Math.max(0, (z - 0.1) / (PROFILE[0] - 0.1));
  const u = Math.max(0, (z - PROFILE[0] + TIP) / TIP);
  const cap = Math.sqrt(Math.max(0, 1 - u * u));
  // One even thickness from the face's edge to the round end (the user, 2026-11-15: a regular
  // banana), thin enough there to clear the neck.
  const th = (2 * PROFILE[4] * (1 - f) + f * BANANA[0]) * cap;
  const w = (PROFILE[3] * (1 - f) + f * (BANANA[1] - (BANANA[1] - TIP) * along)) * cap;
  return [top - th / 2, w, th / 2];
};
export const CREST: Loft = {
  chain: [J.HEAD, J.HEAD],
  n: [6, 16, 36],
  e: CREST_E,
  z: true,
  far: [0, 4, 8, 12, 16],
  rings: Array.from({ length: 12 }, (_, i) => {
    // From the tip at the back (i = 0) to the face's edge (i = 11), closer together toward the tip.
    const z = PROFILE[0] * Math.cos(((i / 11) * Math.PI) / 2);
    const [c, w, h] = domeAt(z);
    // Grown about the head joint at rest (0, 1.62, 0), as xeno.ts grows the face.
    // HAIR: its carapace (the user, 2026-11-24: the top of the head smooth, black and glossy); the
    // chitin under it is xeno.ts's (belly()).
    return [z * HEAD_K, 0, 1.62 + (c - 1.62) * HEAD_K, w * HEAD_K * HEAD_X, h * HEAD_K, 0, HAIR];
  }),
};
// A ring between each two: a smooth skull close up.
CREST.rings = finer(CREST.rings, false);
CREST.far = [0, 3, 6, 9, CREST.rings.length - 2, CREST.rings.length - 1];
/**
 * How the dome's section changes a metre behind the face's edge, over its first strip, before the
 * head is grown: its centre's height, half width and half height. The face's rim takes its normal
 * from it (skull() in xeno.ts).
 */
export const RIM = (() => {
  const [b, a] = CREST.rings.slice(-2);
  const d = (b[0] - a[0]) / HEAD_K;
  return [
    (b[2] - a[2]) / HEAD_K / d,
    (b[3] - a[3]) / (HEAD_K * HEAD_X) / d,
    (b[4] - a[4]) / HEAD_K / d,
  ];
})();

/** How high the xenomorph's hip bones rise at their outer ends, metres. */
export const WING = 0.05;
/** How deep the front of its pelvis is sunk in at the middle, metres. */
export const BOWL = 0.05;
