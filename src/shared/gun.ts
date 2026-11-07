// The gun and the katana: the triggers, shared by the host and the client's prediction (a shot's
// plasma ball is plasma.ts's, the katana's strike test blade.ts's). No DOM, no Node API.
//
// `step()` is move() plus the weapons, one call per input on both sides, so the own ammo, cool, shots
// and swing are predicted exactly. Health and the packs are the host's: they never feed back into movement.
// A player who is down is moved with no keys (`down` is in the snapshot), so the predictor replays
// a fall and a respawn the way the host plays them.
import { cutOf } from './blade';
import {
  AMMO_MAX,
  CHARGE_MAX,
  CHARGE_TAP,
  CHARGE_TICKS,
  CUTS,
  DASH_COOLDOWN,
  GUN_COOLDOWN,
  LEAP_SPEED,
  LOCK_BREAK,
  LUNGE_SPEED,
  PICK_H,
  RACK_R,
  SPECIAL_LATE,
} from './constants';
import { forward, move, respawn } from './physics';
import { CUT, EV, KEY, MODE, SPECIAL_CUT } from './types';
import type { Input, PlayerState } from './types';
import type { World } from './world';

type Vec3 = [number, number, number];

/** Whether the feet of `p` are within `r` of the point `at` on the floor plane and within PICK_H of its height. */
export const within = (p: PlayerState, at: Vec3, r: number): boolean => {
  const [dx, dz] = [p.x - at[0], p.z - at[2]];
  return dx * dx + dz * dz < r * r && Math.abs(p.y - at[1]) < PICK_H;
};

/**
 * The start of a cut that moves the body, from a floor only: the lunge throws him along the look at
 * LUNGE_SPEED for the burst of a dash, and spends the dash; the leap jumps him LEAP_SPEED up.
 */
const launch = (p: PlayerState): void => {
  if (p.mode !== MODE.GROUND) {
    return;
  }
  if (p.cut === CUT.LUNGE) {
    const [fx, fz] = forward(p.yaw);
    p.vx = fx * LUNGE_SPEED;
    p.vz = fz * LUNGE_SPEED;
    p.dash = DASH_COOLDOWN;
    p.ev |= EV.DASH;
  } else if (p.cut === CUT.LEAP) {
    p.vy = LEAP_SPEED;
    p.ev |= EV.JUMP;
  }
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
 * - The trigger: `cool` and `swing` run down, and at 0 a held FIRE charges the gun, with ammo, and
 *   letting it go fires a ball as strong as the charge (powerOf()), spending as many shots; or it
 *   starts the katana's swing (`cut` from the keys), unless the hands are busy (a hang, a climb).
 *   The katana in hand, busy hands or no shot left drop the charge.
 *   With SPECIAL (a double click) the swing is the cut's special; its press within SPECIAL_LATE
 *   ticks of a cut's start turns that cut into it. The cut strikes `CUTS[cut].strike` ticks into
 *   its swing. The look is the input's, so both go where the player sees.
 * `armed` is false while the match is over: no weapon, no rack.
 */
export const step = (p: PlayerState, i: Input, w: World, team: number, armed = true): Strike => {
  const down = p.down > 0;
  const locked = !down && (p.lock ?? 0) > 0;
  move(p, down || locked ? { ...i, keys: 0 } : i, w, team);
  p.zap = !!p.stun && !!p.zap;
  if (down) {
    // A fall under the kill floor has already put him back, and cleared `down`.
    if (p.down > 0 && !--p.down) {
      respawn(p, w, team);
    }
    return STRIKE.NONE;
  }
  if (locked) {
    return duel(p, i);
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
    p.charge = 0;
    return STRIKE.NONE;
  }
  const c = CUTS[p.cut ?? 0];
  if (p.swing && c.ticks - p.swing === c.strike) {
    return STRIKE.CUT;
  }
  // The charge goes with the katana in hand, the hands busy, or no shot left.
  if (p.wield || busy || p.ammo <= 0) {
    p.charge = 0;
  }
  if (i.keys & KEY.FIRE && !busy) {
    // A double click's second press turns a cut just started into its special.
    const late = CUTS[p.cut ?? 0].ticks - p.swing;
    const special =
      !!(i.keys & KEY.SPECIAL) &&
      (!p.swing || ((p.cut ?? 0) < SPECIAL_CUT && late <= SPECIAL_LATE));
    if (p.wield && (!p.swing || special)) {
      p.cut = cutOf(i.keys) + (special ? SPECIAL_CUT : 0);
      p.swing = CUTS[p.cut].ticks;
      launch(p);
    } else if (!p.wield && !p.cool && p.ammo > 0) {
      // Held, the gun charges; let go, it fires (below).
      p.charge = Math.min((p.charge ?? 0) + 1, CHARGE_TICKS);
    }
  } else if (p.charge) {
    // Let go: one ball as strong as the charge, spending as many shots.
    p.power = Math.min(powerOf(p.charge), p.ammo);
    p.charge = 0;
    p.ammo -= p.power;
    p.shots = (p.shots + 1) & 255;
    p.cool = GUN_COOLDOWN;
    return STRIKE.SHOT;
  }
  return STRIKE.NONE;
};

/**
 * A step in a saber lock: the blade stays in hand and no cut starts. Each FIRE press (FIRE held
 * now, not at the last step) pushes; a side or back key held counts `away`, up to LOCK_BREAK. The
 * lock runs down to 1, where it waits for the host, who parts the two (room.ts).
 */
const duel = (p: PlayerState, i: Input): Strike => {
  const fire = !!(i.keys & KEY.FIRE);
  p.pushes = ((p.pushes ?? 0) + +(fire && !p.pressed)) & 255;
  p.pressed = fire;
  p.away = i.keys & (KEY.LEFT | KEY.RIGHT | KEY.BACK) ? Math.min((p.away ?? 0) + 1, LOCK_BREAK) : 0;
  p.lock = Math.max(1, p.lock! - 1);
  [p.wield, p.swing, p.charge] = [true, 0, 0];
  return STRIKE.NONE;
};

/** The strength a charge of `ticks` gives, 1 to CHARGE_MAX: 1 under CHARGE_TAP, CHARGE_MAX at CHARGE_TICKS. */
export const powerOf = (ticks: number): number =>
  ticks < CHARGE_TAP
    ? 1
    : 1 + Math.floor(((CHARGE_MAX - 1) * (ticks - CHARGE_TAP)) / (CHARGE_TICKS - CHARGE_TAP));
