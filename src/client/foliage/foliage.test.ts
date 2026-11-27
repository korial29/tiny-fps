import { describe, expect, it } from 'vitest';
import { BEACH } from '../../shared/beach';
import { parts } from '../jungle';
import { STRIDE } from '../mesh';
import { GRASS_TILE } from '../render/scene';
import { flowers } from './flower';
import { tiled } from './tiles';

const made = parts(BEACH);

describe('foliage', () => {
  it('sorts the undergrowth by tile, every triangle kept, each tile one run', () => {
    const g = tiled(made.brush);
    expect(g.length).toBe(made.brush.length);
    const tile = (t: number) =>
      `${Math.floor(g[t * 3 * STRIDE] / GRASS_TILE)} ${Math.floor(g[t * 3 * STRIDE + 2] / GRASS_TILE)}`;
    const seen = new Set<string>();
    let last = '';
    for (let t = 0; t < g.length / (3 * STRIDE); t++) {
      const k = tile(t);
      if (k != last) {
        // A tile met again after another one began: not one run.
        expect(seen.has(k)).toBe(false);
        seen.add(k);
        last = k;
      }
    }
  });

  it('makes a clump of red flowers: whole triangles over the ground, lit from above', () => {
    const o: number[] = [];
    flowers(o, 3, 1, 4, 7);
    expect(o.length % (3 * STRIDE)).toBe(0);
    expect(o.length / (3 * STRIDE)).toBeGreaterThanOrEqual(2 * 11);
    for (let i = 0; i < o.length; i += STRIDE) {
      expect(o[i + 1]).toBeGreaterThan(1.05);
      expect(Math.hypot(o[i] - 3, o[i + 2] - 4)).toBeLessThan(0.8);
      expect(o[i + 4]).toBeGreaterThan(0.9);
    }
    expect(o.filter((_, i) => i % STRIDE == 6).some(r => r > 0.5)).toBe(true);
  });
});
