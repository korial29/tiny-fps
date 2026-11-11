import { describe, expect, it } from 'vitest';
import { LIMB } from '../shared/types';
import { GLOW } from './flag';
import { SCALE, SHELL, WRAP, band, helmet, inside, shrunk, uOf } from './helmet';
import { GLOSS, SHINE, STRIDE, place } from './mesh';
import type { Vec3 } from './mesh';
import { JOINT as J, axis, rest, solve, turn } from './rig';
import type { Quat } from './rig';
import { body } from './skin';

const HEAD = solve(rest()).pos[J.HEAD];
const IDENT: Quat = [0, 0, 0, 1];
const TEAM = [0.9, 0.2, 0.1];
const make = (lod: number, at: Vec3 = HEAD, q: Quat = IDENT) => {
  const out: number[] = [];
  helmet(out, at, q, TEAM, lod);
  return out;
};
const at = (v: number[], i: number): Vec3 => [v[i * STRIDE], v[i * STRIDE + 1], v[i * STRIDE + 2]];
const count = (v: number[]) => v.length / STRIDE;

/** The head's own vertices of the skin at rest, in the head joint's frame. */
const headVertices = (lod: number): Vec3[] => {
  const s = body(lod);
  const seen = new Set<number>();
  s.l!.forEach((l, t) => {
    if (l == LIMB.HEAD) {
      for (let k = 0; k < 3; k++) {
        seen.add(s.t[t * 3 + k]);
      }
    }
  });
  return [...seen].map(i => [0, 1, 2].map(k => s.v[i * 6 + k] - HEAD[k]) as Vec3);
};

describe('helmet', () => {
  for (const lod of [0, 1, 3]) {
    describe(`at level ${lod}`, () => {
      const v = make(lod);
      it('is whole triangles of finite numbers with unit normals', () => {
        expect(v.length % (3 * STRIDE)).toBe(0);
        expect(v.every(Number.isFinite)).toBe(true);
        for (let i = 0; i < count(v); i++) {
          expect(Math.hypot(v[i * STRIDE + 3], v[i * STRIDE + 4], v[i * STRIDE + 5])).toBeCloseTo(
            1,
            4,
          );
        }
      });

      it('has no triangle that is flat on itself', () => {
        for (let i = 0; i < count(v); i += 3) {
          const [p, q, r] = [0, 1, 2].map(k => at(v, i + k));
          const [a, b] = [0, 1, 2]
            .map(k => [q[k] - p[k], r[k] - p[k]])
            .reduce(
              (m, [x, y]) => [
                [...m[0], x],
                [...m[1], y],
              ],
              [[], []] as number[][],
            );
          const n = [
            a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0],
          ];
          expect(Math.hypot(...n)).toBeGreaterThan(1e-10);
        }
      });
    });
  }

  // Detailed (the user, 2026-11-10: whatever it costs), still a fraction of a body (34 000 close).
  it('has the shape of the marine’s helmet the user gave (2026-11-11): narrower, a block with a lit bar on top, a tall visor cut in a V by the jaw box, vents on the sides', () => {
    // Drawn 21 cm wide, where it was 23; no taller, a little less deep.
    expect(SHELL.r[0] * SCALE).toBeLessThan(0.108);
    expect(SHELL.r[1] * SCALE).toBeLessThanOrEqual(0.14);
    expect(SHELL.r[2] * SCALE).toBeLessThan(0.132);
    // The visor: 9 cm tall at the notch's feet, its lower edge rising to half that at its ends and
    // by 3 cm in the middle, where the jaw box comes up into it; its top level.
    const low = (u: number) => band(u)[0] - band(u)[1];
    const top = (u: number) => band(u)[0] + band(u)[1];
    expect(top(0) - low(0.062)).toBeGreaterThan(0.04);
    expect(low(0) - low(0.062)).toBeGreaterThan(0.005);
    // An aggressive one (the user, 2026-11-11): its upper edge frowns, a centimetre lower in the
    // middle than at its ends; its lower edge runs straight up to them, a V (no curve: the half-way
    // point is within 3 mm of the chord); its ends are lower than its middle.
    expect(top(0.122) - top(0)).toBeGreaterThan(0.01);
    // More glass, a thinner rim (the user, 2026-11-11): 7 cm of dark over each eye.
    expect(top(0.07) - low(0.07)).toBeGreaterThan(0.065);
    expect(top(0.06)).toBeGreaterThan(top(0));
    expect(low(0.122) - low(0.07)).toBeGreaterThan(0.02);
    expect(Math.abs(low(0.096) - (low(0.07) + low(0.122)) / 2)).toBeLessThan(0.003);
    expect(top(0.122) - low(0.122)).toBeLessThan((top(0.07) - low(0.07)) * 0.8);
    const out = make(3);
    const p = Array.from({ length: count(out) }, (_, i) => [
      ...at(out, i).map((w, k) => w - HEAD[k]),
      out[i * STRIDE + 6],
      out[i * STRIDE + 7],
      out[i * STRIDE + 9],
    ]);
    // The volumes on the sides stand well out (the user: more pronounced): the ear blocks 2 cm
    // out of the shell, stepped, where the plates stood 0.8.
    const wide = shrunk([SHELL.r[0], 0, 0])[0];
    for (const side of [1, -1]) {
      const pod = p.filter(q => q[0] * side > wide + 0.004);
      expect(Math.max(...pod.map(q => q[0] * side)) - wide).toBeGreaterThan(0.018);
      expect(Math.max(...pod.map(q => q[1])) - Math.min(...pod.map(q => q[1]))).toBeGreaterThan(
        0.12,
      );
    }
    // Green glass.
    const glass = p.filter((_, i) => out[i * STRIDE + 8] == SHINE);
    expect(glass.every(q => q[4] > q[3] * 2 && q[4] > q[5])).toBe(true);
    // The block on top stands over the dome, set back from the brow, and carries a pale bar across
    // its front face, cut in segments.
    const dome = shrunk([0, SHELL.c[1] + SHELL.r[1], 0])[1];
    const over = p.filter(q => q[1] > dome + 0.004);
    expect(over.length).toBeGreaterThan(12);
    // A small block (the user, 2026-11-11: reduce it): under 2 cm over the dome, under 10 cm wide,
    // and gone before the back of the crown.
    expect(Math.max(...over.map(q => q[1]))).toBeLessThan(dome + 0.02);
    expect(Math.max(...over.map(q => Math.abs(q[0])))).toBeLessThan(0.05);
    expect(Math.max(...over.map(q => q[2]))).toBeLessThan(0.06);
    expect(Math.min(...over.map(q => q[2]))).toBeGreaterThan(-0.11);
    const bar = p.filter(q => q[3] > 0.96 && q[1] > 0.15 && q[2] < -0.08);
    expect(bar.length).toBeGreaterThanOrEqual(6);
    expect(Math.max(...bar.map(q => q[0])) - Math.min(...bar.map(q => q[0]))).toBeGreaterThan(0.09);
    // The jaw box: 4 to 5 cm out of the shell's front (the snout stood 7), down past the rim,
    // five dark slots across it: a short one at its top and four under it.
    const front = shrunk([0, 0, SHELL.c[2] - SHELL.r[2]])[2];
    const jut = front - Math.min(...p.map(q => q[2]));
    expect(jut).toBeGreaterThan(0.03);
    expect(jut).toBeLessThan(0.05);
    const slots = p.filter(q => q[3] < 0.06 && q[2] < front - 0.005 && Math.abs(q[0]) < 0.04);
    expect(new Set(slots.map(q => Math.round(q[1] * 200))).size).toBeGreaterThanOrEqual(5);
    // Vents: one each side of the visor, high, and none low on the cheeks beside the box (the
    // user, 2026-11-11: those were not coherent).
    const dark = p.filter(q => q[3] < 0.06 && q[4] < 0.06 && Math.abs(q[0]) > 0.05);
    for (const side of [1, -1]) {
      expect(dark.some(q => q[0] * side > 0 && q[1] < 0)).toBe(false);
      expect(dark.some(q => q[0] * side > 0 && q[1] > 0.05)).toBe(true);
    }
  });

  it('stays modest: under 1 000 vertices far, 8 000 near, 20 000 close', () => {
    expect(count(make(0))).toBeLessThan(1000);
    expect(count(make(1))).toBeLessThan(8000);
    expect(count(make(3))).toBeLessThan(20000);
    expect(count(make(0))).toBeLessThan(count(make(1)));
  });

  it('encloses the head of the skin at rest, from the jaw up, in the shell, at every level of detail', () => {
    for (const lod of [0, 1, 3]) {
      const {
        c,
        e: [ep, eq],
      } = SHELL;
      const [A, B, D] = SHELL.r.map(v => v * SCALE);
      const out = make(lod);
      // The shell as drawn (SCALE smaller), less what its facets cut: no head vertex is out of 97 % of it.
      for (const p of headVertices(lod).filter(p => p[1] > SHELL.rim + 0.01)) {
        const [x, y, z] = [0, 1, 2].map(k => p[k] - c[k]);
        const e =
          ((Math.abs(x / A) ** ep + Math.abs(z / D) ** ep) ** (eq / ep) + Math.abs(y / B) ** eq) **
          (1 / eq);
        expect(e).toBeLessThan(0.97);
      }
      // And inside the whole helmet's bounds, at the rest place.
      const box = [0, 1, 2].map(k => {
        const ks = Array.from({ length: count(out) }, (_, i) => out[i * STRIDE + k] - HEAD[k]);
        return [Math.min(...ks), Math.max(...ks)];
      });
      for (const p of headVertices(lod)) {
        [0, 1, 2].forEach(k => {
          expect(p[k]).toBeGreaterThan(box[k][0]);
          expect(p[k]).toBeLessThan(box[k][1]);
        });
      }
    }
  });

  it('puts the visor in front, over the face, dark and polished, and nothing of it behind', () => {
    for (const lod of [0, 1, 3]) {
      const out = make(lod);
      const shiny = Array.from({ length: count(out) }, (_, i) => i).filter(
        i => out[i * STRIDE + 8] == SHINE,
      );
      expect(shiny.length).toBeGreaterThan(20);
      for (const i of shiny) {
        // Back to the helmet as built.
        const p = at(out, i).map((w, k) => SHELL.c[k] + (w - HEAD[k] - SHELL.c[k]) / SCALE);
        // On the front half of the shell, within the opening wrapped round it.
        expect(p[2]).toBeLessThan(-0.05);
        expect(inside(uOf(p as Vec3), p[1], 1.02)).toBe(true);
        // Dark.
        expect(out[i * STRIDE + 6] + out[i * STRIDE + 7] + out[i * STRIDE + 9]).toBeLessThan(0.3);
      }
      // It reaches past the nose of the face.
      const nose = Math.min(...headVertices(3).map(p => p[2]));
      expect(Math.min(...shiny.map(i => out[i * STRIDE + 2] - HEAD[2]))).toBeLessThan(nose - 0.01);
    }
  });

  it('shows the visor across the whole opening: the first surface hit from the front is the visor', () => {
    /** Distance along +z from (x, y, -1) to the nearest triangle of `v` it crosses, and its layer. */
    const first = (v: number[], x: number, y: number) => {
      let best = [Infinity, 0];
      for (let i = 0; i < count(v); i += 3) {
        const [p, q, r] = [0, 1, 2].map(k => at(v, i + k));
        // Barycentric test in x, y, then the depth there.
        const d = (q[0] - p[0]) * (r[1] - p[1]) - (r[0] - p[0]) * (q[1] - p[1]);
        if (Math.abs(d) < 1e-12) {
          continue;
        }
        const u = ((x - p[0]) * (r[1] - p[1]) - (r[0] - p[0]) * (y - p[1])) / d;
        const w = ((q[0] - p[0]) * (y - p[1]) - (x - p[0]) * (q[1] - p[1])) / d;
        if (u < 0 || w < 0 || u + w > 1) {
          continue;
        }
        const z = p[2] + u * (q[2] - p[2]) + w * (r[2] - p[2]);
        if (z < best[0]) {
          best = [z, v[(i + 0) * STRIDE + 8]];
        }
      }
      return best;
    };
    for (const lod of [0, 1, 3]) {
      const out = make(lod);
      let n = 0;
      // Seen straight on, its middle: up to 40 degrees round each way.
      for (let a = -0.9; a <= 0.9; a += 0.15) {
        for (let b = -0.9; b <= 0.9; b += 0.15) {
          const u = 0.7 * WRAP * a;
          const [m, h] = band(u);
          const y = m + h * 0.8 * b;
          if (!inside(u, y, 0.85)) {
            continue;
          }
          // Where that point of the band is across, on the shell's widest ring.
          const x = SHELL.r[0] * Math.sign(u) * Math.abs(Math.sin(u / WRAP)) ** (2 / SHELL.e[0]);
          const [sx, sy] = shrunk([x, y, 0]);
          const [, layer] = first(out, HEAD[0] + sx, HEAD[1] + sy);
          expect(layer).toBe(SHINE);
          n++;
        }
      }
      expect(n).toBeGreaterThan(60);
      // Outside the opening the shell shows.
      expect(first(out, HEAD[0], HEAD[1] + 0.17)[1]).toBe(GLOSS);
    }
  });

  it('wears the team colour in the glowing strips on the ears, and no crest', () => {
    const near = make(1);
    const lit = Array.from({ length: count(near) }, (_, i) => i).filter(
      i => near[i * STRIDE + 8] == -2,
    );
    expect(lit.length).toBeGreaterThan(0);
    for (const i of lit) {
      expect(near[i * STRIDE + 6]).toBeCloseTo(TEAM[0] * GLOW, 5);
    }
    // Both ears, one each side.
    expect(lit.some(i => near[i * STRIDE] > HEAD[0] + 0.1)).toBe(true);
    expect(lit.some(i => near[i * STRIDE] < HEAD[0] - 0.1)).toBe(true);
    // Nothing else in the team's red (the user, 2026-11-10: no crest on top).
    const red = Array.from({ length: count(near) }, (_, i) => i).filter(
      i => near[i * STRIDE + 8] == -1 && near[i * STRIDE + 6] == TEAM[0],
    );
    expect(red).toEqual([]);
    // The far one has no ears.
    expect(make(0).some((_, i) => i % STRIDE == 8 && make(0)[i] == -2)).toBe(false);
  });

  it('is carried by the head: moved by `at`, turned by `q`', () => {
    const [x, y, z]: Vec3 = [3, 0.5, -2];
    const moved = make(1, [HEAD[0] + x, HEAD[1] + y, HEAD[2] + z]);
    const base = make(1);
    for (let i = 0; i < base.length; i += STRIDE) {
      expect(moved[i] - base[i]).toBeCloseTo(x, 5);
      expect(moved[i + 1] - base[i + 1]).toBeCloseTo(y, 5);
      expect(moved[i + 2] - base[i + 2]).toBeCloseTo(z, 5);
    }
    // A quarter turn about the vertical swings the visor to the side: the front (-z) goes to -x.
    const q = axis([0, 1, 0], Math.PI / 2);
    const turned = make(1, HEAD, q);
    const front = turn(q, [0, 0, -1]);
    expect(front[0]).toBeCloseTo(-1, 6);
    for (let i = 0; i < base.length; i += STRIDE) {
      const local = [0, 1, 2].map(k => base[i + k] - HEAD[k]) as Vec3;
      const want = turn(q, local);
      [0, 1, 2].forEach(k => expect(turned[i + k] - HEAD[k]).toBeCloseTo(want[k], 5));
    }
  });

  it('is built once: the same call gives the same vertices', () => {
    expect(make(1)).toEqual(make(1));
    const probe: number[] = [];
    place(
      probe,
      [0, 0, 0, 0, 1, 0, 1, 1, -1, 1],
      HEAD,
      [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, -1],
      ],
      [0, 0, 0],
      1,
    );
    expect(probe.length).toBe(STRIDE);
  });
});
