// Test helper: state overrides with the gun's battery, the rail gun's capsule and the rifle's cell
// loaded from the `ammo`, `rail` and `rifle` they give, unless they give `mag`, `cap` or `clip`.
import { GUN_MAG, RAIL_CAP, RIFLE_CLIP } from '../src/shared/constants';
import type { PlayerState } from '../src/shared/types';

export const loaded = <T extends Partial<PlayerState>>(o: T): T => ({
  ...o,
  ...(o.ammo !== undefined &&
    o.mag === undefined && { mag: Math.min(GUN_MAG, Math.max(o.ammo, 0)) }),
  ...(o.rail !== undefined &&
    o.cap === undefined && { cap: Math.min(RAIL_CAP, Math.max(o.rail, 0)) }),
  ...(o.rifle !== undefined &&
    o.clip === undefined && { clip: Math.min(RIFLE_CLIP, Math.max(o.rifle, 0)) }),
});
