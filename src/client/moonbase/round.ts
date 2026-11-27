// Softer shapes for the moon base's kit (the user, 2026-11-27: less square, lit buttons): a box with
// bevelled edges, glowing discs whose light falls from the middle to the rim, and halos round them.
import { face } from '../brick';
import type { Vec3 } from '../mesh';
import type { Out } from '../verts';
import { INDOORS } from './constants';

/**
 * A box of one colour from lo to hi, its twelve edges cut at 45 degrees `c` deep (at most a third of
 * its thinnest side): six faces, twelve bevels and eight corners, each shaded by where it looks once
 * inside() moves it indoors, so the edges catch a lighter or darker line.
 */
export const bevel = (o: Out, lo: Vec3, hi: Vec3, rgb: number[], c: number) => {
  const d = Math.min(c, ...hi.map((h, i) => (h - lo[i]) / 3));
  const mid = lo.map((v, i) => (v + hi[i]) / 2) as Vec3;
  /** The point of the corner with sides s (bits 1 x, 2 y, 4 z) that lies on its face across the axis k. */
  const p = (s: number, k: number): Vec3 =>
    [0, 1, 2].map(i => {
      const high = (s >> i) & 1;
      const at = high ? hi[i] : lo[i];
      return i == k ? at : at + (high ? -d : d);
    }) as Vec3;
  for (let k = 0; k < 3; k++) {
    const [a, b] = [1 << ((k + 1) % 3), 1 << ((k + 2) % 3)];
    for (const side of [0, 1 << k]) {
      face(
        o,
        [side, side | a, side | a | b, side | b].map(s => p(s, k)),
        rgb,
        mid,
      );
    }
    // The four bevels along the axis k: between the faces across the two other axes.
    const [i, j] = [(k + 1) % 3, (k + 2) % 3];
    for (const s of [0, a, b, a | b]) {
      face(o, [p(s, i), p(s, j), p(s | (1 << k), j), p(s | (1 << k), i)], rgb, mid);
    }
  }
  for (let s = 0; s < 8; s++) {
    face(o, [p(s, 0), p(s, 1), p(s, 2)], rgb, mid);
  }
};

/** One glowing vertex indoors: (r, g, -2, b) is the glow's layer. */
const put = (o: Out, p: Vec3, [r, g, b]: number[]) => o.push(...p, ...INDOORS, r, g, -2, b);

/**
 * A glowing ring round `at` in the plane of the unit axes a and b, from radius r0 (colour c0) to r1
 * (colour c1), facing a × b; r0 0 makes it a disc. With `half`, a bar with round ends: the ring is
 * drawn round the segment `half` either side of `at` along a, each end a half circle of n / 2 sides.
 */
export const ring = (
  o: Out,
  at: Vec3,
  a: Vec3,
  b: Vec3,
  [r0, r1]: number[],
  c0: number[],
  c1: number[],
  n = 12,
  half = 0,
) => {
  // Round the outline: each point's way out from the segment, and the end it turns about.
  const m = half > 0 ? n / 2 : n;
  const way = Array.from({ length: half > 0 ? 2 * (m + 1) : n + 1 }, (_, t) => {
    const end = half > 0 ? (t <= m ? 1 : -1) : 0;
    const th =
      half > 0 ? ((t <= m ? t : t - m - 1) / m) * Math.PI - Math.PI / 2 : (t / n) * 2 * Math.PI;
    return [end, end < 0 ? Math.PI + th : th];
  });
  if (half > 0) {
    way.push(way[0]);
  }
  const P = ([end, th]: number[], r: number): Vec3 => {
    const [x, y] = [end * half + Math.cos(th) * r, Math.sin(th) * r];
    return [0, 1, 2].map(i => at[i] + a[i] * x + b[i] * y) as Vec3;
  };
  for (let t = 0; t + 1 < way.length; t++) {
    const [p, q] = [way[t], way[t + 1]];
    const tris: [Vec3, number[]][] = [
      [P(p, r0), c0],
      [P(p, r1), c1],
      [P(q, r1), c1],
    ];
    if (r0 > 0 || p[0] != q[0]) {
      tris.push([P(p, r0), c0], [P(q, r1), c1], [P(q, r0), c0]);
    }
    for (const [v, c] of tris) {
      put(o, v, c);
    }
  }
};
