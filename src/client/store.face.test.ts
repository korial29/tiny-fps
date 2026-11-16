import { describe, expect, it } from 'vitest';
import { MAPS } from '../shared/maps';
import { spawn } from '../shared/physics';
import { ROLE } from '../shared/kit';
import { build } from '../shared/world';
import { STRIDE } from './mesh';
import { animate, soldier } from './soldier';
import type { Runner } from './soldier';
import { TRAITS } from './features';
import { pose } from '../../test/flesh';
import type { Pieces } from './store';

describe('the store (store.ts): pieces built once on the GPU', () => {
  it("poses the ninja's hooded face as the CPU does, whatever it shows: the jaw stays behind the guard", () => {
    const world = build(MAPS.highline);
    for (const b of [0, 1]) {
      const p = spawn(1, world, 1, 0);
      const book = new Map<number, Runner>();
      animate(
        book,
        [p],
        1 / 60,
        world,
        undefined,
        [],
        new Map([[1, b]]),
        new Map([[1, { role: ROLE.NINJA }]]),
      );
      const r = book.get(1)!;
      // Each expression at its full, alone: the hood was worked out at rest (flesh.ts).
      for (let ch = 0; ch < TRAITS; ch++) {
        r.face.w.fill(0, 0, TRAITS);
        r.face.w[ch] = 1;
        const cpu: number[] = [];
        soldier(cpu, r, [0.9, 0.2, 0.1], 3, false, true);
        const list: Pieces = [];
        soldier([], r, [0.9, 0.2, 0.1], 3, false, true, list);
        const gpu: number[] = [];
        list.filter(d => d.f?.kind == 1).forEach(d => pose(gpu, d));
        let most = 0;
        for (let i = 0; i < gpu.length; i += STRIDE) {
          most = Math.max(
            most,
            Math.hypot(gpu[i] - cpu[i], gpu[i + 1] - cpu[i + 1], gpu[i + 2] - cpu[i + 2]),
          );
        }
        expect(most, `body ${b} channel ${ch}`).toBeLessThan(1e-4);
      }
    }
  }, 120_000);
});
