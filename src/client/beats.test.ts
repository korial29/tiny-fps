import { describe, expect, it } from 'vitest';
import { IDLE } from '../../test/teams';
import { TEAM_NAME } from '../shared/constants';
import { FLAG, TEAM } from '../shared/types';
import type { FlagState, Snapshot } from '../shared/types';
import { beats, cue, say } from './beats';
import { SOUND } from './sfx';

const flag = (over: Partial<FlagState> = {}): FlagState => ({ ...IDLE.flags[0], ...over });
const snap = (over: Partial<Snapshot> = {}): Snapshot => ({
  tick: 0,
  players: [],
  ...IDLE,
  ...over,
});
const carried = (by: number) => flag({ state: FLAG.CARRIED, by });
const lying = flag({ state: FLAG.DROPPED, x: 1, y: 2, z: 3, left: 8 });

describe('beats', () => {
  it('reads nothing off the first snapshot, nor off two alike', () => {
    expect(beats(undefined, snap({ flags: [carried(1), flag()] }))).toEqual([]);
    expect(beats(snap(), snap())).toEqual([]);
    const s = snap({ flags: [carried(1), lying] });
    expect(beats(s, s)).toEqual([]);
  });

  it('reads a take from a flag at home, or lying, and a change of carrier', () => {
    const home = snap();
    expect(beats(home, snap({ flags: [flag(), carried(2)] }))).toEqual([
      { kind: 'take', flag: TEAM.BLUE, by: 2 },
    ]);
    expect(beats(snap({ flags: [lying, flag()] }), snap({ flags: [carried(3), flag()] }))).toEqual([
      { kind: 'take', flag: TEAM.RED, by: 3 },
    ]);
    expect(
      beats(snap({ flags: [carried(3), flag()] }), snap({ flags: [carried(4), flag()] })),
    ).toEqual([{ kind: 'take', flag: TEAM.RED, by: 4 }]);
  });

  it('reads a drop, a return and nothing while a flag lies or is carried on', () => {
    expect(beats(snap({ flags: [carried(1), flag()] }), snap({ flags: [lying, flag()] }))).toEqual([
      { kind: 'drop', flag: TEAM.RED },
    ]);
    expect(beats(snap({ flags: [lying, flag()] }), snap({ flags: [flag(), flag()] }))).toEqual([
      { kind: 'return', flag: TEAM.RED },
    ]);
    expect(
      beats(snap({ flags: [lying, flag()] }), snap({ flags: [{ ...lying, left: 7 }, flag()] })),
    ).toEqual([]);
  });

  it('reads a capture as one beat: the flag going home with the point is not a return', () => {
    const before = snap({ flags: [flag(), carried(0)] });
    const after = snap({ score: [1, 0], flags: [flag(), flag()] });
    expect(beats(before, after)).toEqual([{ kind: 'capture', team: TEAM.RED }]);
    expect(beats(snap({ flags: [carried(2), flag()] }), snap({ score: [0, 1] }))).toEqual([
      { kind: 'capture', team: TEAM.BLUE },
    ]);
  });

  it('reads nothing while a match is over, and a new match as one beat', () => {
    const over = snap({ over: true, clock: 10, score: [3, 1], flags: [flag(), flag()] });
    expect(beats(snap({ score: [2, 1], flags: [flag(), carried(0)] }), over)).toEqual([]);
    expect(beats(over, snap({ over: true, clock: 9 }))).toEqual([]);
    expect(beats(over, snap())).toEqual([{ kind: 'start' }]);
  });
});

describe('say', () => {
  const name = (id: number) => `P${id}`;
  const red: { id: number; team: number } = { id: 0, team: TEAM.RED };
  const text = (beat: Parameters<typeof say>[0], me = red) => say(beat, me, name);

  it('says the other team took your flag, in its colour', () => {
    expect(text({ kind: 'take', flag: TEAM.RED, by: 2 })).toEqual({
      team: TEAM.BLUE,
      text: 'Blue took your flag',
    });
    expect(text({ kind: 'take', flag: TEAM.BLUE, by: 2 }, { id: 5, team: TEAM.BLUE })).toEqual({
      team: TEAM.RED,
      text: 'Red took your flag',
    });
  });

  it('says who took the enemy flag: you, or a teammate by name', () => {
    expect(text({ kind: 'take', flag: TEAM.BLUE, by: 0 })).toEqual({
      team: TEAM.RED,
      text: 'You took the blue flag',
    });
    expect(text({ kind: 'take', flag: TEAM.BLUE, by: 4 }).text).toBe('P4 took the blue flag');
  });

  it('says a score by the team, and drops and returns for the own flag or the other', () => {
    expect(text({ kind: 'capture', team: TEAM.RED })).toEqual({
      team: TEAM.RED,
      text: 'Red scored',
    });
    expect(text({ kind: 'capture', team: TEAM.BLUE }).text).toBe('Blue scored');
    expect(text({ kind: 'drop', flag: TEAM.RED }).text).toBe('Your flag was dropped');
    expect(text({ kind: 'drop', flag: TEAM.BLUE }).text).toBe('Blue flag dropped');
    expect(text({ kind: 'return', flag: TEAM.RED }).text).toBe('Your flag returned');
    expect(text({ kind: 'return', flag: TEAM.BLUE }).text).toBe('Blue flag returned');
    expect(text({ kind: 'start' })).toEqual({ text: 'New match' });
  });

  it('names a team as TEAM_NAME does', () => {
    expect(TEAM_NAME).toEqual(['Red', 'Blue']);
  });
});

describe('cue', () => {
  it('plays the sound of the beat, plainly for good news for the team and lower for bad news', () => {
    expect(cue({ kind: 'take', flag: TEAM.BLUE, by: 0 }, TEAM.RED)).toEqual([SOUND.TAKE, 1]);
    expect(cue({ kind: 'take', flag: TEAM.RED, by: 2 }, TEAM.RED)).toEqual([SOUND.TAKE, 0.8]);
    expect(cue({ kind: 'drop', flag: TEAM.RED }, TEAM.RED)).toEqual([SOUND.DROP, 1]);
    expect(cue({ kind: 'drop', flag: TEAM.BLUE }, TEAM.RED)).toEqual([SOUND.DROP, 0.85]);
    expect(cue({ kind: 'return', flag: TEAM.RED }, TEAM.RED)).toEqual([SOUND.RETURN, 1]);
    expect(cue({ kind: 'return', flag: TEAM.BLUE }, TEAM.RED)).toEqual([SOUND.RETURN, 0.85]);
    expect(cue({ kind: 'capture', team: TEAM.RED }, TEAM.RED)).toEqual([SOUND.CAPTURE, 1]);
    expect(cue({ kind: 'capture', team: TEAM.RED }, TEAM.BLUE)).toEqual([SOUND.CAPTURE, 0.8]);
  });

  it('plays nothing for a new match', () => {
    expect(cue({ kind: 'start' }, TEAM.RED)).toBeUndefined();
  });
});
