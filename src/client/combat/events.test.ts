import { describe, expect, it } from 'vitest';
import { CUTS, GUN_RANGE } from '../../shared/constants';
import { CUT } from '../../shared/types';
import { fired, sight, struck, swung } from '../combat';
import { WORLD, cutting, player } from './testing';

describe('fired', () => {
  it('counts the shots between two states, on a u8 that wraps', () => {
    expect(fired(player({ shots: 3 }), player({ shots: 5 }))).toBe(2);
    expect(fired(player({ shots: 254 }), player({ shots: 1 }))).toBe(3);
    expect(fired(player({ shots: 9 }), player({ shots: 9 }))).toBe(0);
    expect(fired(undefined, player({ shots: 9 }))).toBe(0);
  });
});

describe('sight', () => {
  it('is the end of the look ray, in the world and in the camera space the gun points in', () => {
    const near = sight(WORLD, [0, 1.6, 0], [0, 1.6, 0], 0, 0, 0);
    expect(near.hit).toBe(true);
    expect(near.end).toEqual([
      expect.closeTo(0, 6),
      expect.closeTo(1.6, 6),
      expect.closeTo(-20, 3),
    ]);
    // The camera space is (right, up, forward): 20 m straight ahead.
    expect(near.local).toEqual([expect.closeTo(0, 6), expect.closeTo(0, 6), expect.closeTo(20, 3)]);
    const far = sight(WORLD, [0, 1.6, 0], [0, 1.6, 0], Math.PI, 0, 0);
    expect(far.hit).toBe(false);
    expect(far.local[2]).toBeCloseTo(GUN_RANGE, 3);
  });

  it('follows the camera when it moves or shakes: the same point seen from the camera', () => {
    // The camera 10 cm above the eye and pitched 0.05 higher than the look: the end drops and goes right of nothing.
    const s = sight(WORLD, [0, 1.6, 0], [0, 1.7, 0], 0, 0, 0.05);
    expect(s.local[1]).toBeLessThan(-0.1);
    expect(Math.hypot(...s.local)).toBeCloseTo(20, 0);
  });
});

describe('swung and struck', () => {
  it('read the start of a swing: `swing` jumping up, or the cut changing under a running one', () => {
    expect(swung(cutting(CUT.SLASH, 0), cutting(CUT.SLASH, 36))).toBe(CUT.SLASH);
    expect(swung(cutting(CUT.THRUST, 0), cutting(CUT.THRUST, 24))).toBe(CUT.THRUST);
    // A swing that ran its course and a new one in the same two ticks.
    expect(swung(cutting(CUT.LEFT, 1), cutting(CUT.RIGHT, 30))).toBe(CUT.RIGHT);
    expect(swung(cutting(CUT.LEFT, 10), cutting(CUT.THRUST, 9))).toBe(CUT.THRUST);
  });

  it('read nothing from a swing running down, a swing that ended, or a state that does not swing', () => {
    expect(swung(cutting(CUT.SLASH, 30), cutting(CUT.SLASH, 29))).toBe(-1);
    expect(swung(cutting(CUT.SLASH, 1), cutting(CUT.SLASH, 0))).toBe(-1);
    expect(swung(cutting(CUT.SLASH, 0), cutting(CUT.SLASH, 0))).toBe(-1);
    expect(swung(player(), player())).toBe(-1);
    expect(swung(undefined, cutting(CUT.SLASH, 36))).toBe(-1);
    expect(swung(cutting(CUT.SLASH, 0), undefined)).toBe(-1);
  });

  it('find the strike once in a whole swing, whatever the cut', () => {
    for (const [cut, { ticks }] of CUTS.entries()) {
      let n = 0;
      let at = -1;
      for (let swing = ticks; swing > 0; swing--) {
        if (struck(cutting(cut, swing), cutting(cut, swing - 1))) {
          n++;
          at = ticks - (swing - 1);
        }
      }
      expect(n).toBe(1);
      expect(at).toBe(CUTS[cut].strike);
    }
  });

  it('do not take the start of a swing, nor a state without one, for a strike', () => {
    expect(struck(cutting(CUT.SLASH, 0), cutting(CUT.SLASH, 36))).toBe(false);
    expect(struck(undefined, cutting(CUT.SLASH, 20))).toBe(false);
    expect(struck(player(), player())).toBe(false);
  });
});
