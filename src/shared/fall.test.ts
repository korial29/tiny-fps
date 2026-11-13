import { describe, expect, it } from 'vitest';
import { DOWN_TICKS, FALL_HP, FALL_SAFE, HP_MAX } from './constants';
import { STILL, bruise } from './physics';
import { encodeInput } from './protocol';
import { Room } from './room';
import { FLAG, TEX } from './types';
import type { Conn, PlayerState } from './types';
import type { WorldDef } from './world';
import { duo } from '../../test/teams';

/** A flat slab at y = 1, the red base far from the blue spawns. */
const SLAB = (gravity?: number): WorldDef => ({
  brushes: [{ min: [-100, -5, -100], max: [100, 1, 100], top: TEX.TILE, side: TEX.BRICK }],
  teams: duo([[-60, 1, 0, 0]], [[60, 1, 0, 0]]),
  floor: -20,
  sun: { dir: [0, 1, 0], color: [1, 1, 1] },
  sky: [
    [0, 0, 1],
    [1, 1, 1],
  ],
  gravity,
});

/** Ann (red) let go `h` m over the slab, at rest, with no keys until she lands: her state then. */
const drop = (h: number, gravity?: number, carry = false): PlayerState => {
  const room = new Room({}, SLAB(gravity));
  const ann: Conn = { send: () => {} };
  room.connect(ann);
  room.receive(ann, JSON.stringify({ t: 'join', name: 'Ann' }));
  const p = room['peers'].get(ann)!.state;
  Object.assign(p, STILL, { x: 0, y: 1 + h, z: 0, vy: 0, ground: false });
  if (carry) {
    room['ctf'].flags[1] = { state: FLAG.CARRIED, by: 0, x: 0, y: 0, z: 0, left: 0 };
  }
  for (let seq = 0; seq < 600 && !p.ground; seq++) {
    room.receive(ann, encodeInput({ seq, keys: 0, yaw: 0, pitch: 0 }));
    room.tick();
  }
  expect(p.ground).toBe(true);
  return Object.assign(p, { flag: room['ctf'].flags[1].state });
};

describe('fall damage', () => {
  it('takes nothing up to FALL_SAFE, then 1 hp and 1 more each FALL_HP m/s past it', () => {
    expect(bruise(0)).toBe(0);
    expect(bruise(FALL_SAFE)).toBe(0);
    expect(bruise(FALL_SAFE + 0.01)).toBe(1);
    expect(bruise(FALL_SAFE + FALL_HP)).toBe(1);
    expect(bruise(FALL_SAFE + FALL_HP + 0.01)).toBe(2);
  });

  it('leaves a drop of 9 m unhurt, takes 1 hp for 11 m and more for 13 m, at full gravity', () => {
    expect(drop(9).hp).toBe(HP_MAX);
    expect(drop(11).hp).toBe(HP_MAX - 1);
    const p = drop(13);
    expect(p.hp).toBeLessThan(HP_MAX - 1);
    expect(p.down).toBe(0);
  });

  it('puts a player down from 30 m, and he drops the flag he carries', () => {
    const p = drop(30, undefined, true) as PlayerState & { flag: number };
    expect(p.hp).toBe(0);
    expect(p.down).toBe(DOWN_TICKS);
    expect(p.flag).toBe(FLAG.DROPPED);
  });

  it('lands softer on the moon: 12 m at half gravity hurts nobody', () => {
    expect(drop(12, 0.5).hp).toBe(HP_MAX);
  });
});
