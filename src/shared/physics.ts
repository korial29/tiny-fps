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
import { KEY } from './types';
import type { Input, PlayerState } from './types';
import { near } from './world';
import type { Brush, World } from './world';

const DT = 1 / TICK_HZ;
type Pos = Pick<PlayerState, 'x' | 'y' | 'z'>;
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

/** A player standing on spawn point n of the world (modulo the count). */
export const spawn = (id: number, w: World, n: number): PlayerState => {
  const { spawns } = w.def;
  const [x, y, z, yaw] = spawns[((n % spawns.length) + spawns.length) % spawns.length];
  return { id, x: f32(x), y: f32(y), z: f32(z), vy: 0, yaw: norm(yaw), pitch: 0, ground: true };
};

/** Whether the brush stops a body whose feet are at y when it walks sideways into it. */
const blocks = (b: Brush, y: number): boolean =>
  b.max[1] > y + STEP_H + SKIN && b.min[1] < y + PLAYER_H - SKIN;

/** The closest point of the brush footprint to (x, z), as the offset from it to (x, z). */
const gap = (b: Brush, x: number, z: number): [dx: number, dz: number] => [
  x - clamp(x, b.min[0], b.max[0]),
  z - clamp(z, b.min[2], b.max[2]),
];

/**
 * Pushes the player out of every brush that blocks it and that the circle overlaps, deepest first
 * (up to 4 passes: two walls in a corner settle in two). The push is along the vector from the
 * closest point of the box, so against a side it is the normal (the other axis keeps moving: the
 * slide) and at an edge it is radial: a player running at a corner slides round it. Deepest first
 * matters on a flat wall made of several boxes: the corner of the next box is always shallower
 * than the normal push of the box the player is on, so it never pulls him back along the wall.
 * A centre inside a footprint (it never gets there by walking, see below) leaves by the nearest
 * side.
 *
 * Tunnelling is impossible: a step is RUN_SPEED / TICK_HZ = 0.1 m, and each push leaves the centre
 * at least PLAYER_R = 0.4 m from the footprint of every box it started beside, so a 0.1 m step
 * cannot bring the centre across one, however thin. The candidates come from near() with twice
 * PLAYER_R, enough for the one push of at most PLAYER_R that matters.
 */
const push = (p: Pos, w: World): void => {
  const { brushes } = w.def;
  const ids = near(w, p.x, p.z, 2 * PLAYER_R);
  const reach = (PLAYER_R - EPS) ** 2;
  for (let pass = 0; pass < 4; pass++) {
    let best = 0;
    let px = 0;
    let pz = 0;
    for (const i of ids) {
      const b = brushes[i];
      if (!blocks(b, p.y)) {
        continue;
      }
      const [dx, dz] = gap(b, p.x, p.z);
      const d2 = dx * dx + dz * dz;
      if (d2 >= reach) {
        continue;
      }
      if (d2) {
        const d = Math.sqrt(d2);
        if (PLAYER_R - d > best) {
          best = PLAYER_R - d;
          px = (dx / d) * best;
          pz = (dz / d) * best;
        }
        continue;
      }
      // Centre inside: the nearest of the four sides, then the radius beyond it.
      const out: [number, number, number][] = [
        [p.x - b.min[0], -1, 0],
        [b.max[0] - p.x, 1, 0],
        [p.z - b.min[2], 0, -1],
        [b.max[2] - p.z, 0, 1],
      ];
      const [m, nx, nz] = out.reduce((a, c) => (c[0] < a[0] ? c : a));
      if (m + PLAYER_R > best) {
        best = m + PLAYER_R;
        [px, pz] = [nx * best, nz * best];
      }
    }
    if (!best) {
      return;
    }
    p.x += px;
    p.z += pz;
  }
};

/**
 * The floor and the ceiling under the player: the highest top the player can stand on (at most
 * STEP_H above the feet) and the lowest bottom above the head, among the boxes the circle overlaps.
 * Every top between the feet and the fall is a candidate and so is every bottom above the head,
 * however far: a fall of any speed stops on the first top under the circle, and a rise (at most
 * JUMP_SPEED / TICK_HZ = 0.12 m a step) cannot pass a bottom. Only a corner clipped by under a
 * millimetre of overlap at one end of a step and none at the other could slip past.
 */
const span = (p: Pos, w: World): [floor: number, ceil: number] => {
  const { brushes } = w.def;
  const reach = (PLAYER_R - EPS) ** 2;
  let floor = -Infinity;
  let ceil = Infinity;
  for (const i of near(w, p.x, p.z, PLAYER_R)) {
    const b = brushes[i];
    const [dx, dz] = gap(b, p.x, p.z);
    if (dx * dx + dz * dz >= reach) {
      continue;
    }
    if (b.max[1] <= p.y + STEP_H + SKIN) {
      floor = Math.max(floor, b.max[1]);
    } else if (b.min[1] >= p.y + PLAYER_H - SKIN) {
      ceil = Math.min(ceil, b.min[1]);
    }
  }
  return [floor, ceil];
};

/**
 * Moves the feet by (dx, dz) for 1 / TICK_HZ s, then a jump from the ground, GRAVITY and the
 * collisions of the cylinder (PLAYER_R, PLAYER_H) with the brushes of the world: it slides along
 * their sides (see push), stands on the highest top under the circle (a top up to STEP_H above the
 * feet is climbed at once, a higher one needs a jump, an edge is a fall), and bumps its head on the
 * lowest bottom, in place. Feet under the world's kill floor put the player back at a spawn.
 * Sides and tops are judged from the feet at the start of the step.
 */
export const walk = (p: PlayerState, dx: number, dz: number, jump: boolean, w: World): void => {
  p.x += dx;
  p.z += dz;
  push(p, w);
  const [floor, ceil] = span(p, w);

  if (p.ground && jump) {
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
  if (p.y < w.def.floor) {
    // Fallen off the roofs: back at the spawn of the player's id, looking where the input says.
    const { x, y, z } = spawn(p.id, w, p.id);
    Object.assign(p, { x, y, z, vy: 0, ground: true });
  }
  // Host and client then hold identical values and the snapshot carries them exactly, so the
  // replay is exact (barring Math.sin / Math.cos differences between JS engines).
  p.x = f32(p.x);
  p.y = f32(p.y);
  p.z = f32(p.z);
  p.vy = f32(p.vy);
};

/**
 * Applies one input for 1 / TICK_HZ s, in place: yaw and pitch from the input (pitch clamped to
 * MAX_PITCH), RUN_SPEED along the held keys (diagonals not faster), then walk().
 */
export const move = (p: PlayerState, i: Input, w: World): void => {
  p.yaw = norm(i.yaw);
  p.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, i.pitch));

  const f = (i.keys & KEY.FORWARD ? 1 : 0) - (i.keys & KEY.BACK ? 1 : 0);
  const s = (i.keys & KEY.RIGHT ? 1 : 0) - (i.keys & KEY.LEFT ? 1 : 0);
  const d = (RUN_SPEED * DT) / (Math.hypot(f, s) || 1);
  const [fx, fz] = forward(p.yaw);

  walk(p, (fx * f - fz * s) * d, (fz * f + fx * s) * d, (i.keys & KEY.JUMP) !== 0, w);
};
