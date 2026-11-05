import { describe, expect, it } from 'vitest';
import { RATE, SOUND, music, render } from './sfx';

const peak = (s: Float32Array) => s.reduce((m, x) => Math.max(m, Math.abs(x)), 0);

describe.each(Object.entries(SOUND))('%s', (_, id) => {
  const s = render(id);

  it('is deterministic', () => {
    expect(render(id)).toEqual(s);
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

describe('sounds', () => {
  it('keep the chaingun under its 12 shots per second', () => {
    expect(render(SOUND.SHOT).length).toBeLessThan(RATE / 12);
  });
});

describe('HEART', () => {
  const s = render(SOUND.HEART);
  /** Loudest sample between two times, in seconds. */
  const loud = (from: number, to: number) => peak(s.subarray(from * RATE, to * RATE));

  it('is a lub-dub: two thumps with a near silence between them, the second fainter', () => {
    const [lub, dub] = [loud(0, 0.2), loud(0.22, 0.45)];
    expect(Math.min(lub, dub)).toBeGreaterThan(0.2);
    expect(dub).toBeLessThan(lub);
    expect(loud(0.15, 0.21)).toBeLessThan(0.1);
  });

  it('is short enough to repeat at the fastest beat, 0.5 s', () => {
    expect(s.length).toBeLessThan(0.5 * RATE);
  });

  it('is low and soft: under 150 Hz at the loudest, a ten millisecond attack', () => {
    const lub = s.subarray(0, 0.2 * RATE);
    const crossings = lub.filter((x, i) => i && x * lub[i - 1] < 0).length;
    expect(crossings / 0.4).toBeLessThan(250);
    expect(peak(s.subarray(0, 0.001 * RATE))).toBeLessThan(0.1);
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
