// The ninja's belt buckle (the user, 2026-11-13), on him and on her: a round one, bigger than the
// belt is high (it was a small octagon), a disc of polished steel, domed, a dark ring in it and a
// disc of the team's colour in the middle. Carried by the pelvis, as the pouch, on the own body and
// the others'.
import { SHINE, STRIDE, dress, place, smooth } from './mesh';
import type { Vec3 } from './mesh';
import { JOINT as J, rest, solve, turn } from './rig';
import type { Quat } from './rig';
import type { Out } from './verts';

const shine = (v: number[]) => {
  for (let i = 0; i < v.length; i += STRIDE) {
    v[i + 8] = SHINE;
  }
  return v;
};

/** A disc one deep, its front rounded off by `bevel`: unit sized, scaled where it is placed. */
const disc = (bevel: number) =>
  smooth(
    [
      [0, 0],
      [1, 0],
      [1, 1 - bevel],
      [1 - bevel * 0.3, 1 - bevel * 0.3],
      [1 - bevel, 1],
      [0, 1],
    ],
    20,
  );
const STEEL = shine(dress(disc(0.4), [0.62, 0.64, 0.68]));
const RING = dress(disc(0.3), [0.03, 0.03, 0.035]);
const BOSS = shine(dress(disc(0.5), [1, 1, 1]));

/** The height of its middle at rest, on the middle of the belt (0.99 to 1.03 m). */
export const BUCKLE_Y = 1.008;
/** Where the buckle sits, from the pelvis in the rest pose, on him and on her, sunk a millimetre into the belt's front. */
const AT: Vec3[] = [0.131, 0.123].map(z => [
  0,
  BUCKLE_Y - solve(rest()).pos[J.PELVIS][1],
  -z + 0.001,
]);
/** Its radius and depth (m). */
export const BUCKLE = [0.032, 0.008];

/** Appends the buckle for build b's pelvis at `at` turned by `q`, its middle in `team`. */
export const buckle = (out: Out, at: Vec3, q: Quat, b: number, team: number[]) => {
  const ax = [turn(q, [1, 0, 0]), turn(q, [0, 1, 0]), turn(q, [0, 0, -1])];
  const o = turn(q, AT[b]);
  const m: Vec3 = [at[0] + o[0], at[1] + o[1], at[2] + o[2]];
  const [r, d] = BUCKLE;
  place(out, STEEL, m, ax, [0, 0, 0], [r, r, d]);
  place(out, RING, m, ax, [0, 0, d * 0.4], [r * 0.66, r * 0.66, d * 0.75]);
  place(out, BOSS, m, ax, [0, 0, d * 0.4], [r * 0.42, r * 0.42, d * 0.9], team);
};
