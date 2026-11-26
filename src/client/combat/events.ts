import { FALL_SAFE, GUN_RANGE } from '../../shared/constants';
import { swingOf } from '../../shared/blade';
import { blowing } from '../gait';
import type { PlayerState } from '../../shared/types';
import { ray } from '../../shared/world';
import type { World } from '../../shared/world';
import { basis } from '../mesh';
import type { Vec3 } from '../mesh';
import type { View, Blade } from './types';

/** The own muzzle in the world: the view's muzzle (camera space) from the camera. */
export const muzzleOf = (v: View): Vec3 => {
  const [r, u, f] = basis(v.yaw, v.drawn);
  const m = v.muzzle;
  return [0, 1, 2].map(i => v.cam[i] + r[i] * m[0] + u[i] * m[1] + f[i] * m[2]) as Vec3;
};

/**
 * Where the own shots end: the first wall along the look ray from the eye, or the range. `local` is
 * that point in the camera's space (right, up, forward), which is turned by the drawn pitch, so
 * that the gun can point at it.
 */
export const sight = (
  world: World,
  eye: Vec3,
  cam: Vec3,
  yaw: number,
  pitch: number,
  drawn: number,
): { end: Vec3; hit: boolean; local: Vec3 } => {
  const look = basis(yaw, pitch)[2];
  const d = ray(world, eye, look, GUN_RANGE);
  const end = [0, 1, 2].map(i => eye[i] + look[i] * d) as Vec3;
  return {
    end,
    hit: d < GUN_RANGE,
    local: basis(yaw, drawn).map(
      a => (end[0] - cam[0]) * a[0] + (end[1] - cam[1]) * a[1] + (end[2] - cam[2]) * a[2],
    ) as Vec3,
  };
};

/** Shots between two states of a player, a u8 counter that wraps. */
export const fired = (a?: PlayerState, b?: PlayerState): number =>
  a && b ? (b.shots - a.shots) & 255 : 0;

/**
 * The CUT of a swing that started between two states of a player, or -1: `swing` jumped up (it
 * only counts down), or the cut changed under a running one.
 */
export const swung = (a?: Blade, b?: Blade, xeno = false): number => {
  if (!a || !b || !(b.swing ?? 0)) {
    return -1;
  }
  // The xenomorph's tail whips at its release, not at the press that coils it (the user,
  // 2026-11-23: a first blow was heard before the charge): a tap let go strikes from the top.
  const coiled = (s: Blade) => !!s.charge && !s.heavy;
  if (xeno && coiled(b)) {
    return -1;
  }
  // Let go, tap or heavy: the heavy release (TAIL_FAST) is shorter than what was left of the
  // swing, so `swing` does not jump up there (the user, 2026-11-23: no sound at a full charge).
  if (xeno && coiled(a)) {
    return b.cut ?? 0;
  }
  return (b.swing ?? 0) > (a.swing ?? 0) || (b.cut ?? 0) != (a.cut ?? 0) ? (b.cut ?? 0) : -1;
};

/**
 * Whether the step from a to b is the strike of its cut: `swing` went down through the strike tick
 * (CUTS; the xenomorph's, `xeno`, TAILS).
 */
export const struck = (a?: Blade, b?: Blade, xeno = false): boolean => {
  // With no blade the swing is a punch.
  const { ticks, strike: at } = b && (!b.blade || b.fists) ? blowing(b, xeno) : swingOf(b ?? {});
  return !!a && !!b && (a.swing ?? 0) > ticks - at && (b.swing ?? 0) <= ticks - at;
};

/** The pitch of a player's voice: the woman's higher, and each a little off the next by his id. */
export const voiceOf = (id: number, body = 0): number =>
  (body ? 1.35 : 1) * (0.9 + 0.2 * ((id * 0.618) % 1));

/** Health and armour together: what a hit takes. */
export const life = (p: Pick<PlayerState, 'hp' | 'armor'>): number => p.hp + (p.armor ?? 0);

/**
 * A death worth a cry of pain rather than a groan (the user, 2026-11-17): a katana's cut that took
 * a limb, a fall hard enough to hurt (the speed a frame before the landing), or a hit of 3 or more
 * (a grenade, a charged shot). `was` is the life and vertical speed a frame before.
 */
export const dreadful = (was: { life: number; vy: number }, p: PlayerState): boolean =>
  (p.lost ?? 0) > 0 || was.vy < -0.9 * FALL_SAFE || was.life - life(p) >= 3;
