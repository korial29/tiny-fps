// Web Audio: the sounds of sfx.ts placed in stereo around the listener, and the music loop.
import type { Vec3 } from './mesh';
import { RATE, SOUND, music, render } from './sfx';

export interface Audio {
  /**
   * Starts the AudioContext on a user gesture (browsers keep it suspended until one); the first
   * call also renders the sound buffers and starts the music. Later calls do nothing.
   */
  unlock(): void;
  /** Where the listener is and looks, each frame (yaw as a player's: 0 looks toward -z). */
  listen(eye: Vec3, yaw: number): void;
  /**
   * Plays the SOUND `id`. With `at`, panned left or right by its direction from the listener and
   * fainter with distance; without, centred (the own player's sounds). `gain` scales the volume.
   */
  play(id: number, at?: Vec3, gain?: number): void;
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

/** A silent Audio when the browser has no Web Audio. */
const silent = (): Audio => {
  let muted = false;
  return {
    unlock: () => {},
    listen: () => {},
    play: () => {},
    mute: on => {
      muted = on;
    },
    get muted() {
      return muted;
    },
    destroy: () => {},
  };
};

export const createAudio = (): Audio => {
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
  /** Indexed by SOUND id; empty until unlock. */
  const bufs: AudioBuffer[] = [];
  const voices = new Set<{ vol: number; src: AudioBufferSourceNode }>();
  let eye: Vec3 = [0, 0, 0];
  let yaw = 0;
  let muted = false;

  const buffer = (samples: Float32Array) => {
    const b = ctx.createBuffer(1, samples.length, RATE);
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
      if (!bufs.length) {
        for (const id of Object.values(SOUND)) {
          bufs[id] = buffer(render(id));
        }
        const m = source(buffer(music()));
        m.loop = true;
        m.connect(bed);
        m.start();
      }
    },
    listen(at, y) {
      [eye, yaw] = [at, y];
    },
    play(id, at, gain = 1) {
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
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      src.connect(p).connect(out(master, vol));
      const v = { vol, src };
      voices.add(v);
      src.onended = () => voices.delete(v);
      src.start();
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

/** The heart beats at this health or below, while alive. */
export const LOW_HP = 3;

/**
 * Returns a function called each frame with the own health (0 when dead) and `now` in ms. At 1 to
 * LOW_HP health it plays HEART, every 0.8 s, and at 1 every 0.5 s and louder; the first beat
 * comes the moment health gets low. Returns the beat for the screen: 1 at a thump, fading to 0 by
 * the next, and 0 when the health is not low.
 */
export const createHeart = (a: Audio) => {
  let beat = -Infinity;
  return (hp: number, now: number) => {
    if (hp < 1 || hp > LOW_HP) {
      beat = -Infinity;
      return 0;
    }
    const gap = hp > 1 ? 800 : 500;
    if (now - beat >= gap) {
      beat = now;
      a.play(SOUND.HEART, undefined, hp > 1 ? 0.6 : 1);
    }
    return 1 - (now - beat) / gap;
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
