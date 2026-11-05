import { describe, expect, it } from 'vitest';
import { LAYERS, RATE, music, render } from './sfx';
import type { Voice } from './sfx';

const peak = (s: Float32Array) => s.reduce((m, x) => Math.max(m, Math.abs(x)), 0);

/** Two made-up sounds to run the generator on: the game has none yet. */
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

  it('has no sound of its own yet', () => {
    expect(LAYERS).toEqual([]);
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
