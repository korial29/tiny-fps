import { describe, expect, it } from 'vitest';
import { EAST, KILL, NORTH, at, falling, running } from '../../test/yard';
import {
  AIR_JUMPS,
  COYOTE_TICKS,
  DOUBLE_JUMP_SPEED,
  GRAVITY,
  JUMP_BUFFER_TICKS,
  JUMP_SPEED,
  SPRINT_SPEED,
  TICK_HZ,
} from './constants';
import { EV, KEY, MODE } from './types';

const { FORWARD, JUMP } = KEY;

describe('double jump', () => {
  it('is one extra jump in the air, weaker than the first, once, and not by holding the key', () => {
    const s = at(0, 0, NORTH);
    s.step(JUMP, NORTH);
    expect(s.p.vy).toBeCloseTo(JUMP_SPEED - GRAVITY / TICK_HZ, 4);
    // Holding the key through the air is not a press.
    s.run(10, JUMP, NORTH);
    expect(s.p.ev & EV.DOUBLE).toBe(0);
    expect(s.p.jumps).toBe(AIR_JUMPS);
    // Release, press: the extra jump.
    s.step(0, NORTH);
    s.step(JUMP, NORTH);
    expect(s.p.ev).toBe(EV.DOUBLE);
    expect(s.p.vy).toBeCloseTo(DOUBLE_JUMP_SPEED - GRAVITY / TICK_HZ, 4);
    expect(s.p.jumps).toBe(0);
    // No third.
    s.step(0, NORTH);
    const vy = s.p.vy;
    s.step(JUMP, NORTH);
    expect(s.p.ev).toBe(0);
    expect(s.p.vy).toBeCloseTo(vy - GRAVITY / TICK_HZ, 4);
  });

  it('is refilled on landing, so the next jump has its own', () => {
    const s = at(0, 0, NORTH);
    s.step(JUMP, NORTH);
    s.step(0, NORTH);
    s.step(JUMP, NORTH);
    expect(s.p.jumps).toBe(0);
    s.until(p => p.ground, 0, NORTH, 200);
    expect(s.p.jumps).toBe(AIR_JUMPS);
    s.step(JUMP, NORTH);
    s.step(0, NORTH);
    s.step(JUMP, NORTH);
    expect(s.p.ev & EV.DOUBLE).toBe(EV.DOUBLE);
  });

  it('lifts the player again in the air: from the top of the first jump, by its own height', () => {
    const s = at(0, 0, NORTH);
    s.step(JUMP, NORTH);
    s.until(p => p.vy <= 0, 0, NORTH, 100);
    const apex = s.p.y;
    expect(apex).toBeCloseTo(JUMP_SPEED ** 2 / (2 * GRAVITY), 1);
    s.step(0, NORTH);
    s.step(JUMP, NORTH);
    let high = 0;
    for (let k = 0; k < 60; k++) {
      s.step(0, NORTH);
      high = Math.max(high, s.p.y);
    }
    expect(high - apex).toBeCloseTo(DOUBLE_JUMP_SPEED ** 2 / (2 * GRAVITY), 1);
  });

  it('is given back by a wall-run and by a ledge grab', () => {
    // Fast along the long wall, in the air, the extra jump spent.
    const r = running(99.55, 40, NORTH, SPRINT_SPEED);
    r.p.jumps = 0;
    r.step(FORWARD | JUMP, NORTH);
    r.step(FORWARD, NORTH);
    expect(r.p.mode).toBe(MODE.WALLRUN);
    expect(r.p.jumps).toBe(AIR_JUMPS);
    // Hands on a ledge: the same.
    const g = at(8, 0, EAST);
    g.p.jumps = 0;
    g.step(FORWARD | JUMP, EAST);
    g.until(p => p.mode === MODE.HANG, FORWARD, EAST, 100);
    expect(g.p.mode).toBe(MODE.HANG);
    expect(g.p.jumps).toBe(AIR_JUMPS);
  });
});

describe('coyote time and jump buffer', () => {
  /** Walks east off the roof at x 160; returns the sim with the step the feet left the roof. */
  const offEdge = () => {
    const s = at(150.5, 0, EAST, 5, KILL);
    const left = s.until(p => !p.ground, FORWARD, EAST, 200);
    return { s, left };
  };

  it('lets a jump work for COYOTE_TICKS after walking off an edge, and then it is the double jump', () => {
    for (let late = 0; late <= COYOTE_TICKS + 1; late++) {
      const { s } = offEdge();
      // `late` steps in the air, then the press.
      s.run(late, FORWARD, EAST);
      s.step(FORWARD | JUMP, EAST);
      if (late < COYOTE_TICKS) {
        // The first jump, in full, and the extra one is still there.
        expect(s.p.ev, `late ${late}`).toBe(EV.JUMP);
        expect(s.p.vy).toBeCloseTo(JUMP_SPEED - GRAVITY / TICK_HZ, 4);
        expect(s.p.jumps).toBe(AIR_JUMPS);
      } else {
        // Too late: the double jump, which uses the extra one.
        expect(s.p.ev, `late ${late}`).toBe(EV.DOUBLE);
        expect(s.p.jumps).toBe(0);
      }
    }
  });

  it('gives no free jump after a jump from the floor', () => {
    const s = at(0, 0, NORTH);
    s.step(JUMP, NORTH);
    expect(s.p.coyote).toBe(0);
    s.step(0, NORTH);
    s.step(JUMP, NORTH);
    // The extra jump, not a second full one.
    expect(s.p.vy).toBeCloseTo(DOUBLE_JUMP_SPEED - GRAVITY / TICK_HZ, 4);
  });

  /** Steps a fall from 3 m takes before the feet are on the floor. */
  const fall = (): number => falling(3).until(p => p.ground, 0, NORTH, 200);

  it('keeps a press made within JUMP_BUFFER_TICKS of landing, and jumps on landing', () => {
    const n = fall();
    // The extra jump is spent: a press in the air is only a press kept.
    for (let early = 1; early <= JUMP_BUFFER_TICKS + 3; early++) {
      const s = falling(3);
      s.p.jumps = 0;
      s.run(n - early, 0, NORTH);
      expect(s.p.ground, `${early} steps before`).toBe(false);
      s.step(JUMP, NORTH);
      s.run(early + 3, 0, NORTH);
      expect((s.ev & EV.JUMP) !== 0, `${early} steps before`).toBe(early <= JUMP_BUFFER_TICKS);
    }
  });

  it('prefers the jump on landing to the extra jump when the floor is that close', () => {
    // Falling from 3 m with the extra jump still there: a press in the last steps is kept for the
    // landing instead of being spent in the air.
    const n = fall();
    const t = falling(3);
    t.run(n - 3, 0, NORTH);
    t.step(JUMP, NORTH);
    expect(t.p.ev & EV.DOUBLE).toBe(0);
    t.run(6, 0, NORTH);
    expect(t.ev & EV.JUMP).toBe(EV.JUMP);
    expect(t.ev & EV.DOUBLE).toBe(0);
    expect(t.p.jumps).toBe(AIR_JUMPS);
    // Far from the floor the same press is the extra jump.
    const far = falling(3);
    far.step(JUMP, NORTH);
    expect(far.p.ev & EV.DOUBLE).toBe(EV.DOUBLE);
  });
});
