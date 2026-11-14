import { describe, expect, it } from 'vitest';
import { HIGHLINE } from '../shared/map';
import { spawn } from '../shared/physics';
import { ROLE } from '../shared/kit';
import { build } from '../shared/world';
import { createBody } from './body';
import { animate, soldier } from './soldier';
import type { Runner } from './soldier';
import { Verts, room } from './verts';

describe('Verts, the frame vertices (docs/PERFORMANCE.md)', () => {
  it('grows as it is written, keeps what it holds, and starts again from a lower length', () => {
    const v = new Verts();
    const big = v.a.length;
    for (let i = 0; i < big + 10; i++) {
      v.push(i);
    }
    expect(v.length).toBe(big + 10);
    expect(v.a.length).toBeGreaterThan(big);
    expect(v.slice(big - 2, big + 1)).toEqual([big - 2, big - 1, big]);
    // A new frame writes over the last one in the store it left.
    const store = v.a;
    v.length = 0;
    v.push(7, 8);
    expect(v.a).toBe(store);
    expect(v.slice(0, v.length)).toEqual([7, 8]);
  });

  it('gives room to write by index in a plain array or a Verts alike', () => {
    for (const out of [[1], Object.assign(new Verts(), { length: 0 })]) {
      if (out instanceof Verts) {
        out.push(1);
      }
      const a = room(out, 3);
      let w = out.length;
      a[w++] = 2;
      a[w++] = 3;
      out.length = w;
      expect(out.slice(0, out.length)).toEqual([1, 2, 3]);
    }
  });

  it('holds exactly what a plain array would, runners and the own body, behind earlier vertices', () => {
    const world = build(HIGHLINE);
    const ps = [1, 2, 3].map(id => Object.assign(spawn(id, world, id, id % 2), { vx: 4 }));
    const book = new Map<number, Runner>();
    const looks = new Map(ps.map(p => [p.id, { role: p.id % 2 ? ROLE.MARINE : ROLE.NINJA }]));
    animate(book, ps, 1 / 60, world, undefined, [], new Map([[2, 1]]), looks);
    const body = createBody(world);
    body.update(ps[0], 1 / 60, 0, 1.5);
    const draw = (out: number[] | Verts) => {
      ps.forEach((p, i) =>
        soldier(out, book.get(p.id)!, [0.9, 0.2, 0.1], [0, 1, 3][i], false, true),
      );
      body.draw(out, [ps[0].x, ps[0].y + 1.6, ps[0].z], 0, 0);
    };
    const plain: number[] = [];
    draw(plain);
    // A store too small for a frame, already holding numbers: it grows under the writers.
    const v = new Verts();
    v.push(9, 9, 9);
    draw(v);
    expect(v.length).toBe(plain.length + 3);
    expect(v.slice(3, v.length)).toEqual(plain);
  });
});
