import { expect, it } from 'vitest';
import { STILL } from '../shared/physics';
import type { PlayerState } from '../shared/types';
import { createBody } from './body';
import { hunter } from './hunter';
import { SHINE, STRIDE, WEAVE } from './mesh';

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
    'Laser saddle',
    'Shoulder laser',
    'Shoulder plates',
    'Belt',
    'Flying disc',
  ];
  const net = model['Marine anatomy'].reduce(
    (sum, _, i, vertices) =>
      i % (3 * STRIDE) === 0 && [0, 1, 2].every(k => vertices[i + k * STRIDE + 8] === WEAVE)
        ? sum + 3 * STRIDE
        : sum,
    0,
  );
  const expected = parts.reduce((sum, name) => sum + model[name].length, net);

  expect(hunterView.length - marine.length).toBe(expected);
  expect(hunterView.some((_, i) => i % STRIDE === 8 && hunterView[i] === SHINE)).toBe(true);
  expect(hunterView.length % STRIDE).toBe(0);
});
