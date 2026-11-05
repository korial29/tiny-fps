// Hitscan, shared by the host (on rewound targets) and the client (its own shots, predicted on the
// interpolated others). No DOM, no Node API.
import { EYE, PLAYER_H, PLAYER_R, RANGE, SPREAD } from './constants';
import { sectorAt } from './level';
import { TAU } from './physics';
import type { Body, Edge, Level, PlayerState, Shot } from './types';

type Vec3 = [number, number, number];

/** 32-bit integer hash (a xorshift-multiply round, twice). */
const hash = (n: number): number => {
  for (let k = 0; k < 2; k++) {
    n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  }
  return (n ^ (n >>> 16)) >>> 0;
};

/**
 * Unit direction of a shot: the view direction at yaw and pitch (yaw 0, pitch 0 is -z; pitch > 0
 * looks up), turned by at most SPREAD in a direction hashed from seq, so the host and the
 * shooter's client agree on it.
 */
export const aim = (yaw: number, pitch: number, seq: number): Vec3 => {
  const [sy, cy, sp, cp] = [Math.sin(yaw), Math.cos(yaw), Math.sin(pitch), Math.cos(pitch)];
  const h = hash(seq + 1);
  // Offset on the plane across the view: an angle from the low half of the hash, a share of
  // SPREAD from the high half.
  const a = ((h & 0xffff) / 0x10000) * TAU;
  const r = (h >>> 16) / 0xffff;
  const [x, y] = [Math.cos(a) * r * SPREAD, Math.sin(a) * r * SPREAD];
  // View, right (cy, 0, -sy) and up (sy·sp, cp, cy·sp) of the player.
  const d: Vec3 = [-sy * cp + cy * x + sy * sp * y, sp + cp * y, -cy * cp - sy * x + cy * sp * y];
  const n = Math.hypot(...d);
  return [d[0] / n, d[1] / n, d[2] / n];
};

/**
 * Distance along the ray from o (inside the map) in the unit direction d to the first wall, step
 * face, floor or ceiling, at most max.
 *
 * Walks the sectors: in the current convex one the ray leaves through the edge with the least
 * crossing distance among the edges it goes outward through, or ends earlier on the floor or the
 * ceiling. A solid edge, or a portal whose opening does not hold the crossing height, ends it.
 */
export const trace = (lvl: Level, o: Vec3, d: Vec3, max: number): number => {
  const { map, edges } = lvl;
  let s = Math.max(sectorAt(lvl, o[0], o[2]), 0);
  let t = 0;
  // A straight ray meets each convex sector once: more hops than sectors is a vertex graze.
  for (let hop = 0; hop <= map.sectors.length; hop++) {
    const { floor, ceil } = map.sectors[s];
    let exit = Infinity;
    let through: Edge | undefined;
    for (const e of edges) {
      if (e.front !== s) {
        continue;
      }
      const [ex, ez] = [e.bx - e.ax, e.bz - e.az];
      // Outward is where the cross product with the edge goes negative: inside is on its left.
      const out = d[2] * ex - d[0] * ez;
      if (out >= 0) {
        continue;
      }
      const x = Math.max(((o[2] - e.az) * ex - (o[0] - e.ax) * ez) / -out, t);
      // Collinear pieces of one wall share the crossing distance: only the piece holding the
      // crossing counts. At a vertex two pieces hold it: the solid one wins.
      const u =
        ((o[0] + x * d[0] - e.ax) * ex + (o[2] + x * d[2] - e.az) * ez) / (ex * ex + ez * ez);
      if (u > -1e-9 && u < 1 + 1e-9 && (x < exit - 1e-9 || (x < exit + 1e-9 && e.back < 0))) {
        [exit, through] = [x, e];
      }
    }
    const flat = d[1] < 0 ? (floor - o[1]) / d[1] : d[1] > 0 ? (ceil - o[1]) / d[1] : Infinity;
    if (flat <= exit || !through) {
      return Math.min(Math.max(flat, t), max);
    }
    if (exit >= max) {
      return max;
    }
    const y = o[1] + exit * d[1];
    const k = through.back < 0 ? undefined : map.sectors[through.back];
    if (!k || y < Math.max(floor, k.floor) || y > Math.min(ceil, k.ceil)) {
      return exit;
    }
    [s, t] = [through.back, exit];
  }
  return t;
};

/**
 * Distance at which the ray enters the upright cylinder of t (sides and caps), Infinity on a miss:
 * the span of the ray inside the infinite cylinder, cut to the span between the cap planes.
 */
export const hit = (o: Vec3, d: Vec3, t: Body): number => {
  const [px, pz] = [o[0] - t.x, o[2] - t.z];
  const a = d[0] * d[0] + d[2] * d[2];
  const b = px * d[0] + pz * d[2];
  const c = px * px + pz * pz - t.r * t.r;
  let [lo, hi] = [0, Infinity];
  if (a > 1e-12) {
    const q = b * b - a * c;
    if (q < 0) {
      return Infinity;
    }
    [lo, hi] = [Math.max(0, (-b - Math.sqrt(q)) / a), (-b + Math.sqrt(q)) / a];
  } else if (c > 0) {
    return Infinity;
  }
  const [y0, y1] = [t.y - o[1], t.y + t.h - o[1]];
  if (d[1]) {
    const [u, v] = [y0 / d[1], y1 / d[1]];
    lo = Math.max(lo, Math.min(u, v));
    hi = Math.min(hi, Math.max(u, v));
  } else if (y0 > 0 || y1 < 0) {
    return Infinity;
  }
  return lo <= hi ? lo : Infinity;
};

/** The body a shot sees of a player. */
export const body = ({ id, x, y, z }: PlayerState): Body => ({
  id,
  x,
  y,
  z,
  r: PLAYER_R,
  h: PLAYER_H,
});

/**
 * Resolves one shot of `shooter` (state after the step that fired) from its eye (feet + EYE)
 * along aim(yaw, pitch, seq): the nearest of the level (trace) and the upright cylinders
 * of `targets` (the other players' bodies) other than the shooter, within RANGE.
 */
export const fire = (lvl: Level, shooter: PlayerState, seq: number, targets: Body[]): Shot => {
  const o: Vec3 = [shooter.x, shooter.y + EYE, shooter.z];
  const d = aim(shooter.yaw, shooter.pitch, seq);
  let t = trace(lvl, o, d, RANGE);
  let id = -1;
  for (const p of targets) {
    const u = p.id === shooter.id ? Infinity : hit(o, d, p);
    if (u < t) {
      [t, id] = [u, p.id];
    }
  }
  return { id: shooter.id, x: o[0] + d[0] * t, y: o[1] + d[1] * t, z: o[2] + d[2] * t, hit: id };
};
