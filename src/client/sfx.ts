// Sound synthesis, jsfxr style: each sound is a handful of numbers rendered once into samples.
// No DOM, no Web Audio: audio.ts turns the samples into buffers. Music is rendered the same way.

/**
 * One oscillator: wave (0 square, 1 saw, 2 sine, 3 noise held for one period), hz, slide in octaves
 * per second, attack, sustain and decay in seconds, vibrato depth, low-pass (0..1, 1 is off),
 * arpeggio time and frequency multiplier, volume; optionally the seconds it starts late.
 */
export type Voice = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number?,
];

/** Sample rate of everything rendered here; audio.ts resamples through AudioBuffer if needed. */
export const RATE = 44100;

const synth = ([wave, hz, slide, a, s, d, vib, lp, jt, jm, vol]: Voice, seed: number) => {
  const out = new Float32Array(Math.ceil((a + s + d) * RATE));
  let phase = 0;
  let low = 0;
  let noise = 0;
  // mulberry32
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let z = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) ^ z;
    return ((z ^ (z >>> 14)) >>> 0) / 2 ** 31 - 1;
  };
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    phase += (hz * 2 ** (slide * t) * (t > jt ? jm : 1) * (1 + vib * Math.sin(t * 44))) / RATE;
    if (phase >= 1) {
      phase %= 1;
      noise = rand();
    }
    const x =
      wave == 3
        ? noise
        : wave == 2
          ? Math.sin(phase * 2 * Math.PI)
          : wave
            ? 1 - 2 * phase
            : phase < 0.5
              ? 1
              : -1;
    low += (x - low) * lp;
    // The decay is quadratic and ends at 0, the attack starts at 0: neither end clicks.
    const env = t < a ? t / a : t < a + s ? 1 : ((a + s + d - t) / d) ** 2;
    out[i] = low * env * vol;
  }
  return out;
};

/** The ids of the sounds: an index into LAYERS. The last two are loops (see LOOPED). */
export const SOUND = {
  STEP: 0,
  /** The lighter tap of a step on a wall. */
  WALLSTEP: 1,
  JUMP: 2,
  DOUBLE: 3,
  DASH: 4,
  LAND: 5,
  GRAB: 6,
  SCUFF: 7,
  WIND: 8,
  SCRAPE: 9,
} as const;

/**
 * The sounds of the game: one entry per sound, its voices layered, in SOUND order. A low-passed
 * noise is quiet (lp 0.06 keeps about a tenth of the swing): the loops have a high volume.
 */
export const LAYERS: Voice[][] = [
  [
    [2, 130, -3, 0.001, 0.005, 0.06, 0, 1, 0, 1, 0.7],
    [3, 8000, -1, 0.001, 0, 0.035, 0, 0.4, 0, 1, 0.45],
  ],
  [
    [3, 12000, 0, 0.001, 0, 0.03, 0, 0.5, 0, 1, 0.4],
    [2, 190, -3, 0.001, 0, 0.04, 0, 1, 0, 1, 0.3],
  ],
  [
    [3, 14000, 0, 0.015, 0.02, 0.09, 0.3, 0.18, 0, 1, 0.5],
    [2, 70, -2, 0.003, 0, 0.07, 0, 1, 0, 1, 0.3],
  ],
  [
    [3, 4000, 3.5, 0.03, 0.03, 0.2, 0, 0.25, 0, 1, 0.5],
    [2, 350, 1.2, 0.03, 0.02, 0.18, 0.02, 1, 0, 1, 0.12],
  ],
  [
    [3, 14000, -2.5, 0.008, 0.07, 0.2, 0.25, 0.3, 0, 1, 0.8],
    [3, 3500, 0.5, 0.01, 0.06, 0.2, 0, 0.12, 0, 1, 0.5],
  ],
  [
    [2, 70, -2.5, 0.001, 0.01, 0.2, 0, 1, 0, 1, 0.9],
    [3, 7000, -1, 0.001, 0, 0.09, 0, 0.25, 0, 1, 0.5],
  ],
  [
    [3, 6000, -1, 0.001, 0, 0.05, 0, 0.5, 0, 1, 0.7],
    [2, 160, -4, 0.001, 0, 0.07, 0, 1, 0, 1, 0.5],
  ],
  [
    [3, 5000, 0, 0.01, 0.04, 0.14, 0.5, 0.3, 0, 1, 0.5],
    [3, 2500, 0, 0.03, 0, 0.1, 0.4, 0.2, 0, 1, 0.3, 0.08],
  ],
  [
    [3, 20000, 0, 0.001, 2.1, 0.001, 0.25, 0.06, 0, 1, 1.2],
    [3, 20000, 0, 0.001, 2.1, 0.001, 0.35, 0.3, 0, 1, 0.3],
  ],
  [
    [3, 9000, 0, 0.001, 2.1, 0.001, 0.5, 0.4, 0, 1, 0.5],
    [3, 3000, 0, 0.001, 2.1, 0.001, 0.4, 0.2, 0, 1, 0.5],
  ],
];

/** The sounds played in a loop: their buffers go through seam. */
export const LOOPED: number[] = [SOUND.WIND, SOUND.SCRAPE];

/**
 * Renders the sound `id` of `layers` as mono samples in [-1, 1] at RATE, deterministic (seeded
 * noise), silent at both ends (no click).
 */
export const render = (id: number, layers: Voice[][] = LAYERS): Float32Array => {
  const voices = layers[id].map(
    (v, i) => [synth(v, id * 9 + i), Math.round((v[11] ?? 0) * RATE)] as const,
  );
  // tanh keeps the sum of the voices within [-1, 1].
  return Float32Array.from({ length: Math.max(...voices.map(([v, d]) => d + v.length)) }, (_, i) =>
    Math.tanh(voices.reduce((sum, [v, d]) => sum + (v[i - d] ?? 0), 0)),
  );
};

/**
 * A sound made loopable: the last `x` samples are cross-faded into the first, the length drops by
 * `x`, and the end joins the start. For a stationary sound (a loop's voice is held at full
 * volume, nothing but noise), whose own ends are no longer heard.
 */
export const seam = (s: Float32Array, x = RATE / 10): Float32Array => {
  const n = s.length - x;
  // Equal power: the two parts are not correlated.
  return Float32Array.from({ length: n }, (_, i) =>
    i < x ? s[i] * Math.sqrt(i / x) + s[n + i] * Math.sqrt(1 - i / x) : s[i],
  );
};

const BPM = 108;
const BEAT = (RATE * 60) / BPM;
const STEP = BEAT / 4;
const BARS = 4;
const KICK: Voice = [2, 150, -6, 0.002, 0, 0.25, 0, 1, 0, 1, 1];
const SNARE: Voice = [3, 9000, 0, 0.002, 0, 0.15, 0, 0.5, 0, 1, 0.5];
const HAT: Voice = [3, 30000, 0, 0.001, 0, 0.04, 0, 0.7, 0, 1, 0.15];

/**
 * The music: a loop of four bars in A minor at 108 bpm (whole beats, whole samples), mono samples
 * in [-1, 1] at RATE, deterministic, whose end joins its start without a click. Quiet enough to
 * sit under the sounds.
 */
export const music = (): Float32Array => {
  const mix = new Float32Array(BEAT * 4 * BARS);
  // Tails wrap past the end onto the start, so the loop has no seam.
  // Equal voices render equal samples (one seed): each is rendered once.
  const memo: Record<string, Float32Array> = {};
  const put = (step: number, voice: Voice) =>
    (memo[String(voice)] ??= synth(voice, 1)).forEach(
      (x, i) => (mix[(step * STEP + i) % mix.length] += x),
    );
  const hz = (semitones: number) => 55 * 2 ** (semitones / 12);
  const roots = [0, 0, -4, -5];
  const bass = [0, 0, 12, 0, 0, 7, 12, 7];
  for (let step = 0; step < BARS * 16; step++) {
    const at = step % 16;
    if ('x.......x.x.....'[at] == 'x') {
      put(step, KICK);
    }
    if ('....x.......x...'[at] == 'x') {
      put(step, SNARE);
    }
    if (at % 2 == 0) {
      put(step, HAT);
      const n = roots[step >> 4] + bass[at >> 1];
      put(step, [1, hz(n), 0, 0.005, 0.08, 0.18, 0, 0.15, 0, 1, 0.6]);
    }
  }
  // A sparse lead over the second and fourth bars, A minor pentatonic.
  [15, 12, 10, 19, 17, 15].forEach((n, i) =>
    put([18, 24, 28, 50, 54, 60][i], [2, hz(n + 24), 0, 0.02, 0.1, 0.6, 0.01, 1, 0, 1, 0.5]),
  );
  const peak = mix.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
  return mix.map(x => (x / peak) * 0.35);
};
