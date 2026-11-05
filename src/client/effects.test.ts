import { describe, expect, it } from 'vitest';
import { DASH_COOLDOWN, DASH_TICKS } from '../shared/constants';
import { STILL } from '../shared/physics';
import { EV, KEY, MODE, SIDE } from '../shared/types';
import type { PlayerState } from '../shared/types';
import { createEffects, stepLength, stepping } from './effects';

const DT = 1 / 60;
const me = (over: Partial<PlayerState> = {}): PlayerState => ({
  id: 1,
  x: 0,
  y: 0,
  z: 0,
  vy: 0,
  yaw: 0,
  pitch: 0,
  ground: true,
  ...STILL,
  ...over,
});
type Fx = ReturnType<typeof createEffects>;
/** Runs the frames of `seconds` on the same state (a sprint is one with a speed), then returns the effects. */
const run = (fx: Fx, state: PlayerState | undefined, seconds: number, keys = 0) => {
  for (let t = 0; t < seconds; t += DT) {
    fx.update(state, keys, DT);
  }
  return fx;
};
/** A player running along x at v m/s: where it is after `t` seconds. */
const at = (v: number, t: number, over: Partial<PlayerState> = {}) =>
  me({ x: v * t, vx: v, ...over });

describe('bob', () => {
  const walk = (over: Partial<PlayerState>) => {
    const fx = createEffects();
    let peak = 0;
    for (let i = 0; i < 120; i++) {
      fx.update(me({ x: i * 0.1, ...over }), KEY.FORWARD, DT);
      peak = Math.max(peak, Math.abs(fx.dy));
    }
    return peak;
  };

  it('moves the eye while walking on the ground', () => {
    expect(walk({})).toBeGreaterThan(0.01);
  });

  it('stays still when standing, and when walking in the air', () => {
    expect(run(createEffects(), me(), 1).dy).toBe(0);
    expect(walk({ mode: MODE.AIR, ground: false })).toBe(0);
  });

  it('follows the distance walked, not the time passed', () => {
    const fx = createEffects();
    fx.update(me({ x: 0 }), 0, DT);
    fx.update(me({ x: 0.3 }), 0, DT);
    expect(fx.dy).not.toBe(0);
    const still = createEffects();
    still.update(me({ x: 0 }), 0, DT);
    still.update(me({ x: 0 }), 0, DT);
    expect(still.dy).toBe(0);
  });

  it('ignores a respawn jump', () => {
    const fx = createEffects();
    fx.update(me({ x: 0 }), 0, DT);
    fx.update(me({ x: 30 }), 0, DT);
    expect(fx.dy).toBe(0);
    expect(fx.stride).toBe(0);
  });

  it('is lower at the footfall, and a step is longer at a sprint', () => {
    const fx = createEffects();
    // One stride: the footfall (a whole number of steps) is where the eye is lowest.
    const d = stepLength(6);
    let low = 0;
    let x = 0;
    while (fx.stride < 1) {
      x += 0.05;
      fx.update(me({ x, vx: 6 }), 0, DT);
      low = Math.min(low, fx.dy);
    }
    expect(x).toBeGreaterThanOrEqual(d);
    expect(x).toBeLessThan(d + 0.06);
    expect(fx.dy).toBeLessThan(0);
    expect(stepLength(9)).toBeGreaterThan(stepLength(6));
  });

  it('counts the steps along a wall too, and not on a slide or in the air', () => {
    expect([MODE.GROUND, MODE.CROUCH, MODE.WALLRUN].map(mode => stepping(me({ mode })))).toEqual([
      true,
      true,
      true,
    ]);
    expect(
      [MODE.AIR, MODE.SLIDE, MODE.HANG, MODE.CLIMB].map(mode => stepping(me({ mode }))),
    ).toEqual([false, false, false, false]);
    const fx = createEffects();
    fx.update(me({ mode: MODE.WALLRUN, wall: SIDE.EAST }), 0, DT);
    fx.update(me({ mode: MODE.WALLRUN, wall: SIDE.EAST, z: -0.5, vz: -8 }), 0, DT);
    expect(fx.stride).toBeCloseTo(0.5 / stepLength(8));
    expect(fx.dy).toBe(0);
  });
});

describe('roll', () => {
  it('leans right when strafing right, left for left, and settles back', () => {
    const fx = createEffects();
    run(fx, me(), 1, KEY.RIGHT);
    expect(fx.roll).toBeGreaterThan(0.02);
    run(fx, me(), 1, KEY.LEFT);
    expect(fx.roll).toBeLessThan(-0.02);
    run(fx, me(), 2);
    expect(Math.abs(fx.roll)).toBeLessThan(1e-3);
  });

  it('does not lean when both or none are held', () => {
    const fx = createEffects();
    run(fx, me(), 1, KEY.LEFT | KEY.RIGHT);
    expect(fx.roll).toBeCloseTo(0);
  });

  it('leans toward the wall of a wall-run, whichever way the player looks', () => {
    const run8 = (wall: number, yaw: number) =>
      run(createEffects(), me({ mode: MODE.WALLRUN, wall, yaw, vx: 8 }), 1).roll;
    // At yaw 0 the right hand is east; at a quarter turn left (yaw π/2) it is north.
    expect(run8(SIDE.EAST, 0)).toBeGreaterThan(0.1);
    expect(run8(SIDE.WEST, 0)).toBeLessThan(-0.1);
    expect(run8(SIDE.NORTH, Math.PI / 2)).toBeGreaterThan(0.1);
    expect(run8(SIDE.SOUTH, Math.PI / 2)).toBeLessThan(-0.1);
  });

  it('tilts on a slide, and comes back', () => {
    const fx = run(createEffects(), me({ mode: MODE.SLIDE, vx: 8 }), 1);
    expect(fx.roll).toBeGreaterThan(0.03);
    expect(Math.abs(run(fx, me(), 2).roll)).toBeLessThan(1e-3);
  });
});

describe('field of view', () => {
  it('stays put at a run, and widens with speed up to the sprint', () => {
    expect(run(createEffects(), at(6, 0), 1).fov).toBeCloseTo(0);
    const mid = run(createEffects(), at(7.5, 0), 1).fov;
    const top = run(createEffects(), at(9, 0), 1).fov;
    expect(mid).toBeGreaterThan(1);
    expect(top).toBeGreaterThan(mid);
    expect(top).toBeLessThan(6);
  });

  it('punches on a dash, sharply, then eases back to the speed of the moment', () => {
    const fx = run(createEffects(), at(9, 0), 1);
    const sprint = fx.fov;
    const burst = at(16, 0, { dash: DASH_COOLDOWN });
    run(fx, burst, 3 * DT);
    const early = fx.fov;
    expect(early).toBeGreaterThan(sprint + 3);
    run(fx, burst, (DASH_TICKS - 3) * DT);
    const peak = fx.fov;
    expect(peak).toBeGreaterThan(sprint + 6);
    // The burst is over, the speed is the exit speed's: the punch falls over about half a second.
    const after = at(10, 0, { dash: DASH_COOLDOWN - DASH_TICKS });
    run(fx, after, 0.1);
    expect(fx.fov).toBeLessThan(peak);
    run(fx, after, 1);
    expect(fx.fov).toBeCloseTo(sprint, 0);
  });
});

describe('speed lines', () => {
  it('are off below the sprint speed and on above it', () => {
    expect(run(createEffects(), at(3, 0), 1).lines).toBe(0);
    expect(run(createEffects(), at(6, 0), 1).lines).toBe(0);
    expect(run(createEffects(), at(6.5, 0), 1).lines).toBeCloseTo(0);
    expect(run(createEffects(), at(9, 0), 1).lines).toBeGreaterThan(0.2);
  });

  it('are stronger on a dash, and fade after it', () => {
    const fx = run(createEffects(), at(9, 0), 1);
    const sprint = fx.lines;
    expect(sprint).toBeLessThan(0.5);
    run(fx, at(16, 0, { dash: DASH_COOLDOWN }), 8 * DT);
    expect(fx.lines).toBeGreaterThan(0.7);
    expect(fx.lines).toBeLessThanOrEqual(1);
    run(fx, at(0, 0), 2);
    expect(fx.lines).toBeLessThan(0.01);
  });
});

describe('eye', () => {
  /** The lowest and the highest the eye is drawn at over the seconds after a hit. */
  const after = (hit: { ev: number; fall: number }, seconds = 1.5) => {
    const fx = createEffects();
    fx.update(me(), 0, DT);
    fx.update(me(), 0, DT, hit);
    let [lo, hi] = [fx.dy, fx.dy];
    for (let t = 0; t < seconds; t += DT) {
      fx.update(me(), 0, DT);
      [lo, hi] = [Math.min(lo, fx.dy), Math.max(hi, fx.dy)];
    }
    return { fx, lo, hi };
  };

  it('dips on a landing by how hard it was, and recovers with a little overshoot', () => {
    const soft = after({ ev: EV.LAND, fall: 6 });
    const hard = after({ ev: EV.LAND, fall: 16 });
    expect(soft.lo).toBeLessThan(-0.03);
    expect(hard.lo).toBeLessThan(-0.1);
    expect(hard.lo / soft.lo).toBeGreaterThan(2);
    expect(hard.lo).toBeGreaterThan(-0.4);
    expect(hard.hi).toBeGreaterThan(0.005);
    expect(hard.hi).toBeLessThan(0.1);
    expect(Math.abs(hard.fx.dy)).toBeLessThan(1e-3);
  });

  it('caps the dip of a very long fall', () => {
    expect(after({ ev: EV.LAND, fall: 60 }).lo).toBeCloseTo(after({ ev: EV.LAND, fall: 20 }).lo);
  });

  it('lifts a little on a jump', () => {
    for (const ev of [EV.JUMP, EV.DOUBLE]) {
      const { hi, lo, fx } = after({ ev, fall: 0 });
      expect(hi).toBeGreaterThan(0.02);
      expect(hi).toBeLessThan(0.1);
      expect(lo).toBeGreaterThan(-0.03);
      expect(Math.abs(fx.dy)).toBeLessThan(1e-3);
    }
  });

  it('eases down to the eye height of a slide or a crouch, and back up', () => {
    const fx = run(createEffects(), me(), 0.2);
    expect(fx.dy).toBe(0);
    fx.update(me({ mode: MODE.SLIDE }), 0, DT);
    // The physics eye dropped 0.9 m at once: the drawn one has not followed yet.
    expect(fx.dy).toBeGreaterThan(0.6);
    run(fx, me({ mode: MODE.SLIDE }), 1);
    expect(Math.abs(fx.dy)).toBeLessThan(0.01);
    // Standing up: the drawn eye starts low and rises.
    fx.update(me(), 0, DT);
    expect(fx.dy).toBeLessThan(-0.6);
    expect(fx.dy).toBeGreaterThan(-1);
    run(fx, me(), 1);
    expect(Math.abs(fx.dy)).toBeLessThan(0.01);
  });

  it('starts at the eye height of the first state, without a swoop', () => {
    const fx = createEffects();
    fx.update(me({ mode: MODE.CROUCH }), 0, DT);
    expect(fx.dy).toBe(0);
  });
});

describe('hang and climb', () => {
  it('settles the look down on a grab, then back', () => {
    const fx = createEffects();
    fx.update(me({ mode: MODE.HANG }), 0, DT, { ev: EV.GRAB, fall: 0 });
    let low = 0;
    for (let t = 0; t < 1.5; t += DT) {
      fx.update(me({ mode: MODE.HANG }), 0, DT);
      low = Math.min(low, fx.pitch);
    }
    expect(low).toBeLessThan(-0.02);
    expect(low).toBeGreaterThan(-0.1);
    expect(Math.abs(fx.pitch)).toBeLessThan(1e-3);
  });

  it('arcs the look up while climbing, and levels after', () => {
    const fx = createEffects();
    let peak = 0;
    for (let t = 0; t < 24; t++) {
      fx.update(me({ mode: MODE.CLIMB, t }), 0, DT);
      peak = Math.max(peak, fx.pitch);
    }
    expect(peak).toBeGreaterThan(0.04);
    expect(peak).toBeLessThan(0.15);
    run(fx, me(), 1);
    expect(Math.abs(fx.pitch)).toBeLessThan(1e-3);
  });

  it('dips a little on the top of a climb', () => {
    const fx = createEffects();
    fx.update(me(), 0, DT, { ev: EV.CLIMB, fall: 0 });
    let low = 0;
    for (let t = 0; t < 0.5; t += DT) {
      fx.update(me(), 0, DT);
      low = Math.min(low, fx.dy);
    }
    expect(low).toBeLessThan(-0.02);
  });
});

describe('no player yet', () => {
  it('draws nothing moved, and settles what was', () => {
    const fx = run(createEffects(), at(9, 0), 1);
    run(fx, undefined, 2);
    expect(fx.fov).toBeCloseTo(0, 1);
    expect(fx.lines).toBeCloseTo(0, 1);
    expect(fx.dy).toBeCloseTo(0);
    // The eye height is not eased up from nothing when the player shows up.
    fx.update(me(), 0, DT);
    expect(fx.dy).toBeCloseTo(0);
  });
});

describe('shape', () => {
  it('holds the numbers the camera draws and the stride, and update', () => {
    expect(Object.keys(createEffects()).sort()).toEqual([
      'dy',
      'fov',
      'lines',
      'pitch',
      'roll',
      'stride',
      'update',
    ]);
  });
});
