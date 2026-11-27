import { describe, expect, it } from 'vitest';
import { BEACH } from '../../shared/beach';
import { parts } from '../jungle';
import { STRIDE } from '../mesh';
import { GRASS_TILE, GROVE_TILE } from '../render/scene';
import { flowers } from './flower';
import { packed } from './grove';
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

  it('packs each tile of palms near and far, their ranges one after the other and their bounds round both', () => {
    const groves = [...made.groves.values()];
    const { near, far, tiles } = packed(groves);
    expect(tiles.length).toBe(groves.length * 10);
    let [n, f] = [0, 0];
    groves.forEach((g, i) => {
      const t = tiles.slice(i * 10, i * 10 + 10);
      expect(t.slice(0, 4)).toEqual([n, g.near.length / STRIDE, f, g.far.length / STRIDE]);
      [n, f] = [n + t[1], f + t[3]];
      for (const v of [g.near, g.far]) {
        for (let j = 0; j < v.length; j += STRIDE) {
          for (let k = 0; k < 3; k++) {
            expect(v[j + k]).toBeGreaterThanOrEqual(t[4 + k]);
            expect(v[j + k]).toBeLessThanOrEqual(t[7 + k]);
          }
        }
      }
      expect(Math.abs(g.x % GROVE_TILE)).toBe(GROVE_TILE / 2);
    });
    expect([near.length, far.length]).toEqual([n * STRIDE, f * STRIDE]);
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
