import { expect, it } from 'vitest';
import { STILL } from '../shared/physics';
import type { PlayerState } from '../shared/types';
import { createBody, hands, HUNTER_HAND } from './body';
import { rest, solve } from './rig';
import { hunter } from './hunter';
import { SHINE, STRIDE } from './mesh';

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

const view = (isHunter: boolean): number[] => {
  const body = createBody();
  body.wear(0, undefined, false, false, isHunter);
  body.update(player, 1 / 60);
  const out: number[] = [];
  body.draw(out, [0, 1.6, 0], 0, 0);
  return out;
};

it('draws the Hunter model equipment on the first-person rig', () => {
  const marine = view(false);
  const hunterView = view(true);
  const model = hunter(1);
  const parts = [
    'Harpoon harness',
    'Blade cuff',
    'Left bracer',
    'Rib guard',
    'Chest net',
    'Laser saddle',
    'Shoulder laser',
    'Shoulder plates',
    'Belt',
    'Flying disc',
  ];
  const plainHands: number[] = [],
    clawedHands: number[] = [];
  const pose = solve(rest());
  hands(plainHands, pose, 0, [0, 0], [0, 0, 0], HUNTER_HAND);
  hands(clawedHands, pose, 0, [0, 0], HUNTER_HAND, HUNTER_HAND, { claws: 'short' });
  const gear = parts.reduce((sum, name) => sum + model[name].length, 0);
  expect(hunterView.length - marine.length).toBe(gear + clawedHands.length - plainHands.length);
  expect(hunterView.some((_, i) => i % STRIDE === 8 && hunterView[i] === SHINE)).toBe(true);
  expect(hunterView.length % STRIDE).toBe(0);
});
