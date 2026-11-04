import { describe, expect, it } from 'vitest';
import { TEX } from '../shared/types';
import { LAYERS, SIZE, textures } from './textures';

const pix = textures();
const layer = (l: number) => pix.subarray(l * SIZE * SIZE * 4, (l + 1) * SIZE * SIZE * 4);
const range = (l: number) => {
  const h = layer(l).filter((_, i) => i % 4 == 3);
  return Math.max(...h) - Math.min(...h);
};
const mean = (l: number, c: number) => {
  let sum = 0;
  for (let i = c; i < SIZE * SIZE * 4; i += 4) {
    sum += layer(l)[i];
  }
  return sum / (SIZE * SIZE);
};

describe('textures', () => {
  it('has one SIZE x SIZE layer per TEX id', () => {
    expect(LAYERS).toBe(Object.keys(TEX).length);
    expect(pix).toHaveLength(LAYERS * SIZE * SIZE * 4);
  });

  it('carries a height in alpha: a range on every layer but the flat lava', () => {
    for (let l = 0; l < LAYERS; l++) {
      expect(range(l) > 100).toBe(l != TEX.LAVA);
    }
    expect(range(TEX.LAVA)).toBe(0);
  });

  it('generates all layers fast', () => {
    const times = [0, 0, 0].map(() => {
      const t = performance.now();
      textures();
      return performance.now() - t;
    });
    // About 100 ms on a quiet machine: the bound only catches a texture that got an order slower.
    expect(Math.min(...times)).toBeLessThan(400);
  });

  it('is deterministic', () => {
    // Byte compare: toEqual walks 256 KB element by element and can time out under load.
    const bytes = (a: Uint8ClampedArray) => new Uint8Array(a.buffer);
    expect(Buffer.compare(bytes(textures()), bytes(pix))).toBe(0);
  });

  it('tiles: the left column continues the right one', () => {
    for (let l = 0; l < LAYERS; l++) {
      let jump = 0;
      let inside = 0;
      for (let y = 0; y < SIZE; y++) {
        const at = (x: number, c: number) => layer(l)[(y * SIZE + x) * 4 + c];
        jump += Math.abs(at(0, 0) - at(SIZE - 1, 0));
        inside += Math.abs(at(SIZE / 2, 0) - at(SIZE / 2 - 1, 0));
      }
      expect(jump).toBeLessThanOrEqual(inside * 3 + SIZE * 40);
    }
  });

  it('colours each layer as named', () => {
    expect(mean(TEX.BRICK, 0)).toBeGreaterThan(mean(TEX.BRICK, 2) * 1.5);
    expect(mean(TEX.LAVA, 0)).toBeGreaterThan(mean(TEX.LAVA, 2) * 2);
    expect(Math.abs(mean(TEX.STONE, 0) - mean(TEX.STONE, 2))).toBeLessThan(15);
    // Metal is greyish blue, wood brown, moss has green in it, a grate is mostly dark holes.
    expect(mean(TEX.METAL, 2)).toBeGreaterThan(mean(TEX.METAL, 0) + 5);
    expect(mean(TEX.METAL, 2)).toBeLessThan(mean(TEX.METAL, 1) * 1.3);
    expect(mean(TEX.WOOD, 0)).toBeGreaterThan(mean(TEX.WOOD, 1) * 1.2);
    expect(mean(TEX.WOOD, 1)).toBeGreaterThan(mean(TEX.WOOD, 2) * 1.3);
    expect(mean(TEX.MOSS, 1)).toBeGreaterThan(mean(TEX.MOSS, 0) * 1.1);
    expect(mean(TEX.MOSS, 1)).toBeGreaterThan(mean(TEX.MOSS, 2) * 1.2);
    const dark = layer(TEX.GRATE).filter((v, i) => i % 4 == 1 && v < 30).length;
    expect(dark).toBeGreaterThan(SIZE * SIZE * 0.3);
  });
});
