import { describe, expect, it } from 'vitest';
import { BEACH, HULL as SHAPE, ZED } from '../../shared/beach';
import { STRIDE } from '../mesh';
import { ends } from './hull';
import { parts } from './parts';

type P = number[][];

/** The area two convex polygons share, in a plane (Sutherland-Hodgman, both counter-clockwise). */
const shared = (s: P, c: P) => {
  let out = s;
  c.forEach((a, i) => {
    const b = c[(i + 1) % c.length];
    const side = (p: number[]) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    const was = out;
    out = [];
    was.forEach((p, j) => {
      const q = was[(j + 1) % was.length];
      const [sp, sq] = [side(p), side(q)];
      if (sp >= 0) {
        out.push(p);
      }
      if (sp * sq < 0) {
        out.push(p.map((v, k) => v + (sp / (sp - sq)) * (q[k] - v)));
      }
    });
  });
  return (
    Math.abs(
      out.reduce(
        (s, p, i) => s + p[0] * out[(i + 1) % out.length][1] - out[(i + 1) % out.length][0] * p[1],
        0,
      ),
    ) / 2
  );
};
const ccw = (t: P) =>
  (t[1][0] - t[0][0]) * (t[2][1] - t[0][1]) - (t[1][1] - t[0][1]) * (t[2][0] - t[0][0]) < 0
    ? [...t].reverse()
    : t;

describe('the broken ends', () => {
  // A tear that ran out at the tail's end drew its side on the end's ring, a fairing's cap and a
  // fallen frame's girders lay in an end's plane: the faces fought for the depth in stripes on
  // each flank of the open hull (the user, 2026-11-27). The faces are drawn from both sides.
  it('lay no two faces over each other in the plane of an end', () => {
    const { hull, inside, debris } = parts(BEACH);
    const xs = SHAPE.sections.flatMap((_, n) => ends(n).map(([x]) => x));
    expect(xs).toEqual([36, 44, 74, 82]);
    for (const x of xs) {
      const tris: P[] = [];
      for (const o of [hull, inside, debris]) {
        for (let i = 0; i + 3 * STRIDE <= o.length; i += 3 * STRIDE) {
          const t = [0, 1, 2].map(j => o.slice(i + j * STRIDE, i + j * STRIDE + 3));
          // The hull and its fairings, not the debris that lies far off on the same line.
          if (t.every(p => Math.abs(p[0] - x) < 0.005 && Math.abs(p[2] - ZED / 2) < SHAPE.r + 4)) {
            tris.push(ccw(t.map(p => [p[1], p[2]])));
          }
        }
      }
      expect(tris.length).toBeGreaterThan(20);
      tris.forEach((a, i) =>
        tris.slice(i + 1).forEach(b => {
          expect(
            shared(a, b),
            `x ${x}: ${JSON.stringify(a)} over ${JSON.stringify(b)}`,
          ).toBeLessThan(1e-4);
        }),
      );
    }
  });
});
