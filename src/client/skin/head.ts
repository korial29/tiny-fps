import type { Choice } from '../../shared/types';
import type { Vec3 } from '../mesh';
import { MOUTH_X, MOUTH_Y, TONES, hash, toneFor, lipLine } from '../features';

export const SKIN = TONES[1];

/** The suit's near black under its armour (the user, 2026-11-10: white, then a mid grey so the plates stand out; 2026-11-13: dark, on a picture of a trooper's armour) and its black (gloves, boots, belt): see palette(). */
export const SUIT = [0.075, 0.075, 0.085];
export const BLACK = [0.05, 0.05, 0.055];

/** The colour regions of a palette. */
export const [
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
  ,
  LINE,
  STRIPE,
  STRIPE_LOW,
  BELT,
  GLINT,
  CAP,
  PUPIL,
  LASH,
  BLUSH,
  TEETH,
  INNER,
] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];
/** The regions a runner's outfit is recoloured or covered by: the skin, the trousers, the boots, the gloves, the stripes and the belt. */
export const REGION = {
  FLESH,
  PANTS,
  UPPER,
  GLOVE,
  STRIPE,
  STRIPE_LOW,
  BELT,
  HAIR,
  JACKET,
  TRIM,
  SOLE,
  CAP,
};
/** The palette's colours that glow, unlit (the eyes' specks, a cut's face), and its size. */
export const [UNLIT, COLOURS] = [[GLINT, CAP], INNER + 1];

/** Hair colours, one per runner (hairOf(), by his skin too): black, dark and mid brown, chestnut, red, dark and light blond, grey, and a shaved head, the skin's in its shadow. */
export const HAIRS = [
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
export const IRISES = [
  [0.12, 0.07, 0.04],
  [0.25, 0.14, 0.06],
  [0.3, 0.24, 0.1],
  [0.3, 0.38, 0.45],
  [0.38, 0.55, 0.75],
];

export const pick = (id: number, salt: number, n: number) =>
  (Math.imul(id + 1, 0x9e3779b1 + salt) >>> 0) % n;

/** A hair colour for the runner `id`, picked at random from HAIRS but the same for everyone who sees him; his haircut (`c.hair`, look.ts) says whether he is shaved. */
export const hairOf = (id: number, c?: Choice): number[] => {
  if (c?.hair !== undefined) {
    return c.hair ? tressOf(id, c) : HAIRS[HAIRS.length - 1];
  }
  const h = pick(id, 0, HAIRS.length);
  // On the two darkest skins the hair is dark, or shaved.
  return HAIRS[dark(id, c) && h > 2 && h < 8 ? h % 3 : h];
};
/** The hair colour of the woman `id`: as hairOf(), never the shaved head's (her hair is a style of hair.ts). */
export const tressOf = (id: number, c?: Choice): number[] => {
  const h = pick(id, 0, HAIRS.length - 1);
  return HAIRS[dark(id, c) && h > 2 ? h % 3 : h];
};
export const dark = (id: number, c?: Choice) => TONES.indexOf(toneFor(id, c)) > 3;

/** How dark the shaved beard of the runner `id` is, 0 (none) to 1. */
export const beardOf = (id: number): number => Math.floor(hash(id, 99) * 4) / 3;

/** Whether the runner `id` has a shaved head (the last of HAIRS): no hair to give a length to. */
export const shaved = (id: number, c?: Choice): boolean => hairOf(id, c) == HAIRS[HAIRS.length - 1];

/** An iris colour for the runner `id`, as hairOf(). */
export const eyesOf = (id: number, c?: Choice): number[] =>
  IRISES[pick(id, 0x2468, IRISES.length) % (dark(id, c) ? 2 : IRISES.length)];

/** Jacket, its darker trim, trousers (the suit's legs, darker), skin, hair, boots, sole, gloves, the whites of the eyes and their irises, the lips, the skin in its folds (nostrils, the mouth, the ears' hollows), the brows, between the hair and the skin, the shaved beard's shadow and its edge, the line between the lips (as the folds), the side stripe on the jacket and on the trousers and the belt (the jacket's and the trousers' own colours but on a space suit), the light caught in the eyes, which glows, and the cut's cauterized face, which glows too. */
/**
 * With `suit` (the moon's, the user 2026-11-10), a dark grey space suit under white armour: the
 * team's colour only in a stripe down each side, black gloves, boots and belt. Then the pupils,
 * the lashes, the cheeks' flush and the teeth. `tone` is the skin's (toneOf()), `beard` how dark
 * the shaved beard is on it, 0 to 1. `fem` (the woman's): redder lips, darker lashes.
 */
export const palette = (
  jacket: number[],
  hair = HAIRS[1],
  eyes = IRISES[0],
  suit = false,
  tone = SKIN,
  beard = 1,
  fem = false,
): number[][] => {
  const SKIN = tone;
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
    eyes,
    // Her lips are red on any skin (the user, 2026-11-12), his a shade of his own.
    SKIN.map((v, i) => (fem ? v * 0.5 + [0.3, 0.03, 0.06][i] : v * [0.84, 0.62, 0.66][i])),
    SKIN.map(v => v * 0.55),
    hair.map((v, i) => v * 0.4 + SKIN[i] * 0.3),
    SKIN.map((v, i) => v * (1 - 0.34 * beard) + (hair[i] * 0.1 + [0, 0.01, 0.03][i]) * beard),
    SKIN.map((v, i) => v * 0.81 + hair[i] * 0.05 + [0, 0.005, 0.015][i]),
    SKIN.map(v => v * 0.55),
    suit ? jacket : coat,
    suit ? jacket : legs,
    suit ? BLACK : coat,
    [1.3, 1.3, 1.3],
    [2.8, 0.5, 0.12],
    [0.015, 0.012, 0.012],
    fem ? [0.03, 0.025, 0.025] : hair.map((v, i) => v * 0.25 + SKIN[i] * 0.12),
    SKIN.map((v, i) => v * [1.02, 0.86, 0.84][i]),
    [0.86, 0.81, 0.7],
    // The lips' inner edges: the lips' colour, gone dark as the mouth opens (mouthed()).
    SKIN.map((v, i) => (fem ? v * 0.5 + [0.3, 0.03, 0.06][i] : v * [0.84, 0.62, 0.66][i])),
  ];
};

// The head is not a loft of rings written by hand but a surface: per height a cross-section from
// SKULL (half width, depth to the front and to the back), flatter at the front, then the face carved
// into it along its normal (face()); under the jaw line (jaw()) it is the neck's. Near, its sides
// crowd to the front and its rings to the face.
export const [NECK_Y, CROWN] = [1.555, 1.803];
/**
 * 1 while the woman's skin is generated: the head's functions below carve her face. A lower face
 * that tapers to a narrower chin, a lighter brow ridge and shallower sockets, higher cheekbones, no
 * jaw corners, a smaller nose, fuller lips, thinner arched brows, a lash line on the lids.
 */
export let fem = 0;
/** Sets fem for generate(): a module cannot assign another module's binding. */
export const female = (v: number) => {
  fem = v;
};
export const SKULL = [
  [1.555, 0.068, 0.085, 0.069],
  [1.575, 0.068, 0.088, 0.07],
  [1.59, 0.069, 0.092, 0.072],
  [1.605, 0.072, 0.092, 0.073],
  [1.625, 0.075, 0.093, 0.0765],
  [1.645, 0.078, 0.094, 0.0815],
  [1.665, 0.08, 0.094, 0.091],
  [1.69, 0.08, 0.093, 0.1025],
  [1.715, 0.079, 0.092, 0.1033],
  [1.74, 0.077, 0.089, 0.0979],
];
/**
 * The back of the skull above its fullest (the occiput, at the brow's height): one round curve up to
 * the crown, not the dome's, which stood straight up the back and turned at the top (the user,
 * 2026-11-14: too stiff behind). Below it SKULL bulges out over the nape.
 */
export const OCCIPUT = [1.7, 0.104];
/** The neck's section under the jaw (half width, front and back depth), the trunk's last ring's. */
export const NECK = [0.068, 0.066, 0.066];

/**
 * The jaw line by the angle from the front: under the chin, low along the jaw to its angle a little
 * in front of the ear, then straight up behind it to under the ear (the user, 2026-11-14: an angle
 * before it rises to the ears), then the base of the skull behind; and how wide the blend from the
 * neck to the head is there, sharp under the jaw, soft at the nape.
 */
export const jaw = (aq: number) => [
  1.588 +
    0.012 * clamp(aq / 1.3) ** 1.6 +
    0.03 * step(1.3, 1.75, aq) +
    0.012 * clamp((aq - 1.75) / 1.39),
  0.0055 -
    0.0015 * step(0.6, 1.2, aq) * (1 - step(1.5, 1.7, aq)) -
    // Hers sharper round its angle (the user, 2026-11-14).
    0.0015 * fem * bell(aq - 1.3, 0.25) +
    (0.009 - 0.006 * fem) * bell(aq - 1.55, 0.3) +
    // Behind the ear the head goes on into the neck with no line (the user, 2026-11-14).
    0.034 * step(1.65, 2.3, aq),
];
export const DOME = SKULL[SKULL.length - 1][0];

/** [half width, front depth, back depth, centre z] at height y: a smooth curve through SKULL, a dome above it. */
export const section = (y: number): number[] => {
  const r = arch(y);
  if (y >= OCCIPUT[0]) {
    r[2] =
      OCCIPUT[1] * Math.max(1 - ((y - OCCIPUT[0]) / (CROWN - OCCIPUT[0])) ** 2.2, 0) ** (1 / 2.2);
  }
  return r;
};

/** section() but for the back above the occiput. */
export const arch = (y: number): number[] => {
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
  // Her lower face is narrower: the jaw tapers from the cheekbones to the chin, still wider than
  // her neck so its line shows (the user, 2026-11-14).
  const taper = 1 - 0.12 * fem * (1 - step(1.585, 1.665, y)) - 0.035 * fem * bell(y - 1.668, 0.022);
  return [
    ...[1, 2, 3].map(i => {
      const [m0, m1] = [
        ((b[i] - p[i]) / (b[0] - p[0] || 1)) * h,
        ((n[i] - a[i]) / (n[0] - a[0] || 1)) * h,
      ];
      return (
        ((2 * t ** 3 - 3 * t ** 2 + 1) * a[i] +
          (t ** 3 - 2 * t ** 2 + t) * m0 +
          (-2 * t ** 3 + 3 * t ** 2) * b[i] +
          (t ** 3 - t ** 2) * m1) *
        (i == 1 ? taper : 1)
      );
    }),
    0,
  ];
};

/**
 * How much narrower the head is at height `y` on a side `cs` of it (the cosine from the front): the
 * back below the ears goes in to the neck, not a block as wide as the face (the user, 2026-11-14).
 */
export const nape = (y: number, cs: number) =>
  1 - (0.24 + 0.1 * fem) * (1 - step(1.615, 1.7 + 0.015 * fem, y)) * Math.max(-cs, 0) ** 0.7;

/**
 * A point of the man's skull at rest, `a` radians round it from the front (+ toward +x) at height
 * `y`, `off` metres out of it along its normal: what hair.ts lays a woman's hair on.
 */
export const scalp = (a: number, y: number, off = 0): Vec3 => {
  const at = (a: number, y: number): Vec3 => {
    const [rx, zf, zb, cz] = section(Math.min(y, CROWN - 0.002));
    const [sn, cs] = [Math.sin(a), Math.cos(a)];
    const [rz, e] = cs > 0 ? [zf, 2.2] : [zb, 2.1];
    return [rx * nape(y, cs) * sgn(sn, e), y, cz - rz * sgn(cs, e)];
  };
  const p = at(a, y);
  const [da, dy] = [at(a + 0.02, y), at(a, y - 0.004)].map(q => q.map((v, i) => v - p[i]));
  const n = [
    da[1] * dy[2] - da[2] * dy[1],
    da[2] * dy[0] - da[0] * dy[2],
    da[0] * dy[1] - da[1] * dy[0],
  ];
  // Outward: away from the head's axis, and up on the dome.
  const s = n[0] * p[0] + n[2] * (p[2] - 0.004) + n[1] * 0.01 < 0 ? -1 : 1;
  const l = (Math.hypot(...n) || 1) * s;
  return [p[0] + (n[0] / l) * off, p[1] + (n[1] / l) * off, p[2] + (n[2] / l) * off];
};
/** The crown of the man's head at rest, metres. */
export const TOP = 1.803;

/** Where the hair starts, by the angle from the front (0 to pi): the forehead, the temples, a short sideburn, over the ear, the nape. */
export const HAIRLINE_M = [
  // The forehead a third of the face, from the hairline to the brow (the user, 2026-11-14).
  [0, 1.768],
  [0.5, 1.762],
  [0.8, 1.745],
  [1.1, 1.718],
  [1.3, 1.672],
  [1.45, 1.672],
  [1.55, 1.712],
  [1.95, 1.712],
  [2.25, 1.64],
  [Math.PI, 1.625],
];
/** The woman's: a higher, rounder forehead, no sideburn, clear of the ear, a higher nape. hair.ts lays her styles down to it. */
export const HAIRLINE_F = [
  [0, 1.766],
  [0.55, 1.76],
  [0.95, 1.738],
  [1.25, 1.719],
  [1.95, 1.719],
  [2.35, 1.664],
  [Math.PI, 1.65],
];
export const hairline = (aq: number) => {
  const HAIRLINE = fem ? HAIRLINE_F : HAIRLINE_M;
  const k = HAIRLINE.findIndex(r => r[0] >= aq);
  const [a, b] = [HAIRLINE[Math.max(k - 1, 0)], HAIRLINE[Math.max(k, 0)]];
  return a[1] + (b[1] - a[1]) * step(0, 1, (aq - a[0]) / (b[0] - a[0] || 1));
};

export const bell = (a: number, s: number) => Math.exp(-((a / s) ** 2));

/** 0 below a, 1 above b, smooth between. */
export const step = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** The middle of the groove between the nose and the upper lip, metres up. */
export const PHILTRUM = 1.641;

/** The brow ridge's crest at ax across: an arch over each eye, down to the nose and the temple. The brows follow it. */
export const arcade = (ax: number) => 1.7105 + 0.004 * (1 - ((ax - 0.032) / 0.024) ** 2);

/**
 * How far the surface of the head stands out of its section at (x, y), aq radians from the front:
 * the hair's thickness, fuller on top, and near the features of the face (centimetres, as bells).
 */
export const face = (x: number, y: number, aq: number, fine: boolean) => {
  let d = (0.0015 + 0.0015 * step(1.72, 1.78, y)) * step(-0.003, 0.004, y - hairline(aq));
  if (!fine) {
    return d;
  }
  const ax = Math.abs(x);
  const f = Math.max(Math.cos(aq), 0);
  // The nose: set in at its bridge between the eyes, a ridge to the tip, its underside back to the
  // lip, a wing each side of the tip.
  const [bridge, tip, base] = [1.702, 1.659, 1.648];
  const k = clamp((bridge - y) / (bridge - tip));
  const h =
    (y < tip
      ? 0.023 * step(base, tip, y) ** 0.6
      : y < bridge
        ? 0.002 + 0.021 * k ** 1.3
        : 0.002 * bell(y - bridge, 0.004)) *
    // 21 mm from its base to its tip on him, 18 on her.
    (0.87 - 0.07 * fem);
  d +=
    f ** 4 *
    (h * bell(x, 0.0045 - 0.0006 * fem + (0.004 - 0.0012 * fem) * k) +
      (0.0042 - 0.001 * fem) * bell(ax - 0.0095, 0.0036) * bell(y - 1.6545, 0.0042));
  /** The height as the lips see it: along the line between them, which falls to the corners. */
  const ym = y - lipLine(ax) + 1.6168;
  // The brow over deep sockets, cheekbones and the hollow under them, the jaw's corners, the lips,
  // a square chin; the forehead leaning back over the brow. A soldier's face (the user, 2026-11-08).
  d +=
    f ** 2 *
    (-(0.013 - 0.003 * fem) * bell(ax - 0.032, 0.014) * bell(y - 1.69, 0.009) +
      (0.01 - 0.0055 * fem) * bell(ax - 0.03, 0.025) * bell(y - arcade(ax), 0.007) +
      (0.0065 - 0.001 * fem) * bell(ax - 0.048 + 0.002 * fem, 0.012) * bell(y - 1.668, 0.011) +
      (0.01 - 0.0025 * fem) *
        bell(ax - 0.056 + 0.005 * fem, 0.014 - 0.002 * fem) *
        bell(y - 1.598, 0.013) -
      (0.002 - 0.002 * fem) * bell(ax - 0.05, 0.012) * bell(y - 1.632, 0.01) +
      0.0026 * bell(x, 0.027) * bell(ym - 1.627, 0.007) +
      (0.0034 + 0.001 * fem) * bell(x, 0.026) * bell(ym - 1.6198, 0.0046) +
      (0.0026 + 0.001 * fem) * bell(x, 0.024) * bell(ym - 1.6112, 0.004) -
      0.001 * bell(x, 0.016) * bell(ym - 1.6025, 0.003) +
      0.0068 * bell(x, 0.033 - 0.01 * fem) * bell(y - 1.597, 0.012) -
      (0.003 - 0.0015 * fem) * step(1.715, 1.75, y));
  // The nostrils set in under the tip, the groove from the nose to the upper lip, the line between
  // the lips, and a fold each side from the nose's wing to the corner of the mouth. The lids are
  // pieces of their own (lid() in features.ts) and the look is the expression's (CH), not carved.
  const fold = clamp((1.653 - y) / 0.031);
  d +=
    f ** 4 *
    (-0.0022 * bell(ax - 0.006, 0.0022) * bell(y - 1.6495, 0.0022) -
      // The philtrum (the user, 2026-11-12): a groove from the nose to the upper lip's bow, a ridge each side of it.
      0.0034 * bell(x, 0.0034) * bell(y - PHILTRUM, 0.005) +
      0.0016 * bell(ax - 0.0066, 0.0024) * bell(y - PHILTRUM, 0.005) +
      // The upper lip's bow: a peak each side of its middle, a bead under the dip.
      0.0007 * bell(ax - 0.0065, 0.004) * bell(ym - 1.6232, 0.0022) +
      0.0006 * bell(x, 0.0045) * bell(ym - 1.6192, 0.002) -
      0.0015 * bell(x, 0.02) * bell(ym - 1.6168, 0.0012) -
      0.0016 *
        bell(ax - 0.014 - 0.014 * fold, 0.0028) *
        step(MOUTH_Y - 0.0028, MOUTH_Y + 0.0032, y) *
        (1 - step(1.651, 1.657, y)));
  return d;
};

// The brows are a colour of the skin along the brow ridge's arch (arcade()): over the eyes, thinner
// out to the tail, thinning into the skin at their edges, so they go where the skin goes. At rest
// they are level: the look is the expression's (CH.BROW_DOWN and the others).
/** A brow's middle line at x across and its half height there. */
export const browAt = (x: number) => [
  arcade(x) + 0.0015 - 0.015 * Math.max(0.02 - x, 0) + 0.0012 * fem,
  Math.max(
    (0.0044 - 0.0014 * fem) * clamp((x - 0.006 - 0.003 * fem) / 0.006) -
      0.09 * Math.max(x - 0.028, 0),
    0,
  ),
];

/**
 * The colour of the head at a point of it: a palette colour, a second one and how much of it (the
 * two blend, so the hairline, the beard and the lips have soft edges on any grid). Hair above the
 * hairline, the lips, the shaved beard, a flush on the cheeks and the nose.
 */
export const tint = (x: number, y: number, aq: number, fine: boolean): number[] => {
  // How far over the hairline, across it: where it runs down the temple a column is all hair or
  // none, and it is the blend between two columns that draws it straight.
  const run = (hairline(aq + 0.03) - hairline(Math.max(aq - 0.03, 0))) / (0.06 * 0.085);
  const h = clamp((y - hairline(aq)) / Math.hypot(1, run) / (fine ? 0.009 : 0.03) + 0.5);
  if (h >= 1) {
    return [HAIR, HAIR, 0];
  }
  if (!fine) {
    return [FLESH, HAIR, h];
  }
  const ax = Math.abs(x);
  // The shaved beard: under the nose and the cheekbones, along the jaw to the sideburns.
  const b =
    aq < 1.75
      ? clamp(
          Math.min(1.643 + 0.028 * clamp((aq - 0.35) / 0.95) - y, y - jaw(aq)[0] + 0.014) / 0.024,
        )
      : 0;
  if (aq < 1) {
    const [nx, ny] = [(ax - 0.006) / 0.0025, (y - 1.6498) / 0.0018];
    if (nx * nx + ny * ny < 1) {
      return [SHADE, SHADE, 0];
    }
    const dy = y - lipLine(ax);
    // The line's row; the lips' inner edges (close) a colour of their own, the lips' at rest and
    // the mouth's dark as it opens: the inside of the lips.
    if (Math.abs(dy) < 0.0009 && ax < MOUTH_X - 0.0015) {
      return Math.abs(dy) < 0.0003 ? [LINE, LINE, 0] : [INNER, INNER, 0];
    }
    // The lips: the upper one thinner, dipping at its middle, the lower one fuller; to nothing at the corners.
    // A bow on the upper one (two peaks, a dip between them, a long taper to the corner); the
    // lower one full across its middle, then quickly to the corner (the user, 2026-11-12).
    const u = Math.max(1 - (ax / MOUTH_X) ** 2, 0);
    const lip =
      dy > 0
        ? (0.0086 + 0.001 * fem) *
          (1 - 0.34 * bell(x, 0.0034) + 0.1 * bell(ax - 0.0068, 0.004)) *
          u ** 0.6
        : (0.0078 + 0.0014 * fem) * (1 - (ax / MOUTH_X) ** 3) ** 0.6 * u ** 0.2;
    const l = clamp((lip - Math.abs(dy)) / 0.0025);
    if (l > 0) {
      return [STUBBLE, LIP, l];
    }
  }
  if (h > 0) {
    return [FLESH, HAIR, h];
  }
  const [by, bh] = browAt(ax);
  const brow =
    clamp((bh - Math.abs(y - by)) / 0.003 + 0.25) * clamp((0.058 - ax) / 0.008) * +(aq < 1.2);
  if (brow > 0) {
    return [FLESH, BROW, Math.min(brow, 0.92)];
  }
  const groove = 0.65 * bell(x, 0.003) * bell(y - PHILTRUM, 0.0045) * +(aq < 1);
  if (b > 0) {
    return [FLESH, STUBBLE, Math.max(b, groove)];
  }
  // A flush: the cheeks, the tip of the nose.
  const f =
    0.55 * Math.exp(-(((ax - 0.046) / 0.02) ** 2) - ((y - 1.655) / 0.016) ** 2) +
    0.5 * bell(x, 0.012) * bell(y - 1.659, 0.01);
  return groove > 0.08 ? [FLESH, SHADE, groove] : [FLESH, BLUSH, aq < 1.6 ? Math.min(f, 0.7) : 0];
};

export const sgn = (v: number, e: number) => Math.sign(v) * Math.abs(v) ** (2 / e);
export const clamp = (v: number) => Math.min(Math.max(v, 0), 1);

/** How far out the face is (its z) at x across, height y: the carved surface, found by halving. */
export const onHead = (x: number, y: number) => {
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
