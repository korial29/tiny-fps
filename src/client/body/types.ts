import type { PlayerState } from '../../shared/types';
import type { Plant } from '../prints';
import type { Vec3 } from '../mesh';
import type { solve } from '../rig';

import type { Out } from '../verts';
import type { Pieces } from '../store';

export type Solved = ReturnType<typeof solve>;

export interface Body {
  /** The own player's id, -1 before the first snapshot. */
  readonly id: number;
  /** Advances dt seconds: the own player, eased (undefined before the first snapshot), the kick of the gun (0 to 1) and the aspect of the screen, which keeps the gun in a narrow one. */
  update(me: PlayerState | undefined, dt: number, kick?: number, aspect?: number): void;
  /**
   * Where the look ray ends, in the camera's space (right, up, forward), each frame: the gun points
   * at it, at least 3 m out, so that the beam leaves the emitter along its long axis.
   */
  aim(target: Vec3): void;
  /** The muzzle of the gun in the right hand, in the camera's space (right, up, forward), as of the last update. */
  muzzle(): Vec3;
  /** How far a share of the trunk's twist in a cut has turned the body as of the last update (radians, trunk()): the drawn view turns with it. */
  spun(): number;
  /** The katana in hand just struck a ball back: it snaps into the parry (DEFLECT, katana.ts) and eases back. */
  parried(): void;
  /** Its gait's footsteps so far and stride phase (Gait.steps, Gait.phase): the sounds of its steps and the bob of the view go with its feet. */
  readonly steps: number;
  readonly phase: number;
  /** Its gait's last footfall (Gait.plant), for the prints it leaves. Recreated with the gait. */
  readonly plant: Plant;
  /** The joints for a camera at `eye`; undefined without a player, or with the camera away from the body. */
  pose(eye: Vec3, yaw: number, pitch: number, roll?: number): Solved | undefined;
  /**
   * Appends the body's vertices (see STRIDE) in the jacket `color`; nothing when pose() has none.
   * Its rigid pieces go to `pieces` when given (the Hunter's armour and harpoon): kept on the GPU,
   * they carry their rest place, which their textures need, where the frame's vertices have none.
   */
  draw(
    out: Out,
    eye: Vec3,
    yaw: number,
    pitch: number,
    roll?: number,
    color?: number[],
    pieces?: Pieces,
  ): void;
  /** The own player's character (BUILD in rig.ts, PlayerInfo.body): the woman's arms are slimmer and her hands smaller, on the same grips; `tone` the skin he picked (the default's when absent). */
  wear(build: number, tone?: number[], ninja?: boolean, xeno?: boolean, hunter?: boolean): void;
}
