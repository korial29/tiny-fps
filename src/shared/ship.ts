// The moon's spaceship, shared by the host and the client's prediction: no DOM, no Node API.
// A combat ship on each landing pad, flown by one pilot with the arcade controls of docs/MOON.md
// (the look aims the nose, W and S thrust and brake, A and D slide, Space and C climb and sink,
// Shift boosts). It is a Rover with `ship` set: the same seats, snapshot slot, prediction and
// camera; rover.ts hands it to pilot() wherever it would drive() a rover. Like drive(), pilot() is
// deterministic for a given state and input: the state is float32 after every step.
//
// The flight has a limit: a ceiling CEIL metres over the crater's floor and an ellipse EDGE of the
// crater's bound. Inside WARN of either the climb or the way out fades; past it the ship is braked
// and pushed back, and the HUD warns (limits()).
import { TICK_HZ } from './constants';
import { floorAt, gravity, norm, shove } from './physics';
import { bound } from './relief';
import { KEY, NOBODY } from './types';
import type { Body } from './physics';
import type { Input, Rover } from './types';
import { near } from './world';
import type { Spawn, World } from './world';

/** The ship's sizes and its handling. Lengths in metres, rates per second. */
export const SHIP = {
  /** From the centre down to the skids' bottom, the hull's height from there, and the hull's half width. */
  DROP: 1.3,
  H: 2.6,
  R: 1.6,
  /** The hull against the brushes: circles of radius R this far along the nose. */
  BODY: [4.8, 0, -4.8],
  /** The hull as the shots meet it: spheres of radius HIT this far along the nose. */
  HITS: [4.5, 0, -4.5],
  HIT: 2.6,
  /** Thrust along the nose, sideways and straight up (m/s²), the boost's factor, and the top speed without it. */
  ACC: 24,
  STRAFE: 14,
  LIFT: 16,
  BOOST: 1.7,
  VMAX: 48,
  /** Drag with nobody at the stick (1/s), and the skids' friction on a floor. */
  DRIFT: 0.25,
  /** The dampers (1/s) with no key on an axis: the slide on the level stops, and so does the climb with no thrust. */
  HOLD: 1.5,
  HOVER: 3,
  SKID: 3,
  /** The nose turns toward the look: gain, the rates' caps (yaw, pitch) and how fast a rate follows. */
  TURN: 4,
  YRATE: 1.9,
  PRATE: 1.5,
  RESP: 8,
  /** The highest pitch, up or down, and the bank: per rad/s of yaw, per unit of slide, its cap and its response. */
  PMAX: 1.25,
  BANK: 0.4,
  SLIDE: 0.3,
  RMAX: 0.8,
  RRESP: 5,
  /** The ceiling's height (y), the crater's bound shrunk to EDGE, and the depth over which the warning grows. */
  CEIL: 120,
  EDGE: 0.88,
  WARN: 20,
  /** Past a limit: the push back (m/s² per metre past it) and the brake on the speed out (1/s). */
  PUSH: 3,
  BRAKE: 4,
  /** The hard stop past the limit, metres. */
  OVER: 12,
  /** A player this close to the centre (on the floor plane) and within this height gets in. */
  ENTER_R: 6,
  ENTER_H: 4,
  /** Armour, and the ticks a destroyed ship is gone before it is back on its pad. */
  HP: 60,
  WRECK: 600,
  /** The lasers: ticks between two salvos, the bolts' reach, and where the beams cross ahead along the look. */
  GUN_COOL: 6,
  GUN_RANGE: 160,
  GUN_AIM: 80,
  /** Missiles: how many a ship carries, the ticks between two, the ticks to load one more, and their speed (m/s, 63 at most on the wire). */
  MISSILES: 4,
  MISSILE_COOL: 30,
  RELOAD: 300,
  MISSILE_SPEED: 60,
  /** A missile's burst: the armour it takes at the hull, falling off to nothing this far from it. */
  BLAST_HP: 14,
  BLAST_R: 7,
  /** The armour a laser bolt or a rifle round takes, and a plasma ball per point of its power. */
  BOLT_HP: 1,
  BALL_HP: 2,
} as const;

/** The lasers' muzzles at the wing roots, the missiles' pods under the wings: right of the centre, above it, ahead of it. */
export const SHIP_GUNS = [
  [-2.6, -0.2, 2.2],
  [2.6, -0.2, 2.2],
];
export const PODS = [
  [-3.4, -0.7, 0.5],
  [3.4, -0.7, 0.5],
];
/** The pilot's seat in the cockpit: right of the centre, above it (the feet), ahead of it. */
export const COCKPIT = [0, -0.55, 2.4];
/** Where who gets out stands, beside the cockpit: clear of the hull, ahead of the wings. */
export const OUT = SHIP.R + 0.9;

type Vec3 = [x: number, y: number, z: number];

const DT = 1 / TICK_HZ;
const f32 = Math.fround;
const { sin, cos, min, max, abs, sqrt } = Math;
const clamp = (v: number, lo: number, hi: number): number => min(max(v, lo), hi);
const FLOATS = 'x y z vx vy vz yaw pitch roll wy wp wr steer'.split(' ') as Exclude<
  keyof Rover,
  'driver' | 'rider' | 'ship' | 'hp' | 'wreck' | 'nades'
>[];

/** The ship's axes in the world: right, up and the nose, pitched and banked (mesh.ts's basis()). */
export const axes = (r: Rover): [Vec3, Vec3, Vec3] => {
  const [sy, cy, sp, cp, sr, cr] = [r.yaw, r.pitch, r.roll].flatMap(a => [sin(a), cos(a)]);
  const R: Vec3 = [cy, 0, -sy];
  const U: Vec3 = [sy * sp, cp, cy * sp];
  return [
    [R[0] * cr - U[0] * sr, R[1] * cr - U[1] * sr, R[2] * cr - U[2] * sr],
    [U[0] * cr + R[0] * sr, U[1] * cr + R[1] * sr, U[2] * cr + R[2] * sr],
    [-sy * cp, sp, -cy * cp],
  ];
};

/** A point of the ship, `b` m right of the centre, `u` m above it and `a` m ahead of it. */
export const point = (r: Rover, b: number, u: number, a: number): Vec3 => {
  const [R, U, F] = axes(r);
  return [
    r.x + R[0] * b + U[0] * u + F[0] * a,
    r.y + R[1] * b + U[1] * u + F[1] * a,
    r.z + R[2] * b + U[2] * u + F[2] * a,
  ];
};

/** The map's ships at rest on their pads: full armour and missiles, nobody aboard. */
export const dock = (ships: readonly Spawn[] = []): Rover[] =>
  ships.map(([x, y, z, yaw]) => ({
    x: f32(x),
    y: f32(y + SHIP.DROP),
    z: f32(z),
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: f32(norm(yaw)),
    pitch: 0,
    roll: 0,
    wy: 0,
    wp: 0,
    wr: 0,
    steer: 0,
    driver: NOBODY,
    rider: NOBODY,
    ship: true,
    hp: SHIP.HP,
    wreck: 0,
    nades: SHIP.MISSILES,
  }));

/** A body that meets nothing: a ship that is gone. */
const NONE: Body = { a: [0, -1e4, 0], b: [0, -1e4, 0], r: 0, h: 0 };

/**
 * The hull as the players on foot and the rovers meet it: the stadium from the tail to the nose
 * along the floor plane, R wide, from the skids up H. A player walks into it and stands on it.
 */
export const shipHull = (r: Rover): Body => {
  if (r.wreck) {
    return NONE;
  }
  const [a, b] = [SHIP.BODY[0], SHIP.BODY[2]].map(k => point(r, 0, -SHIP.DROP, k));
  return { a, b, r: SHIP.R, h: SHIP.H };
};

/**
 * How near the ship is to its limits, each 0 inside and 1 at the limit (more past it): the ceiling
 * and the edge of the crater. For the HUD.
 */
export const limits = (r: Pick<Rover, 'x' | 'y' | 'z'>, w: World): [up: number, out: number] => {
  const up = (r.y - SHIP.CEIL + SHIP.WARN) / SHIP.WARN;
  const e = edge(r, w);
  return [max(0, up), e ? max(0, (e[0] - e[1] + SHIP.WARN) / SHIP.WARN) : 0];
};

/**
 * The ship against the crater's edge: its distance from the bound's centre and the edge's along the
 * same line, and the unit way out on the floor plane. Undefined on a map without a relief.
 */
const edge = (
  r: Pick<Rover, 'x' | 'z'>,
  w: World,
): [d: number, at: number, nx: number, nz: number] | undefined => {
  if (!w.relief) {
    return undefined;
  }
  const [cx, cz, a, b] = w.relief.bound;
  const [dx, dz] = [r.x - cx, r.z - cz];
  const d = sqrt(dx * dx + dz * dz);
  if (!d) {
    return [0, SHIP.EDGE * min(a, b), 1, 0];
  }
  const [ux, uz] = [dx / d, dz / d];
  // Where the line from the centre meets the shrunk ellipse.
  const at = SHIP.EDGE / sqrt((ux * ux) / (a * a) + (uz * uz) / (b * b));
  return [d, at, ux, uz];
};

/** The lowest bottom of a brush over the circle round (x, z) between y0 and y1, or y1. */
const roof = (w: World, x: number, z: number, y0: number, y1: number): number => {
  let top = y1;
  for (const i of near(w, x, z, SHIP.R)) {
    const { min: lo, max: hi } = w.def.brushes[i];
    if (
      x > lo[0] - SHIP.R &&
      x < hi[0] + SHIP.R &&
      z > lo[2] - SHIP.R &&
      z < hi[2] + SHIP.R &&
      lo[1] > y0 &&
      lo[1] < top
    ) {
      top = lo[1];
    }
  }
  return top;
};

/**
 * One step of 1 / TICK_HZ s, in place. `i` is the pilot's input as the wire rounds it, or
 * undefined with nobody at the stick: the engines are off and it falls under the map's gravity to
 * a floor. A ship that is gone (`wreck`) does not move. Returns whether it fell under the kill
 * floor: the caller docks it again.
 *
 * The nose turns toward the look as fast as the rates allow and banks into the turn; the thrust
 * is along the nose, sideways and straight up, against a drag that sets the top speed. Piloted,
 * the engines hold it against gravity: it hovers with no key held. On a floor it rests on its
 * skids, level.
 */
export const pilot = (r: Rover, i: Input | undefined, w: World): boolean => {
  if (r.wreck) {
    return false;
  }
  const keys = i ? i.keys : 0;
  const on = (k: number) => (keys & k ? 1 : 0);
  const thr = on(KEY.FORWARD) - on(KEY.BACK);
  const side = on(KEY.RIGHT) - on(KEY.LEFT);
  const lift = on(KEY.JUMP) - on(KEY.CROUCH);
  const boost = on(KEY.SPRINT) && thr > 0 ? SHIP.BOOST : 1;
  const landed = r.steer < 0;

  // The nose toward the look; on a floor it does not dip into it.
  if (i) {
    const ey = norm(i.yaw - r.yaw + Math.PI) - Math.PI;
    const tp = clamp(i.pitch, landed ? 0 : -SHIP.PMAX, SHIP.PMAX);
    const k = min(1, SHIP.RESP * DT);
    r.wy += (clamp(SHIP.TURN * ey, -SHIP.YRATE, SHIP.YRATE) - r.wy) * k;
    r.wp += (clamp(SHIP.TURN * (tp - r.pitch), -SHIP.PRATE, SHIP.PRATE) - r.wp) * k;
  } else {
    r.wy *= 1 - min(1, SHIP.RESP * DT);
    r.wp = landed ? -SHIP.TURN * r.pitch : r.wp * (1 - min(1, SHIP.RESP * DT));
  }
  const bank = landed ? 0 : clamp(-SHIP.BANK * r.wy + SHIP.SLIDE * side, -SHIP.RMAX, SHIP.RMAX);
  r.wr = (bank - r.roll) * SHIP.RRESP;

  // The forces: the thrust along the nose, the slide along the level right, the lift straight up.
  const [sy, cy, sp, cp] = [sin(r.yaw), cos(r.yaw), sin(r.pitch), cos(r.pitch)];
  const a: Vec3 = i
    ? [
        -sy * cp * thr * SHIP.ACC * boost + cy * side * SHIP.STRAFE,
        sp * thr * SHIP.ACC * boost + lift * SHIP.LIFT,
        -cy * cp * thr * SHIP.ACC * boost - sy * side * SHIP.STRAFE,
      ]
    : [0, -gravity(w), 0];

  // The limits: the climb fades under the ceiling and the way out near the edge; past them a push
  // back, and the speed out braked.
  const over = r.y - SHIP.CEIL;
  if (a[1] > 0) {
    a[1] *= clamp(-over / SHIP.WARN, 0, 1);
  }
  if (over > 0) {
    a[1] -= SHIP.PUSH * over;
    if (r.vy > 0) {
      r.vy *= 1 - min(1, SHIP.BRAKE * DT);
    }
  }
  const e = edge(r, w);
  if (e) {
    const [d, at, nx, nz] = e;
    const out = a[0] * nx + a[2] * nz;
    const past = d - at;
    if (out > 0) {
      const k = 1 - clamp(-past / SHIP.WARN, 0, 1);
      a[0] -= out * nx * k;
      a[2] -= out * nz * k;
    }
    if (past > 0) {
      a[0] -= SHIP.PUSH * past * nx;
      a[2] -= SHIP.PUSH * past * nz;
      const v = r.vx * nx + r.vz * nz;
      if (v > 0) {
        const k = v * min(1, SHIP.BRAKE * DT);
        r.vx -= k * nx;
        r.vz -= k * nz;
      }
    }
  }

  const drag = i ? SHIP.ACC / SHIP.VMAX : SHIP.DRIFT;
  const level = drag + (i && !thr && !side ? SHIP.HOLD : 0);
  const climb = drag + (i && !thr && !lift ? SHIP.HOVER : 0);
  r.vx += (a[0] - r.vx * level) * DT;
  r.vy += (a[1] - r.vy * climb) * DT;
  r.vz += (a[2] - r.vz * level) * DT;
  if (landed) {
    // The skids on the floor: what the thrust does not push slides out.
    const k = 1 - min(1, SHIP.SKID * DT);
    r.vx *= thr || side ? 1 : k;
    r.vz *= thr || side ? 1 : k;
  }

  r.x += r.vx * DT;
  r.y += r.vy * DT;
  r.z += r.vz * DT;
  r.yaw = norm(r.yaw + r.wy * DT);
  r.pitch = clamp(r.pitch + r.wp * DT, -SHIP.PMAX, SHIP.PMAX);
  r.roll += r.wr * DT;
  r.y = min(r.y, SHIP.CEIL + SHIP.OVER);
  if (e) {
    const [d, at, nx, nz] = edge(r, w)!;
    if (d > at + SHIP.OVER) {
      r.x -= nx * (d - at - SHIP.OVER);
      r.z -= nz * (d - at - SHIP.OVER);
    }
  }

  // The hull against the brushes and the ground: each circle along the nose stands on the highest
  // floor under it, stops under the lowest bottom over it, and is pushed out of the sides.
  let lifted = 0;
  for (const k of SHIP.BODY) {
    const [x, y, z] = point(r, 0, -SHIP.DROP, k);
    lifted = max(lifted, floorAt(w, x, z, y + 0.6) - y);
  }
  r.steer = 0;
  if (lifted > 0) {
    r.y += lifted;
    r.vy = max(r.vy, 0);
    // Landed: -1 until a step leaves the floor.
    r.steer = r.vy > 0.5 ? 0 : -1;
  }
  for (const k of SHIP.BODY) {
    const [x, y, z] = point(r, 0, -SHIP.DROP, k);
    const top = roof(w, x, z, y + 0.6, y + SHIP.H);
    if (top < y + SHIP.H) {
      r.y -= y + SHIP.H - top;
      r.vy = min(r.vy, 0);
    }
  }
  for (const k of SHIP.BODY) {
    const [x, y, z] = point(r, 0, -SHIP.DROP, k);
    const [px, pz] = shove({ x, y: y + 0.6, z }, w, SHIP.H - 0.6, SHIP.R);
    const d = px * px + pz * pz;
    if (d) {
      r.x += px;
      r.z += pz;
      const v = min(0, r.vx * px + r.vz * pz) / d;
      r.vx -= v * px;
      r.vz -= v * pz;
    }
  }
  bound(r, w);
  if (abs(r.roll) < 1e-6) {
    r.roll = 0;
  }
  for (const k of FLOATS) {
    r[k] = f32(r[k]);
  }
  return r.y < w.def.floor;
};

/**
 * Where a shot from `o` along the unit `d` meets the hull within `m` metres: the distance, or
 * Infinity. The hull is the HITS spheres; a ship that is gone has none.
 */
export const struck = (r: Rover, o: Vec3, d: Vec3, m: number): number => {
  if (r.wreck) {
    return Infinity;
  }
  let best = Infinity;
  for (const k of SHIP.HITS) {
    const c = point(r, 0, 0, k);
    const [px, py, pz] = [o[0] - c[0], o[1] - c[1], o[2] - c[2]];
    const b = px * d[0] + py * d[1] + pz * d[2];
    const q = px * px + py * py + pz * pz - SHIP.HIT * SHIP.HIT;
    const disc = b * b - q;
    if (disc < 0) {
      continue;
    }
    const t = max(0, -b - sqrt(disc));
    if (t <= m && t < best) {
      best = t;
    }
  }
  return best;
};

/** The distance from `c` to the nearest point of the hull's spheres, 0 inside. */
export const reach = (r: Rover, c: Vec3): number =>
  min(
    ...SHIP.HITS.map(k => {
      const [x, y, z] = point(r, 0, 0, k).map((v, n) => c[n] - v);
      return max(0, sqrt(x * x + y * y + z * z) - SHIP.HIT);
    }),
  );
