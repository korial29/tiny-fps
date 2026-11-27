// Landfall's forest (docs/BEACH.md): the line it starts at round the beach, where the crash burnt
// it, and the shared shapes and colours of its parts.
import { FRAME, HULL, ZED } from '../../shared/beach';
import { TAU } from '../../shared/physics';
import { noise } from '../../shared/relief';
import { STRIDE } from '../mesh';
import type { Vec3 } from '../mesh';

export type Ground = (x: number, z: number) => number;

/**
 * Where the forest that is only drawn begins: a line round the beach on its three dry sides, x =
 * EDGE along the trees and BACK behind each headland's line of rocks, the corners rounded by
 * TURN, from x = WEST on one headland to x = WEST on the other. Nothing of it is solid: the map's
 * ghost wall is expected between the first row of palms and this line.
 */
export const [EDGE, BACK, TURN, WEST] = [FRAME.trees + 5, 70, 14, 80];
/** The line's straight run behind a headland, a corner's arc, and its whole length. */
export const [RUN, ARC] = [EDGE - TURN - WEST, (TAU / 4) * TURN];
export const LEN = 2 * (RUN + ARC) + ZED + 2 * (BACK - TURN);
/** The line steps this far back round the wreck's nose, which lies in the trees: a clearing at the end of its furrow. */
export const NOSE = HULL.sections[2][1] + 3 - EDGE;

export const sm = (t: number) => {
  t = Math.min(Math.max(t, 0), 1);
  return t * t * (3 - 2 * t);
};

/**
 * How burnt the forest is at (x, z), 0 to 1: a fan round the nose and ahead of it, where the ship
 * ended, burnt out in its middle and ragged at its edge. None on the sand's side of the first
 * trunks. `wide` is its reach: the heat browned the leaves further out than the fire felled the trees.
 */
export const burn = (x: number, z: number, wide = 1.15) => {
  const [u, v] = [(x - HULL.sections[2][1] + 2) / 32, (z - ZED / 2) / 26];
  const d = u * u + v * v;
  return d < 3
    ? sm(2.2 * (wide - Math.sqrt(d) - 0.3 * noise(x / 7, z / 7, 6))) *
        sm((x - FRAME.trees + 6) / 10)
    : 0;
};
/** Scorched leaves, and charred wood. */
export const [DRY, CHAR] = [
  [0.2, 0.13, 0.06],
  [0.05, 0.045, 0.04],
];
/** The fire's mark on what stands in it: leaves and bark go brown, then black, by `burn` at each vertex. */
export const singe = (o: number[]) => {
  for (let i = 0; i < o.length; i += STRIDE) {
    const b = burn(o[i], o[i + 2], 1.3);
    if (b > 0) {
      // As light a brown as it was a green, so a dark mass of leaves stays one.
      const [k, d, g] = [Math.min(2 * b, 1), 1 - Math.max(2 * b - 1.2, 0), 4 * o[i + 7]];
      for (let m = 0; m < 3; m++) {
        const c = i + (m < 2 ? 6 + m : 9);
        o[c] = (o[c] + (DRY[m] * g - o[c]) * k) * d;
      }
    }
  }
};

/** The line at s metres along it: x, z and the way out of the beach. Its second half is the first one's mirror. */
export const edge = (s: number): number[] => {
  if (s > LEN / 2) {
    const [x, z, nx, nz] = edge(LEN - s);
    return [x, ZED - z, nx, -nz];
  }
  const [t, c] = [(s - RUN) / TURN, TURN - BACK];
  return s < RUN
    ? [WEST + s, -BACK, 0, -1]
    : s < RUN + ARC
      ? [EDGE - TURN + TURN * Math.sin(t), c - TURN * Math.cos(t), Math.sin(t), -Math.cos(t)]
      : [EDGE, c + s - RUN - ARC, 1, 0];
};

/** The point d metres behind the line at s (x, z), and how much forest there is there: none at the headland's seaward end. */
export const spot = (s: number, d: number): Vec3 => {
  const [x, z, nx, nz] = edge(s);
  const k = d + NOSE * nx * sm((22 - Math.abs(z - ZED / 2)) / 10);
  return [x + nx * k, z + nz * k, sm((x - WEST) / 30)];
};

/** A model's length (-z) stood up. */
export const UP: Vec3[] = [
  [1, 0, 0],
  [0, 0, 1],
  [0, 1, 0],
];
