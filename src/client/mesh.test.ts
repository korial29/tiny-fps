import { describe, expect, it } from 'vitest';
import { STRIDE, aim, basis, place, pushQuad } from './mesh';
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
    place(out, vertex, [0, 0, 0], basis(0, 0), [0, 0, 0], 1, 0, [0.5, 1, 0.2]);
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

describe('pushQuad', () => {
  it('lights both faces: 12 vertices, the normals opposed', () => {
    const out: number[] = [];
    pushQuad(out, [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0.1, 0.2, 0.3]);
    expect(out).toHaveLength(12 * STRIDE);
    expect(out.slice(3, 6)).toEqual([0, 0, 1]);
    expect(out.slice(6 * STRIDE + 3, 6 * STRIDE + 6)).toEqual([-0, -0, -1]);
    expect(out.slice(6, 10)).toEqual([0.1, 0.2, -1, 0.3]);
  });
});
