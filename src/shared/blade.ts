// The electric katana, the host's rule: which cut the keys give, which enemies a cut hits and the
// way its shock throws them. The swing timer is in `step()` (gun.ts); the room applies the result
// (damage, `stumble()`). No DOM, no Node API.
import { CUTS, PLAYER_R } from './constants';
import { forward, heightOf } from './physics';
import { CUT, KEY } from './types';
import type { PlayerState } from './types';
import { hidden } from './world';
import type { World } from './world';

/** Where on the body the blade is, as a share of its height: the chest, which a brush must not cover. */
const CHEST = 0.7;

/**
 * The cut the keys held when FIRE starts a swing give: LEFT or RIGHT, one of them, cuts across from
 * that side; else FORWARD thrusts; else (back or no key) it slashes. Both sides held are neither.
 */
export const cutOf = (keys: number): number => {
  const [l, r] = [keys & KEY.LEFT, keys & KEY.RIGHT];
  return l && !r ? CUT.LEFT : r && !l ? CUT.RIGHT : keys & KEY.FORWARD ? CUT.THRUST : CUT.SLASH;
};

/**
 * The enemies the cut of `p` (`p.cut`, `p` the state after the step that struck) hits, of `foes`
 * (as he saw them): each within CUTS reach of his centre less PLAYER_R on the floor plane, inside
 * the arc round his look (the foe's own angular radius counts: his edge in the arc is a hit), with
 * the heights of the two bodies overlapping and no brush between the chests.
 */
export const strike = (w: World, p: PlayerState, foes: PlayerState[]): PlayerState[] => {
  const { reach, arc } = CUTS[p.cut ?? 0];
  const [fx, fz] = forward(p.yaw);
  const o: [number, number, number] = [p.x, p.y + CHEST * heightOf(p), p.z];
  return foes.filter(f => {
    const [dx, dz] = [f.x - p.x, f.z - p.z];
    const d = Math.hypot(dx, dz);
    if (d - PLAYER_R > reach || p.y >= f.y + heightOf(f) || f.y >= p.y + heightOf(p)) {
      return false;
    }
    // On the foe's body, any way is in the arc.
    const off = d > PLAYER_R ? Math.abs(Math.atan2(fx * dz - fz * dx, fx * dx + fz * dz)) : 0;
    const wide = d > PLAYER_R ? Math.asin(PLAYER_R / d) : Math.PI;
    return off <= arc + wide && !hidden(w, o, [f.x, f.y + CHEST * heightOf(f), f.z]);
  });
};

/**
 * The way the shock of the cut of `p` throws a foe, a unit vector on the floor plane: along his
 * look for a thrust and a slash; a cut across ends on the opposite side to the one it starts from,
 * so LEFT throws to his right and RIGHT to his left.
 */
export const knock = (p: PlayerState): [x: number, z: number] => {
  const [fx, fz] = forward(p.yaw);
  const c = p.cut ?? 0;
  return c === CUT.LEFT ? [-fz, fx] : c === CUT.RIGHT ? [fz, -fx] : [fx, fz];
};
