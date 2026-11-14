import { describe, expect, it } from 'vitest';
import { ROLE } from '../shared/kit';
import { MAPS } from '../shared/maps';
import { STILL, spawn } from '../shared/physics';
import { build } from '../shared/world';
import type { PlayerState } from '../shared/types';
import { EMBER, HOLD_X, LEN, cigar } from './cigar';
import { lipLine } from './features';
import { STRIDE } from './mesh';
import { JOINT as J } from './rig';
import { bindOf, onHead } from './skin';
import { animate, soldier } from './soldier';
import type { Runner } from './soldier';

/** The cigar on the head at rest, in the head's own space. */
const rest = () => {
  const out: number[] = [];
  cigar(out, bindOf(0)[J.HEAD], [0, 0, 0, 1]);
  return out;
};
const glowing = (out: number[]) => {
  const at: number[] = [];
  for (let i = 0; i < out.length; i += STRIDE) {
    if (out[i + 8] == -2 && [6, 7, 9].every((c, k) => Math.abs(out[i + c] - EMBER[k]) < 1e-6)) {
      at.push(i);
    }
  }
  return at;
};

describe('cigar', () => {
  it('is held in the lips, at the corner of the mouth, and points out of the face', () => {
    const v = rest();
    const z = (i: number) => v[i + 2];
    const face = onHead(HOLD_X, lipLine(HOLD_X));
    // Its mouth end behind the lips, its ember well in front of them, on his right.
    const zs = Array.from({ length: v.length / STRIDE }, (_, k) => z(k * STRIDE));
    expect(Math.max(...zs)).toBeGreaterThan(face);
    expect(Math.min(...zs)).toBeLessThan(face - 0.8 * LEN);
    const ember = glowing(v);
    expect(ember.length).toBeGreaterThan(0);
    for (const i of ember) {
      expect(v[i]).toBeGreaterThan(HOLD_X);
      expect(v[i + 2]).toBeLessThan(face - 0.8 * LEN);
    }
  });

  it('is in the mouth of a bare-faced man only: not hers, not under the guard or a helmet', () => {
    const drawn = (body: number, role: number, helmets = false) => {
      const world = build(MAPS.highline);
      const p: PlayerState = { ...STILL, ...spawn(0, world, 0, 0), id: 1 };
      const book = new Map<number, Runner>();
      animate(
        book,
        [p],
        1 / 60,
        world,
        undefined,
        [],
        new Map([[1, body]]),
        new Map([[1, { role }]]),
      );
      const out: number[] = [];
      soldier(out, book.get(1)!, [0.9, 0.2, 0.1], 3, helmets, helmets);
      return glowing(out).length > 0;
    };
    expect(drawn(0, ROLE.MARINE)).toBe(true);
    expect(drawn(1, ROLE.MARINE)).toBe(false);
    expect(drawn(0, ROLE.NINJA)).toBe(false);
    expect(drawn(0, ROLE.ASTRONAUT, true)).toBe(false);
  });
});
