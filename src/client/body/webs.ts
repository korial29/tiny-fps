import { TAU } from '../../shared/physics';
import { add, mix, sub, unit } from '../mesh';
import type { Vec3 } from '../mesh';

import type { Ring } from './fingers';

/** The rings of a finger the web runs along: its root, its knuckle's two and where its first bone leaves the palm's skin. */
const SPAN = [1, 2, 3, 4];
/** The sides of a finger's root the weld leaves to the web, of ten: those toward its neighbour past these, over the back and under the palm. */
export const WELD_SIDES = [3, 7];

/** How far the skin between two fingers lies under the line from one to the other at each ring of SPAN, metres: the valley between two knuckles, deeper toward the web. */
const VALLEY = [0.0025, 0.0035, 0.004, 0.003];

type W = [Vec3, Vec3];
const cross = ([a, b, c]: Vec3, [d, e, f]: Vec3): Vec3 => [
  b * f - c * e,
  c * d - a * f,
  a * e - b * d,
];
/** Vertex `k` of a ring of `sides`. */
const on = ([c, x, y]: Ring, k: number, sides: number): Vec3 => {
  const a = (k * TAU) / sides;
  return [0, 1, 2].map(i => c[i] + x[i] * Math.cos(a) + y[i] * Math.sin(a)) as Vec3;
};
/**
 * Vertex `k` of the ring `r` of a finger, and the normal its tube gives it there (tube(): across
 * the ring, along the finger from the ring before to the next, the root's from itself), so the
 * web's skin takes the light as the finger does where they meet.
 */
const at = (F: Ring[], r: number, k: number, sides: number): W => {
  const p = on(F[r], k, sides);
  const round = sub(on(F[r], k + 1, sides), on(F[r], k - 1, sides));
  const along = sub(on(F[r + 1], k, sides), on(F[Math.max(r - 1, SPAN[0])], k, sides));
  return [p, unit(cross(round, along))];
};
/**
 * Across the gap between two fingers' rings `A` and `B` (B the further from the thumb): A's vertex
 * `k`, facing B, B's facing A (the mirror of it), and between them the skin's low point, VALLEY
 * under their line.
 */
const row = (
  A: Ring[],
  B: Ring[],
  r: number,
  k: number,
  sides: number,
  drop = VALLEY[0],
): [W, W, W] => {
  const [a, b] = [at(A, r, k, sides), at(B, r, (sides / 2 - k + sides) % sides, sides)];
  const n = unit(add(a[1], b[1]));
  return [a, [add(mix(a[0], b[0], 0.5), n.map(v => v * -drop) as Vec3), n], b];
};
/** The side of a root's ring the webs start on, of `sides`: over the back, or under the palm. */
const side = (sides: number, back: boolean) => Math.round((WELD_SIDES[back ? 0 : 1] * sides) / 10);
/** Where the weld meets the web between the roots' rings `A` and `B`, over the back or under the palm: the web's first low point. */
export const saddle = (A: Ring[], B: Ring[], sides: number, back: boolean): Vec3 =>
  row(A, B, SPAN[0], side(sides, back), sides)[1][0];

/**
 * The skin between each two fingers (the user, 2026-11-26: a more real hand): the palm goes on past
 * the knuckles, over the first 16 mm of the fingers' first bones, where a hand's fingers part. Over
 * the back it slopes down between the two fingers from the knuckles to the web's edge, at mid
 * height; under the palm it runs level; a rounded edge joins the two. Each vertex is turned half to
 * its finger, so the light runs from a finger to the next without a line; the skin bends with the
 * first bones in a fist.
 */
export const webs = (fingers: Ring[][], sides: number, put: (p: Vec3, n: Vec3) => void) => {
  const q = sides / 10;
  /** The side of a ring the skin over the back holds at each ring of SPAN: from the back down the side, to the web's edge at mid height. */
  const OVER = [WELD_SIDES[0] * q, 3 * q, 3 * q, 4 * q].map(Math.round);
  const under = side(sides, false);
  /**
   * Two rows joined, the first's vertices turned `k0` to `n` and the second's `k1`: all three of a
   * row with `all`, or its low point alone, the fingers' vertices keeping their own normal; `flip`
   * for the palm's side.
   */
  const strip = (r0: W[], r1: W[], n: Vec3, k0: number, k1: number, flip = false, all = false) => {
    const e = (r: W[], j: number, k: number): W =>
      all || j == 1 ? [r[j][0], unit(add(r[j][1], n.map(v => v * k) as Vec3))] : r[j];
    for (let j = 1; j < r0.length; j++) {
      const [a0, b0, a1, b1] = [e(r0, j - 1, k0), e(r0, j, k0), e(r1, j - 1, k1), e(r1, j, k1)];
      for (const [p, m] of flip ? [a0, b1, a1, a0, b0, b1] : [a0, a1, b1, a0, b1, b0]) {
        put(p, m);
      }
    }
  };
  for (let i = 0; i + 1 < fingers.length; i++) {
    const [A, B] = [fingers[i], fingers[i + 1]];
    const over = SPAN.map((r, j) => row(A, B, r, OVER[j], sides, VALLEY[j]));
    const last = SPAN.length - 1;
    const slope = unit(
      cross(sub(over[last][0][0], over[0][0][0]), sub(over[0][2][0], over[0][0][0])),
    );
    for (let j = 1; j <= last; j++) {
      strip(over[j - 1], over[j], slope, 0.2 + (0.6 * (j - 1)) / last, 0.2 + (0.6 * j) / last);
    }
    const below = [SPAN[0], SPAN[last]].map(r => row(A, B, r, under, sides));
    strip(below[0], below[1], [0, 0, 0], 0, 0, true);
    // The web's edge: rounded, from the slope over to the palm's side.
    const end = SPAN[last];
    const out = unit(add(sub(A[end][0], A[end - 1][0]), sub(B[end][0], B[end - 1][0])));
    const mid = row(A, B, end, Math.round(5.5 * q), sides);
    strip(over[last], mid, out, 0.8, 1.2, false, true);
    strip(mid, below[1], out, 1.2, 0.6, false, true);
  }
};
