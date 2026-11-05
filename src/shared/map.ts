import { TEX } from './types';
import type { Brush, Spawn, WorldDef } from './world';

type Vec3 = [number, number, number];

/** The bottom of every building: far below the kill floor, so nothing shows beneath a roof. */
const BASE = -30;

/** A building: the footprint x0..x1 by z0..z1 from the street up to a flat roof at `top`, white concrete over a facade. */
const roof = (
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  top: number,
  side: number = TEX.CONCRETE,
): Brush => ({
  min: [x0, BASE, z0],
  max: [x1, top, z1],
  top: TEX.CONCRETE,
  side,
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
  [1, 2, 3, 4, 5, 6].map(k => box([12, y, z - k], [14, y + 0.4 * k, z - k + 1], TEX.CONCRETE));

/**
 * A parkour test course, laid out for the moves of step 3 and flown with them by test/lines.ts.
 * Metres, y up, the course runs north (toward -z). A walking jump flies about 4.2 m on the flat, a
 * sprint jump 6.3 m, and reaches a box 1.7 m high; the hands catch a top 1.2 to 2.4 m above the
 * feet, and a fall that reaches a face within about 3.5 m is caught by them.
 *
 * - A: the start roof (10 m), red's base, with its spawns. B: a roof at 10 m, across a 4.2 m gap from A (a
 *   run and a jump: walking off the edge falls).
 * - On B, a platform floating at 12.2 to 12.6 m (an overhang to walk under, a bump for a jump) and
 *   a stair of six 0.4 m steps up to it. 3 m north of it, C (12.4 m): the south face of C above B
 *   is a 2.4 m ledge to grab. Two poles stand by the platform.
 * - E (8 m), 3 m east of C and 4.4 m lower: a long wall (6.5 m high, 26 m long) to run along, ledges
 *   2.0 and 2.2 m high, and a 1.2 m low gap under a lintel to slide under, with a way round it.
 * - G (8 m) is across a 10 m drop from E, reached by a 0.5 m wide beam; it has a 1.6 m ledge.
 * - F (12.4 m) is 13 m north of C: a sprint and a jump fall short of it, and so does a walk with
 *   the dash or the double jump; it takes the sprint and the jump and the dash or the double jump.
 *   F is blue's base, with its spawns: the flags are 90 m and the chasm apart, and the way back is
 *   the same line in reverse, then a drop to B and the A gap jumped south.
 */
export const ROOFTOPS: WorldDef = {
  name: 'Rooftops',
  brushes: [
    roof(4, 57.7, 24, 76, 10),
    roof(4, 36, 24, 53.5, 10, TEX.GLASS),
    roof(4, 20, 24, 36, 12.4),
    roof(4, -5, 24, 7, 12.4, TEX.GLASS),
    roof(27, 20, 47, 50, 8),
    roof(27, 60, 47, 76, 8, TEX.BRICK),
    // The overhang, its stair and two poles.
    box([9, 12.2, 39], [19, 12.6, 47], TEX.STEEL),
    ...stair(53, 10),
    box([5, 10, 42], [5.5, 14, 42.5], TEX.STEEL),
    box([5, 10, 50], [5.5, 14, 50.5], TEX.STEEL),
    // A pipe lying along C: a step of 0.45 m.
    box([8, 12.4, 24], [20, 12.85, 24.45], TEX.STEEL),
    // The long wall (teal), the ledges (white, orange), the lintel (blue) and the beam.
    box([36, 8, 22], [37, 14.5, 48], TEX.PAINT, TEX.PAINT, [0.15, 0.72, 0.62]),
    box([30, 8, 28], [34, 10, 32], TEX.CONCRETE),
    box([40, 8, 30], [44, 10.2, 34], TEX.PAINT, TEX.PAINT, [1, 0.3, 0.06]),
    box([28, 9.2, 44], [35, 12, 46], TEX.STEEL, TEX.PAINT, [0.2, 0.42, 1]),
    box([41.5, 7.6, 50], [42, 8, 60], TEX.STEEL),
    box([30, 8, 64], [34, 9.6, 68], TEX.PAINT, TEX.PAINT, [0.2, 0.8, 0.3]),
  ],
  teams: [
    // Red holds A, side by side facing north (yaw 0 looks toward -z), its flag 4.8 m from the gap.
    {
      base: [14, 10, 62.5],
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
    },
    // Blue holds F across the chasm, facing south, its flag 4.8 m from the chasm's edge.
    {
      base: [14, 12.4, 2.2],
      spawns: [
        [6, 12.4, -3, Math.PI],
        [10, 12.4, -3, Math.PI],
        [14, 12.4, -3, Math.PI],
        [18, 12.4, -3, Math.PI],
        [22, 12.4, -3, Math.PI],
        [8, 12.4, 0.5, Math.PI],
        [14, 12.4, 0.5, Math.PI],
        [20, 12.4, 0.5, Math.PI],
      ],
    },
  ],
  floor: -25,
  // A warm bright sun, low in the east: long sharp shadows across the roofs.
  sun: { dir: [0.6, 0.64, 0.48], color: [2.6, 2.3, 1.8] },
  // A deep blue zenith over a pale cyan horizon.
  sky: [
    [0.04, 0.2, 0.72],
    [0.72, 0.86, 0.98],
  ],
  // A haze the colour of the horizon, thick enough to sink the far towers.
  fog: [0.72, 0.86, 0.98, 0.0055],
};

// ---------------------------------------------------------------------------------------------
// HIGHLINE: the CTF map. One half is written (red's, z 120 to 240) and flipped across the line
// z = 120 for the other; what stands on the line is written once, symmetric by hand.
// ---------------------------------------------------------------------------------------------

/** The map is 240 m long: a point at z has its twin at ZED - z. */
const ZED = 240;

/** Team colours as brush tints: the flip swaps one for the other, so a red accent has a blue twin. */
const RED: Vec3 = [1, 0.22, 0.26];
const BLUE: Vec3 = [0.2, 0.46, 1];
/** The two team tints, red then blue. */
export const TEAM_TINT = [RED, BLUE];
const ORANGE: Vec3 = [1, 0.42, 0.08];
const TEAL: Vec3 = [0.12, 0.7, 0.62];

/** An accent: a slab of tinted paint, corners (x0, y0, z0) and (x1, y1, z1). */
const pad = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, tint: Vec3) =>
  box([x0, y0, z0], [x1, y1, z1], TEX.PAINT, TEX.PAINT, tint);

/**
 * A column of stairs: from `a` to `b` along `axis` (0 for x, 2 for z), across `w0` to `w1` on the
 * other one, rising from `y` to `top` in steps of at most 0.46 m, each step a solid from `low`.
 */
const stairs = (
  axis: 0 | 2,
  a: number,
  b: number,
  w0: number,
  w1: number,
  y: number,
  top: number,
  low = BASE,
): Brush[] => {
  const n = Math.ceil((top - y) / 0.46);
  return Array.from({ length: n }, (_, i) => {
    const [s0, s1] = [a + ((b - a) * i) / n, a + ((b - a) * (i + 1)) / n].sort((p, q) => p - q);
    const up = y + ((top - y) * (i + 1)) / n;
    return axis === 0
      ? box([s0, low, w0], [s1, up, w1], TEX.CONCRETE)
      : box([w0, low, s0], [w1, up, s1], TEX.CONCRETE);
  });
};

/**
 * A ledge ladder: one platform 4 m wide and `d` deep per top in `tops`, the first at (x, z), each
 * next one (dx, dz) further, over the roof at `low`. The hands catch the face of each from the one before.
 */
const ladder = (
  x: number,
  z: number,
  dx: number,
  dz: number,
  d: number,
  low: number,
  tops: number[],
) =>
  tops.map((top, k) =>
    box(
      [x + k * dx, low, z + k * dz],
      [x + k * dx + 4, top, z + k * dz + d],
      TEX.STEEL,
      TEX.CONCRETE,
    ),
  );

/** Red's half: z from 120 to 240, then flipped. */
const half: Brush[] = [
  // Red Spire: the base tower, 26 m, glass, trimmed and bannered in red; crates to hide behind.
  roof(12, 212, 52, 240, 26, TEX.GLASS),
  pad(12, 26, 212, 52, 26.12, 212.5, RED),
  pad(12, 26, 239.5, 52, 26.12, 240, RED),
  pad(12, 26, 212.5, 12.5, 26.12, 239.5, RED),
  pad(51.5, 26, 212.5, 52, 26.12, 239.5, RED),
  pad(11.6, 12, 222, 12, 25.8, 232, RED),
  pad(28, 12, 211.4, 31, 25.5, 212, RED),
  box([19, 26, 222], [22, 27.4, 225], TEX.STEEL),
  box([42, 26, 222], [45, 27.4, 225], TEX.STEEL),
  box([29, 26, 229], [35, 27.1, 229.6], TEX.CONCRETE),
  // The Spine (high route): roofs at 26 m, the viaduct with its wall to run along, a catch roof
  // under each gap and a ladder back up.
  roof(6, 164, 26, 201, 26, TEX.GLASS),
  roof(6, 134, 26, 147, 26, TEX.GLASS),
  roof(6, 201, 26, 212, 19),
  roof(15, 147, 26, 164, 19),
  box([14, 26, 164], [15, 32, 196], TEX.PAINT, TEX.PAINT, TEAL),
  box([14, 18, 147], [15, 32, 164], TEX.PAINT, TEX.PAINT, TEAL),
  box([14, 26, 134], [15, 32, 147], TEX.PAINT, TEX.PAINT, TEAL),
  ...ladder(6, 201, 7, 0, 4, 19, [21.2, 23.4, 25]),
  // Under the viaduct: three platforms up to the south face of the first roof.
  ...[
    [18, 152, 22, 156, 21.2],
    [18, 158, 22, 162, 23.4],
    [23, 160, 26, 164, 25],
  ].map(([x0, z0, x1, z1, top]) => box([x0, 19, z0], [x1, top, z1], TEX.STEEL, TEX.CONCRETE)),
  box([20, 26, 178], [23, 27.3, 181], TEX.STEEL),
  box([8, 26, 176], [11, 27.2, 179], TEX.STEEL),
  box([8, 26, 190], [11, 27.3, 193], TEX.STEEL),
  box([20, 26, 140], [23, 27.3, 143], TEX.STEEL),
  // Midtown (middle route): the forecourt under the tower, its ladder up the tower's face, then
  // two roofs across short gaps, and a ladder from the forecourt up to the first Spine roof.
  roof(32, 186, 76, 209, 19),
  pad(32, 19, 207.5, 76, 19.1, 209, RED),
  ...ladder(33, 209, 7, 0, 3, 19, [21.2, 23.4, 25]),
  ...[
    [28, 196, 32, 200, 21.2],
    [28, 190, 32, 194, 23.4],
    [26, 184, 30, 188, 25],
  ].map(([x0, z0, x1, z1, top]) => box([x0, BASE, z0], [x1, top, z1], TEX.STEEL, TEX.CONCRETE)),
  roof(32, 166, 64, 182, 21.2, TEX.GLASS),
  roof(32, 140, 64, 161, 19),
  box([40, 21.2, 172], [44, 22.6, 176], TEX.STEEL),
  box([52, 19, 148], [57, 20.3, 151], TEX.STEEL),
  box([38, 19, 196], [41, 20.4, 199], TEX.STEEL),
  box([60, 19, 200], [63, 20.4, 203], TEX.STEEL),
  box([52, 19, 190], [58, 20.6, 194], TEX.STEEL),
  box([66, 19, 204], [72, 20.2, 207], TEX.STEEL),
  box([56, 21.2, 170], [60, 22.4, 174], TEX.STEEL),
  box([34, 19, 152], [37, 20.3, 156], TEX.STEEL),
  ...ladder(36, 135, 18, 0, 3, 15, [17.2, 17.2]),
  // From the plaza to the first Spine roof, four platforms along its face.
  ...ladder(6.5, 129, 6, 0, 4, 15, [17.2, 19.4, 21.6, 23.8]),
  // The Lowline (low route): roofs at 14.5 m, short gaps, a sign to slide under, the stairs.
  roof(76, 213, 100, 240, 14.5, TEX.STEEL),
  pad(76, 14.5, 238.5, 100, 14.6, 240, RED),
  roof(76, 185, 100, 209, 14.5),
  roof(76, 138, 100, 181, 14.5, TEX.GLASS),
  box([80, 15.7, 158], [96, 17.7, 162], TEX.STEEL, TEX.PAINT, ORANGE),
  box([82, 14.5, 234], [85, 15.9, 237], TEX.STEEL),
  box([91, 14.5, 190], [94, 15.9, 193], TEX.STEEL),
  box([80, 14.5, 204], [83, 15.6, 207], TEX.STEEL),
  box([78, 14.5, 170], [81, 15.9, 173], TEX.STEEL),
  box([92, 14.5, 146], [95, 15.7, 149], TEX.STEEL),
  box([92, 14.5, 222], [96, 15.8, 226], TEX.STEEL),
  ...stairs(0, 76, 52, 226, 232, 14.5, 26),
  ...stairs(0, 85, 76, 196, 202, 14.5, 19, 14.5),
];

/** What stands on the centre line, symmetric as written: the plaza, its dais and canopy, the beam. */
const centre: Brush[] = [
  roof(6, 106, 62, 134, 15),
  roof(62, 106, 100, 134, 14.5),
  box([34, 15, 112], [54, 17.2, 128], TEX.CONCRETE),
  pad(38, 17.2, 116, 50, 17.3, 124, ORANGE),
  ...[
    [35, 113],
    [35, 126.2],
    [51, 113],
    [51, 126.2],
  ].map(([x, z]) => box([x, 17.2, z], [x + 0.8, 21.5, z + 0.8], TEX.STEEL)),
  box([34.6, 21.5, 112.6], [52.2, 21.9, 127.4], TEX.GLASS),
  box([14, 15, 114], [17, 16.5, 117], TEX.STEEL),
  box([14, 15, 123], [17, 16.5, 126], TEX.STEEL),
  box([56, 15, 114], [59, 16.5, 117], TEX.STEEL),
  box([56, 15, 123], [59, 16.5, 126], TEX.STEEL),
  box([15.35, 25.5, 106], [15.85, 26, 134], TEX.STEEL),
  // Two masts on the east terrace, tall enough to find the middle from either base.
  box([70, 14.5, 108], [70.8, 38, 108.8], TEX.STEEL),
  box([70, 14.5, 131.2], [70.8, 38, 132], TEX.STEEL),
  box([66, 14.5, 110], [69, 15.9, 113], TEX.STEEL),
  box([66, 14.5, 127], [69, 15.9, 130], TEX.STEEL),
];

/** The twin of a brush across the centre line. */
const flip = (b: Brush): Brush => ({
  ...b,
  min: [b.min[0], b.min[1], ZED - b.max[2]],
  max: [b.max[0], b.max[1], ZED - b.min[2]],
  tint: b.tint === RED ? BLUE : b.tint,
});

/** Where a team starts: two rows facing the other end. */
const row = (yaw: number, z: number, z2: number): Spawn[] => [
  ...[16, 22, 28, 34, 40].map((x): Spawn => [x, 26, z, yaw]),
  ...[19, 31, 43].map((x): Spawn => [x, 26, z2, yaw]),
];

export const HIGHLINE: WorldDef = {
  name: 'Highline',
  brushes: [...half, ...half.map(flip), ...centre],
  teams: [
    { base: [32, 26, 224], spawns: row(0, 236, 231) },
    { base: [32, 26, ZED - 224], spawns: row(Math.PI, ZED - 236, ZED - 231) },
  ],
  floor: -25,
  // A warm sun low in the east, along the roofs' short side: the same light for both teams.
  sun: { dir: [0.8, 0.6, 0], color: [2.6, 2.3, 1.8] },
  sky: [
    [0.04, 0.2, 0.72],
    [0.72, 0.86, 0.98],
  ],
  fog: [0.72, 0.86, 0.98, 0.0035],
};
