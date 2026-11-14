import { describe, expect, it } from 'vitest';
import {
  ARMHOLE,
  ASTRO_DETAILS,
  BELT,
  BRACER,
  BRIEFS,
  CHEST,
  DETAILS,
  DOME,
  GAP,
  NINJA_DETAILS,
  REGIONS,
  SIDES,
  SIGN,
  SPINE,
  THIGH,
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

  it("leaves the gap the user asked between the chest plate and the one belly plate, along the chest's dipped bottom", () => {
    const [, v] = draw(3);
    // The plates' white down the middle of the front, by height: none within the gap.
    const ys: number[] = [];
    for (let i = 0; i < v.length; i += STRIDE) {
      if (v[i + 8] == GLOSS && Math.abs(v[i]) < 0.02 && v[i + 2] < 0) {
        ys.push(v[i + 1]);
      }
    }
    const [chest, belly] = REGIONS;
    // The chest's bottom dips to the middle; the belly's top is GAP under it there.
    expect(chest.y[0]).toBe(CHEST.y);
    expect(CHEST.rise).toBeGreaterThan(0.02);
    expect(belly.high!(0, [])).toBeCloseTo(CHEST.y - GAP, 6);
    // The plates stand off the skin along its normals, which tilt a few millimetres.
    expect(ys.filter(y => y > CHEST.y - GAP + 0.004 && y < CHEST.y - 0.004)).toEqual([]);
    expect(ys.some(y => y > CHEST.y)).toBe(true);
    expect(ys.some(y => y < CHEST.y - GAP && y > belly.y[0])).toBe(true);
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

  it("stays on the body on every skin, the eye's own included, both builds", () => {
    // The user, 2026-11-12: on the eye's skin (body(2)), whose trunk ends in a cap over the
    // shoulders, the moulded chest plate rose over the head in two spikes ("the legs go up").
    for (const build of [0, 1]) {
      for (const lod of [0, 1, 2, 3]) {
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
        let top = 0;
        for (let i = n; i < out.length; i += STRIDE) {
          top = Math.max(top, out[i + 1]);
        }
        expect(top).toBeLessThan(1.56);
      }
    }
  });

  it('has nothing standing off behind the back, where a front plate was cut in slivers (the user, 2026-11-13)', () => {
    // The middle of the back is +180 or -180 round the trunk by the sign of a hair: a moulded
    // plate's corners set off there flipped across it, and the clip took the jump for an edge.
    for (const ninja of [false, true]) {
      for (const build of [0, 1]) {
        for (const lod of [1, 3]) {
          const out: number[] = [];
          const s = body(lod, build);
          skin(
            out,
            s,
            solve(rest([0, 0, 0], 0, build)),
            palette([0.9, 0.2, 0.1], undefined, undefined, true),
          );
          const n = out.length;
          armor(out, 0, s, lod > 2, undefined, ninja);
          let back = 0;
          for (let i = 0; i < n; i += STRIDE) {
            if (Math.abs(out[i]) < 0.03 && out[i + 1] > 1.2 && out[i + 1] < 1.4) {
              back = Math.max(back, out[i + 2]);
            }
          }
          for (let i = n; i < out.length; i += STRIDE) {
            if (Math.abs(out[i]) < 0.03 && out[i + 1] > 1.2 && out[i + 1] < 1.4) {
              expect(out[i + 2]).toBeLessThan(back + 0.025);
            }
          }
        }
      }
    }
  });

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

    it('cover the hips from their opening up to the belt with no hole, thin on the sides', () => {
      // The opening line: lowest at the crotch, up to BRIEFS.side between BRIEFS.at.
      const ease = (a: number, b: number, x: number) => {
        const t = Math.max(0, Math.min((x - a) / (b - a), 1));
        return t * t * (3 - 2 * t);
      };
      const [f0, f1, b1, b0] = BRIEFS.at;
      const line = (t: number) =>
        t <= 90
          ? BRIEFS.front + (BRIEFS.side - BRIEFS.front) * ease(f0, f1, t)
          : BRIEFS.back + (BRIEFS.side - BRIEFS.back) * ease(b0, b1, t);
      expect(BRIEFS.side).toBeGreaterThan(0.965);
      for (const build of [0, 1]) {
        const [, v] = draw(3, build);
        const at = plated(v);
        for (const k of [1, -1]) {
          for (let t = 25; t <= 155; t += 10) {
            // From a little over the opening (its wall leans) to under the belt, across the border
            // of the trunk's skin and the legs' (0.93 m), where the pieces left gaps.
            for (let y = Math.max(line(t) + 0.012, 0.9); y < 0.978; y += 0.004) {
              expect(at(k * t, y)).toBe(true);
            }
          }
          // Cut high on the sides: from the front quarter to the back one, the suit shows just
          // under the opening, between the briefs and the thigh plates.
          for (let t = 45; t <= 135; t += 15) {
            expect(at(k * t, line(t) - 0.005)).toBe(false);
          }
          // On the side, a centimetre under the belt, then the suit.
          expect(at(k * 90, 0.977)).toBe(true);
          expect(at(k * 90, 0.966)).toBe(false);
        }
      }
    });

    it('leave a crescent of dark cloth down to the thigh plates, whose top slants from the hip (the user, 2026-11-13)', () => {
      const ease = (a: number, b: number, x: number) => {
        const t = Math.max(0, Math.min((x - a) / (b - a), 1));
        return t * t * (3 - 2 * t);
      };
      const top = (t: number) =>
        THIGH.front + (BRIEFS.side - 0.01 - THIGH.front) * ease(THIGH.at[0], THIGH.at[1], t);
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
    /** The dark strokes of the armour `v` (the gusset's cloth is under 1 m): [x, y, z] of each vertex. */
    const dark = (v: number[]) => {
      const at: number[][] = [];
      for (let i = 0; i < v.length; i += STRIDE) {
        if (v[i + 8] != GLOSS && v[i + 6] < 0.1 && v[i + 1] > 1) {
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
