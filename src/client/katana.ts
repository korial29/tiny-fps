// The electric katana: a curved steel blade whose edge glows cyan, a round guard and a wrapped grip,
// built from rings, and the hands that cut with it: where the grip goes in each of the three cuts.
// Model space has the right hand's grip at the origin, x right, y up, the point toward -z (like
// gun.ts); place() carries it to the world. No DOM.
import { CUTS, TICK_HZ } from '../shared/constants';
import type { PlayerState } from '../shared/types';
import { glow as lit, tri } from './flag';
import { grip } from './gun';
import { dot, place, unit } from './mesh';
import type { Vec3 } from './mesh';
import { turn } from './rig';
import type { Quat } from './rig';

/** Where the blade starts and ends along the model's forward axis, metres from the right hand. */
export const [BASE, TIP] = [0.07, 0.812];
/** How far the point is bent below the line of the blade's root. */
const SORI = 0.022;
/** Blade half height at its root: where it narrows, its middle rises, so that the point rides the spine side. */
const TALL = 0.0155;
/** The left hand grips this far behind the right one. */
const BEHIND = 0.095;
/** The tilt between the grip and the hand's thumb: the blade rises off the forearm's line. */
const [S, C] = [Math.sin(0.55), Math.cos(0.55)];

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

/** The y of the blade's middle at `f` ahead of the grip: it bends toward the edge, most at the point. */
const bend = (f: number) => -SORI * ((f - BASE) / (TIP - BASE)) ** 2;

/** [ahead, half height, half thickness] along the blade: it tapers to a point, the thickness too. */
const STATIONS = [
  [BASE, TALL, 0.0034],
  [0.12, TALL, 0.0034],
  [0.2, 0.0153, 0.0034],
  [0.3, 0.0149, 0.0033],
  [0.4, 0.0145, 0.0032],
  [0.5, 0.014, 0.003],
  [0.6, 0.0135, 0.0028],
  [0.68, 0.013, 0.0026],
  [0.74, 0.0122, 0.0022],
  [0.78, 0.01, 0.0016],
  [0.8, 0.006, 0.0008],
  [TIP, 0, 0],
];

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
      ...[0.056, 0.066, 0.084].map(f => circ(f, 0, 0, 0.0052, 0.0185, 6)),
      cap(0.084),
    ],
    () => BRASS,
  );
  const rim = (f: number, k: number) => circ(f, 0, 0, 0.036 * k, 0.036 * k, lod ? 16 : 8, 0.6);
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
        return circ(0.052 - 0.212 * t, 0, 0, 0.0108 * k, 0.0128 * k, n);
      }),
    ],
    (i, k) => WRAP[(i + k) & 1],
  );
  const pommel = (f: number) => circ(f, 0, 0, 0.0125, 0.0145, n);
  loft(out, [cap(-0.152), pommel(-0.156), pommel(-0.168), cap(-0.17)], () => IRON);
  const bead = out.length;
  loft(out, [cap(-0.17), circ(-0.172, 0, 0, 0.006, 0.006, 5), cap(-0.18)], () => GLOW);
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
    const len = 0.1 + 0.15 * h(2);
    const f0 = 0.12 + (0.67 - len) * h(1);
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
 * size; with the clock `t` (s) it crackles.
 */
export const sword = (out: number[], at: Vec3, ax: Vec3[], lod: number, t?: number, k = 1) => {
  place(out, katana(lod), at, ax, [0, 0, 0], k);
  if (t !== undefined) {
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
export const held = (out: number[], pos: Vec3, q: Quat, lod: number, t?: number, k = 1) =>
  sword(out, grip(pos, q), axes(q), lod, t, k);

/** The root of the blade and its point, in the world, for the hand at `pos` turned by `q`. */
export const ends = (pos: Vec3, q: Quat): Vec3[] => {
  const [at, [, u, f]] = [grip(pos, q), axes(q)];
  return [sum([at, 1], [f, BASE]), sum([at, 1], [f, TIP], [u, bend(TIP) + TALL / 2])];
};

/**
 * The axes [right, up, forward] in the camera's space (right, up, forward: a mirror of the world's)
 * for a blade along `d`, rolled by `roll` about it: right as near (cos, sin, 0) as it can be, up
 * forward cross right, so that the frame is a proper turn whichever way the blade points.
 */
export const frameOf = (d: Vec3, roll: number): Vec3[] => {
  const f = unit(d);
  const s: Vec3 = [Math.cos(roll), Math.sin(roll), 0];
  const r = unit(sum([s, 1], [f, -dot(s, f)]));
  return [r, cross(f, r), f];
};

/**
 * The cuts. Each is keys of [share of the swing, grip x, y, z, blade direction x, y, z, roll] in
 * the camera's space (right, up, forward), the guard first, and the same guard last: a wind-up,
 * the strike at its tick (every cut passes the middle of the view there, the point 81 cm from
 * the grip) and a follow-through, with the hand taking the slope between its neighbours' keys
 * (fastest through the strike). The right hand holds the grip, the left 9.5 cm behind it.
 */
export const GUARD = [0.14, -0.28, 0.4, -0.03, 0.5, 0.865, 0];
/** The share of cut `c`'s swing at which it strikes. */
const strikeAt = (c: number) => CUTS[c].strike / CUTS[c].ticks;
const ACROSS = (s: number) => [
  [0, ...GUARD],
  [0.22, 0, -0.2, 0.34, -0.65, 0.12, 0.75, 0.5],
  [s, 0.08, -0.17, 0.43, 0, 0.17, 0.985, 1],
  [0.5, 0.2, -0.2, 0.38, 0.8, 0.1, 0.6, 1.1],
  [1, ...GUARD],
];
const KEYS: number[][][] = [
  [
    [0, ...GUARD],
    [strikeAt(0) / 2, 0.2, -0.4, 0.24, -0.1, 0.4, 0.91, 0],
    [strikeAt(0), 0.06, -0.14, 0.42, -0.075, 0.175, 0.98, 0],
    [strikeAt(0) + 0.15, 0.06, -0.15, 0.44, -0.075, 0.175, 0.98, 0],
    [1, ...GUARD],
  ],
  ACROSS(strikeAt(1)),
  // The cut from the right is the cut from the left in a mirror.
  ACROSS(strikeAt(2)).map((k, i, all) =>
    i && i < all.length - 1 ? [k[0], 0.24 - k[1], k[2], k[3], -k[4], k[5], k[6], -k[7]] : k,
  ),
  [
    [0, ...GUARD],
    [0.27, 0.1, 0, 0.3, 0.08, 0.86, 0.5, 0],
    [strikeAt(3), 0.07, -0.14, 0.42, 0, 0.17, 0.985, 0],
    [0.55, 0.1, -0.3, 0.4, 0, -0.42, 0.9, 0],
    [1, ...GUARD],
  ],
];
const NOW: number[] = [];

/** The grip and the blade direction (x, y, z each) and the roll of cut `cut` at `p` of the swing: one array, rewritten by each call. */
export const stroke = (cut: number, p: number): number[] => {
  const K = KEYS[cut];
  let i = K.length - 2;
  while (i > 0 && K[i][0] > p) {
    i--;
  }
  const [a, b] = [K[i], K[i + 1]];
  const h = b[0] - a[0];
  const u = clamp((p - a[0]) / h);
  const [u2, u3] = [u * u, u * u * u];
  for (let j = 1; j < 8; j++) {
    const m0 = i ? (b[j] - K[i - 1][j]) / (b[0] - K[i - 1][0]) : 0;
    const m1 = K[i + 2] ? (K[i + 2][j] - a[j]) / (K[i + 2][0] - a[0]) : 0;
    NOW[j - 1] =
      (2 * u3 - 3 * u2 + 1) * a[j] +
      (u3 - 2 * u2 + u) * h * m0 +
      (3 * u2 - 2 * u3) * b[j] +
      (u3 - u2) * h * m1;
  }
  return NOW;
};

/**
 * How far through its cut a player is, 0 to 1, or -1 when it is not cutting. `swing` counts down
 * in ticks, and the snapshots of the others come every second tick: the answer runs on with the
 * time, never more than two ticks ahead of the count, never behind it. `was` is the last answer.
 */
export const progress = (was: number, p: Pick<PlayerState, 'swing' | 'cut'>, dt: number) => {
  const n = p.swing ?? 0;
  if (!n) {
    return -1;
  }
  const t = CUTS[p.cut ?? 0].ticks;
  const at = 1 - n / t;
  return was < 0 ? at : Math.min(Math.max(was + (dt * TICK_HZ) / t, at), at + 2 / t, 1);
};

/** Whether the blade is cutting at `p` of its swing: the wind-up and the recovery leave no trail. */
export const cutting = (p: number) => p > 0.12 && p < 0.6;
