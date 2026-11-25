// The rounded stones of Tranquility's rocks and pebbles (moonscape.ts) and of Landfall's headlands
// (jungle.ts): apart, so that Landfall's chunk does not carry the moon's scenery.
import { TEX } from '../shared/types';
import { cross } from './brick';
import { sub, unit } from './mesh';
import type { Vec3 } from './mesh';

const sm = (t: number) => {
  t = Math.min(Math.max(t, 0), 1);
  return t * t * (3 - 2 * t);
};

/** A unit sphere as triangles of one size and shape: an icosahedron with each edge cut in f (20 * f * f triangles). No pole, no sliver. */
const ico = (f: number): Vec3[][] => {
  const g = (1 + Math.sqrt(5)) / 2;
  const v = [
    [-1, g, 0],
    [1, g, 0],
    [-1, -g, 0],
    [1, -g, 0],
    [0, -1, g],
    [0, 1, g],
    [0, -1, -g],
    [0, 1, -g],
    [g, 0, -1],
    [g, 0, 1],
    [-g, 0, -1],
    [-g, 0, 1],
  ].map(p => unit(p as Vec3));
  const t = [
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
  ].map(q => q.map(k => v[k]));
  return t.flatMap(([a, b, c]) => {
    const at = (i: number, j: number) =>
      unit(a.map((p, k) => p + ((b[k] - p) * i + (c[k] - p) * j) / f) as Vec3);
    const out: Vec3[][] = [];
    for (let i = 0; i < f; i++) {
      for (let j = 0; i + j < f; j++) {
        out.push([at(i, j), at(i + 1, j), at(i, j + 1)]);
        if (i + j < f - 1) {
          out.push([at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)]);
        }
      }
    }
    return out;
  });
};
/** The spheres by how fine: 20, 80, 180, 320 and 720 triangles. */
const ICO = [1, 2, 3, 4, 6].map(ico);

/**
 * A rounded stone, smooth: the sphere ICO[lod - 1] (or the triangles given) thrown onto a form from its middle (`pt` gives
 * the point for a unit vector), each point's normal the mean of the faces round it, so it shades
 * as one rounded mass with no facet. One tone a stone, darker at the foot (from `g` up a third of
 * the way to `top`); what is wholly under the ground (`floor`, if given) is not drawn.
 */
export const stone = (
  o: number[],
  lod: number | Vec3[][],
  pt: (u: Vec3) => Vec3,
  g: number,
  top: number,
  s: number,
  shade: number,
  floor?: (x: number, z: number) => number,
) => {
  const key = (u: Vec3) => u.map(c => Math.round(c * 1e4)).join();
  const at = new Map<string, { p: Vec3; n: Vec3; low: boolean }>();
  const tris = (typeof lod === 'number' ? ICO[lod - 1] : lod).map(t =>
    t.map(u => {
      const k = key(u);
      let v = at.get(k);
      if (!v) {
        const p = pt(u);
        v = { p, n: [0, 0, 0], low: floor ? p[1] < floor(p[0], p[2]) - 0.05 : false };
        at.set(k, v);
      }
      return v;
    }),
  );
  for (const t of tris) {
    // Not normalised: a larger face weighs more.
    const n = cross(sub(t[1].p, t[0].p), sub(t[2].p, t[0].p));
    t.forEach(v => (v.n = [v.n[0] + n[0], v.n[1] + n[1], v.n[2] + n[2]]));
  }
  for (const t of tris) {
    if (t.every(v => v.low)) {
      continue;
    }
    const f = cross(sub(t[1].p, t[0].p), sub(t[2].p, t[0].p));
    // The texture along the face's main plane.
    const flat = Math.abs(f[1]) > Math.max(Math.abs(f[0]), Math.abs(f[2]));
    const side = Math.abs(f[0]) > Math.abs(f[2]);
    for (const { p, n } of t) {
      const m: Vec3 = Math.hypot(...n) > 1e-12 ? unit(n) : [0, 1, 0];
      o.push(
        ...p,
        ...m,
        ...(flat ? [p[0], p[2]] : side ? [p[2] + 3 * s, p[1]] : [p[0] + 3 * s, p[1]]),
        TEX.ROCK,
        0.85 * shade * (0.55 + 0.45 * sm((p[1] - g) / (0.3 * (top - g)))),
      );
    }
  }
};
