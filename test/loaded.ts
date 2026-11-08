// Test helper: state overrides with the gun's battery and the rail gun's capsule loaded from the
// `ammo` and `rail` they give, unless they give `mag` or `cap` themselves.
import { GUN_MAG, RAIL_CAP } from '../src/shared/constants';
import type { PlayerState } from '../src/shared/types';

export const loaded = <T extends Partial<PlayerState>>(o: T): T => ({
  ...o,
  ...(o.ammo !== undefined &&
    o.mag === undefined && { mag: Math.min(GUN_MAG, Math.max(o.ammo, 0)) }),
  ...(o.rail !== undefined &&
    o.cap === undefined && { cap: Math.min(RAIL_CAP, Math.max(o.rail, 0)) }),
});
