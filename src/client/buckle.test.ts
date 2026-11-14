import { describe, expect, it } from 'vitest';
import { armor } from './armor';
import { BUCKLE, BUCKLE_Y, buckle } from './buckle';
import { STRIDE } from './mesh';
import { JOINT as J, rest, solve } from './rig';
import { body, palette, skin } from './skin';

describe("the ninja's belt buckle (the user, 2026-11-13)", () => {
  for (const build of [0, 1]) {
    const s = solve(rest([0, 0, 0], 0, build));
    const out: number[] = [];
    buckle(out, s.pos[J.PELVIS], s.rot[J.PELVIS], build, [0.9, 0.1, 0.1]);
    const pts = Array.from({ length: out.length / STRIDE }, (_, i) =>
      out.slice(i * STRIDE, i * STRIDE + 3),
    );
    const span = (j: number) => Math.max(...pts.map(p => p[j])) - Math.min(...pts.map(p => p[j]));

    it(`is round and bigger than the belt is high, ${build ? 'on her' : 'on him'}`, () => {
      expect(span(0)).toBeCloseTo(span(1), 3);
      expect(span(0)).toBeGreaterThan(0.055);
      expect(BUCKLE[0] * 2).toBeGreaterThan(0.04);
    });

    it(`has the vest's last lame cut round over it, ${build ? 'on her' : 'on him'} (they met; the user: fix the armour)`, () => {
      const plated: number[] = [];
      const sk = body(1, build);
      skin(plated, sk, s, palette([0.9, 0.2, 0.1]));
      const n = plated.length;
      // The belt in a colour of its own, left out: the buckle is on it.
      armor(plated, 0, sk, true, [0.9, 0.2, 0.1], true, [0.1, 0.7, 0.3]);
      let near = Infinity;
      for (let i = n; i < plated.length; i += STRIDE) {
        if (plated[i + 2] < 0 && plated[i + 7] != 0.7) {
          near = Math.min(near, Math.hypot(plated[i], plated[i + 1] - BUCKLE_Y));
        }
      }
      expect(near).toBeGreaterThan(BUCKLE[0] + 0.01);
    });

    it(`stands on the front of the belt, out of the skin, ${build ? 'on her' : 'on him'}`, () => {
      const bare: number[] = [];
      skin(bare, body(1, build), s, palette([1, 1, 1]));
      let front = 0;
      for (let i = 0; i < bare.length; i += STRIDE) {
        if (Math.abs(bare[i]) < 0.03 && Math.abs(bare[i + 1] - 1.0) < 0.03) {
          front = Math.min(front, bare[i + 2]);
        }
      }
      expect(Math.min(...pts.map(p => p[2]))).toBeLessThan(front - 0.006);
      expect(Math.max(...pts.map(p => p[2]))).toBeGreaterThan(front - 0.003);
    });
  }
});
