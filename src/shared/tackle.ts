// The tackle, the host's rule: a dash or a slide into an enemy carrier. These are the two tests;
// the room asks them of the tackler's input, against the carriers as the tackler drew them
// (rewind), and applies the result with `stumble()` (physics.ts) and `Room.drop()`.
import {
  DASH_COOLDOWN,
  DASH_TICKS,
  GLORY_ARC,
  GLORY_HP,
  GLORY_REACH,
  PLAYER_H,
  PLAYER_R,
  TACKLE_REACH,
} from './constants';
import { forward, heightOf } from './physics';
import { MODE } from './types';
import type { PlayerState } from './types';
import { hidden } from './world';
import type { World } from './world';

/** Whether the player's body is a weapon: in a slide, or in the burst of a dash. */
export const tackling = (p: PlayerState): boolean =>
  p.mode === MODE.SLIDE || p.dash > DASH_COOLDOWN - DASH_TICKS;

/**
 * Whether a xenomorph is in the strike of its pounce: the burst of a dash. Only for a xenomorph:
 * another's dash runs through an enemy.
 */
export const pouncing = (p: PlayerState): boolean => p.dash > DASH_COOLDOWN - DASH_TICKS;

/**
 * Whether the cylinders of `a` and `b` overlap, with TACKLE_REACH of reach on top: closer than
 * two radii and the reach on the floor plane, and their heights (low in a slide) overlap.
 */
export const reaches = (a: PlayerState, b: PlayerState): boolean =>
  Math.hypot(a.x - b.x, a.z - b.z) < 2 * PLAYER_R + TACKLE_REACH &&
  a.y < b.y + heightOf(b) &&
  b.y < a.y + heightOf(a);

/**
 * The enemy `me` would glory kill with E (room.ts feast()), of `foes` as it sees them: the nearest
 * one up, in no lock and not seated, within GLORY_REACH on the floor plane, a body's height above or
 * below and GLORY_ARC of its look. An execution, the katana's or the fists' (`w` undefined), with
 * GLORY_HP health or less; the xenomorph's in sight through the world `w`, at any health (the user,
 * 2026-11-16).
 */
export const glory = (
  me: PlayerState,
  foes: readonly PlayerState[],
  w?: World,
): PlayerState | undefined => {
  const [fx, fz] = forward(me.yaw);
  let best: PlayerState | undefined;
  let near = GLORY_REACH;
  for (const f of foes) {
    const [dx, dz] = [f.x - me.x, f.z - me.z];
    const d = Math.hypot(dx, dz);
    const facing = d < 1e-3 || Math.acos(Math.min(1, (dx * fx + dz * fz) / d)) <= GLORY_ARC;
    if (
      !f.down &&
      !f.lock &&
      f.mode !== MODE.RIDE &&
      (w ? !hidden(w, [me.x, me.y + 1.3, me.z], [f.x, f.y + 1.3, f.z]) : f.hp <= GLORY_HP) &&
      d <= near &&
      Math.abs(f.y - me.y) < PLAYER_H &&
      facing
    ) {
      [best, near] = [f, d];
    }
  }
  return best;
};
