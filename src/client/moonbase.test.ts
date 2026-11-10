import { describe, expect, it } from 'vitest';
import { MOON } from '../shared/moon';
import { STRIDE } from './mesh';
import { moonscape } from './moonscape';

const v = moonscape(MOON);
const verts = Array.from({ length: v.length / STRIDE }, (_, i) =>
  v.slice(i * STRIDE, (i + 1) * STRIDE),
);

describe('moonbase', () => {
  it('stands a dome of radius 22 and about 16 m on each half, a glowing band at its foot', () => {
    for (const z of [236, 44]) {
      const near = verts.filter(p => Math.hypot(p[0] - 80, p[2] - z) < 1.5);
      expect(Math.max(...near.map(p => p[1]))).toBeGreaterThan(15.9);
      expect(Math.max(...near.map(p => p[1]))).toBeLessThan(18);
      const at = (r: number) =>
        verts.filter(p => Math.abs(Math.hypot(p[0] - 80, p[2] - z) - r) < 0.01);
      expect(at(22.46).some(p => p[8] === -2 && p[1] > 1 && p[1] < 4)).toBe(true);
      expect(at(22.4).some(p => p[8] === -1 && p[1] < 0.01)).toBe(true);
    }
  });
});
