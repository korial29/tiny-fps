import { describe, expect, it } from 'vitest';
import { EAGLE } from './eagle';

/** How far (u, y) lies inside the convex outline `at`, in metres: negative outside. */
const depth = (at: number[][], [u, y]: number[]) => {
  // The outline's winding, from its signed area, so the inward side of each edge is known.
  let area = 0;
  for (let i = 0; i < at.length; i++) {
    const [a, b] = [at[i], at[(i + 1) % at.length]];
    area += a[0] * b[1] - b[0] * a[1];
  }
  let d = Infinity;
  for (let i = 0; i < at.length; i++) {
    const [a, b] = [at[i], at[(i + 1) % at.length]];
    const [eu, ey] = [b[0] - a[0], b[1] - a[1]];
    const cross = eu * (y - a[1]) - ey * (u - a[0]);
    d = Math.min(d, (Math.sign(area) * cross) / Math.hypot(eu, ey));
  }
  return d;
};

describe('the eagle emblem', () => {
  const [plate, ...pieces] = EAGLE;

  it('has its dark plate standing out past every piece on each side', () => {
    for (const { at } of pieces) {
      for (const p of at) {
        expect(depth(plate.at, p)).toBeGreaterThan(0.04);
      }
    }
  });

  it('leaves the plate bare under the beak, so no grey bars blur it there (the user, 2026-11-28)', () => {
    // Under the beak's tip, right of the feathers: the old bars' middle.
    const under = [(485 - 262) / 245, 1.95 - ((300 - 128) * 1.75) / 342];
    expect(depth(plate.at, under)).toBeGreaterThan(0);
    for (const { at } of pieces) {
      expect(depth(at, under)).toBeLessThan(0);
    }
  });
});
