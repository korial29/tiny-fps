// What is drawn of the moon base (docs/MOON.md), red's half: the dome and its windows, the tubes
// and the modules' windows, on the boxes of shared/moonbase.ts. moonscape.ts calls moonbase() and
// mirrors it for blue: it imports this file, never the other way, so the helpers both use are here.
import { DOME, MODULES, TUBES } from '../shared/moonbase';
import { TAU } from '../shared/physics';
import { glow, tri } from './flag';
import { dot, dress, place, segment, smooth, sub } from './mesh';
import type { Vec3 } from './mesh';

const PAINT = [0.8, 0.82, 0.86];
/** A model whose length runs up (y): the frame place() takes. */
export const UP: Vec3[] = [
  [1, 0, 0],
  [0, 0, 1],
  [0, 1, 0],
];

export const cross = (u: Vec3, v: Vec3): Vec3 => [
  u[1] * v[2] - u[2] * v[1],
  u[2] * v[0] - u[0] * v[2],
  u[0] * v[1] - u[1] * v[0],
];
/** A convex polygon of one colour, wound so that it faces away from `away` when given. */
export const face = (o: number[], p: Vec3[], rgb: number[], away?: Vec3) => {
  const n = cross(sub(p[1], p[0]), sub(p[2], p[0]));
  const q = away && dot(n, sub(p[0], away)) < 0 ? [...p].reverse() : p;
  for (let k = 1; k < q.length - 1; k++) {
    tri(o, q[0], q[k], q[k + 1], rgb);
  }
};
/** What `make` adds to `o` glows, k times its colour. */
export const lit = (o: number[], k: number, make: () => void) => {
  const from = o.length;
  make();
  glow(o, from, k);
};

const TUBE = dress(
  smooth(
    [
      [1, 0],
      [1, 1],
    ],
    12,
  ),
  PAINT,
);
const RIB = dress(
  smooth(
    [
      [1.06, 0],
      [1.06, 0.3],
    ],
    12,
  ),
  [0.35, 0.36, 0.4],
);

/** The dome at (x, z): a drum with a band of windows on a hemisphere over the stepped tiers (radius 22, tops to 16). */
const dome = (o: number[], x: number, z: number) => {
  const R = 22.4;
  const arc = Array.from({ length: 9 }, (_, j): [number, number] => {
    const a = ((j + 1) / 10) * (TAU / 4);
    return [R * Math.cos(a), 5 + 12 * Math.sin(a)];
  });
  place(
    o,
    dress(smooth([[R, 0], [R, 5], ...arc, [0, 17]], 48), PAINT),
    [x, 0, z],
    UP,
    [0, 0, 0],
    1,
  );
  // 70 panes of 1.2 x 1 m, each in a dark frame.
  const p = (t: number, y: number, e: number): Vec3 => [
    x + (R + e) * Math.cos(t),
    y,
    z + (R + e) * Math.sin(t),
  ];
  for (let i = 0; i < 70; i++) {
    const t = (i * TAU) / 70;
    const quad = (w: number, y0: number, y1: number, e: number) =>
      [
        [-w, y0],
        [w, y0],
        [w, y1],
        [-w, y1],
      ].map(([a, y]) => p(t + a / R, y, e));
    face(o, quad(0.72, 1.5, 2.9, 0.04), [0.06, 0.06, 0.08], [x, 2.2, z]);
    lit(o, 0.56, () => face(o, quad(0.6, 1.7, 2.7, 0.07), [1, 0.85, 0.5], [x, 2.2, z]));
  }
};

/** A rounded tube over each tube box of the map, from the module to inside the dome, with a rib every 5 m. */
const tubes = (o: number[]) =>
  TUBES.forEach(({ min, max }) => {
    const k = max[0] - min[0] > max[2] - min[2] ? 0 : 2;
    const [lo, hi, mid] = [min[k], max[k], (min[2 - k] + max[2 - k]) / 2];
    const dome = DOME[k / 2];
    const [a0, b0] =
      Math.abs(lo - dome) < Math.abs(hi - dome) ? [lo - 4, hi + 0.5] : [lo - 0.5, hi + 4];
    const at = (t: number): Vec3 => (k ? [mid, 1.75, t] : [t, 1.75, mid]);
    const [a, b] = [at(a0), at(b0)];
    const w = (max[2 - k] - min[2 - k]) / 2 + 0.1;
    segment(o, TUBE, a, b, [0, 1, 0], 1, [1.75, w]);
    for (let d = 5; d < b0 - a0 - 1; d += 5) {
      segment(o, RIB, at(a0 + d), at(a0 + d + 0.3), [0, 1, 0], 0.3, [1.75, w]);
    }
  });

/** The strips of windows on the long faces of the two module boxes of the map. */
const modules = (o: number[]) => {
  for (const { min, max } of MODULES) {
    const mid: Vec3 = [(min[0] + max[0]) / 2, 2.5, (min[2] + max[2]) / 2];
    for (const s of [-1, 1]) {
      const z = s > 0 ? max[2] : min[2];
      for (let k = 0; k < 7; k++) {
        const x = min[0] + 1 + 2 * k;
        const quad = (w: number, y0: number, y1: number, e: number): Vec3[] =>
          [
            [-w, y0],
            [w, y0],
            [w, y1],
            [-w, y1],
          ].map(([a, y]) => [x + a, y, z + s * e]);
        face(o, quad(0.72, 2.6, 3.8, 0.02), [0.06, 0.06, 0.08], mid);
        lit(o, 0.5, () => face(o, quad(0.6, 2.7, 3.7, 0.04), [0.9, 0.95, 1], mid));
      }
    }
  }
};

/** Red's half of the base: the dome, the tubes and the modules' windows. */
export const moonbase = (o: number[]): void => {
  dome(o, DOME[0], DOME[1]);
  tubes(o);
  modules(o);
};
