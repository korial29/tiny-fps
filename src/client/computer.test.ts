import { describe, expect, it } from 'vitest';
import { HUNTER_CELLS } from '../shared/constants';
import { SHOTS, wristComputer } from './computer';
import { STRIDE, TWILL } from './mesh';

/** The lit dashes (glowing red at 1.6) in each of the four cells, by `y`: the elbow's first. */
const lit = (shots: number): number[] => {
  const v = wristComputer(shots);
  const cells = [0, 0, 0, 0];
  for (let i = 0; i < v.length; i += STRIDE) {
    if (Math.abs(v[i + 6] - 1.6) < 1e-6) {
      // The cells are 25 mm long, 4 mm apart, down the forearm from y = 0.176.
      cells[Math.floor((0.178 - v[i + 1]) / 0.029)]++;
    }
  }
  return cells.map(n => n / 6);
};

describe('the Hunter’s wrist computer (the user, 2026-11-24)', () => {
  it('lights two dashes for each of the cannon’s shots, over four cells', () => {
    expect(SHOTS.reduce((a, b) => a + b)).toBe(HUNTER_CELLS);
    expect(lit(HUNTER_CELLS)).toEqual(SHOTS.map(n => 2 * n));
    expect(lit(0)).toEqual([0, 0, 0, 0]);
  });

  it('puts the shots out from the wrist’s cell to the elbow’s', () => {
    expect(lit(HUNTER_CELLS - 1)).toEqual([8, 8, 8, 4]);
    expect(lit(8)).toEqual([8, 8, 0, 0]);
    expect(lit(3)).toEqual([6, 0, 0, 0]);
  });

  it('keeps its size whatever is lit, made once for each count', () => {
    expect(wristComputer(3).length).toBe(wristComputer(HUNTER_CELLS).length);
    expect(wristComputer(3)).toBe(wristComputer(3));
    expect(wristComputer(99)).toBe(wristComputer(HUNTER_CELLS));
  });

  it('is of brushed metal', () => {
    const v = wristComputer(HUNTER_CELLS);
    const brushed = v.filter((l, i) => i % STRIDE === 8 && l === TWILL).length;
    expect(brushed).toBeGreaterThan(v.length / STRIDE / 5);
  });
});
