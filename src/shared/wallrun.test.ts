import { describe, expect, it } from 'vitest';
import { EAST, NORTH, running } from '../../test/yard';
import {
  AIR_JUMPS,
  GRAVITY,
  PLAYER_R,
  RUN_SPEED,
  SPRINT_SPEED,
  TICK_HZ,
  WALLRUN_GRAVITY,
  WALLRUN_LIFT,
  WALLRUN_MIN_SPEED,
  WALLRUN_TICKS,
  WALLRUN_VY_MAX,
  WALL_AWAY,
  WALL_PARALLEL,
  WALL_REACH,
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
    // A walk is under WALLRUN_MIN_SPEED, a normal run is not.
    expect(jumpAlong(WALLRUN_MIN_SPEED - 0.5).p.mode).toBe(MODE.AIR);
    expect(jumpAlong(RUN_SPEED).p.mode).toBe(MODE.WALLRUN);
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
    // Fast but 3 m from the wall: nothing to run on.
    const far = running(97, 50, NORTH, SPRINT_SPEED);
    far.step(FORWARD | JUMP, NORTH);
    far.run(5, FORWARD, NORTH);
    expect(far.p.mode).toBe(MODE.AIR);
  });

  it('runs with 15 % of the gravity, and for about a second at most', () => {
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
    // Along the wall the whole time, against it: the x it ends at is the wall's face, less the body.
    expect(s.p.x).toBeCloseTo(100 - PLAYER_R, 2);
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
    const slow = jumpAlong(WALLRUN_MIN_SPEED + 0.1);
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

  describe('from a normal run, near a wall', () => {
    /** The yaw that runs north and `deg` degrees toward the wall on the east (or away, if negative). */
    const toward = (deg: number) => NORTH - (deg * Math.PI) / 180;
    /** A run of RUN_SPEED at x, along yaw, then a jump and `n` more steps. */
    const jump = (x: number, yaw: number, n = 1) => {
      const s = running(x, 50, yaw, RUN_SPEED);
      s.step(FORWARD | JUMP, yaw);
      s.run(n, FORWARD, yaw);
      return s;
    };

    it('starts on a jump at 0.4 m from the wall, no sprint needed', () => {
      const x = 100 - PLAYER_R - 0.4;
      expect(jump(x, NORTH).p.mode).toBe(MODE.WALLRUN);
      // The reach is WALL_REACH: a little past it, no run.
      expect(WALL_REACH).toBeGreaterThanOrEqual(0.4);
      expect(jump(100 - PLAYER_R - WALL_REACH - 0.1, NORTH, 5).modes.has(MODE.WALLRUN)).toBe(false);
    });

    it('draws the body in to the wall while it runs', () => {
      const s = jump(100 - PLAYER_R - 0.4, NORTH);
      const x = s.p.x;
      s.run(15, FORWARD, NORTH);
      expect(s.p.x).toBeGreaterThan(x + 0.2);
      expect(s.p.x).toBeCloseTo(100 - PLAYER_R, 2);
      expect(s.p.mode).toBe(MODE.WALLRUN);
    });

    it('starts from an approach at 40 degrees and turns the velocity along the wall, with a lift', () => {
      const yaw = toward(40);
      const s = running(98.6, 50, yaw, RUN_SPEED);
      s.step(FORWARD | JUMP, yaw);
      // Still heading at the wall, 40 degrees off it, until it is within reach.
      expect(s.p.mode).toBe(MODE.AIR);
      expect(s.p.vx).toBeGreaterThan(3);
      s.until(p => p.mode === MODE.WALLRUN, FORWARD, yaw, 60);
      expect(s.p.mode).toBe(MODE.WALLRUN);
      expect(s.p.wall).toBe(SIDE.EAST);
      // Along the wall, north, keeping most of the speed (more than the along-wall part, 4.6).
      expect(s.p.vx).toBeCloseTo(0, 3);
      expect(-s.p.vz).toBeGreaterThan(5);
      expect(-s.p.vz).toBeLessThanOrEqual(RUN_SPEED + 0.3);
      // A rise, held to WALLRUN_VY_MAX.
      expect(s.p.vy).toBeGreaterThanOrEqual(WALLRUN_LIFT - GRAVITY / TICK_HZ);
      expect(s.p.vy).toBeLessThanOrEqual(WALLRUN_VY_MAX);
      expect(s.ev & EV.WALLRUN_START).toBe(EV.WALLRUN_START);
    });

    it('lifts a fall: a run that starts while dropping rises again', () => {
      const s = running(99.2, 50, NORTH, RUN_SPEED);
      Object.assign(s.p, { y: 2, ground: false, mode: MODE.AIR, vy: -4, coyote: 0 });
      s.step(FORWARD, NORTH);
      expect(s.p.mode).toBe(MODE.WALLRUN);
      expect(s.p.vy).toBeGreaterThan(0);
    });

    it('does not start when moving away from the wall', () => {
      // 40 degrees off the wall, west, 0.1 m from it.
      const s = jump(99.5, toward(-40), 20);
      expect(s.modes.has(MODE.WALLRUN)).toBe(false);
      expect(WALL_AWAY).toBeLessThan(0.64);
    });

    it('does not start from an approach at 70 degrees', () => {
      expect(Math.sin((70 * Math.PI) / 180)).toBeGreaterThan(WALL_PARALLEL);
      const s = jump(98.6, toward(70), 60);
      expect(s.modes.has(MODE.WALLRUN)).toBe(false);
      expect(jump(98.6, toward(70), 60).p.x).toBeLessThanOrEqual(100 - PLAYER_R + 0.01);
    });

    it('works on a wall to the west too', () => {
      // The long wall from its east side (its face is at x = 101), running north.
      const s = running(101 + PLAYER_R + 0.3, 50, NORTH, RUN_SPEED);
      s.step(FORWARD | JUMP, NORTH);
      s.step(FORWARD, NORTH);
      expect(s.p.mode).toBe(MODE.WALLRUN);
      expect(s.p.wall).toBe(SIDE.WEST);
    });

    it('goes on while looking a little toward or away from the wall', () => {
      for (const turn of [0.35, -0.35]) {
        const s = jump(99.2, NORTH);
        s.run(30, FORWARD, NORTH + turn);
        expect(s.p.mode, `turned ${turn}`).toBe(MODE.WALLRUN);
        expect(s.p.vx).toBeCloseTo(0, 3);
        expect(-s.p.vz).toBeGreaterThan(4);
      }
    });

    it('runs for most of a second from a normal run', () => {
      const s = jump(99.2, NORTH);
      let n = 1;
      while (s.p.mode === MODE.WALLRUN && n < 200) {
        s.step(FORWARD, NORTH);
        n++;
      }
      expect(n).toBeGreaterThan(0.6 * TICK_HZ);
      expect(n).toBeLessThanOrEqual(WALLRUN_TICKS + 3);
    });
  });
});
