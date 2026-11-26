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

/** Noise in [-1, 1) from a seed: mulberry32. */
export const mulberry = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let z = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) ^ z;
  return ((z ^ (z >>> 14)) >>> 0) / 2 ** 31 - 1;
};

export const synth = (
  [wave, hz, slide, a, s, d, vib, lp, jt, jm, vol]: Voice,
  seed: number,
  rate = RATE,
) => {
  const out = new Float32Array(Math.ceil((a + s + d) * rate));
  let phase = 0;
  let low = 0;
  let noise = 0;
  const rand = mulberry(seed);
  for (let i = 0; i < out.length; i++) {
    const t = i / rate;
    phase += (hz * 2 ** (slide * t) * (t > jt ? jm : 1) * (1 + vib * Math.sin(t * 44))) / rate;
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
