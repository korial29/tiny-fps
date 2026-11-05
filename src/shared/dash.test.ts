import { describe, expect, it } from 'vitest';
import { NORTH, WEST, at, falling } from '../../test/yard';
import {
  DASH_COOLDOWN,
  DASH_EXIT_SPEED,
  DASH_SPEED,
  DASH_TICKS,
  RUN_SPEED,
  TICK_HZ,
} from './constants';
import { speedOf } from './physics';
import { EV, KEY } from './types';

const { FORWARD, RIGHT, DASH, CROUCH } = KEY;

describe('dash', () => {
  it('is a burst of DASH_SPEED for DASH_TICKS along the wished direction, then it falls off', () => {
    const s = at(0, 0, NORTH);
    // Facing north, wishing east: the burst goes east.
    const speeds: number[] = [];
    s.step(RIGHT | DASH, NORTH);
    expect(s.p.ev & EV.DASH).toBe(EV.DASH);
    for (let k = 0; k < 20; k++) {
      speeds.push(speedOf(s.p));
      s.step(RIGHT, NORTH);
    }
    expect(speeds.slice(0, DASH_TICKS)).toEqual(Array(DASH_TICKS).fill(DASH_SPEED));
    expect(speeds[DASH_TICKS]).toBeLessThanOrEqual(DASH_EXIT_SPEED);
    expect(speeds[DASH_TICKS]).toBeGreaterThan(RUN_SPEED);
    expect(speeds[19]).toBeLessThan(speeds[DASH_TICKS]);
    // East, 16 m/s for 10 steps: 2.7 m and a bit.
    expect(s.p.x).toBeGreaterThan((DASH_SPEED * DASH_TICKS) / TICK_HZ);
    expect(Math.abs(s.p.z)).toBeLessThan(1e-4);
  });

  it('goes forward with no key held, where the player looks', () => {
    const s = at(0, 0, WEST);
    s.step(DASH, WEST);
    expect(s.p.vx).toBeCloseTo(-DASH_SPEED, 4);
    expect(s.p.vz).toBeCloseTo(0, 4);
  });

  it('cools down for DASH_COOLDOWN ticks from the press, and a held key does not dash again', () => {
    const s = at(0, 0, NORTH);
    s.step(FORWARD | DASH, NORTH);
    // Holding it: no second dash, even once the cooldown is over.
    let again = 0;
    for (let k = 1; k < DASH_COOLDOWN + 10; k++) {
      s.step(FORWARD | DASH, NORTH);
      again += s.p.ev & EV.DASH ? 1 : 0;
    }
    expect(again).toBe(0);
    // A press before the cooldown is over does nothing...
    s.step(FORWARD, NORTH);
    const t = at(0, 0, NORTH);
    t.step(FORWARD | DASH, NORTH);
    for (let k = 1; k < DASH_COOLDOWN; k++) {
      t.step(FORWARD | (k % 2 ? DASH : 0), NORTH);
      expect(t.p.ev & EV.DASH, `step ${k}`).toBe(0);
    }
    // ...and the first press after it is a dash.
    t.step(FORWARD, NORTH);
    t.step(FORWARD | DASH, NORTH);
    expect(t.p.ev & EV.DASH).toBe(EV.DASH);
  });

  it('works once in the air, gives the fall a rest, and is refilled by landing', () => {
    const s = falling(20);
    // Drop first: a free fall, then dash.
    s.run(10, 0, NORTH);
    const vy = s.p.vy;
    expect(vy).toBeLessThan(0);
    const y = s.p.y;
    s.step(FORWARD | DASH, NORTH);
    expect(s.p.ev & EV.DASH).toBe(EV.DASH);
    // The burst has no gravity: the height holds for its length.
    const hold = s.p.y;
    s.run(DASH_TICKS - 2, FORWARD, NORTH);
    expect(s.p.y).toBeCloseTo(hold, 4);
    expect(hold).toBeLessThanOrEqual(y + 0.01);
    expect(s.p.vy).toBe(0);
    // A second air dash, after the cooldown, is refused: the one in the air is spent.
    s.run(DASH_COOLDOWN, FORWARD, NORTH);
    s.step(FORWARD | DASH, NORTH);
    expect(s.p.ev & EV.DASH).toBe(0);
    expect(s.p.dashes).toBe(0);
    // On the ground it works again, and landing gave the air dash back.
    s.until(p => p.ground, 0, NORTH, 200);
    expect(s.p.dashes).toBe(1);
    s.run(DASH_COOLDOWN, 0, NORTH);
    s.step(DASH, NORTH);
    expect(s.p.ev & EV.DASH).toBe(EV.DASH);
  });

  it('is not a dash from a crouch or a slide', () => {
    const s = at(0, 0, NORTH).run(5, CROUCH, NORTH);
    s.step(CROUCH | DASH, NORTH);
    expect(s.p.ev & EV.DASH).toBe(0);
  });
});
