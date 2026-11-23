// Web Audio: the sounds of sfx.ts placed in 3D around the listener (HRTF, fainter with distance by
// the inverse law), their levels in dB, and the music loop.
import type { Vec3 } from './mesh';
import { LAYERS, LOOPED, MUSIC_RATE, RATE, music, render, seam } from './sfx';
import type { Voice } from './sfx';
import { CAST } from './voice/cast';
import { CLIPS } from './voice/clips';

/** A sound that plays on and on, started on its first set. */
export interface Loop {
  /** Volume (a fader, 0 silence and 1 its level) and speed (pitch) to move to, eased over a fraction of a second. */
  set(volume: number, rate: number): void;
}

export interface Audio {
  /**
   * Starts the AudioContext on a user gesture (browsers keep it suspended until one); the first
   * call also renders the sound buffers and starts the music. Later calls do nothing.
   */
  unlock(): void;
  /** Where the listener is and looks, each frame (yaw as a player's: 0 looks toward -z). */
  listen(eye: Vec3, yaw: number): void;
  /**
   * Plays the sound `id` (an index into the layers). With `at`, placed where it is round the
   * listener and fainter with distance; without, centred (the own player's sounds). `db` is added
   * to its level, `rate` is the speed and so the pitch; over the `radio` as speak() says a line.
   */
  play(id: number, at?: Vec3, db?: number, rate?: number, radio?: boolean): void;
  /**
   * Says the announcer's line `id` (LINE), centred, the music lowered under it. Lines wait their
   * turn, two at most and each once; none before the voice is decoded, a moment after unlock.
   */
  say(id: number): void;
  /**
   * Says clip `id` of the players' voices (CAST): placed and fainter with distance as play() with
   * `at`, centred without; over the `radio`, clipped and thin as through a cheap headset, a burst
   * of squelch before and after it and a hiss under it. False, and silent, until the voices are
   * decoded.
   */
  speak(id: number, at?: Vec3, db?: number, rate?: number, radio?: boolean): boolean;
  /** The sound `id` (one of LOOPED) as a loop, silent until its first set; the own player's, centred. */
  loop(id: number): Loop;
  /** Fades the music out (true) or back in (false), the other sounds untouched: the Hunter's visions. */
  hush(on: boolean): void;
  /** Mutes or unmutes everything, music included. */
  mute(on: boolean): void;
  readonly muted: boolean;
  /** Stops the music and closes the AudioContext. */
  destroy(): void;
}

/** Metres past which a sound is not played (the user, 2026-11-20: 80, from 40). */
const RANGE = 80;
/** Metres within which a placed sound is at its level: 6 dB less each time the distance doubles past it. */
const NEAR = 2;
/** A level in dB as a gain, and back. */
export const gain = (db: number) => 10 ** (db / 20);
export const db = (g: number) => 20 * Math.log10(g);
/** Sounds playing at once: past it the quietest goes. */
const VOICES = 24;
const MUSIC = 0.5;
/**
 * The mix (the user, 2026-11-20, by ear in the menu's Audio panel): a bus per group of sounds, its
 * level in dB, in LEVELS' order: voices (the announcer, the players' lines and cries), moves,
 * weapons, vehicles and the world, the helmet's breath, the game's events and pickups, then the
 * music. GROUP is each sound's bus, in SOUND order; LOUD a sound's own level over its bus, 0 dB
 * when absent. The game menu's Audio panel changes them for this browser (mix()).
 */
export const LEVELS = [-22.5, -25.5, -13.5, -10.5, -17.5, -17.5, -6];
const BAKED = [...LEVELS];
const MIXED = 'tiny-fps:mix';
export const LOUD: Record<number, number> = {};
export const GROUP =
  '111111111155552022225522222222222222222233344333333333005533002200120120002000' +
  '2222222222' +
  '244';
const level = (id: number) => LEVELS[+GROUP[id]] + (LOUD[id] ?? 0);
let mixed = () => {};
/** Sets bus `i` to `db` live, and keeps the mix for the next visit; none, the mix as made. */
export const mix = (i?: number, db = 0) => {
  if (i === undefined) {
    LEVELS.splice(0, 7, ...BAKED);
  } else {
    LEVELS[i] = db;
  }
  mixed();
  try {
    localStorage.setItem(MIXED, JSON.stringify(LEVELS));
  } catch {
    // Not kept.
  }
};
// The mix of the last visit. Storage throws when blocked, or is absent: the mix as made then.
try {
  const kept = JSON.parse(localStorage.getItem(MIXED)!) as number[] | null;
  if (kept?.length == 7) {
    LEVELS.splice(0, 7, ...kept);
  }
} catch {
  // As made.
}
const STORE = 'tiny-fps:muted';
/** The announcer's volume, and the music's share of its own under a line. */
const SPEECH = 0.9;
const DUCK = 0.35;
/** The radio's band, Hz: what a headset's speaker gives of a voice. */
const BAND = [500, 2800];
/** How hard the radio's amplifier clips a voice: its gain into the soft clip. */
const DRIVE = 8;
/** The soft clip's curve, tanh of the driven input, peak for peak. */
const CLIP = Float32Array.from({ length: 257 }, (_, i) => {
  const x = i / 128 - 1;
  return Math.tanh(DRIVE * x) / Math.tanh(DRIVE);
});
/** Seconds of squelch before a radio line and after it, its loudness and the hiss's under the line. */
const SQUELCH = [0.08, 0.14, 0.35, 0.06];

/**
 * The announcer's sprite (voice/clips.ts), each as base64 and loaded only when asked for: Ogg Opus,
 * then MP3 where the browser cannot decode the first (older Safari).
 */
export const SPRITES: (() => Promise<string>)[] = [
  () => import('./voice/opus').then(m => m.default),
  () => import('./voice/mp3').then(m => m.default),
];
/** The players' voices (voice/cast.ts), loaded the same way after the announcer's. */
export const VOICED: (() => Promise<string>)[] = [
  () => import('./voice/cast-opus').then(m => m.default),
  () => import('./voice/cast-mp3').then(m => m.default),
];

/** A silent Audio when the browser has no Web Audio. */
const silent = (): Audio => {
  let muted = false;
  return {
    unlock: () => {},
    listen: () => {},
    play: () => {},
    loop: () => ({ set: () => {} }),
    say: () => {},
    speak: () => false,
    hush: () => {},
    mute: on => {
      muted = on;
    },
    get muted() {
      return muted;
    },
    destroy: () => {},
  };
};

export const createAudio = (
  layers: Voice[][] = LAYERS,
  sprites = SPRITES,
  song = music,
  voiced = VOICED,
): Audio => {
  let ctx: AudioContext;
  try {
    ctx = new AudioContext();
  } catch {
    return silent();
  }
  const out = (to: AudioNode, volume = 1) => {
    const g = ctx.createGain();
    g.gain.value = volume;
    g.connect(to);
    return g;
  };
  const master = out(ctx.destination);
  const bed = out(master, MUSIC);
  /** Indexed by sound id; empty until unlock. */
  const bufs: AudioBuffer[] = [];
  let started = false;
  const voices = new Set<{ vol: number; src: AudioBufferSourceNode }>();
  let eye: Vec3 = [0, 0, 0];
  let yaw = 0;
  let muted = false;
  /** The announcer's sprite once decoded, the lines waiting, and whether one is being said. */
  let speech: AudioBuffer | undefined;
  const lines: number[] = [];
  let talking = false;
  /** The music faded out under a Hunter's vision (hush()). */
  let hushed = false;
  /** The players' voices once decoded, and the radio's noise, made on its first line. */
  let cast: AudioBuffer | undefined;
  let noise: AudioBuffer | undefined;

  /** The first of `formats` the browser decodes; none if it decodes none. */
  const decode = async (formats: (() => Promise<string>)[]) => {
    for (const load of formats) {
      try {
        const bytes = Uint8Array.from(atob(await load()), c => c.charCodeAt(0));
        return await ctx.decodeAudioData(bytes.buffer);
      } catch {
        // The next format.
      }
    }
  };
  mixed = () =>
    bed.gain.setTargetAtTime(
      hushed ? 0 : (talking ? MUSIC * DUCK : MUSIC) * gain(LEVELS[6]),
      ctx.currentTime,
      hushed ? 0.3 : 0.15,
    );
  mixed();
  const next = () => {
    const id = lines.shift();
    talking = id !== undefined && !!speech;
    mixed();
    if (talking) {
      const src = source(speech!);
      src.connect(out(master, SPEECH * gain(LEVELS[0])));
      src.onended = next;
      src.start(0, ...CLIPS[id!]);
    }
  };

  const buffer = (samples: Float32Array, rate = RATE) => {
    const b = ctx.createBuffer(1, samples.length, rate);
    b.getChannelData(0).set(samples);
    return b;
  };
  const source = (b: AudioBuffer) => {
    const src = ctx.createBufferSource();
    src.buffer = b;
    return src;
  };

  /** Buffer `b` (from `clip`'s start for its length) at `level` dB as play() places it; false when unheard. */
  const emit = (
    b: AudioBuffer | undefined,
    at: Vec3 | undefined,
    level: number,
    rate: number,
    clip?: readonly [number, number],
    radio = false,
  ): boolean => {
    const loud = gain(level);
    /** What reaches the listener, for the voices' priority: the panner's own fall with distance. */
    let vol = loud;
    let p: PannerNode | undefined;
    if (at) {
      const [dx, dy, dz] = at.map((v, i) => v - eye[i]);
      const d = Math.hypot(dx, dy, dz);
      if (d > RANGE) {
        return false;
      }
      vol *= NEAR / Math.max(d, NEAR);
      // Placed round a listener at the origin looking down -z: its right (cos yaw, -sin yaw) on x,
      // its ahead (-sin yaw, -cos yaw) on -z.
      const [c, s] = [Math.cos(yaw), Math.sin(yaw)];
      p = ctx.createPanner();
      p.panningModel = 'HRTF';
      p.refDistance = NEAR;
      p.maxDistance = RANGE;
      p.setPosition(dx * c - dz * s, dy, dx * s + dz * c);
    }
    if (!b || !vol) {
      return false;
    }
    if (voices.size >= VOICES) {
      const q = [...voices].reduce((a, v) => (v.vol < a.vol ? v : a));
      if (q.vol >= vol) {
        return false;
      }
      q.src.stop();
      voices.delete(q);
    }
    const src = source(b);
    src.playbackRate.value = rate;
    let head: AudioNode = src;
    /** When the voice starts: after the squelch over the radio. */
    let at0 = 0;
    if (radio) {
      const shaper = ctx.createWaveShaper();
      shaper.curve = CLIP;
      head = head.connect(shaper);
      for (const [type, hz] of [
        ['highpass', BAND[0]],
        ['lowpass', BAND[1]],
      ] as const) {
        const f = ctx.createBiquadFilter();
        f.type = type;
        f.frequency.value = hz;
        head = head.connect(f);
      }
      // The squelch and the hiss: white noise through the same amplifier, loud at the two ends.
      const [pre, post, loud, low] = SQUELCH;
      const t = ctx.currentTime;
      const len = (clip?.[1] ?? b.duration) / rate;
      const n = source(
        (noise ??= buffer(Float32Array.from({ length: RATE / 2 }, () => Math.random() * 2 - 1))),
      );
      n.loop = true;
      const g = out(shaper, loud);
      g.gain.setValueAtTime(low, t + pre);
      g.gain.setValueAtTime(loud, t + pre + len);
      n.connect(g);
      n.start(t);
      n.stop(t + pre + len + post);
      at0 = t + pre;
    }
    (p ? head.connect(p) : head).connect(out(master, loud));
    const v = { vol, src };
    voices.add(v);
    src.onended = () => voices.delete(v);
    if (clip) {
      src.start(at0, ...clip);
    } else if (radio) {
      src.start(at0);
    } else {
      src.start();
    }
    return true;
  };

  return {
    unlock() {
      ctx.resume().catch(() => {});
      if (!started) {
        started = true;
        layers.forEach((_, id) => {
          const s = render(id, layers);
          bufs[id] = buffer(LOOPED.includes(id) ? seam(s) : s);
        });
        const m = source(buffer(song(), MUSIC_RATE));
        m.loop = true;
        m.connect(bed);
        m.start();
        void decode(sprites)
          .then(b => (speech = b))
          .then(() => decode(voiced))
          .then(b => (cast = b));
      }
    },
    listen(at, y) {
      [eye, yaw] = [at, y];
    },
    play(id, at, db = 0, rate = 1, radio = false) {
      emit(bufs[id], at, db + level(id), rate, undefined, radio);
    },
    say(id) {
      if (speech && lines.length < 2 && !lines.includes(id)) {
        lines.push(id);
        if (!talking) {
          next();
        }
      }
    },
    speak(id, at, db = 0, rate = 1, radio = false) {
      return !!cast && emit(cast, at, db + LEVELS[0], rate, CAST[id], radio);
    },
    loop(id) {
      let src: AudioBufferSourceNode | undefined;
      let g: GainNode;
      return {
        set(volume, rate) {
          if (!src && bufs[id]) {
            src = source(bufs[id]);
            src.loop = true;
            src.connect((g = out(master, 0)));
            src.start();
          }
          if (src) {
            g.gain.setTargetAtTime(volume * gain(level(id)), ctx.currentTime, 0.08);
            src.playbackRate.setTargetAtTime(rate, ctx.currentTime, 0.08);
          }
        },
      };
    },
    hush(on) {
      if (on != hushed) {
        hushed = on;
        mixed();
      }
    },
    mute(on) {
      muted = on;
      master.gain.setTargetAtTime(on ? 0 : 1, ctx.currentTime, 0.05);
    },
    get muted() {
      return muted;
    },
    destroy: () => void ctx.close().catch(() => {}),
  };
};

/** The mute choice of the last visit. Storage throws when blocked: no memory then. */
export const savedMute = (): boolean => {
  try {
    return localStorage.getItem(STORE) == '1';
  } catch {
    return false;
  }
};

/** Flips mute, remembers it, and returns the new state. */
export const toggleMute = (a: Audio): boolean => {
  a.mute(!a.muted);
  try {
    localStorage.setItem(STORE, a.muted ? '1' : '0');
  } catch {
    // Not remembered.
  }
  return a.muted;
};
