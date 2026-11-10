// Tranquility, the moon level (docs/MOON.md): a capture the flag in a crater, half gravity.
// Red's half (z 140 to 280) is written and flipped across z = 140; the rille and the rim, which
// stand on the line, are written once, symmetric by hand. Compact on purpose: the local bundle
// carries it (budget in scripts/size.mjs).
import { TEAM_TINT } from './map';
import { BASE, DOME, MODULES, TUBES, box, bx, fromBx } from './moonbase';
import type { Bx, Vec3 } from './moonbase';
import { TEX } from './types';
import type { Brush, Spawn, WorldDef } from './world';

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

/** The twin of a box across the centre line. */
const mirror = ({ min, max }: Bx): Bx =>
  bx(min[0], min[1], ZED - max[2], max[0], max[1], ZED - min[2]);

/** The domes' centres, the landing pads (x, z, radius), the shuttles, the modules, the tubes and the masts (centres), red's then blue's: what the scenery draws on. */
const PAD = [40, 220, 13];
const SHUTTLE = bx(33, 0.25, 218, 47, 3.25, 222);
const MASTS = [
  [27.3, 207.3],
  [52.7, 207.3],
  [27.3, 232.7],
  [52.7, 232.7],
  [106.2, 230.4],
  [103.2, 212.4],
];
export const LAYOUT = {
  domes: [DOME, [DOME[0], ZED - DOME[1]]],
  pads: [PAD, [PAD[0], ZED - PAD[1], PAD[2]]],
  shuttles: [SHUTTLE, mirror(SHUTTLE)],
  modules: [...MODULES, ...MODULES.map(mirror)],
  tubes: [...TUBES, ...TUBES.map(mirror)],
  masts: [...MASTS, ...MASTS.map(([x, z]) => [x, ZED - z])],
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
  // The base: the dome's ghosts, the modules, the tubes and their stairs.
  ...BASE,
  // The flag's pad ahead of the dome: a red step of 0.5 m and a dais at 1 m.
  box(74, 0, 199, 86, 0.5, 211, PAINT, CONCRETE, RED),
  box(76, 0.5, 201, 84, 1, 209, PAINT, CONCRETE, RED),
  // The armoury, a red plinth behind the dome: the racks stand on it.
  box(60, 0, 259, 70, 1.5, 265, STEEL, PAINT, RED),
  // The landing pad, a shuttle on it (cover), and masts at the pad's corners and by the tubes.
  box(27, 0, 207, 53, 0.25, 233, METAL),
  { ...fromBx(SHUTTLE, PAINT), tint: [0.82, 0.84, 0.88] },
  ...MASTS.map(([x, z]) =>
    box(x - 0.2, x < 60 ? 0.25 : 0, z - 0.2, x + 0.2, x < 60 ? 10.25 : 10, z + 0.2, STEEL),
  ),
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
  // The rim, the boundary: one band 14 m high all round the play area, a ghost under the scree the scenery lays over it.
  ...[
    box(-10, -30, -10, 0, 14, 290, STONE),
    box(160, -30, -10, 170, 14, 290, STONE),
    box(0, -30, -10, 160, 14, 0, STONE),
    box(0, -30, 280, 160, 14, 290, STONE),
  ].map(b => ({ ...b, ghost: true })),
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
      [90, 0, 210],
      [118, 5, 226],
      [30, 0, 185],
    ],
    [45, 0, 152],
    [45, 0, 128],
  ),
  ammo: both(
    [
      [50, 0, 246],
      [103, 5, 200],
      [135, 0, 190],
    ],
    [115, 0, 152],
    [115, 0, 128],
  ),
  cells: both(
    [
      [106.5, 3.5, 226],
      [35, 0, 244],
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
