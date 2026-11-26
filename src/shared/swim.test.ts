import { describe, expect, it } from 'vitest';
import { SWIM_DEPTH, SWIM_SPEED } from './constants';
import { STRIKE, step } from './gun';
import { onWire } from './protocol';
import { EV, KEY, MODE, TEX } from './types';
import { spawn } from './physics';
import { build } from './world';
import type { WorldDef } from './world';
import { Sim, EAST, WEST } from '../../test/pilot';
import { duo } from '../../test/teams';

/** Deep sea bed (top -3) for x < 0, a shoal (top -1) for x > 0; the water at 0 and a kill floor far under. */
const SEA: WorldDef = {
  brushes: [
    { min: [-100, -8, -50], max: [0, -3, 50], top: TEX.TILE, side: TEX.BRICK },
    { min: [0, -8, -50], max: [100, -1, 50], top: TEX.TILE, side: TEX.BRICK },
  ],
  teams: duo([[30, -1, 0, 0]], [[60, -1, 0, 0]]),
  floor: -20,
  water: 0,
  sun: { dir: [0, 1, 0], color: [1, 1, 1] },
  sky: [
    [0, 0, 1],
    [1, 1, 1],
  ],
};
const world = build(SEA);
const LEVEL = -SWIM_DEPTH;
const swimmer = () => new Sim(spawn(0, world, 0), world).put(-20, -3, 0, WEST);

describe('swimming', () => {
  it('floats a body that falls in or sinks under the level, with no respawn', () => {
    const s = new Sim(spawn(0, world, 0), world).put(-20, 6, 0, WEST);
    s.until(p => p.mode === MODE.SWIM, 0);
    expect(s.p.y).toBe(Math.fround(LEVEL));
    s.run(120, 0);
    expect(s.p.mode).toBe(MODE.SWIM);
    expect(s.p.y).toBe(Math.fround(LEVEL));
    expect(s.ev & EV.RESPAWN).toBe(0);
    expect(s.p.ground).toBe(false);
  });

  it('is slow, and no jump or dash lifts the swimmer', () => {
    const s = swimmer();
    s.run(180, KEY.FORWARD | KEY.SPRINT);
    expect(s.p.mode).toBe(MODE.SWIM);
    const v = Math.hypot(s.p.vx, s.p.vz);
    expect(v).toBeLessThanOrEqual(SWIM_SPEED + 1e-4);
    expect(v).toBeGreaterThan(SWIM_SPEED - 0.05);
    s.step(KEY.JUMP | KEY.FORWARD);
    s.step(KEY.DASH | KEY.FORWARD);
    s.run(5, KEY.FORWARD);
    expect(s.p.mode).toBe(MODE.SWIM);
    expect(s.p.y).toBe(Math.fround(LEVEL));
    expect(s.p.vy).toBe(0);
  });

  it('puts the swimmer on his feet where the bed rises to the level, and back afloat going out', () => {
    const s = swimmer().run(2, 0);
    expect(s.p.mode).toBe(MODE.SWIM);
    s.until(p => p.mode === MODE.GROUND, KEY.FORWARD, EAST, 600);
    expect(s.p.mode).toBe(MODE.GROUND);
    expect(s.p.y).toBeCloseTo(-1, 5);
    s.until(p => p.mode === MODE.SWIM, KEY.FORWARD, WEST, 600);
    expect(s.p.mode).toBe(MODE.SWIM);
    expect(s.ev & EV.RESPAWN).toBe(0);
  });

  it('puts the weapon away: FIRE shoots nothing afloat, and does on the shoal', () => {
    const fire = (x: number, y: number) => {
      const p = spawn(0, world, 0);
      Object.assign(p, { x, y, z: 0 });
      let struck = 0;
      for (let k = 0; k < 40; k++) {
        const i = onWire({ keys: KEY.FIRE, yaw: WEST, pitch: 0, seq: 0 });
        struck += +(step(p, i, world, 0, true) !== STRIKE.NONE);
      }
      return { mode: p.mode, ammo: p.ammo, struck };
    };
    const full = spawn(0, world, 0).ammo;
    const wet = fire(-20, -3);
    expect(wet.mode).toBe(MODE.SWIM);
    expect(wet.ammo).toBe(full);
    expect(wet.struck).toBe(0);
    expect(fire(30, -1).struck).toBeGreaterThan(0);
  });
  it('dives where he looks down, rests on the bed, climbs where he looks up, and drifts to the surface with no key', () => {
    const s = swimmer().run(2, 0);
    for (let k = 0; k < 90; k++) {
      s.step(KEY.FORWARD, WEST, -0.9);
    }
    expect(s.p.mode).toBe(MODE.SWIM);
    expect(s.p.y).toBeLessThan(LEVEL - 0.8);
    // Under the kill floor of a world with a deep bed would be a respawn: not afloat.
    for (let k = 0; k < 200; k++) {
      s.step(KEY.FORWARD, WEST, -1.2);
    }
    expect(s.p.y).toBeCloseTo(-3, 5);
    expect(s.p.mode).toBe(MODE.SWIM);
    expect(s.ev & EV.RESPAWN).toBe(0);
    for (let k = 0; k < 200; k++) {
      s.step(KEY.FORWARD, WEST, 1.0);
    }
    expect(s.p.y).toBeCloseTo(LEVEL, 5);
    for (let k = 0; k < 60; k++) {
      s.step(KEY.FORWARD, WEST, -1.2);
    }
    expect(s.p.y).toBeLessThan(LEVEL - 1);
    for (let k = 0; k < 300; k++) {
      s.step(0, WEST, -1.2);
    }
    expect(s.p.y).toBeCloseTo(LEVEL, 5);
    // Looking up at the surface never lifts him over it.
    s.run(30, KEY.FORWARD);
    for (let k = 0; k < 30; k++) {
      s.step(KEY.FORWARD, WEST, 1.5);
    }
    expect(s.p.y).toBeLessThanOrEqual(Math.fround(LEVEL));
  });
});
