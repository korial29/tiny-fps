import { describe, expect, it } from 'vitest';
import { MOON } from '../../shared/moon';
import { N, SPAN } from '../prints';
import { fragOf } from './shader';

// The weights of bqw() in FRAG, line for line: a cubic B-spline over four texels, read as two
// bilinear taps a side (a: texels i - 1 and i, b: texels i + 1 and i + 2; g0 the share of a).
const bqw = (u: number, n: number) => {
  const p = u * n - 0.5;
  const i = Math.floor(p);
  const f = p - i;
  const [f2, f3] = [f * f, f * f * f];
  const w0 = (1 - 3 * f + 3 * f2 - f3) / 6;
  const w1 = (4 - 6 * f2 + 3 * f3) / 6;
  const g0 = w0 + w1;
  return { g0, a: (i - 0.5 + w1 / g0) / n, b: (i + 1.5 + f3 / 6 / (1 - g0)) / n };
};

/** A 1D texture of n texels read with LINEAR filtering at u (texel j's centre at (j + 0.5) / n). */
const linear = (tex: number[], u: number) => {
  const p = u * tex.length - 0.5;
  const i = Math.floor(p);
  const at = (j: number) => tex[Math.min(Math.max(j, 0), tex.length - 1)];
  return at(i) + (at(i + 1) - at(i)) * (p - i);
};
const bicubic = (tex: number[], u: number) => {
  const { g0, a, b } = bqw(u, tex.length);
  return g0 * linear(tex, a) + (1 - g0) * linear(tex, b);
};

/** The largest jump in slope across a texel's centre, where LINEAR's slope changes. */
const kink = (read: (u: number) => number, n: number) => {
  let worst = 0;
  const e = 1e-4 / n;
  for (let j = 4; j < n - 4; j++) {
    const c = (j + 0.5) / n;
    const left = (read(c) - read(c - e)) / e;
    const right = (read(c + e) - read(c)) / e;
    worst = Math.max(worst, Math.abs(right - left));
  }
  return worst;
};

describe('the ground up close', () => {
  // A random height row, as the regolith's tile and the footprints' map hold.
  const tex = Array.from(
    { length: 32 },
    (_, k) => Math.abs(Math.sin(k * 12.9898) * 43758.5453) % 1,
  );

  it('reads the bump through a filter whose slope does not step at each texel', () => {
    // LINEAR: a flat facet a texel, lit as a square on the screen (the user, 2026-11-26).
    expect(kink(u => linear(tex, u), tex.length)).toBeGreaterThan(1);
    expect(kink(u => bicubic(tex, u), tex.length)).toBeLessThan(0.05);
  });

  it('keeps the texture where it is: a linear ramp reads back unchanged', () => {
    const ramp = tex.map((_, k) => k / 10);
    for (let u = 0.2; u < 0.8; u += 0.013) {
      expect(bicubic(ramp, u)).toBeCloseTo(linear(ramp, u), 6);
    }
  });

  it('samples the regolith and the footprints through it on the moon', () => {
    const frag = fragOf(MOON);
    expect(frag).toContain('bc(S,ua,L,');
    expect(frag).toContain('vec4 prm=bp(');
  });

  it('keeps a footprint texel under 1.25 cm, so a sole has an edge', () => {
    expect(SPAN / N).toBeLessThan(0.0125);
  });
});
