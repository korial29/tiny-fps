import { describe, expect, it } from 'vitest';
import { IDLE } from '../../test/teams';
import { STILL } from '../shared/physics';
import { FLAG, TEAM } from '../shared/types';
import type { SnapPlayer, Snapshot } from '../shared/types';
import { FRAG } from '../shared/protocol';
import type { ServerText } from '../shared/protocol';
import { AIM_SHOTS, MULTI, RUNS, SPREE, createAnnouncer } from './announce';
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

/** Feeds the steps through one announcer and returns its lines. */
const told = (steps: Snapshot[]) => {
  const a = createAnnouncer();
  const out: number[][] = [];
  steps.forEach((s, i) => {
    const prev = steps[i - 1];
    out.push(a.step(prev, s, beats(prev, s), ME));
  });
  return out;
};
/** The host's frag message: `by` put player 2 down. */
const frag = (by: number, over: Partial<Extract<ServerText, { t: 'frag' }>> = {}) => ({
  t: 'frag' as const,
  by,
  who: 2,
  how: FRAG.GUN,
  n: 1,
  ...over,
});

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

  it('says nothing for a frag that is not his', () => {
    const a = createAnnouncer();
    expect(a.frag(frag(2), ME, 0)).toBeUndefined();
  });

  it('tells the first blood, and a kill with the fists', () => {
    expect(createAnnouncer().frag(frag(1, { first: true }), ME, 0)).toBe(LINE.FIRST);
    expect(createAnnouncer().frag(frag(1, { how: FRAG.FIST }), ME, 0)).toBe(LINE.HUMILIATION);
    expect(createAnnouncer().frag(frag(1), ME, 0)).toBeUndefined();
  });

  it('tells frags in quick succession, up to a monster kill and on', () => {
    const a = createAnnouncer();
    const lines = [0, 1, 2, 3, 4, 5].map(k => a.frag(frag(1), ME, k * (MULTI - 1)));
    expect(lines).toEqual([
      undefined,
      LINE.DOUBLE,
      LINE.MULTI,
      LINE.MEGA,
      // The fifth frag without going down is a killing spree, which says more.
      LINE.SPREE,
      LINE.MONSTER,
    ]);
    // Too far apart, no double.
    const b = createAnnouncer();
    expect([0, MULTI + 1].map(t => b.frag(frag(1), ME, t))).toEqual([undefined, undefined]);
  });

  it('tells a run every five frags without going down, and forgets it on going down', () => {
    const a = createAnnouncer();
    const runs = Array.from({ length: 30 }, (_, k) => a.frag(frag(1), ME, k * 10)).filter(
      l => l !== undefined,
    );
    expect(runs).toEqual([...RUNS, LINE.GODLIKE]);
    expect(RUNS).toEqual([
      LINE.SPREE,
      LINE.RAMPAGE,
      LINE.DOMINATING,
      LINE.UNSTOPPABLE,
      LINE.GODLIKE,
    ]);
    const b = createAnnouncer();
    for (let k = 0; k < 4; k++) {
      b.frag(frag(1), ME, k * 10);
    }
    b.step(snap(), snap({}, { 1: { down: 9 } }), [], ME);
    expect(b.frag(frag(1), ME, 50)).toBeUndefined();
    expect(SPREE).toBe(5);
  });

  it('says impressive when most of a run of the gun hits, not for the katana', () => {
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
