import { TEX } from '../../shared/types';
import { TARP } from '../paint';
import type { Mat, V } from './types';
import { cross, gy, ink, put, sub, tex, unit } from './common';

/** The poles: weathered wood, the grain up them. */
const POLE = tex(TEX.WOOD, 1.1, 0.5, true);
/** The guy ropes: pale cord. */
const CORD = ink([0.62, 0.58, 0.5]);

/**
 * A strand from a to b, w from its axis: a quad for each pair of angles round it, from one to the
 * other, turned out. Three sides make a mast; two ribbons crossed, a rope.
 */
const strand = (a: V, b: V, w: number, m: Mat, turns: number[][]) => {
  const d = unit(sub(b, a));
  const s = unit(cross(d, Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]));
  const u = cross(s, d);
  const at = (t: number) => s.map((v, k) => (v * Math.cos(t) + u[k] * Math.sin(t)) * w);
  for (const [t0, t1] of turns) {
    const [r, q] = [at(t0), at(t1)];
    const n = unit(cross(d, sub(q, r)));
    const [p0, p1, q0, q1] = [
      a.map((v, k) => v + r[k]),
      b.map((v, k) => v + r[k]),
      a.map((v, k) => v + q[k]),
      b.map((v, k) => v + q[k]),
    ];
    for (const p of [p0, p1, q1, p0, q1, q0]) {
      put(p, n, m, 1);
    }
  }
};
const T = (2 * Math.PI) / 3;
const mast = (a: V, b: V) =>
  strand(a, b, 0.09, POLE, [
    [0, T],
    [T, 2 * T],
    [2 * T, 0],
  ]);
const rope = (a: V, b: V) =>
  strand(a, b, 0.0175, CORD, [
    [0, Math.PI],
    [Math.PI / 2, -Math.PI / 2],
  ]);

/** A quadratic edge from p to q through m at its middle. */
const edge = (p: V, m: V, q: V) => {
  const c = m.map((v, k) => 2 * v - (p[k] + q[k]) / 2);
  return (t: number) => p.map((v, k) => (1 - t) ** 2 * v + 2 * t * (1 - t) * c[k] + t * t * q[k]);
};

/**
 * A stretch tent over the box a to b (its top the roof's walkable top): four wooden masts leaning
 * out at the corners, two high and two lower across the diagonals; the cloth stretched between
 * their tips, its edges cut in arcs and pulled down at their middles by ropes to the sand, its
 * middle lifted a little; a rope from each mast's tip out to two stakes. `s` mirrors blue's.
 */
export const tent = (a: V, b: V, t: V, s: number) => {
  const [cx, cz, top] = [(a[0] + b[0]) / 2, (a[2] + b[2]) / 2, b[1]];
  const [px, pz] = [(b[0] - a[0]) / 2 - 0.1, (b[2] - a[2]) / 2 - 0.1];
  const tip = (i: number, j: number) => [
    cx + i * (px + 0.35),
    top + (i * j * s > 0 ? 0.75 : 0.25),
    cz + j * (pz + 0.3),
  ];
  // The masts, each poking out over the cloth; the guys from their tips.
  for (const i of [-1, 1]) {
    for (const j of [-1, 1]) {
      const [x, z] = [cx + i * px, cz + j * pz];
      const p = tip(i, j);
      const head = [p[0] + i * 0.03, p[1] + 0.2, p[2] + j * 0.03];
      // In two lengths on one line: the first, 0.45 m out of the sand, still within its pole's box.
      const foot = [x, gy(x, z) - 0.3, z];
      const k = 0.75 / (head[1] - foot[1]);
      const knee = foot.map((v, n) => v + (head[n] - v) * k);
      mast(foot, knee);
      mast(knee, head);
      for (const [di, dj] of [
        [2.3, 0.7],
        [0.7, 2.3],
      ]) {
        const [sx, sz] = [p[0] + i * di, p[2] + j * dj];
        rope(
          head.map((v, k) => (k == 1 ? v - 0.05 : v)),
          [sx, gy(sx, sz) - 0.05, sz],
        );
      }
    }
  }
  // The edges: their middles drawn in and down, each held by a rope out to the sand.
  const mids = {
    x: [-1, 1].map(i => [cx + i * (px + 0.35 - 0.4), top - 0.45, cz]),
    z: [-1, 1].map(j => [cx, top - 0.6, cz + j * (pz + 0.3 - 0.5)]),
  };
  mids.x.forEach((m, k) => {
    const sx = cx + (2 * k - 1) * (px + 2.4);
    rope(m, [sx, gy(sx, cz) - 0.05, cz]);
  });
  mids.z.forEach((m, k) => {
    const sz = cz + (2 * k - 1) * (pz + 2.6);
    rope(m, [cx, gy(cx, sz) - 0.05, sz]);
  });
  const [P00, P10, P01, P11] = [tip(-1, -1), tip(1, -1), tip(-1, 1), tip(1, 1)];
  const E0 = edge(P00, mids.z[0], P10);
  const E1 = edge(P01, mids.z[1], P11);
  const F0 = edge(P00, mids.x[0], P01);
  const F1 = edge(P10, mids.x[1], P11);
  // Coons' patch of the four edges, then its middle lifted to `peak`.
  const coons = (u: number, v: number) => {
    const [e0, e1, f0, f1] = [E0(u), E1(u), F0(v), F1(v)];
    return [0, 1, 2].map(
      k =>
        (1 - v) * e0[k] +
        v * e1[k] +
        (1 - u) * f0[k] +
        u * f1[k] -
        ((1 - u) * (1 - v) * P00[k] + u * (1 - v) * P10[k] + (1 - u) * v * P01[k] + u * v * P11[k]),
    );
  };
  const lift = top + 0.45 - coons(0.5, 0.5)[1];
  const at = (u: number, v: number) => {
    const p = coons(u, v);
    p[1] += lift * (Math.sin(Math.PI * u) * Math.sin(Math.PI * v)) ** 1.5;
    return p;
  };
  const [I, J] = [8, 6];
  const grid = Array.from({ length: I + 1 }, (_, i) =>
    Array.from({ length: J + 1 }, (_, j) => at(i / I, j / J)),
  );
  const normal = (i: number, j: number) => {
    const du = sub(grid[Math.min(i + 1, I)][j], grid[Math.max(i - 1, 0)][j]);
    const dv = sub(grid[i][Math.min(j + 1, J)], grid[i][Math.max(j - 1, 0)]);
    const n = unit(cross(dv, du));
    return n[1] < 0 ? n.map(v => -v) : n;
  };
  const m = ink(t, 0.8, TARP);
  // Each face twice, one lit from each side, the underside a hair below.
  for (const d of [0, 0.03]) {
    for (let i = 0; i < I; i++) {
      for (let j = 0; j < J; j++) {
        for (const [di, dj] of [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
          [1, 1],
          [0, 1],
        ]) {
          const n = normal(i + di, j + dj);
          const p = grid[i + di][j + dj];
          put([p[0], p[1] - d, p[2]], d ? n.map(v => -v) : n, m, 1);
        }
      }
    }
  }
};
