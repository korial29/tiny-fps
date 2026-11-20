import { describe, expect, it } from 'vitest';
import { BOLT_SPEED } from '../shared/constants';
import { MOON } from '../shared/moon';
import { spawn } from '../shared/physics';
import { aimOf } from '../shared/rover';
import { SHIP, dock } from '../shared/ship';
import { MODE, NOBODY } from '../shared/types';
import { build } from '../shared/world';
import { project, viewProj } from './render';
import { intercept, shipTargeting } from './targeting';
import { targetingPhysics } from './targeting-physics';

describe('ship targeting', () => {
  const [ship] = dock([[0, 690, 0, 0]]);
  const world = build(MOON);
  const camera: [number, number, number] = [ship.x, ship.y + 5, ship.z + 16];
  const view = viewProj(camera, 0, 0, 16 / 9);
  const sight = {
    world,
    camera,
    yaw: 0,
    aspect: 16 / 9,
    project: (x: number, y: number, z: number) => project(view, x, y, z),
    hostile: (id: number) => id === 1 || id === 2,
  };
  const enemy = { ...ship, driver: 1, z: -80, vx: 30 };
  const convergence = aimOf(ship, 0, 0);

  it('leads a crossing target by the actual time of flight and respects laser range', () => {
    const hit = intercept([0, 0, 0], [0, 0, -80], enemy, BOLT_SPEED, SHIP.GUN_RANGE)!;
    const time = Math.hypot(...hit) / BOLT_SPEED;
    expect(hit[0]).toBeCloseTo(enemy.vx * time);
    expect(hit[2]).toBe(-80);
    expect(
      intercept([0, 0, 0], [0, 0, -SHIP.GUN_RANGE], enemy, BOLT_SPEED, SHIP.GUN_RANGE),
    ).toBeUndefined();
  });

  it('frames visible enemies and leads the one nearest the aim', () => {
    const infantry = { ...spawn(2, world, 0, 1), x: 38, y: ship.y, z: -95 };
    const targets = shipTargeting(
      sight,
      ship,
      convergence,
      [
        ship,
        enemy,
        { ...enemy, x: -20, driver: 3 },
        { ...enemy, x: -30, driver: NOBODY },
        { ...enemy, x: -40, wreck: 1 },
        { ...enemy, z: 40 },
      ],
      [infantry, { ...infantry, mode: MODE.RIDE }, { ...infantry, down: 1 }],
      targetingPhysics,
    );
    expect(targets.boxes).toHaveLength(2);
    expect(targets.lead![0]).toBeGreaterThan(targets.boxes[0].at[0]);
    expect(targets.boxes[0].width).toBeGreaterThan(targets.boxes[1].width);
  });

  it('keeps a distant contact visible and removes its out-of-range lead', () => {
    const targets = shipTargeting(
      sight,
      ship,
      convergence,
      [{ ...enemy, z: -SHIP.GUN_RANGE - 5 }],
      [],
      targetingPhysics,
    );
    expect(targets.boxes).toHaveLength(1);
    expect(targets.lead).toBeUndefined();
    expect(targets.aim).toEqual(sight.project(...convergence));
  });
});
