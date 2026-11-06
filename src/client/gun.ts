// The gun: a curved alien sidearm lofted from rings (violet metal, cyan glow), and the maths of the
// hand that holds it. Model space has the middle of the grip at the origin, x right, y up, the
// muzzle toward -z (like mesh.ts); place() carries it to the world. No DOM.
import { TAU, eyeHeight } from '../shared/physics';
import type { PlayerState } from '../shared/types';
import { basis, place } from './mesh';
import type { Vec3 } from './mesh';
import { turn } from './rig';
import type { Quat } from './rig';

/** A ring of a loft: how far ahead, how high, half width, half height, and the offset to the side. */
type Station = [f: number, y: number, a: number, b: number, x?: number];
/** The colour of a vertex from its place and normal: [r, g, layer, b]. */
type Paint = (p: Vec3, n: Vec3) => number[];

const sgn = (v: number) => Math.sign(v) * Math.abs(v) ** 0.8;
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);
const clamp = (v: number) => Math.min(Math.max(v, 0), 1);

/**
 * Appends the tube through `st`: a ring is `n` sides of a superellipse across the spine's side
 * view, a station with no width a point. Triangles with smooth normals, each vertex painted.
 */
const tube = (out: number[], st: Station[], n: number, paint: Paint) => {
  const P: Vec3[] = [];
  const N: Vec3[] = [];
  const T: number[] = [];
  const rows = st.map(([f, y, a, b, x = 0], i) => {
    const [p, q] = [st[Math.max(i - 1, 0)], st[Math.min(i + 1, st.length - 1)]];
    const l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
    const [tf, ty] = [(q[0] - p[0]) / l, (q[1] - p[1]) / l];
    return Array.from({ length: a ? n : 1 }, (_, k) => {
      const [c, s] = [sgn(Math.cos((k * TAU) / n)), sgn(Math.sin((k * TAU) / n))];
      // The ring stands across the spine: its height runs along the spine's normal.
      P.push([x + a * c, y + b * s * tf, -(f - b * s * ty)]);
      N.push([0, 0, 0]);
      return P.length - 1;
    });
  });
  rows.slice(1).forEach((r1, k) => {
    const r0 = rows[k];
    const mid = [
      (st[k][4] ?? 0) + (st[k + 1][4] ?? 0),
      st[k][1] + st[k + 1][1],
      -st[k][0] - st[k + 1][0],
    ];
    for (let i = 0; i < n; i++) {
      const [p, q, r, s] = [
        r0[i % r0.length],
        r0[(i + 1) % r0.length],
        r1[(i + 1) % r1.length],
        r1[i % r1.length],
      ];
      for (const t of [
        [p, q, r],
        [p, r, s],
      ]) {
        if (new Set(t).size < 3) {
          continue;
        }
        const [u, v] = [1, 2].map(j => [0, 1, 2].map(d => P[t[j]][d] - P[t[0]][d]));
        const f = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        // Wound outward, away from the axis through the middle of the two rings.
        const flip = [0, 1, 2].reduce((d, j) => d + f[j] * (P[t[0]][j] * 2 - mid[j]), 0) < 0;
        T.push(...(flip ? [t[0], t[2], t[1]] : t));
        for (const j of t) {
          [0, 1, 2].forEach(d => (N[j][d] += flip ? -f[d] : f[d]));
        }
      }
    }
  });
  for (const j of T) {
    const l = Math.hypot(...N[j]) || 1;
    const nn = N[j].map(v => v / l) as Vec3;
    out.push(...P[j], ...nn, ...paint(P[j], nn));
  }
};

const VIOLET = [0.34, 0.12, 0.62];
const SHEEN = [0.72, 0.46, 1];
const TEAL = [0.1, 0.38, 0.72];
const DEEP = [0.16, 0.06, 0.34];
/** Cyan that blooms: unlit (layer -2) and brighter than 1. */
const GLOW = [0.5, 1.9, 2.3];

/**
 * Violet metal that is lit by its normal: light where it faces up, dark where it faces down, and
 * shifting toward blue along the way to the muzzle, as an iridescent finish does. Returns [r, g, layer, b].
 */
const metal =
  (dark = 0): Paint =>
  (p, n) => {
    const c = mix(
      mix(VIOLET, TEAL, clamp(-p[2] * 5 - 0.3) * 0.8),
      SHEEN,
      Math.max(n[1], 0) ** 1.5 * 0.7,
    );
    const [r, g, , b] = mix(
      [...c.slice(0, 2), 0, c[2]],
      [...DEEP.slice(0, 2), 0, DEEP[2]],
      clamp(-n[1] * 0.5 + dark),
    );
    return [r, g, -1, b];
  };
const glow: Paint = () => [GLOW[0], GLOW[1], -2, GLOW[2]];

/** Where the muzzle is, between the two jaws; and the grip's tilt: its lower end goes back by TILT[0] for each TILT[1] down. */
export const MUZZLE: Vec3 = [0, 0.052, -0.21];
export const TILT = [Math.sin(0.4), Math.cos(0.4)];

// The side view, forward then up, in metres from the middle of the grip. The bulb is a swept-back
// crescent, highest and widest a third of the way along, falling toward the front.
const BULB: Station[] = [
  [-0.06, 0.095, 0, 0],
  [-0.054, 0.098, 0.017, 0.02],
  [-0.03, 0.105, 0.032, 0.035],
  [0.01, 0.108, 0.038, 0.041],
  [0.055, 0.1, 0.036, 0.038],
  [0.1, 0.086, 0.03, 0.032],
  [0.14, 0.07, 0.022, 0.024],
  [0.155, 0.062, 0, 0],
];
const built: number[][] = [];

/**
 * The gun at a level of detail (0 far, 1 near), built once, in the vertex format of mesh.ts: a
 * swept-back bulb with a split front like open jaws around a glowing emitter, a curved grip and a
 * guard under it that joins the jaws, with cyan strips along the sides and at the muzzle.
 */
export const gun = (lod: number): number[] => {
  if (built[lod]) {
    return built[lod];
  }
  const n = lod ? 8 : 5;
  const out: number[] = [];
  tube(out, BULB, n, metal());
  for (const s of [-1, 1]) {
    // The jaws: a prong curving down and in from each side of the front of the bulb.
    tube(
      out,
      [
        [0.07, 0.092, 0.015, 0.026, 0.021 * s],
        [0.11, 0.08, 0.014, 0.024, 0.021 * s],
        [0.15, 0.062, 0.012, 0.02, 0.018 * s],
        [0.19, 0.042, 0.01, 0.015, 0.013 * s],
        [0.215, 0.032, 0, 0, 0.012 * s],
      ],
      n,
      metal(0.05),
    );
    // A strip of light along each side of the bulb, a bead on each prong.
    tube(
      out,
      BULB.slice(1, 6).map(([f, y, a, b]): Station => [
        f,
        y - 0.1 * b,
        0.0035,
        0.006,
        s * a * 0.93,
      ]),
      lod ? 5 : 3,
      glow,
    );
    tube(
      out,
      [
        [0.2, 0.038, 0, 0, 0.012 * s],
        [0.21, 0.033, 0.007, 0.007, 0.012 * s],
        [0.219, 0.03, 0, 0, 0.012 * s],
      ],
      4,
      glow,
    );
  }
  // The grip curves back from the belly of the bulb to a pommel.
  tube(
    out,
    [
      [0.025, 0.07, 0, 0],
      [0.022, 0.06, 0.018, 0.022],
      [0.012, 0.025, 0.02, 0.023],
      [0, -0.01, 0.02, 0.023],
      [-0.015, -0.045, 0.02, 0.023],
      [-0.035, -0.072, 0.019, 0.022],
      [-0.055, -0.088, 0.016, 0.018],
      [-0.065, -0.09, 0, 0],
    ],
    n,
    metal(0.12),
  );
  // The guard: a thick curved shell under the bulb, parallel to it, joined to the jaws at the front.
  tube(
    out,
    [
      [0.03, 0.02, 0, 0],
      [0.04, 0.022, 0.016, 0.01],
      [0.09, 0.014, 0.021, 0.012],
      [0.14, 0.016, 0.019, 0.011],
      [0.19, 0.026, 0.013, 0.009],
      [0.215, 0.032, 0, 0],
    ],
    n,
    metal(0.2),
  );
  // The emitter between the jaws.
  tube(
    out,
    [
      [0.1, 0.066, 0, 0],
      [0.115, 0.066, 0.011, 0.011],
      [0.14, 0.06, 0.011, 0.011],
      [0.16, 0.052, 0.008, 0.008],
      [0.172, 0.05, 0, 0],
    ],
    n,
    glow,
  );
  return (built[lod] = out);
};

/** The gun's axes [right, up, forward] for a hand turned by `q` (see body.ts: its thumb is the hand's -z, the back of the hand its x, its fingers its -y). */
const axes = (q: Quat): Vec3[] => {
  const [th, back, fing] = [turn(q, [0, 0, -1]), turn(q, [1, 0, 0]), turn(q, [0, -1, 0])];
  const [s, c] = TILT;
  return [
    back,
    th.map((v, i) => c * v - s * fing[i]) as Vec3,
    th.map((v, i) => s * v + c * fing[i]) as Vec3,
  ];
};

/** The middle of the grip, for a wrist at `pos`: 8 cm along the fingers and 2 cm toward the palm. */
export const grip = (pos: Vec3, q: Quat): Vec3 => {
  const [fing, back] = [turn(q, [0, -1, 0]), turn(q, [1, 0, 0])];
  return pos.map((v, i) => v + fing[i] * 0.078 - back[i] * 0.022) as Vec3;
};

/** Appends the gun held in the hand at `pos` with the world rotation `q`, `k` times its size about the grip. */
export const held = (out: number[], pos: Vec3, q: Quat, lod: number, k = 1) =>
  place(out, gun(lod), grip(pos, q), axes(q), [0, 0, 0], k);

/** The muzzle of a gun whose grip is at `at` and whose axes are [right, up, forward]. */
export const tip = (at: Vec3, [, u, f]: Vec3[]): Vec3 =>
  [0, 1, 2].map(i => at[i] + u[i] * MUZZLE[1] - f[i] * MUZZLE[2]) as Vec3;

/** Where a runner holds the gun when it fires: the grip, a little right of and below the eye, and the gun's axes along the look. */
export const aimed = (p: PlayerState): [Vec3, Vec3[]] => {
  const ax = basis(p.yaw, p.pitch);
  const eye: Vec3 = [p.x, p.y + eyeHeight(p), p.z];
  return [
    [0, 1, 2].map(i => eye[i] + ax[0][i] * 0.2 - ax[1][i] * 0.17 + ax[2][i] * 0.42) as Vec3,
    ax,
  ];
};
