import { describe, expect, it } from 'vitest';
import { MAPS } from '../../shared/maps';
import { COMMAND } from '../../shared/station';
import { command } from './command';

const DEF = MAPS.tranquility.station!;
/** The scenery's vertex layout: position, normal, r, g, layer, b. */
const STRIDE = 10;
/** The pane's x: the tube and the collar lie past it, out through the hull. */
const PANE = DEF.hull[0] + COMMAND.X1;

describe('the command room’s window (the user, 2026-11-27: its texture flickered)', () => {
  it('draws the tube and the collar one face each: nothing is culled, two would fight', () => {
    const o: number[] = [];
    command(o, DEF);
    const seen = new Set<string>();
    const twice: string[] = [];
    // Each quad is two triangles, six vertices; its key is its corners, whichever way it winds.
    // Only the pieces outside the pane: a ring's segments meet face to face inside its solid.
    let out = 0;
    for (let i = 0; i < o.length; i += 6 * STRIDE) {
      if (![0, 1, 2, 3, 4, 5].every(k => o[i + k * STRIDE] > PANE + 0.25)) {
        continue;
      }
      out++;
      const corners = new Set<string>();
      for (let k = 0; k < 6; k++) {
        const p = i + k * STRIDE;
        corners.add([o[p], o[p + 1], o[p + 2]].map(v => v.toFixed(3)).join(','));
      }
      const key = [...corners].sort().join(' ');
      if (seen.has(key)) {
        twice.push(key);
      }
      seen.add(key);
    }
    expect(out).toBeGreaterThan(100);
    expect(twice).toEqual([]);
  });
});
