import { EYE, STEP_H } from '../../shared/constants';
import { ROLE } from '../../shared/kit';
import { MODE } from '../../shared/types';
import type { Choice, PlayerState, Rover } from '../../shared/types';
import { ray } from '../../shared/world';
import type { World } from '../../shared/world';
import { createFace, dashing } from '../expression';
import { CH } from '../features';
import { createFours } from '../fours';
import { createGait } from '../gait';
import type { Floor, Seat } from '../gait';
import { basis } from '../mesh';
import type { Vec3 } from '../mesh';
import { shaved } from '../skin';
import { createTrail } from '../trail';
import { far } from './common';
import { fried, grasp } from './grasp';
import type { Runner } from './types';

/** A man's haircuts (look.ts's HAIR_NAMES[0]): how long the hair stands off the scalp, the first one shaved. */
export const LENGTHS = [0, 0.18, 0.55, 1];

/** Whether two looks draw the same runner. */
export const same = (a?: Choice, b?: Choice) =>
  a?.tone === b?.tone && a?.hair === b?.hair && a?.role === b?.role;

/**
 * The seat of a player who rides: the rover whose `driver` or `rider` he is. Nothing for one on
 * foot, or whose rover is not among `rovers`.
 */
export const seatOf = (p: PlayerState, rovers?: Rover[]): Seat | undefined => {
  const r =
    p.mode == MODE.RIDE ? rovers?.find(r => r.driver == p.id || r.rider == p.id) : undefined;
  return r && { yaw: r.yaw, pitch: r.pitch, roll: r.roll, steer: r.steer, s: +(r.driver != p.id) };
};

/** How far under a standing eye a seated one is: his gun is held out from there. */
export const SEATED = 0.62;

/** Seconds after a shot that the gun stays up. */
export const AIMING = 0.5;
/** Seconds a hit's wince lasts, and the grin of a capture or of a foe put down. */
export const [HURT, GRIN] = [0.4, 1.6];
/** Seconds the anger of a hit, a tackle or a punch lasts; it fades over the second half. */
export const MAD = 4;

/**
 * A woman's traits on the face of her id: never the heavy brow ridge, the wide jaw or the long
 * lower face of the draw, fuller lips, and the scalp's hair flat under her style (hair.ts).
 */
export const femme = (w: Float32Array) => {
  w[CH.RIDGE] = Math.min(w[CH.RIDGE], 0) - 0.3;
  w[CH.JOWL] = Math.min(w[CH.JOWL] * 0.5, 0.1) - 0.2;
  w[CH.CHIN] = Math.min(w[CH.CHIN] * 0.6, 0.2);
  w[CH.NOSE_W] = Math.min(w[CH.NOSE_W], 0.3);
  w[CH.LIPS] = Math.max(w[CH.LIPS], 0) * 0.6 + 0.3;
  w[CH.LIDS] = Math.min(w[CH.LIDS], 0.3);
  w[CH.HAIR] = 0;
  w[CH.EARS] = Math.min(w[CH.EARS], 0) - 0.4;
};

/** A runner as first seen: in the pose its state asks for, no ease. */
/** `calm`: at ease, not in a fighter's guard (the menu's picture, the user 2026-11-12). */
export const createRunner = (
  p: PlayerState,
  seat?: Seat,
  build = 0,
  look?: Choice,
  calm = false,
): Runner => {
  const gait = createGait(calm ? 0 : undefined, build);
  const face = createFace(p.id);
  face.w[CH.HAIR] =
    !build && look?.hair !== undefined ? LENGTHS[look.hair] : face.w[CH.HAIR] * +!shaved(p.id);
  if (build) {
    femme(face.w);
  }
  gait.update(p, 0, undefined, seat);
  const fours = look?.role === ROLE.XENO ? createFours() : undefined;
  fours?.update(p, 0);
  return {
    seat,
    p: { ...p },
    gait,
    fours,
    dash: +dashing(p),
    since: 1e3,
    aim: 0,
    focus: far(p),
    prog: -1,
    parry: Infinity,
    trail: createTrail(),
    t: 0,
    cannon: 0,
    hurt: 0,
    grin: 0,
    mad: 0,
    jab: 0,
    curls: grasp(p),
    blow: 0,
    flinch: 0,
    face,
    dt: 0,
    build,
    look,
  };
};

/** The floor under a player standing at height `y`: the first top within a step above or below it. */
export const floorOf =
  (world: World, y: number): Floor =>
  (x, z) => {
    const d = ray(world, [x, y + STEP_H, z], [0, -1, 0], 2 * STEP_H);
    return d > 0 && d < 2 * STEP_H ? y + STEP_H - d : y;
  };

/**
 * Moves each runner of `book` to its player in `others` after dt seconds: a new player gets a
 * runner already in pose, one that left loses it. With a `world` the feet stand on the brushes
 * under them. The `tracer` gets the sparks of a limb cut off.
 */
/**
 * The head turns to the runner one looks at (the user, 2026-11-12): the nearest within `far`
 * metres and `cone` radians of his aim. It turns no further than `turn` (to a side, up or down)
 * from where it points, the eyes going the rest of their travel; `rate` is how fast, per second.
 * The one looked at is followed as he goes by (the user, 2026-11-14): kept, over a nearer one,
 * until he is `hold` radians off the aim (the head's 80 degrees and the eyes' travel, REACH_X)
 * or `keep` metres away.
 */
export const WATCH = { far: 14, keep: 18, cone: 1.2, hold: 2, turn: [1.4, 0.5], rate: 7 };

/** The runner `p` looks at among `crowd`, and where his head is: none when he looks at no one, or is down. `held` is the one he looked at last. */
export const watched = (
  p: PlayerState,
  crowd: PlayerState[],
  held?: number,
): { id: number; at: Vec3 } | undefined => {
  if (p.down) {
    return;
  }
  const f = basis(p.yaw, p.pitch)[2];
  let best: PlayerState | undefined;
  let near = WATCH.far;
  for (const q of crowd) {
    const d = [q.x - p.x, q.y - p.y, q.z - p.z];
    const l = Math.hypot(...d);
    const kept = q.id == held;
    if (q.id == p.id || l >= (kept ? WATCH.keep : near) || l < 0.3 || fried(q) >= 1) {
      continue;
    }
    const off = Math.acos(Math.min(Math.max((d[0] * f[0] + d[1] * f[1] + d[2] * f[2]) / l, -1), 1));
    if (kept && off < WATCH.hold) {
      best = q;
      break;
    }
    if (off < WATCH.cone) {
      near = l;
      best = q;
    }
  }
  // A man down is looked at where he lies.
  return best && { id: best.id, at: [best.x, best.y + (best.down ? 0.3 : EYE + 0.06), best.z] };
};
