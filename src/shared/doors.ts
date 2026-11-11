// The automatic doors (the user, 2026-11-11): two panels that slide apart into the wall when
// someone comes near, and shut behind him. The host moves them (Room.tick) and sends how far each
// is open; a body never meets one, a shot and the eye stop at one less than half open (ray() in
// world.ts). No DOM, no Node API.
import { TICK_HZ } from './constants';
import type { Door, World } from './world';

type Vec3 = [number, number, number];

export const DOOR = {
  /**
   * Metres from the doorway within which a player on foot opens it, and a driven rover. A dash
   * from 7 m is there in 0.65 s (2.7 m of burst at 16 m/s, the rest at a sprint's 9), a rover at
   * its 23.2 m/s from 14 m in 0.6 s: the door has been open 0.3 s and 0.25 s by then.
   */
  R: 7,
  ROVER_R: 14,
  /** Ticks it takes to open (0.35 s) and to shut (0.5 s). */
  OPEN: 21,
  SHUT: 30,
  /** Ticks it stays open after the last one has left: a second. */
  HOLD: TICK_HZ,
};

/** How far `p` is from the doorway on the floor plane, Infinity when its feet are not at its height. */
const off = ({ min, max }: Door, [x, y, z]: Vec3) =>
  y < min[1] - 1 || y >= max[1]
    ? Infinity
    : Math.sqrt(
        (x - Math.min(Math.max(x, min[0]), max[0])) ** 2 +
          (z - Math.min(Math.max(z, min[2]), max[2])) ** 2,
      );

/**
 * One tick of the doors of `w`: each opens while one of `feet` (the players who are up) is within
 * DOOR.R of it or one of `rovers` (the driven ones) within DOOR.ROVER_R, stays open DOOR.HOLD ticks
 * after the last, then shuts.
 */
export const swing = (w: World, feet: Vec3[], rovers: Vec3[] = []): void =>
  w.doors?.forEach((s, i) => {
    const d = w.def.doors![i];
    const near = feet.some(p => off(d, p) < DOOR.R) || rovers.some(p => off(d, p) < DOOR.ROVER_R);
    // In whole steps of 1 / (OPEN x SHUT), so it ends at 0 and at 1 exactly.
    const all = DOOR.OPEN * DOOR.SHUT;
    const at = Math.round(s.open * all) + (near || s.wait ? DOOR.SHUT : -DOOR.OPEN);
    s.open = Math.min(all, Math.max(0, at)) / all;
    s.wait = near ? DOOR.HOLD : Math.max(0, s.wait - 1);
  });

/** Every door shut: a new match. */
export const shut = (w: World): void =>
  w.doors?.forEach(s => {
    s.open = s.wait = 0;
  });
