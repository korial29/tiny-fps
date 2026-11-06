import { describe, expect, it } from 'vitest';
import { LIFE, createTracer } from './beams';
import { STRIDE } from './mesh';
import type { Vec3 } from './mesh';

const EYE: Vec3 = [0, 1.6, 0];
const FROM: Vec3 = [0.2, 1.4, -0.6];
const TO: Vec3 = [0, 1.6, -40];

const drawn = (t: ReturnType<typeof createTracer>) => {
  const out: number[] = [];
  t.draw(out, EYE);
  expect(out.length % STRIDE).toBe(0);
  expect(out.every(Number.isFinite)).toBe(true);
  return Array.from({ length: out.length / STRIDE }, (_, i) =>
    out.slice(i * STRIDE, (i + 1) * STRIDE),
  );
};
/** The width of the widest ribbon, from its first two corners. */
const width = (v: number[][]) =>
  Math.hypot(v[0][0] - v[1][0], v[0][1] - v[1][1], v[0][2] - v[1][2]);

describe('the tracer', () => {
  it('draws nothing until a shot, then a halo and a core: two glowing ribbons, unlit and above 1', () => {
    const t = createTracer();
    expect(drawn(t)).toEqual([]);
    t.shoot(FROM, TO, false);
    const v = drawn(t);
    expect(v).toHaveLength(12);
    expect(t.count).toBe(1);
    for (const x of v) {
      expect(x[8]).toBe(-2);
      expect(Math.max(x[6], x[7], x[9])).toBeGreaterThan(1);
    }
    // The core is cyan-white, the halo violet.
    expect(v[6][7]).toBeGreaterThan(v[6][6]);
    expect(v[0][9]).toBeGreaterThan(v[0][7]);
  });

  it('runs from the muzzle to where the shot ended', () => {
    const t = createTracer();
    t.shoot(FROM, TO, false);
    const zs = drawn(t).map(v => v[2]);
    expect(Math.max(...zs)).toBeCloseTo(-0.6, 1);
    expect(Math.min(...zs)).toBeCloseTo(-40, 1);
  });

  it('turns its width across the view, whatever the way it goes', () => {
    for (const to of [TO, [30, 1.6, 0], [0, 40, -1], [0.2, 1.4, 10]] as Vec3[]) {
      const t = createTracer();
      t.shoot(FROM, to, false);
      const v = drawn(t);
      const [a, b] = [v[0], v[1]];
      const side = [0, 1, 2].map(k => a[k] - b[k]);
      const d = [0, 1, 2].map(k => to[k] - FROM[k]);
      const toEye = [0, 1, 2].map(k => EYE[k] - FROM[k]);
      const dot = (p: number[], q: number[]) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
      expect(Math.abs(dot(side, d)) / (Math.hypot(...side) * Math.hypot(...d))).toBeLessThan(1e-6);
      expect(
        Math.abs(dot(side, toEye)) / (Math.hypot(...side) * Math.hypot(...toEye) || 1),
      ).toBeLessThan(1e-6);
    }
  });

  it('thins to nothing in LIFE seconds, and is then gone', () => {
    const t = createTracer();
    t.shoot(FROM, TO, false);
    expect(LIFE).toBeCloseTo(0.08, 6);
    const w0 = width(drawn(t));
    t.update(LIFE / 2);
    const w1 = width(drawn(t));
    expect(w1).toBeLessThan(w0);
    expect(w1).toBeGreaterThan(0);
    t.update(LIFE / 2 + 0.001);
    expect(drawn(t)).toEqual([]);
    expect(t.count).toBe(0);
  });

  it('keeps one beam per shot, each with its own age', () => {
    const t = createTracer();
    t.shoot(FROM, TO, false);
    t.update(0.03);
    t.shoot(FROM, TO, false);
    t.shoot(FROM, TO, false);
    expect(t.count).toBe(3);
    expect(drawn(t)).toHaveLength(36);
    t.update(0.06);
    // Only the first has gone.
    expect(t.count).toBe(2);
  });

  it('sparks where a wall stopped it, and not into the open', () => {
    const open = createTracer();
    open.shoot(FROM, TO, false);
    const wall = createTracer();
    wall.shoot(FROM, TO, true);
    expect(drawn(wall).length).toBeGreaterThan(drawn(open).length);
    expect(drawn(open)).toHaveLength(12);
    // The sparks outlast the beam, a little.
    wall.update(LIFE + 0.02);
    expect(drawn(wall).length).toBeGreaterThan(0);
    wall.update(0.5);
    expect(drawn(wall)).toEqual([]);
  });

  it('keeps the sparks near the impact', () => {
    const t = createTracer();
    t.shoot(FROM, TO, true);
    t.update(0.1);
    for (const v of drawn(t).slice(12)) {
      expect(Math.hypot(v[0] - TO[0], v[1] - TO[1], v[2] - TO[2])).toBeLessThan(2);
    }
  });

  it('lights the muzzle for a moment, and the impact when there is one', () => {
    const t = createTracer();
    expect(t.lights()).toEqual([]);
    t.shoot(FROM, TO, true);
    const [flash, hit] = t.lights();
    expect(flash.p).toEqual(FROM);
    expect(hit.p).toEqual(TO);
    expect(flash.color[2]).toBeGreaterThan(1);
    t.update(0.03);
    expect(t.lights()[0].color[2]).toBeLessThan(flash.color[2]);
    t.update(0.03);
    // The beam is still there, but the flash is over.
    expect(t.count).toBe(1);
    expect(t.lights()).toEqual([]);
  });

  it('keeps the own beams on the muzzle as it moves, and the others where they were shot', () => {
    const t = createTracer();
    t.shoot(FROM, TO, false, true);
    t.shoot(FROM, TO, false);
    t.mount([1, 1, 1]);
    const near = drawn(t).filter(v => v[2] > -2);
    const xs = near.map(v => v[0]);
    expect(Math.max(...xs)).toBeGreaterThan(0.9);
    expect(Math.min(...xs)).toBeLessThan(0.3);
  });

  it('keeps at most a handful of beams', () => {
    const t = createTracer();
    for (let i = 0; i < 100; i++) {
      t.shoot(FROM, TO, true);
    }
    expect(t.count).toBeLessThanOrEqual(16);
    expect(drawn(t).length).toBeLessThan(2000);
  });
});
