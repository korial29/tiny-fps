import { CRIES, radio, scream } from './voices';
import { LAYERS } from './layers';
import { RATE, synth } from './synth';
import type { Voice } from './synth';
import { SOUND } from './sounds';

/** The seconds sound `id` lasts: its longest voice, from its start late to the end of its decay. */
export const secondsOf = (id: number, layers: Voice[][] = LAYERS): number =>
  Math.max(...layers[id].map(([, , , a, s, d, , , , , , late = 0]) => late + a + s + d));

/** The sounds played in a loop: their buffers go through seam. */
export const LOOPED: number[] = [
  SOUND.WIND,
  SOUND.SCRAPE,
  SOUND.HUM,
  SOUND.BUZZ,
  SOUND.CHARGE,
  SOUND.ENGINE,
  SOUND.SKID,
  SOUND.JET,
  SOUND.STATIC,
  SOUND.HUNTER_SEEK,
  SOUND.SWIM,
];

/**
 * Renders the sound `id` of `layers` as mono samples in [-1, 1] at RATE, deterministic (seeded
 * noise), silent at both ends (no click).
 */
export const render = (id: number, layers: Voice[][] = LAYERS): Float32Array => {
  if (layers == LAYERS && CRIES[id]) {
    return scream(CRIES[id]);
  }
  if (layers == LAYERS && id == SOUND.STATIC) {
    return radio();
  }
  const voices = layers[id].map(
    (v, i) => [synth(v, id * 9 + i), Math.round((v[11] ?? 0) * RATE)] as const,
  );
  // tanh keeps the sum of the voices within [-1, 1].
  return Float32Array.from({ length: Math.max(...voices.map(([v, d]) => d + v.length)) }, (_, i) =>
    Math.tanh(voices.reduce((sum, [v, d]) => sum + (v[i - d] ?? 0), 0)),
  );
};
