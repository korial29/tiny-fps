import { describe, expect, it } from 'vitest';
import { STRIDE } from './mesh';
import type { Vec3 } from './mesh';
import { LIFE, createTrail } from './trail';

const drawn = (t: ReturnType<typeof createTrail>) => {
  const out: number[] = [];
  t.draw(out);
  expect(out.length % (3 * STRIDE)).toBe(0);
  return Array.from({ length: out.length / STRIDE }, (_, i) =>
    out.slice(i * STRIDE, (i + 1) * STRIDE),
  );
};
/** A blade at x, swinging along +x: the root at the origin side, the point 0.8 m out in z. */
const blade = (x: number): [Vec3, Vec3] => [
  [x, 1, 0],
  [x, 1, -0.8],
];
/** A trail that has marked `n` frames of a cut, 1/60 s apart. */
const cut = (n: number, t = createTrail()) => {
  for (let i = 0; i < n; i++) {
    t.update(1 / 60);
    t.mark(...blade(i * 0.1), true);
  }
  return t;
};

describe('the swing trail', () => {
  it('is nothing before a cut, and nothing from a blade at rest', () => {
    const t = createTrail();
    expect(drawn(t)).toEqual([]);
    t.mark(...blade(0), false);
    t.mark(...blade(1), false);
    expect(t.count).toBe(0);
    expect(drawn(t)).toEqual([]);
  });

  it('is a cyan ribbon from the point to a third of the way down the blade', () => {
    const t = cut(6);
    const v = drawn(t);
    // Five pieces of two triangles.
    expect(v).toHaveLength(5 * 6);
    for (const q of v) {
      // Glowing: layer -2, above 1, cyan.
      expect(q[8]).toBe(-2);
      expect(q[7]).toBeGreaterThan(1);
      expect(q[9]).toBeGreaterThan(q[6] * 2);
    }
    // The newest piece spans the point (z = -0.8) and the third of the blade down from it, at its freshest.
    const zs = v.slice(-6).map(q => q[2]);
    expect(Math.min(...zs)).toBeCloseTo(-0.8, 6);
    expect(Math.max(...zs)).toBeCloseTo(-0.8 + 0.8 / 3, 6);
  });

  it('fades in about 0.15 s: it narrows and dims, and is gone', () => {
    const t = cut(3);
    const width = () => {
      const v = drawn(t);
      return Math.max(...v.map(q => Math.abs(q[2] - -0.8)));
    };
    const light = () => Math.max(...drawn(t).map(q => q[7]));
    const [w0, l0] = [width(), light()];
    expect(LIFE).toBeCloseTo(0.15, 2);
    t.update(LIFE / 2);
    expect(width()).toBeLessThan(w0 * 0.75);
    expect(light()).toBeLessThan(l0);
    expect(drawn(t).length).toBeGreaterThan(0);
    t.update(LIFE);
    expect(t.count).toBe(0);
    expect(drawn(t)).toEqual([]);
  });

  it('keeps no more than its samples: a long cut drops the oldest', () => {
    const t = cut(200);
    expect(t.count).toBeLessThanOrEqual(24);
    expect(drawn(t).length).toBeLessThanOrEqual(23 * 6);
  });

  it('does not join one cut to the next', () => {
    const t = cut(3);
    t.mark(...blade(5), false);
    t.update(0.02);
    t.mark(...blade(9), true);
    t.mark(...blade(9.1), true);
    // Two pieces of the first cut and one of the second, not a ribbon across the gap.
    expect(drawn(t)).toHaveLength(3 * 6);
    const xs = drawn(t).map(q => q[0]);
    expect(xs.filter(x => x > 5).length).toBe(6);
    expect(xs.filter(x => x > 2.5 && x < 8)).toHaveLength(0);
  });
});
