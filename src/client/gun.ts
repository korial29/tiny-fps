// The gun: a curved alien sidearm lofted from rings (violet metal, cyan glow), and the maths of the
// hand that holds it. Model space has the middle of the grip at the origin, x right, y up, the
// muzzle toward -z (like mesh.ts); place() carries it to the world. No DOM.
import {
  CHARGE_MAX,
  GUN_RANGE,
  GUN_RELOAD,
  RAIL_CAP,
  RAIL_MAX,
  RAIL_RELOAD,
  RIFLE_RELOAD,
} from '../shared/constants';
import { TAU, eyeHeight } from '../shared/physics';
import type { PlayerState } from '../shared/types';
import { ray } from '../shared/world';
import type { World } from '../shared/world';
import { glow as lit, tri } from './flag';
import {
  SHINE,
  STRIDE,
  add,
  aim,
  basis,
  dim as dimmed,
  dot,
  dress,
  place,
  smooth,
  sub,
  unit,
} from './mesh';
import type { Vec3 } from './mesh';
import { axis, turn } from './rig';
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
/** Vertex `k` of the `n` of station `i`'s ring in tube(). */
const ring = (st: Station[], i: number, k: number, n: number): Vec3 => {
  const [f, y, a, b, x = 0] = st[i];
  const [p, q] = [st[Math.max(i - 1, 0)], st[Math.min(i + 1, st.length - 1)]];
  const l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
  const [tf, ty] = [(q[0] - p[0]) / l, (q[1] - p[1]) / l];
  const [c, s] = [sgn(Math.cos((k * TAU) / n)), sgn(Math.sin((k * TAU) / n))];
  // The ring stands across the spine: its height runs along the spine's normal.
  return [x + a * c, y + b * s * tf, -(f - b * s * ty)];
};

const tube = (out: number[], st: Station[], n: number, paint: Paint) => {
  const P: Vec3[] = [];
  const N: Vec3[] = [];
  const T: number[] = [];
  const rows = st.map((r, i) =>
    Array.from({ length: r[2] ? n : 1 }, (_, k) => {
      P.push(ring(st, i, k, n));
      N.push([0, 0, 0]);
      return P.length - 1;
    }),
  );
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
    return [r, g, SHINE, b];
  };
const DARK = [0.035, 0.025, 0.08];
const glow: Paint = () => [GLOW[0], GLOW[1], -2, GLOW[2]];

/**
 * The back of the body and the muzzle, the tip of the nose, in model space (the tail and the front of
 * the emitter): the line through them is the gun's long axis, the way it points and the way the
 * beam leaves. The grip's tilt: its lower end goes back by TILT[0] for each TILT[1] down.
 */
export const REAR: Vec3 = [0, 0.095, 0.06];
export const MUZZLE: Vec3 = [0, 0.075, -0.21];
export const TILT = [Math.sin(0.4), Math.cos(0.4)];

// The side view, forward then up, in metres from the middle of the grip. The hand sits in the gap
// between the upper body and the lower shell, round the short grip that joins them.
// The upper body: a smooth bulb widest at the back and top, tapering to the muzzle. Its top climbs
// all the way back to the counter, the highest of the gun (the user, 2026-11-09: no dip before it).
const BULB: Station[] = [
  [-0.063, 0.1, 0, 0],
  [-0.062, 0.098, 0.026, 0.016],
  [-0.055, 0.1, 0.04, 0.02],
  [-0.035, 0.103, 0.046, 0.038],
  [-0.005, 0.10175, 0.048, 0.03775],
  [0.035, 0.09775, 0.044, 0.03575],
  [0.08, 0.093, 0.036, 0.033],
  [0.12, 0.088, 0.028, 0.028],
  [0.16, 0.082, 0.021, 0.021],
  [0.19, 0.078, 0.015, 0.015],
  [0.205, 0.076, 0.01, 0.01],
  [0.208, 0.0755, 0, 0],
];
/** The lower shell, a hull that runs from under the nose back under the hand. */
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
 * The pistol's back (the user, 2026-11-09: like the rifle's counter, the top of the gun in one
 * piece, cut by a straight leaning face): the face through BACK, facing BACK_N, back and up toward
 * the player. The counter's support, a glossy black rounded trapezoid, sits on it (readout()).
 */
const BACK: Vec3 = [0, 0.125, 0.04];
const BACK_N = unit([0, 0.469, 0.883]);
/** Glossy black, the cut face and the screen's support on it: [r, g, layer, b]. */
const GLOSS = [0.012, 0.012, SHINE, 0.018];
/** The smooth outline over the cut: its middle up the face from BACK, its half width and half height, holding the cut's polygon. */
const FACE = [-0.0145, 0.044, 0.0334];
/**
 * Cuts `out` (triangles) by the back face: what lies in front stays, what lies behind is laid on the
 * face, glossy black facing out of it (the user, 2026-11-09). A triangle across it is split along it, so the edge is clean.
 */
const cutBack = (out: number[]) => {
  const v = out.splice(0);
  const side = (i: number) => (v[i + 1] - BACK[1]) * BACK_N[1] + (v[i + 2] - BACK[2]) * BACK_N[2];
  /** The vertex at `i`, or between the ones at `i` and `j` where the face crosses. */
  const vert = (i: number, j = i) => {
    const [a, b] = [side(i), side(j)];
    const t = i == j ? 0 : a / (a - b);
    const x = v.slice(i, i + STRIDE).map((x, k) => x + (v[j + k] - x) * t);
    x.splice(3, 3, ...unit(x.slice(3, 6) as Vec3));
    return x;
  };
  /** On the face, black: the glow keeps its colour. */
  const flat = (x: number[]) => {
    const d = (x[1] - BACK[1]) * BACK_N[1] + (x[2] - BACK[2]) * BACK_N[2];
    return [
      x[0],
      x[1] - BACK_N[1] * d,
      x[2] - BACK_N[2] * d,
      ...BACK_N,
      ...(x[8] == -2 ? x.slice(6) : GLOSS),
    ];
  };
  const fan = (poly: number[][]) => {
    for (let k = 2; k < poly.length; k++) {
      out.push(...poly[0], ...poly[k - 1], ...poly[k]);
    }
  };
  for (let t = 0; t < v.length; t += 3 * STRIDE) {
    const ids = [t, t + STRIDE, t + 2 * STRIDE];
    const [front, back]: number[][][] = [[], []];
    ids.forEach((i, k) => {
      const j = ids[(k + 1) % 3];
      (side(i) > 0 ? back : front).push(vert(i));
      if (side(i) > 0 !== side(j) > 0) {
        const x = vert(i, j);
        front.push(x);
        back.push(x);
      }
    });
    fan(front);
    fan(back.map(flat));
  }
};
/**
 * The gun at a level of detail (0 far, 1 near), built once, in the vertex format of mesh.ts, after
 * the Halo plasma pistol: a smooth bulbous upper body tapering to a glowing emitter on its nose, a
 * chunky lower shell under the hand, a short thick grip between them, and cyan strips along the
 * sides.
 */
export const gun = (lod: number): number[] => {
  if (built[lod]) {
    return built[lod];
  }
  // The body and the hull have the most rings round, the top is a smooth curve.
  const [n, m] = lod ? [12, 8] : [8, 5];
  const out: number[] = [];
  // Near, the body in more sides round, so the cut of its back has a round edge.
  tube(out, BULB, lod ? 16 : n, metal());
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
    // A strip of light along each side of the bulb and of the hull.
    tube(
      out,
      // From in front of the flat back, which would smear their ends over it.
      BULB.slice(2, 6).map(([f, y, a, b]): Station => [
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
  // The emitter: a glowing cap on the tip of the nose.
  tube(
    out,
    [
      [0.198, 0.077, 0, 0],
      [0.2, 0.077, 0.011, 0.011],
      [0.207, 0.0757, 0.008, 0.008],
      [-MUZZLE[2], MUZZLE[1], 0, 0],
    ],
    m,
    glow,
  );
  cutBack(out);
  // Over the cut a smooth glossy black outline, a hair out of it, so its polygon's corners don't show
  // (the user, 2026-11-09): a superellipse round [0, FACE[0]] up the face, FACE[1] and FACE[2] its half axes.
  const up: Vec3 = [0, BACK_N[2], -BACK_N[1]];
  const on = (a: number, b: number): Vec3 =>
    [a, ...[1, 2].map(k => BACK[k] + up[k] * b + BACK_N[k] * 0.0002)] as Vec3;
  for (let k = 0; k < 32; k++) {
    for (const p of [
      on(0, FACE[0]),
      ...[k, k + 1].map(j =>
        on(
          FACE[1] * sgn(Math.cos((j * TAU) / 32)),
          FACE[0] + FACE[2] * sgn(Math.sin((j * TAU) / 32)),
        ),
      ),
    ]) {
      out.push(...p, ...BACK_N, ...GLOSS);
    }
  }
  if (lod) {
    circuits(out);
  }
  return (built[lod] = out);
};

/** Dark violet copper, lit by its normal, for the pistol's printed circuit (the user, 2026-11-09). */
const trace: Paint = (p, n) => shade([0.09, 0.025, 0.2], [0.24, 0.07, 0.48])(p, n);
/**
 * The pistol's printed circuit on each flank of its body, mirrored: runs of [forward, up round from
 * the side's middle] points (metres along the surface), a pad at each end. Above and under the
 * light strip, clear of the cut back.
 */
export const CIRCUIT = [
  [
    [0.0, 0.012],
    [0.05, 0.012],
    [0.058, 0.02],
    [0.11, 0.02],
  ],
  [
    [0.0, 0.02],
    [0.03, 0.02],
    [0.04, 0.03],
    [0.085, 0.03],
  ],
  [
    [0.0, 0.03],
    [0.02, 0.03],
    [0.03, 0.04],
    [0.06, 0.04],
  ],
  [
    [0.065, 0.011],
    [0.12, 0.011],
    [0.128, 0.017],
    [0.155, 0.017],
  ],
  [
    [0.095, 0.027],
    [0.125, 0.027],
  ],
  [
    [0.01, -0.012],
    [0.07, -0.012],
    [0.078, -0.02],
    [0.12, -0.02],
  ],
  [
    [0.03, -0.024],
    [0.062, -0.024],
  ],
  // Over the top, toward the middle line (which is some 6 cm round at the widest).
  [
    [0.0, 0.048],
    [0.035, 0.048],
    [0.042, 0.04],
    [0.075, 0.04],
  ],
  [
    [0.005, 0.057],
    [0.05, 0.057],
  ],
  [
    [0.06, 0.05],
    [0.09, 0.05],
    [0.095, 0.044],
  ],
];

/**
 * The body's surface `f` forward and `s` up round its side `x` (1 right, -1 left), `d` out of it:
 * between BULB's rings, at the angle round of `s` over the ring's mean half axis; and its normal.
 */
const onBulb = (f: number, s: number, x: number, d = 0.0004): Vec3[] => {
  const i = BULB.findIndex(r => r[0] > f) - 1;
  const t = (f - BULB[i][0]) / (BULB[i + 1][0] - BULB[i][0]);
  const R = (BULB[i][2] + BULB[i][3] + BULB[i + 1][2] + BULB[i + 1][3]) / 4;
  const k = (((x > 0 ? 0 : Math.PI) + (x * s) / R) * 16) / TAU;
  const p = (j: number, g: number) =>
    mix(ring(BULB, i, g, 16), ring(BULB, i + 1, g, 16), j) as Vec3;
  const c = p(t, k);
  const e = sub(p(t + 0.01, k), c);
  const w = sub(p(t, k + 0.01 * x), c);
  const n = unit([e[1] * w[2] - e[2] * w[1], e[2] * w[0] - e[0] * w[2], e[0] * w[1] - e[1] * w[0]]);
  // Outward, away from the body's middle.
  const o = n[0] * x > 0 ? n : (n.map(v => -v) as Vec3);
  return [c.map((v, j) => v + o[j] * d) as Vec3, o];
};

/** The printed circuit (CIRCUIT) on both flanks of the pistol's body. */
const circuits = (out: number[]) => {
  for (const x of [-1, 1]) {
    /** A strip from `a` to `b` (forward, up round) `w` wide, in pieces of 3 cm at most. */
    const run = (a: number[], b: number[], w: number) => {
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const [ux, uy] = [((b[0] - a[0]) / l) * w, ((b[1] - a[1]) / l) * w];
      const k = Math.ceil(l / 0.03);
      for (let i = 0; i < k; i++) {
        const [p, q] = [i / k, (i + 1) / k].map(t => [
          a[0] + (b[0] - a[0]) * t,
          a[1] + (b[1] - a[1]) * t,
        ]);
        // Squared ends: each piece reaches w past its ends, so the bends close.
        const [p0, q0] = [i ? p : [p[0] - ux, p[1] - uy], i < k - 1 ? q : [q[0] + ux, q[1] + uy]];
        const at = (o: number[], h: number) => onBulb(o[0] - uy * h, o[1] + ux * h, x)[0];
        flat(
          out,
          [at(p0, -1), at(q0, -1), at(q0, 1), at(p0, 1)],
          onBulb((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, x)[1],
          trace,
        );
      }
    };
    for (const t of CIRCUIT) {
      t.slice(1).forEach((q, i) => run(t[i], q, 0.0007));
      for (const e of [t[0], t[t.length - 1]]) {
        run([e[0] - 0.0014, e[1]], [e[0] + 0.0014, e[1]], 0.0014);
      }
    }
  }
};

/** The rail gun's muzzle, between its electrodes' tips: on the gun's long axis (REAR to MUZZLE), 36 cm further out. */
export const RAIL_MUZZLE: Vec3 = [0, 0.048, -0.575];
/** The electrodes' tips stand this far above and below the muzzle. */
const SPREAD = 0.05;
/** The middle of the rail gun's front grip, under the barrel, where the left hand holds it. */
export const FOREGRIP: Vec3 = [0, 0.012, -0.19];
/** The height of the long axis at `f` ahead of the grip, in the side view. */
const axisY = (f: number) => 0.0906 - 0.0741 * f;
/** The violet white of a Tesla arc, which blooms. */
export const ARC = [1.1, 0.85, 2.6];
const arcing: Paint = () => [ARC[0], ARC[1], -2, ARC[2]];
const dim: Paint = () => [ARC[0] * 0.3, ARC[1] * 0.3, -2, ARC[2] * 0.3];
/** The capsule's core of lightning: violet, less than a spark. */
const core: Paint = () => [ARC[0] * 0.45, ARC[1] * 0.3, -2, ARC[2] * 0.6];
/** Paint lit by its normal, from `lo` facing down to `hi` facing up. */
const shade =
  (lo: number[], hi: number[]): Paint =>
  (_, n) => {
    const [r, g, b] = mix(lo, hi, Math.max(n[1], 0) ** 1.5 * 0.8);
    return [r, g, SHINE, b];
  };
/** Polished grey metal, for the rifle's housing. */
const chrome = shade([0.16, 0.17, 0.18], [0.66, 0.68, 0.72]);
/** Dark gunmetal, and the copper of the coils. */
const steel = shade([0.07, 0.075, 0.09], [0.42, 0.45, 0.52]);
const copper = shade([0.3, 0.12, 0.05], [1, 0.58, 0.32]);
/** The rail gun's olive drab receiver, its wooden stock, its red cables and its ceramic insulators. */
const drab = shade([0.1, 0.1, 0.05], [0.5, 0.48, 0.26]);
const wood = shade([0.15, 0.07, 0.03], [0.55, 0.32, 0.15]);
const cable = shade([0.18, 0.02, 0.02], [0.75, 0.12, 0.08]);
const CERAMIC = [
  [0.16, 0.19, 0.17],
  [0.62, 0.68, 0.62],
];
/** The glowing orange red of a hot insulator. */
const EMBER = [1.2, 0.32, 0.06];
/** A station on the long axis, `up` above it. */
const on = (f: number, up: number, a: number, b = a, x = 0): Station => [f, axisY(f) + up, a, b, x];
const railed: number[][] = [];
/** The rail gun's receiver, a tube: its long middle from station 2 to 3. */
const RECEIVER = [
  on(-0.13, 0.004, 0),
  on(-0.125, 0.004, 0.026, 0.03),
  on(-0.1, 0.004, 0.034, 0.04),
  on(0.13, 0.002, 0.034, 0.038),
  on(0.16, 0, 0.024),
  on(0.165, 0, 0),
];

/**
 * The rail gun's small details (the user, 2026-11-09: lines and screw heads on its tube), near
 * only: on the receiver's ten flat faces, grooves round it with a bright lip, a seam along each
 * flank above and under its middle, cross-head screws; grooves round the barrel between the
 * insulators and the coils.
 */
const teslaDetails = (out: number[]) => {
  /** The receiver's surface at `f` forward, `k` round (of its 10 vertices, between them on a flat face), `d` out of it, and the face's normal. */
  const at = (f: number, k: number, d = 0.0003): Vec3[] => {
    const t = (f + 0.1) / 0.23;
    const v = (j: number) => mix(ring(RECEIVER, 2, j, 10), ring(RECEIVER, 3, j, 10), t) as Vec3;
    const [a, b] = [v(Math.floor(k)), v(Math.floor(k) + 1)];
    const e = unit(sub(ring(RECEIVER, 3, 0, 10), ring(RECEIVER, 2, 0, 10)));
    const w = unit(sub(b, a));
    // Outward: the cross of the way along and the way round.
    const n = unit([
      e[1] * w[2] - e[2] * w[1],
      e[2] * w[0] - e[0] * w[2],
      e[0] * w[1] - e[1] * w[0],
    ]);
    const p = mix(a, b, k % 1);
    return [p.map((c, i) => c + n[i] * d) as Vec3, n, e, w];
  };
  const band = (f0: number, f1: number, k0: number, k1: number, paint: Paint, d = 0.0003) =>
    rect(out, (f, k) => at(f, k, d)[0], f0, f1, k0, k1, at(f0, k0)[1], paint);
  for (const f of [-0.085, -0.035, 0.07, 0.118]) {
    for (let k = 0; k < 10; k++) {
      band(f - 0.0011, f + 0.0011, k, k + 0.999, slot);
      band(f + 0.0011, f + 0.0019, k, k + 0.999, lip);
    }
  }
  // Seams along the flanks, a screw at each end; a panel on the top between the first two
  // grooves, a screw at each corner.
  for (const k of [0.5, 4.5, 5.5, 9.5]) {
    band(-0.095, 0.125, k - 0.02, k + 0.02, slot);
    for (const f of [-0.06, 0.095]) {
      const [c, n, e, w] = at(f, k + (k % 9 < 1 || k > 5 ? 0.25 : -0.25));
      screw(out, c, e, w, n, 1.4);
    }
  }
  for (const k of [2.12, 2.84]) {
    band(-0.0839, -0.0361, k, k + 0.04, slot);
  }
  for (const f of [-0.074, -0.046]) {
    for (const k of [2.3, 2.7]) {
      const [c, n, e, w] = at(f, k);
      screw(out, c, e, w, n, 1.2);
    }
  }
  for (const f of [0.175, 0.228, 0.283]) {
    tube(
      out,
      [
        on(f - 0.001, 0, 0),
        on(f - 0.001, 0, 0.0195),
        on(f + 0.001, 0, 0.0195),
        on(f + 0.001, 0, 0),
      ],
      10,
      slot,
    );
  }
};

/**
 * The rail gun at a level of detail (0 far, 1 near), built once like gun(), after a Tesla gun held
 * in both hands: a stock to the shoulder, a gunmetal receiver over the same grip, a front grip under
 * a barrel in three copper coils, and two electrodes forking out of its end, up and down, each
 * tipped with a glowing ball. arc() is the spark between them.
 */
export const railgun = (lod: number): number[] => {
  if (railed[lod]) {
    return railed[lod];
  }
  const [n, m] = lod ? [10, 6] : [6, 4];
  const out: number[] = [];
  // The stock, from the butt plate to the receiver, a little under the long axis.
  tube(
    out,
    [
      on(-0.392, -0.045, 0),
      on(-0.39, -0.045, 0.024, 0.05),
      on(-0.36, -0.042, 0.024, 0.05),
      on(-0.25, -0.025, 0.02, 0.034),
      on(-0.13, -0.006, 0.024, 0.032),
      on(-0.1, 0, 0),
    ],
    m,
    wood,
  );
  tube(out, RECEIVER, n, drab);
  tube(
    out,
    [
      [0.03, 0.07, 0, 0],
      [0.02, 0.05, 0.02, 0.022],
      [0, 0, 0.02, 0.023],
      [-0.02, -0.046, 0.021, 0.022],
      [-0.03, -0.06, 0, 0],
    ],
    m,
    steel,
  );
  tube(
    out,
    [
      [0.18, axisY(0.18) - 0.015, 0, 0],
      [0.183, axisY(0.183) - 0.02, 0.013, 0.015],
      [0.197, -0.035, 0.012, 0.014],
      [0.2, -0.04, 0, 0],
    ],
    m,
    steel,
  );
  tube(
    out,
    [on(0.15, 0, 0), on(0.155, 0, 0.019), on(0.42, 0, 0.019), on(0.43, 0, 0.025), on(0.44, 0, 0)],
    n,
    steel,
  );
  for (const f of [0.31, 0.355, 0.4]) {
    tube(
      out,
      [on(f - 0.011, 0, 0), on(f - 0.01, 0, 0.03), on(f + 0.01, 0, 0.03), on(f + 0.011, 0, 0)],
      n,
      copper,
    );
  }
  if (lod) {
    teslaDetails(out);
  }
  const f = -RAIL_MUZZLE[2];
  for (const s of [-1, 1]) {
    const up = s * SPREAD;
    tube(
      out,
      [
        on(0.42, s * 0.014, 0.008),
        on(0.47, up * 0.8, 0.007),
        on(0.53, up * 1.1, 0.006),
        on(f - 0.006, up, 0.0055),
        on(f - 0.004, up, 0),
      ],
      m,
      steel,
    );
    tube(
      out,
      [
        on(f - 0.012, up, 0),
        on(f - 0.008, up, 0.012),
        on(f + 0.008, up, 0.012),
        on(f + 0.012, up, 0),
      ],
      m,
      arcing,
    );
    tube(
      out,
      [on(-0.08, -0.004, 0.002, 0.003, s * 0.034), on(0.12, -0.004, 0.002, 0.003, s * 0.034)],
      3,
      dim,
    );
  }
  // A steel collar for each cell, along it: on the top the socket the cell in use screws into, its
  // hole the cell's thread; on each flank the cradle of a smaller one.
  for (let i = 0; i < 3; i++) {
    tube(
      out,
      [
        [-0.017, 0],
        [-0.016, 0.024],
        [0.005, 0.024],
        [0.007, 0.0215],
        [0.0075, 0.0195],
        [0.008, 0],
      ].map(([h, a]): Station => {
        const [f, y, x] = onCell(i, h);
        return [f, y, a * SLOTS[i][5], a * SLOTS[i][5], x];
      }),
      n,
      steel,
    );
  }
  // Red cables, punk (the user, 2026-11-08): from the socket over the insulators (insulators()) to
  // the first coil, from each flank cell's terminal up to the socket, a loop sticking out of the
  // right flank and a loose one off the back.
  const wires = [
    [
      [0.123, 0.118, 0.008],
      [0.16, 0.175, 0.01],
      [0.2, 0.142, 0],
    ],
    [
      [0.2, 0.142, 0],
      [0.228, 0.17, 0],
      [0.255, 0.138, 0],
    ],
    [
      [0.255, 0.138, 0],
      [0.29, 0.16, 0],
      [0.31, 0.097, 0],
    ],
    [onCell(1, 0.08), [0.13, 0.1, -0.07], onCell(0, 0.004, -0.022)],
    [onCell(2, 0.08), [0.13, 0.14, 0.08], onCell(0, 0.004, 0.022)],
    [
      [0.09, 0.094, 0.034],
      [0.07, 0.16, 0.09],
      [0.03, 0.09, 0.035],
    ],
    [
      [-0.08, 0.13, 0.01],
      [-0.11, 0.22, -0.01],
      [-0.15, 0.17, -0.03],
    ],
  ];
  for (const [a, c, b] of wires) {
    tube(
      out,
      [0, 1, 2, 3, 4, 5, 6].map((k): Station => {
        const t = k / 6;
        const p = [0, 1, 2].map(j => (1 - t) ** 2 * a[j] + 2 * t * (1 - t) * c[j] + t * t * b[j]);
        return [p[0], p[1], 0.0028, 0.0028, p[2]];
      }),
      lod ? 5 : 3,
      cable,
    );
  }
  return (railed[lod] = out);
};

/**
 * The feet of the rail gun's three cells (the user, 2026-11-08): the one in use standing on the
 * receiver's top, the capsule a swap replaces, and two smaller ones lying along its flanks low,
 * between the hands and under the counter, pointing forward. Each forward, up and across, how far it leans back and aside
 * (radians), and its size.
 */
const SLOTS = [
  [0.1, 0.121, 0, 0, 0, 1],
  [0.03, 0.072, -0.046, -Math.PI / 2, 0, 0.7],
  [0.03, 0.072, 0.046, -Math.PI / 2, 0, 0.7],
];
/** The point `h` up the axis of cell `i` from its foot (in the cell's size) and `x` across, forward, up and across in model space. */
const onCell = (i: number, h: number, x = 0): number[] => {
  const [f, y, xo, b, s, k] = SLOTS[i];
  h *= k;
  const [c, ax] = [Math.cos(b), [Math.cos(b) * Math.sin(s), -Math.sin(b)]];
  return [f + h * ax[1], y + h * c * Math.cos(s), xo + x + h * ax[0]];
};
/** The two insulators on the barrel, forward and the height of their foot. */
const POSTS = [
  [0.2, 0.091],
  [0.255, 0.087],
];
const posts: number[][] = [];

/**
 * The rail gun's two ceramic insulators standing on its barrel, stacks of four ribbed discs, built
 * once for each of 5 steps of `heat` (0 to 1): from grey green to orange as the gun heats, glowing
 * in its last quarter.
 */
export const insulators = (lod: number, heat = 0): number[] => {
  const h = Math.round(Math.min(Math.max(heat, 0), 1) * 4);
  return (posts[lod * 5 + h] ??= ((out: number[]) => {
    const glows = h > 2;
    const paint: Paint = (_, n) => {
      const lit = mix(CERAMIC[0], CERAMIC[1], Math.max(n[1], 0) ** 1.5 * 0.8);
      const [r, g, b] = mix(glows ? EMBER.map(c => c * 0.5) : lit, EMBER, h / 4);
      return [r, g, glows ? -2 : SHINE, b];
    };
    for (const [f, y] of POSTS) {
      tube(
        out,
        [
          [f, y, 0, 0],
          ...[0, 1, 2, 3].flatMap((k): Station[] => [
            [f, y + 0.002 + k * 0.011, 0.008, 0.008],
            [f, y + 0.005 + k * 0.011, 0.016, 0.016],
            [f, y + 0.008 + k * 0.011, 0.016, 0.016],
            [f, y + 0.011 + k * 0.011, 0.008, 0.008],
          ]),
          [f, y + 0.05, 0.005, 0.005],
          [f, y + 0.053, 0, 0],
        ],
        lod ? 8 : 5,
        paint,
      );
    }
    return out;
  })([]));
};

/** The weapon a gun model is, from a player or a flag: 0 the gun, 2 the rail gun (or true), 3 the laser rifle. */
export const kindOf = (p: Pick<PlayerState, 'railed' | 'rifled'> | boolean | number): number =>
  typeof p == 'number' ? p : typeof p == 'boolean' ? +p * 2 : p.rifled ? 3 : p.railed ? 2 : 0;

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
const [HOUSING_FOOT, HOUSING_BACK, HOUSING_SLOPE] = [0.085, -0.115, 0.8];

/** Appends the housing: its sides, its top and its two ends, in polished grey metal, the normals smooth round the top corners. */
const housing = (out: number[], lod: number) => {
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

/** The laser rifle's muzzle, the lens at the end of its shroud, and the middle of its handguard, the keel under its body where the left hand holds it from under it: the middle of the fist. */
export const RIFLE_MUZZLE: Vec3 = [0, 0.079, -0.512];
export const RIFLE_GRIP: Vec3 = [0, -0.004, -0.14];
/** The red of the laser, which blooms. */
export const LASER = [2.6, 0.55, 0.22];
const red: Paint = () => [LASER[0], LASER[1], -2, LASER[2]];
/** Dark olive gunmetal, lighter on its top faces. */
const olive = shade([0.05, 0.055, 0.05], [0.34, 0.36, 0.32]);
const rifled: number[][] = [];

/** Linear between the rows of `rows` (sorted by their first column) at `f`. */
const along = (rows: number[][], f: number): number[] => {
  const j = rows.findIndex(r => r[0] > f);
  const i = j < 0 ? rows.length - 1 : Math.max(j, 1);
  const [a, b] = [rows[i - 1], rows[i]];
  return a.map((v, k) => v + (b[k] - v) * clamp((f - a[0]) / (b[0] - a[0])));
};
/** Near-black for the grooves and slots, a bright lip under them, and three LEDs that bloom. */
const slot = shade([0.015, 0.015, 0.02], [0.05, 0.05, 0.06]);
const lip = shade([0.4, 0.42, 0.45], [0.9, 0.92, 0.95]);
const LEDS = [LASER, [1.8, 0.9, 0.1], GLOW];

/**
 * The rifle's small details (the user, 2026-11-09: grooves along it, screw heads, a little
 * electronics), on the near model only: two grooves along the top of the housing and one along each
 * side with a bright lip under it, cross-head screws on the housing and the body, a dark panel of
 * three LEDs on each side of the housing at the back, and a vent of five slots on each side of the butt.
 */
/** A flat quad `q` facing `n`, painted. */
const flat = (out: number[], q: Vec3[], n: Vec3, paint: Paint) => {
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
const rect = (
  out: number[],
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
const screw = (out: number[], c: Vec3, e: Vec3, w: Vec3, n: Vec3, k = 1) => {
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

const details = (out: number[]) => {
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
  // The handguard (the user, 2026-11-09: part of the gun, smooth, sized for the hollow of the left
  // hand, which holds it from under it): a rounded keel that swells out of the body's underside
  // and sinks back into it, in the body's olive; its middle is RIFLE_GRIP.
  tube(
    out,
    [
      [0.03, 0.02, 0, 0],
      [0.05, 0.012, 0.012, 0.012],
      [0.09, -0.004, 0.016, 0.016],
      [0.19, -0.004, 0.016, 0.016],
      [0.23, 0.012, 0.012, 0.012],
      [0.25, 0.022, 0, 0],
    ],
    n,
    olive,
  );
  // The pistol grip.
  tube(
    out,
    [
      [0.03, 0.07, 0, 0],
      [0.02, 0.05, 0.02, 0.022],
      [0, 0, 0.02, 0.023],
      [-0.02, -0.046, 0.021, 0.022],
      [-0.03, -0.06, 0, 0],
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

/** The rifle's power cell, built once: a box of olive metal along its own forward from its foot, a red band near the foot. */
export const cell = (lod: number): number[] =>
  (packs[lod] ??= ((out: number[]) => {
    const n = lod ? 8 : 4;
    tube(
      out,
      [
        [0, 0, 0, 0],
        [0.003, 0, 0.022, 0.03],
        [0.1, 0, 0.022, 0.03],
        [0.102, 0, 0, 0],
      ],
      n,
      olive,
    );
    tube(
      out,
      [
        [0.01, 0, 0.0228, 0.0308],
        [0.02, 0, 0.0228, 0.0308],
      ],
      n,
      red,
    );
    return out;
  })([]));
const packs: number[][] = [];

/**
 * The mouth of the gun's battery seat, in the battery's frame: a dark disc a little wider than it,
 * laid on the slanted shell where the battery goes in, 2 mm out of it. The shell's distance from
 * the battery's foot, in 0.1 mm, round two rings (measured on gun(1)).
 */
const WELL_HOLE = (() => {
  const out: number[] = [];
  const rims = [
    [0.0086, [226, 239, 257, 260, 258, 239, 226, 227, 225, 221, 225, 227]],
    [0.0172, [235, 278, 314, 320, 315, 278, 235, 237, 233, 225, 233, 237]],
  ] as const;
  const at = (k: number, j: number): Vec3 => [
    rims[k][0] * Math.cos((j * TAU) / 12),
    rims[k][0] * Math.sin((j * TAU) / 12),
    0.002 - rims[k][1][j % 12] / 1e4,
  ];
  for (let j = 0; j < 12; j++) {
    const c = [0.01, 0.01, 0.012];
    tri(out, [0, 0, -0.0198], at(0, j), at(0, j + 1), c);
    tri(out, at(0, j), at(1, j), at(1, j + 1), c);
    tri(out, at(0, j), at(1, j + 1), at(0, j + 1), c);
  }
  return out;
})();

/**
 * The gun's battery (the user, 2026-11-08), built once: a gunmetal cell in the grip, along its own
 * forward from its foot, which stands out under the lower shell with a band of glow round it.
 */
export const battery = (lod: number): number[] =>
  (cells[lod] ??= ((out: number[]) => {
    const n = lod ? 10 : 6;
    tube(
      out,
      [
        [0, 0, 0, 0],
        [0.003, 0, 0.016, 0.016],
        [0.09, 0, 0.016, 0.016],
        [0.092, 0, 0, 0],
      ],
      n,
      metal(0.35),
    );
    tube(
      out,
      [
        [0.008, 0, 0.0168, 0.0168],
        [0.018, 0, 0.0168, 0.0168],
      ],
      n,
      glow,
    );
    return out;
  })([]));
const cells: number[][] = [];

/**
 * The rail gun's cell (the user, 2026-11-08: its batteries in view), built once for each of 9 steps
 * of `level` (0 to 1): a threaded copper base (it screws into the socket on the gun), a column of
 * violet lightning as high as the level in a dark glass tube, in a cage of three steel posts, and a
 * cap with its terminal, standing along its own forward from its base.
 */
export const capsule = (lod: number, level = 1): number[] => {
  const l = Math.round(Math.min(Math.max(level, 0), 1) * 8);
  return (caps[lod * 9 + l] ??= ((out: number[]) => {
    const n = lod ? 10 : 6;
    tube(
      out,
      [
        [0, 0, 0, 0],
        ...[0.001, 0.003, 0.005, 0.007, 0.009, 0.011, 0.014].map((f, i): Station => [
          f,
          0,
          0.0175 + 0.0015 * (i % 2),
          0.0175 + 0.0015 * (i % 2),
        ]),
        [0.016, 0, 0.012, 0.012],
      ],
      n,
      copper,
    );
    const top = 0.014 + 0.006 * l;
    if (l) {
      tube(
        out,
        [
          [0.014, 0, 0.009, 0.009],
          [top, 0, 0.009, 0.009],
          [top + 0.001, 0, 0, 0],
        ],
        n,
        core,
      );
    }
    if (l < 8) {
      tube(
        out,
        [
          [top, 0, 0, 0],
          [top + 0.001, 0, 0.0095, 0.0095],
          [0.062, 0, 0.0095, 0.0095],
          [0.066, 0, 0, 0],
        ],
        n,
        shade(DARK, [0.2, 0.18, 0.3]),
      );
    }
    for (let k = 0; k < 3; k++) {
      const [c, s] = [Math.cos((k * TAU) / 3), Math.sin((k * TAU) / 3)];
      tube(
        out,
        [
          [0.014, 0.016 * s, 0.0025, 0.0025, 0.016 * c],
          [0.066, 0.016 * s, 0.0025, 0.0025, 0.016 * c],
        ],
        3,
        steel,
      );
    }
    tube(
      out,
      [
        [0.064, 0, 0.019, 0.019],
        [0.072, 0, 0.017, 0.017],
        [0.074, 0, 0.005, 0.005],
        [0.08, 0, 0.005, 0.005],
        [0.081, 0, 0, 0],
      ],
      n,
      steel,
    );
    return out;
  })([]));
};
const caps: number[][] = [];

/** Where the battery's foot sits seated, forward and up of the grip, and the way it goes up the grip (unit, forward and up). */
const SEAT = [-0.0434, -0.0868];
const UP_GRIP = [0.447, 0.894];
/** The rifle's cell: its foot under the body behind the grip, and the way it goes up into it. */
const WELL = [-0.13, -0.075];
const UP_WELL = [-0.1, 0.995];

export const ease = (t: number) => {
  const u = clamp(t);
  return u * u * (3 - 2 * u);
};
/** `t` from `a` to `b` as 0 to 1. */
export const span = (t: number, a: number, b: number) => clamp((t - a) / (b - a));

/** How far through the swap of the gun in hand `p` is, 0 to 1; -1 when it is not swapping. */
export const swapOf = (p: Pick<PlayerState, 'reload' | 'railed' | 'rifled'>): number =>
  p.reload ? 1 - p.reload / [GUN_RELOAD, 0, RAIL_RELOAD, RIFLE_RELOAD][kindOf(p)] : -1;

/**
 * The glow of a weapon `t` seconds after it came to hand: dark as it rises, then flickering up to
 * full at `end` (0.6 s; the gun's 1.4 s).
 */
export const power = (t: number, end = 0.6): number =>
  t >= end ? 1 : clamp((t - end / 4) / (end * 0.75)) * (0.65 + 0.35 * Math.sin(t * 95) ** 2);

/** The gun's boot `t` seconds after its button is pressed (PRESS): its light up by `lit`, its counter fading in from `from` to `up`, with the BOOT sound's whine, full at its beep (the user, 2026-11-09); the rifle's digits show at `digits`. */
export const GUN_ON = { lit: 0.95, from: 0.05, up: 0.45, digits: 1.05 };

/**
 * Seconds after a weapon comes to hand, or a swap puts its new battery in, that its button is
 * pressed, by the left index on a gun's left flank, by the right thumb on the katana's grip: it
 * powers on then, light and sound (the user, 2026-11-09). The rail gun's boot plays 1.4 times as
 * fast (combat.ts), so its press comes sooner.
 */
export const PRESS = 0.45;
export const pressAt = (kind: number) => (kind == 2 ? PRESS / 1.4 : PRESS);
/**
 * A tracker of the weapons each player has had in hand since taking them: true when the weapon in
 * `p`'s hand comes to it for the first time, the only time it is switched on (the user,
 * 2026-11-09). A weapon the player no longer carries (lost going down) is forgotten.
 */
export const firsts = () => {
  const had = new Map<number, Set<number>>();
  return (
    p: Pick<
      PlayerState,
      'id' | 'ammo' | 'blade' | 'rail' | 'rifle' | 'down' | 'wield' | 'rifled' | 'railed'
    >,
  ) => {
    const h = had.get(p.id) ?? new Set<number>();
    had.set(p.id, h);
    [p.ammo >= 0, p.blade, (p.rail ?? -1) >= 0, (p.rifle ?? -1) >= 0].forEach(
      (o, k) => o || h.delete(k),
    );
    const k = p.down ? -1 : p.wield ? 1 : p.rifled ? 3 : p.railed ? 2 : p.ammo >= 0 ? 0 : -1;
    return k >= 0 && !h.has(k) && !!h.add(k);
  };
};
/**
 * The rail gun's capsule `t` after the gun came to hand, the left hand on it at `at`: turned a
 * quarter of a turn to tune it on (the user, 2026-11-09), radians, as the screw turns it.
 */
export const tune = (t: number, at = PRESS) => -(Math.PI / 2) * ease(span(t, at - 0.03, at + 0.08));
/** The pressing finger `t` after a weapon came to hand, its press at `at`: where it was (0), on the button (1) by `at`, then back. */
export const poke = (t: number, at = PRESS) =>
  t < at ? ease(span(t, at - 0.16, at)) : 1 - ease(span(t, at + 0.08, at + 0.24));

/**
 * Each weapon's button by kind (the gun, the katana, the rail gun, the rifle), in its model space,
 * on its left flank, in sight, for the left index: its foot, the way it faces, how far it stands
 * out. The katana's on the top of its grip, under the right thumb.
 */
export const BUTTONS: [Vec3, Vec3, number][] = [
  [[-0.0405, 0.08, -0.02], unit([-0.86, -0.5, 0]), 0.002],
  [[-0.0036, 0.013, -0.02], unit([-0.3, 0.95, 0]), 0.003],
  [[-0.0313, 0.08, -0.01], unit([-0.98, -0.2, 0]), 0.002],
  [[-0.0271, 0.08, -0.02], unit([-0.89, 0.45, 0]), 0.002],
];
/** The right thumb's middle joint in a weapon's model space, the hand round its grip. */
const KNUCKLE: Vec3 = [-0.0148, 0.0463, -0.0198];
const [TS, TC] = [Math.sin(0.55), Math.cos(0.55)];
/** The way, in the hand (x toward the thumb, y its back, z the fingers), from the right thumb's middle joint to weapon `kind`'s button: the katana's. */
export const thumbTo = (kind: number): Vec3 => {
  const [foot, n, len] = BUTTONS[kind];
  const [x, y, z] = unit(sub(add(foot, n.map(v => v * len) as Vec3), KNUCKLE));
  return unit([y * TS - z * TC, x, -y * TC - z * TS]);
};
/** Weapon `kind`'s button for a model at `at` with axes [right, up, forward] (model -z forward): its top, and the way it faces. */
export const buttonAt = (kind: number, at: Vec3, [r, u, f]: Vec3[]): Vec3[] => {
  const [foot, n, len] = BUTTONS[kind];
  const w = (p: Vec3, o: Vec3) =>
    [0, 1, 2].map(i => o[i] + r[i] * p[0] + u[i] * p[1] - f[i] * p[2]) as Vec3;
  const top = add(foot, n.map(v => v * len) as Vec3);
  return [w(top, at), unit(w(n, [0, 0, 0]))];
};
const KNOB = dress(
  smooth(
    [
      [0.0035, 0],
      [0.0035, 1],
      [0, 1],
    ],
    8,
  ),
  [1, 1, 1],
);
/** Appends weapon `kind`'s button in model space, pushed in by `push` (0 to 1) of 1.5 mm, its glow `rgb` lit by `light`. */
export const button = (out: number[], kind: number, push: number, light: number, rgb: number[]) => {
  const [foot, n, len] = BUTTONS[kind];
  const from = out.length;
  place(
    out,
    KNOB,
    sub(foot, n.map(v => v * push * 0.0015) as Vec3),
    aim(n, [0, 1, 0]),
    [0, 0, 0],
    [1, 1, len],
    rgb.map(c => c * (0.15 + 0.85 * light)),
  );
  lit(out, from, 1);
};

/** When, in the swap of the gun or the rifle, the palm slaps the new battery home: it clicks then. */
export const TAP = 0.82;

/**
 * Where the battery or the capsule is at `s` of a swap (0 to 1; -1 none): how far out of its seat
 * along its axis (metres), how far round its axis (radians, the capsule's screw), and how far it
 * tumbles (radians). The old one comes out and goes, the new one comes in, the left hand bringing it.
 */
export const swapped = (s: number, kind: boolean | number): number[] => {
  if (s < 0) {
    return [0, 0, 0];
  }
  if (kindOf(kind) != 2) {
    // Slid out down the grip and dropped, then a new one up into it, 6 mm short of home, and
    // slapped home by the palm at TAP (the user, 2026-11-09).
    return s < 0.4
      ? [0.1 * ease(span(s, 0.15, 0.3)) + 0.6 * span(s, 0.3, 0.4) ** 2, 0, 0]
      : [0.006 * (1 - span(s, TAP - 0.02, TAP)) + 0.214 * (1 - ease(span(s, 0.4, 0.72))), 0, 0];
  }
  // It unscrews itself a turn and a half and jumps up spinning; then the hand brings a new one
  // down onto the socket and screws it in, three turns of the wrist.
  return s < 0.42
    ? [
        0.02 * ease(span(s, 0.1, 0.28)) + 0.35 * span(s, 0.28, 0.42) ** 1.5,
        -3 * Math.PI * ease(span(s, 0.1, 0.28)) - 9 * span(s, 0.28, 0.42),
        2.5 * span(s, 0.28, 0.42),
      ]
    : [0.09 * (1 - ease(span(s, 0.42, 0.58))) + 0.03 * (1 - span(s, 0.58, 0.88)), screwed(s)[0], 0];
};

/** The sixth of a turn of each of the three turns of the wrist that screw the capsule in. */
const STROKE = Math.PI / 3;

/**
 * The screwing of a new capsule at `s` of a swap: how far round it still is (radians, to 0 when it
 * is in), and how far the wrist has turned from where it took hold: with it through each stroke,
 * then back while the fingers let go.
 */
export const screwed = (s: number): number[] => {
  const u = span(s, 0.58, 0.88);
  const k = Math.min(Math.floor(u * 3), 2);
  const f = u * 3 - k;
  const turn = ease(f / 0.6);
  return [STROKE * (3 - k - turn), -STROKE * (f < 0.6 ? turn : 1 - ease((f - 0.6) / 0.4))];
};

/** The moments of a swap that sound, as shares of it: the battery let go and clicked home; the capsule jumping off and each turn of the screw. */
export const CUES = [
  [0.15, TAP],
  [0.28, 0.58, 0.68, 0.78],
];

/**
 * The frame of the battery (the capsule when `rail`) of a gun whose grip is at `at` and whose axes
 * are `ax`, `k` times its size, at `s` of a swap: its foot (base) and its axes, its forward along
 * the grip (up).
 */
export const loadFrame = (
  at: Vec3,
  ax: Vec3[],
  kind: boolean | number,
  s = -1,
  k = 1,
  i = 0,
  tuned = 0,
): [Vec3, Vec3[]] => {
  const [r, u, f] = ax;
  const w = kindOf(kind);
  const rail = w == 2;
  const [c, sn] = rail ? [0, 1] : w == 3 ? UP_WELL : UP_GRIP;
  const [fo, up, xo = 0, back = 0, side = 0] = rail ? SLOTS[i] : w == 3 ? WELL : SEAT;
  const [out, screw, tumble] = swapped(s, w);
  const twist = screw + tuned;
  // Forward up the grip (up), up across it: a turn about the gun's right.
  const fw = [0, 1, 2].map(i => f[i] * c + u[i] * sn) as Vec3;
  let uw = [0, 1, 2].map(i => u[i] * c - f[i] * sn) as Vec3;
  let rw = r;
  // The screw turns it about its own axis, the throw tips it over about the gun's right.
  const [tc, ts] = [Math.cos(twist), Math.sin(twist)];
  [rw, uw] = [
    rw.map((v, i) => v * tc + uw[i] * ts) as Vec3,
    uw.map((v, i) => v * tc - rw[i] * ts) as Vec3,
  ];
  const [bc, bs] = [Math.cos(tumble), Math.sin(tumble)];
  const fw2 = fw.map((v, i) => v * bc + uw[i] * bs) as Vec3;
  uw = uw.map((v, i) => v * bc - fw[i] * bs) as Vec3;
  const foot = [0, 1, 2].map(
    i => at[i] + k * (r[i] * xo + f[i] * fo + u[i] * up + fw[i] * (rail ? out : -out)),
  ) as Vec3;
  // A flank cell lies along the gun: turned about the gun's right, then about its forward.
  const [qb, qs] = [axis(r, back), axis(f, side)];
  return [foot, [rw, uw, fw2].map(v => turn(qs, turn(qb, v)))];
};

/**
 * The spark between the electrodes' tips at the time `t` (s), in model space: a thin glowing line
 * through four jagged points, a new shape 30 times a second.
 */
export const arc = (t: number): number[] => {
  let seed = (Math.floor(t * 30) % 9973) + 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const f = -RAIL_MUZZLE[2];
  const out: number[] = [];
  const st = [-1, -0.5, 0, 0.5, 1].map((k, i): Station => {
    const j = i % 4 ? 0.014 : 0;
    return [f + rnd() * j, RAIL_MUZZLE[1] + k * SPREAD * 0.85, 0.0022, 0.0022, rnd() * j];
  });
  tube(out, st, 3, arcing);
  return out;
};

/**
 * Where the left hand holds a rail gun whose grip is at `at` and whose axes are [right, up,
 * forward]: the middle of its front grip, and the way the grip runs from its foot up to the barrel,
 * which the thumb points along (see wield() in body.ts). For the laser rifle (`kind` 3): under its
 * handguard, the thumb along it, and the way the hand goes, across under it and up its right side.
 */
export const fore = (
  at: Vec3,
  [r, u, f]: Vec3[],
  kind: boolean | number = 2,
): [Vec3, Vec3, Vec3?] => {
  const rifle = kindOf(kind) == 3;
  const g = rifle ? RIFLE_GRIP : FOREGRIP;
  const p = [0, 1, 2].map(i => at[i] + r[i] * g[0] + u[i] * g[1] - f[i] * g[2]) as Vec3;
  // The rifle's handguard is held from under it, the palm up: the thumb along it on its left, the
  // hand across under it and the fingers up round its right side.
  return rifle
    ? [p, f, unit([0, 1, 2].map(i => 0.8 * r[i] + 0.6 * u[i]) as Vec3)]
    : [p, unit([0, 1, 2].map(i => u[i] - 0.19 * f[i]) as Vec3)];
};

/** fore() for the hand at `pos` turned by `q`, which holds the grip. */
export const foregrip = (pos: Vec3, q: Quat, kind: boolean | number = 2) =>
  fore(grip(pos, q), axes(q), kind);

/** The rail gun's lightning left as the counters show it: 99 when full (of `max`, a load by default), 0 when spent. */
export const charge = (rail: number, max = RAIL_MAX): number =>
  Math.ceil((Math.max(rail, 0) * 99) / max);

/** The electrodes' tips of a gun whose grip is at `at` and whose axes are [right, up, forward]. */
export const electrodes = (at: Vec3, [, u, f]: Vec3[]): Vec3[] =>
  [-1, 1].map(
    s =>
      [0, 1, 2].map(
        i => at[i] + u[i] * (RAIL_MUZZLE[1] + s * SPREAD) - f[i] * RAIL_MUZZLE[2],
      ) as Vec3,
  );

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
const [DW, DH, DT, DGAP] = [0.019, 0.0205, 0.005, 0.004];
/** The rectangle of each segment in a digit `w` wide, `h` tall, its segments `t` thick: across and up from its bottom left corner. */
const segments = (
  w: number,
  h: number,
  t: number,
): Record<string, [number, number, number, number]> => ({
  a: [0, h - t, w, h],
  b: [w - t, h / 2, w, h],
  c: [w - t, 0, w, h / 2],
  d: [0, 0, w, t],
  e: [0, 0, t, h / 2],
  f: [0, h / 2, t, h],
  g: [0, (h - t) / 2, w, (h + t) / 2],
});
const SEGMENTS = segments(DW, DH, DT);
/**
 * The counter on the gun's glossy black cut, in the middle of its outline (the user, 2026-11-09: no
 * screen or support of its own, the frame round and near the edge): the digits' middle up the face
 * from BACK, the half height the charge gauge counts from, the digits' scale.
 */
const [SM, SHH, DK] = [FACE[0], 0.0163, 1];
/** The digits' foot, so that they are in the middle of the screen; the charge gauge, a thin bar under them up the back face: where it starts and ends, and the gap between its cells. */
const DY = SM - (DH * DK) / 2;
const [GFROM, GTO, GGAP] = [SM - SHH + 0.0008, DY - 0.0004, 0.0012];
const readouts = new Map<number, number[]>();
/**
 * Printed circuit tracks round the digits, inside the frame (the user, 2026-11-09): the right
 * half's, mirrored to the left, each a run of [across, up from the middle] points ending in a pad.
 */
export const TRACKS = [
  [
    [0.0225, 0.004],
    [0.028, 0.004],
    [0.033, 0.009],
    [0.036, 0.009],
  ],
  [
    [0.0225, -0.004],
    [0.026, -0.004],
    [0.031, -0.009],
    [0.031, -0.016],
  ],
  [
    [0.0225, 0],
    [0.035, 0],
  ],
  [
    [0.004, 0.0125],
    [0.004, 0.017],
    [0.009, 0.022],
    [0.019, 0.022],
  ],
  [
    [0.014, 0.0125],
    [0.014, 0.016],
    [0.024, 0.016],
    [0.028, 0.02],
  ],
  [
    [0.008, -0.017],
    [0.008, -0.021],
    [0.013, -0.026],
  ],
  [
    [0.0185, -0.017],
    [0.0185, -0.023],
  ],
];

/**
 * The shots in the battery as two glowing seven-segment digits on a dark screen set in the back of
 * a small block on top of the body, in model space: cyan, red at 4 or fewer, thick segments that bloom only a
 * little, the screen framed in a line of their colour. The block is part of the readout, so only a gun that shows the ammo carries it. 99 at most.
 * While the gun charges, a gauge of CHARGE_MAX cells under the digits lights `level` of them, the
 * strength the shot would have; all orange at the full charge. Not `shown`: the block and the dark
 * screen only, the gun still booting.
 */
export const readout = (ammo: number, level = 0, shown = true): number[] => {
  const n = Math.min(Math.max(Math.floor(ammo), 0), 99);
  const key = (n * 8 + Math.min(Math.max(level, 0), CHARGE_MAX)) * 2 + +shown;
  let out = readouts.get(key);
  if (!out) {
    const v: number[] = (out = []);
    // The back face's axes: up its slope and out of it, from BACK.
    const slope: Vec3 = [0, BACK_N[2], -BACK_N[1]];
    const N = BACK_N;
    const at = (a: number, b: number, k: number): Vec3 => [
      BACK[0] + a,
      BACK[1] + slope[1] * b + N[1] * k,
      BACK[2] + slope[2] * b + N[2] * k,
    ];
    const rgb = n > 4 ? [0.25, 0.9, 1] : [1, 0.18, 0.12];
    /** The gauge's cells, the lit ones or the dim ones, while it charges. */
    const gauge = (on: boolean) => {
      const w = ((2 * DW + DGAP) * DK - (CHARGE_MAX - 1) * GGAP) / CHARGE_MAX;
      for (let c = 0; level > 0 && c < CHARGE_MAX; c++) {
        if (c < level === on) {
          const x = (-DW - DGAP / 2) * DK + c * (w + GGAP);
          const p = (a: number, b: number) => at(a, b, 0.0027);
          const rgb = !on
            ? [0.04, 0.12, 0.16]
            : level >= CHARGE_MAX
              ? [1.3, 0.6, 0.15]
              : [0.25, 0.9, 1];
          tri(v, p(x, GFROM), p(x + w, GFROM), p(x + w, GTO), rgb);
          tri(v, p(x, GFROM), p(x + w, GTO), p(x, GTO), rgb);
        }
      }
    };
    gauge(false);
    const from = v.length;
    [...(shown ? `${n}`.padStart(2, '0') : '')].forEach((ch, i) => {
      const x0 = (-DW - DGAP / 2 + i * (DW + DGAP)) * DK;
      for (const seg of DIGITS[+ch]) {
        const [a, b, d, e] = SEGMENTS[seg];
        // Alien glyphs (the user, 2026-11-09): each segment a thin slash, cut on the slant at both
        // ends, apart from the next, the digit leaning forward. Segments lie on the screen, a hair out of it.
        const p = (x: number, t: number) =>
          at(x0 + (x + (t - DH / 2) * 0.3) * DK, DY + t * DK, 0.0027);
        const h = d - a > e - b;
        const [u0, u1, w0, w1] = h
          ? [a + 0.0012, d - 0.0012, b, e]
          : [b + 0.0012, e - 0.0012, a, d];
        const [l, m, s] = [u1 - u0, (w0 + w1) / 2, (w1 - w0) * 0.32];
        const slash = [
          [0, m - s],
          [0.7, m - s],
          [1, m + s],
          [0.3, m + s],
        ].map(([k, w]) => (h ? p(u0 + k * l, w) : p(w, u0 + k * l)));
        if (!h) {
          slash.reverse();
        }
        tri(v, slash[0], slash[1], slash[2], rgb);
        tri(v, slash[0], slash[2], slash[3], rgb);
      }
    });
    // The lit cells and the frame glow with the digits.
    if (shown) {
      gauge(true);
      // Round, 2 mm inside the cut's smooth outline (the user, 2026-11-09), a band 2.4 mm wide (the user, 2026-11-09: wider), 1 mm
      // out of the face, clear of the outline 0.2 mm out.
      const ring = (j: number, g: number) =>
        at(
          (FACE[1] - g) * sgn(Math.cos((j * TAU) / 32)),
          FACE[0] + (FACE[2] - g) * sgn(Math.sin((j * TAU) / 32)),
          0.001,
        );
      for (let i = 0; i < 32; i++) {
        const [a, b, c, d] = [
          ring(i, 0.002),
          ring(i + 1, 0.002),
          ring(i + 1, 0.0044),
          ring(i, 0.0044),
        ];
        tri(v, a, b, c, rgb);
        tri(v, a, c, d, rgb);
      }
      // The tracks, 0.6 mm wide and dim, each run ending in a pad 1.4 mm square, mirrored.
      const dim = rgb.map(c => c * 0.35);
      const quad = (o: number[], q: number[], w: number, c: number[]) => {
        const l = Math.hypot(q[0] - o[0], q[1] - o[1]) || 1;
        const [ux, uy] = [((q[0] - o[0]) / l) * w, ((q[1] - o[1]) / l) * w];
        const p = (x: number, y: number) => at(x, SM + y, 0.0008);
        const [a, b, c2, d] = [
          p(o[0] - ux + uy, o[1] - uy - ux),
          p(q[0] + ux + uy, q[1] + uy - ux),
          p(q[0] + ux - uy, q[1] + uy + ux),
          p(o[0] - ux - uy, o[1] - uy + ux),
        ];
        tri(v, a, b, c2, c);
        tri(v, a, c2, d, c);
      };
      for (const s of [-1, 1]) {
        for (const t of TRACKS) {
          const m = t.map(([x, y]) => [s * x, y]);
          m.slice(1).forEach((q, i) => quad(m[i], q, 0.0003, dim));
          const e = m[m.length - 1];
          quad(
            e,
            [e[0] + 1e-6, e[1]],
            0.0007,
            rgb.map(c => c * 0.6),
          );
        }
      }
    }
    lit(v, from, 1);
    readouts.set(key, out);
  }
  return out;
};

const lcds = new Map<number, number[]>();
/**
 * The LCD on the rail gun: the middle of its screen, its half width and height, and the way it faces
 * (the user, 2026-11-08: square to the receiver's left flank, standing out of it like a camera's
 * screen opened out, facing back to the eye, a little up), with its right and up across that.
 */
const LCD: Vec3 = [-0.054, 0.104, -0.012];
const [LW, LH] = [0.019, 0.013];
const LN = unit([0, 0.25, 1]);
const LR = unit([LN[2], 0, -LN[0]]);
const LU: Vec3 = [LN[1] * LR[2], LN[2] * LR[0] - LN[0] * LR[2], -LN[1] * LR[0]];

/**
 * The rail gun's counter, a small LCD out of the left of its receiver turned to the player, in model space
 * (the user, 2026-11-08: like the screen on the back of a digital camera), in a dark case: neon like
 * the others' (the user, 2026-11-08), two glowing violet digits on a dark screen framed in a line of
 * their colour, red at 5 or less. It counts as the HUD does (charge()): a full capsule is 33.
 */
export const lcd = (ammo: number): number[] => {
  const n = Math.min(Math.max(Math.floor(ammo), 0), 99);
  let v = lcds.get(n);
  if (!v) {
    const out: number[] = (v = []);
    /** A point on the screen, `a` right and `b` up from its middle, `d` out of it. */
    const p = (a: number, b: number, d = 0): Vec3 =>
      [0, 1, 2].map(i => LCD[i] + LR[i] * a + LU[i] * b + LN[i] * d) as Vec3;
    const quad = (a0: number, b0: number, a1: number, b1: number, d: number, rgb: number[]) => {
      tri(out, p(a0, b0, d), p(a1, b0, d), p(a1, b1, d), rgb);
      tri(out, p(a0, b0, d), p(a1, b1, d), p(a0, b1, d), rgb);
    };
    /** A dark box across the screen's plane, from `d0` behind to `d1` in front. */
    const box = (a0: number, b0: number, a1: number, b1: number, d0: number, d1: number) => {
      quad(a0, b0, a1, b1, d1, DARK);
      quad(a1, b0, a0, b1, d0, DARK);
      for (const [x0, y0, x1, y1] of [
        [a0, b1, a0, b0],
        [a1, b0, a1, b1],
        [a0, b0, a1, b0],
        [a1, b1, a0, b1],
      ]) {
        tri(out, p(x0, y0, d0), p(x1, y1, d0), p(x1, y1, d1), DARK);
        tri(out, p(x0, y0, d0), p(x1, y1, d1), p(x0, y0, d1), DARK);
      }
    };
    box(-LW - 0.003, -LH - 0.003, LW + 0.003, LH + 0.003, -0.016, 0.0004);
    quad(-LW, -LH, LW, LH, 0.0008, DARK);
    const from = out.length;
    // Red under a sixth of a capsule (33 full): the HUD's count.
    const rgb = n > 5 ? [0.7, 0.45, 1.1] : [1.2, 0.3, 0.12];
    // The frame, a band just inside the screen's edge.
    const f = 0.0012;
    quad(-LW, -LH, LW, f - LH, 0.0014, rgb);
    quad(-LW, LH - f, LW, LH, 0.0014, rgb);
    quad(-LW, f - LH, f - LW, LH - f, 0.0014, rgb);
    quad(LW - f, f - LH, LW, LH - f, 0.0014, rgb);
    // The digits, scaled from the pistol's: 1.6 cm tall.
    const k = (2 * LH * 0.6) / DH;
    [...`${n}`.padStart(2, '0')].forEach((ch, i) => {
      const a0 = -(DW + DGAP / 2) * k + i * (DW + DGAP) * k;
      for (const seg of DIGITS[+ch]) {
        const [x0, y0, x1, y1] = SEGMENTS[seg];
        quad(a0 + x0 * k, (y0 - DH / 2) * k, a0 + x1 * k, (y1 - DH / 2) * k, 0.0014, rgb);
      }
    });
    lit(out, from, 1);
    lcds.set(n, out);
  }
  return v;
};

const scopes = new Map<number, number[]>();
/**
 * The counter's screen fills the housing's sloping back above the body (the user, 2026-11-09), but
 * for 1.3 mm of metal round it: its foot and top heights, its middle, its up, the way it faces; half
 * its height up the face, half its width at the foot and at the top (the face's, under its rounded top).
 */
const [S0, S1] = [0.099, 0.1325];
const SC: Vec3 = [
  0,
  (S0 + S1) / 2,
  -(HOUSING_BACK + HOUSING_SLOPE * ((S0 + S1) / 2 - HOUSING_FOOT)),
];
const SU = unit([0, 1, -HOUSING_SLOPE]);
const SN: Vec3 = [0, -SU[2], SU[1]];
const [SH, SB, ST] = [(S1 - S0) / 2 / SU[1], 0.019, 0.0145];
/** The digits on it: width, height, thickness of a segment, gap between the two; well inside the ring (the user, 2026-11-09). */
const [RW, RH, RT, RGAP] = [0.0075, 0.0155, 0.0022, 0.0025];
const RSEG = segments(RW, RH, RT);

/**
 * The laser rifle's counter (`n` rounds in its cell), in model space: a trapezoid screen, narrow at
 * the top, set in the sloped back of the housing and turned to the eye, ringed in a line of the
 * digits' colour (cyan, red at 7 or fewer), with the two digits once `shown`. All glow but the dark screen.
 */
export const scope = (n: number, shown = true): number[] => {
  n = Math.min(Math.max(Math.floor(n), 0), 99);
  const key = n * 2 + +shown;
  let v = scopes.get(key);
  if (!v) {
    const out: number[] = (v = []);
    /** A point `a` right of the middle, `b` up the screen, `d` out of it. */
    const p = (a: number, b: number, d: number): Vec3 =>
      [0, 1, 2].map(i => SC[i] + (i ? 0 : a) + SU[i] * b + SN[i] * d) as Vec3;
    /** Half the width at `b` up the screen, `k` times it. */
    const half = (b: number, k = 1) => k * (SB + ((ST - SB) * (b + SH)) / (2 * SH));
    const quad = (a0: number, b0: number, a1: number, b1: number, d: number, rgb: number[]) => {
      tri(out, p(a0, b0, d), p(a1, b0, d), p(a1, b1, d), rgb);
      tri(out, p(a0, b0, d), p(a1, b1, d), p(a0, b1, d), rgb);
    };
    // The dark screen, its corners on the trapezoid.
    const [h, t] = [half(-SH), half(SH)];
    tri(out, p(-h, -SH, 0.004), p(h, -SH, 0.004), p(t, SH, 0.004), DARK);
    tri(out, p(-h, -SH, 0.004), p(t, SH, 0.004), p(-t, SH, 0.004), DARK);
    const from = out.length;
    const rgb = n > 7 ? [0.25, 0.75, 1.05] : [1.2, 0.3, 0.12];
    // The ring: each side a thin band.
    const ring = 0.0014;
    for (const s of [-1, 1]) {
      const [x0, x1] = [s * half(-SH), s * half(SH)];
      tri(
        out,
        p(x0, -SH, 0.0045),
        p(x0 - s * ring, -SH, 0.0045),
        p(x1 - s * ring, SH, 0.0045),
        rgb,
      );
      tri(out, p(x0, -SH, 0.0045), p(x1 - s * ring, SH, 0.0045), p(x1, SH, 0.0045), rgb);
      quad(
        -half(s * SH),
        s * SH - (s > 0 ? ring : 0),
        half(s * SH),
        s * SH + (s < 0 ? ring : 0),
        0.0045,
        rgb,
      );
    }
    if (shown) {
      // Two digits in the middle of the screen, well clear of its ring.
      [...`${n}`.padStart(2, '0')].forEach((ch, i) => {
        const a0 = -RW - RGAP / 2 + i * (RW + RGAP);
        for (const seg of DIGITS[+ch]) {
          const [x0, y0, x1, y1] = RSEG[seg];
          quad(a0 + x0, y0 - RH / 2, a0 + x1, y1 - RH / 2, 0.005, rgb);
        }
      });
    }
    lit(out, from, 1);
    scopes.set(key, out);
  }
  return v;
};

/** A puff of smoke, built once: a ball of radius 1, light grey smoke (layer -3: see-through, soft where seen edge-on), its opacity in green. */
const PUFF: number[] = [];
tube(
  PUFF,
  [
    [-1, 0, 0, 0],
    [-0.7, 0, 0.71, 0.71],
    [0, 0, 1, 1],
    [0.7, 0, 0.71, 0.71],
    [1, 0, 0, 0],
  ],
  8,
  () => [0.3, 0.95, -3, 0.32],
);
/**
 * The smoke off the overheated rail gun (the user, 2026-11-09) at the time `t`, for the gun whose
 * grip is at `at`, turned by `ax` and `k` times its size: SMOKE puffs, each born small and thick on
 * the coils, rising 30 cm straight up and drifting aside as it swells and thins away over 1.4 s, one
 * after another.
 */
const SMOKE = 12;
const WORLD: Vec3[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
const smoke = (out: number[], at: Vec3, [r, u, f]: Vec3[], k: number, t: number) => {
  for (let i = 0; i < SMOKE; i++) {
    const p = (t * 0.7 + i / SMOKE) % 1;
    const g = 0.3 + 0.12 * ((i * 0.618) % 1);
    const m: Vec3 = [0, axisY(g) + 0.02, -g];
    const side = Math.sin(i * 2.4) * 0.07 * p;
    const c = [0, 1, 2].map(
      j => at[j] + k * (r[j] * (m[0] + side) + u[j] * m[1] - f[j] * m[2]) + (j == 1 ? 0.3 * p : 0),
    ) as Vec3;
    place(out, PUFF, c, WORLD, [0, 0, 0], k * (0.015 + 0.07 * p), [1, (1 - p) ** 1.2, 1]);
  }
};

/**
 * How a gun is drawn beyond its place: its glow from 0 (off) to 1, the swap under way (0 to 1, -1
 * none), whether its battery or capsule holds any, how far the gun's counter has faded in (0 dark,
 * 1 lit) and whether the rifle's digits show; for the rail gun the level of its three cells (the
 * one in use, then the two in reserve), its heat (0 to 1) and whether it overheated.
 */
export interface Lit {
  light?: number;
  swap?: number;
  empty?: boolean;
  screen?: number;
  digits?: boolean;
  cells?: number[];
  heat?: number;
  hot?: boolean;
  /** How far the thumb has its button in, 0 to 1. */
  press?: number;
  /** How far the rail gun's capsule is turned on (radians, tune()). */
  tune?: number;
}

/** The levels of the rail gun's three cells for `p` (0 to 1): the capsule in use, then what it carries beside, a capsule's worth to each. */
export const cellsOf = (p: Pick<PlayerState, 'rail' | 'cap'>): number[] => {
  const [c, r] = [p.cap ?? 0, Math.max(0, (p.rail ?? 0) - (p.cap ?? 0))];
  return [c, r, r - RAIL_CAP].map(v => clamp(v / RAIL_CAP));
};

/**
 * Appends the gun (the rail gun or the laser rifle by `kind`, the rail gun's spark at the time `t`) held in the hand at `pos`
 * with the world rotation `q`, `k` times its size about the grip, with the ammo on its back when
 * given, and the charge gauge at `level`; its battery (capsule) where the swap has it, its glow and
 * its counter dimmed with `light`, and the spark only when it is all on.
 */
export const held = (
  out: number[],
  pos: Vec3,
  q: Quat,
  lod: number,
  k = 1,
  ammo?: number,
  level = 0,
  kind: boolean | number = 0,
  t = 0,
  {
    light = 1,
    swap = -1,
    empty = false,
    screen = 1,
    digits = true,
    cells = [1, 1, 1],
    heat = 0,
    hot = false,
    press = 0,
    tune = 0,
  }: Lit = {},
) => {
  const [at, ax] = [grip(pos, q), axes(q)];
  const w = kindOf(kind);
  const rail = w == 2;
  const d = 0.08 + 0.92 * light;
  const from = out.length;
  // The rail gun's cell in use shows its level: none as the old one goes, full as the new one comes.
  place(
    out,
    rail
      ? capsule(lod, swap < 0 ? cells[0] : +(swap > 0.42))
      : [battery, cell, capsule, cell][w](lod),
    ...loadFrame(at, ax, w, swap, k, 0, tune),
    [0, 0, 0],
    k,
  );
  dimmed(out, from, empty && !rail ? 0.08 : 1);
  // Overheated, the cells flicker red and smoke rises off the coils (smoke()); no spark idles
  // between the electrodes. The counter stays steady (the user, 2026-11-09).
  const blink = hot && t * 9 - Math.floor(t * 9) < 0.5;
  if (rail) {
    for (const i of [1, 2]) {
      place(
        out,
        capsule(lod, cells[i]),
        ...loadFrame(at, ax, w, -1, k, i),
        [0, 0, 0],
        k * SLOTS[i][5],
      );
    }
    for (let i = from + 8; blink && i < out.length; i += STRIDE) {
      if (out[i] == -2) {
        [out[i - 2], out[i - 1], out[i + 1]] = EMBER;
      }
    }
    place(out, insulators(lod, heat), at, ax, [0, 0, 0], k);
    if (hot) {
      smoke(out, at, ax, k, t);
    }
  }
  place(out, [gun, gun, railgun, rifle][w](lod), at, ax, [0, 0, 0], k);
  if (rail && light > 0.98 && swap < 0 && !hot) {
    place(out, arc(t), at, ax, [0, 0, 0], k);
  }
  if (ammo !== undefined && w == 3) {
    place(out, scope(ammo, digits && light > 0.5), at, ax, [0, 0, 0], k);
  } else if (ammo !== undefined && rail && light > 0.3) {
    place(out, lcd(ammo), at, ax, [0, 0, 0], k);
  }
  dimmed(out, from, d);
  // Through a swap of the gun, the dark hole of its battery's seat under the grip while the battery
  // is out of it (the user, 2026-11-09); the battery covers it home.
  if (!w && swap >= 0 && swapped(swap, 0)[0] > 0) {
    place(out, WELL_HOLE, ...loadFrame(at, ax, 0, -1, k), [0, 0, 0], k);
  }
  // The button that switches it on; the rail gun is switched on by its capsule (tune()).
  if (!rail) {
    const knob: number[] = [];
    button(knob, w, press, light, w == 3 ? [1, 0.25, 0.15] : [0.25, 0.9, 1]);
    place(out, knob, at, ax, [0, 0, 0], k);
  }
  // The gun's counter fades in on its own, with the boot sound, without the gun's flicker (the user, 2026-11-09).
  if (ammo !== undefined && w < 2) {
    const c = out.length;
    place(out, readout(ammo, level), at, ax, [0, 0, 0], k);
    dimmed(out, c, screen);
  }
};

/** The muzzle of a gun (the rail gun's or the rifle's by `kind`) whose grip is at `at` and whose axes are [right, up, forward]. */
export const tip = (at: Vec3, [, u, f]: Vec3[], kind: boolean | number = 0): Vec3 => {
  const m = [MUZZLE, MUZZLE, RAIL_MUZZLE, RIFLE_MUZZLE][kindOf(kind)];
  return [0, 1, 2].map(i => at[i] + u[i] * m[1] - f[i] * m[2]) as Vec3;
};

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

/**
 * Where a runner holds the gun when it fires at `to`: the grip, a little right of and below the eye,
 * and the gun's axes. The rail gun, in both hands like a rifle, is nearer the chest, so that the
 * left hand reaches its front grip.
 */
export const aimed = (p: PlayerState, to: Vec3): [Vec3, Vec3[]] => {
  const [r, u, f] = basis(p.yaw, p.pitch);
  const eye: Vec3 = [p.x, p.y + eyeHeight(p), p.z];
  const [x, y, z] = p.railed || p.rifled ? [0.12, 0.2, 0.28] : [0.2, 0.17, 0.42];
  const grip = [0, 1, 2].map(i => eye[i] + r[i] * x - u[i] * y + f[i] * z) as Vec3;
  return [grip, pointed(grip, to, r, u)];
};
