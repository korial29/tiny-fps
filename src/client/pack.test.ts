import { describe, expect, it } from 'vitest';
import { GLOW } from './flag';
import { GLOSS, STRIDE } from './mesh';
import type { Vec3 } from './mesh';
import { shrunk } from './helmet';
import { HOSE, PACK, hose, pack, shoulders } from './pack';
import { JOINT as J, axis, rest, solve, turn } from './rig';
import type { Quat } from './rig';

const S = solve(rest());
const TEAM = [0.9, 0.2, 0.1];
const at = (v: number[], i: number): Vec3 => [v[i], v[i + 1], v[i + 2]];
const each = (v: number[], f: (i: number) => void) => {
  for (let i = 0; i < v.length; i += STRIDE) {
    f(i);
  }
};
const sound = (v: number[]) => {
  expect(v.length % (3 * STRIDE)).toBe(0);
  expect(v.every(Number.isFinite)).toBe(true);
  each(v, i => expect(Math.hypot(v[i + 3], v[i + 4], v[i + 5])).toBeCloseTo(1, 4));
};

describe('the life support pack', () => {
  for (const lod of [0, 1, 3]) {
    it(`is whole, glossy, behind the chest and within its box at level ${lod}`, () => {
      const v: number[] = [];
      pack(v, S.pos[J.CHEST], S.rot[J.CHEST], TEAM, lod);
      sound(v);
      expect(v.some((_, i) => i % STRIDE == 8 && v[i] == GLOSS)).toBe(true);
      each(v, i => {
        const [x, y, z] = at(v, i).map((w, k) => w - S.pos[J.CHEST][k]);
        // Behind the back (+z), within its box and the port on top.
        expect(z).toBeGreaterThan(PACK.c[2] - PACK.r[2] - 0.01);
        expect(Math.abs(x)).toBeLessThan(PACK.r[0] + 0.01);
        expect(Math.abs(y - PACK.c[1])).toBeLessThan(PACK.r[1] + 0.02);
      });
    });
  }

  it('glows in the team colour near, not far', () => {
    const [near, far]: number[][] = [[], []];
    pack(near, S.pos[J.CHEST], S.rot[J.CHEST], TEAM, 1);
    pack(far, S.pos[J.CHEST], S.rot[J.CHEST], TEAM, 0);
    const lit = (v: number[]) => v.filter((_, i) => i % STRIDE == 8 && v[i] == -2).length;
    expect(lit(near)).toBeGreaterThan(0);
    each(near, i => near[i + 8] == -2 && expect(near[i + 6]).toBeCloseTo(TEAM[0] * GLOW, 5));
    expect(lit(far)).toBe(0);
  });

  it('turns with the chest', () => {
    const q = axis([0, 1, 0], Math.PI / 2);
    const [a, b]: number[][] = [[], []];
    pack(a, [0, 0, 0], [0, 0, 0, 1], TEAM, 1);
    pack(b, [0, 0, 0], q, TEAM, 1);
    each(a, i => {
      const w = turn(q, at(a, i));
      [0, 1, 2].forEach(k => expect(b[i + k]).toBeCloseTo(w[k], 5));
    });
  });
});

describe('the breathing hose', () => {
  const draw = (lod: number, hq: Quat = S.rot[J.HEAD]) => {
    const v: number[] = [];
    hose(v, S.pos[J.HEAD], hq, S.pos[J.CHEST], S.rot[J.CHEST], lod);
    return v;
  };

  it('runs from under the helmet to the pack, one only, none far', () => {
    expect(draw(0)).toEqual([]);
    for (const lod of [1, 3]) {
      const v = draw(lod);
      sound(v);
      const from = turn(S.rot[J.HEAD], shrunk(HOSE.from)).map((w, k) => w + S.pos[J.HEAD][k]);
      const to = turn(S.rot[J.CHEST], HOSE.to).map((w, k) => w + S.pos[J.CHEST][k]);
      const near = (p: number[]) => {
        let best = Infinity;
        each(v, i => (best = Math.min(best, Math.hypot(...at(v, i).map((w, k) => w - p[k])))));
        return best;
      };
      expect(near(from)).toBeLessThan(HOSE.r * 1.5);
      expect(near(to)).toBeLessThan(HOSE.r * 1.5);
      // On the right side only.
      each(v, i => expect(v[i] - S.pos[J.CHEST][0]).toBeGreaterThan(0));
    }
  });

  it('follows the head as it turns', () => {
    expect(draw(1, axis([0, 1, 0], 0.6))).not.toEqual(draw(1));
  });
});

describe('the shoulder pads', () => {
  it('cover both shoulders, glossy, whole', () => {
    for (const lod of [0, 1, 3]) {
      const v: number[] = [];
      shoulders(
        v,
        [J.ARM_L, J.ARM_R].map(j => [S.pos[j], S.rot[j]] as [Vec3, Quat]),
        lod,
      );
      sound(v);
      each(v, i => expect(v[i + 8]).toBe(GLOSS));
      const half = v.length / 2;
      // The first over the left shoulder, the second over the right, each near its joint.
      [J.ARM_L, J.ARM_R].forEach((j, n) => {
        for (let i = n * half; i < (n + 1) * half; i += STRIDE) {
          expect(Math.hypot(...at(v, i).map((w, k) => w - S.pos[j][k]))).toBeLessThan(0.25);
        }
      });
    }
  });
});
