// The rail gun's beam (the user, 2026-11-07): instant, from the eye along the look to the first
// wall, or the first enemy body on the way. The host resolves it against the enemies as the
// shooter saw them; every client draws it to the wall. No DOM, no Node API.
import { PLAYER_R, RAIL_RANGE } from './constants';
import { eyeHeight, heightOf } from './physics';
import { cylinder } from './plasma';
import type { PlayerState } from './types';
import { ray } from './world';
import type { World } from './world';

type Vec3 = [number, number, number];

/**
 * The beam `p` fires along his look, turned by `drift` (yaw, pitch): where it starts (his eye), its
 * unit direction, how far it goes (to the first brush, or `range`) and the first of `foes` whose
 * body it enters before that.
 */
export const beam = (
  w: World,
  p: PlayerState,
  foes: PlayerState[] = [],
  range = RAIL_RANGE,
  [dy, dp] = [0, 0],
): { o: Vec3; d: Vec3; t: number; hit?: PlayerState } => {
  const o: Vec3 = [p.x, p.y + eyeHeight(p), p.z];
  const [yaw, pitch] = [p.yaw + dy, p.pitch + dp];
  const cp = Math.cos(pitch);
  const d: Vec3 = [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
  let t = ray(w, o, d, range);
  let hit: PlayerState | undefined;
  for (const f of foes) {
    const u = cylinder(o, d, f, PLAYER_R, heightOf(f));
    if (u < t) {
      [t, hit] = [u, f];
    }
  }
  return { o, d, t, hit };
};
