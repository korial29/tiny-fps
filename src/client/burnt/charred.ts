// Charred wood (docs/BEACH.md): the trunks the crash broke and the fire burnt round the wreck's
// nose. Faceted on purpose: each ring's points stand in or out at random and every triangle keeps
// its own normal and shade, so the light breaks on it as on charcoal's cracked blocks. Lit paint.
import { TAU } from '../../shared/physics';
import { hash } from '../../shared/relief';
import { BARK, onLayer } from '../foliage/layers';
import { aim, dress, segment, smooth, unit } from '../mesh';
import type { Vec3 } from '../mesh';

/** Points round a ring. */
const SIDES = 7;
/** A spike, 1 long and 1 wide at its foot: a splinter at a break, or a bare branch. */
export const SPIKE = onLayer(
  dress(
    smooth(
      [
        [1, 0],
        [0, 1],
      ],
      3,
    ),
    [1, 1, 1],
  ),
  BARK,
);
/** Ash, the grey a charred log goes where the fire has done with it. */
export const ASH = [0.15, 0.145, 0.14];

/** Two unit vectors square to the unit `f` and to each other. */
export const across = (f: Vec3): [Vec3, Vec3] => {
  const [p, q] = aim(f, Math.abs(f[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]);
  return [p, q];
};

/** One flat triangle, its normal turned away from `c`, its shade k times `tone`. */
const tri = (o: number[], a: Vec3, b: Vec3, d: Vec3, c: Vec3, tone: number[], k: number) => {
  const [u, v] = [b.map((e, i) => e - a[i]), d.map((e, i) => e - a[i])];
  let n = unit([u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]);
  if (n[0] * (a[0] - c[0]) + n[1] * (a[1] - c[1]) + n[2] * (a[2] - c[2]) < 0) {
    n = n.map(e => -e) as Vec3;
  }
  for (const p of [a, b, d]) {
    o.push(p[0], p[1], p[2], n[0], n[1], n[2], tone[0] * k, tone[1] * k, BARK, tone[2] * k);
  }
};

/**
 * A charred trunk from `a` to `b`: a ring at each [t, radius] of `rings` (t 0 at a, 1 at b), its
 * points jittered in and out, capped at both ends. Seed s.
 */
export const charred = (
  o: number[],
  a: Vec3,
  b: Vec3,
  rings: number[][],
  s: number,
  tone: number[],
) => {
  const f = unit([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
  const [p, q] = across(f);
  const h = (k: number) => hash(s, k, 83);
  const turn = TAU * h(0);
  const pts = rings.map(([t, r], i) => {
    const c = a.map((e, j) => e + (b[j] - e) * t) as Vec3;
    return {
      c,
      ring: Array.from({ length: SIDES }, (_, j) => {
        const g = turn + (TAU * (j + 0.35 * h(1 + i * SIDES + j))) / SIDES;
        const w = r * (0.75 + 0.45 * h(100 + i * SIDES + j));
        return c.map((e, k) => e + w * (Math.cos(g) * p[k] + Math.sin(g) * q[k])) as Vec3;
      }),
    };
  });
  const shade = (k: number) => 0.7 + 0.6 * h(300 + k);
  for (let i = 0; i + 1 < pts.length; i++) {
    const [lo, hi] = [pts[i], pts[i + 1]];
    const c = lo.c.map((e, k) => (e + hi.c[k]) / 2) as Vec3;
    for (let j = 0; j < SIDES; j++) {
      const m = (j + 1) % SIDES;
      tri(o, lo.ring[j], lo.ring[m], hi.ring[m], c, tone, shade(i * 2 * SIDES + 2 * j));
      tri(o, lo.ring[j], hi.ring[m], hi.ring[j], c, tone, shade(i * 2 * SIDES + 2 * j + 1));
    }
  }
  // The ends: a fan, its normal outward (away from a point inside, short of the end).
  for (const [e, k] of [
    [pts[0], 1],
    [pts[pts.length - 1], -1],
  ] as const) {
    const c = e.c.map((v, j) => v + 0.1 * k * f[j]) as Vec3;
    for (let j = 1; j + 1 < SIDES; j++) {
      tri(o, e.ring[0], e.ring[j], e.ring[j + 1], c, tone, 0.6);
    }
  }
};

/**
 * The jagged end of a trunk broken at `at` along the unit `f`, `r` its radius there: three or four
 * splinters round its rim, of all lengths, close to the trunk's line.
 */
export const splinters = (o: number[], at: Vec3, f: Vec3, r: number, s: number, tone: number[]) => {
  const h = (k: number) => hash(s, k, 82);
  const [p, q] = across(f);
  const n = 3 + Math.floor(2 * h(0));
  for (let i = 0; i < n; i++) {
    const t = TAU * (i / n + 0.3 * h(1 + i));
    const [u, v] = [Math.cos(t), Math.sin(t)];
    const w = r * (0.55 - 0.3 * h(9 + i));
    const foot = at.map((e, j) => e + w * (u * p[j] + v * q[j]) - 0.15 * r * f[j]) as Vec3;
    const len = r * (0.6 + 2.6 * h(5 + i) * h(5 + i));
    const tip = foot.map((e, j) => e + len * f[j] + 0.06 * len * (u * p[j] + v * q[j])) as Vec3;
    segment(o, SPIKE, foot, tip, p, 1, r * (0.42 + 0.2 * h(13 + i)), tone);
  }
};
