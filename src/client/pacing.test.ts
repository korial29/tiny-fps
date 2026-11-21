import { describe, expect, it } from 'vitest';
import { createPacing } from './pacing';

const FAST = 1000 / 120;

describe('render pacing', () => {
  it.each([60, 120, 144])('uses every repaint at %i Hz with headroom', hz => {
    const period = 1000 / hz;
    const pacing = createPacing(period);
    for (let i = 0; i < hz * 5; i++) {
      expect(pacing.draw(i * period, true)).toBe(true);
    }
  });

  it.each([240, 360])('presents 120 evenly spaced frames on a %i Hz display', hz => {
    const pacing = createPacing(1000 / hz);
    for (let i = 0; i < hz * 2; i++) {
      expect(pacing.draw((i * 1000) / hz, true)).toBe(i % (hz / 120) === 0);
    }
  });

  it.each([
    [240, 165],
    [240, 120],
    [120, 60],
    [60, 120],
  ])('adapts to a stable change from %i to %i Hz', (from, to) => {
    const pacing = createPacing(1000 / from);
    let now = 0;
    for (let i = 0; i < from; i++) {
      pacing.draw((now += 1000 / from), true);
    }
    for (let i = 0; i < to * 3; i++) {
      const draw = pacing.draw((now += 1000 / to), true);
      if (i > 30) {
        expect(draw).toBe(true);
      }
    }
  });

  it('learns high refresh after a scene starts in the background', () => {
    const pacing = createPacing();
    for (let i = 0; i < 12; i++) {
      pacing.draw(i * FAST, true);
    }
    for (let i = 12; i < 240; i++) {
      expect(pacing.draw(i * FAST, true)).toBe(true);
    }
  });

  it('ignores one late frame and time spent loading or hidden', () => {
    const pacing = createPacing(FAST);
    for (let i = 0; i < 240; i += 2) {
      pacing.draw(i * FAST, false);
    }
    const resumes = 10_000;
    for (let i = 0; i < 120; i++) {
      if (i !== 30) {
        expect(pacing.draw(resumes + i * FAST, true)).toBe(true);
      }
    }
  });

  it('keeps a steady 60 Hz across recovered vsyncs under load, then retries 120 Hz', () => {
    const pacing = createPacing(FAST);
    let lastPaint = 0;
    for (let i = 0; i <= 400; i++) {
      if (i % 8 !== 1 && i % 8 !== 3 && i % 8 !== 5 && pacing.draw(i * FAST, true)) {
        lastPaint = i;
      }
    }
    expect(lastPaint).toBe(400);
    for (let i = 401; i <= 440; i++) {
      expect(pacing.draw(i * FAST, true)).toBe(i % 2 === 0);
    }
    expect(pacing.draw(442 * FAST, true)).toBe(true);
    expect(pacing.draw(443 * FAST, true)).toBe(false);
    for (let i = 444; i < 2400; i++) {
      pacing.draw(i * FAST, true);
    }
    for (let i = 2400; i < 2520; i++) {
      expect(pacing.draw(i * FAST, true)).toBe(true);
    }
  });
});
