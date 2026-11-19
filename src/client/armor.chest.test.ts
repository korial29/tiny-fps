import { describe, expect, it } from 'vitest';
import {
  ARMHOLE,
  BACK,
  BELT,
  BRACER,
  DOME,
  FLANK,
  NOTCH,
  REGIONS,
  SASH,
  SHIELD,
  SIGN,
  VEST,
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
  describe('the chest plate, moulded (the user, 2026-11-12)', () => {
    /** The plate's front drawn at rest: at (x, y), its depth (-z) and unit normal. */
    const front = (build: number, lod: number, bare = false, ninja = false) => {
      const out: number[] = [];
      const s = body(lod, build);
      skin(
        out,
        s,
        solve(rest([0, 0, 0], 0, build)),
        palette([0.9, 0.2, 0.1], undefined, undefined, true),
      );
      const n = out.length;
      armor(out, 0, s, true, undefined, ninja);
      const v = bare ? out.slice(0, n) : out.slice(n);
      return (x: number, y: number) => {
        let best: number[] | undefined;
        for (let i = 0; i < v.length; i += 3 * STRIDE) {
          if (!bare && v[i + 8] != GLOSS) {
            continue;
          }
          const [a, b, c] = [i, i + STRIDE, i + 2 * STRIDE];
          const d = (v[b] - v[a]) * (v[c + 1] - v[a + 1]) - (v[c] - v[a]) * (v[b + 1] - v[a + 1]);
          if (Math.abs(d) < 1e-12) {
            continue;
          }
          const u = ((x - v[a]) * (v[c + 1] - v[a + 1]) - (v[c] - v[a]) * (y - v[a + 1])) / d;
          const w = ((v[b] - v[a]) * (y - v[a + 1]) - (x - v[a]) * (v[b + 1] - v[a + 1])) / d;
          if (u < 0 || w < 0 || u + w > 1) {
            continue;
          }
          const q = (j: number) => v[a + j] + u * (v[b + j] - v[a + j]) + w * (v[c + j] - v[a + j]);
          if (q(5) < -0.3 && (!best || -q(2) > best[0])) {
            const l = Math.hypot(q(3), q(4), q(5));
            best = [-q(2), q(3) / l, q(4) / l, q(5) / l];
          }
        }
        return best!;
      };
    };

    it("is smooth and even on the man: the light on its left mirrors the right's, close or near", () => {
      for (const lod of [1, 3]) {
        const at = front(0, lod);
        for (let y = 1.24; y < 1.39; y += 0.01) {
          for (let x = 0.005; x < 0.09; x += 0.01) {
            const [p, q] = [at(x, y), at(-x, y)];
            // The skin's own facets are not mirrored: the plate followed them.
            expect(Math.abs(p[0] - q[0])).toBeLessThan(0.0025);
            expect(p[1] * -q[1] + p[2] * q[2] + p[3] * q[3]).toBeGreaterThan(
              Math.cos((4 * Math.PI) / 180),
            );
          }
        }
      }
    });

    /** The furthest point out of the plate `at` over a breast on the side `k`: [x, y, how far out]. */
    const peak = (at: (x: number, y: number) => number[], k = 1) => {
      let best = [0, 0, 0];
      for (let x = 0.04; x < 0.13; x += 0.005) {
        for (let y = 1.3; y < 1.4; y += 0.005) {
          const d = at(k * x, y)?.[0] ?? 0;
          best = d > best[2] ? [x, y, d] : best;
        }
      }
      return best;
    };
    /** How far out the plate is at eight points `q` from (x, y), all round it; nothing where its side faces away or it is cut. */
    const ring = (at: (x: number, y: number) => number[], [x, y]: number[], q: number) =>
      [0, 1, 2, 3, 4, 5, 6, 7]
        .map(i => at(x + q * Math.cos((i * Math.PI) / 4), y + q * Math.sin((i * Math.PI) / 4))?.[0])
        .filter(d => d !== undefined);

    it('keeps the woman a dome each side, as far out on both, well over the plate under it', () => {
      const at = front(1, 1);
      const [l, r] = [peak(at, -1), peak(at)];
      // Her skin under it is not mirrored to a few millimetres.
      expect(Math.abs(l[2] - r[2])).toBeLessThan(0.006);
      expect(r[2] - at(r[0], 1.27)[0]).toBeGreaterThan(0.032);
      // Round: as far out a little inside it whichever way.
      const round = ring(at, r, DOME.r * 0.4);
      expect(Math.max(...round)).toBeLessThan(r[2]);
    });

    it("stands the ninja's bracers half as far off the forearm as a plate (the user, 2026-11-13)", () => {
      const g = REGIONS.find(r => r.alone && r.off && r.part != REGIONS[0].part);
      expect(g?.off).toBe(BRACER);
      expect(BRACER).toBeLessThanOrEqual(0.006);
    });

    it("rounds the ninja's vest over her breasts, smaller, and cuts it under the shoulder's skin: no crack by the armpit (the user, 2026-11-13)", () => {
      const at = front(1, 1, false, true);
      const [l, r] = [peak(at, -1), peak(at)];
      expect(Math.abs(l[2] - r[2])).toBeLessThan(0.006);
      expect(r[2]).toBeLessThan(peak(front(1, 1))[2] - 0.005);
      const round = ring(at, r, DOME.r * 0.35);
      expect(Math.max(...round)).toBeLessThan(r[2]);
      // None of it is on the shoulder's skin, over the trunk's split.
      for (const side of [1, -1]) {
        for (let x = 0.115; x < 0.16; x += 0.005) {
          expect(at(side * x, ARMHOLE.y + 0.012)).toBeUndefined();
        }
      }
    });

    it("writes 忍 dark on the left pec of the ninja's chest piece, not on the right (the user, 2026-11-13)", () => {
      for (const build of [0, 1]) {
        const out: number[] = [];
        const s = body(1, build);
        const { x: sx, y: sy, size } = SIGN[build];
        skin(out, s, solve(rest([0, 0, 0], 0, build)), palette([0.9, 0.2, 0.1]));
        const n = out.length;
        armor(out, 0, s, true, [0.9, 0.2, 0.1], true);
        const ink = [0, 0];
        for (let i = n; i < out.length; i += STRIDE) {
          const [x, y, z] = [out[i], out[i + 1], out[i + 2]];
          const dark = Math.max(out[i + 6], out[i + 7], out[i + 9]) < 0.15;
          // 2 mm in from the sign's foot: his right pec's first vent ends there, and on the
          // flatter piece (2026-11-18) its tip came 0.5 mm into the sign's height.
          if (dark && z < 0 && Math.abs(y - sy) < size - 0.002) {
            for (const k of [0, 1]) {
              ink[k] += +(Math.abs(x - (k ? -sx : sx)) < size);
            }
          }
        }
        // Every stroke laid: 12 segments, each two triangles at least. On her the right has its
        // vents, the left none (the sign is in their place).
        expect(ink[0]).toBeGreaterThanOrEqual(12 * 6);
        expect(ink[1]).toBeLessThan(build ? ink[0] : 1);
      }
    });

    it("builds the ninja's back as his front: a shield over the spine that leaves the shoulder blades bare, three lames under it that meet the belly's at the flanks (the user, 2026-11-17; it was pieces each side of a spine of blocks, 2026-11-13)", () => {
      const own = REGIONS.filter(r => r.alone && r.part == REGIONS[0].part && !r.belt);
      const back = own.filter(r => r.face == 180);
      // One piece and three lames: no half plates, no blocks down the spine, none on the flanks.
      expect(back.map(r => !!r.mould)).toEqual([true, false, false, false]);
      expect(own.filter(r => r.off)).toEqual([]);
      expect(own.filter(r => !r.face && r.a[0] > 0)).toEqual([]);
      // The lames: the belly's own heights, each round to the flank, a seam between the two.
      const belly = own.filter(r => !r.face && !r.mould);
      expect(belly.length).toBe(3);
      back.slice(1).forEach((r, k) => {
        expect(r.y).toEqual(belly[k].y);
        expect([r.a, belly[k].a]).toEqual([
          [-FLANK, FLANK],
          [-FLANK, FLANK],
        ]);
      });
      expect(2 * FLANK).toBeGreaterThan(174);
      expect(2 * FLANK).toBeLessThan(180);
      // The shield's top: up at the spine, held to SHIELD[0] off it, then (its fall once under
      // way, 3 degrees on) only down to a low band over the chevron at SHIELD[1], on to its sides.
      const high = (b: number) => back[0].high!(180 - b, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
      expect(high(0)).toBeCloseTo(BACK.top, 6);
      expect(high(SHIELD[0])).toBeGreaterThan(BACK.top);
      for (let b = SHIELD[0] + 3; b < SHIELD[1]; b++) {
        expect(high(b + 1)).toBeLessThan(high(b));
      }
      expect(high(SHIELD[1])).toBeCloseTo(VEST.y + 0.02, 6);
      expect(high(46)).toBeCloseTo(VEST.y + 0.02, 6);
      // Drawn: plate up the spine, none over the shoulder blades, on him and on her.
      for (const build of [0, 1]) {
        const out: number[] = [];
        const s = body(1, build);
        skin(out, s, solve(rest([0, 0, 0], 0, build)), palette([0.9, 0.2, 0.1]));
        const n = out.length;
        armor(out, 0, s, true, undefined, true);
        let [spine, blades] = [0, 0];
        for (let i = n; i < out.length; i += STRIDE) {
          const [x, y, z] = [Math.abs(out[i]), out[i + 1], out[i + 2]];
          if (out[i + 8] == GLOSS && z > 0.03 && y > 1.36) {
            spine += +(x < 0.03 && y > 1.43);
            blades += +(x > 0.09);
          }
        }
        expect(spine).toBeGreaterThan(10);
        expect(blades).toBe(0);
      }
    });

    it("ties the ninja's waist in a sash: wide, nearly level, in its own grey, drawn alone on a map with no armour (the user, 2026-11-17; it was a thin belt in a V in his team's colour, 2026-11-13)", () => {
      for (const build of [0, 1]) {
        const out: number[] = [];
        const s = body(1, build);
        skin(out, s, solve(rest([0, 0, 0], 0, build)), palette([0.9, 0.2, 0.1]));
        const n = out.length;
        armor(out, 0, s, true, undefined, true, [0.1, 0.8, 0.3], true);
        expect(out.length).toBeGreaterThan(n);
        const pts: number[][] = [];
        for (let i = n; i < out.length; i += STRIDE) {
          // All of it the sash: in its grey, not the team's colour, round the waist; plain cloth
          // here, the weave being the shader's.
          expect([out[i + 6], out[i + 7], out[i + 9]]).toEqual(SASH);
          expect(out[i + 8]).toBe(-1);
          pts.push([out[i], out[i + 1], out[i + 2]]);
        }
        const ys = (f: (p: number[]) => boolean) => pts.filter(f).map(p => p[1]);
        const front = ys(p => Math.abs(p[0]) < 0.02 && p[2] < 0);
        const hips = ys(p => Math.abs(p[0]) > 0.14);
        expect(Math.min(...front)).toBeCloseTo(BELT.y, 2);
        // Wide: 4.5 cm and more, where the belt was 4.
        expect(Math.max(...front) - Math.min(...front)).toBeGreaterThan(0.045);
        // Nearly level: up over the hips, by less than a third of its height (the V rose 5 cm).
        const rise = Math.min(...hips) - Math.min(...front);
        expect(rise).toBeGreaterThan(0.008);
        expect(rise).toBeLessThan(0.02);
      }
    });

    it("covers his pecs with the ninja's chest piece out to the shoulders, open down the sternum (the user, 2026-11-13; the cut, 2026-11-18)", () => {
      for (const lod of [1, 3]) {
        const at = front(0, lod, false, true);
        for (const side of [1, -1]) {
          // Over the top of the pecs, above the split, from beside the cut; and over their outer
          // edge under it, under the cut's point.
          for (let x = 0.03; x <= 0.15; x += 0.005) {
            expect(at(side * x, 1.44)).toBeDefined();
          }
          for (let x = 0; x <= 0.15; x += 0.005) {
            expect(at(side * x, 1.37)).toBeDefined();
          }
        }
        // The cut: the suit shows down the middle, from the neckline to its point.
        for (let y = 1.39; y < 1.48; y += 0.01) {
          expect(at(0, y)).toBeUndefined();
        }
      }
    });

    it("tops the ninja's vest in one block, its edge up out of the cut down the sternum, then one smooth curve into the armhole, close or near (the user, 2026-11-13; the cut, 2026-11-18)", () => {
      for (const build of [0, 1]) {
        for (const lod of [1, 3]) {
          const at = front(build, lod, false, true);
          /** The top of the chest piece at x: the first plate met going down. */
          const top = (x: number) => {
            for (let y = VEST.top[build] + 0.01; y > VEST.y; y -= 0.001) {
              if (at(x, y)) {
                return y;
              }
            }
            return 0;
          };
          // In from the side, where the plate turns away from the front.
          const tops: number[] = [];
          for (let x = 0; x < 0.12; x += 0.005) {
            tops.push(top(x));
          }
          // The cut: NOTCH.deep under the shallow neckline at the middle (hers drawn 1.6 cm
          // lower still, on her shorter trunk), its sides only up, hollow, to the top by 5 cm out.
          const point = VEST.top[build] - VEST.neck - NOTCH.deep;
          expect(tops[0]).toBeLessThan(point + 0.003);
          expect(tops[0]).toBeGreaterThan(point - (build ? 0.02 : 0.003));
          for (let i = 1; i <= 6; i++) {
            expect(tops[i]).toBeGreaterThan(tops[i - 1]);
          }
          expect(tops[3] - tops[0]).toBeLessThan((tops[6] - tops[0]) * 0.6);
          expect(tops[6]).toBeGreaterThan(Math.max(...tops) - 0.008);
          for (let i = 10; i < tops.length; i++) {
            // Only down from the neckline outward, with no cliff into the armhole: it fell 10 cm
            // in 2 there, then ran on as a shelf.
            expect(tops[i]).toBeLessThan(tops[i - 1] + 0.003);
            expect(tops[i - 1] - tops[i]).toBeLessThan(0.022);
          }
        }
      }
    });

    it("has no breach by the armpits, over the rim of the arm's hole in the trunk's skin (the user, 2026-11-13)", () => {
      for (const build of [0, 1]) {
        for (const lod of [1, 3]) {
          const [, v] = draw(lod, build);
          // The plate between the trunk's last two rows (1.394 and 1.41 m), in from its corners:
          // none of it turned in, as the rim's normals are, and all of it before the chest.
          let seen = 0;
          for (let i = 0; i < v.length; i += STRIDE) {
            const [x, y, z] = [Math.abs(v[i]), v[i + 1], v[i + 2]];
            if (v[i + 8] == GLOSS && x > 0.05 && x < 0.13 && y > 1.39 && y < 1.415 && z < -0.05) {
              seen++;
              expect(v[i + 5]).toBeLessThan(0);
              expect(z).toBeLessThan(-0.1);
            }
          }
          expect(seen).toBeGreaterThan(10);
        }
      }
    });

    it('is not pierced under the armpits, where the shoulders stand out of the trunk', () => {
      for (const build of [0, 1]) {
        for (const lod of [1, 3]) {
          const [plate, bare] = [front(build, lod), front(build, lod, true)];
          // Off the plate's top line by the armpit (ARMPIT), where the bare shoulder over its
          // edge is the skin met.
          for (let y = 1.302; y < 1.42; y += 0.005) {
            for (let x = 0.08; x < 0.16; x += 0.005) {
              for (const k of [1, -1]) {
                const [p, q] = [plate(k * x, y), bare(k * x, y)];
                // In the armhole the plate met is the biceps', on the arm behind the chest's
                // front: never more than 0.063 deep. And off the top line means plate 6 mm up
                // too: on the wider chest (2026-11-18) the line's outer end came onto a point
                // looked at, the shoulder's skin 1 mm over its tip.
                if (p && q && p[0] > 0.063 && (plate(k * x, y + 0.006)?.[0] ?? 0) > 0.063) {
                  expect(p[0]).toBeGreaterThan(q[0]);
                }
              }
            }
          }
        }
      }
    });

    it('falls into the armhole in one curve, with no step (the user, 2026-11-17)', () => {
      // It fell 7.5 cm in 7 degrees, then a ledge, then 4.5 cm more: a block and a step with walls.
      const high = (a: number) => REGIONS[0].high!(a, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
      let last = Infinity;
      // To 60 degrees: past it the corner with the plate's side is rounded, met upright.
      for (let a = 30; a <= 60; a += 0.5) {
        const fall = high(a) - high(a + 0.5);
        expect(fall).toBeLessThan(0.004);
        if (a > 45 && a < 62) {
          // Falling all the way down, no shelf on the way.
          expect(fall).toBeGreaterThan(0.0005);
        }
        last = Math.min(last, high(a));
      }
      expect(last).toBeLessThan(1.35);
    });
  });
});
