import { describe, expect, it } from 'vitest';

import { STRIDE } from '../mesh';
import type { Vec3 } from '../mesh';
import { JOINT as J, rest, solve } from '../rig';

import { FIST_JOINTS, HUNTER_CLAW, HUNTER_HAND, phalanges } from './fingers';
import { hand } from './glove';
import { palmsOf } from './hands';
import { GRAIN_SCALE, HAND_SKIN, hideAt } from './hide';
import { PALM_END } from './palm';
import { HAND_SPOT, HAND_SPOTS } from './spots';

interface Vert {
  at: Vec3;
  c: number[];
  layer: number;
}
/** A hand in its own space (x to the thumb, y the back, z to the fingers): the Hunter's bare one, or a glove. */
const drawn = (curl: number, hunter: boolean): Vert[] => {
  const out: number[] = [];
  const tint = hunter ? HUNTER_HAND : [0.3, 0.3, 0.3];
  hand(
    out,
    [0, 0, 0],
    [0, 0, 1],
    [0, 1, 0],
    [1, 0, 0],
    curl,
    tint,
    0,
    0,
    undefined,
    hunter ? tint : [0.8, 0.6, 0.5],
    0,
    false,
    false,
    hunter ? 'short' : false,
  );
  return Array.from({ length: out.length / STRIDE }, (_, i) => ({
    at: out.slice(i * STRIDE, i * STRIDE + 3) as Vec3,
    c: [out[i * STRIDE + 6], out[i * STRIDE + 7], out[i * STRIDE + 9]],
    layer: out[i * STRIDE + 8],
  }));
};
const of = (v: Vert[], c: number[]) =>
  v.filter(q => q.c.every((n, i) => Math.abs(n - c[i]) < 1e-9));

describe('a more real hand (the user, 2026-11-26)', () => {
  it('closes into a square fist past a grip: the first bone at a right angle to the back of the hand', () => {
    for (let i = 0; i < 4; i++) {
      // A grip, 0.9, is what it was: the first bone 99 degrees off the line of the hand.
      const [grip] = phalanges(0.9, i);
      expect(Math.atan2(-grip[1], grip[2])).toBeCloseTo(0.1 + 1.81 * 0.9, 6);
      const [first, second, third] = phalanges(1, i);
      expect(Math.atan2(-first[1], first[2])).toBeCloseTo(FIST_JOINTS[0], 6);
      expect(Math.abs(first[2])).toBeLessThan(0.06);
      // The two joints beyond close further, the tip back toward the wrist and up into the palm.
      expect(second[2]).toBeLessThan(-0.95);
      expect(third[1]).toBeGreaterThan(0);
    }
  });

  it('gives the Hunter long pointed nails, well past his fingertips, where a glove has short ones', () => {
    const v = drawn(0, true);
    const nails = of(v, HUNTER_CLAW);
    const skin = v.filter(q => q.layer == HAND_SKIN);
    expect(nails.length).toBeGreaterThan(5 * 100);
    expect(
      Math.max(...nails.map(q => q.at[2])) - Math.max(...skin.map(q => q.at[2])),
    ).toBeGreaterThan(0.012);
    expect(of(drawn(0, false), HUNTER_CLAW)).toHaveLength(0);
  });

  it('lays his hide’s spots along the edges of his hand, each with its twin across the middle', () => {
    const spots = of(drawn(0, true), HAND_SPOT);
    expect(spots.length).toBeGreaterThan(80 * 12 - 1);
    // Twelve vertices a spot, each drawn with its twin after it: the same way along the hand,
    // as far from its middle on the other side.
    const middles = Array.from({ length: spots.length / 12 }, (_, i) =>
      [0, 1, 2].map(k => spots.slice(i * 12, i * 12 + 12).reduce((n, q) => n + q.at[k], 0) / 12),
    );
    const back = middles.filter(m => m[2] < PALM_END);
    expect(back.length).toBe(2 * HAND_SPOTS.back);
    for (let i = 0; i < back.length; i += 2) {
      const [a, b] = [back[i], back[i + 1]];
      expect(a[0] + b[0]).toBeCloseTo(0, 2);
      expect(a[2]).toBeCloseTo(b[2], 2);
      // On the back of the hand, off its middle line.
      expect(Math.abs(a[0])).toBeGreaterThan(0.004);
      expect(a[1]).toBeGreaterThan(-0.012);
    }
    // None on a glove.
    expect(of(drawn(0, false), HAND_SPOT)).toHaveLength(0);
  });

  it('colours his hand lighter down its middle and plain at the wrist, with a grain from place to place', () => {
    const [mid, edge, wrist, a, b] = [
      [0, 0.01, 0.05],
      [0.04, 0.01, 0.05],
      [0, 0.01, 0],
      [0.01, 0.01, 0.04],
      [0.012, 0.01, 0.043],
    ].map(([x, y, z]) => {
      const into = [0, 1];
      hideAt(into, x, y, z);
      return into;
    });
    expect(mid[0]).toBeGreaterThan(0.4);
    expect(edge[0]).toBeLessThan(mid[0] * 0.3);
    expect(wrist[0]).toBe(0);
    expect(a[1]).not.toBeCloseTo(b[1], 3);
    for (const [, k] of [mid, edge, wrist, a, b]) {
      expect(k).toBeGreaterThan(0.6);
      expect(k).toBeLessThan(1.25);
    }
  });

  it('puts his skin on the shader’s skin pass, and leaves a glove on the plain layer', () => {
    const skin = drawn(0.5, true).filter(q => q.layer == HAND_SKIN);
    expect(skin.length).toBeGreaterThan(5000);
    expect(drawn(0.5, false).some(q => q.layer == HAND_SKIN)).toBe(false);
  });

  it('tells the shader where the hands are: the world to each hand’s own space', () => {
    const s = solve(rest());
    const into = new Float32Array(32);
    palmsOf(s, into);
    [J.HAND_L, J.HAND_R].forEach((j, i) => {
      const m = into.subarray(i * 16, i * 16 + 16);
      const to = (p: Vec3) =>
        [0, 1, 2].map(r => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r]);
      // The wrist is its origin, and a step along the fingers (down the arm at rest) its z.
      const w = s.pos[j];
      to(w).forEach(c => expect(c).toBeCloseTo(0, 5));
      const along = to([w[0], w[1] - 0.1, w[2]]);
      expect(Math.hypot(...along)).toBeCloseTo(0.1 * GRAIN_SCALE, 5);
      expect(along[2]).toBeGreaterThan(0.09 * GRAIN_SCALE);
    });
  });
});
