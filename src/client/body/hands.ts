import type { Vec3 } from '../mesh';
import { JOINT as J, turn as spin } from '../rig';

import type { Out } from '../verts';
import { CLAW_HAND, HAND_F } from './fingers';
import type { Claws } from './fingers';
import { hand } from './glove';
import { GRAIN_SCALE } from './hide';
import type { Solved } from './types';

/** What a hand does besides closing (hand()): the left index pointing, the right thumb pushing toward `to`, the left thumb cupped. */
export interface Grip {
  point?: number;
  push?: number;
  to?: Vec3;
  cup?: number;
  /** The marine's lit buttons on the wrists' straps. */
  lights?: boolean;
  /** The xenomorph's: a hooked claw of bone on each fingertip, for the nail. */
  claws?: Claws;
  /** The right hand's fingers fanned out this many times an open hand's (the Hunter's disc). */
  spread?: number;
  /** The right hand's fingers' last bones bent further, radians: gripping an edge. */
  hook?: number;
  /** The right index straightened out of the fist as `point` the left (the Hunter's wrist computer). */
  poke?: number;
}

/**
 * Both hands of the skeleton `s` on its wrists, left then right, each closed `curls[i]` (hand()), in
 * the glove `glove` with the bare fingertips `bare`; hers smaller about the wrist (HAND_F). The own
 * body and the runners share it, so a runner's fist closes on a grip as the own one does. `lite` is
 * a near runner's hand, `skip` a hand not drawn (the one a cut took off with its arm).
 */
export const hands = (
  out: Out,
  s: Solved,
  build: number,
  curls: number[],
  glove: number[],
  bare: number[],
  {
    point = 0,
    push = 0,
    to,
    cup = 0,
    lights = false,
    claws = false,
    spread = 1,
    hook = 0,
    poke = 0,
  }: Grip = {},
  lite = false,
  skip = -1,
) =>
  [J.HAND_L, J.HAND_R].forEach((j, i) => {
    if (j == skip) {
      return;
    }
    const q = s.rot[j];
    hand(
      out,
      s.pos[j],
      spin(q, [0, -1, 0]),
      spin(q, [i * 2 - 1, 0, 0]),
      spin(q, [0, 0, -1]),
      curls[i],
      glove,
      i ? poke : point,
      i * push,
      to,
      bare,
      i ? 0 : cup,
      lite,
      lights,
      claws,
      // The xenomorph's hands larger (CLAW_HAND), but at the wrist, where they meet the arm's
      // cuff, and growing from it over 4 cm; hers smaller.
      claws === true ? CLAW_HAND : build ? HAND_F : 1,
      i ? spread : 1,
      i ? hook : 0,
    );
  });

/**
 * Where the two hands of the skeleton `s` are, left then right, written into `into`: for each a
 * matrix (column-major, 16 numbers) that takes a point of the world to the hand's own space (x
 * toward the thumb, y the back, z toward the fingers, hand()). The frame's vertices carry no rest
 * place, and the shader's skin pass needs one that holds still on the skin: it finds a bare hand's
 * through these (VERT's `Hh`), so the own hands' grain stays on them as they move. The space is
 * shrunk by GRAIN_SCALE: the shader's pores and grain come out that much coarser on the hand.
 */
export const palmsOf = (s: Solved, into: Float32Array) => {
  [J.HAND_L, J.HAND_R].forEach((j, i) => {
    const q = s.rot[j];
    const p = s.pos[j];
    [spin(q, [0, 0, -1]), spin(q, [i * 2 - 1, 0, 0]), spin(q, [0, -1, 0])].forEach((a, row) => {
      for (let col = 0; col < 3; col++) {
        into[i * 16 + col * 4 + row] = a[col] * GRAIN_SCALE;
      }
      into[i * 16 + 12 + row] = -(a[0] * p[0] + a[1] * p[1] + a[2] * p[2]) * GRAIN_SCALE;
    });
    into[i * 16 + 15] = 1;
  });
};
