import { describe, expect, it } from 'vitest';
import { GAP, REGIONS, armor } from './armor';
import { GLOSS, STRIDE } from './mesh';
import { rest, solve } from './rig';
import { body, palette, skin } from './skin';

/** The skin at rest drawn, then the armour cut out of it: [the skin's floats, the armour's]. */
const draw = (lod: number) => {
  const out: number[] = [];
  const s = body(lod);
  skin(out, s, solve(rest()), palette([0.9, 0.2, 0.1], undefined, undefined, true));
  const n = out.length;
  armor(out, 0, s);
  return [out.slice(0, n), out.slice(n)];
};

describe('the armour', () => {
  for (const lod of [0, 1, 3]) {
    it(`is whole triangles with unit normals, glossy plates on dark edges, at level ${lod}`, () => {
      const [, v] = draw(lod);
      expect(v.length).toBeGreaterThan(0);
      expect(v.length % (3 * STRIDE)).toBe(0);
      expect(v.every(Number.isFinite)).toBe(true);
      for (let i = 0; i < v.length; i += STRIDE) {
        expect(Math.hypot(v[i + 3], v[i + 4], v[i + 5])).toBeCloseTo(1, 4);
        expect([-1, GLOSS]).toContain(v[i + 8]);
      }
    });
  }

  it('leaves the gap the user asked between the chest plate and the belly plates', () => {
    const [, v] = draw(3);
    // The plates' white at the front, by height: none within the gaps.
    const ys: number[] = [];
    for (let i = 0; i < v.length; i += STRIDE) {
      if (v[i + 8] == GLOSS && Math.abs(v[i]) < 0.08 && v[i + 2] < 0) {
        ys.push(v[i + 1]);
      }
    }
    const [chest, upper, lower] = REGIONS;
    expect(chest.y[0] - upper.y[1]).toBeCloseTo(GAP, 6);
    expect(upper.y[0] - lower.y[1]).toBeCloseTo(GAP, 6);
    for (const [lo, hi] of [
      [upper.y[1], chest.y[0]],
      [lower.y[1], upper.y[0]],
    ]) {
      // The plates stand off the skin along its normals, which tilt a few millimetres.
      expect(ys.filter(y => y > lo + 0.003 && y < hi - 0.003)).toEqual([]);
    }
    expect(ys.some(y => y > chest.y[0])).toBe(true);
    expect(ys.some(y => y < upper.y[1] && y > upper.y[0])).toBe(true);
  });

  it('stands off the skin it is cut from, on the body: the chest, belly, thighs, knees, forearms', () => {
    const [, v] = draw(1);
    const hit = (f: (x: number, y: number, z: number) => boolean) => {
      for (let i = 0; i < v.length; i += STRIDE) {
        if (f(v[i], v[i + 1], v[i + 2])) {
          return true;
        }
      }
      return false;
    };
    expect(hit((x, y, z) => y > 1.3 && z < -0.12 && Math.abs(x) < 0.05)).toBe(true);
    expect(hit((_x, y, z) => y < 1.1 && y > 1.04 && z < -0.12)).toBe(true);
    for (const s of [-1, 1]) {
      expect(hit((x, y) => x * s > 0.05 && y > 0.65 && y < 0.8)).toBe(true);
      expect(hit((x, y) => x * s > 0.05 && y > 0.48 && y < 0.55)).toBe(true);
      expect(hit((x, y) => x * s > 0.24 && y > 1.03 && y < 1.12)).toBe(true);
    }
    // Nothing on the head, the back, the gloves or the boots.
    expect(hit((_x, y) => y > 1.56)).toBe(false);
    expect(hit((_x, y) => y < 0.44)).toBe(false);
  });
});
