// Web Audio: the sounds of sfx.ts placed in stereo around the listener, and the music loop.
import type { Vec3 } from './mesh';
import { LAYERS, LOOPED, MUSIC_RATE, RATE, music, render, seam } from './sfx';
import type { Voice } from './sfx';
import { CLIPS } from './voice/clips';

/** A sound that plays on and on, started on its first set. */
export interface Loop {
  /** Volume and speed (pitch) to move to, eased over a fraction of a second: 0 is silence. */
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
   * Plays the sound `id` (an index into the layers). With `at`, panned left or right by its direction from the listener and
   * fainter with distance; without, centred (the own player's sounds). `gain` scales the volume,
   * `rate` the speed and so the pitch.
   */
  play(id: number, at?: Vec3, gain?: number, rate?: number): void;
  /**
   * Says the announcer's line `id` (LINE), centred, the music lowered under it. Lines wait their
   * turn, two at most and each once; none before the voice is decoded, a moment after unlock.
   */
  say(id: number): void;
  /** The sound `id` (one of LOOPED) as a loop, silent until its first set; the own player's, centred. */
  loop(id: number): Loop;
  /** Mutes or unmutes everything, music included. */
  mute(on: boolean): void;
  readonly muted: boolean;
  /** Stops the music and closes the AudioContext. */
  destroy(): void;
}

/** Metres past which a sound is silent. */
const RANGE = 40;
/** Sounds playing at once: past it the quietest goes. */
const VOICES = 24;
const MUSIC = 0.5;
const STORE = 'tiny-fps:muted';
/** The announcer's volume, and the music's share of its own under a line. */
const SPEECH = 0.9;
const DUCK = 0.35;

/**
 * The announcer's sprite (voice/clips.ts), each as base64 and loaded only when asked for: Ogg Opus,
 * then MP3 where the browser cannot decode the first (older Safari).
 */
export const SPRITES: (() => Promise<string>)[] = [
  () => import('./voice/opus').then(m => m.default),
  () => import('./voice/mp3').then(m => m.default),
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
    mute: on => {
      muted = on;
    },
    get muted() {
      return muted;
    },
    destroy: () => {},
  };
};

export const createAudio = (layers: Voice[][] = LAYERS, sprites = SPRITES): Audio => {
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

  /** The first sprite the browser decodes; none if it decodes neither. */
  const decode = async () => {
    for (const load of sprites) {
      try {
        const bytes = Uint8Array.from(atob(await load()), c => c.charCodeAt(0));
        return (speech = await ctx.decodeAudioData(bytes.buffer));
      } catch {
        // The next format.
      }
    }
  };
  const next = () => {
    const id = lines.shift();
    talking = id !== undefined && !!speech;
    bed.gain.setTargetAtTime(talking ? MUSIC * DUCK : MUSIC, ctx.currentTime, 0.15);
    if (talking) {
      const src = source(speech!);
      src.connect(out(master, SPEECH));
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

  return {
    unlock() {
      ctx.resume().catch(() => {});
      if (!started) {
        started = true;
        layers.forEach((_, id) => {
          const s = render(id, layers);
          bufs[id] = buffer(LOOPED.includes(id) ? seam(s) : s);
        });
        const m = source(buffer(music(), MUSIC_RATE));
        m.loop = true;
        m.connect(bed);
        m.start();
        void decode();
      }
    },
    listen(at, y) {
      [eye, yaw] = [at, y];
    },
    play(id, at, gain = 1, rate = 1) {
      let pan = 0;
      let vol = gain;
      if (at) {
        const [dx, dy, dz] = at.map((v, i) => v - eye[i]);
        const d = Math.hypot(dx, dy, dz);
        vol = Math.max(0, 1 - d / RANGE) ** 2 * gain;
        // The listener's right is (cos yaw, -sin yaw) on x, z.
        pan = (dx * Math.cos(yaw) - dz * Math.sin(yaw)) / Math.max(d, 1);
      }
      const b = bufs[id];
      if (!b || !vol) {
        return;
      }
      if (voices.size >= VOICES) {
        const q = [...voices].reduce((a, v) => (v.vol < a.vol ? v : a));
        if (q.vol >= vol) {
          return;
        }
        q.src.stop();
        voices.delete(q);
      }
      const src = source(b);
      src.playbackRate.value = rate;
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      src.connect(p).connect(out(master, vol));
      const v = { vol, src };
      voices.add(v);
      src.onended = () => voices.delete(v);
      src.start();
    },
    say(id) {
      if (speech && lines.length < 2 && !lines.includes(id)) {
        lines.push(id);
        if (!talking) {
          next();
        }
      }
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
            g.gain.setTargetAtTime(volume, ctx.currentTime, 0.08);
            src.playbackRate.setTargetAtTime(rate, ctx.currentTime, 0.08);
          }
        },
      };
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
