// The gun and the katana: the triggers, shared by the host and the client's prediction (a shot's
// plasma ball is plasma.ts's, the katana's strike test blade.ts's). No DOM, no Node API.
//
// `step()` is move() plus the weapons, one call per input on both sides, so the own ammo, cool, shots
// and swing are predicted exactly. Health and the packs are the host's: they never feed back into movement.
// A player who is down is moved with no keys (`down` is in the snapshot), so the predictor replays
// a fall and a respawn the way the host plays them.
import { cutOf } from './blade';
import { AMMO_MAX, CUTS, GUN_COOLDOWN, PICK_H, RACK_R } from './constants';
import { move, respawn } from './physics';
import { KEY, MODE } from './types';
import type { Input, PlayerState } from './types';
import type { World } from './world';

type Vec3 = [number, number, number];

/** Whether the feet of `p` are within `r` of the point `at` on the floor plane and within PICK_H of its height. */
export const within = (p: PlayerState, at: Vec3, r: number): boolean => {
  const [dx, dz] = [p.x - at[0], p.z - at[2]];
  return dx * dx + dz * dz < r * r && Math.abs(p.y - at[1]) < PICK_H;
};

/** What a step struck, for the host to resolve: nothing, a shot (a plasma ball), or the katana's cut. */
export const STRIKE = { NONE: 0, SHOT: 1, CUT: 2 } as const;
export type Strike = (typeof STRIKE)[keyof typeof STRIKE];

/**
 * One input: the move, then the weapons. Returns what struck on this step (STRIKE), for the host to
 * resolve it: a shot, or a cut, which is not a shot.
 * - Down: the keys are dropped, and when `down` runs out the player is back at a spawn.
 * - The team's rack fills the gun when the player steps into its circle (`rack` tells he is in it),
 *   and again each time he comes back; staying gives nothing. The katana rack gives the katana,
 *   once and for good: it stays until he goes down.
 * - In hand (`wield`) is the katana when he has it and wants it (KEY.BLADE) or has no gun, and
 *   it stays in hand for the length of a swing.
 * - The trigger: `cool` and `swing` run down, and at 0 a held FIRE fires the gun, with ammo, or
 *   starts the katana's swing (`cut` from the keys), unless the hands are busy (a hang, a climb).
 *   The cut strikes `CUTS[cut].strike` ticks into its swing. The look is the input's, so both go
 *   where the player sees.
 * `armed` is false while the match is over: no weapon, no rack.
 */
export const step = (p: PlayerState, i: Input, w: World, team: number, armed = true): Strike => {
  const down = p.down > 0;
  move(p, down ? { ...i, keys: 0 } : i, w, team);
  p.zap = !!p.stun && !!p.zap;
  if (down) {
    // A fall under the kill floor has already put him back, and cleared `down`.
    if (p.down > 0 && !--p.down) {
      respawn(p, w, team);
    }
    return STRIKE.NONE;
  }
  // The rack fills the gun on arrival, not on every step spent in its circle.
  const { rack, blade } = w.def.teams[team];
  const inside = !!rack && within(p, rack, RACK_R);
  if (armed && inside && !p.rack) {
    p.ammo = AMMO_MAX;
  }
  p.rack = inside;
  p.blade = !!p.blade || (armed && !!blade && within(p, blade, RACK_R));
  p.cool = Math.max(0, p.cool - 1);
  p.swing = Math.max(0, (p.swing ?? 0) - 1);
  p.wield = p.blade && (p.swing > 0 || !!(i.keys & KEY.BLADE) || p.ammo < 0);
  const busy = p.mode === MODE.HANG || p.mode === MODE.CLIMB;
  if (!armed) {
    return STRIKE.NONE;
  }
  const c = CUTS[p.cut ?? 0];
  if (p.swing && c.ticks - p.swing === c.strike) {
    return STRIKE.CUT;
  }
  if (i.keys & KEY.FIRE && !busy) {
    if (p.wield && !p.swing) {
      p.cut = cutOf(i.keys);
      p.swing = CUTS[p.cut].ticks;
    } else if (!p.wield && !p.cool && p.ammo > 0) {
      p.ammo--;
      p.shots = (p.shots + 1) & 255;
      p.cool = GUN_COOLDOWN;
      return STRIKE.SHOT;
    }
  }
  return STRIKE.NONE;
};
