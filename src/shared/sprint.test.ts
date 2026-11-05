import { describe, expect, it } from 'vitest';
import { EAST, NORTH, WEST, at, running } from '../../test/yard';
import { RUN_SPEED, SPRINT_SPEED, TICK_HZ } from './constants';
import { speedOf } from './physics';
import { KEY } from './types';

const { FORWARD, RIGHT, SPRINT } = KEY;

describe('sprint', () => {
  it('builds up to SPRINT_SPEED over about a second of forward with the key held', () => {
    const s = at(0, 0);
    const speeds: number[] = [];
    for (let k = 0; k < 90; k++) {
      speeds.push(speedOf(s.step(FORWARD | SPRINT, NORTH)));
    }
    // Walking speed within 0.15 s, then 3 m/s more over one second.
    expect(speeds[9]).toBeGreaterThan(RUN_SPEED);
    expect(speeds[9]).toBeLessThan(RUN_SPEED + 1);
    const reached = speeds.findIndex(v => v >= SPRINT_SPEED - 1e-3);
    expect(reached).toBeGreaterThan(0.8 * TICK_HZ);
    expect(reached).toBeLessThan(1.3 * TICK_HZ);
    expect(speeds[89]).toBeCloseTo(SPRINT_SPEED, 4);
    expect(Math.max(...speeds)).toBeLessThanOrEqual(SPRINT_SPEED + 1e-6);
  });

  it('is only a sprint with forward held: the key alone, or sideways, stays at RUN_SPEED', () => {
    const a = at(0, 0).run(60, SPRINT, NORTH);
    expect(speedOf(a.p)).toBe(0);
    const b = at(0, 0).run(90, RIGHT | SPRINT, NORTH);
    expect(speedOf(b.p)).toBeCloseTo(RUN_SPEED, 4);
    const c = at(0, 0).run(90, FORWARD, NORTH);
    expect(speedOf(c.p)).toBeCloseTo(RUN_SPEED, 4);
  });

  it('is lost on stopping: friction takes it all within a fraction of a second', () => {
    const s = running(0, 0, NORTH, SPRINT_SPEED);
    s.run(15, 0);
    expect(speedOf(s.p)).toBe(0);
    // And the next sprint starts from nothing.
    s.run(30, FORWARD | SPRINT, NORTH);
    expect(speedOf(s.p)).toBeLessThan(SPRINT_SPEED - 1);
  });

  it('is lost on releasing the key: the speed falls back to RUN_SPEED, not to a stop', () => {
    const s = running(0, 0, NORTH, SPRINT_SPEED);
    s.run(60, FORWARD, NORTH);
    expect(speedOf(s.p)).toBeCloseTo(RUN_SPEED, 4);
  });

  it('is lost on turning hard, and kept through a gentle turn', () => {
    // A quarter turn at once: the speed across the new direction is killed, the new one starts from 0.
    const hard = running(-200, 0, NORTH, SPRINT_SPEED);
    hard.run(15, FORWARD | SPRINT, EAST);
    expect(speedOf(hard.p)).toBeLessThan(SPRINT_SPEED - 1.5);
    // It has to build the sprint again from a walk: a second later it is back.
    hard.run(60, FORWARD | SPRINT, EAST);
    expect(speedOf(hard.p)).toBeCloseTo(SPRINT_SPEED, 4);
    // The same quarter turn over a second, 1.5 degrees a step: nearly all of it stays.
    const soft = running(-200, 0, NORTH, SPRINT_SPEED);
    for (let k = 1; k <= 60; k++) {
      soft.step(FORWARD | SPRINT, NORTH - (k * Math.PI) / 2 / 60);
    }
    expect(speedOf(soft.p)).toBeGreaterThan(SPRINT_SPEED - 0.8);
  });

  it('is lost on walking into a wall', () => {
    // A 10 m run at the long wall (x 100): the sprint ends against it.
    const s = running(88, 0, EAST, SPRINT_SPEED);
    s.until(p => p.x > 99.5, FORWARD | SPRINT, EAST);
    s.run(5, FORWARD | SPRINT, EAST);
    expect(speedOf(s.p)).toBe(0);
    // Turned away, it starts again from a walk.
    s.run(15, FORWARD | SPRINT, WEST);
    expect(speedOf(s.p)).toBeLessThan(SPRINT_SPEED - 1.5);
  });
});
