import { describe, expect, it } from 'vitest';
import { IDLE } from '../../test/teams';
import { STILL } from '../shared/physics';
import { FLAG, TEAM } from '../shared/types';
import type { SnapPlayer, Snapshot } from '../shared/types';
import { AIM_SHOTS, MULTI, createAnnouncer } from './announce';
import { beats } from './beats';
import { LINE } from './voice/clips';

const ME = { id: 1, team: TEAM.RED };
const runner = (id: number, over: Partial<SnapPlayer> = {}): SnapPlayer => ({
  ...STILL,
  id,
  x: id,
  y: 10,
  z: 0,
  vy: 0,
  yaw: 0,
  pitch: 0,
  ground: true,
  ack: 0,
  by: 0,
  ammo: 20,
  ...over,
});
/** The own player and two foes, as `over` changes them by id. */
const snap = (
  over: Partial<Snapshot> = {},
  players: Record<number, Partial<SnapPlayer>> = {},
): Snapshot => ({
  tick: 0,
  ...IDLE,
  players: [1, 2, 3].map(id => runner(id, players[id])),
  ...over,
});

/** Feeds the steps through one announcer, a second apart unless `dt` says, and returns its lines. */
const told = (steps: Snapshot[], dt = 1) => {
  const a = createAnnouncer();
  const out: number[][] = [];
  steps.forEach((s, i) => {
    const prev = steps[i - 1];
    out.push(a.step(prev, s, beats(prev, s), ME, i * dt));
  });
  return out;
};

describe('announcer', () => {
  it('tells the match starting, and nothing at the first snapshot', () => {
    expect(told([snap({ over: true }), snap()])).toEqual([[], [LINE.START]]);
  });

  it('tells the flags and the captures from the own side', () => {
    const carried = (by: number) => ({ state: FLAG.CARRIED, by, x: 0, y: 0, z: 0, left: 0 });
    const home = IDLE.flags[0];
    expect(
      told([
        snap(),
        snap({ flags: [home, carried(1)] }),
        snap({ score: [1, 0], flags: [home, home] }),
        snap({ score: [1, 0], flags: [carried(2), home] }),
        snap({ score: [1, 0], flags: [home, home] }),
      ]).flat(),
    ).toEqual([LINE.TAKEN, LINE.SCORE, LINE.STOLEN, LINE.BACK]);
  });

  it('tells the last minute once, not in a match joined after it', () => {
    expect(told([snap({ clock: 62 }), snap({ clock: 60 }), snap({ clock: 59 })]).flat()).toEqual([
      LINE.MINUTE,
    ]);
    expect(told([snap({ clock: 40 }), snap({ clock: 39 })]).flat()).toEqual([]);
  });

  it('counts a foe going down in a step of an own hit as a takedown, two quickly a double', () => {
    const steps = [
      snap(),
      snap({}, { 1: { hits: 1 }, 2: { down: 9 } }),
      snap({}, { 1: { hits: 2 }, 2: { down: 8 }, 3: { down: 9 } }),
    ];
    expect(told(steps)).toEqual([[], [], [LINE.DOUBLE]]);
    // Too far apart, no double.
    expect(told(steps, MULTI + 1).flat()).toEqual([]);
  });

  it('does not count a foe going down without an own hit', () => {
    expect(
      told([snap(), snap({}, { 2: { down: 9 } }), snap({}, { 3: { down: 9 } })]).flat(),
    ).toEqual([]);
  });

  it('tells a triple, then five in a row, and forgets the run on going down', () => {
    // One foe going down and up again, each time with an own hit.
    const steps = [snap()];
    for (let k = 1; k <= 5; k++) {
      steps.push(snap({}, { 1: { hits: k }, 2: { down: 9 } }), snap({}, { 1: { hits: k } }));
    }
    const lines = told(steps, 1).flat();
    expect(lines).toEqual([LINE.DOUBLE, LINE.TRIPLE, LINE.FIVE]);
    const after = [
      ...steps,
      snap({}, { 1: { down: 9, hits: 5 } }),
      snap({}, { 1: { hits: 6 }, 2: { down: 9 } }),
    ];
    // Down, then one takedown: neither a run nor a double.
    expect(told(after, 1).flat()).toEqual(lines);
  });

  it('tells a sharp aim when most of a run of the gun hits, not for the katana', () => {
    const run = (hits: number, over: Partial<SnapPlayer> = {}) =>
      told([snap(), snap({}, { 1: { shots: AIM_SHOTS, hits, ...over } })]).flat();
    expect(run(AIM_SHOTS)).toEqual([LINE.AIM]);
    expect(run(AIM_SHOTS - 6)).toEqual([]);
    expect(run(AIM_SHOTS, { wield: true })).toEqual([]);
    expect(run(AIM_SHOTS, { rifled: true })).toEqual([]);
  });

  it('tells the end of the match from the own side', () => {
    const a = createAnnouncer();
    expect(a.end([3, 1], TEAM.RED)).toBe(LINE.WIN);
    expect(a.end([3, 1], TEAM.BLUE)).toBe(LINE.LOSS);
    expect(a.end([2, 2], TEAM.RED)).toBe(LINE.DRAW);
  });
});
