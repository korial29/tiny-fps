// Test helper: the nodes and squares of a relief's lattice, and where a point is against its hole and bound.
import type { Relief } from '../src/shared/relief';

/** How far (x, z) is toward the bound: under 1 inside it, 1 on it. */
export const reach = ({ bound: [cx, cz, a, b] }: Relief, x: number, z: number): number =>
  Math.hypot((x - cx) / a, (z - cz) / b);

/** The moon's arena, x0, z0, x1, z1. */
export const ARENA = [0, 0, 160, 280];

/** Metres from (x, z) to a rectangle (the arena unless told), 0 in it. */
export const off = (x: number, z: number, [x0, z0, x1, z1] = ARENA): number =>
  Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1));

/**
 * Whether the lattice square whose low corner is (x, z) is in the hole or within 8 m of its long
 * sides: the moon's rille and the band of its lips, where the pits are and the scenery draws its own ground.
 */
export const empty = ({ hole: [x0, z0, x1, z1] }: Relief, x: number, z: number): boolean =>
  x >= x0 && x < x1 && z >= z0 - 8 && z < z1 + 8;

/** Every node as x, z and its height. */
export const nodes = (r: Relief): [x: number, z: number, h: number][] =>
  Array.from(r.h, (h, n) => [r.x0 + (n % r.nx) * r.cell, r.z0 + Math.floor(n / r.nx) * r.cell, h]);

/**
 * Every lattice square clear of the hole's band (see empty) with a corner inside the bound, as its corner (x, z) and the heights of
 * (i, j), (i + 1, j), (i, j + 1) and (i + 1, j + 1): the ones a body inside the bound can stand on.
 */
export const squares = (r: Relief): number[][] => {
  const out: number[][] = [];
  for (let j = 0; j < r.nz - 1; j++) {
    for (let i = 0; i < r.nx - 1; i++) {
      const [x, z, n] = [r.x0 + i * r.cell, r.z0 + j * r.cell, i + j * r.nx];
      if (
        !empty(r, x, z) &&
        [0, 1].some(a => [0, 1].some(b => reach(r, x + a * r.cell, z + b * r.cell) <= 1))
      ) {
        out.push([x, z, r.h[n], r.h[n + 1], r.h[n + r.nx], r.h[n + r.nx + 1]]);
      }
    }
  }
  return out;
};

/** The lattice's float32 bits folded into one number: a node that moves by one bit changes it. */
export const checksum = (r: Relief): number => {
  let sum = 0;
  for (const bits of new Uint32Array(r.h.buffer, r.h.byteOffset, r.h.length)) {
    sum = (Math.imul(sum, 31) + bits) | 0;
  }
  return sum >>> 0;
};
