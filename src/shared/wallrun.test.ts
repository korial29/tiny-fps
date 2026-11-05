import { describe, expect, it } from 'vitest';
import { EAST, NORTH, running } from '../../test/yard';
import {
  AIR_JUMPS,
  GRAVITY,
  RUN_SPEED,
  SPRINT_SPEED,
  TICK_HZ,
  WALLRUN_GRAVITY,
  WALLRUN_TICKS,
  WALL_KICK_SPEED,
  WALL_KICK_UP,
} from './constants';
import { EV, KEY, MODE, SIDE } from './types';

const { FORWARD, JUMP, SPRINT, DASH } = KEY;

describe('wall-run', () => {
  /** Sprinting north along the long wall (it is on the east), then a jump: the run begins. */
  const jumpAlong = (speed = SPRINT_SPEED, z = 50) => {
    const s = running(99.55, z, NORTH, speed);
    s.step(FORWARD | SPRINT | JUMP, NORTH);
    s.step(FORWARD | SPRINT, NORTH);
    return s;
  };

  it('starts when fast and along a wall: the side, the speed kept, a rise held down', () => {
    const s = jumpAlong();
    expect(s.p.mode).toBe(MODE.WALLRUN);
    expect(s.p.wall).toBe(SIDE.EAST);
    expect(s.ev & EV.WALLRUN_START).toBe(EV.WALLRUN_START);
    expect(s.p.vx).toBeCloseTo(0, 3);
    expect(-s.p.vz).toBeGreaterThan(8);
    expect(s.p.vy).toBeLessThanOrEqual(3);
    expect(s.p.ground).toBe(false);
  });

  it('does not start when slow, when not along the wall, or without forward', () => {
    // Walking speed is under WALLRUN_MIN_SPEED.
    expect(jumpAlong(RUN_SPEED).p.mode).toBe(MODE.AIR);
    // Running at the wall: its speed along it is nothing.
    const head = running(95, 0, EAST, SPRINT_SPEED);
    head.step(FORWARD | SPRINT | JUMP, EAST);
    head.run(30, FORWARD | SPRINT, EAST);
    expect(head.modes.has(MODE.WALLRUN)).toBe(false);
    // Forward let go in the air: no run.
    const s = running(99.55, 50, NORTH, SPRINT_SPEED);
    s.step(JUMP, NORTH);
    expect(s.p.mode).toBe(MODE.AIR);
    s.run(10, 0, NORTH);
    expect(s.modes.has(MODE.WALLRUN)).toBe(false);
    // Fast, but coming at the wall at 45 degrees: more of the speed goes into it than along it,
    // and until it is against the wall (which takes the speed into it away) it is not a run.
    const slant = running(99.4, 50, (7 * Math.PI) / 4, 12);
    slant.step(FORWARD | SPRINT | JUMP, (7 * Math.PI) / 4);
    expect(slant.p.mode).toBe(MODE.AIR);
    expect(slant.p.vx).toBeGreaterThan(5);
    // Fast but 3 m from the wall: nothing to run on.
    const far = running(97, 50, NORTH, SPRINT_SPEED);
    far.step(FORWARD | JUMP, NORTH);
    far.run(5, FORWARD, NORTH);
    expect(far.p.mode).toBe(MODE.AIR);
  });

  it('runs with a tenth of the gravity, and for about a second at most', () => {
    const s = jumpAlong();
    const vy = s.p.vy;
    s.step(FORWARD | SPRINT, NORTH);
    expect(s.p.vy).toBeCloseTo(vy - WALLRUN_GRAVITY * GRAVITY * (1 / TICK_HZ), 4);
    let n = 2;
    while (s.p.mode === MODE.WALLRUN && n < 200) {
      s.step(FORWARD | SPRINT, NORTH);
      n++;
    }
    expect(n).toBeGreaterThan(0.7 * TICK_HZ);
    expect(n).toBeLessThanOrEqual(WALLRUN_TICKS + 3);
    expect(s.ev & EV.WALLRUN_END).toBe(EV.WALLRUN_END);
    // Along the wall the whole time: the x it ends at is the x it began at.
    expect(s.p.x).toBeCloseTo(99.55, 2);
    // And it does not take the same wall again in the same flight.
    expect(s.p.mode).not.toBe(MODE.WALLRUN);
    s.run(10, FORWARD | SPRINT, NORTH);
    expect(s.p.mode).not.toBe(MODE.WALLRUN);
  });

  it('ends when forward is let go, and when the speed is gone', () => {
    const s = jumpAlong();
    s.step(0, NORTH);
    expect(s.p.mode).toBe(MODE.AIR);
    expect(s.p.ev & EV.WALLRUN_END).toBe(EV.WALLRUN_END);
    // Just over the entry speed: the drag along the wall brings it under WALLRUN_KEEP_SPEED
    // well before a second.
    const slow = jumpAlong(7.3);
    expect(slow.p.mode).toBe(MODE.WALLRUN);
    let n = 0;
    while (slow.p.mode === MODE.WALLRUN && n < 120) {
      slow.step(FORWARD | SPRINT, NORTH);
      n++;
    }
    expect(n).toBeLessThan(WALLRUN_TICKS - 5);
  });

  it('ends at the end of the wall', () => {
    // The short wall (x 120, z -2 to 2), approached along it from the south.
    const s = running(119.55, 12, NORTH, SPRINT_SPEED);
    s.until(p => p.z < 4.5, FORWARD | SPRINT, NORTH);
    s.step(FORWARD | SPRINT | JUMP, NORTH);
    s.until(p => p.mode === MODE.WALLRUN, FORWARD | SPRINT, NORTH, 100);
    expect(s.p.mode).toBe(MODE.WALLRUN);
    expect(s.p.z).toBeLessThan(2.5);
    expect(s.p.wall).toBe(SIDE.EAST);
    const t0 = s.p.t;
    s.until(p => p.mode !== MODE.WALLRUN, FORWARD | SPRINT, NORTH, 100);
    // It let go where the wall does, well before the second was up.
    expect(s.p.z).toBeLessThan(-1.5);
    expect(s.p.z).toBeGreaterThan(-3);
    expect(s.p.t + t0).toBeLessThan(WALLRUN_TICKS / 2);
    expect(s.ev & EV.WALLRUN_END).toBe(EV.WALLRUN_END);
  });

  it('kicks off the wall on a jump: away, upward, the extra jump back, and not onto it again', () => {
    const s = jumpAlong();
    s.run(10, FORWARD | SPRINT, NORTH);
    s.p.jumps = 0;
    s.step(FORWARD | SPRINT | JUMP, NORTH);
    // Away from the wall (it is on the east, so west), and up.
    expect(s.p.mode).toBe(MODE.AIR);
    expect(s.p.ev & EV.JUMP).toBe(EV.JUMP);
    expect(s.p.ev & EV.WALLRUN_END).toBe(EV.WALLRUN_END);
    expect(s.p.vx).toBeCloseTo(-WALL_KICK_SPEED, 0);
    expect(s.p.vy).toBeCloseTo(WALL_KICK_UP - GRAVITY / TICK_HZ, 1);
    expect(s.p.jumps).toBe(AIR_JUMPS);
    // It then double jumps: the one it got from the wall.
    s.step(FORWARD, NORTH);
    s.step(FORWARD | JUMP, NORTH);
    expect(s.p.ev & EV.DOUBLE).toBe(EV.DOUBLE);
    s.until(p => p.ground, FORWARD, NORTH, 200);
    expect(s.p.x).toBeLessThan(99);
  });

  it('can dash out of it, ending the run', () => {
    const s = jumpAlong();
    s.run(5, FORWARD | SPRINT, NORTH);
    s.step(FORWARD | SPRINT | DASH, NORTH);
    expect(s.p.mode).toBe(MODE.AIR);
    expect(s.p.ev & EV.DASH).toBe(EV.DASH);
  });
});
