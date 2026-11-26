import { describe, expect, it } from 'vitest';
import { capsule, cellsOf, grip, held, insulators, lcd, railgun } from '../gun';
import type { Lit } from '../gun';
import { IDENT, verts } from './testing';

describe('the rail gun’s counter and socket', () => {
  it('has its screen square to the left flank, facing back, standing out of it', () => {
    const v = verts(lcd(30));
    const screen = v.filter(x => x.n[2] > 0.9);
    expect(screen.length).toBeGreaterThan(0);
    for (const x of screen) {
      expect(Math.abs(x.n[0])).toBeLessThan(1e-6);
    }
    // Left of the receiver's flank (0.034 out).
    expect(Math.max(...v.map(x => x.p[0]))).toBeLessThan(-0.03);
  });

  it('glows in neon: violet digits and frame on a dark screen, red at 5 or less', () => {
    const neon = (n: number) => verts(lcd(n)).filter(x => x.layer == -2);
    // The frame's four bands, then the digits: 30 is 5 + 6 segments.
    expect(neon(30)).toHaveLength((4 + 11) * 6);
    for (const x of neon(30)) {
      expect(x.c[2]).toBeGreaterThan(x.c[0]);
      expect(x.c[0]).toBeGreaterThan(x.c[1]);
    }
    for (const x of neon(5)) {
      expect(x.c[0]).toBeGreaterThan(x.c[2] * 3);
    }
    for (const x of neon(6)) {
      expect(x.c[2]).toBeGreaterThan(x.c[0]);
    }
    // Nothing else is lit: the case and the screen are dark.
    for (const x of verts(lcd(30)).filter(x => x.layer != -2)) {
      expect(Math.max(...x.c)).toBeLessThan(0.1);
    }
  });

  it('details the rail gun’s tube near: grooves round it, seams, cross-head screws; none far', () => {
    /** Near-black on the receiver (z 0.1 back to -0.13 forward) and the barrel. */
    const dark = (v: number[], z0: number, z1: number) =>
      verts(v).filter(x => x.layer != -2 && Math.max(...x.c) < 0.07 && x.p[2] < z0 && x.p[2] > z1)
        .length;
    expect(dark(railgun(1), 0.1, -0.13)).toBeGreaterThan(800);
    expect(dark(railgun(0), 0.1, -0.13)).toBe(0);
    // Three grooves round the barrel, between the insulators and the coils.
    expect(dark(railgun(1), -0.17, -0.29)).toBeGreaterThan(3 * 10 * 6);
    // The grooves follow the receiver's faces: none sunk in it, none off it.
    for (const x of verts(railgun(1)).filter(
      x => Math.max(...x.c) < 0.07 && x.layer != -2 && x.p[2] < 0.09 && x.p[2] > -0.12,
    )) {
      expect(Math.abs(x.p[0])).toBeLessThan(0.0365);
    }
  });

  it('screws the capsule’s thread into a steel collar on the receiver', () => {
    // The collar stands over the receiver's top round the capsule's foot.
    const near = verts(railgun(1)).filter(
      x => Math.hypot(x.p[0], x.p[2] + 0.1) > 0.023 && Math.hypot(x.p[0], x.p[2] + 0.1) < 0.025,
    );
    expect(Math.max(...near.map(x => x.p[1]))).toBeGreaterThan(0.125);
    // The thread: ridges and grooves round the capsule's base.
    const radii = new Set(
      verts(capsule(1))
        .filter(x => x.p[2] > -0.014 && x.p[2] < -0.001)
        .map(x => Math.round(Math.hypot(x.p[0], x.p[1]) * 1e4)),
    );
    expect(radii.size).toBeGreaterThan(1);
  });
});

describe('the rail gun’s cells and heat', () => {
  const glowing = (v: number[]) => verts(v).filter(x => x.layer == -2);
  it('fills each cell with lightning as high as its level, in nine steps', () => {
    expect(glowing(capsule(1, 0))).toHaveLength(0);
    const top = (l: number) => Math.max(...glowing(capsule(1, l)).map(x => -x.p[2]));
    expect(top(0.25)).toBeLessThan(top(0.625));
    expect(top(0.625)).toBeLessThan(top(1));
    expect(capsule(1, 0.5)).toBe(capsule(1, 0.52));
  });

  it('reads the cell in use from the capsule, the two on the flanks from what is carried beside it', () => {
    expect(cellsOf({ rail: 240, cap: 80 })).toEqual([1, 1, 1]);
    expect(cellsOf({ rail: 150, cap: 50 })).toEqual([50 / 80, 1, 20 / 80]);
    expect(cellsOf({ rail: 30, cap: 30 })).toEqual([30 / 80, 0, 0]);
  });

  it('draws the cell in use on the top and two smaller ones on the flanks, low', () => {
    const out: number[] = [];
    held(out, [0, 0, 0], IDENT, 1, 1, 50, 0, 2, 0, { cells: [1, 1, 1] });
    const cells = glowing(out).filter(x => x.c[2] > 1.5 && x.c[1] < 0.4);
    // Either side of the gun's middle, which is the grip's: off the wrist by the hold.
    const mid = grip([0, 0, 0], IDENT, 2)[0];
    const xs = cells.map(x => x.p[0] - mid);
    expect(Math.min(...xs)).toBeLessThan(-0.03);
    expect(Math.max(...xs)).toBeGreaterThan(0.03);
  });

  it('turns its insulators orange as it heats, glowing near the top', () => {
    expect(glowing(insulators(1, 0))).toHaveLength(0);
    expect(glowing(insulators(1, 0.5))).toHaveLength(0);
    const hot = glowing(insulators(1, 1));
    expect(hot.length).toBeGreaterThan(0);
    expect(hot[0].c[0]).toBeGreaterThan(hot[0].c[2] * 5);
  });

  it('blinks its cells red when overheated, its counter steady, smoke rising off its coils, and no spark at the muzzle', () => {
    const draw = (lit: Lit, t: number) => {
      const out: number[] = [];
      held(out, [0, 0, 0], IDENT, 1, 1, 50, 0, 2, t, lit);
      return out;
    };
    // Smoke is layer -3: see-through, its opacity in green.
    const smoke = (v: number[]) => verts(v).filter(x => x.layer == -3);
    const cool = draw({}, 0.01);
    const [inBlink, outOfBlink] = [draw({ hot: true }, 0.01), draw({ hot: true }, 0.08)];
    // Red where it glowed violet in the blink.
    expect(glowing(inBlink).some(x => x.c[0] > x.c[2] * 5)).toBe(true);
    // The counter does not blink (the user, 2026-11-09): as much drawn in the blink as out of it.
    expect(inBlink.length).toBe(outOfBlink.length);
    // Smoke only when hot.
    expect(smoke(cool)).toHaveLength(0);
    expect(smoke(inBlink).length).toBeGreaterThan(0);
    // Each puff thins away as it rises: some thicker than others.
    const thick = smoke(inBlink).map(x => x.c[1]);
    expect(Math.max(...thick) - Math.min(...thick)).toBeGreaterThan(0.5);
    // No spark: less glow than cool.
    expect(glowing(outOfBlink).length).toBeLessThan(glowing(cool).length);
  });
});
