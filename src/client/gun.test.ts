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
  const groups = (g: ReturnType<typeof chaingun>) => Object.values(g);
  const count = (g: ReturnType<typeof chaingun>) => groups(g).reduce((n, v) => n + v.length / 6, 0);
  /** [min, max] of coordinate `axis` (0 x, 1 y, 2 z) over a group. */
  const span = (v: number[], axis: number) => {
    const xs = v.filter((_, i) => i % 6 == axis);
    return [Math.min(...xs), Math.max(...xs)];
  };

  it('builds barrels around the axis and a body, fewer triangles at low detail', () => {
    const hi = chaingun(10);
    const lo = chaingun(5);
    expect(hi.barrels.length).toBeGreaterThan(hi.body.length);
    expect(lo.barrels.length).toBeLessThan(hi.barrels.length);
    for (const v of groups(hi)) {
      expect(v.length % 18).toBe(0);
      expect(v.every(Number.isFinite)).toBe(true);
    }
  });

  it('draws 4158 vertices up close and 1140 from afar', () => {
    expect(count(chaingun(10))).toBe(4158);
    expect(count(chaingun(5))).toBe(1140);
  });

  it('keeps the fine parts for the near model only', () => {
    const lo = chaingun(5);
    expect([lo.clamps, lo.trim, lo.holes, lo.brass].map(v => v.length)).toEqual([0, 0, 0, 0]);
    const hi = chaingun(10);
    expect([hi.clamps, hi.trim, hi.holes, hi.brass].every(v => v.length > 0)).toBe(true);
  });

  it('points its muzzle toward -z and keeps its barrels within the body width', () => {
    const { barrels } = chaingun(8);
    const zs = barrels.filter((_, i) => i % 6 == 2);
    expect(Math.min(...zs)).toBeLessThan(-0.5);
    const xs = barrels.filter((_, i) => i % 6 == 0);
    expect(Math.max(...xs.map(Math.abs))).toBeLessThan(0.09);
  });

  it('clamps the barrels at both ends, the rear one behind the shroud and the front one past it', () => {
    const [back, front] = [0.1, 0.44];
    const { clamps, barrels } = chaingun(10);
    const [z0, z1] = span(clamps, 2);
    expect(z0).toBeCloseTo(-front - 0.06);
    expect(z1).toBeCloseTo(-back);
    // Wider than the barrel ring, within a hair of the housing.
    const [x0, x1] = span(clamps, 0);
    expect(x1).toBeGreaterThan(span(barrels, 0)[1]);
    expect(x1).toBeLessThan(0.1);
    expect(x0).toBeCloseTo(-x1);
    // Both rings are there: some vertices in the rear one, some in the front one.
    const zs = clamps.filter((_, i) => i % 6 == 2);
    expect(zs.some(z => z > -0.17)).toBe(true);
    expect(zs.some(z => z < -0.43)).toBe(true);
    expect(zs.every(z => z > -0.17 || z < -0.43)).toBe(true);
  });

  it('puts the cooling holes on the shroud, between the clamps', () => {
    const { holes } = chaingun(10);
    // 10 on the shroud and 1 for the ejection port, a quad each.
    expect(holes.length / 6).toBe(66);
    const [z0, z1] = span(holes, 2);
    expect(z0).toBeGreaterThanOrEqual(-0.3);
    expect(z1).toBeLessThan(0);
    const r = span(holes, 0)[1];
    expect(r).toBeGreaterThan(0.07);
    expect(r).toBeLessThan(0.08);
    // Each quad is flat: one normal for its 6 vertices, pointing away from the axis.
    for (let i = 0; i < holes.length; i += 36) {
      const [nx, ny] = [holes[i + 3], holes[i + 4]];
      expect(Math.hypot(nx, ny)).toBeCloseTo(1);
      expect(holes[i] * nx + holes[i + 1] * ny).toBeGreaterThan(0.05);
      for (let k = 1; k < 6; k++) {
        expect(holes.slice(i + k * 6 + 3, i + k * 6 + 6)).toEqual(holes.slice(i + 3, i + 6));
      }
    }
  });

  it('opens an ejection port on the right, above the axis', () => {
    const { holes } = chaingun(10);
    // The last quad: x > 0, y > 0, a short way behind the muzzle end of the receiver.
    const port = holes.slice(-36);
    expect(port.filter((_, i) => i % 6 == 0).every(x => x > 0.05)).toBe(true);
    expect(port.filter((_, i) => i % 6 == 1).every(y => y > 0)).toBe(true);
    expect(port.filter((_, i) => i % 6 == 2).every(z => z > -0.1 && z < 0)).toBe(true);
  });

  it('hangs an ammo box on the left, with a belt of brass into the receiver, and a handle on top', () => {
    const { body, trim, brass } = chaingun(10);
    // The box is a flat-sided slab, its left face 18 cm out.
    expect(span(body, 0)[0]).toBeCloseTo(-0.18);
    expect(span(trim, 0)[0]).toBeLessThan(-0.18);
    expect(span(brass, 0)[1]).toBeLessThan(-0.09);
    expect(span(brass, 2)).toEqual([expect.closeTo(-0.059), expect.closeTo(0.041)]);
    // The handle stands above the housing.
    expect(span(trim, 1)[1]).toBeGreaterThan(0.12);
    expect(span(body, 1)[1]).toBeLessThan(0.1);
  });

  it('bolts the rear cap, whose hub and rim stand behind the cap face', () => {
    const { trim } = chaingun(10);
    // The body ends at z 0.3; the hub reaches 0.325.
    expect(span(trim, 2)[1]).toBeCloseTo(0.325);
    const behind = trim.filter((v, i) => i % 6 == 2 && v > 0.3);
    // The hub, the rim and 6 bolts: far more than the hub alone.
    expect(behind.length).toBeGreaterThan(6 * 12 + 30);
  });

  it('keeps the silhouette: thick housing at the back, thin barrels in front', () => {
    const g = chaingun(10);
    const [z0] = span(g.body, 2);
    expect(z0).toBeCloseTo(-0.4);
    expect(span([...g.body, ...g.clamps], 0)[1]).toBeLessThan(0.1);
    for (const v of [g.barrels, g.clamps]) {
      expect(span(v, 2)[0]).toBeGreaterThanOrEqual(-0.55);
    }
  });
});
