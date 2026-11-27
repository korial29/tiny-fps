// Where the crash broke the forest round the wreck's nose, and how each broken tree stands: shared
// by the snags (jungle.ts) and the fires that still burn among them (burnt/fire.ts), so a fire
// stands on its stump. All of it past the ghost wall behind the first palms: nobody gets there.
import { FRAME, HULL, ZED } from '../../shared/beach';
import { hash } from '../../shared/relief';
import type { Vec3 } from '../mesh';

/** The broken trees in the clearing the nose made, on each side of it: x, z and seed. */
export const CLEARING = Array.from({ length: 18 }, (_, i) => {
  const h = (k: number) => hash(i, k, 88);
  const d = HULL.r + 2 + 14 * h(2);
  return [FRAME.trees + 6 + 16 * h(1), ZED / 2 + (i & 1 ? d : -d), i];
});

/**
 * How the tree of seed s whose foot is at (x, z), on ground y, was broken: `a` the bearing it was
 * pushed to, forward and away from the centre line (c, d its cosine and sine), `tall` the stump's
 * height, `r` its radius, `len` the fallen trunk's length, `lean` the stump's lean, `top` its break.
 */
export const broken = (x: number, y: number, z: number, s: number) => {
  const h = (k: number) => hash(s, k, 81);
  const a = (z < ZED / 2 ? -1 : 1) * (0.3 + 1.1 * h(1));
  const [c, d] = [Math.cos(a), Math.sin(a)];
  const [tall, r, len] = [0.6 + 6.5 * h(2) * h(2), 0.3 + 0.18 * h(3), 4 + 5 * h(4)];
  const lean = 0.12 + 0.18 * h(16);
  const top: Vec3 = [x + lean * tall * c, y + tall, z + lean * tall * d];
  return { a, c, d, tall, r, len, lean, top };
};
