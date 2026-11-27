import { describe, expect, it } from 'vitest';
import { MOON } from '../../shared/moon';
import { DOME, MODULES } from '../../shared/moonbase';
import { STRIDE } from '../mesh';
import { fragOf } from '../render';
import { HALL_GLASS, ROOM_GLASS } from './constants';
import { moonbase } from './index';
import { GLAZE } from './mirror';

const o: number[] = [];
moonbase(o);
const pts = Array.from({ length: o.length / STRIDE }, (_, i) =>
  o.slice(i * STRIDE, (i + 1) * STRIDE),
);

describe("the reflections traced in the base's windows", () => {
  it('turns each pane of the hall to face into the hall, on its own layer', () => {
    const hall = pts.filter(p => p[8] === HALL_GLASS);
    // 22 windows of 6 vertices at least.
    expect(hall.length).toBeGreaterThan(22 * 6);
    for (const p of hall) {
      const [dx, dz] = [DOME[0] - p[0], DOME[1] - p[2]];
      expect(p[3] * dx + p[5] * dz).toBeGreaterThan(0);
      expect(Math.hypot(p[3], p[4], p[5])).toBeCloseTo(1, 12);
    }
  });

  it("turns each module's pane to face into its module", () => {
    const room = pts.filter(p => p[8] === ROOM_GLASS);
    expect(room.length).toBeGreaterThan(0);
    for (const p of room) {
      const m = MODULES.find(
        ({ min, max }) => p[0] > min[0] && p[0] < max[0] && p[2] > min[2] && p[2] < max[2],
      )!;
      expect(p[5] * ((m.min[2] + m.max[2]) / 2 - p[2])).toBeGreaterThan(0);
    }
  });

  it("splices its code into the map's program only, under MOON", () => {
    const land = fragOf(MOON, 'LAND', '', false, GLAZE);
    expect(land).toContain(GLAZE);
    expect(land.indexOf(GLAZE)).toBeGreaterThan(land.indexOf('#ifdef MOON'));
    expect(fragOf(MOON, 'FLESH', '', false, GLAZE)).not.toContain(GLAZE);
    expect(fragOf(MOON, 'LAND')).not.toContain('//GLAZE');
  });

  it("tells its two layers apart from the portholes' PANE and keeps them glows", () => {
    expect(GLAZE).toMatch(/^if\(L<-2\.30&&L>-2\.45\)/);
    for (const l of [ROOM_GLASS, HALL_GLASS]) {
      expect(l).toBeLessThan(-2.25);
      expect(l).toBeGreaterThan(-2.5);
    }
  });
});
