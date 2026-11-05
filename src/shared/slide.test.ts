import { describe, expect, it } from 'vitest';
import { EAST, NORTH, SOUTH, at, running } from '../../test/yard';
import {
  CROUCH_SPEED,
  LOW_EYE,
  LOW_H,
  PLAYER_H,
  PLAYER_R,
  RUN_SPEED,
  SLIDE_DECEL,
  SLIDE_END_SPEED,
  SLIDE_MIN_SPEED,
  SLIDE_TICKS,
  SPRINT_SPEED,
  TICK_HZ,
} from './constants';
import { eyeHeight, heightOf, speedOf } from './physics';
import { EV, KEY, MODE } from './types';

const { FORWARD, JUMP, SPRINT, CROUCH } = KEY;

/** The slots of the yard: x 68 to 78 is 1.2 m clear from z 0 to 4, x 88 to 98 is 2.0 m clear. */
const LOW_SLOT = 1.2;

describe('slide and crouch', () => {
  /** A sprint south at the low slot, from far enough to be at full speed, crouching at z = `from`. */
  const slide = (from = -7, x = 73) => {
    const s = running(x, -20, SOUTH, SPRINT_SPEED);
    s.until(p => p.z >= from, FORWARD | SPRINT, SOUTH, 100);
    s.step(FORWARD | SPRINT | CROUCH, SOUTH);
    return s;
  };

  it('starts on crouch while sprinting: the body low, the speed kept', () => {
    const s = slide();
    expect(s.p.mode).toBe(MODE.SLIDE);
    expect(s.p.ev).toBe(EV.SLIDE_START);
    expect(s.p.ground).toBe(true);
    expect([heightOf(s.p), eyeHeight(s.p)]).toEqual([LOW_H, LOW_EYE]);
    expect(speedOf(s.p)).toBeGreaterThan(SPRINT_SPEED - 0.5);
    // It does not steer: the direction holds.
    s.run(20, FORWARD | CROUCH, EAST);
    expect(s.p.vx).toBeCloseTo(0, 3);
  });

  it('bleeds the speed slowly and ends after SLIDE_TICKS, into a crouch while the key is held', () => {
    const s = slide();
    const v0 = speedOf(s.p);
    s.run(30, FORWARD | CROUCH, SOUTH);
    expect(speedOf(s.p)).toBeCloseTo(v0 - (SLIDE_DECEL * 30) / TICK_HZ, 1);
    const n = s.until(p => p.mode !== MODE.SLIDE, FORWARD | CROUCH, SOUTH, 100);
    // A second in all, and still fast when the time ran out.
    expect(n + 31).toBeGreaterThanOrEqual(SLIDE_TICKS);
    expect(n + 31).toBeLessThanOrEqual(SLIDE_TICKS + 2);
    expect(speedOf(s.p)).toBeGreaterThan(SLIDE_END_SPEED);
    expect(s.p.mode).toBe(MODE.CROUCH);
    expect(s.p.ev & EV.SLIDE_END).toBe(EV.SLIDE_END);
    // The crouch walk is slower: the speed falls to CROUCH_SPEED.
    s.run(30, FORWARD | CROUCH, SOUTH);
    expect(speedOf(s.p)).toBeCloseTo(CROUCH_SPEED, 4);
  });

  it('ends early when the speed runs out, and stands up if the key is let go', () => {
    // A slide that starts just over SLIDE_MIN_SPEED is out of speed well before a second.
    const s = running(0, -100, SOUTH, SLIDE_MIN_SPEED + 0.1);
    s.step(FORWARD | CROUCH, SOUTH);
    expect(s.p.mode).toBe(MODE.SLIDE);
    const n = s.until(p => p.mode !== MODE.SLIDE, FORWARD, SOUTH, 100);
    expect(n).toBeLessThan(SLIDE_TICKS - 10);
    expect(s.p.mode).toBe(MODE.GROUND);
    expect(heightOf(s.p)).toBe(PLAYER_H);
    expect(s.ev & EV.SLIDE_END).toBe(EV.SLIDE_END);
  });

  it('passes under a slot 1.2 m clear that a standing body cannot enter', () => {
    const s = slide(-8);
    s.until(p => p.z > 5, FORWARD | CROUCH, SOUTH, 300);
    expect(s.p.z).toBeGreaterThan(5);
    expect(s.p.y).toBe(0);
    // The same run standing is stopped at its edge.
    const t = running(73, -20, SOUTH, SPRINT_SPEED);
    t.run(200, FORWARD | SPRINT, SOUTH);
    expect(t.p.z).toBeCloseTo(0 - PLAYER_R, 3);
    expect(t.p.mode).toBe(MODE.GROUND);
    // And a slot 2.0 clear (x 88 to 98) lets him walk through standing.
    const u = running(93, -20, SOUTH, SPRINT_SPEED);
    u.run(200, FORWARD | SPRINT, SOUTH);
    expect(u.p.z).toBeGreaterThan(5);
    expect(u.modes.has(MODE.SLIDE)).toBe(false);
    // The slot is between the two bodies.
    expect(LOW_SLOT).toBeLessThan(PLAYER_H);
    expect(LOW_SLOT).toBeGreaterThan(LOW_H);
  });

  it('cannot stand up under a low ceiling, and does once it is clear', () => {
    const s = slide(-6);
    // Under the slot with the key let go: it stays low, sliding or crouching.
    s.until(p => p.z > 1, FORWARD | CROUCH, SOUTH, 300);
    s.run(10, FORWARD, SOUTH);
    expect(s.p.z).toBeLessThan(4);
    expect([MODE.SLIDE, MODE.CROUCH]).toContain(s.p.mode);
    expect(heightOf(s.p)).toBe(LOW_H);
    // Out the far side, still not holding it: it stands.
    s.until(p => p.z > 4.6, FORWARD, SOUTH, 200);
    s.run(3, FORWARD, SOUTH);
    expect(s.p.mode).toBe(MODE.GROUND);
    expect(heightOf(s.p)).toBe(PLAYER_H);
  });

  it('is a slow crouch walk with no speed, and no slide below SLIDE_MIN_SPEED', () => {
    const s = at(0, -50, NORTH);
    s.run(40, FORWARD | CROUCH, NORTH);
    expect(s.p.mode).toBe(MODE.CROUCH);
    expect(speedOf(s.p)).toBeCloseTo(CROUCH_SPEED, 4);
    expect(s.modes.has(MODE.SLIDE)).toBe(false);
    // Walking fast but not sprinting: a crouch, not a slide.
    const t = running(0, -50, NORTH, RUN_SPEED);
    t.step(FORWARD | CROUCH, NORTH);
    expect(RUN_SPEED).toBeLessThan(SLIDE_MIN_SPEED);
    expect(t.p.mode).toBe(MODE.CROUCH);
    // The crouch slows from RUN_SPEED to its own top speed.
    t.run(60, FORWARD | CROUCH, NORTH);
    expect(speedOf(t.p)).toBeCloseTo(CROUCH_SPEED, 4);
    // Letting the key go stands up and speeds up again.
    t.run(30, FORWARD, NORTH);
    expect(t.p.mode).toBe(MODE.GROUND);
    expect(speedOf(t.p)).toBeCloseTo(RUN_SPEED, 4);
  });

  it('jumps out of a slide with its speed, and slides again on landing with the key held', () => {
    const s = slide();
    const v = speedOf(s.p);
    s.step(CROUCH | JUMP, SOUTH);
    expect(s.p.mode).toBe(MODE.AIR);
    expect(s.p.ev & EV.JUMP).toBe(EV.JUMP);
    expect(s.p.ev & EV.SLIDE_END).toBe(EV.SLIDE_END);
    expect(speedOf(s.p)).toBeGreaterThan(v - 0.5);
    s.until(p => p.ground, CROUCH, SOUTH, 100);
    expect(s.p.mode).toBe(MODE.SLIDE);
    expect(s.p.ev & EV.LAND).toBe(EV.LAND);
  });

  it('cannot jump under a low ceiling', () => {
    const s = slide(-4);
    s.until(p => p.z > 0.5, FORWARD | CROUCH, SOUTH, 100);
    s.step(FORWARD | CROUCH | JUMP, SOUTH);
    expect(s.p.ground).toBe(true);
    expect(s.p.ev & EV.JUMP).toBe(0);
  });
});
