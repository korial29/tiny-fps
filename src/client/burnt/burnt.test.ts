import { describe, expect, it } from 'vitest';
import { BEACH, EDGE, FIRES, HULL, ZED } from '../../shared/beach';
import { STRIDE } from '../mesh';
import { charred } from './charred';
import { CLEARING, broken } from './clearing';
import { blazes } from './fire';

describe('the burnt trees round the nose', () => {
  it('stand past the ghost wall, where nobody goes, round the nose', () => {
    for (const [x, z] of CLEARING) {
      expect(x).toBeGreaterThan(EDGE.east + 0.5);
      expect(Math.abs(z - ZED / 2)).toBeGreaterThan(HULL.r);
    }
  });

  it('burn here and there, drawn only: none is a fire of the map, so none burns anybody', () => {
    const b = blazes(BEACH);
    expect(b.length).toBeGreaterThan(4);
    expect(b.length).toBeLessThan(CLEARING.length);
    for (const [x, , , tall, r0, r1, k] of b) {
      expect(x).toBeGreaterThan(EDGE.east + 0.5);
      expect(tall).toBeLessThan(10);
      expect(r1).toBeGreaterThan(r0);
      expect(k).toBeGreaterThan(0.7);
    }
    expect(BEACH.fires).toHaveLength(FIRES.length);
  });

  it('puts each fire on its stump: on a low one’s break, at a tall one’s foot', () => {
    for (const f of blazes(BEACH)) {
      const hit = CLEARING.some(([x, z, s]) => {
        const { tall, top } = broken(x, 0, z, s);
        return tall < 2.2
          ? Math.hypot(f[0] - top[0], f[2] - top[2]) < 1e-9
          : Math.hypot(f[0] - x, f[2] - z) < 1e-9;
      });
      expect(hit).toBe(true);
    }
  });

  it('chars a trunk as whole flat triangles, rings jittered, capped at both ends', () => {
    const o: number[] = [];
    charred(
      o,
      [0, 0, 0],
      [0, 3, 0],
      [
        [0, 0.5],
        [0.5, 0.4],
        [1, 0.3],
      ],
      5,
      [0.05, 0.04, 0.04],
    );
    // Two rings of 7 quads, two triangles each, and two caps of 5.
    expect(o.length / (3 * STRIDE)).toBe(2 * 7 * 2 + 2 * 5);
    for (let i = 0; i < o.length; i += STRIDE) {
      expect(Math.hypot(o[i + 3], o[i + 4], o[i + 5])).toBeCloseTo(1, 6);
      expect(Math.hypot(o[i], o[i + 2])).toBeLessThan(0.5 * 1.21);
    }
  });
});
