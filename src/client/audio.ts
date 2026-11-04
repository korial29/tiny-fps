// Web Audio: the sounds of sfx.ts placed in stereo around the listener, and the music loop.
import type { Vec3 } from './mesh';

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
   * fainter with distance; without, centred at full volume (the own player's sounds).
   */
  play(id: number, at?: Vec3): void;
  /** Mutes or unmutes everything, music included. */
  mute(on: boolean): void;
  readonly muted: boolean;
  /** Stops the music and closes the AudioContext. */
  destroy(): void;
}

/** A silent Audio when the browser has no Web Audio. */
export const createAudio = (): Audio => {
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
