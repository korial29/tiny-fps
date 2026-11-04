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

const [H, R, B, Y] = [ITEM.HEALTH, ITEM.KEY_RED, ITEM.KEY_BLUE, ITEM.KEY_YELLOW];
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
  // 3: cistern. A tall hall around a lava pool, a crawlway to the red key, a red gate, stairs up to a gallery with the blue key.
  level(
    [
      [0, 20, 10, 32, 0, 4, '103'],
      [10, 26, 20, 28, 0, 2.8, '333', 0.6],
      [20, 14, 56, 26, 0, 11, '133', 0.9],
      [20, 26, 34, 32, 0, 11, '133', 0.9],
      [34, 26, 42, 32, -0.4, 11, '233'],
      [42, 26, 56, 32, 0, 11, '133', 0.9],
      [20, 32, 56, 44, 0, 11, '133', 0.9],
      [36, 44, 38, 54, 0, 1.9, '333', 0.45],
      [30, 54, 46, 68, 0, 5, '000', 0.7],
      [56, 28, 57, 31, 0, 4, '000', 1, R],
      ...stairs(0, [57, 26, 65, 32], 0.4, 0.4, 8, 10, '333', 0.8),
      [65, 22, 81, 36, 3.6, 11, '103'],
      [71, 36, 74, 37, 3.6, 7, '000', 1, B],
      [71, 37, 74, 48, 3.6, 6.4, '333', 0.6],
      [62, 48, 82, 64, 3.6, 10, '213'],
    ],
    [2, 22, 6],
    [
      [30, 18, 4],
      [50, 20, 4],
      [30, 40, 0],
      [50, 40, 0],
      [36, 60, 2],
      [42, 64, 0],
      [76, 28, 2],
      [70, 58, 0],
    ],
    [
      [26, 24, 0],
      [48, 22, 0],
      [36, 40, 2],
      [72, 56, 4],
    ],
    [
      [24, 40, H],
      [52, 42, H],
      [44, 57, H],
      [68, 34, H],
      [64, 62, H],
      [38, 66, R],
      [79, 24, B],
    ],
    [80, 62],
  ),
  // 4: the loop. A hub round a pillar, with a wing for each key; the last gate opens stairs to a balcony over the hub, and the goal lies back near the start.
  level(
    [
      [0, 44, 10, 56, 0, 4, '103'],
      [10, 49, 20, 51, 0, 2.8, '333', 0.6],
      [20, 30, 52, 40, 0, 9, '303'],
      [20, 48, 52, 58, 0, 9, '303', 0.9],
      [20, 40, 32, 48, 0, 9, '303'],
      [40, 40, 52, 48, 0, 9, '303'],
      [20, 22, 49, 30, 3.2, 9, '113', 0.8],
      [34, 58, 36, 66, 0, 2.8, '333', 0.5],
      [26, 66, 46, 84, 0, 5, '000', 0.5],
      [52, 42, 53, 45, 0, 4, '000', 1, R],
      [53, 36, 64, 54, 0, 6, '133', 0.8],
      [64, 36, 70, 54, 0.4, 6, '233', 0.8],
      [60, 35, 63, 36, 0, 4, '000', 1, B],
      [57, 12, 77, 35, 0, 8, '013', 0.9],
      [56, 24, 57, 27, 0, 4, '000', 1, Y],
      ...stairs(0, [49, 22, 56, 30], 2.8, -0.4, 7, 9, '333', 0.8),
      [12, 24, 20, 28, 3.2, 6, '333', 0.6],
      [0, 10, 12, 34, 3.2, 9, '113'],
    ],
    [2, 46, 6],
    [
      [30, 36, 4],
      [44, 36, 2],
      [40, 52, 0],
      [40, 26, 4],
      [30, 74, 6],
      [42, 78, 2],
      [56, 40, 6],
      [64, 50, 2],
      [62, 18, 4],
      [72, 28, 2],
      [6, 22, 0],
    ],
    [
      [28, 48, 0],
      [46, 44, 4],
      [36, 72, 0],
      [60, 45, 6],
      [68, 22, 4],
    ],
    [
      [24, 54, H],
      [24, 26, H],
      [44, 80, H],
      [68, 38, H],
      [74, 14, H],
      [36, 82, R],
      [68, 52, B],
      [74, 32, Y],
    ],
    [6, 13],
  ),
];
