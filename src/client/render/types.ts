import type { Choice, PlayerState, Rover } from '../../shared/types';
import type { Body } from '../body';
import type { Tracer } from '../beams';
import type { Effects } from '../effects';
import type { CtfScene } from '../flag';
import type { Light } from '../lights';
import type { Vec3 } from '../mesh';
import type { Out } from '../verts';

import type { Shot } from './shots';

/** A texture and the framebuffer that draws into it. */
/** What targets() builds, and how to delete it. */
export interface Targets {
  made: number[];
  hdr: Target;
  orb: Target | undefined;
  bloom: [Target, Target][];
  msaa: WebGLFramebuffer;
  owned: (() => void)[];
}

export interface Target {
  t: WebGLTexture;
  f: WebGLFramebuffer;
  w: number;
  h: number;
}

export interface FrameView {
  width: number;
  height: number;
  now: number;
}

export interface Renderer {
  /**
   * Draws one frame: the sky, the brushes and the others as seen from eye, then the own `body` over
   * a cleared depth, lit but casting no shadow. colors maps player id to CSS.
   */
  frame(
    eye: Vec3,
    yaw: number,
    pitch: number,
    others: PlayerState[],
    colors: ReadonlyMap<number, string>,
    fx: Effects,
    /** gather() in lights.ts: at most MAX_LIGHTS, the first MAX_SHADOWS shadowed spots mapped, besides the sun. */
    lights: Light[],
    body?: Body,
    /** The bases, the flags, the racks and the health packs: drawn lit, casting shadows, with the other players. */
    ctf?: CtfScene,
    /** The plasma balls, the flashes and the sparks: they glow and cast no shadow. */
    tracer?: Tracer,
    /** The map's rovers (Predictor.rovers()): drawn lit, casting shadows, with the other players. */
    rovers?: Rover[],
    /** The own player when the camera is not in his head (seated in a rover): drawn whole, like the others. */
    self?: PlayerState,
    /** Adds what else moves in the map (the doors): drawn lit, casting shadows, with the other players. */
    more?: (v: Out) => void,
    view?: FrameView,
  ): boolean;
  /** A world point on screen as of the last frame, in [0, 1] from the top left. */
  project(x: number, y: number, z: number): [number, number] | undefined;
  /** The footsteps of the player `id`'s runner so far (Gait.steps), undefined before it is drawn. */
  steps(id: number): number | undefined;
  /** The muzzle of the long gun of the player `id`'s runner as last drawn, from his feet (Runner.tip). */
  muzzle(id: number): Vec3 | undefined;
  /** The runners of the players `ids` grin for a moment: their team has captured. */
  cheer(ids: number[]): void;
  /** The katana of player `id` struck a ball back, seen `late` s before he is drawn there: his runner parries. */
  parried(id: number, late: number): void;
  /** The xenomorph's vision (the own player is one): a grey-blue world, the enemies in sight glowing. */
  vision(on: boolean): void;
  /** The Hunter's local vision filter and the players it can detect. */
  hunterVision(mode: number, targets: PlayerState[], cold?: PlayerState[]): void;
  /** Let eligible glory kill targets flash during play. */
  edge(on: boolean): void;
  /** The body of each player (PlayerInfo.body, BODY), from the roster: the man's for one not in it; and the skin and haircut he picked, his id's for one not in `looks`. */
  wear(builds: ReadonlyMap<number, number>, looks?: ReadonlyMap<number, Choice>): void;
  /**
   * A picture of the player `p` as the character `build` in `color`, with the skin and haircut
   * `look`, framed by `shot` (PORTRAIT, or HEAD for the head alone), into the 2D canvas `into`: a frame of him alone in the map's sky, which the next
   * frame() replaces on the screen. False when nothing could be drawn yet.
   */
  portrait(
    into: HTMLCanvasElement,
    p: PlayerState,
    build: number,
    color: string,
    look?: Choice,
    shot?: Shot,
  ): boolean;
  destroy(): void;
}
