import { describe, expect, it } from 'vitest';
import { RACK_R } from '../shared/constants';
import { STRIDE } from './mesh';
import type { Vec3 } from './mesh';
import { kit, packsOf, rack } from './props';

const PACKS: Vec3[] = [
  [1, 0, 0],
  [2, 0, 0],
  [3, 0, 0],
  [4, 0, 0],
];
const drawn = (f: (out: number[]) => void) => {
  const out: number[] = [];
  f(out);
  expect(out.length % (3 * STRIDE)).toBe(0);
  expect(out.every(Number.isFinite)).toBe(true);
  return Array.from({ length: out.length / STRIDE }, (_, i) =>
    out.slice(i * STRIDE, (i + 1) * STRIDE),
  );
};

describe('packsOf', () => {
  it('keeps the packs whose bit is set', () => {
    expect(packsOf(PACKS, 0b0101)).toEqual([PACKS[0], PACKS[2]]);
    expect(packsOf(PACKS, 0b1111)).toEqual(PACKS);
  });

  it('gives none for no bit, no mask or no packs', () => {
    expect(packsOf(PACKS, 0)).toEqual([]);
    expect(packsOf(PACKS)).toEqual([]);
    expect(packsOf(undefined, 7)).toEqual([]);
  });

  it('reads all 32 bits, the top one included', () => {
    const many = Array.from({ length: 32 }, (_, i): Vec3 => [i, 0, 0]);
    expect(packsOf(many, 0xffffffff)).toHaveLength(32);
    expect(packsOf(many, 0x80000000)).toEqual([many[31]]);
  });
});

describe('a health pack', () => {
  it('is a small white box with a glowing green cross on each face, around its place', () => {
    const v = drawn(out => kit(out, [10, 5, 20], 0));
    // Six faces and three plates each, two triangles a plate.
    expect(v).toHaveLength(6 * 3 * 6);
    const glow = v.filter(x => x[8] == -2);
    expect(glow).toHaveLength(6 * 2 * 6);
    for (const g of glow) {
      expect(g[7]).toBeGreaterThan(g[6]);
      expect(g[7]).toBeGreaterThan(g[9]);
    }
    for (const x of v) {
      expect(Math.abs(x[0] - 10)).toBeLessThan(0.3);
      expect(x[1]).toBeGreaterThan(5.2);
      expect(x[1]).toBeLessThan(5.9);
      expect(Math.abs(x[2] - 20)).toBeLessThan(0.3);
      expect(Math.hypot(x[3], x[4], x[5])).toBeCloseTo(1, 5);
    }
  });

  it('bobs and turns with the clock', () => {
    const a = drawn(out => kit(out, [0, 0, 0], 0));
    const b = drawn(out => kit(out, [0, 0, 0], 1));
    expect(b[0].slice(0, 3)).not.toEqual(a[0].slice(0, 3));
    const y = (v: number[][]) => Math.min(...v.map(x => x[1]));
    expect(y(a)).not.toBeCloseTo(y(b), 3);
  });

  it('has its normals outward', () => {
    const v = drawn(out => kit(out, [0, 0, 0], 0.3));
    const c = [0, 1, 2].map(k => v.reduce((s, x) => s + x[k], 0) / v.length);
    for (let i = 0; i < v.length; i += 3) {
      const m = [0, 1, 2].map(k => (v[i][k] + v[i + 1][k] + v[i + 2][k]) / 3 - c[k]);
      expect(v[i][3] * m[0] + v[i][4] * m[1] + v[i][5] * m[2]).toBeGreaterThan(0);
    }
  });
});

describe('a rack', () => {
  const v = drawn(out => rack(out, [4, 3, 8], [1, 0.2, 0.2], 0));

  it('is a stand in the team colour with a gun over it, and a ring on the roof as wide as the pickup', () => {
    expect(v.length).toBeGreaterThan(400);
    const ring = v.filter(x => x[8] == -2 && x[1] < 3.1);
    expect(ring.length).toBeGreaterThan(30);
    expect(Math.max(...ring.map(x => Math.hypot(x[0] - 4, x[2] - 8)))).toBeCloseTo(RACK_R, 1);
    // The post and dish are red, and the gun's violet is over them.
    const stand = v.filter(x => x[1] > 3 && x[1] < 3.8 && x[8] == -1);
    expect(stand.some(x => x[6] > 2 * x[7])).toBe(true);
    expect(Math.max(...v.map(x => x[1]))).toBeGreaterThan(3.9);
  });

  it('is cheap', () => {
    expect(v.length).toBeLessThan(2300);
  });
});
