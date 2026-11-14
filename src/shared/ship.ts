// The moon's spaceship, shared by the host and the client's prediction: no DOM, no Node API.
// A combat ship on each landing pad, flown by one pilot with the arcade controls of docs/MOON.md
// (the look aims the nose, W and S thrust and brake, A and D slide, Space and C climb and sink,
// Shift boosts). It is a Rover with `ship` set: the same seats, snapshot slot, prediction and
// camera; rover.ts hands it to pilot() wherever it would drive() a rover. Like drive(), pilot() is
// deterministic for a given state and input: the state is float32 after every step.
//
// The flight has a limit: a ceiling CEIL metres over the crater's floor and an ellipse EDGE of the
// crater's bound. Inside WARN of either the climb or the way out fades; past it the ship is braked
// and pushed back, and the HUD warns (limits()). Past the world's seam (ORBIT.SEAM) the ship is in
// space, up to the ceiling at ORBIT.TOP: altitude() is how high that is drawn.
import { ORBIT, TICK_HZ, VEHICLE } from './constants';
import { floorAt, gapTo, gravity, norm, shove } from './physics';
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
  /** The ceiling's height (y): the top of space; the crater's bound shrunk to EDGE, and the depth over which the warning grows. */
  CEIL: ORBIT.TOP,
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
  /** The lasers: ticks between two salvos, the bolts' reach, and where the beams cross ahead along the look. */
  GUN_COOL: 6,
  GUN_RANGE: 160,
  GUN_AIM: 80,
  /** Missiles: how many a ship carries, the ticks between two, the ticks to load one more, and their speed (m/s, 63 at most on the wire). */
  MISSILES: 4,
  MISSILE_COOL: 30,
  RELOAD: 300,
  MISSILE_SPEED: 60,
  /**
   * A crash (the user, 2026-11-12): the speed a step's collisions take away (m/s, the vertical
   * part halved, so a sink onto a pad is no crash) past CRASH costs 1 hp each CRASH_HP more.
   */
  CRASH: 12,
  CRASH_HP: 4,
  /** How much of the speed into another vehicle comes back off it. */
  BOUNCE: 0.3,
} as const;

/** The lasers' muzzles under the wings, the missiles' pods under the wings: right of the centre, above it, ahead of it. */
export const SHIP_GUNS = [
  [-2.6, -0.2, -0.9],
  [2.6, -0.2, -0.9],
];
export const PODS = [
  [-3.4, -0.7, -2.9],
  [3.4, -0.7, -2.9],
];
/**
 * A wing's sections, at the hull, at the cannon and at the tip: right, the leading and the trailing
 * edge ahead, the top and the bottom. craft.ts draws them; the shots, the players on foot, the
 * other vehicles and the brushes meet them (the user, 2026-11-12: the wings went through all).
 */
export const WING = [
  [0.9, -2.7, -5.3, 0.14, -0.12],
  [2.6, -2.6, -5.5, 0.12, -0.1],
  [6.4, -4.9, -6.1, -0.7, -0.78],
];
/** The right wing's section `x` metres right of the centre, between two of WING's. */
const section = (x: number): number[] => {
  const k = x < WING[1][0] ? 0 : 1;
  const [a, b] = [WING[k], WING[k + 1]];
  const t = (x - a[0]) / (b[0] - a[0]);
  return a.map((v, n) => v + (b[n] - v) * t);
};
/**
 * The right wing as the shots meet it: boxes in the ship's frame along the span, each round its
 * slice of the wing with a margin of PAD: [right, up, ahead] each from, to.
 */
const PAD = 0.1;
export const WING_BOXES: [number, number][][] = [0.9, 2.6, 3.9, 5.15, 6.4]
  .slice(1)
  .map((x1, k, xs) => {
    const x0 = k ? xs[k - 1] : 0.9;
    const [s0, s1] = [section(x0), section(x1)];
    return [
      [x0, x1 + PAD],
      [Math.min(s0[4], s1[4]) - PAD, Math.max(s0[3], s1[3]) + PAD],
      [Math.min(s0[2], s1[2]) - PAD, Math.max(s0[1], s1[1]) + PAD],
    ];
  });
/**
 * The right wing as the players on foot and the other vehicles meet it: stadiums from the root to
 * near the tip along the middle of the chord ([from, to, radius]), WING_H thick over its bottom.
 */
const WING_BODY = [
  [1.4, 3.2, 1.1],
  [3.2, 5.8, 0.75],
];
const WING_H = 0.4;
/** The wing tips against the brushes: a circle this wide, this far right of the centre. */
const TIP = { X: 5.6, R: 0.8 };
/** Where the wings' undersides meet the floor: right of the centre, and the trailing edge (-1), the middle of the chord (0) or the leading edge (1). */
const TOUCH = [
  [3.2, 0],
  [4.8, 0],
  [6.4, -1],
  [6.4, 1],
];

/** The pilot's seat in the cockpit, behind the long nose: right of the centre, above it (the feet), ahead of it. */
export const COCKPIT = [0, 0.05, -0.2];
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

/** The map's ships at rest on their pads: whole, full of missiles, nobody aboard. */
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
    hp: VEHICLE.HP,
    wreck: 0,
    nades: SHIP.MISSILES,
  }));

/**
 * The hull as the players on foot and the rovers meet it: the stadium from the tail to the nose
 * along the floor plane, R wide, from the skids up H. A player walks into it and stands on it.
 */
export const shipHull = (r: Rover): Body => {
  const [a, b] = [SHIP.BODY[0], SHIP.BODY[2]].map(k => point(r, 0, -SHIP.DROP, k));
  return { a, b, r: SHIP.R, h: SHIP.H };
};

/** The wings as solids (WING_BODY), the left one then the right one. */
export const wings = (r: Rover): Body[] =>
  [-1, 1].flatMap(s =>
    WING_BODY.map(([x0, x1, rad]) => {
      const [a, b] = [x0, x1].map(x => {
        const [, le, te, , low] = section(x);
        return point(r, s * x, low - 0.05, (le + te) / 2);
      });
      return { a, b, r: rad, h: WING_H };
    }),
  );

/** Every solid of the ship: its hull, then its wings. */
export const shipBodies = (r: Rover): Body[] => [shipHull(r), ...wings(r)];

/**
 * The height `y` as it is drawn and shown: itself up to the seam, then growing as a power of the
 * height over it, to ORBIT.ALT at ORBIT.TOP. Space is small to fly through and looks high.
 */
export const altitude = (y: number): number =>
  y <= ORBIT.SEAM
    ? y
    : ORBIT.SEAM *
      (ORBIT.ALT / ORBIT.SEAM) **
        (Math.min(y - ORBIT.SEAM, ORBIT.TOP - ORBIT.SEAM) / (ORBIT.TOP - ORBIT.SEAM));

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
 * a floor, a wreck as well. Returns whether it fell under the kill floor: the caller docks it
 * again.
 *
 * The nose turns toward the look as fast as the rates allow and banks into the turn; the thrust
 * is along the nose, sideways and straight up, against a drag that sets the top speed. Piloted,
 * the engines hold it against gravity: it hovers with no key held. On a floor it rests on its
 * skids, level.
 */
export const pilot = (
  r: Rover,
  i: Input | undefined,
  w: World,
  others: readonly Body[] = [],
  crash?: (jolt: number) => void,
): boolean => {
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

  // What the collisions take from the speed is the crash's jolt.
  const v0 = [r.vx, r.vy, r.vz];
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
  // The wings on the floor (the user, 2026-11-12: banked low, a tip went into the ground): the
  // undersides at TOUCH lift the ship over the highest floor under them. No landing: it flies on.
  let scraped = 0;
  for (const s of [-1, 1]) {
    for (const [x, edge] of TOUCH) {
      const [, le, te, , low] = section(x);
      const [px, py, pz] = point(r, s * x, low, edge < 0 ? te : edge > 0 ? le : (le + te) / 2);
      scraped = max(scraped, floorAt(w, px, pz, py + 1) - py);
    }
  }
  if (scraped > 0) {
    r.y += scraped;
    r.vy = max(r.vy, 0);
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
  // The wing tips against the brushes' sides, as the hull's circles.
  for (const s of [-1, 1]) {
    const [, le, te, , low] = section(TIP.X);
    const [x, y, z] = point(r, s * TIP.X, low, (le + te) / 2);
    const [px, pz] = shove({ x, y, z }, w, WING_H, TIP.R);
    const d = px * px + pz * pz;
    if (d) {
      r.x += px;
      r.z += pz;
      const v = min(0, r.vx * px + r.vz * pz) / d;
      r.vx -= v * px;
      r.vz -= v * pz;
    }
  }
  // The other vehicles: the hull's circles and the wing tips against their bodies; on their axis,
  // out by their right. Like a rover, a ship never pushes another: it stops on it, BOUNCE of its
  // speed into it sent back.
  if (others.length) {
    const [, le, te, , low] = section(TIP.X);
    const mine: [number, number, number, number, number][] = [
      ...SHIP.BODY.map((k): [number, number, number, number, number] => [
        0,
        -SHIP.DROP,
        k,
        SHIP.R,
        SHIP.H,
      ]),
      [-TIP.X, low, (le + te) / 2, TIP.R, WING_H],
      [TIP.X, low, (le + te) / 2, TIP.R, WING_H],
    ];
    for (const o of others) {
      for (const [b, u, k, rad, h] of mine) {
        const [x, y, z] = point(r, b, u, k);
        const [dx, dz, oy] = gapTo(o, x, z);
        const reach = rad + o.r;
        const d = sqrt(dx * dx + dz * dz);
        if (d >= reach - 1e-4 || oy >= y + h || oy + o.h <= y) {
          continue;
        }
        const [nx, nz] = d ? [dx / d, dz / d] : [cos(r.yaw), -sin(r.yaw)];
        r.x += nx * (reach - d);
        r.z += nz * (reach - d);
        const v = min(0, r.vx * nx + r.vz * nz) * (1 + SHIP.BOUNCE);
        r.vx -= v * nx;
        r.vz -= v * nz;
      }
    }
  }
  bound(r, w);
  const jolt = sqrt((r.vx - v0[0]) ** 2 + ((r.vy - v0[1]) / 2) ** 2 + (r.vz - v0[2]) ** 2);
  if (crash && jolt > SHIP.CRASH) {
    crash(jolt);
  }
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
 * Infinity. The hull is the HITS spheres.
 */
export const struck = (r: Rover, o: Vec3, d: Vec3, m: number): number => {
  let best = wingStruck(r, o, d);
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
  return best <= m ? best : Infinity;
};

/** `v` in the ship's frame: right, up and ahead of its centre (`at`), or along its axes. */
const frame = (r: Rover, v: Vec3, at = true): Vec3 => {
  const q = at ? [v[0] - r.x, v[1] - r.y, v[2] - r.z] : v;
  return axes(r).map(e => e[0] * q[0] + e[1] * q[1] + e[2] * q[2]) as Vec3;
};
/** The boxes of both wings, each [right, up, ahead] from, to. */
const BOXES = [-1, 1].flatMap(s =>
  WING_BOXES.map(([x, y, a]) => [s > 0 ? x : [-x[1], -x[0]], y, a]),
);

/** Where a shot from `o` along the unit `d` first enters a wing: the distance, or Infinity. */
const wingStruck = (r: Rover, o: Vec3, d: Vec3): number => {
  const [lo, ld] = [frame(r, o), frame(r, d, false)];
  let best = Infinity;
  for (const box of BOXES) {
    let [t0, t1] = [0, Infinity];
    for (let n = 0; n < 3 && t0 <= t1; n++) {
      const [from, to] = box[n];
      if (abs(ld[n]) < 1e-9) {
        if (lo[n] < from || lo[n] > to) {
          t0 = Infinity;
        }
        continue;
      }
      const [a, b] = [(from - lo[n]) / ld[n], (to - lo[n]) / ld[n]];
      t0 = max(t0, min(a, b));
      t1 = min(t1, max(a, b));
    }
    if (t0 <= t1 && t0 < best) {
      best = t0;
    }
  }
  return best;
};

/** The distance from `c` to the nearest point of the hull's spheres and the wings, 0 inside. */
export const reach = (r: Rover, c: Vec3): number => {
  const l = frame(r, c);
  return min(
    ...SHIP.HITS.map(k => {
      const [x, y, z] = point(r, 0, 0, k).map((v, n) => c[n] - v);
      return max(0, sqrt(x * x + y * y + z * z) - SHIP.HIT);
    }),
    ...BOXES.map(box =>
      sqrt(box.reduce((s, [from, to], n) => s + max(0, from - l[n], l[n] - to) ** 2, 0)),
    ),
  );
};
