import { describe, expect, it } from 'vitest';
import { MAPS } from '../shared/maps';
import { spawn } from '../shared/physics';
import { ROLE } from '../shared/kit';
import { LIMB } from '../shared/types';
import { build } from '../shared/world';
import { STRIDE } from './mesh';
import { animate, soldier } from './soldier';
import type { Runner } from './soldier';
import { cut } from './skin';
import { pose } from '../../test/flesh';
import type { Pieces } from './store';

const world = build(MAPS.highline);

/** A runner of `role` down with `limb` cut off, seen for the first time: the limb already lying. */
const severed = (role: number, limb: number, b = 0): Runner => {
  const p = spawn(1, world, 1, 0);
  [p.down, p.lost] = [1, limb];
  const book = new Map<number, Runner>();
  animate(book, [p], 1 / 60, world, undefined, [], new Map([[1, b]]), new Map([[1, { role }]]));
  return book.get(1)!;
};

/** The worst distance between the places of the vertices of `a` and `b`, from `from` in `a`. */
const apart = (a: number[], b: number[], from = 0) => {
  let most = 0;
  for (let i = 0; i < b.length; i += STRIDE) {
    const j = from + i;
    most = Math.max(most, Math.hypot(a[j] - b[i], a[j + 1] - b[i + 1], a[j + 2] - b[i + 2]));
  }
  return most;
};

describe('a body cut by the katana, posed by the shader (flesh.ts)', () => {
  it('draws the stump and the limb thrown off where the CPU does, and leaves their skin out of the frame', () => {
    for (const b of [0, 1]) {
      for (const limb of [LIMB.HEAD, LIMB.ARM_L, LIMB.LEG_R]) {
        const r = severed(ROLE.MARINE, limb, b);
        const cpu: number[] = [];
        soldier(cpu, r, [0.9, 0.2, 0.1], 3);
        const at = r.cut!.at;
        const list: Pieces = [];
        const out: number[] = [];
        soldier(out, r, [0.9, 0.2, 0.1], 3, false, false, list);
        const skins = list.filter(d => d.f?.kind == 1);
        expect(skins.length, `build ${b} limb ${limb}`).toBe(2);
        const [stump, off] = skins.map(d => {
          const v: number[] = [];
          pose(v, d);
          return v;
        });
        const [cs, ls] = cut(3, limb, b);
        expect(stump.length).toBe(cs.t.length * STRIDE);
        expect(off.length).toBe(ls.t.length * STRIDE);
        // On the CPU: the stump's skin, then the limb's.
        expect(apart(cpu, stump), `stump, build ${b} limb ${limb}`).toBeLessThan(1e-4);
        expect(apart(cpu, off, stump.length), `limb, build ${b} limb ${limb}`).toBeLessThan(1e-4);
        // The sparks and the blood still come out of the cut face.
        expect(Math.hypot(...r.cut!.at.map((x, k) => x - at[k]))).toBeLessThan(1e-5);
        expect(out.length).toBeLessThan(cpu.length - stump.length - off.length + 1);
      }
    }
  }, 120_000);

  it("draws the ninja's stump and its armour (none, as on the CPU: a cut skin has no recipe) as the CPU does", () => {
    const r = severed(ROLE.NINJA, LIMB.ARM_R);
    const cpu: number[] = [];
    soldier(cpu, r, [0.9, 0.2, 0.1], 3, false, true);
    const list: Pieces = [];
    soldier([], r, [0.9, 0.2, 0.1], 3, false, true, list);
    const [skin, plates] = [1, 2].map(k => {
      const v: number[] = [];
      list.filter(d => d.f?.kind == k).forEach(d => pose(v, d));
      return v;
    });
    const stump = cut(3, LIMB.ARM_R)[0].t.length * STRIDE;
    expect(list.filter(d => d.f?.kind == 2).every(d => d.w)).toBe(true);
    expect(list.find(d => d.f?.kind == 1)?.f?.woven).toBe(true);
    expect(apart(cpu, skin.slice(0, stump))).toBeLessThan(1e-4);
    // On the CPU his armour follows the stump's skin.
    expect(apart(cpu, plates, stump)).toBeLessThan(1e-4);
  }, 120_000);
});
