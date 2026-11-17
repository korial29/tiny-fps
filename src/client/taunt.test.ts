import { describe, expect, it, vi } from 'vitest';
import { FRAG } from '../shared/protocol';
import type { Vec3 } from './mesh';
import { SOUND, secondsOf } from './sfx';
import {
  TAUNT_DELAY,
  TAUNT_GAP,
  TAUNT_LATE,
  createTaunts,
  deathOf,
  speakerOf,
  tauntOf,
} from './taunt';
import { CAST, KIND, LINES, NINJA, VOICES } from './voice/cast';

/** The kind of line a clip is, and whose voice says it. */
const kindOf = (clip: number) =>
  Object.entries(KIND).find(([, [a, b]]) => clip % LINES >= a && clip % LINES < b)![0];

describe('voices', () => {
  it('has a clip for every line of every voice', () => {
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

  it('gives a ninja a Japanese voice of his body, after the others', () => {
    expect(speakerOf(3, 0, true)).toBe(NINJA);
    expect(speakerOf(3, 1, true)).toBe(NINJA + 1);
    expect(NINJA).toBe(2 * VOICES);
    // The plain voices and the ninja's all have every line.
    expect(CAST).toHaveLength((NINJA + 2) * LINES);
    expect(kindOf(tauntOf(NINJA, FRAG.BLADE, 1))).toBe('BLADE');
  });

  it('cries going down in the speaker’s voice, or groans', () => {
    expect(kindOf(deathOf(2, 5))).toBe('DEATH');
    expect(Math.floor(deathOf(2, 5) / LINES)).toBe(2);
    expect(kindOf(deathOf(2, 5, true))).toBe('GROAN');
    expect(Math.floor(deathOf(2, 5, true) / LINES)).toBe(2);
  });

  it('keeps the cries and the groans brief (the user, 2026-11-17: they were long screams)', () => {
    for (let speaker = 0; speaker < NINJA + 2; speaker++) {
      for (const [a, b] of [KIND.DEATH, KIND.GROAN]) {
        for (let k = a; k < b; k++) {
          expect(CAST[speaker * LINES + k][1]).toBeLessThan(0.75);
        }
      }
    }
  });
});

describe('createTaunts', () => {
  const ME = 1;
  const setup = () => {
    const speak = vi.fn((..._: [number, Vec3?, number?, number?, boolean?]) => true);
    // Players 1 (the own), 6 and 7 are red, the others blue.
    const taunts = createTaunts(
      { speak },
      id => speakerOf(id, id == 4 ? 1 : 0),
      id => +![1, 6, 7].includes(id),
    );
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

  it('says the own taunt close, centred, with no radio', () => {
    const { speak, taunts, at } = setup();
    taunts.frag(frag(ME, 2), ME, 10, TAUNT_LATE);
    expect(taunts.frame(20, at)).toEqual([]);
    const [, where, , , radio] = speak.mock.calls[0];
    expect(where).toBeUndefined();
    expect(radio).toBeFalsy();
  });

  it('brings the taunt of the enemy who fragged the own player over the radio, and only his', () => {
    const { speak, taunts, at } = setup();
    // Enemy 3 fragged the own player: over the radio, wherever he is, his face on its screen.
    taunts.frag(frag(3, ME), ME, 10);
    // Enemy 9 is not drawn: the radio carries him all the same.
    taunts.frag(frag(9, ME), ME, 10 + TAUNT_GAP);
    const said = taunts.frame(30, at);
    expect(speak.mock.calls.map(c => [c[1], c[4]])).toEqual([
      [undefined, true],
      [undefined, true],
    ]);
    expect(said.map(s => s.by).sort()).toEqual([3, 9]);
    // Enemy 5 fragged a teammate: in the air, from his mouth.
    taunts.frag(frag(5, 6), ME, 40);
    expect(taunts.frame(50, at)).toEqual([]);
    expect(speak.mock.calls[2][1]).toEqual([5, 1.6, 0]);
    expect(speak.mock.calls[2][4]).toBeFalsy();
  });

  it('has a xenomorph roar after its frag, from where it is drawn, with no words', () => {
    const speak = vi.fn(() => true);
    const play = vi.fn();
    const taunts = createTaunts(
      { speak, play },
      () => speakerOf(0),
      // It is an enemy of the own player.
      id => +(id == 5),
      id => id == 5,
    );
    taunts.frag(frag(5, 2), ME, 10);
    taunts.frame(20, id => [id, 0, 0]);
    expect(speak).not.toHaveBeenCalled();
    expect(play).toHaveBeenCalledTimes(1);
    expect(play.mock.calls[0][0]).toBe(SOUND.ROAR);
    expect(play.mock.calls[0][1]).toEqual([5, 0, 0]);
  });

  it('brings the roar of a xenomorph who fragged the own player over the radio, its face on the screen', () => {
    const speak = vi.fn(() => true);
    const play = vi.fn();
    const taunts = createTaunts(
      { speak, play },
      () => speakerOf(0),
      id => +(id == 5),
      id => id == 5,
    );
    // Not drawn: the radio carries it all the same.
    taunts.frag(frag(5, ME), ME, 10);
    const said = taunts.frame(20, () => undefined);
    expect(speak).not.toHaveBeenCalled();
    expect(play.mock.calls).toEqual([[SOUND.ROAR, undefined, 0.7, expect.any(Number), true]]);
    expect(said).toEqual([{ by: 5, s: expect.closeTo(secondsOf(SOUND.ROAR), 0) }]);
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

  it('brings an ally\u2019s taunt over the radio wherever he is, and says it began', () => {
    const { speak, taunts, at } = setup();
    // Ally 7 is not drawn near: the radio carries him all the same.
    taunts.frag(frag(7, 2, 1), ME, 10);
    expect(taunts.frame(10, at)).toEqual([]);
    const said = taunts.frame(10 + TAUNT_DELAY, at);
    const [clip, where, , , radio] = speak.mock.calls[0];
    expect(where).toBeUndefined();
    expect(radio).toBe(true);
    expect(said).toEqual([{ by: 7, s: expect.closeTo(CAST[clip][1], 0) }]);
    // An enemy's who fragged someone else is no radio line.
    taunts.frag(frag(4, 2, 1), ME, 20);
    expect(taunts.frame(30, at)).toEqual([]);
  });

  it('shows no screen for an ally\u2019s line the voices could not say yet', () => {
    const speak = vi.fn(() => false);
    const taunts = createTaunts(
      { speak },
      () => speakerOf(0),
      id => +(id != 6 && id != ME),
    );
    taunts.frag(frag(6, 2), ME, 10);
    expect(taunts.frame(20, () => undefined)).toEqual([]);
  });
});
