// The lights of a frame: what shines where, gathered from the game state. No DOM, no GL; the
// renderer lights the scene with them (render.ts) and gives shadow maps to the first few.
import type { Level, PlayerState } from '../shared/types';
import type { Effects } from './effects';
import type { Vec3 } from './mesh';

export const LIGHT = {
  /** A cone from p along d: flashlights, muzzle flashes. */
  SPOT: 0,
  /** All around p: explosions, bursts, the exit, the goal. */
  POINT: 1,
} as const;

export interface Light {
  /** LIGHT kind. */
  kind: number;
  p: Vec3;
  /** SPOT: unit direction of the cone's axis. Ignored for a POINT. */
  d: Vec3;
  /** SPOT: cosine of the cone's half-angle. Ignored for a POINT. */
  cone: number;
  /** Metres at which it has faded to nothing. */
  range: number;
  /** Linear RGB; above 1 for a bright flash. */
  color: Vec3;
  /** Casts shadows. Only SPOT lights do; the first MAX_SHADOWS of them in the list get a map. */
  shadow: boolean;
}

/** Lights the renderer takes at most, in list order: put the important ones first. */
export const MAX_LIGHTS = 16;
/** Shadow maps the renderer keeps, one per shadowed SPOT. */
export const MAX_SHADOWS = 4;

export interface Scene {
  /** The own eye (bob included) and look angles, as the camera has them. */
  eye: Vec3;
  yaw: number;
  pitch: number;
  /** The own player is dead: no flashlight. */
  dead: boolean;
  /** The living other players, interpolated. */
  others: PlayerState[];
  fx: Effects;
  /** The level, with its live `barred` (the exit is open once it is not barred). */
  lvl: Level;
  /** Seconds, for pulsing lights. */
  t: number;
}

/** The lights of this frame, most important first. */
export const gather = (scene: Scene): Light[] => {
  void scene;
  return [];
};
