import type { PlayerState } from '../../shared/types';
import type { Plant } from '../prints';
import type { Pose } from '../rig';

/** The height of the ground at (x, z), for feet that stand on stairs and slopes. */
export type Floor = (x: number, z: number) => number;

/** The seat of a player in a rover (MODE.RIDE): the rover's attitude and its front wheels' angle, and the seat, 0 the driver's, 1 the rider's. */
export interface Seat {
  yaw: number;
  pitch: number;
  roll: number;
  steer: number;
  s: number;
}

export interface Gait {
  /**
   * Moves to the state `p` after dt seconds. Without `floor` the feet stand on y = p.y. `seat` is
   * where a player who rides sits: without it he sits level, a rider, facing his look.
   */
  update(p: PlayerState, dt: number, floor?: Floor, seat?: Seat): void;
  /** The pose now: one object, rewritten by each call. */
  pose(): Pose;
  /** Stride phase, in cycles: the left foot lands at 0 and the right one at a half. */
  readonly phase: number;
  /** Footsteps so far: a foot set down, or along a wall each half of the stride. */
  readonly steps: number;
  /** The last foot set down flat (not along a wall): one object, rewritten at each footfall. */
  readonly plant: Plant;
}
export interface Foot {
  /** The ankle now. */
  x: number;
  y: number;
  z: number;
  /** Planted: where the flat foot stands, and the ground height there. */
  px: number;
  pz: number;
  gy: number;
  /** Swing: where the ankle left, the stride phase it left at, and the ground height it lands on. */
  lx: number;
  ly: number;
  lz: number;
  dl: number;
  tg: number;
  /** Stride phase last frame, how far along the stance (0 to 1), and the weight it has on the pelvis. */
  u: number;
  x0: number;
  w: number;
  /** Pitch of the foot, toes up positive, and how much of the toes' bend against it holds. */
  th: number;
  tw: number;
  /** The way the foot points: kept while it stands, turned in the swing from `la`, the way it left. */
  fy: number;
  la: number;
  /** The pitch it left with. */
  lt: number;
  /** How far along a step taken standing is, 0 to 1, on its own clock; -1 in a stride. */
  k: number;
  on: boolean;
}
