// Player movement, shared by the host and the client's prediction: no DOM, no Node API.
// Deterministic for a given state and input, so the client's replay of unacked inputs lands where
// the host does (give or take the wire's fixed point, corrected on each snapshot).
import {
  GRAVITY,
  JUMP_SPEED,
  MAX_PITCH,
  PLAYER_H,
  PLAYER_R,
  RUN_SPEED,
  TICK_HZ,
} from './constants';
import { KEY } from './types';
import type { Box, Input, BoxMap, PlayerState } from './types';

const DT = 1 / TICK_HZ;
export const TAU = Math.PI * 2;
/** Overlaps smaller than this are rounding noise, not contact. */
const EPS = 1e-6;
/**
 * Feet this close below a top still stand on it (the wire rounds y to 1 mm, which must not sink
 * a player into the platform he stands on and push him out sideways), and a fall that ends this
 * close above a top lands on it.
 */
const SKIN = 0.01;

/** An angle in [0, 2π). */
export const norm = (a: number): number => ((a % TAU) + TAU) % TAU;

/** Unit vector the player faces at yaw, on the floor plane: yaw 0 looks toward -z. */
export const forward = (yaw: number): [x: number, z: number] => [-Math.sin(yaw), -Math.cos(yaw)];

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);

/** Horizontal distance from the player's axis to the box's footprint, and the vector to it. */
const gap = (p: PlayerState, b: Box): [d: number, dx: number, dz: number] => {
  const dx = p.x - clamp(p.x, b.x0, b.x1);
  const dz = p.z - clamp(p.z, b.z0, b.z1);
  return [Math.hypot(dx, dz), dx, dz];
};

/**
 * Pushes the player out of the box footprint along the normal of the closest point: against a
 * side that is along one axis (the other keeps moving: the slide), around a corner it is
 * diagonal, so a player running straight at a corner slides round it instead of sticking.
 * Tunnelling is impossible: a step is RUN_SPEED / TICK_HZ = 0.1 m, the axis never gets within
 * PLAYER_R = 0.4 m of the inside of a box, and the walls are 1 m thick.
 */
const push = (p: PlayerState, b: Box): void => {
  const [d, dx, dz] = gap(p, b);
  if (d >= PLAYER_R - EPS) {
    return;
  }
  if (d > 0) {
    p.x += (dx / d) * (PLAYER_R - d);
    p.z += (dz / d) * (PLAYER_R - d);
    return;
  }
  // The axis is inside the footprint (only a spawn there gets so deep): leave by the nearest side.
  const l = p.x - b.x0;
  const r = b.x1 - p.x;
  const n = p.z - b.z0;
  const m = Math.min(l, r, n, b.z1 - p.z);
  if (m === l) {
    p.x = b.x0 - PLAYER_R;
  } else if (m === r) {
    p.x = b.x1 + PLAYER_R;
  } else if (m === n) {
    p.z = b.z0 - PLAYER_R;
  } else {
    p.z = b.z1 + PLAYER_R;
  }
};

/**
 * Applies one input for 1 / TICK_HZ s, in place: yaw and pitch from the input (pitch clamped to
 * MAX_PITCH), RUN_SPEED along the held keys (diagonals not faster), a jump from the ground,
 * GRAVITY, then collisions: the player cylinder (PLAYER_R, PLAYER_H) slides along box sides,
 * lands on box tops and on the floor (y 0), and bumps its head on box bottoms.
 */
export const move = (p: PlayerState, i: Input, map: BoxMap): void => {
  const { boxes } = map;
  p.yaw = norm(i.yaw);
  p.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, i.pitch));

  const f = (i.keys & KEY.FORWARD ? 1 : 0) - (i.keys & KEY.BACK ? 1 : 0);
  const s = (i.keys & KEY.RIGHT ? 1 : 0) - (i.keys & KEY.LEFT ? 1 : 0);
  const d = (RUN_SPEED * DT) / (Math.hypot(f, s) || 1);
  const [fx, fz] = forward(p.yaw);

  p.x += (fx * f - fz * s) * d;
  p.z += (fz * f + fx * s) * d;
  // A box blocks the sides unless the feet are on its top (within SKIN) or the head is under its
  // bottom.
  for (const b of boxes) {
    if (p.y < b.y1 - SKIN && p.y + PLAYER_H > b.y0 + SKIN) {
      push(p, b);
    }
  }

  if (p.ground && i.keys & KEY.JUMP) {
    p.vy = JUMP_SPEED;
  }
  // Constant acceleration, integrated exactly (average speed): the jump peaks at v² / 2g.
  const y0 = p.y;
  const vy = p.vy - GRAVITY * DT;
  p.y += ((p.vy + vy) / 2) * DT;
  p.vy = vy;
  p.ground = false;
  // Landing: a falling player whose feet end within SKIN of a top (or below it) stands on it.
  // The margin keeps a jump that comes back to exactly its starting height from landing on one
  // step or the next depending on the wire's rounding, which would shift the replay by a step.
  if (p.vy <= 0 && p.y <= SKIN) {
    p.y = p.vy = 0;
    p.ground = true;
  }
  for (const b of boxes) {
    if (gap(p, b)[0] >= PLAYER_R - EPS) {
      continue;
    }
    if (p.vy <= 0 && y0 >= b.y1 - SKIN && p.y <= b.y1 + SKIN) {
      p.y = b.y1;
      p.vy = 0;
      p.ground = true;
    } else if (p.vy > 0 && y0 + PLAYER_H <= b.y0 + SKIN && p.y + PLAYER_H > b.y0) {
      p.y = b.y0 - PLAYER_H;
      p.vy = 0;
    }
  }
};

/** A player standing at spawn point n of the map (modulo the count). */
export const spawn = (id: number, map: BoxMap, n: number): PlayerState => {
  const { spawns } = map;
  const [x, z, yaw] = spawns[((n % spawns.length) + spawns.length) % spawns.length];
  return { id, x, y: 0, z, vy: 0, yaw: norm(yaw), pitch: 0, ground: true };
};
