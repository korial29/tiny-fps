// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EVENT } from '../shared/types';
import { createAudio, createClock, createHeart, hear, savedMute, toggleMute } from './audio';
import type { Audio } from './audio';
import { RATE, SOUND } from './sfx';

// Each rendered buffer is as long as its sound id says: a played source names its sound.
vi.mock('./sfx', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  render: (id: number) => new Float32Array(10 + id),
  music: () => new Float32Array(5),
}));

interface Node {
  to?: Node;
  gain: { value: number; setTargetAtTime: ReturnType<typeof vi.fn> };
  pan: { value: number };
  buffer?: { length: number };
  loop?: boolean;
  started: number;
  stopped: number;
  onended?: () => void;
}

/** Just enough of Web Audio to read back the graph: each connect returns its target, as the real one. */
class FakeContext {
  static all: FakeContext[] = [];
  currentTime = 3;
  destination = {} as Node;
  gains: Node[] = [];
  sources: Node[] = [];
  buffers: { length: number; rate: number }[] = [];
  resumed = 0;
  closed = 0;
  constructor() {
    FakeContext.all.push(this);
  }
  private node(): Node {
    const n: Node = {
      gain: { value: 1, setTargetAtTime: vi.fn() },
      pan: { value: 0 },
      started: 0,
      stopped: 0,
    };
    return Object.assign(n, {
      connect: (to: Node) => (n.to = to),
      start: () => n.started++,
      stop: () => n.stopped++,
    });
  }
  createGain() {
    const n = this.node();
    this.gains.push(n);
    return n;
  }
  createStereoPanner = () => this.node();
  createBufferSource() {
    const n = this.node();
    this.sources.push(n);
    return n;
  }
  createBuffer(_: number, length: number, rate: number) {
    this.buffers.push({ length, rate });
    return { length, getChannelData: () => ({ set: () => {} }) };
  }
  resume = () => (this.resumed++, Promise.resolve());
  close = () => (this.closed++, Promise.resolve());
}

const fake = () => FakeContext.all.at(-1)!;
const install = () => {
  FakeContext.all = [];
  vi.stubGlobal('AudioContext', FakeContext);
};
/** The last voice played: its sound id, pan and volume, read down its source > panner > gain. */
const voice = () => {
  const src = fake().sources.at(-1)!;
  const pan = src.to!;
  return { id: src.buffer!.length - 10, pan: pan.pan.value, vol: pan.to!.gain.value, src };
};
/** Voices that started and were not stopped (the music is the loop). */
const playing = () => fake().sources.filter(s => !s.loop && s.started && !s.stopped).length;

const EYE: [number, number, number] = [10, 1.6, 10];
const unlocked = (yaw = 0): Audio => {
  install();
  const a = createAudio();
  a.unlock();
  a.listen(EYE, yaw);
  return a;
};
const at = (dx: number, dz: number): [number, number, number] => [EYE[0] + dx, EYE[1], EYE[2] + dz];

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('unlock', () => {
  it('resumes the context, renders every sound once and starts the music once', () => {
    install();
    const a = createAudio();
    a.unlock();
    a.unlock();
    const c = fake();
    expect(c.resumed).toBe(2);
    expect(c.buffers).toEqual([
      ...Object.values(SOUND).map(id => ({ length: 10 + id, rate: RATE })),
      { length: 5, rate: RATE },
    ]);
    const loops = c.sources.filter(s => s.loop);
    expect(loops).toHaveLength(1);
    expect(loops[0].started).toBe(1);
  });

  it('plays nothing before the first unlock', () => {
    install();
    const a = createAudio();
    a.play(SOUND.SHOT);
    expect(fake().sources).toHaveLength(0);
  });

  it('plays each sound with its own buffer', () => {
    const a = unlocked();
    for (const id of Object.values(SOUND)) {
      a.play(id);
      expect(voice().id).toBe(id);
    }
  });
});

describe('play', () => {
  it('pans a source to the right right and one to the left left', () => {
    const a = unlocked();
    a.play(SOUND.SHOT, at(5, 0));
    expect(voice().pan).toBeCloseTo(1);
    a.play(SOUND.SHOT, at(-5, 0));
    expect(voice().pan).toBeCloseTo(-1);
  });

  it('centres a source straight ahead or straight behind', () => {
    const a = unlocked();
    a.play(SOUND.SHOT, at(0, -5));
    expect(voice().pan).toBeCloseTo(0);
    a.play(SOUND.SHOT, at(0, 5));
    expect(voice().pan).toBeCloseTo(0);
  });

  it('follows the yaw: facing -x, -z is on the right and +z on the left', () => {
    const a = unlocked(Math.PI / 2);
    a.play(SOUND.SHOT, at(0, -5));
    expect(voice().pan).toBeCloseTo(1);
    a.play(SOUND.SHOT, at(0, 5));
    expect(voice().pan).toBeCloseTo(-1);
    a.play(SOUND.SHOT, at(-5, 0));
    expect(voice().pan).toBeCloseTo(0);
  });

  it('is fainter with distance and silent beyond the range', () => {
    const a = unlocked();
    a.play(SOUND.SHOT, at(2, 0));
    const near = voice().vol;
    a.play(SOUND.SHOT, at(20, 0));
    const far = voice().vol;
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);
    const n = fake().sources.length;
    a.play(SOUND.SHOT, at(41, 0));
    expect(fake().sources).toHaveLength(n);
  });

  it('plays without a position centred and at full volume', () => {
    const a = unlocked(1.3);
    a.play(SOUND.HIT);
    expect(voice()).toMatchObject({ pan: 0, vol: 1 });
  });

  it('scales the volume by the gain, with or without a position', () => {
    const a = unlocked();
    a.play(SOUND.HEART, undefined, 0.5);
    expect(voice().vol).toBe(0.5);
    a.play(SOUND.SHOT, at(2, 0));
    const full = voice().vol;
    a.play(SOUND.SHOT, at(2, 0), 0.5);
    expect(voice().vol).toBeCloseTo(full / 2);
  });

  it('keeps at most 24 voices: the quietest goes for a louder one, the newest if it is quietest', () => {
    const a = unlocked();
    for (let i = 0; i < 24; i++) {
      a.play(SOUND.SHOT, at(20, 0));
    }
    expect(playing()).toBe(24);
    const n = fake().sources.length;
    a.play(SOUND.SHOT, at(35, 0));
    expect(fake().sources).toHaveLength(n);
    a.play(SOUND.BOOM, at(1, 0));
    expect(playing()).toBe(24);
    expect(voice()).toMatchObject({ id: SOUND.BOOM, src: { started: 1 } });
  });

  it('frees a voice when its sound ends', () => {
    const a = unlocked();
    for (let i = 0; i < 24; i++) {
      a.play(SOUND.SHOT);
    }
    fake().sources.at(-1)!.onended!();
    a.play(SOUND.BOOM);
    expect(voice()).toMatchObject({ id: SOUND.BOOM, src: { started: 1 } });
    expect(fake().sources.filter(s => s.stopped)).toHaveLength(0);
  });
});

describe('mute', () => {
  it('ramps the master gain to 0 and back', () => {
    install();
    const a = createAudio();
    const ramp = fake().gains[0].gain.setTargetAtTime;
    a.mute(true);
    expect(a.muted).toBe(true);
    expect(ramp).toHaveBeenLastCalledWith(0, 3, expect.any(Number));
    a.mute(false);
    expect(a.muted).toBe(false);
    expect(ramp).toHaveBeenLastCalledWith(1, 3, expect.any(Number));
  });
});

describe('destroy', () => {
  it('closes the context', () => {
    const a = unlocked();
    a.destroy();
    expect(fake().closed).toBe(1);
  });
});

describe('without Web Audio', () => {
  const quiet = (a: Audio) => {
    expect(() => {
      a.unlock();
      a.listen([0, 0, 0], 0);
      a.play(SOUND.SHOT, [1, 0, 0]);
      a.destroy();
    }).not.toThrow();
    expect(a.muted).toBe(false);
    a.mute(true);
    expect(a.muted).toBe(true);
  };

  it('is a silent stub', () => {
    quiet(createAudio());
  });

  it('is a silent stub when the context cannot be built', () => {
    vi.stubGlobal(
      'AudioContext',
      class {
        constructor() {
          throw new Error('NotSupportedError');
        }
      },
    );
    quiet(createAudio());
  });
});

describe('hear', () => {
  const spy = () => {
    const play = vi.fn();
    return { play, a: { play } as unknown as Audio };
  };
  const ev = (type: number, id = 0) => ({ type, id, x: 1, y: 2, z: 3 });

  it('plays BOOM at a monster death and BURST at a bullet burst', () => {
    const { a, play } = spy();
    hear(a, ev(EVENT.DIE, 9), 0);
    expect(play).toHaveBeenLastCalledWith(SOUND.BOOM, [1, 2, 3]);
    hear(a, ev(EVENT.BOOM, 9), 0);
    expect(play).toHaveBeenLastCalledWith(SOUND.BURST, [1, 2, 3]);
  });

  it('plays HIT centred for the own player and at the point for the others', () => {
    const { a, play } = spy();
    hear(a, ev(EVENT.HURT, 4), 4);
    expect(play).toHaveBeenLastCalledWith(SOUND.HIT, undefined);
    hear(a, ev(EVENT.HURT, 5), 4);
    expect(play).toHaveBeenLastCalledWith(SOUND.HIT, [1, 2, 3]);
  });

  it('stays silent for a swing', () => {
    const { a, play } = spy();
    hear(a, ev(EVENT.SWING), 0);
    expect(play).not.toHaveBeenCalled();
  });
});

describe('createClock', () => {
  it('ticks once a second while on, and only then', () => {
    const play = vi.fn();
    const tick = createClock({ play } as unknown as Audio);
    tick(false, 0);
    tick(false, 5000);
    expect(play).not.toHaveBeenCalled();
    tick(true, 5000);
    tick(true, 5500);
    tick(true, 5999);
    expect(play).toHaveBeenCalledTimes(1);
    tick(true, 6000);
    expect(play).toHaveBeenCalledTimes(2);
    expect(play).toHaveBeenLastCalledWith(SOUND.CLOCK);
  });

  it('does not make up for a long gap with a burst', () => {
    const play = vi.fn();
    const tick = createClock({ play } as unknown as Audio);
    tick(true, 0);
    tick(true, 10_000);
    tick(true, 10_001);
    expect(play).toHaveBeenCalledTimes(2);
  });
});

describe('createHeart', () => {
  const setup = () => {
    const play = vi.fn();
    return { play, beat: createHeart({ play } as unknown as Audio) };
  };

  it('is silent above 3 health and at 0, and returns no beat', () => {
    const { play, beat } = setup();
    for (const hp of [9, 4, 0]) {
      expect(beat(hp, 0)).toBe(0);
      expect(beat(hp, 5000)).toBe(0);
    }
    expect(play).not.toHaveBeenCalled();
  });

  it('beats at once at 3 health, then every 0.8 s, softly', () => {
    const { play, beat } = setup();
    beat(3, 1000);
    expect(play).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenLastCalledWith(SOUND.HEART, undefined, 0.6);
    beat(3, 1799);
    expect(play).toHaveBeenCalledTimes(1);
    beat(3, 1800);
    expect(play).toHaveBeenCalledTimes(2);
    for (let t = 1800; t <= 4000; t += 16) {
      beat(2, t);
    }
    // 1000, 1800, 2600, 3400, 4200 is not yet.
    expect(play).toHaveBeenCalledTimes(4);
  });

  it('is faster and louder at 1 health', () => {
    const { play, beat } = setup();
    for (let t = 0; t < 2000; t += 16) {
      beat(1, t);
    }
    // Every 0.5 s: 0, 500, 1000, 1500 (and 2000 is not yet).
    expect(play).toHaveBeenCalledTimes(4);
    expect(play).toHaveBeenLastCalledWith(SOUND.HEART, undefined, 1);
  });

  it('speeds up when the health drops from 2 to 1 without waiting out the slow gap', () => {
    const { play, beat } = setup();
    beat(2, 0);
    beat(1, 500);
    expect(play).toHaveBeenCalledTimes(2);
  });

  it('stops on healing or death, and beats at once when low again', () => {
    const { play, beat } = setup();
    beat(2, 0);
    expect(beat(6, 100)).toBe(0);
    beat(6, 5000);
    expect(play).toHaveBeenCalledTimes(1);
    beat(2, 5100);
    expect(play).toHaveBeenCalledTimes(2);
    expect(beat(0, 5200)).toBe(0);
    beat(0, 9000);
    expect(play).toHaveBeenCalledTimes(2);
  });

  it('returns the beat for the screen: 1 at a thump, falling to 0 before the next', () => {
    const { beat } = setup();
    expect(beat(3, 0)).toBe(1);
    expect(beat(3, 400)).toBeCloseTo(0.5);
    expect(beat(3, 799)).toBeGreaterThan(0);
    expect(beat(3, 800)).toBe(1);
  });
});

describe('mute memory', () => {
  const stub = () => createAudio();

  it('remembers the choice', () => {
    const a = stub();
    expect(savedMute()).toBe(false);
    expect(toggleMute(a)).toBe(true);
    expect(savedMute()).toBe(true);
    expect(toggleMute(a)).toBe(false);
    expect(savedMute()).toBe(false);
  });

  it('survives storage that throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const a = stub();
    expect(savedMute()).toBe(false);
    expect(toggleMute(a)).toBe(true);
    vi.restoreAllMocks();
  });
});
