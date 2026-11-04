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
