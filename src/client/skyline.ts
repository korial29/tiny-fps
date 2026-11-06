// The city round the roofs: towers standing in the blocks of the street grid, from a fixed seed. They
// are only drawn (the renderer adds them to its own copy of the world), never built into the physics
// grid. Glass or concrete facades, some with a coloured cap; the near blocks are low, the far ones tall
// enough to rise out of the haze. Lawns in the lots with no tower, and round some towers.
import { TEX } from '../shared/types';
import type { Brush, WorldDef } from '../shared/world';
import { ROAD, STREET, grid } from './street';
import { hash } from './textures';

const SEED = 8;
/** The side of a tower's lot, metres: a block is cut into lots about this big. */
const LOT = 40;
/** Blocks nearer than NEAR to the play area, metres, are the low ones; nearer than CLOSE, lower than its lowest roof. */
const NEAR = 130;
const CLOSE = 60;
/** Caps colours: warm orange, sky blue, signal red, green. They colour the daylight on a near white paint. */
const CAPS = [
  [1, 0.45, 0.12],
  [0.2, 0.6, 1],
  [0.9, 0.15, 0.2],
  [0.25, 0.85, 0.55],
];
/** A lawn's green on the paint, and its height over the street: the lots with no tower, and some round one. */
const GRASS = [0.22, 0.5, 0.14];
const TURF = 0.3;

/** The towers of a world's skyline, in the blocks round its play area; the same ones every time. */
export const skyline = (def: WorldDef): Brush[] => {
  const { box, reach, xs, zs } = grid(def);
  const [cx, cz] = [(box[0] + box[1]) / 2, (box[2] + box[3]) / 2];
  const roof = Math.min(...def.brushes.map(b => b.max[1]));
  const h = ROAD / 2;
  return xs.slice(1).flatMap((xb, i) =>
    zs.slice(1).flatMap((zb, j) => {
      const [x0, x1, z0, z1] = [xs[i] + h, xb - h, zs[j] + h, zb - h];
      if (
        Math.hypot((x0 + x1) / 2 - cx, (z0 + z1) / 2 - cz) > reach ||
        (x0 < cx && cx < x1 && z0 < cz && cz < z1)
      ) {
        return [];
      }
      const [nx, nz] = [x1 - x0, z1 - z0].map(n => Math.max(1, Math.round(n / LOT)));
      return Array.from({ length: nx * nz }, (_, lot): Brush[] => {
        const [u, v] = [lot % nx, Math.floor(lot / nx)];
        const r = (k: number) => hash(i * 16 + u, j * 16 + v, SEED + k);
        const [a0, b0] = [x0 + ((x1 - x0) * u) / nx, z0 + ((z1 - z0) * v) / nz];
        const [a1, b1] = [a0 + (x1 - x0) / nx, b0 + (z1 - z0) / nz];
        const [w, e] = [7 + r(3) * 7, 7 + r(4) * 7];
        const [x, z] = [(a0 + a1) / 2, (b0 + b1) / 2];
        const away = Math.hypot(
          Math.max(box[0] - x, x - box[1], 0),
          Math.max(box[2] - z, z - box[3], 0),
        );
        const top = away < NEAR ? -20 + r(5) * 30 : -5 + r(5) ** 1.5 * 100;
        const side = [TEX.GLASS, TEX.STEEL, TEX.CONCRETE][+(r(6) > 0.7) + +(r(6) > 0.85)];
        const tower: Brush = {
          min: [a0 + w, STREET, b0 + e],
          max: [a1 - w, away < CLOSE ? Math.min(top, roof - 6) : top, b1 - e],
          top: TEX.CONCRETE,
          side,
        };
        const cap = tower.max[1];
        // A paved walk of 2 m round the lawn, to the road's crossings.
        const lawn: Brush = {
          min: [a0 + 2, STREET, b0 + 2],
          max: [a1 - 2, STREET + TURF, b1 - 2],
          top: TEX.PAINT,
          side: TEX.PAINT,
          tint: GRASS as Brush['tint'],
        };
        const green = r(10) < 0.3 ? [lawn] : [];
        return r(0) > 0.75
          ? [lawn]
          : r(7) < 0.35
            ? [
                ...green,
                tower,
                {
                  min: [x - (a1 - a0) / 6, cap, z - (b1 - b0) / 6],
                  max: [x + (a1 - a0) / 6, cap + 3 + r(8) * 3, z + (b1 - b0) / 6],
                  top: TEX.PAINT,
                  side: TEX.PAINT,
                  tint: CAPS[Math.floor(r(9) * CAPS.length)] as Brush['tint'],
                },
              ]
            : [...green, tower];
      }).flat();
    }),
  );
};
