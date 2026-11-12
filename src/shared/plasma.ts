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
  NADE,
  NADE_COOL,
  NADE_HOLD,
  NADE_HP,
  NADE_R,
  NADE_RANGE,
  NADE_SPEED,
  PLASMA_R,
  PLASMA_SPEED,
  PLAYER_R,
  RIFLE_DRIFT,
  RIFLE_RANGE,
  TICK_HZ,
  BOLT,
  BOLT_SPEED,
} from './constants';
import { eyeHeight, gravity, heightOf } from './physics';
import type { Ball, PlayerState } from './types';
import { hidden, ray } from './world';
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
export const stepOf = (b: Ball): number =>
  b.arc ? ARC_STEP : b.power === BOLT ? BOLT_SPEED / TICK_HZ : PLASMA_STEP;

/**
 * Distance at which the ray from `o` along the unit `d` enters the upright cylinder of radius `r`
 * on `c`'s feet, `h` tall; Infinity on a miss.
 */
export const cylinder = (
  o: Vec3,
  d: Vec3,
  c: Pick<PlayerState, 'x' | 'y' | 'z'>,
  r: number,
  h: number,
): number => {
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

/**
 * The grenade `p` has just launched (`p` the state after that step): from the eye along the look,
 * with no drift, at NADE_SPEED, NADE_RANGE metres of flight to go. Named by his `shots` like a ball.
 */
export const lob = (p: PlayerState, team = 0): Flying => ({
  ...launch({ ...p, rifled: false }, team),
  left: NADE_RANGE,
  power: NADE,
  v: NADE_SPEED,
});

/**
 * Whether the shot `p` has just fired (a change of `shots`) was a grenade: the rifle holds its
 * fire NADE_HOLD ticks after one, so nothing else of his counts in them.
 */
export const lobbed = (p: PlayerState): boolean => !p.wield && (p.lob ?? 0) > NADE_COOL - NADE_HOLD;

/**
 * One tick of the grenade `b`: the map's gravity bends its flight, then it flies on as a ball
 * (fly()) and bursts on the first brush or foe, or at the end of its range. Float32, so the
 * shooter's client flies the same one.
 */
export const toss = (w: World, b: Flying, foes: PlayerState[]): PlayerState | undefined => {
  const f = Math.fround;
  const [vx, vy, vz] = [b.dx * b.v!, b.dy * b.v! - gravity(w) / TICK_HZ, b.dz * b.v!];
  const v = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
  [b.dx, b.dy, b.dz, b.v] = [f(vx / v), f(vy / v), f(vz / v), f(v)];
  const hit = fly(w, b, b.v / TICK_HZ, foes);
  [b.x, b.y, b.z, b.left] = [f(b.x), f(b.y), f(b.z), f(b.left)];
  b.burst ||= b.left <= 0;
  return hit;
};

/**
 * The health a grenade bursting at `c` takes from `p`: NADE_HP at the body, less with the distance
 * to its nearest point (the axis, feet to head), nothing from NADE_R on, rounded up. Nothing when
 * a brush hides both that point and the chest.
 */
export const blast = (w: World, c: Vec3, p: PlayerState): number => {
  const h = heightOf(p);
  const near: Vec3 = [p.x, Math.max(p.y, Math.min(p.y + h, c[1])), p.z];
  const [dx, dy, dz] = [near[0] - c[0], near[1] - c[1], near[2] - c[2]];
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  return d >= NADE_R || (hidden(w, c, near) && hidden(w, c, [p.x, p.y + 0.7 * h, p.z]))
    ? 0
    : Math.ceil(NADE_HP * (1 - d / NADE_R));
};
