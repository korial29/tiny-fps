import { describe, expect, it } from 'vitest';
import { EAST, yard } from '../../test/yard';
import {
  EYE,
  GUN_RANGE,
  LOW_EYE,
  LOW_H,
  PLASMA_R,
  PLASMA_SPEED,
  PLAYER_H,
  PLAYER_R,
  TICK_HZ,
} from './constants';
import { spawn } from './physics';
import { PLASMA_STEP, cylinder, fly, launch } from './plasma';
import { MODE, TEX } from './types';
import type { PlayerState } from './types';
import { build } from './world';
import type { Brush, World } from './world';

/** Only the ground of the yard: nothing stands in a ball's way. */
const flat = build({ ...yard.def, brushes: [yard.def.brushes[0]] });

/** A shooter at the origin looking east, and a foe standing at (x, 0, z). */
const shooter = (over: Partial<PlayerState> = {}): PlayerState =>
  Object.assign(spawn(0, flat, 0), { x: 0, y: 0, z: 0, yaw: EAST, shots: 9 }, over);
const foe = (x: number, z = 0, over: Partial<PlayerState> = {}): PlayerState =>
  Object.assign(spawn(1, flat, 0), { x, y: 0, z }, over);

/** The ball `p` fires, flown all the way: the foe it burst on. */
const shoot = (w: World, p: PlayerState, foes: PlayerState[]) => fly(w, launch(p), GUN_RANGE, foes);

const wall = (x0: number, x1: number, z0 = -5, z1 = 5): Brush => ({
  min: [x0, 0, z0],
  max: [x1, 6, z1],
  top: TEX.TILE,
  side: TEX.BRICK,
});
const walled = (...b: Brush[]) => build({ ...flat.def, brushes: [...flat.def.brushes, ...b] });

describe('a plasma ball', () => {
  it('leaves the eye of the mode along the look, named by the shots count, with the range to go', () => {
    const b = launch(shooter({ x: 3, z: 4, pitch: 0.3 }), 1);
    expect(b).toMatchObject({ id: 9, by: 0, team: 1, x: 3, y: EYE, z: 4, left: GUN_RANGE });
    expect(b.burst).toBe(false);
    expect([b.dx, b.dy, b.dz]).toEqual([
      expect.closeTo(Math.cos(0.3), 9),
      expect.closeTo(Math.sin(0.3), 9),
      expect.closeTo(0, 9),
    ]);
    expect(launch(shooter({ mode: MODE.CROUCH })).y).toBe(LOW_EYE);
  });

  it('flies PLASMA_SPEED: PLASMA_STEP metres a tick, and is spent after GUN_RANGE', () => {
    expect(PLASMA_STEP * TICK_HZ).toBe(PLASMA_SPEED);
    const b = launch(shooter());
    let n = 0;
    while (b.left > 0 && n < 1000) {
      expect(fly(flat, b, PLASMA_STEP, [])).toBeUndefined();
      expect(b.burst).toBe(false);
      n++;
    }
    expect(n).toBe(Math.ceil(GUN_RANGE / PLASMA_STEP));
    expect(b.x).toBeCloseTo(GUN_RANGE, 9);
    expect(b.left).toBe(0);
  });

  it('hits an enemy in front, at the eye height of the look', () => {
    const f = foe(10);
    expect(shoot(flat, shooter(), [f])).toBe(f);
    // The eye is 1.6 m up and the cylinder 1.8 m: a look 0.015 rad up still hits at 10 m...
    expect(shoot(flat, shooter({ pitch: 0.015 }), [f])).toBe(f);
    // ...and 0.1 rad up passes over the head, and 0.1 rad down hits the body.
    expect(shoot(flat, shooter({ pitch: 0.1 }), [f])).toBeUndefined();
    expect(shoot(flat, shooter({ pitch: -0.1 }), [f])).toBe(f);
    expect(shoot(flat, shooter({ pitch: -0.2 }), [f])).toBeUndefined();
    expect(EYE).toBeLessThan(PLAYER_H);
  });

  it('bursts on the body where it meets it, a ball’s radius out of it', () => {
    const b = launch(shooter());
    expect(fly(flat, b, GUN_RANGE, [foe(10)])).toBeDefined();
    expect(b.burst).toBe(true);
    expect(b.x).toBeCloseTo(10 - PLAYER_R - PLASMA_R, 9);
    expect(b.left).toBeCloseTo(GUN_RANGE - b.x, 9);
  });

  it('is a ball wider than a laser: a miss by more than PLAYER_R + PLASMA_R sideways, a hit by less', () => {
    const r = PLAYER_R + PLASMA_R;
    expect(shoot(flat, shooter(), [foe(10, r - 0.01)])).toBeDefined();
    expect(shoot(flat, shooter(), [foe(10, -(r - 0.01))])).toBeDefined();
    expect(shoot(flat, shooter(), [foe(10, r + 0.01)])).toBeUndefined();
    // Behind the shooter, or off to the side.
    expect(shoot(flat, shooter(), [foe(-10)])).toBeUndefined();
    expect(shoot(flat, shooter(), [foe(0, 10)])).toBeUndefined();
  });

  it('goes along the yaw, whatever way he faces', () => {
    for (const [yaw, x, z] of [
      [0, 0, -9],
      [Math.PI, 0, 9],
      [Math.PI / 2, -9, 0],
      [Math.PI / 4, -9 * Math.SQRT1_2, -9 * Math.SQRT1_2],
    ]) {
      expect(shoot(flat, shooter({ yaw }), [foe(x, z)]), `yaw ${yaw}`).toBeDefined();
      expect(shoot(flat, shooter({ yaw: yaw + 0.2 }), [foe(x, z)]), `yaw ${yaw}`).toBeUndefined();
    }
  });

  it('takes the nearest of two in line, and the one it reaches when the near one is beside it', () => {
    const [near, far] = [foe(6), foe(12)];
    expect(shoot(flat, shooter(), [far, near])).toBe(near);
    expect(shoot(flat, shooter(), [near, far])).toBe(near);
    const beside = foe(6, 1);
    expect(shoot(flat, shooter(), [beside, far])).toBe(far);
  });

  it('is as low as the target: a slide or a crouch passes under a ball from the standing eye', () => {
    expect(shoot(flat, shooter(), [foe(10, 0, { mode: MODE.CROUCH })])).toBeUndefined();
    expect(shoot(flat, shooter(), [foe(10, 0, { mode: MODE.SLIDE })])).toBeUndefined();
    expect(LOW_H).toBeLessThan(EYE);
    // From a crouch, the eye is down at 0.7 m: the same low target is hit.
    const low = shooter({ mode: MODE.CROUCH });
    expect(shoot(flat, low, [foe(10, 0, { mode: MODE.CROUCH })])).toBeDefined();
    expect(LOW_EYE).toBeLessThan(LOW_H);
    // And a standing target is hit by the low eye too.
    expect(shoot(flat, low, [foe(10)])).toBeDefined();
  });

  it('hits from above and from below, down a slope of fire', () => {
    // From a roof 8 m up, looking 0.7 rad down.
    const up = shooter({ y: 8, pitch: -0.7 });
    const x = (8 + EYE - 0.9) / Math.tan(0.7);
    expect(shoot(flat, up, [foe(x)])).toBeDefined();
    expect(shoot(flat, up, [foe(x + 4)])).toBeUndefined();
    // From the ground, up at one standing on a roof 5 m up.
    const below = shooter({ pitch: Math.atan2(5 + 0.9 - EYE, 10) });
    expect(shoot(flat, below, [foe(10, 0, { y: 5 })])).toBeDefined();
    expect(shoot(flat, below, [foe(10)])).toBeUndefined();
  });

  it('bursts on a brush a ball’s radius before its face, and not on one behind the target or beside the line', () => {
    const f = foe(10);
    expect(shoot(walled(wall(5, 5.5)), shooter(), [f])).toBeUndefined();
    const b = launch(shooter());
    fly(walled(wall(5, 5.5)), b, GUN_RANGE, []);
    expect(b.burst).toBe(true);
    expect(b.x).toBeCloseTo(5 - PLASMA_R, 9);
    expect(shoot(walled(wall(12, 12.5)), shooter(), [f])).toBe(f);
    expect(shoot(walled(wall(5, 5.5, 3, 8)), shooter(), [f])).toBe(f);
    // A wall whose edge passes within the ball's radius of its centre stops it.
    expect(shoot(walled(wall(5, 5.5, PLASMA_R - 0.01, 8)), shooter(), [f])).toBeUndefined();
    // A low step does not stop it: the eye is above the top.
    const step = { ...wall(5, 5.5), max: [5.5, 1, 5] as [number, number, number] };
    expect(shoot(walled(step), shooter(), [f])).toBe(f);
    // A floor does: aimed down into the flat ground, it bursts there, short of a target standing
    // under it.
    const down = launch(shooter({ pitch: -0.5 }));
    expect(fly(flat, down, GUN_RANGE, [foe(30, 0, { y: -5 })])).toBeUndefined();
    expect([down.burst, down.y]).toEqual([true, expect.closeTo(PLASMA_R, 9)]);
  });

  it('flies a tick at a time to the same end as in one go', () => {
    const f = foe(30, 0.2);
    const b = launch(shooter());
    let hit: PlayerState | undefined;
    for (let k = 0; k < 100 && !b.burst; k++) {
      hit = fly(flat, b, PLASMA_STEP, [f]);
    }
    const c = launch(shooter());
    expect(hit).toBe(f);
    expect(fly(flat, c, GUN_RANGE, [f])).toBe(f);
    expect(b.x).toBeCloseTo(c.x, 9);
  });

  it('reaches GUN_RANGE and no further', () => {
    expect(shoot(flat, shooter(), [foe(GUN_RANGE - 1)])).toBeDefined();
    expect(shoot(flat, shooter(), [foe(GUN_RANGE + 1)])).toBeUndefined();
  });
});

describe('cylinder', () => {
  it('is the distance into an upright cylinder, Infinity on a miss, 0 from inside', () => {
    const c = foe(10);
    expect(cylinder([0, 1, 0], [1, 0, 0], c, 0.5, PLAYER_H)).toBeCloseTo(9.5, 9);
    expect(cylinder([0, 1, 0], [-1, 0, 0], c, 0.5, PLAYER_H)).toBe(Infinity);
    expect(cylinder([0, 3, 0], [1, 0, 0], c, 0.5, PLAYER_H)).toBe(Infinity);
    expect(cylinder([10, 1, 0], [1, 0, 0], c, 0.5, PLAYER_H)).toBe(0);
    // Straight down onto the head.
    expect(cylinder([10.1, 5, 0], [0, -1, 0], c, 0.5, PLAYER_H)).toBeCloseTo(5 - PLAYER_H, 9);
  });
});
