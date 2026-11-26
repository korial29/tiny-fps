import { TAU } from '../../shared/physics';
import { sheet } from '../helmet';
import type { Spot } from '../helmet';
import { unit } from '../mesh';
import type { Vec3 } from '../mesh';
import { JOINT as J, turn } from '../rig';
import type { Quat } from '../rig';
import type { Out } from '../verts';
import { CHITIN_X, SIDES, on, smooth } from './common';
import { CLAW, CORD, DIM, SINEW, strand, tubed, windows } from './body';

/** Where the metatarsal (the foot) ends, from the ankle, in the foot joint's frame: longer than the rig's foot. */
export const FOOT_TIP: Vec3 = [0, -0.035, -0.25];

/** The three front toes: how far out to the side each goes (in widths of TOE_W) and its length. */
// Long and fine (the user, 2026-11-17: slimmer, more real feet).
export const TOES = [
  [-1, 0.125],
  [0, 0.15],
  [1, 0.125],
];
export const TOE_W = 0.027;

/**
 * Its foot on a foot joint (the user, 2026-11-15: an arched sole, tendons and toes): a round ankle
 * over the joint, which the shin's end sinks into, then the bone bowing up along its top into an
 * arch, a pad under the heel and one under the ball at its end (FOOT_TIP); three tendons stand out
 * over the instep from the ankle to the toes, where toes() carries them on to the claws. The pose
 * stands it near upright (prowl() in soldier.ts): a third segment to the leg.
 */
/**
 * strand(), its curve rounded (the user, 2026-11-17: the feet less angular): close, three more
 * rings between each two points on a smooth curve through them (smooth()), their radii between.
 */
export const rounded =
  (lod: number): typeof strand =>
  (out, at, q, pts, radii, ...rest) => {
    if (lod < 2 || pts.length < 3) {
      return strand(out, at, q, pts, radii, ...rest);
    }
    const fine = smooth(pts, (i, u) => radii[i] + ((radii[i + 1] ?? radii[i]) - radii[i]) * u);
    strand(
      out,
      at,
      q,
      fine.map(([p]) => p),
      fine.map(([, r]) => r),
      ...rest,
    );
  };
export const metatarsal = (out: Out, at: Vec3, q: Quat, lod: number) => {
  const soft = rounded(lod);
  const n = SIDES[2][lod];
  const [x, y, z] = FOOT_TIP;
  /** A point along the foot, k from the ankle (0) to the ball (1), lifted by the arch. */
  const along = (k: number, up = 0, side = 0): Vec3 => [
    x * k + side,
    // A plantar arch (the user, 2026-11-17): the bone bows well up between the heel and the ball.
    // (Past the ball, k over 1, the sine is negative: no power of it.)
    y * k + 0.042 * Math.max(Math.sin(Math.PI * k), 0) ** 0.8 + up,
    z * k,
  ];
  soft(
    out,
    at,
    q,
    [[0, 0.03, 0.03], [0, 0.005, 0.012], along(0.2), along(0.5), along(0.8), along(1)],
    // The ankle's ball just over the shin's end (thicker, it stood round it as a boot's cuff), then
    // the bone thinning evenly to the ball of the foot.
    // Lean (the user, 2026-11-17): a bone's thickness, swelling a little into the ball.
    [0.022, 0.033, 0.027, 0.021, 0.018, 0.022],
    n,
    CHITIN_X,
  );
  // The pads: the heel's behind and under the ankle, the ball's under the foot's end.
  soft(
    out,
    at,
    q,
    [
      [0, -0.012, 0.03],
      [0, -0.03, 0.005],
    ],
    [0.019, 0.012],
    n,
    CHITIN_X,
  );
  soft(out, at, q, [along(0.84, -0.012), along(1.02, -0.015)], [0.015, 0.019], n, CHITIN_X);
  // The cord under the arch, stretched straight from the heel's pad to the ball's: the hollow
  // between it and the bone is the arch.
  soft(
    out,
    at,
    q,
    [
      [0, -0.034, 0.004],
      [x * 0.5, y * 0.5 - 0.01, z * 0.5],
      [x * 0.9, y * 0.9 - 0.02, z * 0.9],
    ],
    [0.006, 0.0045, 0.006],
    SIDES[0][lod],
    SINEW,
  );
  // The ankle's two knobs, one each side of the joint.
  for (const k of [-1, 1]) {
    soft(
      out,
      at,
      q,
      [
        [k * 0.022, 0.012, 0.012],
        [k * 0.027, 0.0, 0.008],
      ],
      [0.011, 0.009],
      SIDES[0][lod],
      CHITIN_X,
      -1,
      true,
      [0, 0, 1],
    );
  }
  if (!lod) {
    return;
  }
  /** How high over the bone's middle its skin is, `side` out from it, where it is `r` thick. */
  const lie = (r: number, side: number) => Math.sqrt(Math.max(r * r - side * side, 0)) + 0.001;
  for (const [t] of TOES) {
    const w = t * 0.011;
    soft(
      out,
      at,
      q,
      [
        [w * 0.3, 0.025, -0.01],
        // On the bone's round, not over its corner: a tendon out at the side lies lower.
        along(0.35, lie(0.023, w * 0.8), w * 0.8),
        along(0.7, lie(0.019, w * 1.4), w * 1.4),
        along(1, lie(0.022, t * TOE_W * 0.4), t * TOE_W * 0.4),
      ],
      [0.004, 0.005, 0.005, 0.0045],
      SIDES[0][lod],
      SINEW,
    );
  }
};

/**
 * Its toes at the end of the foot (FOOT_TIP), level: three long digits splayed forward and a fourth,
 * short, behind. Each is two phalanges with a knuckle standing up between them, its tendon along
 * its top, and at its end a big hooked claw of bone curving down past the toe.
 */
export const toes = (out: Out, at: Vec3, q: Quat, lod: number) => {
  const soft = rounded(lod);
  // Round, not faceted (the user, 2026-11-17).
  const n = SIDES[2][lod];
  for (const [t, l] of [...TOES, [0, -0.05]]) {
    const s = t * TOE_W;
    const d = Math.sign(l);
    const p: Vec3[] = [
      [s * 0.4, 0.004, 0],
      [s * 0.75, 0.013, -l * 0.45],
      [s, 0.009, -l * 0.62],
      [s * 1.15, -0.002, -l],
    ];
    soft(out, at, q, p, [0.016, 0.012, 0.0115, 0.0085], n, CHITIN_X);
    // The knuckle, and the toe's pad under its end; far, the digit and its claw alone.
    if (lod) {
      soft(
        out,
        at,
        q,
        [
          [s * 0.72, 0.016, -l * 0.43],
          [s * 0.78, 0.016, -l * 0.5],
        ],
        [0.0125, 0.0105],
        n,
        CHITIN_X,
      );
      soft(
        out,
        at,
        q,
        [
          [s * 1.1, -0.008, -l * 0.87],
          [s * 1.15, -0.009, -l * 0.97],
        ],
        [0.009, 0.0075],
        n,
        CHITIN_X,
      );
    }
    if (lod && d > 0) {
      soft(
        out,
        at,
        q,
        [
          [s * 0.45, 0.019, -l * 0.05],
          [s * 0.76, 0.027, -l * 0.47],
          [s * 1.12, 0.009, -l * 0.95],
        ],
        [0.0045, 0.004, 0.0035],
        SIDES[0][lod],
        SINEW,
      );
    }
    const [tx, ty, tz] = p[3];
    soft(
      out,
      at,
      q,
      [
        [tx, ty + 0.006, tz + 0.008 * d],
        [tx * 1.03, ty + 0.012, tz - 0.03 * d],
        [tx * 1.07, ty + 0.004, tz - 0.062 * d],
        [tx * 1.1, ty - 0.022, tz - 0.085 * d],
      ],
      [0.0105, 0.008, 0.005, 0],
      n,
      CLAW,
    );
  }
};

/** Its tendons on a shin joint: the heel's cord down the back of the shin, and one down each side of its front. */
export const sinews = (out: Out, at: Vec3, q: Quat, lod: number) => {
  const n = SIDES[0][lod];
  strand(
    out,
    at,
    q,
    [
      [0, -0.1, 0.03],
      [0, -0.28, 0.032],
      [0, -0.43, 0.04],
    ],
    [0.012, 0.009, 0.011],
    n,
    SINEW,
  );
  for (const x of [-0.022, 0.022]) {
    strand(
      out,
      at,
      q,
      [
        [x, -0.14, -0.024],
        [x * 0.8, -0.3, -0.026],
        [x * 0.6, -0.42, -0.022],
      ],
      [0.007, 0.006, 0.007],
      n,
      SINEW,
    );
  }
  // A striated tube down the front of the shin (the user, 2026-11-16), between its two tendons.
  if (lod) {
    tubed(
      out,
      at,
      q,
      [
        [0, -0.06, -0.048],
        [0, -0.09, -0.056],
        [0, -0.15, -0.052],
        [0, -0.25, -0.046],
        [0, -0.35, -0.039],
        [0, -0.41, -0.03],
      ],
      [0.005, 0.009, 0.0095, 0.009, 0.008, 0.004],
      n,
    );
  }
};

/**
 * Its collarbones on the chest joint (the user, 2026-11-15: standing out, an exoskeleton), in the
 * ribs' chitin: from the notch over the breastbone forward and out, then back to a knob over each
 * shoulder.
 */
export const clavicles = (out: Out, at: Vec3, q: Quat, lod: number) => {
  // Sunk in the skin and close under the neck (the user, 2026-11-15: more a part of its body): a
  // ridge under it, rising out of it at the notch and going back into it at the shoulder.
  for (const s of [-1, 1]) {
    strand(
      out,
      at,
      q,
      (
        [
          [0.02, 0.208, -0.07],
          [0.036, 0.212, -0.08],
          [0.064, 0.217, -0.083],
          [0.097, 0.222, -0.072],
          [0.128, 0.225, -0.052],
          [0.15, 0.226, -0.032],
          [0.166, 0.226, -0.012],
        ] as Vec3[]
      ).map(([x, y, z]): Vec3 => [s * x, y - 0.003, z + 0.004]),
      // Thinner and deeper: a rod lying on the shoulder, it read as a pipe.
      [0.003, 0.006, 0.0085, 0.0085, 0.0085, 0.0075, 0.003],
      SIDES[1][lod],
      SINEW,
      -1,
      true,
      [0, 1, 0],
    );
  }
};

/**
 * Curved horns out of its back (the user, 2026-11-15): a pair on a joint, each from beside the spine
 * out of the back near square to it and well out to the side, clear of the head, curling up a little, `len` long and `r` thick at its root, at `base` (the right
 * one) in the joint's frame.
 */
export const horns = (
  out: Out,
  at: Vec3,
  q: Quat,
  lod: number,
  base: Vec3,
  len: number,
  r: number,
) => {
  for (const s of [-1, 1]) {
    const pts = Array.from({ length: 7 }, (_, i): Vec3 => {
      const t = i / 6;
      return [
        s * (base[0] + len * 0.66 * t),
        base[1] + len * (0.02 * t + 0.22 * t * t),
        base[2] + len * (0.72 * t - 0.1 * t * t),
      ];
    });
    strand(
      out,
      at,
      q,
      pts,
      pts.map((_, i) => r * (1 - i / 6) ** 0.85 + 0.0012),
      SIDES[1][lod],
      CHITIN_X,
      -1,
      true,
      [0, 1, 0],
    );
  }
};
/** The three pairs of horns: the joint, the root, the length and thickness, small low, large high. */
export const HORNS: [number, Vec3, number, number][] = [
  [J.SPINE, [0.09, 0.02, 0.062], 0.13, 0.014],
  [J.CHEST, [0.1, -0.03, 0.085], 0.2, 0.019],
  [J.CHEST, [0.105, 0.09, 0.083], 0.3, 0.025],
];

/** A spur of bone on a joint: from `base` along `dir` (in its frame), `len` long, `r` thick at its root. */
export const spur = (
  out: Out,
  at: Vec3,
  q: Quat,
  base: Vec3,
  dir: Vec3,
  len: number,
  r: number,
  n: number,
  hook = 0.016,
) => {
  const d = unit(dir);
  // The horns' taper and a curve down to the point: every spike of its body one family, in its
  // chitin (bone is for the claws and the teeth).
  const pts = Array.from({ length: 5 }, (_, i): Vec3 => {
    const k = i / 4;
    return [
      base[0] + d[0] * len * k,
      base[1] + d[1] * len * k - hook * k * k,
      base[2] + d[2] * len * k,
    ];
  });
  strand(
    out,
    at,
    q,
    pts,
    pts.map((_, i) => r * (1 - i / 4) ** 0.85 + 0.0008),
    n,
    CHITIN_X,
    -1,
    true,
    // Off the spike's way, so its rings never pinch.
    Math.abs(d[0]) > 0.7 ? [0, 1, 0] : [1, 0, 0],
  );
};

/** Its spurs: one out of the back of each elbow (a forearm joint), one out of the back of each ankle (a shin joint). */
export const elbow = (out: Out, at: Vec3, q: Quat, lod: number) => {
  spur(out, at, q, [0, -0.02, 0.03], [0, 0.45, 1], 0.12, 0.016, SIDES[1][lod]);
  // A striated tube down the back of the forearm (the user, 2026-11-16), out of the skin under the
  // spur and back into it over the wrist.
  if (lod) {
    tubed(
      out,
      at,
      q,
      [
        [0, -0.05, 0.036],
        [0, -0.08, 0.044],
        [0, -0.12, 0.044],
        [0, -0.16, 0.039],
        [0, -0.2, 0.033],
        [0, -0.22, 0.026],
      ],
      [0.005, 0.0085, 0.009, 0.0085, 0.007, 0.004],
      SIDES[0][lod],
      [1, 0, 0],
      DIM,
    );
  }
};
/**
 * A forearm's window (the user's picture, 2026-11-17: only on the forearm's visible face), on the
 * forearm joint of side `s` (1 the right): one down its outside, elbow to wrist, 26 cm, a little
 * sunk in the skin's rough shape so no gap shows (a little clipping is fine).
 */
export const forearm = (out: Out, at: Vec3, q: Quat, lod: number, s: number) =>
  windows(
    out,
    at,
    q,
    lod,
    [[-0.7, 0.14, 0.86, 0.014]],
    (t, a, off) => [
      s * (0.032 - 0.009 * t + off) * Math.cos(a),
      -0.26 * t,
      (0.036 - 0.009 * t + off) * Math.sin(a),
    ],
    0.034,
    DIM,
    CORD,
  );
export const heel = (out: Out, at: Vec3, q: Quat, lod: number) =>
  spur(out, at, q, [0, -0.4, 0.035], [0, 0.35, 1], 0.09, 0.014, SIDES[1][lod]);

/**
 * The disc at the top of its arm (the user, 2026-11-16: where the shoulder ends and the arm
 * begins), on the arm's swing (its joint without its twist, as the skin's top is), `s` 1 the right
 * arm: a full disc slanting through the shoulder, thin with a rounded rim and low domed faces,
 * its rim fading into the skin toward the armpit.
 */
export const cuff = (out: Out, at: Vec3, q: Quat, lod: number, s: number) => {
  if (!lod) {
    return;
  }
  const n = [8, 20, 24, 36][lod];
  // Set in the round of the shoulder at 45 degrees (the user, 2026-11-16): its plane through the
  // humerus' head, slanting from the armpit up over the point of the shoulder; `ax` square to it,
  // out and down, `e1` in it, out and up, `e2` front to back.
  const ax: Vec3 = [s * Math.SQRT1_2, -Math.SQRT1_2, 0];
  const e1: Vec3 = [s * Math.SQRT1_2, Math.SQRT1_2, 0];
  const e2: Vec3 = [0, 0, 1];
  // The shoulder's section in that plane: its middle, half width (along e1) and half depth.
  const [c, rx, rz]: [Vec3, number, number] = [[s * -0.024, 0.0, 0.0], 0.054, 0.058];
  // Across it, out along `ax`: [offset, scale of the section].
  // A full disc (the user, 2026-11-16: the circle filled): a low dome closes each face.
  // Thicker and wider (the user, 2026-11-16).
  const PROFILE = Array.from({ length: 13 }, (_, i) => {
    const a = (Math.PI * i) / 12;
    return [-0.027 * Math.cos(a), 1.41 * Math.sin(a) ** 0.55];
  });

  const R = (rx + rz) / 2;
  const rows = PROFILE.map(([h0, k0], i): Spot[] => {
    const [a, b] = [PROFILE[Math.max(i - 1, 0)], PROFILE[Math.min(i + 1, PROFILE.length - 1)]];
    const [dh, dk] = [b[0] - a[0], (b[1] - a[1]) * R];
    const l = Math.hypot(dh, dk) || 1;
    if (!k0) {
      const p: Vec3 = [0, 1, 2].map(x => c[x] + ax[x] * h0) as Vec3;
      return [[on(at, q, p), turn(q, h0 > 0 ? ax : (ax.map(v => -v) as Vec3))]];
    }
    return Array.from({ length: n }, (_, j): Spot => {
      const t = (j / n) * TAU;
      const [cs, sn] = [Math.cos(t), Math.sin(t)];
      // Down toward the armpit it fades back into the skin: there it cut through the chest.
      const v = Math.min(Math.max((-cs - 0.1) / 0.6, 0), 1);
      const fade = v * v * (3 - 2 * v);
      const k = k0 > 0.92 ? k0 + (0.92 - k0) * fade : k0;
      const h = h0 * (1 - fade);
      const p: Vec3 = [0, 1, 2].map(
        x => c[x] + e1[x] * rx * k * cs + e2[x] * rz * k * sn + ax[x] * h,
      ) as Vec3;
      const nr = unit([0, 1, 2].map(x => (e1[x] * cs) / rx + (e2[x] * sn) / rz) as Vec3);
      const m = unit([0, 1, 2].map(x => (nr[x] * dh - ax[x] * dk) / l) as Vec3);
      return [on(at, q, p), turn(q, m)];
    });
  });
  sheet(rows, CHITIN_X, -1, out);
};
