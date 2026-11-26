import type { PlayerState } from '../../shared/types';
import type { Vec3 } from '../mesh';

/** What the frame draws from: the own eye and the camera (the eye plus the shake), the look, the own muzzle in the camera's space. */
export interface View {
  eye: Vec3;
  cam: Vec3;
  yaw: number;
  pitch: number;
  /** The pitch the camera draws at: the look plus the shake. */
  drawn: number;
  /** The own muzzle (the emitter) in the camera's space. */
  muzzle: Vec3;
}

export interface Combat {
  /** One live step of the own player, its state before and after: the recoil and the kick of each shot it fired, the swish and the punch of a cut. */
  step(a?: PlayerState, b?: PlayerState): void;
  /** One frame at `now` (ms): the balls, the flashes and the sounds of what changed since the last one, and the HUD. */
  frame(
    v: View | undefined,
    me: PlayerState | undefined,
    others: PlayerState[],
    keys: number,
    dt: number,
    now?: number,
  ): void;
  /** Where the own shoulder cannon is locked on (a foe's chest), or undefined: its shots' beams go there. */
  lock(at?: Vec3): void;
}

/** What the katana's sounds read of a player: the swing, the cut and whether it is in hand. */
export type Blade = Pick<
  PlayerState,
  | 'swing'
  | 'cut'
  | 'wield'
  | 'blade'
  | 'fists'
  | 'heavy'
  | 'charge'
  | 'down'
  | 'railed'
  | 'ammo'
  | 'reload'
  | 'rifled'
  | 'hot'
  | 'hits'
>;
