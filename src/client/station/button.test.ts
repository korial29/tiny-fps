import { describe, expect, it } from 'vitest';
import { MAPS } from '../../shared/maps';
import { PHASE, knob } from '../../shared/station';
import type { Vec3 } from '../mesh';
import { createButton } from './button';

const DEF = MAPS.tranquility.station!;
const at = knob(DEF);
const eye: Vec3 = [at[0] - 1, at[1] + 0.6, at[2]];

/** The top of the cap after `frames` sixtieths in `phase`: the highest vertex over the knob. */
const top = (button: ReturnType<typeof createButton>, phase: number, frames: number) => {
  let o: number[] = [];
  for (let i = 0; i < frames; i++) {
    o = [];
    button.draw(o, eye, phase, i / 60, 1 / 60);
  }
  let y = -Infinity;
  for (let i = 0; i < o.length; i += 10) {
    if (Math.hypot(o[i] - at[0], o[i + 2] - at[2]) < 0.25) {
      y = Math.max(y, o[i + 1]);
    }
  }
  return y - at[1];
};

describe('the command room’s red button (the user, 2026-11-27)', () => {
  it('stands up while the station is ready, sinks once pressed, and comes back up', () => {
    const b = createButton(DEF);
    const up = top(b, PHASE.READY, 2);
    expect(up).toBeGreaterThan(0.15);
    const down = top(b, PHASE.ARMED, 30);
    expect(down).toBeLessThan(up - 0.08);
    expect(top(b, PHASE.COOL, 30)).toBeCloseTo(down, 6);
    expect(top(b, PHASE.READY, 30)).toBeCloseTo(up, 6);
  });

  it('is not drawn from afar', () => {
    const o: number[] = [];
    createButton(DEF).draw(o, [at[0] + 400, at[1], at[2]], PHASE.READY, 0, 1 / 60);
    expect(o).toHaveLength(0);
  });
});
