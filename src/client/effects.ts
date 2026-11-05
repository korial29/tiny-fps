// Camera feel, fed each frame: head bob and roll, the red hurt tint, and the dust motes around the
// own eye. No DOM, times in seconds, unit-tested.
import { EYE } from '../shared/constants';
import { KEY } from '../shared/types';
import type { PlayerState } from '../shared/types';
import type { Vec3 } from './mesh';

/** What the renderer and the camera read; update moves it. */
export interface Effects {
  /** Vertical eye offset, metres. */
  bob: number;
  /** Radians, positive leans right (strafing right). */
  roll: number;
  /** Dust motes, x y z each, in a box around the own eye; `lit` says which the flashlight shows. */
  motes: Float32Array;
  /** Seconds of the red hurt tint left. */
  hurt: number;
  /** 0 to 1: how far the camera has sunk and tilted since the own player died; the light goes out. */
  dead: number;
  /**
   * Advances dt seconds: the own player (eased, undefined before the first snapshot), the held
   * keys and whether the own player is dead.
   */
  update(me: PlayerState | undefined, keys: number, dt: number, dead?: boolean): void;
  /** The own health dropped: the red tint. */
  hit(): void;
}

/** Motes, and the half sides of the box they live in: they wrap round it as the eye moves. */
export const MOTES = 128;
const BOX = [5, 1.6, 5];
/** The flashlight as the motes see it: a cone of cos(25°), this long, metres. */
const CONE = Math.cos(0.436);
const REACH = 6;
/** Seconds the hit vignette takes to go out. */
export const HURT = 0.45;
/** Seconds the camera takes to sink, the roll it ends at, and the eye height it ends at. */
const SINK = 0.5;
const TILT = 0.9;
const LOW = 0.3;
/** Bob phase per metre walked, and its amplitude in metres. */
const STRIDE = 4.4;
const BOB = 0.035;
const ROLL = 0.03;

/**
 * The motes the own flashlight shows, from the eye along the unit view direction f: x, y, z and a
 * brightness in (0, 1] each, fuller near the axis and the eye. None while the own player is dead.
 */
export const lit = (fx: Effects, eye: Vec3, f: Vec3) => {
  const out: number[] = [];
  for (let i = 0; i < fx.motes.length && !fx.dead; i += 3) {
    const d = [0, 1, 2].map(a => fx.motes[i + a] - eye[a]);
    const r = Math.hypot(...d);
    const c = (d[0] * f[0] + d[1] * f[1] + d[2] * f[2]) / r;
    if (r < REACH && c > CONE) {
      out.push(...d.map((x, a) => eye[a] + x), ((c - CONE) / (1 - CONE)) * (1 - r / REACH));
    }
  }
  return out;
};

/** rand in [0, 1): injectable so the tests are exact. */
export const createEffects = (rand = Math.random): Effects => {
  let phase = 0;
  /** 0 to 1: how much of the bob shows, so stopping does not snap the eye. */
  let amt = 0;
  let lean = 0;
  let clock = 0;
  /** The motes are scattered at the next update. */
  let fresh = true;
  const drift = new Float32Array(MOTES * 3);
  let last: PlayerState | undefined;
  const r2 = () => rand() * 2 - 1;

  const fx: Effects = {
    bob: 0,
    roll: 0,
    motes: new Float32Array(MOTES * 3),
    hurt: 0,
    dead: 0,

    update(me, keys, dt, dead = false) {
      const ease = Math.min(1, dt * 10);
      // Distance on the floor, a respawn (a jump of metres) excepted.
      const d = me && last?.ground && me.ground ? Math.hypot(me.x - last.x, me.z - last.z) : 0;
      if (d < 1) {
        phase += d * STRIDE;
      }
      amt += ((d > 0.5 * dt && d < 1 ? 1 : 0) - amt) * ease;
      last = me;
      fx.dead = Math.max(0, Math.min(1, fx.dead + (dead ? dt : -dt) / SINK));
      const sink = fx.dead * fx.dead * (3 - 2 * fx.dead);
      fx.bob = Math.sin(phase) * BOB * amt - sink * (EYE - LOW);

      const strafe = +!!(keys & KEY.RIGHT) - +!!(keys & KEY.LEFT);
      lean += (strafe * ROLL - lean) * Math.min(1, dt * 8);
      fx.roll = lean + sink * TILT;

      fx.hurt = Math.max(0, fx.hurt - dt);
      if (me) {
        clock += dt;
        fx.motes.forEach((m, i) => {
          const [a, h] = [i % 3, BOX[i % 3]];
          const o = a == 1 ? me.y + EYE : a ? me.z : me.x;
          drift[i] = fresh ? r2() * 0.1 : drift[i];
          const x = fresh ? o + r2() * h : m + (drift[i] + Math.sin(clock * 0.8 + i) * 0.05) * dt;
          fx.motes[i] = o + ((((x - o + h) % (2 * h)) + 2 * h) % (2 * h)) - h;
        });
        fresh = false;
      }
    },

    hit() {
      fx.hurt = HURT;
    },
  };
  return fx;
};
