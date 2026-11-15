import { describe, expect, it, vi } from 'vitest';
import { FRAG } from '../shared/protocol';
import type { Vec3 } from './mesh';
import {
  TAUNT_DELAY,
  TAUNT_GAP,
  TAUNT_LATE,
  createTaunts,
  deathOf,
  speakerOf,
  tauntOf,
} from './taunt';
import { CAST, KIND, LINES, VOICES } from './voice/cast';

/** The kind of line a clip is, and whose voice says it. */
const kindOf = (clip: number) =>
  Object.entries(KIND).find(([, [a, b]]) => clip % LINES >= a && clip % LINES < b)![0];

describe('voices', () => {
  it('has a clip for every line of every voice', () => {
    expect(CAST).toHaveLength(VOICES * 2 * LINES);
    expect(Object.values(KIND).at(-1)![1]).toBe(LINES);
  });

  it('gives the man one of his voices and the woman one of hers, by id', () => {
    for (const id of [0, 1, 2, 7]) {
      expect(speakerOf(id)).toBeLessThan(VOICES);
      expect(speakerOf(id, 1)).toBeGreaterThanOrEqual(VOICES);
    }
    expect(speakerOf(1)).not.toBe(speakerOf(2));
  });

  it('taunts with a line of its own for the fists and the katana, a new taunt each frag', () => {
    expect(kindOf(tauntOf(1, FRAG.FIST, 1))).toBe('FISTS');
    expect(kindOf(tauntOf(1, FRAG.BLADE, 1))).toBe('BLADE');
    for (const how of [FRAG.GUN, FRAG.RAIL, FRAG.NADE, FRAG.VEHICLE]) {
      expect(kindOf(tauntOf(1, how, 1))).toBe('TAUNT');
    }
    const [a, b] = KIND.TAUNT;
    const run = Array.from({ length: b - a }, (_, n) => tauntOf(3, FRAG.GUN, n + 1));
    expect(new Set(run).size).toBe(b - a);
    // In the speaker's own voice.
    for (const clip of run) {
      expect(Math.floor(clip / LINES)).toBe(3);
    }
  });

  it('cries going down in the speaker’s voice', () => {
    expect(kindOf(deathOf(2, 5))).toBe('DEATH');
    expect(Math.floor(deathOf(2, 5) / LINES)).toBe(2);
  });
});

describe('createTaunts', () => {
  const ME = 1;
  const setup = () => {
    const speak = vi.fn((..._: [number, Vec3?, number?, number?]) => true);
    const taunts = createTaunts({ speak }, id => (id == 4 ? 1 : 0));
    const at = (id: number): Vec3 | undefined => (id == 9 ? undefined : [id, 0, 0]);
    return { speak, taunts, at };
  };
  const frag = (by: number, who: number, n = 1, how: number = FRAG.GUN) => ({ by, who, how, n });

  it('has the author of a frag taunt a moment later, from where he is drawn', () => {
    const { speak, taunts, at } = setup();
    taunts.frag(frag(4, 2), ME, 10);
    taunts.frame(10 + TAUNT_DELAY - 0.01, at);
    expect(speak).not.toHaveBeenCalled();
    taunts.frame(10 + TAUNT_DELAY, at);
    expect(speak).toHaveBeenCalledTimes(1);
    const [clip, where] = speak.mock.calls[0];
    expect(clip).toBe(tauntOf(speakerOf(4, 1), FRAG.GUN, 1));
    // From his mouth.
    expect(where).toEqual([4, 1.6, 0]);
    taunts.frame(20, at);
    expect(speak).toHaveBeenCalledTimes(1);
  });

  it('says the own taunt and the one aimed at the own player close, centred', () => {
    const { speak, taunts, at } = setup();
    taunts.frag(frag(ME, 2), ME, 10, TAUNT_LATE);
    taunts.frag(frag(3, ME), ME, 10);
    taunts.frame(20, at);
    expect(speak.mock.calls.map(c => c[1])).toEqual([undefined, undefined]);
  });

  it('says nothing of a player it does not draw', () => {
    const { speak, taunts, at } = setup();
    taunts.frag(frag(9, 2), ME, 10);
    taunts.frame(20, at);
    expect(speak).not.toHaveBeenCalled();
  });

  it('keeps a player quiet for a while after a taunt', () => {
    const { speak, taunts, at } = setup();
    taunts.frag(frag(4, 2, 1), ME, 10);
    taunts.frag(frag(4, 3, 2), ME, 10 + TAUNT_GAP - 0.1);
    taunts.frag(frag(5, 3, 1), ME, 11);
    taunts.frame(30, at);
    expect(speak).toHaveBeenCalledTimes(2);
    taunts.frag(frag(4, 3, 3), ME, 10 + TAUNT_GAP);
    taunts.frame(30, at);
    expect(speak).toHaveBeenCalledTimes(3);
  });
});
