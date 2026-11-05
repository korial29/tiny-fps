import { TEX } from './types';
import type { Brush, WorldDef } from './world';

type Vec3 = [number, number, number];

/** The bottom of every building: far below the kill floor, so nothing shows beneath a roof. */
const BASE = -30;

/** A building: the footprint x0..x1 by z0..z1 from the street up to a flat roof at `top`. */
const roof = (x0: number, z0: number, x1: number, z1: number, top: number): Brush => ({
  min: [x0, BASE, z0],
  max: [x1, top, z1],
  top: TEX.TILE,
  side: TEX.BRICK,
});

/** Any box, corners (x0, y0, z0) and (x1, y1, z1). */
const box = (
  [x0, y0, z0]: Vec3,
  [x1, y1, z1]: Vec3,
  top: number,
  side = top,
  tint?: Vec3,
): Brush => ({ min: [x0, y0, z0], max: [x1, y1, z1], top, side, tint });

/** Six steps of 0.4 m, 1 m deep and 2 m wide (x 12 to 14) from z down to z - 6, on a roof at y. */
const stair = (z: number, y: number): Brush[] =>
  [1, 2, 3, 4, 5, 6].map(k =>
    box([12, y, z - k], [14, y + 0.4 * k, z - k + 1], TEX.STONE, TEX.STONE),
  );

/**
 * A parkour test course, laid out for the moves of step 3 and flown with them by test/lines.ts.
 * Metres, y up, the course runs north (toward -z). A walking jump flies about 4.2 m on the flat, a
 * sprint jump 6.3 m, and reaches a box 1.7 m high; the hands catch a top 1.2 to 2.4 m above the
 * feet, and a fall that reaches a face within about 3.5 m is caught by them.
 *
 * - A: the start roof (10 m), with the spawns. B: a roof at 10 m, across a 4.2 m gap from A (a
 *   run and a jump: walking off the edge falls).
 * - On B, a platform floating at 12.2 to 12.6 m (an overhang to walk under, a bump for a jump) and
 *   a stair of six 0.4 m steps up to it. 3 m north of it, C (12.4 m): the south face of C above B
 *   is a 2.4 m ledge to grab. Two poles stand by the platform.
 * - E (8 m), 3 m east of C and 4.4 m lower: a long wall (6.5 m high, 26 m long) to run along, ledges
 *   2.0 and 2.2 m high, and a 1.2 m low gap under a lintel to slide under, with a way round it.
 * - G (8 m) is across a 10 m drop from E, reached by a 0.5 m wide beam; it has a 1.6 m ledge.
 * - F (12.4 m) is 13 m north of C: a sprint and a jump fall short of it, and so does a walk with
 *   the dash or the double jump; it takes the sprint and the jump and the dash or the double jump.
 */
export const ROOFTOPS: WorldDef = {
  name: 'Rooftops',
  brushes: [
    roof(4, 57.7, 24, 76, 10),
    roof(4, 36, 24, 53.5, 10),
    roof(4, 20, 24, 36, 12.4),
    roof(4, -5, 24, 7, 12.4),
    roof(27, 20, 47, 50, 8),
    roof(27, 60, 47, 76, 8),
    // The overhang, its stair and two poles.
    box([9, 12.2, 39], [19, 12.6, 47], TEX.METAL, TEX.METAL),
    ...stair(53, 10),
    box([5, 10, 42], [5.5, 14, 42.5], TEX.METAL),
    box([5, 10, 50], [5.5, 14, 50.5], TEX.METAL),
    // A pipe lying along C: a step of 0.45 m.
    box([8, 12.4, 24], [20, 12.85, 24.45], TEX.METAL),
    // The long wall, the ledges, the lintel and the beam.
    box([36, 8, 22], [37, 14.5, 48], TEX.STONE, TEX.STONE, [1, 0.75, 0.62]),
    box([30, 8, 28], [34, 10, 32], TEX.STONE, TEX.BRICK),
    box([40, 8, 30], [44, 10.2, 34], TEX.STONE, TEX.BRICK),
    box([28, 9.2, 44], [35, 12, 46], TEX.METAL, TEX.GRATE, [0.8, 0.9, 1]),
    box([41.5, 7.6, 50], [42, 8, 60], TEX.METAL),
    box([30, 8, 64], [34, 9.6, 68], TEX.STONE, TEX.BRICK),
  ],
  // Side by side on A, facing north (yaw 0 looks toward -z).
  spawns: [
    [6, 10, 72, 0],
    [10, 10, 72, 0],
    [14, 10, 72, 0],
    [18, 10, 72, 0],
    [22, 10, 72, 0],
    [8, 10, 66, 0],
    [14, 10, 66, 0],
    [20, 10, 66, 0],
  ],
  floor: -25,
  // A sun low in the east, warm and bright: long sharp shadows across the roofs.
  sun: { dir: [0.6, 0.64, 0.48], color: [3, 2.7, 2.2] },
  sky: [
    [0.12, 0.3, 0.75],
    [0.7, 0.82, 0.95],
  ],
  // A light haze the colour of the horizon.
  fog: [0.7, 0.82, 0.95, 0.008],
};
