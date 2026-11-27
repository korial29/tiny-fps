// The hall's control station (the user, 2026-11-27: round control desks in place of the square
// tables): a round dark plinth, a ring of seven pods round a stool, open toward its front, each pod
// a pedestal under a slab that leans toward the middle with a lit lavender screen on it, a circuit
// drawn dark on the screen and three lights along the slab's inner edge.
import { segment, solid } from '../mesh';
import { put } from '../brick';
import type { Out } from '../verts';
import { inside } from './kit';
import { bevel, ring } from './round';

const [SHELL, PLINTH, SEAT] = [
  [0.13, 0.135, 0.15],
  [0.2, 0.205, 0.22],
  [0.05, 0.05, 0.06],
];
const SCREEN = [0.62, 0.6, 1.05];
const INKED = [0.04, 0.04, 0.09];
/** Pods in the ring, the angle between two, and how far the slab leans toward the middle. */
const [PODS, STEP, LEAN] = [7, (38 * Math.PI) / 180, (32 * Math.PI) / 180];
/** The circuit on a screen: dark strips (u0, v0, u1, v1) on its 0.5 x 0.56 m, from its middle. */
const CIRCUIT = [
  [-0.2, -0.22, 0.2, -0.2],
  [-0.2, 0.2, 0.2, 0.22],
  [-0.2, -0.22, -0.18, 0.22],
  [0.18, -0.22, 0.2, 0.22],
  [-0.12, -0.1, -0.1, 0.1],
  [0.1, -0.1, 0.12, 0.1],
  [-0.12, -0.01, 0.12, 0.01],
  [-0.02, 0.12, 0.02, 0.16],
  [-0.02, -0.16, 0.02, -0.12],
  [0.22, -0.05, 0.25, 0.05],
];
/** A glowing rectangle on the slab's top at height y, from (u0, v0) to (u1, v1), u across and v along the slab. */
const glow = (o: number[], y: number, [u0, v0, u1, v1]: number[], [r, g, b]: number[]) => {
  for (const [u, v] of [
    [u0, v0],
    [u0, v1],
    [u1, v1],
    [u0, v0],
    [u1, v1],
    [u1, v0],
  ]) {
    o.push(u, y, v, 0, 1, 0, r, g, -2, b);
  }
};

/** Turns a model's vertices about z by `a` (positions and normals) and moves them by (x, y). */
const tilt = (v: number[], from: number, a: number, x: number, y: number) => {
  const [c, s] = [Math.cos(a), Math.sin(a)];
  for (let i = from; i < v.length; i += 10) {
    for (const [k, d] of [
      [0, 1],
      [3, 0],
    ]) {
      const [p, q] = [v[i + k], v[i + k + 1]];
      [v[i + k], v[i + k + 1]] = [c * p - s * q + (d ? x : 0), s * p + c * q + (d ? y : 0)];
    }
  }
};

/** One pod, out along +x from the middle: a pedestal and its leaning slab with the screen. */
const pod = (): number[] => {
  const v: number[] = [];
  bevel(v, [0.95, 0, -0.22], [1.35, 0.74, 0.22], SHELL, 0.05);
  const from = v.length;
  // The slab, made flat round its middle, then leant and lifted onto the pedestal.
  bevel(v, [-0.32, -0.05, -0.3], [0.32, 0.03, 0.3], SHELL, 0.03);
  glow(
    v,
    0.032,
    [-0.27, -0.25, 0.27, 0.25],
    SCREEN.map(x => x * 0.9),
  );
  for (const c of CIRCUIT) {
    glow(v, 0.034, [c[1], c[0], c[3], c[2]], INKED);
  }
  for (const [z, rgb] of [
    [-0.15, [0.5, 1, 0.6]],
    [0, SCREEN],
    [0.15, [1, 0.7, 0.3]],
  ] as [number, number[]][]) {
    ring(
      v,
      [-0.322, -0.01, z],
      [0, 0, -1],
      [0, 1, 0],
      [0, 0.014],
      rgb.map(x => x * 2),
      rgb,
      8,
    );
  }
  tilt(v, from, LEAN, 1.1, 0.86);
  return v;
};
const POD = pod();

/** The station round (x, z) on the floor at y, its open front toward the angle `front` (radians, 0 is +x). */
export const station = (o: Out, x: number, z: number, y: number, front: number) => {
  inside(o, () => {
    const cyl = solid(2, 1, [1, 1], [0, 0]);
    segment(o, cyl, [x, y, z], [x, y + 0.08, z], [1, 0, 0], 1, 1.48, PLINTH);
    segment(o, cyl, [x, y + 0.08, z], [x, y + 0.14, z], [1, 0, 0], 1, 0.75, SHELL);
    // The stool: a post and a round seat.
    segment(o, cyl, [x, y + 0.14, z], [x, y + 0.5, z], [1, 0, 0], 1, 0.05, PLINTH);
    segment(o, cyl, [x, y + 0.5, z], [x, y + 0.6, z], [1, 0, 0], 1, 0.22, SEAT);
    for (let k = 0; k < PODS; k++) {
      const a = front + Math.PI + (k - (PODS - 1) / 2) * STEP;
      put(o, POD, [x, y, z], -a);
    }
  });
};
