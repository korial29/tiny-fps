// Camera and gun feel, fed each frame: head bob, roll, shake, gun kick, barrel spin, muzzle flash
// and impact sparks. No DOM, times in seconds, unit-tested.
import { RANGE } from '../shared/constants';
import { TAU } from '../shared/physics';
import { KEY } from '../shared/types';
import type { PlayerState, Shot } from '../shared/types';

type Vec3 = [number, number, number];

export interface Spark {
  p: Vec3;
  v: Vec3;
  /** Seconds left. */
  life: number;
}

/** What the renderer and the camera read; update and shot move it. */
export interface Effects {
  /** Vertical eye offset, metres. */
  bob: number;
  /** Radians, positive leans right (strafing right). */
  roll: number;
  /** Camera yaw and pitch jitter, radians. */
  shakeYaw: number;
  shakePitch: number;
  /** Recoil, 1 at a shot down to 0. */
  kick: number;
  /** Barrel angle, radians. */
  spin: number;
  /** Seconds of own muzzle flash left. */
  flash: number;
  /** Seconds of flash left at each other shooter, by player id. */
  flashes: Map<number, number>;
  sparks: Spark[];
  /** Advances dt seconds: the own player (eased, undefined before the first snapshot) and the held keys. */
  update(me: PlayerState | undefined, keys: number, dt: number): void;
  /**
   * A shot, from the shooter's eye; own ones kick the camera and the gun. No sparks with
   * `sparks` false: a shot that hit the viewer would burst them inside the camera.
   */
  shot(s: Shot, from: Vec3, own: boolean, sparks?: boolean): void;
}

const FLASH = 0.05;
const LIFE = 0.3;
const MAX_SPARKS = 96;
/** Bob phase per metre walked, and its amplitude in metres. */
const STRIDE = 4.4;
const BOB = 0.035;
const ROLL = 0.03;
const SPIN_MAX = 30;

/** rand in [0, 1): injectable so the tests are exact. */
export const createEffects = (rand = Math.random): Effects => {
  let phase = 0;
  /** 0 to 1: how much of the bob shows, so stopping does not snap the eye. */
  let amt = 0;
  let shake = 0;
  let rate = 0;
  let last: PlayerState | undefined;
  const r2 = () => rand() * 2 - 1;

  const fx: Effects = {
    bob: 0,
    roll: 0,
    shakeYaw: 0,
    shakePitch: 0,
    kick: 0,
    spin: 0,
    flash: 0,
    flashes: new Map(),
    sparks: [],

    update(me, keys, dt) {
      const ease = Math.min(1, dt * 10);
      // Distance on the floor, a respawn (a jump of metres) excepted.
      const d = me && last?.ground && me.ground ? Math.hypot(me.x - last.x, me.z - last.z) : 0;
      if (d < 1) {
        phase += d * STRIDE;
      }
      amt += ((d > 0.5 * dt && d < 1 ? 1 : 0) - amt) * ease;
      last = me;
      fx.bob = Math.sin(phase) * BOB * amt;

      const strafe = +!!(keys & KEY.RIGHT) - +!!(keys & KEY.LEFT);
      fx.roll += (strafe * ROLL - fx.roll) * Math.min(1, dt * 8);

      shake *= Math.exp(-dt * 12);
      fx.shakeYaw = r2() * shake;
      fx.shakePitch = r2() * shake;
      fx.kick *= Math.exp(-dt * 18);
      fx.flash = Math.max(0, fx.flash - dt);
      for (const [id, t] of fx.flashes) {
        if (t > dt) {
          fx.flashes.set(id, t - dt);
        } else {
          fx.flashes.delete(id);
        }
      }

      rate = Math.max(0, Math.min(SPIN_MAX, rate + (keys & KEY.FIRE ? 60 : -25) * dt));
      fx.spin = (fx.spin + rate * dt) % TAU;

      for (const s of fx.sparks) {
        s.v[1] -= 9.8 * dt;
        s.p = s.p.map((x, i) => x + s.v[i] * dt) as Vec3;
        s.life -= dt;
      }
      fx.sparks = fx.sparks.filter(s => s.life > 0);
    },

    shot(s, from, own, sparks = true) {
      if (own) {
        fx.kick = 1;
        fx.flash = FLASH;
        shake = 0.012;
      } else {
        fx.flashes.set(s.id, FLASH);
      }
      const at: Vec3 = [s.x, s.y, s.z];
      const back = from.map((x, i) => x - at[i]);
      const len = Math.hypot(...back);
      // A shot that reached RANGE hit nothing near.
      if (sparks && len > 0 && len < RANGE - 0.01) {
        for (let i = 0; i < 4 && fx.sparks.length < MAX_SPARKS; i++) {
          const v = back.map(x => (x / len) * (2 + rand() * 2) + r2()) as Vec3;
          v[1] += 1;
          fx.sparks.push({ p: at, v, life: LIFE * (0.6 + rand() * 0.4) });
        }
      }
    },
  };
  return fx;
};
