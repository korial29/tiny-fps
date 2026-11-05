import { describe, expect, it } from 'vitest';
import { NORTH, at, running } from '../../test/yard';
import {
  DASH_COOLDOWN,
  DASH_SPEED,
  DASH_TICKS,
  RUN_SPEED,
  SPRINT_SPEED,
  STUMBLE_KNOCK,
  STUMBLE_SPEED,
  STUMBLE_TICKS,
  TICK_HZ,
} from './constants';
import { speedOf, stumble } from './physics';
import { EV, KEY, MODE } from './types';

const { FORWARD, SPRINT, JUMP, DASH, CROUCH } = KEY;

/** A player at rest at the origin, facing north, who has just been tackled by someone going east. */
const tackled = () => {
  const s = at(0, 0, NORTH);
  stumble(s.p, 1, 0);
  return s;
};

describe('stumble', () => {
  it('sets the timer and throws the player along the tackler, in float32', () => {
    const s = tackled();
    expect(s.p.stun).toBe(STUMBLE_TICKS);
    expect([s.p.vx, s.p.vz]).toEqual([Math.fround(STUMBLE_KNOCK), 0]);
    const t = at(0, 0, NORTH);
    stumble(t.p, 0.6, -0.8);
    expect([t.p.vx, t.p.vz]).toEqual([Math.fround(3.6), Math.fround(-4.8)]);
  });

  it('counts STUMBLE_TICKS steps and then lets the player jump and dash again', () => {
    const s = tackled();
    for (let k = 1; k <= STUMBLE_TICKS; k++) {
      s.step(0, NORTH);
      expect(s.p.stun).toBe(STUMBLE_TICKS - k);
    }
    // Steps 1 to 48 were stumbled: a jump pressed at the 49th goes off.
    s.step(JUMP, NORTH);
    expect(s.p.ev & EV.JUMP).toBe(EV.JUMP);
    const t = tackled();
    t.run(STUMBLE_TICKS, 0, NORTH);
    t.step(DASH, NORTH);
    expect(t.p.ev & EV.DASH).toBe(EV.DASH);
  });

  it('knocks the player back a little, along the tackler, and he does not steer it', () => {
    const s = tackled();
    s.step(0, NORTH);
    // The first step already slides the knock out at STUMBLE_DRAG, and keys do not turn it.
    expect(s.p.vx).toBeLessThan(STUMBLE_KNOCK);
    expect(s.p.vx).toBeGreaterThan(STUMBLE_KNOCK - 0.5);
    s.run(STUMBLE_TICKS, FORWARD | SPRINT, NORTH);
    expect(s.p.x).toBeGreaterThan(0.5);
    expect(s.p.x).toBeLessThan(2);
    // Forward is north (-z): the walk after the knock is slow, so z has barely moved a few metres.
    expect(s.p.z).toBeGreaterThan(-(STUMBLE_SPEED * STUMBLE_TICKS) / TICK_HZ - 0.1);
  });

  it('cannot sprint: the speed is held to STUMBLE_SPEED, where a sprint reaches SPRINT_SPEED', () => {
    const free = running(0, 0, NORTH, RUN_SPEED);
    free.run(120, FORWARD | SPRINT, NORTH);
    expect(speedOf(free.p)).toBeGreaterThan(RUN_SPEED + 1);

    const s = running(0, 0, NORTH, SPRINT_SPEED);
    stumble(s.p, 0, -1);
    let top = 0;
    for (let k = 0; k < STUMBLE_TICKS; k++) {
      s.step(FORWARD | SPRINT, NORTH);
      // Past the knock (the first 0.3 s) he walks.
      top = k > 20 ? Math.max(top, speedOf(s.p)) : top;
    }
    expect(top).toBeLessThanOrEqual(STUMBLE_SPEED + 1e-4);
    expect(top).toBeGreaterThan(STUMBLE_SPEED - 0.5);
  });

  it('cannot dash: a press during the stumble does nothing, and does not wait for him', () => {
    const s = tackled();
    s.step(DASH, NORTH);
    expect(s.p.ev & EV.DASH).toBe(0);
    expect(s.p.dash).toBe(0);
    expect(speedOf(s.p)).toBeLessThan(STUMBLE_KNOCK + 0.01);
    // Held through the stumble, it is no press afterwards either.
    s.run(STUMBLE_TICKS + 5, DASH, NORTH);
    expect(s.ev & EV.DASH).toBe(0);
  });

  it('cannot jump, and a jump held through it does not go off when it ends', () => {
    const s = tackled();
    s.step(JUMP, NORTH);
    expect(s.p.ev & EV.JUMP).toBe(0);
    s.run(STUMBLE_TICKS + 5, JUMP, NORTH);
    expect(s.ev & EV.JUMP).toBe(0);
    expect(s.p.mode).toBe(MODE.GROUND);
    expect(s.p.y).toBe(0);
  });

  it('forgets a jump pressed just before the tackle', () => {
    const s = at(0, 0, NORTH);
    s.step(0, NORTH);
    s.p.buffer = 5;
    stumble(s.p, 1, 0);
    expect(s.p.buffer).toBe(0);
    s.step(0, NORTH);
    expect(s.p.ev & EV.JUMP).toBe(0);
  });

  it('ends the burst of a dash, and a slide', () => {
    const d = at(0, 0, NORTH);
    d.step(FORWARD | DASH, NORTH);
    expect(d.p.dash).toBe(DASH_COOLDOWN);
    stumble(d.p, 0, -1);
    // Out of the burst, the rest of the cooldown stays.
    expect(d.p.dash).toBe(DASH_COOLDOWN - DASH_TICKS);
    expect(speedOf(d.p)).toBeLessThan(DASH_SPEED);

    const s = running(0, 0, NORTH, SPRINT_SPEED);
    s.run(3, FORWARD | CROUCH, NORTH);
    expect(s.p.mode).toBe(MODE.SLIDE);
    stumble(s.p, 0, -1);
    s.step(FORWARD | CROUCH, NORTH);
    expect(s.p.mode).not.toBe(MODE.SLIDE);
    expect(s.ev & EV.SLIDE_END).toBe(EV.SLIDE_END);
  });

  it('knocks a player off a ledge hold and a wall-run into the air', () => {
    const h = at(0, 0, NORTH);
    Object.assign(h.p, { mode: MODE.HANG, wall: 4, edge: 2, y: 0, ground: false, t: 3 });
    stumble(h.p, 0, 1);
    expect([h.p.mode, h.p.edge, h.p.vy]).toEqual([MODE.AIR, 0, 0]);
    const w = at(0, 0, NORTH, 3);
    Object.assign(w.p, { mode: MODE.WALLRUN, wall: 1, ground: false, vy: 2 });
    stumble(w.p, 0, 1);
    expect(w.p.mode).toBe(MODE.AIR);
  });
});
