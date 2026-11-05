import { describe, expect, it } from 'vitest';
import { STRIDE, aim, basis, lathe, place } from './mesh';
import type { Vec3 } from './mesh';

// One vertex at (1, 2, -3) with its normal along x and a flat colour (0.5, 0.25, layer -1, 1).
const vertex = [1, 2, -3, 1, 0, 0, 0.5, 0.25, -1, 1];

describe('place', () => {
  it('moves a vertex along the axes, with z running backward', () => {
    const out: number[] = [];
    place(out, vertex, [10, 0, 0], basis(0, 0), [0, 0, 0], 1);
    // x right, y up, forward -z: the vertex is 3 m ahead.
    expect(out.slice(0, 3)).toEqual([11, 2, -3]);
    expect(out.slice(3, 6)).toEqual([1, 0, 0]);
    expect(out.slice(6)).toEqual([0.5, 0.25, -1, 1]);
  });

  it('scales each axis alone with a vector, and the normal not at all', () => {
    const out: number[] = [];
    place(out, vertex, [0, 0, 0], basis(0, 0), [0, 0, 0], [2, 3, 4]);
    expect(out.slice(0, 3)).toEqual([2, 6, -12]);
    expect(out.slice(3, 6)).toEqual([1, 0, 0]);
  });

  it('multiplies the colour by the tint, and keeps the layer', () => {
    const out: number[] = [];
    place(out, vertex, [0, 0, 0], basis(0, 0), [0, 0, 0], 1, [0.5, 1, 0.2]);
    expect(out.slice(6)).toEqual([0.25, 0.25, -1, 0.2]);
  });

  it('appends one vertex per source vertex', () => {
    const out: number[] = [];
    place(out, [...vertex, ...vertex], [0, 0, 0], basis(1, 0.3), [1, 1, 1], 0.5);
    expect(out).toHaveLength(2 * STRIDE);
  });
});

describe('aim', () => {
  it('points f where asked and keeps r as near the side as it can', () => {
    const [r, u, f] = aim([0, -1, 0], [1, 0, 0]);
    expect(f).toEqual([0, -1, 0]);
    expect(r).toEqual([1, 0, 0]);
    // Right-handed like basis: r x u = -f.
    const cross = (a: Vec3, b: Vec3) => [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
    cross(r, u).forEach((v, i) => expect(v).toBeCloseTo(-f[i]));
  });

  it('drops the part of the side along f', () => {
    const [r] = aim([1, 0, 0], [1, 1, 0]);
    expect(r).toEqual([0, 1, 0]);
  });
});

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
