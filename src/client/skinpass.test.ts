import { describe, expect, it } from 'vitest';
import { MAPS } from '../shared/maps';
import { spawn } from '../shared/physics';
import { ROLE } from '../shared/kit';
import { build } from '../shared/world';
import { GILT, GLOSS, SHINE, SKIN_LAYER } from './mesh';
import { animate, soldier } from './soldier';
import type { Runner } from './soldier';
import type { Pieces } from './store';
import { pose } from '../../test/flesh';

/** The skin a runner of `role` with the id `id` sends the GPU close up, and its vertices' layers as the shader poses them. */
const skinOf = (role: number, id = 1) => {
  const def = MAPS.highline;
  const world = build(def);
  const p = spawn(id, world, id, 0);
  const book = new Map<number, Runner>();
  animate(book, [p], 1 / 60, world, undefined, [], new Map([[id, 0]]), new Map([[id, { role }]]));
  const list: Pieces = [];
  soldier([], book.get(id)!, [0.9, 0.2, 0.1], 3, false, !!def.armor, list);
  const d = list.find(x => x.f?.kind == 1)!;
  const out: number[] = [];
  pose(out, d);
  return { d, layers: out.filter((_, i) => i % 10 == 8) };
};

describe("the skin pass (render.ts): bare skin's own layer and each runner's marks", () => {
  it('keeps the skin layer between the body and the glosses, clear of every other layer', () => {
    expect(SKIN_LAYER).toBeLessThan(-1);
    expect(SKIN_LAYER).toBeGreaterThan(-1.08);
    for (const other of [GLOSS, SHINE, GILT]) {
      expect(Math.abs(SKIN_LAYER - other)).toBeGreaterThan(0.04);
    }
  });

  it('gives bare skin the skin layer, and none of it to the ninja under his hood', () => {
    const share = (role: number) => {
      const { layers } = skinOf(role);
      return layers.filter(l => Math.abs(l - SKIN_LAYER) < 1e-6).length / layers.length;
    };
    const [marine, ninja] = [share(ROLE.MARINE), share(ROLE.NINJA)];
    expect(marine).toBeGreaterThan(0.05);
    expect(ninja).toBeLessThan(marine / 2);
    for (const l of skinOf(ROLE.MARINE).layers) {
      expect(l == -2 || (l <= -1 && l >= SKIN_LAYER)).toBe(true);
    }
  });

  it("hands the shader the runner's id for his marks: the same face on every screen", () => {
    expect(skinOf(ROLE.MARINE, 3).d.f?.seed).toBe(3);
    expect(skinOf(ROLE.MARINE, 5).d.f?.seed).toBe(5);
  });
});
