// The moon's rover, shared by the host and the client's prediction: no DOM, no Node API.
// A body on four sprung wheels, driven by the keys and the look of the player at its wheel. Like
// move(), drive() is deterministic for a given state and input: the state is float32, so the
// driver's replay of unacked inputs lands where the host does.
//
// One clock a rover: the driver's inputs (ride(), on arrival at the host and in the predictor), or
// the host's tick while nobody drives. Nothing but drive() moves a driven rover, or the replay is
// no longer exact: no rover pushes another, no player pushes one.
import { step } from './gun';
import { forward, norm } from './physics';
import { KEY, MODE, NOBODY } from './types';
import type { Input, PlayerState, Rover } from './types';
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
  /** Grip sideways and in traction, as shares of the load, and the share left sideways under the handbrake. */
  MU: 1.1,
  MUL: 1.2,
  HBG: 0.35,
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
  /** The body against the brushes: circles of radius RB at BODY along the nose, BODY_H tall; a wheel climbs WHEEL_STEP. */
  RB: 1.05,
  BODY: [1.15, 0, -1.15],
  BODY_H: 1.5,
  WHEEL_STEP: 0.6,
  /** A player this close to a rover's centre gets in; a rover this fast hurts an enemy, and this fast puts him down. */
  ENTER_R: 3,
  SPLAT_MIN: 6,
  SPLAT_KILL: 12,
} as const;

/** The seats, driver then rider: right of the centre, above it (the feet), ahead of it. */
const SEATS = [
  [-0.45, -0.35, 0.1],
  [0.45, -0.35, 0.1],
];

const f32 = Math.fround;

/** The map's rovers at rest on their spawns, nobody aboard. */
export const park = (w: World): Rover[] =>
  (w.def.rovers ?? []).map(([x, y, z, yaw]) => ({
    x: f32(x),
    y: f32(y + ROVER.WR + ROVER.L0),
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
  }));

/**
 * One step of 1 / TICK_HZ s, in place. `i` is the driver's input as the wire rounds it (FORWARD and
 * BACK the throttle, JUMP the handbrake, its yaw where the nose is steered to), or undefined with
 * nobody at the wheel: the brake is on. Reads only the rover, the input and the world. Returns
 * whether it fell under the world's kill floor: the caller parks it again.
 */
export const drive = (r: Rover, i: Input | undefined, w: World): boolean => {
  // The contract only: the simulation comes with the rovers.
  void i;
  return r.y < w.def.floor;
};

/** Puts the body of a player on seat `s` (0 the driver's, 1 the rider's) of the rover, with its speed. */
export const seat = (p: PlayerState, r: Rover, s: 0 | 1): void => {
  const [side, up, ahead] = SEATS[s];
  const [fx, fz] = forward(r.yaw);
  p.x = f32(r.x + fx * ahead - fz * side);
  p.y = f32(r.y + up);
  p.z = f32(r.z + fz * ahead + fx * side);
  p.vx = r.vx;
  p.vy = r.vy;
  p.vz = r.vz;
};

/** The player takes seat `s`: he rides (MODE.RIDE) from the next step on. */
export const board = (p: PlayerState, r: Rover, s: 0 | 1): void => {
  r[s ? 'rider' : 'driver'] = p.id;
  p.mode = MODE.RIDE;
  p.t = 0;
  p.edge = 0;
  seat(p, r, s);
};

/** The player gets out of seat `s`: in the air beside the rover, with its speed. */
export const leave = (p: PlayerState, r: Rover, s: 0 | 1, w: World): void => {
  void w;
  r[s ? 'rider' : 'driver'] = NOBODY;
  p.mode = MODE.AIR;
  p.t = 0;
};

/**
 * The driver's whole step, on the host and in the predictor alike: the rover is driven by his
 * input, he follows on his seat, and a press of USE gets him out. Returns drive()'s answer.
 */
export const ride = (p: PlayerState, r: Rover, i: Input, w: World, team: number): boolean => {
  const out = (i.keys & KEY.USE) !== 0 && (p.held & KEY.USE) === 0;
  const fell = drive(r, i, w);
  // Unarmed at the wheel; the step keeps his timers and `held` running.
  step(p, i, w, team, false);
  seat(p, r, 0);
  if (out) {
    leave(p, r, 0, w);
  }
  return fell;
};
