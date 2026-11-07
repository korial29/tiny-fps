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

/** The colour regions of a palette. */
const [JACKET, TRIM, PANTS, FLESH, HAIR, UPPER, SOLE, GLOVE, WHITE, IRIS, LIP, CAP] = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
];

/** Hair colours, one per runner (hairOf()): black, dark and mid brown, chestnut, red, dark and light blond, grey. */
const HAIRS = [
  [0.03, 0.03, 0.035],
  [0.09, 0.07, 0.06],
  [0.2, 0.12, 0.07],
  [0.36, 0.18, 0.08],
  [0.55, 0.16, 0.06],
  [0.58, 0.43, 0.2],
  [0.86, 0.72, 0.44],
  [0.6, 0.6, 0.58],
];

/** A hair colour for the runner `id`, picked at random from HAIRS but the same for everyone who sees him. */
export const hairOf = (id: number): number[] =>
  HAIRS[(Math.imul(id + 1, 0x9e3779b1) >>> 29) % HAIRS.length];

/** Jacket, its darker trim, trousers, skin, hair, shoe upper, sole, gloves, the whites of the eyes and their irises, the lips, and the cut's cauterized face, which glows. */
export const palette = (jacket: number[], hair = HAIRS[1]): number[][] => [
  jacket,
  jacket.map(v => v * 0.5),
  [0.12, 0.13, 0.17],
  SKIN,
  hair,
  [0.74, 0.74, 0.77],
  [0.93, 0.93, 0.94],
  [0.26, 0.26, 0.3],
  [0.85, 0.83, 0.8],
  [0.2, 0.12, 0.06],
  [0.6, 0.35, 0.3],
  [2.8, 0.5, 0.12],
];

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
  /** Built twice, the second time mirrored for the left side. */
  m?: boolean;
}

// Metres, rest pose, +x the runner's right, the right limbs written and the left mirrored.
// Trunk: from the crotch to the crown. Its first ring is the pelvis, whose halves are the tops of
// the legs. Two rings at the armpits' height, 10 cm under the shoulder joint, are the split: the
// first is the torso alone, the second takes in the shoulders, and the sleeves hang from the
// shoulders' sides, ending in the torso's own side vertices.
const TRUNK: Loft = {
  chain: [J.PELVIS, J.SPINE, J.CHEST, J.NECK, J.HEAD],
  n: [8, 12, 18],
  e: 2.3,
  far: [0, 2, 4, 6, 7, 9, 12, 14],
  rings: [
    [0.93, 0, 0.01, 0.187, 0.108, 0, PANTS],
    [0.99, 0, 0.005, 0.18, 0.106, 0.25, TRIM],
    [1.03, 0, 0, 0.17, 0.102, 0.5, JACKET],
    [1.12, 0, 0, 0.155, 0.097, 1, JACKET],
    [1.24, 0, -0.003, 0.164, 0.112, 1.7, JACKET],
    [1.3, 0, -0.004, 0.166, 0.12, 1.85, JACKET],
    [1.37, 0, -0.005, 0.17, 0.124, 2, JACKET],
    [1.37, 0, -0.005, 0.264, 0.124, 2, JACKET],
    [1.41, 0, -0.005, 0.268, 0.123, 2, JACKET],
    [1.45, 0, -0.004, 0.26, 0.114, 2, JACKET],
    [1.485, 0, 0, 0.235, 0.098, 2.05, JACKET],
    [1.502, 0, 0, 0.185, 0.09, 2.08, JACKET],
    [1.512, 0, 0, 0.125, 0.08, 2.1, JACKET],
    [1.532, 0, 0, 0.07, 0.068, 2.25, TRIM],
    [1.555, 0, 0, 0.06, 0.062, 2.6, FLESH],
  ],
};

// A leg to the sole: the shoe is its last rings. Its first ring is the pelvis' half, and it is not
// written here.
const LEG: Loft = {
  chain: [J.PELVIS, J.THIGH_R, J.SHIN_R, J.FOOT_R, J.TOE_R],
  n: [6, 8, 14],
  m: true,
  far: [0, 2, 4, 6, 8, 10, 12, 14],
  rings: [
    [0.93, 0.1, 0, 0, 0, 0, PANTS],
    [0.85, 0.1, 0.006, 0.093, 0.098, 0.6, PANTS],
    [0.72, 0.1, -0.002, 0.088, 0.09, 1, PANTS],
    [0.55, 0.1, -0.003, 0.066, 0.07, 1.25, PANTS],
    [0.49, 0.1, -0.004, 0.058, 0.064, 1.5, PANTS],
    [0.42, 0.1, 0.002, 0.056, 0.064, 1.8, PANTS],
    [0.33, 0.1, 0.012, 0.055, 0.068, 2, PANTS],
    [0.19, 0.1, 0.003, 0.04, 0.047, 2.05, PANTS],
    [0.105, 0.1, 0, 0.038, 0.045, 2.3, UPPER],
    [0.085, 0.1, 0.0025, 0.038, 0.0425, 2.5, UPPER],
    [0.065, 0.1, 0.02, 0.043, 0.098, 3, UPPER],
    [0.045, 0.1, 0.039, 0.046, 0.133, 3, UPPER],
    [0.026, 0.1, 0.059, 0.046, 0.149, 3, SOLE],
    [0.008, 0.1, 0.062, 0.03, 0.138, 3, SOLE],
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
  n: [0, 0, 0],
  m: true,
  far: [0, 1, 3, 4, 5, 6, 8, 10],
  rings: [
    [1.37, 0.224, 0, 0, 0, 0, JACKET],
    [1.31, 0.225, -0.003, 0.05, 0.056, 0.5, JACKET],
    [1.225, 0.224, -0.002, 0.045, 0.05, 1.12, JACKET],
    [1.18, 0.222, 0.003, 0.041, 0.045, 1.5, JACKET],
    [1.135, 0.222, -0.002, 0.045, 0.047, 1.9, JACKET],
    [0.975, 0.222, 0, 0.034, 0.034, 2.05, TRIM],
    [0.935, 0.222, 0, 0.03, 0.03, 2.6, GLOVE],
    [0.885, 0.222, -0.004, 0.027, 0.037, 3, GLOVE],
    [0.84, 0.222, -0.008, 0.029, 0.042, 3, GLOVE],
    [0.795, 0.222, -0.012, 0.025, 0.034, 3, GLOVE],
    [0.772, 0.222, -0.014, 0, 0, 3, GLOVE],
  ],
};

/** The ring where the eye's sleeve ends in the glove, which body.ts starts the palm on, and its sides. */
export const CUFF = [0.925, 0.222, 0, 0.027, 0.027, 3, GLOVE];
export const CUFF_SIDES = TRUNK.n[1] - 4;

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
    [-0.0843, 0.032, 1.69, 0.0058, 0.0054, 0, IRIS],
    [-0.0849, 0.032, 1.69, 0.003, 0.003, 0, IRIS],
    [-0.0852, 0.032, 1.69, 0, 0, 0, IRIS],
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
    [1.646, 0.071, -0.006, 0, 0, 0, FLESH],
    [1.652, 0.073, -0.008, 0.005, 0.007, 0, FLESH],
    [1.664, 0.076, -0.011, 0.0075, 0.011, 0, FLESH],
    [1.683, 0.078, -0.015, 0.008, 0.0135, 0, FLESH],
    [1.701, 0.077, -0.019, 0.0075, 0.012, 0, FLESH],
    [1.71, 0.075, -0.021, 0.0055, 0.008, 0, FLESH],
    [1.714, 0.073, -0.022, 0, 0, 0, FLESH],
  ],
};

const LOFTS = [TRUNK, LEG, ARM, EYE, EAR];

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
  [1.555, 0.058, 0.085, 0.07],
  [1.575, 0.059, 0.088, 0.07],
  [1.59, 0.06, 0.091, 0.072],
  [1.605, 0.0635, 0.093, 0.075],
  [1.625, 0.067, 0.095, 0.08],
  [1.645, 0.071, 0.095, 0.086],
  [1.665, 0.0745, 0.094, 0.092],
  [1.69, 0.077, 0.093, 0.098],
  [1.715, 0.0775, 0.092, 0.102],
  [1.74, 0.076, 0.087, 0.102],
];
/** The neck's section under the jaw (half width, front and back depth), the trunk's last ring's. */
const NECK = [0.06, 0.062, 0.062];

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

/**
 * How far the surface of the head stands out of its section at (x, y), aq radians from the front:
 * the hair's thickness, fuller on top, and near the features of the face (centimetres, as bells).
 */
const face = (x: number, y: number, aq: number, fine: boolean) => {
  let d = (0.005 + 0.006 * step(1.72, 1.78, y)) * step(-0.003, 0.004, y - hairline(aq));
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
      ? 0.027 * step(base, tip, y) ** 0.6
      : y < bridge
        ? 0.002 + 0.025 * k ** 1.3
        : 0.002 * bell(y - bridge, 0.004);
  d +=
    f ** 4 *
    (h * bell(x, 0.0068 + 0.0062 * k) +
      0.0065 * bell(ax - 0.0145, 0.0055) * bell(y - 1.6475, 0.005));
  // The brow over sockets, cheekbones and the hollow under them, the lips, the chin; the forehead
  // leaning back over the brow.
  d +=
    f ** 2 *
    (-0.0085 * bell(ax - 0.032, 0.013) * bell(y - 1.69, 0.008) +
      0.005 * bell(ax - 0.026, 0.028) * bell(y - 1.709, 0.006) +
      0.005 * bell(ax - 0.048, 0.012) * bell(y - 1.668, 0.011) -
      0.002 * bell(ax - 0.05, 0.012) * bell(y - 1.632, 0.01) +
      0.006 * bell(x, 0.021) * bell(y - 1.627, 0.007) +
      0.003 * bell(x, 0.019) * bell(y - 1.6215, 0.003) +
      0.004 * bell(x, 0.018) * bell(y - 1.6115, 0.0035) -
      0.002 * bell(x, 0.016) * bell(y - 1.6035, 0.003) +
      0.0045 * bell(x, 0.017) * bell(y - 1.593, 0.007) -
      0.006 * step(1.715, 1.75, y));
  // The lids over the eyes: the upper one down over the top of the iris, the lower one under it.
  d +=
    f ** 2 *
    bell(ax - 0.032, 0.0105) *
    (0.0068 * step(1.6922, 1.6942, y) * (1 - step(1.697, 1.703, y)) +
      0.0042 * (1 - step(1.6848, 1.6862, y)) * step(1.679, 1.683, y));
  return d;
};

/** The colour of the head at a point of it: hair above the hairline, near the brows and the lips. */
const tint = (x: number, y: number, aq: number, fine: boolean) => {
  if (y > hairline(aq)) {
    return HAIR;
  }
  const ax = Math.abs(x);
  if (fine && aq < 1) {
    const arch = 1.7125 + 0.0035 * (1 - ((ax - 0.03) / 0.022) ** 2);
    if (ax > 0.01 && ax < 0.051 && Math.abs(y - arch) < 0.0042 - 0.03 * Math.max(ax - 0.035, 0)) {
      return HAIR;
    }
    const dy = (y - 1.6168) / 0.0082;
    if (dy * dy < 1 && ax < 0.021 * Math.sqrt(1 - dy * dy)) {
      return LIP;
    }
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
}

const sgn = (v: number, e: number) => Math.sign(v) * Math.abs(v) ** (2 / e);
const clamp = (v: number) => Math.min(Math.max(v, 0), 1);

const generate = (lod: number): Skin => {
  const [v, j, w, t, c, l]: number[][] = [[], [], [], [], [], []];
  /** Far, near, or close; the eye's own body is near: the camera's near plane and the hands' budget hold it. */
  const tier = [0, 1, 1, 2][lod];
  const N = TRUNK.n[tier];
  /** The back vertex of a ring, and the last of the shoulder's side. */
  const [H, A] = [N / 2, N / 2 - 1];
  /** The trunk's rows of vertices, where it splits, and the crotch vertices both legs share. */
  let T: number[][] = [];
  let S = 0;
  const crotch: number[] = [];
  const put = (p: number[], a: number, b: number, k: number) => {
    v.push(...p, 0, 0, 0);
    j.push(a, b);
    w.push(k);
    return w.length - 1;
  };
  for (const L of LOFTS) {
    const n = L === ARM ? N - 4 : L.n[tier];
    // The eye's own body has no head.
    if (!n || (lod == 2 && (L === EYE || L === EAR))) {
      continue;
    }
    // The eye's own body ends the trunk in a cap on the shoulders and each sleeve in a cuff over a
    // thin wrist, where body.ts puts a hand.
    const base =
      lod == 2 && L === TRUNK
        ? [...L.rings.slice(0, 10), [1.462, 0, 0, 0, 0, 2, JACKET]]
        : lod == 2 && L === ARM
          ? [
              ...L.rings.slice(0, 6),
              [0.95, 0.222, 0, 0.037, 0.037, 2.6, GLOVE],
              CUFF,
              [0.91, 0.222, 0, 0, 0, 3, GLOVE],
            ]
          : lod
            ? L.rings
            : L.far.map(i => L.rings[i]);
    const rings = tier > 1 && L !== EYE && L !== EAR ? finer(base, L !== TRUNK) : base;
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
        // it (the chest's and the back's muscles to the arm) stretch between, half and half.
        const q =
          L === TRUNK
            ? ease((0.85 * (ax - 0.19) - 0.53 * (y - 1.47) - 1.2 * Math.abs(z) + 0.03) / 0.13) *
              top *
              clamp((y - 1.34) / 0.04)
            : 0;
        const k = L === TRUNK ? ease((ax - 0.06) / 0.08) * top * clamp((y - 1.39) / 0.03) : 0;
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
            const e = (L.e ?? 2) * (L === LEG && at < 0.12 ? 2 : 1);
            const [x, o] = [cx + rx * sgn(Math.sin(q), e), co + ro * sgn(Math.cos(q), e)];
            row.push(L.z ? vertex(m * x, o, at, u) : vertex(m * x, at, -o, u));
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
            : L === EYE || L === EAR
              ? LIMB.HEAD
              : (L === ARM ? LIMB.ARM_L : LIMB.LEG_L) + +(m > 0);
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
    // twice the neck's sides, on the neck's angles and between them; the next crowd to the face.
    const fine = tier > 0;
    const M = 2 * N;
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
        [0.0075, 0.005, 0.0035],
      ][tier][+(y > 1.575 && y < 1.725) + +((y > 1.6 && y < 1.66) || (y > 1.678 && y < 1.702))];
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
          return hang([nx + (x + n[0] * k - nx) * w, y, nz + (cz + z + n[1] * k - nz) * w]);
        }),
      );
    }
    rows.push([hang([0, CROWN, 0.012])]);
    rows.slice(1).forEach((b, r) => {
      const a = rows[r];
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
        ? [0, at(1.05, 1.33), 0, 0.166, 0.166 / 0.12, 0.15 * clamp((y - 0.97) / 0.1)]
        : [Math.sign(x) * 0.226, at(1.08, 1.3), 0, 0.048, 1, 0.1];
    const d = [cx - x, cy - y, (cz - z) * k];
    const l = Math.hypot(...d);
    // Half the sphere still shades a vertex turned a little away from its centre.
    const cos = clamp(((nx * d[0] + ny * d[1] + nz * d[2]) / l + 0.6) / 1.6);
    // Gone some centimetres off its surface, so the rest of the body keeps the palette's colours.
    o[i] = reach ? 1 - 0.9 * cos * clamp((r + reach - l) / reach) ** 0.8 : 1;
  }
  return {
    v: new Float32Array(v),
    o,
    j: new Uint8Array(j),
    w: new Float32Array(w),
    t: new Uint16Array(t),
    c: new Uint8Array(c),
    l: new Uint8Array(l),
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
  return t.map((x, k) => ({ v, o, j, w, t: new Uint16Array(x), c: new Uint8Array(c[k]) }));
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
    for (const h of [k, k + 3]) {
      const [x, y, z] = [s.v[h], s.v[h + 1], s.v[h + 2]];
      const [p, q, r] = [E[1] * z - E[2] * y, E[2] * x - E[0] * z, E[0] * y - E[1] * x];
      const e = h == k ? 2 : 0;
      Q[h] = x + 2 * (E[3] * p + E[1] * r - E[2] * q) + e * m[0];
      Q[h + 1] = y + 2 * (E[3] * q + E[2] * p - E[0] * r) + e * m[1];
      Q[h + 2] = z + 2 * (E[3] * r + E[0] * q - E[1] * p) + e * m[2];
    }
  }
  // Written by index rather than pushed: the close skin is some 20 000 vertices.
  let o = out.length;
  for (let h = 0; h < s.t.length; h++, o += 10) {
    const [col, k, g] = [colors[s.c[h]], s.t[h] * 6, s.o[s.t[h]]];
    out[o] = Q[k];
    out[o + 1] = Q[k + 1];
    out[o + 2] = Q[k + 2];
    out[o + 3] = Q[k + 3];
    out[o + 4] = Q[k + 4];
    out[o + 5] = Q[k + 5];
    out[o + 6] = col[0] * g;
    out[o + 7] = col[1] * g;
    // The cut's face glows: unlit.
    out[o + 8] = s.c[h] == CAP ? -2 : -1;
    out[o + 9] = col[2] * g;
  }
};
