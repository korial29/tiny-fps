import { describe, expect, it } from 'vitest';
import { LIMB } from '../shared/types';
import { GLOW } from './flag';
import { SHELL, VISOR, helmet } from './helmet';
import { SHINE, STRIDE, place } from './mesh';
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

  it('stays modest: under 150 vertices far, under 600 near', () => {
    expect(count(make(0))).toBeLessThan(150);
    expect(count(make(1))).toBeLessThan(600);
    expect(count(make(3))).toBeLessThan(900);
    expect(count(make(0))).toBeLessThan(count(make(1)));
  });

  it('encloses the head of the skin at rest, from the jaw up, in the shell, at every level of detail', () => {
    for (const lod of [0, 1, 3]) {
      const { c, r } = SHELL;
      const out = make(lod);
      // The shell's ellipsoid, less what its facets cut: no head vertex is out of 97 % of it.
      for (const p of headVertices(lod).filter(p => p[1] > SHELL.rim + 0.01)) {
        const e = Math.hypot(...[0, 1, 2].map(k => (p[k] - c[k]) / r[k]));
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
        const p = at(out, i).map((w, k) => w - HEAD[k]);
        // The front half of the head, within the bubble.
        expect(p[2]).toBeLessThan(VISOR.c[2] + 1e-6);
        expect(Math.abs(p[0])).toBeLessThanOrEqual(VISOR.r[0] + 1e-6);
        // Dark.
        expect(out[i * STRIDE + 6] + out[i * STRIDE + 7] + out[i * STRIDE + 9]).toBeLessThan(0.3);
      }
      // It reaches past the nose of the face.
      const nose = Math.min(...headVertices(3).map(p => p[2]));
      expect(Math.min(...shiny.map(i => out[i * STRIDE + 2] - HEAD[2]))).toBeLessThan(nose - 0.01);
    }
  });

  it('wears a crest, and the beads on the ears glow, in the team colour', () => {
    const near = make(1);
    const lit = Array.from({ length: count(near) }, (_, i) => i).filter(
      i => near[i * STRIDE + 8] == -2,
    );
    expect(lit.length).toBeGreaterThan(0);
    for (const i of lit) {
      expect(near[i * STRIDE + 6]).toBeCloseTo(TEAM[0] * GLOW, 5);
    }
    // Both ears, one each side; the crest on top, in the team's red.
    expect(lit.some(i => near[i * STRIDE] > HEAD[0] + 0.1)).toBe(true);
    expect(lit.some(i => near[i * STRIDE] < HEAD[0] - 0.1)).toBe(true);
    const red = Array.from({ length: count(near) }, (_, i) => i).filter(
      i => near[i * STRIDE + 8] == -1 && near[i * STRIDE + 6] == TEAM[0],
    );
    expect(Math.max(...red.map(i => near[i * STRIDE + 1]))).toBeGreaterThan(HEAD[1] + 0.2);
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
