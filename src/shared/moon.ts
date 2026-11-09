// Tranquility, the moon level (docs/MOON.md): a capture the flag in a crater, half gravity.
// Red's half (z 140 to 280) is written and flipped across z = 140; the rille and the rim, which
// stand on the line, are written once, symmetric by hand. Compact on purpose: the local bundle
// carries it (budget in scripts/size.mjs).
import { TEAM_TINT } from './map';
import { TEX } from './types';
import type { Brush, Spawn, WorldDef } from './world';

type Vec3 = [number, number, number];

/** The crater is 280 m long: a point at z has its twin at ZED - z. */
export const ZED = 280;
const [RED, BLUE] = TEAM_TINT;
const { STONE, CONCRETE, METAL, STEEL, PAINT } = TEX;

/**
 * The west long jump: the rille is 16 m wide, the spurs of the lip leave this much open. At half
 * gravity (GRAVITY 20 becomes 10) a jump of 7 m/s rises 2.45 m and hangs 1.4 s: a run flies 8.4 m,
 * a sprint 12.6 m, a dash adds about 1.2 m and more. At full gravity those are 4.2 and 6.3 m.
 */
export const WEST_GAP = 13.5;

/** A box, corners (x0, y0, z0) and (x1, y1, z1), tops and sides, a tint. */
const box = (
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

/** The twin of a brush, a point or a spawn across the centre line. */
const flip = (b: Brush): Brush => ({
  ...b,
  min: [b.min[0], b.min[1], ZED - b.max[2]],
  max: [b.max[0], b.max[1], ZED - b.min[2]],
  tint: b.tint === RED ? BLUE : b.tint,
});
const flipPoint = ([x, y, z]: Vec3): Vec3 => [x, y, ZED - z];
/** The list and its twins, then the pieces by the rille. */
const both = (l: Vec3[], ...mid: Vec3[]) => [...l, ...l.map(flipPoint), ...mid];

/** Red's half: z from 140 to 280. */
const half: Brush[] = [
  // The crater floor, regolith, from the rille to the rim.
  box(0, -30, 148, 160, 0, 280, STONE),
  // The dome, four white tiers (tops 6, 11, 14.5, 16), its stairs west and east of the first tier and on to the third.
  box(58, 0, 214, 102, 6, 258, CONCRETE),
  box(64, 6, 220, 96, 11, 252, CONCRETE),
  box(69, 11, 225, 91, 14.5, 247, CONCRETE),
  box(74, 14.5, 230, 86, 16, 242, CONCRETE),
  ...stairs(2, 214, 228, 54, 58, 0, 6),
  ...stairs(2, 232, 246, 102, 106, 0, 6),
  ...stairs(2, 238, 249, 96, 100, 6, 11),
  ...stairs(2, 244, 236, 91, 95, 11, 14.5),
  // The flag's pad ahead of the dome: a red step of 0.5 m and a dais at 1 m.
  box(74, 0, 199, 86, 0.5, 211, PAINT, CONCRETE, RED),
  box(76, 0.5, 201, 84, 1, 209, PAINT, CONCRETE, RED),
  // The armoury, a red plinth behind the dome: the racks stand on it.
  box(60, 0, 259, 70, 1.5, 265, STEEL, PAINT, RED),
  // The landing pad, a shuttle on it (cover), two modules, the tubes joining them to the dome
  // (tops 3.5 m up) with their ramps, and a crate on the first tube: a step to the dome.
  box(27, 0, 207, 53, 0.25, 233, METAL),
  box(33, 0.25, 218, 47, 3.25, 222, PAINT, PAINT, [0.82, 0.84, 0.88]),
  box(111, 0, 222, 125, 5, 230, METAL, CONCRETE),
  box(96, 0, 196, 110, 5, 204, METAL, CONCRETE),
  box(102, 0, 224, 111, 3.5, 228, STEEL, METAL),
  box(98, 0, 204, 102, 3.5, 214, STEEL, METAL),
  ...stairs(2, 214, 224, 105, 109, 0, 3.5),
  ...stairs(0, 108, 102, 206, 210, 0, 3.5),
  box(102, 3.5, 224.5, 104.4, 4.5, 227.5, METAL),
  // Light masts at the pad's corners (on it) and by the tubes.
  ...[27.1, 52.5].flatMap(x =>
    [207.1, 232.5].map(z => box(x, 0.25, z, x + 0.4, 10.25, z + 0.4, STEEL)),
  ),
  box(106, 0, 229, 106.4, 10, 229.4, STEEL),
  box(103, 0, 212.2, 103.4, 10, 212.6, STEEL),
  // The west long jump: a spur of the lip into the rille, orange.
  box(12, -30, 148 - (16 - WEST_GAP) / 2, 24, 0, 148, PAINT, STONE, [1, 0.42, 0.08]),
  // Boulders in the field (x, z, width, depth, height).
  ...[
    [4, 172, 4, 4, 2.2],
    [30, 154, 5, 5, 3],
    [66, 158, 3, 3, 1.6],
    [95, 164, 5, 4, 2.6],
    [125, 175, 6, 5, 3.2],
    [92, 186, 4, 4, 2.4],
  ].map(([x, z, w, d, h]) => box(x, 0, z, x + w, h, z + d, STONE)),
];

/** What stands on the centre line, symmetric as written: the bridge, the stones and the rim. */
const centre: Brush[] = [
  // The bridge: a deck level with the floor and a low wall on each side.
  box(74, -1.5, 132, 86, 0, 148, METAL, STEEL),
  box(74, 0, 132, 74.4, 1.1, 148, CONCRETE),
  box(85.6, 0, 132, 86, 1.1, 148, CONCRETE),
  // The east stones, 1.2 m, 2.4 m, 1.2 m high.
  box(126, -30, 143, 131, 1.2, 147, STONE),
  box(130, -30, 138.5, 135, 2.4, 141.5, STONE),
  box(126, -30, 133, 131, 1.2, 137, STONE),
  // The rim: two steps, 30 m and 60 m, all round the play area.
  ...[0, 10].flatMap(o => {
    const h = 30 + 3 * o;
    return [
      box(-10 - o, -30, -10 - o, -o, h, 290 + o, STONE),
      box(160 + o, -30, -10 - o, 170 + o, h, 290 + o, STONE),
      box(-o, -30, -10 - o, 160 + o, h, -o, STONE),
      box(-o, -30, 280 + o, 160 + o, h, 290 + o, STONE),
    ];
  }),
];

/** Red's spawns behind the dome facing blue (yaw 0 looks toward -z): five in a row, three in front. */
const SPAWNS: Spawn[] = [
  ...[56, 68, 80, 92, 104].map((x): Spawn => [x, 0, 271, 0]),
  ...[62, 80, 98].map((x): Spawn => [x, 0, 267, 0]),
];
/** The racks on the plinth, 2.5 m apart: rifle, rail, gun, katana. */
const racks = (z: number) =>
  Object.fromEntries(
    ['rifle', 'rail', 'rack', 'blade'].map((k, i) => [k, [61.25 + 2.5 * i, 1.5, z] as Vec3]),
  );
const team = (z: number, s: Spawn[]) => ({
  base: [80, 1, z] as Vec3,
  spawns: s,
  ...racks(z + (z > 140 ? 57 : -57)),
});

export const MOON: WorldDef = {
  name: 'Tranquility',
  brushes: [...half, ...half.map(flip), ...centre],
  teams: [
    team(205, SPAWNS),
    team(
      ZED - 205,
      SPAWNS.map(([x, y, z]): Spawn => [x, y, ZED - z, Math.PI]),
    ),
  ],
  // Health 3, ammo 3 and rail cells 2 in a half, and by the rille two of each pack and one cell.
  packs: both(
    [
      [99, 6, 218],
      [118, 5, 226],
      [30, 0, 185],
    ],
    [45, 0, 152],
    [45, 0, 128],
  ),
  ammo: both(
    [
      [61, 6, 226],
      [103, 5, 200],
      [135, 0, 190],
    ],
    [115, 0, 152],
    [115, 0, 128],
  ),
  cells: both(
    [
      [106.5, 3.5, 226],
      [80, 16, 236],
    ],
    [80, 0, 140],
  ),
  floor: -20,
  // Low from the east, white and hard; a near black sky.
  sun: { dir: [0.87996, 0.40998, 0.23999], color: [3, 2.95, 2.85] },
  sky: [
    [0.002, 0.002, 0.006],
    [0.02, 0.02, 0.035],
  ],
  gravity: 0.5,
  scenery: 'moon',
  helmets: true,
};
