import { describe, expect, it } from 'vitest';
import { TEX } from './types';
import { build, hidden, near, ray } from './world';
import type { Brush, WorldDef } from './world';
import { duo } from '../../test/teams';

type Vec3 = [number, number, number];

const brush = (min: Vec3, max: Vec3): Brush => ({ min, max, top: TEX.TILE, side: TEX.BRICK });
const def = (brushes: Brush[]): WorldDef => ({
  brushes,
  teams: duo([[0, 0, 0, 0]]),
  floor: -10,
  sun: { dir: [0, 1, 0], color: [1, 1, 1] },
  sky: [
    [0, 0, 1],
    [1, 1, 1],
  ],
});
/** A cheap deterministic generator in [0, 1). */
const rng = (seed: number) => () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

describe('build and near', () => {
  it('lists a brush in every cell its footprint covers, and in no other', () => {
    const w = build(def([brush([1, 0, 1], [9, 2, 5])]), 4);
    // x 1 to 9 is cells 0 to 2, z 1 to 5 is cells 0 and 1.
    expect(w.grid.size).toBe(6);
    expect([...w.grid.values()].every(l => l.length === 1 && l[0] === 0)).toBe(true);
  });

  it('puts a brush with negative coordinates in the cells below zero', () => {
    const w = build(def([brush([-5, 0, -5], [-1, 1, -1])]), 4);
    expect(near(w, -3, -3, 0.1)).toEqual([0]);
    expect(near(w, 3, 3, 0.1)).toEqual([]);
  });

  it('returns each brush once, however many cells it spans or the query touches', () => {
    const w = build(def([brush([0, 0, 0], [40, 1, 40]), brush([10, 0, 10], [11, 1, 11])]));
    const ids = near(w, 10.5, 10.5, 20);
    expect(ids.slice().sort()).toEqual([0, 1]);
  });

  it('finds every brush whose footprint overlaps the square, and misses the far ones', () => {
    const r = rng(7);
    const brushes = Array.from({ length: 60 }, () => {
      const [x, z] = [r() * 90 - 20, r() * 90 - 20];
      return brush([x, 0, z], [x + 0.2 + r() * 12, 1, z + 0.2 + r() * 12]);
    });
    const w = build(def(brushes));
    let far = 0;
    for (let n = 0; n < 300; n++) {
      const [x, z, q] = [r() * 90 - 20, r() * 90 - 20, r() * 3];
      const got = near(w, x, z, q);
      expect(new Set(got).size).toBe(got.length);
      brushes.forEach((b, i) => {
        const overlaps =
          b.min[0] <= x + q && b.max[0] >= x - q && b.min[2] <= z + q && b.max[2] >= z - q;
        if (overlaps) {
          expect(got, `query ${n}, brush ${i}`).toContain(i);
        }
        // More than a cell and a half from the square: never a candidate.
        if (b.min[0] > x + q + 8 || b.max[0] < x - q - 8) {
          far++;
          expect(got).not.toContain(i);
        }
      });
    }
    expect(far).toBeGreaterThan(1000);
  });

  it('is empty over empty ground', () => {
    expect(near(build(def([])), 0, 0, 5)).toEqual([]);
  });
});

describe('ray', () => {
  const w = build(
    def([
      // A box 2 m on a side with its corner at the origin, a thin wall 50 m east, a floor slab.
      brush([0, 0, 0], [2, 2, 2]),
      brush([50, 0, -5], [50.5, 3, 5]),
      brush([-100, -1, -100], [100, 0, 100]),
    ]),
  );

  it('hits the face it meets, at the distance to it', () => {
    // From the west at mid height: the x = 0 face.
    expect(ray(w, [-3, 1, 1], [1, 0, 0], 100)).toBeCloseTo(3);
    // From the north: the z = 0 face. From above: the top, 4 m up.
    expect(ray(w, [1, 1, -3], [0, 0, 1], 100)).toBeCloseTo(3);
    expect(ray(w, [1, 6, 1], [0, -1, 0], 100)).toBeCloseTo(4);
    // From the east: the x = 2 face, and not the wall behind it.
    expect(ray(w, [20, 1, 1], [-1, 0, 0], 100)).toBeCloseTo(18);
  });

  it('hits a face at a slant, at the true distance along the ray', () => {
    const d: Vec3 = [3 / 5, 0, 4 / 5];
    // Origin (-3, 1, -4) reaches x = 0 after 5 m, at z = 0: the corner edge, still a hit.
    expect(ray(w, [-3, 1, -4], d, 100)).toBeCloseTo(5);
    // Down and sideways onto the top: from (-0.5, 5, 1) the plane y = 2 is 3 m below, 3.75 m along
    // the ray, where x is 1.75.
    expect(ray(w, [-0.5, 5, 1], [0.6, -0.8, 0], 100)).toBeCloseTo(3.75);
  });

  it('travels through the grid to a brush many cells away', () => {
    expect(ray(w, [10, 1, 0], [1, 0, 0], 100)).toBeCloseTo(40);
    expect(ray(w, [10, 1, 0], [1, 0, 0], 30)).toBe(30);
  });

  it('misses a box beside the ray, above it and behind it', () => {
    expect(ray(w, [-3, 1, 3], [1, 0, 0], 20)).toBe(20);
    expect(ray(w, [-3, 2.5, 1], [1, 0, 0], 20)).toBe(20);
    expect(ray(w, [-3, 1, 1], [-1, 0, 0], 20)).toBe(20);
  });

  it('returns max when the first hit is beyond it, and also when max ends on the face', () => {
    expect(ray(w, [-3, 1, 1], [1, 0, 0], 2)).toBe(2);
    expect(ray(w, [-3, 1, 1], [1, 0, 0], 3)).toBe(3);
  });

  it('hits at 0 from inside a box, and not at all from a face, moving away from it', () => {
    expect(ray(w, [1, 1, 1], [1, 0, 0], 10)).toBe(0);
    // Standing on the top: looking up leaves the box, looking down is into it, and a ray along
    // the face grazes it.
    expect(ray(w, [1, 2, 1], [0, 1, 0], 10)).toBe(10);
    expect(ray(w, [1, 2, 1], [0, -1, 0], 10)).toBe(0);
    expect(ray(w, [1, 2, 1], [1, 0, 0], 10)).toBe(0);
  });

  it('takes the nearest of several brushes', () => {
    const v = build(def([brush([5, 0, 0], [6, 1, 1]), brush([2, 0, 0], [3, 1, 1])]));
    expect(ray(v, [0, 0.5, 0.5], [1, 0, 0], 50)).toBeCloseTo(2);
  });

  it('is exact against a brute-force slab test over random rays', () => {
    const r = rng(11);
    const brushes = Array.from({ length: 40 }, () => {
      const [x, y, z] = [r() * 80 - 40, r() * 20, r() * 80 - 40];
      return brush([x, y, z], [x + 0.3 + r() * 8, y + 0.3 + r() * 8, z + 0.3 + r() * 8]);
    });
    const v = build(def(brushes));
    const slow = (o: Vec3, d: Vec3, max: number): number => {
      let best = max;
      for (const b of brushes) {
        let [lo, hi] = [0, best];
        for (let a = 0; a < 3; a++) {
          const [t0, t1] = [(b.min[a] - o[a]) / d[a], (b.max[a] - o[a]) / d[a]];
          lo = Math.max(lo, Math.min(t0, t1));
          hi = Math.min(hi, Math.max(t0, t1));
        }
        if (lo <= hi) {
          best = Math.min(best, lo);
        }
      }
      return best;
    };
    let hits = 0;
    for (let n = 0; n < 2000; n++) {
      const o: Vec3 = [r() * 100 - 50, r() * 30 - 5, r() * 100 - 50];
      const raw: Vec3 = [r() - 0.5, r() - 0.5, r() - 0.5];
      const len = Math.hypot(...raw);
      const d = raw.map(c => c / len) as Vec3;
      const max = 5 + r() * 120;
      const [got, want] = [ray(v, o, d, max), slow(o, d, max)];
      hits += +(want < max);
      expect(got, `ray ${n}`).toBeCloseTo(want, 6);
    }
    expect(hits).toBeGreaterThan(100);
  });

  it('stops when it leaves the keyed range, even with an infinite max', () => {
    expect(ray(w, [0, 5, 0], [1, 0, 0], Infinity)).toBe(Infinity);
  });
});

describe('hidden', () => {
  const w = build(def([brush([0, 0, 0], [2, 2, 2])]));

  it('is true across a brush, false in the clear', () => {
    expect(hidden(w, [-3, 1, 1], [5, 1, 1])).toBe(true);
    expect(hidden(w, [-3, 1, 1], [-1, 1, 1])).toBe(false);
    expect(hidden(w, [-3, 3, 1], [5, 3, 1])).toBe(false);
    expect(hidden(w, [1, 5, 1], [1, -5, 1])).toBe(true);
  });

  it('does not hide a point lying on the face it looks at, or a point on top of itself', () => {
    expect(hidden(w, [-3, 1, 1], [0, 1, 1])).toBe(false);
    expect(hidden(w, [-3, 1, 1], [0.5, 1, 1])).toBe(true);
    expect(hidden(w, [4, 4, 4], [4, 4, 4])).toBe(false);
  });

  it('is symmetric', () => {
    const [a, b]: [Vec3, Vec3] = [
      [-3, 0.5, -3],
      [6, 1.5, 7],
    ];
    expect(hidden(w, a, b)).toBe(hidden(w, b, a));
  });
});
