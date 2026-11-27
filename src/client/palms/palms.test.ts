import { describe, expect, it } from 'vitest';
import { palm } from '../jungle/models';
import { STRIDE } from '../mesh';
import { expand, planter } from './build';
import { DRAW_ORDER, MESHES, R0, VARIANTS, meshOf } from './types';

describe('palms by instance', () => {
  it("draws the near meshes before the far ones, the first row's first", () => {
    expect([...DRAW_ORDER].sort((a, b) => a - b)).toEqual(
      Array.from({ length: MESHES }, (_, i) => i),
    );
    const firstFar = DRAW_ORDER.findIndex(mi => Math.floor(mi / VARIANTS) % 2 == 1);
    expect(DRAW_ORDER.slice(firstFar).every(mi => Math.floor(mi / VARIANTS) % 2 == 1)).toBe(true);
    expect(DRAW_ORDER[0]).toBe(meshOf(2, false, 0));
  });

  it('builds each far mesh cheaper than its near one and as tall', () => {
    const t = planter().done();
    const top = (mi: number) => {
      let y = -Infinity;
      for (let i = t.ranges[mi * 2]; i < t.ranges[mi * 2] + t.ranges[mi * 2 + 1]; i++) {
        y = Math.max(y, t.mesh[i * STRIDE + 1]);
      }
      return y;
    };
    for (let lod = 0; lod < 3; lod++) {
      for (let v = 0; v < VARIANTS; v++) {
        const [n, f] = [meshOf(lod, false, v), meshOf(lod, true, v)];
        expect(t.ranges[n * 2 + 1]).toBeGreaterThan(t.ranges[f * 2 + 1]);
        expect(Math.abs(top(n) - top(f))).toBeLessThan(1);
      }
    }
  });

  it('expands an upright palm of a variant seed to the palm() it was built from, turned about its foot', () => {
    // Variant 0's seed (build.ts seedOf): a height ratio, crown and trunk of 1.
    const p = planter();
    p.add(10, 2, -3, R0, 7000, 1, 0, 0);
    const t = p.done();
    expect([t.inst[4], t.inst[7], t.inst[8]]).toEqual([1, 1, 1]);
    const own: number[] = [];
    palm(own, 10, 2, -3, R0, 7000, 1, 0, 0, 1);
    const shape = (v: number[]) =>
      Array.from({ length: v.length / STRIDE }, (_, i) => [
        Math.hypot(v[i * STRIDE] - 10, v[i * STRIDE + 2] + 3),
        v[i * STRIDE + 1],
      ]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    const [a, b] = [shape(expand(t)), shape(own)];
    expect(a.length).toBe(b.length);
    let worst = 0;
    a.forEach(
      (q, i) => (worst = Math.max(worst, Math.abs(q[0] - b[i][0]), Math.abs(q[1] - b[i][1]))),
    );
    expect(worst).toBeLessThan(1e-9);
  });

  it('leans a palm by its top: the foot stays on its ground, the crown moves by the lean', () => {
    const p = planter();
    p.add(0, 0, 0, R0, 7000, 1, 3, -2);
    const v = expand(p.done());
    const pts = Array.from({ length: v.length / STRIDE }, (_, i) =>
      v.slice(i * STRIDE, i * STRIDE + 3),
    );
    const foot = pts.filter(q => q[1] < 1e-6);
    expect(foot.length).toBeGreaterThan(4);
    expect(Math.max(...foot.map(q => Math.hypot(q[0], q[2])))).toBeLessThanOrEqual(R0 * 0.9 + 1e-9);
    // The crown's middle: over the leant top, 3 m along x and -2 m along z.
    const top = Math.max(...pts.map(q => q[1]));
    const crown = pts.filter(q => q[1] > top - 0.2);
    const mx = crown.reduce((s, q) => s + q[0], 0) / crown.length;
    const mz = crown.reduce((s, q) => s + q[2], 0) / crown.length;
    expect(Math.hypot(mx - 3, mz + 2)).toBeLessThan(1.5);
  });
});
