import { describe, expect, it } from 'vitest';
import { FLYER_H, FLYER_R, WALKER_H, WALKER_R } from '../shared/constants';
import { MONSTER } from '../shared/types';
import type { Monster } from '../shared/types';
import { STRIDE } from './mesh';
import { CHUNKS, bullet, flyer, strike, walker } from './monsters';

const mob = (kind: number, o: Partial<Monster> = {}): Monster => ({
  id: 16,
  kind,
  x: 5,
  y: 1,
  z: -3,
  yaw: 0,
  chase: false,
  ...o,
});
const build = (f: (out: number[]) => void) => {
  const out: number[] = [];
  f(out);
  return out;
};
const walked = (d: number, blow = 0, o?: Partial<Monster>) =>
  build(out => walker(out, mob(MONSTER.WALKER, o), d, blow));
/** The vertices from box `from` (36 vertices each) up to box `to`, as [x, y, z, layer, r]. */
const boxes = (v: number[], from: number, to: number) =>
  Array.from({ length: Math.ceil((to - from) * 36) }, (_, i) => {
    const k = (from * 36 + i) * STRIDE;
    return v.slice(k, k + STRIDE);
  });
const rows = (v: number[]) => boxes(v, 0, v.length / STRIDE / 36);
const mean = (v: number[][], i: number) => v.reduce((s, p) => s + p[i], 0) / v.length;
const lowest = (v: number[][]) => v.filter(p => p[1] < Math.min(...v.map(q => q[1])) + 0.01);

describe('walker', () => {
  it('is eight boxes: four limbs, torso, head, two eyes', () => {
    expect(walked(0)).toHaveLength(8 * 36 * STRIDE);
  });

  it('fits its cylinder, feet on the floor, and the eyes alone glow', () => {
    const v = boxes(walked(0), 0, 8);
    expect(Math.min(...v.map(p => p[1]))).toBeCloseTo(1);
    expect(Math.max(...v.map(p => p[1]))).toBeCloseTo(1 + WALKER_H);
    for (const p of v) {
      expect(Math.hypot(p[0] - 5, p[2] + 3)).toBeLessThan(WALKER_R * 1.2);
    }
    expect(boxes(walked(0), 0, 6).every(p => p[8] == -1)).toBe(true);
    const eyes = boxes(walked(0), 6, 8);
    expect(eyes.every(p => p[8] == -2)).toBe(true);
    expect(eyes.every(p => p[6] > 2 * p[7] && p[6] > 2 * p[9])).toBe(true);
  });

  it('looks along forward(yaw)', () => {
    const [a, b] = [boxes(walked(0), 6, 8), boxes(walked(0, 0, { yaw: Math.PI / 2 }), 6, 8)];
    expect(mean(a, 2)).toBeLessThan(-3);
    expect(mean(b, 0)).toBeLessThan(5);
    expect(mean(b, 2)).toBeCloseTo(-3, 1);
  });

  it('swings the legs with the distance walked, one against the other', () => {
    const [still, a, b] = [walked(0), walked(0.2), walked(0.4)];
    const [l0, r0] = [boxes(still, 0, 1), boxes(still, 1, 2)];
    const [l1, r1] = [boxes(a, 0, 1), boxes(a, 1, 2)];
    // The feet of a leg swing about its hip: forward is -z.
    expect(mean(lowest(l1), 2)).toBeLessThan(mean(lowest(l0), 2) - 0.1);
    expect(mean(lowest(r1), 2)).toBeGreaterThan(mean(lowest(r0), 2) + 0.1);
    expect(boxes(b, 0, 1)).not.toEqual(l1);
  });

  it('keeps the torso and the head still while the limbs swing', () => {
    expect(boxes(walked(0.3), 4, 8)).toEqual(boxes(walked(0), 4, 8));
    expect(boxes(walked(0.3), 0, 4)).not.toEqual(boxes(walked(0), 0, 4));
  });

  it('swings the arms against the legs on the same side', () => {
    const [still, a] = [walked(0), walked(0.2)];
    const dz = (i: number) =>
      mean(lowest(boxes(a, i, i + 1)), 2) - mean(lowest(boxes(still, i, i + 1)), 2);
    // Left leg and right arm go together: forward and back, then the other pair.
    expect(Math.sign(dz(0))).toBe(Math.sign(dz(3)));
    expect(Math.sign(dz(0))).toBe(-Math.sign(dz(2)));
  });

  it('glows brighter, and bigger, while chasing', () => {
    const [calm, chase] = [boxes(walked(0), 6, 7), boxes(walked(0, 0, { chase: true }), 6, 7)];
    expect(chase[0][6]).toBeGreaterThan(calm[0][6]);
    expect(chase[0][7]).toBeGreaterThan(calm[0][7]);
    const w = (v: number[][]) => Math.max(...v.map(p => p[0])) - Math.min(...v.map(p => p[0]));
    expect(w(chase)).toBeGreaterThan(w(calm));
  });
});

describe('a blow', () => {
  const hand = (blow: number) => mean(boxes(walked(0, blow), 3, 4), 2);

  it('winds the arm back, strikes it forward, then settles', () => {
    expect(strike(0.1)).toBeLessThan(0);
    expect(strike(0.6)).toBeGreaterThan(1.5);
    expect(Math.abs(strike(1))).toBeLessThan(1e-9);
    expect(hand(0.12)).toBeGreaterThan(hand(0));
    expect(hand(0.6)).toBeLessThan(hand(0) - 0.25);
    expect(hand(1)).toBeCloseTo(hand(0));
  });

  it('moves the right arm only, and nothing without a blow', () => {
    const [rest, mid] = [walked(0), walked(0, 0.6)];
    expect(boxes(mid, 3, 4)).not.toEqual(boxes(rest, 3, 4));
    for (const [a, b] of [
      [0, 3],
      [4, 8],
    ]) {
      expect(boxes(mid, a, b)).toEqual(boxes(rest, a, b));
    }
    expect(walked(0, 0)).toEqual(rest);
  });
});

describe('flyer', () => {
  const verts = (t: number, o?: Partial<Monster>) =>
    build(out => flyer(out, mob(MONSTER.FLYER, o), t));

  it('is a lathed pod, four fins and an eye, the eye alone glowing', () => {
    const v = verts(0);
    expect(v).toHaveLength((5 * 8 * 6 + 5 * 36) * STRIDE);
    const lit = Array.from({ length: v.length / STRIDE }, (_, i) => v[i * STRIDE + 8]);
    expect(lit.filter(l => l == -2)).toHaveLength(36);
    expect(lit.filter(l => l == -1)).toHaveLength(lit.length - 36);
  });

  it('floats about FLYER_R wide and FLYER_H tall above its underside', () => {
    const shell = rows(verts(0, { id: 0 })).slice(0, 240);
    expect(Math.min(...shell.map(p => p[1]))).toBeCloseTo(1);
    expect(Math.max(...shell.map(p => p[1]))).toBeCloseTo(1 + FLYER_H);
    expect(Math.max(...shell.map(p => Math.hypot(p[0] - 5, p[2] + 3)))).toBeCloseTo(FLYER_R);
  });

  it('bobs on a slow sine and spins its fins', () => {
    const low = (t: number) => Math.min(...rows(verts(t)).map(p => p[1]));
    const seen = [0, 0.4, 0.8, 1.2, 1.6].map(low);
    expect(Math.max(...seen) - Math.min(...seen)).toBeGreaterThan(0.04);
    expect(Math.max(...seen)).toBeLessThan(1.07);
    expect(Math.min(...seen)).toBeGreaterThan(0.93);
    const fin = (t: number) => verts(t).slice(240 * STRIDE, 240 * STRIDE + 3);
    expect(fin(0)).not.toEqual(fin(0.5));
  });

  it('glows brighter while chasing, and its eye faces yaw', () => {
    const eye = (o?: Partial<Monster>) => verts(0, o).slice(-36 * STRIDE);
    expect(eye({ chase: true })[6]).toBeGreaterThan(eye()[6]);
    const z = (o?: Partial<Monster>) => mean(boxes(eye(o), 0, 1), 2);
    expect(z()).toBeLessThan(-3);
    expect(z({ yaw: Math.PI })).toBeGreaterThan(-3);
  });
});

describe('bullet', () => {
  const b = { id: 1, x: 2, y: 1, z: -4 };

  it('is an unlit blob, with a tail behind it when it has a heading', () => {
    const blob = build(out => bullet(out, b));
    expect(blob).toHaveLength(2 * 36 * STRIDE);
    const tail = build(out => bullet(out, b, [0, 0, -1]));
    expect(tail).toHaveLength(4 * 36 * STRIDE);
    for (const v of [blob, tail]) {
      expect(boxes(v, 0, v.length / STRIDE / 36).every(p => p[8] == -2)).toBe(true);
    }
    const behind = boxes(tail, 2, 4);
    expect(Math.min(...behind.map(p => p[2]))).toBeGreaterThan(-4);
    expect(mean(behind, 2)).toBeGreaterThan(-4);
  });
});

describe('chunks', () => {
  it('has a colour list for each monster kind', () => {
    expect(CHUNKS).toHaveLength(2);
    expect(CHUNKS.every(c => c.every(rgb => rgb.length == 3))).toBe(true);
  });
});
