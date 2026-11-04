// Sound synthesis, jsfxr style: each sound is a handful of numbers rendered once into samples.
// No DOM, no Web Audio: audio.ts turns the samples into buffers. Music is rendered the same way.

/** Sample rate of everything rendered here; audio.ts resamples through AudioBuffer if needed. */
export const RATE = 44100;

/** The sounds of the game. */
export const SOUND = {
  /** The chaingun, one per shot. */
  SHOT: 0,
  /** A monster's death. */
  BOOM: 1,
  /** A player hurt: a blow or a bullet. */
  HIT: 2,
  /** A pickup taken: health or a key. */
  COLLECT: 3,
  /** A tick, once a second while the team runs back to the exit (RETURN). */
  CLOCK: 4,
  /** A bullet bursting on a wall. */
  BURST: 5,
} as const;

/**
 * Renders the SOUND `id` as mono samples in [-1, 1] at RATE, deterministic (seeded noise), a few
 * tenths of a second long, silent at both ends (no click).
 */
export const render = (id: number): Float32Array => {
  void id;
  return new Float32Array(1);
};

/**
 * The music: a loop of a few bars, mono samples in [-1, 1] at RATE, deterministic, whose end joins
 * its start without a click. Quiet enough to sit under the sounds.
 */
export const music = (): Float32Array => new Float32Array(RATE);
