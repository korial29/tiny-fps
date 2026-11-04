// The lights of a frame: what shines where, gathered from the game state. No DOM, no GL; the
// renderer lights the scene with them (render.ts) and gives shadow maps to the first few.
import { EYE } from '../shared/constants';
import { sectorAt } from '../shared/level';
import type { Bullet, Level, PlayerState } from '../shared/types';
import { glow } from './effects';
import type { Effects } from './effects';
import { MUZZLE } from './gun';
import { basis } from './mesh';
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
  /** The monster bullets in flight, as drawn. */
  bullets: Bullet[];
  /** The level, with its live `barred` (the exit is open once it is not barred). */
  lvl: Level;
  /** Seconds, for pulsing lights. */
  t: number;
}

const WHITE: Vec3 = [1.2, 1.1, 0.9];
const FIRE: Vec3 = [3, 1.4, 0.4];
/** Half-angle cosines: a flashlight's 25 degrees, a muzzle flash's 60. */
const NARROW = Math.cos(0.436);
const WIDE = 0.5;
/** Others' flashlights that cast shadows, and bullets that glow. */
const SHADOWED = 2;
const BULLETS = 4;

const point = (p: Vec3, range: number, color: Vec3): Light => ({
  kind: LIGHT.POINT,
  p,
  d: [0, 0, 0],
  cone: 0,
  range,
  color,
  shadow: false,
});
const spot = (
  p: Vec3,
  d: Vec3,
  cone: number,
  range: number,
  color: Vec3,
  shadow = false,
): Light => ({
  ...point(p, range, color),
  kind: LIGHT.SPOT,
  d,
  cone,
  shadow,
});
/** o plus each axis scaled by its factor. */
const at = (o: Vec3, ...m: [Vec3, number][]) =>
  o.map((v, i) => v + m.reduce((s, [x, k]) => s + x[i] * k, 0)) as Vec3;
const scale = (c: Vec3, k: number) => c.map(v => v * k) as Vec3;

/** The lights of this frame, most important first. */
export const gather = ({ eye, yaw, pitch, dead, others, fx, bullets, lvl, t }: Scene): Light[] => {
  const [right, up, fwd] = basis(yaw, pitch);
  const head: Light[] = [];
  if (!dead) {
    head.push(spot(at(eye, [right, 0.2], [up, -0.2]), fwd, NARROW, 25, WHITE, true));
    // Where the own gun's barrels end (render.ts: its offset, scaled).
    if (fx.flash > 0) {
      head.push(
        spot(
          at(eye, [right, 0.26], [up, -0.24], [fwd, 0.6 + MUZZLE * 0.8]),
          fwd,
          WIDE,
          8,
          FIRE,
          true,
        ),
      );
    }
  }
  const near = (p: Vec3) => Math.hypot(p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]);
  const rest: Light[] = [];
  others
    .map(p => ({ p, e: [p.x, p.y + EYE, p.z] as Vec3 }))
    .sort((a, b) => near(a.e) - near(b.e))
    .forEach(({ p, e }, i) => {
      const [r, u, f] = basis(p.yaw, p.pitch);
      rest.push(spot(e, f, NARROW, 25, WHITE, i < SHADOWED));
      if (fx.flashes.has(p.id)) {
        rest.push(point(at([p.x, p.y + 1.25, p.z], [r, 0.36], [u, -0.12], [f, 0.8]), 6, FIRE));
      }
    });
  for (const b of fx.blasts) {
    const g = glow(b);
    if (g > 0) {
      rest.push(point(b.p, 6, scale(FIRE, g * 6)));
    }
  }
  if (fx.hurt > 0) {
    rest.push(point(eye, 4, scale([2, 0.15, 0.1], Math.min(1, fx.hurt * 10))));
  }
  bullets
    .map(b => point([b.x, b.y, b.z], 3, [1.2, 0.4, 0.15]))
    .sort((a, b) => near(a.p) - near(b.p))
    .slice(0, BULLETS)
    .forEach(l => rest.push(l));
  const { exit, goal } = lvl.map;
  if (exit !== undefined) {
    const pulse = 1 + 0.3 * Math.sin(t * 4);
    if (lvl.barred.has(exit)) {
      if (goal) {
        const floor = lvl.map.sectors[sectorAt(lvl, goal[0], goal[1])]?.floor ?? 0;
        rest.push(point([goal[0], floor + 1, goal[1]], 8, scale([0.2, 1.2, 1.5], pulse)));
      }
    } else {
      const { floor } = lvl.map.sectors[exit];
      for (const { ax, az, bx, bz, front, back } of lvl.edges) {
        if (front == exit && back >= 0) {
          // Sectors run counter-clockwise: the inside is to the left of an edge.
          const [dx, dz] = [bx - ax, bz - az];
          const k = 0.5 / Math.hypot(dx, dz);
          rest.push(
            point(
              [(ax + bx) / 2 - dz * k, floor + 1.2, (az + bz) / 2 + dx * k],
              8,
              scale([0.2, 1.5, 0.3], pulse),
            ),
          );
        }
      }
    }
  }
  return head.concat(rest.sort((a, b) => near(a.p) - near(b.p)).slice(0, MAX_LIGHTS - head.length));
};
