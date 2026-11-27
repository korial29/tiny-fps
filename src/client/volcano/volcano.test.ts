import { describe, expect, it } from 'vitest';
import { STRIDE } from '../mesh';
import { VOLCANO, volcano } from '.';

describe('volcano', () => {
  const v = volcano();

  it('is whole triangles of finite numbers', () => {
    expect(v.length % (3 * STRIDE)).toBe(0);
    expect(v.every(Number.isFinite)).toBe(true);
  });

  it('keeps its foot behind the forest, off the beach', () => {
    // A foot stretched by the noise once reached x = 12, a sheet a few metres over the camps.
    let near = Infinity;
    for (let i = 0; i < v.length; i += STRIDE) {
      near = Math.min(near, v[i]);
    }
    expect(near).toBeGreaterThanOrEqual(159.9);
  });

  it('stands about its rim height, its foot on the ground', () => {
    let [low, high] = [Infinity, -Infinity];
    for (let i = 1; i < v.length; i += STRIDE) {
      [low, high] = [Math.min(low, v[i]), Math.max(high, v[i])];
    }
    expect(low).toBeCloseTo(0, 3);
    expect(high).toBeGreaterThan(VOLCANO.top - 20);
    expect(high).toBeLessThan(VOLCANO.top + 50);
  });
});
