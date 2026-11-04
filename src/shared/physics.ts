// Player movement, shared by the host and the client's prediction: no DOM, no Node API.
// Deterministic for a given state and input, so the client's replay of unacked inputs lands where
// the host does.
import {
  GRAVITY,
  JUMP_SPEED,
  MAX_PITCH,
  PLAYER_H,
  PLAYER_R,
  RUN_SPEED,
  STEP_H,
  TICK_HZ,
} from './constants';
import { sectorAt } from './level';
import { KEY } from './types';
import type { Edge, Input, Level, PlayerState } from './types';

const DT = 1 / TICK_HZ;
export const TAU = Math.PI * 2;
/** Overlaps smaller than this are rounding noise, not contact. */
const EPS = 1e-6;
/**
 * Feet this close below a floor still stand on it (rounding of y must not sink a player into
 * the floor or flip a step test), and a fall that ends this close above a floor
 * lands on it.
 */
const SKIN = 0.01;

/** An angle in [0, 2π). */
export const norm = (a: number): number => ((a % TAU) + TAU) % TAU;

/** Unit vector the player faces at yaw, on the floor plane: yaw 0 looks toward -z. */
export const forward = (yaw: number): [x: number, z: number] => [-Math.sin(yaw), -Math.cos(yaw)];

const f32 = Math.fround;

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);

/**
 * Whether the edge stops a player whose feet are at y: a solid wall, a floor on the far side more
 * than STEP_H above the feet, or an opening (the lower ceiling minus the higher floor) too short
 * for the body or under the head. SKIN keeps rounding from flipping the answer
 * for a player resting on a step or against a ceiling.
 */
const shut = ({ map }: Level, e: Edge, y: number): boolean => {
  if (e.back < 0) {
    return true;
  }
  const f = map.sectors[e.front];
  const k = map.sectors[e.back];
  const top = Math.min(f.ceil, k.ceil);
  return (
    k.floor > y + STEP_H + SKIN ||
    top - Math.max(f.floor, k.floor) < PLAYER_H - SKIN ||
    top < y + PLAYER_H - SKIN
  );
};

/**
 * Pushes the player out of every shut edge it overlaps, deepest first (up to 4 passes: two walls
 * in a corner settle in two). The push is along the vector from the closest point of the edge, so
 * against a wall it is the normal (the other axis keeps moving: the slide) and at an endpoint it
 * is radial: a player running at a corner slides round it. Deepest first matters on a straight
 * wall split by a collinear point: the endpoint of the next piece is always shallower than the
 * normal push of the piece the player is on, so it never pulls him back along the wall.
 * An edge only counts from its front side (the inside of its sector); across it, the twin edge of
 * the neighbour decides.
 * Tunnelling is impossible: a step is RUN_SPEED / TICK_HZ = 0.1 m and the axis ends each step at
 * least PLAYER_R = 0.4 m from every shut edge it started beside, so it cannot cross one in 0.1 m.
 */
const push = (p: PlayerState, lvl: Level): void => {
  const reach = (PLAYER_R - EPS) ** 2;
  for (let pass = 0; pass < 4; pass++) {
    let best = 0;
    let px = 0;
    let pz = 0;
    for (const e of lvl.edges) {
      const ex = e.bx - e.ax;
      const ez = e.bz - e.az;
      const rx = p.x - e.ax;
      const rz = p.z - e.az;
      if (ex * rz - ez * rx < 0) {
        continue;
      }
      const t = clamp((rx * ex + rz * ez) / (ex * ex + ez * ez), 0, 1);
      const dx = rx - t * ex;
      const dz = rz - t * ez;
      const d2 = dx * dx + dz * dz;
      if (d2 >= reach) {
        continue;
      }
      const d = Math.sqrt(d2);
      if (PLAYER_R - d <= best || !shut(lvl, e, p.y)) {
        continue;
      }
      best = PLAYER_R - d;
      // On the edge itself the direction is its inward normal.
      const n = d || Math.hypot(ex, ez);
      px = ((d ? dx : -ez) / n) * best;
      pz = ((d ? dz : ex) / n) * best;
    }
    if (!best) {
      return;
    }
    p.x += px;
    p.z += pz;
  }
};

/**
 * The floor and the ceiling under the player: the highest floor and the lowest ceiling of the
 * sector holding the axis and of every sector across a portal the circle overlaps and could walk
 * through (a shut edge is a wall: the circle never counts what lies behind it).
 */
const span = (lvl: Level, x: number, z: number, y: number): [floor: number, ceil: number] => {
  const { map, edges } = lvl;
  const s = Math.max(sectorAt(lvl, x, z), 0);
  let { floor, ceil } = map.sectors[s];
  const reach = (PLAYER_R - EPS) ** 2;
  for (const e of edges) {
    if (e.front !== s || e.back < 0) {
      continue;
    }
    const ex = e.bx - e.ax;
    const ez = e.bz - e.az;
    const rx = x - e.ax;
    const rz = z - e.az;
    const t = clamp((rx * ex + rz * ez) / (ex * ex + ez * ez), 0, 1);
    if ((rx - t * ex) ** 2 + (rz - t * ez) ** 2 < reach && !shut(lvl, e, y)) {
      const k = map.sectors[e.back];
      floor = Math.max(floor, k.floor);
      ceil = Math.min(ceil, k.ceil);
    }
  }
  return [floor, ceil];
};

/**
 * Applies one input for 1 / TICK_HZ s, in place: yaw and pitch from the input (pitch clamped to
 * MAX_PITCH), RUN_SPEED along the held keys (diagonals not faster), a jump from the ground,
 * GRAVITY, then collisions of the cylinder (PLAYER_R, PLAYER_H) with the sectors of the level:
 * it slides along shut edges (see shut and push), stands on the highest floor under the circle
 * (a step up to STEP_H is climbed at once, a higher one needs a jump, a ledge is a fall), and
 * bumps its head on the lowest ceiling.
 */
export const move = (p: PlayerState, i: Input, lvl: Level): void => {
  p.yaw = norm(i.yaw);
  p.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, i.pitch));

  const f = (i.keys & KEY.FORWARD ? 1 : 0) - (i.keys & KEY.BACK ? 1 : 0);
  const s = (i.keys & KEY.RIGHT ? 1 : 0) - (i.keys & KEY.LEFT ? 1 : 0);
  const d = (RUN_SPEED * DT) / (Math.hypot(f, s) || 1);
  const [fx, fz] = forward(p.yaw);

  p.x += (fx * f - fz * s) * d;
  p.z += (fz * f + fx * s) * d;
  push(p, lvl);
  // Edges and steps are judged from the feet at the start of the step.
  const [floor, ceil] = span(lvl, p.x, p.z, p.y);

  if (p.ground && i.keys & KEY.JUMP) {
    p.vy = JUMP_SPEED;
  }
  // Constant acceleration, integrated exactly (average speed): the jump peaks at v² / 2g.
  const vy = p.vy - GRAVITY * DT;
  p.y += ((p.vy + vy) / 2) * DT;
  p.vy = vy;
  p.ground = false;
  if (p.y + PLAYER_H > ceil) {
    p.y = ceil - PLAYER_H;
    p.vy = Math.min(p.vy, 0);
  }
  // A falling player whose feet end within SKIN of the floor (or below it) stands on it: the
  // margin keeps a player resting on it, or a jump that comes back to its starting height, from
  // landing on one step or the next depending on rounding. A rising player that ends
  // below it (a jump onto a step) is lifted onto it and keeps rising.
  if (p.vy <= 0 ? p.y <= floor + SKIN : p.y < floor) {
    p.y = floor;
    if (p.vy <= 0) {
      p.vy = 0;
      p.ground = true;
    }
  }
  // Host and client then hold identical values and the snapshot carries them exactly, so the
  // replay is exact (barring Math.sin / Math.cos differences between JS engines).
  p.x = f32(p.x);
  p.y = f32(p.y);
  p.z = f32(p.z);
  p.vy = f32(p.vy);
};

/** A player standing on the floor at spawn point n of the map (modulo the count). */
export const spawn = (id: number, lvl: Level, n: number): PlayerState => {
  const { spawns, sectors } = lvl.map;
  const [x, z, yaw] = spawns[((n % spawns.length) + spawns.length) % spawns.length];
  const y = sectors[Math.max(sectorAt(lvl, x, z), 0)].floor;
  return { id, x: f32(x), y: f32(y), z: f32(z), vy: 0, yaw: norm(yaw), pitch: 0, ground: true };
};
