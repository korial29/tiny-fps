// Sound synthesis, jsfxr style: each sound is a handful of numbers rendered once into samples.
// No DOM, no Web Audio: audio.ts turns the samples into buffers. Music is rendered the same way.

/**
 * One oscillator: wave (0 square, 1 saw, 2 sine, 3 noise held for one period), hz, slide in octaves
 * per second, attack, sustain and decay in seconds, vibrato depth, low-pass (0..1, 1 is off),
 * arpeggio time and frequency multiplier, volume; optionally the seconds it starts late.
 */
type Voice = [
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

/** The sounds of the game. */
export const SOUND = {
  /** The chaingun, one per shot. */
  SHOT: 0,
  /** A player hurt. */
  HIT: 1,
  /** A pickup taken: health or a key. */
  COLLECT: 2,
  /** A tick, once a second while the team runs back to the exit (RETURN). */
  CLOCK: 3,
  /** A heartbeat, looped by the client while the own health is low. */
  HEART: 4,
} as const;

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

const LAYERS: Voice[][] = [
  // SHOT: a noise crack over a short thump.
  [
    [3, 7000, -0.5, 0.002, 0, 0.06, 0, 0.6, 0, 1, 0.8],
    [0, 220, -5, 0.002, 0, 0.075, 0, 0.3, 0, 1, 0.5],
  ],
  // HIT: a saw and a square falling out of tune, over grit.
  [
    [1, 160, -1.5, 0.003, 0.04, 0.22, 0.2, 0.5, 0, 1, 0.6],
    [0, 83, -1, 0.003, 0.04, 0.22, 0, 0.3, 0, 1, 0.4],
    [3, 3000, 0, 0.002, 0, 0.12, 0, 0.4, 0, 1, 0.5],
  ],
  // COLLECT: two sines, the second a fifth up after 90 ms.
  [
    [2, 880, 0.3, 0.005, 0.06, 0.4, 0, 1, 0.09, 1.5, 0.8],
    [2, 1760, 0.3, 0.005, 0.06, 0.35, 0, 1, 0.09, 1.5, 0.3],
  ],
  // CLOCK: a dry click on a short blip.
  [
    [3, 4000, 0, 0.001, 0, 0.025, 0, 0.5, 0, 1, 0.7],
    [2, 1300, -1, 0.001, 0, 0.04, 0, 1, 0, 1, 0.5],
  ],
  // HEART: a soft "lub-dub", two sine thumps 0.22 s apart, the second lower and fainter. Each has
  // a faint octave above it, so small speakers carry it.
  [
    [2, 55, -1, 0.01, 0.01, 0.12, 0, 1, 0, 1, 0.9],
    [2, 110, -1, 0.01, 0, 0.08, 0, 1, 0, 1, 0.3],
    [2, 48, -1, 0.01, 0.01, 0.14, 0, 1, 0, 1, 0.6, 0.22],
    [2, 96, -1, 0.01, 0, 0.09, 0, 1, 0, 1, 0.2, 0.22],
  ],
];

/**
 * Renders the SOUND `id` as mono samples in [-1, 1] at RATE, deterministic (seeded noise), a few
 * tenths of a second long, silent at both ends (no click).
 */
export const render = (id: number): Float32Array => {
  const voices = LAYERS[id].map(
    (v, i) => [synth(v, id * 9 + i), Math.round((v[11] ?? 0) * RATE)] as const,
  );
  // tanh keeps the sum of the voices within [-1, 1] and rounds the boom.
  return Float32Array.from({ length: Math.max(...voices.map(([v, d]) => d + v.length)) }, (_, i) =>
    Math.tanh(voices.reduce((sum, [v, d]) => sum + (v[i - d] ?? 0), 0)),
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
