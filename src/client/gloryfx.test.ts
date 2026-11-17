import { describe, expect, it } from 'vitest';
import { EXEC, GLORY_TICKS } from '../shared/constants';
import { STILL } from '../shared/physics';
import type { PlayerState } from '../shared/types';
import {
  EXEC_AFTER,
  EXEC_CUES,
  FEAST_AFTER,
  FEAST_CUES,
  FIST_AFTER,
  FIST_CUES,
  createGloryFx,
} from './gloryfx';
import type { Cue } from './gloryfx';
import type { Vec3 } from './mesh';
import { SOUND } from './sfx';

const [K, V] = [1, 2];
const state = (id: number, over: Partial<PlayerState>): PlayerState => ({
  id,
  x: 0,
  y: 0,
  z: 0,
  vy: 0,
  yaw: 0,
  pitch: 0,
  ground: true,
  ...STILL,
  ...over,
});
/** The sounds played, with where and how, and the ones put off with their delay. */
const rig = (xenos: number[] = []) => {
  const played: [number, Vec3, number, number][] = [];
  const later: [() => void, number][] = [];
  const fx = createGloryFx(
    (id, at, gain, rate) => played.push([id, at, gain, rate]),
    id => (id == V ? 1.5 : 1),
    id => xenos.includes(id),
    (f, ms) => later.push([f, ms]),
  );
  return { fx, played, later };
};
/** How many times a cue plays over a whole lock. */
const times = ([tick, , , , , every, last]: Cue) =>
  every ? Math.floor((last! - tick) / every) + 1 : 1;
/**
 * The two locked with `lock` ticks left, the killer at the origin, his victim 1 m ahead: the
 * xenomorph's (`exec` false), an execution with the katana in hand (true), or with the fists.
 */
const pair = (lock: number, exec: boolean | 'fist'): PlayerState[] => [
  state(K, { lock, foe: V, exec: exec ? EXEC.KILLER : 0, wield: exec === true }),
  state(V, { z: -1, lock, foe: K, exec: exec ? EXEC.VICTIM : 0 }),
];

describe('the glory kills’ sounds', () => {
  it('plays the xenomorph’s cues on their ticks, on the one each is for, his cries in his voice', () => {
    const { fx, played } = rig([K]);
    for (let lock = GLORY_TICKS; lock > 0; lock--) {
      fx.frame(pair(lock, false));
    }
    expect(played).toHaveLength(FEAST_CUES.reduce((n, c) => n + times(c), 0));
    const at = (s: number) => played.filter(p => p[0] == s);
    // Its hiss on it, his cries on him in his own voice.
    expect(at(SOUND.XENO_HISS)[0][1]).toEqual([0, 1.3, 0]);
    for (const [, where, , rate] of at(SOUND.PAIN)) {
      expect(where).toEqual([0, 1.3, -1]);
      expect(rate).toBeGreaterThan(1.5);
    }
    // In the order of their ticks: landing on him first, the bite's crunch late.
    expect(played[0][0]).toBe(SOUND.TACKLE);
    expect(played.findIndex(p => p[0] == SOUND.SHRIEK)).toBeGreaterThan(
      played.findIndex(p => p[0] == SOUND.XENO_HISS),
    );
  });

  it('plays the katana’s on the swordsman’s lock only: his cut biting, his cry, his knee, his panting', () => {
    const { fx, played } = rig();
    for (let lock = EXEC.TICKS; lock > 0; lock -= 2) {
      // As a snapshot gives them: two ticks a time.
      fx.frame(pair(lock, true));
    }
    expect(played).toHaveLength(EXEC_CUES.reduce((n, c) => n + times(c), 0));
    expect(played.map(p => p[0]).slice(0, 3)).toEqual([SOUND.ZAP, SOUND.PAIN, SOUND.THUD]);
  });

  it('plays the fists’ when no katana is in hand: the bound in, the punch in his belly, his cry, the punch down', () => {
    const { fx, played } = rig();
    for (let lock = EXEC.TICKS; lock > 0; lock -= 2) {
      fx.frame(pair(lock, 'fist'));
    }
    expect(played).toHaveLength(FIST_CUES.reduce((n, c) => n + times(c), 0));
    const ids = played.map(p => p[0]);
    // None of the katana's.
    expect(ids).not.toContain(SOUND.ZAP);
    expect(ids).not.toContain(SOUND.SHING);
    expect(ids.slice(0, 4)).toEqual([SOUND.GRUNT, SOUND.JUMP, SOUND.LAND, SOUND.STEP]);
    // The punch in the belly heard on him, and his cry in his voice, as he goes down on his knee.
    const gut = played.find(p => p[0] == SOUND.TACKLE)!;
    expect(gut[1]).toEqual([0, 1.3, -1]);
    const cry = played.find(p => p[0] == SOUND.PAIN)!;
    expect(cry[3]).toBeGreaterThan(1.2);
    // The punch down's whoosh is the last, on the killer.
    expect(played.at(-1)![0]).toBe(SOUND.SWISH);
    expect(played.at(-1)![1]).toEqual([0, 1.3, 0]);
  });

  it('does not play late what went before one is seen', () => {
    const { fx, played } = rig([K]);
    fx.frame(pair(10, false));
    expect(played).toEqual([]);
    fx.frame(pair(9, false));
    expect(played.length).toBeLessThanOrEqual(1);
  });

  it('puts off the sounds after the kill, on where they stood, and none when the lock is let go early', () => {
    for (const [exec, after] of [
      [false, FEAST_AFTER],
      [true, EXEC_AFTER],
      ['fist', FIST_AFTER],
    ] as const) {
      const { fx, played, later } = rig([K]);
      fx.frame(pair(2, exec));
      fx.frame(pair(1, exec));
      fx.frame([state(K, {}), state(V, { z: -1, down: 100 })]);
      expect(later.map(l => l[1])).toEqual(after.map(a => a[0] * 1000));
      const n = played.length;
      later.forEach(([f]) => f());
      expect(played.slice(n).map(p => p[0])).toEqual(after.map(a => a[1]));
    }
    const { fx, later } = rig([K]);
    fx.frame(pair(60, false));
    fx.frame([state(K, {}), state(V, { z: -1 })]);
    expect(later).toEqual([]);
  });
});
