// The mezzanine's stairs in the flag's hall as a steel gangway (the user, 2026-11-28: not a block of
// concrete): two deep side stringers, open treads of grating with a lit nosing, a dark plate under
// them seen between the treads, a sloped hand rail and a middle rail each side that run on to the
// mezzanine's railings, and a cage of bars under the flight. It keeps the ghosts' steps
// (shared/moonbase.ts FLIGHT) to collide with, solid down to the floor: what lies under the treads
// and behind the bars is never reached.
import { FLIGHT } from '../../shared/moonbase';
import { box, face } from '../brick';
import { capsule, dress, segment } from '../mesh';
import type { Vec3 } from '../mesh';
import type { Out } from '../verts';
import { INK, IRON, TRIM } from './constants';
import { quad } from './kit';

const ROD = dress(capsule(1, [1, 1], 6, [0, 0]), [1, 1, 1]);
const [STEEL, TREAD, LED] = [
  [0.6, 0.62, 0.66],
  [0.44, 0.46, 0.5],
  [0.75, 0.85, 1],
];

/** The flight's ends and sides, from its ghosts: z0 at the floor, z1 at the mezzanine. */
const [X0, X1] = [FLIGHT[0].min[0], FLIGHT[0].max[0]];
const [Z0, Z1, TOP] = [FLIGHT[0].min[2], FLIGHT.at(-1)!.max[2], FLIGHT.at(-1)!.max[1]];
const [RUN, RISE] = [(Z1 - Z0) / FLIGHT.length, TOP / FLIGHT.length];
/** The line through the treads' back edges, from the floor at z0 to the mezzanine at z1. */
const pitch = (z: number) => ((z - Z0) * TOP) / (Z1 - Z0);
/** How thick a stringer is, how far it stands over the line and under it, the rails over the nosings. */
const [SIDE, OVER, UNDER, HAND, MID] = [0.08, 0.55, 0.32, 1.06, 0.56];

/** A plate along x from x0 to x1 whose side is the convex polygon `p` in (z, y): two sides and its edges. */
const plate = (o: Out, p: number[][], x0: number, x1: number, rgb: number[]) => {
  const mid: Vec3 = [
    (x0 + x1) / 2,
    p.reduce((s, q) => s + q[1], 0) / p.length,
    p.reduce((s, q) => s + q[0], 0) / p.length,
  ];
  for (const x of [x0, x1]) {
    face(
      o,
      p.map(([z, y]) => [x, y, z]),
      rgb,
      mid,
    );
  }
  p.forEach(([z, y], i) => {
    const [w, v] = p[(i + 1) % p.length];
    face(
      o,
      [
        [x0, y, z],
        [x1, y, z],
        [x1, v, w],
        [x0, v, w],
      ],
      rgb,
      mid,
    );
  });
};

/** A rod through the points, `r` thick. */
const rail = (o: Out, p: Vec3[], r: number) =>
  p.slice(1).forEach((q, i) => segment(o, ROD, p[i], q, [1, 0, 0], 1, r, STEEL));

/** The gangway, red's half. */
export const gangway = (o: Out) => {
  const top = pitch(Z1 - 0.4) + OVER;
  const foot = Z0 + (UNDER * (Z1 - Z0)) / TOP;
  const under = TOP - UNDER - 0.08;
  // The stringers: from the floor at the flight's foot up its pitch to the mezzanine's edge.
  const side = [
    [Z0, 0],
    [foot, 0],
    [Z1, under],
    [Z1, top],
    [Z1 - 0.4, top],
    [Z0, OVER],
  ];
  plate(o, side, X0, X0 + SIDE, IRON);
  plate(o, side, X1 - SIDE, X1, IRON);
  const [a, b] = [X0 + SIDE, X1 - SIDE];
  // The dark plate under the treads, seen between them.
  const low = Z0 + (0.1 * (Z1 - Z0)) / TOP;
  face(
    o,
    [
      [a, 0, low],
      [b, 0, low],
      [b, TOP - 0.1, Z1],
      [a, TOP - 0.1, Z1],
    ],
    INK,
    [0, -10, Z1],
  );
  // The treads: a plate of grating, slots across it, a steel nosing with a line of light.
  FLIGHT.forEach((_, i) => {
    const [z, y] = [Z0 + i * RUN, (i + 1) * RISE];
    // Plain boxes, less the faces hidden in the stringers and over the dark plate.
    box(o, [a, y - 0.05, z], [b, y, z + RUN], TREAD, 4 | 16 | 32);
    for (let s = 0.14; s < RUN - 0.05; s += 0.09) {
      quad(
        o,
        [
          [a + 0.06, y + 0.002, z + s],
          [a + 0.06, y + 0.002, z + s + 0.035],
          [b - 0.06, y + 0.002, z + s + 0.035],
          [b - 0.06, y + 0.002, z + s],
        ],
        TRIM,
      );
    }
    box(o, [a, y - 0.07, z - 0.02], [b, y + 0.004, z + 0.08], STEEL, 2 | 4 | 16 | 32);
    quad(
      o,
      [
        [a + 0.05, y - 0.055, z - 0.022],
        [b - 0.05, y - 0.055, z - 0.022],
        [b - 0.05, y - 0.03, z - 0.022],
        [a + 0.05, y - 0.03, z - 0.022],
      ],
      LED,
    );
  });
  // Each side: posts on the stringer, the hand rail and the middle rail up the pitch then level
  // over the mezzanine to its railings, which stand 2.5 m out at z1 + 0.25 (shared PARAPETS).
  const over = Z1 + 0.25;
  const bend = Z1 - RUN;
  for (const [x, out] of [
    [X0 + SIDE / 2, X0 - 1],
    [X1 - SIDE / 2, X1 + 1],
  ]) {
    const posts = [Z0 + 0.15, ...[1, 2, 3].map(k => Z0 + (k * (bend - Z0)) / 3.4), over];
    const at = (z: number, h: number) => Math.min(pitch(z) + RISE + h, TOP + h);
    for (const z of posts) {
      const y = z > Z1 ? TOP : pitch(z) + OVER;
      segment(o, ROD, [x, y, z], [x, at(z, HAND) - 0.02, z], [1, 0, 0], 1, 0.035, STEEL);
    }
    for (const [h, r] of [
      [HAND, 0.04],
      [MID, 0.022],
    ]) {
      rail(
        o,
        [
          [x, at(Z0 + 0.15, h), Z0 + 0.15],
          [x, at(bend, h), bend],
          [x, at(over, h), over],
          [out, at(over, h), over],
        ],
        r,
      );
    }
  }
  // The cage under the flight: a dark back set in, flat bars each 0.3 m from the floor to the stringer,
  // and at the back, under the mezzanine, the same across.
  const bars = (x: number) => {
    face(
      o,
      [
        [x, 0, foot],
        [x, 0, Z1],
        [x, under, Z1],
      ],
      INK,
      [(X0 + X1) / 2, 0, Z1],
    );
    const lo = x < (X0 + X1) / 2 ? x - 0.04 : x + 0.04;
    for (let z = foot + 0.3; z < Z1 - 0.05; z += 0.3) {
      const y = ((z - foot) * under) / (Z1 - foot);
      face(
        o,
        [
          [lo, 0, z - 0.018],
          [lo, 0, z + 0.018],
          [lo, y, z + 0.018],
          [lo, y, z - 0.018],
        ],
        TRIM,
        [(X0 + X1) / 2, 0, z],
      );
    }
  };
  bars(X0 + SIDE / 2 + 0.02);
  bars(X1 - SIDE / 2 - 0.02);
  quad(
    o,
    [
      [a, 0, Z1 - 0.02],
      [b, 0, Z1 - 0.02],
      [b, under, Z1 - 0.02],
      [a, under, Z1 - 0.02],
    ],
    INK.map(v => v * 0.6),
  );
};
