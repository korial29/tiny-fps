// Client prediction and interpolation: no DOM, unit-tested.
// The own player runs ahead of the host: each local step applies the input with the shared
// physics and keeps it until the host acks it. On a snapshot the own player is reset to the
// host's state and the unacked inputs are replayed on top. Other players are drawn
// INTERP_DELAY in the past, interpolated between the two snapshots around that time.
import type { Input, MapDef, PlayerState, Snapshot } from '../shared/types';

export interface Predictor {
  /** The own player id, from the roster. Snapshots before it are only used for the others. */
  you(id: number): void;
  /**
   * One local step: gives the input the next seq, moves the own player with it, keeps it for
   * replay, and returns it for the caller to send. A no-op returning the input with its seq
   * when the own player is not known yet.
   */
  step(i: Omit<Input, 'seq'>): Input;
  /** A decoded snapshot, received at `now` (ms, performance.now()). */
  snapshot(s: Snapshot, now: number): void;
  /**
   * The own player, eased between the state before and after the last step by alpha in [0, 1]
   * (the share of a step elapsed since it), so the camera moves smoothly at any frame rate.
   * Undefined until a snapshot shows the own player.
   */
  me(alpha: number): PlayerState | undefined;
  /** The other players at now - INTERP_DELAY; a player missing from the latest snapshot is gone. */
  others(now: number): PlayerState[];
}

export const createPredictor = (_map: MapDef): Predictor => {
  throw new Error('todo');
};
