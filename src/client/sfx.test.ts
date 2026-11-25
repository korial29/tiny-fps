import { describe, expect, it } from 'vitest';
import { FIRES } from '../shared/beach';
import {
  AIRS,
  LAYERS,
  LOOPED,
  MUSIC_RATE,
  RATE,
  SONGS,
  SOUND,
  anthem,
  moon,
  music,
  sky,
  blaze,
  breeze,
  chirr,
  render,
  seam,
  surf,
} from './sfx';
import type { Voice } from './sfx';

const peak = (s: Float32Array) => s.reduce((m, x) => Math.max(m, Math.abs(x)), 0);

/** Two made-up sounds to run the generator on: they stay as they were before the game had its own. */
const SOUNDS: Record<string, Voice[]> = {
  // A noise crack over a short thump, and a saw and a square falling out of tune over grit.
  crack: [
    [3, 7000, -0.5, 0.002, 0, 0.06, 0, 0.6, 0, 1, 0.8],
    [0, 220, -5, 0.002, 0, 0.075, 0, 0.3, 0, 1, 0.5],
  ],
  growl: [
    [1, 160, -1.5, 0.003, 0.04, 0.22, 0.2, 0.5, 0, 1, 0.6],
    [0, 83, -1, 0.003, 0.04, 0.22, 0, 0.3, 0, 1, 0.4],
    [3, 3000, 0, 0.002, 0, 0.12, 0, 0.4, 0, 1, 0.5],
  ],
  // A late voice: it starts 0.22 s after the first.
  late: [
    [2, 55, -1, 0.01, 0.01, 0.12, 0, 1, 0, 1, 0.9],
    [2, 48, -1, 0.01, 0.01, 0.14, 0, 1, 0, 1, 0.6, 0.22],
  ],
};
const LAYERS_FIXTURE = Object.values(SOUNDS);

describe.each(Object.keys(SOUNDS))('%s', name => {
  const id = Object.keys(SOUNDS).indexOf(name);
  const s = render(id, LAYERS_FIXTURE);

  it('is deterministic', () => {
    expect(render(id, LAYERS_FIXTURE)).toEqual(s);
  });

  it('is audible and within [-1, 1]', () => {
    expect(peak(s)).toBeGreaterThan(0.3);
    expect(peak(s)).toBeLessThanOrEqual(1);
  });

  it('starts and ends silent: no click', () => {
    expect(Math.abs(s[0])).toBeLessThan(0.01);
    expect(Math.abs(s[s.length - 1])).toBeLessThan(0.01);
  });

  it('lasts between 30 ms and a second', () => {
    expect(s.length).toBeGreaterThan(0.03 * RATE);
    expect(s.length).toBeLessThan(RATE);
  });
});

describe('render', () => {
  it('delays a voice by its start, and is as long as the latest one ends', () => {
    const id = Object.keys(SOUNDS).indexOf('late');
    const s = render(id, LAYERS_FIXTURE);
    expect(s.length).toBe(Math.round(0.22 * RATE) + Math.ceil((0.01 + 0.01 + 0.14) * RATE));
    // Between the two thumps the first has decayed: the second is not there yet.
    expect(peak(s.subarray(0.17 * RATE, 0.2 * RATE))).toBeLessThan(0.1);
    expect(peak(s.subarray(0.25 * RATE, 0.3 * RATE))).toBeGreaterThan(0.1);
  });
});

const rms = (s: Float32Array) => Math.sqrt(s.reduce((m, x) => m + x * x, 0) / s.length);
/** Zero crossings a second. */
const crossings = (s: Float32Array) =>
  s.reduce((n, x, i) => n + +(i > 0 && s[i - 1] < 0 !== x < 0), 0) / (s.length / RATE);
/** The sound by its name in SOUND. */
const sound = (name: keyof typeof SOUND) => render(SOUND[name], LAYERS);
/**
 * The pitch of `s` at `t`: the shortest lag from `lag` on that carries most of the energy, walked
 * up to its top. The shortest, as every other period of a rasp is louder and twice the period
 * matches better.
 */
const pitch = (s: Float32Array, t: number, lag = 70) => {
  const a = Math.round(t * RATE);
  const c = (l: number) => s.subarray(a, a + 1200).reduce((m, x, i) => m + x * s[a + i + l], 0);
  while (c(lag) < 0.6 * c(0)) {
    lag++;
  }
  while (c(lag + 1) > c(lag)) {
    lag++;
  }
  return RATE / lag;
};

describe('the sounds of the game', () => {
  it('are one entry per id, and the looped ones are the wind, the scrape, the hum, the buzz, the gun’s charge, the rover’s engine and skid, the ship’s jet, the Hunter’s radio static and his cannon’s tracking hum', () => {
    expect(LAYERS).toHaveLength(Object.keys(SOUND).length);
    expect(Object.values(SOUND).sort((a, b) => a - b)).toEqual(LAYERS.map((_, i) => i));
    expect(LOOPED).toEqual([
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
    ]);
  });

  describe.each(Object.entries(SOUND).filter(([, id]) => !LOOPED.includes(id)))('%s', (_, id) => {
    const s = render(id, LAYERS);

    it('is deterministic, audible and within [-1, 1]', () => {
      expect(render(id, LAYERS)).toEqual(s);
      expect(peak(s)).toBeGreaterThan(0.3);
      expect(peak(s)).toBeLessThanOrEqual(1);
    });

    it('starts and ends silent, and is short', () => {
      expect(Math.abs(s[0])).toBeLessThan(0.01);
      expect(Math.abs(s[s.length - 1])).toBeLessThan(0.01);
      expect(s.length).toBeGreaterThan(0.03 * RATE);
      // The flag sounds are phrases, up to a second; the harpoon's unfolding lasts as long as it
      // (HARPOON_DRAW, 1.1 s) and its lock rings after it.
      expect(s.length).toBeLessThan(
        (id == SOUND.HARPOON_OPEN ? 1.4 : id >= SOUND.TAKE ? 1 : 0.4) * RATE,
      );
    });
  });

  it('give the capture a longer phrase than the take, and the drop a lower pitch than the return', () => {
    expect(sound('CAPTURE').length).toBeGreaterThan(sound('TAKE').length * 3);
    expect(sound('CAPTURE').length).toBeGreaterThan(0.6 * RATE);
    // Zero crossings: the drop is a fall from 330 Hz, the return a chime from 659 up.
    expect(crossings(sound('DROP'))).toBeLessThan(crossings(sound('RETURN')));
  });

  it('give the gun seven sounds: a shot, the hit, hurt, down, the pickups and the empty click', () => {
    const gun = ['LASER', 'HIT', 'HURT', 'DOWN', 'GUN', 'PACK', 'DRY'] as const;
    expect(gun.map(n => SOUND[n])).toEqual([16, 17, 18, 19, 20, 21, 22]);
  });

  it('make the shot fall from the treble to the bass, short and clean enough for 8.6 a second', () => {
    const s = sound('LASER');
    // Under the 116 ms between two shots, even played at the lowest pitch combat.ts gives it.
    expect(s.length / RATE / 0.94).toBeLessThan(0.116);
    // The attack is clean: the loudest sample in the first 5 ms, and the last third dies away.
    expect(peak(s.subarray(0, 0.005 * RATE))).toBe(peak(s));
    expect(rms(s.subarray(0.07 * RATE))).toBeLessThan(0.3 * rms(s.subarray(0, 0.03 * RATE)));
    // High at the start, low at the end: zero crossings give the pitch.
    const hz = (a: number, b: number) => crossings(s.subarray(a * RATE, b * RATE)) / 2;
    expect(hz(0.001, 0.015)).toBeGreaterThan(1000);
    expect(hz(0.06, 0.09)).toBeLessThan(500);
    expect(rms(s)).toBeLessThan(0.5);
  });

  it('make the rail gun’s crackle short, to play again and again, loud and noisy', () => {
    expect(SOUND.RAIL).toBe(28);
    const s = sound('RAIL');
    expect(s.length / RATE).toBeLessThan(0.15);
    expect(peak(s)).toBeGreaterThan(0.3);
    // Noisy: it crosses zero thousands of times a second.
    expect(crossings(s) / (s.length / RATE)).toBeGreaterThan(3000);
  });

  it('make the laser rifle’s shot short and deep in the bass, under the gun’s', () => {
    const s = sound('LASE');
    expect(s.length / RATE).toBeLessThan(0.1);
    expect(peak(s)).toBeGreaterThan(0.3);
    // About 160 crossings a second, two octaves under the old shot's 600.
    expect(crossings(s)).toBeLessThan(crossings(sound('LASER')) / 5);
  });

  it('make the splash of a plasma ball short, loud and noisier than the shot', () => {
    expect(SOUND.SPLASH).toBe(26);
    const s = sound('SPLASH');
    expect(s.length / RATE).toBeLessThan(0.25);
    expect(peak(s)).toBeGreaterThan(0.5);
    expect(crossings(s)).toBeGreaterThan(crossings(sound('LASER')) * 1.5);
  });

  it('make the blast of a charged shot long and deep: half a second and more, diving under the plain shot', () => {
    expect(SOUND.BLAST).toBe(27);
    const s = sound('BLAST');
    expect(s.length / RATE).toBeGreaterThan(0.5);
    expect(s.length / RATE).toBeGreaterThan((sound('LASER').length / RATE) * 4);
    // Clean at the start, and lower at the end than at the start.
    expect(peak(s.subarray(0, 0.01 * RATE))).toBeGreaterThan(0.3);
    const hz = (a: number, b: number) => crossings(s.subarray(a * RATE, b * RATE)) / 2;
    expect(hz(0.3, 0.45)).toBeLessThan(hz(0.005, 0.05));
  });

  it('make the hit a short high ping of one to two kHz that dies away fast, like Quake 3', () => {
    const s = sound('HIT');
    expect(s.length / RATE).toBeLessThan(0.2);
    // Zero crossings give twice the pitch of the main tone.
    const hz = (a: number, b: number) =>
      s
        .subarray(a * RATE, b * RATE)
        .reduce((n, x, i, v) => n + +(i > 0 && v[i - 1] < 0 !== x < 0), 0) /
      (b - a) /
      2;
    expect(hz(0.002, 0.03)).toBeGreaterThan(1000);
    expect(hz(0.002, 0.03)).toBeLessThan(2600);
    // Gone: a hundredth of the start's level 120 ms in.
    expect(peak(s.subarray(0.12 * RATE))).toBeLessThan(0.1 * peak(s.subarray(0, 0.03 * RATE)));
  });

  it('make hurt lower than the hit, and going down the longest of the gun sounds', () => {
    expect(crossings(sound('HURT'))).toBeLessThan(crossings(sound('HIT')));
    for (const n of ['LASER', 'HIT', 'HURT', 'GUN', 'PACK', 'DRY'] as const) {
      expect(sound('DOWN').length).toBeGreaterThan(sound(n).length);
    }
  });

  it('make the dry click the shortest', () => {
    for (const n of ['LASER', 'HIT', 'HURT', 'DOWN', 'GUN', 'PACK'] as const) {
      expect(sound('DRY').length).toBeLessThan(sound(n).length);
    }
  });

  it('make the death cry longer than the cry of pain, both lower than the hit', () => {
    expect(sound('DEATH').length).toBeGreaterThan(sound('PAIN').length);
    const hit = crossings(sound('HIT')) / sound('HIT').length;
    for (const n of ['PAIN', 'DEATH'] as const) {
      expect(crossings(sound(n)) / sound(n).length).toBeLessThan(hit);
    }
  });

  it('reloads the harpoon with a very short slide and a brief click (the user, 2026-11-25)', () => {
    const s = sound('HARPOON_RELOAD');
    const at = (a: number, b: number) => rms(s.subarray(a * RATE, b * RATE));
    expect(s.length / RATE).toBeLessThan(0.3);
    // The slide, then the click as the bolt seats (harpoonFeed() over 0.26 s) louder than it.
    expect(at(0.03, 0.15)).toBeGreaterThan(0.02);
    expect(at(0.23, 0.245)).toBeGreaterThan(2 * at(0.17, 0.2));
  });

  it('make the death cry a brief cry of pain (the user, 2026-11-17): loud at once, falling, under half a second', () => {
    for (const n of ['DEATH', 'HER_DEATH'] as const) {
      const s = sound(n);
      const at = (a: number, b: number) => rms(s.subarray(a * RATE, b * RATE));
      expect(s.length / RATE).toBeLessThan(0.45);
      expect(at(0, 0.04)).toBeGreaterThan(0.2);
      expect(at(0.2, 0.25)).toBeLessThan(0.8 * at(0.03, 0.08));
      expect(at(s.length / RATE - 0.06, s.length / RATE)).toBeLessThan(0.02);
      // Quieter than the groans: it was too loud.
      expect(Math.max(...s.map(Math.abs))).toBeLessThan(0.6);
    }
  });

  it('throw his cry up to about 330 Hz at once, then let it fall', () => {
    const s = sound('DEATH');
    expect(pitch(s, 0.04, 110)).toBeGreaterThan(290);
    expect(pitch(s, 0.04, 110)).toBeLessThan(380);
    expect(pitch(s, 0.25, 110)).toBeLessThan(0.9 * pitch(s, 0.04, 110));
  });

  it('give the woman a cry of her own, half as high again as his', () => {
    const [him, her] = [sound('DEATH'), sound('HER_DEATH')];
    expect([SOUND.HER_DEATH, SOUND.GROAN, SOUND.HER_GROAN]).toEqual([71, 72, 73]);
    expect(pitch(her, 0.04, 30)).toBeGreaterThan(480);
    expect(pitch(her, 0.04, 30)).toBeLessThan(650);
    expect(pitch(her, 0.04, 30) / pitch(him, 0.04, 110)).toBeGreaterThan(1.5);
  });

  it('cut the groans off in the throat: short, loud, then only a breath, lower than the screams', () => {
    // Zero crossings while the voice is on: a breath counts as many as a cry.
    const voiced = (s: Float32Array) => crossings(s.subarray(0.08 * RATE, 0.24 * RATE));
    for (const [n, scream] of [
      ['GROAN', 'DEATH'],
      ['HER_GROAN', 'HER_DEATH'],
    ] as const) {
      const s = sound(n);
      const at = (a: number, b: number) => rms(s.subarray(a * RATE, b * RATE));
      expect(s.length / RATE).toBeLessThan(0.6);
      expect(at(0.05, 0.2)).toBeGreaterThan(0.25);
      expect(at(0.33, 0.4)).toBeLessThan(0.1 * at(0.05, 0.2));
      expect(voiced(s)).toBeLessThan(voiced(sound(scream)));
    }
    expect(voiced(sound('HER_GROAN'))).toBeGreaterThan(voiced(sound('GROAN')));
  });

  it('give the katana three sounds: the shing, the swish of a cut and the zap of a hit', () => {
    const blade = ['SHING', 'SWISH', 'ZAP'] as const;
    expect(blade.map(n => SOUND[n])).toEqual([23, 24, 25]);
    for (const n of blade) {
      const s = sound(n);
      expect(s.every(Number.isFinite)).toBe(true);
      expect(rms(s)).toBeGreaterThan(0.03);
      expect(LOOPED).not.toContain(SOUND[n]);
    }
  });

  it('make the swish short enough that a slash, played at 0.8, is under a third of a second', () => {
    expect(sound('SWISH').length / RATE / 0.8).toBeLessThan(0.33);
  });

  it('make the shing a ring that lasts, over a quick scrape: still loud 150 ms in', () => {
    const s = sound('SHING');
    expect(peak(s.subarray(0.15 * RATE, 0.2 * RATE))).toBeGreaterThan(0.1);
    expect(s.length).toBeGreaterThan(sound('SWISH').length * 1.5);
  });

  it('make the zap a short punch: under a quarter second and loud', () => {
    const z = sound('ZAP');
    expect(z.length / RATE).toBeLessThan(0.25);
    expect(peak(z)).toBeGreaterThan(0.5);
  });

  it('make the step on a wall lighter than on a floor, and the dash stronger than the double jump', () => {
    expect(rms(sound('WALLSTEP'))).toBeLessThan(rms(sound('STEP')) * 0.7);
    expect(rms(sound('DASH'))).toBeGreaterThan(rms(sound('DOUBLE')) * 1.3);
    expect(rms(sound('LAND'))).toBeGreaterThan(rms(sound('JUMP')) * 1.5);
  });
});

describe('seam', () => {
  it('drops the cross-fade from the length and joins the end to the start', () => {
    const sine = Float32Array.from({ length: 5000 }, (_, i) => Math.sin(i * 0.1));
    const out = seam(sine, 500);
    expect(out).toHaveLength(4500);
    // The first sample is the one that follows the last in the original: no step between them.
    expect(Math.abs(out[0] - out[out.length - 1])).toBeLessThan(0.11);
    expect(out[0]).toBe(sine[4500]);
    expect(out[1000]).toBe(sine[1000]);
  });

  it('keeps the power through the cross-fade, for noise', () => {
    let seed = 1;
    const noise = Float32Array.from(
      { length: 22000 },
      () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1,
    );
    const out = seam(noise, 2000);
    expect(rms(out.subarray(0, 2000)) / rms(out.subarray(2000))).toBeGreaterThan(0.9);
    expect(rms(out.subarray(0, 2000)) / rms(out.subarray(2000))).toBeLessThan(1.1);
  });

  it.each(LOOPED)(
    'makes the loop %i a bed that does not click, two seconds long (the Hunter’s static six)',
    id => {
      const s = seam(render(id, LAYERS));
      expect(Math.abs(s.length / RATE - (id == SOUND.STATIC ? 6 : 2))).toBeLessThan(0.01);
      expect(rms(s)).toBeGreaterThan(0.05);
      expect(rms(s)).toBeLessThan(0.4);
      const steps = s.map((x, i) => Math.abs(x - s[(i + 1) % s.length]));
      const wrap = steps[steps.length - 1];
      expect(wrap).toBeLessThanOrEqual(steps.subarray(0, -1).reduce((m, x) => Math.max(m, x), 0));
      expect(peak(s)).toBeLessThan(1.1);
    },
  );
});

describe('the shoulder cannon’s tracking (the user, 2026-11-23: after the Predator’s)', () => {
  it('clicks three times 75 ms apart, then breathes', () => {
    const s = sound('HUNTER_TRACK');
    const at = (t: number) => rms(s.subarray(Math.round(t * RATE), Math.round((t + 0.012) * RATE)));
    for (const click of [0, 0.075, 0.15]) {
      expect(at(click)).toBeGreaterThan(4 * at(click + 0.04));
    }
    expect(at(0.36)).toBeGreaterThan(4 * at(0.25));
  });

  it('hums at 1.5 kHz while it tracks', () => {
    const s = seam(render(SOUND.HUNTER_SEEK, LAYERS));
    // The hum's strength at `hz`, over its first 0.2 s.
    const tone = (hz: number) => {
      let [re, im] = [0, 0];
      for (let i = 0; i < RATE / 5; i++) {
        re += s[i] * Math.cos((2 * Math.PI * hz * i) / RATE);
        im += s[i] * Math.sin((2 * Math.PI * hz * i) / RATE);
      }
      return Math.hypot(re, im);
    };
    expect(tone(1507)).toBeGreaterThan(5 * tone(1000));
    expect(tone(1217)).toBeGreaterThan(5 * tone(1000));
  });
});

describe('the Hunter’s views', () => {
  it('beat a heart twice a loop, under a second, its lub and dub apart', () => {
    const s = sound('HEARTBEAT');
    expect(s.length / RATE).toBeGreaterThan(0.85);
    expect(s.length / RATE).toBeLessThan(0.95);
    const at = (t: number) => rms(s.subarray(Math.round(t * RATE), Math.round((t + 0.05) * RATE)));
    expect(at(0.02)).toBeGreaterThan(5 * at(0.6));
    expect(at(0.29)).toBeGreaterThan(5 * at(0.6));
  });

  it('give the radio a slow growl: in its first seconds of six, quiet in its last two', () => {
    const s = seam(render(SOUND.STATIC, LAYERS));
    const span = (a: number, b: number) =>
      rms(s.subarray(Math.round(a * RATE), Math.round(b * RATE)));
    expect(span(0.6, 2.4)).toBeGreaterThan(3 * span(4, 5.9));
  });
});

describe('music', () => {
  // Best of three, loose: the other test files compete for the CPU (about 20 ms when alone).
  const times: number[] = [];
  const m = Array.from({ length: 3 }, () => {
    const t0 = performance.now();
    const out = music();
    times.push(performance.now() - t0);
    return out;
  })[0];
  const beats = (m.length * 84) / (MUSIC_RATE * 60);

  it('is deterministic', () => {
    expect(Buffer.from(music().buffer).equals(Buffer.from(m.buffer))).toBe(true);
  });

  it('is a whole number of beats at 84 bpm, sixteen bars: three quarters of a minute', () => {
    expect(beats).toBe(Math.round(beats));
    expect(beats / 4).toBe(16);
    expect(m.length / MUSIC_RATE).toBeGreaterThan(45);
  });

  it('is quiet, but not silent', () => {
    expect(peak(m)).toBeLessThanOrEqual(0.35 + 1e-6);
    expect(peak(m)).toBeGreaterThan(0.3);
    expect(rms(m)).toBeLessThan(0.1);
  });

  it('loops without a jump: the step from the end to the start is no bigger than any other', () => {
    let most = 0;
    for (let i = 1; i < m.length; i++) {
      most = Math.max(most, Math.abs(m[i] - m[i - 1]));
    }
    expect(Math.abs(m[0] - m[m.length - 1])).toBeLessThanOrEqual(most);
    expect(Math.abs(m[0] - m[m.length - 1])).toBeLessThan(0.02);
  });

  it('is light: under a third of its energy below 200 Hz', () => {
    // Two one-pole low-passes at 200 Hz.
    const a = 1 - Math.exp((-2 * Math.PI * 200) / MUSIC_RATE);
    let [y1, y2, low, all] = [0, 0, 0, 0];
    for (const x of m) {
      y1 += (x - y1) * a;
      y2 += (y1 - y2) * a;
      low += y2 * y2;
      all += x * x;
    }
    expect(low / all).toBeLessThan(1 / 3);
  });

  it('renders fast', () => {
    expect(Math.min(...times)).toBeLessThan(400);
  });
});

describe('the moon\u2019s music', () => {
  // Best of three. About 35 ms alone, cold; a loaded CI runner took 576 ms, the full suite here up
  // to 750: its loops wait longer than music()'s for V8 to optimize them on a starved machine.
  const times: number[] = [];
  const m = Array.from({ length: 3 }, () => {
    const t0 = performance.now();
    const out = moon();
    times.push(performance.now() - t0);
    return out;
  })[0];
  const sixteenths = (m.length * 126 * 4) / (MUSIC_RATE * 60);

  it('is deterministic', () => {
    expect(Buffer.from(moon().buffer).equals(Buffer.from(m.buffer))).toBe(true);
  });

  it('is thirty-two bars at 126 bpm, a whole number of samples a sixteenth: a minute', () => {
    expect(sixteenths).toBe(32 * 16);
    expect((MUSIC_RATE * 15) % 126).toBe(0);
    expect(m.length / MUSIC_RATE).toBeCloseTo(61, 0);
  });

  it('is as loud as the other music, its squares no louder', () => {
    expect(peak(m)).toBeCloseTo(0.26, 5);
    const ratio = rms(m) / rms(music());
    expect(ratio).toBeGreaterThan(0.8);
    expect(ratio).toBeLessThan(1.2);
  });

  it('loops without a jump: the step from the end to the start is no bigger than any other', () => {
    let most = 0;
    for (let i = 1; i < m.length; i++) {
      most = Math.max(most, Math.abs(m[i] - m[i - 1]));
    }
    expect(Math.abs(m[0] - m[m.length - 1])).toBeLessThanOrEqual(most);
  });

  it('plays its sixteen bars of chords twice, the second time otherwise', () => {
    const half = m.length / 2;
    let diff = 0;
    for (let i = 0; i < half; i++) {
      diff += Math.abs(m[i] - m[i + half]);
    }
    expect(diff / half).toBeGreaterThan(0.01);
  });

  it('renders fast', () => {
    expect(Math.min(...times)).toBeLessThan(1000);
  });

  it('is the moon\u2019s alone: Highline has its own, the other maps play music()', () => {
    expect(SONGS.tranquility).toBe(moon);
    expect(SONGS.highline).toBe(sky);
    expect(SONGS.rooftops).toBeUndefined();
  });
});

describe('Highline\u2019s music (the user, 2026-11-25: 8-bit, more rhythm, still airy and light)', () => {
  // Best of three, as the moon's.
  const times: number[] = [];
  const m = Array.from({ length: 3 }, () => {
    const t0 = performance.now();
    const out = sky();
    times.push(performance.now() - t0);
    return out;
  })[0];

  it('is deterministic', () => {
    expect(Buffer.from(sky().buffer).equals(Buffer.from(m.buffer))).toBe(true);
  });

  it('is thirty-two bars at 135 bpm, a whole number of samples a sixteenth', () => {
    expect((m.length * 135 * 4) / (MUSIC_RATE * 60)).toBe(32 * 16);
    expect((MUSIC_RATE * 15) % 135).toBe(0);
    expect(m.length / MUSIC_RATE).toBeCloseTo(57, 0);
  });

  it('peaks as the moon\u2019s and is about as loud as the other music', () => {
    expect(peak(m)).toBeCloseTo(0.26, 5);
    const ratio = rms(m) / rms(music());
    expect(ratio).toBeGreaterThan(0.6);
    expect(ratio).toBeLessThan(1.2);
  });

  it('loops without a jump: the step from the end to the start is no bigger than any other', () => {
    let most = 0;
    for (let i = 1; i < m.length; i++) {
      most = Math.max(most, Math.abs(m[i] - m[i - 1]));
    }
    expect(Math.abs(m[0] - m[m.length - 1])).toBeLessThanOrEqual(most);
  });

  it('renders fast', () => {
    expect(Math.min(...times)).toBeLessThan(1000);
  });
});

describe('the menus\u2019 theme (the user, 2026-11-24: 8-bit, rhythmic, a chord a bar or less)', () => {
  // Best of three, as the moon's: about 50 ms alone, more on a loaded runner.
  const times: number[] = [];
  const m = Array.from({ length: 3 }, () => {
    const t0 = performance.now();
    const out = anthem();
    times.push(performance.now() - t0);
    return out;
  })[0];

  it('is deterministic', () => {
    expect(Buffer.from(anthem().buffer).equals(Buffer.from(m.buffer))).toBe(true);
  });

  it('is thirty-two bars at 105 bpm, a whole number of samples a sixteenth', () => {
    expect((m.length * 105 * 4) / (MUSIC_RATE * 60)).toBe(32 * 16);
    expect((MUSIC_RATE * 15) % 105).toBe(0);
    expect(m.length / MUSIC_RATE).toBeCloseTo(73, 0);
  });

  it('peaks as the moon\u2019s and sits a little under the other music', () => {
    expect(peak(m)).toBeCloseTo(0.26, 5);
    const ratio = rms(m) / rms(music());
    expect(ratio).toBeGreaterThan(0.6);
    expect(ratio).toBeLessThan(1);
  });

  it('loops without a jump: the step from the end to the start is no bigger than any other', () => {
    let most = 0;
    for (let i = 1; i < m.length; i++) {
      most = Math.max(most, Math.abs(m[i] - m[i - 1]));
    }
    expect(Math.abs(m[0] - m[m.length - 1])).toBeLessThanOrEqual(most);
  });

  it('has no half like the other: each section its own lead and beat', () => {
    const half = m.length / 2;
    let diff = 0;
    for (let i = 0; i < half; i++) {
      diff += Math.abs(m[i] - m[i + half]);
    }
    expect(diff / half).toBeGreaterThan(0.01);
  });

  it('renders fast', () => {
    expect(Math.min(...times)).toBeLessThan(1000);
  });
});

describe('the laser rifle\u2019s shot', () => {
  it('is short enough for 20 a second, and low: in the bass and the middle', () => {
    const s = render(SOUND.LASE);
    expect(s.length / RATE).toBeLessThan(0.08);
    // Zero crossings: under 1 kHz on average over its loud part.
    const loud = s.subarray(0, Math.round(0.04 * RATE));
    let n = 0;
    for (let i = 1; i < loud.length; i++) {
      n += +(Math.sign(loud[i]) !== Math.sign(loud[i - 1]));
    }
    expect(n / 2 / 0.04).toBeLessThan(1000);
  });
});

describe('the weapons coming on (the user, 2026-11-09)', () => {
  it('begin with the click of the button at once (combat.ts plays them at the press), then power up', () => {
    for (const name of ['BOOT', 'IGNITE'] as const) {
      const s = sound(name);
      expect(rms(s.subarray(0, 0.03 * RATE))).toBeGreaterThan(0.01);
      expect(s.length).toBeLessThan(0.7 * RATE);
    }
  });
});

describe('the rover', () => {
  const engine = seam(render(SOUND.ENGINE));
  const skid = seam(render(SOUND.SKID));
  /** The level of each 50 ms of a loop over the level of the whole. */
  const levels = (s: Float32Array) =>
    Array.from(
      { length: Math.floor(s.length / (0.05 * RATE)) },
      (_, i) => rms(s.subarray(i * 0.05 * RATE, (i + 1) * 0.05 * RATE)) / rms(s),
    );
  /** How much of a tone at `hz` there is in `s`: its amplitude. */
  const tone = (s: Float32Array, hz: number) => {
    let [re, im] = [0, 0];
    s.forEach((x, i) => {
      re += x * Math.cos((2 * Math.PI * hz * i) / RATE);
      im += x * Math.sin((2 * Math.PI * hz * i) / RATE);
    });
    return (2 * Math.hypot(re, im)) / s.length;
  };

  it('has three sounds after all the others, whose ids stay: an engine and a skid that loop, a thud that does not', () => {
    expect([SOUND.ENGINE, SOUND.THUD, SOUND.SKID]).toEqual([40, 41, 42]);
    expect(SOUND.CHARGE).toBe(39);
    expect(LOOPED).toContain(SOUND.ENGINE);
    expect(LOOPED).toContain(SOUND.SKID);
    expect(LOOPED).not.toContain(SOUND.THUD);
  });

  it('has an engine of tones: a low motor, its whine two octaves up and a whistle over it', () => {
    const body = engine.subarray(0.2 * RATE, 1.8 * RATE);
    expect(tone(body, 49.08)).toBeGreaterThan(0.1);
    expect(tone(body, 195.93)).toBeGreaterThan(0.1);
    expect(tone(body, 588.04)).toBeGreaterThan(0.03);
    // Nothing between them: tones, not a rumble.
    expect(tone(body, 130)).toBeLessThan(0.02);
    expect(tone(body, 400)).toBeLessThan(0.02);
    // Low enough to be played an octave up at speed.
    expect(crossings(engine)).toBeLessThan(1500);
  });

  it('keeps the engine’s level through the loop’s join, whatever pitch it is played at: no throb every two seconds', () => {
    for (const l of levels(engine)) {
      expect(l).toBeGreaterThan(0.85);
      expect(l).toBeLessThan(1.2);
    }
  });

  it('makes a landing a deep thud, longer and heavier than a step’s, that dies away', () => {
    const s = sound('THUD');
    expect(s.length).toBeGreaterThan(sound('LAND').length * 1.3);
    expect(s.length / RATE).toBeLessThan(0.5);
    expect(peak(s.subarray(0, 0.03 * RATE))).toBe(peak(s));
    expect(peak(s)).toBeGreaterThan(0.8);
    expect(rms(s)).toBeGreaterThan(rms(sound('LAND')));
    // In the bass: a few hundred zero crossings a second in its loud part.
    expect(crossings(s.subarray(0, 0.15 * RATE))).toBeLessThan(500);
    expect(rms(s.subarray(0.22 * RATE))).toBeLessThan(0.25 * rms(s.subarray(0, 0.05 * RATE)));
  });

  it('makes the skid a steady bed of grit, lower than the scrape of a slide', () => {
    expect(crossings(skid)).toBeGreaterThan(500);
    expect(crossings(skid)).toBeLessThan(crossings(seam(render(SOUND.SCRAPE))) / 2);
    for (const l of levels(skid)) {
      expect(l).toBeGreaterThan(0.75);
      expect(l).toBeLessThan(1.3);
    }
    // Noise, not a tone.
    expect(tone(skid, 700)).toBeLessThan(0.05);
  });
});

describe('the pickups', () => {
  it('sound each their own, short (the user, 2026-11-14): health, ammo, armour', () => {
    const [pack, ammo, armor] = (['PACK', 'AMMO', 'ARMOR'] as const).map(sound);
    expect([SOUND.AMMO, SOUND.ARMOR]).toEqual([56, 57]);
    for (const s of [ammo, armor]) {
      expect(s.length / RATE).toBeGreaterThan(0.1);
      expect(s.length / RATE).toBeLessThan(0.8);
      expect(Math.max(...s.map(Math.abs))).toBeGreaterThan(0.1);
    }
    // The armour's rings the longest, the ammo's is the shortest.
    expect(armor.length).toBeGreaterThan(pack.length);
    expect(ammo.length).toBeLessThan(armor.length);
  });
});

describe('a vehicle’s damage', () => {
  it('keeps its four sounds at fixed ids as more sounds are added', () => {
    expect([SOUND.HULL, SOUND.ARC, SOUND.WRECK, SOUND.CRUMBLE]).toEqual([47, 48, 49, 50]);
    expect([SOUND.DOOR, SOUND.SHUT]).toEqual([45, 46]);
    expect([SOUND.ALARM, SOUND.STRIKE]).toEqual([58, 59]);
    expect(LAYERS).toHaveLength(Object.keys(SOUND).length);
    for (const id of [47, 48, 49, 50]) {
      expect(LOOPED).not.toContain(id);
    }
  });

  it('makes the hit and the arc short, the explosion the longest and the loudest in the bass', () => {
    const [hull, arc, wreck, crumble] = [47, 48, 49, 50].map(id => render(id));
    const secs = (s: Float32Array) => s.length / RATE;
    const level = (s: Float32Array) => Math.sqrt(s.reduce((a, x) => a + x * x, 0) / s.length);
    for (const s of [hull, arc, wreck, crumble]) {
      expect(level(s)).toBeGreaterThan(0.02);
      expect(Math.max(...s.map(Math.abs))).toBeLessThanOrEqual(1);
    }
    expect(secs(hull)).toBeLessThan(0.4);
    expect(secs(arc)).toBeLessThan(0.3);
    expect(secs(wreck)).toBeGreaterThan(0.9);
    expect(secs(crumble)).toBeGreaterThan(0.8);
    /** The share of the changes of sign: low for a rumble, high for a hiss. */
    const bright = (s: Float32Array) =>
      s.reduce((n, x, i) => n + +(i > 0 && x * s[i - 1] < 0), 0) / s.length;
    expect(bright(wreck)).toBeLessThan(bright(arc));
    expect(bright(wreck)).toBeLessThan(bright(crumble));
  });
});

describe('the ship (the user, 2026-11-12)', () => {
  it('has three sounds after all the others, whose ids stay: a blaster, a jet that loops, a crash', () => {
    expect([SOUND.BLASTER, SOUND.JET, SOUND.CRASH]).toEqual([51, 52, 53]);
    expect(LOOPED).toContain(SOUND.JET);
    expect(LOOPED).not.toContain(SOUND.BLASTER);
    expect(LOOPED).not.toContain(SOUND.CRASH);
  });

  it('makes the blaster a chirp that falls fast from the treble: bright at first, far lower at its end', () => {
    const s = sound('BLASTER');
    expect(s.length / RATE).toBeLessThan(0.3);
    expect(peak(s.subarray(0, 0.02 * RATE))).toBeGreaterThan(0.3);
    const [head, tail] = [s.subarray(0, 0.04 * RATE), s.subarray(0.12 * RATE, 0.2 * RATE)];
    expect(crossings(head)).toBeGreaterThan(2500);
    expect(crossings(tail)).toBeLessThan(crossings(head) / 3);
  });

  it('makes the crash longer and heavier than a hit on the hull, in the bass', () => {
    const s = sound('CRASH');
    expect(s.length).toBeGreaterThan(sound('HULL').length);
    expect(rms(s)).toBeGreaterThan(rms(sound('HULL')));
    expect(peak(s)).toBeGreaterThan(0.8);
  });
});

describe('the xenomorph’s sounds', () => {
  it('come after all the others, none looped: a screech for pain, a big roar for death', () => {
    expect([
      SOUND.XENO_HISS,
      SOUND.SHRIEK,
      SOUND.CLAW,
      SOUND.STING,
      SOUND.XENO_PAIN,
      SOUND.XENO_DEATH,
      SOUND.CHITIN,
      SOUND.ACID,
      SOUND.ROAR,
      SOUND.XENO_LAND,
    ]).toEqual([60, 61, 62, 63, 64, 65, 66, 67, 68, 69]);
    for (let id = 60; id <= 69; id++) {
      expect(LOOPED).not.toContain(id);
    }
    // The voice's first oscillator: a screech, not a man's "ugh".
    expect(LAYERS[SOUND.XENO_PAIN][0][1]).toBeGreaterThan(2 * LAYERS[SOUND.PAIN][0][1]);
    // Its death a roar: deeper and longer than a man's death cry (thrown up to 330 Hz), with more
    // sound in it; the roar outlasts it.
    const [roar, scream] = [render(SOUND.XENO_DEATH), render(SOUND.DEATH)];
    const energy = (s: Float32Array) => s.reduce((m, x) => m + x * x, 0);
    expect(LAYERS[SOUND.XENO_DEATH][0][1]).toBeLessThan(330 / 2);
    expect(roar.length).toBeGreaterThan(scream.length);
    expect(energy(roar)).toBeGreaterThan(energy(scream));
  });

  // The voices of a sound: clicks (a square or noise of 10 ms at most), thumps (a falling sine
  // under 100 Hz) and wet rubs (a dull noise wobbling for 50 ms or more).
  const parts = (id: number) => {
    const v = LAYERS[id];
    const len = ([, , , a, s, d]: (typeof v)[number]) => a + s + d;
    return {
      clicks: v.filter(x => (x[0] == 0 || x[0] == 3) && len(x) <= 0.01),
      thumps: v.filter(x => x[0] == 2 && x[1] < 100 && x[2] < 0),
      rubs: v.filter(x => x[0] == 3 && x[7] <= 0.3 && x[6] > 0 && len(x) >= 0.05),
    };
  };

  it('step with dry chitin clicks, wet organic friction and a heavy impact on the stone', () => {
    const { clicks, thumps, rubs } = parts(SOUND.CHITIN);
    // The claws come down one after another, not as one click.
    expect(new Set(clicks.map(x => x[11] ?? 0)).size).toBeGreaterThanOrEqual(3);
    // The weight: deeper than a boot's thump.
    expect(thumps).toHaveLength(1);
    expect(thumps[0][1]).toBeLessThan(LAYERS[SOUND.STEP][0][1]);
    // The wet pad slides after the foot is down.
    expect(rubs).toHaveLength(1);
    expect(rubs[0][11]).toBeGreaterThan(thumps[0][11] ?? 0);
    const [paw, boot] = [render(SOUND.CHITIN), render(SOUND.STEP)];
    expect(paw.length).toBeGreaterThan(boot.length);
    expect(peak(paw)).toBeLessThan(1);
  });

  it('land heavier than they step: deeper, longer and louder, clattering and slapping wet', () => {
    const [step, fall] = [parts(SOUND.CHITIN), parts(SOUND.XENO_LAND)];
    expect(fall.thumps[0][1]).toBeLessThan(step.thumps[0][1]);
    expect(fall.clicks.length).toBeGreaterThanOrEqual(3);
    expect(fall.rubs).toHaveLength(1);
    const [paw, land] = [render(SOUND.CHITIN), render(SOUND.XENO_LAND)];
    expect(land.length).toBeGreaterThan(paw.length);
    expect(rms(land)).toBeGreaterThan(rms(paw));
  });
});

describe('the fists’ glory kill', () => {
  it('bursts a head with a short sound: the thump at once, the splatter ringing on after it', () => {
    const s = render(SOUND.SMASH);
    expect(LOOPED).not.toContain(SOUND.SMASH);
    expect(s.length / RATE).toBeGreaterThan(0.25);
    expect(s.length / RATE).toBeLessThan(0.6);
    const level = (a: number, b: number) => {
      const part = s.subarray(Math.floor(a * RATE), Math.floor(b * RATE));
      return Math.sqrt(part.reduce((n, x) => n + x * x, 0) / part.length);
    };
    // Loudest in its first 50 ms, still heard at 150 ms, then dying.
    expect(level(0, 0.05)).toBeGreaterThan(level(0.15, 0.2));
    expect(level(0.15, 0.2)).toBeGreaterThan(0.01);
    expect(level(0.15, 0.2)).toBeGreaterThan(level(0.3, 0.35));
  });
});

describe('Landfall\u2019s ambience', () => {
  const rms = (s: Float32Array, a = 0, b = s.length) =>
    Math.sqrt(s.subarray(a, b).reduce((sum, x) => sum + x * x, 0) / (b - a));
  const air = AIRS.landfall;
  const BEDS = { surf, breeze, chirr, blaze };
  const times: Record<string, number> = {};
  const made = Object.fromEntries(
    Object.entries(BEDS).map(([name, make]) => {
      const t0 = performance.now();
      const s = make();
      times[name] = performance.now() - t0;
      return [name, s];
    }),
  );
  /** Each bed's volume for a listener at (x, z), at `t`. */
  const heard = (x: number, z: number, t = 0) => {
    const out: number[] = [];
    air.mix([x, 1.6, z], t, out);
    return out;
  };

  it('is Landfall\u2019s alone: the surf, the wind, the insects and the fire', () => {
    expect(Object.keys(AIRS)).toEqual(['landfall']);
    expect(air.beds).toEqual([surf, breeze, chirr, blaze]);
  });

  describe.each(Object.keys(BEDS))('%s', name => {
    const s = made[name];

    it('is deterministic, finite and within [-1, 1]: no clipping', () => {
      expect(
        Buffer.from(BEDS[name as keyof typeof BEDS]().buffer).equals(Buffer.from(s.buffer)),
      ).toBe(true);
      expect(s.every(Number.isFinite)).toBe(true);
      expect(peak(s)).toBeLessThanOrEqual(0.8 + 1e-6);
      expect(peak(s)).toBeGreaterThan(0.2);
      expect(rms(s)).toBeGreaterThan(0.01);
    });

    it('lasts five to twelve seconds and renders fast', () => {
      expect(s.length / MUSIC_RATE).toBeGreaterThanOrEqual(4.8);
      expect(s.length / MUSIC_RATE).toBeLessThanOrEqual(12);
      expect(times[name]).toBeLessThan(300);
    });

    it('loops without a jump: the step from the end to the start is no bigger than any other', () => {
      let most = 0;
      for (let i = 1; i < s.length; i++) {
        most = Math.max(most, Math.abs(s[i] - s[i - 1]));
      }
      expect(Math.abs(s[0] - s[s.length - 1])).toBeLessThanOrEqual(most);
    });

    it('is as loud where it ends as where it starts: no step in the level at the loop', () => {
      const n = MUSIC_RATE / 4;
      const [head, tail] = [rms(s, 0, n), rms(s, s.length - n)];
      expect(head / tail).toBeGreaterThan(0.5);
      expect(head / tail).toBeLessThan(2);
    });
  });

  it('breaks two waves a loop: the surf swells to several times its quietest', () => {
    const s = made.surf;
    const n = MUSIC_RATE / 2;
    const loud = Array.from({ length: 24 }, (_, i) => rms(s, i * n, (i + 1) * n));
    expect(Math.max(...loud) / Math.min(...loud)).toBeGreaterThan(3);
    // The same wave six seconds on, within a little: the weaker ones between differ.
    const peaks = loud.map((v, i) => (v > 0.6 * Math.max(...loud) ? i : -1)).filter(i => i >= 0);
    expect(peaks.some(i => i < 12)).toBe(true);
    expect(peaks.some(i => i >= 12)).toBe(true);
  });

  it('crackles: the fire has clicks well over its rumble', () => {
    expect(peak(made.blaze) / rms(made.blaze)).toBeGreaterThan(5);
    expect(peak(made.breeze) / rms(made.breeze)).toBeLessThan(5);
  });

  it('sings high: the insects are above 4 kHz, the wind is not', () => {
    /** The share of the energy a one-pole low-pass at 2 kHz lets through. */
    const low = (s: Float32Array) => {
      const a = 1 - Math.exp((-2 * Math.PI * 2000) / MUSIC_RATE);
      let [y, kept, all] = [0, 0, 0];
      for (const x of s) {
        y += (x - y) * a;
        kept += y * y;
        all += x * x;
      }
      return kept / all;
    };
    expect(low(made.chirr)).toBeLessThan(0.25);
    expect(low(made.breeze)).toBeGreaterThan(0.4);
  });

  it('is loudest at the waterline for the surf, and still heard at the trees', () => {
    expect(heard(30, 150)[0]).toBe(1);
    expect(heard(60, 150)[0]).toBeLessThan(0.5);
    expect(heard(92, 150)[0]).toBeGreaterThan(0.2);
    expect(heard(2, 150)[0]).toBeLessThan(heard(30, 150)[0]);
  });

  it('brings the wind and the insects up toward the forest, the wind in gusts', () => {
    const [shore, trees] = [heard(30, 150), heard(92, 150)];
    expect(trees[1]).toBeGreaterThan(shore[1] * 2);
    expect(shore[2]).toBe(0);
    expect(trees[2]).toBeGreaterThan(0.3);
    const gusts = Array.from({ length: 200 }, (_, t) => heard(92, 150, t)[1]);
    expect(Math.min(...gusts)).toBeGreaterThan(0.05);
    expect(Math.max(...gusts)).toBeLessThanOrEqual(1);
    expect(Math.max(...gusts) / Math.min(...gusts)).toBeGreaterThan(3);
  });

  it('crackles by each torn engine and each broken end of the hull, in both halves, not at a camp', () => {
    expect(FIRES).toHaveLength(8);
    for (const [x, , z] of FIRES) {
      expect(heard(x + 2, z)[3]).toBeGreaterThan(0.8);
    }
    expect(heard(60, 174)[3]).toBe(0);
    expect(heard(60, 26)[3]).toBe(0);
  });

  it('writes its volumes into the array it is given: nothing made a frame', () => {
    const out = [9, 9, 9, 9];
    air.mix([50, 1.6, 120], 3, out);
    expect(out).toHaveLength(4);
    expect(out.every(v => v >= 0 && v <= 1)).toBe(true);
  });

  it('gives the gull four mews over a second, clean at both ends, from over the lagoon', () => {
    const s = render(0, [air.cry]);
    expect(s.length / RATE).toBeGreaterThan(1);
    expect(s.length / RATE).toBeLessThan(1.4);
    expect(s.every(Number.isFinite)).toBe(true);
    expect(peak(s)).toBeGreaterThan(0.2);
    expect(peak(s)).toBeLessThanOrEqual(1);
    expect(Math.abs(s[0])).toBeLessThan(0.01);
    expect(Math.abs(s[s.length - 1])).toBeLessThan(0.01);
    for (const [u, v] of [
      [0, 0],
      [0.999, 0.999],
      [0.5, 0.2],
    ]) {
      const [x, y, z] = air.from(u, v);
      expect(x).toBeLessThanOrEqual(30);
      expect(y).toBeGreaterThan(10);
      expect(z).toBeGreaterThanOrEqual(0);
      expect(z).toBeLessThanOrEqual(200);
    }
  });
});
