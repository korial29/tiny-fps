import { describe, expect, it } from 'vitest';
import { NADE_MAX } from '../../shared/constants';
import { cell, fore, rifle, NADE_MUZZLE, RIFLE_GRIP, GUARD, scope, held, tip } from '../gun';
import { STRIDE, unit } from '../mesh';
import type { Vec3 } from '../mesh';
import { IDENT, knob, verts } from './testing';

describe('the laser rifle', () => {
  it('has its grenade launcher in the handguard: a steel barrel out of the block’s front to NADE_MUZZLE, a dark mouth', () => {
    for (const lod of [0, 1]) {
      const vs = verts(rifle(lod));
      // Ahead of the block's front, under the body: only the launcher's barrel.
      const front = -RIFLE_GRIP[2] + 0.08;
      const barrel = vs.filter(
        v => -v.p[2] > front + 0.005 && -v.p[2] < front + 0.05 && v.p[1] < NADE_MUZZLE[1] + 0.02,
      );
      expect(barrel.length, `lod ${lod}`).toBeGreaterThan(10);
      expect(Math.max(...barrel.map(v => -v.p[2]))).toBeCloseTo(-NADE_MUZZLE[2], 2);
      expect(Math.max(...barrel.map(v => Math.abs(v.p[0])))).toBeLessThan(GUARD[0]);
      // Its mouth is dark: the darkest thing there, at the muzzle's height.
      const mouth = barrel.filter(v => Math.max(...v.c) < 0.03);
      expect(mouth.length, `lod ${lod}`).toBeGreaterThan(2);
      for (const v of mouth) {
        expect(Math.abs(v.p[1] - NADE_MUZZLE[1])).toBeLessThan(0.014);
      }
    }
  });

  it('has its red lens where tip() puts its muzzle, and the hold of the left hand under the body, ahead of the grip', () => {
    const vs = verts(rifle(1));
    const lens = vs.filter(v => v.layer === -2 && v.c[0] > 2);
    expect(lens.length).toBeGreaterThan(10);
    const ax: Vec3[] = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, -1],
    ];
    const m = tip([0, 0, 0], ax, 3);
    const nearest = Math.min(...lens.map(v => Math.hypot(...v.p.map((x, k) => x - m[k]))));
    expect(nearest).toBeLessThan(0.02);
    const [at] = fore([0, 0, 0], ax, 3);
    // Under the body's front (its axis 6 cm up, its underside 2.5 cm under that).
    expect(at[1]).toBeLessThan(0.035);
    expect(at[2]).toBeLessThan(-0.1);
  });

  it('shows its rounds on the counter once it is booted, and only its ring before', () => {
    expect(scope(24).length).toBeGreaterThan(scope(24, false).length);
    expect(scope(8).length).not.toBe(scope(24).length);
  });

  it('shows the grenades left under its rounds: NADE_MAX pips, orange when loaded, dim once spent (the user, 2026-11-10)', () => {
    const orange = (v: number[]) =>
      verts(v).filter(x => x.c[0] > 1.2 && x.c[1] > 0.5 && x.c[1] < 0.6 && x.c[2] < 0.1).length;
    const dim = (v: number[]) =>
      verts(v).filter(x => x.c[0] > 0.2 && x.c[0] < 0.25 && x.c[1] < 0.1 && x.c[2] < 0.05).length;
    // Two triangles a pip.
    expect(orange(scope(24, true, NADE_MAX))).toBe(NADE_MAX * 6);
    expect(orange(scope(24, true, 1))).toBe(6);
    expect(dim(scope(24, true, 1))).toBe((NADE_MAX - 1) * 6);
    expect(orange(scope(24, true, 0)) + dim(scope(24))).toBe(0);
    // Not before the counter is booted, nor without the launcher's count.
    expect(scope(24, false, NADE_MAX)).toEqual(scope(24, false));
    expect(scope(24, true, NADE_MAX).length).toBe(scope(24).length + NADE_MAX * 6 * STRIDE);
  });

  it('keeps the digits of its counter small in the middle of the screen, well clear of the ring', () => {
    // Red at 3, like the ring: the digits stand a hair further out of the screen than it. In the
    // screen's plane: across, and up it.
    const v = scope(3);
    const up = unit([0, 1, -0.8]);
    const y = (0.099 + 0.1325) / 2;
    const mid: Vec3 = [0, y, 0.115 - 0.8 * (y - 0.085)];
    const sh = (0.1325 - 0.099) / 2 / up[1];
    const out = (i: number) => (v[i + 1] - mid[1]) * -up[2] + (v[i + 2] - mid[2]) * up[1];
    for (let i = 0; i < v.length; i += STRIDE) {
      if (v[i + 6] > 1 && v[i + 7] < 0.5 && out(i) > 0.00475) {
        const b = (v[i + 1] - mid[1]) * up[1] + (v[i + 2] - mid[2]) * up[2];
        // The screen's half width at b, less its ring.
        const half = 0.019 - (0.0045 * (b + sh)) / (2 * sh) - 0.0014;
        expect(Math.abs(v[i])).toBeLessThan(half - 0.004);
        expect(Math.abs(b)).toBeLessThan(sh - 0.008);
      }
    }
  });

  it('fills the back of its housing above the body with the counter, but for a thin rim of metal', () => {
    // The dark screen, its first two triangles, set 4 mm out of the face: its corners brought back onto it.
    const up = unit([0, 1, -0.8]);
    const on = verts(scope(24))
      .slice(0, 6)
      .map(({ p }) => [p[0], p[1] + up[2] * 0.004, p[2] - up[1] * 0.004]);
    const ys = on.map(p => p[1]);
    expect(Math.min(...ys)).toBeCloseTo(0.099, 4);
    expect(Math.max(...ys)).toBeCloseTo(0.1325, 4);
    for (const p of on) {
      // The face's half width at that height, wide at the foot, narrower at the top.
      const face = 0.022 - (0.006 * (p[1] - 0.085)) / 0.05;
      expect(Math.abs(p[0])).toBeGreaterThan(face - 0.002);
      expect(Math.abs(p[0])).toBeLessThan(face);
    }
  });

  it('rings its counter in the colour of its digits', () => {
    const red = (v: number[]) =>
      verts(v)
        .filter(x => x.layer == -2)
        .every(x => x.c[0] > 1 && x.c[1] < 0.5);
    expect(red(scope(3))).toBe(true);
    expect(
      verts(scope(24))
        .filter(x => x.layer == -2)
        .every(x => x.c[2] > 1),
    ).toBe(true);
  });

  it('carries grooves, screws and three LEDs a side on its near model only', () => {
    // The amber LED: glowing, more red than green, little blue.
    const amber = (v: number[]) =>
      verts(v).filter(
        x => x.layer == -2 && x.c[0] > 1.5 && x.c[1] > 0.7 && x.c[1] < 1 && x.c[2] < 0.2,
      );
    const leds = amber(rifle(1));
    expect(leds.length).toBe(12);
    expect(new Set(leds.map(x => Math.sign(x.p[0]))).size).toBe(2);
    expect(amber(rifle(0))).toHaveLength(0);
    // Near-black grooves and slots on the housing's top.
    const top = verts(rifle(1)).filter(x => x.n[1] > 0.99 && x.p[1] > 0.13 && x.c[0] < 0.06);
    expect(top.length).toBeGreaterThan(0);
  });

  it('is drawn in the hand with its cell, by kind 3', () => {
    const out: number[] = [];
    held(out, [0, 0, 0], IDENT, 1, 1, 24, 0, 3);
    expect(out.length).toBe(cell(1).length + rifle(1).length + knob(3).length + scope(24).length);
  });
});
