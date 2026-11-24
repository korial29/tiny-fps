import { describe, expect, it } from 'vitest';
import { BELT, SASH, armor } from './armor';
import { SHINE, STRIDE } from './mesh';
import { JOINT as J, axis, mul, rest, solve } from './rig';
import { HIPS, SASH_Y, SKIRT, TABARD, blades, drape } from './sash';
import { body, palette, skin } from './skin';

const RED = [0.9, 0.2, 0.1];
const rows = (v: number[]) =>
  Array.from({ length: v.length / STRIDE }, (_, i) => v.slice(i * STRIDE, i * STRIDE + STRIDE));
/** The tabard's quilting is in the team's colour, its edge and the skirt black. */
const red = (p: number[]) => p[6] > p[7] * 2;

describe("what hangs from the ninja's sash (the user, 2026-11-24: a wide pleated sash, a quilted tabard, a black skirt)", () => {
  for (const build of [0, 1]) {
    const who = build ? 'on her' : 'on him';
    const pose = rest([0, 0, 0], 0, build);
    const s = solve(pose);
    const draw = (lod: number, t = 0, speed = 0, at = s) => {
      const v: number[] = [];
      drape(v, at, build, t, speed, RED, lod);
      return rows(v);
    };

    it(`wears a wide sash in the pads' grey, from the hips up over the vest's bottom, ${who}`, () => {
      const plated: number[] = [];
      const sk = body(1, build);
      skin(plated, sk, s, palette(RED));
      const n = plated.length;
      armor(plated, 0, sk, true, RED, true, RED, true);
      // With no armour (`bare`) the sash alone is drawn.
      const sash = rows(plated.slice(n));
      expect(sash.length).toBeGreaterThan(100);
      expect(sash.every(p => p[6] == SASH[0] && p[7] == SASH[1] && p[9] == SASH[2])).toBe(true);
      const ys = sash.map(p => p[1]);
      expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(BELT.h);
      expect(Math.min(...ys)).toBeLessThan(BELT.y + 0.01);
      // All round the waist.
      expect(sash.some(p => p[2] < -0.1) && sash.some(p => p[2] > 0.1)).toBe(true);
    });

    it(`has three blades tucked in at the right hip, polished, point down, ${who}`, () => {
      const out: number[] = [];
      blades(out, s.pos[J.PELVIS], s.rot[J.PELVIS], build);
      const all = rows(out);
      const steel = all.filter(p => p[8] == SHINE);
      expect(steel.length).toBeGreaterThan(0);
      expect(all.every(p => p[0] > 0.05)).toBe(true);
      // Three of them across the hip: their points, the lowest of each, apart.
      const low = Math.min(...steel.map(p => p[1]));
      const tips = steel.filter(p => p[1] < low + 0.012).map(p => Math.round(p[0] * 100));
      expect(new Set(tips).size).toBeGreaterThanOrEqual(3);
      // From over the sash's middle to under it, on the front of the body.
      expect(Math.max(...all.map(p => p[1]))).toBeGreaterThan(SASH_Y + 0.03);
      expect(Math.max(...all.map(p => p[1])) - low).toBeGreaterThan(0.1);
      expect(all.every(p => p[2] < 0)).toBe(true);
    });

    it(`hangs a quilted tabard down the middle of the front, edged in black, ${who}`, () => {
      const all = draw(3);
      expect(all.length % 3).toBe(0);
      expect(all.every(p => p.every(Number.isFinite))).toBe(true);
      const quilt = all.filter(red);
      const span = (ps: number[][], j: number) =>
        Math.max(...ps.map(p => p[j])) - Math.min(...ps.map(p => p[j]));
      // As wide as it is less its edge, as long, in front of the body.
      expect(span(quilt, 0)).toBeCloseTo(TABARD.w - 2 * TABARD.edge, 3);
      expect(span(quilt, 1)).toBeGreaterThan(TABARD.len * 0.9);
      expect(quilt.every(p => p[2] < -0.1)).toBe(true);
      // Quilted: its diamonds puff out, their middles lighter than their seams.
      expect(new Set(quilt.map(p => Math.round(p[6] * 100))).size).toBeGreaterThan(1);
      // The black edge down both sides, wider than the quilting.
      const edge = all.filter(p => !red(p) && p[2] < -0.1 && Math.abs(p[0]) < TABARD.w / 2 + 1e-6);
      expect(span(edge, 0)).toBeCloseTo(TABARD.w, 3);
    });

    it(`hangs a black skirt round the hips and the back, open in front, ${who}`, () => {
      const cloth = draw(3).filter(p => !red(p) && Math.abs(p[0]) > TABARD.w / 2 + 1e-6);
      expect(cloth.length).toBeGreaterThan(100);
      // Behind him and on both hips, down the thighs.
      expect(cloth.some(p => p[2] > 0.12)).toBe(true);
      expect(cloth.some(p => p[0] > 0.18) && cloth.some(p => p[0] < -0.18)).toBe(true);
      const low = Math.min(...cloth.map(p => p[1]));
      expect(s.pos[J.PELVIS][1] + HIPS.y - low).toBeGreaterThan(SKIRT.len * 0.85);
    });

    it(`keeps the skirt narrow at the sides, inside the hands that hang there, ${who}`, () => {
      // The user, 2026-11-24: the hands went through it. A hand at rest hangs with its palm
      // 22.5 cm from the body's middle, on him and on her; the skirt was 25 cm wide there.
      for (const lod of [0, 1, 3]) {
        for (let t = 0; t < 3; t += 0.25) {
          const cloth = draw(lod, t).filter(p => !red(p) && p[6] > 0.08);
          expect(Math.max(...cloth.map(p => Math.abs(p[0])))).toBeLessThan(0.223);
        }
      }
      // And still outside the hips.
      const wide = Math.max(...draw(3).map(p => Math.abs(p[0])));
      expect(wide).toBeGreaterThan(HIPS.hips[build][0]);
    });

    it(`keeps the cloth out of a thigh that comes up, ${who}`, () => {
      // The left thigh raised forward, as in a stride.
      const up = rest([0, 0, 0], 0, build);
      up.rot[J.THIGH_L] = mul(up.rot[J.THIGH_L], axis([1, 0, 0], 1.1));
      const lifted = solve(up);
      const knee = lifted.pos[J.SHIN_L];
      expect(knee[2]).toBeLessThan(-0.3);
      const front = (ps: number[][]) => Math.min(...ps.filter(red).map(p => p[2]));
      const [still, raised] = [draw(3), draw(3, 0, 0, lifted)];
      expect(front(raised)).toBeLessThan(front(still) - 0.1);
      // No point of it inside the thigh: nearer its line than its thinnest radius.
      const hip = lifted.pos[J.THIGH_L];
      const e = knee.map((x, j) => x - hip[j]);
      const near = Math.min(
        ...raised.map(p => {
          const w = [p[0] - hip[0], p[1] - hip[1], p[2] - hip[2]];
          const t = Math.min(
            Math.max(
              (w[0] * e[0] + w[1] * e[1] + w[2] * e[2]) / (e[0] ** 2 + e[1] ** 2 + e[2] ** 2),
              0,
            ),
            1,
          );
          return Math.hypot(w[0] - e[0] * t, w[1] - e[1] * t, w[2] - e[2] * t);
        }),
      );
      expect(near).toBeGreaterThan(HIPS.thigh[1]);
    });

    it(`moves with time and trails as he runs, ${who}`, () => {
      const [still, later, fast] = [draw(3), draw(3, 0.7), draw(3, 0, 8)];
      expect(later.some((p, i) => Math.abs(p[2] - still[i][2]) > 1e-4)).toBe(true);
      // Running, the skirt's back flies out behind him.
      const back = (ps: number[][]) => Math.max(...ps.map(p => p[2]));
      expect(back(fast)).toBeGreaterThan(back(still) + 0.03);
    });

    it(`is a quarter of its vertices far away, ${who}`, () => {
      const [close, near, far] = [draw(3), draw(1), draw(0)];
      expect(near.length).toBeLessThanOrEqual(close.length);
      expect(far.length).toBeLessThan(close.length / 4);
      console.log(
        `drape ${who}: close ${close.length}, near ${near.length}, far ${far.length} vertices`,
      );
    });
  }
});
