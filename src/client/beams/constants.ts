// The tracer's timings, counts, sizes and colours.

/** Seconds a muzzle flash, a splash and a spark last. */
export const FLASH = 0.06;
export const SPLASH = 0.16;
export const SPARK = 0.22;
/** Seconds a grenade's fireball lasts, and its embers; the embers thrown. */
export const BOOM = 0.45;
/** Seconds the rail gun's ring of lightning lasts. */
export const TESLA = 0.5;
export const EMBER = 0.7;
/**
 * The harpoon bolt's impact (the user, 2026-11-24: a shock, not a blue laser splash): seconds it
 * lasts, the seconds of its white-hot flash, its puffs of dust and their colour, and the sparks of
 * steel it throws.
 */
export const IMPACT = 0.35;
export const IMPACT_FLASH = 0.05;
export const DUST_PUFFS = 9;
export const DUST = [0.5, 0.46, 0.4];
export const STEEL_SPARKS = 16;
/** Seconds a drop of blood flies, and its colour (the user, 2026-11-16: blood as the xenomorph eats). */
export const GORE = 0.6;
export const BLOOD = [0.55, 0.02, 0.015];
export const EMBERS = 40;
/** The fireball's radius at its widest, as a share of NADE_R, its puffs, and its colours from the outside in. */
export const FIRE = 0.35;
export const PUFFS = 6;
export const BLAZE = [
  [1.3, 0.16, 0.02],
  [2.2, 0.62, 0.08],
  [3.2, 2.2, 1],
];
/** Sparks to a burst, and kept at most. */
export const SPARKS = 12;
export const MAX = 16;
/**
 * A pistol's or a laser rifle's burst (the user, 2026-11-28: finer, leaving a mark of molten
 * metal, melt/): its splash's widest radius as a share of the ball's halo [pistol, rifle] (the
 * user, 2026-11-28: the rifle's red ball a quarter of the pistol's, too coarse over the mark), and
 * its sparks and their speed [pistol, rifle].
 */
export const SPLASH_WIDE = [0.45, 0.45 / 4];
export const BURST_SPARKS = [5, 7];
export const BURST_SPEED = [2.2, 2.8];
/** Seconds a bolt lasts, bolts kept at most, and the sparks of a shock. */
export const BOLT = 0.05;
export const BOLTS = 96;
export const SHOCK_SPARKS = 10;
/** The rail gun's lightning: [halo, core] half widths and colours, and its metres per kink. */
export const ZAP: [number, number[]][] = [
  [0.035, [0.45, 0.3, 1.5]],
  [0.009, [1.6, 1.3, 3]],
];
export const KINK = 0.6;
/** Balls that light what they pass, the nearest first. */
export const LIT = 4;
/**
 * A strike's lasers: seconds they last, how many come down on one player, from how high and how far
 * aside up there with no muzzle, how far round the muzzle, and their [halo, core] half widths and colours.
 */
export const [RAY, RAYS, SKY, SPREAD, BORE] = [1.4, 4, 380, 70, 2.2];
/**
 * The shoulder cannon's shot (the user, 2026-11-23: a laser like the pistol's): a red ball the
 * pistol's size that flies from the muzzle at PLASMA_SPEED, its trail growing to TRAIL, and bursts
 * where it ends. The host has already dealt its hit; this only shows it.
 */
export const CANNON_TRAIL = 1.2;
/** The thrown disc's trail: times the ball's trail, and its [halo, core] half widths and blues. */
export const DISC_TRAIL = 2.5;
export const DISC_GLOW: [number, number[]][] = [
  [0.09, [0.12, 0.35, 2.2]],
  [0.03, [0.7, 1.4, 3.2]],
];
/** The disc's turns a second, in radians, and its bank into its flight. */
export const DISC_SPIN = 30;
export const DISC_BANK = 0.35;
export const LASER: [number, number[]][] = [
  [0.3, [1.9, 0.22, 0.1]],
  [0.09, [3.6, 1.7, 1.2]],
];

/** The katana's bolts: [halo, core] widths in metres and colours, and the lift of the core. */
export const RIBBONS: [number, number[], number][] = [
  [0.022, [0.4, 0.15, 1.3], 0],
  [0.007, [0.7, 1.7, 2.2], 0.02],
];
/** A ball's halo and core: radius, colour, lift toward the eye; its trail is as wide as each at the head. */
export const BALL: [number, number[], number][] = [
  [0.22, [0.2, 0.45, 1.6], 0],
  [0.08, [2, 2.6, 3.6], 0.04],
];
/** The same in red, for the laser rifle's balls (power 0) and their flash (hot below 0). */
export const RED = [
  [1.6, 0.12, 0.08],
  [2.8, 0.9, 0.6],
];
/** The same in green, for a rover's laser bolts (power BOLT). */
export const GREEN = [
  [0.1, 1.5, 0.22],
  [0.9, 3.2, 1.2],
];
/** The same in orange, for a charged ball, a charged flash and a charging muzzle. */
export const HOT = [
  [1.1, 0.26, 0.04],
  [1.5, 0.42, 0.06],
];
/** Ball's colour `k` of the way (0 to 1) from cyan to orange. */
export const tint = (rgb: number[], i: number, k: number) =>
  rgb.map((c, j) => c + (HOT[i][j] - c) * k);
