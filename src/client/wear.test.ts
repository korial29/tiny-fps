import { describe, expect, it } from 'vitest';
import { MAPS } from '../shared/maps';
import { spawn } from '../shared/physics';
import { ROLE } from '../shared/kit';
import { build } from '../shared/world';
import { animate, soldier } from './soldier';
import type { Runner } from './soldier';
import type { Pieces } from './store';

/** The pieces a runner of `role` on `map` sends the GPU, close up. */
const drawn = (map: string, role: number, armed = {}) => {
  const def = MAPS[map];
  const world = build(def);
  const p = Object.assign(spawn(1, world, 1, 0), armed);
  const book = new Map<number, Runner>();
  animate(book, [p], 1 / 60, world, undefined, [], new Map([[1, 0]]), new Map([[1, { role }]]));
  const list: Pieces = [];
  soldier([], book.get(1)!, [0.9, 0.2, 0.1], 3, !!def.helmets, !!def.armor, list);
  return list;
};

describe('armour wear: the shader scuffs the armour (render.ts, Draw.w)', () => {
  it('marks the plates of every class, and never the skin', () => {
    for (const [map, role] of [
      ['highline', ROLE.MARINE],
      ['highline', ROLE.NINJA],
      ['tranquility', ROLE.ASTRONAUT],
    ] as const) {
      const list = drawn(map, role);
      expect(list.filter(d => d.w && d.f?.kind == 2)).toHaveLength(1);
      expect(list.filter(d => d.f?.kind == 1).every(d => !d.w)).toBe(true);
    }
  });

  it("marks the marine's bells and the astronaut's helmet and pack", () => {
    expect(drawn('highline', ROLE.MARINE).filter(d => d.w && !d.f).length).toBeGreaterThanOrEqual(
      2,
    );
    expect(
      drawn('tranquility', ROLE.ASTRONAUT).filter(d => d.w && !d.f).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it('leaves what he holds clean', () => {
    const bare = drawn('highline', ROLE.MARINE).filter(d => !d.w).length;
    const armed = drawn('highline', ROLE.MARINE, { ammo: 10 }).filter(d => !d.w).length;
    expect(armed).toBeGreaterThan(bare);
  });
});
