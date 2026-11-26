import { RATE, synth } from './synth';
import type { Voice } from './synth';

/** The music's sample rate: half, as nothing in it but the hats goes past 4 kHz. */
export const MUSIC_RATE = RATE / 2;
export const BPM = 84;
export const BEAT = (MUSIC_RATE * 60) / BPM;
export const BARS = 16;
/** Two bars each, in semitones above A2: Dmaj9, Bm7, Gmaj7, Asus2. */
export const CHORDS = [
  [5, 12, 16, 19],
  [2, 9, 12, 17],
  [-2, 5, 9, 14],
  [0, 7, 14, 16],
];
/**
 * The bells over a chord, one character an eighth: a digit is a note of the chord an octave up, two
 * octaves from 4. One line for each half of the loop.
 */
export const ARP = ['0...2..3..1.2...', '4..6.5..7..6.5..'];
export const HAT: Voice = [3, 30000, 0, 0.001, 0, 0.04, 0, 0.7, 0, 1, 0.3];
export const PULSE: Voice = [2, 85, -2, 0.008, 0, 0.2, 0, 1, 0, 1, 0.22];

/**
 * Adds `src` to `to` from sample `at`, read `r` times as fast (a pitch) for `len` samples, wrapping
 * round `to`, with a rise of `a` samples and a fall of `d`, both squared. `src` loops: its last
 * sample repeats its first.
 */
export const add = (
  to: Float32Array,
  src: Float32Array,
  at: number,
  r = 1,
  gain = 1,
  len = (src.length - 1) / r,
  a = 1,
  d = 1,
) => {
  // Integer indices, no modulo and no division in the loop: it runs millions of times.
  const end = src.length - 1;
  const [ia, id] = [1 / a, 1 / d];
  for (let j = 0, p = 0, o = (at % to.length) | 0; j < len; j++) {
    const k = p | 0;
    to[o] +=
      gain * (src[k] + (src[k + 1] - src[k]) * (p - k)) * Math.min(1, j * ia, (len - j) * id) ** 2;
    if (++o == to.length) {
      o = 0;
    }
    if ((p += r) >= end) {
      p -= end;
    }
  }
};

/**
 * Adds `pads` to both halves of `mix` and brings its peak to 0.35. Hot loops sit in small functions:
 * V8 compiles a big one on its first hot loop, which costs more than the loop.
 */
export const mixdown = (mix: Float32Array, pads: Float32Array) => {
  let peak = 0;
  for (let i = 0; i < pads.length; i++) {
    mix[i] += pads[i];
    mix[i + pads.length] += pads[i];
    peak = Math.max(peak, Math.abs(mix[i]), Math.abs(mix[i + pads.length]));
  }
  for (let i = 0; i < mix.length; i++) {
    mix[i] *= 0.35 / peak;
  }
  return mix;
};

/**
 * The music: sixteen bars in D major at 84 bpm (whole beats, whole samples), slow pads, sparse
 * bells with an echo, soft hats and a muted pulse; mono samples in [-1, 1] at MUSIC_RATE,
 * deterministic, whose end joins its start (every tail wraps onto the start). Quiet enough to sit
 * under the sounds.
 */
export const music = (): Float32Array => {
  const n = BEAT * 4 * BARS;
  // One period of A2: two sines 8 cents apart that beat at half a hertz, a soft octave and twelfth.
  const table = new Float32Array(2 * MUSIC_RATE + 1);
  for (let i = 0; i <= 2 * MUSIC_RATE; i++) {
    const w = (Math.PI * i) / MUSIC_RATE;
    table[i] =
      Math.sin(220 * w) + Math.sin(221 * w) + 0.4 * Math.sin(441 * w) + 0.15 * Math.sin(659 * w);
  }
  // The pads repeat every eight bars: rendered once over half the loop.
  const pads = new Float32Array(n / 2);
  CHORDS.forEach((c, i) =>
    c.forEach(s =>
      add(pads, table, i * 8 * BEAT, 2 ** (s / 12), 0.06, 9.5 * BEAT, 2 * BEAT, 1.5 * BEAT),
    ),
  );
  const mix = new Float32Array(n);
  // A sine bell at A3 with a short inharmonic partial: a higher note is shorter, as a real one.
  const bell = synth([2, 220, 0, 0.004, 0, 1, 0.002, 1, 0, 1, 0.36], 1, MUSIC_RATE);
  synth([2, 607, 0, 0.002, 0, 0.25, 0, 1, 0, 1, 0.1], 1, MUSIC_RATE).forEach(
    (x, i) => (bell[i] += x),
  );
  const hat = synth(HAT, 1, MUSIC_RATE);
  const pulse = synth(PULSE, 1, MUSIC_RATE);
  for (let e = 0; e < BARS * 8; e++) {
    const at = (e * BEAT) / 2;
    const d = +ARP[e >> 6][e & 15];
    // A note and its echoes, a dotted eighth apart.
    for (let k = 0; d >= 0 && k < 3; k++) {
      add(
        mix,
        bell,
        at + k * 0.75 * BEAT,
        2 ** ((CHORDS[(e >> 4) & 3][d & 3] + 12 * (d >> 2)) / 12),
        0.35 ** k,
      );
    }
    if (e & 1) {
      add(mix, hat, at);
    }
    // On the one, and on the three in the second half.
    if (!(e & 7) || ((e & 7) == 4 && e >= BARS * 4)) {
      add(mix, pulse, at);
    }
  }
  return mixdown(mix, pads);
};

/** A sixteenth of the moon's music in samples, at 126 bpm: whole, and so is the loop. */
export const STEP = (MUSIC_RATE * 15) / 126;
/**
 * The moon's chords in D minor, a bar each: the bass's root, then the arpeggio's three notes. A
 * letter is semitones above C4 from a: Dm Dm Bb C Dm Dm Gm A, Bb C Am Dm Gm Bb Asus4 A.
 */
export const CHORDS_MOON = 'ccfjccfjkcfkaaehccfjccfjhchkjbejkcfkaaehjaejccfjhchkkcfkjcejjbej';
/** The lead over them, a sixteenth a character: a letter starts a note, '.' holds it, '-' rests. */
export const LEAD =
  'j.o.q.r...q.o...m.o.j.....------k.m.o.r...o.m...m.o.q...t...q...' +
  'j.o.q.r...q.o...t.r.q.o...j.....k...m...o.k.h...n...j...n...q...' +
  'r.......o...r.t.v.......t...q...q...m...j...m...o.......j.k.m.o.' +
  't.......r.q.o.k.o.......r.......q.......o.......n.......q...n...';
/** The arpeggio's hits in a bar. */
export const COMP = 'x..x..x...x..x..';
/** A bar of drums, k kick, s snare, h hat; the last bar of eight rolls. */
export const KIT = ['k.h.s.hkk.h.s.h.', 'k.h.s.hkk.s.ssss'];

export const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
/** The MIDI note of a letter of the score. */
export const key = (s: string, at = 0) => s.charCodeAt(at) - 37;

/**
 * Adds one chip note to `to` from sample `at`, `len` samples, wrapping round: `wave` 0 a pulse of
 * duty `w`, 1 the NES's 4-bit triangle, 2 its noise (a 15-bit shift register tapped at `w`: 1 hisses,
 * 6 rings), at `pitch(j)` on sample j; the volume falls from `vol` to `rest` of it in `fall`
 * samples, in sixteen steps.
 */
export const chip = (
  to: Float32Array,
  at: number,
  len: number,
  pitch: (j: number) => number,
  wave: number,
  w: number,
  vol: number,
  fall: number,
  rest = 0,
) => {
  // The pitch and the volume change every 32 samples, as a chip's registers once a frame.
  for (let j = 0, p = 0, r = 1, o = at % to.length, f = 0, g = 0; j < len; j++) {
    if (!(j & 31)) {
      f = pitch(j) / MUSIC_RATE;
      g = (vol * Math.ceil(16 * Math.max(rest, 1 - j / fall))) / 16;
    }
    if ((p += f) >= 1) {
      p -= 1;
      r = (r >> 1) | (((r ^ (r >> w)) & 1) << 14);
    }
    const q = (p * 32) | 0;
    const x = wave > 1 ? (r & 1) * 2 - 1 : wave ? (q < 16 ? q : 31 - q) / 7.5 - 1 : p < w ? 1 : -1;
    to[o] += x * g;
    if (++o == to.length) {
      o = 0;
    }
  }
};

/**
 * Adds `beat` to both halves of `mix`, takes the edge off the aliased squares with a one-pole
 * low-pass at about 4 kHz (warmed on the end, so the seam holds) and brings the peak to 0.26.
 */
export const finish = (mix: Float32Array, beat: Float32Array) => {
  let [y, peak] = [0, 0];
  for (let i = mix.length - 256; i < mix.length; i++) {
    y += (mix[i] + beat[i - beat.length] - y) * 0.7;
  }
  for (let i = 0; i < mix.length; i++) {
    mix[i] = y += (mix[i] + beat[i < beat.length ? i : i - beat.length] - y) * 0.7;
    peak = Math.max(peak, Math.abs(y));
  }
  for (let i = 0; i < mix.length; i++) {
    mix[i] *= 0.26 / peak;
  }
  return mix;
};

/**
 * The moon's music, 8-bit: thirty-two bars in D minor at 126 bpm, a pulse lead, a fast arpeggio
 * in a thin pulse, an octave bass on the triangle and noise drums. The second sixteen bars play
 * the lead thinner with an echo and the arpeggio an octave up. Like music(): mono at MUSIC_RATE,
 * deterministic, its end joining its start.
 */
export const moon = (): Float32Array => {
  const mix = new Float32Array(STEP * 512);
  // The bass and the drums are the same both times: rendered once, over half the loop.
  const beat = new Float32Array(STEP * 256);
  for (let s = 0; s < 512; s++) {
    const [at, bar, pass, i] = [s * STEP, (s >> 4) & 15, s >> 8, s & 15];
    const chord = CHORDS_MOON.slice(bar * 4, bar * 4 + 4);
    const c = LEAD[s & 255];
    let k = 1;
    if (c >= 'a') {
      while (LEAD[(s + k) & 255] == '.') {
        k++;
      }
      const f = hz(key(c));
      // A vibrato that comes in over the first eighth.
      const sing = (j: number) => f * (1 + 0.007 * Math.sin(j / 640) * Math.min(1, j / STEP / 2));
      for (let e = 0; e <= pass; e++) {
        chip(
          mix,
          at + 3 * e * STEP,
          (k - 0.25) * STEP,
          sing,
          0,
          0.5 - pass / 4,
          0.2 * 0.35 ** e,
          4 * STEP,
          0.45,
        );
      }
    }
    if (COMP[i] == 'x') {
      for (k = 1; COMP[i + k] == '.';) {
        k++;
      }
      // The chord's notes in turn, fifty a second.
      const fs = [1, 2, 3].map(n => hz(key(chord, n)) * (pass + 1));
      chip(mix, at, k * STEP, j => fs[((j / 441) | 0) % 3], 0, 0.125, 0.09, 2 * STEP, 0.25);
    }
    if (pass) {
      continue;
    }
    if (!(i & 1)) {
      const f = hz(38 + ((key(chord) - 38) % 12) + (i & 2 ? 12 : 0));
      chip(beat, at, 1.5 * STEP, () => f, 1, 0, 0.4, 1, 1);
    }
    const d = KIT[+(bar % 8 == 7)][i];
    if (d == 'k') {
      chip(beat, at, STEP, j => 160 * 2 ** (-j / 900), 1, 0, 0.6, STEP);
    } else if (d == 's') {
      chip(beat, at, 1.25 * STEP, () => 7000, 2, 1, 0.22, 1.25 * STEP);
    } else if (d == 'h') {
      chip(beat, at, STEP / 3, () => MUSIC_RATE, 2, 6, 0.08, STEP / 3);
    }
  }
  return finish(mix, beat);
};

/** A sixteenth of Highline's music in samples, at 135 bpm: whole, and so is the loop. */
export const BEAM = (MUSIC_RATE * 15) / 135;
/**
 * Highline's chords: the bass's root (MIDI), then the arpeggio's three notes round A4. E is E over
 * D's root, the lydian second that keeps it floating; S is Asus4.
 */
export const SKY: Record<string, number[]> = {
  D: [38, 69, 73, 78],
  E: [38, 68, 71, 76],
  B: [35, 66, 69, 74],
  G: [43, 66, 71, 74],
  A: [45, 69, 73, 76],
  F: [42, 66, 69, 73],
  S: [45, 69, 74, 76],
};
/**
 * The chords, a half bar each, in D major: the theme, the theme again turning faster at its end,
 * the bridge on the fourth, and the theme once more.
 */
export const CHANGES_SKY =
  'DDEEBBGGDDEEGGAA' + 'DDEEBBGGDDEEGASA' + 'GGAAFFBBGGAABBSA' + 'DDEEBBGGDDEEGGAA';
/** Its lead, as the moon's: a letter a note from C4 at a, '.' held, '-' a rest; a section a line. */
export const WIND = [
  'v..s..o.q...s...u..q..l.n...q...s..o..l.o.q.s...x...v...s.....--' +
    'v..s..o.q...s...u..q..l.n...u.x.z..x..v.x...s...q.......------n.',
  'v..s..o.q.s.v.x.u..q..l.n.q.u...s..o..l.o.q.s.v.x.....v.s...q...' +
    'v..s..o.q.s.v.x.z..x..u.x...u...x..v..s.v..q..n.o.......n.....--',
  'x.....z.....x...v.....x.....z...s.....v.....q.s.o.......--o.q.s.' +
    'x.....z.....x.z.z.....x.....v...x.....v.....s...v.t.s.q.n.......',
  'v..s..o.q...s...u..q..l.n...q...s..o..l.o.q.s...x...v...s.....--' +
    'v..s..o.q...s...u..q..l.n...u.x.z..x..v.x...s...q.......n.o.q.s.',
];
/** Each section's drums over a bar, k kick, s snare, h hat, o open hat; the bridge's end rolls. */
export const KIT_SKY = [
  'k.h.s.hkk.h.s.ho',
  'k.hhs.hkk.hhs.ho',
  'k.hhs.hkk.hhs.hk',
  'k.h.s.h.k.h.s.ho',
  'k.h.s.s.s.ssssss',
];
/** The bass's hits in a bar, R its root and r an octave up. */
export const WALK_SKY = [
  'R..rR.r.R..rR.r.',
  'R..rR.r.R..rR.rr',
  'R.r.R.r.R.r.R.r.',
  'R..rR.r.R..rR.r.',
];

/**
 * Highline's music, 8-bit and airy: thirty-two bars in D major at 135 bpm with a lydian second.
 * A high pulse lead with a dotted echo, thin on the theme and wide on the bridge, then on the soft
 * triangle for the return; under it a sparkling sixteenth arpeggio an octave up, a bouncing octave
 * bass on the triangle and light noise drums with an open hat. Mono at MUSIC_RATE, deterministic,
 * its end joining its start.
 */
export const sky = (): Float32Array => {
  const mix = new Float32Array(BEAM * 512);
  for (let s = 0; s < 512; s++) {
    const [at, sec, i] = [s * BEAM, s >> 7, s & 15];
    const [root, ...notes] = SKY[CHANGES_SKY[s >> 3]];
    const line = WIND[sec];
    const c = line[s & 127];
    let k = 1;
    if (c >= 'a') {
      while (line[(s + k) & 127] == '.') {
        k++;
      }
      const f = hz(key(c));
      const sing = (j: number) => f * (1 + 0.006 * Math.sin(j / 600) * Math.min(1, j / BEAM / 3));
      const [wave, duty, vol] = [
        [0, 0.25, 0.12],
        [0, 0.125, 0.12],
        [0, 0.5, 0.11],
        [1, 0, 0.26],
      ][sec];
      for (let e = 0; e < 3; e++) {
        chip(
          mix,
          at + 3 * e * BEAM,
          (k - 0.3) * BEAM,
          sing,
          wave,
          duty,
          vol * 0.4 ** e,
          5 * BEAM,
          0.45,
        );
      }
    }
    // The arpeggio up the chord and a step over, an octave up, short: drops of light.
    const n = notes[[0, 1, 2, 1][i & 3]] + 12;
    chip(mix, at, 0.6 * BEAM, () => hz(n), 0, 0.125, sec == 3 ? 0.035 : 0.045, BEAM, 0.15);
    const w = WALK_SKY[sec][i];
    if (w != '.') {
      const f = hz(root + (w == 'r' ? 12 : 0));
      chip(mix, at, 1.4 * BEAM, () => f, 1, 0, 0.32, 2 * BEAM, 0.5);
    }
    const d = KIT_SKY[s >> 4 == 23 ? 4 : sec][i];
    if (d == 'k') {
      chip(mix, at, BEAM, j => 140 * 2 ** (-j / 800), 1, 0, 0.45, BEAM);
    } else if (d == 's') {
      chip(mix, at, BEAM, () => 8000, 2, 1, 0.13, BEAM);
    } else if (d == 'h') {
      chip(mix, at, BEAM / 3, () => MUSIC_RATE, 2, 6, 0.055, BEAM / 3);
    } else if (d == 'o') {
      chip(mix, at, 1.8 * BEAM, () => MUSIC_RATE, 2, 1, 0.04, 1.8 * BEAM);
    }
  }
  // No beat to fold in: each section has its own.
  return finish(mix, new Float32Array(mix.length / 2));
};

/** The music of each map by its key; the others play music(). */
export const SONGS: Record<string, () => Float32Array> = { tranquility: moon, highline: sky };
