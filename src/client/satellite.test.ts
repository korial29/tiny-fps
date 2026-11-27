import { describe, expect, it } from 'vitest';
import { MOON } from '../shared/moon';
import { STRIDE } from './mesh';
import { satellite } from './satellite';

const def = MOON.station!;
const v = satellite(def);
const points = Array.from({ length: v.length / STRIDE }, (_, i) =>
  v.slice(i * STRIDE, i * STRIDE + STRIDE),
);

describe('the satellite round the station', () => {
  it('is whole triangles, finite, and keeps out of the hangar and its mouths', () => {
    expect(v.length % (3 * STRIDE)).toBe(0);
    expect(v.every(Number.isFinite)).toBe(true);
    const [lo] = def.hall;
    const { deck } = def;
    const into = points.filter(
      ([x, y]) => x > lo[0] + 4.1 && x < lo[0] + 43.9 && y > deck + 0.1 && y < deck + 13.9,
    );
    expect(into).toEqual([]);
  });

  it('stands its cylinder round the station, the cannon under it, its glowing lens at the muzzle', () => {
    const [cx, y0, cz, y1] = def.hull;
    const wall = points.filter(([, y]) => y >= y0 && y <= y1);
    expect(Math.max(...wall.map(([x, , z]) => Math.hypot(x - cx, z - cz)))).toBeGreaterThan(43.9);
    // The lens by its red; the hull's lit windows glow too.
    const lens = points.filter(p => p[8] === -2 && p[6] > 2 * p[7]);
    expect(lens.length).toBeGreaterThan(0);
    for (const [x, y, z] of lens) {
      expect(Math.hypot(x - def.gun[0], z - def.gun[2])).toBeLessThan(28);
      expect(y - def.gun[1]).toBeGreaterThan(9);
      expect(y - def.gun[1]).toBeLessThan(11);
    }
    expect([def.gun[0], def.gun[2]]).toEqual([cx, cz]);
    expect(def.gun[1]).toBeLessThan(y0 - 40);
  });

  it('is the same seen from either base: mirrored across the station', () => {
    const zc = (def.hall[0][2] + def.hall[1][2]) / 2;
    const key = (x: number, y: number, z: number) =>
      `${x.toFixed(2)} ${y.toFixed(2)} ${z.toFixed(2)}`;
    const all = new Set(points.map(([x, y, z]) => key(x, y, z)));
    const off = points.filter(([x, y, z]) => !all.has(key(x, y, 2 * zc - z)));
    expect(off.length / points.length).toBeLessThan(0.02);
  });
});
