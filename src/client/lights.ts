// The lights of a frame: what shines where, gathered from the game state. No DOM, no GL; the
// renderer lights the scene with them (render.ts) and gives shadow maps to the first few.
import { EYE } from '../shared/constants';
import { TEX } from '../shared/types';
import type { Level, PlayerState } from '../shared/types';
import type { Effects } from './effects';
import { basis } from './mesh';
import type { Vec3 } from './mesh';

export const LIGHT = {
  /** A cone from p along d: flashlights. */
  SPOT: 0,
  /** All around p: the red flash of a hit, the lava. */
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
  /** The level, for its lava. */
  lvl: Level;
  /** Seconds, for pulsing lights. */
  t: number;
}

const WHITE: Vec3 = [1.2, 1.1, 0.9];
/** Half-angle cosine of a flashlight's cone: 25 degrees. */
const NARROW = Math.cos(0.436);
/** Others' flashlights that cast shadows. */
const SHADOWED = 2;

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

/** Lava lights kept per frame: a carpet of lava sectors would otherwise crowd out everything else. */
const LAVA = 4;
/** The lava sector's light: its centre, two metres above the floor, and how far it reaches. */
interface Pool {
  p: Vec3;
  range: number;
}
const pools = new WeakMap<Level, Pool[]>();
/** The lava sectors of a level, derived once per Level object: they never change. */
export const lava = (lvl: Level): Pool[] => {
  let found = pools.get(lvl);
  if (!found) {
    found = lvl.map.sectors
      .filter(s => s.ft == TEX.LAVA)
      .map(({ pts, floor }) => {
        const [xs, zs] = [0, 1].map(i => pts.map(p => p[i]));
        const [w, d] = [Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)];
        return {
          p: [
            (Math.max(...xs) + Math.min(...xs)) / 2,
            floor + 2,
            (Math.max(...zs) + Math.min(...zs)) / 2,
          ],
          range: 4 + Math.sqrt(w * d) * 0.6,
        };
      });
    pools.set(lvl, found);
  }
  return found;
};
/** A lava light's colour at time t: a slow breath and a fast flicker, out of step from pool to pool. */
const ember = (p: Vec3, t: number): Vec3 => {
  const k = p[0] + p[2];
  return scale(
    [1.4, 0.45, 0.12],
    1 + 0.18 * Math.sin(t * 1.3 + k) + 0.1 * Math.sin(t * 11 + k * 3) + 0.06 * Math.sin(t * 23 + k),
  );
};

/** The lights of this frame, most important first. */
export const gather = ({ eye, yaw, pitch, dead, others, fx, lvl, t }: Scene): Light[] => {
  const [right, up, fwd] = basis(yaw, pitch);
  const head: Light[] = [];
  if (!dead) {
    head.push(spot(at(eye, [right, 0.2], [up, -0.2]), fwd, NARROW, 25, WHITE, true));
  }
  const near = (p: Vec3) => Math.hypot(p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]);
  const rest: Light[] = [];
  others
    .map(p => ({ p, e: [p.x, p.y + EYE, p.z] as Vec3 }))
    .sort((a, b) => near(a.e) - near(b.e))
    .forEach(({ p, e }, i) => {
      const f = basis(p.yaw, p.pitch)[2];
      // Ahead of the head box, or its own head would shadow the whole beam.
      rest.push(spot(at(e, [f, 0.35]), f, NARROW, 25, WHITE, i < SHADOWED));
    });
  if (fx.hurt > 0) {
    rest.push(point(eye, 4, scale([2, 0.15, 0.1], Math.min(1, fx.hurt * 10))));
  }
  lava(lvl)
    .filter(l => near(l.p) < l.range * 2)
    .map(({ p, range }) => point(p, range, ember(p, t)))
    .sort((a, b) => near(a.p) - near(b.p))
    .slice(0, LAVA)
    .forEach(l => rest.push(l));
  return head.concat(rest.sort((a, b) => near(a.p) - near(b.p)).slice(0, MAX_LIGHTS - head.length));
};
