import { describe, expect, it } from 'vitest';
import { blocked, compile, inside, sectorAt } from './level';
import { HALL } from './map';

const lvl = compile(HALL);

describe('compile', () => {
  it('joins the 14 portals of HALL both ways', () => {
    expect(lvl.edges.filter(e => e.back >= 0)).toHaveLength(28);
    for (const e of lvl.edges.filter(e => e.back >= 0)) {
      expect(
        lvl.edges.some(
          f => f.front === e.back && f.back === e.front && f.ax === e.bx && f.az === e.bz,
        ),
      ).toBe(true);
    }
  });

  it('has counter-clockwise sectors, ceilings above floors and spawns on a sector', () => {
    for (const { pts, floor, ceil } of HALL.sectors) {
      const area = pts.reduce((a, [x, z], i) => {
        const [u, v] = pts[(i + 1) % pts.length];
        return a + x * v - u * z;
      }, 0);
      expect(area).toBeGreaterThan(0);
      expect(ceil).toBeGreaterThan(floor);
    }
    for (const [x, z] of HALL.spawns) {
      expect(sectorAt(lvl, x, z)).toBe(0);
    }
  });
});

describe('sectorAt', () => {
  it('finds the room, the pit and nothing outside', () => {
    expect(sectorAt(lvl, 18, 8)).toBe(1);
    expect(sectorAt(lvl, 28, 8)).toBe(6);
    expect(sectorAt(lvl, 18, 2)).toBe(-1);
    expect(inside(HALL.sectors[0], 16, 8)).toBe(true);
  });
});

describe('blocked', () => {
  it('sees down the corridor, not through a wall', () => {
    expect(blocked(lvl, [4, 2.6, 8], [33, 2.6, 8])).toBe(false);
    expect(blocked(lvl, [4, 2.6, 2], [33, 2.6, 2])).toBe(true);
  });

  it('is cut by the corridor ceiling and by the stairs', () => {
    expect(blocked(lvl, [4, 4.5, 8], [33, 4.5, 8])).toBe(true);
    expect(blocked(lvl, [30, 1.2, 14], [30, 1.2, 22])).toBe(true);
    expect(blocked(lvl, [30, 2.6, 14], [30, 4, 22])).toBe(false);
  });
});
