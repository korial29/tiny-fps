import { describe, expect, it } from 'vitest';
import { duo } from '../../test/teams';
import { Sim } from '../../test/pilot';
import { JUMP_SPEED, GRAVITY, TICK_HZ } from './constants';
import { KEY, TEX } from './types';
import { build } from './world';

const world = (gravity?: number) =>
  build({
    brushes: [{ min: [-50, -5, -50], max: [50, 0, 50], top: TEX.TILE, side: TEX.BRICK }],
    teams: duo([[0, 0, 0, 0]]),
    floor: -50,
    sun: { dir: [0, 1, 0], color: [1, 1, 1] },
    sky: [
      [0, 0, 1],
      [1, 1, 1],
    ],
    ...(gravity === undefined ? {} : { gravity }),
  });

/** A standing jump: the apex height, and the ticks from the press to the landing. */
const jump = (gravity?: number) => {
  const s = Sim.at(world(gravity));
  let apex = 0;
  s.step(KEY.JUMP);
  let air = 1;
  while (!s.p.ground && air < 1000) {
    s.step(0);
    apex = Math.max(apex, s.p.y);
    air++;
  }
  return { apex, air, vy: s.p.vy };
};

describe('a map with its own gravity (the moon, the user, 2026-11-09)', () => {
  it('is the same as no gravity field at 1', () => {
    expect(jump(1)).toEqual(jump());
    expect(jump().apex).toBeCloseTo(JUMP_SPEED ** 2 / (2 * GRAVITY), 1);
  });

  it('lifts a jump twice as high and keeps it up twice as long at half gravity', () => {
    const earth = jump();
    const moon = jump(0.5);
    // Apex v² / 2g doubles, and the time up and down v / g doubles with it.
    expect(moon.apex / earth.apex).toBeCloseTo(2, 1);
    expect(moon.air / earth.air).toBeCloseTo(2, 1);
    expect(moon.apex).toBeCloseTo(JUMP_SPEED ** 2 / GRAVITY, 1);
  });

  it('pulls a fall at the share of GRAVITY, whatever the player does', () => {
    const s = Sim.at(world(0.5)).put(0, 20, 0);
    s.step(0);
    expect(s.p.vy).toBeCloseTo((-0.5 * GRAVITY) / TICK_HZ, 6);
  });
});
