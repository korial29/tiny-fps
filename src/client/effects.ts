// Camera feel, fed each frame: field of view, eye height, roll and speed lines. No DOM, times in
// seconds, unit-tested. It only moves what is drawn: the inputs sent keep the real eye and angles.
import {
  BLOW,
  DASH_COOLDOWN,
  DASH_TICKS,
  RUN_SPEED,
  SPRINT_SPEED,
  STUMBLE_TICKS,
  HEAT_MAX,
} from '../shared/constants';
import { eyeHeight, floored, speedOf } from '../shared/physics';
import { CUT, EV, KEY, MODE } from '../shared/types';
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
  /** 0 to 1: the red vignette of a tackle, full at the hit and gone in under a second. */
  hurt: number;
  /** The kick of the gun in the hand, 1 at a shot (up to 3 for a charged one) and gone in a tenth of a second. */
  kick: number;
  /** 0 to 1: how far the view has gone down to the floor, while the own player is down. */
  lie: number;
  /** The own player fired a shot of `power` (1 to CHARGE_MAX): a shake of the eye, the look and the roll, and the kick of the gun, much stronger for a charged one. */
  fire(power?: number): void;
  /** The own player was hit: the red vignette and a small knock. */
  wound(): void;
  /** The own player was tackled: a hard jolt of the eye, the look and the roll, and the vignette. */
  jolt(): void;
  /** A grenade burst near the own player, `k` 0 to 1 as it is nearer: the view is shaken as hard as a tackle at 1. */
  quake(k: number): void;
  /** The own player tackled someone: a small punch of the look and the field of view. */
  punch(): void;
  /** The own katana's cut struck: a thrust punches the field of view, a slash dips the look, a cut across rolls toward the side it ends on. */
  cut(c: number): void;
  /**
   * A blow of the fists (BLOW) struck: the own (the look kicked toward the fist's side, rolled hard
   * by a hook, a lunge punching the field of view), or, `taken`, one the own player took: the eye
   * dipped and the look knocked up.
   */
  blow(b: number, taken?: boolean): void;
  /**
   * Advances dt seconds: the own player (eased, undefined before the first snapshot), the held keys,
   * the events, and the stride phase of its drawn legs (Gait.phase): with it the bob dips as a foot
   * lands, without it the stride counts the distance.
   */
  update(me: PlayerState | undefined, keys: number, dt: number, hit?: Hit, phase?: number): void;
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
/** A tackle: the eye's and the look's speed it is hit with (m/s, rad/s), the roll's, and how fast the vignette fades (1 / s). */
const JOLT = [-8, 4, 5];
const FADE = 3;
/** The tackler's punch: the same, smaller, and the degrees of field of view it adds. */
const PUNCH = [-1, 1.2];
const PUNCH_FOV = 4;
/** A shot: the eye's, the look's and the roll's speed it is kicked with, and how much the roll's goes either way. */
const SHOT = [-0.25, 0.4, 0.5];
/** A cut's strike: the eye's speed, then the look's (a slash) and the roll's (across). */
const STRIKE = [-0.5, 1.5, 1.2];
/** A blow of the fists: the eye's speed, the look's and the roll's; then the same for one taken. */
const FIST = [-0.3, 0.3, 0.7];
const KNOCKED = [-1.4, 1.8, 1.6];
/** A hit: the same, and a floor at which the view lies, tilted (radians) and lowered to a hand's width. */
const WOUND = [-1.5, 0.8, 1.5];
const LIE = [0.9, 0.3];

/** While stumbling the view tilts: the roll and pitch swing (radians) and their rate (rad/s). */
const REEL = [0.1, 0.05, 11];

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
  let thump = 0;
  let reel = 0;
  let fall = 0;
  let shots = 0;
  let zap = 1;
  /** The eye height as drawn; undefined until the first state, which it starts at. */
  let h: number | undefined;
  let last: PlayerState | undefined;
  const y: Spring = [0, 0];
  const p: Spring = [0, 0];
  const r: Spring = [0, 0];

  const fx: Effects = {
    dy: 0,
    pitch: 0,
    roll: 0,
    fov: 0,
    lines: 0,
    stride: 0,
    hurt: 0,
    kick: 0,
    lie: 0,

    fire(power = 1) {
      // The roll's kick alternates sides; a full charge kicks 3.4 times as hard.
      const k = 1 + 0.6 * (power - 1);
      shots++;
      y[1] += SHOT[0] * k;
      p[1] += SHOT[1] * k;
      r[1] += SHOT[2] * k * Math.sin(shots * 2.4);
      fx.kick = 1 + 0.5 * (power - 1);
    },

    wound() {
      y[1] += WOUND[0];
      p[1] += WOUND[1];
      r[1] += WOUND[2] * Math.sin(shots++);
      fx.hurt = 1;
    },

    jolt() {
      y[1] += JOLT[0];
      p[1] += JOLT[1];
      r[1] += JOLT[2];
      fx.hurt = 1;
    },

    quake(k) {
      y[1] += JOLT[0] * k;
      p[1] += JOLT[1] * k;
      r[1] += JOLT[2] * k * (shots++ % 2 ? -1 : 1);
    },

    punch() {
      y[1] += PUNCH[0];
      p[1] += PUNCH[1];
      thump = 1;
    },

    cut(c) {
      // The arc's cut comes down across, as hard as a thrust.
      const arc = c == CUT.ARC_L || c == CUT.ARC_R;
      y[1] += STRIKE[0];
      p[1] -= c == CUT.SLASH || arc ? STRIKE[1] : 0;
      r[1] +=
        (c == CUT.LEFT || c == CUT.ARC_L ? 1 : c == CUT.RIGHT || c == CUT.ARC_R ? -1 : 0) *
        STRIKE[2];
      thump = c == CUT.THRUST || arc ? 1 : thump;
    },

    blow(b, taken) {
      const [e, l, roll] = taken ? KNOCKED : FIST;
      const sd = b == BLOW.CROSS || b == BLOW.LUNGE ? 1 : -1;
      y[1] += e;
      p[1] += taken ? l : b == BLOW.LUNGE ? -l : 0;
      r[1] += (taken ? 1 : sd) * roll * (b == BLOW.HOOK ? 2.5 : 1);
      thump = !taken && b == BLOW.LUNGE ? 1 : thump;
    },

    update(me, keys, dt, hit = { ev: 0, fall: 0 }, phase) {
      const ease = (rate: number) => Math.min(1, dt * rate);
      const v = me ? speedOf(me) : 0;

      // Distance on the floor or a wall, a respawn (a jump of metres) excepted.
      const d =
        me && last && stepping(me) && stepping(last) ? Math.hypot(me.x - last.x, me.z - last.z) : 0;
      if (phase !== undefined) {
        // A foot lands at each half of the legs' stride: the bob's whole steps.
        fx.stride = 2 * phase;
      } else if (d < 1) {
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
      // The rail gun's bolt jolts the view at each pulse of the arc, harder as the gun heats.
      zap = me?.zapping ? zap + dt : 1;
      if (zap > 1 / 7) {
        zap = me?.zapping ? 0 : 1;
        const k = me?.zapping ? 1 + (me.heat ?? 0) / HEAT_MAX : 0;
        y[1] -= 0.05 * k;
        p[1] += 0.15 * k;
        r[1] += 0.12 * k * Math.sin(shots++ * 2.4);
      }
      spring(y, dt);
      spring(p, dt);
      spring(r, dt);
      fx.hurt *= Math.exp(-dt * FADE);
      thump *= Math.exp(-dt * 10);
      fx.kick *= Math.exp(-dt * 22);
      fx.lie += (+!!me?.down - fx.lie) * ease(5);
      // Floored by an arc: down on the roof as fast as he fell, then up again.
      fall += (+(!!me && floored(me)) - fall) * ease(8);
      const lie = Math.max(fx.lie, fall);
      // Stumbling: the view reels, in and out of balance as long as the timer runs.
      reel += dt * REEL[2];
      const stun = me ? Math.min(1, me.stun / STUMBLE_TICKS) : 0;
      const want = me ? eyeHeight(me) : 0;
      h = me ? (h === undefined ? want : h + (want - h) * ease(14)) : undefined;
      fx.dy =
        (h ?? 0) -
        want +
        y[0] -
        Math.cos(fx.stride * 2 * Math.PI) * bob(v) * amt -
        lie * (want - LIE[1]);
      arc +=
        ((me?.mode === MODE.CLIMB ? ARC * Math.sin(Math.PI * clamp(me.t / ARC_TICKS)) : 0) - arc) *
        ease(10);
      fx.pitch = p[0] + arc + Math.sin(reel * 0.8) * REEL[1] * stun;

      // Toward the wall: its side against the player's right, (cos yaw, -sin yaw) on x, z.
      const wall = me?.mode === MODE.WALLRUN ? WALL[me.wall] : [0, 0];
      const side = me ? wall[0] * Math.cos(me.yaw) - wall[1] * Math.sin(me.yaw) : 0;
      const strafe = +!!(keys & KEY.RIGHT) - +!!(keys & KEY.LEFT);
      lean +=
        (strafe * STRAFE + side * LEAN + (me?.mode === MODE.SLIDE ? TILT : 0) - lean) * ease(8);
      fx.roll =
        lean +
        Math.sin(fx.stride * Math.PI) * SWAY * amt +
        r[0] +
        Math.sin(reel) * REEL[0] * stun +
        lie * LIE[0];

      // The dash is a burst of its first ticks; the speed part saturates at the sprint's.
      const burst = !!me && me.dash > DASH_COOLDOWN - DASH_TICKS;
      punch += (+burst - punch) * ease(burst ? 40 : 6);
      sprint += (clamp((v - RUN_SPEED) / (SPRINT_SPEED - RUN_SPEED)) - sprint) * ease(4);
      fx.fov = sprint * SPRINT_FOV + punch * DASH_FOV + thump * PUNCH_FOV;
      fx.lines +=
        (clamp((v - LINES_FROM) / (SPRINT_SPEED - LINES_FROM)) * SPRINT_LINES +
          punch * (1 - SPRINT_LINES) -
          fx.lines) *
        ease(8);
    },
  };
  return fx;
};
