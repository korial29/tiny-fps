import { describe, expect, it } from 'vitest';
import { DOME, GAP, REGIONS, armor } from './armor';
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

  describe('the chest plate, moulded (the user, 2026-11-12)', () => {
    /** The plate's front drawn at rest: at (x, y), its depth (-z) and unit normal. */
    const front = (build: number, lod: number, bare = false) => {
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

    it('keeps the woman a dome each side, as far out on both, well over the plate under it', () => {
      const at = front(1, 1);
      const [l, r] = [at(-DOME.x, DOME.y), at(DOME.x, DOME.y)];
      // Her skin under it is not mirrored to a few millimetres.
      expect(Math.abs(l[0] - r[0])).toBeLessThan(0.006);
      expect(r[0] - at(DOME.x, 1.27)[0]).toBeGreaterThan(0.032);
      // Round: as far out a little inside it whichever way.
      const k = DOME.r * 0.4;
      const ring = [at(DOME.x + k, DOME.y), at(DOME.x - k, DOME.y), at(DOME.x, DOME.y + k)];
      for (const p of ring) {
        expect(p[0]).toBeLessThan(r[0]);
      }
    });

    it('is not pierced under the armpits, where the shoulders stand out of the trunk', () => {
      for (const build of [0, 1]) {
        for (const lod of [1, 3]) {
          const [plate, bare] = [front(build, lod), front(build, lod, true)];
          for (let y = 1.3; y < 1.42; y += 0.005) {
            for (let x = 0.08; x < 0.16; x += 0.005) {
              for (const k of [1, -1]) {
                const [p, q] = [plate(k * x, y), bare(k * x, y)];
                if (p && q) {
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
