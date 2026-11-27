import { describe, expect, it } from 'vitest';
import { LAYOUT } from '../../shared/beach';
import { STRIDE } from '../mesh';
import { setO } from './common';
import { KIND } from './debris';

/** The axis-aligned rectangles a piece is drawn in: box() and face() lay each as two triangles, six vertices. */
const rects = (kind: string) => {
  const p = LAYOUT.pieces.find(e => e.kind === kind)!;
  const o: number[] = [];
  setO(o);
  KIND[kind](p, undefined, 1);
  const out: { axis: number; at: number; lo: number[]; hi: number[] }[] = [];
  for (let i = 0; i + 6 * STRIDE <= o.length; i += 6 * STRIDE) {
    const v = Array.from({ length: 6 }, (_, j) => o.slice(i + j * STRIDE, i + (j + 1) * STRIDE));
    const axis = [0, 1, 2].find(a => Math.abs(v[0][3 + a]) > 0.999);
    if (axis === undefined || v.some(e => Math.abs(e[axis] - v[0][axis]) > 1e-6)) {
      continue;
    }
    const [p, q] = [0, 1, 2].filter(a => a !== axis);
    out.push({
      axis,
      at: v[0][axis],
      lo: [p, q].map(a => Math.min(...v.map(e => e[a]))),
      hi: [p, q].map(a => Math.max(...v.map(e => e[a]))),
    });
  }
  return out;
};

describe('debris', () => {
  // The web of a rail and the rib of a frame ran through their flanges and girders: their tops
  // and ends lay in the same planes and the two fought for the depth, in stripes (2026-11-27).
  it.each(['rail', 'frame'])('lays no face of a %s over another in the same plane', kind => {
    const l = rects(kind);
    expect(l.length).toBeGreaterThan(10);
    l.forEach((a, i) =>
      l.slice(i + 1).forEach(b => {
        const fight =
          a.axis === b.axis &&
          Math.abs(a.at - b.at) < 1e-4 &&
          [0, 1].every(k => Math.min(a.hi[k], b.hi[k]) - Math.max(a.lo[k], b.lo[k]) > 1e-4);
        expect(fight, `${kind}: ${JSON.stringify(a)} and ${JSON.stringify(b)}`).toBe(false);
      }),
    );
  });
});
