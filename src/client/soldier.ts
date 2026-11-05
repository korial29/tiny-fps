// The other players' model: a runner's skin (skin.ts) posed by its gait (gait.ts), in the
// renderer's vertex format. A runner is the last PlayerState seen and the gait that eases the body
// toward it; the dash streaks are the only thing drawn here that the gait does not pose. A
// player's (x, y, z) is the bottom of the feet. No DOM.
import { DASH_COOLDOWN, DASH_TICKS, STEP_H } from '../shared/constants';
import type { PlayerState } from '../shared/types';
import { ray } from '../shared/world';
import type { World } from '../shared/world';
import { createGait } from './gait';
import type { Floor, Gait } from './gait';
import { unit } from './mesh';
import type { Vec3 } from './mesh';
import { solve } from './rig';
import { body, palette, skin } from './skin';

/** How fast the dash streaks grow and fade, 1 / s. */
const DASH_RATE = 14;

/** What a runner keeps between frames. */
export interface Runner {
  /** The player as last seen. */
  p: PlayerState;
  gait: Gait;
  /** How much of a dash it is in, eased from 0 to 1: the length of the streaks. */
  dash: number;
}

const dashing = (p: PlayerState) => p.dash > DASH_COOLDOWN - DASH_TICKS;

/** A runner as first seen: in the pose its state asks for, no ease. */
export const createRunner = (p: PlayerState): Runner => {
  const gait = createGait();
  gait.update(p, 0);
  return { p: { ...p }, gait, dash: +dashing(p) };
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
      r.p = { ...p };
    } else {
      book.set(p.id, createRunner(p));
    }
  }
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
  const pose = r.gait.pose();
  skin(out, body(lod), solve(pose), palette(color));
  if (r.dash > 0.15) {
    const [s, c] = [Math.sin(pose.yaw), Math.cos(pose.yaw)];
    const { x, y, z } = r.p;
    streaks(out, r, color, ([a, u, f]) => [x + a * c - f * s, y + u, z - a * s - f * c]);
  }
};
