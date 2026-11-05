// Test helper: a yard to try each move on, with a ledge, a wall or a low slot where it needs one.
import { EAST, NORTH, SOUTH, Sim, WEST } from './pilot';
import { RUN_SPEED } from '../src/shared/constants';
import { MODE, TEX } from '../src/shared/types';
import { build } from '../src/shared/world';
import type { Brush, World } from '../src/shared/world';

type Vec3 = [number, number, number];
const box = (min: Vec3, max: Vec3): Brush => ({ min, max, top: TEX.TILE, side: TEX.BRICK });
const world = (brushes: Brush[], floor = -50): World =>
  build({
    brushes,
    spawns: [[0, 0, 0, 0]],
    floor,
    sun: { dir: [0, 1, 0], color: [1, 1, 1] },
    sky: [
      [0, 0, 1],
      [1, 1, 1],
    ],
  });

/**
 * A test yard: a ground at y = 0 (x -300 to 300, z -100 to 100) and, each on its own stretch,
 * what a move needs.
 */
export const yard = world([
  box([-300, -5, -100], [300, 0, 100]),
  // Ledges, 4 x 4 m, facing west: tops 2.0 and 2.4 (in reach), 4 (out of reach).
  box([10, -5, -2], [14, 2, 2]),
  box([20, -5, -2], [24, 2.4, 2]),
  box([30, -5, -2], [34, 4, 2]),
  // A ledge top that is blocked: 1 m clear above it, under a slab (a head needs 1.8).
  box([40, -5, -2], [44, 2, 2]),
  box([39, 3, -3], [45, 3.4, 3]),
  // A ledge with a lintel across the way up and a roof beyond: for the vault.
  box([50, -5, -2], [54, 2, 2]),
  // A long wall (x 100 to 101, z -60 to 60, 6 m high), and a short one (z -2 to 2).
  box([100, -5, -60], [101, 6, 60]),
  box([120, -5, -2], [121, 6, 2]),
  // A low slot, 1.2 m clear and 4 m deep (z 0 to 4), and a high one, 2 m clear.
  box([68, 1.2, 0], [78, 3, 4]),
  box([88, 2, 0], [98, 4, 4]),
  // A roof 5 m up to walk off, and the pillar of a ledge to fall by.
  box([150, -5, -5], [160, 5, 5]),
]);
export const KILL = world([box([150, -5, -5], [160, 5, 5])], -30);

/** A sim of the yard with the player standing at (x, z), on the ground (or y). */
export const at = (x: number, z: number, yaw = NORTH, y = 0, w: World = yard): Sim =>
  new Sim(Sim.at(w).p, w).put(x, y, z, yaw);

/** A sim falling from y, the extra jump and the dash still there, no coyote window open. */
export const falling = (y: number, x = 0, z = 0, yaw = NORTH, w: World = yard): Sim => {
  const s = at(x, z, yaw, y, w);
  Object.assign(s.p, { mode: MODE.AIR, ground: false, coyote: 0 });
  return s;
};

/** A sim running at `speed` along its facing, already, as after a stretch of it. */
export const running = (
  x: number,
  z: number,
  yaw: number,
  speed = RUN_SPEED,
  w: World = yard,
): Sim => {
  const s = at(x, z, yaw, 0, w);
  const [fx, fz] = [-Math.sin(yaw), -Math.cos(yaw)];
  Object.assign(s.p, { vx: Math.fround(fx * speed), vz: Math.fround(fz * speed) });
  return s;
};

export { EAST, NORTH, SOUTH, WEST };
