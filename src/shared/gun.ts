// The gun and the katana: the triggers, shared by the host and the client's prediction (a shot's
// plasma ball is plasma.ts's, the katana's strike test blade.ts's). No DOM, no Node API.
//
// `step()` is move() plus the weapons, one call per input on both sides, so the own ammo, cool, shots
// and swing are predicted exactly. Health and the packs are the host's: they never feed back into movement.
// A player who is down is moved with no keys (`down` is in the snapshot), so the predictor replays
// a fall and a respawn the way the host plays them.
import { cutOf, swingOf } from './blade';
import {
  CHARGE_MAX,
  CHARGE_TAP,
  CHARGE_TICKS,
  CUTS,
  DASH_COOLDOWN,
  GUN_RELOAD,
  HEAVY_MAX,
  HEAVY_TAP,
  LEAP_SPEED,
  LOCK_BREAK,
  LUNGE_SPEED,
  NADE_COOL,
  NADE_HOLD,
  NADE_MAX,
  PICK_H,
  RACK_R,
  HEAT_COOL,
  HEAT_LOCK,
  HEAT_MAX,
  RAIL_SPEND,
  RAIL_RELOAD,
  RIFLE_RELOAD,
  SPECIAL_LATE,
  BLOW,
  PUNCHES,
} from './constants';
import { KITS } from './kit';
import type { Kit } from './kit';
import { forward, move, respawn } from './physics';
import { tackling } from './tackle';
import type { Body } from './physics';
import { CUT, EV, KEY, MODE, SPECIAL_CUT } from './types';
import type { Input, PlayerState } from './types';
import type { World } from './world';

type Vec3 = [number, number, number];

/** Whether the feet of `p` are within `r` of the point `at` on the floor plane and within PICK_H of its height. */
export const within = (p: PlayerState, at: Vec3, r: number): boolean => {
  const [dx, dz] = [p.x - at[0], p.z - at[2]];
  return dx * dx + dz * dz < r * r && Math.abs(p.y - at[1]) < PICK_H;
};

/** PlayerState.fell of one put down the FALL `kind` by a hit going (dx, dz) on the floor. */
export const felled = (kind: number, dx: number, dz: number): number =>
  (kind << 5) | (Math.round((Math.atan2(-dx, -dz) * 16) / Math.PI) & 31);

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

/** What a step struck, for the host to resolve: nothing, a shot (a plasma ball), the katana's cut, a rail gun's beam, a laser rifle's shot, or a grenade from its launcher. */
export const STRIKE = { NONE: 0, SHOT: 1, CUT: 2, RAIL: 3, LASER: 4, NADE: 5 } as const;
export type Strike = (typeof STRIKE)[keyof typeof STRIKE];

/**
 * One input: the move, then the weapons. Returns what struck on this step (STRIKE), for the host to
 * resolve it: a shot, or a cut, which is not a shot.
 * - Down: the keys are dropped, and when `down` runs out the player is back at a spawn.
 * - The team's rack fills the gun when the player steps into its circle (`rack` tells he is in it),
 *   and again each time he comes back; staying gives nothing. The katana rack gives the katana,
 *   once and for good: it stays until he goes down.
 * - The rail rack fills the rail gun with RAIL_MAX ticks of lightning on arrival, as the gun's does.
 * - In hand is the weapon he wants (KEY.BLADE the katana, KEY.RAIL the rail gun, neither the gun)
 *   when he has it, else the first he has of the gun, the katana and the rail gun; the katana
 *   stays in hand for the length of a swing. `wield` is the katana in hand, `railed` the rail gun.
 * - The gun fires from its battery (`mag`), the rail gun from its capsule (`cap`). An empty one, or
 *   KEY.RELOAD with room in it, swaps it for a full one from what he carries: `reload` ticks
 *   without firing, then it holds the kit's `mag` (`cap`, `clip`) or what is left. A switch of weapon drops it.
 *   The racks fill both.
 * - The rail gun throws its bolt on every step FIRE is held, spending a tick of it (`zapping`),
 *   unless it is `hot`: its `heat` rises while it fires and falls when it does not (HEAT_MAX).
 * - The laser rifle (KEY.RIFLE, `rifled`), filled at its rack on arrival, fires a round from its
 *   cell (`clip`) each RIFLE_COOL ticks while FIRE is held (STRIKE.LASER). Its rack loads NADE_MAX
 *   grenades too: SPECIAL (G) launches one (STRIKE.NADE) when `lob` is 0, even during
 *   a swap of the cell, then `lob` runs NADE_COOL ticks and the rifle holds its fire NADE_HOLD.
 * - The trigger: `cool` and `swing` run down, and at 0 a held FIRE charges the gun, with ammo, and
 *   letting it go fires a ball as strong as the charge (powerOf()), spending as many shots; or it
 *   starts the katana's swing (`cut` from the keys), unless the hands are busy (a hang, a climb).
 *   The katana in hand, busy hands or no shot left drop the charge.
 *   With SPECIAL (a double click) the swing is the cut's special; its press within SPECIAL_LATE
 *   ticks of a cut's start turns that cut into it. The cut strikes `CUTS[cut].strike` ticks into
 *   its swing. The look is the input's, so both go where the player sees.
 * `armed` is false while the match is over: no weapon, no rack. `bodies` are move()'s.
 */
export const step = (
  p: PlayerState,
  i: Input,
  w: World,
  team: number,
  armed = true,
  bodies: readonly Body[] = [],
  kit: Kit = KITS[0],
): Strike => {
  const down = p.down > 0;
  const locked = !down && (p.lock ?? 0) > 0;
  move(p, down || locked ? { ...i, keys: 0 } : i, w, team, bodies, kit);
  // The rail gun cools on each step its bolt did not go out, slower while it is hot.
  p.heat = Math.max(0, (p.heat ?? 0) - (p.zapping ? 0 : p.hot ? 1 : HEAT_COOL));
  p.hot = !!p.hot && p.heat > HEAT_LOCK;
  p.zapping = false;
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
  // FIRE pressed now and not at the last step: the fists chain their blows on a press.
  const fresh = !!(i.keys & KEY.FIRE) && !p.pressed;
  p.pressed = !!(i.keys & KEY.FIRE);
  // The rack fills the gun on arrival, not on every step spent in its circle.
  const { rack, blade, rail, rifle } = w.def.teams[team];
  const inside = !!rack && within(p, rack, RACK_R);
  if (armed && inside && !p.rack) {
    [p.ammo, p.mag] = [kit.ammo, kit.mag];
  }
  p.rack = inside;
  p.blade = !!p.blade || (armed && !!blade && within(p, blade, RACK_R));
  const inRail = !!rail && within(p, rail, RACK_R);
  if (armed && inRail && !p.inRail) {
    [p.rail, p.cap] = [kit.rail, kit.cap];
  }
  p.inRail = inRail;
  const inRifle = !!rifle && within(p, rifle, RACK_R);
  if (armed && inRifle && !p.inRifle) {
    [p.rifle, p.clip, p.nades] = [kit.rifle, kit.clip, NADE_MAX];
  }
  p.inRifle = inRifle;
  // Never more than the class carries: a change of class keeps no marine's ammo on a ninja.
  p.ammo = Math.min(p.ammo, kit.ammo);
  p.rail = p.rail === undefined ? p.rail : Math.min(p.rail, kit.rail);
  p.rifle = p.rifle === undefined ? p.rifle : Math.min(p.rifle, kit.rifle);
  [p.mag, p.cap, p.clip] = [
    Math.min(p.mag ?? 0, kit.mag),
    Math.min(p.cap ?? 0, kit.cap),
    Math.min(p.clip ?? 0, kit.clip),
  ];
  p.cool = Math.max(0, p.cool - 1);
  p.lob = Math.max(0, (p.lob ?? 0) - 1);
  const busy = p.mode === MODE.HANG || p.mode === MODE.CLIMB;
  // The katana's swing runs down, but stays at the top of a cut's wind-up while FIRE is held there:
  // a charge. Let go after HEAVY_TAP, the rest of the cut is the heavy release, its own timer; busy
  // hands or the end of the match drop the charge and the cut goes on.
  const { ticks, hold } = CUTS[p.cut ?? 0];
  const top = !!p.swing && !p.heavy && ticks - (p.swing ?? 0) === hold;
  if (top && p.wield && armed && !busy && i.keys & KEY.FIRE) {
    p.charge = Math.min((p.charge ?? 0) + 1, HEAVY_MAX);
  } else if (top && armed && !busy && (p.charge ?? 0) >= HEAVY_TAP) {
    [p.heavy, p.charge] = [true, 0];
    p.swing = swingOf(p).ticks;
  } else {
    p.charge = top ? 0 : p.charge;
    // A hastier class runs the swing down faster, but stops on the tick of the wind-up's top and of
    // the strike (the cut's, or the punch's), so neither is skipped.
    const s = p.swing ?? 0;
    const c = swingOf(p);
    const blow = PUNCHES[p.cut ?? 0] ?? PUNCHES[0];
    const stop = (v: number) =>
      v == s - 1 &&
      (v == c.ticks - c.strike || v == blow.ticks - blow.strike || (!p.heavy && v == ticks - hold));
    p.swing = Math.max(0, kit.haste > 1 && stop(s - 1) ? s - 1 : s - kit.haste);
    p.heavy = !!p.swing && !!p.heavy;
  }
  // The battery holds no more than the player carries, and nothing without the gun: a shot never
  // spends more than he has.
  p.mag = Math.min(p.mag ?? 0, Math.max(p.ammo, 0));
  const has = [p.ammo >= 0, !!p.blade, (p.rail ?? -1) >= 0, (p.rifle ?? -1) >= 0];
  const want = i.keys & KEY.BLADE ? 1 : i.keys & KEY.RAIL ? 2 : i.keys & KEY.RIFLE ? 3 : 0;
  const hand = p.swing && p.blade ? 1 : has[want] ? want : has.indexOf(true);
  // A switch of weapon drops the swap under way.
  if (hand != (p.rifled ? 3 : p.railed ? 2 : +!!p.wield)) {
    p.reload = 0;
  }
  [p.wield, p.railed, p.rifled] = [hand == 1, hand == 2, hand == 3];
  // A punch under way ends when a weapon comes to hand.
  if (p.swing && hand >= 0 && !p.blade) {
    p.swing = 0;
  }
  if (!armed) {
    [p.charge, p.reload] = [0, 0];
    return STRIKE.NONE;
  }
  // The battery, the capsule or the cell of the gun in hand: swapped when empty or on KEY.RELOAD,
  // then full.
  const [key, size, carried, ticks2] =
    hand == 3
      ? (['clip', kit.clip, p.rifle!, RIFLE_RELOAD] as const)
      : hand == 2
        ? (['cap', kit.cap, p.rail!, RAIL_RELOAD] as const)
        : (['mag', kit.mag, p.ammo, GUN_RELOAD] as const);
  const [load, full] = [p[key] ?? 0, Math.min(size, carried)];
  if (p.reload) {
    if (!--p.reload) {
      p[key] = full;
    }
  } else if (hand != 1 && carried >= 0 && !busy && load < full && (!load || i.keys & KEY.RELOAD)) {
    [p.reload, p.charge] = [ticks2, 0];
  }
  // With no weapon at all the swing is a punch (PUNCHES, by its blow), not a cut.
  const bare = hand < 0;
  const c = bare ? (PUNCHES[p.cut ?? 0] ?? PUNCHES[0]) : swingOf(p);
  if (p.swing && c.ticks - p.swing === c.strike) {
    return STRIKE.CUT;
  }
  // The gun's charge goes with the katana in hand and not charging, the rail gun, the hands busy,
  // or no shot left.
  if ((p.wield && !top) || p.railed || p.rifled || busy || p.reload || (!p.wield && !p.mag)) {
    p.charge = 0;
  }
  // G with the rifle in hand (SPECIAL, with or without FIRE): a grenade from its launcher.
  if (p.rifled && i.keys & KEY.SPECIAL && !busy && p.nades && !p.lob) {
    p.nades--;
    [p.lob, p.cool] = [NADE_COOL, NADE_HOLD];
    p.shots = (p.shots + 1) & 255;
    return STRIKE.NADE;
  }
  if (i.keys & KEY.FIRE && !busy) {
    // A double click's second press turns a cut just started into its special.
    const late = CUTS[p.cut ?? 0].ticks - (p.swing ?? 0);
    const special =
      !!(i.keys & KEY.SPECIAL) &&
      (!p.swing || (!p.heavy && (p.cut ?? 0) < SPECIAL_CUT && late <= SPECIAL_LATE));
    if (bare) {
      // A punch, and the next when it is over while FIRE is held: a jab, or a lunge on the run. A
      // fresh press after the strike chains the next blow (BLOW).
      if (!p.swing) {
        const run =
          tackling(p) ||
          (p.mode === MODE.GROUND &&
            !!(i.keys & KEY.SPRINT) &&
            p.vx * p.vx + p.vz * p.vz > kit.run * kit.run);
        p.cut = run ? BLOW.LUNGE : BLOW.JAB;
        [p.heavy, p.swing] = [false, PUNCHES[p.cut].ticks];
      } else if (fresh && p.cut! < BLOW.HOOK && c.ticks - p.swing > c.strike) {
        p.cut!++;
        p.swing = PUNCHES[p.cut!].ticks;
      }
    } else if (p.wield && (!p.swing || special)) {
      p.cut = cutOf(i.keys) + (special ? SPECIAL_CUT : 0);
      [p.swing, p.charge] = [CUTS[p.cut].ticks, 0];
      launch(p);
    } else if (p.rifled) {
      if (!p.cool && p.clip && !p.reload) {
        p.rifle!--;
        p.clip--;
        p.cool = kit.rifleCool;
        p.shots = (p.shots + 1) & 255;
        return STRIKE.LASER;
      }
    } else if (p.railed) {
      if (p.cap && !p.reload && !p.hot) {
        // The bolt goes out every step; `cool` makes it spend a tick each RAIL_SPEND of them. It
        // heats the gun, which overheats at HEAT_MAX.
        p.heat = (p.heat ?? 0) + 1;
        p.hot = p.heat >= HEAT_MAX;
        if (!p.cool) {
          p.rail!--;
          p.cap--;
          p.cool = RAIL_SPEND;
        }
        p.zapping = true;
        return STRIKE.RAIL;
      }
    } else if (!p.wield && !p.cool && p.mag && !p.reload) {
      // Held, the gun charges; let go, it fires (below).
      p.charge = Math.min((p.charge ?? 0) + 1, CHARGE_TICKS);
    }
  } else if (p.charge) {
    // Let go: one ball as strong as the charge, spending as many shots.
    p.power = Math.min(powerOf(p.charge), p.mag!);
    p.charge = 0;
    p.ammo -= p.power;
    p.mag = p.mag! - p.power;
    p.shots = (p.shots + 1) & 255;
    p.cool = kit.cool;
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
