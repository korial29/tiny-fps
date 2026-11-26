import type { Vec3 } from '../mesh';

import { JOINT as J, rest, solve } from '../rig';
import { stature } from './constants';

/**
 * The Hunter's own rest skeleton in model space: the rig's joints on his 1.2 m stature, the arms
 * where the sculpted sleeves hang (wider than the rig's) and the neck under the lowered mask.
 * Rest rotations are the identity, so a joint's rest frame is this point alone.
 */
export const HUNTER_REST: Vec3[] = (() => {
  const bind = solve(rest()).pos;
  const at: Vec3[] = bind.map(([x, y, z]) => [x * stature * 0.9, y * stature, z * stature * 0.92]);
  for (const side of [-1, 1]) {
    const [arm, fore, hand, thigh, shin, foot, toe] =
      side < 0
        ? [J.ARM_L, J.FOREARM_L, J.HAND_L, J.THIGH_L, J.SHIN_L, J.FOOT_L, J.TOE_L]
        : [J.ARM_R, J.FOREARM_R, J.HAND_R, J.THIGH_R, J.SHIN_R, J.FOOT_R, J.TOE_R];
    // The shoulder ring, the elbow over the bracer's top and the bracer's lower rim.
    at[arm] = [side * 0.28, 1.629, -0.016];
    at[fore] = [side * 0.37, 1.36, 0];
    at[hand] = [side * 0.392 * stature * 0.9, 0.884 * stature, 0];
    at[thigh] = [side * 0.14, 1.1, 0];
    at[shin] = [side * 0.178, 0.59, 0];
    at[foot] = [side * 0.178, 0.072, 0];
    at[toe] = [side * 0.178, 0.024, -0.144];
  }
  at[J.NECK] = [0, 1.7, 0];
  at[J.HEAD] = [0, 1.8, 0];
  return at;
})();
