// Landfall's forest (docs/BEACH.md): the mass of it behind the line, one lumpy sheet, and what grows on it.
import { hash, noise } from '../../shared/relief';
import { EARTH, LEAF } from '../foliage/layers';
import { flowers } from '../foliage/flower';
import { LEN, burn, sm, spot } from './constants';
import type { Ground } from './constants';
import { fern } from './models';

/** How high the forest's mass stands over the ground, d metres behind the line: a wall of leaves at once, then the crowns. */
export const rise = (d: number) =>
  // Low hills of ferns first (the user, 2026-11-27: no wall of green blocks), then the crowns.
  2.5 * sm(d / 6) + 3 * sm((d - 4) / 10) + 8 * sm((d - 8) / 14) + 0.14 * Math.max(d - 18, 0);
/** How far behind the line the far canopy's rows of points are. */
export const ROWS = [
  0, 0.4, 0.8, 1.2, 1.7, 2.3, 3, 3.7, 4.5, 5.5, 6.5, 7.7, 9, 10.2, 11.5, 12.8, 14.2, 15.6, 17, 18.5,
  20, 21.6, 23.2, 25, 27, 29, 31.5, 34, 37, 40, 44, 49, 57, 65, 76, 88, 104, 120,
];
/**
 * The mass of the forest behind the line, one lumpy sheet: it leaves the ground under the line,
 * is the undergrowth's back (some 3 m) within a few metres, the crowns of the trees further in,
 * and climbs inland. Lighter on its lumps than between them, so they read as crowns.
 */
export const canopy = (o: number[], tufts: number[], gy: Ground) => {
  const n = Math.ceil(LEN / 1.25);
  const m = ROWS.length;
  const p = new Float64Array((n + 1) * m * 4);
  /** How burnt each point is: there the sheet is a bank of burnt earth, smooth, not leaves. */
  const burnt = new Float64Array((n + 1) * m);
  for (let i = 0; i <= n; i++) {
    const s = (i / n) * LEN;
    const [bx, bz] = spot(s, 0);
    const g = gy(bx, bz);
    for (let j = 0; j < m; j++) {
      const d = ROWS[j];
      const [x, z, k] = spot(s, d);
      // The small lumps only where the rows are close enough to draw them round (the user,
      // 2026-11-27: rounder hills behind the ferns).
      const lump =
        noise(x / 6, z / 6, 3) -
        0.5 +
        0.5 * (noise(x / 2.3, z / 2.3, 4) - 0.5) * (1 - sm((d - 6) / 8));
      const q = (i * m + j) * 4;
      p[q] = x + (hash(i, j, 61) - 0.5) * Math.min(d, 3) * (0.15 + 0.85 * sm((d - 40) / 20));
      p[q + 2] = z + (hash(i, j, 62) - 0.5) * Math.min(d, 3) * (0.15 + 0.85 * sm((d - 40) / 20));
      // Where it burnt the mass is down on its own ground, not on the line's: ash, under the stumps' feet.
      const b = sm(2.5 * burn(x, z));
      burnt[i * m + j] = sm(3 * burn(x, z, 1.3));
      p[q + 1] =
        g +
        (gy(x, z) - g) * b -
        0.4 +
        k *
          (1 - b) *
          (rise(d) +
            // Hills inland, over the trees' line from the sand.
            40 * sm((d - 25) / 95) * (0.4 + 0.6 * noise(x / 70, z / 70, 5)) +
            // Lumps the size of a crown and a jitter a point, both fading on the far hills, whose points are far apart.
            (lump * Math.min(0.5 + 0.13 * d, 4) +
              (hash(i, j, 63) - 0.5) *
                (1.4 + 0.05 * d) *
                sm((d - 40) / 20) *
                (1 - sm(4 * burn(x, z, 1.3)))) *
              sm(d / 1.5) *
              (1 - 0.8 * sm((d - 50) / 50)));
      // Darker inland: hills of forest, not of grass.
      p[q + 3] =
        (0.4 * (lump / 1.5 + 0.5) + 0.6 * (0.5 + (hash(i, j, 64) - 0.5) * sm((d - 40) / 20))) *
        (1 - 0.5 * sm((d - 20) / 50));
      // On the wall a player sees close up, two sprigs a point: leaves that stick out of it and break its facets.
      // Ferns over the low hills in front, a point each, set off it a little.
      if (k > 0.3 && b < 0.9 && j && j < 8) {
        const r = (c: number) => hash(i, j, 65 + c);
        fern(tufts, p[q] + r(0) - 0.5, p[q + 1] - 0.05, p[q + 2] + r(1) - 0.5, i * 31 + j, 0, 5, 3);
      } else if (k > 0.3 && b < 0.9 && d >= 9 && d < 35 && (d < 24 || (i + j) % 2 == 0)) {
        // Up the slopes behind, smaller ones: a point each, a point in two past 24 m.
        const r = (c: number) => hash(i, j, 65 + c);
        fern(tufts, p[q] + r(0) - 0.5, p[q + 1] - 0.05, p[q + 2] + r(1) - 0.5, i * 31 + j, 0, 4, 3);
      }
      // Red flowers among them, a clump at about one point in three.
      if (k > 0.3 && b < 0.5 && j && d < 30 && hash(i, j, 69) < 0.4) {
        flowers(
          tufts,
          p[q] + hash(i, j, 70) - 0.5,
          p[q + 1] - 0.05,
          p[q + 2] + hash(i, j, 71) - 0.5,
          i * 53 + j,
        );
      }
    }
  }
  // Flat facets, each a green of its own: a mass of leaves, not a lawn. Where it burnt, the
  // facets' normals give way to the point's (the mean of its triangles'), so the bank of burnt
  // earth round the clearing reads as one smooth slope, not as a cliff of shards.
  const node = (i: number, j: number) => (i * m + j) * 4;
  const mean = new Float64Array((n + 1) * m * 3);
  const tris: number[][] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m - 1; j++) {
      const turn = (i + j) & 1;
      const quad = [node(i, j), node(i + 1, j), node(i + 1, j + 1), node(i, j + 1)];
      for (const f of [0, 1]) {
        const [a, b, c] = [quad[turn], quad[turn + 1 + f], quad[(turn + 2 + f) % 4]];
        const [ux, uy, uz] = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]];
        const [vx, vy, vz] = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
        const [nx, ny, nz] = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
        const l = (ny < 0 ? -1 : 1) / (Math.hypot(nx, ny, nz) || 1);
        tris.push([a, b, c, nx * l, ny * l, nz * l]);
        for (const q of [a, b, c]) {
          for (let e = 0; e < 3; e++) {
            mean[(q / 4) * 3 + e] += [nx, ny, nz][e] * l;
          }
        }
      }
    }
  }
  for (const [a, b, c, nx, ny, nz] of tris) {
    const t = (p[a + 3] + p[b + 3] + p[c + 3]) / 3;
    // A layer a triangle: burnt earth where its points burnt, on the whole, else leaves.
    const ly = burnt[a / 4] + burnt[b / 4] + burnt[c / 4] > 1.5 ? EARTH : LEAF;
    for (const q of [a, b, c]) {
      // Smooth too on the wall a player sees close up (the user, 2026-11-27: no big polygons
      // among the ferns), its shade the point's own: the leaves' texture breaks it up instead.
      const w = Math.max(burnt[q / 4], 1 - sm((ROWS[(q / 4) % m] - 50) / 30));
      const s = mean.subarray((q / 4) * 3, (q / 4) * 3 + 3);
      const k = 1 / (Math.hypot(s[0], s[1], s[2]) || 1);
      const v = [nx + (s[0] * k - nx) * w, ny + (s[1] * k - ny) * w, nz + (s[2] * k - nz) * w];
      const u = 1 / (Math.hypot(v[0], v[1], v[2]) || 1);
      const tv = t + (p[q + 3] - t) * w;
      o.push(p[q], p[q + 1], p[q + 2], v[0] * u, v[1] * u, v[2] * u);
      o.push(0.02 + 0.06 * tv, 0.06 + 0.13 * tv, ly, 0.02 + 0.03 * tv);
    }
  }
};
