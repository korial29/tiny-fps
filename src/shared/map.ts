import type { Box, MapDef } from './types';

const WALL = 3;
const T = 1;

const box = (
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  y1: number,
  color: string,
  y0 = 0,
): Box => ({ x0, y0, z0, x1, y1, z1, color });

/**
 * The first map: a 40 × 40 m walled yard with a few pillars and a low platform, enough to judge
 * depth, motion and collisions. Walls stand outside the floor, so the playable area is the whole
 * [0, 40] × [0, 40].
 */
export const YARD: MapDef = {
  w: 40,
  d: 40,
  boxes: [
    box(-T, -T, 40 + T, 0, WALL, '#8a8f99'),
    box(-T, 40, 40 + T, 40 + T, WALL, '#8a8f99'),
    box(-T, 0, 0, 40, WALL, '#7d828c'),
    box(40, 0, 40 + T, 40, WALL, '#7d828c'),
    box(10, 10, 12, 12, WALL, '#b5835a'),
    box(28, 10, 30, 12, WALL, '#b5835a'),
    box(10, 28, 12, 30, WALL, '#b5835a'),
    box(28, 28, 30, 30, WALL, '#b5835a'),
    box(17, 17, 23, 23, 0.8, '#6b8f71'),
  ],
  spawns: [
    [5, 5, Math.PI * 1.25],
    [35, 35, Math.PI * 0.25],
    [35, 5, Math.PI * 0.75],
    [5, 35, Math.PI * 1.75],
    [20, 5, Math.PI],
    [20, 35, 0],
    [5, 20, Math.PI * 1.5],
    [35, 20, Math.PI * 0.5],
  ],
};
