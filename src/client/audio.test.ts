// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAudio, savedMute, toggleMute } from './audio';
import type { Audio } from './audio';
import { MUSIC_RATE, RATE } from './sfx';
import type { Voice } from './sfx';

/** Two sounds, named here: the game has none yet. */
const SOUND = { HIT: 0, HEART: 1 } as const;
const LAYERS: Voice[][] = [[], []];

// Each rendered buffer is as long as its sound id says: a played source names its sound.
vi.mock('./sfx', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  render: (id: number) => new Float32Array(10 + id),
  music: () => new Float32Array(5),
  seam: (s: Float32Array) => new Float32Array(s.length - 5),
}));

interface Node {
  to?: Node;
  gain: { value: number; setTargetAtTime: ReturnType<typeof vi.fn> };
  pan: { value: number };
  playbackRate: { value: number; setTargetAtTime: ReturnType<typeof vi.fn> };
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
      playbackRate: { value: 1, setTargetAtTime: vi.fn() },
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
  const a = createAudio(LAYERS);
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
    const a = createAudio(LAYERS);
    a.unlock();
    a.unlock();
    const c = fake();
    expect(c.resumed).toBe(2);
    expect(c.buffers).toEqual([
      ...Object.values(SOUND).map(id => ({ length: 10 + id, rate: RATE })),
      { length: 5, rate: MUSIC_RATE },
    ]);
    const loops = c.sources.filter(s => s.loop);
    expect(loops).toHaveLength(1);
    expect(loops[0].started).toBe(1);
  });

  it('plays nothing before the first unlock', () => {
    install();
    const a = createAudio(LAYERS);
    a.play(SOUND.HIT);
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
    a.play(SOUND.HIT, at(5, 0));
    expect(voice().pan).toBeCloseTo(1);
    a.play(SOUND.HIT, at(-5, 0));
    expect(voice().pan).toBeCloseTo(-1);
  });

  it('centres a source straight ahead or straight behind', () => {
    const a = unlocked();
    a.play(SOUND.HIT, at(0, -5));
    expect(voice().pan).toBeCloseTo(0);
    a.play(SOUND.HIT, at(0, 5));
    expect(voice().pan).toBeCloseTo(0);
  });

  it('follows the yaw: facing -x, -z is on the right and +z on the left', () => {
    const a = unlocked(Math.PI / 2);
    a.play(SOUND.HIT, at(0, -5));
    expect(voice().pan).toBeCloseTo(1);
    a.play(SOUND.HIT, at(0, 5));
    expect(voice().pan).toBeCloseTo(-1);
    a.play(SOUND.HIT, at(-5, 0));
    expect(voice().pan).toBeCloseTo(0);
  });

  it('is fainter with distance and silent beyond the range', () => {
    const a = unlocked();
    a.play(SOUND.HIT, at(2, 0));
    const near = voice().vol;
    a.play(SOUND.HIT, at(20, 0));
    const far = voice().vol;
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);
    const n = fake().sources.length;
    a.play(SOUND.HIT, at(41, 0));
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
    a.play(SOUND.HIT, at(2, 0));
    const full = voice().vol;
    a.play(SOUND.HIT, at(2, 0), 0.5);
    expect(voice().vol).toBeCloseTo(full / 2);
  });

  it('plays at the rate asked, 1 by default', () => {
    const a = unlocked();
    a.play(SOUND.HIT);
    expect(voice().src.playbackRate.value).toBe(1);
    a.play(SOUND.HIT, undefined, 1, 0.75);
    expect(voice().src.playbackRate.value).toBe(0.75);
  });

  it('keeps at most 24 voices: the quietest goes for a louder one, the newest if it is quietest', () => {
    const a = unlocked();
    for (let i = 0; i < 24; i++) {
      a.play(SOUND.HIT, at(20, 0));
    }
    expect(playing()).toBe(24);
    const n = fake().sources.length;
    a.play(SOUND.HIT, at(35, 0));
    expect(fake().sources).toHaveLength(n);
    a.play(SOUND.HEART, at(1, 0));
    expect(playing()).toBe(24);
    expect(voice()).toMatchObject({ id: SOUND.HEART, src: { started: 1 } });
  });

  it('frees a voice when its sound ends', () => {
    const a = unlocked();
    for (let i = 0; i < 24; i++) {
      a.play(SOUND.HIT);
    }
    fake().sources.at(-1)!.onended!();
    a.play(SOUND.HEART);
    expect(voice()).toMatchObject({ id: SOUND.HEART, src: { started: 1 } });
    expect(fake().sources.filter(s => s.stopped)).toHaveLength(0);
  });
});

describe('loop', () => {
  /** The loops started: looping sources but the music (the first), with their gain node. */
  const loops = () =>
    fake()
      .sources.filter(s => s.loop)
      .slice(1);

  it('starts on its first set after the unlock, once, and eases to the volume and rate', () => {
    install();
    const a = createAudio(LAYERS);
    const l = a.loop(SOUND.HEART);
    l.set(0.5, 1.2);
    expect(fake().sources).toHaveLength(0);
    a.unlock();
    expect(loops()).toHaveLength(0);
    l.set(0.5, 1.2);
    l.set(0.2, 0.8);
    expect(loops()).toHaveLength(1);
    const [src] = loops();
    expect(src).toMatchObject({ started: 1, buffer: { length: 10 + SOUND.HEART } });
    expect(src.to!.gain.setTargetAtTime).toHaveBeenLastCalledWith(0.2, 3, expect.any(Number));
    expect(src.to!.gain.value).toBe(0);
    expect(src.playbackRate.setTargetAtTime).toHaveBeenLastCalledWith(0.8, 3, expect.any(Number));
    expect(src.playbackRate.setTargetAtTime).toHaveBeenCalledTimes(2);
  });

  it('goes through the master gain, so mute silences it', () => {
    const a = unlocked();
    a.loop(SOUND.HIT).set(1, 1);
    expect(loops()[0].to!.to).toBe(fake().gains[0]);
  });

  it('seams the sounds that loop, and only them', () => {
    install();
    createAudio(Array.from({ length: 10 }, () => [])).unlock();
    const lengths = fake().buffers.map(b => b.length);
    expect(lengths.slice(0, 10)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 13, 14]);
  });
});

describe('mute', () => {
  it('ramps the master gain to 0 and back', () => {
    install();
    const a = createAudio(LAYERS);
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
      a.play(SOUND.HIT, [1, 0, 0]);
      a.loop(SOUND.HIT).set(1, 1);
      a.destroy();
    }).not.toThrow();
    expect(a.muted).toBe(false);
    a.mute(true);
    expect(a.muted).toBe(true);
  };

  it('is a silent stub', () => {
    quiet(createAudio(LAYERS));
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
    quiet(createAudio(LAYERS));
  });
});

describe('mute memory', () => {
  const stub = () => createAudio(LAYERS);

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
