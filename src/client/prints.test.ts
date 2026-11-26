import { describe, expect, it } from 'vitest';
import { HIGHLINE } from '../shared/map';
import { MAPS } from '../shared/maps';
import { ground } from '../shared/relief';
import { build } from '../shared/world';
import { createPrints } from './prints';

/** A GL that does nothing and keeps the calls by name, enough for createPrints(). */
const fakeGl = () => {
  const calls: unknown[][] = [];
  const gl = new Proxy({} as Record<string, unknown>, {
    get: (_, name: string) =>
      /^[A-Z_\d]+$/.test(name)
        ? name.length
        : (...args: unknown[]) => {
            calls.push([name, ...args]);
            return {};
          },
  }) as unknown as WebGL2RenderingContext;
  return { gl, calls };
};

/** The prints each instanced draw stamped: four copies of each. */
const stamped = (calls: unknown[][]) =>
  calls.filter(c => c[0] === 'drawArraysInstanced').map(c => (c[4] as number) / 4);

describe('footprints', () => {
  it('are made only for the sand and the regolith', () => {
    expect(createPrints(fakeGl().gl, build(HIGHLINE))).toBeUndefined();
    expect(createPrints(fakeGl().gl, build(MAPS.tranquility))).toBeDefined();
    expect(createPrints(fakeGl().gl, build(MAPS.landfall))).toBeDefined();
  });

  it('stamps each new footfall on the ground once, and none off it', () => {
    const world = build(MAPS.tranquility);
    const { gl, calls } = fakeGl();
    const prints = createPrints(gl, world)!;
    const [x, z] = [20, 185];
    const plant = { n: 0, x, y: ground(world, x, z), z, yaw: 0, side: 1 };
    // The first sight of a gait only learns its count: its old footfalls are not stamped.
    prints.feed(plant);
    prints.pass(1 / 60, x, z);
    expect(stamped(calls)).toEqual([]);
    plant.n++;
    prints.feed(plant);
    // Fed again in the same frame, the same footfall is not stamped twice.
    prints.feed(plant);
    prints.pass(1 / 60, x, z);
    expect(stamped(calls)).toEqual([1]);
    // A foot on a deck 2 m over the regolith leaves nothing on it.
    plant.n++;
    plant.y += 2;
    prints.feed(plant);
    prints.pass(1 / 60, x, z);
    expect(stamped(calls)).toEqual([1]);
  });

  it('keeps the moon prints and fills the beach ones back in', () => {
    const fills = (map: 'tranquility' | 'landfall') => {
      const { gl, calls } = fakeGl();
      const prints = createPrints(gl, build(MAPS[map]))!;
      for (let i = 0; i < 600; i++) {
        prints.pass(1 / 60, 0, 0);
      }
      return calls.filter(c => c[0] === 'drawArrays').length;
    };
    expect(fills('tranquility')).toBe(0);
    // 150 s to fill back in by 255 steps: a step every 0.59 s, 16 or 17 in 10 s.
    expect(fills('landfall')).toBeGreaterThanOrEqual(16);
    expect(fills('landfall')).toBeLessThanOrEqual(17);
  });
});
