import { describe, expect, it } from 'vitest';
import { LAYERS, LOOPED, RATE, SOUND, music, render, seam } from './sfx';
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
/** The sound by its name in SOUND. */
const sound = (name: keyof typeof SOUND) => render(SOUND[name], LAYERS);

describe('the sounds of the game', () => {
  it('are one entry per id, and the looped ones are the wind and the scrape', () => {
    expect(LAYERS).toHaveLength(Object.keys(SOUND).length);
    expect(Object.values(SOUND).sort((a, b) => a - b)).toEqual(LAYERS.map((_, i) => i));
    expect(LOOPED).toEqual([SOUND.WIND, SOUND.SCRAPE]);
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
    const crossings = (s: Float32Array) =>
      s.reduce((n, x, i) => n + +(i > 0 && s[i - 1] < 0 !== x < 0), 0) / (s.length / RATE);
    expect(crossings(sound('DROP'))).toBeLessThan(crossings(sound('RETURN')));
  });

  it('give the gun seven sounds: a shot, the hit, hurt, down, the pickups and the empty click', () => {
    const gun = ['LASER', 'HIT', 'HURT', 'DOWN', 'GUN', 'PACK', 'DRY'] as const;
    expect(gun.map(n => SOUND[n])).toEqual([16, 17, 18, 19, 20, 21, 22]);
  });

  it('make the shot short enough for 8.6 a second, and a falling sweep', () => {
    const s = sound('LASER');
    // Under the 116 ms between two shots.
    expect(s.length / RATE).toBeLessThan(0.116);
    // Zero crossings a second, early against late: the pitch comes down.
    const rate = (a: number, b: number) =>
      s
        .subarray(a * RATE, b * RATE)
        .reduce((n, x, i, v) => n + +(i > 0 && v[i - 1] < 0 !== x < 0), 0) /
      (b - a);
    expect(rate(0, 0.03)).toBeGreaterThan(rate(0.06, 0.09) * 1.3);
    expect(rms(s)).toBeLessThan(0.5);
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
    const crossings = (s: Float32Array) =>
      s.reduce((n, x, i) => n + +(i > 0 && s[i - 1] < 0 !== x < 0), 0) / (s.length / RATE);
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
  // Best of three, loose: the other test files compete for the CPU (about 40 ms when alone).
  const times: number[] = [];
  const m = Array.from({ length: 3 }, () => {
    const t0 = performance.now();
    const out = music();
    times.push(performance.now() - t0);
    return out;
  })[0];
  const beats = (m.length * 108) / (RATE * 60);

  it('is deterministic', () => {
    expect(Buffer.from(music().buffer).equals(Buffer.from(m.buffer))).toBe(true);
  });

  it('is a whole number of beats at 108 bpm, a few bars long', () => {
    expect(beats).toBe(Math.round(beats));
    expect(beats / 4).toBeGreaterThanOrEqual(4);
  });

  it('is quiet, but not silent', () => {
    expect(peak(m)).toBeLessThanOrEqual(0.35 + 1e-6);
    expect(peak(m)).toBeGreaterThan(0.3);
  });

  it('loops without a jump', () => {
    expect(Math.abs(m[0] - m[m.length - 1])).toBeLessThan(0.01);
  });

  it('renders fast', () => {
    expect(Math.min(...times)).toBeLessThan(400);
  });
});
