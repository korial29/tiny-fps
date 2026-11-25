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
      [57.5, 60.5, -5, -2.05],
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
 * still attached; the breaks are 3.6 m wide. `rails`: the x of the two beams that run through the
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
    [0, 14, 0, 8.5, 6.4, 0],
    [16, 30, 2, 6.8, 3.6, 0.17],
    [32, 47.5, 4, 3.3, 1.6, -0.2],
  ],
  rails: [53.5, 58],
};

/**
 * Red's engines, torn off: the middle of each (x, z), its radius and length. The first lies on the
 * sand beside the wreck near the waterline, askew (z by x along it), burning: nobody walks through
 * it. The second lies along z in the lagoon off the tail's end, awash, stood on.
 */
export const ENGINES = [
  [38.5, 125.3, 2.7, 19, 0.78],
  [4.5, 112, 2.5, 9],
];

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
 * hold's door through the bank, the sand under the tip of the wing, the camp. Level for 6 m round each, so that
 * the lattice's triangles are, and back to the sand 6 m further; none within 12 m of the next.
 */
export const FLATS = [
  [57, 107, 61, 113, HOLD.floor - 0.25],
  [56, 146, 66, 150, 1.3],
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
  ...hull(),
  ...GAPS.map(g => note(line, 'heap', g.heap)),
  ...FRAMES.map(b => note(line, 'frame', b)),
  note(line, 'raft', RAFT),
  // Behind the first palms, from one headland to the other and through the nose.
  ghost(box(EDGE.east, -10, 0, EDGE.east + 2, 40, ZED, STONE)),
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
 * outline there and as thin as the wing (thick()); solid to the sand where a runner would not fit under it. Then the two rails
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
        const low = y - thick(v);
        const [hi, lo] = under(xa, za, xb, zb);
        return note(
          mine,
          'wingpiece',
          box(xa, low - hi < 2.2 ? lo - 0.5 : low, za, xb, y, zb, METAL),
        );
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
  note(mine, 'float', box(16, -1.6, 116, 22, 0.35, 119, METAL)),
  note(mine, 'float', box(10, -0.2, 113, 13, 0.5, 116, METAL)),
  note(mine, 'float', box(23, -1.6, 107.6, 26, 0.2, 110, METAL)),
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

/** The debris between the camp and the wing, a line to run: a panel, a container, the landing gear, a second container, the wing. */
const PANEL = lay('panel', 67, 159.5, 70.5, 163, 0.9, METAL);
const CONTAINER = lay('container', 68.5, 151, 71.1, 157, 2, METAL, ORANGE);
const GEAR = lay('gear', 68.6, 145.6, 71, 148, 2.9, STEEL, YELLOW);
/** A second container, between the landing gear and the wing's second break. */
const LAST = lay('container', 64, 139.5, 67.5, 143, 2.6, METAL, ORANGE);
const BOGIE = lay('gear', 67.6, 144.6, 72, 145.6, 1.2, STEEL);

/** What else lies about red's half, most with a pack on it. */
const SCRAP = {
  camp: [crate(76, 168), crate(40, 172)],
  west: [
    lay('panel', 44.5, 156.5, 47.5, 159.5, 0.5, METAL),
    lay('container', 33, 148.7, 39, 151.3, 2.2, METAL, ORANGE),
    lay('panel', 41, 138.5, 44, 141.5, 0.4, METAL),
    lay('panel', 25.5, 134.5, 28.5, 137.5, 0.5, METAL),
    lay('panel', 50.5, 114.5, 53.5, 117.5, 0.4, METAL),
    // Against the flank under the tear of the lower deck: the way up to it.
    lay('container', 49.5, 107.4, 52.5, 110, 2.6, METAL, ORANGE),
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
  ...FALLEN,
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
 * fairing, wingpiece, rail, fallen, heap, frame, raft, engine, float, pod, dais, crate, shelter,
 * panel, container, gear), and the headlands' rocks where they stand.
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
/** In the gallery, inside red's tear. */
const GALLERY: Vec3 = [70.5, HULL.axis[1] + DECKS[1], MID + 3];

export const BEACH: WorldDef = {
  // Highline's runners (docs/BEACH.md): armour in the team's colour, no helmet.
  armor: true,
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
  // Cells: the camp, the second container, the second float, the trees, the gallery; one in the hold between the doors.
  cells: both(
    [on(SCRAP.camp[1]), on(LAST), on(FLOATS[1]), on(SCRAP.east[2]), GALLERY],
    [59, HOLD.floor, MID],
  ),
  // Armour: on the engine in the lagoon, and on the hull's back over the wings.
  vests: both([on(ENGINE)], [63, BACK[1], MID]),
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
