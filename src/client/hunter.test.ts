import { expect, it } from 'vitest';
import { hunter } from './hunter';
import { STRIDE } from './mesh';

it('keeps the front of the pectorals smooth across the Marine shoulder ring', () => {
  const mesh = hunter(2)['Marine anatomy'];
  let sampled = 0;
  for (let i = 0; i < mesh.length; i += STRIDE) {
    const [x, y, z] = mesh.slice(i, i + 3);
    if (Math.abs(x) < 0.185 && Math.abs(y - 1.692) < 0.004 && z < -0.17) {
      expect(mesh[i + 5]).toBeLessThan(-0.8);
      sampled++;
    }
  }
  expect(sampled).toBeGreaterThan(0);
});
