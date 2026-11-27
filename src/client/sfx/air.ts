import { mulberry } from './synth';
import type { Voice } from './synth';
import { MUSIC_RATE } from './music';
import { seam } from './voices';
import { FIRES as BURNING, FRAME, ZED } from '../../shared/beach';

/**
 * A map's ambience, played by audio.ts round the listener: beds that loop, each as loud as where
 * he stands makes it, and a cry now and then from afar.
 */
export interface Air {
  /** The beds: mono loops at MUSIC_RATE whose end joins their start. */
  beds: (() => Float32Array)[];
  /** Each bed's volume, 0 to 1, for a listener at `eye` at `t` seconds, written into `out`. */
  mix(eye: readonly number[], t: number, out: number[]): void;
  /** The cry's voices, and where one comes from, given two numbers drawn in [0, 1). */
  cry: Voice[];
  from(u: number, v: number): [number, number, number];
}

/** Brings the loudest sample of `s` to `peak`. */
export const level = (s: Float32Array, peak: number) => {
  let most = 0;
  for (let i = 0; i < s.length; i++) {
    most = Math.max(most, Math.abs(s[i]));
  }
  for (let i = 0; i < s.length; i++) {
    s[i] *= peak / most;
  }
  return s;
};

/**
 * The surf, twelve seconds: under the far sea's rumble, two waves a loop and three weaker ones
 * between them. Each swells, breaks (the noise opens up: its low-pass rises with the wave) and
 * draws back down the sand as a long hiss. Every envelope is a whole number of periods a loop and
 * the filters run a quarter of it unheard first, so the end joins the start.
 */
export const surf = (): Float32Array => {
  const n = 12 * MUSIC_RATE;
  const out = new Float32Array(n);
  const rand = mulberry(7);
  let [low, mid] = [0, 0];
  for (let i = -n / 4; i < n; i++) {
    let [k, body, hiss] = [0.03, 1, 0];
    for (let w = 0; w < 2; w++) {
      const p = ((i / n) * (2 + w) + 0.4 * w + 4) % 1;
      const e = p < 0.3 ? (p / 0.3) ** 3 : Math.exp((0.3 - p) * 9);
      k += 0.1 * e * (1 - 0.5 * w);
      body += 2 * e * (1 - 0.5 * w);
      hiss += p > 0.3 ? Math.sin((Math.PI * (p - 0.3)) / 0.7) ** 2 * (0.16 - 0.07 * w) : 0;
    }
    const x = rand();
    low += (x - low) * k;
    mid += (x - mid) * 0.4;
    if (i >= 0) {
      out[i] = low * body + (x - mid) * hiss;
    }
  }
  return level(out, 0.8);
};

/**
 * A steady noise that loops, `secs` long: what is left of white noise between two one-pole
 * low-passes (`k0` 0: all that is under `k1`), and `pops` crackles a second, each a click a
 * millisecond long. The wind in the palms is a band of it, the fire a rumble that crackles.
 */
export const hush = (
  seed: number,
  secs: number,
  peak: number,
  k0: number,
  k1: number,
  pops = 0,
) => {
  const out = new Float32Array(secs * MUSIC_RATE);
  const rand = mulberry(seed);
  let [a, b, pop] = [0, 0, 0];
  for (let i = 0; i < out.length; i++) {
    const x = rand();
    a += (x - a) * k0;
    b += (x - b) * k1;
    pop = Math.abs(rand()) < pops / MUSIC_RATE ? rand() : pop * 0.75;
    out[i] = b - a + pop * 0.3;
  }
  return level(seam(out, MUSIC_RATE / 5), peak);
};
export const breeze = (): Float32Array => hush(11, 7, 0.3, 0.06, 0.5);
export const blaze = (): Float32Array => hush(13, 5, 0.5, 0, 0.03, 16);

/**
 * The forest's insects, six seconds: three cicadas, each a high sine that trills and comes and
 * goes. Every frequency is a whole number of periods a loop: its end joins its start.
 */
export const chirr = (): Float32Array =>
  Float32Array.from({ length: 6 * MUSIC_RATE }, (_, i) => {
    const w = (2 * Math.PI * i) / MUSIC_RATE;
    let x = 0;
    for (let c = 0; c < 3; c++) {
      x +=
        Math.sin(w * (4300 + 800 * c)) *
        (0.5 + 0.5 * Math.sin(w * (23 + 7 * c))) ** 4 *
        (0.5 + 0.5 * Math.sin((w * (c + 1)) / 6 + 2 * c)) ** 2;
    }
    return x * 0.12;
  });

/** Where something burns on Landfall (x, z): by the four torn engines and at the hull's four broken ends. */
export const FIRES = BURNING.map(([x, , z]) => [x, z]);

/** The surf's share of the world's bus at the waterline: half (-6 dB), the sea drowned the game (the user, 2026-11-27). */
export const SURF = 0.5;

/**
 * Landfall's ambience: the surf, loudest at the waterline; the wind in the palms, in gusts, and
 * the insects, both rising toward the trees; a fire's crackle within some 25 m of one; and a gull
 * calling over the lagoon.
 */
export const LANDFALL: Air = {
  beds: [surf, breeze, chirr, blaze],
  mix([x, , z], t, out) {
    const wood = Math.min(Math.max((x - 50) / 40, 0), 1);
    let d = 1e9;
    for (let i = 0; i < FIRES.length; i++) {
      d = Math.min(d, Math.hypot(x - FIRES[i][0], z - FIRES[i][1]));
    }
    out[0] = SURF * (0.2 + 0.8 / (1 + ((x - FRAME.shore) / 14) ** 2));
    out[1] = (0.25 + 0.75 * wood) * (0.55 + 0.45 * Math.sin(t * 0.31) * Math.sin(t * 0.13 + 1));
    out[2] = 0.5 * wood * wood;
    out[3] = Math.max(1 - d / 28, 0) ** 2;
  },
  // Four mews, each a saw that jumps up a fourth and falls, the next a little higher.
  cry: [0, 1, 2, 3].map((i): Voice => [
    1,
    950 + 60 * i,
    -1.6,
    0.03,
    0.04,
    0.2,
    0.25,
    0.35,
    0.03,
    1.33,
    0.4,
    i * 0.3,
  ]),
  from: (u, v) => [FRAME.shore - 50 * u, 16 + 12 * u, ZED * v],
};

/** The ambience of each map by its key; the others have none. */
export const AIRS: Record<string, Air> = { landfall: LANDFALL };
