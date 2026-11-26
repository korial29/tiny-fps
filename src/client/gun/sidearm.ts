// The alien sidearm: its model, its marks and the circuit traced on its bulb.
import { TAU } from '../../shared/physics';
import { SHINE, STRIDE, sub, unit } from '../mesh';
import type { Vec3 } from '../mesh';
import type { Out } from '../verts';
import { mix, ring, sgn, tube } from './loft';
import type { Paint, Station } from './loft';
import { glow, metal, shade } from './paint';
import { flat } from './rifle';

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
export const built: number[][] = [];
/**
 * The pistol's back (the user, 2026-11-09: like the rifle's counter, the top of the gun in one
 * piece, cut by a straight leaning face): the face through BACK, facing BACK_N, back and up toward
 * the player. The counter's support, a glossy black rounded trapezoid, sits on it (readout()).
 */
export const BACK: Vec3 = [0, 0.125, 0.04];
export const BACK_N = unit([0, 0.469, 0.883]);
/** Glossy black, the cut face and the screen's support on it: [r, g, layer, b]. */
const GLOSS = [0.012, 0.012, SHINE, 0.018];
/** The smooth outline over the cut: its middle up the face from BACK, its half width and half height, holding the cut's polygon. */
export const FACE = [-0.0145, 0.044, 0.0334];
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
const circuits = (out: Out) => {
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
