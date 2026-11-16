import { describe, expect, it } from 'vitest';
import { MAPS } from '../shared/maps';
import { spawn } from '../shared/physics';
import { ROLE } from '../shared/kit';
import { build } from '../shared/world';
import { SKIN_LAYER, STRIDE } from './mesh';
import { animate, soldier } from './soldier';
import type { Runner } from './soldier';
import { expand } from './store';
import { pose } from '../../test/flesh';
import type { Pieces } from './store';

/**
 * How far two lists of vertices are apart: the largest difference of a place and of a colour, the
 * largest of a normal and the share of normals more than a thousandth off (Infinity: their lengths
 * differ).
 */
const apart = (a: number[], b: number[]) => {
  const most = a.length == b.length ? [0, 0, 0, 0] : [Infinity, Infinity, Infinity, Infinity];
  a.forEach((x, i) => {
    // The GPU's bare skin carries the skin layer (render.ts), where the CPU's has -1.
    const y = i % STRIDE == 8 && x <= -1 && x >= SKIN_LAYER ? -1 : x;
    const [n, d] = [i % STRIDE, Math.abs(y - b[i])];
    const k = n < 3 ? 0 : n < 6 ? 2 : 1;
    most[k] = Math.max(most[k], d);
    most[3] += +(n == 3 && d > 1e-3) / (a.length / STRIDE);
  });
  return most;
};

/**
 * What `draw` writes with a list of pieces, each piece unfolded (expand(), the shader's sums) back
 * where it would have been written without the list.
 */
const unfolded = (draw: (out: number[], list: Pieces) => void) => {
  const [gpu, list, marks, merged] = [[], [], [], []] as [number[], Pieces, number[], number[]];
  list.push = (...d) => {
    d.forEach(() => marks.push(gpu.length));
    return Array.prototype.push.apply(list, d);
  };
  draw(gpu, list);
  let from = 0;
  const copy = (to: number) => gpu.slice(from, to).forEach(x => merged.push(x));
  list.forEach((d, i) => {
    copy(marks[i]);
    if (d.f) {
      pose(merged, d);
    } else {
      expand(merged, d);
    }
    from = marks[i];
  });
  copy(gpu.length);
  return [merged, list.length] as const;
};

describe('the store (store.ts): pieces built once on the GPU', () => {
  // Every role, build, level and weapon on a map, through the shader's twin: a minute on a slow runner.
  const runners = (map: string) => {
    const def = MAPS[map];
    const world = build(def);
    const roles = def.helmets ? [ROLE.ASTRONAUT] : [ROLE.MARINE, ROLE.NINJA];
    // Bare handed, then each weapon in hand: the plasma gun, the katana, the rail gun, the rifle.
    const arms = [
      {},
      { ammo: 10 },
      { blade: true, wield: true },
      { rail: 3, railed: true },
      { rifle: 10, rifled: true },
    ];
    const ps = [1, 2, 3, 4, 5, 6].map(id =>
      Object.assign(spawn(id, world, id, id % 2), { vx: 4 }, arms[id % arms.length]),
    );
    const book = new Map<number, Runner>();
    const looks = new Map(ps.map((p, i) => [p.id, { role: roles[i % roles.length] }]));
    const builds = new Map(ps.map((p, i) => [p.id, (i >> 1) % 2]));
    animate(book, ps, 1 / 60, world, undefined, [], builds, looks);
    for (const p of ps) {
      for (const lod of [0, 1, 3]) {
        const cpu: number[] = [];
        soldier(cpu, book.get(p.id)!, [0.9, 0.2, 0.1], lod, !!def.helmets, !!def.armor);
        const [merged, n] = unfolded((o, list) =>
          soldier(o, book.get(p.id)!, [0.9, 0.2, 0.1], lod, !!def.helmets, !!def.armor, list),
        );
        expect(n).toBeGreaterThan(0);
        // The GPU and the store keep floats: places within a tenth of a millimetre, colours as they
        // are. A normal too, but on a few armour walls, slivers 1.5 mm tall whose own normal takes
        // the floats' error from their corners: a degree or two, on a few in a thousand at most.
        const [place, colour, normal, off] = apart(merged, cpu);
        expect(place).toBeLessThan(1e-4);
        // The ninja's hood is worked out at rest with his face's traits (flesh.ts): with his
        // expressions on, his bare share differs by a fraction of a level of 255.
        expect(colour).toBeLessThan(looks.get(p.id)?.role == ROLE.NINJA ? 1e-3 : 1e-6);
        expect(normal).toBeLessThan(0.05);
        expect(off).toBeLessThan(0.01);
      }
    }
  };

  it('draws each runner as the CPU does on the moon: his rigid pieces placed by the GPU', () => {
    runners('tranquility');
  }, 120_000);
});
