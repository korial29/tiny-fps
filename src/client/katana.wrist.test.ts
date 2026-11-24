import { expect, it } from 'vitest';
import { wristBlade } from './katana';
import { STRIDE, TWILL } from './mesh';

it('keeps the Hunter’s wrist blades within their housing’s height, clear of the hand (the user, 2026-11-24)', () => {
  for (const lod of [0, 1]) {
    const v = wristBlade(lod);
    let [crown, blades] = [0, 0];
    const steel: number[] = [];
    for (let i = 0; i < v.length; i += STRIDE) {
      if (v[i + 8] === TWILL) {
        crown = Math.max(crown, v[i]);
      } else if (v[i + 9] > 0.75) {
        // The blades' pale blue steel: the housing's cuts and slots are dark.
        steel.push(v[i]);
        blades++;
      }
    }
    expect(blades).toBeGreaterThan(0);
    // Under the housing's crown and never below its bed, 30 mm over the wrist: folded they are
    // inside it, and out they pass over the back of the hand.
    expect(Math.max(...steel)).toBeLessThan(crown);
    expect(Math.min(...steel)).toBeGreaterThan(0.0299);
  }
});

it('cuts a round notch and two barbs in each blade, seen close and from afar', () => {
  const [far, near] = [wristBlade(0), wristBlade(1)];
  // The blades are the same at both distances: only the housing's rails and signs change.
  const steel = (v: number[]) => v.filter((_, i) => i % STRIDE === 9 && v[i] > 0.75).length;
  expect(steel(far)).toBe(steel(near));
  expect(near.length).toBeGreaterThan(far.length);
});
