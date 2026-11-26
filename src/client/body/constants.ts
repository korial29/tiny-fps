import { ease, span } from '../gun';
import { sub } from '../mesh';
import type { Vec3 } from '../mesh';
import { JOINT as J } from '../rig';
import type { Quat } from '../rig';

import type { Part } from '../xeno';
import type { Out } from '../verts';
import { ID, ORIGIN } from '../store';

/** The xenomorph's feet: each foot's joint and its toes'. */
export const FEET = [
  [J.FOOT_L, J.TOE_L],
  [J.FOOT_R, J.TOE_R],
];
/** What mesh() makes of a part: the part at the origin. */
export const made =
  ({ make }: Part) =>
  (o: Out) =>
    make(o, ORIGIN, ID);

/** Metres the camera may be from the eye of the body and still show it: the bob is centimetres, a crouch's ease under a metre. */
export const AWAY = 1;
/** On a ledge the camera sits this far behind the head and below it, so that the arms reach the ledge. */
export const [BEHIND, DROP] = [0.12, 0.03];
export const [X, Y, Z]: Vec3[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
export const POLE: Vec3 = [0.7, -1, -0.5];
export const clamp = (v: number, lo = 0, hi = 1) => Math.min(Math.max(v, lo), hi);

/**
 * The own Hunter's disc throw, seconds from the click: the hand winds back across the chest until
 * `wound`, sweeps out to the right until `swept` and lets the disc go at `release` on the way,
 * then is back at the hold at `back`. Its arc round `centre` (camera space), `radius` metres.
 */
export const THROW = {
  wound: 0.08,
  release: 0.12,
  swept: 0.17,
  back: 0.42,
  centre: [0.06, -0.15, 0.24] as Vec3,
  radius: 0.36,
  /** The arc's angle from straight ahead, radians: wound back to the left, swept out to the right. */
  from: -1,
  to: 0.95,
};

/** The weight of the throw's pose over the hold, and the hand's angle on its arc, `t` seconds after the click. */
export const throwOf = (t: number): [number, number] => {
  const k =
    t < THROW.wound
      ? ease(t / THROW.wound)
      : t < THROW.swept
        ? 1
        : 1 - ease(clamp((t - THROW.swept) / (THROW.back - THROW.swept)));
  const phi = THROW.from + (THROW.to - THROW.from) * ease(span(t, THROW.wound, THROW.swept));
  return [k, phi];
};
export const inv = ([x, y, z, w]: Quat): Quat => [-x, -y, -z, w];
export const dist = (a: Vec3, b: Vec3) => Math.hypot(...sub(a, b));
