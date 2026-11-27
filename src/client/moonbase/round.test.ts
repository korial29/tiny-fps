import { describe, expect, it } from 'vitest';
import { BASE } from '../../shared/moonbase';
import { TEX } from '../../shared/types';
import { STRIDE } from '../mesh';
import type { Vec3 } from '../mesh';
import { bevel, ring } from './round';

const points = (o: number[]) =>
  Array.from({ length: o.length / STRIDE }, (_, i) => o.slice(i * STRIDE, i * STRIDE + STRIDE));

describe('the base kit without square edges', () => {
  it('bevels a box: 44 triangles inside it, its corners cut, its faces still reaching each side', () => {
    const o: number[] = [];
    bevel(o, [0, 0, 0], [1, 0.5, 0.2], [0.5, 0.5, 0.5], 0.03);
    const p = points(o);
    expect(p).toHaveLength(44 * 3);
    for (let k = 0; k < 3; k++) {
      const hi = [1, 0.5, 0.2][k];
      expect(Math.min(...p.map(v => v[k]))).toBe(0);
      expect(Math.max(...p.map(v => v[k]))).toBeCloseTo(hi, 12);
    }
    // No vertex stands on a corner of the box.
    expect(p.some(v => [0, 1, 2].every(k => v[k] === 0 || v[k] === [1, 0.5, 0.2][k]))).toBe(false);
  });

  it('cuts the bevel to a third of the thinnest side', () => {
    const o: number[] = [];
    bevel(o, [0, 0, 0], [1, 1, 0.03], [0.5, 0.5, 0.5], 0.5);
    expect(Math.min(...points(o).map(v => v[0]))).toBe(0);
    expect(
      points(o)
        .filter(v => v[0] === 0)
        .every(v => v[1] >= 0.01 - 1e-12),
    ).toBe(true);
  });

  it('draws round glowing lights, hot in the middle, and bars with round ends', () => {
    const [at, a, b]: Vec3[] = [
      [1, 2, 3],
      [1, 0, 0],
      [0, 1, 0],
    ];
    const disc: number[] = [];
    ring(disc, at, a, b, [0, 0.1], [2, 2, 2], [1, 0, 0], 8);
    const d = points(disc);
    expect(d).toHaveLength(8 * 3);
    expect(d.every(v => v[8] === -2)).toBe(true);
    for (const v of d) {
      const r = Math.hypot(v[0] - 1, v[1] - 2);
      expect(r < 1e-12 || Math.abs(r - 0.1) < 1e-12).toBe(true);
      expect(v[6]).toBe(r < 1e-12 ? 2 : 1);
    }
    const bar: number[] = [];
    ring(bar, at, a, b, [0, 0.05], [1, 1, 1], [1, 1, 1], 8, 0.3);
    const p = points(bar);
    expect(Math.max(...p.map(v => v[0]))).toBeCloseTo(1.35, 12);
    expect(Math.max(...p.map(v => v[1]))).toBeCloseTo(2.05, 12);
    // Out along its length, it narrows: a round end, no square one.
    expect(p.some(v => v[0] > 1.34 && Math.abs(v[1] - 2) > 0.01)).toBe(false);
  });

  it("dresses the base's brushes in the smooth hull, no riveted metal left", () => {
    expect(BASE.some(b => b.top === TEX.METAL || b.side === TEX.METAL)).toBe(false);
    expect(BASE.some(b => b.top === TEX.HULL || b.side === TEX.HULL)).toBe(true);
  });
});
