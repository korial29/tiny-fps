import { describe, expect, it } from 'vitest';
import { ARMHOLE, BELT, BRACER, DOME, REGIONS, SIDES, SIGN, SPINE, VEST, armor } from './armor';
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
          if (dark && z < 0 && Math.abs(y - sy) < size) {
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

    it("builds the ninja's back of pieces: none across the trunk's split, blocks down the spine standing out, a plate on each flank (the user, 2026-11-13: one big block)", () => {
      const back = REGIONS.filter(r => r.alone && r.part == REGIONS[0].part && r.face == 180);
      for (const r of back) {
        expect(r.y[1] <= 1.402 || r.y[0] >= 1.412).toBe(true);
      }
      const blocks = back.filter(r => r.off == SPINE.off);
      expect(blocks.length).toBe(SPINE.n);
      expect(SPINE.off).toBeGreaterThan(0.012);
      const sides = REGIONS.filter(r => r.alone && !r.face && r.a[0] >= SIDES.a[0] - 1e-9);
      const flank = REGIONS.filter(r => r.alone && !r.face && r.a[1] <= -SIDES.a[0] + 1e-9);
      expect(sides.length).toBe(SIDES.y.length);
      expect(flank.length).toBe(SIDES.y.length);
    });

    it("cuts the ninja's belt in a slight V, in his team's colour, drawn alone on a map with no armour (the user, 2026-11-13)", () => {
      for (const build of [0, 1]) {
        const out: number[] = [];
        const s = body(1, build);
        skin(out, s, solve(rest([0, 0, 0], 0, build)), palette([0.9, 0.2, 0.1]));
        const n = out.length;
        armor(out, 0, s, true, undefined, true, [0.1, 0.8, 0.3], true);
        expect(out.length).toBeGreaterThan(n);
        const pts: number[][] = [];
        for (let i = n; i < out.length; i += STRIDE) {
          // All of it the belt: in the team's colour, round the waist.
          expect([out[i + 6], out[i + 7], out[i + 9]]).toEqual([0.1, 0.8, 0.3]);
          pts.push([out[i], out[i + 1], out[i + 2]]);
        }
        const low = (f: (p: number[]) => boolean) => Math.min(...pts.filter(f).map(p => p[1]));
        const front = low(p => Math.abs(p[0]) < 0.02 && p[2] < 0);
        const hips = low(p => Math.abs(p[0]) > 0.14);
        expect(front).toBeCloseTo(BELT.y, 2);
        expect(hips - front).toBeGreaterThan(0.009);
      }
    });

    it("covers his pecs with the ninja's chest piece out to the shoulders (the user, 2026-11-13)", () => {
      for (const lod of [1, 3]) {
        const at = front(0, lod, false, true);
        for (const side of [1, -1]) {
          // Over the top of the pecs, above the split, and over their outer edge under it.
          for (let x = 0; x <= 0.15; x += 0.005) {
            expect(at(side * x, 1.44)).toBeDefined();
          }
          for (let x = 0; x <= 0.15; x += 0.005) {
            expect(at(side * x, 1.38)).toBeDefined();
          }
        }
      }
    });

    it("tops the ninja's vest in one block, its edge one smooth curve into the armhole, close or near (the user, 2026-11-13)", () => {
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
          // No V at the neck: the middle is as high as the shallow neckline lets it.
          expect(tops[0]).toBeGreaterThan(Math.max(...tops) - VEST.neck - 0.008);
          for (let i = 8; i < tops.length; i++) {
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
          // Off the plate's top line by the armpit (ARMPIT.y), where the bare shoulder over its
          // edge is the skin met.
          for (let y = 1.302; y < 1.42; y += 0.005) {
            for (let x = 0.08; x < 0.16; x += 0.005) {
              for (const k of [1, -1]) {
                const [p, q] = [plate(k * x, y), bare(k * x, y)];
                // In the armhole the plate met is the biceps', on the arm behind the chest's
                // front: never more than 0.063 deep.
                if (p && q && p[0] > 0.063) {
                  expect(p[0]).toBeGreaterThan(q[0]);
                }
              }
            }
          }
        }
      }
    });
  });
});
