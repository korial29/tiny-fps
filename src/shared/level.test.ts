import { describe, expect, it } from 'vitest';
import { bar, blocked, compile, inside, sectorAt } from './level';
import { HALL } from './map';
import { ITEM, PHASE } from './types';
import type { MapDef } from './types';

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

describe('bar', () => {
  const [RED, BLUE, YELLOW] = [ITEM.KEY_RED, ITEM.KEY_BLUE, ITEM.KEY_YELLOW].map(k => 1 << k);
  /** Four rooms in a row: 0 the exit, 1 and 3 gates (red and blue), 2 open. */
  const row = (exit: number): MapDef => {
    const room = (x: number): [number, number][] => [
      [x, 0],
      [x + 4, 0],
      [x + 4, 4],
      [x, 4],
    ];
    return {
      sectors: [0, 4, 8, 12].map(x => ({ pts: room(x), floor: 0, ceil: 4, ft: 0, wt: 0, ct: 0 })),
      spawns: [[1, 1, 0]],
      gates: [
        { sector: 1, key: ITEM.KEY_RED },
        { sector: 3, key: ITEM.KEY_BLUE },
      ],
      exit,
    };
  };
  const barred = (map: MapDef, keys: number, phase: number) => {
    const lvl = compile(map);
    bar(lvl, keys, phase);
    return [...lvl.barred].sort();
  };

  it('bars every gate whose key the team lacks, and the exit while hunting', () => {
    expect(barred(row(0), 0, PHASE.HUNT)).toEqual([0, 1, 3]);
    expect(barred(row(2), 0, PHASE.HUNT)).toEqual([1, 2, 3]);
  });

  it('opens the gates of the keys held, each key its own', () => {
    expect(barred(row(0), RED, PHASE.HUNT)).toEqual([0, 3]);
    expect(barred(row(0), BLUE, PHASE.HUNT)).toEqual([0, 1]);
    expect(barred(row(0), RED | BLUE, PHASE.HUNT)).toEqual([0]);
    // A key no gate wants changes nothing.
    expect(barred(row(0), YELLOW, PHASE.HUNT)).toEqual([0, 1, 3]);
  });

  it('opens the exit on RETURN, and bars it again on HUNT', () => {
    expect(barred(row(0), RED | BLUE, PHASE.RETURN)).toEqual([]);
    expect(barred(row(0), RED, PHASE.RETURN)).toEqual([3]);
    const lvl = compile(row(0));
    bar(lvl, RED | BLUE, PHASE.RETURN);
    bar(lvl, 0, PHASE.HUNT);
    expect([...lvl.barred].sort()).toEqual([0, 1, 3]);
  });

  it('treats sector 0 like any other exit, and a map with neither gates nor exit as open', () => {
    expect(barred({ ...row(0), exit: undefined, gates: undefined }, 0, PHASE.HUNT)).toEqual([]);
    expect(compile(row(0)).barred).toEqual(new Set([0, 1, 3]));
  });

  it('is set as compiled: the exit of HALL is barred until RETURN', () => {
    expect(lvl.barred).toEqual(new Set([0]));
  });

  it('does not hide anything: sight goes through a barred sector', () => {
    const gate = compile(row(0));
    expect(gate.barred.has(1)).toBe(true);
    expect(blocked(gate, [1, 1.6, 2], [15, 1.6, 2])).toBe(false);
  });
});

describe('HALL progression', () => {
  it('has its goal on the balcony, the start room as exit and a health pack in the hall', () => {
    const [gx, gz] = HALL.goal!;
    expect(sectorAt(lvl, gx, gz)).toBe(10);
    expect(HALL.exit).toBe(0);
    expect(HALL.items).toHaveLength(1);
    const [x, z, kind] = HALL.items![0];
    expect(kind).toBe(ITEM.HEALTH);
    expect([2, 3, 4, 5]).toContain(sectorAt(lvl, x, z));
    expect(HALL.gates ?? []).toEqual([]);
  });
});
