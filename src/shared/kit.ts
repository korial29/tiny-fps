// The classes (the user, 2026-11-12): the marine and the ninja on the city's maps, the astronaut alone
// on the moon's (a map with `helmets`). A kit is what a class changes in move() and step(): the host and
// the predictor take it from the player's `role` and the map, so both run the same numbers.
import {
  AMMO_MAX,
  DOUBLE_JUMP_SPEED,
  GUN_COOLDOWN,
  JUMP_SPEED,
  RAIL_MAX,
  RIFLE_COOL,
  RIFLE_MAX,
  RUN_SPEED,
  SPRINT_SPEED,
  WALLRUN_TICKS,
} from './constants';
import type { WorldDef } from './world';

export const ROLE = { MARINE: 0, NINJA: 1, ASTRONAUT: 2 } as const;

export interface Kit {
  run: number;
  sprint: number;
  jump: number;
  double: number;
  /** Ticks a wall-run lasts at most. */
  wallrun: number;
  /** Dashes in a row before the full DASH_COOLDOWN; 1 is the old rule: one in the air, any on the ground. */
  dashes: number;
  /** Swing ticks the katana runs down per step. */
  haste: number;
  /** What the racks fill and the packs top up to: the gun's shots, the rail gun's lightning, the rifle's rounds. */
  ammo: number;
  rail: number;
  rifle: number;
  /** Ticks between two shots of the gun and of the rifle. */
  cool: number;
  rifleCool: number;
}

const MARINE: Kit = {
  run: RUN_SPEED,
  sprint: SPRINT_SPEED,
  jump: JUMP_SPEED,
  double: DOUBLE_JUMP_SPEED,
  wallrun: WALLRUN_TICKS,
  dashes: 1,
  haste: 1,
  ammo: AMMO_MAX,
  rail: RAIL_MAX,
  rifle: RIFLE_MAX,
  cool: GUN_COOLDOWN,
  rifleCool: RIFLE_COOL,
};

/** Faster, higher, twice as long on a wall, three dashes in a row and twice as quick with the blade; half the ammo, half the rate of fire. */
const NINJA: Kit = {
  run: RUN_SPEED * 1.2,
  sprint: SPRINT_SPEED * 1.2,
  jump: JUMP_SPEED * 1.15,
  double: DOUBLE_JUMP_SPEED * 1.15,
  wallrun: WALLRUN_TICKS * 2,
  dashes: 3,
  haste: 2,
  ammo: AMMO_MAX / 2,
  rail: RAIL_MAX / 2,
  rifle: RIFLE_MAX / 2,
  cool: GUN_COOLDOWN * 2,
  rifleCool: RIFLE_COOL * 2,
};

/** By ROLE. The astronaut moves and fights as the marine: the moon's gravity is the map's. */
export const KITS: readonly Kit[] = [MARINE, NINJA, MARINE];

/** Ticks after a dash's start before the next of a chain: the burst and a breath. */
export const DASH_GAP = 16;

/** The classes a map offers, the first one the default: the astronaut alone on a map with space helmets. */
export const rolesOf = (def: Pick<WorldDef, 'helmets'>): number[] =>
  def.helmets ? [ROLE.ASTRONAUT] : [ROLE.MARINE, ROLE.NINJA];

/** The class a player plays on the map: his `role` when the map offers it, else the map's default. */
export const roleOf = (role: number | undefined, def: Pick<WorldDef, 'helmets'>): number => {
  const all = rolesOf(def);
  return all.includes(role ?? -1) ? role! : all[0];
};

export const kitOf = (role: number | undefined, def: Pick<WorldDef, 'helmets'>): Kit =>
  KITS[roleOf(role, def)];
