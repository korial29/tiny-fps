import { describe, expect, it } from 'vitest';
import { MOON } from '../shared/moon';
import { build } from '../shared/world';
import { LIGHT, createDoors, panels } from './doors';
import { STRIDE } from './mesh';
import { SOUND } from './sfx';

/** The vertices of a door drawn `open`. */
const drawn = (i: number, open: number) => {
  const v: number[] = [];
  panels(v, MOON.doors![i], open);
  return Array.from({ length: v.length / STRIDE }, (_, k) => v.slice(k * STRIDE, (k + 1) * STRIDE));
};
/** Whether a point is inside a brush of the map, ghosts too: in a wall. */
const walled = (p: number[]) =>
  MOON.brushes.some(b => [0, 1, 2].every(a => b.min[a] - 1e-6 <= p[a] && p[a] <= b.max[a] + 1e-6));

describe('doors, drawn', () => {
  it('fills the doorway with two panels that meet in the middle when shut, in a frame', () => {
    MOON.doors!.forEach(({ min, max }, i) => {
      const v = drawn(i, 0);
      expect(v.length % 3).toBe(0);
      expect(v.every(p => p.every(Number.isFinite))).toBe(true);
      // Nothing past the doorway, and nothing proud of the frame's 8 cm.
      expect(Math.min(...v.map(p => p[0]))).toBeCloseTo(min[0], 9);
      expect(Math.max(...v.map(p => p[0]))).toBeCloseTo(max[0], 9);
      expect(Math.min(...v.map(p => p[2]))).toBeCloseTo(min[2] - 0.08, 9);
      expect(Math.max(...v.map(p => p[2]))).toBeCloseTo(max[2] + 0.08, 9);
      expect(Math.max(...v.map(p => p[1]))).toBeCloseTo(max[1], 9);
      // The seam: both panels have an edge on the middle.
      const mid = (min[0] + max[0]) / 2;
      expect(v.filter(p => Math.abs(p[0] - mid) < 1e-9).length).toBeGreaterThan(8);
    });
  });

  it('slides the panels into the wall: open, nothing is left across the opening and nothing shows out of the wall', () => {
    MOON.doors!.forEach(({ min, max }, i) => {
      const [x0, x1] = [min[0] + 0.1, max[0] - 0.1];
      for (const open of [0.5, 1]) {
        const v = drawn(i, open);
        // Beside the doorway every vertex is in a wall, a centimetre or more under its face.
        for (const p of v.filter(p => p[0] < min[0] - 1e-6 || p[0] > max[0] + 1e-6)) {
          expect(walled([p[0], p[1], p[2] - 0.011]) && walled([p[0], p[1], p[2] + 0.011])).toBe(
            true,
          );
        }
        const across = v.filter(p => p[0] > x0 + 1e-6 && p[0] < x1 - 1e-6 && p[1] < max[1] - 0.11);
        if (open === 1) {
          expect(across).toEqual([]);
        } else {
          // Half open: the middle half of the doorway is clear.
          const w = (max[0] - min[0]) / 4;
          const mid = (min[0] + max[0]) / 2;
          expect(across.some(p => Math.abs(p[0] - mid) < w - 1e-6)).toBe(false);
          expect(across.length).toBeGreaterThan(0);
        }
      }
      // And it reaches as far into the wall as it is wide.
      const far = drawn(i, 1).map(p => p[0]);
      expect(Math.min(...far)).toBeCloseTo(min[0] - (max[0] - min[0]) / 2, 9);
    });
  });

  it('lights its strips red when shut and green as soon as it opens, on both faces of both panels', () => {
    for (const [open, rgb] of [
      [0, LIGHT[0]],
      [0.05, LIGHT[1]],
      [1, LIGHT[1]],
    ] as const) {
      const glow = drawn(0, open).filter(p => p[8] === -2);
      expect(glow).toHaveLength(4 * 6);
      for (const p of glow) {
        expect([p[6] / 1.6, p[7] / 1.6, p[9] / 1.6].map(c => +c.toFixed(6))).toEqual(rgb);
      }
    }
    expect(LIGHT[0][0]).toBeGreaterThan(5 * LIGHT[0][1]);
    expect(LIGHT[1][1]).toBeGreaterThan(3 * LIGHT[1][0]);
  });

  it('stays within its vertices: under 400 a door', () => {
    for (const open of [0, 0.4, 1]) {
      expect(drawn(0, open).length).toBeLessThan(400);
      expect(drawn(0, open).length).toBeGreaterThan(150);
    }
  });
});

describe('doors, from the snapshots', () => {
  it('copies each snapshot to the world, so a ray of the client stops where the host says a door is shut', () => {
    const w = build(MOON);
    const d = createDoors(w);
    d.snapshot([1, 0, 0.4, 0, 0, 0]);
    expect(w.doors!.map(s => s.open)).toEqual([1, 0, 0.4, 0, 0, 0]);
    d.snapshot(undefined);
    expect(w.doors!.every(s => s.open === 0)).toBe(true);
    // A map without doors: nothing to do, nothing drawn.
    const none = createDoors(build({ ...MOON, doors: undefined }));
    expect(none.snapshot([1])).toEqual([]);
    const v: number[] = [];
    none.draw(v, [0, 0, 0], 0.1);
    expect(v).toEqual([]);
  });

  it('plays the hiss once when a door starts to open and once when it starts to shut, where it is', () => {
    const d = createDoors(build(MOON));
    const rest = [0, 0, 0, 0, 0];
    expect(d.snapshot([0, ...rest])).toEqual([]);
    const { min, max } = MOON.doors![0];
    const at = [0, 1, 2].map(a => (min[a] + max[a]) / 2);
    expect(d.snapshot([0.2, ...rest])).toEqual([{ id: SOUND.DOOR, at }]);
    for (const open of [0.4, 0.4, 0.8, 1, 1, 1]) {
      expect(d.snapshot([open, ...rest])).toEqual([]);
    }
    expect(d.snapshot([14 / 15, ...rest])).toEqual([{ id: SOUND.SHUT, at }]);
    for (const open of [0.8, 0.8, 0.5, 0.1, 0, 0]) {
      expect(d.snapshot([open, ...rest])).toEqual([]);
    }
    // Opened again half way through shutting: the opening is heard again.
    d.snapshot([1, ...rest]);
    d.snapshot([0.9, ...rest]);
    expect(d.snapshot([1, ...rest])).toEqual([{ id: SOUND.DOOR, at }]);
    expect([SOUND.DOOR, SOUND.SHUT]).toEqual([45, 46]);
  });

  it('draws each door gliding to its snapshot state, and only the doors near the eye', () => {
    const d = createDoors(build(MOON));
    d.snapshot([1, 0, 0, 0, 0, 0]);
    const v: number[] = [];
    d.draw(v, [80, 2, 200], 1 / 60);
    expect(d.shown()[0]).toBeCloseTo(1 / 60 / 0.3, 9);
    for (let k = 0; k < 30; k++) {
      d.draw([], [80, 2, 200], 1 / 60);
    }
    expect(d.shown()).toEqual([1, 0, 0, 0, 0, 0]);
    // The three of red's base are drawn from there, blue's are 150 m away and drawn too; from 300 m none.
    const one: number[] = [];
    panels(one, MOON.doors![0], 1 / 60 / 0.3);
    expect(v.slice(0, one.length)).toEqual(one);
    expect(v.length).toBeGreaterThan(5 * one.length);
    const far: number[] = [];
    d.draw(far, [80, 2, 600], 0);
    expect(far).toEqual([]);
  });
});
