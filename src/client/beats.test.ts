import { describe, expect, it } from 'vitest';
import { IDLE } from '../../test/teams';
import { TEAM_NAME } from '../shared/constants';
import { FLAG, TEAM } from '../shared/types';
import type { FlagState, SnapPlayer, Snapshot } from '../shared/types';
import { STILL } from '../shared/physics';
import { beats, cues, say } from './beats';
import type { Beat } from './beats';
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
  const text = (beat: Parameters<typeof say>[0], me = red) => say(beat, me, name)!;

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

describe('cues', () => {
  const sound = (beat: Parameters<typeof cues>[0], team: number) =>
    cues(beat, { id: 9, team }).map(c => [c.id, c.rate]);

  it('plays the sound of the beat, plainly for good news for the team and lower for bad news', () => {
    expect(sound({ kind: 'take', flag: TEAM.BLUE, by: 0 }, TEAM.RED)).toEqual([[SOUND.TAKE, 1]]);
    expect(sound({ kind: 'take', flag: TEAM.RED, by: 2 }, TEAM.RED)).toEqual([[SOUND.TAKE, 0.8]]);
    expect(sound({ kind: 'drop', flag: TEAM.RED }, TEAM.RED)).toEqual([[SOUND.DROP, 1]]);
    expect(sound({ kind: 'drop', flag: TEAM.BLUE }, TEAM.RED)).toEqual([[SOUND.DROP, 0.85]]);
    expect(sound({ kind: 'return', flag: TEAM.RED }, TEAM.RED)).toEqual([[SOUND.RETURN, 1]]);
    expect(sound({ kind: 'return', flag: TEAM.BLUE }, TEAM.RED)).toEqual([[SOUND.RETURN, 0.85]]);
    expect(sound({ kind: 'capture', team: TEAM.RED }, TEAM.RED)).toEqual([[SOUND.CAPTURE, 1]]);
    expect(sound({ kind: 'capture', team: TEAM.RED }, TEAM.BLUE)).toEqual([[SOUND.CAPTURE, 0.8]]);
  });

  it('plays nothing for a new match', () => {
    expect(cues({ kind: 'start' }, { id: 0, team: TEAM.RED })).toEqual([]);
  });

  it('plays a tackle by who you are in it: an impact and a grunt, a close impact, an impact at the spot', () => {
    const beat: Beat = { kind: 'tackle', who: 1, by: 2, at: [3, 4, 5] };
    // The one tackled: centred, the impact and the grunt.
    expect(cues(beat, { id: 1, team: TEAM.BLUE })).toEqual([
      { id: SOUND.TACKLE },
      { id: SOUND.GRUNT },
    ]);
    // The tackler: one impact, centred and a little quieter.
    expect(cues(beat, { id: 2, team: TEAM.RED })).toEqual([
      { id: SOUND.TACKLE, gain: 0.8, rate: 1.1 },
    ]);
    // Anyone else hears it where it happened, and no grunt.
    expect(cues(beat, { id: 3, team: TEAM.RED })).toEqual([{ id: SOUND.TACKLE, at: [3, 4, 5] }]);
  });
});

describe('tackles', () => {
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
    ...over,
  });
  const name = (id: number) => `P${id}`;
  const red = { id: 2, team: TEAM.RED };

  it('reads a tackle from a stumble timer that went up, with the tackler and the place', () => {
    const before = snap({ players: [runner(1), runner(2)] });
    const after = snap({ players: [runner(1, { stun: 48, by: 2 }), runner(2)] });
    expect(beats(before, after)).toEqual([{ kind: 'tackle', who: 1, by: 2, at: [1, 11, 0] }]);
  });

  it('reads one tackle once: not while the stumble runs down, not when it ends', () => {
    const at = (stun: number) => snap({ players: [runner(1, { stun, by: 2 }), runner(2)] });
    expect(beats(at(48), at(46))).toEqual([]);
    expect(beats(at(2), at(0))).toEqual([]);
    expect(beats(at(0), at(0))).toEqual([]);
    // A second tackle on a runner still stumbling is a new one.
    expect(beats(at(20), at(48))).toHaveLength(1);
  });

  it('does not read a tackle off a player the first snapshot did not have', () => {
    const before = snap({ players: [runner(2)] });
    const after = snap({ players: [runner(1, { stun: 48, by: 2 }), runner(2)] });
    expect(beats(before, after)).toEqual([]);
  });

  it('puts a tackle after the flag beats, and reads a flag sent home at once as one return', () => {
    const before = snap({ flags: [carried(1), flag()], players: [runner(1), runner(2)] });
    // The tackler stood by the flag: it went home in the same two ticks.
    const after = snap({
      flags: [flag(), flag()],
      players: [runner(1, { stun: 48, by: 2 }), runner(2)],
    });
    expect(beats(before, after).map(b => b.kind)).toEqual(['return', 'tackle']);
    // A capture is still one beat, with no return.
    expect(
      beats(
        snap({ flags: [carried(1), flag()] }),
        snap({ score: [0, 1], flags: [flag(), flag()] }),
      ),
    ).toEqual([{ kind: 'capture', team: TEAM.BLUE }]);
  });

  it('tells the tackler, and nobody else, in a banner', () => {
    const beat: Beat = { kind: 'tackle', who: 1, by: 2, at: [0, 0, 0] };
    expect(say(beat, red, name)).toEqual({ team: TEAM.RED, text: 'Tackled P1!' });
    expect(say(beat, { id: 1, team: TEAM.BLUE }, name)).toBeUndefined();
    expect(say(beat, { id: 3, team: TEAM.RED }, name)).toBeUndefined();
  });
});

describe('shocks', () => {
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
    ...over,
  });
  const name = (id: number) => `P${id}`;

  it('reads a stumble that went up with zap set as a shock, not a tackle', () => {
    const before = snap({ players: [runner(1), runner(2)] });
    const after = snap({ players: [runner(1, { stun: 24, by: 2, zap: true }), runner(2)] });
    expect(beats(before, after)).toEqual([{ kind: 'shock', who: 1, by: 2, at: [1, 11, 0] }]);
  });

  it('still reads a plain stumble as a tackle, and tells them apart in one snapshot', () => {
    const before = snap({ players: [runner(1), runner(2), runner(3)] });
    const after = snap({
      players: [
        runner(1, { stun: 48, by: 2 }),
        runner(2),
        runner(3, { stun: 24, by: 2, zap: true }),
      ],
    });
    expect(beats(before, after).map(b => b.kind)).toEqual(['tackle', 'shock']);
    // `zap` false is a tackle too.
    expect(
      beats(
        before,
        snap({ players: [runner(1, { stun: 48, by: 2, zap: false }), runner(2), runner(3)] }),
      ),
    ).toHaveLength(1);
  });

  it('reads a shock once: not while the stumble runs down', () => {
    const at = (stun: number) =>
      snap({ players: [runner(1, { stun, by: 2, zap: true }), runner(2)] });
    expect(beats(at(24), at(22))).toEqual([]);
    expect(beats(at(2), at(0))).toEqual([]);
    expect(beats(at(0), at(24))).toHaveLength(1);
  });

  it('shows no banner for a shock, to anyone, and no tackle banner', () => {
    const beat: Beat = { kind: 'shock', who: 1, by: 2, at: [0, 0, 0] };
    for (const id of [1, 2, 3]) {
      expect(say(beat, { id, team: TEAM.RED }, name)).toBeUndefined();
    }
  });

  it('plays the zap, and no tackle sound and no grunt: centred to the one shocked, at the spot to the others, to the attacker with the hit instead', () => {
    const beat: Beat = { kind: 'shock', who: 1, by: 2, at: [3, 4, 5] };
    expect(cues(beat, { id: 1, team: TEAM.BLUE })).toEqual([{ id: SOUND.ZAP }]);
    expect(cues(beat, { id: 3, team: TEAM.RED })).toEqual([{ id: SOUND.ZAP, at: [3, 4, 5] }]);
    expect(cues(beat, { id: 2, team: TEAM.RED })).toEqual([]);
    for (const id of [1, 2, 3]) {
      const ids = cues(beat, { id, team: TEAM.RED }).map(c => c.id);
      expect(ids).not.toContain(SOUND.TACKLE);
      expect(ids).not.toContain(SOUND.GRUNT);
    }
  });
});
