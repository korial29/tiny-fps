// Which weapon a gun model is, and how each kind sits in the hand.
import type { PlayerState } from '../../shared/types';
import { hunterPistol } from '../pistol';
import { TILT } from './sidearm';

/** The Hunter's pistol: its own model (pistol.ts), on the gun's marks. */
export const hunterGun = (lod: number): number[] => hunterPistol(Math.min(lod, 1));
/** The weapon a gun model is, from a player or a flag: 0 the gun, 2 the rail gun (or true), 3 the laser rifle. */
export const kindOf = (p: Pick<PlayerState, 'railed' | 'rifled'> | boolean | number): number =>
  typeof p == 'number' ? p : typeof p == 'boolean' ? +p * 2 : p.rifled ? 3 : p.railed ? 2 : 0;

/**
 * The tilt of a long gun's grip in the hand, as TILT: the rail gun's and the rifle's are held at
 * the shoulder, the forearm rising to the grip from an elbow under it. With the pistol's tilt the
 * knuckles pointed 23 degrees under the barrel and the wrist was bent 70 degrees and more on the
 * grip (the user, 2026-11-25: a natural, anatomically correct hold). Here they point LONG_RAKE
 * radians over the barrel, toward the forearm's line, on a grip that stands nearly upright.
 */
const LONG_RAKE = 0.1;
export const LONG_TILT = [-Math.sin(LONG_RAKE), Math.cos(LONG_RAKE)];
/**
 * Where a fist holds a grip, from the wrist: metres along the fingers and toward the palm (FIST in
 * body.ts), and how closed it is. A long gun's is held further into an opener hand: its grip, 2.6
 * cm across, lies on the palm inside the fingers, which go round its front and close on its far
 * side. In the fist of 0.9 that holds the pistol they went through it (the user, 2026-11-25).
 */
const HOLD = [0.078, 0.022];
export const LONG_HOLD = [0.066, 0.029];
export const LONG_CURL = 0.72;
/** The hold of a weapon of `kind` (kindOf()) in the hand that has its grip. */
export const holdOf = (kind: boolean | number = 0) => (kindOf(kind) >= 2 ? LONG_HOLD : HOLD);
/** The grip's tilt in the hand for a weapon of `kind` (kindOf()): the pistol's, or a long gun's. */
export const tiltOf = (kind: boolean | number = 0) => (kindOf(kind) >= 2 ? LONG_TILT : TILT);
