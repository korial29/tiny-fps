import { describe, expect, it } from 'vitest';
import { mapOf } from '../shared/maps';
import { build } from '../shared/world';
import { STRIDE } from './mesh';
import { BARE, decor, scenery } from './render';

describe('decor, the scenery loaded with its map', () => {
  it('brings Tranquility its ground and its Earth from its chunk', async () => {
    const d = await decor(mapOf('tranquility'));
    expect(d.land.length).toBeGreaterThan(0);
    expect(d.sky.length % STRIDE).toBe(0);
    expect(d.sky.length).toBeGreaterThan(0);
    expect(d.heavens).toHaveLength(3);
  });

  it('brings Landfall its forest and its wreck, and no sky', async () => {
    const d = await decor(mapOf('landfall'));
    expect(d.land.length).toBeGreaterThan(0);
    expect(d.sky).toEqual([]);
  });

  it('loads nothing for Highline, at once: its city is drawn by render.ts', () => {
    expect(decor(mapOf('highline'))).toBe(BARE);
  });

  it('gives a map loaded before at once, the same scenery', async () => {
    const d = await decor(mapOf('landfall'));
    expect(decor(mapOf('landfall'))).toBe(d);
  });

  it('draws a map with its scenery after its brushes, the moon’s Earth last', async () => {
    const def = mapOf('tranquility');
    const d = await decor(def);
    const all = scenery(build(def), d);
    expect(all.length).toBe(scenery(build(def)).length + d.land.length + d.sky.length);
    expect(all.slice(-d.sky.length)).toEqual(d.sky);
  });
});
