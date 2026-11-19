import { describe, expect, it } from 'vitest';
import { SASH, armor } from './armor';
import { BUCKLE, BUCKLE_Y, ENDS, buckle, tails } from './buckle';
import { SHINE, STRIDE } from './mesh';
import { JOINT as J, rest, solve } from './rig';
import { body, palette, skin } from './skin';

describe("the knot of the ninja's sash (the user, 2026-11-17: a redesign of his belt)", () => {
  for (const build of [0, 1]) {
    const who = build ? 'on her' : 'on him';
    const s = solve(rest([0, 0, 0], 0, build));
    const out: number[] = [];
    buckle(out, s.pos[J.PELVIS], s.rot[J.PELVIS], build);
    const all = Array.from({ length: out.length / STRIDE }, (_, i) =>
      out.slice(i * STRIDE, i * STRIDE + STRIDE),
    );
    // The knot on the middle of the front; the blades on the right hip.
    const pts = all.filter(p => Math.abs(p[0]) < 0.04);
    const blades = all.filter(p => p[0] > 0.05);

    it(`is a flat knot in the sash's grey, no wider than the lame's cut over it, ${who}`, () => {
      const span = (j: number) => Math.max(...pts.map(p => p[j])) - Math.min(...pts.map(p => p[j]));
      expect(span(0)).toBeGreaterThan(0.04);
      expect(span(0)).toBeLessThan(BUCKLE[0] * 2 + 1e-6);
      expect(span(1)).toBeLessThan(BUCKLE[0] * 2);
      // Grey all over: no red, green or blue stands out of it.
      expect(pts.every(p => Math.abs(p[6] - p[7]) < 0.02 && Math.abs(p[7] - p[9]) < 0.03)).toBe(
        true,
      );
    });

    it(`has the vest's last lame cut round over it, ${who} (they met; the user: fix the armour)`, () => {
      const plated: number[] = [];
      const sk = body(1, build);
      skin(plated, sk, s, palette([0.9, 0.2, 0.1]));
      const n = plated.length;
      armor(plated, 0, sk, true, [0.9, 0.2, 0.1], true, [0.1, 0.7, 0.3]);
      let near = Infinity;
      for (let i = n; i < plated.length; i += STRIDE) {
        // The sash in its own grey, left out: the knot is on it.
        if (plated[i + 2] < 0 && plated[i + 7] != SASH[1]) {
          near = Math.min(near, Math.hypot(plated[i], plated[i + 1] - BUCKLE_Y));
        }
      }
      expect(near).toBeGreaterThan(BUCKLE[0] + 0.01);
    });

    it(`stands on the front of the sash, out of the skin, ${who}`, () => {
      const bare: number[] = [];
      skin(bare, body(1, build), s, palette([1, 1, 1]));
      let front = 0;
      for (let i = 0; i < bare.length; i += STRIDE) {
        if (Math.abs(bare[i]) < 0.03 && Math.abs(bare[i + 1] - 1.0) < 0.03) {
          front = Math.min(front, bare[i + 2]);
        }
      }
      expect(Math.min(...pts.map(p => p[2]))).toBeLessThan(front - 0.006);
      expect(Math.max(...pts.map(p => p[2]))).toBeGreaterThan(front - 0.012);
    });

    it(`has three blades tucked in at the right hip, polished, point down, ${who}`, () => {
      const steel = blades.filter(p => p[8] == SHINE);
      expect(steel.length).toBeGreaterThan(0);
      // Three of them across the hip: their points, the lowest of each, apart.
      const low = Math.min(...steel.map(p => p[1]));
      const tips = steel.filter(p => p[1] < low + 0.012).map(p => Math.round(p[0] * 100));
      expect(new Set(tips).size).toBeGreaterThanOrEqual(3);
      // From over the sash's top to under its bottom, on the front of the body.
      expect(Math.max(...blades.map(p => p[1])) - low).toBeGreaterThan(0.1);
      expect(blades.every(p => p[2] < 0)).toBe(true);
    });

    it(`has two long ends that float, further out the faster he goes, ${who}`, () => {
      const draw = (t: number, speed: number) => {
        const v: number[] = [];
        tails(v, s.pos[J.PELVIS], s.rot[J.PELVIS], build, t, speed);
        return Array.from({ length: v.length / STRIDE }, (_, i) =>
          v.slice(i * STRIDE, i * STRIDE + STRIDE),
        );
      };
      const [still, later, fast] = [draw(0, 0), draw(0.7, 0), draw(0, 8)];
      expect(still.length % 3).toBe(0);
      expect(still.every(p => p.every(Number.isFinite))).toBe(true);
      // They hang about as far as they are long, under the knot.
      const drop = (ps: number[][]) => BUCKLE_Y - Math.min(...ps.map(p => p[1]));
      expect(drop(still)).toBeGreaterThan(Math.max(...ENDS.map(e => e[2])) * 0.85);
      // They move with time, and fly out in front of him as he runs.
      expect(later.some((p, i) => Math.abs(p[0] - still[i][0]) > 1e-3)).toBe(true);
      const front = (ps: number[][]) => Math.min(...ps.map(p => p[2]));
      expect(front(fast)).toBeLessThan(front(still) - 0.05);
      expect(drop(fast)).toBeLessThan(drop(still));
    });
  }
});
