// The gun: the trigger, shared by the host and the client's prediction, and the hitscan of a shot,
// which only the host runs. No DOM, no Node API.
//
// `step()` is move() plus the gun, one call per input on both sides, so the own ammo, cool and shots
// are predicted exactly. Health and the packs are the host's: they never feed back into movement.
// A player who is down is moved with no keys (`down` is in the snapshot), so the predictor replays
// a fall and a respawn the way the host plays them.
import { AMMO_MAX, GUN_COOLDOWN, GUN_RANGE, PICK_H, PLAYER_R, RACK_R } from './constants';
import { eyeHeight, heightOf, move, respawn } from './physics';
import { KEY, MODE } from './types';
import type { Input, PlayerState } from './types';
import { ray } from './world';
import type { World } from './world';

type Vec3 = [number, number, number];

/** Whether the feet of `p` are within `r` of the point `at` on the floor plane and within PICK_H of its height. */
export const within = (p: PlayerState, at: Vec3, r: number): boolean => {
  const [dx, dz] = [p.x - at[0], p.z - at[2]];
  return dx * dx + dz * dz < r * r && Math.abs(p.y - at[1]) < PICK_H;
};

/**
 * One input: the move, then the gun. Returns whether a shot went off, for the host to resolve it.
 * - Down: the keys are dropped, and when `down` runs out the player is back at a spawn.
 * - The team's rack gives the gun, and fills it again.
 * - The trigger: `cool` runs down, and at 0 a held FIRE with ammo fires, unless the hands are busy
 *   (a hang, a climb). The look is the input's, so the shot goes where the player sees.
 * `armed` is false while the match is over: no gun, no rack.
 */
export const step = (p: PlayerState, i: Input, w: World, team: number, armed = true): boolean => {
  const down = p.down > 0;
  move(p, down ? { ...i, keys: 0 } : i, w, team);
  if (down) {
    // A fall under the kill floor has already put him back, and cleared `down`.
    if (p.down > 0 && !--p.down) {
      respawn(p, w, team);
    }
    return false;
  }
  const rack = w.def.teams[team].rack;
  if (armed && rack && p.ammo < AMMO_MAX && within(p, rack, RACK_R)) {
    p.ammo = AMMO_MAX;
  }
  p.cool = Math.max(0, p.cool - 1);
  if (
    armed &&
    i.keys & KEY.FIRE &&
    !p.cool &&
    p.ammo > 0 &&
    p.mode !== MODE.HANG &&
    p.mode !== MODE.CLIMB
  ) {
    p.ammo--;
    p.shots = (p.shots + 1) & 255;
    p.cool = GUN_COOLDOWN;
    return true;
  }
  return false;
};

/** Distance at which the ray from `o` along the unit `d` enters the upright cylinder on `c`'s feet, `h` tall; Infinity on a miss. */
const cylinder = (o: Vec3, d: Vec3, c: PlayerState, h: number): number => {
  const [px, pz] = [o[0] - c.x, o[2] - c.z];
  const a = d[0] * d[0] + d[2] * d[2];
  const b = px * d[0] + pz * d[2];
  const q = b * b - a * (px * px + pz * pz - PLAYER_R * PLAYER_R);
  // Along the infinite cylinder, then cut to the heights of its caps. A vertical ray has a = 0.
  let [lo, hi] = [0, Infinity];
  if (a > 1e-12) {
    if (q < 0) {
      return Infinity;
    }
    [lo, hi] = [(-b - Math.sqrt(q)) / a, (-b + Math.sqrt(q)) / a];
  } else if (px * px + pz * pz > PLAYER_R * PLAYER_R) {
    return Infinity;
  }
  const [y0, y1] = [c.y - o[1], c.y + h - o[1]];
  if (d[1]) {
    [lo, hi] = [
      Math.max(lo, Math.min(y0 / d[1], y1 / d[1])),
      Math.min(hi, Math.max(y0 / d[1], y1 / d[1])),
    ];
  } else if (y0 > 0 || y1 < 0) {
    return Infinity;
  }
  return lo <= hi && hi >= 0 ? Math.max(lo, 0) : Infinity;
};

/**
 * The first of `foes` (the players he may hit, as he saw them) that the laser of `p` meets: from his
 * eye along his look, at most GUN_RANGE and not through a brush. `p` is the state after the input
 * that fired.
 */
export const shoot = (w: World, p: PlayerState, foes: PlayerState[]): PlayerState | undefined => {
  const o: Vec3 = [p.x, p.y + eyeHeight(p), p.z];
  const [sy, cy, sp, cp] = [Math.sin(p.yaw), Math.cos(p.yaw), Math.sin(p.pitch), Math.cos(p.pitch)];
  const d: Vec3 = [-sy * cp, sp, -cy * cp];
  let t = ray(w, o, d, GUN_RANGE);
  let hit: PlayerState | undefined;
  for (const f of foes) {
    const u = cylinder(o, d, f, heightOf(f));
    if (u < t) {
      [t, hit] = [u, f];
    }
  }
  return hit;
};
