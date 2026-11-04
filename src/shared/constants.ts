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

/**
 * Network fixed point: a coordinate travels as round(v * SCALE) in a Uint16, so 0 to
 * 65535 / SCALE = 127.99 m at 2 mm steps. Maps stay inside [0, 127] on x, y and z.
 */
export const SCALE = 512;
/** A vertical speed travels as round(vy * VY_SCALE) in an Int16: ±327 m/s at 1 cm/s. */
export const VY_SCALE = 100;

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
