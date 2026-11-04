// Procedural textures, one RGBA layer each in TEX order: colour in RGB, height in alpha (0 low, 255 high).
// Every one tiles over 1 UV unit.
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
const clamp = (x: number) => Math.min(Math.max(x, 0), 1);
const TAU = Math.PI * 2;

/** u, v in [0, 1) to a colour in 0..255 and a height in 0..1. */
const GEN: ((u: number, v: number) => [Rgb, number])[] = [];

// Rows of 25 cm bricks 50 cm long, every other row shifted by half a brick.
GEN[TEX.BRICK] = (u, v) => {
  const r = Math.floor(v * 8);
  const bx = u * 4 + (r & 1) * 0.5;
  const [c, fu, fv] = [Math.floor(bx) % 4, bx % 1, (v * 8) % 1];
  const n = noise(u * 16, v * 16, 16, 5);
  const grain = 0.8 + 0.4 * n;
  return fu < 0.05 || fv < 0.1
    ? [scale([165, 160, 150], 0.7 + 0.3 * grain), 0.1 + 0.1 * n]
    : [
        scale([170, 78, 56], (0.8 + 0.4 * hash(c, r, 1)) * grain * (0.85 + 0.15 * fv)),
        0.7 + 0.2 * n + 0.1 * clamp(Math.min(fu - 0.05, fv - 0.1) * 12),
      ];
};

// 4 × 4 tiles of 50 cm with grout, a faint checker tint.
GEN[TEX.TILE] = (u, v) => {
  const [a, b] = [Math.floor(u * 4), Math.floor(v * 4)];
  const [fu, fv] = [(u * 4) % 1, (v * 4) % 1];
  const n = noise(u * 16, v * 16, 16, 7);
  const grain = 0.9 + 0.2 * n;
  return fu < 0.05 || fv < 0.05
    ? [scale([85, 85, 80], grain), 0.1]
    : [
        scale([196, 190, 172], grain * (0.88 + 0.08 * ((a + b) & 1) + 0.1 * hash(a, b, 2))),
        0.8 + 0.1 * n + 0.1 * clamp((Math.min(fu, fv) - 0.05) * 14),
      ];
};

// Dark crust over bright cracks (where the noise crosses 0.5), scrolled by the shader.
GEN[TEX.LAVA] = (u, v) => {
  const n = fbm(u * 4, v * 4, 4, 4, 11);
  const heat = Math.max(0, 1 - Math.abs(n - 0.5) * 7) ** 2;
  return [mix(mix([55, 8, 4], [230, 70, 8], n), [255, 215, 90], heat), 0.5];
};

GEN[TEX.STONE] = (u, v) => {
  const f = fbm(u * 8, v * 8, 8, 4, 3);
  const n = f * 1.3 + 0.1 * hash(Math.floor(u * SIZE), Math.floor(v * SIZE), 4);
  return [scale([128, 124, 120], 0.45 + 0.7 * n), clamp(f * 1.4 - 0.2)];
};

// Two by two plates of 1 m, riveted along the edges and in the middle of each side, with wear.
GEN[TEX.METAL] = (u, v) => {
  const [a, b, fu, fv] = [Math.floor(u * 2), Math.floor(v * 2), (u * 2) % 1, (v * 2) % 1];
  const wear = noise(u * 8, v * 8, 8, 13);
  const rust = clamp((wear - 0.68) * 6);
  // The nearest of the three rivet columns and rows (0.1, 0.5, 0.9), none in the middle.
  const near = (f: number) => Math.min(Math.max(Math.round((f - 0.1) / 0.4), 0), 2) * 0.4 + 0.1;
  const [ru, rv] = [near(fu), near(fv)];
  const d = ru == rv && ru == 0.5 ? 1 : Math.hypot(fu - ru, fv - rv);
  const dome = clamp(1 - d / 0.07);
  const steel = scale(
    [98, 108, 124],
    (0.9 + 0.2 * noise(u * 32, v * 32, 32, 9) + 0.12 * hash(a, b, 6)) *
      (1 + 0.3 * dome) *
      (0.65 + 0.35 * clamp((d - 0.06) / 0.04)),
  );
  const seam = Math.min(fu, fv, 1 - fu, 1 - fv);
  return seam < 0.03
    ? [scale([40, 44, 50], 1 + rust), 0.05]
    : [mix(steel, [105, 68, 45], rust * 0.7), 0.5 + 0.1 * (1 - rust) + 0.4 * dome];
};

// Eight planks of 25 cm across, 1 m long and staggered, the grain along u.
GEN[TEX.WOOD] = (u, v) => {
  const r = Math.floor(v * 8);
  const x = u * 2 + hash(r, 0, 8) * 2;
  const [seg, fu, fv] = [Math.floor(x) % 2, x % 1, (v * 8) % 1];
  const tone = hash(r, seg, 3);
  const ring = 0.5 + 0.5 * Math.sin(TAU * (v * 40 + 2.5 * noise(u * 4, v * 4, 4, 21) + tone * 7));
  return fv < 0.08 || fu < 0.015
    ? [[28, 18, 10], 0.05]
    : [
        mix([92, 58, 32], [158, 106, 62], ring * 0.6 + tone * 0.35),
        0.7 + 0.15 * ring + 0.15 * clamp((fv - 0.08) * 15),
      ];
};

// Blocks of 1 m by 50 cm in a running bond. Moss grows out of the joints, further in some places.
GEN[TEX.MOSS] = (u, v) => {
  const r = Math.floor(v * 4);
  const bx = u * 2 + (r & 1) * 0.5;
  const [c, fu, fv] = [Math.floor(bx) % 2, bx % 1, (v * 4) % 1];
  const d = Math.min(fu, 1 - fu, (fv < 0.5 ? fv : 1 - fv) * 0.5);
  const joint = fu < 0.04 || fv < 0.06;
  const moss = clamp((0.3 * fbm(u * 12, v * 12, 12, 3, 17) - 0.03 - d) * 12);
  const fuzz = noise(u * 64, v * 64, 64, 19);
  const stone = scale(
    [128, 126, 118],
    (0.7 + 0.4 * hash(c, r, 5)) * (0.7 + 0.5 * noise(u * 16, v * 16, 16, 15)),
  );
  return [
    mix(joint ? scale(stone, 0.45) : stone, mix([52, 100, 34], [96, 148, 56], fuzz), moss),
    joint ? 0.1 + 0.6 * moss * fuzz : 0.6 + 0.2 * clamp(d * 30) + 0.2 * moss * fuzz,
  ];
};

// 8 × 8 cells of 25 cm: bars around square holes that show darkness, welded at the crossings.
GEN[TEX.GRATE] = (u, v) => {
  const [fu, fv] = [(u * 8) % 1, (v * 8) % 1];
  const e = Math.max(Math.abs(fu - 0.5), Math.abs(fv - 0.5));
  const weld = Math.min(Math.abs(fu - 0.5), Math.abs(fv - 0.5)) > 0.43;
  const wear = noise(u * 16, v * 16, 16, 23);
  return e < 0.36
    ? [[9, 9, 12], 0]
    : [
        scale(
          mix([104, 108, 116], [96, 80, 68], clamp((wear - 0.55) * 4)),
          (weld ? 1.25 : 1) - (0.5 - e) * 2.2 + 0.2 * wear,
        ),
        weld ? 1 : 0.6 + 0.4 * clamp((e - 0.36) * 12),
      ];
};

/** All layers, RGBA, layer after layer, rows top to bottom: the upload of a texture array. */
export const textures = (): Uint8ClampedArray => {
  const out = new Uint8ClampedArray(LAYERS * SIZE * SIZE * 4);
  GEN.forEach((gen, l) => {
    for (let i = 0; i < SIZE * SIZE; i++) {
      const [c, h] = gen((i % SIZE) / SIZE, Math.floor(i / SIZE) / SIZE);
      out.set([...c, h * 255], (l * SIZE * SIZE + i) * 4);
    }
  });
  return out;
};
