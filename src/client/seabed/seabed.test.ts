import { describe, expect, it } from 'vitest';
import { BEACH, FRAME, HULL, ZED } from '../../shared/beach';
import { ground, raise } from '../../shared/relief';
import type { World } from '../../shared/world';
import { seabed } from '.';

const STRIDE = 10;
const made = seabed(BEACH);
const points = Array.from({ length: made.length / STRIDE }, (_, i) =>
  made.slice(i * STRIDE, i * STRIDE + 3),
);
const world = { relief: raise(BEACH.relief!) } as World;

describe('Landfall’s seabed', () => {
  it('keeps to its vertex budget', () => {
    expect(points.length).toBeLessThan(55_000);
    expect(made.every(Number.isFinite)).toBe(true);
  });

  it('lies in the lagoon, on its bed, between the headlands and out from under the hull', () => {
    for (const [x, y, z] of points) {
      expect(x).toBeLessThan(FRAME.shore + 5);
      expect(z).toBeGreaterThan(FRAME.cape);
      expect(z).toBeLessThan(ZED - FRAME.cape);
      // Nothing floats: within a kelp's length of the ground under it.
      expect(y - ground(world, x, z)).toBeGreaterThan(-0.4);
      expect(y - ground(world, x, z)).toBeLessThan(2.7);
      const underTail =
        Math.abs(z - ZED / 2) < HULL.r && x > HULL.sections[0][0] && x < HULL.sections[0][1];
      expect(underTail).toBe(false);
    }
  });

  it('stays under the water but for what the swash wets on the sand', () => {
    // The kelp's tips stay KELP_CLEAR under the surface; a few pebbles and shells lie past the waterline.
    const wet = points.filter(
      ([x, y, z]) => y > FRAME.water && ground(world, x, z) < FRAME.water - 0.3,
    );
    expect(wet).toEqual([]);
  });

  it('is the same on both halves of the map', () => {
    const key = ([x, y]: number[]) => `${x.toFixed(3)} ${y.toFixed(2)}`;
    const left = points
      .filter(p => p[2] < ZED / 2)
      .map(key)
      .sort();
    const right = points
      .filter(p => p[2] > ZED / 2)
      .map(key)
      .sort();
    expect(left.length).toBe(right.length);
    expect(left.slice(0, 50)).toEqual(right.slice(0, 50));
  });
});
