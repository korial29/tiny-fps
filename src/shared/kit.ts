// The classes (the user, 2026-11-12): the marine and the ninja on the city's maps, the astronaut on
// the moon's (a map with `helmets`), the xenomorph on both (the user, 2026-11-15). A kit is what a class changes in move() and step(): the host and
// the predictor take it from the player's `role` and the map, so both run the same numbers.
import {
  AMMO_MAX,
  DOUBLE_JUMP_SPEED,
  GUN_COOLDOWN,
  GUN_MAG,
  HP_MAX,
  RAIL_CAP,
  RIFLE_CLIP,
  JUMP_SPEED,
  RAIL_MAX,
  RIFLE_COOL,
  RIFLE_MAX,
  RUN_SPEED,
  SPRINT_SPEED,
  WALLRUN_TICKS,
  PARRY,
  DASH_SPEED,
  XENO_DASH,
  XENO_HP,
  XENO_PACE,
} from './constants';
import type { WorldDef } from './world';

export const ROLE = { MARINE: 0, NINJA: 1, ASTRONAUT: 2, XENO: 3, HUNTER: 4 } as const;

export interface Kit {
  run: number;
  sprint: number;
  jump: number;
  double: number;
  /** Ticks a wall-run lasts at most. */
  wallrun: number;
  /** Dashes in a row before the full DASH_COOLDOWN; 1 is the old rule: one in the air, any on the ground. */
  dashes: number;
  /** A dash's burst, m/s: its length goes with it, the burst's ticks being everyone's. */
  dash: number;
  /** Swing ticks the katana runs down per step. */
  haste: number;
  /** What the racks fill and the packs top up to: the gun's shots, the rail gun's lightning, the rifle's rounds. */
  ammo: number;
  rail: number;
  rifle: number;
  /** Ticks between two shots of the gun and of the rifle. */
  cool: number;
  rifleCool: number;
  /** What the gun's battery, the rail gun's capsule and the rifle's cell hold. */
  mag: number;
  cap: number;
  clip: number;
  /** What a hit of his guns takes, of their damage (the host's: room.ts). */
  damage: number;
  /** His running speeds with a gun in hand, of his own. */
  slow: number;
  /** The ground's accelerations (ACCEL, SPRINT_ACCEL), as a share of the marine's. */
  accel: number;
  /** The chance his katana in hand strikes back a ball that comes at him from in front (room.ts). */
  parry: number;
  /** Health at a spawn, and what the packs heal up to. */
  hp: number;
  /** Whether the racks give him their weapons and he wears the armour pickups. */
  gear: boolean;
  /** Carries a katana from spawn. */
  katana?: boolean;
  /**
   * The xenomorph's body: claws and a tail for weapons (PUNCHES from BLOW.CLAW_L), clinging to the
   * walls (MODE.CLING), a dash's burst that pins an enemy it reaches, acid for blood (room.ts).
   */
  xeno: boolean;
  /** The Hunter's class identity, used for its weapons and alternate vision modes. */
  hunter?: boolean;
}

const MARINE: Kit = {
  run: RUN_SPEED,
  sprint: SPRINT_SPEED,
  jump: JUMP_SPEED,
  double: DOUBLE_JUMP_SPEED,
  wallrun: WALLRUN_TICKS,
  dashes: 1,
  dash: DASH_SPEED,
  haste: 1,
  ammo: AMMO_MAX,
  rail: RAIL_MAX,
  rifle: RIFLE_MAX,
  cool: GUN_COOLDOWN,
  rifleCool: RIFLE_COOL,
  mag: GUN_MAG,
  cap: RAIL_CAP,
  clip: RIFLE_CLIP,
  damage: 1,
  slow: 1,
  accel: 1,
  parry: 0,
  hp: HP_MAX,
  gear: true,
  xeno: false,
};

/**
 * Faster, higher, twice as long on a wall, three dashes in a row and twice as quick with the blade;
 * with the guns (the user, 2026-11-13) half the ammo, half the magazine, half the rate of fire, half
 * the damage, and slowed hard while one is in hand. The katana in hand strikes balls back (PARRY).
 */
const NINJA: Kit = {
  run: RUN_SPEED * 1.2,
  sprint: SPRINT_SPEED * 1.2,
  jump: JUMP_SPEED * 1.3,
  double: DOUBLE_JUMP_SPEED * 1.3,
  wallrun: WALLRUN_TICKS * 2,
  dashes: 3,
  dash: DASH_SPEED,
  haste: 2,
  ammo: AMMO_MAX / 2,
  rail: RAIL_MAX / 2,
  rifle: RIFLE_MAX / 2,
  cool: GUN_COOLDOWN * 2,
  rifleCool: RIFLE_COOL * 2,
  mag: Math.ceil(GUN_MAG / 2),
  cap: RAIL_CAP / 2,
  clip: RIFLE_CLIP / 2,
  damage: 0.5,
  slow: 0.55,
  accel: 1,
  parry: PARRY,
  katana: true,
  hp: HP_MAX,
  gear: true,
  xeno: false,
};

/**
 * No weapon, no armour, more health; it climbs any wall, so it needs no wall-run of its own.
 * XENO_PACE as fast as a man on the ground, a little only, or no one could fight it (the user,
 * 2026-11-16), getting there as quickly, and its jumps twice as high: a jump's height goes as the
 * square of its speed. It dashes as a man does, further (XENO_DASH) and three in a row (the user,
 * 2026-11-16, in place of the charged pounce).
 */
const XENO: Kit = {
  ...MARINE,
  run: RUN_SPEED * XENO_PACE,
  sprint: SPRINT_SPEED * XENO_PACE,
  jump: JUMP_SPEED * Math.SQRT2,
  double: DOUBLE_JUMP_SPEED * Math.SQRT2,
  dashes: 3,
  dash: DASH_SPEED * XENO_DASH,
  accel: XENO_PACE,
  ammo: 0,
  rail: 0,
  rifle: 0,
  mag: 0,
  cap: 0,
  clip: 0,
  hp: XENO_HP,
  gear: false,
  xeno: true,
};

/** The Hunter starts with the wrist blades and carries the harpoon and shoulder laser loadout. */
const HUNTER: Kit = { ...MARINE, katana: true, hunter: true, ammo: 12, mag: 1 };

/** By ROLE. The astronaut moves and fights as the marine: the moon's gravity is the map's. */
export const KITS: readonly Kit[] = [MARINE, NINJA, MARINE, XENO, HUNTER];

/** Ticks after a dash's start before the next of a chain: the burst and a breath. */
export const DASH_GAP = 16;

/**
 * The classes a map offers, the first one the default: on a map with space helmets the astronaut
 * and the xenomorph, who breathes none.
 */
export const rolesOf = (def: Pick<WorldDef, 'helmets'>): number[] =>
  def.helmets
    ? [ROLE.ASTRONAUT, ROLE.XENO, ROLE.HUNTER]
    : [ROLE.MARINE, ROLE.NINJA, ROLE.XENO, ROLE.HUNTER];

/** The class a player plays on the map: his `role` when the map offers it, else the map's default. */
export const roleOf = (role: number | undefined, def: Pick<WorldDef, 'helmets'>): number => {
  const all = rolesOf(def);
  return all.includes(role ?? -1) ? role! : all[0];
};

/**
 * The build (BODY) a player is drawn with: the one picked, but the xenomorph's skin is cut on the
 * man's skeleton (the user, 2026-11-16: no gender for it). The choice is kept for another class.
 */
export const buildOf = (
  p: { role?: number; body?: number },
  def: Pick<WorldDef, 'helmets'>,
): number => (roleOf(p.role, def) == ROLE.XENO ? 0 : (p.body ?? 0));

export const kitOf = (role: number | undefined, def: Pick<WorldDef, 'helmets'>): Kit =>
  KITS[roleOf(role, def)];
