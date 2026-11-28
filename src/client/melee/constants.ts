// The melee hit's feedback (the user, 2026-11-28: "le max de feedback"): its numbers, shared by
// the detection, the scars and the effects of this folder.

/** Metres and radians a client's drawn foe may be past the host's strike test and still be its victim: he is drawn a little late. */
export const SLACK = [0.6, 0.35];
/** A scar: seconds it lasts, and the most a runner wears at once (the oldest goes). */
export const SCAR_LIFE = 4;
export const SCARS_MAX = 6;
/** A scar's length and half width at its middle, metres; a heavy cut's is HEAVY_SCAR times as long. */
export const SCAR = [0.38, 0.016];
export const HEAVY_SCAR = 1.3;
/** How far out of the runner's axis a scar lies, metres: on the skin of the chest, a little over it. */
export const SKIN = 0.16;
/** The height of a scar, as a share of the runner's: the chest. */
export const CHEST_AT = 0.74;
/** The claws' three streaks, metres apart. */
export const CLAW_GAP = 0.05;
/**
 * The scar's colour as it cools, unlit and above 1 so that the bloom takes it: [seconds, r, g, b]
 * keys, white hot at the cut, bright yellow and orange for a second and a half, then a dull ember.
 */
export const HEAT: number[][] = [
  [0, 3.4, 3.1, 1.8],
  [0.12, 3, 2, 0.4],
  [0.8, 2.6, 1.25, 0.14],
  [1.8, 2.1, 0.62, 0.05],
  [3, 0.9, 0.16, 0.02],
  [SCAR_LIFE, 0.35, 0.04, 0.02],
];
/** Drops of blood a hit throws, a kill's, their spray's speed and the cut's throw (m/s). */
export const [DROPS, KILL_DROPS, SPRAY, THROW] = [14, 30, 1.6, 3.2];
/** Seconds the view stands still at the own hit (the hit-stop): a hit, a heavy one, a kill. */
export const STOP = [0.055, 0.08, 0.11];
/** The strength of the own hit's shake and zoom (Effects.smite): a hit, a heavy one, a kill. */
export const SMITE_K = [1, 1.5, 2];
