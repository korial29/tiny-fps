// The face's moving parts: the eyes' shape (a ball, an iris that slides on it, two lids), and the
// channels a face is bent by, each a field of small shifts of the rest head: the expressions
// (lids, gaze, brows, jaw, mouth) and the traits that make one runner's face his own (lookOf()).
// skin.ts bakes each field into the vertices it moves; skin() adds them up, weighted, before posing.

/** What a vertex of the skin is part of: the fields move each kind its own way. */
export const KIND = {
  BODY: 0,
  HEAD: 1,
  WHITE: 2,
  IRIS: 3,
  LID_U: 4,
  LID_L: 5,
  EAR: 6,
  /** Far, where the face is not carved: the marks that stand for the eyes, the brows and the mouth, and the nose. */
  MARK: 7,
} as const;

/** The channels: expressions first, then (from `TRAITS` on) a runner's own traits. */
export const CH = {
  /** The upper lids down onto the lower ones; BLINK_MID keeps them on the ball half way (see lids()). */
  BLINK: 0,
  BLINK_MID: 1,
  /** The upper lids up off the irises. */
  WIDE: 2,
  /** The lower lids and the cheeks up. */
  SQUINT: 3,
  /** The irises to the runner's right, and up: 1 is the end of their travel. */
  LOOK_X: 4,
  LOOK_Y: 5,
  /** The brows up; their inner ends down and in (anger, effort); their inner ends up (pain, worry). */
  BROW_UP: 6,
  BROW_DOWN: 7,
  BROW_PAIN: 8,
  /** The jaw turned down about its hinge. */
  JAW: 9,
  /** The mouth's corners up and out with the cheeks; down; the lips drawn apart off the teeth; pursed. */
  SMILE: 10,
  FROWN: 11,
  GRIT: 12,
  PUCKER: 13,
  /** The irises back with the ball's curve as they leave its middle: lookIn() is its weight. */
  LOOK_IN: 14,
  /** A wider head, a longer lower face, a wider jaw, fuller cheeks. */
  WIDTH: 15,
  CHIN: 16,
  JOWL: 17,
  CHEEK: 18,
  /** A wider nose, a longer one, a heavier brow ridge, fuller lips, ears standing out. */
  NOSE_W: 19,
  NOSE_L: 20,
  RIDGE: 21,
  LIPS: 22,
  EARS: 23,
  /** Longer hair (0 to 1), heavier lids, and what is not the same on both sides of a face. */
  HAIR: 24,
  LIDS: 25,
  ASYM: 26,
} as const;
export const [TRAITS, CHANNELS] = [15, 27];

const clamp = (v: number, lo = 0, hi = 1) => Math.min(Math.max(v, lo), hi);
const bell = (a: number, s: number) => Math.exp(-((a / s) ** 2));
const step = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** The middle of the right eye (x, y); the left is its mirror. */
export const EYE = [0.032, 1.6895];
/** Half the eye's width and height, and how far its ball stands out of its rim. */
let [EA, EB] = [0.0138, 0.009];
const ED = 0.0058;
/** How much larger than the man's the eyes being made are: the opening, the iris, the lids (see eyes()). */
let big = 1;
/** The woman's eyes are larger (the user, 2026-11-12): skin.ts sets `k` while it makes her head, and 1 back after. */
export const eyes = (k = 1) => {
  big = k;
  [EA, EB] = [0.0138 * k, 0.009 * k];
};
/** The rim's depth at the eye's middle, and how much further back it is per metre outward: the outer corner is set back. */
const [RIM, SLANT] = [-0.0792, 0.2];
/** The iris' radius, the pupil's, and how far the iris travels sideways and up or down. */
export const [IRIS_R, PUPIL_R, GAZE_X, GAZE_Y] = [0.006, 0.0023, 0.0046, 0.003];
/** How far a lid is off the ball. */
const LIFT = 0.0011;
/** The mouth: the height of the line between the lips at the middle, how it falls to the corners (per m2), and the corners. */
export const [MOUTH_Y, MOUTH_K, MOUTH_X] = [1.6218, 0.25, 0.0245];
/** The line between the lips at `ax` across. */
export const lipLine = (ax: number) => MOUTH_Y - MOUTH_K * ax * ax;

/** The front of the eye's ball at `ax` across (a right eye's), height y: its rim's plane outside it. */
export const ball = (ax: number, y: number) =>
  RIM +
  SLANT * (ax - EYE[0]) -
  ED * Math.sqrt(Math.max(1 - ((ax - EYE[0]) / EA) ** 2 - ((y - EYE[1]) / EB) ** 2, 0));

/** The line through the eye's corners at t (-1 the inner one, 1 the outer, a little higher). */
const canth = (t: number) => EYE[1] + 0.0008 * t;
const arch = (t: number) => Math.max(1 - t * t, 0) ** 0.7;
/** The open lids' edges at t: the upper one just over the top of the iris, the lower one at its bottom. */
const [UP, LOW] = [0.0039, 0.005];

/**
 * A lid's edge at t, `c` of the way to the other lid's open edge: an upper lid at 1 is shut, under
 * 0 lifted.
 */
export const lidEdge = (upper: boolean, t: number, c = 0) => {
  const [u, l] = [canth(t) + big * UP * arch(t), canth(t) - big * LOW * arch(t)];
  return upper ? u + c * (l - u) : l + c * (u - l);
};

/**
 * A point of a lid: t along the eye, s from its root in the face (0, just under the skin `surf`)
 * to its edge (1), the edge `c` of the way to the other lid (lidEdge()). It lies on the ball.
 */
export const lid = (
  upper: boolean,
  t: number,
  s: number,
  c: number,
  surf: (x: number, y: number) => number,
): number[] => {
  const x = EYE[0] + EA * 1.06 * t;
  const root = canth(t) + big * (upper ? 0.0122 : -0.0098) * (1 - 0.3 * t * t);
  const edge = lidEdge(upper, t, c);
  const y = root + (edge - root) * s;
  const zr = surf(x, root) + 0.0012;
  const ze = ball(x, edge) - LIFT;
  return [x, y, Math.min(zr + (ze - zr) * s, ball(x, y) - LIFT)];
};

/** A point of the iris' disc, r from its middle (in radii) at angle a, the gaze (gx, gy) of its travel: on the ball. */
export const iris = (r: number, a: number, gx = 0, gy = 0, k = IRIS_R * big): number[] => {
  const x = EYE[0] + gx * GAZE_X + k * r * Math.cos(a);
  const y = EYE[1] + gy * GAZE_Y + k * r * Math.sin(a);
  return [x, y, ball(x, y) - 0.00035];
};

/** The weight of CH.LOOK_IN for a gaze (gx, gy) of the irises' travel: how far back the ball's curve takes them, in millimetres. */
export const lookIn = (gx: number, gy: number) =>
  ((ball(EYE[0] + gx * GAZE_X, EYE[1] + gy * GAZE_Y) +
    ball(EYE[0] - gx * GAZE_X, EYE[1] - gy * GAZE_Y)) /
    2 -
    ball(EYE[0], EYE[1])) /
  0.001;

/** A point of the white: the ball r from its middle (1 its rim), and past 1 its sides going back into the head. */
export const white = (r: number, a: number): number[] => {
  const q = Math.min(r, 1);
  const x = EYE[0] + EA * q * Math.cos(a);
  const y = EYE[1] + EB * q * Math.sin(a);
  return [x, y, ball(x, y) + (r - q) * 0.012];
};

/** Whether (ax, y) is in the opening between the lids' roots, 1 inside, 0 outside, soft at its edge: the socket's floor is set back behind the ball there. */
export const socket = (ax: number, y: number) => {
  const t = (ax - EYE[0]) / (EA * 1.06);
  const h =
    (y - canth(t)) / (big * (y > canth(t) ? 0.0122 : 0.0098)) / (1 - 0.3 * Math.min(t * t, 1));
  return step(1, 0.72, Math.hypot(t, h));
};

/** What a field knows of a vertex beyond its place: a lid's (t, s), a head's (jaw, hair, how far over the hairline). */
export type Uv = number[] | undefined;

const brow = (ax: number, y: number) =>
  step(0.003, 0.012, ax) *
  (1 - step(0.05, 0.066, ax)) *
  bell(y - 1.714, y > 1.714 ? 0.014 : 0.0085);
const corner = (ax: number, y: number) =>
  Math.exp(-(((ax - MOUTH_X) / 0.011) ** 2) - ((y - lipLine(MOUTH_X)) / 0.01) ** 2);
/** The lips' band, growing from the mouth's middle to its corners. */
const lips = (ax: number, y: number) =>
  clamp(ax / MOUTH_X) ** 1.5 * bell(y - lipLine(ax), 0.009) * (1 - step(0.024, 0.04, ax));

/**
 * How far channel `ch` at full weight moves the rest vertex at (x, y, z), of kind `kind`: metres,
 * or nothing. `n` is its normal, `surf` the skin's depth at a point of the face (for the lids'
 * roots).
 */
export const shift = (
  ch: number,
  [x, y, z]: number[],
  kind: number,
  uv: Uv,
  n: number[],
  surf: (x: number, y: number) => number,
): number[] | undefined => {
  if (!kind) {
    return;
  }
  const [ax, sd] = [Math.abs(x), Math.sign(x) || 1];
  const eye = kind == KIND.WHITE || kind == KIND.IRIS;
  const lidded = kind == KIND.LID_U || kind == KIND.LID_L;
  const upper = kind == KIND.LID_U;
  /** A lid's vertex with its edge at c, less where it is at rest. */
  const lidTo = (c: number, c0 = 0) => {
    const [a, b] = [lid(upper, uv![0], uv![1], c0, surf), lid(upper, uv![0], uv![1], c, surf)];
    return [sd * (b[0] - a[0]), b[1] - a[1], b[2] - a[2]];
  };
  const front = clamp(-z / 0.05);
  switch (ch) {
    case CH.BLINK:
      return upper ? lidTo(1.02) : undefined;
    case CH.BLINK_MID: {
      // Half shut, the lid is on the ball and not on the chord from open to shut.
      if (!upper) {
        return;
      }
      const [a, m, b] = [0, 0.51, 1.02].map(c => lid(true, uv![0], uv![1], c, surf));
      return [0, m[1] - (a[1] + b[1]) / 2, m[2] - (a[2] + b[2]) / 2];
    }
    case CH.WIDE:
      return upper ? lidTo(-0.3) : kind == KIND.LID_L ? lidTo(-0.08) : undefined;
    case CH.SQUINT: {
      if (lidded) {
        return lidTo(upper ? 0.16 : 0.34);
      }
      // The cheek goes up under the eye.
      const k = Math.exp(-(((ax - 0.036) / 0.02) ** 2) - ((y - 1.668) / 0.011) ** 2) * front;
      return eye ? undefined : [0, 0.002 * k, -0.0012 * k];
    }
    case CH.LOOK_X:
    case CH.LOOK_Y: {
      if (kind != KIND.IRIS) {
        return;
      }
      // The right eye's inner side is the runner's left: the gaze is to one side for both. The
      // part of the ball's slope that changes sign with the side; the rest is LOOK_IN's.
      const [gx, gy] = ch == CH.LOOK_X ? [GAZE_X, 0] : [0, GAZE_Y];
      return [gx, gy, (ball(ax + sd * gx, y + gy) - ball(ax - sd * gx, y - gy)) / 2];
    }
    case CH.LOOK_IN:
      return kind == KIND.IRIS ? [0, 0, 0.001] : undefined;
  }
  if (ch < TRAITS && eye) {
    return;
  }
  const b = brow(ax, y) * front;
  const inner = bell(ax - 0.012, 0.012);
  const c = corner(ax, y) * front;
  const l = lips(ax, y) * front;
  switch (ch) {
    case CH.BROW_UP:
      return [0, 0.0048 * b * (0.7 + 0.3 * clamp(ax / 0.03)), 0];
    case CH.BROW_DOWN:
      return [
        -sd * 0.0022 * inner * b,
        -(0.0042 * inner + 0.0014) * b,
        -0.001 * bell(x, 0.01) * bell(y - 1.71, 0.01) * front,
      ];
    case CH.BROW_PAIN:
      return [0, (0.0046 * inner - 0.0018 * bell(ax - 0.046, 0.012)) * b, 0];
    case CH.JAW:
      return kind == KIND.HEAD && uv![0] ? [0, uv![0] * z, -uv![0] * (y - 1.665)] : undefined;
    case CH.SMILE: {
      const k = Math.exp(-(((ax - 0.043) / 0.017) ** 2) - ((y - 1.647) / 0.014) ** 2) * front;
      return [
        sd * (0.005 * c + 0.001 * k),
        0.006 * Math.max(l, c) + 0.003 * k,
        0.0022 * c - 0.0026 * k,
      ];
    }
    case CH.FROWN:
      return [
        sd * 0.001 * c,
        -0.0036 * Math.max(l, c) + 0.0016 * bell(x, 0.013) * bell(y - 1.606, 0.006) * front,
        0,
      ];
    case CH.GRIT: {
      // The lips off the teeth: the upper one up, the lower one down, the line between them left.
      const dy = y - lipLine(ax);
      const band = (1 - step(0.02, 0.027, ax)) * front;
      return [
        sd * 0.003 * c,
        band *
          (dy > 0.0006
            ? 0.0026 * bell(dy - 0.005, 0.006)
            : dy < -0.0006
              ? -0.003 * bell(dy + 0.005, 0.006)
              : 0),
        0,
      ];
    }
    case CH.PUCKER:
      return [-sd * 0.004 * c, 0, -0.0022 * bell(x, 0.016) * bell(y - MOUTH_Y, 0.009) * front];
    case CH.WIDTH:
      return [x * 0.045 * step(1.572, 1.62, y), 0, 0];
    case CH.CHIN:
      return [0, (y - 1.665) * 0.075 * step(1.56, 1.59, y) * +(y < 1.665), 0];
    case CH.JOWL:
      return [
        sd *
          0.004 *
          step(0.004, 0.03, ax) *
          Math.exp(-(((ax - 0.058) / 0.03) ** 2) - ((y - 1.602) / 0.024) ** 2),
        0,
        0,
      ];
    case CH.CHEEK: {
      const k = Math.exp(-(((ax - 0.045) / 0.02) ** 2) - ((y - 1.632) / 0.02) ** 2) * front;
      return [sd * 0.0016 * k, 0, -0.0026 * k];
    }
    case CH.NOSE_W:
      return [sd * 0.0022 * bell(ax - 0.011, 0.006) * bell(y - 1.648, 0.007) * front, 0, 0];
    case CH.NOSE_L: {
      const k = bell(x, 0.011) * bell(y - 1.656, 0.016) * clamp((-z - 0.07) / 0.01);
      return [0, -0.001 * k, -0.003 * k];
    }
    case CH.RIDGE:
      return [0, 0, -0.0026 * bell(ax - 0.028, 0.03) * bell(y - 1.711, 0.008) * front];
    case CH.LIPS: {
      const k = bell(x, 0.02) * bell(y - lipLine(ax), 0.009) * front;
      return [0, Math.sign(y - lipLine(ax)) * 0.0011 * k, -0.0015 * k];
    }
    case CH.EARS:
      return kind == KIND.EAR ? [sd * 0.45 * clamp(ax - 0.077, 0, 0.012), 0, 0] : undefined;
    case CH.HAIR: {
      const h =
        kind == KIND.HEAD
          ? uv![1] * (0.001 + 0.011 * step(0, 1, uv![2])) * (1 - 0.45 * step(1.775, 1.803, y))
          : 0;
      return h ? n.map(v => v * h) : undefined;
    }
    case CH.LIDS:
      return lidded ? lidTo(upper ? 0.14 : 0.06) : undefined;
    case CH.ASYM: {
      // One side's brow and mouth corner higher, the nose's tip and the chin a little off the middle.
      const r = +(x > 0);
      return [
        (0.0012 * bell(x, 0.012) * bell(y - 1.652, 0.014) +
          0.0016 * bell(y - 1.598, 0.022) * step(0.05, 0.08, -z)) *
          front,
        r * (0.0016 * b + 0.0014 * c) - (1 - r) * 0.0008 * b,
        0,
      ];
    }
  }
  return;
};

/** A draw in [0, 1) for the runner `id`, one per `salt`: the same for everyone who sees him. */
export const hash = (id: number, salt: number) => {
  let h = Math.imul(id + 1, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
};

/** Skin tones, one per runner (toneOf()): fair, light (the old one), olive, tan, brown, dark. */
export const TONES = [
  [0.74, 0.54, 0.44],
  [0.66, 0.45, 0.35],
  [0.61, 0.44, 0.31],
  [0.54, 0.36, 0.26],
  [0.4, 0.25, 0.18],
  [0.26, 0.16, 0.115],
];

/** A skin tone for the runner `id`, the same for everyone who sees him. */
export const toneOf = (id: number): number[] => TONES[Math.floor(hash(id, 7) * TONES.length)];

/** The skin tone the player picked (`c.tone`, an index of TONES), else his id's. */
export const toneFor = (id: number, c?: { tone?: number }): number[] =>
  c?.tone !== undefined ? TONES[c.tone] : toneOf(id);

/**
 * The face of the runner `id`: the weights of the trait channels (the expressions' are 0), the
 * same for everyone who sees him. Each trait is the mean of two draws, so most faces are near the
 * middle and a few are not.
 */
export const lookOf = (id: number): Float32Array => {
  const w = new Float32Array(CHANNELS);
  for (let ch = TRAITS; ch < CHANNELS; ch++) {
    const v = hash(id, ch * 2) + hash(id, ch * 2 + 1) - 1;
    w[ch] =
      ch == CH.HAIR
        ? hash(id, ch)
        : ch == CH.ASYM
          ? Math.sign(v) * (0.4 + Math.abs(v) * 0.6)
          : v * 1.25;
  }
  return w;
};
