// Hitscan, shared by the host (on rewound targets) and the client (its own shots, predicted on the
// interpolated others). No DOM, no Node API.
import type { Level, PlayerState, Shot } from './types';

type Vec3 = [number, number, number];

/**
 * Unit direction of a shot: the view direction at yaw and pitch (yaw 0, pitch 0 is -z; pitch > 0
 * looks up), turned by at most SPREAD in a direction hashed from seq, so the host and the
 * shooter's client agree on it.
 */
export const aim = (yaw: number, pitch: number, seq: number): Vec3 => {
  void yaw;
  void pitch;
  void seq;
  return [0, 0, -1];
};

/**
 * Distance along the ray from o (inside the map) in the unit direction d to the first wall, step
 * face, floor or ceiling, at most max.
 */
export const trace = (lvl: Level, o: Vec3, d: Vec3, max: number): number => {
  void lvl;
  void o;
  void d;
  return max;
};

/**
 * Resolves one shot of `shooter` (state after the step that fired) from its eye (feet + EYE)
 * along aim(yaw, pitch, seq): the nearest of the level (trace) and the upright cylinders
 * (PLAYER_R, PLAYER_H, from the feet) of `targets` other than the shooter, within RANGE.
 */
export const fire = (
  lvl: Level,
  shooter: PlayerState,
  seq: number,
  targets: PlayerState[],
): Shot => {
  void lvl;
  void seq;
  void targets;
  return { id: shooter.id, x: shooter.x, y: shooter.y, z: shooter.z, hit: -1 };
};
