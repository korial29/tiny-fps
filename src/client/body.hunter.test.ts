import { expect, it } from 'vitest';
import { STILL } from '../shared/physics';
import type { PlayerState } from '../shared/types';
import { createBody, hands, HUNTER_HAND } from './body';
import { rest, solve } from './rig';
import { SHINE, STRIDE } from './mesh';
import type { Pieces } from './store';

const player: PlayerState = {
  id: 1,
  x: 0,
  y: 0,
  z: 0,
  vy: 0,
  yaw: 0,
  pitch: 0,
  ground: true,
  ...STILL,
};

const view = (isHunter: boolean, pieces?: Pieces): number[] => {
  const body = createBody();
  body.wear(0, undefined, false, false, isHunter);
  body.update(player, 1 / 60);
  const out: number[] = [];
  body.draw(out, [0, 1.6, 0], 0, 0, 0, undefined, pieces);
  return out;
};

it('draws the Hunter model equipment on the first-person rig', () => {
  const marine = view(false);
  const hunterView = view(true);
  const pieces: Pieces = [];
  const kept = view(true, pieces);
  const plainHands: number[] = [],
    clawedHands: number[] = [];
  const pose = solve(rest());
  hands(plainHands, pose, 0, [0, 0], [0, 0, 0], HUNTER_HAND);
  hands(clawedHands, pose, 0, [0, 0], HUNTER_HAND, HUNTER_HAND, { claws: 'short' });
  const clawed = clawedHands.length - plainHands.length;
  // Its eight visible parts and the wrist blades' housing, the blades sheathed: handed over as
  // pieces of the store, they leave the frame's vertices only the clawed hands' difference.
  expect(pieces).toHaveLength(9);
  expect(kept.length - marine.length).toBe(clawed);
  const gear = pieces.reduce((sum, p) => sum + p.m.count * STRIDE, 0);
  // With no list to hand them to, the same parts are written into the frame's vertices.
  expect(hunterView.length - marine.length).toBe(gear + clawed);
  expect(hunterView.some((_, i) => i % STRIDE === 8 && hunterView[i] === SHINE)).toBe(true);
  expect(hunterView.length % STRIDE).toBe(0);
});
