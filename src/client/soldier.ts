// The other players' model: a runner's skin (skin.ts) posed by its gait (gait.ts), in the
// renderer's vertex format. A runner is the last PlayerState seen and the gait that eases the body
// toward it; the dash streaks are the only thing drawn here that the gait does not pose. A
// player's (x, y, z) is the bottom of the feet. No DOM.
import { DASH_COOLDOWN, DASH_TICKS, STEP_H } from '../shared/constants';
import type { PlayerState } from '../shared/types';
import { ray } from '../shared/world';
import type { World } from '../shared/world';
import { inv, reach } from './body';
import { createGait, frame } from './gait';
import type { Floor, Gait } from './gait';
import { TILT, aimed, focus, held } from './gun';
import { basis, unit } from './mesh';
import type { Vec3 } from './mesh';
import { JOINT as J, mul, slerp, solve } from './rig';
import type { Pose } from './rig';
import { body, palette, skin } from './skin';

/** How fast the dash streaks grow and fade, 1 / s. */
const DASH_RATE = 14;

/** A point 30 m along the look of `p`, for a runner that has not shot yet. */
const far = (p: PlayerState): Vec3 => {
  const f = basis(p.yaw, p.pitch)[2];
  return [p.x + f[0] * 30, p.y + 1.6 + f[1] * 30, p.z + f[2] * 30];
};

/** What a runner keeps between frames. */
export interface Runner {
  /** The player as last seen. */
  p: PlayerState;
  gait: Gait;
  /** How much of a dash it is in, eased from 0 to 1: the length of the streaks. */
  dash: number;
  /** Seconds since its last shot, and how far its gun arm is raised to aim, eased from 0 to 1. */
  since: number;
  aim: number;
  /** Where its last shot went, which its gun points at. */
  focus: Vec3;
}

/** Seconds after a shot that the gun stays up. */
const AIMING = 0.5;

const dashing = (p: PlayerState) => p.dash > DASH_COOLDOWN - DASH_TICKS;

/** A runner as first seen: in the pose its state asks for, no ease. */
export const createRunner = (p: PlayerState): Runner => {
  const gait = createGait();
  gait.update(p, 0);
  return { p: { ...p }, gait, dash: +dashing(p), since: 1e3, aim: 0, focus: far(p) };
};

/** The floor under a player standing at height `y`: the first top within a step above or below it. */
const floorOf =
  (world: World, y: number): Floor =>
  (x, z) => {
    const d = ray(world, [x, y + STEP_H, z], [0, -1, 0], 2 * STEP_H);
    return d > 0 && d < 2 * STEP_H ? y + STEP_H - d : y;
  };

/**
 * Moves each runner of `book` to its player in `others` after dt seconds: a new player gets a
 * runner already in pose, one that left loses it. With a `world` the feet stand on the brushes
 * under them.
 */
export const animate = (
  book: Map<number, Runner>,
  others: PlayerState[],
  dt: number,
  world?: World,
) => {
  for (const id of book.keys()) {
    if (!others.some(p => p.id == id)) {
      book.delete(id);
    }
  }
  for (const p of others) {
    const r = book.get(p.id);
    if (r) {
      r.gait.update(p, dt, world && floorOf(world, p.y));
      r.dash += (+dashing(p) - r.dash) * (1 - Math.exp(-dt * DASH_RATE));
      r.since = p.shots == r.p.shots ? r.since + dt : 0;
      // A shot raises the gun at once, so that it points at the shot when the beam is drawn.
      r.aim = r.since == 0 ? 1 : r.aim + (+(r.since < AIMING) - r.aim) * (1 - Math.exp(-dt * 12));
      r.focus = r.since < AIMING ? (world ? focus(p, world)[0] : far(p)) : r.focus;
      r.p = { ...p };
    } else {
      book.set(p.id, createRunner(p));
    }
  }
};

/** The pose with the right arm `k` of the way to holding the gun out along the look of `p`. */
const lifted = (
  pose: Pose,
  s: ReturnType<typeof solve>,
  p: PlayerState,
  focused: Vec3,
  k: number,
): Pose => {
  const [grip, ax] = aimed(p, focused);
  const rot = pose.rot.slice();
  const q = { ...pose, rot };
  const [uh, fh] = [ax[0], ax[2].map((v, i) => v * TILT[1] - ax[1][i] * TILT[0]) as Vec3];
  const wrist = grip.map((v, i) => v - 0.078 * fh[i] + 0.022 * uh[i]) as Vec3;
  const pole: Vec3 = [uh[0] * 0.7, -1, uh[2] * 0.7];
  reach(
    q,
    s,
    J.ARM_R,
    wrist.map((v, i) => s.pos[J.HAND_R][i] + (v - s.pos[J.HAND_R][i]) * k) as Vec3,
    pole,
  );
  rot[J.HAND_R] = slerp(rot[J.HAND_R], mul(inv(solve(q).rot[J.FOREARM_R]), frame(uh, fh)), k);
  return q;
};

/** A dash trails three streaks: thin glowing (layer -2) spikes, a pair of crossed triangles each. */
const streaks = (out: number[], r: Runner, color: number[], at: (v: Vec3) => Vec3) => {
  const back = unit([-r.p.vx, 0, -r.p.vz]);
  const [cr, cg, cb] = color.map(v => 0.6 + 0.6 * v);
  [
    [0.5, 0.12, 1.3],
    [0.9, -0.16, 1.7],
    [1.25, 0.14, 1.2],
  ].forEach(([u, x, len], i) => {
    const a = at([x, u, -0.2 - 0.1 * i]);
    const tip = a.map((v, k) => v + back[k] * len * r.dash);
    for (const d of [
      [-back[2] * 0.03, 0, back[0] * 0.03],
      [0, 0.03, 0],
    ]) {
      for (const p of [a.map((v, k) => v + d[k]), a.map((v, k) => v - d[k]), tip]) {
        out.push(...p, 0, 1, 0, cr, cg, -2, cb);
      }
    }
  });
};

/**
 * Appends a runner at level of detail `lod` (see body()): the jacket in `color` (r, g, b), dark
 * trousers, skin, hair and light shoes, posed by its gait. A dash trails a few glowing streaks.
 */
export const soldier = (out: number[], r: Runner, color: number[], lod = 1) => {
  let pose = r.gait.pose();
  const { p } = r;
  // Lying down, it sinks into the roof for the last half second.
  if (p.down) {
    pose = {
      ...pose,
      at: [pose.at[0], pose.at[1] - 0.5 * Math.min(Math.max(1 - p.down / 30, 0), 1), pose.at[2]],
    };
  }
  let s = solve(pose);
  if (r.aim > 0.01 && p.ammo >= 0) {
    pose = lifted(pose, s, p, r.focus, r.aim);
    s = solve(pose);
  }
  skin(out, body(lod), s, palette(color));
  if (p.ammo >= 0 && !p.down) {
    held(out, s.pos[J.HAND_R], s.rot[J.HAND_R], lod);
  }
  if (r.dash > 0.15) {
    const [s, c] = [Math.sin(pose.yaw), Math.cos(pose.yaw)];
    const { x, y, z } = r.p;
    streaks(out, r, color, ([a, u, f]) => [x + a * c - f * s, y + u, z - a * s - f * c]);
  }
};
