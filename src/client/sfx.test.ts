import { describe, expect, it } from 'vitest';
import { LAYERS, LOOPED, MUSIC_RATE, RATE, SOUND, music, render, seam } from './sfx';
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

describe('the sounds of the game', () => {
  it('are one entry per id, and the looped ones are the wind, the scrape, the hum, the buzz, the gun’s charge and the rover’s engine and skid', () => {
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
      // The flag sounds are phrases, up to a second.
      expect(s.length).toBeLessThan((id >= SOUND.TAKE ? 1 : 0.4) * RATE);
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

  it.each(LOOPED)('makes the loop %i a bed two seconds long that does not click', id => {
    const s = seam(render(id, LAYERS));
    expect(Math.abs(s.length / RATE - 2)).toBeLessThan(0.01);
    expect(rms(s)).toBeGreaterThan(0.05);
    expect(rms(s)).toBeLessThan(0.4);
    const steps = s.map((x, i) => Math.abs(x - s[(i + 1) % s.length]));
    const wrap = steps[steps.length - 1];
    expect(wrap).toBeLessThanOrEqual(steps.subarray(0, -1).reduce((m, x) => Math.max(m, x), 0));
    expect(peak(s)).toBeLessThan(1.1);
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
