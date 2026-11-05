import { describe, expect, it } from 'vitest';
import { DETAIL, STRIDE, aim, basis, capsule, place, segment, smooth, solid } from './mesh';
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

  it('turns a normal with the inverse of the scale: an ellipsoid shades like one', () => {
    // A unit sphere stretched by (2, 1, 1): at (2s, s) the surface x^2 / 4 + y^2 = 1 has the
    // gradient (x / 2, 2y) = (s, 2s), which is (1, 2) / sqrt(5).
    const s = Math.SQRT1_2;
    const out: number[] = [];
    place(out, [s, s, 0, s, s, 0, 0, 0, -1, 0], [0, 0, 0], basis(0, 0), [0, 0, 0], [2, 1, 1]);
    expect(out.slice(0, 2)).toEqual([2 * s, s]);
    expect(out[3]).toBeCloseTo(1 / Math.sqrt(5));
    expect(out[4]).toBeCloseTo(2 / Math.sqrt(5));
    expect(out[5]).toBeCloseTo(0);
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

/** The vertices of a smooth() or capsule() result: [x, y, z, nx, ny, nz]. */
const points = (v: number[]) =>
  Array.from({ length: v.length / 6 }, (_, i) => v.slice(i * 6, i * 6 + 6));

describe('smooth', () => {
  it('makes a quad per side and profile segment, a triangle where one end is on the axis', () => {
    // Two segments touch the axis (the caps), one is a full quad.
    expect(smooth(cylinder, 8)).toHaveLength((8 + 8 * 2 + 8) * 3 * 6);
    expect(
      smooth(
        [
          [1, 0],
          [1, 1],
          [2, 2],
        ],
        4,
      ),
    ).toHaveLength(4 * 2 * 2 * 3 * 6);
  });

  it('skips a segment with no length', () => {
    expect(smooth([...cylinder.slice(0, 2), cylinder[1], ...cylinder.slice(2)], 8)).toEqual(
      smooth(cylinder, 8),
    );
  });

  it('gives unit normals pointing away from the solid', () => {
    for (const [x, y, z, nx, ny, nz] of points(smooth(cylinder, 12))) {
      expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1);
      // The centre of a convex solid: any outward normal points away from it.
      expect(nx * x + ny * y + nz * (z + 1)).toBeGreaterThanOrEqual(-1e-9);
    }
  });

  it('smooths the normals along the profile: a corner is shared, not flat', () => {
    // The rim of a cylinder reads at 45 degrees, between its side and its end.
    const rim = points(smooth(cylinder, 12)).filter(
      p => Math.hypot(p[0], p[1]) > 0.99 && p[2] > -0.01,
    );
    expect(rim.length).toBeGreaterThan(0);
    for (const p of rim) {
      expect(Math.hypot(p[3], p[4])).toBeCloseTo(Math.SQRT1_2);
      expect(p[5]).toBeCloseTo(Math.SQRT1_2);
    }
  });

  it('runs the length toward -z and moves with `at`', () => {
    const v = smooth(cylinder, 4, [5, 6, 7]);
    const zs = v.filter((_, i) => i % 6 == 2);
    expect(Math.min(...zs)).toBeCloseTo(5);
    expect(Math.max(...zs)).toBeCloseTo(7);
    expect(v[0]).toBeCloseTo(5);
  });
});

describe('capsule', () => {
  const len = 1.5;
  const [r0, r1] = [0.4, 0.2];
  const c = capsule(len, [r0, 0.35, r1], 12, [3, 3]);

  it('ends in hemispheres: the far points are a radius beyond each end centre', () => {
    const zs = points(c).map(p => p[2]);
    expect(Math.max(...zs)).toBeCloseTo(r0);
    expect(Math.min(...zs)).toBeCloseTo(-len - r1);
    // Every vertex of the end cap is a radius from the end centre.
    const [a, b] = [points(c).filter(p => p[2] > 0), points(c).filter(p => p[2] < -len)];
    for (const p of a) {
      expect(Math.hypot(p[0], p[1], p[2])).toBeCloseTo(r0);
    }
    for (const p of b) {
      expect(Math.hypot(p[0], p[1], p[2] + len)).toBeCloseTo(r1);
    }
  });

  it('follows the radii along its length, a bulge included', () => {
    const at = (l: number) =>
      Math.max(
        ...points(c)
          .filter(p => Math.abs(p[2] + l) < 1e-9)
          .map(p => Math.hypot(p[0], p[1])),
      );
    expect(at(0)).toBeCloseTo(r0);
    expect(at(len / 2)).toBeCloseTo(0.35);
    expect(at(len)).toBeCloseTo(r1);
  });

  it('has unit normals pointing away from its axis', () => {
    for (const [x, y, z, nx, ny, nz] of points(c)) {
      expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1);
      // The axis point nearest the vertex, clamped to the segment between the end centres.
      const k = Math.min(Math.max(-z, 0), len);
      expect(nx * x + ny * y + nz * (z + k)).toBeGreaterThan(0);
    }
  });

  it('is a sphere of no length: every vertex at the radius, the normal along the radius', () => {
    for (const [x, y, z, nx, ny, nz] of points(capsule(0, [2, 2], 10, [4, 4]))) {
      expect(Math.hypot(x, y, z)).toBeCloseTo(2);
      expect(nx * 2).toBeCloseTo(x);
      expect(ny * 2).toBeCloseTo(y);
      expect(nz * 2).toBeCloseTo(z);
    }
  });

  it('counts 6 * sides * (end rings + body steps - 1) vertices, a flat cut being a fan', () => {
    expect(c).toHaveLength(6 * 12 * (3 + 3 + 2 - 1) * 6);
    expect(capsule(1, [1, 1], 8, [2, 2])).toHaveLength(6 * 8 * 4 * 6);
    // A flat end is one ring of triangles (3 * sides), where a round one of 1 ring is too.
    expect(capsule(1, [1, 1], 8, [0, 1])).toHaveLength((3 + 6 + 3) * 8 * 6);
    expect(Math.max(...points(capsule(1, [1, 1], 8, [0, 1])).map(p => p[2]))).toBeCloseTo(0);
  });
});

describe('solid', () => {
  it('gives more sides and rings with each level of detail, and is built once', () => {
    const counts = DETAIL.map((_, lod) => solid(lod, 1, [0.1, 0.1]).length / STRIDE);
    expect(counts).toEqual(DETAIL.map(([s, k]) => 6 * s * (2 * k)));
    expect(counts[0]).toBeLessThan(counts[1]);
    expect(counts[1]).toBeLessThan(counts[2]);
    expect(solid(1, 1, [0.1, 0.1])).toBe(solid(1, 1, [0.1, 0.1]));
    expect(solid(1, 1, [0.1, 0.1])).not.toBe(solid(1, 1, [0.1, 0.2]));
  });

  it('is white on the flat layer, and its ends take a fraction of the rings', () => {
    const v = solid(2, 1, [0.1, 0.1], [0, 0.5]);
    expect(v[6]).toBe(1);
    expect(v[8]).toBe(-1);
    expect(v[9]).toBe(1);
    // A flat end and a 2 of 3 ring end, one body step.
    expect(v.length / STRIDE).toBe((3 + 6 + 9) * DETAIL[2][0]);
  });
});

describe('segment', () => {
  it('stretches a solid built `len` long between two points, round ends and all', () => {
    const out: number[] = [];
    // Built 1 long, placed 3 m long: the end sphere's 0.1 m stretches with it, to -3.3. 5 times as
    // wide, it is 0.5 m of radius.
    segment(out, solid(1, 1, [0.1, 0.1]), [0, 1, 0], [0, 1, -3], [1, 0, 0], 1, 5);
    const zs = out.filter((_, i) => i % STRIDE == 2);
    expect(Math.min(...zs)).toBeCloseTo(-3.3);
    expect(Math.max(...out.filter((_, i) => i % STRIDE == 0))).toBeCloseTo(0.5);
  });
});
