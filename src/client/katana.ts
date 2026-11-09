// The electric katana: a curved steel blade whose edge glows cyan, a round guard and a wrapped grip,
// built from rings, and the hands that cut with it: where the grip goes in each of the three cuts.
// Model space has the right hand's grip at the origin, x right, y up, the point toward -z (like
// gun.ts); place() carries it to the world. No DOM.
import { swingOf } from '../shared/blade';
import { CUTS, TICK_HZ } from '../shared/constants';
import type { PlayerState } from '../shared/types';
import { glow as lit, tri } from './flag';
import { button, grip } from './gun';
import { dim, place } from './mesh';
import type { Vec3 } from './mesh';
import { turn } from './rig';
import type { Quat } from './rig';

/** Where the blade starts and ends along the model's forward axis, metres from the right hand: a metre from the guard to the point. */
export const [BASE, TIP] = [0.07, 1.07];
/** How far the point is bent below the line of the blade's root. */
const SORI = 0.03;
/** Blade half height at its root: where it narrows, its middle rises, so that the point rides the spine side. */
const TALL = 0.019;
/** The left hand grips this far behind the right one: a gap between the two fists. */
export const BEHIND = 0.1;
/** The tilt between the grip and the hand's thumb: the blade rises off the forearm's line. */
export const [S, C] = [Math.sin(0.55), Math.cos(0.55)];

/** Sum of vectors, each times a number. */
const sum = (...t: [Vec3, number][]): Vec3 =>
  [0, 1, 2].map(i => t.reduce((s, [v, k]) => s + v[i] * k, 0)) as Vec3;
const cross = ([a, b, c]: Vec3, [d, e, f]: Vec3): Vec3 => [
  b * f - c * e,
  c * d - a * f,
  a * e - b * d,
];
const sgn = (v: number, e: number) => Math.sign(v) * Math.abs(v) ** e;
const rnd = (n: number) => {
  const x = Math.sin(n * 78.233) * 43758.5453;
  return x - Math.floor(x);
};
const clamp = (v: number, lo = 0, hi = 1) => Math.min(Math.max(v, lo), hi);

/** The y of the blade's middle at `f` ahead of the grip: it bends toward the spine, most at the point, the edge on the outside of the curve. */
const bend = (f: number) => SORI * ((f - BASE) / (TIP - BASE)) ** 2;

/** [share of the blade, half height, half thickness] from the root: it tapers to a point, the thickness too. */
const STATIONS = [
  [0, TALL, 0.0041],
  [0.07, TALL, 0.0041],
  [0.17, 0.0188, 0.0041],
  [0.31, 0.0183, 0.004],
  [0.44, 0.0178, 0.0039],
  [0.58, 0.0172, 0.0036],
  [0.71, 0.0166, 0.0034],
  [0.82, 0.016, 0.0031],
  [0.9, 0.015, 0.0026],
  [0.96, 0.0122, 0.0019],
  [0.984, 0.0074, 0.001],
  [1, 0, 0],
].map(([t, b, a]) => [BASE + (TIP - BASE) * t, b, a]);

/** A ring of `n` points about (x, y) at `f` ahead, a superellipse of exponent e. */
const circ = (f: number, x: number, y: number, a: number, b: number, n: number, e = 1): Vec3[] =>
  Array.from({ length: n }, (_, k) => [
    x + a * sgn(Math.cos((k * 2 * Math.PI) / n), e),
    y + b * sgn(Math.sin((k * 2 * Math.PI) / n), e),
    -f,
  ]);

/**
 * Appends the skin over `rings`, closed polygons one after the next (a ring of one point closes
 * an end), flat shaded: each facet is painted `paint(ring, side)` and faces away from the middle
 * of its two rings.
 */
const loft = (out: number[], rings: Vec3[][], paint: (i: number, k: number) => number[]) =>
  rings.slice(1).forEach((b, i) => {
    const a = rings[i];
    const all = [...a, ...b];
    const mid = sum(...all.map((p): [Vec3, number] => [p, 1 / all.length]));
    for (let k = 0; k < Math.max(a.length, b.length); k++) {
      const q = [a[k % a.length], a[(k + 1) % a.length], b[(k + 1) % b.length], b[k % b.length]];
      for (const [i0, i1, i2] of [
        [0, 1, 2],
        [0, 2, 3],
      ]) {
        const [p, r, s] = [q[i0], q[i1], q[i2]];
        const n = cross(sum([r, 1], [p, -1]), sum([s, 1], [p, -1]));
        if (Math.hypot(...n) < 1e-12) {
          continue;
        }
        const away = n[0] * (p[0] - mid[0]) + n[1] * (p[1] - mid[1]) + n[2] * (p[2] - mid[2]) > 0;
        tri(out, p, away ? r : s, away ? s : r, paint(i, k));
      }
    }
  });

const STEEL = [
  [0.7, 0.78, 0.9],
  [0.16, 0.2, 0.3],
  [0.07, 0.09, 0.14],
];
const GLOW = [0.5, 1.9, 2.3];
const WRAP = [
  [0.26, 0.09, 0.5],
  [0.06, 0.04, 0.12],
];
const IRON = [0.1, 0.09, 0.14];
const BRASS = [0.5, 0.4, 0.16];
const built: number[][] = [];

/**
 * The katana at a level of detail (0 far, 1 near), built once, in the vertex format of mesh.ts: the
 * blade (bevelled edge, a ridge, a spine, a point), a thin cyan glow along its edge, a collar, a
 * rounded-square guard, a grip wrapped in a violet check and a pommel with a glowing bead.
 */
export const katana = (lod: number): number[] => {
  if (built[lod]) {
    return built[lod];
  }
  const out: number[] = [];
  const st = STATIONS.filter((_, i) => lod || i % 2 == 0 || i == STATIONS.length - 1);
  // The blade's section: edge, ridge, spine, spine, ridge. Where it narrows its middle rises.
  const ring = ([f, b, a]: number[]): Vec3[] => {
    const y = bend(f) + (TALL - b) / 2;
    return [
      [0, y - b, -f],
      [a, y + 0.15 * b, -f],
      [0.6 * a, y + b, -f],
      [-0.6 * a, y + b, -f],
      [-a, y + 0.15 * b, -f],
    ];
  };
  loft(out, st.map(ring), (_, k) => STEEL[k % 4 == 0 ? 0 : k == 2 ? 2 : 1]);
  // The edge: a thin strip of light just under it.
  const from = out.length;
  loft(
    out,
    [
      ...st
        .slice(0, -1)
        .map(([f, b]) =>
          circ(f, 0, bend(f) + (TALL - b) / 2 - b - 0.0012, 0.0026, 0.0026, lod ? 5 : 3),
        ),
      [[0, bend(TIP) + TALL / 2, -TIP]],
    ],
    () => GLOW,
  );
  lit(out, from, 1);
  // Collar, guard, grip and pommel, each closed at both ends by a point.
  const cap = (f: number, y = 0): Vec3[] => [[0, y, -f]];
  const n = lod ? 8 : 5;
  loft(
    out,
    [
      cap(BASE - 0.026),
      ...[0.056, 0.066, 0.084].map(f => circ(f, 0, 0, 0.0066, 0.023, 6)),
      cap(0.084),
    ],
    () => BRASS,
  );
  const rim = (f: number, k: number) => circ(f, 0, 0, 0.038 * k, 0.038 * k, lod ? 16 : 8, 0.6);
  loft(
    out,
    [cap(0.05), rim(0.05, 0.9), rim(0.053, 1), rim(0.06, 1), rim(0.063, 0.9), cap(0.063)],
    () => IRON,
  );
  const rings = lod ? 20 : 9;
  loft(
    out,
    [
      cap(0.052),
      ...Array.from({ length: rings }, (_, i) => {
        const t = i / (rings - 1);
        // A little fuller in the middle than at its ends.
        const k = 1 + 0.1 * Math.sin(Math.PI * t);
        return circ(0.052 - 0.262 * t, 0, 0, 0.0114 * k, 0.0136 * k, n);
      }),
    ],
    (i, k) => WRAP[(i + k) & 1],
  );
  const pommel = (f: number) => circ(f, 0, 0, 0.013, 0.0154, n);
  loft(out, [cap(-0.202), pommel(-0.206), pommel(-0.218), cap(-0.22)], () => IRON);
  const bead = out.length;
  loft(out, [cap(-0.22), circ(-0.222, 0, 0, 0.006, 0.006, 5), cap(-0.23)], () => GLOW);
  lit(out, bead, 1);
  return (built[lod] = out);
};

/** Appends arcs of lightning flickering along the blade at the clock `t` (s): a few zigzags of thin crossed ribbons, each new every 70 ms. */
export const arcs = (out: number[], at: Vec3, [r, u, f]: Vec3[], t: number, lod: number, k = 1) => {
  const step = Math.floor(t * 14);
  const from = out.length;
  for (let a = 0; a < (lod ? 4 : 2); a++) {
    const h = (j: number) => rnd(step * 31 + a * 7 + j);
    if (h(0) < 0.3) {
      continue;
    }
    const len = 0.12 + 0.2 * h(2);
    const f0 = 0.12 + (TIP - 0.17 - len) * h(1);
    const P = Array.from({ length: 5 }, (_, j) => {
      const d = f0 + (len * j) / 4;
      const [x, y] = j ? [(h(3 + j) - 0.5) * 0.04, (h(8 + j) - 0.5) * 0.04] : [0, 0];
      return sum([at, 1], [r, x * k], [u, (y + bend(d) + 0.004) * k], [f, d * k]);
    });
    for (let j = 1; j < 5; j++) {
      for (const d of [r, u]) {
        const w = 0.0035 * k;
        const [p, q, s, v] = [
          sum([P[j - 1], 1], [d, -w]),
          sum([P[j - 1], 1], [d, w]),
          sum([P[j], 1], [d, w]),
          sum([P[j], 1], [d, -w]),
        ];
        tri(out, p, q, s, [0.7, 1.9, 2.4]);
        tri(out, p, s, v, [0.7, 1.9, 2.4]);
      }
    }
  }
  lit(out, from, 1);
};

/**
 * Appends the katana with its right-hand grip at `at`, axes `[right, up, forward]`, `k` times its
 * size; with the clock `t` (s) it crackles, once its glow is all on (`light`, 0 off to 1).
 */
export const sword = (
  out: number[],
  at: Vec3,
  ax: Vec3[],
  lod: number,
  t?: number,
  k = 1,
  light = 1,
  press = 0,
) => {
  const from = out.length;
  place(out, katana(lod), at, ax, [0, 0, 0], k);
  dim(out, from, 0.08 + 0.92 * light);
  const knob: number[] = [];
  button(knob, 1, press, light, [0.25, 0.9, 1]);
  place(out, knob, at, ax, [0, 0, 0], k);
  if (t !== undefined && light > 0.98) {
    arcs(out, at, ax, t, lod, k);
  }
};

/** The sword's axes [right, up, forward] for a hand turned by `q` (see body.ts): the back of the hand to its right, the blade off the thumb toward the fingers. */
export const axes = (q: Quat): Vec3[] => {
  const [th, back, fing] = [turn(q, [0, 0, -1]), turn(q, [1, 0, 0]), turn(q, [0, -1, 0])];
  return [back, sum([th, S], [fing, -C]), sum([th, C], [fing, S])];
};

/** Where the fingers point for a sword with axes `ax`: the inverse of axes(). */
export const fingers = ([, u, f]: Vec3[]): Vec3 => sum([f, S], [u, -C]);

/** The right and the left wrist for a sword with its right-hand grip at `at`: the left hand is BEHIND the right one, mirrored. */
export const wrists = (at: Vec3, ax: Vec3[]): Vec3[] => {
  const g = fingers(ax);
  return [
    sum([at, 1], [g, -0.078], [ax[0], 0.022]),
    sum([at, 1], [ax[2], -BEHIND], [g, -0.078], [ax[0], -0.022]),
  ];
};

/** Appends the katana held in the right hand at `pos` turned by `q`. */
export const held = (
  out: number[],
  pos: Vec3,
  q: Quat,
  lod: number,
  t?: number,
  k = 1,
  light = 1,
  press = 0,
) => sword(out, grip(pos, q), axes(q), lod, t, k, light, press);

/** The root of the blade and its point, in the world, for the hand at `pos` turned by `q`. */
export const ends = (pos: Vec3, q: Quat): Vec3[] => {
  const [at, [, u, f]] = [grip(pos, q), axes(q)];
  return [sum([at, 1], [f, BASE]), sum([at, 1], [f, TIP], [u, bend(TIP) + TALL / 2])];
};

/**
 * The cuts. Each is keys of [share of the swing, grip x, y, z, blade direction x, y, z] in the
 * camera’s space (right, up, forward), the guard first and last: a wind-up, the strike at its tick
 * (every cut passes the middle of the view there) and a follow-through, with the hands taking the
 * slope between their neighbours’ keys (fastest through the strike). The right hand holds the
 * grip, the left BEHIND it. In the guard the hands sit at the bottom of the view and the blade rises
 * ahead, leaning forward and to the left, so the view shows more blade than hands.
 */
/** The most the katana tips down with the look, radians: looking further down, it stays in the guard, upright before the body. */
export const BOW = 0.3;
/** The guard as the arms hold it: the hands low, the blade near upright. */
export const GUARD = [0.06, -0.25, 0.42, 0.14, 0.82, 0.55];
/**
 * The saber lock's hold, like GUARD: the hands up before the chest and the blade rising ahead,
 * leaning to the left, so that it crosses the foe's, which leans to his own left.
 */
export const LOCK = [0.03, -0.22, 0.45, -0.32, 0.8, 0.5];
/** The lock's hold shaking with the clock `t` (s), the hands out by `push` (0 to 1) of 6 cm: a press drives the blade on. */
export const locked = (t: number, push = 0): number[] => [
  LOCK[0] + 0.004 * Math.sin(t * 37),
  LOCK[1] + 0.004 * Math.sin(t * 43 + 1),
  LOCK[2] + 0.06 * push,
  ...LOCK.slice(3),
];
/** The share of cut `c`'s swing at which it strikes. */
const strikeAt = (c: number) => CUTS[c].strike / CUTS[c].ticks;
/** The middle of the shoulders in the keys' space, which turns with the chest. */
const SHOULDERS = [0, -0.17, -0.08];
/** The angle the locked wrists hold the blade at, above the line from the shoulders to the grip, all through a cut. */
const WRISTS = 1;
/**
 * The keys of a cut that the arms swing and the wrists do not (the user, 2026-11-08: "the arms and
 * the chest go with the cut, the wrists do not move"): [share, grip x, y, z] between the guards,
 * the blade added to each, WRISTS above the line from the shoulders to the grip, in the plane of
 * the cut rolled `roll` radians to the left of upright. The blade stays ahead in that plane; it
 * rises with the hands over the head and comes down as they drop, and never swings out to a side.
 */
const swung = (roll: number, keys: number[][]) => [
  [0, ...GUARD],
  ...keys.map(([s, x, y, z]) => {
    const n: Vec3 = [Math.cos(roll), Math.sin(roll), 0];
    const a: Vec3 = [x, y - SHOULDERS[1], z - SHOULDERS[2]];
    const o = sum([a, 1], [n, -a[0] * n[0] - a[1] * n[1]]);
    const l = sum([o, 1 / Math.hypot(...o)]);
    return [s, x, y, z, ...sum([l, Math.cos(WRISTS)], [cross(l, n), Math.sin(WRISTS)])];
  }),
  [1, ...GUARD],
];
/** A key of a cut turned round, left for right: the grip's x. */
const mirror = ([s, x, y, z]: number[]) => [s, -x, y, z];
/**
 * The cut from the left, on a diagonal: the hands drawn to the left with the blade raised over the
 * left shoulder, then down across the body, the blade through the middle of the view at the strike,
 * to low on the right with the point ahead. `k` of the way across on the far side.
 */
const ACROSS = (s: number, k = 1) => [
  [0.12, -0.14, -0.12, 0.44],
  [0.24, -0.26, -0.06, 0.4],
  [s - 0.07, -0.16, -0.1, 0.46],
  [s, 0.18 * k, -0.38, 0.4],
  [0.5, 0.22 * k, -0.46, 0.3],
  [0.62, 0.24 * k, -0.5, 0.2],
  [0.8, 0.16 * k, -0.4, 0.3],
];
/** The arc's cut from the left: the cut across wound up further out, on a wider diagonal. */
const DIAGONAL = (s: number, k = 1) => [
  [0.14, -0.16, -0.1, 0.42],
  [0.3, -0.3, -0.02, 0.36],
  [s - 0.07, -0.18, -0.08, 0.44],
  [s, 0.21 * k, -0.36, 0.4],
  [0.56, 0.22 * k, -0.46, 0.3],
  [0.68, 0.24 * k, -0.5, 0.2],
  [0.84, 0.2 * k, -0.4, 0.3],
];
/** Raised over the head, the blade upright, down through the middle to the hands low at the hips and the point ahead. */
const SLASH = (s: number) => [
  [0.14, 0.03, -0.06, 0.44],
  [0.28, 0.02, 0.2, 0.28],
  [0.34, 0.02, 0.06, 0.44],
  [s, 0, -0.45, 0.4],
  [0.52, 0, -0.62, 0.16],
  [0.64, 0, -0.64, 0.12],
];
/** How far the plane of a cut across leans, and the arc's. */
const [ROLL, WIDE] = [0.7, 0.85];
/** How far across the cuts from the right go on their far side, where the right arm reaches across the body. */
const FAR = 0.5;
const KEYS: number[][][] = [
  // Drawn back to the right hip, lunged out along the look with the arms straight, held a beat.
  [
    [0, ...GUARD],
    [0.3, 0.12, -0.16, 0.24, -0.08, 0.25, 1],
    [strikeAt(0), 0.04, -0.12, 0.38, -0.02, 0.1, 1],
    [strikeAt(0) + 0.2, 0.04, -0.12, 0.38, -0.02, 0.1, 1],
    [1, ...GUARD],
  ],
  swung(ROLL, ACROSS(strikeAt(1))),
  swung(-ROLL, ACROSS(strikeAt(2), FAR).map(mirror)),
  swung(0, SLASH(strikeAt(3))),
  // The lunge: drawn back deep to the hip, then the arms straight out on the point, held through
  // the throw forward.
  [
    [0, ...GUARD],
    [0.2, 0.13, -0.13, 0.26, -0.08, 0.3, 1],
    [strikeAt(4), 0.04, -0.12, 0.38, -0.02, 0.1, 1],
    [strikeAt(4) + 0.3, 0.04, -0.12, 0.38, -0.02, 0.1, 1],
    [1, ...GUARD],
  ],
  swung(WIDE, DIAGONAL(strikeAt(5))),
  swung(-WIDE, DIAGONAL(strikeAt(6), FAR).map(mirror)),
  // The leap: raised over the head as he jumps, held there to the top, then down on the foe as he
  // comes down, to the hands low and the point ahead.
  swung(0, [
    [0.12, 0.03, -0.04, 0.42],
    [0.3, 0.02, 0.2, 0.28],
    [0.55, 0.02, 0.2, 0.28],
    [strikeAt(7) - 0.07, 0.02, 0.04, 0.44],
    [strikeAt(7), 0, -0.45, 0.4],
    [0.8, 0, -0.62, 0.16],
    [0.9, 0, -0.64, 0.12],
  ]),
];

const NOW: number[] = [];

/** The keys `K` of [share, values...] at `p`, each value through its neighbours' slope (Catmull-Rom), into `out`. */
const through = (K: number[][], p: number, out: number[]): number[] => {
  let i = K.length - 2;
  while (i > 0 && K[i][0] > p) {
    i--;
  }
  const [a, b] = [K[i], K[i + 1]];
  const h = b[0] - a[0];
  const u = clamp((p - a[0]) / h);
  const [u2, u3] = [u * u, u * u * u];
  for (let j = 1; j < a.length; j++) {
    const m0 = i ? (b[j] - K[i - 1][j]) / (b[0] - K[i - 1][0]) : 0;
    const m1 = K[i + 2] ? (K[i + 2][j] - a[j]) / (K[i + 2][0] - a[0]) : 0;
    out[j - 1] =
      (2 * u3 - 3 * u2 + 1) * a[j] +
      (u3 - 2 * u2 + u) * h * m0 +
      (3 * u2 - 2 * u3) * b[j] +
      (u3 - u2) * h * m1;
  }
  return out;
};

/** The grip and the blade direction (x, y, z each) of cut `cut` at `p` of the swing: one array, rewritten by each call. */
export const stroke = (cut: number, p: number): number[] => through(KEYS[cut], p, NOW);

/**
 * How the trunk moves through each cut, so that the shoulders and the arms carry the blade and not
 * the forearms alone: keys of [share, twist, bend, lean] in radians, the twist turning the chest
 * to the left, the bend forward and the lean to the left; all 0 in the guard. It coils the way the
 * wind-up goes and unwinds through the strike: a cut from the left turns left, then hard to the
 * right; a slash arches back, then folds over; a thrust draws the right shoulder back, then drives
 * it out with a lean into the point.
 */
const ACROSS_TRUNK = (s: number) => [
  [0, 0, 0, 0],
  [0.12, 0.3, -0.04, 0.06],
  [0.24, 0.55, -0.06, 0.1],
  [s - 0.07, 0.32, 0, 0.04],
  [s, 0, 0.06, -0.04],
  [0.5, -0.45, 0.12, -0.1],
  [0.62, -0.55, 0.14, -0.12],
  [0.8, -0.25, 0.06, -0.04],
  [1, 0, 0, 0],
];
/** A key of the cut from the left turned round: the twist and the lean the other way. */
const other = (k: number[]) => [k[0], -k[1], k[2], -k[3]];
const SLASH_TRUNK = (s: number) => [
  [0, 0, 0, 0],
  [0.14, 0, -0.1, 0],
  [0.28, 0.04, -0.26, 0],
  [0.34, 0.04, -0.2, 0],
  [s, 0, 0.16, 0],
  [0.52, 0, 0.4, 0],
  [0.64, 0, 0.42, 0],
  [1, 0, 0, 0],
];
/** The arc's cut: the cut across coiled further, folding forward as it comes down. */
const DIAGONAL_TRUNK = (s: number) => [
  [0, 0, 0, 0],
  [0.14, 0.35, -0.08, 0.1],
  [0.3, 0.6, -0.14, 0.16],
  [s - 0.07, 0.4, -0.04, 0.1],
  [s, 0, 0.14, -0.06],
  [0.56, -0.5, 0.26, -0.14],
  [0.68, -0.58, 0.28, -0.14],
  [0.84, -0.25, 0.1, -0.05],
  [1, 0, 0, 0],
];
const TRUNK: number[][][] = [
  [
    [0, 0, 0, 0],
    [0.3, -0.32, -0.04, 0],
    [strikeAt(0), 0.36, 0.2, 0.04],
    [strikeAt(0) + 0.2, 0.36, 0.2, 0.04],
    [1, 0, 0, 0],
  ],
  ACROSS_TRUNK(strikeAt(1)),
  ACROSS_TRUNK(strikeAt(2)).map(other),
  SLASH_TRUNK(strikeAt(3)),
  [
    [0, 0, 0, 0],
    [0.2, -0.4, -0.06, 0],
    [strikeAt(4), 0.46, 0.3, 0.06],
    [strikeAt(4) + 0.3, 0.46, 0.3, 0.06],
    [1, 0, 0, 0],
  ],
  DIAGONAL_TRUNK(strikeAt(5)),
  DIAGONAL_TRUNK(strikeAt(6)).map(other),
  [
    [0, 0, 0, 0],
    [0.3, 0, -0.26, 0],
    [0.55, 0, -0.26, 0],
    [strikeAt(7) - 0.07, 0, -0.1, 0],
    [strikeAt(7), 0, 0.2, 0],
    [0.8, 0, 0.45, 0],
    [0.9, 0, 0.45, 0],
    [1, 0, 0, 0],
  ],
];
const BODY: number[] = [];

/** The trunk's [twist, bend, lean] (radians, see TRUNK) of cut `cut` at `p` of its swing: one array, rewritten by each call. */
export const trunk = (cut: number, p: number): number[] => through(TRUNK[cut], p, BODY);

/** The share of the trunk's twist the view turns with in the first person, and the runner's whole body. */
export const SWAY = 0.2;

/**
 * How far through its cut a player is, 0 to 1, or -1 when it is not cutting. `swing` counts down
 * in ticks, and the snapshots of the others come every second tick: the answer runs on with the
 * time, never more than two ticks ahead of the count, never behind it. `was` is the last answer.
 */
export const progress = (
  was: number,
  p: Pick<PlayerState, 'swing' | 'cut' | 'heavy' | 'charge'>,
  dt: number,
) => {
  const n = p.swing ?? 0;
  if (!n) {
    return -1;
  }
  const { ticks: t, hold } = CUTS[p.cut ?? 0];
  // A heavy release runs the rest of the cut from the top of its wind-up on its own, longer timer.
  const h = swingOf(p).ticks;
  const [at, rate] = p.heavy
    ? [(hold + (1 - n / h) * (t - hold)) / t, (t - hold) / (h * t)]
    : [1 - n / t, 1 / t];
  // Held at the top, charging: it waits there.
  if (!p.heavy && p.charge) {
    return at;
  }
  return was < 0 ? at : Math.min(Math.max(was + dt * TICK_HZ * rate, at), at + 2 * rate, 1);
};

/** How much wider a heavy release swings than its cut: the hands round the guard, and the trunk. */
export const [AMPLE, AMPLE_TRUNK] = [1.3, 1.5];

/**
 * The grip and the blade (see stroke()) of the cut `p` swings at `prog`, as drawn: a heavy
 * release goes AMPLE times as far from the guard, across and up; held at the top, charging, the hands tremble
 * with the clock `t` (s).
 */
export const poised = (
  p: Pick<PlayerState, 'cut' | 'heavy' | 'charge'>,
  prog: number,
  t: number,
) => {
  const k = stroke(p.cut ?? 0, prog);
  // Across and up only, and from the strike on: nearer the eye, or wider in the wind-up over the
  // shoulder, the arms would fill the view.
  const big = p.heavy ? 1 + (AMPLE - 1) * ample(p.cut ?? 0, prog) : 1;
  for (let j = 0; j < 2; j++) {
    k[j] = GUARD[j] + (k[j] - GUARD[j]) * big;
  }
  if (!p.heavy && p.charge) {
    k[0] += 0.004 * Math.sin(t * 47);
    k[1] += 0.004 * Math.sin(t * 53 + 1);
  }
  return k;
};

/** The trunk's twist, bend and lean (see trunk()) for the cut `p` swings at `prog`: AMPLE_TRUNK times a heavy release's, from its strike on. */
export const bent = (p: Pick<PlayerState, 'cut' | 'heavy'>, prog: number) =>
  trunk(p.cut ?? 0, prog).map(
    v => v * (p.heavy ? 1 + (AMPLE_TRUNK - 1) * ample(p.cut ?? 0, prog) : 1),
  );

/** How much of a heavy release's width is on at `prog` of cut `cut`: none in the wind-up, all from just before the strike. */
const ample = (cut: number, prog: number) => clamp((prog - strikeAt(cut) + 0.08) / 0.08);

/** Whether the blade is cutting at `p` of its swing: the wind-up, over by 0.22 to 0.27, and the recovery leave no trail. */
export const cutting = (p: number) => p > 0.24 && p < 0.6;
