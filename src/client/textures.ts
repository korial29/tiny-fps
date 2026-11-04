// Procedural textures, one RGBA layer each in TEX order. Every one tiles over 1 UV unit.
import { TEX } from '../shared/types';

export const SIZE = 128;
export const LAYERS = Object.keys(TEX).length;

/** Integer hash of a lattice point to [0, 1). */
const hash = (x: number, y: number, s: number) => {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 144665)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Smooth value noise that repeats every p cells, and its sum over o octaves (in [0, 1)). */
const noise = (x: number, y: number, p: number, s: number) => {
  const [i, j] = [Math.floor(x), Math.floor(y)];
  const [u, v] = [x - i, y - j].map(t => t * t * (3 - 2 * t));
  const h = (a: number, b: number) => hash((i + a) % p, (j + b) % p, s);
  return (h(0, 0) * (1 - u) + h(1, 0) * u) * (1 - v) + (h(0, 1) * (1 - u) + h(1, 1) * u) * v;
};
const fbm = (x: number, y: number, p: number, o: number, s: number) => {
  let [sum, w] = [0, 0.5];
  for (let k = 0; k < o; k++, w /= 2) {
    sum += w * noise(x * (1 << k), y * (1 << k), p << k, s + k);
  }
  return sum / (1 - w * 2);
};

type Rgb = [number, number, number];
const mix = (a: Rgb, b: Rgb, t: number) => a.map((v, i) => v + (b[i] - v) * t) as Rgb;
const scale = (c: Rgb, k: number) => c.map(v => v * k) as Rgb;

/** u, v in [0, 1) to a colour in 0..255. */
const GEN: ((u: number, v: number) => Rgb)[] = [];

// Rows of 25 cm bricks 50 cm long, every other row shifted by half a brick.
GEN[TEX.BRICK] = (u, v) => {
  const r = Math.floor(v * 8);
  const bx = u * 4 + (r & 1) * 0.5;
  const [c, fu, fv] = [Math.floor(bx) % 4, bx % 1, (v * 8) % 1];
  const grain = 0.8 + 0.4 * noise(u * 16, v * 16, 16, 5);
  return fu < 0.04 || fv < 0.08
    ? scale([165, 160, 150], 0.7 + 0.3 * grain)
    : scale([170, 78, 56], (0.8 + 0.4 * hash(c, r, 1)) * grain * (0.85 + 0.15 * fv));
};

// 4 × 4 tiles of 50 cm with grout, a faint checker tint.
GEN[TEX.TILE] = (u, v) => {
  const [a, b] = [Math.floor(u * 4), Math.floor(v * 4)];
  const grain = 0.9 + 0.2 * noise(u * 16, v * 16, 16, 7);
  return (u * 4) % 1 < 0.04 || (v * 4) % 1 < 0.04
    ? scale([85, 85, 80], grain)
    : scale([196, 190, 172], grain * (0.88 + 0.08 * ((a + b) & 1) + 0.1 * hash(a, b, 2)));
};

// Dark crust over bright cracks (where the noise crosses 0.5), scrolled by the shader.
GEN[TEX.LAVA] = (u, v) => {
  const n = fbm(u * 4, v * 4, 4, 4, 11);
  const heat = Math.max(0, 1 - Math.abs(n - 0.5) * 7) ** 2;
  return mix(mix([55, 8, 4], [230, 70, 8], n), [255, 215, 90], heat);
};

GEN[TEX.STONE] = (u, v) => {
  const n =
    fbm(u * 8, v * 8, 8, 4, 3) * 1.3 + 0.1 * hash(Math.floor(u * SIZE), Math.floor(v * SIZE), 4);
  return scale([128, 124, 120], 0.45 + 0.7 * n);
};

/** All layers, RGBA, layer after layer, rows top to bottom: the upload of a texture array. */
export const textures = (): Uint8ClampedArray => {
  const out = new Uint8ClampedArray(LAYERS * SIZE * SIZE * 4);
  GEN.forEach((gen, l) => {
    for (let i = 0; i < SIZE * SIZE; i++) {
      const c = gen((i % SIZE) / SIZE, Math.floor(i / SIZE) / SIZE);
      out.set([...c.map(Math.round), 255], (l * SIZE * SIZE + i) * 4);
    }
  });
  return out;
};
