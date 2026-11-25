import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { drive, stepwise } from './tasks';
import { body } from './skin';
import { prepare, preparing } from './armor';
import { plates, plating } from './textures';
import { warmSteps } from './render';

describe('stepwise, long work a task at a time', () => {
  /** The page's clock, ms: a step moves it on by what it takes. */
  let clock = 0;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    clock = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('runs the steps in order, one again while it says it has more, then says it is done', () => {
    const seen: string[] = [];
    let left = 3;
    const done = vi.fn();
    stepwise(
      [() => void seen.push('a'), () => (seen.push('b'), --left > 0), () => void seen.push('c')],
      done,
    );
    // Nothing in the caller's task: the page paints first.
    expect(seen).toEqual([]);
    vi.runAllTimers();
    expect(seen).toEqual(['a', 'b', 'b', 'b', 'c']);
    expect(done).toHaveBeenCalledOnce();
  });

  it('gives the page its turn once a task has run its budget', () => {
    const tasks: number[] = [];
    let task = 0;
    stepwise(
      Array.from({ length: 4 }, () => () => {
        tasks.push(task);
        clock += 5;
      }),
      () => {},
    );
    while (vi.getTimerCount()) {
      vi.advanceTimersToNextTimer();
      task++;
    }
    // 8 ms a task: two steps of 5 ms each.
    expect(tasks).toEqual([0, 0, 1, 1]);
  });

  it('stops for good once its scene is gone', () => {
    let alive = true;
    // Each run takes 5 ms of the task's budget, and it never ends.
    const step = vi.fn(() => ((clock += 5), true));
    const done = vi.fn();
    stepwise([step], done, () => alive);
    vi.advanceTimersToNextTimer();
    expect(step).toHaveBeenCalledTimes(2);
    alive = false;
    vi.runAllTimers();
    expect(step).toHaveBeenCalledTimes(2);
    expect(done).not.toHaveBeenCalled();
  });

  it('drives a generator to what it returns, a part a task', async () => {
    function* parts() {
      yield;
      yield;
      return 42;
    }
    const out = drive(parts());
    vi.runAllTimers();
    expect(await out).toBe(42);
  });
});

describe('the warm-up, step by step', () => {
  it('cooks the close armour in slices to the same recipe prepare() keeps', () => {
    const s = body(3, 1);
    let slices = 0;
    while (preparing(s, true)) {
      slices++;
    }
    expect(slices).toBeGreaterThan(3);
    expect(preparing(s, true)).toBe(false);
    expect(prepare(s, true).t.length).toBeGreaterThan(0);
  });

  it('makes the chitin plates over several steps, the same texels plates() gives', () => {
    let steps = 0;
    while (plating()) {
      steps++;
    }
    expect(steps).toBeGreaterThan(1);
    expect(plates().length).toBe(96 ** 3);
  });

  it('lists the own body’s close armour for a match, and the Hunter for the character screen', () => {
    expect(warmSteps(0).length).toBe(warmSteps().length + 1);
    expect(warmSteps(undefined, true).length).toBeGreaterThan(warmSteps().length);
  });
});
