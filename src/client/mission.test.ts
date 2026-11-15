// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { IDLE } from '../../test/teams';
import { MOON } from '../shared/moon';
import { PHASE } from '../shared/station';
import type { Snapshot, StationState } from '../shared/types';
import { beats, cues, say } from './beats';
import { createHud } from './hud';
import { marks } from './marks';
import { brief, goal } from './mission';
import { SOUND } from './sfx';

const at = (phase: number, team = 0, left = 0): StationState => ({ phase, team, left });

describe('the mission brief', () => {
  it('shows nothing on foot outside the station while the mission waits', () => {
    expect(brief(at(PHASE.READY), 0, false, false)).toBeUndefined();
    expect(brief(undefined, 0, true, true)).toBeUndefined();
  });

  it('sends a pilot to the station, and who is in it to the command post', () => {
    expect(brief(at(PHASE.READY), 1, true, false)).toEqual({
      text: 'Secondary mission · fly up to the orbital station',
      to: 'station',
    });
    expect(brief(at(PHASE.READY), 1, false, true)?.to).toBe('post');
  });

  it('counts a strike down for everyone: its own team holds, the other is sent to cancel it', () => {
    expect(brief(at(PHASE.ARMED, 0, 83), 0, false, false)).toEqual({
      text: 'Orbital strike in 1:23 · hold the station',
      hot: true,
    });
    expect(brief(at(PHASE.ARMED, 0, 9), 1, false, false)).toEqual({
      text: 'Enemy strike in 0:09 · cancel it at the station',
      hot: true,
      to: 'station',
    });
    expect(brief(at(PHASE.ARMED, 0, 9), 1, false, true)?.to).toBe('post');
  });

  it('tells the strikers to go score and the struck when they are back, then the recharge to who is up there', () => {
    expect(brief(at(PHASE.STRUCK, 1, 12), 1, false, false)?.text).toBe(
      'Enemies disintegrated · go score! 0:12',
    );
    expect(brief(at(PHASE.STRUCK, 1, 12), 0, false, false)).toMatchObject({ hot: true });
    expect(brief(at(PHASE.COOL, 1, 75), 0, false, false)).toBeUndefined();
    expect(brief(at(PHASE.COOL, 1, 75), 0, true, false)?.text).toBe(
      'Orbital station recharging · 1:15',
    );
  });

  it('points at the hangar from outside and at the console from inside', () => {
    const def = MOON.station!;
    const [lo, hi] = def.post;
    expect(goal(def, 'post')).toEqual([(lo[0] + hi[0]) / 2, hi[1], (lo[2] + hi[2]) / 2]);
    const [x, y, z] = goal(def, 'station');
    expect(x > def.hall[0][0] && x < def.hall[1][0] && y > hi[1] && z === 140).toBe(true);
  });
});

describe('the mission as beats', () => {
  const snap = (station?: StationState): Snapshot => ({ tick: 1, players: [], ...IDLE, station });
  const me = { id: 0, team: 0 };

  it('reads arming, cancelling and the strike off two snapshots, nothing else', () => {
    expect(beats(snap(at(PHASE.READY)), snap(at(PHASE.ARMED, 1, 30)))).toEqual([
      { kind: 'armed', team: 1 },
    ]);
    expect(beats(snap(at(PHASE.ARMED, 1, 4)), snap(at(PHASE.COOL, 1, 90)))).toEqual([
      { kind: 'cancelled', team: 1 },
    ]);
    expect(beats(snap(at(PHASE.ARMED, 1, 1)), snap(at(PHASE.STRUCK, 1, 15)))).toEqual([
      { kind: 'strike', team: 1 },
    ]);
    expect(beats(snap(at(PHASE.STRUCK, 1, 1)), snap(at(PHASE.COOL, 1, 75)))).toEqual([]);
    expect(beats(snap(at(PHASE.ARMED, 1, 5)), snap(at(PHASE.ARMED, 1, 4)))).toEqual([]);
    expect(beats(snap(), snap())).toEqual([]);
  });

  it('has a banner and a sound for each side', () => {
    const name = () => 'x';
    expect(say({ kind: 'armed', team: 0 }, me, name)?.text).toBe('Orbital strike armed');
    expect(say({ kind: 'armed', team: 1 }, me, name)?.text).toBe('Enemy strike! Cancel it');
    expect(say({ kind: 'strike', team: 1 }, me, name)?.text).toBe('Disintegrated');
    expect(say({ kind: 'cancelled', team: 1 }, me, name)).toEqual({
      team: 0,
      text: 'Orbital strike cancelled',
    });
    expect(cues({ kind: 'armed', team: 1 }, me)[0].id).toBe(SOUND.ALARM);
    expect(cues({ kind: 'strike', team: 0 }, me)[0].id).toBe(SOUND.STRIKE);
  });
});

describe('the mission in the HUD', () => {
  it('puts an amber marker on its goal, after the flags', () => {
    const list = marks({
      eye: [0, 1.6, 0],
      id: 0,
      team: 0,
      yaw: 0,
      flags: IDLE.flags,
      bases: [
        [0, 0, -50],
        [0, 0, 50],
      ],
      where: () => undefined,
      project: () => [0.5, 0.5],
      goal: { kind: 'post', at: [0, 1.2, -10] },
    });
    expect(list.at(-1)).toMatchObject({ team: -1, kind: 'post', text: '10 m', x: 0.5 });
    const screen = document.createElement('div');
    const hud = createHud(screen);
    hud.marks(list);
    const pin = [...screen.querySelectorAll('em')].at(-1)!;
    expect(pin.textContent).toBe('▼Command post 10 m');
    expect(pin.style.color).toBe('rgb(255, 179, 71)');
  });

  it('shows its line under the score, red and blinking when urgent, and hides it with none', () => {
    const screen = document.createElement('div');
    const hud = createHud(screen);
    const line = screen.querySelector('var')!;
    expect(line.hidden).toBe(true);
    hud.mission('Enemy strike in 0:09 · cancel it at the station', true);
    expect([line.hidden, line.textContent, line.className]).toEqual([
      false,
      'Enemy strike in 0:09 · cancel it at the station',
      'hot',
    ]);
    hud.mission();
    expect(line.hidden).toBe(true);
  });
});
