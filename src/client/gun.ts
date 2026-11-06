// The gun: a curved alien sidearm lofted from rings (violet metal, cyan glow), and the maths of the
// hand that holds it. Model space has the middle of the grip at the origin, x right, y up, the
// muzzle toward -z (like mesh.ts); place() carries it to the world. No DOM.
import { GUN_RANGE } from '../shared/constants';
import { TAU, eyeHeight } from '../shared/physics';
import type { PlayerState } from '../shared/types';
import { ray } from '../shared/world';
import type { World } from '../shared/world';
import { glow as lit, tri } from './flag';
import { add, basis, dot, place, sub, unit } from './mesh';
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
const DARK = [0.035, 0.025, 0.08];
const glow: Paint = () => [GLOW[0], GLOW[1], -2, GLOW[2]];

/**
 * The back of the body and the muzzle, between the jaws, in model space (the tail and the front of
 * the emitter): the line through them is the gun's long axis, the way it points and the way the
 * beam leaves. The grip's tilt: its lower end goes back by TILT[0] for each TILT[1] down.
 */
export const REAR: Vec3 = [0, 0.095, 0.06];
export const MUZZLE: Vec3 = [0, 0.075, -0.21];
export const TILT = [Math.sin(0.4), Math.cos(0.4)];

// The side view, forward then up, in metres from the middle of the grip. The hand sits in the gap
// between the upper body and the lower shell, round the short grip that joins them.
// The upper body: a smooth bulb widest at the back and top, tapering to the front.
const BULB: Station[] = [
  [-0.06, 0.095, 0, 0],
  [-0.055, 0.098, 0.022, 0.022],
  [-0.035, 0.103, 0.042, 0.036],
  [-0.005, 0.104, 0.048, 0.04],
  [0.035, 0.1, 0.044, 0.038],
  [0.08, 0.094, 0.036, 0.034],
  [0.12, 0.088, 0.028, 0.028],
  [0.135, 0.084, 0, 0],
];
/** The lower shell, a hull that runs from under the jaws back under the hand. */
const HULL: Station[] = [
  [-0.05, -0.02, 0, 0],
  [-0.045, -0.025, 0.018, 0.012],
  [-0.025, -0.052, 0.032, 0.018],
  [0.01, -0.066, 0.036, 0.02],
  [0.06, -0.06, 0.034, 0.02],
  [0.11, -0.04, 0.028, 0.018],
  [0.16, 0, 0.02, 0.014],
  [0.2, 0.04, 0.012, 0.01],
  [0.222, 0.065, 0, 0],
];
const built: number[][] = [];

/**
 * The gun at a level of detail (0 far, 1 near), built once, in the vertex format of mesh.ts, after
 * the Halo plasma pistol: a smooth bulbous upper body that splits into two jaws around a glowing
 * emitter, a chunky lower shell under the hand, a short thick grip between them, and cyan strips
 * along the sides.
 */
export const gun = (lod: number): number[] => {
  if (built[lod]) {
    return built[lod];
  }
  // The body and the hull have the most rings round, the top is a smooth curve.
  const [n, m] = lod ? [12, 8] : [8, 5];
  const out: number[] = [];
  tube(out, BULB, n, metal());
  tube(out, HULL, n, metal(0.25));
  // The grip.
  tube(
    out,
    [
      [0.03, 0.06, 0, 0],
      [0.02, 0.046, 0.021, 0.022],
      [0, 0, 0.021, 0.023],
      [-0.02, -0.046, 0.021, 0.022],
      [-0.03, -0.06, 0, 0],
    ],
    m,
    metal(0.1),
  );
  for (const s of [-1, 1]) {
    // A jaw: a stout prong from the front of the bulb, level, with its tip turned down a little.
    tube(
      out,
      [
        [0.06, 0.095, 0.018, 0.03, 0.026 * s],
        [0.1, 0.093, 0.017, 0.028, 0.027 * s],
        [0.15, 0.088, 0.015, 0.024, 0.024 * s],
        [0.19, 0.081, 0.012, 0.018, 0.019 * s],
        [0.222, 0.074, 0.008, 0.012, 0.015 * s],
        [0.232, 0.07, 0, 0, 0.014 * s],
      ],
      m,
      metal(0.05),
    );
    // A strip of light along each side of the bulb and of the hull.
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
      HULL.slice(1, 7).map(([f, y, a, b]): Station => [
        f,
        y + 0.3 * b,
        0.0035,
        0.005,
        s * a * 0.92,
      ]),
      lod ? 5 : 3,
      glow,
    );
  }
  // The emitter between the jaws.
  tube(
    out,
    [
      [0.09, 0.088, 0, 0],
      [0.1, 0.088, 0.009, 0.009],
      [0.15, 0.084, 0.009, 0.009],
      [0.2, 0.078, 0.007, 0.007],
      [-MUZZLE[2], MUZZLE[1], 0, 0],
    ],
    m,
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

/** The segments of the digits 0 to 9, a to g: top, top right, bottom right, bottom, bottom left, top left, middle. */
const DIGITS = [
  'abcdef',
  'bc',
  'abdeg',
  'abcdg',
  'bcfg',
  'acdfg',
  'acdefg',
  'abc',
  'abcdefg',
  'abcdfg',
];
/** A digit: width, height, thickness of a segment, gap between the two digits. */
const [DW, DH, DT, DGAP] = [0.019, 0.026, 0.0055, 0.004];
/** The rectangle of each segment in a digit: across and up from its bottom left corner. */
const SEGMENTS: Record<string, [number, number, number, number]> = {
  a: [0, DH - DT, DW, DH],
  b: [DW - DT, DH / 2, DW, DH],
  c: [DW - DT, 0, DW, DH / 2],
  d: [0, 0, DW, DT],
  e: [0, 0, DT, DH / 2],
  f: [0, DH / 2, DT, DH],
  g: [0, (DH - DT) / 2, DW, (DH + DT) / 2],
};
/**
 * The display block: a low trapezoidal wedge on the back of the top of the body, in the gun's
 * violet, a shade darker. Its base is a rectangle sunk into the body, its top a smaller one, so that
 * the sides slope in; its back face leans toward the eye of the player holding the gun. Corners as
 * [across, up, back] of the back edge and of the front edge, base then top.
 */
const BLOCK_BASE: [Vec3, Vec3] = [
  [0.036, 0.112, 0.056],
  [0.036, 0.112, 0.012],
];
const BLOCK_TOP: [Vec3, Vec3] = [
  [0.028, 0.156, 0.036],
  [0.028, 0.152, 0.02],
];
const BLOCK = [0.2, 0.075, 0.36];
/** The dark screen set in the back face: half width, and from where to where up the face, in metres. */
const [SW, SFROM, STO] = [0.023, 0.0175, 0.0455];
const readouts = new Map<number, number[]>();

/**
 * The ammo as two glowing seven-segment digits on a dark screen set in the back of a small block
 * on top of the body, in model space: cyan, red at 10 or fewer, thick segments that bloom only a
 * little. The block is part of the readout, so only a gun that shows the ammo carries it. 99 at most.
 */
export const readout = (ammo: number): number[] => {
  const n = Math.min(Math.max(Math.floor(ammo), 0), 99);
  let out = readouts.get(n);
  if (!out) {
    const v: number[] = (out = []);
    const mirror = (p: Vec3): Vec3 => [-p[0], p[1], p[2]];
    const [b0, b1, t0, t1] = [BLOCK_BASE[0], BLOCK_BASE[1], BLOCK_TOP[0], BLOCK_TOP[1]];
    const all = [b0, b1, t0, t1].flatMap(p => [p, mirror(p)]);
    const mid = [0, 1, 2].map(k => all.reduce((s, p) => s + p[k], 0) / all.length) as Vec3;
    /** A quad, wound so that it faces away from the middle of the block. */
    const face = (pts: Vec3[], rgb: number[]) => {
      const [u, w] = [sub(pts[1], pts[0]), sub(pts[2], pts[0])];
      const f: Vec3 = [
        u[1] * w[2] - u[2] * w[1],
        u[2] * w[0] - u[0] * w[2],
        u[0] * w[1] - u[1] * w[0],
      ];
      const c = sub(pts[0], mid);
      const p = dot(f, c) < 0 ? [pts[0], pts[3], pts[2], pts[1]] : pts;
      tri(v, p[0], p[1], p[2], rgb);
      tri(v, p[0], p[2], p[3], rgb);
    };
    // The back, the front, the two sloping sides and the top; the base is in the body.
    face([b0, mirror(b0), mirror(t0), t0], BLOCK);
    face([b1, mirror(b1), mirror(t1), t1], BLOCK);
    face([b0, b1, t1, t0], BLOCK);
    face([mirror(b0), mirror(b1), mirror(t1), mirror(t0)], BLOCK);
    face([t0, mirror(t0), mirror(t1), t1], BLOCK);
    // The back face's axes: across, up its slope and out of it. Points on it from the middle of its base.
    const slope = unit(sub(t0, b0));
    const [O, N]: [Vec3, Vec3] = [
      [0, b0[1], b0[2]],
      [0, -slope[2], slope[1]],
    ];
    const at = (a: number, b: number, k: number): Vec3 => [
      O[0] + a,
      O[1] + slope[1] * b + N[1] * k,
      O[2] + slope[2] * b + N[2] * k,
    ];
    face(
      [at(-SW, SFROM, 0.0012), at(SW, SFROM, 0.0012), at(SW, STO, 0.0012), at(-SW, STO, 0.0012)],
      DARK,
    );
    const from = v.length;
    [...`${n}`.padStart(2, '0')].forEach((ch, i) => {
      const x0 = -DW - DGAP / 2 + i * (DW + DGAP);
      for (const seg of DIGITS[+ch]) {
        const [a, b, d, e] = SEGMENTS[seg];
        // Segments lie on the screen, a hair out of it.
        const p = (x: number, t: number) => at(x0 + x, (SFROM + STO - DH) / 2 + t, 0.0027);
        const rgb = n > 10 ? [0.25, 0.9, 1] : [1, 0.18, 0.12];
        tri(v, p(a, b), p(d, b), p(d, e), rgb);
        tri(v, p(a, b), p(d, e), p(a, e), rgb);
      }
    });
    lit(v, from, 1);
    readouts.set(n, out);
  }
  return out;
};

/**
 * Appends the gun held in the hand at `pos` with the world rotation `q`, `k` times its size about
 * the grip, with the ammo on its back when given.
 */
export const held = (out: number[], pos: Vec3, q: Quat, lod: number, k = 1, ammo?: number) => {
  const [at, ax] = [grip(pos, q), axes(q)];
  place(out, gun(lod), at, ax, [0, 0, 0], k);
  if (ammo !== undefined) {
    place(out, readout(ammo), at, ax, [0, 0, 0], k);
  }
};

/** The muzzle of a gun whose grip is at `at` and whose axes are [right, up, forward]. */
export const tip = (at: Vec3, [, u, f]: Vec3[]): Vec3 =>
  [0, 1, 2].map(i => at[i] + u[i] * MUZZLE[1] - f[i] * MUZZLE[2]) as Vec3;

/** How far the model's long axis (REAR to MUZZLE) points below the gun's own forward, radians. */
const SAG = Math.atan2(REAR[1] - MUZZLE[1], REAR[2] - MUZZLE[2]);

/**
 * The axes [right, up, forward] of a gun held with its grip at `at` so that its long axis, from the
 * back of the body to the emitter, points at `to`: the beam leaves the emitter along it. `side` is
 * where the right axis points, `up` where up is. The emitter is off the grip, so the axes are found
 * in three rounds.
 */
export const pointed = (at: Vec3, to: Vec3, side: Vec3, up: Vec3): Vec3[] => {
  const scale = (v: Vec3, k: number): Vec3 => [v[0] * k, v[1] * k, v[2] * k];
  let ax: Vec3[] = [side, up, unit(sub(to, at))];
  for (let k = 0; k < 3; k++) {
    const d = unit(sub(to, k ? tip(at, ax) : at));
    // Right and up as near `side` and `up` as they can be, across d: no cross product, so the
    // handedness of the space does not matter (the camera's space is a mirror of the world's).
    const r = unit(sub(side, scale(d, dot(side, d))));
    const u = unit(sub(sub(up, scale(d, dot(up, d))), scale(r, dot(up, r))));
    // The long axis dips below the gun's forward: turned about r, so that it lies along d.
    const [s, c] = [Math.sin(SAG), Math.cos(SAG)];
    ax = [r, add(scale(u, c), scale(d, -s)), add(scale(d, c), scale(u, s))];
  }
  return ax;
};

/** Where a runner's shots end: the first wall along its look from the eye, or the range. */
export const focus = (p: PlayerState, world: World): [Vec3, boolean] => {
  const eye: Vec3 = [p.x, p.y + eyeHeight(p), p.z];
  const f = basis(p.yaw, p.pitch)[2];
  const d = ray(world, eye, f, GUN_RANGE);
  return [[0, 1, 2].map(i => eye[i] + f[i] * d) as Vec3, d < GUN_RANGE];
};

/** Where a runner holds the gun when it fires at `to`: the grip, a little right of and below the eye, and the gun's axes. */
export const aimed = (p: PlayerState, to: Vec3): [Vec3, Vec3[]] => {
  const [r, u, f] = basis(p.yaw, p.pitch);
  const eye: Vec3 = [p.x, p.y + eyeHeight(p), p.z];
  const grip = [0, 1, 2].map(i => eye[i] + r[i] * 0.2 - u[i] * 0.17 + f[i] * 0.42) as Vec3;
  return [grip, pointed(grip, to, r, u)];
};
