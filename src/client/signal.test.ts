import { describe, expect, it } from 'vitest';
import { createSignal, scramble } from './signal';

/** A small generator of its own, so that a picture is the same each run. */
const seeded =
  (seed = 1) =>
  () =>
    ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

/** A picture `w` by `h`: a gradient in each channel, opaque. */
const W = 48;
const picture = () => {
  const p = new Uint8ClampedArray(W * W * 4);
  for (let i = 0; i < W * W; i++) {
    [p[i * 4], p[i * 4 + 1], p[i * 4 + 2], p[i * 4 + 3]] = [(i % W) * 5, (i / W) * 5, 128, 255];
  }
  return p;
};
/** The mean difference of two pictures' colours, 0 to 255. */
const apart = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
  let d = 0;
  for (let i = 0; i < a.length; i += 4) {
    d += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
  }
  return d / ((a.length / 4) * 3);
};

describe('scramble', () => {
  it('keeps the face readable with a clear signal, and loses it with none', () => {
    const src = picture();
    const [clear, lost] = [new Uint8ClampedArray(src.length), new Uint8ClampedArray(src.length)];
    scramble(src, clear, W, W, 0, seeded());
    scramble(src, lost, W, W, 1, seeded());
    expect(apart(src, clear)).toBeLessThan(25);
    expect(apart(src, lost)).toBeGreaterThan(2 * apart(src, clear));
  });

  it('spoils more of the rows as the signal goes', () => {
    const src = picture();
    /** Rows whose red is mostly not the source's: torn, blocked, lost or under heavy grain. */
    const torn = (k: number) => {
      const out = new Uint8ClampedArray(src.length);
      scramble(src, out, W, W, k, seeded(7));
      let n = 0;
      for (let y = 0; y < W; y++) {
        let off = 0;
        for (let x = 0; x < W; x++) {
          // Against the source as its scanline dims it.
          const dim = y % 3 ? 1 : 0.7;
          off += +(Math.abs(out[(y * W + x) * 4] - src[(y * W + x) * 4] * dim) > 40);
        }
        n += +(off > W / 3);
      }
      return n;
    };
    expect(torn(0)).toBe(0);
    expect(torn(0.9)).toBeGreaterThan(W / 4);
  });

  it('writes every pixel opaque', () => {
    const out = new Uint8ClampedArray(W * W * 4);
    scramble(picture(), out, W, W, 0.6, seeded(3));
    for (let i = 3; i < out.length; i += 4) {
      expect(out[i]).toBe(255);
    }
  });
});

describe('createSignal', () => {
  it('locks on from static, wavers clear enough through the line, and is lost after it', () => {
    const loss = createSignal(1, 0.5);
    // Never a dropout.
    const steady = () => 0.99;
    const at: number[] = [];
    for (let t = 0; t < 1.6; t += 0.05) {
      at.push(loss(0.05, steady));
    }
    expect(at[0]).toBeGreaterThan(0.8);
    for (const k of at.slice(7, 20)) {
      expect(k).toBeLessThan(0.3);
    }
    expect(at.at(-1)).toBe(1);
  });

  it('drops out now and then for a moment', () => {
    const loss = createSignal(10, 0.5);
    const rand = seeded(5);
    const ks = Array.from({ length: 600 }, () => loss(1 / 60, rand)).slice(30);
    const drops = ks.filter((k, i) => k >= 0.85 && ks[i - 1] < 0.85).length;
    // About 1.4 a second over 9.5 s.
    expect(drops).toBeGreaterThan(5);
    expect(drops).toBeLessThan(25);
  });
});
