import { describe, expect, it } from 'vitest';
import { SKIN, SOLE, SPINE, hand, neck, shoe, torso } from './figure';
import { STRIDE } from './mesh';
import type { Vec3 } from './mesh';

const UP: Vec3 = [0, 1, 0];
const FWD: Vec3 = [0, 0, -1];
const RIGHT: Vec3 = [1, 0, 0];
const verts = (f: (out: number[]) => void) => {
  const out: number[] = [];
  f(out);
  return Array.from({ length: out.length / STRIDE }, (_, i) =>
    out.slice(i * STRIDE, (i + 1) * STRIDE),
  );
};
const span = (v: number[][], axis: number) => [
  Math.min(...v.map(p => p[axis])),
  Math.max(...v.map(p => p[axis])),
];

describe('hand', () => {
  /** A hand at the origin with the fingers along -z, its back up, the thumb on the left (t = -1). */
  const open = (curl: number, t = -1) => verts(out => hand(out, [0, 0, 0], FWD, RIGHT, t, curl));

  it('is a palm and ten finger segments, whatever the curl', () => {
    expect(open(0)).toHaveLength(126 + 10 * 90);
    expect(open(1)).toHaveLength(126 + 10 * 90);
  });

  it('spreads flat and open at 0: the fingers reach past the palm, level with its back', () => {
    const v = open(0);
    // The palm ends 10 cm from the wrist and the fingers 8 cm further.
    expect(-span(v, 2)[0]).toBeGreaterThan(0.17);
    expect(span(v, 1)[1] - span(v, 1)[0]).toBeLessThan(0.07);
  });

  it('curls into a fist at 1: the fingers fold back toward the palm, under the hand', () => {
    const [flat, fist] = [open(0), open(1)];
    expect(-span(fist, 2)[0]).toBeLessThan(-span(flat, 2)[0] - 0.05);
    // They close on the palm side, down when the back is up.
    expect(span(fist, 1)[0]).toBeLessThan(span(flat, 1)[0] - 0.02);
    // Part way is part way.
    const half = -span(open(0.5), 2)[0];
    expect(half).toBeLessThan(-span(flat, 2)[0]);
    expect(half).toBeGreaterThan(-span(fist, 2)[0]);
  });

  it('puts the thumb on its side, and mirrors with t', () => {
    // The palm is symmetric: the thumb makes the side it is on reach further out.
    const [left, right] = [open(0, -1), open(0, 1)];
    expect(-span(left, 0)[0]).toBeGreaterThan(span(left, 0)[1] + 0.02);
    expect(span(right, 0)[1]).toBeGreaterThan(-span(right, 0)[0] + 0.02);
  });

  it('is skin, with unit normals', () => {
    for (const p of open(0.4)) {
      expect([p[6], p[7], p[9]]).toEqual(SKIN);
      expect(Math.hypot(p[3], p[4], p[5])).toBeCloseTo(1);
    }
  });

  it('turns with the pointing: the same hand along +x reaches along +x', () => {
    const v = verts(out => hand(out, [0, 0, 0], [1, 0, 0], [0, 0, 1], -1, 0));
    expect(span(v, 0)[1]).toBeGreaterThan(0.17);
    expect(span(v, 0)[0]).toBeGreaterThan(-0.03);
  });
});

describe('torso', () => {
  const [jacket, trousers] = [
    [0.8, 0.1, 0.1],
    [0.1, 0.1, 0.8],
  ];
  const v = verts(out => torso(out, 1, [0, 1, 0], UP, FWD, RIGHT, jacket, trousers));

  it('rises SPINE from the pelvis, wider than it is deep, hips in the trousers', () => {
    const j = v.filter(p => p[6] == jacket[0]);
    expect(span(j, 1)[1]).toBeCloseTo(1 + SPINE, 1);
    expect(span(j, 1)[0]).toBeCloseTo(1, 1);
    expect(span(j, 0)[1]).toBeGreaterThan(span(j, 2)[1] * 1.4);
    const h = v.filter(p => p[6] == trousers[0]);
    expect(h.length).toBeGreaterThan(50);
    expect(span(h, 0)[1]).toBeGreaterThan(span(h, 2)[1]);
  });

  it('shortens to k, and keeps unit normals', () => {
    const short = verts(out => torso(out, 1, [0, 1, 0], UP, FWD, RIGHT, jacket, trousers, 0.5));
    expect(
      span(
        short.filter(p => p[6] == jacket[0]),
        1,
      )[1],
    ).toBeCloseTo(1 + SPINE / 2, 1);
    for (const p of v) {
      expect(Math.hypot(p[3], p[4], p[5])).toBeCloseTo(1);
    }
  });

  it('has a neck of skin up into the head', () => {
    const n = verts(out => neck(out, 1, [0, 1, 0], UP, RIGHT));
    expect(n.every(p => p[6] == SKIN[0])).toBe(true);
    expect(span(n, 1)[1]).toBeGreaterThan(1 + SPINE);
    expect(span(n, 1)[0]).toBeLessThan(1 + SPINE);
  });
});

describe('shoe', () => {
  const upper = [0.1, 0.1, 0.1];
  const worn = (lod: number, shin: Vec3 = [0, -1, 0]) =>
    verts(out => shoe(out, lod, [0, 0.07, 0], shin, FWD, RIGHT, upper));

  it('puts its sole on the floor under an ankle 7 cm up, toes ahead, heel behind', () => {
    const v = worn(1);
    expect(span(v, 1)[0]).toBeCloseTo(0, 1);
    expect(-span(v, 2)[0]).toBeGreaterThan(0.17);
    expect(span(v, 2)[1]).toBeGreaterThan(0.03);
    expect(span(v, 2)[1]).toBeLessThan(0.12);
    expect(span(v, 0)[1] - span(v, 0)[0]).toBeLessThan(0.12);
    expect(v.some(p => p[6] == SOLE[0])).toBe(true);
    expect(v.some(p => p[6] == upper[0])).toBe(true);
  });

  it('adds a toe cap only at the finest level, and costs more there', () => {
    expect(worn(2).length).toBeGreaterThan(worn(1).length);
    expect(worn(1).length).toBeGreaterThan(worn(0).length);
    const caps = (lod: number) => worn(lod).filter(p => p[6] == SOLE[0]).length;
    expect(caps(2)).toBeGreaterThan(caps(1));
  });

  it('stays square to the shin: toes drop when the shin trails back, rise when it reaches forward', () => {
    const toes = (shin: Vec3) => span(worn(1, shin), 1)[0];
    // A shin trailing behind the knee (the foot is back and its toes are down), against one forward.
    const [back, ahead] = [toes([0, -0.8, 0.6]), toes([0, -0.8, -0.6])];
    expect(back).toBeLessThan(ahead);
  });
});
