// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HIGHLINE } from '../shared/map';
import { STEPS, createLoader, fillAt, goal } from './loading';

describe('loading', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('creeps into each step without reaching its end, and fills up when done', () => {
    let last = 0;
    STEPS.forEach(([, end], i) => {
      const [to, ms] = goal(i);
      expect(to).toBeGreaterThan(last);
      expect(to).toBeLessThan(end);
      expect(ms).toBeGreaterThan(0);
      last = end;
    });
    expect(last).toBe(1);
    expect(goal(STEPS.length)[0]).toBe(1);
  });

  it('takes the fill from where the clock says it is, never back', () => {
    const run = [0.1, 0.5, 1000, 400];
    expect(fillAt(run, 900)).toBe(0.1);
    expect(fillAt(run, 1200)).toBeGreaterThan(0.3);
    expect(fillAt(run, 1200)).toBeLessThan(0.5);
    expect(fillAt(run, 5000)).toBe(0.5);
  });

  it('shows the map and the step, and goes once everything is done', () => {
    vi.useFakeTimers();
    const box = document.createElement('div');
    document.body.append(box);
    const loader = createLoader(box, HIGHLINE);
    const root = box.firstElementChild!.shadowRoot!;
    expect(root.querySelector('strong')!.textContent).toBe(HIGHLINE.name);
    expect(root.querySelector('p')!.textContent).toBe(STEPS[0][0]);
    // The game under it is positioned in its container.
    expect(box.style.position).toBe('relative');
    loader.step(2);
    loader.step(1);
    expect(root.querySelector('p')!.textContent).toBe(STEPS[2][0]);
    loader.step(STEPS.length);
    expect(box.children).toHaveLength(1);
    vi.advanceTimersByTime(400);
    expect(box.children).toHaveLength(0);
  });

  it('is removed at once when the game goes', () => {
    const box = document.createElement('div');
    createLoader(box, HIGHLINE).destroy();
    expect(box.children).toHaveLength(0);
  });
});
