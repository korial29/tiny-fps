// Landfall, the beach level (docs/BEACH.md): a capture the flag on a Caribbean beach cut in two by
// a crashed ship. Red's half (z 100 to 200) is written and flipped across z = 100; the wreck lies
// along x on that line, which is its own plane of symmetry, and is written once.
// No DOM, no Node API.
import { TEAM_TINT } from './map';
import { TEX } from './types';
import type { Brush, Spawn, WorldDef } from './world';

type Vec3 = [number, number, number];

/** The beach is 200 m long: a point at z has its twin at ZED - z. */
export const ZED = 200;
const [RED, BLUE] = TEAM_TINT;

/**
 * The frame every piece is laid on, metres. Across x, from the sea to the forest: the water is too
 * deep at `sea`, the waterline is at `shore` (the sand is at `water` there), the first trees stand
 * at `trees`, nothing is walked past `east`. Along z the headlands' rocks close the beach before
 * `cape` and after ZED - `cape`.
 */
export const FRAME = { sea: 0, shore: 30, trees: 90, east: 110, cape: 8, water: 0 };

/**
 * The wreck, a hull along x on the centre line, broken in three: each section's x0 and x1. The
 * tail is in the water, the middle on the sand, the nose in the trees; the two gaps are crossed on
 * foot. `r` is the hull's radius and `sunk` how deep its axis sits under r, so its back is at
 * 2 r - sunk over the sand.
 */
export const HULL = {
  r: 7,
  sunk: 2,
  sections: [
    [6, 36],
    [44, 74],
    [82, 106],
  ],
};

/**
 * Red's wing, torn at the root and lying as a ramp from the sand up to the hull's back: its root
 * on the middle section (x0, x1 at z = ZED / 2 + HULL.r) and its tip on the sand (x0, x1, z).
 * Blue's is its twin.
 */
export const WING = { root: [50, 68], tip: [56, 66, 150] };

/** Red's engines, torn off: the middle of each nacelle (x, z), its radius and length. One on the sand, one in the water. */
export const ENGINES = [
  [70, 135, 2.5, 9],
  [20, 128, 2.5, 9],
];

/** Red's camp: the escape pod its flag stands by (x, z, radius). */
export const POD = [60, 174, 4];

const box = (
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  top: number,
  tint?: Vec3,
): Brush => ({ min: [x0, y0, z0], max: [x1, y1, z1], top, side: top, tint });

const flip = (b: Brush): Brush => ({
  ...b,
  min: [b.min[0], b.min[1], ZED - b.max[2]],
  max: [b.max[0], b.max[1], ZED - b.min[2]],
  tint: b.tint === RED ? BLUE : b.tint,
});
const flipPoint = ([x, y, z]: Vec3): Vec3 => [x, y, ZED - z];

const SAND: Vec3 = [0.93, 0.84, 0.62];
const MID = ZED / 2;

/** Red's half: z from 100 to 200. A flat slab for now: the relief comes with the map's own work. */
const half: Brush[] = [
  box(FRAME.sea, -30, MID, FRAME.east, 0, ZED, TEX.CONCRETE, SAND),
  // The flag's step, in the team's colour.
  box(POD[0] - 3, 0, POD[1] - 3, POD[0] + 3, 0.5, POD[1] + 3, TEX.PAINT, RED),
];

/** The wreck, on the line: a box a section. */
const centre: Brush[] = HULL.sections.map(([x0, x1]) =>
  box(x0, 0, MID - HULL.r, x1, 2 * HULL.r - HULL.sunk, MID + HULL.r, TEX.METAL),
);

/** Eight, behind the camp, facing the other one. */
const SPAWNS: Spawn[] = [44, 52, 60, 68].flatMap((x): Spawn[] => [
  [x, 0, 186, 0],
  [x + 4, 0, 190, 0],
]);

const team = (red: boolean) => {
  const side = (p: Vec3) => (red ? p : flipPoint(p));
  return {
    base: side([POD[0], 0.5, POD[1]]),
    spawns: red ? SPAWNS : SPAWNS.map(([x, y, z]): Spawn => [x, y, ZED - z, Math.PI]),
    rack: side([50, 0, 182]),
    blade: side([70, 0, 182]),
    rifle: side([84, 0, 150]),
    rail: side([40, 0, 130]),
  };
};

export const BEACH: WorldDef = {
  name: 'Landfall',
  tag: 'Beach · wreck',
  lore: 'A ship came down across a Caribbean beach, its tail in the lagoon and its nose in the trees. The survivors camp at either end of the sand and fight over the wreck between them.',
  brushes: [...half, ...half.map(flip), ...centre],
  teams: [team(true), team(false)],
  floor: -20,
  // High over the sea, warm; a blue sky paling to the horizon and a light haze.
  sun: { dir: [-0.47, 0.83, 0.3], color: [3.2, 3, 2.6] },
  sky: [
    [0.1, 0.32, 0.75],
    [0.55, 0.75, 0.9],
  ],
  fog: [0.6, 0.78, 0.9, 0.0012],
  scenery: 'beach',
};
