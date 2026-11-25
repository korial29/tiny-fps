// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GROUP,
  LEVELS,
  SPRITES,
  db,
  gain,
  VOICED,
  createAudio,
  savedMute,
  toggleMute,
} from './audio';
import type { Audio } from './audio';
import { LAYERS as SOUNDS, MUSIC_RATE, RATE, SOUND as IDS } from './sfx';
import { CAST } from './voice/cast';
import { CLIPS, LINE } from './voice/clips';
import type { Air, Voice } from './sfx';

/** Two sounds, named here: the game has none yet. */
const SOUND = { HIT: 0, HEART: 1 } as const;
const LAYERS: Voice[][] = [[], []];

// Each rendered buffer is as long as its sound id says: a played source names its sound.
vi.mock('./sfx', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  render: (id: number) => new Float32Array(10 + id),
  music: () => new Float32Array(5),
  anthem: () => new Float32Array(6),
  seam: (s: Float32Array) => new Float32Array(s.length - 5),
}));

interface Node {
  to?: Node;
  gain: {
    value: number;
    setTargetAtTime: ReturnType<typeof vi.fn>;
    setValueAtTime: ReturnType<typeof vi.fn>;
  };
  pan: { value: number };
  /** A panner's place round the listener, and its model. */
  pos?: number[];
  panningModel?: string;
  refDistance?: number;
  maxDistance?: number;
  playbackRate: { value: number; setTargetAtTime: ReturnType<typeof vi.fn> };
  buffer?: { length: number };
  loop?: boolean;
  started: number;
  /** The arguments of the last start: when, and for a line its offset and length. */
  args?: number[];
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
      gain: { value: 1, setTargetAtTime: vi.fn(), setValueAtTime: vi.fn() },
      pan: { value: 0 },
      playbackRate: { value: 1, setTargetAtTime: vi.fn() },
      started: 0,
      stopped: 0,
    };
    return Object.assign(n, {
      connect: (to: Node) => (n.to = to),
      start: (...args: number[]) => (n.started++, (n.args = args)),
      stop: () => n.stopped++,
    });
  }
  createGain() {
    const n = this.node();
    this.gains.push(n);
    return n;
  }
  createStereoPanner = () => this.node();
  createPanner = () =>
    Object.assign(this.node(), {
      setPosition(this: Node, ...pos: number[]) {
        this.pos = pos;
      },
    });
  createBiquadFilter = () => Object.assign(this.node(), { type: '', frequency: { value: 0 } });
  createWaveShaper = () => Object.assign(this.node(), { curve: null as Float32Array | null });
  createBufferSource() {
    const n = this.node();
    this.sources.push(n);
    return n;
  }
  createBuffer(_: number, length: number, rate: number) {
    this.buffers.push({ length, rate });
    return { length, getChannelData: () => ({ set: () => {} }) };
  }
  /** Decodes a sprite whose text is 'ok' (as base64) and fails any other. */
  decodeAudioData = (b: ArrayBuffer) =>
    new TextDecoder().decode(b) == 'ok'
      ? Promise.resolve({ length: 999 })
      : Promise.reject(new Error('no'));
  resume = () => (this.resumed++, Promise.resolve());
  close = () => (this.closed++, Promise.resolve());
}

const fake = () => FakeContext.all.at(-1)!;
const install = () => {
  FakeContext.all = [];
  vi.stubGlobal('AudioContext', FakeContext);
};
/**
 * The last voice played: its sound id, its place round the listener (none centred), the panner and
 * its level, read down its source > panner (when placed) > gain.
 */
const voice = () => {
  const src = fake().sources.at(-1)!;
  const panner = src.to!.pos ? src.to! : undefined;
  const pos = panner?.pos?.map(v => v + 0);
  return { id: src.buffer!.length - 10, pos, panner, vol: (panner ?? src).to!.gain.value, src };
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

/** The baked mix; the tests play at 0 dB unless they read it. */
const MIX = [...LEVELS];
beforeEach(() => LEVELS.fill(0));
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  LEVELS.splice(0, LEVELS.length, ...MIX);
});

describe('the mix', () => {
  it('is the user\u2019s, set by ear in the menu', () => {
    expect(MIX).toEqual([-22.5, -25.5, -13.5, -10.5, -17.5, -17.5, -6]);
  });

  it('gives every sound one of the groups, the dash among the moves', () => {
    expect(GROUP).toHaveLength(SOUNDS.length);
    expect(GROUP).toMatch(/^[0-5]+$/);
    expect(GROUP[IDS.DASH]).toBe('1');
    expect(GROUP[IDS.INHALE]).toBe('4');
  });

  it('scales a sound by its group and the music by its own', () => {
    LEVELS.splice(0, LEVELS.length, ...MIX);
    const a = unlocked();
    a.play(SOUND.HIT);
    expect(voice().vol).toBeCloseTo(gain(-25.5), 5);
    // The map's music on the second gain, the menus' theme on the third: the theme first.
    const [bed, title] = fake().gains.slice(1, 3);
    const music = [expect.closeTo(0.5 * gain(-6), 5), 3, expect.any(Number)];
    expect(title.gain.setTargetAtTime).toHaveBeenLastCalledWith(...music);
    expect(bed.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 3, expect.any(Number));
    a.menu(false);
    expect(bed.gain.setTargetAtTime).toHaveBeenLastCalledWith(...music);
    expect(title.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 3, 0.4);
  });
});

describe('unlock', () => {
  it('resumes the context, renders every sound once and starts the menus\u2019 theme once', () => {
    install();
    const a = createAudio(LAYERS);
    a.unlock();
    a.unlock();
    const c = fake();
    expect(c.resumed).toBe(2);
    expect(c.buffers).toEqual([
      ...Object.values(SOUND).map(id => ({ length: 10 + id, rate: RATE })),
      { length: 6, rate: MUSIC_RATE },
    ]);
    const loops = c.sources.filter(s => s.loop);
    expect(loops).toHaveLength(1);
    expect(loops[0].started).toBe(1);
  });

  it('renders the map\u2019s music on leaving the menu, once', () => {
    install();
    const a = createAudio(LAYERS);
    a.unlock();
    for (const on of [false, true, false]) {
      a.menu(on);
    }
    expect(
      fake()
        .buffers.filter(b => b.rate == MUSIC_RATE)
        .map(b => b.length),
    ).toEqual([6, 5]);
    expect(fake().sources.filter(s => s.loop)).toHaveLength(2);
  });

  it('starts the map\u2019s music at unlock when the game came first', () => {
    install();
    const a = createAudio(LAYERS);
    a.menu(false);
    expect(fake().buffers).toHaveLength(0);
    a.unlock();
    expect(
      fake()
        .buffers.filter(b => b.rate == MUSIC_RATE)
        .map(b => b.length),
    ).toEqual([6, 5]);
  });

  it('loops the song it is given: a map\u2019s own music', () => {
    install();
    const a = createAudio(LAYERS, SPRITES, () => new Float32Array(7));
    a.unlock();
    a.menu(false);
    expect(fake().buffers.at(-1)).toEqual({ length: 7, rate: MUSIC_RATE });
    expect(fake().sources.filter(s => s.loop)).toHaveLength(2);
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
  it('places a source round the listener: right, left, ahead (-z) and behind', () => {
    const a = unlocked();
    for (const [dx, dz, pos] of [
      [5, 0, [5, 0, 0]],
      [-5, 0, [-5, 0, 0]],
      [0, -5, [0, 0, -5]],
      [0, 5, [0, 0, 5]],
    ] as const) {
      a.play(SOUND.HIT, at(dx, dz));
      voice().pos!.forEach((v, i) => expect(v).toBeCloseTo(pos[i]));
    }
  });

  it('follows the yaw: facing -x, -z is on the right, +z on the left and -x ahead', () => {
    const a = unlocked(Math.PI / 2);
    for (const [dx, dz, pos] of [
      [0, -5, [5, 0, 0]],
      [0, 5, [-5, 0, 0]],
      [-5, 0, [0, 0, -5]],
    ] as const) {
      a.play(SOUND.HIT, at(dx, dz));
      voice().pos!.forEach((v, i) => expect(v).toBeCloseTo(pos[i]));
    }
  });

  it('fades by the inverse law past 2 m through an HRTF panner, and is not played past 80 m', () => {
    const a = unlocked();
    a.play(SOUND.HIT, at(20, 0));
    expect(voice().panner).toMatchObject({ panningModel: 'HRTF', refDistance: 2, maxDistance: 80 });
    const n = fake().sources.length;
    a.play(SOUND.HIT, at(79, 0));
    expect(fake().sources).toHaveLength(n + 1);
    a.play(SOUND.HIT, at(81, 0));
    expect(fake().sources).toHaveLength(n + 1);
  });

  it('plays without a position centred, with no panner, at its level', () => {
    const a = unlocked(1.3);
    a.play(SOUND.HIT);
    expect(voice()).toMatchObject({ pos: undefined, vol: 1 });
  });

  it('adds the dB asked to the level, with or without a position', () => {
    const a = unlocked();
    a.play(SOUND.HEART, undefined, -6);
    expect(voice().vol).toBeCloseTo(0.5, 2);
    a.play(SOUND.HIT, at(2, 0), 6);
    expect(voice().vol).toBeCloseTo(2, 1);
  });

  it('turns dB into gains and back', () => {
    expect(gain(-20)).toBeCloseTo(0.1);
    expect(db(0.5)).toBeCloseTo(-6.02);
    expect(gain(db(0.3))).toBeCloseTo(0.3);
  });

  it('plays at the rate asked, 1 by default', () => {
    const a = unlocked();
    a.play(SOUND.HIT);
    expect(voice().src.playbackRate.value).toBe(1);
    a.play(SOUND.HIT, undefined, 0, 0.75);
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

describe('a map\u2019s ambience', () => {
  /** Two beds of 21 and 22 samples: the first as loud as the listener's x, the second silent. */
  const air = (): Air => ({
    beds: [() => new Float32Array(21), () => new Float32Array(22)],
    mix: vi.fn((eye: readonly number[], _t: number, out: number[]) => {
      out[0] = eye[0] / 100;
      out[1] = 0;
    }),
    cry: [[2, 440, 0, 0.01, 0, 0.1, 0, 1, 0, 1, 0.5]],
    from: (u, v) => [EYE[0] + 20 * u, EYE[1], EYE[2] - 20 - v],
  });
  const beds = () => fake().sources.filter(s => s.loop && s.buffer!.length > 20);
  const start = (a: Air) => {
    install();
    const audio = createAudio(LAYERS, undefined, undefined, undefined, undefined, a);
    audio.listen(EYE, 0);
    expect(a.mix).not.toHaveBeenCalled();
    audio.unlock();
    return audio;
  };

  it('renders the beds and the cry at the unlock, and loops the beds from the first frame after it, on the world\u2019s bus', () => {
    LEVELS[3] = -6;
    const audio = start(air());
    expect(fake().buffers.slice(2, 5)).toEqual([
      { length: 21, rate: MUSIC_RATE },
      { length: 22, rate: MUSIC_RATE },
      { length: 10, rate: RATE },
    ]);
    expect(beds()).toHaveLength(0);
    audio.listen(EYE, 0);
    audio.listen(EYE, 0);
    expect(beds().map(s => s.buffer!.length)).toEqual([21, 22]);
    const [g] = beds().map(s => s.to!);
    expect(g.to).toBe(fake().gains[0]);
    expect(g.gain.setTargetAtTime).toHaveBeenLastCalledWith(
      expect.closeTo(0.1 * gain(-6)),
      3,
      expect.any(Number),
    );
  });

  it('sets a bed again only once its volume has moved by a hundredth', () => {
    const audio = start(air());
    audio.listen(EYE, 0);
    const set = beds()[0].to!.gain.setTargetAtTime;
    audio.listen([EYE[0] + 0.5, EYE[1], EYE[2]], 0);
    expect(set).toHaveBeenCalledTimes(1);
    audio.listen([EYE[0] + 30, EYE[1], EYE[2]], 0);
    expect(set).toHaveBeenCalledTimes(2);
    expect(set).toHaveBeenLastCalledWith(expect.closeTo(0.4), 3, expect.any(Number));
  });

  it('cries from afar now and then: placed, not at once, and again later', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const audio = start(air());
    audio.listen(EYE, 0);
    const cries = () => fake().sources.filter(s => !s.loop && s.to!.pos);
    expect(cries()).toHaveLength(0);
    audio.listen(EYE, 0);
    expect(cries()).toHaveLength(0);
    // 5 s and half of 9 more.
    fake().currentTime = 3 + 9.6;
    audio.listen(EYE, 0);
    expect(cries()).toHaveLength(1);
    expect(cries()[0].to!.pos).toEqual([10, 0, -20.5]);
    expect(cries()[0].playbackRate.value).toBe(1);
    audio.listen(EYE, 0);
    expect(cries()).toHaveLength(1);
    fake().currentTime += 9.6;
    audio.listen(EYE, 0);
    expect(cries()).toHaveLength(2);
    vi.restoreAllMocks();
  });

  it('has none without one: nothing looped by listen()', () => {
    const audio = unlocked();
    audio.listen(EYE, 0);
    expect(fake().sources.filter(s => s.loop)).toHaveLength(1);
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

describe('say', () => {
  /** An unlocked Audio whose sprites are these texts, once the voice is decoded. */
  const speaking = async (...sprites: string[]) => {
    install();
    const a = createAudio(
      LAYERS,
      sprites.map(t => () => Promise.resolve(btoa(t))),
    );
    a.unlock();
    await vi.waitFor(() => {
      a.say(LINE.START);
      expect(lines()).toHaveLength(1);
    });
    return a;
  };
  /** The sources started from the voice's sprite. */
  const lines = () => fake().sources.filter(s => s.buffer?.length == 999);
  const bed = () => fake().sources.find(s => s.loop)!.to!;

  it('says nothing before the voice is decoded', () => {
    install();
    const a = createAudio(LAYERS, [() => new Promise(() => {})]);
    a.unlock();
    a.say(LINE.WIN);
    expect(fake().sources.filter(s => !s.loop)).toHaveLength(0);
  });

  it('plays the line from its place in the sprite, the music lowered under it', async () => {
    await speaking('ok');
    expect(lines()[0].args).toEqual([0, ...CLIPS[LINE.START]]);
    expect(bed().gain.setTargetAtTime).toHaveBeenLastCalledWith(expect.closeTo(0.175), 3, 0.15);
    lines()[0].onended!();
    expect(bed().gain.setTargetAtTime).toHaveBeenLastCalledWith(0.5, 3, 0.15);
  });

  it('falls back on the next sprite when the browser cannot decode one', async () => {
    await speaking('opus?', 'ok');
    expect(lines()).toHaveLength(1);
  });

  it('keeps two lines waiting at most, each once, and says them in turn', async () => {
    const a = await speaking('ok');
    for (const id of [LINE.WIN, LINE.WIN, LINE.AIM, LINE.GODLIKE]) {
      a.say(id);
    }
    expect(lines()).toHaveLength(1);
    lines()[0].onended!();
    lines()[1].onended!();
    expect(lines().map(s => s.args![1])).toEqual(
      [LINE.START, LINE.WIN, LINE.AIM].map(id => CLIPS[id][0]),
    );
    lines()[2].onended!();
    expect(lines()).toHaveLength(3);
  });

  it('says and speaks nothing without sprites (TinyFpsOptions.voices false), sounds still play', async () => {
    install();
    const a = createAudio(LAYERS, [], undefined, []);
    a.unlock();
    a.listen(EYE, 0);
    await Promise.resolve();
    a.say(LINE.WIN);
    expect(a.speak(0)).toBe(false);
    expect(fake().sources.filter(s => !s.loop)).toHaveLength(0);
    a.play(SOUND.HIT);
    expect(fake().sources.filter(s => !s.loop)).toHaveLength(1);
  });

  it('loads the Opus sprite first', async () => {
    expect(atob(await SPRITES[0]()).slice(0, 4)).toBe('OggS');
  });
});

describe('speak', () => {
  /** An unlocked Audio whose players' voices are this text, once decoded, and their sources. */
  const voiced = async (text = 'ok') => {
    install();
    const a = createAudio(LAYERS, [() => Promise.resolve(btoa('ok'))], undefined, [
      () => Promise.resolve(btoa(text)),
    ]);
    a.unlock();
    a.listen(EYE, 0);
    await vi.waitFor(() => expect(a.speak(0)).toBe(true));
    return a;
  };
  const clips = () => fake().sources.filter(s => s.buffer?.length == 999 && s.args?.length == 3);

  it('says nothing before the voices are decoded', () => {
    install();
    const a = createAudio(LAYERS, SPRITES, undefined, [() => new Promise(() => {})]);
    a.unlock();
    expect(a.speak(3)).toBe(false);
    expect(fake().sources.filter(s => !s.loop)).toHaveLength(0);
  });

  it('plays the clip from its place in the sprite, placed as a sound and at its pace', async () => {
    const a = await voiced();
    expect(a.speak(5, at(4, 0), 0, 1.05)).toBe(true);
    const s = clips().at(-1)!;
    expect(s.args).toEqual([0, ...CAST[5]]);
    expect(s.playbackRate.value).toBe(1.05);
    // Placed to the right, through the panner that fades it with distance.
    expect(s.to!.pos![0]).toBeCloseTo(4);
    // Out of range: unheard.
    expect(a.speak(5, at(100, 0))).toBe(false);
  });

  it('clips a line over the radio and thins it through a headset\u2019s band, centred, after a squelch', async () => {
    const a = await voiced();
    expect(a.speak(2, undefined, -3, 1, true)).toBe(true);
    type Filter = Node & { type: string; frequency: { value: number } };
    const line = clips().at(-1)!;
    const shaper = line.to as Node & { curve: Float32Array };
    // A soft clip: full scale at the ends, a quarter of it driven near the top.
    expect([shaper.curve[0], shaper.curve.at(-1)]).toEqual([-1, 1]);
    expect(shaper.curve[160]).toBeGreaterThan(0.9);
    const hp = shaper.to as Filter;
    const lp = hp.to as Filter;
    expect([hp.type, lp.type]).toEqual(['highpass', 'lowpass']);
    expect(hp.frequency.value).toBeLessThan(lp.frequency.value);
    expect(lp.to!.pos).toBeUndefined();
    expect(lp.to!.gain.value).toBeCloseTo(gain(-3));
    // The noise into the same amplifier: loud, low under the line, loud again, then stopped.
    const noise = fake().sources.find(s => s.loop && s.to?.to === shaper)!;
    const g = noise.to!.gain;
    expect(g.setValueAtTime.mock.calls.map(c => c[0] < g.value)).toEqual([true, false]);
    expect(noise.args).toEqual([3]);
    expect(line.args![0]).toBeGreaterThan(3);
    expect(noise.stopped).toBe(1);
  });

  it('plays a sound over the radio as it says a line: clipped, thinned, after a squelch', () => {
    const a = unlocked();
    a.play(SOUND.HIT, undefined, -3, 1, true);
    const roar = fake()
      .sources.filter(s => !s.loop)
      .at(-1)!;
    const shaper = roar.to as Node & { curve: Float32Array };
    expect(shaper.curve).toBeDefined();
    expect((shaper.to as Node & { type: string }).type).toBe('highpass');
    expect(roar.args![0]).toBeGreaterThan(0);
    expect(fake().sources.some(s => s.loop && s.to?.to === shaper)).toBe(true);
  });

  it('loads the Opus voices first', async () => {
    expect(atob(await VOICED[0]()).slice(0, 4)).toBe('OggS');
  });
});
