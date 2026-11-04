// The campaign: the levels played in order, then again in hard mode. Data only.
import { ITEM, MONSTER } from './types';
import type { MapDef } from './types';

/**
 * A room is a rectangle: x0, z0, x1, z1, floor, ceiling, textures, light, key. Textures are three
 * TEX digits (floor, walls, ceiling: 0 brick, 1 tile, 2 lava, 3 stone), default "103". A room with
 * a key is a gate. Rooms that touch are joined where they share a stretch of edge, so a door is a
 * small room between two others (or an offset overlap): build() splits the edges at every corner.
 */
type Room = [number, number, number, number, number, number, string?, number?, number?];
type Pt = [number, number];

/** n slices of a box along x (0) or z (1), the first at floor f and each one rising by up. */
const stairs = (
  axis: 0 | 1,
  [x0, z0, x1, z1]: [number, number, number, number],
  f: number,
  up: number,
  n: number,
  ceil: number,
  tex?: string,
  light?: number,
): Room[] =>
  Array.from({ length: n }, (_, i): Room => {
    // The same expression for a cut seen from both slices, so their corners match exactly.
    const [lo, hi] = axis ? [z0, z1] : [x0, x1];
    const [a, b, h] = [
      lo + (i * (hi - lo)) / n,
      lo + ((i + 1) * (hi - lo)) / n,
      +(f + i * up).toFixed(1),
    ];
    return axis ? [x0, a, x1, b, h, ceil, tex, light] : [a, z0, b, z1, h, ceil, tex, light];
  });

const [H, R] = [ITEM.HEALTH, ITEM.KEY_RED];
const QUARTER = Math.PI / 4;

/**
 * One level from its rooms (the first is the start and the exit), the spawn grid (x, z of its
 * corner, facing), walkers and flyers (x, z, facing in eighth turns: 0 north, 2 west, 4 south, 6
 * east), items (x, z, kind) and the goal.
 */
const level = (
  rooms: Room[],
  [sx, sz, sd]: [number, number, number],
  walkers: [number, number, number][],
  flyers: [number, number, number][],
  items: [number, number, number][],
  goal: Pt,
): MapDef => {
  const boxes = rooms.map(([x0, z0, x1, z1]): Pt[] => [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ]);
  const corners = [...new Map(boxes.flat().map(p => [`${p}`, p])).values()];
  return {
    sectors: rooms.map(([, , , , floor, ceil, t = '103', light], s) => ({
      // Each edge gets the corners of other rooms that lie on it, nearest first.
      pts: boxes[s].flatMap((a, i, p): Pt[] => {
        const b = p[(i + 1) % 4];
        const along = (c: Pt) => (c[0] - a[0]) * (b[0] - a[0]) + (c[1] - a[1]) * (b[1] - a[1]);
        return [
          a,
          ...corners
            .filter(
              c =>
                (b[0] - a[0]) * (c[1] - a[1]) === (b[1] - a[1]) * (c[0] - a[0]) &&
                along(c) > 0 &&
                along(c) < (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2,
            )
            .sort((c, d) => along(c) - along(d)),
        ];
      }),
      floor,
      ceil,
      ft: +t[0],
      wt: +t[1],
      ct: +t[2],
      light,
    })),
    spawns: Array.from({ length: 16 }, (_, i): [number, number, number] => [
      sx + (i % 4) * 2,
      sz + (i >> 2) * 2,
      sd * QUARTER,
    ]),
    monsters: [
      ...walkers.map(([x, z, d]): [number, number, number, number] => [
        x,
        z,
        d * QUARTER,
        MONSTER.WALKER,
      ]),
      ...flyers.map(([x, z, d]): [number, number, number, number] => [
        x,
        z,
        d * QUARTER,
        MONSTER.FLYER,
      ]),
    ],
    items,
    gates: rooms.flatMap(([, , , , , , , , key], sector) => (key ? [{ sector, key }] : [])),
    goal,
    exit: 0,
  };
};

export const LEVELS: MapDef[] = [
  // 1: warm-up. Start room, a corridor, a hall, stairs up to a platform, a stair corridor down to the goal room.
  level(
    [
      [0, 0, 10, 10, 0, 4, '103'],
      [10, 4, 22, 6, 0, 2.8, '333', 0.6],
      [22, 0, 38, 14, 0, 6, '303'],
      ...stairs(0, [38, 4, 42, 10], 0.4, 0.4, 4, 6, '333'),
      [42, 2, 52, 12, 2, 6, '103', 0.9],
      ...stairs(1, [46, 12, 48, 22], 1.6, -0.4, 4, 4.8, '000', 0.7),
      [38, 22, 56, 36, 0, 6, '113'],
    ],
    [2, 2, 6],
    [
      [28, 4, 3],
      [34, 10, 4],
      [48, 6, 4],
      [44, 30, 0],
    ],
    [
      [30, 8, 0],
      [52, 28, 2],
    ],
    [
      [26, 12, H],
      [50, 10, H],
      [40, 34, H],
    ],
    [54, 34],
  ),
  // 2: foundry. A hall around a lava pit, a balcony above it with the red key, a red gate to the vault.
  level(
    [
      [0, 14, 10, 26, 0, 4, '103'],
      [10, 22, 20, 24, 0, 2.8, '333', 0.6],
      [24, 8, 28, 16, 0, 9, '303'],
      [20, 16, 28, 30, 0, 9, '303'],
      ...stairs(1, [20, 8, 24, 16], 2, -0.4, 5, 9, '333'),
      [28, 8, 42, 18, -1.6, 9, '203', 0.9],
      ...stairs(1, [28, 18, 42, 21], -1.2, 0.4, 3, 9, '333'),
      [28, 21, 50, 30, 0, 9, '303'],
      [42, 8, 50, 21, 0, 9, '303'],
      [20, 0, 50, 8, 2.4, 9, '103', 0.8],
      [50, 14, 51, 17, 0, 3.5, '000', 1, R],
      [51, 8, 59, 26, 0, 7, '113', 0.6],
      [59, 8, 67, 26, 0.4, 7, '013', 0.8],
      [57, 26, 59, 36, 0, 4.8, '000', 0.7],
      [50, 36, 68, 50, 0, 7, '013'],
    ],
    [2, 16, 6],
    [
      [46, 14, 2],
      [36, 26, 0],
      [38, 4, 2],
      [56, 12, 4],
      [62, 20, 2],
      [60, 44, 0],
    ],
    [
      [35, 13, 0],
      [60, 14, 4],
      [58, 42, 6],
    ],
    [
      [24, 26, H],
      [24, 4, H],
      [64, 10, H],
      [52, 46, H],
      [46, 4, R],
    ],
    [66, 48],
  ),
];
