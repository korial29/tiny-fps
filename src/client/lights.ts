// The extra lights of a frame, besides the sun and the sky (render.ts): daylight needs no
// flashlight, so only the glow of the bases and of a flag lying on the ground, in their team's
// colour. The list, its caps and its shadow slots stay for effects to come. No DOM, no GL.
import { NOBODY } from '../shared/types';
import type { PlayerState, Rover } from '../shared/types';
import { teamRgb } from './flag';
import type { CtfScene } from './flag';
import { basis } from './mesh';
import type { Vec3 } from './mesh';
import { headlights } from './rover';

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
  /** The bases and the flags in play: each base and each lying flag lights the roof around it. */
  ctf?: CtfScene;
}

/** Metres a base's glow and a lying flag's reach on the roof. */
const BASE_RANGE = 9;
const FLAG_RANGE = 6;

/** A rover's headlights: metres they reach, the cosine of the beam's half-angle, how far the beam dips under the nose (radians), and their colour. */
export const BEAM_RANGE = 45;
export const BEAM_CONE = 0.82;
export const BEAM_DIP = 0.12;
const BEAM: Vec3 = [2.6, 2.45, 2.1];

/**
 * The headlights of the rovers that have a driver: one beam a rover, from between its two lenses
 * along its nose, dipped to the ground ahead. One and not two: every pixel pays for every light.
 * They cast no shadow of their own (a shadow map is a pass over the whole map).
 */
export const beams = (rovers: Rover[] = []): Light[] =>
  rovers
    .filter(r => r.driver != NOBODY)
    .map(r => {
      const [a, b] = headlights(r);
      const [, u, f] = basis(r.yaw, r.pitch, r.roll);
      const [c, s] = [Math.cos(BEAM_DIP), Math.sin(BEAM_DIP)];
      return {
        kind: LIGHT.SPOT,
        p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
        d: f.map((v, i) => v * c - u[i] * s) as Vec3,
        cone: BEAM_CONE,
        range: BEAM_RANGE,
        color: BEAM,
        shadow: false,
      };
    });

/** The lights of this frame, most important first: the two bases, then the flags that lie on the ground. */
export const gather = (scene: Scene): Light[] => {
  const { ctf, t } = scene;
  if (!ctf) {
    return [];
  }
  const point = ([x, y, z]: Vec3, team: number, range: number, k: number): Light => ({
    kind: LIGHT.POINT,
    p: [x, y, z],
    d: [0, -1, 0],
    cone: 0,
    range,
    color: teamRgb(team).map(c => c * k) as Vec3,
    shadow: false,
  });
  return [
    // Over the ring, at the height of a hand: the pad glows and breathes with the ring.
    ...ctf.bases.map(([x, y, z], team) =>
      point([x, y + 1.2, z], team, BASE_RANGE, 1.1 + 0.3 * Math.sin(t * 3)),
    ),
    ...ctf.flags
      .filter(f => f.dropped)
      .map(f => point([f.at[0], f.at[1] + 0.8, f.at[2]], f.team, FLAG_RANGE, 0.9)),
  ];
};
