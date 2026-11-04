import type { Rules } from './types';

// World units are metres. y is up; yaw 0 looks toward -z (see forward in physics.ts).

/** Physics steps per second: one client input per step, the host steps a player per input. */
export const TICK_HZ = 60;
/** A snapshot goes out every SNAP_EVERY host ticks: 60 / 2 = 30 Hz. */
export const SNAP_EVERY = 2;
/**
 * Render delay of the other players, interpolated between snapshots, in ms: about three snapshot
 * intervals, so one lost or late snapshot does not freeze them. The own player is predicted.
 */
export const INTERP_DELAY = 100;

/** Player cylinder. */
export const PLAYER_R = 0.4;
export const PLAYER_H = 1.8;
/** Camera height above the feet. */
export const EYE = 1.6;

/** Metres per second. */
export const RUN_SPEED = 6;
export const JUMP_SPEED = 7;
/** Metres per second squared. */
export const GRAVITY = 20;
/** Pitch is clamped to ±MAX_PITCH radians, just short of straight up or down. */
export const MAX_PITCH = 1.55;
/** A floor at most this much higher is walked onto; a higher one needs a jump. */
export const STEP_H = 0.5;

/** Steps between two chaingun shots while the trigger is held: 60 / 5 = 12 shots per second. */
export const FIRE_EVERY = 5;
/** Speed factor while the trigger is held. */
export const FIRE_SLOW = 0.5;
/** Metres a shot reaches. */
export const RANGE = 100;
/** Largest angle, in radians, between a shot and the view direction. */
export const SPREAD = 0.02;
/**
 * Host ticks a shot may look back (0.5 s): the host rewinds the targets to the view tick of the
 * input that fired, clamped to this.
 */
export const MAX_REWIND = 30;

/**
 * Host-side speed-hack guard: each player earns one input per host tick and may bank up to
 * INPUT_BURST of them; inputs beyond the bank are dropped (and not acked).
 */
export const INPUT_BURST = 10;

export const MAX_PLAYERS = 16;
/** Monsters alive at once at most; their ids run from MAX_PLAYERS to MAX_PLAYERS + MAX_MONSTERS - 1. */
export const MAX_MONSTERS = 64;

// Monsters. Times are host ticks (TICK_HZ), distances metres, speeds metres per second.
export const WALKER_R = 0.4;
export const WALKER_H = 1.8;
export const WALKER_SPEED = 2.5;
export const FLYER_R = 0.45;
export const FLYER_H = 0.9;
/** A flyer's underside floats this high above the floor below it, ceilings allowing. */
export const FLYER_HOVER = 1.2;
export const FLYER_SPEED = 3.5;
/** Each monster looks for players once per SIGHT_EVERY ticks (staggered), in a cone this wide. */
export const SIGHT_EVERY = 60;
export const SIGHT_COS = Math.cos(Math.PI / 6);
export const SIGHT_RANGE = 30;
/** A monster that sees a player or dies alerts the others within ALERT_R that can see it. */
export const ALERT_R = 12;
/** A chasing monster this close (centre to centre, on the floor plane) swings, once per MELEE_EVERY. */
export const MELEE_R = 1.4;
export const MELEE_EVERY = 45;
/** A chasing walker that sees its target fires once per SHOOT_EVERY ticks. */
export const SHOOT_EVERY = 90;
export const BULLET_SPEED = 12;
export const BULLET_R = 0.15;
/** Ticks a bullet lives at most. */
export const BULLET_LIFE = 300;

// Health and progression. Times are host ticks.
export const HEALTH = 9;
/** A hit takes 1 health, then the player cannot be hurt for HIT_COOLDOWN ticks. */
export const HIT_COOLDOWN = 60;
/** Every DROP_EVERY-th kill of the team leaves a HEALTH pickup where the monster died. */
export const DROP_EVERY = 4;
export const HEAL = 3;
/** A player whose axis comes this close to a pickup (on the floor plane) takes it. */
export const PICKUP_R = 0.8;
export const GOAL_R = 1;
/** A dead player comes back at the level start after this long. */
export const PLAYER_RESPAWN = 180;
/** Hard mode (second run on): monster speed factor, and the share of SHOOT_EVERY and MELEE_EVERY. */
export const HARD_SPEED = 1.3;
export const HARD_RATE = 0.6;
/** Longest player name, in characters (code points). */
export const MAX_NAME = 16;

export const RULES: Rules = {
  maxPlayers: MAX_PLAYERS,
};
