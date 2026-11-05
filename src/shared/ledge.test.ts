import { describe, expect, it } from 'vitest';
import { EAST, NORTH, SOUTH, WEST, at, falling } from '../../test/yard';
import {
  CLIMB_EXIT_SPEED,
  CLIMB_MAX_TICKS,
  HANG_H,
  HANG_SLIDE_TICKS,
  PLAYER_H,
  PLAYER_R,
  TICK_HZ,
  VAULT_SPEED,
} from './constants';
import { EV, KEY, MODE, SIDE } from './types';

const { FORWARD, BACK, JUMP, CROUCH } = KEY;

describe('ledge grab and climb', () => {
  /** Jumps at the 2.0 ledge from the west, 1.5 m away, and returns the sim at the first hang step. */
  const catching = (x = 8.5, top = 2) => {
    const s = at(x, 0, EAST);
    s.step(FORWARD | JUMP, EAST);
    const n = s.until(p => p.mode === MODE.HANG, FORWARD, EAST, 100);
    return { s, n, top };
  };

  it('catches a top within reach of the hands while rising or falling, facing it', () => {
    const { s, n } = catching();
    expect(n).toBeGreaterThan(0);
    expect(s.p.mode).toBe(MODE.HANG);
    expect(s.p.ev).toBe(EV.GRAB);
    // The ledge: its height, the side it is on, the body just off the face, no gravity.
    expect(s.p.edge).toBe(Math.fround(2));
    expect(s.p.wall).toBe(SIDE.EAST);
    expect(s.p.x).toBeCloseTo(10 - PLAYER_R - 0.03, 4);
    expect([s.p.vx, s.p.vy, s.p.vz]).toEqual([0, 0, 0]);
    expect(s.p.ground).toBe(false);
  });

  it('catches a 2.4 m top, the highest a standing player reaches', () => {
    const s = at(18.5, 0, EAST);
    s.step(FORWARD | JUMP, EAST);
    s.until(p => p.mode === MODE.HANG, FORWARD, EAST, 100);
    expect(s.p.mode).toBe(MODE.HANG);
    expect(s.p.edge).toBe(Math.fround(2.4));
  });

  it('catches a top it falls past, beside it, facing it', () => {
    const s = falling(6, 9.5, 0, EAST);
    s.until(p => p.mode === MODE.HANG, 0, EAST, 100);
    expect(s.p.mode).toBe(MODE.HANG);
    // Caught as the top came within the hands' reach: about 2.4 m above the feet.
    expect(s.p.y).toBeGreaterThan(2 - 2.4 - 0.3);
    expect(s.p.y).toBeLessThan(2 - 1.2);
    // The same fall facing away goes on to the ground.
    const t = falling(6, 9.5, 0, WEST);
    t.until(p => p.ground, 0, WEST, 200);
    expect(t.ev & EV.GRAB).toBe(0);
    expect(t.p.y).toBe(0);
  });

  it('does not catch a top above the reach of the hands, even from the top of a jump', () => {
    const s = at(28.5, 0, EAST);
    s.step(FORWARD | JUMP, EAST);
    let high = 0;
    for (let k = 0; k < 120; k++) {
      s.step(FORWARD, EAST);
      high = Math.max(high, s.p.y);
      expect(s.p.mode, `step ${k}`).not.toBe(MODE.HANG);
    }
    // 4 m is more than a jump plus the hands (1.2 + 2.4).
    expect(high).toBeLessThan(4 - 2.4);
    expect(s.p.x).toBeCloseTo(30 - PLAYER_R, 3);
  });

  it('does not catch a top with no room above it for a body', () => {
    // 1 m clear under the slab: a head needs PLAYER_H.
    const s = at(38.5, 0, EAST);
    s.step(FORWARD | JUMP, EAST);
    for (let k = 0; k < 100; k++) {
      s.step(FORWARD, EAST);
      expect(s.p.mode).not.toBe(MODE.HANG);
    }
    expect(PLAYER_H).toBeGreaterThan(3 - 2);
    // The same ledge without the slab is caught (the 2.0 box at x 10).
    expect(catching().s.p.mode).toBe(MODE.HANG);
  });

  it('does not catch a ledge the player is not facing', () => {
    const s = at(8.5, 0, SOUTH);
    s.step(FORWARD | JUMP, SOUTH);
    s.run(60, 0, SOUTH);
    expect(s.ev & EV.GRAB).toBe(0);
    // Looking along the face, not at it: the same, though it came at it facing it.
    const t = at(8.5, 0, EAST);
    t.step(FORWARD | JUMP, EAST);
    t.until(p => p.x > 9, FORWARD, EAST);
    t.run(60, FORWARD, NORTH);
    expect(t.ev & EV.GRAB).toBe(0);
  });

  it('hangs without gravity, then lets the hand slip if nothing is held', () => {
    const { s } = catching();
    const y = s.p.y;
    const ys: number[] = [];
    for (let k = 0; k < HANG_SLIDE_TICKS - 8; k++) {
      s.step(0, EAST);
      ys.push(s.p.y);
      expect(s.p.mode).toBe(MODE.HANG);
    }
    // It settled at hanging height (the feet HANG_H under the ledge) and stays there.
    expect(ys.at(-1)).toBeCloseTo(2 - HANG_H, 4);
    expect(ys.at(-1)! - ys.at(-5)!).toBe(0);
    expect(Math.abs(ys[0] - y)).toBeLessThan(0.3);
    // Past HANG_SLIDE_TICKS with nothing held it lets go and falls.
    s.run(20, 0, EAST);
    expect(s.p.mode).not.toBe(MODE.HANG);
    s.until(p => p.ground, 0, EAST, 100);
    expect(s.p.mode).toBe(MODE.GROUND);
    expect(s.p.y).toBe(0);
    expect(s.p.x).toBeLessThan(10 - PLAYER_R);
  });

  it('lets go on back or crouch, and does not take the same ledge again on the way down', () => {
    for (const key of [BACK, CROUCH]) {
      const { s } = catching();
      s.step(key, EAST);
      expect(s.p.mode).toBe(MODE.AIR);
      s.run(30, FORWARD, EAST);
      expect(s.p.mode).not.toBe(MODE.HANG);
      expect(s.ev & EV.GRAB).toBe(EV.GRAB);
    }
    // Landing makes it catchable again.
    const { s } = catching();
    s.step(BACK, EAST);
    s.until(p => p.ground, 0, EAST, 100);
    s.step(FORWARD | JUMP, EAST);
    s.until(p => p.mode === MODE.HANG, FORWARD, EAST, 100);
    expect(s.p.mode).toBe(MODE.HANG);
  });

  it('climbs on forward, after a moment, and ends standing on the top', () => {
    const { s } = catching();
    const grabbed = s.inputs.length;
    s.run(2, 0, EAST);
    expect(s.p.mode).toBe(MODE.HANG);
    const n = s.until(p => p.ground, FORWARD, EAST, 100);
    expect(n).toBeGreaterThan(0);
    // On the top of the box, inside its footprint, on its height.
    expect(s.p).toMatchObject({ y: 2, mode: MODE.GROUND, ground: true });
    expect(s.p.x).toBeGreaterThan(10);
    expect(s.p.x).toBeLessThan(14);
    expect(s.ev & EV.CLIMB).toBe(EV.CLIMB);
    // It stands up moving in, at CLIMB_EXIT_SPEED, not stopped dead.
    expect(s.p.vx).toBeCloseTo(CLIMB_EXIT_SPEED, 4);
    expect(s.p.vz).toBeCloseTo(0, 4);
    // A few tenths of a second, the body going up and then in.
    const took = s.inputs.length - grabbed;
    expect(took).toBeGreaterThan(0.2 * TICK_HZ);
    expect(took).toBeLessThan(0.7 * TICK_HZ);
    expect(s.modes.has(MODE.CLIMB)).toBe(true);
    // It carries on forward, standing.
    s.run(20, FORWARD, EAST);
    expect(s.p).toMatchObject({ y: 2, ground: true });
    expect(s.p.x).toBeGreaterThan(11);
  });

  it('climbs on a jump press at once, and a jump looking away vaults back off the ledge', () => {
    const { s } = catching();
    s.step(JUMP | FORWARD, EAST);
    expect(s.p.mode).toBe(MODE.CLIMB);
    s.until(p => p.ground, 0, EAST, 100);
    expect(s.p).toMatchObject({ y: 2, ground: true });

    // Facing away: the jump leaps backward, away from the box, rising.
    const v = catching().s;
    v.step(0, WEST);
    v.step(JUMP, WEST);
    expect(v.p.mode).toBe(MODE.AIR);
    expect(v.p.ev & EV.JUMP).toBe(EV.JUMP);
    expect(v.p.vx).toBeLessThan(0);
    expect(v.p.vx).toBeCloseTo(-VAULT_SPEED, 0);
    expect(v.p.vy).toBeGreaterThan(3);
    v.until(p => p.ground, 0, WEST, 100);
    expect(v.p.x).toBeLessThan(10 - PLAYER_R);
    expect(v.p.y).toBe(0);
  });

  it('ends a climb that does not finish, in bounded time', () => {
    expect(CLIMB_MAX_TICKS).toBeGreaterThan(0.5 * TICK_HZ);
    const { s } = catching();
    const n = s.until(p => p.ground, FORWARD, EAST, CLIMB_MAX_TICKS + 40);
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(CLIMB_MAX_TICKS + 10);
  });
});
