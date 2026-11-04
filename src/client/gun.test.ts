import { describe, expect, it } from 'vitest';
import { chaingun, lathe } from './gun';

const cylinder: [number, number][] = [
  [0, 0],
  [1, 0],
  [1, 2],
  [0, 2],
];

describe('lathe', () => {
  it('makes 2 triangles per side and profile segment, 6 floats a vertex', () => {
    const v = lathe(cylinder, 8);
    expect(v).toHaveLength(3 * 8 * 2 * 3 * 6);
  });

  it('skips a segment with no length', () => {
    expect(
      lathe(
        [
          [1, 0],
          [1, 0],
          [1, 1],
        ],
        4,
      ),
    ).toHaveLength(4 * 2 * 3 * 6);
  });

  it('gives unit normals pointing away from the solid', () => {
    const v = lathe(cylinder, 12);
    // The centre of a convex solid: any outward normal points away from it.
    for (let i = 0; i < v.length; i += 6) {
      expect(Math.hypot(v[i + 3], v[i + 4], v[i + 5])).toBeCloseTo(1);
      const out = v[i + 3] * v[i] + v[i + 4] * v[i + 1] + v[i + 5] * (v[i + 2] + 1);
      expect(out).toBeGreaterThan(0);
    }
  });

  it('runs the length toward -z and moves with `at`', () => {
    const v = lathe(cylinder, 4, [5, 6, 7]);
    const zs = v.filter((_, i) => i % 6 == 2);
    expect(Math.min(...zs)).toBeCloseTo(5);
    expect(Math.max(...zs)).toBeCloseTo(7);
    expect(v[0]).toBeCloseTo(5);
  });
});

describe('chaingun', () => {
  it('builds barrels around the axis and a body, fewer triangles at low detail', () => {
    const hi = chaingun(10);
    const lo = chaingun(5);
    expect(hi.barrels.length).toBeGreaterThan(hi.body.length);
    expect(lo.barrels.length).toBeLessThan(hi.barrels.length);
    for (const v of [hi.barrels, hi.body]) {
      expect(v.length % 18).toBe(0);
      expect(v.every(Number.isFinite)).toBe(true);
    }
  });

  it('points its muzzle toward -z and keeps its barrels within the body width', () => {
    const { barrels } = chaingun(8);
    const zs = barrels.filter((_, i) => i % 6 == 2);
    expect(Math.min(...zs)).toBeLessThan(-0.5);
    const xs = barrels.filter((_, i) => i % 6 == 0);
    expect(Math.max(...xs.map(Math.abs))).toBeLessThan(0.09);
  });
});
