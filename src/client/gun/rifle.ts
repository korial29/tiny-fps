// The laser rifle: its housing and its model.
import { TAU } from '../../shared/physics';
import { add, sub, unit } from '../mesh';
import type { Vec3 } from '../mesh';
import type { Out } from '../verts';
import { clamp, tube } from './loft';
import type { Paint, Station } from './loft';
import { GLOW, chrome, shade, steel } from './paint';

/**
 * The rifle's housing (the user, 2026-11-08): a block of one trapezoid section, wide at its foot in
 * the body, a little narrower at its top, the top corners rounded a little: forward, the height of
 * its top, half its width at the foot and at the top. Its foot is HOUSING_FOOT high, and its back
 * a flat face sloping up and forward from the foot by HOUSING_SLOPE (forward per up), which
 * carries the counter.
 */
const HOUSING: number[][] = [
  [-0.07, 0.135, 0.022, 0.016],
  [0.05, 0.134, 0.022, 0.016],
  [0.2, 0.128, 0.021, 0.015],
  [0.33, 0.118, 0.019, 0.013],
  [0.42, 0.108, 0.016, 0.011],
  [0.47, 0.1, 0.013, 0.008],
  [0.495, 0.093, 0.009, 0.005],
];
export const [HOUSING_FOOT, HOUSING_BACK, HOUSING_SLOPE] = [0.085, -0.115, 0.8];

/** Appends the housing: its sides, its top and its two ends, in polished grey metal, the normals smooth round the top corners. */
export const housing = (out: Out, lod: number) => {
  const r = 0.003;
  const turns = lod ? 4 : 1;
  /** One section at `f`: its outline from the right foot up, over the top, down to the left foot, in model space. */
  const ring = ([f, top, wb, wt]: number[], back: boolean): Vec3[] => {
    const pts: [number, number][] = [[wb, HOUSING_FOOT]];
    // The rounded top corners, right then left.
    for (const s of [1, -1]) {
      for (let k = 0; k <= turns; k++) {
        const a = ((s > 0 ? k : turns - k) / turns) * (Math.PI / 2);
        pts.push([s * (wt - r + r * Math.cos(a)), top - r + r * Math.sin(a)]);
      }
    }
    pts.push([-wb, HOUSING_FOOT]);
    // On the back, each point lies on the sloping face.
    return pts.map(([x, y]) => [
      x,
      y,
      -(back ? HOUSING_BACK + HOUSING_SLOPE * (y - HOUSING_FOOT) : f),
    ]);
  };
  const rings = [ring(HOUSING[0], true), ...HOUSING.map(h => ring(h, false))];
  const quad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3) => {
    for (const [p, q, w] of [
      [a, b, c],
      [a, c, d],
    ]) {
      const [u, v] = [sub(q, p), sub(w, p)];
      const n = unit([
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0],
      ]);
      for (const x of [p, q, w]) {
        out.push(...x, ...n, ...chrome(x, n));
      }
    }
  };
  for (let k = 1; k < rings.length; k++) {
    for (let i = 1; i < rings[k].length; i++) {
      quad(rings[k - 1][i - 1], rings[k][i - 1], rings[k][i], rings[k - 1][i]);
    }
  }
  // The two ends: a fan from the middle of each.
  for (const [e, flip] of [
    [rings[0], true],
    [rings[rings.length - 1], false],
  ] as [Vec3[], boolean][]) {
    const c = e.reduce((m, p) => add(m, p.map(v => v / e.length) as Vec3), [0, 0, 0] as Vec3);
    for (let i = 1; i < e.length; i++) {
      quad(c, flip ? e[i] : e[i - 1], flip ? e[i - 1] : e[i], c);
    }
  }
};

/** The rifle's body from the butt to the end, as tube stations: forward, the middle's height, half its width and half its height. */
const PROFILE: Station[] = [
  [-0.336, 0.036, 0.024, 0.048],
  [-0.326, 0.035, 0.031, 0.058],
  [-0.2, 0.04, 0.033, 0.058],
  [0, 0.048, 0.033, 0.05],
  [0.2, 0.056, 0.03, 0.04],
  [0.32, 0.063, 0.027, 0.032],
  [0.39, 0.071, 0.024, 0.024],
  [0.44, 0.077, 0.021, 0.018],
  [0.48, 0.079, 0.02, 0.016],
  [0.497, 0.079, 0.017, 0.013],
];

/** The laser rifle's muzzle, the lens at the end of its shroud, and the middle of its handguard, the block under its body that the left hand carries. */
export const RIFLE_MUZZLE: Vec3 = [0, 0.079, -0.512];
export const RIFLE_GRIP: Vec3 = [0, -0.008, -0.14];
/** The handguard's half width and half height, and how much it rises forward, as the body's underside does. */
export const GUARD: [number, number] = [0.03, 0.022];
export const RIFLE_RISE = 0.096;
/** The mouth of the grenade launcher, out of the front of the handguard: in the gun's space like RIFLE_MUZZLE. */
export const NADE_MUZZLE: Vec3 = [0, RIFLE_GRIP[1] + RIFLE_RISE * 0.118, RIFLE_GRIP[2] - 0.118];
/**
 * How the left hand carries the handguard (the user, 2026-11-10: the fist closed beside it): where
 * the block's middle is from the wrist, along the fingers and toward the palm (FIST's, in body.ts),
 * so that the block lies in the palm and the fingers stand up its right side; the fingers
 * square across it, as [sin, cos] of their lean; and how closed they are, a cup, not a fist.
 */
export const RIFLE_HOLD = [0.065, 0.042];
export const RIFLE_TILT = [0, 1];
export const RIFLE_CURL = 0.45;
/** The red of the laser, which blooms. */
export const LASER = [2.6, 0.55, 0.22];
export const red: Paint = () => [LASER[0], LASER[1], -2, LASER[2]];
/** Dark olive gunmetal, lighter on its top faces. */
export const olive = shade([0.05, 0.055, 0.05], [0.34, 0.36, 0.32]);
export const rifled: number[][] = [];

/** Linear between the rows of `rows` (sorted by their first column) at `f`. */
export const along = (rows: number[][], f: number): number[] => {
  const j = rows.findIndex(r => r[0] > f);
  const i = j < 0 ? rows.length - 1 : Math.max(j, 1);
  const [a, b] = [rows[i - 1], rows[i]];
  return a.map((v, k) => v + (b[k] - v) * clamp((f - a[0]) / (b[0] - a[0])));
};
/** Near-black for the grooves and slots, a bright lip under them, and three LEDs that bloom. */
export const slot = shade([0.015, 0.015, 0.02], [0.05, 0.05, 0.06]);
export const lip = shade([0.4, 0.42, 0.45], [0.9, 0.92, 0.95]);
const LEDS = [LASER, [1.8, 0.9, 0.1], GLOW];

/**
 * The rifle's small details (the user, 2026-11-09: grooves along it, screw heads, a little
 * electronics), on the near model only: two grooves along the top of the housing and one along each
 * side with a bright lip under it, cross-head screws on the housing and the body, a dark panel of
 * three LEDs on each side of the housing at the back, and a vent of five slots on each side of the butt.
 */
/** A flat quad `q` facing `n`, painted. */
export const flat = (out: Out, q: Vec3[], n: Vec3, paint: Paint) => {
  for (const t of [
    [q[0], q[1], q[2]],
    [q[0], q[2], q[3]],
  ]) {
    for (const p of t) {
      out.push(...p, ...n, ...paint(p, n));
    }
  }
};
/** A rectangle on a surface: `at(u, v)` the point `u` along and `v` across it. */
export const rect = (
  out: Out,
  at: (u: number, v: number) => Vec3,
  u0: number,
  u1: number,
  v0: number,
  v1: number,
  n: Vec3,
  paint: Paint,
) => {
  // In pieces of 2 cm at most along it, so that it follows a curved surface.
  const k = Math.ceil(Math.abs(u1 - u0) / 0.02);
  for (let i = 0; i < k; i++) {
    const [a, b] = [u0 + ((u1 - u0) * i) / k, u0 + ((u1 - u0) * (i + 1)) / k];
    flat(out, [at(a, v0), at(b, v0), at(b, v1), at(a, v1)], n, paint);
  }
};
/** A cross-head screw at `c` on a surface of normal `n`, `e` and `w` across it, `k` times the rifle's. */
export const screw = (out: Out, c: Vec3, e: Vec3, w: Vec3, n: Vec3, k = 1) => {
  const p = (a: number, b: number, d: number): Vec3 =>
    [0, 1, 2].map(i => c[i] + (e[i] * a + w[i] * b) * k + n[i] * d) as Vec3;
  for (let k = 0; k < 10; k++) {
    const [a, b] = [k, k + 1].map(j => (j * TAU) / 10);
    for (const [r, d, paint] of [
      [0.0034, 0.0003, slot],
      [0.0026, 0.0006, steel],
    ] as const) {
      flat(
        out,
        [
          p(0, 0, d),
          p(r * Math.cos(a), r * Math.sin(a), d),
          p(r * Math.cos(b), r * Math.sin(b), d),
          p(0, 0, d),
        ],
        n,
        paint,
      );
    }
  }
  rect(out, (u, v) => p(u, v, 0.0008), -0.0019, 0.0019, -0.0003, 0.0003, n, slot);
  rect(out, (u, v) => p(v, u, 0.0008), -0.0019, 0.0019, -0.0003, 0.0003, n, slot);
};

export const details = (out: Out) => {
  /** The housing's side `s` at `f` and `y`, `d` out of it, and its normal. */
  const side = (s: number, f: number, y: number, d = 0.0003): Vec3 => {
    const [, top, wb, wt] = along(HOUSING, f);
    return [s * (wb + ((wt - wb) * (y - HOUSING_FOOT)) / (top - HOUSING_FOOT) + d), y, -f];
  };
  const sideN = (s: number): Vec3 => unit([s, 0.12, 0]);
  /** The body's side `s` at `f`, `h` up from its middle line, `d` out of it. */
  const flank = (s: number, f: number, h: number, d = 0.0004): Vec3 => {
    const [, y, a, b] = along(PROFILE as number[][], f);
    return [s * (a * (1 - Math.abs(h / b) ** 2.5) ** 0.4 + d), y + h, -f];
  };
  const up: Vec3 = [0, 1, 0];
  for (const x of [-0.008, 0.008]) {
    rect(
      out,
      (f, v) => [x + v, along(HOUSING, f)[1] + 0.0003, -f],
      -0.05,
      0.4,
      -0.0006,
      0.0006,
      up,
      slot,
    );
    rect(
      out,
      (f, v) => [x + v, along(HOUSING, f)[1] + 0.0003, -f],
      -0.05,
      0.4,
      0.0006,
      0.0011,
      up,
      lip,
    );
  }
  screw(out, [0, 0.1353, 0.045], [1, 0, 0], [0, 0, 1], up);
  for (const s of [-1, 1]) {
    const n = sideN(s);
    rect(out, (f, h) => side(s, f, along(HOUSING, f)[1] - h), 0.02, 0.36, 0.0085, 0.0097, n, slot);
    rect(out, (f, h) => side(s, f, along(HOUSING, f)[1] - h), 0.02, 0.36, 0.0097, 0.0103, n, lip);
    for (const f of [0.03, 0.3]) {
      screw(out, side(s, f, along(HOUSING, f)[1] - 0.017), [0, 0, 1], [0, 1, 0], n);
    }
    // The LED panel at the back of the housing's side.
    rect(out, (f, y) => side(s, f, y), -0.06, -0.025, 0.112, 0.124, n, slot);
    LEDS.forEach((c, i) => {
      const f = -0.053 + i * 0.011;
      rect(
        out,
        (f, y) => side(s, f, y, 0.0006),
        f - 0.0018,
        f + 0.0018,
        0.1162,
        0.1198,
        n,
        () => [c[0], c[1], -2, c[2]],
      );
    });
    // Screws on the body, under the red strip; a vent of slots on the butt.
    const fn: Vec3 = [s, 0, 0];
    for (const f of [-0.27, 0.08]) {
      screw(out, flank(s, f, -0.022), [0, 0, 1], [0, 1, 0], fn);
    }
    for (let k = 0; k < 5; k++) {
      const f = -0.29 + k * 0.012;
      rect(out, (u, h) => flank(s, u, h), f, f + 0.005, 0.012, 0.03, fn, slot);
    }
  }
};

/**
 * The laser rifle (the user, 2026-11-08), built once like gun(), after Halo's assault rifle held in
 * both hands: a long angular body from the butt at the shoulder past the grip (a bullpup), a tall
 * housing over the grip whose sloped back carries the counter (scope()), a square shroud to a red
 * lens, held from under it by the left hand, and a strip of red light along each side.
 */
export const rifle = (lod: number): number[] => {
  if (rifled[lod]) {
    return rifled[lod];
  }
  const [n, m] = lod ? [12, 6] : [6, 4];
  const out: number[] = [];
  // The body in one piece, the butt to the lens, its edges rounded: a trapezoid seen from the
  // side, tall at the butt, its underside rising toward the front and curving up into the end.
  tube(out, [[-0.34, PROFILE[0][1], 0, 0], ...PROFILE, [0.502, 0.079, 0, 0]], n, olive);
  // The housing on top: one block of polished grey metal along the top to the end of the barrel,
  // its back a flat sloping face that carries the counter.
  housing(out, lod);
  if (lod) {
    details(out);
  }
  // The lens at the end.
  tube(
    out,
    [
      [0.5, 0.079, 0, 0],
      [0.501, 0.079, 0.011, 0.01],
      [-RIFLE_MUZZLE[2], RIFLE_MUZZLE[1], 0, 0],
    ],
    m,
    red,
  );
  // The handguard (the user, 2026-11-10: a solid block to grip the rifle by): a block of the
  // body's olive as wide as the body, 4 cm deep under it along its underside, its edges rounded,
  // the left hand under it; its middle is RIFLE_GRIP.
  const [h0, h1] = [-0.08, 0.08].map(d => -RIFLE_GRIP[2] + d);
  const guard = (f: number, a: number, b: number): Station => [
    f,
    RIFLE_GRIP[1] + RIFLE_RISE * (f + RIFLE_GRIP[2]),
    a,
    b,
  ];
  tube(
    out,
    [
      guard(h0 - 0.002, 0, 0),
      guard(h0, GUARD[0] - 0.003, GUARD[1] - 0.003),
      guard(h0 + 0.006, ...GUARD),
      guard(h1 - 0.006, ...GUARD),
      guard(h1, GUARD[0] - 0.003, GUARD[1] - 0.003),
      guard(h1 + 0.002, 0, 0),
    ],
    n,
    olive,
  );
  // The block is a grenade launcher (the user, 2026-11-10): its steel barrel comes 3.8 cm out of
  // the block's front to NADE_MUZZLE, a ring round its dark mouth, and its breech cap closes the back.
  tube(
    out,
    [
      guard(h1 - 0.004, 0.015, 0.015),
      guard(h1 + 0.03, 0.015, 0.015),
      guard(h1 + 0.031, 0.018, 0.018),
      guard(h1 + 0.0375, 0.018, 0.018),
      guard(h1 + 0.038, 0.0125, 0.0125),
    ],
    n,
    steel,
  );
  tube(
    out,
    [guard(h1 + 0.038, 0.0125, 0.0125), guard(h1 + 0.0382, 0, 0)],
    n,
    shade([0.004, 0.004, 0.005], [0.02, 0.02, 0.025]),
  );
  tube(
    out,
    [guard(h0 - 0.014, 0, 0), guard(h0 - 0.012, 0.016, 0.016), guard(h0 + 0.004, 0.016, 0.016)],
    m,
    steel,
  );
  // The pistol grip, upright (the user, 2026-11-25: it leaned back as the pistol's, 25 degrees,
  // too much for a gun held at the shoulder), in the fist that holds it (LONG_TILT).
  tube(
    out,
    [
      [0, 0.07, 0, 0],
      [0, 0.05, 0.013, 0.021],
      [0, 0, 0.013, 0.021],
      [0, -0.046, 0.013, 0.021],
      [0, -0.06, 0, 0],
    ],
    m,
    steel,
  );
  // A strip of red light along each side, on the body's middle line.
  for (const s of [-1, 1]) {
    tube(
      out,
      PROFILE.slice(2, 8).map(([f, y, a]): Station => [f, y, 0.002, 0.003, s * (a + 0.0012)]),
      3,
      red,
    );
  }
  return (rifled[lod] = out);
};
