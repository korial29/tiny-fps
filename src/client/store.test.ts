import { describe, expect, it } from 'vitest';
import { MAPS } from '../shared/maps';
import { STRIDE } from './mesh';
import { mesh, stored } from './store';
import { traffic } from './traffic';
import { apart, unfolded } from '../../test/store';

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

  // Every role, build, level and weapon on a map, through the shader's twin: a minute on a slow runner.

  it('draws the traffic as the CPU does: each car placed by the GPU', () => {
    const def = MAPS.highline;
    const drive = traffic(def);
    for (const t of [0, 7.5, 31]) {
      const eye: [number, number, number] = [47, -60, 120];
      const cpu: number[] = [];
      drive(cpu, eye, [0, 0, -1], t);
      const [merged, n] = unfolded((o, list) => drive(o, eye, [0, 0, -1], t, list));
      expect(n).toBeGreaterThan(10);
      const [place, colour, normal] = apart(merged, cpu);
      expect(Math.max(place, colour, normal)).toBeLessThan(1e-4);
    }
  });
});
