// The sample shelves in the first module (docs/MOON.md): rock samples, crystal clusters, jars of
// coloured liquid and racks of test tubes on three shelves, under cool white strip lights.
import { capsule, dress, segment } from '../mesh';
import { box, lit } from '../brick';
import type { Vec3 } from '../mesh';
import type { Out } from '../verts';
import { AMBER, CYAN, GREEN, INK, IRON, LAMP, MAUVE, PINK } from './constants';

/** Maps (u along the shelf, y up from its foot, w out from its back) to the world. */
type Frame = (u: number, y: number, w: number) => Vec3;

/** Meshes of unit length along their axis, made once. */
const JAR = dress(capsule(1, [1, 1], 6, [0, 0]), [1, 1, 1]);
const CRYSTAL = dress(capsule(1, [1, 0.9, 0], 5, [0, 0]), [1, 1, 1]);
const ROCK = dress(capsule(1, [0.75, 1, 0.8], 5, [1, 1]), [1, 1, 1]);
const TUBE = dress(capsule(1, [1, 1], 4, [0, 0]), [1, 1, 1]);

/** Rock tones: basalt, regolith, anorthosite, a rusty breccia. */
const STONES = [
  [0.2, 0.2, 0.22],
  [0.48, 0.47, 0.46],
  [0.78, 0.77, 0.74],
  [0.42, 0.3, 0.22],
];
/** The liquids and the crystals' glow. */
const LIQUIDS = [GREEN, MAUVE, CYAN, AMBER, PINK, [1, 0.3, 0.2]];
const GLASS = [0.62, 0.7, 0.74];

/** A hash in [0, 1) of an integer. */
const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/**
 * Fills the shelves of a rack L long and D deep whose boards' tops are at `ys`, in its frame P, and
 * hangs a strip light under each board above, `top` the highest.
 */
export const samples = (o: Out, P: Frame, L: number, D: number, ys: number[], top: number) => {
  const mid = D / 2;
  const side: Vec3 = [1, 0, 0];
  const up = (
    u: number,
    y: number,
    w: number,
    h: number,
    mesh: number[],
    r: number,
    rgb: number[],
  ) => segment(o, mesh, P(u, y, w), P(u, y + h, w), side, 1, r, rgb);
  /** A jar of radius r and height h, `fill` of it a glowing liquid, a glass shoulder and a dark lid. */
  const jar = (
    u: number,
    y: number,
    w: number,
    r: number,
    h: number,
    fill: number,
    rgb: number[],
  ) => {
    lit(o, 0.95, () =>
      up(
        u,
        y,
        w,
        h * fill,
        JAR,
        r,
        rgb.map(v => v * 0.8),
      ),
    );
    up(u, y + h * fill, w, h * (1 - fill), JAR, r, GLASS);
    if (r > 0.05) {
      up(u, y + h, w, 0.025, JAR, r * 1.08, INK);
    }
  };
  /** A cluster of five glowing crystals leaning out of a dark rock. */
  const crystals = (u: number, y: number, w: number, seed: number, rgb: number[]) => {
    up(u, y - 0.01, w, 0.06, ROCK, 0.09, STONES[0]);
    lit(o, 1.4, () => {
      for (let i = 0; i < 4; i++) {
        const a = seed * 5 + i * 2.4;
        const t = i ? 0.35 + 0.25 * hash(seed * 7 + i) : 0.05;
        const h = (i ? 0.13 : 0.22) + 0.08 * hash(seed * 3 + i);
        const [du, dw] = [Math.cos(a) * t, Math.sin(a) * t];
        const foot = P(u + du * 0.06, y + 0.03, w + dw * 0.06);
        const tip = P(u + du * (0.06 + h), y + 0.03 + h * Math.cos(t), w + dw * (0.06 + h));
        segment(o, CRYSTAL, foot, tip, side, 1, i ? 0.024 : 0.034, rgb);
      }
    });
  };
  /** A rock sample: a lumpy, tilted pebble. */
  const rock = (u: number, y: number, w: number, seed: number) => {
    const r = 0.07 + 0.06 * hash(seed);
    const a = hash(seed + 1) * Math.PI;
    const l = r * (1.3 + 0.6 * hash(seed + 2));
    const [du, dw] = [(Math.cos(a) * l) / 2, (Math.sin(a) * l) / 2];
    segment(
      o,
      ROCK,
      P(u - du, y + r * 0.7, w - dw),
      P(u + du, y + r * 0.8, w + dw),
      [0, 1, 0],
      1,
      [r, r * 0.75],
      STONES[Math.floor(hash(seed + 3) * STONES.length)],
    );
  };
  /** A rack of four test tubes. */
  const tubes = (u: number, y: number, w: number, seed: number) => {
    box(
      o,
      P(u - 0.13, y, w - 0.04).map((v, i) =>
        Math.min(v, P(u + 0.13, y + 0.06, w + 0.04)[i]),
      ) as Vec3,
      P(u - 0.13, y, w - 0.04).map((v, i) =>
        Math.max(v, P(u + 0.13, y + 0.06, w + 0.04)[i]),
      ) as Vec3,
      IRON,
      4,
    );
    for (let i = 0; i < 4; i++) {
      const x = u - 0.09 + i * 0.06;
      const rgb = LIQUIDS[(seed + i * 2) % LIQUIDS.length];
      lit(o, 1.3, () => up(x, y + 0.01, w, 0.1, TUBE, 0.014, rgb));
      up(x, y + 0.11, w, 0.06, TUBE, 0.014, GLASS);
    }
  };
  ys.forEach((y0, s) => {
    const y = y0 + 0.04;
    let n = s * 5;
    for (let u = 0.22; u < L - 0.2; n++) {
      const what = [0, 1, 2, 3, 5, 1, 0, 2, 4, 1][(n + s * 3) % 10];
      const k = hash(n * 13 + s);
      if (what == 0 || what == 3) {
        jar(
          u,
          y,
          mid,
          0.06 + 0.02 * k,
          0.2 + 0.1 * k,
          0.55 + 0.3 * hash(n),
          LIQUIDS[n % LIQUIDS.length],
        );
        u += 0.2;
        if (k > 0.5) {
          jar(u, y, mid - 0.05, 0.045, 0.14, 0.7, LIQUIDS[(n + 3) % LIQUIDS.length]);
          u += 0.14;
        }
      } else if (what == 1 || what == 4) {
        rock(u, y, mid, n);
        u += 0.26;
      } else if (what == 2) {
        crystals(u, y, mid, n, [CYAN, MAUVE, PINK, GREEN][n % 4]);
        u += 0.32;
      } else {
        tubes(u + 0.06, y, mid, n);
        u += 0.36;
      }
      u += 0.06;
    }
  });
  // Strip lights under each board, cool white.
  for (const y of [...ys.slice(1), top]) {
    lit(o, 1.1, () => {
      const [p, q] = [P(0.12, y - 0.03, mid - 0.04), P(L - 0.12, y - 0.005, mid + 0.04)];
      box(
        o,
        p.map((v, i) => Math.min(v, q[i])) as Vec3,
        p.map((v, i) => Math.max(v, q[i])) as Vec3,
        LAMP,
        8,
      );
    });
  }
};
