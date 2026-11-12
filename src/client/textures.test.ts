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

  it('lays concrete in 1 m panels: seams every half tile, a few dark pores', () => {
    const grey = (x: number, y: number) => layer(TEX.CONCRETE)[(y * SIZE + x) * 4];
    // Seams are darker than the panel beside them, on a row and a column.
    for (const at of [0, SIZE / 2]) {
      expect(grey(at, 40)).toBeLessThan(grey(at + 8, 40) - 25);
      expect(grey(40, at)).toBeLessThan(grey(40, at + 8) - 25);
    }
    const pores = layer(TEX.CONCRETE).filter((v, i) => i % 4 == 0 && v < 185).length;
    expect(pores).toBeGreaterThan(SIZE);
    expect(pores).toBeLessThan(SIZE * SIZE * 0.1);
  });

  it('brushes steel along u: neighbours along a row agree better than neighbours down a column', () => {
    const grey = (x: number, y: number) => layer(TEX.STEEL)[(y * SIZE + x) * 4];
    let [along, across] = [0, 0];
    for (let y = 1; y < SIZE - 1; y++) {
      for (let x = 8; x < SIZE / 4 - 8; x++) {
        along += Math.abs(grey(x, y) - grey(x + 1, y));
        across += Math.abs(grey(x, y) - grey(x, y + 1));
      }
    }
    expect(across).toBeGreaterThan(along * 2);
  });

  it('frames glass panes in steel: the frame is light and the pane dark, and the pane is bluer', () => {
    const at = (x: number, y: number) =>
      Array.from(layer(TEX.GLASS).subarray((y * SIZE + x) * 4, (y * SIZE + x) * 4 + 3));
    // The mullion at u = 0.5 and the pane beside it.
    const [frame, pane] = [at(SIZE / 2 + 1, 60), at(SIZE / 4, 60)];
    expect(frame[0]).toBeGreaterThan(pane[0] * 3);
    expect(pane[2]).toBeGreaterThan(pane[0] * 2);
  });

  it('generates all layers fast', () => {
    const times = [0, 0, 0].map(() => {
      const t = performance.now();
      textures();
      return performance.now() - t;
    });
    // About 100 ms on a quiet machine, and up to 420 on a busy CI runner beside the other files:
    // the bound only catches a texture that got an order slower.
    expect(Math.min(...times)).toBeLessThan(1000);
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
    // Concrete is a light, neutral grey, glass a dark blue, steel a bluish grey, paint near white.
    for (const c of [0, 1, 2]) {
      expect(mean(TEX.CONCRETE, c)).toBeGreaterThan(185);
      expect(mean(TEX.PAINT, c)).toBeGreaterThan(225);
      expect(mean(TEX.GLASS, c)).toBeLessThan(mean(TEX.CONCRETE, c) / 2);
    }
    expect(Math.abs(mean(TEX.CONCRETE, 0) - mean(TEX.CONCRETE, 2))).toBeLessThan(12);
    expect(mean(TEX.GLASS, 2)).toBeGreaterThan(mean(TEX.GLASS, 0) * 2);
    expect(mean(TEX.GLASS, 2)).toBeGreaterThan(mean(TEX.GLASS, 1));
    expect(mean(TEX.GLASS, 2)).toBeLessThan(110);
    expect(mean(TEX.STEEL, 2)).toBeGreaterThan(mean(TEX.STEEL, 0));
    expect(mean(TEX.STEEL, 0)).toBeGreaterThan(130);
    const dark = layer(TEX.GRATE).filter((v, i) => i % 4 == 1 && v < 30).length;
    expect(dark).toBeGreaterThan(SIZE * SIZE * 0.3);
  });
});
