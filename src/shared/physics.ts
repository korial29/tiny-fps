// Player movement, shared by the host and the client's prediction: no DOM, no Node API.
// Deterministic for a given state and input, so the client's replay of unacked inputs lands where
// the host does (give or take the wire's fixed point, corrected on each snapshot).
import type { Input, MapDef, PlayerState } from './types';

/** Unit vector the player faces at yaw, on the floor plane: yaw 0 looks toward -z. */
export const forward = (yaw: number): [x: number, z: number] => [-Math.sin(yaw), -Math.cos(yaw)];

/**
 * Applies one input for 1 / TICK_HZ s, in place: yaw and pitch from the input (pitch clamped to
 * MAX_PITCH), RUN_SPEED along the held keys (diagonals not faster), a jump from the ground,
 * GRAVITY, then collisions: the player cylinder (PLAYER_R, PLAYER_H) slides along box sides,
 * lands on box tops and on the floor (y 0), and bumps its head on box bottoms.
 */
export const move = (_p: PlayerState, _i: Input, _map: MapDef): void => {
  throw new Error('todo');
};

/** A player standing at spawn point n of the map (modulo the count). */
export const spawn = (_id: number, _map: MapDef, _n: number): PlayerState => {
  throw new Error('todo');
};
