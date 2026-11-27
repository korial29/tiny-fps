// The command room's computer, on the dais (the user, 2026-11-27): the console's box (post in
// shared/station.ts, a ghost) dressed as a desk with a plinth and vents, two banks of keys, a
// tower of screens at its back and cables down to the dais. The round red button in the middle of
// the desk moves, so button.ts draws it each frame; this is drawn once with the scenery. No DOM.
import { knob } from '../../shared/station';
import type { StationDef } from '../../shared/station';
import type { Vec3 } from '../mesh';
import { bar, slab, vert } from './kit';
import type { Out } from './kit';

const CASE = [0.2, 0.22, 0.26];
const TOP = [0.42, 0.45, 0.5];
const DARK = [0.05, 0.05, 0.06];
const KEY = [0.3, 0.32, 0.36];
const YELLOW = [0.95, 0.72, 0.08];
/** Bright and unlit: the bloom makes them glow. */
const SCREEN = [0.08, 0.35, 0.8];
const TRACE = [0.35, 0.9, 1.4];
const LAMPS = [
  [1.6, 0.12, 0.08],
  [0.15, 1.4, 0.35],
  [1.5, 0.8, 0.12],
  [0.3, 0.6, 1.6],
];
const SIDES = 24;

/** A short upright cylinder of radius r from y0 to y1 round (x, z): its side and its top. */
const drum = (o: Out, [x, , z]: Vec3, r: number, y0: number, y1: number, rgb: number[]) => {
  for (let i = 0; i < SIDES; i++) {
    const [a, b] = [(i * 2 * Math.PI) / SIDES, ((i + 1) * 2 * Math.PI) / SIDES];
    const p = (t: number, y: number): Vec3 => [x + r * Math.cos(t), y, z + r * Math.sin(t)];
    const m = (a + b) / 2;
    const n: Vec3 = [Math.cos(m), 0, Math.sin(m)];
    for (const q of [p(a, y0), p(a, y1), p(b, y1), p(a, y0), p(b, y1), p(b, y0)]) {
      vert(o, q, n, rgb, -1);
    }
    for (const q of [[x, y1, z] as Vec3, p(b, y1), p(a, y1)]) {
      vert(o, q, [0, 1, 0], rgb, -1);
    }
  }
};

/** A small hash in [0, 1): which keys are lit, and in what colour. */
const hash = (i: number, j: number) => {
  const h = Math.sin(i * 91.7 + j * 47.3) * 43758.5453;
  return h - Math.floor(h);
};

/** The computer round the console's box, onto o. */
export const computer = (o: Out, def: StationDef) => {
  const [lo, hi] = def.post;
  const [D, cz] = [lo[1], (lo[2] + hi[2]) / 2];
  // The body: a plinth, a case with vents and a red strip at its foot, the desk over it.
  slab(o, [lo[0] + 0.15, D, lo[2] + 0.15], [hi[0] - 0.1, D + 0.12, hi[2] - 0.15], DARK);
  slab(o, [lo[0] + 0.2, D + 0.12, lo[2] + 0.1], [hi[0] - 0.05, D + 0.95, hi[2] - 0.1], CASE);
  for (let k = 0; k < 6; k++) {
    const y = D + 0.32 + 0.08 * k;
    slab(o, [lo[0] + 0.17, y, lo[2] + 0.45], [lo[0] + 0.2, y + 0.03, hi[2] - 0.45], DARK);
  }
  slab(
    o,
    [lo[0] + 0.16, D + 0.15, lo[2] + 0.3],
    [lo[0] + 0.2, D + 0.19, hi[2] - 0.3],
    LAMPS[0],
    -2,
  );
  slab(o, [lo[0], D + 0.95, lo[2]], [hi[0], hi[1], hi[2]], TOP);
  slab(o, [lo[0] - 0.02, D + 1.01, lo[2] + 0.05], [lo[0], D + 1.04, hi[2] - 0.05], TRACE, -2);
  // Two banks of keys either side of the button, a few of them lit.
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 6; j++) {
        const [x, z] = [lo[0] + 0.14 + 0.19 * i, cz + s * (0.5 + 0.15 * j)];
        const h = hash(i + 4 * s, j);
        const [rgb, layer] = h < 0.3 ? [LAMPS[Math.floor(h * 13) % 4], -2] : [KEY, -1];
        slab(o, [x, hi[1], z - 0.055], [x + 0.13, hi[1] + 0.035, z + 0.055], rgb, layer);
      }
    }
  }
  // The button's collar: a yellow ring, a black seat in it.
  const b = knob(def);
  drum(o, b, 0.31, hi[1], hi[1] + 0.02, YELLOW);
  drum(o, b, 0.25, hi[1], hi[1] + 0.035, DARK);
  // The tower at the back: a big screen with its traces, a green and an amber one either side, a
  // row of lamps over them, a cap.
  const bx = hi[0] - 0.6;
  slab(o, [bx, hi[1], lo[2] + 0.05], [hi[0] - 0.05, D + 2.4, hi[2] - 0.05], CASE);
  slab(o, [bx - 0.02, D + 1.35, cz - 0.65], [bx, D + 2.15, cz + 0.65], SCREEN, -2);
  for (let k = 1; k < 4; k++) {
    const y = D + 1.35 + 0.2 * k;
    slab(o, [bx - 0.03, y, cz - 0.6], [bx - 0.02, y + 0.012, cz + 0.6], TRACE, -2);
    const z = cz - 0.65 + 0.325 * k;
    slab(o, [bx - 0.03, D + 1.4, z], [bx - 0.02, D + 2.1, z + 0.012], TRACE, -2);
  }
  for (const [s, rgb] of [
    [-1, LAMPS[1]],
    [1, LAMPS[2]],
  ] as [number, number[]][]) {
    const [z0, z1] = [cz + s * 0.8, cz + s * 1.35];
    slab(o, [bx - 0.02, D + 1.5, Math.min(z0, z1)], [bx, D + 2.0, Math.max(z0, z1)], rgb, -2);
  }
  for (let k = 0; k < 8; k++) {
    const z = cz - 1.2 + 0.33 * k;
    slab(o, [bx - 0.04, D + 2.22, z - 0.05], [bx, D + 2.3, z + 0.05], LAMPS[k % 2 ? 1 : 0], -2);
  }
  slab(o, [bx - 0.1, D + 2.4, lo[2]], [hi[0] + 0.05, D + 2.5, hi[2]], TOP);
  // Cables from its back down to the dais.
  for (const s of [-1, 1]) {
    bar(
      o,
      [hi[0] - 0.05, D + 0.5, cz + s * 0.9],
      [hi[0] + 0.5, D + 0.04, cz + s * 1.2],
      0.06,
      DARK,
    );
  }
};
