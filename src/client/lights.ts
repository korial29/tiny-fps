// The extra lights of a frame, besides the sun and the sky (render.ts): none for now, daylight
// needs no flashlight. The list, its caps and its shadow slots stay for effects to come. No DOM, no GL.
import type { PlayerState } from '../shared/types';
import type { Vec3 } from './mesh';

export const LIGHT = {
  /** A cone from p along d. */
  SPOT: 0,
  /** All around p. */
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
/** Shadow maps the renderer keeps for lights, one per shadowed SPOT: the sun has its own. */
export const MAX_SHADOWS = 4;

export interface Scene {
  /** The own eye (bob included) and look angles, as the camera has them. */
  eye: Vec3;
  yaw: number;
  pitch: number;
  /** The other players, interpolated. */
  others: PlayerState[];
  /** Seconds, for pulsing lights. */
  t: number;
}

/** The lights of this frame, most important first: none yet. */
export const gather = (scene: Scene): Light[] => {
  void scene;
  return [];
};
