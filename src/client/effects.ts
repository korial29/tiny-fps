// Camera feel, fed each frame: field of view, eye height, roll and speed lines. No DOM, times in
// seconds, unit-tested. It only moves what is drawn: the inputs sent keep the real eye and angles.
import { DASH_COOLDOWN, DASH_TICKS, RUN_SPEED, SPRINT_SPEED } from '../shared/constants';
import { eyeHeight, speedOf } from '../shared/physics';
import { EV, KEY, MODE } from '../shared/types';
import type { PlayerState } from '../shared/types';

/** What happened in the live steps since the last frame: predictor.events(). */
export interface Hit {
  ev: number;
  fall: number;
}

export interface Effects {
  /** Vertical eye offset from the physics eye, metres: the eye height eased, the bob, the landing dip, the jump lift. */
  dy: number;
  /** Radians added to the look pitch (positive looks up): the grab settle and the climb arc. */
  pitch: number;
  /** Radians, positive leans right. */
  roll: number;
  /** Degrees added to the vertical field of view. */
  fov: number;
  /** 0 to 1: the speed lines, and the touch of vignette that goes with them. */
  lines: number;
  /** Steps walked on a floor or a wall: each whole number is a footfall. */
  stride: number;
  /** Advances dt seconds: the own player (eased, undefined before the first snapshot), the held keys, the events. */
  update(me: PlayerState | undefined, keys: number, dt: number, hit?: Hit): void;
}

/** Metres from one footfall to the next at speed v: longer strides at a sprint. */
export const stepLength = (v: number): number => 0.6 + 0.2 * v;

/** On a floor (a step bobs the head). */
const walks = (s?: PlayerState) => s?.mode === MODE.GROUND || s?.mode === MODE.CROUCH;

/** Taking steps: on a floor, or along a wall. */
export const stepping = (s?: PlayerState): boolean => walks(s) || s?.mode === MODE.WALLRUN;

/** The unit vector toward a wall on each SIDE, as in physics. */
const WALL = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
/** Bob amplitude at speed v, metres, and the sway it rolls the head by, radians. */
const bob = (v: number) => 0.02 + 0.0025 * v;
const SWAY = 0.006;
/** The roll of a strafe, a wall-run (toward the wall) and a slide, radians. */
const STRAFE = 0.03;
const LEAN = 0.14;
const TILT = 0.05;
/** Degrees of field of view added at a sprint, and by the punch of a dash. */
const SPRINT_FOV = 5;
const DASH_FOV = 9;
/** Speed from which the lines show, and the share of them a sprint reaches (a dash adds the rest). */
const LINES_FROM = RUN_SPEED + 0.5;
const SPRINT_LINES = 0.25;
/** Metres per second of eye speed a landing takes per m/s of fall (at most 20), and a jump gives. */
const DIP = 0.22;
const LIFT = 0.9;
/** Standing up on a ledge dips the eye like a landing at this speed. */
const CLIMB_FALL = 4;
/** The look-down of a grab, radians per second of pitch speed; the climb arc's peak and length in ticks. */
const SETTLE = 1;
const ARC = 0.12;
const ARC_TICKS = 24;
/** The landing spring: 2.5 Hz, damping ratio 0.45 (about a fifth of overshoot). */
const W = 15.7;
const Z = 0.45;

const clamp = (v: number, lo = 0, hi = 1) => Math.min(Math.max(v, lo), hi);

/** A damped spring, [position, speed], pulled to 0. */
type Spring = [number, number];
const spring = (s: Spring, dt: number) => {
  const n = Math.ceil(dt * 120);
  for (let i = 0; i < n; i++) {
    s[1] += (-W * W * s[0] - 2 * Z * W * s[1]) * (dt / n);
    s[0] += s[1] * (dt / n);
  }
};

export const createEffects = (): Effects => {
  let amt = 0;
  let lean = 0;
  let punch = 0;
  let sprint = 0;
  let arc = 0;
  /** The eye height as drawn; undefined until the first state, which it starts at. */
  let h: number | undefined;
  let last: PlayerState | undefined;
  const y: Spring = [0, 0];
  const p: Spring = [0, 0];

  const fx: Effects = {
    dy: 0,
    pitch: 0,
    roll: 0,
    fov: 0,
    lines: 0,
    stride: 0,

    update(me, keys, dt, hit = { ev: 0, fall: 0 }) {
      const ease = (rate: number) => Math.min(1, dt * rate);
      const v = me ? speedOf(me) : 0;

      // Distance on the floor or a wall, a respawn (a jump of metres) excepted.
      const d =
        me && last && stepping(me) && stepping(last) ? Math.hypot(me.x - last.x, me.z - last.z) : 0;
      if (d < 1) {
        fx.stride += d / stepLength(v);
      }
      amt += ((walks(me) && d > 0.5 * dt && d < 1 ? 1 : 0) - amt) * ease(10);
      last = me;

      // Hits are impulses on the springs: a landing pushes the eye down, a jump up, a grab the look down.
      if (hit.ev & EV.LAND) {
        y[1] -= DIP * Math.min(hit.fall, 20);
      }
      if (hit.ev & EV.CLIMB) {
        y[1] -= DIP * CLIMB_FALL;
      }
      if (hit.ev & (EV.JUMP | EV.DOUBLE)) {
        y[1] += LIFT;
      }
      if (hit.ev & EV.GRAB) {
        p[1] -= SETTLE;
      }
      spring(y, dt);
      spring(p, dt);
      const want = me ? eyeHeight(me) : 0;
      h = me ? (h === undefined ? want : h + (want - h) * ease(14)) : undefined;
      fx.dy = (h ?? 0) - want + y[0] - Math.cos(fx.stride * 2 * Math.PI) * bob(v) * amt;
      arc +=
        ((me?.mode === MODE.CLIMB ? ARC * Math.sin(Math.PI * clamp(me.t / ARC_TICKS)) : 0) - arc) *
        ease(10);
      fx.pitch = p[0] + arc;

      // Toward the wall: its side against the player's right, (cos yaw, -sin yaw) on x, z.
      const wall = me?.mode === MODE.WALLRUN ? WALL[me.wall] : [0, 0];
      const side = me ? wall[0] * Math.cos(me.yaw) - wall[1] * Math.sin(me.yaw) : 0;
      const strafe = +!!(keys & KEY.RIGHT) - +!!(keys & KEY.LEFT);
      lean +=
        (strafe * STRAFE + side * LEAN + (me?.mode === MODE.SLIDE ? TILT : 0) - lean) * ease(8);
      fx.roll = lean + Math.sin(fx.stride * Math.PI) * SWAY * amt;

      // The dash is a burst of its first ticks; the speed part saturates at the sprint's.
      const burst = !!me && me.dash > DASH_COOLDOWN - DASH_TICKS;
      punch += (+burst - punch) * ease(burst ? 40 : 6);
      sprint += (clamp((v - RUN_SPEED) / (SPRINT_SPEED - RUN_SPEED)) - sprint) * ease(4);
      fx.fov = sprint * SPRINT_FOV + punch * DASH_FOV;
      fx.lines +=
        (clamp((v - LINES_FROM) / (SPRINT_SPEED - LINES_FROM)) * SPRINT_LINES +
          punch * (1 - SPRINT_LINES) -
          fx.lines) *
        ease(8);
    },
  };
  return fx;
};
