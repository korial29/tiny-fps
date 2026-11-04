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
  it('make a shot shorter than a boom', () => {
    expect(render(SOUND.SHOT).length).toBeLessThan(render(SOUND.BOOM).length);
  });

  it('keep the chaingun under its 12 shots per second', () => {
    expect(render(SOUND.SHOT).length).toBeLessThan(RATE / 12);
  });
});

describe('music', () => {
  const t0 = performance.now();
  const m = music();
  const ms = performance.now() - t0;
  const beats = (m.length * 108) / (RATE * 60);

  it('is deterministic', () => {
    expect(music()).toEqual(m);
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
    expect(ms).toBeLessThan(250);
  });
});
