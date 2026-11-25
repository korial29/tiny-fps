// Landfall, the beach level (docs/BEACH.md): a capture the flag on a Caribbean beach cut in two by
// a crashed ship. Red's half (z 100 to 200) is written and flipped across z = 100; the wreck lies
// along x on that line, which is its own plane of symmetry, and is written once.
// The sand and the seabed are relief (relief.ts); everything else is grey boxes for now.
// No DOM, no Node API.
import { TEAM_TINT } from './map';
import { rockMid, rockOf } from './moon';
import { hash, noise } from './relief';
import { TEX } from './types';
import type { Brush, Spawn, WorldDef } from './world';

type Vec3 = [number, number, number];

/** The beach is 200 m long: a point at z has its twin at ZED - z. */
export const ZED = 200;
const MID = ZED / 2;
const [RED, BLUE] = TEAM_TINT;
const { METAL, STEEL, PAINT, WOOD, STONE, GRATE } = TEX;
const ORANGE: Vec3 = [1, 0.42, 0.08];
const YELLOW: Vec3 = [0.95, 0.75, 0.1];

/**
 * The frame every piece is laid on, metres. Across x, from the sea to the forest: the water is too
 * deep at `sea`, the waterline is at `shore` (the sand is at `water` there), the first trees stand
 * at `trees`, nothing is walked past `east`. Along z the headlands' rocks close the beach before
 * `cape` and after ZED - `cape`.
 */
export const FRAME = { sea: 0, shore: 30, trees: 90, east: 110, cape: 8, water: 0 };

/**
 * Feet under this have gone under: the runner is put back at a spawn (WorldDef.floor, the fall of
 * Highline's roofs, no new rule). The water's surface is y 0 and the eye is 1.6 m over the feet:
 * at 1.4 m of water a standing runner still looks over it.
 */
export const DEPTH = -1.4;
/** Where nobody goes, x and z: the ghost wall behind the first palms and the one in each headland. */
export const EDGE = { east: FRAME.trees + 5, cape: FRAME.cape / 2 };

/**
 * The wreck, a hull along x on the centre line, broken in three: each section's x0 and x1. The
 * tail is in the water, the middle on the sand, the nose in the trees; the two gaps are crossed on
 * foot. `r` is the hull's radius and `sunk` how deep its axis sits under r, so its back is at
 * 2 r - sunk over the sand. `axis` is the height of each section's axis: each lies level, 2 m in
 * the ground it came to rest on.
 */
export const HULL = {
  r: 7,
  sunk: 2,
  sections: [
    [6, 36],
    [44, 74],
    [82, 106],
  ],
  axis: [4, 6.25, 7.5],
};
/**
 * The hull's cross-section as stacked boxes: each a height over the axis and the half width from
 * there up to the next. A wall under the axis, the widest at it, two shoulders and the back, flat
 * and 5 m wide.
 */
export const RINGS = [
  [-HULL.r - 2, 5.8],
  [-2, 6.5],
  [2.5, 4.9],
  [5, 2.5],
  [HULL.r, 0],
];
/** The middle section's hold: its floor and ceiling, the half width inside, the ends inside, the doors' x0 and x1 and their height. */
export const HOLD = {
  floor: HULL.axis[1] - 5,
  ceil: HULL.axis[1] - 2,
  half: 4.5,
  x: [47, 71],
  door: [57.5, 60.5],
  lintel: 2.4,
  /** The two bulkheads across it (x0, x1), each with a doorway `way` wide on the centre line. */
  walls: [
    [54.5, 55],
    [63, 63.5],
  ],
  way: 2.4,
};

/**
 * Red's wing, torn at the root and lying as a ramp from the sand up to the hull's back: its root
 * on the middle section (x0, x1 at z = ZED / 2 + HULL.r) and its tip on the sand (x0, x1, z).
 * Blue's is its twin.
 */
export const WING = { root: [50, 68], tip: [56, 66, 150] };
/** The wing's steps, each under what a runner walks up, and how thick it is where one walks under it. */
const [STEPS, THICK] = [26, 0.8];

/**
 * Red's engines, torn off: the middle of each nacelle (x, z), its radius and length, lying along z.
 * One on the sand by the wing, run through; one in the lagoon off the tail's end, stood on.
 */
export const ENGINES = [
  [70, 138.5, 2.5, 9],
  [4.5, 112, 2.5, 9],
];

/**
 * Where it burns, both halves: the foot of each column of smoke (x, y, z), how high it rises, and
 * its radius at the foot and at the top (client/smoke.ts draws them). Their flames burn (FLAME), so
 * none stands on a way across (the user, 2026-11-25): on the sand east of the rear of each nacelle,
 * clear of its roof and of the way through it; on the south-west corner of each engine in the
 * lagoon, clear of the jumps over its north half (routes.ts LAGOON); and high against each of the
 * hull's four broken ends, thinner, over the heads of those who cross the gaps.
 */
export const FIRES: number[][] = [
  ...[
    [ENGINES[0][0] + 4, 1.7, ENGINES[0][1] + 3],
    [ENGINES[1][0] - 1.5, 1.3, ENGINES[1][1] + 3.5],
  ].flatMap(([x, y, z]) => [
    [x, y, z, 42, 1.3, 7],
    [x, y, ZED - z, 42, 1.3, 7],
  ]),
  ...HULL.sections.flatMap(([x0, x1], n) =>
    [n && x0 - 0.6, n < 2 && x1 + 0.6]
      .filter(x => x)
      .map(x => [+x, HULL.axis[n] + 3, ZED / 2, 28, 0.9, 4]),
  ),
];
/** Metres the flames at a fire's foot reach out from its middle and up from it: smoke.ts stands three balls of 0.55 m within 0.6 of the foot's radius, up to 2.3 m. */
export const FLAME = [0.55, 2.3];

/** Red's camp: the escape pod its flag stands by (x, z, radius). */
export const POD = [60, 174, 4];
/** The camp's ground, level. */
export const CAMP = 1.25;

/**
 * Red's headland, the rocks that close the beach past z = ZED - FRAME.cape, from the sea to the
 * trees: each x, z, radius, height and seed, a form of moon.ts rockOf(). Blue's are their twins.
 * The map makes them solid and the scenery draws them, both from this list.
 */
export const ROCKS = [
  [-4, 190, 7, 9, 1],
  [6, 196, 8, 11, 2],
  [18, 193, 6, 7, 3],
  [28, 198, 9, 13, 4],
  [40, 195, 7, 9, 5],
  [51, 199, 8, 12, 6],
  [62, 196, 6, 8, 7],
  [72, 199, 9, 14, 8],
  [83, 195, 7, 10, 9],
  [94, 198, 8, 12, 10],
  [105, 194, 7, 9, 11],
];

/**
 * Red's first row of palms, the trunks a runner can touch: each x, z and radius at the foot. The
 * map makes them solid and the scenery draws a palm on each; the forest behind is drawn only.
 * The first stands clear of the nose's flank.
 */
export const TRUNKS = Array.from({ length: 21 }, (_, i) => [
  FRAME.trees + 3 * hash(i, 1, 7),
  MID + 9 + 4 * i + 2 * hash(i, 2, 7),
  0.22 + 0.1 * hash(i, 3, 7),
]);

// ---------------------------------------------------------------------------------------------
// The relief: the sand and the seabed.

const c1 = (t: number) => Math.min(Math.max(t, 0), 1);
const sm = (t: number) => c1(t) * c1(t) * (3 - 2 * c1(t));
const far = (a: number, b: number) => Math.sqrt(a * a + b * b);

/** Metres between two nodes of the lattice. */
export const CELL = 4;
/**
 * Where the ground is level, x0, z0, x1, z1 (z in red's half) and the height: the way in to the
 * hold's door through the bank, the tip of the wing, the camp. Level for 6 m round each, so that
 * the lattice's triangles are, and back to the sand 6 m further; none within 12 m of the next.
 */
export const FLATS = [
  [57, 107, 61, 113, HOLD.floor - 0.25],
  [WING.tip[0], WING.tip[2] - 4, WING.tip[1], WING.tip[2], 1.3],
  [44, 164, 76, 184, CAMP],
];
/** The furrow the hull ploughed: how deep on its line, and how high the bank of sand thrown up on each side, 12 m off it. */
export const FURROW = [1.5, 1.2];

/**
 * The height of the ground at a lattice node. The beach: the water's surface is y 0 and the sand
 * meets it at x 30, rises to 2.5 m at the trees and goes on up under them; the bed falls a metre
 * in ten, 3 m down at x 0, and keeps falling. Low dunes on the upper beach. The furrow along the
 * centre line from the waterline to the nose, a mound pushed up before the nose. The same on both
 * sides of the centre line. Only + - * /, Math.sqrt and the integer hash.
 */
export const at = (x: number, z: number): number => {
  const d = Math.abs(z - MID);
  const { shore, trees } = FRAME;
  let h = x > shore ? (2.5 * (x - shore)) / (trees - shore) : (x - shore) / 10;
  // Dunes, from mid beach up: half a metre at most, none on the wet sand.
  h += 0.9 * sm((x - 46) / 24) * (noise(x / 13, d / 13, 5) - 0.45) * sm((d - 14) / 10);
  // The furrow and its banks, fading out into the water; the sand piled before the nose.
  const k = sm((x - shore) / 14) * (1 - sm((x - 102) / 8));
  h += k * (FURROW[1] * c1(1 - Math.abs(d - 12) / 5) - FURROW[0] * (1 - sm((d - 2) / 7)));
  h += 1.8 * c1(1 - far(x - 110, d) / 9);
  for (const [x0, z0, x1, z1, y] of FLATS) {
    const off = far(Math.max(x0 - x, x - x1, 0), Math.max(z0 - MID - d, MID + d - z1, 0));
    h = y + (h - y) * sm((off - 6) / 6);
  }
  return h;
};

/** The ground as it is walked on: at()'s lattice in float32, each square two triangles, as ground() in relief.ts reads it. */
export const walked = (x: number, z: number): number => {
  const [i, j] = [Math.floor(x / CELL), Math.floor(z / CELL)];
  const [fu, fv] = [x / CELL - i, z / CELL - j];
  const h = (u: number, v: number) => Math.fround(at(CELL * (i + u), CELL * (j + v)));
  const [a, e] = [h(0, 0), h(1, 1)];
  return fu >= fv
    ? a + (h(1, 0) - a) * fu + (e - h(1, 0)) * fv
    : a + (h(0, 1) - a) * fv + (e - h(0, 1)) * fu;
};

// ---------------------------------------------------------------------------------------------
// Boxes.

const box = (
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  top: number,
  tint?: Vec3,
): Brush => ({ min: [x0, y0, z0], max: [x1, y1, z1], top, side: top, ...(tint ? { tint } : {}) });
const ghost = (b: Brush): Brush => ({ ...b, ghost: true });

const flip = (b: Brush): Brush => ({
  ...b,
  min: [b.min[0], b.min[1], ZED - b.max[2]],
  max: [b.max[0], b.max[1], ZED - b.min[2]],
  ...(b.tint ? { tint: b.tint === RED ? BLUE : b.tint } : {}),
});
const flipPoint = ([x, y, z]: Vec3): Vec3 => [x, y, ZED - z];
const both = (l: Vec3[], ...mid: Vec3[]): Vec3[] => [...l, ...l.map(flipPoint), ...mid];

/** A piece of the wreck or of a camp for whoever draws it: what it is and its box. */
export interface Piece {
  kind: string;
  min: Vec3;
  max: Vec3;
}
/** Red's pieces and the centre line's, as they are made: ghosts, collided with and drawn by the scenery (client/hulk.ts). */
const mine: Piece[] = [];
const line: Piece[] = [];
const note = (l: Piece[], kind: string, b: Brush): Brush => {
  l.push({ kind, min: b.min, max: b.max });
  return ghost(b);
};

/** The highest and the lowest ground under a rectangle. */
const under = (x0: number, z0: number, x1: number, z1: number): [number, number] => {
  const l = [0, 0.25, 0.5, 0.75, 1].flatMap(u =>
    [0, 0.25, 0.5, 0.75, 1].map(v => walked(x0 + (x1 - x0) * u, z0 + (z1 - z0) * v)),
  );
  return [Math.max(...l), Math.min(...l)];
};
/**
 * A piece lying on the sand: its top `h` over the highest ground under it (to 1/32 m), its foot
 * half a metre under the lowest.
 */
const lay = (
  kind: string,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  h: number,
  tex: number,
  tint?: Vec3,
): Brush => {
  const [hi, lo] = under(x0, z0, x1, z1);
  return note(mine, kind, box(x0, lo - 0.5, z0, x1, Math.round((hi + h) * 32) / 32, z1, tex, tint));
};
/** The middle of a piece's top: where a pack or a rack stands on it. */
const on = (b: Brush): Vec3 => [(b.min[0] + b.max[0]) / 2, b.max[1], (b.min[2] + b.max[2]) / 2];

// ---------------------------------------------------------------------------------------------
// The wreck, on the line.

/** A solid section: its rings from x0 to x1, the first `skip` left out. */
const rings = (n: number, skip = 0): Brush[] => {
  const [x0, x1] = HULL.sections[n];
  const c = HULL.axis[n];
  return RINGS.slice(skip, -1).map(([y, half], k) =>
    note(
      line,
      'hull',
      box(x0, c + y, MID - half, x1, c + RINGS[k + skip + 1][0], MID + half, METAL),
    ),
  );
};
const BACK = HULL.axis.map(c => c + HULL.r);

/** The middle section, hollow under its axis: the hold's floor, its ends, its flanks with a door each, two bulkheads. */
const hold = (): Brush[] => {
  const [x0, x1] = HULL.sections[1];
  const { floor, ceil, half, x, door, lintel, walls, way } = HOLD;
  const out = RINGS[0][1];
  const wall = (z0: number, z1: number): Brush[] => [
    box(x[0], floor, z0, door[0], ceil, z1, METAL),
    box(door[1], floor, z0, x[1], ceil, z1, METAL),
    box(door[0], floor + lintel, z0, door[1], ceil, z1, STEEL),
  ];
  return [
    box(x0, HULL.axis[1] + RINGS[0][0], MID - out, x1, floor, MID + out, GRATE),
    box(x0, floor, MID - out, x[0], ceil, MID + out, METAL),
    box(x[1], floor, MID - out, x1, ceil, MID + out, METAL),
    ...wall(MID + half, MID + out),
    ...wall(MID - out, MID - half),
    ...walls.flatMap(([a, b]) => [
      box(a, floor, MID - half, b, ceil, MID - way / 2, STEEL),
      box(a, floor, MID + way / 2, b, ceil, MID + half, STEEL),
      box(a, floor + lintel, MID - way / 2, b, ceil, MID + way / 2, STEEL),
    ]),
  ].map(b => note(line, 'hold', b));
};

/** A heap of ribs in the middle of each gap, a pack on it, and a fallen frame leaning on each broken end. */
const GAPS = [40, 78].map(x => {
  const [hi, lo] = under(x - 1.5, MID - 1.5, x + 1.5, MID + 1.5);
  const top = Math.round((Math.max(hi, FRAME.water) + 0.4) * 32) / 32;
  return {
    x,
    top,
    heap: box(x - 1.5, lo - 0.5, MID - 1.5, x + 1.5, top, MID + 1.5, STEEL, ORANGE),
  };
});
/** A frame fallen against one broken end of each gap, on both sides of the line: the way through is between it and the heap, or round the heap's other side. */
const FRAMES = [36, 74].flatMap(x => {
  const [hi, lo] = under(x, MID + 3, x + 1.2, MID + 5.5);
  const b = box(x, lo - 0.5, MID + 3, x + 1.2, Math.round((hi + 1.4) * 32) / 32, MID + 5.5, STEEL);
  return [b, flip(b)];
});
/** The raft of the tail's skin afloat off its end, on the line: the middle of the way round. */
const RAFT = box(0.5, -0.3, MID - 4, 5, 0.4, MID + 4, METAL);

const centre: Brush[] = [
  ...rings(0),
  ...hold(),
  ...rings(1, 1),
  ...rings(2),
  ...GAPS.map(g => note(line, 'heap', g.heap)),
  ...FRAMES.map(b => note(line, 'frame', b)),
  note(line, 'raft', RAFT),
  // Behind the first palms, from one headland to the other and through the nose.
  ghost(box(EDGE.east, -10, 0, EDGE.east + 2, 40, ZED, STONE)),
];

// ---------------------------------------------------------------------------------------------
// Red's half.

/** The wing: steps from its tip on the sand to the hull's back, solid where a runner would not fit under it. */
const wing = (): Brush[] => {
  const [tx0, tx1, tz] = WING.tip;
  const end = MID + RINGS[3][1];
  const deep = (tz - end) / STEPS;
  const span = (z: number) => {
    const t = c1((tz - z) / (tz - MID - HULL.r));
    return [tx0 + (WING.root[0] - tx0) * t, tx1 + (WING.root[1] - tx1) * t];
  };
  const y0 = under(tx0, tz - deep, tx1, tz)[0] + 0.3;
  return Array.from({ length: STEPS }, (_, k) => {
    const [z1, z0] = [tz - k * deep, tz - (k + 1) * deep];
    const [x0, x1] = span((z0 + z1) / 2);
    const y = y0 + ((BACK[1] - y0) * k) / (STEPS - 1);
    const [hi, lo] = under(x0, z0, x1, z1);
    // Over the hull's first shoulder it is a slab whatever is under it, and it lies on the second: no slot under it there.
    const slab = z1 <= MID + HULL.r || y - THICK - hi >= 2.2;
    const y1 = z1 <= MID + RINGS[2][1] ? HULL.axis[1] + RINGS[3][0] : slab ? y - THICK : lo - 0.5;
    return note(mine, 'wing', box(x0, y1, z0, x1, y, z1, METAL));
  });
};

/** The nacelle on the sand, lying along z and run through: two flanks, a roof between them. */
const nacelle = (): Brush[] => {
  const [x, z, r, l] = ENGINES[0];
  const [z0, z1] = [z - l / 2, z + l / 2];
  const [hi, lo] = under(x - r, z0, x + r, z1);
  const y = Math.round(hi * 32) / 32;
  return [
    box(x - r, lo - 0.5, z0, x - 1.3, y + 3, z1, METAL),
    box(x + 1.3, lo - 0.5, z0, x + r, y + 3, z1, METAL),
    box(x - 1.3, y + 2.4, z0, x + 1.3, y + 3.6, z1, METAL, ORANGE),
  ].map(b => note(mine, 'nacelle', b));
};
const NACELLE = nacelle();

/** The engine in the lagoon off the tail's end, awash: its back 1.4 m over the water. */
const ENGINE = (() => {
  const [x, z, r, l] = ENGINES[1];
  return note(mine, 'engine', box(x - r, -5, z - l / 2, x + r, 1.4, z + l / 2, METAL, ORANGE));
})();
/** Skin afloat between the shallows and that engine: the first runs aground where the water is knee deep. */
const FLOATS = [
  note(mine, 'float', box(16, -1.6, 116, 22, 0.35, 119, METAL)),
  note(mine, 'float', box(10, -0.2, 113, 13, 0.5, 116, METAL)),
];

/** The camp: the pod, the flag's step by it, a crate under each rack with a tarpaulin over it. */
const POD_BOX = note(
  mine,
  'pod',
  box(POD[0] - 3, CAMP - 0.5, POD[1] - 3, POD[0] + 3, CAMP + 3, POD[1] + 3, METAL),
);
const DAIS = note(
  mine,
  'dais',
  // A hatch cover lying on the sand: a raised step read as a floor floating over it (the user, 2026-11-25).
  box(POD[0] - 2, CAMP - 0.5, POD[1] - 10, POD[0] + 2, CAMP + 0.05, POD[1] - 6, PAINT, RED),
);
const crate = (x: number, z: number, h = 0.4, tint?: Vec3) =>
  lay('crate', x - 1.5, z - 1.5, x + 1.5, z + 1.5, h, WOOD, tint);
/** A tarpaulin on four poles, wider than deep: no pole on a diagonal of the crate under it, where it would hide the rack from a spawn. */
const shelter = (x: number, z: number): Brush[] =>
  [
    box(x - 2.6, CAMP + 2.6, z - 2.1, x + 2.6, CAMP + 2.75, z + 2.1, PAINT, RED),
    ...[-1, 1].flatMap(a =>
      [-1, 1].map(b =>
        box(
          x + 2.5 * a - 0.1,
          CAMP - 0.5,
          z + 2 * b - 0.1,
          x + 2.5 * a + 0.1,
          CAMP + 2.6,
          z + 2 * b + 0.1,
          STEEL,
        ),
      ),
    ),
  ].map(b => note(mine, 'shelter', b));
const [GUNS, BLADES] = [crate(49, 176), crate(71, 176)];
const [RIFLES, RAILS] = [crate(84, 150, 0.4, RED), crate(33, 128, 0.4, RED)];

/** The debris between the camp and the wing, a line to run: a panel, a container, the landing gear, the nacelle's roof, the wing. */
const PANEL = lay('panel', 67, 159.5, 70.5, 163, 0.9, METAL);
const CONTAINER = lay('container', 68.5, 151, 71.1, 157, 2, METAL, ORANGE);
const GEAR = lay('gear', 68.6, 145.6, 71, 148, 2.9, STEEL, YELLOW);
const BOGIE = lay('gear', 67.6, 144.6, 72, 145.6, 1.2, STEEL);

/** What else lies about red's half, most with a pack on it. */
const SCRAP = {
  camp: [crate(76, 168), crate(40, 172)],
  west: [
    lay('panel', 44.5, 156.5, 47.5, 159.5, 0.5, METAL),
    lay('container', 33, 148.7, 39, 151.3, 2.2, METAL, ORANGE),
    lay('panel', 46.5, 138.5, 49.5, 141.5, 0.4, METAL),
    lay('panel', 25.5, 134.5, 28.5, 137.5, 0.5, METAL),
    lay('panel', 50.5, 114.5, 53.5, 117.5, 0.4, METAL),
  ],
  east: [
    lay('panel', 62.5, 120.5, 65.5, 123.5, 0.4, METAL),
    crate(80, 146),
    crate(85.5, 140),
    crate(84, 128),
    lay('panel', 84.5, 110.5, 87.5, 113.5, 0.4, METAL),
  ],
  // Skin standing in the sand: cover on the open strand, nothing to stand on.
  cover: [
    lay('panel', 43.6, 131, 44, 137, 2.6, METAL),
    lay('panel', 48.5, 146.6, 53.5, 147, 2.4, METAL),
    lay('panel', 78, 131.6, 83, 132, 2.6, METAL),
    lay('panel', 30, 141.6, 35, 142, 2.2, METAL),
    lay('container', 76, 155, 82, 157.6, 2.6, METAL, ORANGE),
  ],
};

/**
 * The boxes a headland rock collides with, inside what rockOf() draws: layers `tall` high, each cut
 * across x in strips `wide` wide that run from the rock's face toward the beach back to its far
 * side or to `back`. Coarser than moon.ts fitted(), which would make 3000 boxes of red's eleven
 * rocks: these stand at the end of the beach, behind the spawns.
 */
const massed = (
  x: number,
  z: number,
  R: number,
  H: number,
  s: number,
  back: number,
): number[][] => {
  const { reach } = rockOf(s, R, H);
  const g = under(x - 0.8 * R, z - 0.8 * R, x + 0.8 * R, z + 0.8 * R);
  const mid = walked(x, z) + rockMid(H);
  const top = mid + reach([0, 1, 0]) - 0.1;
  const inside = (dx: number, dy: number, dz: number) => {
    const l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    return l <= reach([dx / l, dy / l, dz / l]);
  };
  /**
   * The rock's extent along z at (x, y) round its middle: where it starts and ends, or nothing
   * where the line misses it abreast of its middle (a lobe further along is left out: inside).
   */
  const cut = (dx: number, dy: number): [number, number] | undefined => {
    if (!inside(dx, dy, 0)) {
      return undefined;
    }
    const edge = (way: number) => {
      let [a, b] = [0, 1.6 * R];
      for (let k = 0; k < 9; k++) {
        const m = (a + b) / 2;
        if (inside(dx, dy, way * m)) {
          a = m;
        } else {
          b = m;
        }
      }
      return way * a;
    };
    return [edge(-1), edge(1)];
  };
  const out: number[][] = [];
  const [wide, tall] = [2, 2];
  for (let y0 = g[1] - 0.5; y0 < top - 0.3; y0 += tall) {
    const y1 = Math.min(y0 + tall, top);
    for (let x0 = -1.5 * R; x0 < 1.5 * R; x0 += wide) {
      const cuts = [0.1, 0.5, 0.9].flatMap(u =>
        [Math.max(y0, g[1]) + 0.05, y1].map(y => cut(x0 + wide * u, y - mid)),
      );
      if (cuts.every(c => c)) {
        const z0 = z + Math.max(...cuts.map(c => c![0]));
        const z1 = Math.min(z + Math.min(...cuts.map(c => c![1])), back);
        if (z1 - z0 > 0.4) {
          out.push([x + x0, y0, z0, x + x0 + wide, y1, z1]);
        }
      }
    }
  }
  return out;
};
/** Red's headland: each rock where it stands (x, the ground's height, z), its radius, height and seed, and the boxes it collides with. */
const CRAGS = ROCKS.map(([x, z, R, H, s]) => ({
  at: [x, walked(x, z), z],
  R,
  H,
  s,
  parts: massed(x, z, R, H, s, ZED - EDGE.cape + 2),
}));

const half: Brush[] = [
  ...wing(),
  ...NACELLE,
  ENGINE,
  ...FLOATS,
  POD_BOX,
  DAIS,
  GUNS,
  BLADES,
  ...shelter(49, 176),
  ...shelter(71, 176),
  RIFLES,
  RAILS,
  PANEL,
  CONTAINER,
  GEAR,
  BOGIE,
  ...Object.values(SCRAP).flat(),
  // The first palms' trunks.
  ...TRUNKS.map(([x, z, r]) => {
    const y = walked(x, z);
    return ghost(box(x - r, y - 1, z - r, x + r, y + 9, z + r, WOOD));
  }),
  // The headland, and the wall in it.
  ...CRAGS.flatMap(c => c.parts).map(([x0, y0, z0, x1, y1, z1]) =>
    ghost(box(x0, y0, z0, x1, y1, z1, STONE)),
  ),
  ghost(box(-60, -10, ZED - EDGE.cape, EDGE.east + 2, 40, ZED - EDGE.cape + 2, STONE)),
];

/**
 * What the scenery draws on the map's boxes, both halves, blue's mirrored: the hull's sections
 * (x0, x1, the axis' height), every piece of the wreck and of the camps by kind (hull, hold, heap,
 * frame, raft, wing, nacelle, engine, float, pod, dais, crate, shelter, panel, container, gear), and the
 * headlands' rocks where they stand.
 */
export const LAYOUT = {
  hull: HULL.sections.map(([x0, x1], n) => [x0, x1, HULL.axis[n]]),
  pieces: [
    ...line,
    ...mine,
    ...mine.map(({ kind, min, max }): Piece => ({
      kind,
      min: [min[0], min[1], ZED - max[2]],
      max: [max[0], max[1], ZED - min[2]],
    })),
  ],
  crags: [
    ...CRAGS,
    ...CRAGS.map(c => ({
      ...c,
      at: [c.at[0], c.at[1], ZED - c.at[2]],
      parts: c.parts.map(([x0, y0, z0, x1, y1, z1]) => [x0, y0, ZED - z1, x1, y1, ZED - z0]),
    })),
  ],
};

// ---------------------------------------------------------------------------------------------
// Spawns, racks, packs.

/** Eight, behind the pod, facing the other camp. */
const SPAWNS: Spawn[] = [46, 54, 62, 70].flatMap((x): Spawn[] => [
  [x, CAMP, 181, 0],
  [x + 4, CAMP, 184, 0],
]);

const team = (red: boolean) => {
  const side = (p: Vec3) => (red ? p : flipPoint(p));
  return {
    base: side(on(DAIS)),
    spawns: red ? SPAWNS : SPAWNS.map(([x, y, z]): Spawn => [x, y, ZED - z, Math.PI]),
    rack: side(on(GUNS)),
    blade: side(on(BLADES)),
    rifle: side(on(RIFLES)),
    rail: side(on(RAILS)),
  };
};
/** On the hull's shoulder east of the wing, red's side. */
const SHOULDER: Vec3 = [71, HULL.axis[1] + RINGS[3][0], MID + 3.7];

export const BEACH: WorldDef = {
  name: 'Landfall',
  tag: 'Beach · wreck',
  lore: 'A ship came down across a Caribbean beach, its tail in the lagoon and its nose in the trees. The survivors camp at either end of the sand and fight over the wreck between them.',
  brushes: [...half, ...half.map(flip), ...centre],
  teams: [team(true), team(false)],
  // Health: the camp, the strand's west, the hold's door, the first float, the trees; one in each gap.
  packs: both(
    [on(SCRAP.camp[0]), on(SCRAP.west[2]), on(SCRAP.west[4]), on(FLOATS[0]), on(SCRAP.east[3])],
    ...GAPS.map(({ x, top }): Vec3 => [x, top, MID]),
  ),
  // Ammo: three on the line of debris, three west, three east; two in the hold.
  ammo: both(
    [
      on(PANEL),
      on(CONTAINER),
      on(GEAR),
      on(SCRAP.west[0]),
      on(SCRAP.west[1]),
      on(SCRAP.west[3]),
      on(SCRAP.east[0]),
      on(SCRAP.east[1]),
      on(SCRAP.east[4]),
    ],
    [51, HOLD.floor, MID],
    [67, HOLD.floor, MID],
  ),
  // Cells: the camp, the nacelle's roof, the second float, the trees, the hull's shoulder; one in the hold between the doors.
  cells: both(
    [on(SCRAP.camp[1]), on(NACELLE[2]), on(FLOATS[1]), on(SCRAP.east[2]), SHOULDER],
    [59, HOLD.floor, MID],
  ),
  // Armour: on the engine in the lagoon, and on the hull's back at its broken west end.
  vests: both([on(ENGINE)], [46.5, BACK[1], MID]),
  floor: DEPTH,
  fires: FIRES.map(([x, y, z, , r]): [number, number, number, number, number] => [
    x,
    y,
    z,
    0.6 * r + FLAME[0],
    FLAME[1],
  ]),
  // The sand and the bed, out to an ellipse round the beach that nobody reaches: the walls and
  // the depth close it first. No hole: every brush stands on the ground.
  relief: { hole: [0, 0, 0, 0], bound: [56, MID, 100, 160], cell: CELL, at },
  // High over the sea, warm; a blue sky paling to the horizon and a light haze.
  sun: { dir: [-0.47, 0.83, 0.3], color: [3.2, 3, 2.6] },
  sky: [
    [0.1, 0.32, 0.75],
    [0.55, 0.75, 0.9],
  ],
  fog: [0.6, 0.78, 0.9, 0.0012],
  scenery: 'beach',
};
