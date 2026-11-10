import { describe, expect, it } from 'vitest';
import { armor } from './armor';
import { GLOSS, STRIDE } from './mesh';
import { JOINT as J, rest, solve } from './rig';
import { body } from './skin';

const S = solve(rest());
const draw = (lod: number) => {
  const v: number[] = [];
  armor(v, S.pos, S.rot, lod);
  return v;
};

describe('the armour', () => {
  for (const lod of [0, 1, 3]) {
    it(`is whole triangles with unit normals, white plates glossy on grey edges, at level ${lod}`, () => {
      const v = draw(lod);
      expect(v.length % (3 * STRIDE)).toBe(0);
      expect(v.every(Number.isFinite)).toBe(true);
      for (let i = 0; i < v.length; i += STRIDE) {
        expect(Math.hypot(v[i + 3], v[i + 4], v[i + 5])).toBeCloseTo(1, 4);
        expect([-1, GLOSS]).toContain(v[i + 8]);
      }
      expect(v.some((_, i) => i % STRIDE == 8 && v[i] == GLOSS)).toBe(true);
    });
  }

  it('stands off the skin at rest: no plate vertex inside the trunk or a limb', () => {
    // The skin's own vertices nearest each plate vertex lie further in (closer to the bone).
    const s = body(1);
    const skin = Array.from({ length: s.v.length / 6 }, (_, i) => [
      s.v[i * 6],
      s.v[i * 6 + 1],
      s.v[i * 6 + 2],
    ]);
    const v = draw(1);
    let close = 0;
    for (let i = 0; i < v.length; i += STRIDE * 7) {
      const p = [v[i], v[i + 1], v[i + 2]];
      const d = Math.min(...skin.map(q => Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2])));
      close += +(d < 0.003);
    }
    expect(close).toBe(0);
  });

  it('is on the chest, the belly, both thighs, both knees and both forearms', () => {
    const v = draw(1);
    const near = (j: number, r: number) => {
      for (let i = 0; i < v.length; i += STRIDE) {
        if (Math.hypot(...[0, 1, 2].map(k => v[i + k] - S.pos[j][k])) < r) {
          return true;
        }
      }
      return false;
    };
    for (const [j, r] of [
      [J.CHEST, 0.2],
      [J.SPINE, 0.18],
      [J.THIGH_L, 0.35],
      [J.THIGH_R, 0.35],
      [J.SHIN_L, 0.12],
      [J.SHIN_R, 0.12],
      [J.FOREARM_L, 0.2],
      [J.FOREARM_R, 0.2],
    ]) {
      expect(near(j, r)).toBe(true);
    }
  });
});
