import { expect } from 'vitest';
import { MAPS } from '../src/shared/maps';
import { spawn } from '../src/shared/physics';
import { ROLE } from '../src/shared/kit';
import { build } from '../src/shared/world';
import { SKIN_LAYER, STRIDE } from '../src/client/mesh';
import { BOOT_LAYER } from '../src/client/render';
import { animate, soldier } from '../src/client/soldier';
import type { Runner } from '../src/client/soldier';
import { expand } from '../src/client/store';
import type { Pieces } from '../src/client/store';
import { pose } from './flesh';

/**
 * How far two lists of vertices are apart: the largest difference of a place and of a colour, the
 * largest of a normal and the share of normals more than a thousandth off (Infinity: their lengths
 * differ).
 */
export const apart = (a: number[], b: number[]) => {
  const most = a.length == b.length ? [0, 0, 0, 0] : [Infinity, Infinity, Infinity, Infinity];
  a.forEach((x, i) => {
    // The GPU's bare skin carries the skin layer (render.ts), where the CPU's has -1.
    // And a ninja's woven suit and boots (WEAVE, BOOT_LAYER), where the CPU's skin has -1 too; not
    // where the CPU itself writes a layer (his rigid hands).
    const y = i % STRIDE == 8 && b[i] == -1 && x <= BOOT_LAYER && x >= SKIN_LAYER ? -1 : x;
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
export const unfolded = (draw: (out: number[], list: Pieces) => void) => {
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

/**
 * Six runners on a map, every role, build and weapon, each drawn at the levels `lods` by the CPU and
 * through the shader's twin, and compared; `ids` picks which of them (1 to 6) are checked, so the
 * close level, three quarters of the work, can be split over two files.
 */
export const runners = (map: string, lods: number[], ids = [1, 2, 3, 4, 5, 6]) => {
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
  for (const p of ps.filter(p => ids.includes(p.id))) {
    for (const lod of lods) {
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
