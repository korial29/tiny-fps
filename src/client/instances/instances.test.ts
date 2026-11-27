import { describe, expect, it } from 'vitest';
import { FADE, binner } from './cull';
import { FADE_AT, INST } from './types';
import type { Instances } from './types';

/** A clip matrix that keeps everything within 200 m of the origin: column-major, a scale of 1/200. */
const BOX = Float32Array.from([0.005, 0, 0, 0, 0, 0.005, 0, 0, 0, 0, 0.005, 0, 0, 0, 0, 1]);
const EYE = [0, 0, 0];
const [NEAR, FAR] = [20, 100];
/** Meshes 0 (near) and 1 (far), a triangle each; drawn far first to see that `order` is kept. */
const [N, F] = [0, 1];

/** Copies on the x axis at each of `xs`, a sphere of 1 m round each: its distance |x| - 1. */
const row = (xs: number[]): Instances => ({
  mesh: new Array(2 * 3 * 10).fill(0),
  ranges: [0, 3, 3, 3],
  inst: xs.flatMap(x => [x, 0, 0, ...new Array(INST - 3).fill(0)]),
  sphere: xs.flatMap(x => [x, 0, 0, 1]),
  near: xs.map(() => N),
  far: xs.map(() => F),
  order: [N, F],
});
/** What a pass drew: per mesh, each copy's x and its fade code. */
const drawn = (xs: number[], shadow = false) => {
  const b = binner(row(xs));
  b.bin(BOX, EYE, NEAR, FAR, shadow);
  return [N, F].map(mi =>
    Array.from({ length: b.count[mi] }, (_, k) => {
      const o = (b.start[mi] + k) * INST;
      return [b.out[o], b.out[o + FADE_AT]];
    }),
  );
};

describe('instances', () => {
  it('draws a copy near within the band, far past it, and both across it, their shares adding to one', () => {
    const xs = [10, -21, 24, 60];
    const [near, far] = drawn(xs);
    for (const x of xs) {
      const f = Math.min(Math.max((NEAR + FADE / 2 - (Math.abs(x) - 1)) / FADE, 0), 1);
      const n = near.filter(([v]) => v == x);
      const o = far.filter(([v]) => v == x);
      expect([n.length, o.length]).toEqual([+(f > 0), +(f < 1)]);
      if (f > 0 && f < 1) {
        // The near mesh keeps a share f of the pixels, the far one the others (2 + f).
        expect(n[0][1]).toBeCloseTo(f, 5);
        expect(o[0][1]).toBeCloseTo(2 + f, 5);
      } else {
        expect([...n, ...o][0][1]).toBe(1);
      }
    }
  });

  it('fades a far copy out before `far`, casts shadows from the near meshes only, and keeps out what is out of view', () => {
    const [, far] = drawn([FAR - FADE / 2 + 1]);
    expect(far[0][1]).toBeCloseTo(0.5, 5);
    const [near, none] = drawn([10, 21, 60], true);
    expect(none.length).toBe(0);
    expect(near.map(([x]) => x)).toEqual([10, 21]);
    expect(drawn([500]).flat().length).toBe(0);
    expect(drawn([FAR + 2]).flat().length).toBe(0);
  });

  it('writes the copies of a mesh nearest first, whatever their order', () => {
    const [, far] = drawn([70, -40, 55, 90, -65, 45]);
    const d = far.map(([x]) => Math.abs(x));
    expect(d).toEqual([...d].sort((a, b) => a - b));
    expect(d.length).toBe(6);
  });
});
