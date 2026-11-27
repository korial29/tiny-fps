// Landfall, the beach level (docs/BEACH.md): a capture the flag on a Caribbean beach cut in two by
// a crashed ship. Red's half (z 125 to 250) is written and flipped across z = 125; the wreck lies
// along x on that line, which is its own plane of symmetry, and is written once.
// The sand and the seabed are relief (relief.ts); everything else is grey boxes for now.
// No DOM, no Node API.
import { TEAM_TINT } from './map';
import { rockMid } from './moon';
import { hash, noise } from './relief';
import { TEX } from './types';
import type { Brush, Spawn, WorldDef } from './world';

type Vec3 = [number, number, number];
type V3 = Vec3;

/** The beach is 250 m long: a point at z has its twin at ZED - z. */
export const ZED = 250;
const MID = ZED / 2;
const [RED, BLUE] = TEAM_TINT;
const { METAL, STEEL, PAINT, WOOD, STONE, GRATE } = TEX;
const ORANGE: Vec3 = [1, 0.42, 0.08];
const YELLOW: Vec3 = [0.95, 0.75, 0.1];

/**
 * The frame every piece is laid on, metres. Across x, from the sea to the forest: the water is too
 * deep at `sea`, the waterline is at `shore` (the sand is at `water` there), the first trees stand
 * at `trees`, nothing is walked past `east`. Along z the sand runs on past each camp, among rocks,
 * to the headland's mass of rock, which closes the beach before z = `cape` and after ZED - `cape`:
 * past the ends of the 250 m, `cape` being negative.
 */
export const FRAME = { sea: 0, shore: 30, trees: 90, east: 110, cape: -6, water: 0 };

/**
 * Feet under this have gone under: the runner is put back at a spawn (WorldDef.floor, the fall of
 * Highline's roofs, no new rule). The water's surface is y 0 and the eye is 1.6 m over the feet:
 * at 1.4 m of water a standing runner still looks over it.
 */
export const DEPTH = -1.4;
/** Where nobody goes, x and z: the ghost wall behind the first palms, and the one in each headland's mass, 4 m into it (z = cape and ZED - cape). */
export const EDGE = { east: FRAME.trees + 5, cape: FRAME.cape - 4 };

/**
 * The wreck, a hull along x on the centre line, broken in three: each section's x0 and x1. The
 * tail is in the water, the middle on the sand, the nose in the trees; the two gaps are crossed on
 * foot. `r` is the hull's half width at the belt and `sunk` how deep its axis sits under r, so its
 * back is at 2 r - sunk over the sand. `axis` is the height of each section's axis: each lies level,
 * 2 m in the ground it came to rest on. The back is flat for `spine` either side of the line and
 * the skin is `skin` thick: the hull is hollow.
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
  spine: 2.5,
  skin: 0.85,
};
/**
 * The hull's section: its half width at the height h over a section's axis. Round, 7 m at the
 * belt, a keel 7 m under it and a flat back 7 m over it. Only + - * / and Math.sqrt: the host and
 * the clients build the same boxes from it.
 */
export const section = (h: number): number => {
  const q = Math.max(1 - (h * h) / (HULL.r * HULL.r), 0);
  return Math.max(HULL.r * Math.sqrt(Math.sqrt(q * Math.sqrt(q))), h > 0 ? HULL.spine : 0);
};
/**
 * The heights over the axis the skin is cut at, above a section's floor: a box of skin on each
 * flank from one to the next, as wide as the section half way up it. Where a line is one of DECKS
 * the row under it is a floor across the hull instead.
 */
export const LINES = [-4, -2.05, -1.75, 0, 1.95, 2.25, 3.6, 5, 5.5, 6, 6.5, 7];
/** The floors over the axis: the lower deck, the upper one (the middle section's gallery) and the back. */
export const DECKS = [-1.75, 2.25, HULL.r];
/** The section as a table, each line and the half width there. */
export const RINGS = LINES.map(h => [h, section(h)]);
/**
 * The three sections, tail first. `cut`: the lengths it is built in (x0, x1, the share of the
 * section's width there, and a skin so thick that it is solid: the stern). `floor`: the lowest
 * floor over the axis, solid down to the keel (the tail's is awash, the middle's is the hold).
 * `holes`: in the floors, each the index in DECKS, x0, x1 and the half width (9: from skin to
 * skin). `tears`: in both flanks, x0, x1 and the heights over the axis, from one of LINES to
 * another. `fair`: the fairing along each flank from the belt up to the upper deck, x0, x1 and how
 * far out past r; its top is a ledge. `crates`: a crate under the edge of a hole, to climb to the
 * floor above: its x0 and the index of the deck it stands on (-1: the floor). It is 1 m high on
 * the floor, 1.4 m on the lower deck and 2 m on the upper one: the hands reach the edge from it
 * before the head is under the floor above, and the hanging body clears it.
 */
export const SHIP = [
  {
    cut: [
      [6, 7, 0.7, 9],
      [7, 13, 0.76],
      [13, 20, 0.9],
      [20, 36, 1],
    ],
    floor: -4.75,
    holes: [
      [0, 14, 20, 3],
      [1, 24, 29, 9],
      [2, 13, 18.5, 2.3],
    ],
    tears: [
      [21, 30, -1.75, 1.95],
      [31, 36, 2.25, 5],
    ],
    fair: [[30, 36, 3]],
    crates: [
      [18.3, -1],
      [24.2, 0],
      [16.8, 1],
    ],
  },
  {
    cut: [[44, 74, 1]],
    floor: -5,
    holes: [
      [0, 51.5, 56, 3.2],
      [0, 67, 70.5, 9],
      [1, 44, 48, 9],
      [1, 60.5, 65.5, 3],
      [2, 44, 47, 9],
      [2, 53, 58, 2.2],
    ],
    tears: [
      // The hold's doors, their sills a metre over its floor and 2 m over the sand: climbed into.
      [57.5, 60.5, -4, -2.05],
      [47.5, 55, -1.75, 1.95],
      [64, 71, 2.25, 5],
    ],
    fair: [
      [44, 47.5, 3.2],
      [55, 71, 4.4],
      [71, 74, 3],
    ],
    crates: [
      [54.3, -1],
      [60.7, 0],
      [56.3, 1],
    ],
  },
  {
    cut: [
      [82, 90, 1],
      [90, 97, 0.85],
    ],
    floor: -5,
    holes: [
      [0, 86.5, 90, 3],
      [1, 82, 85, 9],
      [2, 87.5, 91.5, 2],
    ],
    tears: [[84.5, 91, -1.75, 1.95]],
    fair: [
      [82, 84.5, 2.7],
      [91, 95, 1.5],
    ],
    crates: [
      [88.3, -1],
      [83.3, 0],
      [87.7, 1],
    ],
  },
];
/** The middle section's hold: its floor and ceiling, the half width inside, its ends, the doors' x0 and x1 and their height. No bulkhead is left in it. */
export const HOLD = {
  floor: HULL.axis[1] + SHIP[1].floor,
  ceil: HULL.axis[1] + LINES[1],
  half: 4.525,
  x: HULL.sections[1],
  door: SHIP[1].tears[0],
  lintel: LINES[1] - SHIP[1].floor,
  walls: [] as number[][],
  way: 2.4,
};

/**
 * Red's wing, lying from the fairing's ledge down to the sand, broken in three. `lead` and `trail`
 * are its outline, x by span from the root (swept, notched, a raked tip); a metre of span is `span`
 * metres on the ground. `root` is x0 and x1 at the hull. `pieces`: the span each runs from and to,
 * how far it was pushed out, its top at its inner and its outer end, and how far its outline is
 * sheared along x for each 1.4 m of it on the ground (it lies turned in the wing's plane). The first is
 * still attached; the breaks are 0.98 m wide, shorter than a buggy's wheelbase (the user, 2026-11-27). `rails`: the x of the two beams that run through the
 * breaks and hold the pieces, 0.45 m wide. Blue's is its twin.
 */
export const WING = {
  root: [45, 71],
  lead: [
    [71, 0],
    [69, 8],
    [64, 18],
    [61.5, 26],
    [60, 26],
    [59, 38],
    [60.5, 38],
    [59, 42],
    [57.5, 46.5],
    [54, 47.5],
  ],
  trail: [
    [45, 0],
    [46.5, 10],
    [50, 30],
    [52.5, 44],
    [54, 47.5],
  ],
  span: 0.78,
  pieces: [
    [0, 14.5, 0, 8.5, 6.4, 0],
    [15.5, 30.5, 0.2, 6.6, 3.2, 0.17],
    [31.5, 47.5, 0.4, 3.0, 1.45, -0.2],
  ],
  rails: [53.5, 58],
};

/**
 * Red's engines, torn off: the middle of each (x, z), its radius and length. The first lies on the
 * sand beside the wreck near the waterline, askew (z by x along it), burning: nobody walks through
 * it. The second lies along z in the lagoon off the tail's end, awash, stood on.
 */
export const ENGINES = [
  [38.5, 150.3, 2.7, 19, 0.78],
  [4.5, 137, 2.5, 9],
];

/**
 * Red's camp: the survivors' hearth its flag stands by (x, z, the radius of what lies round it).
 * An escape pod stood there, a box 6 m wide that read as a building (the user, 2026-11-27).
 */
export const HEARTH = [60, 219, 4];
/** The camp's ground, level. */
export const CAMP = 1.25;

/**
 * Red's headland: each rock's x, z, radius, height and seed, a form of blockOf(). Blue's are their
 * twins. The map makes them solid and the scenery draws them, both from this list. Low and
 * scattered on the sand behind the camp, open sand between them, and along the waterline none: the
 * strand runs on past the headland's wall (EDGE.cape), which stands on open sand there, to rocks
 * in the sea that are only drawn. Bigger toward the trees, where the headland's mass begins.
 */
export const ROCKS = [
  // Out on the sand, low.
  [38, 237, 3.5, 2.6, 1],
  [57, 242, 3, 2.2, 2],
  [47, 251, 4, 3, 3],
  [66, 254, 4.5, 3.6, 4],
  [78, 241, 4, 3.4, 5],
  [33, 256, 2.8, 1.8, 6],
  // Toward the trees, bigger: the foot of the mass.
  [87, 250, 5.5, 5, 7],
  [97, 243, 6, 6.5, 8],
  [100, 256, 7.5, 9, 9],
  [89, 262, 7, 7, 10],
];

/**
 * The form of a block of granite of radius R and height H from a seed, as rockOf() in moon.ts: how
 * far it reaches from its middle (rockMid() over the ground) along a unit vector. A rounded box
 * (superellipsoids of the powers 4 and 8 blended: flat faces, rounded edges), turned and stretched by the seed, split
 * by two planes (a corner or a side sheared off, the edge softened), its faces dented by a low
 * noise. Under its middle it goes straight down, as wide as at its middle, to under the ground.
 * Only + - * /, Math.sqrt and the hash: the map's boxes come from it on every side.
 */
export const blockOf = (s: number, R: number, H: number) => {
  const h = (k: number) => hash(s, k, 151);
  // A turn about y with no Math.cos: the point of a circle by its rational parameter.
  const t = 2 * h(1) - 1;
  const [cx, sx] = [(1 - t * t) / (1 + t * t), (2 * t) / (1 + t * t)];
  const c = H - rockMid(H);
  const [a, b] = [R * (0.85 + 0.3 * h(2)), R * (0.6 + 0.3 * h(3))];
  const deep = rockMid(H) + 0.7 * H;
  /** The split planes: a unit normal and how far out of the middle along it, of what the box reaches there. */
  const cuts = [4, 8].map(k => {
    const [nx, ny, nz] = [2 * h(k) - 1, 0.35 * h(k + 1), 2 * h(k + 2) - 1];
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
    return [nx / l, ny / l, nz / l, 0.7 + 0.2 * h(k + 3)];
  });
  const box = (u: V3): number => {
    const x = (u[0] * cx + u[2] * sx) / a;
    const z = (u[2] * cx - u[0] * sx) / b;
    const y = u[1] / c;
    const [x4, y4, z4] = [x * x * x * x, y * y * y * y, z * z * z * z];
    // A quarter of the power 4, three of 8: flat faces, the edges rounded but not soft.
    const p4 = Math.sqrt(Math.sqrt(x4 + y4 + z4));
    const p8 = Math.sqrt(Math.sqrt(Math.sqrt(x4 * x4 + y4 * y4 + z4 * z4)));
    return 0.25 / p4 + 0.75 / p8;
  };
  const reach = (u: V3): number => {
    if (u[1] < 0) {
      const l = Math.sqrt(u[0] * u[0] + u[2] * u[2]);
      return l < 1e-6 ? deep : Math.min(reach([u[0] / l, 0, u[2] / l]) / l, deep / -u[1]);
    }
    let r = box(u);
    for (const [nx, ny, nz, k] of cuts) {
      const d = u[0] * nx + u[1] * ny + u[2] * nz;
      if (d > 1e-3) {
        // Where the plane is, softened over 0.2 m: min(r, p) less a round fillet.
        const p = (k * box([nx, ny, nz])) / d;
        const w = Math.max(0.2 - Math.abs(r - p), 0) / 0.2;
        r = Math.min(r, p) - 0.05 * w * w;
      }
    }
    return r * (0.95 + 0.08 * noise(1.3 * u[0] + s, 1.3 * u[2] + 1.1 * u[1], s + 3));
  };
  return { reach };
};

/**
 * Red's first row of palms, the trunks a runner can touch: each x, z and radius at the foot. The
 * map makes them solid and the scenery draws a palm on each; the forest behind is drawn only.
 * The first stands clear of the nose's flank.
 */
export const TRUNKS = Array.from({ length: 28 }, (_, i) => [
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
/** Where its rows of nodes lie along z: one on the centre line, so that every node has its twin (ZED / CELL is not whole). */
export const NODE = MID % CELL;
/**
 * Where the ground is level, x0, z0, x1, z1 (z in red's half) and the height: the way in to the
 * hold's door through the bank, the sand under the tip of the wing, the camp. Level for 6 m round each, so that
 * the lattice's triangles are, and back to the sand 6 m further; none within 12 m of the next.
 */
export const FLATS = [
  [57, 132, 61, 138, HOLD.floor - 0.95],
  [56, 171, 66, 175, 1.3],
  [44, 209, 76, 229, CAMP],
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
  const [i, j] = [Math.floor(x / CELL), Math.floor((z - NODE) / CELL)];
  const [fu, fv] = [x / CELL - i, (z - NODE) / CELL - j];
  const h = (u: number, v: number) => Math.fround(at(CELL * (i + u), NODE + CELL * (j + v)));
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

/**
 * A row of the hull from x0 to x1 between two heights: a slab `w` either side of the line, less
 * its `holes` (x0, x1 and the half width left open, in order along x) and, between them, less
 * `inner` either side of the line: a floor with its holes, or a box of skin on each flank with its
 * tears.
 */
const slab = (
  kind: string,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  w: number,
  holes: number[][],
  inner = 0,
): Brush[] => {
  const out: Brush[] = [];
  let x = x0;
  const cut = (a: number, b: number, half: number) => {
    const [p, q] = [Math.max(a, x0), Math.min(b, x1)];
    if (q > p && half < w) {
      for (const [u, v] of half > 0
        ? [
            [-w, -half],
            [half, w],
          ]
        : [[-w, w]]) {
        out.push(
          note(line, kind, box(p, y0, MID + u, q, y1, MID + v, kind == 'deck' ? GRATE : METAL)),
        );
      }
    }
  };
  for (const [a, b, half] of [...holes, [x1, x1, 0]]) {
    cut(x, a, inner);
    cut(a, b, half);
    x = Math.max(x, b);
  }
  return out;
};
/** The hull: each section's floor down to the keel, then a row from each line to the next (a floor under a deck's line, skin elsewhere), the fairings and the crates. */
const hull = (): Brush[] =>
  SHIP.flatMap(({ cut, floor, holes, tears, fair, crates }, n) => {
    const c = HULL.axis[n];
    const lines = [floor, ...LINES.filter(h => h > floor + 0.5)];
    return [
      ...cut.flatMap(([x0, x1, s, t = HULL.skin]) => {
        const w = (h: number) => Math.round(16 * s * section(h)) / 16;
        return [
          ...slab('deck', x0, x1, c - HULL.r, c + floor, w(floor), []),
          ...lines.slice(1).flatMap((b, k) => {
            const a = lines[k];
            const deck = DECKS.indexOf(b);
            const out = b < HULL.r ? w(deck < 0 ? (a + b) / 2 : b) : s * HULL.spine;
            // The level's floor: a flank is plumb inside from there up to the belt, and a vault over it.
            const low = a < DECKS[0] ? floor : a < DECKS[1] ? DECKS[0] : DECKS[1];
            return [
              ...(deck < 0
                ? slab(
                    'skin',
                    x0,
                    x1,
                    c + a,
                    c + b,
                    out,
                    tears.filter(e => e[2] <= a && e[3] >= b).map(([p, q]) => [p, q, 99]),
                    Math.min(w(b), w(low)) - t,
                  )
                : slab(
                    'deck',
                    x0,
                    x1,
                    c + a,
                    c + b,
                    out,
                    holes
                      .filter(e => e[0] == deck)
                      .map(([, p, q, half]) => [p, q, Math.min(half, out - t)]),
                  )),
              ...(a >= 0 && b <= DECKS[1]
                ? fair.flatMap(([p, q, e]) =>
                    slab(
                      'fairing',
                      Math.max(p, x0),
                      Math.min(q, x1),
                      c + a,
                      c + b,
                      HULL.r + e,
                      [],
                      out,
                    ),
                  )
                : []),
            ];
          }),
        ];
      }),
      ...crates.map(([x, deck]) => {
        const y = c + (DECKS[deck] ?? floor);
        return note(
          line,
          'crate',
          box(x, y, MID - 0.75, x + 1.5, y + [1, 1.4, 2][deck + 1], MID + 0.75, WOOD),
        );
      }),
    ];
  });
const BACK = HULL.axis.map(c => c + HULL.r);

/**
 * A heap of wreckage across each gap, from one broken end to the other, on the line: nobody walks
 * through a gap (the user, 2026-11-26). Its top is 1.875 m over the highest sand under it (no
 * jump lands on it) and at most 2.8 m over the lowest (a jump and a pull up), a pack on it.
 */
const GAPS = HULL.sections.slice(1).map(([x1], n) => {
  const x0 = HULL.sections[n][1];
  const [hi, lo] = under(x0, MID - 1.5, x1, MID + 1.5);
  const top = Math.round((Math.max(hi, FRAME.water) + 1.875) * 32) / 32;
  return {
    x: (x0 + x1) / 2,
    top,
    heap: box(x0, lo - 0.5, MID - 1.5, x1, top, MID + 1.5, STEEL, ORANGE),
  };
});
/**
 * Each broken end's lowest floor crushed shut, from it to the deck over it and skin to skin: the
 * heap is not gone round inside the hull. Its x0 and x1, the section's.
 */
const JAMS = HULL.sections.flatMap(([x0, x1], n) =>
  [n && [x0, x0 + 1], n < 2 && [x1 - 1, x1]]
    .filter(e => e)
    .map(e => {
      const [a, b] = e as number[];
      const c = HULL.axis[n];
      const w = Math.round(16 * section(SHIP[n].floor)) / 16 - HULL.skin;
      return box(a, c + SHIP[n].floor, MID - w, b, c + LINES[1], MID + w, METAL);
    }),
);
/** A frame fallen against one broken end of each gap, on both sides of the line: the way through is between it and the heap, or round the heap's other side. */
const FRAMES = [36, 74].flatMap(x => {
  const [hi, lo] = under(x, MID + 3, x + 1.2, MID + 5.5);
  const b = box(x, lo - 0.5, MID + 3, x + 1.2, Math.round((hi + 1.4) * 32) / 32, MID + 5.5, STEEL);
  return [b, flip(b)];
});
/** The raft of the tail's skin afloat off its end, on the line: the middle of the way round. */
const RAFT = box(0.5, -0.3, MID - 4, 5, 0.4, MID + 4, METAL);

const centre: Brush[] = [
  ...hull(),
  ...GAPS.map(g => note(line, 'heap', g.heap)),
  ...FRAMES.map(b => note(line, 'frame', b)),
  ...JAMS.map(b => note(line, 'jam', b)),
  note(line, 'raft', RAFT),
  // Behind the first palms, from one headland to the other and through the nose.
  ghost(box(EDGE.east, -10, EDGE.cape - 2, EDGE.east + 2, 40, ZED - EDGE.cape + 2, STONE)),
];

// ---------------------------------------------------------------------------------------------
// Red's half.

/** How much a row of the wing stands over the next at most, metres. */
export const RISE = 0.15;
/** How thick the wing is at a span, drawn and collided with: a thin aerofoil, 0.6 m at the root and 0.15 m at the tip. */
export const thick = (v: number): number => 0.6 - (0.45 * v) / 47.5;
/** An edge of the wing's outline at a span. */
export const edge = (l: number[][], v: number): number => {
  const k = l.findIndex(p => p[1] > v);
  const [a, b] = [l[k - 1], l[k]];
  return a[0] + ((b[0] - a[0]) * (v - a[1])) / (b[1] - a[1]);
};
/**
 * The wing: each piece in rows across the span, a step down from one to the next, as wide as the
 * outline there and as thin as the wing (thick()), free of the sand under it (the user, 2026-11-26). Then the two rails
 * across the break before it, level with the lower of its two lips.
 */
const wing = (): Brush[] =>
  WING.pieces.flatMap(([v0, v1, push, y0, y1, shear], n) => {
    // From the lip of the fairing it lies against.
    const z = (v: number, out = push) => MID + HULL.r + SHIP[1].fair[1][2] + WING.span * v + out;
    const coarse = Math.ceil((z(v1) - z(v0)) / 1.4);
    // A row rises RISE at most over the next: a runner climbs it as a slope, and the drawn wing's
    // top (client/hulk.ts) lies within half of that of every row's.
    const rows = Math.max(coarse, Math.ceil((y0 - y1) / RISE - 1e-9) + 1);
    const last = WING.pieces[n - 1];
    return [
      ...Array.from({ length: rows }, (_, k) => {
        const v = v0 + ((v1 - v0) * (k + 0.5)) / rows;
        const dx = shear * coarse * ((k + 0.5) / rows - 0.5);
        const [xa, xb] = [WING.trail, WING.lead].map(l => Math.round(8 * (edge(l, v) + dx)) / 8);
        const [za, zb] = [k, k + 1].map(i => z(v0 + ((v1 - v0) * i) / rows));
        const y = y0 + ((y1 - y0) * k) / (rows - 1);
        return note(mine, 'wingpiece', box(xa, y - thick(v), za, xb, y, zb, METAL));
      }),
      ...(last
        ? WING.rails.map(x => {
            const y = Math.min(last[4], y0);
            return note(
              mine,
              'rail',
              box(x - 0.225, y - 0.45, z(last[1], last[2]), x + 0.225, y, z(v0), STEEL),
            );
          })
        : []),
    ];
  });

/** The engine on the sand, askew: strips across x, each as long as its body is wide there. */
const FALLEN = Array.from({ length: 6 }, (_, k) => {
  const [x, z, r, , skew] = ENGINES[0];
  const x0 = x - 7.5 + 2.5 * k;
  const mid = z + skew * (x0 + 1.25 - x);
  return lay(
    'fallen',
    x0,
    mid - r - 0.2,
    x0 + 2.5,
    mid + r + 0.2,
    3.5,
    METAL,
    k ? undefined : ORANGE,
  );
});

/**
 * Where it burns, both halves: the foot of each column of smoke (x, y, z), how high it rises, and
 * its radius at the foot and at the top (client/smoke.ts draws them). Their flames burn (FLAME), so
 * none stands on a way across (the user, 2026-11-25): on the back of the fallen engine, which
 * burns; on the south-west corner of each engine in the lagoon, clear of the jumps over its north
 * half (routes.ts LAGOON); and against each of the hull's four broken ends, thinner, 4.2 m over
 * its axis: over the heads of those on the upper deck (DECKS) and under the back.
 */
export const FIRES: number[][] = [
  ...[on(FALLEN[3]), [ENGINES[1][0] - 1.5, 1.3, ENGINES[1][1] + 3.5]].flatMap(([x, y, z]) => [
    [x, y, z, 42, 1.3, 7],
    [x, y, ZED - z, 42, 1.3, 7],
  ]),
  ...HULL.sections.flatMap(([x0, x1], n) =>
    [n && x0 - 0.6, n < 2 && x1 + 0.6]
      .filter(x => x)
      .map(x => [+x, HULL.axis[n] + 4.2, ZED / 2, 28, 0.9, 4]),
  ),
];
/** Metres the flames at a fire's foot reach out from its middle and up from it: smoke.ts stands three balls of 0.55 m within 0.6 of the foot's radius, up to 2.3 m. */
export const FLAME = [0.55, 2.3];

/** The engine in the lagoon off the tail's end, awash: its back 1.4 m over the water. */
const ENGINE = (() => {
  const [x, z, r, l] = ENGINES[1];
  return note(mine, 'engine', box(x - r, -5, z - l / 2, x + r, 1.4, z + l / 2, METAL, ORANGE));
})();
/**
 * Skin afloat between the shallows and that engine: the first runs aground where the water is knee
 * deep. A third lies aground under the tear in the tail's flank, 2.05 m under its lower deck: the
 * hands reach the deck from it and the hanging body clears it.
 */
const FLOATS = [
  note(mine, 'float', box(16, -1.6, 141, 22, 0.35, 144, METAL)),
  note(mine, 'float', box(10, -0.2, 138, 13, 0.5, 141, METAL)),
  note(mine, 'float', box(23, -1.6, 132.6, 26, 0.2, 135, METAL)),
];

/** The camp: the flag's step before the hearth, a tarpaulin over the camp's racks. */
const [HX, HZ] = HEARTH;
const DAIS = note(
  mine,
  'dais',
  // A hatch cover lying on the sand: a raised step read as a floor floating over it (the user, 2026-11-25).
  box(HX - 2, CAMP - 0.5, HZ - 10, HX + 2, CAMP + 0.05, HZ - 6, PAINT, RED),
);
/**
 * What the survivors keep round their hearth, on the camp's level sand (FLATS), drawn only and
 * walked through: no brush, so nothing new stands in the way (the user, 2026-11-27). Each box is
 * where its piece is drawn, its long side along the piece: the hearth's ring of stones, the logs
 * sat on round it, a pile of firewood, woven mats, and a rack of fish drying beside the flag. Its flames burn nobody: they are drawn only (client hulk/camp.ts, Decor.blazes).
 */
/** The kinds drawn only: no brush under them. */
export const PROPS = ['hearth', 'log', 'wood', 'mat', 'drying'];
const prop = (kind: string, x0: number, z0: number, x1: number, z1: number, h: number) =>
  mine.push({ kind, min: [HX + x0, CAMP, HZ + z0], max: [HX + x1, CAMP + h, HZ + z1] });
prop('hearth', -0.9, -0.9, 0.9, 0.9, 0.6);
// Off any line: each log, mat and the rack is turned askew as it is drawn too.
prop('log', -2.8, -1.2, -2.4, 0.6, 0.42);
prop('log', 2, -0.5, 2.4, 1.3, 0.42);
prop('log', -1.6, 2, 0.6, 2.4, 0.42);
prop('wood', 2.7, 2.2, 3.9, 3.2, 0.5);
prop('mat', -5.6, 2.3, -3.4, 5.1, 0.03);
prop('mat', 3.3, 3.5, 5.2, 6.1, 0.03);
prop('mat', -1.1, 3.5, 1, 5.4, 0.03);
prop('drying', -7.6, -4.7, -4.4, -3.9, 1.9);
/**
 * A crate on the sand with a pack on it: its top 0.1 m over the highest sand under it, so a player
 * runs over it without a jump from its low side too (under STEP_H; the user, 2026-11-27).
 */
const crate = (x: number, z: number) => lay('crate', x - 1.5, z - 1.5, x + 1.5, z + 1.5, 0.1, WOOD);
/** A metal plate on the sand with a pack on it, as low as a crate for the same reason. */
const plate = (x0: number, z0: number, x1: number, z1: number) =>
  lay('panel', x0, z0, x1, z1, 0.1, METAL);
/** The top of the camps' tarpaulins: their hems hang from it (client paint.ts TARP_GLSL). */
export const AWNING = CAMP + 3.75;
/** A tarpaulin on four poles 3.6 m high (the user, 2026-11-26: taller), wider than deep: no pole on a diagonal of the crate under it, where it would hide the rack from a spawn. */
const shelter = (x: number, z: number): Brush[] =>
  [
    box(x - 2.6, AWNING - 0.15, z - 2.1, x + 2.6, AWNING, z + 2.1, PAINT, RED),
    ...[-1, 1].flatMap(a =>
      [-1, 1].map(b =>
        box(
          x + 2.5 * a - 0.1,
          CAMP - 0.5,
          z + 2 * b - 0.1,
          x + 2.5 * a + 0.1,
          CAMP + 3.6,
          z + 2 * b + 0.1,
          STEEL,
        ),
      ),
    ),
  ].map(b => note(mine, 'shelter', b));
/**
 * A rack standing on the sand as it is walked there: no crate under it, which a player running at
 * the rack had to jump onto (the user, 2026-11-27).
 */
const sand = (x: number, z: number): Vec3 => [x, walked(x, z), z];
// The rail rack 5 m up the strand from where its crate stood at (33, 153): the bare sand there is
// within 0.3 m of the water.
const [GUNS, BLADES] = [sand(49, 221), sand(71, 221)];
const [RIFLES, RAILS] = [sand(84, 185), sand(38, 156)];

/** The debris between the camp and the wing, a line to run: a panel, a container, the landing gear, a second container, the wing. */
// The panel and the first container are lower than they were on the camp's level sand: the dunes
// stand higher here, and the jumps keep their steps.
const PANEL = lay('panel', 67, 184.5, 70.5, 188, 0.65, METAL);
const CONTAINER = lay('container', 68.5, 176, 71.1, 182, 1.875, METAL, ORANGE);
const GEAR = lay('gear', 68.6, 170.6, 71, 173, 2.9, STEEL, YELLOW);
/** A second container, between the landing gear and the wing's second break. */
const LAST = lay('container', 64, 164.5, 67.5, 168, 2.6, METAL, ORANGE);
const BOGIE = lay('gear', 67.6, 169.6, 72, 170.6, 1.2, STEEL);

/** What else lies about red's half, most with a pack on it. */
const SCRAP = {
  camp: [crate(76, 213), crate(40, 217)],
  west: [
    // On the open strand between the camp and the field of debris.
    plate(44.5, 191.5, 47.5, 194.5),
    lay('container', 33, 173.7, 39, 176.3, 2.2, METAL, ORANGE),
    plate(41, 163.5, 44, 166.5),
    // In the shallows: as high as it was, its top over the water.
    lay('panel', 25.5, 159.5, 28.5, 162.5, 0.5, METAL),
    plate(50.5, 139.5, 53.5, 142.5),
    // Against the flank under the tear of the lower deck: the way up to it.
    lay('container', 49.5, 132.4, 52.5, 135, 2.6, METAL, ORANGE),
  ],
  east: [
    plate(58.5, 140.5, 61.5, 143.5),
    crate(80, 171),
    crate(85.5, 165),
    crate(84, 153),
    plate(84.5, 141.5, 87.5, 144.5),
  ],
  // Skin standing in the sand: cover on the open strand, nothing to stand on.
  cover: [
    lay('panel', 78, 156.6, 83, 157, 2.6, METAL),
    lay('panel', 30, 166.6, 35, 167, 2.2, METAL),
    lay('container', 76, 190, 82, 192.6, 2.6, METAL, ORANGE),
  ],
};

/**
 * The boxes a headland rock collides with, inside what blockOf() draws: layers `tall` high, each cut
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
  const { reach } = blockOf(s, R, H);
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
  // Finer across a boulder that stands out on the sand, which is walked round; coarser in the
  // headland's mass, whose great rocks are only met at their feet.
  const [wide, tall] = [R < 5 ? 1 : R < 8 ? 2 : 3, H < 5 ? 1 : H < 12 ? 2 : 3];
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
  parts: massed(x, z, R, H, s, ZED - EDGE.cape),
}));

const half: Brush[] = [
  ...wing(),
  ...FALLEN,
  ENGINE,
  ...FLOATS,
  DAIS,
  ...shelter(49, 221),
  ...shelter(71, 221),
  PANEL,
  CONTAINER,
  GEAR,
  BOGIE,
  LAST,
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
 * (x0, x1, the axis' height), every piece of the wreck and of the camps by kind (skin, deck,
 * fairing, wingpiece, rail, fallen, heap, frame, raft, engine, float, dais, crate, shelter,
 * panel, container, gear; the hearth, log, wood, mat and drying drawn only), and the headlands' rocks where they stand.
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

/** Eight, behind the hearth, facing the other camp. */
const SPAWNS: Spawn[] = [46, 54, 62, 70].flatMap((x): Spawn[] => [
  [x, CAMP, 226, 0],
  [x + 4, CAMP, 229, 0],
]);

const team = (red: boolean) => {
  const side = (p: Vec3) => (red ? p : flipPoint(p));
  return {
    base: side(on(DAIS)),
    spawns: red ? SPAWNS : SPAWNS.map(([x, y, z]): Spawn => [x, y, ZED - z, Math.PI]),
    rack: side(GUNS),
    blade: side(BLADES),
    rifle: side(RIFLES),
    rail: side(RAILS),
  };
};
/** Where red's buggy is parked, x and z: by the camp's east crate, inside the level sand (FLATS). */
const BUGGY = [79, 222];
/** In the gallery, inside red's tear. */
const GALLERY: Vec3 = [70.5, HULL.axis[1] + DECKS[1], MID + 3];

/**
 * The tints of the wreck's cabin on its textures (the user, 2026-11-27: textured props): the
 * economy seats' navy cloth, business's brown leather, the carpet, and the suitcases' red, green
 * and tan. A texture's light then sets how dark.
 */
export const CABIN = {
  navy: [0.09, 0.12, 0.25],
  leather: [0.26, 0.21, 0.18],
  carpet: [0.2, 0.22, 0.33],
  red: [0.4, 0.07, 0.06],
  green: [0.08, 0.2, 0.1],
  tan: [0.45, 0.31, 0.16],
} satisfies Record<string, Vec3>;

export const BEACH: WorldDef = {
  // Highline's runners (docs/BEACH.md): armour in the team's colour, no helmet.
  armor: true,
  name: 'Landfall',
  tag: 'Beach · wreck',
  lore: 'A ship came down across a Caribbean beach, its tail in the lagoon and its nose in the trees. The survivors camp at either end of the sand and fight over the wreck between them.',
  brushes: [...half, ...half.map(flip), ...centre],
  tints: Object.values(CABIN),
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
  // Cells: the camp, the second container, the second float, the trees, the gallery; one in the hold between the doors.
  cells: both(
    [on(SCRAP.camp[1]), on(LAST), on(FLOATS[1]), on(SCRAP.east[2]), GALLERY],
    [59, HOLD.floor, MID],
  ),
  // Armour: on the engine in the lagoon, and on the hull's back over the wings.
  vests: both([on(ENGINE)], [63, BACK[1], MID]),
  // A buggy a camp (the user, 2026-11-27), at the east edge of its level sand clear of the crates,
  // its nose toward the other camp: red's, then blue's. The rover's chassis (rover.ts).
  rovers: [
    [BUGGY[0], CAMP, BUGGY[1], 0],
    [BUGGY[0], CAMP, ZED - BUGGY[1], Math.PI],
  ],
  floor: DEPTH,
  water: FRAME.water,
  fires: FIRES.map(([x, y, z, , r]): [number, number, number, number, number] => [
    x,
    y,
    z,
    0.6 * r + FLAME[0],
    FLAME[1],
  ]),
  // The sand and the bed, out to an ellipse round the beach that nobody reaches: the walls and
  // the depth close it first. No hole: every brush stands on the ground.
  relief: { hole: [0, 0, 0, 0], bound: [56, MID, 100, 185], cell: CELL, origin: [0, NODE], at },
  // High over the sea, warm; a blue sky paling to the horizon and a light haze.
  sun: { dir: [-0.47, 0.83, 0.3], color: [3.2, 3, 2.6] },
  sky: [
    [0.1, 0.32, 0.75],
    [0.55, 0.75, 0.9],
  ],
  fog: [0.6, 0.78, 0.9, 0.0012],
  scenery: 'beach',
};
