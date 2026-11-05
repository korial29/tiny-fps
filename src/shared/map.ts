import { TEX } from './types';
import type { MapDef, Sector } from './types';

const sector = (
  pts: [number, number][],
  floor: number,
  ceil: number,
  ft: number,
  light?: number,
): Sector => ({ pts, floor, ceil, ft, wt: TEX.BRICK, ct: TEX.STONE, light });

/**
 * The first sector map, a test bed for heights: a start room, a low corridor, a tall hall around a
 * lava pit, stairs up to a balcony. Each spot is reachable on foot; the pit is a 1 m drop.
 */
export const HALL: MapDef = {
  sectors: [
    // 0: start room
    sector(
      [
        [0, 0],
        [16, 0],
        [16, 6],
        [16, 10],
        [16, 16],
        [0, 16],
      ],
      1,
      5,
      TEX.TILE,
    ),
    // 1: corridor, low ceiling
    sector(
      [
        [16, 6],
        [20, 6],
        [20, 10],
        [16, 10],
      ],
      1,
      3.5,
      TEX.TILE,
      0.6,
    ),
    // 2-5: hall around the pit (north, west, east, south)
    sector(
      [
        [20, 0],
        [36, 0],
        [36, 6],
        [30, 6],
        [26, 6],
        [20, 6],
      ],
      1,
      7,
      TEX.TILE,
    ),
    sector(
      [
        [20, 6],
        [26, 6],
        [26, 10],
        [20, 10],
      ],
      1,
      7,
      TEX.TILE,
    ),
    sector(
      [
        [30, 6],
        [36, 6],
        [36, 10],
        [30, 10],
      ],
      1,
      7,
      TEX.TILE,
    ),
    sector(
      [
        [20, 10],
        [26, 10],
        [30, 10],
        [36, 10],
        [36, 16],
        [32, 16],
        [28, 16],
        [20, 16],
      ],
      1,
      7,
      TEX.TILE,
    ),
    // 6: lava pit
    sector(
      [
        [26, 6],
        [30, 6],
        [30, 10],
        [26, 10],
      ],
      0,
      7,
      TEX.LAVA,
    ),
    // 7-9: stairs, 0.4 m steps
    sector(
      [
        [28, 16],
        [32, 16],
        [32, 17],
        [28, 17],
      ],
      1.4,
      7,
      TEX.STONE,
    ),
    sector(
      [
        [28, 17],
        [32, 17],
        [32, 18],
        [28, 18],
      ],
      1.8,
      7,
      TEX.STONE,
    ),
    sector(
      [
        [28, 18],
        [32, 18],
        [32, 19],
        [28, 19],
      ],
      2.2,
      7,
      TEX.STONE,
    ),
    // 10: balcony
    sector(
      [
        [24, 19],
        [28, 19],
        [32, 19],
        [36, 19],
        [36, 26],
        [24, 26],
      ],
      2.6,
      7,
      TEX.TILE,
      0.8,
    ),
  ],
  spawns: [
    [4, 4, Math.PI * 1.5],
    [4, 12, Math.PI * 1.5],
    [8, 8, Math.PI * 1.5],
    [12, 4, Math.PI * 1.5],
    [12, 12, Math.PI * 1.5],
    [2, 8, Math.PI * 1.5],
    [8, 2, Math.PI * 1.5],
    [8, 14, Math.PI * 1.5],
  ],
};

/** Grid lines of ROOF, metres: every feature below starts and ends on one, so the cells join exactly. */
const GRID_X = [0, 1.2, 7, 9, 14, 17, 23, 26, 27, 31, 38.8, 40];
const GRID_Z = [0, 1.2, 8, 9, 10, 11, 16, 18, 24, 26, 38.8, 40];
/** A very high ceiling: the sky, until the sector walls go (step 2). */
const SKY = 120;
/** What ROOF is made of, painted in order: x0, z0, x1, z1, floor height, floor texture. */
const PAINT: [number, number, number, number, number, number][] = [
  // The parapet, a 1 m ledge round the edge that a jump reaches, and the deck inside it.
  [0, 0, 40, 40, 1, TEX.STONE],
  [1.2, 1.2, 38.8, 38.8, 0, TEX.TILE],
  // A platform 1.6 m up, with four steps of 0.4 m up to it.
  [14, 1.2, 26, 8, 1.6, TEX.TILE],
  [17, 8, 23, 9, 1.2, TEX.STONE],
  [17, 9, 23, 10, 0.8, TEX.STONE],
  [17, 10, 23, 11, 0.4, TEX.STONE],
  // A crate a jump climbs, and a block it does not.
  [7, 16, 9, 18, 1, TEX.WOOD],
  [27, 24, 31, 26, 2, TEX.METAL],
];

/**
 * The first rooftop, for the capture-the-flag game: a flat 40 x 40 m deck in the open, a 1 m
 * parapet round it, a crate, a block and a platform with steps. Built as a grid of cells, one
 * sector each: neighbours at one height are open to each other, and the edge is solid wall.
 */
export const ROOF: MapDef = {
  name: 'Rooftops',
  // A bright haze: the sky is the clear colour.
  fog: [0.8, 0.88, 1, 0.02],
  sectors: GRID_X.slice(1).flatMap((x1, i) =>
    GRID_Z.slice(1).map((z1, j) => {
      const [x0, z0] = [GRID_X[i], GRID_Z[j]];
      const [cx, cz] = [(x0 + x1) / 2, (z0 + z1) / 2];
      // The last paint over the centre of the cell wins.
      const [, , , , floor, tex] = PAINT.filter(
        ([ax, az, bx, bz]) => ax < cx && cx < bx && az < cz && cz < bz,
      ).at(-1)!;
      return sector(
        [
          [x0, z0],
          [x1, z0],
          [x1, z1],
          [x0, z1],
        ],
        floor,
        SKY,
        tex,
      );
    }),
  ),
  // Along the south edge of the deck, facing the platform (yaw 0 looks toward -z).
  spawns: [
    [6, 34, 0],
    [13, 34, 0],
    [20, 34, 0],
    [27, 34, 0],
    [34, 34, 0],
    [20, 22, 0],
  ],
};
