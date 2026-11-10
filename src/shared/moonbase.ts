// The base of the moon level (docs/MOON.md): red's dome, modules, tubes and the stairs up to the
// tube tops, as data and brushes. moon.ts puts them in red's half and flips them for blue: it
// imports this file, never the other way. Compact on purpose: the local bundle carries it.
import { TEX } from './types';
import type { Brush } from './world';

export type Vec3 = [number, number, number];

const { CONCRETE, METAL, STEEL } = TEX;

/** A box, corners (x0, y0, z0) and (x1, y1, z1), tops and sides, a tint. */
export const box = (
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  top: number,
  side = top,
  tint?: Vec3,
): Brush => ({ min: [x0, y0, z0], max: [x1, y1, z1], top, side, tint });
export const fromBx = ({ min, max }: Bx, top: number, side = top): Brush => ({
  min,
  max,
  top,
  side,
});

/** A box by its corners. */
export interface Bx {
  min: Vec3;
  max: Vec3;
}
export const bx = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Bx => ({
  min: [x0, y0, z0],
  max: [x1, y1, z1],
});

/** The drawn dome (client/moonbase.ts): a drum of radius R up to y 5, then a shell to the apex at y 17. */
const R = 22.4;
const shell = (y: number) => (y < 5 ? R : R * Math.sqrt(1 - ((y - 5) / 12) ** 2));
const q = (v: number) => Math.round(v * 10) / 10;
/** Height bands of the ghost collision over the dome: the first is above a double jump from a module top. */
const BANDS = [0, 10.5, 13.5, 15.5, 17];
/**
 * The half sides (x, z) of the boxes that cover the circle of radius r, centred: four, stepped,
 * the first two crossed with the last two (a union of axis-aligned boxes: its corners stick out of
 * the circle by up to 17 %, the ghosts are not drawn).
 */
const around = (r: number) =>
  [
    [1, 0.39],
    [0.93, 0.71],
    [0.71, 0.93],
    [0.39, 1],
  ].map(([a, b]) => [q(a * r), q(b * r)]);
const first = around(R + 0.2);

/** Red's dome (its centre: x, z), modules and tubes: what the scenery draws on. */
export const DOME = [80, 236];
export const MODULES = [bx(111, 0, 222, 125, 5, 230), bx(96, 0, 196, 110, 5, 204)];
export const TUBES = [
  bx(DOME[0] + first[1][0], 0, DOME[1] - first[0][1] - 4, 111, 3.5, DOME[1] - first[0][1]),
  bx(98, 0, 204, 102, 3.5, DOME[1] - first[1][1]),
];

/**
 * Stairs from `a` to `b` along z (axis 2) or x (0), across `w0` to `w1`, rising from `y` to `top`
 * in steps of at most 0.46 m, each a solid from `y`.
 */
const stairs = (
  axis: 0 | 2,
  a: number,
  b: number,
  w0: number,
  w1: number,
  y: number,
  top: number,
): Brush[] => {
  const n = Math.ceil((top - y) / 0.46);
  return Array.from({ length: n }, (_, i) => {
    const [s, t] = [a + ((b - a) * i) / n, a + ((b - a) * (i + 1)) / n].sort((p, q) => p - q);
    const up = y + ((top - y) * (i + 1)) / n;
    return axis ? box(w0, y, s, w1, up, t, CONCRETE) : box(s, y, w0, t, up, w1, CONCRETE);
  });
};

/** Red's half of the base. */
export const BASE: Brush[] = [
  // The dome, drawn round and not to be stood on: ghost bands over its shell, each a union of four stepped boxes.
  ...BANDS.slice(1).flatMap((y1, i) =>
    around(shell(BANDS[i]) + 0.2).map(([a, b]) => ({
      ...box(DOME[0] - a, BANDS[i], DOME[1] - b, DOME[0] + a, y1, DOME[1] + b, CONCRETE),
      ghost: true,
    })),
  ),
  // Two modules and the tubes to the dome (tops 3.5 m up) with their ramps.
  ...MODULES.map(m => fromBx(m, METAL, CONCRETE)),
  ...TUBES.map(t => fromBx(t, STEEL, METAL)),
  ...stairs(2, 214, TUBES[0].min[2], 105, 109, 0, 3.5),
  ...stairs(0, 108, 102, 206, 210, 0, 3.5),
];
