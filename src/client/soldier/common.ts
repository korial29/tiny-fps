import type { PlayerState } from '../../shared/types';
import { basis } from '../mesh';
import type { Vec3 } from '../mesh';

/** How fast the dash streaks grow and fade, 1 / s. */
export const DASH_RATE = 14;
/** The neck a xenomorph bit the head off (LIMB.EATEN): raw, dark red where a katana's cut glows. */
export const RAW = [0.32, 0.02, 0.02];

/** A point 30 m along the look of `p`, for a runner that has not shot yet. */
export const far = (p: PlayerState): Vec3 => {
  const f = basis(p.yaw, p.pitch)[2];
  return [p.x + f[0] * 30, p.y + 1.6 + f[1] * 30, p.z + f[2] * 30];
};
