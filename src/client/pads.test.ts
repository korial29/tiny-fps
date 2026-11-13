import { describe, expect, it } from 'vitest';
import { STRIDE } from './mesh';
import { pads } from './pads';
import { JOINT as J, rest, solve } from './rig';

describe("pads, the ninja's shoulder pads and collar", () => {
  const pose = solve(rest());
  const out: number[] = [];
  pads(out, pose, 0, [0.9, 0.1, 0.1]);
  const pts = Array.from({ length: out.length / STRIDE }, (_, i) =>
    out.slice(i * STRIDE, i * STRIDE + STRIDE),
  );
  const [arm, neck] = [pose.pos[J.ARM_R], pose.pos[J.NECK]];

  it('is whole triangles of finite points and unit normals, wound the way they face', () => {
    expect(pts.length % 3).toBe(0);
    for (let i = 0; i < pts.length; i += 3) {
      const [a, b, c] = [pts[i], pts[i + 1], pts[i + 2]];
      expect([...a, ...b, ...c].every(Number.isFinite)).toBe(true);
      expect(Math.hypot(a[3], a[4], a[5])).toBeCloseTo(1, 3);
      const [e, f] = [b.map((v, j) => v - a[j]), c.map((v, j) => v - a[j])];
      const n = [e[1] * f[2] - e[2] * f[1], e[2] * f[0] - e[0] * f[2], e[0] * f[1] - e[1] * f[0]];
      // Its corners turn about its normal: a piece mirrored without its order swapped would fail.
      expect(n[0] * a[3] + n[1] * a[4] + n[2] * a[5]).toBeGreaterThanOrEqual(-1e-9);
    }
  });

  it('is the same on both shoulders, its points out past the arms and over their joints', () => {
    const xs = pts.map(p => p[0]);
    expect(Math.max(...xs)).toBeCloseTo(-Math.min(...xs), 6);
    expect(Math.max(...xs)).toBeGreaterThan(arm[0] + 0.07);
    const tip = pts.find(p => p[0] == Math.max(...xs))!;
    expect(tip[1]).toBeGreaterThan(arm[1]);
  });

  it('stands a collar round the back of the neck, open in front', () => {
    const near = pts.filter(p => Math.hypot(p[0], p[2] - neck[2]) < 0.13 && p[1] > neck[1] + 0.03);
    expect(Math.max(...near.map(p => p[2]))).toBeGreaterThan(neck[2] + 0.09);
    // Nothing of it before the throat.
    expect(near.some(p => Math.abs(p[0]) < 0.04 && p[2] < neck[2])).toBe(false);
  });
});
