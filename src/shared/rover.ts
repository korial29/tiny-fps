// The moon's rover, shared by the host and the client's prediction: no DOM, no Node API.
// A body on four sprung wheels, driven by the keys and the look of the player at its wheel. Like
// move(), drive() is deterministic for a given state and input: the state is float32, so the
// driver's replay of unacked inputs lands where the host does.
//
// One clock a rover: the driver's inputs (ride(), on arrival at the host and in the predictor), or
// the host's tick while nobody drives. Nothing but drive() moves a driven rover, or the replay is
// no longer exact: no rover pushes another, no player pushes one. They are solid all the same: a
// rover stops on another as on a wall (drive()'s fleet), and a player on foot walks into its body
// and stands on it (hull(), move()'s bodies). A driver who hits a parked rover or a player is
// replayed exactly; one whose obstacle moves meanwhile is corrected by the next snapshot.
import {
  BOLT,
  DASH_COOLDOWN,
  DASH_TICKS,
  NADE,
  PLAYER_H,
  PLAYER_R,
  TICK_HZ,
  VEHICLE,
} from './constants';
import { step } from './gun';
import { floorAt, forward, gapTo, gravity, heightOf, norm, shove } from './physics';
import type { Body } from './physics';
import { cylinder } from './plasma';
import { bound } from './relief';
import {
  COCKPIT,
  OUT as SHIP_OUT,
  PODS,
  SHIP,
  SHIP_GUNS,
  dock,
  pilot,
  point,
  reach as shipReach,
  shipBodies,
  shipHull,
  struck as shipStruck,
} from './ship';
import { KEY, MODE, NOBODY } from './types';
import type { Flying } from './plasma';
import type { Input, PlayerState, Rover } from './types';
import { hidden } from './world';
import type { World } from './world';

/** The rover's sizes and its handling (docs/MOON.md). Lengths in metres, per wheel rates for a body of mass 1. */
export const ROVER = {
  /** Half the wheelbase, half the track, the wheel's radius. */
  A: 1.25,
  B: 1.0,
  WR: 0.5,
  /** The spring's length at rest from the body's centre down to the hub, and its travel. */
  L0: 0.6,
  CMAX: 0.5,
  /** Stiffness (1/s²) and damping (1/s) of a spring. */
  K: 30,
  D: 2.0,
  /** Squared radii of gyration in pitch and roll, and the height of the centre the tyre forces lever on. */
  KP2: 1.2,
  KR2: 0.7,
  HC: 0.7,
  /** Engine and brake (m/s²), the top speed forward and in reverse, rolling drag and the handbrake's. */
  ENGINE: 12,
  VMAX: 23.2,
  VREV: 8,
  BRAKE: 14,
  ROLL: 0.6,
  HB: 6,
  /**
   * The boost (the user, 2026-11-14), Shift with W as on the ship: a rocket at the back pushes
   * BOOST m/s² more along the nose, fading to nothing at VBOOST. It is not the tyres' (the moon's
   * grip already caps the engine), so it pushes with any wheel down.
   */
  BOOST: 10,
  VBOOST: 34,
  /** Grip sideways and in traction, as shares of the load; under the handbrake, the share left sideways and how much faster the nose comes round. */
  MU: 1.1,
  MUL: 1.2,
  HBG: 0.35,
  HBY: 1.5,
  /** Steering toward the driver's look: gain, the speed that halves it, the lock, its rate, and the yaw rate's cap and response. */
  SK: 2.5,
  SV: 10,
  SMAX: 0.55,
  SRATE: 3.5,
  YMAX: 2.4,
  YRESP: 10,
  /** In the air: the pull back to level, its damping, the rates' decay, and the tilt nothing passes. */
  AK: 5,
  AC: 3,
  AD: 0.5,
  TILT: 0.9,
  /**
   * The body against the brushes: circles of radius RB at BODY along the nose, BODY_H tall. A wheel
   * takes for its floor what is at most WHEEL_STEP above its hub with the spring out; the body
   * passes over a brush no more than STEP_H above the wheels' floor, like a player.
   */
  RB: 1.05,
  BODY: [1.15, 0, -1.15],
  BODY_H: 1.5,
  WHEEL_STEP: 0.6,
  /** The share of its speed into another rover a rover bounces back with. */
  BOUNCE: 0.3,
  /**
   * A crash (the user, 2026-11-12): the speed on the level that a step's walls and vehicles take
   * away (m/s) past CRASH costs 1 hp each CRASH_HP more. A landing is the springs': no crash.
   */
  CRASH: 10,
  CRASH_HP: 3,
  /** A player this close to a rover's centre gets in; a rover this fast hurts an enemy, and this fast puts him down. */
  ENTER_R: 3,
  SPLAT_MIN: 6,
  SPLAT_KILL: 12,
  /** The two lasers, one each side: ticks between two salvos, the bolts' reach, and where the beams cross ahead of the driver's look. */
  GUN_COOL: 8,
  GUN_RANGE: 90,
  GUN_AIM: 50,
} as const;

/** The lasers' muzzles: right of the centre, above it, ahead of it. */
export const GUNS = [
  [-1.05, 0.18, 0.6],
  [1.05, 0.18, 0.6],
];

/** The seats, driver then rider: right of the centre, above it (the feet), ahead of it. */
const SEATS = [
  [-0.45, -0.35, 0.1],
  [0.45, -0.35, 0.1],
];
/** The wheels, front left, front right, rear left, rear right: ahead of the centre and to its right. */
const AI = [1, 1, -1, -1].map(s => s * ROVER.A);
const BI = [-1, 1, -1, 1].map(s => s * ROVER.B);
/** From the centre down to the bottom of a wheel on a spring at rest. */
const DROP = ROVER.L0 + ROVER.WR;
/** Where who gets out stands, from the centre to the side: clear of the body. And the drop he does not get out over. */
const OUT = ROVER.RB + PLAYER_R + 0.15;
const LEDGE = 1;
/** The numbers of the state: float32 after every step, and on the wire. */
const FLOATS = 'x y z vx vy vz yaw pitch roll wy wp wr steer'.split(' ') as Exclude<
  keyof Rover,
  'driver' | 'rider' | 'ship' | 'hp' | 'wreck' | 'nades'
>[];

type Vec3 = [x: number, y: number, z: number];

const DT = 1 / TICK_HZ;
const f32 = Math.fround;
const { sin, cos, min, max, abs, sqrt } = Math;
const clamp = (v: number, lo: number, hi: number): number => min(max(v, lo), hi);

/**
 * A point of the body, `a` m ahead of the centre, `b` m to its right and `u` m above: it leans with
 * the pitch (nose up) and the roll (right side down).
 */
const at = (r: Rover, a: number, b: number, u = 0): Vec3 => {
  const [fx, fz] = forward(r.yaw);
  const [ca, cb] = [a * cos(r.pitch), b * cos(r.roll)];
  return [
    r.x + fx * ca - fz * cb,
    r.y + u + a * sin(r.pitch) - b * sin(r.roll),
    r.z + fz * ca + fx * cb,
  ];
};

/**
 * Each wheel's corner of the body, and how far the floor under it squeezes the spring: below 0 the
 * wheel hangs. Its floor is at most WHEEL_STEP above the hub of the spring at rest: what is higher
 * is over it, or a wall for the body.
 */
const corners = (r: Rover, w: World): [...Vec3, c: number][] =>
  AI.map((a, k) => {
    const [x, y, z] = at(r, a, BI[k]);
    return [x, y, z, DROP + floorAt(w, x, z, y - ROVER.L0 + ROVER.WHEEL_STEP) - y];
  });

/**
 * The wheels, front left, front right, rear left, rear right: the hub, and the spring's compression
 * (0 fully out, as in the air, to CMAX). From the state alone, for the drawing.
 */
export const wheels = (r: Rover, w: World): [...Vec3, c: number][] =>
  corners(r, w).map(([x, y, z, c]) => {
    const k = clamp(c, 0, ROVER.CMAX);
    return [x, y - ROVER.L0 + k, z, k];
  });

/**
 * The body as the brushes and a run-over meet it: the centres of three circles of radius RB along
 * the nose, front first, each at the height of its bottom, BODY_H under its top.
 */
export const footprint = (r: Rover): Vec3[] => ROVER.BODY.map(a => at(r, a, 0, -DROP));

/**
 * The body as the players on foot and the other rovers meet it: the stadium round the front and
 * rear circles of footprint(), RB wide and BODY_H tall. A player walks into it and stands on it.
 */
export const hull = (r: Rover): Body => {
  if (r.ship) {
    return shipHull(r);
  }
  const [a, , b] = footprint(r);
  return { a, b, r: ROVER.RB, h: ROVER.BODY_H };
};

/** Every solid of the vehicle: a rover's hull(), a ship's hull and its two wings. */
export const hulls = (r: Rover): Body[] => (r.ship ? shipBodies(r) : [hull(r)]);

/**
 * A rover's wreck skids to a stop where it blew up: before each of its steps with nobody at the
 * wheel it keeps VEHICLE.SKID of its speed along the ground. A ship's wreck falls as it flew.
 */
export const skid = (r: Rover): void => {
  if (!r.ship) {
    [r.vx, r.vz] = [f32(r.vx * VEHICLE.SKID), f32(r.vz * VEHICLE.SKID)];
  }
};

/**
 * The vehicles' bodies as the step of `p` on foot meets them: every hull(), but for a player who
 * is down the wrecks' (his own vehicle's among them: he lies where it blew up, and no wreck that
 * moves under him bends his replay).
 */
export const solid = (rovers: readonly Rover[], p: Pick<PlayerState, 'down'>): Body[] =>
  rovers.filter(r => !(p.down && r.wreck)).flatMap(hulls);

/**
 * The map's rovers at rest on their spawns, whole, nobody aboard, then its ships on their pads
 * (ship.ts): the order of the snapshot's.
 */
export const park = (w: World): Rover[] => [...cars(w), ...dock(w.def.ships)];

const cars = (w: World): Rover[] =>
  (w.def.rovers ?? []).map(([x, y, z, yaw]) => ({
    x: f32(x),
    y: f32(y + DROP),
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
    hp: VEHICLE.HP,
    wreck: 0,
  }));

/**
 * The team whose base vehicle `k` of park() is parked at: of the rovers, then of the ships, the
 * first half are red's (the renderer paints them so).
 */
export const homeOf = (w: World, k: number): number => {
  const [cars, ships] = [w.def.rovers?.length ?? 0, w.def.ships?.length ?? 0];
  return k < cars ? +(2 * k >= cars) : +(2 * (k - cars) >= ships);
};

/**
 * Where a shot from `o` along the unit `d` meets the vehicle's body within `m` metres: the
 * distance, or Infinity. A rover's body is its footprint()'s circles, BODY_H tall; a ship's is
 * ship.ts's spheres.
 */
export const struck = (r: Rover, o: Vec3, d: Vec3, m: number): number => {
  if (r.ship) {
    return shipStruck(r, o, d, m);
  }
  const t = min(
    ...footprint(r).map(([x, y, z]) => cylinder(o, d, { x, y, z }, ROVER.RB, ROVER.BODY_H)),
  );
  return t <= m ? t : Infinity;
};

/** The distance from `c` to the nearest point of the vehicle's body (struck()'s), 0 inside. */
export const reach = (r: Rover, c: Vec3): number =>
  r.ship
    ? shipReach(r, c)
    : min(
        ...footprint(r).map(([x, y, z]) => {
          const side = max(0, sqrt((c[0] - x) ** 2 + (c[2] - z) ** 2) - ROVER.RB);
          const up = max(0, y - c[1], c[1] - y - ROVER.BODY_H);
          return sqrt(side * side + up * up);
        }),
      );

/**
 * Whether a cut of `p` with this reach and arc (blade.ts's strike(), for a hull) meets the
 * vehicle: its hull() within reach of his centre on the floor plane, inside the arc round his look
 * (the hull's own angular radius counts), the heights overlapping and no brush before it.
 */
export const slashed = (
  w: World,
  r: Rover,
  p: PlayerState,
  { reach, arc }: { reach: number; arc: number },
): boolean => hulls(r).some(h => cuts(w, h, p, reach, arc));

/** Whether a cut of `p` with this reach and arc meets the body `h`. */
const cuts = (w: World, h: Body, p: PlayerState, reach: number, arc: number): boolean => {
  // From the nearest point of the hull's axis to him.
  const [dx, dz, y] = gapTo(h, p.x, p.z);
  const d = sqrt(dx * dx + dz * dz);
  const tall = heightOf(p);
  if (d - h.r > reach || p.y >= y + h.h || y >= p.y + tall) {
    return false;
  }
  const [fx, fz] = forward(p.yaw);
  const off = d > h.r ? abs(Math.atan2(fz * dx - fx * dz, -fx * dx - fz * dz)) : 0;
  const wide = d > h.r ? Math.asin(h.r / d) : Math.PI;
  const chest = p.y + 0.7 * tall;
  return (
    off <= arc + wide &&
    !hidden(w, [p.x, chest, p.z], [p.x - dx, clamp(chest, y, y + h.h), p.z - dz])
  );
};

/**
 * One step of 1 / TICK_HZ s, in place. `i` is the driver's input as the wire rounds it (FORWARD and
 * BACK the throttle, JUMP the handbrake, its yaw where the nose is steered to), or undefined with
 * nobody at the wheel: the brake is on. Reads only the rover, the input, the world and the
 * `fleet` (the map's rovers, itself skipped: walls it stops on, BOUNCE back, never pushed). Returns
 * whether it fell under the world's kill floor: the caller parks it again.
 *
 * The body is a point with a pitch and a roll on four springs. Each wheel reads the floor under
 * its hub; the four heights give the ground's slope, the springs push along its normal, and the
 * tyres work on the speed along the nose and across it. Yaw is steered, not simulated: the nose
 * turns toward the look as fast as the speed allows, and the tyres' grip decides how much of the
 * speed follows it. The rest drifts.
 */
export const drive = (
  r: Rover,
  i: Input | undefined,
  w: World,
  fleet: readonly Rover[] = [],
  crash?: (jolt: number) => void,
): boolean => {
  if (r.ship) {
    return pilot(r, i, w, fleet.filter(o => o !== r).flatMap(hulls), crash);
  }
  const { A, B, CMAX, K, D, KP2, KR2, HC, MU, MUL, TILT } = ROVER;
  const g = gravity(w);
  const keys = i ? i.keys : 0;
  const thr = (keys & KEY.FORWARD ? 1 : 0) - (keys & KEY.BACK ? 1 : 0);
  const hb = keys & KEY.JUMP;
  const boost = thr > 0 && keys & KEY.SPRINT;
  const [fx, fz] = forward(r.yaw);
  const [cp, cr] = [cos(r.pitch), cos(r.roll)];

  const c = corners(r, w);
  // The floor under each wheel, and its slope along the nose and across it: none while a wheel
  // hangs lower than its travel, over a drop or the void.
  const [g0, g1, g2, g3] = c.map(([, y, , k]) => k + y - DROP);
  const flat = c.some(k => k[3] < -CMAX);
  const sf = flat ? 0 : (g0 + g1 - g2 - g3) / (4 * A * cp);
  const sr = flat ? 0 : (g1 + g3 - g0 - g2) / (4 * B * cr);
  const ny = 1 / sqrt(sf * sf + sr * sr + 1);
  const nx = -(sf * fx - sr * fz) * ny;
  const nz = -(sf * fz + sr * fx) * ny;
  const along = (): number => r.vx * nx + r.vy * ny + r.vz * nz;

  // The bump stop: a spring squeezed past its travel lifts the body, which stops going down.
  const pen = max(0, ...c.map(k => k[3] - CMAX));
  if (pen) {
    r.y += pen;
    const v = min(0, along());
    r.vx -= v * nx;
    r.vy -= v * ny;
    r.vz -= v * nz;
  }

  // The springs, each damped by the speed its corner closes on the ground at.
  const vn = along();
  let [s, tp, tr] = [0, 0, 0];
  c.forEach(([, , , k], n) => {
    if (k > pen) {
      const f = max(0, K * (k - pen) - D * (vn + (AI[n] * cp * r.wp - BI[n] * cr * r.wr) * ny));
      s += f;
      tp += f * AI[n];
      tr += f * BI[n];
    }
  });
  r.vx += s * nx * DT;
  r.vy += (s * ny - g) * DT;
  r.vz += s * nz * DT;
  r.wp += (tp / KP2) * DT;
  r.wr -= (tr / KR2) * DT;
  const load = min(s / g, 2);

  if (load > 0) {
    const vl = r.vx * fx + r.vz * fz;
    const vs = r.vz * fx - r.vx * fz;
    // The front wheels turn toward the look, less at speed, and the other way in reverse.
    const err = i ? norm(i.yaw - r.yaw + Math.PI) - Math.PI : 0;
    const lock = clamp((ROVER.SK * err) / (1 + abs(vl) / ROVER.SV), -ROVER.SMAX, ROVER.SMAX);
    const turn = ROVER.SRATE * DT;
    r.steer += clamp((vl + thr < 0 ? -lock : lock) - r.steer, -turn, turn);
    // The handbrake lets the tail go: the nose comes round faster.
    const spin = clamp((vl * r.steer) / (2 * A), -ROVER.YMAX, ROVER.YMAX) * (hb ? ROVER.HBY : 1);
    r.wy += (spin - r.wy) * ROVER.YRESP * DT * min(1, load);
    // The engine fades to the top speed; against the motion it is the brake. The tyres pass on
    // what the load lets them.
    const grip = g * load * DT;
    const push =
      thr * vl < 0
        ? thr * ROVER.BRAKE
        : thr * ROVER.ENGINE * max(0, 1 - abs(vl) / (thr > 0 ? ROVER.VMAX : ROVER.VREV));
    let dl = clamp(push * DT, -MUL * grip, MUL * grip);
    if (boost) {
      dl += ROVER.BOOST * clamp(1 - vl / ROVER.VBOOST, 0, 1) * DT;
    }
    // Rolling drag, the handbrake (on with nobody at the wheel) and the grip sideways are capped
    // impulses, like GRIP in physics.ts: they stop a speed, they never turn it round.
    const drag = (ROVER.ROLL + (hb || !i ? ROVER.HB : 0)) * load * DT;
    dl -= clamp(vl + dl, -drag, drag);
    const side = MU * grip * (hb ? ROVER.HBG : 1);
    const ds = -clamp(vs, -side, side);
    r.vx += dl * fx - ds * fz;
    r.vz += dl * fz + ds * fx;
    // The tyres push under the centre: the body squats, dives and leans.
    r.wp += (dl * HC) / KP2;
    r.wr -= (ds * HC) / KR2;
  } else {
    // No wheel down: it levels out.
    r.wp -= (ROVER.AK * r.pitch + ROVER.AC * r.wp) * DT;
    r.wr -= (ROVER.AK * r.roll + ROVER.AC * r.wr) * DT;
  }
  r.wp *= 1 - ROVER.AD * DT;
  r.wr *= 1 - ROVER.AD * DT;

  r.x += r.vx * DT;
  r.y += r.vy * DT;
  r.z += r.vz * DT;
  r.yaw = norm(r.yaw + r.wy * DT);
  r.pitch = clamp(r.pitch + r.wp * DT, -TILT, TILT);
  r.roll = clamp(r.roll + r.wr * DT, -TILT, TILT);
  if (abs(r.pitch) === TILT && r.pitch * r.wp > 0) {
    r.wp = 0;
  }
  if (abs(r.roll) === TILT && r.roll * r.wr > 0) {
    r.wr = 0;
  }

  // What the walls and the other vehicles take from the speed on the level is the crash's jolt.
  const [vx0, vz0] = [r.vx, r.vz];
  // The body against the brushes. Its circles stand no lower than the highest floor under a wheel:
  // a brush the wheels are on, or one they climb (STEP_H over it, like a player), does not stop it.
  for (const a of ROVER.BODY) {
    const [x, y, z] = at(r, a, 0, -DROP);
    const [px, pz] = shove({ x, y: max(y, g0, g1, g2, g3), z }, w, ROVER.BODY_H, ROVER.RB);
    const d = px * px + pz * pz;
    if (d) {
      r.x += px;
      r.z += pz;
      const v = min(0, r.vx * px + r.vz * pz) / d;
      r.vx -= v * px;
      r.vz -= v * pz;
    }
  }
  // The other rovers, each circle against their hulls; on the axis, out by the other's right. A
  // touch closer than a tenth of a millimetre is no overlap: the float32 rounding of the other's
  // own way out does not push this one.
  for (const o of fleet) {
    if (o === r) {
      continue;
    }
    for (const h of hulls(o)) {
      for (const a of ROVER.BODY) {
        const [x, y, z] = at(r, a, 0, -DROP);
        const [dx, dz, oy] = gapTo(h, x, z);
        const reach = ROVER.RB + h.r;
        const d = sqrt(dx * dx + dz * dz);
        if (d >= reach - 1e-4 || oy >= y + ROVER.BODY_H || oy + h.h <= y) {
          continue;
        }
        const [ox, oz] = forward(o.yaw);
        const [nx, nz] = d ? [dx / d, dz / d] : [-oz, ox];
        r.x += nx * (reach - d);
        r.z += nz * (reach - d);
        const v = min(0, r.vx * nx + r.vz * nz) * (1 + ROVER.BOUNCE);
        r.vx -= v * nx;
        r.vz -= v * nz;
      }
    }
  }
  bound(r, w);
  const jolt = sqrt((r.vx - vx0) ** 2 + (r.vz - vz0) ** 2);
  if (crash && jolt > ROVER.CRASH) {
    crash(jolt);
  }
  for (const k of FLOATS) {
    r[k] = f32(r[k]);
  }
  return r.y < w.def.floor;
};

/**
 * Puts the body of a player on seat `s` (0 the driver's, 1 the rider's) of the rover, with its
 * speed. The seat leans with the body: on a slope he is not left in the air.
 */
export const seat = (p: PlayerState, r: Rover, s: 0 | 1): void => {
  const [side, up, ahead] = r.ship ? COCKPIT : SEATS[s];
  [p.x, p.y, p.z] = (r.ship ? point(r, side, up, ahead) : at(r, ahead, side, up)).map(f32);
  p.vx = r.vx;
  p.vy = r.vy;
  p.vz = r.vz;
};

/**
 * The player takes seat `s`: he rides (MODE.RIDE) from the next step on. What a seated body is not
 * doing ends: a dash's burst (as in stumble()), a hang or a climb, a jump press kept for a landing.
 */
export const board = (p: PlayerState, r: Rover, s: 0 | 1): void => {
  r[s ? 'rider' : 'driver'] = p.id;
  p.mode = MODE.RIDE;
  p.t = 0;
  p.edge = 0;
  p.ground = false;
  p.dash = min(p.dash, DASH_COOLDOWN - DASH_TICKS);
  p.coyote = 0;
  p.buffer = 0;
  seat(p, r, s);
};

/**
 * The player gets out of seat `s`: in the air, with the rover's speed. Beside it on the side of his
 * seat when a standing body fits there on a floor, else on the other side, else on top of it: over
 * a drop, between two walls, in flight. Never in a brush or under the ground. Reads only the two
 * and the world.
 */
export const leave = (p: PlayerState, r: Rover, s: 0 | 1, w: World): void => {
  r[s ? 'rider' : 'driver'] = NOBODY;
  p.mode = MODE.AIR;
  p.t = 0;
  p.coyote = 0;
  [p.vx, p.vy, p.vz] = [r.vx, r.vy, r.vz];
  const side = r.ship ? -SHIP_OUT : s ? OUT : -OUT;
  const [drop, top] = r.ship ? [SHIP.DROP, SHIP.H] : [DROP, ROVER.BODY_H];
  for (const [b, u] of [
    [side, -drop],
    [-side, -drop],
    [0, top - drop],
  ]) {
    const ahead = r.ship ? COCKPIT[2] : SEATS[s][2];
    const [x, y, z] = r.ship ? point(r, b, u, ahead) : at(r, ahead, b, u);
    Object.assign(p, { x, y, z });
    bound(p, w);
    // The floor there, no higher than the rover's centre: his feet on it, never under the ground.
    const floor = floorAt(w, p.x, p.z, r.y);
    p.y = max(y, floor);
    // A side is good with a floor within LEDGE under the wheels and no brush in the way of a
    // standing body. On top, the last resort, he is pushed out of one.
    const [px, pz] = shove(p, w, PLAYER_H, PLAYER_R);
    if (!b || (floor > y - LEDGE && !px && !pz)) {
      break;
    }
  }
  [p.x, p.y, p.z, p.vx, p.vz] = [p.x, p.y, p.z, p.vx, p.vz].map(f32);
};

/**
 * The driver's whole step, on the host and in the predictor alike: the rover is driven by his
 * input, he follows on his seat, and a press of USE gets him out. Returns drive()'s answer. A step
 * that takes him off his seat (move() puts a body under the kill floor back at a spawn) frees it.
 * `fleet` is drive()'s.
 */
export const ride = (
  p: PlayerState,
  r: Rover,
  i: Input,
  w: World,
  team: number,
  fleet: readonly Rover[] = [],
  crash?: (jolt: number) => void,
): boolean => {
  const out = (i.keys & KEY.USE) !== 0 && (p.held & KEY.USE) === 0;
  const fell = drive(r, i, w, fleet, crash);
  // Unarmed at the wheel; the step keeps his timers and `held` running.
  step(p, i, w, team, false);
  if (p.mode !== MODE.RIDE) {
    r.driver = NOBODY;
  } else {
    seat(p, r, 0);
    if (out) {
      leave(p, r, 0, w);
    }
  }
  return fell;
};

/** The squared distance on the floor plane from the vehicle's centre to the player. */
export const gap2 = (r: Rover, p: { x: number; z: number }): number =>
  (r.x - p.x) ** 2 + (r.z - p.z) ** 2;

/**
 * A player on foot near enough to get in: on the floor plane within ENTER_R of the centre, and
 * within the reach in height (a ship's ENTER_H). A wreck has no seat.
 */
export const nearby = (r: Rover, p: { x: number; y: number; z: number }): boolean => {
  const [k, h] = r.ship ? [SHIP.ENTER_R, SHIP.ENTER_H] : [ROVER.ENTER_R, ROVER.ENTER_R];
  return !r.wreck && Math.abs(r.y - p.y) <= h && gap2(r, p) <= k * k;
};

/**
 * The seat a player gets: 0 at the wheel (never a flag's carrier), 1 beside it, -1 none. A ship
 * has its pilot's seat only.
 */
export const free = (r: Rover, carrier: boolean): 0 | 1 | -1 =>
  r.driver === NOBODY && !carrier ? 0 : r.rider === NOBODY && !r.ship ? 1 : -1;

/** Metres from the centre to where the lasers cross along the look: a ship's or a rover's. */
export const aimRange = (r: Rover): number => (r.ship ? SHIP.GUN_AIM : ROVER.GUN_AIM);

/**
 * What the driver's look meets from the vehicle's centre along the unit `d`, within `max` metres:
 * the distance, or Infinity. The room's sight(), the client's reticle.
 */
export type Sight = (o: Vec3, d: Vec3, max: number) => number;

/** The lasers never cross nearer than this: the beams would fly sideways. */
export const AIM_MIN = 8;

/**
 * Where the lasers cross: on what the driver's look meets within the guns' range (`sight`, the
 * user, 2026-11-12: with a cross at a fixed distance the two beams went either side of a rover
 * nearer than it), AIM_MIN at least; else aimRange() metres from the centre along the look.
 */
export const aimOf = (
  r: Rover,
  yaw: number,
  pitch: number,
  sight?: Sight,
): [number, number, number] => {
  const [sy, cy, sp, cp] = [Math.sin(yaw), Math.cos(yaw), Math.sin(pitch), Math.cos(pitch)];
  const d: Vec3 = [-sy * cp, sp, -cy * cp];
  const far = r.ship ? SHIP.GUN_RANGE : ROVER.GUN_RANGE;
  const t = sight ? sight([r.x, r.y, r.z], d, far) : Infinity;
  const k = t < far ? max(t, AIM_MIN) : aimRange(r);
  return [r.x + d[0] * k, r.y + d[1] * k, r.z + d[2] * k];
};

/** A muzzle of the vehicle in the world: `m` is right of the centre, above it, ahead of it. */
const muzzle = (r: Rover, [side, up, ahead]: number[]): number[] => {
  if (r.ship) {
    return point(r, side, up, ahead);
  }
  const [fx, fz] = forward(r.yaw);
  return [r.x + fx * ahead - fz * side, r.y + up, r.z + fz * ahead + fx * side];
};

/** From `o` toward the aim, unit. */
const toward = (o: number[], aim: number[]): number[] => {
  const d = aim.map((v, a) => v - o[a]);
  const l = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);
  return d.map(v => v / l);
};

/**
 * The two bolts of one salvo of the rover's lasers, left then right: each from its muzzle toward
 * the point GUN_AIM metres along the driver's look (the yaw and pitch of his input) from the rover's
 * centre, so the beams cross there, chest high on level ground with a level look. `id` names the first, `id + 1` the second.
 */
export const bolts = (
  r: Rover,
  by: number,
  team: number,
  yaw: number,
  pitch: number,
  id: number,
  sight?: Sight,
): Flying[] => {
  const aim = aimOf(r, yaw, pitch, sight);
  return (r.ship ? SHIP_GUNS : GUNS).map((m, k) => {
    const o = muzzle(r, m);
    const d = toward(o, aim);
    return {
      id: (id + k) & 255,
      by,
      team,
      x: o[0],
      y: o[1],
      z: o[2],
      dx: d[0],
      dy: d[1],
      dz: d[2],
      left: r.ship ? SHIP.GUN_RANGE : ROVER.GUN_RANGE,
      burst: false,
      power: BOLT,
    };
  });
};

/**
 * A ship's missile from its pod `k` (0 left, 1 right) toward where its lasers cross: a grenade
 * (plasma.ts's toss() flies it, straight, blast() to MISSILE_R is its burst) launched at
 * MISSILE_SPEED plus the ship's own speed along the way, 63 m/s at most (the wire's six bits).
 */
export const missile = (
  r: Rover,
  by: number,
  team: number,
  yaw: number,
  pitch: number,
  id: number,
  k: number,
  sight?: Sight,
): Flying => {
  const o = muzzle(r, PODS[k]);
  const d = toward(o, aimOf(r, yaw, pitch, sight));
  const own = r.vx * d[0] + r.vy * d[1] + r.vz * d[2];
  return {
    id: id & 255,
    by,
    team,
    x: o[0],
    y: o[1],
    z: o[2],
    dx: d[0],
    dy: d[1],
    dz: d[2],
    left: 2 * SHIP.GUN_RANGE,
    burst: false,
    power: NADE,
    v: Math.min(63, SHIP.MISSILE_SPEED + Math.max(0, own)),
    missile: true,
  };
};
