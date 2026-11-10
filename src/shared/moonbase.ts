// The base of the moon level (docs/MOON.md): red's dome with the hall in it, the modules, the tubes
// and the stairs up to the tube tops, as data and brushes. moon.ts puts them in red's half and flips
// them for blue: it imports this file, never the other way. Compact on purpose: the local bundle
// carries it.
import { TEX } from './types';
import type { Brush } from './world';

export type Vec3 = [number, number, number];

const { CONCRETE, METAL, STEEL, PAINT } = TEX;

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
/** Height bands of the ghost collision of the dome: the first is its wall, up past a double jump from a module top; the others its roof. */
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
const [[A0, B0], [A1, B1]] = around(R + 0.2);

/** How thick the walls of the modules and the tubes are. */
export const WALL = 0.4;
/**
 * Headroom of a tube and of a doorway. A tube wall this high gets no red from vision.ts (over a
 * grab of 2.45 m, under a wall to run on of 2.5 m) and its top is a metre under the tube's (the
 * rail cell up there, test/pickups.ts).
 */
export const HEAD = 2.48;
/**
 * How high a module is inside, under a roof slab a metre thick: the wall over a tube's roof then
 * ends half a metre above it, no ledge for vision.ts to band.
 */
export const ROOM = 4;
const [T, H] = [WALL, HEAD];

/** Red's dome (its centre: x, z), modules and tubes (each from its module to where they meet at the dome's wall, the second across the end of the first): what the scenery draws on. */
export const DOME = [80, 236];
export const MODULES = [bx(111, 0, 222, 125, 5, 230), bx(96, 0, 196, 110, 5, 204)];
export const TUBES = [bx(102, 0, 223.2, 111, 3.5, 227.2), bx(98, 0, 204, 102, 3.5, 227.2)];
const [[TX0, , TZ0], [TX1, TY, TZ1], [UX0, , UZ0], [UX1]] = TUBES.flatMap(t => [t.min, t.max]);

/**
 * The hall in the dome: the boxes of these half sides (x, z) and the same turned a quarter, about
 * the dome's centre. It fits under the first band of the roof, its walls stand inside the drawn
 * shell up to 8 m and the eyes stay inside it at the top of a double jump from the mezzanine.
 */
export const HALL = [
  [19.8, 6.7],
  [16, 13.5],
];
const [[C0, D0], [C1, D1]] = HALL;
/** The mouths in the hall's wall (x and z of the middle from the centre, half width, height, depth): the door toward the flag, the tubes. */
export const MOUTHS = [
  [0, -C0, 2, 3, 2.8],
  [C1, -10.8, 2, 3.5, 2],
];

/** The rectangles (x0, z0, x1, z1), their mirrors and their quarter turns about the centre, each once. */
const turns = (l: number[][]) => [
  ...new Map(
    l
      .flatMap(([x0, z0, x1, z1]) =>
        [1, -1].flatMap(i =>
          [1, -1].flatMap(j =>
            [
              [x0, x1, z0, z1],
              [z0, z1, x0, x1],
            ].map(([a, b, c, d]) => [
              Math.min(i * a, i * b),
              Math.min(j * c, j * d),
              Math.max(i * a, i * b),
              Math.max(j * c, j * d),
            ]),
          ),
        ),
      )
      .map((p): [string, number[]] => [`${p}`, p]),
  ).values(),
];

/** A ghost box about the dome's centre, (x0, z0, x1, z1) from y0 to y1. */
const ghost = (
  [x0, z0, x1, z1]: number[],
  y0: number,
  y1: number,
  top: number = CONCRETE,
  side = top,
): Brush => ({
  ...box(DOME[0] + x0, y0, DOME[1] + z0, DOME[0] + x1, y1, DOME[1] + z1, top, side),
  ghost: true,
});

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

/**
 * What stands in the hall, about the dome's centre: ghosts, since client/moonbase.ts draws them
 * with the hall (the sun's shadow map is 64 m wide, a brush across the hall would be drawn sunlit).
 * The mezzanine 3.5 m up along the walls (not over the door), the stairs up to it facing the door,
 * a console and two parapets on it, three crates on the floor.
 */
export const FIT: Brush[] = [
  ...turns([
    [12, -D1, C1, D1],
    [C1, -D0, C0, D0],
  ])
    .filter(p => p[1] > -C0)
    .map(p => ghost(p, 3.1, 3.5, METAL, STEEL)),
  ...stairs(2, DOME[1] + 5.6, DOME[1] + 12, DOME[0] - 1.5, DOME[0] + 1.5, 0, 3.5).map(b => ({
    ...b,
    ghost: true,
  })),
  ghost([-3, 19, 3, C0], 3.5, 4.6, STEEL, METAL),
  ghost([-9, 12, -2.5, 12.5], 3.5, 4.6, STEEL, PAINT),
  ghost([2.5, 12, 9, 12.5], 3.5, 4.6, STEEL, PAINT),
  ghost([-6, -8, -4, -6], 0, 1.4, STEEL),
  ghost([4, -8, 6, -6], 0, 1.4, STEEL),
  ghost([5.5, 1.5, 8, 4], 0, 2.4, STEEL),
];

/**
 * A wall along the axis k from a to b, between p and q across, up to y: a doorway H high in each
 * gap (from, to). A gap of no width only cuts the wall in two: vision.ts stripes a wall of 8 m.
 */
const wall = (
  k: 0 | 2,
  a: number,
  b: number,
  p: number,
  q: number,
  y: number,
  gaps: number[][] = [],
): Brush[] => {
  const piece = (s: number, t: number, y0: number) =>
    k ? box(p, y0, s, q, y, t, CONCRETE) : box(s, y0, p, t, y, q, CONCRETE);
  return [...gaps, [b, b]].flatMap(([s, t], i, l) => [
    piece(i ? l[i - 1][1] : a, s, 0),
    ...(t > s ? [piece(s, t, H)] : []),
  ]);
};

/** A module: a roof slab on four walls, with the gaps of the walls at its low z, high z, low x and high x. */
const room = (
  { min: [x0, , z0], max: [x1, y, z1] }: Bx,
  gaps: number[][][],
  crate: Brush,
): Brush[] => [
  box(x0, ROOM, z0, x1, y, z1, METAL, CONCRETE),
  ...wall(0, x0, x1, z0, z0 + T, ROOM, gaps[0]),
  ...wall(0, x0, x1, z1 - T, z1, ROOM, gaps[1]),
  ...wall(2, z0 + T, z1 - T, x0, x0 + T, ROOM, gaps[2]),
  ...wall(2, z0 + T, z1 - T, x1 - T, x1, ROOM),
  crate,
];
const ORANGE: Vec3 = [1, 0.42, 0.08];

/** Red's half of the base. */
export const BASE: Brush[] = [
  // The dome's roof, drawn round and not to be stood on: ghost bands, each a union of four stepped boxes.
  ...BANDS.slice(2).flatMap((y1, i) =>
    around(shell(BANDS[i + 1]) + 0.2).map(([a, b]) => ghost([-a, -b, a, b], BANDS[i + 1], y1)),
  ),
  // Its wall, between the stepped boxes that cover the drawn drum and the hall: open at the two mouths.
  ...turns([
    [C0, -B0, A0, B0],
    [C1, D0, A1, B1],
    [D1, D1, C1, C1],
  ]).map(p =>
    ghost(
      p,
      // The piece a mouth is in starts over it.
      MOUTHS.find(([x, z]) => p[0] <= x && x <= p[2] && p[1] <= z && z <= p[3])?.[3] ?? 0,
      BANDS[1],
    ),
  ),
  // Beside the door, and beside the tubes where they come through.
  ...[
    [-B0, -A0, -MOUTHS[0][2], -C0],
    [MOUTHS[0][2], -A0, B0, -C0],
    [C1, TZ1 - DOME[1], A1, -D0],
    [C1, -B1, UX0 - DOME[0], TZ0 - DOME[1]],
  ].map(p => ghost(p, 0, BANDS[1])),
  ...FIT,
  // Two modules: an airlock to the outside in a long wall, a door to the tube, a crate.
  ...room(
    MODULES[0],
    [[[118, 118]], [[116.8, 119.2]], [[TZ0 + T, TZ1 - T]]],
    box(121.5, 0, 223.5, 123.5, 1.2, 225.5, PAINT, PAINT, ORANGE),
  ),
  ...room(
    MODULES[1],
    [
      [[101.8, 104.2]],
      [
        [UX0 + T, UX1 - T],
        [105.8, 105.8],
      ],
    ],
    box(106, 0, 200.6, 108, 1.2, 202.6, PAINT, PAINT, ORANGE),
  ),
  // The tubes to the dome: a roof to walk on 3.5 m up over two walls, the second roof across the end of the first.
  box(TX0, H, TZ0, TX1, TY, TZ1, STEEL, METAL),
  box(UX0, H, UZ0, UX1, TY, TZ1, STEEL, METAL),
  box(UX0, 0, TZ1 - T, TX1, H, TZ1, METAL),
  box(UX1 - T, 0, TZ0, TX1, H, TZ0 + T, METAL),
  box(UX0, 0, UZ0, UX0 + T, H, TZ0, METAL),
  box(UX1 - T, 0, UZ0, UX1, H, TZ0, METAL),
  // The stairs up to the tube tops.
  ...stairs(2, 214, TZ0, 105, 109, 0, 3.5),
  ...stairs(0, 108, UX1, 206, 210, 0, 3.5),
];
