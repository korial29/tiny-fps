import { describe, expect, it } from 'vitest';
import { DOWN_TICKS, EXEC, GLORY_TICKS } from '../shared/constants';
import { felled } from '../shared/gun';
import { ROLE } from '../shared/kit';
import { STILL } from '../shared/physics';
import { FALL, LIMB } from '../shared/types';
import type { PlayerState } from '../shared/types';
import { MARGIN, RADII, footing } from './footing';
import { STRIDE } from './mesh';
import { JOINT as J, JOINTS, axis, rest, solve } from './rig';
import { animate, soldier } from './soldier';
import type { Runner } from './soldier';

const state = (id: number, over: Partial<PlayerState>): PlayerState => ({
  id,
  x: 0,
  y: 0,
  z: 0,
  vy: 0,
  yaw: 0,
  pitch: 0,
  ground: true,
  ...STILL,
  ...over,
});
/** The lowest of the vertices a runner is drawn with, over its feet. */
const lowest = (r: Runner) => {
  const out: number[] = [];
  soldier(out as never, r, [0, 0, 1], 3, false, true);
  let m = Infinity;
  for (let i = 1; i < out.length; i += STRIDE) {
    m = Math.min(m, out[i]);
  }
  return m - r.p.y;
};
/** The frames the body lies before it sinks into the floor for its last half second (stance()). */
const LYING = DOWN_TICKS - 31;

describe('a body down on the floor (footing())', () => {
  it('leaves a pose alone that is over the floor', () => {
    const p = rest();
    expect(footing(p, 0)).toBe(p);
  });

  it('brings a foot under the floor back onto it, the leg bent its way, and lifts the body for a knee', () => {
    const p = rest([0, 0, 0]);
    p.rot[J.THIGH_R] = axis([1, 0, 0], -1);
    p.rot[J.SHIN_R] = axis([1, 0, 0], 2.2);
    p.hips = [0, -0.3, 0];
    const q = footing(p, 0);
    const s = solve(q);
    // Every joint over the floor by its radius, and by MARGIN more but at the soles.
    const soles: number[] = [J.FOOT_L, J.TOE_L, J.FOOT_R, J.TOE_R];
    const over = s.pos.map((v, j) => v[1] - RADII[j] - (soles.includes(j) ? 0 : MARGIN));
    for (let j = 0; j < JOINTS; j++) {
      expect(over[j]).toBeGreaterThan(-1e-6);
    }
    // No more than it takes.
    expect(Math.min(...over)).toBeLessThan(0.005);
  });

  it('keeps the struck fall, down on the knees and over on the side, out of the floor', () => {
    const book = new Map<number, Runner>();
    const looks = new Map([[1, { role: ROLE.MARINE }]]);
    let low = Infinity;
    for (let k = 0; k < LYING; k++) {
      const p = state(1, { down: DOWN_TICKS - k, fell: felled(FALL.STRUCK, 0, -1), hp: 0 });
      animate(book, [p], 1 / 60, undefined, undefined, undefined, undefined, looks);
      low = Math.min(low, lowest(book.get(1)!));
    }
    // It went 24 cm under the floor.
    expect(low).toBeGreaterThan(-0.025);
  });

  it('keeps the execution’s victim out of it, on his knee and as he tips over', () => {
    const book = new Map<number, Runner>();
    const looks = new Map([
      [1, { role: ROLE.NINJA }],
      [2, { role: ROLE.MARINE }],
    ]);
    const killer = state(1, { z: 0.3, blade: true, wield: true });
    let low = Infinity;
    for (let e = 1; e < EXEC.TICKS; e++) {
      const lock = EXEC.TICKS - e;
      animate(
        book,
        [
          { ...killer, lock, foe: 2, exec: EXEC.KILLER },
          state(2, { z: -1, yaw: Math.PI, lock, foe: 1, exec: EXEC.VICTIM }),
        ],
        1 / 60,
        undefined,
        undefined,
        undefined,
        undefined,
        looks,
      );
      low = Math.min(low, lowest(book.get(2)!));
    }
    for (let k = 0; k < LYING; k++) {
      const v = state(2, {
        z: -1,
        yaw: Math.PI,
        down: DOWN_TICKS - k,
        fell: felled(FALL.STRUCK, 0, 1),
      });
      animate(
        book,
        [killer, { ...v, lost: LIMB.HEAD, hp: 0 }],
        1 / 60,
        undefined,
        undefined,
        undefined,
        undefined,
        looks,
      );
      low = Math.min(low, lowest(book.get(2)!));
    }
    expect(low).toBeGreaterThan(-0.025);
  });

  it('keeps the xenomorph’s prey out of it, held and as he falls on his side', () => {
    const book = new Map<number, Runner>();
    const looks = new Map([
      [1, { role: ROLE.XENO }],
      [2, { role: ROLE.MARINE }],
    ]);
    let low = Infinity;
    for (let e = 1; e < GLORY_TICKS; e++) {
      const lock = GLORY_TICKS - e;
      animate(
        book,
        [state(1, { lock, foe: 2 }), state(2, { z: -1, yaw: Math.PI, lock, foe: 1 })],
        1 / 60,
        undefined,
        undefined,
        undefined,
        undefined,
        looks,
      );
      low = Math.min(low, lowest(book.get(2)!));
    }
    for (let k = 0; k < LYING; k++) {
      const v = state(2, {
        z: -1,
        yaw: Math.PI,
        down: DOWN_TICKS - k,
        fell: felled(FALL.STRUCK, 0, 1),
      });
      animate(
        book,
        [state(1, {}), { ...v, lost: LIMB.EATEN, hp: 0 }],
        1 / 60,
        undefined,
        undefined,
        undefined,
        undefined,
        looks,
      );
      low = Math.min(low, lowest(book.get(2)!));
    }
    // His armour's plates, as he bends back, stand a little further off the skin.
    expect(low).toBeGreaterThan(-0.03);
  });
});
