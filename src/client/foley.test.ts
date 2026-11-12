import { describe, expect, it } from 'vitest';
import { STILL } from '../shared/physics';
import { EV, MODE, SIDE } from '../shared/types';
import type { PlayerState, Rover } from '../shared/types';
import { KEY, NOBODY } from '../shared/types';
import { ROVER, drive } from '../shared/rover';
import { SHIP, dock } from '../shared/ship';
import { land, rover as parked, run } from '../../test/slope';
import type { Audio } from './audio';
import { BREATH, SKID_FROM, createFoley } from './foley';
import { createGait } from './gait';
import type { Gait } from './gait';
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
  const sets: Record<number, [number, number][]> = {
    [SOUND.WIND]: [],
    [SOUND.SCRAPE]: [],
    [SOUND.ENGINE]: [],
    [SOUND.SKID]: [],
    [SOUND.JET]: [],
  };
  let muted = false;
  const audio: Audio = {
    unlock: () => {},
    listen: () => {},
    play: (id, at, gain, rate) => void played.push({ id, at, gain, rate }),
    loop: id => ({ set: (v, r) => void sets[id].push([v, r]) }),
    say: () => {},
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
    const walk = (p: PlayerState, from: number, to: number, by = 1) => {
      const { audio, played } = fake();
      const f = createFoley(audio);
      for (let s = from; s <= to; s += by) {
        f.me(p, { ev: 0, fall: 0 }, s);
      }
      return played;
    };
    const run = player({ vx: 6 });
    const sprint = player({ vx: 9 });

    it('fall on each footstep of the body, none between', () => {
      const { audio, played } = fake();
      const f = createFoley(audio);
      f.me(run, { ev: 0, fall: 0 }, 0);
      f.me(run, { ev: 0, fall: 0 }, 0);
      expect(played).toHaveLength(0);
      f.me(run, { ev: 0, fall: 0 }, 1);
      expect(played).toHaveLength(1);
      f.me(run, { ev: 0, fall: 0 }, 1);
      expect(played).toHaveLength(1);
      f.me(run, { ev: 0, fall: 0 }, 2);
      expect(ids(played)).toEqual([SOUND.STEP, SOUND.STEP]);
      expect(played[0].at).toBeUndefined();
    });

    it('sound the frame a drawn foot lands, one per foot: faster at a sprint', () => {
      const frames = (v: number) => {
        const g = createGait(0);
        const { audio, played } = fake();
        const f = createFoley(audio);
        let [last, synced] = [g.steps, true];
        for (let i = 0; i < 180; i++) {
          const p = player({ x: v * i * DT, vx: v });
          g.update(p, DT);
          const n = played.length;
          f.me(p, { ev: 0, fall: 0 }, g.steps);
          // A sound exactly when the gait sets a foot down.
          synced &&= played.length - n == g.steps - last;
          last = g.steps;
        }
        expect(synced).toBe(true);
        return played.length;
      };
      // Three seconds of running: a few steps a second.
      expect(frames(6)).toBeGreaterThan(6);
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
      f.others([player({ id: 2, x: 0 })], () => 0);
      f.others([player({ id: 2, x: 0.5, mode: MODE.AIR, ground: false })], () => 1);
      f.others([player({ id: 2, x: 1, vy: -9 })], () => 2);
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
      f.me(player({ vx: 6 }), { ev: 0, fall: 0 }, 9);
      expect(played).toEqual([]);
    });
  });
});

const ids = (played: Played[]) => played.map(p => p.id);

describe('the others', () => {
  /** Draws `ps` at 60 Hz the way the renderer does: each a runner whose gait counts its footsteps. */
  const drawn = (f: ReturnType<typeof createFoley>) => {
    const gaits = new Map<number, Gait>();
    return (ps: PlayerState[]) => {
      for (const p of ps) {
        if (!gaits.has(p.id)) {
          gaits.set(p.id, createGait());
        }
        gaits.get(p.id)!.update(p, DT);
      }
      f.others(ps, id => gaits.get(id)?.steps);
      return gaits;
    };
  };
  /** A player running along x at v m/s on the ground, drawn at 60 Hz for `seconds`. */
  const running = (
    draw: ReturnType<typeof drawn>,
    id: number,
    v: number,
    seconds: number,
    x0 = 0,
  ) => {
    for (let i = 0; i <= seconds * 60; i++) {
      draw([player({ id, x: x0 + v * i * DT, vx: v })]);
    }
  };

  it('step at their position as their runner sets a foot down', () => {
    const { audio, played } = fake();
    const draw = drawn(createFoley(audio));
    const first = draw([player({ id: 2, x: 10, vx: 6 })]).get(2)!.steps;
    running(draw, 2, 6, 3, 10);
    const g = draw([player({ id: 2, x: 28, vx: 6 })]).get(2)!;
    expect(played.length).toBe(g.steps - first);
    expect(played.length).toBeGreaterThan(6);
    expect(played.every(p => p.id === SOUND.STEP)).toBe(true);
    expect(played[0].at![0]).toBeGreaterThan(10);
    expect(played[0].at![1]).toBeCloseTo(0.1);
  });

  it('are silent when standing, in the air and on a slide, and on their first frame', () => {
    const { audio, played } = fake();
    const draw = drawn(createFoley(audio));
    for (let i = 0; i < 61; i++) {
      draw([player({ id: 2, x: 50 })]);
    }
    for (let i = 0; i < 60; i++) {
      draw([player({ id: 2, x: 50 + i * 0.1, mode: MODE.AIR, ground: false, vx: 6 })]);
    }
    for (let i = 0; i < 60; i++) {
      draw([player({ id: 2, x: 56 + i * 0.1, mode: MODE.SLIDE, vx: 6 })]);
    }
    expect(played).toEqual([]);
  });

  it('tap a wall-run each half of their stride, and take a respawn jump for no walk at all', () => {
    const { audio, played } = fake();
    const draw = drawn(createFoley(audio));
    for (let i = 0; i <= 120; i++) {
      draw([player({ id: 2, x: i * 0.13, mode: MODE.WALLRUN, wall: SIDE.NORTH, vx: 8 })]);
    }
    expect(played.length).toBeGreaterThan(2);
    expect(played.every(p => p.id === SOUND.WALLSTEP)).toBe(true);
    played.length = 0;
    draw([player({ id: 2, x: 500, mode: MODE.WALLRUN, wall: SIDE.NORTH, vx: 8 })]);
    draw([player({ id: 2, x: 500.01, mode: MODE.WALLRUN, wall: SIDE.NORTH, vx: 8 })]);
    expect(played).toEqual([]);
  });

  it('land with a thud where they come down, by the speed they fell at', () => {
    const { audio, played } = fake();
    const f = createFoley(audio);
    const air = (vy: number) => player({ id: 2, x: 4, y: 3, vy, mode: MODE.AIR, ground: false });
    f.others([air(-2)], () => 0);
    f.others([air(-12)], () => 0);
    f.others([player({ id: 2, x: 4, y: 0 })], () => 0);
    expect(played).toHaveLength(1);
    expect(played[0]).toMatchObject({ id: SOUND.LAND, at: [4, 0.1, 0] });
    const hard = played[0].gain!;
    // A soft touchdown (stepping off a kerb) is not heard.
    f.others([air(-2)], () => 0);
    f.others([player({ id: 2, x: 4, y: 0 })], () => 0);
    expect(played).toHaveLength(1);
    f.others([air(-6)], () => 0);
    f.others([player({ id: 2, x: 4, y: 0 })], () => 0);
    expect(played).toHaveLength(2);
    expect(played[1].gain!).toBeLessThan(hard);
  });

  it('keep each its own steps, and forget those who left', () => {
    const { audio, played } = fake();
    const f = createFoley(audio);
    const draw = drawn(f);
    // A sprinter and a jogger: each steps with its own runner's feet.
    for (let i = 0; i <= 120; i++) {
      draw([player({ id: 2, x: i * 0.15, vx: 9 }), player({ id: 3, x: 30 + i * 0.03, vx: 2 })]);
    }
    const near = played.filter(p => p.at![0] < 20).length;
    const far = played.length - near;
    expect(near).toBeGreaterThan(far * 1.5);
    played.length = 0;
    f.others([], () => undefined);
    // Back, far from where they were: a new player, no landing and no step on the first frame.
    f.others([player({ id: 2, x: 99, y: 0, vy: -20 })], () => 50);
    expect(played).toEqual([]);
  });
});

describe('the rover the own player sits in', () => {
  const car = (over: Partial<Rover> = {}): Rover => ({
    x: 0,
    y: 1.1,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: 0,
    pitch: 0,
    roll: 0,
    wy: 0,
    wp: 0,
    wr: 0,
    steer: 0,
    driver: 1,
    rider: NOBODY,
    ...over,
  });
  const last = (l: [number, number][]) => l.at(-1)!;

  it('is silent on foot: no loop is even started, and a rover left goes quiet', () => {
    const { audio, sets, played } = fake();
    const f = createFoley(audio);
    f.rover(undefined, DT);
    expect(sets[SOUND.ENGINE]).toEqual([]);
    f.rover(car({ vz: -10 }), DT, KEY.FORWARD);
    expect(last(sets[SOUND.ENGINE])[0]).toBeGreaterThan(0);
    f.rover(undefined, DT);
    expect(last(sets[SOUND.ENGINE])[0]).toBe(0);
    expect(last(sets[SOUND.SKID])[0]).toBe(0);
    expect(played).toEqual([]);
  });

  it('idles at rest, and is louder and higher the faster it goes, more so under the throttle', () => {
    const { audio, sets } = fake();
    const f = createFoley(audio);
    const at = (v: number, keys = 0) => {
      f.rover(car({ vz: -v }), DT, keys);
      return last(sets[SOUND.ENGINE]);
    };
    const [idle, slow, fast, top] = [at(0), at(6), at(15), at(ROVER.VMAX)];
    expect(idle[0]).toBeGreaterThan(0.1);
    for (const k of [0, 1]) {
      expect(slow[k]).toBeGreaterThan(idle[k]);
      expect(fast[k]).toBeGreaterThan(slow[k]);
      expect(top[k]).toBeGreaterThan(fast[k]);
      expect(at(6, KEY.FORWARD)[k]).toBeGreaterThan(slow[k]);
      // Past the top speed it revs no higher.
      expect(at(40)[k]).toBe(top[k]);
    }
    // In reverse as forward.
    expect(at(-6)).toEqual(slow);
  });

  it('is silent while muted', () => {
    const { audio, sets } = fake();
    const f = createFoley(audio);
    f.rover(car({ vz: -10 }), DT);
    audio.mute(true);
    f.rover(car({ vz: -10 }), DT);
    expect(last(sets[SOUND.ENGINE])[0]).toBe(0);
  });

  it('skids while it slides sideways past the threshold, louder the wider, and not while it rolls straight', () => {
    const { audio, sets } = fake();
    const f = createFoley(audio);
    const at = (vx: number, vz = -12) => {
      f.rover(car({ vx, vz }), DT);
      return last(sets[SOUND.SKID])[0];
    };
    expect(at(0)).toBe(0);
    expect(at(SKID_FROM - 0.1)).toBe(0);
    const some = at(SKID_FROM + 2);
    expect(some).toBeGreaterThan(0);
    expect(at(-(SKID_FROM + 6))).toBeGreaterThan(some);
    // Across the look is along the nose once the nose has come round.
    f.rover(car({ vx: -12, vz: 0, yaw: Math.PI / 2 }), DT);
    expect(last(sets[SOUND.SKID])[0]).toBe(0);
  });

  /** A flight of `t` seconds under `g`, then the stop on the springs, then rolling on. */
  const hop = (f: ReturnType<typeof createFoley>, t: number, g = 5, dt = DT) => {
    let [y, vy] = [1.1, (g * t) / 2];
    f.rover(car({ y, vy, vz: -10 }), dt);
    for (let s = 0; s < t; s += dt) {
      vy -= g * dt;
      y += vy * dt;
      f.rover(car({ y, vy, vz: -10 }), dt);
    }
    for (const k of [0.4, 0, -0.1, 0, 0, 0]) {
      f.rover(car({ y: 1.1, vy: -vy * k, vz: -10 }), dt);
    }
  };

  it.each([DT, 1 / 144, 1 / 30])('thuds once per landing (frames of %f s)', dt => {
    const { audio, ids, played } = fake();
    const f = createFoley(audio);
    hop(f, 1.2, 5, dt);
    expect(ids()).toEqual([SOUND.THUD]);
    expect(played[0].at).toBeUndefined();
    hop(f, 1.2, 5, dt);
    expect(ids()).toEqual([SOUND.THUD, SOUND.THUD]);
  });

  it('thuds harder and lower after a longer fall', () => {
    const { audio, played } = fake();
    const f = createFoley(audio);
    hop(f, 0.9);
    hop(f, 3);
    expect(played).toHaveLength(2);
    expect(played[1].gain!).toBeGreaterThan(played[0].gain!);
    expect(played[1].rate!).toBeLessThan(played[0].rate!);
  });

  it('does not thud on its springs, nor over a crest onto a downhill, nor when parked again', () => {
    const { audio, played } = fake();
    const f = createFoley(audio);
    // The body bobbing on the springs: 2 Hz, a few centimetres.
    for (let k = 0; k < 240; k++) {
      f.rover(car({ vy: 0.4 * Math.cos(k * DT * 12), vz: -10 }), DT);
    }
    // Over a crest: the climb turns into a descent in half a second, which then holds.
    for (let k = 0; k < 120; k++) {
      f.rover(car({ vy: Math.max(-6, 6 - k * DT * 24), vz: -10 }), DT);
    }
    // Falling into the rille, then back on its spawn 100 m away.
    for (let k = 0; k < 60; k++) {
      f.rover(car({ y: -k, vy: -k * DT * 5 - 3 }), DT);
    }
    f.rover(car({ x: 100, vy: 0 }), DT);
    f.rover(car({ x: 100, vy: 0 }), DT);
    expect(played).toEqual([]);
  });

  it('thuds once when the real rover drives off a ledge and lands, and not while it drives on flat ground', () => {
    const { audio, ids } = fake();
    const f = createFoley(audio);
    // Flat at 3 m up to x = 30, the ground at 0 beyond.
    const w = land(x => (x < 30 ? 3 : 0));
    const r = parked(w, 0, 0, -Math.PI / 2);
    for (let k = 0; k < 150; k++) {
      run(r, w, 1, KEY.FORWARD);
      f.rover(r, DT, KEY.FORWARD);
    }
    expect(r.x).toBeLessThan(28);
    expect(ids()).toEqual([]);
    for (let k = 0; k < 300; k++) {
      drive(r, undefined, w);
      f.rover(r, DT);
    }
    expect(r.x).toBeGreaterThan(32);
    expect(ids()).toEqual([SOUND.THUD]);
  });
});

describe('breathing in a helmet', () => {
  /** The breaths of `secs` seconds of `p`, after a fresh start: [id, time, gain, rate]. */
  const breaths = (p: PlayerState, secs: number, f = fake()) => {
    const foley = createFoley(f.audio);
    const out: [number, number, number, number][] = [];
    for (let i = 0; i < secs / DT; i++) {
      const n = f.played.length;
      foley.breathe(p, DT);
      f.played.slice(n).forEach(b => out.push([b.id, i * DT, b.gain!, b.rate!]));
    }
    return out;
  };

  it('breathes in then out, again and again, centred, slowly at rest', () => {
    const b = breaths(player(), 12);
    const ids = b.map(([id]) => id);
    expect(ids.slice(0, 4)).toEqual([SOUND.EXHALE, SOUND.INHALE, SOUND.EXHALE, SOUND.INHALE]);
    const ins = b.filter(([id]) => id == SOUND.INHALE).map(([, t]) => t);
    expect(ins[1] - ins[0]).toBeCloseTo(BREATH[0], 1);
  });

  it('breathes quicker, louder and higher after running hard', () => {
    const calm = breaths(player(), 20);
    const hard = breaths(player({ ground: false, vy: -2 }), 20);
    expect(hard.length).toBeGreaterThan(calm.length * 1.8);
    expect(hard[hard.length - 1][2]).toBeGreaterThan(calm[calm.length - 1][2]);
    expect(hard[hard.length - 1][3]).toBeGreaterThan(calm[calm.length - 1][3]);
  });

  it('is silent when down, without a player, and muted', () => {
    expect(breaths(player({ down: 100 }), 10)).toEqual([]);
    const f = fake();
    const foley = createFoley(f.audio);
    for (let i = 0; i < 600; i++) {
      foley.breathe(undefined, DT);
    }
    expect(f.played).toEqual([]);
    f.audio.mute(true);
    expect(breaths(player(), 10, f)).toEqual([]);
  });
});

describe('the ship the own player flies (the user, 2026-11-12)', () => {
  const ship = (over: Partial<Rover> = {}): Rover => ({ ...dock([[0, 0, 0, 0]])[0], ...over });

  it('runs its jet louder and higher with the speed and the boost, low on its pad, silent off it', () => {
    const { audio, sets } = fake();
    const f = createFoley(audio);
    f.ship(ship({ steer: -1 }), DT);
    f.ship(ship({ vz: -SHIP.VMAX / 2 }), DT, KEY.FORWARD);
    f.ship(ship({ vz: -SHIP.VMAX }), DT, KEY.FORWARD | KEY.SPRINT);
    f.ship(undefined, DT);
    const [pad, half, full, off] = sets[SOUND.JET];
    expect(pad[0]).toBeGreaterThan(0);
    expect(half[0]).toBeGreaterThan(pad[0]);
    expect(full[0]).toBeGreaterThan(half[0]);
    expect(full[1]).toBeGreaterThan(half[1]);
    expect(off[0]).toBe(0);
  });

  it('crashes when a frame takes more speed off it than the engines can, harder the faster', () => {
    const { audio, played } = fake();
    const f = createFoley(audio);
    f.ship(ship({ vz: -40 }), DT, KEY.FORWARD);
    f.ship(ship({ z: -0.6, vz: -39 }), DT, KEY.FORWARD);
    expect(played).toEqual([]);
    f.ship(ship({ z: -1.2, vz: 0 }), DT, KEY.FORWARD);
    expect(played).toHaveLength(1);
    expect(played[0]).toMatchObject({ id: SOUND.CRASH });
    // Parked afresh far away: no crash.
    f.ship(ship({ z: -100, vz: -40 }), DT);
    f.ship(ship({ z: 0, vz: 0 }), DT);
    expect(played).toHaveLength(1);
  });
});
