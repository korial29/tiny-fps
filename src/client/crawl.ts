// The xenomorph's view on a wall (the user, 2026-11-16, after Aliens versus Predator, 1999): the
// camera turns over onto the wall it clings to, which it sees as its floor. The inputs keep the
// world's yaw and pitch (physics.ts reads the look's heading on the wall from them); only the drawn
// view turns, a quarter turn about the wall's horizontal that takes the way into the wall up and
// the way up out of it. No DOM.
import { TOWARD } from '../shared/physics';
import { MODE } from '../shared/types';
import type { PlayerState } from '../shared/types';
import { basis, dot } from './mesh';
import type { Vec3 } from './mesh';
import { damp } from './spring';

/** How fast the view turns over, onto a wall and off it: a critically damped spring's rate. */
const TURN = 14;

/**
 * The yaw, pitch and roll of the view `yaw`, `pitch`, `roll` turned by `a` (a quarter turn is the
 * whole way) about the horizontal of the wall on `wall` (SIDE).
 */
export const turned = (
  yaw: number,
  pitch: number,
  roll: number,
  wall: number,
  a: number,
): [number, number, number] => {
  const [nx, nz] = TOWARD[wall];
  // Along the wall to the right of one facing it: n turns to up, up to out of the wall.
  const [tx, tz] = [-nz, nx];
  const [c, s] = [Math.cos(a), Math.sin(a)];
  const spin = ([x, y, z]: Vec3): Vec3 => {
    const d = (x * tx + z * tz) * (1 - c);
    return [
      x * c - tz * y * s + tx * d,
      y * c + (tz * x - tx * z) * s,
      z * c + tx * y * s + tz * d,
    ];
  };
  const [r, , f] = basis(yaw, pitch, roll).map(spin);
  const [y2, p2] = [Math.atan2(-f[0], -f[2]), Math.asin(Math.max(-1, Math.min(1, f[1])))];
  const [r0, u0] = basis(y2, p2);
  return [y2, p2, Math.atan2(-dot(r, u0), dot(r, r0))];
};

export interface Crawl {
  /** Follows the own player `p` for dt seconds: on a wall the view turns over onto it, off it back. */
  update(p: PlayerState | undefined, dt: number): void;
  /** The view `yaw`, `pitch`, `roll` as drawn: turned over onto the wall as far as it has gone. */
  view(yaw: number, pitch: number, roll: number): [number, number, number];
}

export const createCrawl = (): Crawl => {
  const sp = [0, 0];
  let wall = 0;
  return {
    update(p, dt) {
      const on = p?.mode == MODE.CLING && p.wall > 0;
      wall = on ? p.wall : wall;
      damp(sp, 0, +on, TURN, Math.min(dt, 0.1));
    },
    view(yaw, pitch, roll) {
      const k = Math.min(Math.max(sp[0], 0), 1);
      return k > 1e-3 && wall
        ? turned(yaw, pitch, roll, wall, (k * Math.PI) / 2)
        : [yaw, pitch, roll];
    },
  };
};
