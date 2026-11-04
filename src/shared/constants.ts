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
/** Longest player name, in characters (code points). */
export const MAX_NAME = 16;

export const RULES: Rules = {
  maxPlayers: MAX_PLAYERS,
};
