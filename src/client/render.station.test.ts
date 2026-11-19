import { describe, expect, it } from 'vitest';
import { MOON } from '../shared/moon';
import { mouths, rooms } from '../shared/station';
import { build, ray } from '../shared/world';
import { cover, inView, viewProj } from './render';

const DEF = MOON.station!;
const world = build(MOON);
type Vec3 = [number, number, number];

/** Where the ray from o along the unit d crosses a mouth's plane inside it, or undefined. */
const through = (o: Vec3, d: Vec3): boolean =>
  mouths(DEF).some(q => {
    const z = q[0][2];
    const t = (z - o[2]) / d[2];
    if (!(t > 0)) {
      return false;
    }
    const [x, y] = [o[0] + d[0] * t, o[1] + d[1] * t];
    return x >= q[0][0] && x <= q[1][0] && y >= q[0][1] && y <= q[2][1];
  });

describe('the station is shut but for its mouths', () => {
  it('stops every ray from inside a room that does not leave by a mouth', () => {
    for (const [lo, hi] of rooms(DEF)) {
      const o: Vec3 = [(lo[0] + hi[0]) / 2, lo[1] + 1.6, (lo[2] + hi[2]) / 2];
      for (let i = 0; i < 400; i++) {
        // Directions spread over the sphere (a Fibonacci lattice).
        const y = 1 - (2 * (i + 0.5)) / 400;
        const r = Math.sqrt(1 - y * y);
        const a = i * 2.399963;
        const d: Vec3 = [r * Math.cos(a), y, r * Math.sin(a)];
        if (!through(o, d)) {
          expect(ray(world, o, d, 200)).toBeLessThan(200);
        }
      }
    }
  });
});

describe('cover', () => {
  const [lo, hi] = rooms(DEF)[0];
  const eye: Vec3 = [(lo[0] + hi[0]) / 2, lo[1] + 1.6, (lo[2] + hi[2]) / 2];

  it('is a mouth ahead, inside the target', () => {
    const r = cover(viewProj(eye, 0, 0, 16 / 9), mouths(DEF), 1600, 900)!;
    expect(r[2]).toBeGreaterThan(100);
    expect(r[0]).toBeGreaterThanOrEqual(0);
    expect(r[0] + r[2]).toBeLessThanOrEqual(1600);
    expect(r[1] + r[3]).toBeLessThanOrEqual(900);
  });

  it('is nothing facing a side wall, and reaches the edge for a mouth cut by the near plane', () => {
    expect(cover(viewProj(eye, Math.PI / 2, 0, 16 / 9), mouths(DEF), 1600, 900)).toBeUndefined();
    // Looking along the mouths' line from a corner: the near one's corners go behind the eye.
    const side = viewProj([lo[0] + 5, lo[1] + 5, lo[2] + 0.5], -Math.PI / 2 - 0.3, 0, 16 / 9);
    const r = cover(side, mouths(DEF), 1600, 900)!;
    expect(r[0] === 0 || r[0] + r[2] === 1600).toBe(true);
  });
});

describe('inView', () => {
  const m = viewProj([0, 0, 0], 0, 0, 16 / 9);
  it('keeps a light ahead and one behind that reaches round the eye, drops one behind', () => {
    expect(inView(m, [0, 0, -20], 5)).toBe(true);
    expect(inView(m, [0, 0, 20], 5)).toBe(false);
    expect(inView(m, [0, 0, 20], 25)).toBe(true);
    expect(inView(m, [60, 0, -1], 5)).toBe(false);
  });
});
