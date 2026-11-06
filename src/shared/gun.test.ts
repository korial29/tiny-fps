import { describe, expect, it } from 'vitest';
import { EAST, at, yard } from '../../test/yard';
import {
  AMMO_MAX,
  DOWN_TICKS,
  EYE,
  GUN_COOLDOWN,
  GUN_RANGE,
  HP_MAX,
  LOW_EYE,
  LOW_H,
  PICK_H,
  PLAYER_H,
  PLAYER_R,
  RACK_R,
} from './constants';
import { shoot, step, within } from './gun';
import { spawn } from './physics';
import { onWire } from './protocol';
import { EV, KEY, MODE, TEX } from './types';
import type { PlayerState } from './types';
import { build } from './world';
import type { Brush } from './world';

const { FORWARD, JUMP, FIRE, CROUCH } = KEY;

/** A yard with a rack for red at (5, 0, 0) and a blue one at (-5, 0, 0). */
const racked = build({
  ...yard.def,
  teams: [
    { ...yard.def.teams[0], rack: [5, 0, 0] },
    { ...yard.def.teams[1], rack: [-5, 0, 0] },
  ],
});

/** One input through the gun's step, on the yard unless told. */
const go = (p: PlayerState, keys: number, yaw = EAST, pitch = 0, w = yard, team = 0): boolean =>
  step(p, onWire({ keys, yaw, pitch, seq: 0 }), w, team);

/** A red player standing at (x, z) on the yard with a full gun. */
const armed = (x = 0, z = 0, over: Partial<PlayerState> = {}): PlayerState =>
  Object.assign(at(x, z, EAST).p, { ammo: AMMO_MAX }, over);

/** Only the ground of the yard: nothing stands in a laser's way. */
const flat = build({ ...yard.def, brushes: [yard.def.brushes[0]] });

describe('the trigger', () => {
  it('fires at once, then every GUN_COOLDOWN ticks while FIRE is held, one ammo each', () => {
    const p = armed();
    const fired = Array.from({ length: 30 }, () => go(p, FIRE));
    expect(fired.flatMap((f, k) => (f ? [k] : []))).toEqual([0, 7, 14, 21, 28]);
    expect([p.ammo, p.shots]).toEqual([AMMO_MAX - 5, 5]);
    expect(p.cool).toBe(GUN_COOLDOWN - 1);
    expect(GUN_COOLDOWN).toBe(7);
  });

  it('keeps the cooldown running when FIRE is let go: a tap is not a faster gun', () => {
    const p = armed();
    expect(go(p, FIRE)).toBe(true);
    // A tap every other tick: the first tap after the cooldown fires, 7 ticks after the first shot.
    const fired = Array.from({ length: 12 }, (_, k) => go(p, k % 2 ? FIRE : 0));
    expect(fired.indexOf(true)).toBe(GUN_COOLDOWN);
    expect(p.shots).toBe(2);
  });

  it('does not fire without the key, without the gun, or with an empty one', () => {
    const p = armed();
    for (let k = 0; k < 20; k++) {
      expect(go(p, FORWARD)).toBe(false);
    }
    expect([p.shots, p.ammo]).toEqual([0, AMMO_MAX]);
    for (const ammo of [-1, 0]) {
      const q = armed(0, 0, { ammo });
      for (let k = 0; k < 20; k++) {
        expect(go(q, FIRE)).toBe(false);
      }
      expect([q.shots, q.ammo]).toEqual([0, ammo]);
    }
  });

  it('empties the gun and stops at 0', () => {
    const p = armed(0, 0, { ammo: 3 });
    for (let k = 0; k < 100; k++) {
      go(p, FIRE);
    }
    expect([p.ammo, p.shots]).toEqual([0, 3]);
  });

  it('wraps the shot counter at 256', () => {
    const p = armed(0, 0, { shots: 255 });
    go(p, FIRE);
    expect(p.shots).toBe(0);
  });

  it('fires on the move: running, in the air, wall-running, sliding and crouching', () => {
    for (const mode of [MODE.GROUND, MODE.AIR, MODE.WALLRUN, MODE.SLIDE, MODE.CROUCH]) {
      const p = armed(0, 0, { mode });
      expect(go(p, FIRE | FORWARD), `mode ${mode}`).toBe(true);
    }
    const p = armed();
    go(p, FORWARD | JUMP | FIRE);
    expect(p.mode).toBe(MODE.AIR);
    expect(p.shots).toBe(1);
  });

  it('does not fire while hanging from a ledge or climbing it, and does before and after', () => {
    const p = armed(8.5, 0);
    go(p, FORWARD | JUMP | FIRE);
    const modes = new Set<number>();
    let busy = 0;
    let last = 0;
    for (let k = 0; k < 90; k++) {
      const before = p.shots;
      go(p, FORWARD | FIRE);
      modes.add(p.mode);
      if (p.mode === MODE.HANG || p.mode === MODE.CLIMB) {
        busy++;
        last = p.shots;
        expect(p.shots, `step ${k}`).toBe(before);
      }
    }
    expect(modes.has(MODE.HANG) && modes.has(MODE.CLIMB)).toBe(true);
    expect(busy).toBeGreaterThan(5);
    // Fired in the air before the grab, and again once up.
    expect(last).toBeGreaterThan(0);
    expect(p.shots).toBeGreaterThan(last);
  });

  it('does not fire when the match is over', () => {
    const p = armed();
    expect(step(p, onWire({ keys: FIRE, yaw: EAST, pitch: 0, seq: 0 }), yard, 0, false)).toBe(
      false,
    );
    expect(p.shots).toBe(0);
  });
});

describe('the rack', () => {
  const at5 = (over: Partial<PlayerState> = {}) =>
    Object.assign(at(5, 0, EAST).p, { ammo: -1 }, over);

  it("gives the team's rack gun with AMMO_MAX when the feet are within RACK_R, and fills it again", () => {
    const p = at5();
    go(p, 0, EAST, 0, racked);
    expect(p.ammo).toBe(AMMO_MAX);
    p.ammo = 12;
    go(p, 0, EAST, 0, racked);
    expect(p.ammo).toBe(AMMO_MAX);
    // Not the shot of the step it is filled in: the gun is full before it fires.
    const q = at5({ ammo: 1 });
    go(q, FIRE, EAST, 0, racked);
    expect([q.ammo, q.shots]).toEqual([AMMO_MAX - 1, 1]);
  });

  it('walks over it: a run through the circle is enough', () => {
    const p = at(2, 0, EAST).p;
    p.ammo = -1;
    let got = -1;
    for (let k = 0; k < 40 && got < 0; k++) {
      go(p, FORWARD, EAST, 0, racked);
      got = p.ammo;
    }
    expect(got).toBe(AMMO_MAX);
    expect(p.x).toBeGreaterThan(5 - RACK_R);
    expect(p.x).toBeLessThan(5 + RACK_R);
  });

  it('is the own team’s only, and is out of reach beyond RACK_R sideways or PICK_H up', () => {
    const blue = at5();
    go(blue, 0, EAST, 0, racked, 1);
    expect(blue.ammo).toBe(-1);
    // A step toward blue's own rack at x = -5 does.
    const mine = Object.assign(at(-5, 0, EAST).p, { ammo: -1 });
    go(mine, 0, EAST, 0, racked, 1);
    expect(mine.ammo).toBe(AMMO_MAX);
    const far = at(5 + RACK_R + 0.05, 0, EAST).p;
    far.ammo = -1;
    go(far, 0, EAST, 0, racked);
    expect(far.ammo).toBe(-1);
    // A map with no rack gives nothing.
    const none = at5();
    go(none, 0);
    expect(none.ammo).toBe(-1);
  });

  it('is not taken when the match is over', () => {
    const p = at5();
    step(p, onWire({ keys: 0, yaw: EAST, pitch: 0, seq: 0 }), racked, 0, false);
    expect(p.ammo).toBe(-1);
  });

  it('measures a pick-up on the floor plane and in height', () => {
    const p = armed(0, 0);
    expect(within(p, [RACK_R - 0.01, 0, 0], RACK_R)).toBe(true);
    expect(within(p, [RACK_R + 0.01, 0, 0], RACK_R)).toBe(false);
    expect(within(p, [0, 0, -(RACK_R - 0.01)], RACK_R)).toBe(true);
    expect(within(p, [0, PICK_H - 0.01, 0], RACK_R)).toBe(true);
    expect(within(p, [0, PICK_H + 0.01, 0], RACK_R)).toBe(false);
    expect(within(p, [0, -PICK_H - 0.01, 0], RACK_R)).toBe(false);
    // The circle, not the square: its corner is out.
    expect(within(p, [RACK_R * 0.8, 0, RACK_R * 0.8], RACK_R)).toBe(false);
  });
});

describe('down', () => {
  it('moves with no keys: he lies where he fell, cannot fire, and the look still follows', () => {
    const p = armed(0, 0, { down: 30, hp: 0 });
    for (let k = 0; k < 10; k++) {
      expect(go(p, FORWARD | FIRE | JUMP | CROUCH, 1.25, 0.4)).toBe(false);
    }
    expect([p.x, p.z, p.y, p.shots]).toEqual([0, 0, 0, 0]);
    expect(p.down).toBe(20);
    expect(p.yaw).toBeCloseTo(1.25, 4);
    expect(p.mode).toBe(MODE.GROUND);
  });

  it('keeps the gravity: one down in the air falls to the floor, and slides on with his speed', () => {
    const p = armed(0, 0, { down: 200, hp: 0, y: 5, mode: MODE.AIR, ground: false, vx: 3 });
    for (let k = 0; k < 120; k++) {
      go(p, FORWARD);
    }
    expect(p.y).toBe(0);
    expect(p.ground).toBe(true);
    // The speed rubbed out on the floor: a little way on, then still.
    expect(p.x).toBeGreaterThan(0.5);
    expect(p.vx).toBe(0);
  });

  it('is back at a spawn of his team when down runs out: full health, no gun, no cooldown', () => {
    const w = build({
      ...yard.def,
      teams: [
        { base: [0, 0, 0], spawns: [[30, 0, 20, 1]] },
        { base: [0, 0, 0], spawns: [[-30, 0, -20, 2]] },
      ],
    });
    for (const team of [0, 1]) {
      const p = Object.assign(spawn(0, w, 0, team), {
        x: 3,
        z: 4,
        ammo: -1,
        hp: 0,
        down: 3,
        cool: 5,
        shots: 17,
        hits: 9,
      });
      go(p, FIRE, EAST, 0.3, w, team);
      go(p, FIRE, EAST, 0.3, w, team);
      expect([p.down, p.hp, p.x]).toEqual([1, 0, 3]);
      go(p, FIRE, EAST, 0.3, w, team);
      const [x, z] = team ? [-30, -20] : [30, 20];
      expect(p).toMatchObject({ x, z, hp: HP_MAX, ammo: -1, cool: 0, down: 0, mode: MODE.GROUND });
      expect(p.ev & EV.RESPAWN).toBe(EV.RESPAWN);
      // The counters go on: the clients draw a shot on each change.
      expect([p.shots, p.hits]).toEqual([17, 9]);
      // Looking where the input says.
      expect(p.pitch).toBeCloseTo(0.3, 4);
      // And he plays again.
      p.ammo = 5;
      expect(go(p, FIRE, EAST, 0, w, team)).toBe(true);
    }
  });

  it('lasts DOWN_TICKS inputs from the one that put him down', () => {
    const p = armed(0, 0, { down: DOWN_TICKS, hp: 0, ammo: -1 });
    for (let k = 1; k < DOWN_TICKS; k++) {
      go(p, 0);
      expect(p.down, `input ${k}`).toBe(DOWN_TICKS - k);
    }
    go(p, 0);
    expect([p.down, p.hp]).toEqual([0, HP_MAX]);
  });

  it('is cut short by the kill floor, which puts him back too, once', () => {
    const p = armed(0, 0, { down: 50, hp: 0, ammo: -1, y: -60, mode: MODE.AIR, ground: false });
    go(p, 0);
    expect([p.down, p.hp, p.y]).toEqual([0, HP_MAX, 0]);
    // Not counted down from zero: nothing is left of the timer.
    go(p, 0);
    expect(p.down).toBe(0);
  });
});

describe('the kill floor', () => {
  it('gives back full health and takes the gun away, and keeps the counters', () => {
    const p = armed(0, 0, { hp: 2, ammo: 30, y: -60, shots: 7, hits: 3, cool: 4 });
    go(p, 0);
    expect(p).toMatchObject({ hp: HP_MAX, ammo: -1, cool: 0, shots: 7, hits: 3 });
    expect(p.ev & EV.RESPAWN).toBe(EV.RESPAWN);
  });
});

/** A shooter at the origin looking east, and a foe standing at (x, 0, z). */
const shooter = (over: Partial<PlayerState> = {}): PlayerState =>
  Object.assign(spawn(0, flat, 0), { x: 0, y: 0, z: 0, yaw: EAST }, over);
const foe = (x: number, z = 0, over: Partial<PlayerState> = {}): PlayerState =>
  Object.assign(spawn(1, flat, 0), { x, y: 0, z }, over);

describe('the laser', () => {
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

  it('is as wide as the body: a miss by more than PLAYER_R sideways, a hit by less', () => {
    expect(shoot(flat, shooter(), [foe(10, PLAYER_R - 0.01)])).toBeDefined();
    expect(shoot(flat, shooter(), [foe(10, -(PLAYER_R - 0.01))])).toBeDefined();
    expect(shoot(flat, shooter(), [foe(10, PLAYER_R + 0.01)])).toBeUndefined();
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

  it('is as low as the target: a slide or a crouch passes under a laser from the standing eye', () => {
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

  it('is stopped by a brush, and not by one behind the target or beside the line', () => {
    const wall = (x0: number, x1: number, z0 = -5, z1 = 5): Brush => ({
      min: [x0, 0, z0],
      max: [x1, 6, z1],
      top: TEX.TILE,
      side: TEX.BRICK,
    });
    const f = foe(10);
    const walled = (...b: Brush[]) => build({ ...flat.def, brushes: [...flat.def.brushes, ...b] });
    expect(shoot(walled(wall(5, 5.5)), shooter(), [f])).toBeUndefined();
    expect(shoot(walled(wall(12, 12.5)), shooter(), [f])).toBe(f);
    expect(shoot(walled(wall(5, 5.5, 3, 8)), shooter(), [f])).toBe(f);
    // A low step does not stop it: the eye is above the top.
    const step = { ...wall(5, 5.5), max: [5.5, 1, 5] as [number, number, number] };
    expect(shoot(walled(step), shooter(), [f])).toBe(f);
    // A floor does: aimed down into the flat ground, the laser ends there, short of a target
    // standing under it.
    expect(shoot(flat, shooter({ pitch: -0.5 }), [foe(30, 0, { y: -5 })])).toBeUndefined();
  });

  it('reaches GUN_RANGE and no further', () => {
    expect(shoot(flat, shooter(), [foe(GUN_RANGE - 1)])).toBeDefined();
    expect(shoot(flat, shooter(), [foe(GUN_RANGE + 1)])).toBeUndefined();
  });
});
