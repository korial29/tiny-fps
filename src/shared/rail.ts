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
 * The beam `p` fires along his look: where it starts (his eye), its unit direction, how far it goes
 * (to the first brush, or RAIL_RANGE) and the first of `foes` whose body it enters before that.
 */
export const beam = (
  w: World,
  p: PlayerState,
  foes: PlayerState[] = [],
): { o: Vec3; d: Vec3; t: number; hit?: PlayerState } => {
  const o: Vec3 = [p.x, p.y + eyeHeight(p), p.z];
  const cp = Math.cos(p.pitch);
  const d: Vec3 = [-Math.sin(p.yaw) * cp, Math.sin(p.pitch), -Math.cos(p.yaw) * cp];
  let t = ray(w, o, d, RAIL_RANGE);
  let hit: PlayerState | undefined;
  for (const f of foes) {
    const u = cylinder(o, d, f, PLAYER_R, heightOf(f));
    if (u < t) {
      [t, hit] = [u, f];
    }
  }
  return { o, d, t, hit };
};
