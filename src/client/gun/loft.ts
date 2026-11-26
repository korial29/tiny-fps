// Loft helpers shared by the gun models: the rings of a tube and how a vertex is painted.
import { TAU } from '../../shared/physics';
import type { Vec3 } from '../mesh';
import type { Out } from '../verts';

/** A ring of a loft: how far ahead, how high, half width, half height, and the offset to the side. */
export type Station = [f: number, y: number, a: number, b: number, x?: number];
/** The colour of a vertex from its place and normal: [r, g, layer, b]. */
export type Paint = (p: Vec3, n: Vec3) => number[];

export const sgn = (v: number) => Math.sign(v) * Math.abs(v) ** 0.8;
export const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);
export const clamp = (v: number) => Math.min(Math.max(v, 0), 1);

/**
 * Appends the tube through `st`: a ring is `n` sides of a superellipse across the spine's side
 * view, a station with no width a point. Triangles with smooth normals, each vertex painted.
 */
/** Vertex `k` of the `n` of station `i`'s ring in tube(). */
export const ring = (st: Station[], i: number, k: number, n: number): Vec3 => {
  const [f, y, a, b, x = 0] = st[i];
  const [p, q] = [st[Math.max(i - 1, 0)], st[Math.min(i + 1, st.length - 1)]];
  const l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
  const [tf, ty] = [(q[0] - p[0]) / l, (q[1] - p[1]) / l];
  const [c, s] = [sgn(Math.cos((k * TAU) / n)), sgn(Math.sin((k * TAU) / n))];
  // The ring stands across the spine: its height runs along the spine's normal.
  return [x + a * c, y + b * s * tf, -(f - b * s * ty)];
};

export const tube = (out: Out, st: Station[], n: number, paint: Paint) => {
  const P: Vec3[] = [];
  const N: Vec3[] = [];
  const T: number[] = [];
  const rows = st.map((r, i) =>
    Array.from({ length: r[2] ? n : 1 }, (_, k) => {
      P.push(ring(st, i, k, n));
      N.push([0, 0, 0]);
      return P.length - 1;
    }),
  );
  rows.slice(1).forEach((r1, k) => {
    const r0 = rows[k];
    const mid = [
      (st[k][4] ?? 0) + (st[k + 1][4] ?? 0),
      st[k][1] + st[k + 1][1],
      -st[k][0] - st[k + 1][0],
    ];
    for (let i = 0; i < n; i++) {
      const [p, q, r, s] = [
        r0[i % r0.length],
        r0[(i + 1) % r0.length],
        r1[(i + 1) % r1.length],
        r1[i % r1.length],
      ];
      for (const t of [
        [p, q, r],
        [p, r, s],
      ]) {
        if (new Set(t).size < 3) {
          continue;
        }
        const [u, v] = [1, 2].map(j => [0, 1, 2].map(d => P[t[j]][d] - P[t[0]][d]));
        const f = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        // Wound outward, away from the axis through the middle of the two rings.
        const flip = [0, 1, 2].reduce((d, j) => d + f[j] * (P[t[0]][j] * 2 - mid[j]), 0) < 0;
        T.push(...(flip ? [t[0], t[2], t[1]] : t));
        for (const j of t) {
          [0, 1, 2].forEach(d => (N[j][d] += flip ? -f[d] : f[d]));
        }
      }
    }
  });
  for (const j of T) {
    const l = Math.hypot(...N[j]) || 1;
    const nn = N[j].map(v => v / l) as Vec3;
    out.push(...P[j], ...nn, ...paint(P[j], nn));
  }
};
