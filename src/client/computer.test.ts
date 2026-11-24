import { describe, expect, it } from 'vitest';
import { HUNTER_CELLS } from '../shared/constants';
import { PER_GLYPH, wristComputer } from './computer';
import { STRIDE } from './mesh';

/** The lit glyph segments' vertices (glowing red at 1.6) in each third of the screen, by `y`. */
const lit = (shots: number): number[] => {
  const v = wristComputer(shots);
  const thirds = [0, 0, 0];
  for (let i = 0; i < v.length; i += STRIDE) {
    if (Math.abs(v[i + 6] - 1.6) < 1e-6) {
      // The cells run from the elbow (high y, the left glyph) to the wrist (the right one).
      thirds[v[i + 1] > 0.151 ? 0 : v[i + 1] > 0.109 ? 1 : 2]++;
    }
  }
  return thirds.map(n => n / 6);
};

describe('the Hunter’s wrist computer (the user, 2026-11-23)', () => {
  it('lights a glyph segment for each of the cannon’s shots, three glyphs of PER_GLYPH', () => {
    expect(3 * PER_GLYPH).toBe(HUNTER_CELLS);
    expect(lit(HUNTER_CELLS)).toEqual([PER_GLYPH, PER_GLYPH, PER_GLYPH]);
    expect(lit(0)).toEqual([0, 0, 0]);
  });

  it('puts the shots out from the right glyph to the left', () => {
    expect(lit(HUNTER_CELLS - 1)).toEqual([PER_GLYPH, PER_GLYPH, PER_GLYPH - 1]);
    expect(lit(2 * PER_GLYPH)).toEqual([PER_GLYPH, PER_GLYPH, 0]);
    expect(lit(PER_GLYPH - 2)).toEqual([PER_GLYPH - 2, 0, 0]);
  });

  it('keeps its size whatever is lit, made once for each count', () => {
    expect(wristComputer(3).length).toBe(wristComputer(HUNTER_CELLS).length);
    expect(wristComputer(3)).toBe(wristComputer(3));
    expect(wristComputer(99)).toBe(wristComputer(HUNTER_CELLS));
  });
});
