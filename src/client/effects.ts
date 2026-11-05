// Camera feel, fed each frame: head bob and roll. No DOM, times in seconds, unit-tested.
import { KEY } from '../shared/types';
import type { PlayerState } from '../shared/types';

/** What the renderer and the camera read; update moves it. */
export interface Effects {
  /** Vertical eye offset, metres. */
  bob: number;
  /** Radians, positive leans right (strafing right). */
  roll: number;
  /** Advances dt seconds: the own player (eased, undefined before the first snapshot) and the held keys. */
  update(me: PlayerState | undefined, keys: number, dt: number): void;
}

/** Bob phase per metre walked, and its amplitude in metres. */
const STRIDE = 4.4;
const BOB = 0.035;
const ROLL = 0.03;

export const createEffects = (): Effects => {
  let phase = 0;
  /** 0 to 1: how much of the bob shows, so stopping does not snap the eye. */
  let amt = 0;
  let lean = 0;
  let last: PlayerState | undefined;

  const fx: Effects = {
    bob: 0,
    roll: 0,

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
      lean += (strafe * ROLL - lean) * Math.min(1, dt * 8);
      fx.roll = lean;
    },
  };
  return fx;
};
