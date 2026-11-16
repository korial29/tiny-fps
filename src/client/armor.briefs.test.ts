import { describe, expect, it } from 'vitest';
import {
  ASTRO_DETAILS,
  BRIEFS,
  DETAILS,
  MARINE_DETAILS,
  NINJA_DETAILS,
  SEAT,
  THIGH,
  armor,
} from './armor';
import { GLOSS, STRIDE } from './mesh';
import { rest, solve } from './rig';
import { body, palette, skin } from './skin';

/** The skin at rest drawn, then the armour cut out of it: [the skin's floats, the armour's]. */
const draw = (lod: number, build = 0) => {
  const out: number[] = [];
  const s = body(lod, build);
  skin(
    out,
    s,
    solve(rest([0, 0, 0], 0, build)),
    palette([0.9, 0.2, 0.1], undefined, undefined, true),
  );
  const n = out.length;
  armor(out, 0, s);
  return [out.slice(0, n), out.slice(n)];
};

describe('the armour', () => {
  describe('the briefs (the user, 2026-11-12: thinner on the sides, no glitches)', () => {
    /** Whether a ray out from the trunk's axis at angle `t` (degrees from the front, + to the right) and height `y` meets a plate's face. */
    const plated =
      (v: number[], cloth = false) =>
      (t: number, y: number) => {
        const r = (t * Math.PI) / 180;
        const d = [Math.sin(r), 0, -Math.cos(r)];
        const o = [0, y, 0.0];
        for (let i = 0; i < v.length; i += 3 * STRIDE) {
          // A plate's face, or the gusset's dark cloth (the walls and the scratches are paler).
          if (cloth ? v[i + 8] == GLOSS || v[i + 6] > 0.15 : v[i + 8] != GLOSS) {
            continue;
          }
          const [a, b, c] = [0, 1, 2].map(k => [0, 1, 2].map(j => v[i + k * STRIDE + j]));
          const e1 = b.map((q, j) => q - a[j]);
          const e2 = c.map((q, j) => q - a[j]);
          const p = [
            d[1] * e2[2] - d[2] * e2[1],
            d[2] * e2[0] - d[0] * e2[2],
            d[0] * e2[1] - d[1] * e2[0],
          ];
          const det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
          if (Math.abs(det) < 1e-12) {
            continue;
          }
          const s = o.map((q, j) => q - a[j]);
          const u = (s[0] * p[0] + s[1] * p[1] + s[2] * p[2]) / det;
          const q = [
            s[1] * e1[2] - s[2] * e1[1],
            s[2] * e1[0] - s[0] * e1[2],
            s[0] * e1[1] - s[1] * e1[0],
          ];
          const w = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) / det;
          const h = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) / det;
          // The hips' own plates, facing out: not the forearm's, down to the wrist by the hip.
          if (
            u >= 0 &&
            w >= 0 &&
            u + w <= 1 &&
            h > 0 &&
            h < 0.215 &&
            v[i + 3] * d[0] + v[i + 5] * d[2] > 0.5
          ) {
            return true;
          }
        }
        return false;
      };

    it('cover the hips from their opening up to their top with no hole, thin on the sides, which climb over the hips (the user, 2026-11-14)', () => {
      // The top: up from BRIEFS.top to BRIEFS.hip over the hip; the opening line: lowest at the
      // crotch, up to a strap under the top between BRIEFS.at.
      const ease = (a: number, b: number, x: number) => {
        const t = Math.max(0, Math.min((x - a) / (b - a), 1));
        return t * t * (3 - 2 * t);
      };
      const [r0, r1, r2, r3] = BRIEFS.rise;
      const top = (t: number) =>
        BRIEFS.top + (BRIEFS.hip - BRIEFS.top) * (t <= 90 ? ease(r0, r1, t) : ease(r3, r2, t));
      const [f0, f1, b1, b0] = BRIEFS.at;
      const line = (t: number) =>
        t <= 90
          ? BRIEFS.front + (top(t) - BRIEFS.strap - BRIEFS.front) * ease(f0, f1, t)
          : BRIEFS.back + (top(t) - BRIEFS.strap - BRIEFS.back) * ease(b0, b1, t);
      expect(BRIEFS.hip).toBeGreaterThan(BRIEFS.top + 0.03);
      for (const build of [0, 1]) {
        const [, v] = draw(3, build);
        const at = plated(v);
        for (const k of [1, -1]) {
          for (let t = 25; t <= 155; t += 10) {
            // From a little over the opening (its wall leans, and the plate stands off along the
            // normals, which tilt up over the seat) to under its top, across the border of the
            // trunk's skin and the legs' (0.93 m), where the pieces left gaps.
            for (let y = Math.max(line(t) + 0.018, 0.9); y < top(t) - 0.004; y += 0.004) {
              expect(at(k * t, y)).toBe(true);
            }
          }
          // Cut high on the sides: from the front quarter to the back one, the suit shows just
          // under the opening, between the briefs and the thigh plates.
          for (let t = 45; t <= 135; t += 15) {
            expect(at(k * t, line(t) - 0.005)).toBe(false);
          }
          // On the side, a strap high up the hip, the suit under it, and over it.
          expect(at(k * 90, BRIEFS.hip - 0.005)).toBe(true);
          expect(at(k * 90, BRIEFS.hip - BRIEFS.strap - 0.006)).toBe(false);
          expect(at(k * 90, BRIEFS.hip + 0.006)).toBe(false);
          expect(at(k * 90, 0.99)).toBe(false);
        }
      }
    });

    it('make one round seat behind, with no breach up the middle (the user, 2026-11-14)', () => {
      for (const build of [0, 1]) {
        const at = plated(draw(3, build)[1]);
        for (const k of [1, -1]) {
          // Either side of the middle, from just over the arch to under the top: plate all the way.
          for (const t of [168, 172, 176]) {
            for (let y = SEAT.top + 0.015; y < BRIEFS.top - 0.006; y += 0.004) {
              expect(at(k * t, y)).toBe(true);
            }
          }
        }
      }
    });

    it('leave a crescent of dark cloth down to the thigh plates, whose top slants from the hip (the user, 2026-11-13)', () => {
      const ease = (a: number, b: number, x: number) => {
        const t = Math.max(0, Math.min((x - a) / (b - a), 1));
        return t * t * (3 - 2 * t);
      };
      const top = (t: number) =>
        THIGH.front + (THIGH.hip - THIGH.front) * ease(THIGH.at[0], THIGH.at[1], t);
      // Under the crotch at the inside of the thigh.
      expect(THIGH.front).toBeLessThan(BRIEFS.front - 0.05);
      for (const build of [0, 1]) {
        const [, v] = draw(3, build);
        const [plate, cloth] = [plated(v), plated(v, true)];
        for (const k of [1, -1]) {
          for (const t of [45, 50, 55, 60]) {
            // The thigh plate under its line, the cloth and no plate from there to the briefs.
            expect(plate(k * t, top(t) - 0.03)).toBe(true);
            for (let y = top(t) + 0.012; y < 0.925; y += 0.008) {
              expect(plate(k * t, y)).toBe(false);
              expect(cloth(k * t, y)).toBe(true);
            }
          }
          // The stripe between the front and the back plates runs up to the cloth: no tab of plate
          // over it at the hip.
          expect(plate(k * 95, 0.95)).toBe(false);
          expect(plate(k * 95, 0.9)).toBe(false);
        }
      }
    });

    it('keeps the cloth dark under plates in a team colour', () => {
      const out: number[] = [];
      const s = body(3);
      skin(out, s, solve(rest()), palette([0.9, 0.2, 0.1], undefined, undefined, true));
      const n = out.length;
      armor(out, 0, s, true, [0.9, 0.2, 0.1]);
      let dark = 0;
      for (let i = n; i < out.length; i += STRIDE) {
        dark += +(out[i + 8] != GLOSS && out[i + 6] < 0.15 && out[i + 9] < 0.15);
      }
      expect(dark).toBeGreaterThan(300);
    });
  });

  describe('the details (the user, 2026-11-13: discreet, on the chest plate and the forearms)', () => {
    /** The dark strokes of the armour `v` (the gusset's cloth is under 1 m, or BRIEFS.hip on the hips): [x, y, z] of each vertex. */
    const dark = (v: number[]) => {
      const at: number[][] = [];
      for (let i = 0; i < v.length; i += STRIDE) {
        const y = v[i + 1];
        if (
          v[i + 8] != GLOSS &&
          v[i + 6] < 0.1 &&
          y > 1 &&
          (y > BRIEFS.hip || Math.abs(v[i]) > 0.19)
        ) {
          at.push([v[i], v[i + 1], v[i + 2]]);
        }
      }
      return at;
    };
    it('are slits on the right of the chest and strokes on the outer side of both forearms, close up only', () => {
      for (const build of [0, 1]) {
        const marks = dark(draw(3, build)[1]);
        // Two triangles a stroke; most of them drawn (one may fall off its plate's edge).
        expect(marks.length).toBeGreaterThan(DETAILS.length * 6 * 0.7);
        const chest = marks.filter(p => p[1] > 1.4);
        expect(chest.length).toBeGreaterThan(5 * 6);
        // The slits are on his right; the V at the collar on both sides of the middle.
        expect(chest.filter(p => p[0] > 0.03).length).toBeGreaterThan(4 * 6);
        expect(chest.filter(p => p[0] < -0.03)).toEqual([]);
        for (const side of [1, -1]) {
          const arm = marks.filter(p => p[1] < 1.16 && p[0] * side > 0.2);
          expect(arm.length).toBeGreaterThan(5 * 6);
        }
        // None on a runner not close by (not `fine`).
        const out: number[] = [];
        const far = body(1, build);
        skin(out, far, solve(rest([0, 0, 0], 0, build)), palette([0.9, 0.2, 0.1]));
        const n = out.length;
        armor(out, 0, far, false);
        expect(dark(out.slice(n))).toEqual([]);
      }
    });
    it('keep their colour on plates in a team colour, as the scratches do not', () => {
      const out: number[] = [];
      const s = body(3);
      skin(out, s, solve(rest()), palette([0.9, 0.2, 0.1], undefined, undefined, true));
      const n = out.length;
      armor(out, 0, s, true, [0.9, 0.2, 0.1]);
      expect(dark(out.slice(n)).length).toBeGreaterThan(DETAILS.length * 6 * 0.7);
    });
    it("are the astronaut's own on his white plates, some in his team's colour, none on the marine (the user, 2026-11-13)", () => {
      const GREEN = [0.1, 0.9, 0.2];
      for (const build of [0, 1]) {
        const marks = (plate?: number[]) => {
          const out: number[] = [];
          const s = body(3, build);
          skin(
            out,
            s,
            solve(rest([0, 0, 0], 0, build)),
            palette([0.9, 0.2, 0.1], undefined, undefined, true),
          );
          const n = out.length;
          armor(out, 0, s, true, plate, false, GREEN);
          const at: number[][] = [];
          for (let i = n; i < out.length; i += STRIDE) {
            if (out[i + 8] != GLOSS && out[i + 6] == GREEN[0] && out[i + 7] == GREEN[1]) {
              at.push([out[i], out[i + 1], out[i + 2]]);
            }
          }
          return at;
        };
        const astro = marks();
        expect(astro.length).toBeGreaterThan(ASTRO_DETAILS.filter(d => d[8]).length * 6);
        // The rank bars on the left of his chest, the bands round both wrists.
        expect(astro.some(p => p[0] < -0.03 && p[1] > 1.37 && p[2] < 0)).toBe(true);
        for (const k of [1, -1]) {
          expect(astro.some(p => p[0] * k > 0.15 && p[1] > 0.94 && p[1] < 0.99)).toBe(true);
        }
        // The marine's plates in his team's colour have none of them.
        expect(marks([0.9, 0.2, 0.1])).toEqual([]);
      }
    });

    it("are the marine's own: lit buttons on boxes, grooves; none on the astronaut or the ninja (the user, 2026-11-14)", () => {
      for (const build of [0, 1]) {
        const lit = (plate?: number[], ninja = false) => {
          const out: number[] = [];
          const s = body(3, build);
          skin(
            out,
            s,
            solve(rest([0, 0, 0], 0, build)),
            palette([0.9, 0.2, 0.1], undefined, undefined, true),
          );
          const n = out.length;
          armor(out, 0, s, true, plate, ninja);
          const at: number[][] = [];
          for (let i = n; i < out.length; i += STRIDE) {
            if (out[i + 8] == -2) {
              at.push([out[i], out[i + 1], out[i + 2]]);
            }
          }
          return at;
        };
        const RED = [0.9, 0.2, 0.1];
        const buttons = lit(RED);
        const lights = MARINE_DETAILS.filter(d => d[9] >= 1 && d[9] <= 3);
        // Two triangles a button, most drawn.
        expect(buttons.length).toBeGreaterThan(lights.length * 6 * 0.7);
        // On the left of the chest, on the back, on the left forearm.
        expect(buttons.some(p => p[0] < -0.03 && p[1] > 1.4 && p[2] < 0)).toBe(true);
        expect(buttons.some(p => p[1] > 1.3 && p[2] > 0.05)).toBe(true);
        expect(buttons.some(p => p[0] < -0.15 && p[1] > 0.97 && p[1] < 1.03)).toBe(true);
        expect(buttons.some(p => p[0] > 0.15 && p[1] > 0.97 && p[1] < 1.03)).toBe(false);
        expect(lit()).toEqual([]);
        expect(lit(RED, true)).toEqual([]);
      }
    });

    it("are the ninja's own on his pieces, the long ones unbroken (the user, 2026-11-13: more detail)", () => {
      for (const build of [0, 1]) {
        const out: number[] = [];
        const s = body(3, build);
        skin(
          out,
          s,
          solve(rest([0, 0, 0], 0, build)),
          palette([0.9, 0.2, 0.1], undefined, undefined, true),
        );
        const n = out.length;
        armor(out, 0, s, true, [0.9, 0.2, 0.1], true);
        const marks: number[][] = [];
        for (let i = n; i < out.length; i += STRIDE) {
          if (out[i + 8] != GLOSS && out[i + 6] < 0.1) {
            marks.push([out[i], out[i + 1], out[i + 2]]);
          }
        }
        expect(marks.length).toBeGreaterThan(NINJA_DETAILS.length * 6);
        // None of the marine's slits on the right of his chest, under the collar.
        expect(marks.filter(p => p[0] > 0.05 && p[1] > 1.42 && p[2] < 0)).toEqual([]);
        // The seam down the chest, the vents, the lames' rivets, the shins'.
        expect(marks.some(p => Math.abs(p[0]) < 0.005 && p[1] > 1.38 && p[2] < 0)).toBe(true);
        for (const k of [1, -1]) {
          expect(marks.some(p => p[0] * k > 0.04 && p[1] > 1.32 && p[1] < 1.38 && p[2] < 0)).toBe(
            true,
          );
          expect(marks.some(p => p[0] * k > 0.06 && p[1] < 1.25 && p[1] > 1.0 && p[2] < 0)).toBe(
            true,
          );
          expect(marks.some(p => p[0] * k > 0 && p[1] < 0.45)).toBe(true);
          // A groove down each lower blade plate of the back, 9 cm in one line: laid flat on a
          // skin triangle it went under the curved plate, in dashes.
          const ys = marks
            .filter(
              p => p[0] * k > 0.02 && p[0] * k < 0.07 && p[2] > 0 && p[1] > 1.26 && p[1] < 1.4,
            )
            .map(p => p[1])
            .sort((a, b) => a - b);
          expect(ys[ys.length - 1] - ys[0]).toBeGreaterThan(0.08);
          for (let i = 1; i < ys.length; i++) {
            expect(ys[i] - ys[i - 1]).toBeLessThan(0.016);
          }
        }
      }
    });
  });
});
