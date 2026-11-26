import { chip, finish, hz, key, MUSIC_RATE } from './music';

/** A sixteenth of the menus' theme in samples, at 105 bpm: whole, and so is the loop. */
export const TICK = (MUSIC_RATE * 15) / 105;
/** The theme's chords: the bass's root (MIDI), then the arpeggio's three notes, round E4. */
export const HARMONY: Record<string, number[]> = {
  E: [40, 64, 67, 71],
  C: [36, 64, 67, 72],
  G: [43, 62, 67, 71],
  D: [38, 62, 66, 69],
  A: [45, 64, 69, 72],
  B: [47, 63, 66, 71],
};
/**
 * The chords, a half bar each, in E minor: E Em, C, G, D, A Am and B major, whose D sharp leads
 * home. Four sections of eight bars: the theme, the theme again with a chord each half bar, the
 * climax, and a breakdown that falls back to the start.
 */
export const CHANGES =
  'EECCGGDDEECCAABB' + 'ECGDECABCDECADBB' + 'CDGECDBBCDGEABEE' + 'ECGDEACDECGDCABB';
/**
 * The lead, a sixteenth a character, as the moon's (a letter starts a note from C4 at a, '.'
 * holds it, '-' rests): eight bars of sixteen for each section.
 */
export const THEME = [
  'e.....g.h...l...m.......l...h...l.....j.h...e...g...........----' +
    'e.....g.h...l...m.......o...q...q.....o.m...l...l.............--',
  'e.g.h...m...l.h.l.....h.g.j.....e.g.h...m.l.m.o.q.....m.s.......' +
    'q.o.m...o.m.l.j.l.......m.......m.l.j...g.j.m...l.............--',
  'q.......s.......t.....s.q.......q.o.m...o.......s.........p.s...' +
    'q.......s.......t.....v.t.......v...q...s...p...q...........----',
  'e.......h.......l.......j.......m.......q.......s.............--' +
    'e.......h.......l.......j.......m.......q.......s.............--',
];
/** Each section's drums over a bar, k kick, s snare, h hat; the climax's last bar rolls. */
export const KIT_MENU = [
  'k.h.s.h.k.h.s.h.',
  'k.h.s.hkk.h.s.h.',
  'k.hks.h.k.hks.hk',
  'k...h...s...h...',
  'k.h.s.h.s.s.ssss',
];
/** The bass's hits in a bar, R its root and r an octave up. */
export const WALK = [
  'R.R.r.R.R.R.r.R.',
  'R.RrR.rRR.RrR.rR',
  'R.RrR.rRR.RrR.rR',
  'R.......R...r...',
];

/**
 * The menus' theme, 8-bit: thirty-two bars in E minor at 105 bpm, a chord every bar or half bar.
 * The lead on the soft triangle, then on a pulse, then wide and with an echo at the climax, then
 * back on the triangle with an echo over a thinner beat; under it a sixteenth arpeggio of the
 * chord, an octave bass on the triangle and noise drums. Rhythmic, never shrill: the thin pulses
 * stay quiet. Mono at MUSIC_RATE, deterministic, its end joining its start.
 */
export const anthem = (): Float32Array => {
  const mix = new Float32Array(TICK * 512);
  for (let s = 0; s < 512; s++) {
    const [at, sec, i] = [s * TICK, s >> 7, s & 15];
    const [root, ...notes] = HARMONY[CHANGES[s >> 3]];
    const line = THEME[sec];
    const c = line[s & 127];
    let k = 1;
    if (c >= 'a') {
      while (line[(s + k) & 127] == '.') {
        k++;
      }
      const f = hz(key(c));
      const sing = (j: number) => f * (1 + 0.006 * Math.sin(j / 700) * Math.min(1, j / TICK / 4));
      // Triangle in the first and last sections, a pulse between, the climax's the widest.
      const [wave, duty, vol] = [
        [1, 0, 0.3],
        [0, 0.25, 0.14],
        [0, 0.5, 0.15],
        [1, 0, 0.28],
      ][sec];
      for (let e = 0; e < (sec > 1 ? 2 : 1); e++) {
        chip(
          mix,
          at + 3 * e * TICK,
          (k - 0.3) * TICK,
          sing,
          wave,
          duty,
          vol * 0.4 ** e,
          6 * TICK,
          0.5,
        );
      }
    }
    // The arpeggio: the chord's notes up and back, a sixteenth each, short, in a quiet thin pulse.
    if (sec < 3 || i & 2) {
      const n = notes[[0, 1, 2, 1][i & 3]] + (sec == 2 ? 12 : 0);
      chip(mix, at, 0.8 * TICK, () => hz(n), 0, 0.125, sec == 2 ? 0.05 : 0.06, TICK, 0.2);
    }
    const w = WALK[sec][i];
    if (w != '.') {
      const f = hz(root + (w == 'r' ? 12 : 0));
      chip(mix, at, 1.6 * TICK, () => f, 1, 0, 0.38, 2 * TICK, 0.6);
    }
    const d = KIT_MENU[sec == 2 && s >> 4 == 23 ? 4 : sec][i];
    if (d == 'k') {
      chip(mix, at, TICK, j => 150 * 2 ** (-j / 900), 1, 0, 0.55, TICK);
    } else if (d == 's') {
      chip(mix, at, 1.2 * TICK, () => 6000, 2, 1, 0.16, 1.2 * TICK);
    } else if (d == 'h') {
      chip(mix, at, TICK / 3, () => MUSIC_RATE, 2, 6, 0.06, TICK / 3);
    }
  }
  // No beat to fold in: each half of the loop has its own.
  return finish(mix, new Float32Array(mix.length / 2));
};
