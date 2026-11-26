import { RATE } from './synth';
import { SOUND } from './sounds';

/**
 * A cry of a human voice, source-filter: the flow through the vocal folds (a Rosenberg pulse, not a
 * saw: a saw buzzes like a synth) through four vowel formants, breath riding each opening, and no
 * two periods alike in length or loudness. The death cries are short cries of pain (the user,
 * 2026-11-17: "a brief cry of pain", the screams were long, loud and synthetic).
 */
export type Cry = {
  /** Seconds. */
  len: number;
  /** The pitch (Hz) at the start, at `up` s, at `hold` s, and at the end, falling from `hold`. */
  hz: [number, number, number, number];
  up: number;
  hold: number;
  /** Vibrato: Hz and depth. */
  vib: [number, number];
  /** How much each period's loudness is off the last (shimmer). */
  shim: number;
  /** Every other period this much louder: the rasp of a torn throat. */
  rasp: number;
  /** Breath on each opening while held, and more of it as the voice gives out. */
  breath: [number, number];
  /** The formants: Hz at the start, at the end, bandwidth, gain. */
  F: number[][];
  /** Seconds where the voice stops dead, a breath let out after it; 0 fades it out over `fade` s. */
  choke: number;
  fade: number;
  /** The peak of the samples. */
  vol: number;
  seed: number;
};

/** His: a short "AH!" thrown up to 330 Hz at once, falling to an "uh" and a breath. */
export const HIS: Cry = {
  len: 0.42,
  hz: [230, 330, 305, 170],
  up: 0.035,
  hold: 0.1,
  vib: [6, 0.015],
  shim: 0.3,
  rasp: 0.25,
  breath: [0.15, 0.4],
  F: [
    [750, 560, 110, 1],
    [1250, 1050, 130, 0.6],
    [2550, 2400, 180, 0.3],
    [3500, 3300, 260, 0.15],
  ],
  choke: 0,
  fade: 0.3,
  vol: 0.55,
  seed: 55,
};

/** Hers: the same cry at 560 Hz, a shorter throat, little rasp, more breath. Not his raised: his rasp under her pitch read as a man in falsetto. */
export const HERS: Cry = {
  ...HIS,
  len: 0.4,
  hz: [400, 560, 520, 300],
  rasp: 0.06,
  breath: [0.25, 0.45],
  F: [
    [900, 650, 130, 1],
    [1550, 1250, 160, 0.65],
    [2900, 2750, 220, 0.3],
    [4000, 3800, 300, 0.15],
  ],
  seed: 58,
};

/** His groan as a shot puts him down: a rising "hngh-uh" cut off in the throat, then the breath out. */
export const GROANED: Cry = {
  len: 0.5,
  hz: [150, 205, 185, 120],
  up: 0.05,
  hold: 0.2,
  vib: [6.5, 0.025],
  shim: 0.35,
  rasp: 0.5,
  breath: [0.15, 0.3],
  F: [
    [600, 550, 90, 1],
    [1150, 1000, 110, 0.6],
    [2450, 2300, 160, 0.25],
    [3400, 3200, 240, 0.12],
  ],
  choke: 0.27,
  fade: 0.3,
  vol: 0.85,
  seed: 59,
};

/** Hers: the same cut-off cry, her pitch and throat. */
export const MOANED: Cry = {
  ...GROANED,
  hz: [270, 370, 330, 215],
  shim: 0.3,
  rasp: 0.15,
  breath: [0.22, 0.35],
  F: GROANED.F.map(([a, b, bw, g]) => [a * 1.17, b * 1.17, bw * 1.2, g]),
  seed: 60,
};

/** The death cries by SOUND id. */
export const CRIES: Record<number, Cry> = {
  [SOUND.DEATH]: HIS,
  [SOUND.HER_DEATH]: HERS,
  [SOUND.GROAN]: GROANED,
  [SOUND.HER_GROAN]: MOANED,
};

/** The flow through the folds over a period: opening over 40 %, shut over 16 %, closed the rest. */
export const flow = (p: number) =>
  p < 0.4
    ? 0.5 * (1 - Math.cos((Math.PI * p) / 0.4))
    : p < 0.56
      ? Math.cos((Math.PI * (p - 0.4)) / 0.32)
      : 0;

/** Renders a Cry as mono samples at RATE, peaking at its `vol`. */
export const scream = (c: Cry = HIS): Float32Array => {
  const n = Math.round(c.len * RATE);
  const out = new Float32Array(n);
  let top = 0;
  // Each formant's two past inputs and outputs, a band-pass biquad of 0 dB at its peak.
  const z = c.F.map(() => [0, 0, 0, 0]);
  let seed = c.seed;
  const rand = () => ((seed = (Math.imul(seed, 1103515245) + 12345) | 0) >>> 0) / 2 ** 31 - 1;
  let phase = 0;
  let last = 0;
  let odd = 1;
  let jitter = 0;
  let wob = 0;
  let shim = 1;
  let peak = 0;
  const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  const [h0, h1, h2, h3] = c.hz;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const fall = ease((t - c.hold) / (c.len - c.hold));
    jitter += (rand() * 0.04 - jitter) * 0.002;
    const hz =
      t < c.up
        ? h0 + (h1 - h0) * ease(t / c.up)
        : t < c.hold
          ? h1 + ((h2 - h1) * (t - c.up)) / (c.hold - c.up)
          : h2 + (h3 - h2) * fall;
    const f0 = hz * (1 + c.vib[1] * Math.sin(t * 2 * Math.PI * c.vib[0]) + jitter + wob);
    phase += f0 / RATE;
    if (phase >= 1) {
      phase -= 1;
      odd = -odd;
      wob = rand() * 0.02;
      shim = 1 + rand() * c.shim;
    }
    // The flow's slope is what the mouth radiates; per period, so a higher voice is not louder.
    const u = flow(phase);
    const fold = ((u - last) * RATE * 0.2 * (1 + c.rasp * odd * (1 - fall * 0.6)) * shim) / f0;
    last = u;
    const breath = rand() * (c.breath[0] + c.breath[1] * fall) * (0.3 + u);
    // In in 8 ms, then out quadratically over the last `fade` s, or stopped in 15 ms.
    const on =
      Math.min(1, t / 0.008) *
      (c.choke ? Math.max(0, 1 - (t - c.choke) / 0.015) : Math.min(1, ((c.len - t) / c.fade) ** 2));
    // The breath let out after a choke.
    const air = c.choke && t > c.choke ? 1.5 * Math.exp(-(t - c.choke) / 0.07) : 0;
    const x = (fold + breath) * (1 - 0.5 * fall) * on + rand() * air;
    let y = 0;
    for (let k = 0; k < 4; k++) {
      const [a, b, bw, g] = c.F[k];
      const f = a + (b - a) * fall;
      const w = (2 * Math.PI * f) / RATE;
      const r = (Math.sin(w) * bw) / f / 2;
      const s = z[k];
      // s holds x[n-1], x[n-2], y[n-1], y[n-2].
      const o = (r * (x - s[1]) + 2 * Math.cos(w) * s[2] - (1 - r) * s[3]) / (1 + r);
      s[1] = s[0];
      s[0] = x;
      s[3] = s[2];
      s[2] = o;
      y += o * g;
    }
    out[i] = y * Math.min(1, (c.len - t) / 0.01);
    top = Math.max(top, Math.abs(out[i]));
  }
  // The same soft clip on every cry, whatever its loudness through the throat.
  for (let i = 0; i < n; i++) {
    out[i] = Math.tanh((out[i] / top) * 2);
    peak = Math.max(peak, Math.abs(out[i]));
  }
  return out.map(v => (v / peak) * c.vol);
};

/**
 * A radio that barely holds its station, under the Hunter's special views (the user, 2026-11-23:
 * close to the film's, subtle, and no high tone over and over but a deep, unsettling and slightly
 * distorted one coming back slowly, then rarer and slower still): once a loop a low growl swells in
 * and sinks away, overdriven,
 * over a faint hiss that fades and drops out, a crackle now and then and a slow tuning whistle.
 * 6.1 s, for a 6 s loop (seam): the swell's envelope repeats every 6 s, so the seam joins it.
 */
export const radio = (): Float32Array => {
  const n = Math.round(6.1 * RATE);
  const out = new Float32Array(n);
  let seed = 90;
  /** In [-1, 1). */
  const rand = () => ((seed = (Math.imul(seed, 1103515245) + 12345) | 0) >>> 0) / 2 ** 31 - 1;
  const chance = (p: number) => rand() * 0.5 + 0.5 < p;
  // The hiss's band (two one-pole filters) and reception (its level, where it heads and the samples
  // before it heads elsewhere), the crackle's decaying burst, the whistle's phase; the growl's two
  // saw phases and its low-pass.
  let [low, high, level, aim, hold, crack, whistle] = [0, 0, 1, 1, 0, 0, 0];
  let [a, b, dark] = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    if (--hold <= 0) {
      // A new stretch of 150 to 250 ms: clear, faded, or dropped out almost to nothing.
      hold = RATE * (0.15 + 0.1 * rand());
      const r = rand();
      aim = r < -0.5 ? 0.1 : r < 0.2 ? 0.5 : 1;
    }
    level += (aim - level) * 0.004;
    // Where in its 6 s the swell is: in over 1.2 s, out over 2.4 s, then silent till the next.
    const p = (t / 6) % 1;
    const swell =
      p < 0.2 ? Math.sin((Math.PI / 2) * (p / 0.2)) ** 2 : p < 0.6 ? ((0.6 - p) / 0.4) ** 2 : 0;
    // Two saws a little apart (they beat), sinking a few percent as the swell dies, with a slow
    // wobble; low-passed, then overdriven.
    const hz = 72 * (1 - 0.12 * Math.min(p, 0.6)) * (1 + 0.02 * Math.sin(2 * Math.PI * 1.5 * t));
    a = (a + hz / RATE) % 1;
    b = (b + (hz * 1.51) / RATE) % 1;
    dark += (1 - 2 * a + 0.5 * (1 - 2 * b) - dark) * 0.06;
    const growl = Math.tanh(3.5 * dark * swell);
    low += (rand() - low) * 0.25;
    high += (low - high) * 0.12;
    crack *= 0.98;
    if (chance(0.00015)) {
      crack = rand() * 0.6;
    }
    whistle += (1600 + 250 * Math.sin((Math.PI * t) / 3)) / RATE;
    const y =
      0.75 * growl +
      (low - high) * 0.5 * level +
      crack * (rand() < 0 ? -1 : 1) +
      0.03 * Math.max(0, Math.sin((2 * Math.PI * t) / 3)) ** 2 * Math.sin(2 * Math.PI * whistle);
    out[i] = Math.tanh(y * 1.3) * 0.7;
  }
  return out;
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
