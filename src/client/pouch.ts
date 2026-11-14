// The pouch the spare batteries come from (the user, 2026-11-09: a small pouch on the hip, under the
// jacket; nothing on the chest): on the left hip at the belt, the top of a spare battery glowing at
// its mouth. Drawn with the pelvis, on the own body and the others'.
import { glow as lit } from './flag';
import { AT_POUCH, BROUGHT, TAKEN, ease, span } from './gun';
import { add, dot, dress, mix, place, smooth, sub, unit } from './mesh';
import type { Vec3 } from './mesh';
import { JOINT as J, rest, solve, turn } from './rig';
import type { Quat } from './rig';
import type { Out } from './verts';

/** The pouch: a soft box, and the spare's glowing top. Unit sized, scaled where it is placed. */
const BAG = dress(
  smooth(
    [
      [0, 0],
      [1, 0.05],
      [1, 0.9],
      [0.8, 1],
      [0, 1],
    ],
    8,
  ),
  [0.06, 0.065, 0.07],
);
const CAP = dress(
  smooth(
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
    6,
  ),
  [0.25, 0.9, 1],
);
lit(CAP, 0, 1);

/** `o` moved `k` along `d`; the cross product. */
const along = (o: Vec3, d: Vec3, k: number): Vec3 => add(o, d.map(v => v * k) as Vec3);
const cross = ([a, b, c]: Vec3, [d, e, f]: Vec3): Vec3 => [
  b * f - c * e,
  c * d - a * f,
  a * e - b * d,
];

/** The middle of the pouch's mouth in the rest pose, just under the jacket's hem on the left hip, from the pelvis. */
const MOUTH = sub([-0.2, 0.975, 0.01], solve(rest()).pos[J.PELVIS]);

/**
 * The pouch's mouth for a skeleton with its pelvis at `at` turned by `q`, and its axes: out of the
 * hip, forward, and down into it.
 */
export const pouchAt = (at: Vec3, q: Quat): [Vec3, Vec3[]] => [
  add(at, turn(q, MOUTH)),
  [turn(q, [-1, 0, 0]), turn(q, [0, 0, -1]), turn(q, [0, -1, 0])],
];

/** Appends the pouch, and the spare's top 8 mm out of it, for the pelvis at `at` turned by `q`. */
export const pouch = (out: Out, at: Vec3, q: Quat) => {
  const [m, ax] = pouchAt(at, q);
  place(out, BAG, m, ax, [0, 0, 0], [0.019, 0.026, 0.08]);
  place(out, CAP, add(m, ax[2].map(v => -0.008 * v) as Vec3), ax, [0, 0, 0], [0.012, 0.012, 0.012]);
};

/**
 * The left hand fetching a new battery from the pouch at `s` of a swap (the user, 2026-11-09): from
 * `start` down over the pouch, into it, then up with the battery along an arc to `seat`, where the
 * gun takes it at BROUGHT. Where the hand holds it (the battery's middle) and the way it points,
 * the battery's foot and axes once it is out, and how closed the hand is.
 */
export const fetched = (
  s: number,
  [mouth, [, , down]]: [Vec3, Vec3[]],
  [seat, ax]: [Vec3, Vec3[]],
  start: Vec3,
): { at: Vec3; g: Vec3; carry?: [Vec3, Vec3[]]; curl: number } => {
  const up = down.map(v => -v) as Vec3;
  const k = ease(span(s, TAKEN, BROUGHT));
  const dip = span(s, AT_POUCH, AT_POUCH + 0.03) - span(s, TAKEN - 0.03, TAKEN);
  const inside = along(mouth, up, 0.046 - 0.05 * dip);
  const arc = along(mix(inside, along(seat, ax[2], 0.046), k), up, 0.1 * Math.sin(Math.PI * k));
  const g = unit(mix(up, ax[2], k));
  const r = unit(along(ax[0], g, -dot(ax[0], g)));
  return s < TAKEN
    ? {
        at: mix(start, inside, ease(span(s, 0.14, AT_POUCH))),
        g,
        curl: s < AT_POUCH + 0.02 ? 0.35 : 0.9,
      }
    : { at: arc, g, carry: [along(arc, g, -0.046), [r, cross(g, r), g]], curl: 0.9 };
};
