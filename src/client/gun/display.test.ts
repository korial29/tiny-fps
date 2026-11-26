import { describe, expect, it } from 'vitest';
import { CHARGE_MAX } from '../../shared/constants';
import { held, readout, TRACKS } from '../gun';
import { unit } from '../mesh';
import { IDENT, verts } from './testing';

describe('the readout on the back of the gun', () => {
  const v = (n: number) => verts(readout(n));
  // The glowing frame round the screen comes after the digits, 32 quads, then the circuit's tracks:
  // a quad for each run of a track and its pad, twice, mirrored.
  const T = TRACKS.reduce((s, t) => s + t.length, 0) * 12;
  const glowing = (n: number) => v(n).filter(x => x.layer == -2);
  const digits = (n: number) => glowing(n).slice(0, -192 - T);
  const frame = (n: number) => glowing(n).slice(-192 - T, -T);
  const tracks = (n: number) => glowing(n).slice(-T);
  const metal = (n: number) => v(n).filter(x => x.layer == -1 && Math.max(...x.c) > 0.1);
  const screen = (n: number) => v(n).filter(x => x.layer == -1 && Math.max(...x.c) <= 0.1);
  const SEGS = [6, 2, 5, 5, 4, 5, 6, 3, 7, 6];

  it('is two digits of thick quads on the gun’s own glossy black back, a pair of triangles to a segment', () => {
    for (const n of [0, 7, 40, 59, 60, 99]) {
      const [a, b] = `${n}`.padStart(2, '0');
      expect(digits(n)).toHaveLength((SEGS[+a] + SEGS[+b]) * 6);
      // No block, support or screen of its own (the user, 2026-11-09): the digits and the frame only.
      expect(metal(n)).toHaveLength(0);
      expect(screen(n)).toHaveLength(0);
      expect(v(n).filter(x => x.layer != -2)).toHaveLength(0);
    }
  });

  it('is glowing but modest (unlit, layer -2, near 1 so the bloom does not smear it): cyan above four, red at four and under', () => {
    for (const x of digits(40)) {
      expect(x.layer).toBe(-2);
      expect(x.c[2]).toBeGreaterThan(x.c[0] * 2);
      expect(Math.max(...x.c)).toBeGreaterThan(0.8);
      expect(Math.max(...x.c)).toBeLessThan(1.3);
    }
    for (const n of [4, 2, 0]) {
      for (const x of digits(n)) {
        expect(x.c[0]).toBeGreaterThan(x.c[1] * 3);
        expect(Math.max(...x.c)).toBeLessThan(1.3);
      }
    }
    expect(digits(5)[0].c[0]).toBeLessThan(digits(5)[0].c[2]);
  });

  it('shows digits about 4.2 cm wide and 2 cm high, 4.6 cm wide with their forward lean', () => {
    const xs = digits(88).map(x => x.p[0]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.044);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(0.047);
    const ys = digits(88).map(x => x.p[1]);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.016);
  });

  it('shows no gauge unless the gun charges, and then CHARGE_MAX cells under the digits, `level` of them lit', () => {
    expect(readout(40, 0)).toBe(readout(40));
    const glowing = (n: number, level: number) =>
      verts(readout(n, level)).filter(x => x.layer == -2);
    const extra = (level: number) => glowing(40, level).length - glowing(40, 0).length;
    // A cell is two triangles: the lit ones glow, the others are dim.
    expect(extra(3)).toBe(3 * 6);
    expect(extra(CHARGE_MAX)).toBe(CHARGE_MAX * 6);
    const cells = (level: number) => glowing(40, level).slice(digits(40).length, -192 - T);
    // Under every digit segment, and within the screen's width.
    const low = Math.min(...digits(40).map(x => x.p[1]));
    for (const x of cells(3)) {
      expect(x.p[1]).toBeLessThan(low);
      expect(Math.abs(x.p[0])).toBeLessThan(0.03);
    }
    // Cyan while it grows, orange at the full charge.
    expect(cells(3)[0].c[2]).toBeGreaterThan(cells(3)[0].c[0]);
    expect(cells(CHARGE_MAX)[0].c[0]).toBeGreaterThan(cells(CHARGE_MAX)[0].c[2] * 3);
    // Cached by both: the same pair is the same array.
    expect(readout(40, 2)).toBe(readout(40, 2));
    expect(readout(40, 2)).not.toBe(readout(40, 3));
  });

  it('keeps the digits inside the round frame', () => {
    const fx = frame(88).map(x => Math.abs(x.p[0]));
    const dx = digits(88).map(x => Math.abs(x.p[0]));
    expect(Math.max(...dx)).toBeLessThan(
      Math.min(
        ...frame(88)
          .filter(x => Math.abs(x.p[1] - digits(88)[0].p[1]) < 0.01)
          .map(x => Math.abs(x.p[0])),
      ),
    );
    expect(Math.max(...fx)).toBeGreaterThan(Math.max(...dx));
  });

  it('centres the digits in the frame, up the gun’s cut back', () => {
    // Along the face's slope, from BACK.
    const up = unit([0, 0.883, -0.469]);
    const along = (x: { p: number[] }) => (x.p[1] - 0.125) * up[1] + (x.p[2] - 0.04) * up[2];
    const mid = (xs: { p: number[] }[]) =>
      (Math.min(...xs.map(along)) + Math.max(...xs.map(along))) / 2;
    expect(mid(frame(88))).toBeCloseTo(-0.0145, 3);
    expect(mid(digits(88))).toBeCloseTo(-0.0145, 3);
  });

  it('frames the digits in a round glowing line of their colour, near the edge of the cut', () => {
    for (const n of [40, 3]) {
      for (const x of frame(n)) {
        expect(x.c).toEqual(digits(n)[0].c);
      }
    }
    // Round, 2 to 4.4 mm inside the cut's outline (4.4 cm half wide), 1 mm out of the face.
    const fx = frame(88).map(x => Math.abs(x.p[0]));
    expect(Math.max(...fx)).toBeGreaterThan(0.0405);
    expect(Math.max(...fx)).toBeLessThan(0.0421);
    const n = unit([0, 0.469, 0.883]);
    for (const x of frame(88)) {
      expect((x.p[1] - 0.125) * n[1] + (x.p[2] - 0.04) * n[2]).toBeCloseTo(0.001, 6);
    }
  });

  it('runs printed circuit tracks from the digits to pads inside the frame, dim in their colour, the same both sides', () => {
    for (const n of [40, 3]) {
      const c = digits(n)[0].c;
      for (const x of tracks(n)) {
        // Dimmer than the digits, of their hue.
        expect(Math.max(...x.c)).toBeLessThan(Math.max(...c) * 0.7);
        expect(x.c[0] / x.c[2]).toBeCloseTo(c[0] / c[2], 5);
      }
    }
    const t = tracks(88);
    const xs = t.map(x => x.p[0]);
    expect(Math.min(...xs)).toBeCloseTo(-Math.max(...xs), 5);
    // Inside the frame's inner edge, a superellipse 3.96 by 2.9 cm half across, round -0.0145 up the face.
    const up = unit([0, 0.883, -0.469]);
    for (const x of t) {
      const b = (x.p[1] - 0.125) * up[1] + (x.p[2] - 0.04) * up[2] + 0.0145;
      expect(Math.abs(x.p[0] / 0.0396) ** 2.5 + Math.abs(b / 0.029) ** 2.5).toBeLessThan(1);
    }
    const n = unit([0, 0.469, 0.883]);
    for (const x of t) {
      expect((x.p[1] - 0.125) * n[1] + (x.p[2] - 0.04) * n[2]).toBeCloseTo(0.0008, 6);
    }
  });

  it('sits on the back of the body, facing the player', () => {
    for (const x of v(88)) {
      expect(Math.abs(x.p[0])).toBeLessThan(0.043);
      expect(x.p[2]).toBeGreaterThan(0.03);
      expect(x.p[2]).toBeLessThan(0.07);
      expect(x.p[1]).toBeGreaterThan(0.08);
      expect(x.p[1]).toBeLessThan(0.15);
    }
  });

  it('shows the digits on a face leaning back and up toward the player', () => {
    for (const x of digits(88)) {
      // Back is +z: the face is tipped up by about 25 degrees.
      expect(x.n[2]).toBeGreaterThan(0.85);
      expect(x.n[1]).toBeGreaterThan(0.3);
    }
  });

  it('shows a different number differently, and the same number the same', () => {
    expect(readout(12)).toBe(readout(12));
    expect(readout(12)).not.toEqual(readout(21));
    expect(readout(12)).not.toEqual(readout(13));
  });

  it('reads left to right as the player sees it from behind: the tens on the left', () => {
    const x = (n: number) => v(n).map(q => q.p[0]);
    expect(Math.min(...x(10))).toBeLessThan(-0.009);
    // 1 is two bars on the right of its digit: all of the left digit's marks are left of the right one's.
    const left = v(10).filter(q => q.p[0] < -0.001);
    expect(left.length).toBeGreaterThan(0);
    expect(Math.max(...left.map(q => q.p[0]))).toBeLessThan(0.002);
    expect(Math.max(...x(10))).toBeGreaterThan(0.01);
  });

  it('is clamped to two digits and to zero', () => {
    expect(readout(250)).toBe(readout(99));
    expect(readout(-3)).toBe(readout(0));
  });

  it('is drawn with the gun when given the ammo, and not without', () => {
    const [a, b, c] = [0, 1, 2].map(() => [] as number[]);
    held(a, [0, 0, 0], IDENT, 1);
    held(b, [0, 0, 0], IDENT, 1, 1, 30);
    held(c, [0, 0, 0], IDENT, 0, 1, 30);
    expect(b.length).toBe(a.length + readout(30).length);
    expect(c.length).toBeGreaterThan(readout(30).length);
  });
});
