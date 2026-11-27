import type { V } from './types';
import { ink, bar } from './common';
import { cube, turn } from './shapes';

// ---------------------------------------------------------------------------------------------
// The captain (the user, 2026-11-27: a dead pilot in the captain's seat): still strapped in the
// left seat, slumped forward and toward the window, the head on the chest, one arm hanging by
// the pedestal and the other in the lap. His cap lies on the floor behind the seat.

/** A white shirt, navy trousers and cap, black shoes, gold braid, skin and dark hair. */
const SHIRT = ink([0.55, 0.56, 0.57]);
const NAVY = ink([0.05, 0.06, 0.1]);
const SHOE = ink([0.03, 0.03, 0.035]);
const GOLD = ink([0.55, 0.42, 0.12]);
const FLESH = ink([0.5, 0.36, 0.28]);
const HAIR = ink([0.07, 0.055, 0.045]);

const F = [1, 0, 0];
const U = [0, 1, 0];
const S = [0, 0, 1];

/** The captain, seated with the middle of his seat's cushion at (x, y, z) (y the cushion's top). */
export const captain = (x: number, y: number, z: number) => {
  const at = (dx: number, dy: number, dz: number): V => [x + dx, y + dy, z + dz];
  // The hips on the cushion, the thighs forward, the shins down to the shoes.
  cube(at(-0.05, 0, 0), [F, U, S], [-0.17, 0, -0.18], [0.17, 0.2, 0.18], NAVY, NAVY, 4);
  for (const e of [-1, 1]) {
    const knee = at(0.42, 0.12, e * 0.12);
    bar(at(0.0, 0.1, e * 0.1), knee, 0.15, NAVY, 0.15);
    const ankle = at(0.55, -0.38, e * 0.14);
    bar(knee, ankle, 0.12, NAVY, 0.12);
    bar(off3(ankle, -0.03, -0.02, 0), off3(ankle, 0.22, -0.03, 0), 0.1, SHOE, 0.08);
  }
  // The torso, slumped forward and to the left, the tie and the braid on the shoulders.
  const [hip, neck] = [at(-0.02, 0.2, 0), at(0.28, 0.62, -0.1)];
  bar(hip, neck, 0.38, SHIRT, 0.22);
  bar(at(0.33, 0.52, -0.09), at(0.22, 0.32, -0.045), 0.06, NAVY, 0.02);
  for (const e of [-1, 1]) {
    bar(at(0.27, 0.64, -0.1 + e * 0.06), at(0.26, 0.61, -0.1 + e * 0.17), 0.06, GOLD, 0.025);
  }
  // The head hanging on the chest, rolled toward the window.
  const hd = turn(turn([F, U, S], S, -0.75), F, -0.35);
  const head = at(0.4, 0.66, -0.17);
  cube(head, hd, [-0.1, -0.12, -0.085], [0.11, 0.13, 0.085], FLESH);
  cube(head, hd, [-0.115, 0.02, -0.095], [0.05, 0.15, 0.095], HAIR, HAIR, 4);
  // The right arm hanging by the pedestal, the left in the lap.
  const arm = (s: V, e: V, h: V) => {
    bar(s, e, 0.1, SHIRT, 0.1);
    bar(e, h, 0.085, SHIRT, 0.085);
    cube(h, [F, U, S], [-0.05, -0.09, -0.03], [0.05, 0.02, 0.03], FLESH);
  };
  arm(at(0.25, 0.58, 0.08), at(0.25, 0.26, 0.24), at(0.32, 0.0, 0.29));
  arm(at(0.25, 0.58, -0.28), at(0.33, 0.28, -0.25), at(0.5, 0.2, -0.08));
};

/** A point off p. */
const off3 = (p: V, dx: number, dy: number, dz: number) => [p[0] + dx, p[1] + dy, p[2] + dz];

/** The captain's cap on the floor at (x, y, z), turned `t` round the vertical: its crown, the black peak, the badge. */
export const cap = (x: number, y: number, z: number, t: number) => {
  const ax = turn([F, U, S], U, t);
  const o = [x, y, z];
  cube(o, ax, [-0.13, 0, -0.12], [0.13, 0.09, 0.12], NAVY, NAVY, 4);
  cube(o, ax, [0.1, 0, -0.1], [0.2, 0.02, 0.1], SHOE, SHOE, 4);
  cube(o, ax, [0.13, 0.04, -0.03], [0.135, 0.08, 0.03], GOLD, GOLD, 4);
};
