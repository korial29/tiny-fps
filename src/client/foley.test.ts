import { describe, expect, it } from 'vitest';
import { STILL } from '../shared/physics';
import { EV, MODE, SIDE } from '../shared/types';
import type { PlayerState } from '../shared/types';
import type { Audio } from './audio';
import { createEffects, stepLength } from './effects';
import { createFoley } from './foley';
import { SOUND } from './sfx';

const DT = 1 / 60;
const player = (over: Partial<PlayerState> = {}): PlayerState => ({
  id: 1,
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

interface Played {
  id: number;
  at?: number[];
  gain?: number;
  rate?: number;
}
/** An Audio that writes down what it is asked: the sounds played, and what each loop is set to. */
const fake = () => {
  const played: Played[] = [];
  const sets: Record<number, [number, number][]> = { [SOUND.WIND]: [], [SOUND.SCRAPE]: [] };
  let muted = false;
  const audio: Audio = {
    unlock: () => {},
    listen: () => {},
    play: (id, at, gain, rate) => void played.push({ id, at, gain, rate }),
    loop: id => ({ set: (v, r) => void sets[id].push([v, r]) }),
    mute: on => {
      muted = on;
    },
    get muted() {
      return muted;
    },
    destroy: () => {},
  };
  const ids = () => played.map(p => p.id);
  return { audio, played, sets, ids };
};

describe('the own player', () => {
  it.each([
    ['a jump', EV.JUMP, SOUND.JUMP],
    ['a double jump', EV.DOUBLE, SOUND.DOUBLE],
    ['a dash', EV.DASH, SOUND.DASH],
    ['a grab', EV.GRAB, SOUND.GRAB],
    ['the end of a climb', EV.CLIMB, SOUND.SCUFF],
    ['a landing', EV.LAND, SOUND.LAND],
  ])('plays the sound of %s once, centred', (_, ev, id) => {
    const { audio, played } = fake();
    const f = createFoley(audio);
    f.me(player(), { ev: 0, fall: 0 }, 0);
    expect(played).toEqual([]);
    f.me(player(), { ev, fall: 8 }, 0);
    expect(played).toHaveLength(1);
    expect(played[0]).toMatchObject({ id });
    expect(played[0].at).toBeUndefined();
    f.me(player(), { ev: 0, fall: 0 }, 0);
    expect(played).toHaveLength(1);
  });

  it('plays what several events of a frame are, each once', () => {
    const { audio, ids } = fake();
    createFoley(audio).me(player(), { ev: EV.LAND | EV.JUMP | EV.DASH, fall: 5 }, 0);
    expect(ids().sort()).toEqual([SOUND.JUMP, SOUND.DASH, SOUND.LAND].sort());
  });

  it('makes a hard landing louder and lower than a soft one', () => {
    const { audio, played } = fake();
    const f = createFoley(audio);
    for (const fall of [3, 8, 14, 30]) {
      f.me(player(), { ev: EV.LAND, fall }, 0);
    }
    const [soft, mid, hard, huge] = played;
    expect(soft.gain!).toBeLessThan(mid.gain!);
    expect(mid.gain!).toBeLessThan(hard.gain!);
    expect(hard.gain).toBe(huge.gain);
    expect(soft.rate!).toBeGreaterThan(mid.rate!);
    expect(mid.rate!).toBeGreaterThan(huge.rate!);
    expect(huge.rate!).toBeGreaterThan(0.5);
    expect(soft.gain!).toBeGreaterThan(0.1);
  });

  describe('footsteps', () => {
    const walk = (p: PlayerState, from: number, to: number, by = 0.05) => {
      const { audio, played } = fake();
      const f = createFoley(audio);
      for (let s = from; s <= to; s += by) {
        f.me(p, { ev: 0, fall: 0 }, s);
      }
      return played;
    };
    const run = player({ vx: 6 });
    const sprint = player({ vx: 9 });

    it('fall on each whole step of the stride, none between', () => {
      const { audio, played } = fake();
      const f = createFoley(audio);
      f.me(run, { ev: 0, fall: 0 }, 0);
      f.me(run, { ev: 0, fall: 0 }, 0.9);
      expect(played).toHaveLength(0);
      f.me(run, { ev: 0, fall: 0 }, 1.1);
      expect(played).toHaveLength(1);
      f.me(run, { ev: 0, fall: 0 }, 1.9);
      expect(played).toHaveLength(1);
      f.me(run, { ev: 0, fall: 0 }, 2);
      expect(ids(played)).toEqual([SOUND.STEP, SOUND.STEP]);
      expect(played[0].at).toBeUndefined();
    });

    it('come at the stride cadence: faster at a sprint, one every stepLength metres', () => {
      const frames = (v: number) => {
        const fx = createEffects();
        const { audio, played } = fake();
        const f = createFoley(audio);
        for (let i = 0; i < 180; i++) {
          const p = player({ x: v * i * DT, vx: v });
          fx.update(p, 0, DT);
          f.me(p, { ev: 0, fall: 0 }, fx.stride);
        }
        return played.length;
      };
      // Three seconds: 18 m at 6 m/s, 27 m at 9.
      expect(Math.abs(frames(6) - 18 / stepLength(6))).toBeLessThanOrEqual(1);
      expect(Math.abs(frames(9) - 27 / stepLength(9))).toBeLessThanOrEqual(1);
      expect(frames(9)).toBeGreaterThan(frames(6));
    });

    it('are harder and lower at a sprint, softer crouched, and alternate in pitch', () => {
      const [a, b, c] = walk(run, 0, 4);
      const [s] = walk(sprint, 0, 4);
      const [k] = walk(player({ mode: MODE.CROUCH, vx: 2 }), 0, 4);
      expect(s.gain!).toBeGreaterThan(a.gain!);
      expect(k.gain!).toBeLessThan(a.gain!);
      expect(s.rate!).toBeLessThan(a.rate!);
      expect(a.rate).not.toBe(b.rate);
      expect(a.rate).toBe(c.rate);
    });

    it('are the lighter tap on a wall-run', () => {
      const played = walk(player({ mode: MODE.WALLRUN, wall: SIDE.EAST, vx: 8 }), 0, 4);
      expect(played.length).toBeGreaterThan(2);
      expect(played.every(p => p.id === SOUND.WALLSTEP)).toBe(true);
    });

    it('are not made before the first state', () => {
      const { audio, played } = fake();
      const f = createFoley(audio);
      f.me(undefined, { ev: EV.JUMP, fall: 0 }, 5);
      expect(played).toEqual([]);
    });
  });

  describe('wind', () => {
    const wind = (speeds: number[]) => {
      const { audio, sets } = fake();
      const f = createFoley(audio);
      for (const v of speeds) {
        f.me(player({ vx: v }), { ev: 0, fall: 0 }, 0);
      }
      return sets[SOUND.WIND];
    };

    it('is silent at rest, and louder and higher with the speed, up to a limit', () => {
      const w = wind([0, 3, 6, 9, 12, 16, 25]);
      expect(w[0][0]).toBe(0);
      expect(w[1][0]).toBe(0);
      for (let i = 2; i < 6; i++) {
        expect(w[i][0]).toBeGreaterThan(w[i - 1][0]);
        expect(w[i][1]).toBeGreaterThan(w[i - 1][1]);
      }
      expect(w[6]).toEqual(w[5]);
      expect(w[0][1]).toBeLessThan(1);
      expect(w[5][1]).toBeGreaterThan(1.3);
    });

    it('counts a fall, not only a run', () => {
      const { audio, sets } = fake();
      const f = createFoley(audio);
      f.me(player({ vy: -20, mode: MODE.AIR, ground: false }), { ev: 0, fall: 0 }, 0);
      expect(sets[SOUND.WIND][0][0]).toBeGreaterThan(0.3);
    });

    it('is a quiet bed at a run and a roar at a dash', () => {
      const w = wind([6, 16]);
      expect(w[0][0]).toBeLessThan(0.1);
      expect(w[1][0]).toBeGreaterThan(0.4);
    });
  });

  describe('slide', () => {
    it('scrapes as long as the slide lasts, harder when faster, and stops with it', () => {
      const { audio, sets } = fake();
      const f = createFoley(audio);
      const sliding = (v: number) => player({ mode: MODE.SLIDE, vx: v });
      f.me(player({ vx: 8 }), { ev: 0, fall: 0 }, 0);
      f.me(sliding(8), { ev: EV.SLIDE_START, fall: 0 }, 0);
      f.me(sliding(8), { ev: 0, fall: 0 }, 0);
      f.me(sliding(5), { ev: 0, fall: 0 }, 0);
      f.me(player({ vx: 5 }), { ev: EV.SLIDE_END, fall: 0 }, 0);
      const s = sets[SOUND.SCRAPE].map(([v]) => v);
      expect(s[0]).toBe(0);
      expect(s[1]).toBeGreaterThan(0.3);
      expect(s[2]).toBe(s[1]);
      expect(s[3]).toBeGreaterThan(0.1);
      expect(s[3]).toBeLessThan(s[2]);
      expect(s[4]).toBe(0);
    });
  });

  describe('mute', () => {
    it('plays no sound and moves no loop', () => {
      const { audio, played, sets } = fake();
      audio.mute(true);
      const f = createFoley(audio);
      f.me(player({ vx: 12 }), { ev: EV.JUMP | EV.LAND | EV.DASH, fall: 9 }, 0);
      f.me(player({ vx: 12 }), { ev: 0, fall: 0 }, 3);
      f.others([player({ id: 2, x: 0 })]);
      f.others([player({ id: 2, x: 0.5, mode: MODE.AIR, ground: false })]);
      f.others([player({ id: 2, x: 1, vy: -9 })]);
      expect(played).toEqual([]);
      expect(sets[SOUND.WIND]).toEqual([]);
      expect(sets[SOUND.SCRAPE]).toEqual([]);
    });

    it('does not burst out the steps it missed when it ends', () => {
      const { audio, played } = fake();
      const f = createFoley(audio);
      audio.mute(true);
      f.me(player({ vx: 6 }), { ev: 0, fall: 0 }, 0);
      f.me(player({ vx: 6 }), { ev: 0, fall: 0 }, 9);
      audio.mute(false);
      f.me(player({ vx: 6 }), { ev: 0, fall: 0 }, 9.2);
      expect(played).toEqual([]);
    });
  });
});

const ids = (played: Played[]) => played.map(p => p.id);

describe('the others', () => {
  /** A player running along x at v m/s on the ground, drawn at 60 Hz for `seconds`. */
  const running = (
    f: ReturnType<typeof createFoley>,
    id: number,
    v: number,
    seconds: number,
    x0 = 0,
  ) => {
    for (let i = 0; i <= seconds * 60; i++) {
      f.others([player({ id, x: x0 + v * i * DT, vx: v })]);
    }
  };

  it('step at their position on the stride cadence, as the own player does', () => {
    const { audio, played } = fake();
    running(createFoley(audio), 2, 6, 3, 10);
    expect(Math.abs(played.length - 18 / stepLength(6))).toBeLessThanOrEqual(1);
    expect(played.every(p => p.id === SOUND.STEP)).toBe(true);
    const [first] = played;
    expect(first.at![0]).toBeGreaterThan(10);
    expect(first.at![0]).toBeLessThan(10 + stepLength(6) + 0.3);
    expect(first.at![1]).toBeCloseTo(0.1);
  });

  it('are silent when standing, in the air and on a slide, and on their first frame', () => {
    const { audio, played } = fake();
    const f = createFoley(audio);
    f.others([player({ id: 2, x: 50 })]);
    for (let i = 0; i < 60; i++) {
      f.others([player({ id: 2, x: 50 })]);
    }
    for (let i = 0; i < 60; i++) {
      f.others([player({ id: 2, x: 50 + i * 0.1, mode: MODE.AIR, ground: false, vx: 6 })]);
    }
    for (let i = 0; i < 60; i++) {
      f.others([player({ id: 2, x: 56 + i * 0.1, mode: MODE.SLIDE, vx: 6 })]);
    }
    expect(played).toEqual([]);
  });

  it('tap a wall-run, and take a respawn jump for no walk at all', () => {
    const { audio, played } = fake();
    const f = createFoley(audio);
    for (let i = 0; i <= 120; i++) {
      f.others([player({ id: 2, x: i * 0.13, mode: MODE.WALLRUN, vx: 8 })]);
    }
    expect(played.length).toBeGreaterThan(2);
    expect(played.every(p => p.id === SOUND.WALLSTEP)).toBe(true);
    played.length = 0;
    f.others([player({ id: 2, x: 500, mode: MODE.WALLRUN, vx: 8 })]);
    f.others([player({ id: 2, x: 500.01, mode: MODE.WALLRUN, vx: 8 })]);
    expect(played).toEqual([]);
  });

  it('land with a thud where they come down, by the speed they fell at', () => {
    const { audio, played } = fake();
    const f = createFoley(audio);
    const air = (vy: number) => player({ id: 2, x: 4, y: 3, vy, mode: MODE.AIR, ground: false });
    f.others([air(-2)]);
    f.others([air(-12)]);
    f.others([player({ id: 2, x: 4, y: 0 })]);
    expect(played).toHaveLength(1);
    expect(played[0]).toMatchObject({ id: SOUND.LAND, at: [4, 0.1, 0] });
    const hard = played[0].gain!;
    // A soft touchdown (stepping off a kerb) is not heard.
    f.others([air(-2)]);
    f.others([player({ id: 2, x: 4, y: 0 })]);
    expect(played).toHaveLength(1);
    f.others([air(-6)]);
    f.others([player({ id: 2, x: 4, y: 0 })]);
    expect(played).toHaveLength(2);
    expect(played[1].gain!).toBeLessThan(hard);
  });

  it('keep each its own stride, and forget those who left', () => {
    const { audio, played } = fake();
    const f = createFoley(audio);
    // Two players half a step each frame apart: each steps on its own distance, not on the sum.
    for (let i = 0; i <= 120; i++) {
      f.others([player({ id: 2, x: i * 0.1, vx: 6 }), player({ id: 3, x: 30 + i * 0.05, vx: 6 })]);
    }
    const near = played.filter(p => p.at![0] < 20).length;
    const far = played.length - near;
    expect(near).toBeGreaterThan(far * 1.5);
    played.length = 0;
    f.others([]);
    // Back, far from where they were: a new player, no landing and no step on the first frame.
    f.others([player({ id: 2, x: 99, y: 0, vy: -20 })]);
    expect(played).toEqual([]);
  });
});
