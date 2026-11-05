import { describe, expect, it } from 'vitest';
import type { PlayerState } from '../shared/types';
import { gather } from './lights';
import type { Scene } from './lights';

const player = (id: number, x: number, yaw = 0): PlayerState => ({
  id,
  x,
  y: 0,
  z: 8,
  vy: 0,
  yaw,
  pitch: 0,
  ground: true,
});
const scene = (over: Partial<Scene> = {}): Scene => ({
  eye: [8, 1.6, 8],
  yaw: 0,
  pitch: 0,
  others: [],
  t: 0,
  ...over,
});

describe('gather', () => {
  it('lights nothing besides the sun and the sky in a bare scene: no flashlight of the own player', () => {
    expect(gather(scene())).toEqual([]);
    expect(gather(scene({ yaw: 1, pitch: 0.4 }))).toEqual([]);
  });

  it('gives the other players no flashlight either, however many', () => {
    const others = Array.from({ length: 20 }, (_, i) => player(i + 1, 2 + i, i));
    expect(gather(scene({ others }))).toEqual([]);
  });

  it('makes no light at any time: no pulsing lava or flash', () => {
    for (const t of [0, 1.3, 99]) {
      expect(gather(scene({ t }))).toEqual([]);
    }
  });
});
