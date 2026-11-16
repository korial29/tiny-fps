import { describe, expect, it, vi } from 'vitest';
import { BELLY, BICEPS, CAST, CHEST, GAP, REGIONS, armor } from './armor';
import { GLOSS, STRIDE } from './mesh';
import { JOINT as J, rest, solve } from './rig';
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

  it("locks the belly's plate into the chest plate's like puzzle pieces (the user, 2026-11-14)", () => {
    const [chest, belly] = REGIONS;
    for (let a = 0; a <= BELLY.a; a += 2) {
      // Its top follows the chest's bottom GAP under at every angle.
      expect(belly.high!(a, [])).toBeCloseTo(chest.low!(a, []) - GAP, 6);
    }
    // The chest's tab hangs down the middle into a notch, under the belly's top beside it.
    expect(chest.low!(0, [])).toBeLessThan(belly.high!(CHEST.tab[1] + 4, []) - 0.015);
    expect(chest.low!(CHEST.tab[0] - 1, [])).toBeCloseTo(CHEST.y, 4);
    // And the belly reaches out under the chest plate's corners, not narrower than it.
    expect(BELLY.a).toBeGreaterThan(chest.a[1] - 6);
  });

  it('casts the forearm plate straight and flared, not over the muscles, the biceps thinner (the user, 2026-11-14)', () => {
    expect(BICEPS.off).toBeLessThan(0.005);
    expect(REGIONS.find(r => r.cast)?.high).toBeDefined();
    expect(CAST.x[1]).toBeGreaterThan(CAST.x[0]);
    for (const build of [0, 1]) {
      const [, v] = draw(3, build);
      // How far the plate stands from the forearm's line at each place along it, past the ridge's
      // start and short of the flare: it only grows toward the elbow, in a straight line, where
      // the skin goes in and out.
      const sk = solve(rest([0, 0, 0], 0, build));
      const [e, w] = [sk.pos[J.FOREARM_R], sk.pos[J.HAND_R]];
      const d = e.map((q, k) => q - w[k]);
      const L = Math.hypot(...d);
      const out = [0.3, 0.37, 0.44, 0.51, 0.58].map(f => {
        let m = 0;
        for (let i = 0; i < v.length; i += STRIDE) {
          const p = [0, 1, 2].map(k => v[i + k] - w[k]);
          const t = (p[0] * d[0] + p[1] * d[1] + p[2] * d[2]) / (L * L);
          const q = p.map((c, k) => c - d[k] * t);
          const r = Math.hypot(...q);
          // On the arm's outer side alone: the hip's plates are close by on its inner one.
          if (v[i + 8] == GLOSS && Math.abs(t - f) < 0.02 && r < 0.09 && q[0] > 0) {
            m = Math.max(m, r);
          }
        }
        return m;
      });
      for (let i = 1; i < out.length; i++) {
        expect(out[i]).toBeGreaterThan(out[i - 1] - 0.0005);
        // Straight: each the middle of its neighbours, to a millimetre.
        if (i + 1 < out.length) {
          expect(Math.abs(out[i] - (out[i - 1] + out[i + 1]) / 2)).toBeLessThan(0.001);
        }
      }
    }
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

  it("works out a corner shared by two or three triangles once: the eye's own body draws it every frame", () => {
    // Every corner's normal is normalised by a square root at least: done per triangle, the marine's
    // 73 000 corners took 3 ms of the own body's 4 a frame (2026-11-15).
    for (const ninja of [false, true]) {
      const out: number[] = [];
      const s = body(2);
      skin(out, s, solve(rest([0, 0, 0], 0)), palette([0.9, 0.2, 0.1], undefined, undefined, true));
      const n = out.length;
      armor(out, 0, s, true, [0.9, 0.2, 0.1], ninja);
      const corners = (out.length - n) / STRIDE;
      out.length = n;
      const root = vi.spyOn(Math, 'sqrt');
      armor(out, 0, s, true, [0.9, 0.2, 0.1], ninja);
      const roots = root.mock.calls.length;
      root.mockRestore();
      expect((out.length - n) / STRIDE).toBe(corners);
      expect(roots).toBeLessThan(corners * 1.5);
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
});
