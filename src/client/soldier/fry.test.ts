import { describe, expect, it } from 'vitest';
import { DOWN_TICKS } from '../../shared/constants';
import { ROLE } from '../../shared/kit';
import { MAPS } from '../../shared/maps';
import { spawn } from '../../shared/physics';
import { build } from '../../shared/world';
import { DEPTH_UNIFORMS, UNIFORMS, VERT } from '../render/shader';
import type { Pieces } from '../store';
import { animate, fried, soldier } from '../soldier';
import type { Runner } from './types';

const world = build(MAPS.highline);

/** A runner of `role` the bolt put down `ticks` ago. */
const burnt = (role: number, ticks: number): Runner => {
  const p = { ...spawn(1, world, 1, 0), down: DOWN_TICKS - ticks, fried: true };
  const book = new Map<number, Runner>();
  animate(book, [p], 1 / 60, world, undefined, [], new Map([[1, 0]]), new Map([[1, { role }]]));
  return book.get(1)!;
};

describe('a runner the bolt burns away, drawn by the shader', () => {
  it('stays in the store, each piece marked with how far it has come apart', () => {
    for (const role of [ROLE.MARINE, ROLE.NINJA, ROLE.XENO, ROLE.HUNTER]) {
      const r = burnt(role, 20);
      const k = fried(r.p);
      expect(k).toBeGreaterThan(0);
      const list: Pieces = [];
      const out: number[] = [];
      soldier(out, r, [0.9, 0.2, 0.1], 3, false, true, list);
      // Skinned on the CPU, the body came to up to 120 000 vertices and 20 to 100 ms a frame.
      // The Hunter's body is rigid pieces, the others' a skin.
      expect(
        list.some(d => (role == ROLE.HUNTER ? !d.f : d.f?.kind == 1)),
        `role ${role}`,
      ).toBe(true);
      expect(
        list.every(d => d.z == k),
        `role ${role}`,
      ).toBe(true);
      const cpu: number[] = [];
      soldier(cpu, r, [0.9, 0.2, 0.1], 3);
      expect(out.length, `role ${role}`).toBeLessThan(cpu.length / 2);
    }
  });

  it('leaves a whole runner’s pieces unmarked', () => {
    const r = burnt(ROLE.MARINE, 0);
    const list: Pieces = [];
    soldier([], r, [0.9, 0.2, 0.1], 3, false, true, list);
    expect(list.length).toBeGreaterThan(0);
    expect(list.every(d => d.z === undefined)).toBe(true);
  });

  it('burns every kind of piece in the colour and the depth passes', () => {
    expect(UNIFORMS).toContain('Fz');
    expect(DEPTH_UNIFORMS).toContain('Fz');
    // The skin, the plates, the hair and the rigid pieces each go through fz().
    expect(VERT.match(/fz\(\);gl_Position=m\*vec4\(P,1\)/g)?.length).toBe(4);
  });
});
