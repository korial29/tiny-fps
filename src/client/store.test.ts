import { describe, expect, it } from 'vitest';
import { MAPS } from '../shared/maps';
import { spawn } from '../shared/physics';
import { ROLE } from '../shared/kit';
import { build } from '../shared/world';
import { STRIDE } from './mesh';
import { animate, soldier } from './soldier';
import type { Runner } from './soldier';
import { expand, mesh, stored } from './store';
import type { Pieces } from './store';

/** The triangles of `v`, sorted: within a micrometre two numbers are taken as the same. */
const triangles = (v: number[]) => {
  const t: number[][] = [];
  for (let i = 0; i < v.length; i += 3 * STRIDE) {
    t.push(v.slice(i, i + 3 * STRIDE));
  }
  return t.sort((a, b) => {
    const k = a.findIndex((x, j) => Math.abs(x - b[j]) > 1e-6);
    return k < 0 ? 0 : a[k] - b[k];
  });
};
/** The largest difference between two lists of triangles. */
const apart = (a: number[][], b: number[][]) => {
  let most = a.length == b.length ? 0 : Infinity;
  a.forEach((t, i) => t.forEach((x, j) => (most = Math.max(most, Math.abs(x - b[i][j])))));
  return most;
};

describe('the store (store.ts): pieces built once on the GPU', () => {
  it('makes a piece once, whatever asks for it again', () => {
    const made: number[] = [];
    const a = mesh('test a', v => {
      made.push(1);
      v.push(...Array.from({ length: 3 * STRIDE }, (_, i) => i));
    });
    expect(mesh('test a', () => made.push(2))).toBe(a);
    expect(made).toEqual([1]);
    expect(a.count).toBe(3);
    expect(Array.from(stored.subarray(a.first * STRIDE, (a.first + 1) * STRIDE))).toEqual(
      Array.from({ length: STRIDE }, (_, i) => i),
    );
  });

  it('draws each runner as the CPU does: his rigid pieces placed by the GPU', () => {
    for (const map of ['highline', 'tranquility']) {
      const def = MAPS[map];
      const world = build(def);
      const roles = def.helmets ? [ROLE.ASTRONAUT] : [ROLE.MARINE, ROLE.NINJA];
      const ps = [1, 2, 3, 4].map(id => Object.assign(spawn(id, world, id, id % 2), { vx: 4 }));
      const book = new Map<number, Runner>();
      const looks = new Map(ps.map((p, i) => [p.id, { role: roles[i % roles.length] }]));
      const builds = new Map(ps.map((p, i) => [p.id, i >> 1]));
      animate(book, ps, 1 / 60, world, undefined, [], builds, looks);
      for (const p of ps) {
        for (const lod of [0, 1, 3]) {
          const cpu: number[] = [];
          soldier(cpu, book.get(p.id)!, [0.9, 0.2, 0.1], lod, !!def.helmets, !!def.armor);
          const gpu: number[] = [];
          const list: Pieces = [];
          soldier(gpu, book.get(p.id)!, [0.9, 0.2, 0.1], lod, !!def.helmets, !!def.armor, list);
          expect(list.length).toBeGreaterThan(0);
          list.forEach(d => expand(gpu, d));
          // The store keeps floats, as the GPU does: a millionth of a metre or of a normal.
          expect(apart(triangles(gpu), triangles(cpu))).toBeLessThan(1e-5);
        }
      }
    }
  });
});
