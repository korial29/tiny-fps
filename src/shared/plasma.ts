// Plasma balls (the user, 2026-11-06, Doom-like): a shot is a ball that leaves the eye along the
// look at PLASMA_SPEED and bursts on the first brush or enemy body it touches. The katana's ARC cut
// throws an arc of energy that flies the same way, slower, shorter and wider (wave()). The room
// keeps both and flies them each tick; the shooter's client flies its own the same way. No DOM, no
// Node API.
import {
  ARC_R,
  ARC_RANGE,
  ARC_SPEED,
  GUN_RANGE,
  PLASMA_R,
  PLASMA_SPEED,
  PLAYER_R,
  RIFLE_DRIFT,
  RIFLE_RANGE,
  TICK_HZ,
} from './constants';
import { eyeHeight, heightOf } from './physics';
import type { Ball, PlayerState } from './types';
import { ray } from './world';
import type { World } from './world';

type Vec3 = [number, number, number];

/** Metres a ball flies in a tick, and an arc. */
export const PLASMA_STEP = PLASMA_SPEED / TICK_HZ;
export const ARC_STEP = ARC_SPEED / TICK_HZ;
/** Ticks of the shooter's lag a new ball is flown at most on the host before its first tick. */
export const PLASMA_LAG = 12;

/** A ball the host flies: whose team fired it, and the metres it has left. */
export interface Flying extends Ball {
  team: number;
  left: number;
}

/** How far shot `n` of the laser rifle drifts off the look, yaw and pitch: a pattern within RIFLE_DRIFT, the same for the host and every client. */
export const drift = (n: number): [number, number] => [
  RIFLE_DRIFT * Math.sin(n * 2.4),
  RIFLE_DRIFT * Math.cos(n * 1.7),
];

/**
 * The ball of the shot `p` has just fired (`p` is the state after the step that fired): from the
 * eye of the mode along the look, GUN_RANGE metres to go, named by his `shots` count, as strong
 * as the shot (`power`). The laser rifle's (the user, 2026-11-08: the gun's balls, in red) has
 * power 0, RIFLE_RANGE to go, and leaves along the look drifted by its shot's pattern.
 */
export const launch = (p: PlayerState, team = 0): Flying => {
  const [dy, dp] = p.rifled ? drift(p.shots) : [0, 0];
  const [yaw, pitch] = [p.yaw + dy, p.pitch + dp];
  const [sy, cy, sp, cp] = [Math.sin(yaw), Math.cos(yaw), Math.sin(pitch), Math.cos(pitch)];
  return {
    id: p.shots,
    by: p.id,
    team,
    x: p.x,
    y: p.y + eyeHeight(p),
    z: p.z,
    dx: -sy * cp,
    dy: sp,
    dz: -cy * cp,
    left: p.rifled ? RIFLE_RANGE : GUN_RANGE,
    burst: false,
    power: p.rifled ? 0 : (p.power ?? 1),
  };
};

/**
 * The arc of energy the ARC cut of `p` throws at its strike (`p` the state after that step): from
 * the eye along the look like a ball, ARC_RANGE metres to go, its CUT in `arc`. Its id is the
 * `shots` count with the top bit turned, apart from his balls' (one arc is gone before the next).
 */
export const wave = (p: PlayerState, team = 0): Flying => ({
  ...launch(p, team),
  id: p.shots ^ 128,
  left: ARC_RANGE,
  power: 1,
  arc: p.cut,
});

/** Metres the flight `b` goes in a tick. */
export const stepOf = (b: Ball): number => (b.arc ? ARC_STEP : PLASMA_STEP);

/**
 * Distance at which the ray from `o` along the unit `d` enters the upright cylinder of radius `r`
 * on `c`'s feet, `h` tall; Infinity on a miss.
 */
export const cylinder = (o: Vec3, d: Vec3, c: PlayerState, r: number, h: number): number => {
  const [px, pz] = [o[0] - c.x, o[2] - c.z];
  const a = d[0] * d[0] + d[2] * d[2];
  const b = px * d[0] + pz * d[2];
  const q = b * b - a * (px * px + pz * pz - r * r);
  // Along the infinite cylinder, then cut to the heights of its caps. A vertical ray has a = 0.
  let [lo, hi] = [0, Infinity];
  if (a > 1e-12) {
    if (q < 0) {
      return Infinity;
    }
    [lo, hi] = [(-b - Math.sqrt(q)) / a, (-b + Math.sqrt(q)) / a];
  } else if (px * px + pz * pz > r * r) {
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
 * Flies `b` on by `m` metres (at most what it has left) as a sphere of PLASMA_R: it stops and
 * bursts on the first brush, or on the first of `foes` whose body (a cylinder PLASMA_R wider, ARC_R
 * for an arc) it enters. Returns the foe it burst on.
 */
export const fly = (
  w: World,
  b: Flying,
  m: number,
  foes: PlayerState[],
): PlayerState | undefined => {
  const o: Vec3 = [b.x, b.y, b.z];
  const d: Vec3 = [b.dx, b.dy, b.dz];
  const go = Math.min(m, b.left);
  let t = ray(w, o, d, go, PLASMA_R);
  let hit: PlayerState | undefined;
  for (const f of foes) {
    const u = cylinder(o, d, f, PLAYER_R + (b.arc ? ARC_R : PLASMA_R), heightOf(f));
    if (u < t) {
      [t, hit] = [u, f];
    }
  }
  b.burst = t < go;
  b.left -= t;
  [b.x, b.y, b.z] = [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
  return hit;
};
