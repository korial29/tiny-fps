import { describe, expect, it } from 'vitest';
import { RACK_R } from '../shared/constants';
import { STRIDE } from './mesh';
import type { Vec3 } from './mesh';
import { cell, kit, packsOf, rack } from './props';

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

  it('reads the ammo packs after the health packs: the bits count from where the health packs end', () => {
    const ammo: Vec3[] = [
      [10, 0, 0],
      [20, 0, 0],
    ];
    // Three health packs: bits 0 to 2, then the ammo packs on bits 3 and 4.
    expect(packsOf(ammo, 0b01000, 3)).toEqual([ammo[0]]);
    expect(packsOf(ammo, 0b10000, 3)).toEqual([ammo[1]]);
    expect(packsOf(ammo, 0b00111, 3)).toEqual([]);
    expect(packsOf(ammo, 0b11000, 3)).toEqual(ammo);
    // The health packs do not take the ammo packs' bits.
    expect(packsOf(PACKS.slice(0, 3), 0b11000)).toEqual([]);
  });

  it('keeps the bits within the 32 of the mask: a pack past the last bit is never there', () => {
    const ammo: Vec3[] = [
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
    ];
    expect(packsOf(ammo, 0xffffffff, 30)).toEqual([ammo[0], ammo[1]]);
    expect(packsOf(ammo, 0xffffffff, 32)).toEqual([]);
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

describe('an ammo pack', () => {
  const v = drawn(out => cell(out, [10, 5, 20], 0));

  it('is a violet box with a glowing cyan cartridge on each side, bobbing around its place', () => {
    expect(v.length).toBeGreaterThan(100);
    const glow = v.filter(x => x[8] == -2);
    // A round, a tip and a rim on each of six faces: five triangles.
    expect(glow).toHaveLength(6 * 5 * 3);
    for (const g of glow) {
      expect(g[9]).toBeGreaterThan(1);
      expect(g[7]).toBeGreaterThan(g[6] * 2);
    }
    // The box is violet: more blue than red, and red over green.
    const box = v.filter(x => x[8] == -1);
    expect(box).toHaveLength(6 * 2 * 3);
    for (const x of box) {
      expect(x[9]).toBeGreaterThan(x[6]);
      expect(x[6]).toBeGreaterThan(x[7]);
      expect(Math.abs(x[0] - 10)).toBeLessThan(0.3);
      expect(x[1]).toBeGreaterThan(5.2);
      expect(Math.abs(x[2] - 20)).toBeLessThan(0.3);
    }
  });

  it('is not the health pack: another colour, another glyph', () => {
    const health = drawn(out => kit(out, [10, 5, 20], 0));
    expect(v.filter(x => x[8] == -2)).not.toHaveLength(health.filter(x => x[8] == -2).length);
    expect(v[0].slice(6, 10)).not.toEqual(health[0].slice(6, 10));
  });

  it('has its normals outward, and turns and bobs with the clock', () => {
    const c = [0, 1, 2].map(k => v.reduce((s, x) => s + x[k], 0) / v.length);
    for (let i = 0; i < v.length; i += 3) {
      const m = [0, 1, 2].map(k => (v[i][k] + v[i + 1][k] + v[i + 2][k]) / 3 - c[k]);
      expect(v[i][3] * m[0] + v[i][4] * m[1] + v[i][5] * m[2]).toBeGreaterThan(0);
    }
    const b = drawn(out => cell(out, [10, 5, 20], 1));
    expect(b[0].slice(0, 3)).not.toEqual(v[0].slice(0, 3));
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
