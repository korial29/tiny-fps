import { describe, expect, it } from 'vitest';
import { SWIM_DEPTH } from '../../shared/constants';
import { MAPS } from '../../shared/maps';
import { STILL, eyeHeight, spawn } from '../../shared/physics';
import { MODE } from '../../shared/types';
import type { PlayerState } from '../../shared/types';
import { build } from '../../shared/world';
import { createBody } from '../body';
import { JOINT as J } from '../rig';

const world = build(MAPS.landfall);
const water = world.def.water ?? 0;

/** A swimmer heading out to sea at depth `sunk` under the swimming level, looking `pitch` up; its hands' heights over the eye. */
const hands = (pitch: number, sunk = 0): number[] => {
  const body = createBody(world);
  const me = {
    ...STILL,
    ...spawn(1, world, 0, 0),
    id: 1,
    x: 12,
    z: 60,
    y: water - SWIM_DEPTH - sunk,
    mode: MODE.SWIM,
    yaw: Math.PI / 2,
    pitch,
    vx: -3,
    vy: 0,
    vz: 0,
  } as PlayerState;
  const eye: [number, number, number] = [me.x, me.y + eyeHeight(me), me.z];
  const out: number[] = [];
  // Over a whole stroke (0.74 Hz at this speed), sampled.
  for (let i = 0; i < 90; i++) {
    body.update(me, 1 / 60, 0);
    if (i >= 30 && i % 4 == 0) {
      const s = body.pose(eye, me.yaw, pitch)!;
      out.push(...[J.HAND_L, J.HAND_R].map(j => s.pos[j][1] - eye[1]));
    }
  }
  return out;
};

describe('the swimmer’s own arms', () => {
  it('stay in the water at the surface when the view looks up at the sky', () => {
    // The user, 2026-11-27: looking up, the arms went on swimming in the sky.
    for (const h of hands(0.9)) {
      expect(h).toBeLessThan(-0.05);
    }
  });

  it('go back to the view’s pitch once he dives', () => {
    expect(Math.max(...hands(0.9, 1))).toBeGreaterThan(0.1);
  });
});
