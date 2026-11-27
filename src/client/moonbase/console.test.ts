import { describe, expect, it } from 'vitest';
import { KIND, KIT } from '../../shared/moonbase';
import { STRIDE } from '../mesh';
import { INDOORS } from './constants';
import { station } from './console';

describe('the control station', () => {
  const o: number[] = [];
  station(o, 10, 20, 0, 0);
  const pts = Array.from({ length: o.length / STRIDE }, (_, i) =>
    o.slice(i * STRIDE, (i + 1) * STRIDE),
  );

  it('stands round its middle, within 1.5 m, indoors, under 1.1 m', () => {
    expect(pts.every(p => Math.hypot(p[0] - 10, p[2] - 20) < 1.5)).toBe(true);
    expect(pts.every(p => p[1] >= 0 && p[1] < 1.1)).toBe(true);
    expect(pts.every(p => p[3] === INDOORS[0] && p[4] === INDOORS[1])).toBe(true);
  });

  it('lights seven screens, none on its open front', () => {
    // The screens' lavender (SCREEN at 0.9), six corners each, in pod order.
    const screens = pts.filter(p => p[8] === -2 && Math.abs(p[9] - 0.945) < 1e-9);
    expect(screens).toHaveLength(7 * 6);
    for (let k = 0; k < 7; k++) {
      const q = screens.slice(k * 6, k * 6 + 6);
      const [x, z] = [0, 2].map(i => q.reduce((s, p) => s + p[i], 0) / 6);
      // The front looks along +x: every screen more than 60 degrees off it.
      expect(Math.abs(Math.atan2(z - 20, x - 10))).toBeGreaterThan(Math.PI / 3);
    }
  });

  it('takes the place of the square table in the hall, on a box as wide as it is deep', () => {
    const [, x0, z0, x1, z1] = KIT.find(k => k[0] === KIND.CONSOLE)!;
    expect(x1 - x0).toBe(z1 - z0);
    expect(x1 - x0).toBeGreaterThanOrEqual(3);
  });
});
