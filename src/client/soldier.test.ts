import { describe, expect, it } from 'vitest';
import { STILL } from '../shared/physics';
import { PLAYER_H, PLAYER_R } from '../shared/constants';
import type { PlayerState } from '../shared/types';
import { SKIN, SOLE } from './figure';
import { STRIDE } from './mesh';
import { follow, pace, soldier } from './soldier';
import type { Gait } from './soldier';

const build = (f: (out: number[]) => void) => {
  const out: number[] = [];
  f(out);
  return out;
};
/** Vertices `from` to `to` of a model, as [x, y, z, layer, r] after the position and normal. */
const rows = (v: number[], from = 0, to = v.length / STRIDE) =>
  Array.from({ length: to - from }, (_, i) => {
    const k = (from + i) * STRIDE;
    return [v[k], v[k + 1], v[k + 2], v[k + 8], v[k + 6], v[k + 7], v[k + 9]];
  });
const mean = (v: number[][], i: number) => v.reduce((s, p) => s + p[i], 0) / v.length;
describe('follow', () => {
  const step = (book: Map<number, Gait>, x: number, dt = 1 / 60) => follow(book, 1, x, 0, dt);

  it('adds up the distance, and a jump of metres is not a walk', () => {
    const book = new Map<number, Gait>();
    step(book, 0);
    step(book, 0.3);
    expect(step(book, 0.5).walked).toBeCloseTo(0.5);
    expect(step(book, 40).walked).toBeCloseTo(0.5);
    expect(step(book, 40.2).walked).toBeCloseTo(0.7);
  });

  it('eases toward the speed it is going, and back to rest', () => {
    const book = new Map<number, Gait>();
    let x = 0;
    for (let i = 0; i < 30; i++) {
      step(book, (x += 0.05));
    }
    expect(pace(book.get(1)!)).toBe(1);
    for (let i = 0; i < 60; i++) {
      step(book, x);
    }
    expect(pace(book.get(1)!)).toBeLessThan(0.01);
  });

  it('keeps the speed when no time has passed', () => {
    const book = new Map<number, Gait>();
    step(book, 0);
    step(book, 0.05);
    const v = book.get(1)!.vx;
    step(book, 0.1, 0);
    expect(book.get(1)!.vx).toBe(v);
  });
});

describe('soldier', () => {
  const man = (o: Partial<PlayerState> = {}): PlayerState => ({
    id: 1,
    x: 5,
    y: 1,
    z: -3,
    vy: 0,
    yaw: 0,
    pitch: 0,
    ground: true,
    ...STILL,
    ...o,
  });
  const GREEN = [0.1, 0.8, 0.2];
  const dressed = (o?: Partial<PlayerState>, d = 0, pc = 1, lod?: number) =>
    build(out => soldier(out, man(o), GREEN, d, pc, lod));
  /** The rows of one flat colour: the jacket, the skin, the soles of the shoes. */
  const dyed = (v: number[][], c: number[]) =>
    v.filter(p => p[4] == c[0] && p[5] == c[1] && p[6] == c[2]);
  /** Hands, the skin away from the middle: the head and the neck are on it. */
  const hands = (v: number[][], side: number) =>
    dyed(v, SKIN).filter(p => p[1] < 1 + 1.35 && (p[0] - 5) * side > 0.12);
  const soles = (v: number[][], side: number) => dyed(v, SOLE).filter(p => (p[0] - 5) * side > 0);

  it('stays under 2500 vertices near and about half of that far, as whole triangles', () => {
    const [near, far] = [1, 0].map(lod => dressed(undefined, 0.7, 1, lod).length / STRIDE);
    expect(near).toBeLessThan(2500);
    expect(near).toBeGreaterThan(1500);
    expect(far).toBeLessThan(near * 0.5);
    expect(near % 3).toBe(0);
    expect(far % 3).toBe(0);
    // The number does not depend on the pose, only on the level.
    expect(dressed({ yaw: 2 }, 3.3, 0.4).length / STRIDE).toBe(near);
  });

  it('has finite vertices and unit normals', () => {
    for (const lod of [0, 1]) {
      const v = dressed({ yaw: 1 }, 0.9, 1, lod);
      for (let i = 0; i < v.length; i += STRIDE) {
        expect(v.slice(i, i + STRIDE).every(Number.isFinite)).toBe(true);
        expect(Math.hypot(v[i + 3], v[i + 4], v[i + 5])).toBeCloseTo(1);
      }
    }
  });

  it('stands PLAYER_H tall on its feet, all inside PLAYER_R when standing, at every level', () => {
    for (const lod of [0, 1]) {
      const v = rows(dressed(undefined, 0, 0, lod));
      expect(Math.min(...v.map(p => p[1]))).toBeCloseTo(1, 1);
      expect(Math.max(...v.map(p => p[1]))).toBeCloseTo(1 + PLAYER_H, 1);
      expect(Math.max(...v.map(p => p[1]))).toBeLessThanOrEqual(1 + PLAYER_H + 1e-6);
      for (const p of v) {
        expect(Math.hypot(p[0] - 5, p[2] + 3)).toBeLessThan(PLAYER_R);
      }
    }
  });

  it('holds nothing: no part sticks out ahead, and nothing glows', () => {
    const v = rows(dressed(undefined, 0, 0));
    // Forward is -z at yaw 0: only the toes of the shoes reach past the body.
    expect(Math.max(...v.map(p => -3 - p[2]))).toBeLessThan(0.25);
    expect(v.every(p => p[3] == -1)).toBe(true);
    // The hands hang at the sides, level with the hips, no longer than a forearm from them.
    for (const side of [-1, 1]) {
      const h = hands(v, side);
      expect(h.length).toBeGreaterThan(0);
      expect(Math.max(...h.map(p => p[1]))).toBeLessThan(1 + 0.95);
      expect(Math.max(...h.map(p => Math.abs(p[2] + 3)))).toBeLessThan(0.15);
    }
  });

  it('is a runner: the jacket in the colour, dark trousers, skin, hair and light shoes', () => {
    const v = rows(dressed());
    const jacket = dyed(v, GREEN);
    // The torso and the sleeves, from the hips to the shoulders, and nothing on the legs.
    expect(jacket.length).toBeGreaterThan(300);
    expect(Math.min(...jacket.map(p => p[1]))).toBeGreaterThan(1 + 0.6);
    expect(Math.max(...jacket.map(p => p[1]))).toBeLessThan(1 + 1.55);
    const legs = v.filter(p => p[1] < 1 + 0.8);
    expect(dyed(legs, GREEN)).toHaveLength(0);
    // Trousers are the darkest of the lot.
    const dark = legs.filter(p => p[4] + p[5] + p[6] < 0.6);
    expect(dark.length).toBeGreaterThan(300);
    expect(dyed(v, SKIN).length).toBeGreaterThan(100);
    expect(dyed(v, SOLE).length).toBeGreaterThan(30);
    // The head: skin and hair, above the neck, in front of the eyes' shades.
    const head = v.filter(p => p[1] > 1 + 1.55);
    expect(head.length).toBeGreaterThan(100);
    expect(dyed(head, SKIN).length).toBeGreaterThan(30);
    expect(head.some(p => p[4] + p[5] + p[6] < 0.35)).toBe(true);
    expect(dyed(head, GREEN)).toHaveLength(0);
  });

  it('strides with the distance walked, not when standing, and repeats each stride', () => {
    const foot = (d: number, pc = 1, side = 1) =>
      mean(soles(rows(dressed(undefined, d, pc)), side), 2);
    // The left leg goes forward (-z) first, the right one back.
    expect(foot(0.2, 1, -1)).toBeLessThan(foot(0, 1, -1) - 0.1);
    expect(foot(0.2, 1, 1)).toBeGreaterThan(foot(0, 1, 1) + 0.1);
    expect(dressed(undefined, 0.77, 0)).toEqual(dressed(undefined, 0, 0));
    expect(dressed(undefined, 0.77)).not.toEqual(dressed(undefined, 0));
    const stride = (2 * Math.PI) / 3.6;
    expect(foot(1.17 + stride)).toBeCloseTo(foot(1.17), 6);
    expect(foot(1.17 + stride / 2)).not.toBeCloseTo(foot(1.17), 1);
  });

  it('swings each arm against the leg on its side, and bends the elbows with speed', () => {
    const hand = (side: number, d: number, pc = 1) =>
      mean(hands(rows(dressed(undefined, d, pc)), side), 2);
    const foot = (side: number, d: number) => mean(soles(rows(dressed(undefined, d)), side), 2);
    // At rest they hang straight, not out ahead.
    expect(Math.abs(hand(1, 0, 0) + 3)).toBeLessThan(0.1);
    expect(Math.abs(hand(-1, 0, 0) + 3)).toBeLessThan(0.1);
    for (const side of [-1, 1]) {
      const [dh, df] = [hand(side, 0.2) - hand(side, 0), foot(side, 0.2) - foot(side, 0)];
      expect(Math.abs(dh)).toBeGreaterThan(0.05);
      expect(dh * df).toBeLessThan(0);
    }
    // The two arms swing against each other.
    expect((hand(1, 0.2) - hand(1, 0)) * (hand(-1, 0.2) - hand(-1, 0))).toBeLessThan(0);
    // A runner's hands come up with the elbows.
    const level = (pc: number) => mean(hands(rows(dressed(undefined, 0, pc)), 1), 1);
    expect(level(1)).toBeGreaterThan(level(0) + 0.1);
  });

  it('turns with its yaw: the shades, at the front of the face, go where it looks', () => {
    // The darkest thing there is, ahead of the head's middle.
    const shades = (yaw: number) =>
      rows(dressed({ yaw }, 0, 0)).filter(p => p[1] > 1 + 1.55 && p[4] + p[5] + p[6] < 0.15);
    const [a, b] = [shades(0), shades(Math.PI / 2)];
    expect(a.length).toBeGreaterThan(10);
    expect(mean(a, 2) + 3).toBeLessThan(-0.05);
    expect(Math.abs(mean(a, 0) - 5)).toBeLessThan(0.01);
    expect(mean(b, 0) - 5).toBeLessThan(-0.05);
    expect(Math.abs(mean(b, 2) + 3)).toBeLessThan(0.01);
  });
});
