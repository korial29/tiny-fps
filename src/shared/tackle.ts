// The tackle, the host's rule: a dash or a slide into an enemy carrier. These are the two tests;
// the room asks them of the tackler's input, against the carriers as the tackler drew them
// (rewind), and applies the result with `stumble()` (physics.ts) and `Room.drop()`.
import { DASH_COOLDOWN, DASH_TICKS, PLAYER_R, TACKLE_REACH } from './constants';
import { heightOf } from './physics';
import { MODE } from './types';
import type { PlayerState } from './types';

/** Whether the player's body is a weapon: in a slide, or in the burst of a dash. */
export const tackling = (p: PlayerState): boolean =>
  p.mode === MODE.SLIDE || p.dash > DASH_COOLDOWN - DASH_TICKS;

/**
 * Whether the cylinders of `a` and `b` overlap, with TACKLE_REACH of reach on top: closer than
 * two radii and the reach on the floor plane, and their heights (low in a slide) overlap.
 */
export const reaches = (a: PlayerState, b: PlayerState): boolean =>
  Math.hypot(a.x - b.x, a.z - b.z) < 2 * PLAYER_R + TACKLE_REACH &&
  a.y < b.y + heightOf(b) &&
  b.y < a.y + heightOf(a);
