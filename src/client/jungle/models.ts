// Landfall's forest (docs/BEACH.md): its plants, each built from a seed: fronds, palms, ferns.
import { TAU } from '../../shared/physics';
import { hash } from '../../shared/relief';
import { dress, place, segment, smooth } from '../mesh';
import type { Vec3 } from '../mesh';
import { BARK as WOOD, LEAF, onLayer } from '../foliage/layers';
import { DRY, UP } from './constants';

/** smooth()'s vertices in colour `c`, on the bark's layer. */
export const bark = (v: number[], c: number[]) => onLayer(dress(v, c), WOOD);
/** A length of trunk, wider at its top than at its foot: stacked, the steps are a palm's rings. By sides. */
export const BOLE = [5, 7, 9].map(n =>
  bark(
    smooth(
      [
        [0.9, 0],
        [1.1, 1],
      ],
      n,
    ),
    [1, 1, 1],
  ),
);
/** A coconut. */
export const BLOB = [
  smooth(
    [
      [0, -1],
      [1, 0],
      [0, 1],
    ],
    4,
  ),
  smooth(
    [
      [0, -1],
      [0.85, -0.45],
      [0.9, 0.35],
      [0, 1],
    ],
    5,
  ),
].map(v => dress(v, [1, 1, 1]));
export const BARK = [0.4, 0.33, 0.24];
export const HUSK = [0.3, 0.2, 0.08];
/** Fronds: young, grown, old. */
export const FROND = [
  [0.16, 0.34, 0.07],
  [0.1, 0.26, 0.06],
  [0.22, 0.29, 0.08],
];

/**
 * A feather of leaflets from `at`: its rib leaves toward the bearing a at the elevation e and
 * bends down over its length, n steps of it, a leaflet a side on each (a triangle, its tip out,
 * forward and hanging), `wide` at the middle. Darker at the rib. Its normals lean up: lit from
 * above on both faces.
 */
export const frond = (
  o: number[],
  at: Vec3,
  a: number,
  e: number,
  len: number,
  wide: number,
  n: number,
  [r, g, b]: number[],
) => {
  const [c, s] = [Math.cos(a), Math.sin(a)];
  let [x, y, z] = at;
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n;
    const f = Math.max(e - 2.1 * t, -1.45);
    const [u, v] = [(Math.cos(f) * len) / n, (Math.sin(f) * len) / n];
    const [x1, y1, z1] = [x + c * u, y + v, z + s * u];
    const w = wide * (0.3 + 2.8 * t * (1 - t));
    for (const side of [-w, w]) {
      const tx = (x + x1) / 2 + 0.4 * c * u - s * side;
      const ty = (y + y1) / 2 + 0.4 * v - 0.45 * w;
      const tz = (z + z1) / 2 + 0.4 * s * u + c * side;
      let nx = v * (tz - z) - s * u * (ty - y);
      let ny = s * u * (tx - x) - c * u * (tz - z);
      let nz = c * u * (ty - y) - v * (tx - x);
      const l = (ny < 0 ? -1 : 1) / (Math.hypot(nx, ny, nz) || 1);
      [nx, ny, nz] = [nx * l, ny * l + 0.6, nz * l];
      const m = 1 / Math.hypot(nx, ny, nz);
      o.push(x, y, z, nx * m, ny * m, nz * m, r * 0.6, g * 0.6, LEAF, b * 0.6);
      o.push(x1, y1, z1, nx * m, ny * m, nz * m, r * 0.6, g * 0.6, LEAF, b * 0.6);
      o.push(tx, ty, tz, nx * m, ny * m, nz * m, r, g, LEAF, b);
    }
    [x, y, z] = [x1, y1, z1];
  }
};

/**
 * A coconut palm, its foot at (x, y, z), r there, seed s: a ringed trunk that leaves the ground
 * upright (what a runner touches is where the map has it) and leans (lx, lz) by its top, a crown
 * of fronds in three tiers, the lowest hanging. Level 2 is the first row's, with coconuts; 1 the
 * rows behind; 0 the back of the forest. `detail` is how finely it is drawn, its shape staying
 * that of `lod`: 0 the far palm (few fronds and leaflets, no coconut), drawn past GROVE_NEAR, in
 * place of the same palm at its own level (render.ts).
 */
export const palm = (
  o: number[],
  x: number,
  y: number,
  z: number,
  r: number,
  s: number,
  lod: number,
  lx: number,
  lz: number,
  detail = lod,
  size = 1,
) => {
  const h = (k: number) => hash(s, k, 77);
  // `size` scales a young palm down: its height, its fronds' length and a little their width.
  const tall = (8 + 5 * h(1) + (2 - lod)) * size;
  const n = [2, 6, 8][detail];
  const at = (t: number): Vec3 => [x + lx * t * t, y + tall * t, z + lz * t * t];
  for (let k = 0; k < n; k++) {
    const t = k / n;
    const w = r * (0.62 + 0.38 * (1 - t) * (1 - t));
    const tone = k % 2 ? 0.8 : 1;
    segment(
      o,
      BOLE[detail],
      at(t),
      at(t + 1 / n),
      [1, 0, 0],
      1,
      w,
      BARK.map(v => v * tone),
    );
  }
  const top = at(1);
  const fronds = [8, 10, 12][detail];
  for (let i = 0; i < fronds; i++) {
    frond(
      o,
      top,
      (TAU * (i + 0.6 * h(10 + i))) / fronds,
      [1.15, 0.55, -0.05][i % 3] + 0.3 * h(30 + i),
      (3.8 + h(50 + i) + (2 - lod) * 0.3) * (0.3 + 0.7 * size),
      // Narrow leaflets (the user's GPU, 2026-11-27: a crown's pixels are what a forest costs).
      0.75 * (0.8 + (2 - lod) * 0.15) * (0.6 + 0.4 * size),
      [4, 6, 10][detail],
      FROND[i % 3],
    );
  }
  // In the first row, one or two dead fronds hanging brown under the crown.
  for (let i = 0; detail > 1 && i < 1 + Math.floor(2 * h(80)); i++) {
    frond(
      o,
      top,
      TAU * h(81 + i),
      -0.9,
      3 + h(83 + i),
      0.6,
      5,
      DRY.map(v => v * 2.2),
    );
  }
  for (let i = 0; detail > 1 && i < 5; i++) {
    const a = TAU * (i / 3 + h(70));
    place(
      o,
      BLOB[0],
      [top[0] + 0.24 * Math.cos(a), top[1] - 0.3, top[2] + 0.24 * Math.sin(a)],
      UP,
      [0, 0, 0],
      0.17,
      HUSK,
    );
  }
};

/** A rosette of feathers on the ground: a fern (`big` 0), or the broad leaves of a banana plant. */
export const fern = (
  o: number[],
  x: number,
  y: number,
  z: number,
  s: number,
  big: number,
  n = big ? 7 : 12,
  steps = big ? 8 : 7,
) => {
  const h = (k: number) => hash(s, k, 79);
  // A fern's fronds many and fine (the user, 2026-11-27): narrow leaflets, many to a frond.
  for (let i = 0; i < n; i++) {
    frond(
      o,
      [x, y + 0.1 + 0.3 * big, z],
      (TAU * (i + h(i))) / n,
      1 + 0.3 * big + 0.3 * h(10 + i),
      (1.1 + 0.5 * h(20 + i)) * (1 + 1.3 * big),
      big ? 0.45 : 0.11,
      steps,
      FROND[(i + big) % 2],
    );
  }
};
