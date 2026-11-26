import { swingOf } from '../../shared/blade';
import { BLOW, PUNCHES, TAILS } from '../../shared/constants';
import type { PlayerState } from '../../shared/types';
import { axis, mul } from '../rig';
import type { Quat } from '../rig';
import { X, Y, Z } from './maths';

/**
 * An arm's pose, the upper arm then the forearm, as the gait builds them: `s` 1 the right, -1 the
 * left; the upper arm's lift forward, out to the side and turn inward, and the elbow's bend.
 */
export const armOf = (s: number, [lift, out, inward, bend]: number[]): [Quat, Quat] => [
  mul(mul(axis(Z, s * (0.06 + out)), axis(X, lift)), axis(Y, s * inward)),
  axis(X, 0.15 + bend),
];
/**
 * A punch from the guard (the user, 2026-11-11), a karate reverse punch: the rear hand (the left)
 * driven straight out at the chest's height, the lead one drawn back to the hip, the chest turned
 * behind the blow (radians, the left shoulder forward).
 */
export const JAB = { out: [1.42, 0, 0.1, 0], back: [0.1, 0.12, 0.25, 1.9], twist: 0.4 };

/**
 * The other blows (BLOW, the user 2026-11-13), as JAB's arms: the HOOK's left arm swung round at
 * the shoulder's height, the elbow bent square and out, the chest turned behind it; the LUNGE's right
 * arm driven straight out, further than a jab, the chest turned the other way.
 */
export const HOOK = { out: [1.2, 1.1, 0.1, 1.5], twist: 0.45 };
export const LUNGE = { out: [1.52, -0.05, 0.05, 0], twist: 0.55 };

/** Any strike of the xenomorph's tail, as a blow: none of BLOW's, told apart for its arm and its sound. */
export const TAIL_BLOW = 6;

/** The striking arm of each blow (BLOW): -1 the left, 1 the right; the xenomorph's claws, and its tail (TAIL_BLOW), which takes no arm (0). */
export const SIDE = [-1, 1, -1, 1, -1, 1, 0];

/** Whether the player has no weapon at all: FIRE punches. */
export const bare = (p: PlayerState): boolean =>
  !!p.fists || (p.ammo < 0 && !p.blade && (p.rail ?? -1) < 0 && (p.rifle ?? -1) < 0);

/**
 * The blow (BLOW) of a bare-handed swing. The xenomorph's (`xeno`) cut reads TAILS: its claws, else
 * its tail's TAIL_BLOW.
 */
export const blowOf = (p: Pick<PlayerState, 'cut'>, xeno = false): number => {
  const c = p.cut ?? 0;
  return xeno ? (c == BLOW.CLAW_L || c == BLOW.CLAW_R ? c : TAIL_BLOW) : PUNCHES[c] ? c : BLOW.JAB;
};

/** The numbers of the swing a bare-handed player is in: the blow's, or the xenomorph's (TAILS, a heavy one's own). */
export const blowing = (p: Pick<PlayerState, 'cut' | 'heavy'>, xeno = false) =>
  xeno ? swingOf(p, TAILS) : PUNCHES[blowOf(p)];

/**
 * How far out the fist of a punch is, 0 to 1, by the swing of a player with no weapon at all: out
 * at the strike of its blow, back by the swing's end. None for the xenomorph's tail.
 */
export const thrown = (p: PlayerState, xeno = false): number => {
  if (!bare(p) || !p.swing || p.down || blowOf(p, xeno) == TAIL_BLOW) {
    return 0;
  }
  const b = blowing(p, xeno);
  const [k, at] = [1 - p.swing / b.ticks, b.strike / b.ticks];
  const e = (v: number) => Math.min(Math.max(v, 0), 1) ** 2 * (3 - 2 * Math.min(Math.max(v, 0), 1));
  return k < at ? e(k / at) : 1 - e((k - at) / (1 - at));
};
