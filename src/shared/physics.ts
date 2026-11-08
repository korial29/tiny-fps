// Player movement, shared by the host and the client's prediction: no DOM, no Node API.
// Deterministic for a given state and input, so the client's replay of unacked inputs lands where
// the host does. The state is float32 and Math.hypot is not used (its rounding is the engine's).
//
// One move() is one step of 1 / TICK_HZ s. A player is in one MODE: on the ground, in the air, on
// a wall-run, hanging from a ledge, climbing it, sliding or crouching. Each step first decides
// from the mode, the keys and the state (jump, dash, let go, climb, stand up...), then moves the
// cylinder by its speed (fly), then looks at where it ended (landed, left the floor, next to a
// ledge or a wall it can take). Time spent in a mode (t), the coyote and buffer windows, the dash
// cooldown, the jumps left and the stumble of a tackle are all in the state, so a snapshot is
// enough to carry on. A tackle itself (`stumble()`) is the host's: it changes the state between two
// steps, and the tackled client gets the result in the next snapshot, then replays on it.
import {
  ACCEL,
  AIR_ACCEL,
  AIR_JUMPS,
  AIR_SPEED,
  CLIMB_EXIT_SPEED,
  CLIMB_FWD_SPEED,
  CLIMB_INSET,
  CLIMB_MAX_TICKS,
  CLIMB_RISE,
  COYOTE_TICKS,
  CROUCH_SPEED,
  DASH_COOLDOWN,
  DASH_EXIT_SPEED,
  DASH_SPEED,
  DASH_TICKS,
  DECAY,
  DOUBLE_JUMP_SPEED,
  EYE,
  FRICTION,
  GRAB_FACING,
  GRAB_GAP,
  GRAB_MAX,
  GRAB_MIN,
  GRAB_REACH,
  GRAVITY,
  GRIP,
  HANG_H,
  HANG_MIN_TICKS,
  HANG_SLIDE_TICKS,
  HANG_SNAP,
  HP_MAX,
  JUMP_BUFFER_TICKS,
  JUMP_SPEED,
  LOW_EYE,
  LOW_H,
  MAX_PITCH,
  PLAYER_H,
  PLAYER_R,
  RUN_SPEED,
  SLIDE_DECEL,
  SLIDE_END_SPEED,
  SLIDE_MIN_SPEED,
  SLIDE_TICKS,
  SLOW_SPEED,
  SPRINT_ACCEL,
  SPRINT_SPEED,
  STEP_H,
  STUMBLE_DRAG,
  STUMBLE_KNOCK,
  STUMBLE_SPEED,
  STUMBLE_TICKS,
  TICK_HZ,
  VAULT_SPEED,
  VAULT_UP,
  WALLRUN_DRAG,
  WALLRUN_GRAVITY,
  WALLRUN_KEEP_SPEED,
  WALLRUN_LIFT,
  WALLRUN_MIN_SPEED,
  WALLRUN_TICKS,
  WALLRUN_VY_MAX,
  WALL_AWAY,
  WALL_KICK_SPEED,
  WALL_KICK_UP,
  WALL_PARALLEL,
  WALL_PULL,
  WALL_REACH,
  WALL_TURN_KEEP,
} from './constants';
import { EV, KEY, LIMB, MODE, SIDE } from './types';
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
/**
 * A circle this close to a box (1 mm) is touching it: a push leaves it exactly PLAYER_R away, and
 * the float32 position it is rounded to is a few micrometres off.
 */
const TOUCH = 1e-3;

/** An angle in [0, 2π). */
export const norm = (a: number): number => ((a % TAU) + TAU) % TAU;

/** Unit vector the player faces at yaw, on the floor plane: yaw 0 looks toward -z. */
export const forward = (yaw: number): [x: number, z: number] => [-Math.sin(yaw), -Math.cos(yaw)];

const f32 = Math.fround;
const sqrt = Math.sqrt;

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);

/** The length of (x, z). */
const len = (x: number, z: number): number => sqrt(x * x + z * z);

/** The unit vector from a player toward a wall or a ledge on each SIDE. */
const TOWARD = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** The movement fields of a player at rest on a floor, for a state built by hand. */
export const STILL = {
  vx: 0,
  vz: 0,
  mode: MODE.GROUND as number,
  t: 0,
  wall: SIDE.NONE as number,
  edge: 0,
  jumps: AIR_JUMPS,
  dashes: 1,
  dash: 0,
  stun: 0,
  coyote: COYOTE_TICKS,
  buffer: 0,
  held: 0,
  hp: HP_MAX,
  ammo: -1,
  cool: 0,
  mag: 0,
  cap: 0,
  reload: 0,
  rack: false,
  down: 0,
  shots: 0,
  hits: 0,
  blade: false,
  wield: false,
  swing: 0,
  cut: 0,
  zap: false,
  lost: LIMB.NONE as number,
  rail: -1,
  railed: false,
  inRail: false,
  zapping: false,
  slow: 0,
  fried: false,
  heavy: false,
  ev: 0,
  fall: 0,
};

/** A player standing on spawn point n of a team (modulo the count): the red team's by default. */
export const spawn = (id: number, w: World, n: number, team = 0): PlayerState => {
  const { spawns } = w.def.teams[team];
  const [x, y, z, yaw] = spawns[((n % spawns.length) + spawns.length) % spawns.length];
  return {
    id,
    x: f32(x),
    y: f32(y),
    z: f32(z),
    vy: 0,
    yaw: norm(yaw),
    pitch: 0,
    ground: true,
    ...STILL,
  };
};

/**
 * Puts the player back at the spawn of his id in his team, looking where he looked, with full
 * health and no gun (EV.RESPAWN). The shot and hit counters go on: a reset would read as a shot.
 */
export const respawn = (p: PlayerState, w: World, team: number): void => {
  const { yaw, pitch, id, shots, hits } = p;
  Object.assign(p, spawn(id, w, id, team), { yaw, pitch, shots, hits, ev: p.ev | EV.RESPAWN });
};

/** The modes with the feet on a floor: ground, slide and crouch. */
const onFloor = (m: number): boolean => m === MODE.GROUND || m === MODE.SLIDE || m === MODE.CROUCH;

/** The height of the cylinder in this mode. */
export const heightOf = (p: Pick<PlayerState, 'mode'>): number =>
  p.mode === MODE.SLIDE || p.mode === MODE.CROUCH ? LOW_H : PLAYER_H;

/** The camera height above the feet in this mode. */
export const eyeHeight = (p: Pick<PlayerState, 'mode'>): number =>
  p.mode === MODE.SLIDE || p.mode === MODE.CROUCH ? LOW_EYE : EYE;

/** Horizontal speed, m/s. */
export const speedOf = (p: Pick<PlayerState, 'vx' | 'vz'>): number => len(p.vx, p.vz);

/** Running faster than a walk on the ground: the sprint, for the animation to pump the arms. */
export const sprinting = (p: Pick<PlayerState, 'mode' | 'vx' | 'vz'>): boolean =>
  p.mode === MODE.GROUND && len(p.vx, p.vz) > RUN_SPEED + 0.5;

/** Whether the brush stops a body of height h whose feet are at y when it walks sideways into it. */
const blocks = (b: Brush, y: number, h: number): boolean =>
  b.max[1] > y + STEP_H + SKIN && b.min[1] < y + h - SKIN;

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
 * side. Returns the whole push, for the caller to take the speed into the wall away.
 *
 * Tunnelling is impossible: a step is at most DASH_SPEED / TICK_HZ = 0.27 m, and each push leaves
 * the centre at least PLAYER_R = 0.4 m from the footprint of every box it started beside, so a
 * step of that size cannot bring the centre across one, however thin. The candidates come from
 * near() with twice PLAYER_R, enough for the one push of at most PLAYER_R that matters.
 */
const push = (p: Pos, w: World, h: number): [x: number, z: number] => {
  const { brushes } = w.def;
  const ids = near(w, p.x, p.z, 2 * PLAYER_R);
  const reach = (PLAYER_R - EPS) ** 2;
  let [tx, tz] = [0, 0];
  for (let pass = 0; pass < 4; pass++) {
    let best = 0;
    let px = 0;
    let pz = 0;
    for (const i of ids) {
      const b = brushes[i];
      if (!blocks(b, p.y, h)) {
        continue;
      }
      const [dx, dz] = gap(b, p.x, p.z);
      const d2 = dx * dx + dz * dz;
      if (d2 >= reach) {
        continue;
      }
      if (d2) {
        const d = sqrt(d2);
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
      break;
    }
    p.x += px;
    p.z += pz;
    tx += px;
    tz += pz;
  }
  return [tx, tz];
};

/**
 * The floor and the ceiling under the player: the highest top the player can stand on (at most
 * STEP_H above the feet) and the lowest bottom above the head, among the boxes the circle overlaps.
 * Every top between the feet and the fall is a candidate and so is every bottom above the head,
 * however far: a fall of any speed stops on the first top under the circle, and a rise (at most
 * DOUBLE_JUMP_SPEED / TICK_HZ = 0.12 m a step) cannot pass a bottom. Only a corner clipped by under a
 * millimetre of overlap at one end of a step and none at the other could slip past.
 */
const span = (p: Pos, w: World, h: number): [floor: number, ceil: number] => {
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
    } else if (b.min[1] >= p.y + h - SKIN) {
      ceil = Math.min(ceil, b.min[1]);
    }
  }
  return [floor, ceil];
};

/** Whether a standing body fits where the player is: no ceiling or box within PLAYER_H. */
const canStand = (p: Pos, w: World): boolean => {
  const reach = (PLAYER_R - EPS) ** 2;
  return near(w, p.x, p.z, PLAYER_R).every(i => {
    const b = w.def.brushes[i];
    const [dx, dz] = gap(b, p.x, p.z);
    return dx * dx + dz * dz >= reach || !blocks(b, p.y, PLAYER_H);
  });
};

/** Whether no box meets the circle at (x, z) between the heights y0 and y1. */
const clear = (w: World, x: number, z: number, y0: number, y1: number): boolean => {
  const reach = (PLAYER_R - EPS) ** 2;
  return near(w, x, z, PLAYER_R).every(i => {
    const b = w.def.brushes[i];
    const [dx, dz] = gap(b, x, z);
    return dx * dx + dz * dz >= reach || b.max[1] <= y0 || b.min[1] >= y1;
  });
};

/**
 * The axis of a side (0 for x, 2 for z, the index into a brush corner) and the sign toward it,
 * with the player's coordinate on that axis and on the other one.
 */
const along = (p: Pos, side: number) => {
  const [nx, nz] = TOWARD[side];
  const a = nx ? 0 : 2;
  return { a, o: 2 - a, sign: nx || nz, c: nx ? p.x : p.z, co: nx ? p.z : p.x };
};

/**
 * The distance of the circle's centre to the face of the brush that looks at the player on
 * `side`, when the centre is beside that face (not past its end) and the face is within reach of
 * the cylinder; else undefined.
 */
const faceDist = (b: Brush, p: Pos, side: number, reach: number): number | undefined => {
  const { a, o, sign, c, co } = along(p, side);
  const dist = ((sign > 0 ? b.min[a] : b.max[a]) - c) * sign;
  return dist >= PLAYER_R - TOUCH && dist <= PLAYER_R + reach && co >= b.min[o] && co <= b.max[o]
    ? dist
    : undefined;
};

/**
 * The gap between the cylinder and a wall on `side` that covers the body from the knees to the
 * head and is within WALL_REACH (the nearest one), or undefined when there is none.
 */
const wallGap = (p: Pos, w: World, side: number): number | undefined => {
  let best: number | undefined;
  for (const i of near(w, p.x, p.z, PLAYER_R + WALL_REACH)) {
    const b = w.def.brushes[i];
    const d = faceDist(b, p, side, WALL_REACH);
    if (d !== undefined && b.min[1] < p.y + STEP_H && b.max[1] > p.y + PLAYER_H) {
      best = Math.min(best ?? Infinity, Math.max(0, d - PLAYER_R));
    }
  }
  return best;
};

interface Ledge {
  side: number;
  /** Height of the top. */
  top: number;
  /** Where the body hangs: the centre coordinate on the axis of the side. */
  hang: number;
}

/**
 * The highest ledge the player can catch: on a side he faces and is not locked out of, a top
 * GRAB_MIN to GRAB_MAX above the feet on a box that goes down at least 0.25 m under it, with the
 * hands' reach (GRAB_REACH) from the cylinder, the body clear while it hangs and rises, and the
 * top clear above where the climb ends.
 */
const ledgeAt = (p: PlayerState, w: World): Ledge | undefined => {
  const [fx, fz] = forward(p.yaw);
  let best: Ledge | undefined;
  for (let side = 1; side <= 4; side++) {
    const [nx, nz] = TOWARD[side];
    if (side === p.wall || fx * nx + fz * nz < GRAB_FACING) {
      continue;
    }
    const { a, sign } = along(p, side);
    for (const i of near(w, p.x, p.z, PLAYER_R + GRAB_REACH)) {
      const b = w.def.brushes[i];
      const top = b.max[1];
      const dy = top - p.y;
      if (
        faceDist(b, p, side, GRAB_REACH) === undefined ||
        dy < GRAB_MIN ||
        dy > GRAB_MAX ||
        b.min[1] > top - 0.25 ||
        (best && best.top >= top)
      ) {
        continue;
      }
      const face = sign > 0 ? b.min[a] : b.max[a];
      const hang = face - sign * (PLAYER_R + GRAB_GAP);
      const land = face + sign * CLIMB_INSET;
      const [hx, hz] = a === 0 ? [hang, p.z] : [p.x, hang];
      const [lx, lz] = a === 0 ? [land, p.z] : [p.x, land];
      if (
        clear(w, hx, hz, Math.min(p.y, top - HANG_H) + SKIN, top + PLAYER_H) &&
        clear(w, lx, lz, top + SKIN, top + PLAYER_H)
      ) {
        best = { side, top, hang };
      }
    }
  }
  return best;
};

/** Whether the centre is over the top of the ledge, CLIMB_INSET in from its edge. */
const over = (p: PlayerState, w: World): boolean => {
  const { a, o, sign, c, co } = along(p, p.wall);
  return near(w, p.x, p.z, 0).some(i => {
    const b = w.def.brushes[i];
    const depth = sign > 0 ? c - b.min[a] : b.max[a] - c;
    return f32(b.max[1]) === p.edge && co >= b.min[o] && co <= b.max[o] && depth >= CLIMB_INSET;
  });
};

/** Whether the player will be back on a floor within the jump buffer: a press now is kept for it. */
const landingSoon = (p: PlayerState, w: World): boolean => {
  if (p.vy >= 0) {
    return false;
  }
  const [floor] = span(p, w, PLAYER_H);
  const t = JUMP_BUFFER_TICKS * DT;
  return p.y - floor <= -p.vy * t + 0.5 * GRAVITY * t * t;
};

/** What one input asks for, worked out once per step. */
interface Ctl {
  keys: number;
  /** Stumbling: the dash and jump presses are already dropped, and the speed is held down. */
  stumble: boolean;
  /** A press this step, not a hold. */
  jump: boolean;
  dash: boolean;
  /** Forward held (and not back). */
  fwd: boolean;
  /** The wished direction on the floor plane, a unit vector, or (0, 0). */
  wx: number;
  wz: number;
  /** Facing. */
  fx: number;
  fz: number;
}

/** Changes the mode, and starts counting the time in it. */
const enter = (p: PlayerState, mode: number): void => {
  p.mode = mode;
  p.t = 0;
};

/**
 * A tackle lands on the player: he stumbles for `ticks` (STUMBLE_TICKS) and is thrown `knock`
 * (STUMBLE_KNOCK) m/s along (dx, dz), a unit vector (the tackler's way). It ends a dash, a wall-run,
 * a hang and a climb, and clears a jump press and the coyote window. For the host to call between
 * two steps. The katana's shock calls it with its own ticks and knock.
 */
export const stumble = (
  p: PlayerState,
  dx: number,
  dz: number,
  ticks = STUMBLE_TICKS,
  knock = STUMBLE_KNOCK,
): void => {
  p.stun = ticks;
  p.vx = f32(dx * knock);
  p.vz = f32(dz * knock);
  p.dash = Math.min(p.dash, DASH_COOLDOWN - DASH_TICKS);
  p.coyote = 0;
  p.buffer = 0;
  if (p.mode === MODE.HANG || p.mode === MODE.CLIMB) {
    p.vy = 0;
  }
  if (p.mode === MODE.HANG || p.mode === MODE.CLIMB || p.mode === MODE.WALLRUN) {
    enter(p, MODE.AIR);
    p.edge = 0;
  }
};

/** Scales the horizontal speed to at most max. */
const cap = (p: PlayerState, max: number): void => {
  const s = len(p.vx, p.vz);
  if (s > max) {
    p.vx *= max / s;
    p.vz *= max / s;
  }
};

/**
 * The wish without the part that pushes into a box the circle is touching: a player running at
 * a wall at an angle slides along it at the speed the wall leaves him, and at a corner into two
 * of them stops. Without it the speed built toward the wall would be cut by the wall every step.
 * Returns the wish, its length (0 to 1) not kept: the top speed is scaled by it.
 */
const unwalled = (p: PlayerState, w: World, c: Ctl, h: number): [x: number, z: number] => {
  let [x, z] = [c.wx, c.wz];
  for (const i of near(w, p.x, p.z, PLAYER_R + TOUCH)) {
    const b = w.def.brushes[i];
    const [dx, dz] = gap(b, p.x, p.z);
    const d = len(dx, dz);
    // Touching the side of a box that blocks: the push is along the way back out.
    if (d > 0 && d <= PLAYER_R + TOUCH && blocks(b, p.y, h)) {
      const into = (-x * dx - z * dz) / d;
      if (into > 0) {
        x += (into * dx) / d;
        z += (into * dz) / d;
      }
    }
  }
  return [x, z];
};

/**
 * Ground control: speed toward the wished direction (a vector of length 0 to 1), up to `top` times
 * its length; friction with none.
 */
const steer = (p: PlayerState, wish: [number, number], top: number): void => {
  const m = len(wish[0], wish[1]);
  if (m < EPS) {
    const s = len(p.vx, p.vz);
    const k = s ? Math.max(0, s - FRICTION * DT) / s : 0;
    p.vx *= k;
    p.vz *= k;
    return;
  }
  const [wx, wz] = [wish[0] / m, wish[1] / m];
  // Along the wished direction it accelerates (slowly past RUN_SPEED: the sprint) or falls back to
  // the top speed; across it the speed is killed at GRIP.
  let par = p.vx * wx + p.vz * wz;
  let [px, pz] = [p.vx - par * wx, p.vz - par * wz];
  const across = len(px, pz);
  if (across) {
    const k = Math.max(0, across - GRIP * DT) / across;
    [px, pz] = [px * k, pz * k];
  }
  top *= m;
  par =
    par < top
      ? Math.min(top, par + (par >= RUN_SPEED ? SPRINT_ACCEL : ACCEL) * DT)
      : Math.max(top, par - DECAY * DT);
  p.vx = px + par * wx;
  p.vz = pz + par * wz;
};

/**
 * Moves the cylinder by its speed for one step: sideways (sliding along the boxes, which takes the
 * speed into them away), then up or down by g times GRAVITY (a ceiling stops a rise, a floor a
 * fall). Returns the speed it came down on a floor at, or -1 when it is not on one. With `snap`
 * a drop of at most STEP_H stays on the ground (a stair going down is not a fall).
 */
const fly = (p: PlayerState, w: World, h: number, g: number, snap: boolean): number => {
  const y0 = p.y;
  p.x += p.vx * DT;
  p.z += p.vz * DT;
  const [cx, cz] = push(p, w, h);
  const d = len(cx, cz);
  if (d) {
    const into = (p.vx * cx + p.vz * cz) / d;
    if (into < 0) {
      p.vx -= (into * cx) / d;
      p.vz -= (into * cz) / d;
    }
  }
  const [floor, ceil] = span(p, w, h);
  // Constant acceleration, integrated exactly (average speed): the jump peaks at v² / 2g.
  const vy = p.vy - g * GRAVITY * DT;
  p.y += ((p.vy + vy) / 2) * DT;
  p.vy = vy;
  if (p.y + h > ceil) {
    p.y = ceil - h;
    p.vy = Math.min(p.vy, 0);
  }
  // A falling player whose feet end within SKIN of the floor (or below it) stands on it: the
  // margin keeps a player resting on it, or a jump that comes back to its starting height, from
  // landing on one step or the next depending on rounding. A rising player that ends
  // below it (a jump onto a step) is lifted onto it and keeps rising.
  if (p.vy <= 0 ? p.y <= floor + SKIN : p.y < floor) {
    p.y = floor;
    if (p.vy <= 0) {
      const hit = -p.vy;
      p.vy = 0;
      return hit;
    }
  } else if (snap && p.vy <= 0 && floor >= y0 - STEP_H) {
    p.y = floor;
    p.vy = 0;
    return 0;
  }
  return -1;
};

/** A jump or a kick: the vertical speed, and the windows closed. */
const leap = (p: PlayerState, up: number): void => {
  p.vy = up;
  p.coyote = 0;
  p.buffer = 0;
  p.ev |= EV.JUMP;
};

/** Hanging: let go, climb, vault, or settle at hanging height. */
const hang = (p: PlayerState, w: World, c: Ctl): void => {
  const [nx, nz] = TOWARD[p.wall];
  const go = (mode: number): void => {
    enter(p, mode);
    p.edge = 0;
  };
  if (c.keys & (KEY.BACK | KEY.CROUCH)) {
    go(MODE.AIR);
    p.coyote = 0;
  } else if (c.jump && c.fx * nx + c.fz * nz < 0) {
    // Looking away from the ledge: a jump off it, backward.
    go(MODE.AIR);
    p.vx = -nx * VAULT_SPEED;
    p.vz = -nz * VAULT_SPEED;
    leap(p, VAULT_UP);
  } else if (c.jump || (c.fwd && p.t >= HANG_MIN_TICKS)) {
    enter(p, MODE.CLIMB);
  } else if (p.t >= HANG_SLIDE_TICKS) {
    go(MODE.AIR);
    p.coyote = 0;
  } else {
    // Settle at HANG_H under the ledge, but not into the floor.
    const target = Math.max(p.edge - HANG_H, span(p, w, PLAYER_H)[0]);
    p.y += clamp(target - p.y, -HANG_SNAP * DT, HANG_SNAP * DT);
  }
};

/** Climbing: up to the top, then in from the edge, then standing on it. */
const climb = (p: PlayerState, w: World): void => {
  const [nx, nz] = TOWARD[p.wall];
  if (p.y < p.edge) {
    p.y = Math.min(p.edge, p.y + CLIMB_RISE * DT);
  } else {
    p.x += nx * CLIMB_FWD_SPEED * DT;
    p.z += nz * CLIMB_FWD_SPEED * DT;
  }
  if (p.y >= p.edge && over(p, w)) {
    enter(p, MODE.GROUND);
    p.vx = nx * CLIMB_EXIT_SPEED;
    p.vz = nz * CLIMB_EXIT_SPEED;
    p.vy = 0;
    p.edge = 0;
    p.wall = SIDE.NONE;
    p.coyote = COYOTE_TICKS;
    p.ev |= EV.CLIMB;
  } else if (p.t >= CLIMB_MAX_TICKS) {
    // Never seen on the maps; ends it in the air rather than hang there for ever.
    enter(p, p.y >= p.edge ? MODE.GROUND : MODE.AIR);
    p.edge = 0;
    p.wall = SIDE.NONE;
  }
};

/** Running along a wall: kick off it, or keep going, or end the run. */
const run = (p: PlayerState, w: World, c: Ctl): void => {
  const [nx, nz] = TOWARD[p.wall];
  const into = p.vx * nx + p.vz * nz;
  const [tx, tz] = [p.vx - into * nx, p.vz - into * nz];
  const s = len(tx, tz);
  if (c.jump) {
    enter(p, MODE.AIR);
    p.vx = tx - nx * WALL_KICK_SPEED;
    p.vz = tz - nz * WALL_KICK_SPEED;
    leap(p, WALL_KICK_UP);
    p.jumps = AIR_JUMPS;
    p.dashes = 1;
    p.ev |= EV.WALLRUN_END;
  } else {
    const gap = wallGap(p, w, p.wall);
    if (gap === undefined || !c.fwd || s < WALLRUN_KEEP_SPEED || p.t >= WALLRUN_TICKS) {
      enter(p, MODE.AIR);
      p.ev |= EV.WALLRUN_END;
      return;
    }
    const k = Math.max(0, s - WALLRUN_DRAG * DT) / s;
    p.vx = tx * k;
    p.vz = tz * k;
    // A start up to WALL_REACH away draws the body in to the wall, so it runs along its side.
    const pull = Math.min(gap, WALL_PULL * DT);
    p.x += nx * pull;
    p.z += nz * pull;
  }
};

/**
 * Starts a wall-run if the player, in the air with forward held, runs at least WALLRUN_MIN_SPEED
 * toward or along a wall within reach: at most WALL_PARALLEL of the speed into it (about 49
 * degrees off the wall) and at most WALL_AWAY of it away. The velocity is turned along the wall,
 * keeping WALL_TURN_KEEP of the speed (all of it from a parallel run), with a small lift.
 */
const startRun = (p: PlayerState, w: World, c: Ctl): void => {
  if (!c.fwd) {
    return;
  }
  const s = len(p.vx, p.vz);
  if (s < WALLRUN_MIN_SPEED) {
    return;
  }
  for (let side = 1; side <= 4; side++) {
    const [nx, nz] = TOWARD[side];
    const into = p.vx * nx + p.vz * nz;
    const [tx, tz] = [p.vx - into * nx, p.vz - into * nz];
    if (
      side !== p.wall &&
      into <= WALL_PARALLEL * s &&
      into >= -WALL_AWAY * s &&
      wallGap(p, w, side) !== undefined
    ) {
      const t = len(tx, tz);
      const k = Math.max(t, WALL_TURN_KEEP * s) / t;
      enter(p, MODE.WALLRUN);
      p.wall = side;
      [p.vx, p.vz] = [tx * k, tz * k];
      p.vy = clamp(p.vy, WALLRUN_LIFT, WALLRUN_VY_MAX);
      p.jumps = AIR_JUMPS;
      p.dashes = 1;
      p.coyote = 0;
      p.ev |= EV.WALLRUN_START;
      return;
    }
  }
};

/** Takes hold of a ledge: hang there. */
const grab = (p: PlayerState, l: Ledge): void => {
  enter(p, MODE.HANG);
  p.wall = l.side;
  p.edge = f32(l.top);
  if (l.side <= SIDE.WEST) {
    p.x = l.hang;
  } else {
    p.z = l.hang;
  }
  p.vx = p.vy = p.vz = 0;
  p.jumps = AIR_JUMPS;
  p.dashes = 1;
  p.coyote = 0;
  p.buffer = 0;
  p.ev |= EV.GRAB;
};

/** The modes that move freely: everything but the hang and the climb. */
const free = (p: PlayerState, w: World, c: Ctl): void => {
  // A dash: on the ground, or once in the air (a wall-run ends in it).
  const ground = p.mode === MODE.GROUND;
  if (
    c.dash &&
    p.dash === 0 &&
    (ground || ((p.mode === MODE.AIR || p.mode === MODE.WALLRUN) && p.dashes > 0))
  ) {
    const [dx, dz] = c.wx || c.wz ? [c.wx, c.wz] : [c.fx, c.fz];
    if (!ground) {
      p.dashes--;
      p.vy = 0;
      if (p.mode === MODE.WALLRUN) {
        enter(p, MODE.AIR);
        p.ev |= EV.WALLRUN_END;
      }
    }
    p.vx = dx * DASH_SPEED;
    p.vz = dz * DASH_SPEED;
    p.dash = DASH_COOLDOWN;
    p.ev |= EV.DASH;
  }
  const burst = p.dash > DASH_COOLDOWN - DASH_TICKS;

  if (p.mode === MODE.WALLRUN) {
    run(p, w, c);
  }
  if (onFloor(p.mode)) {
    onGround(p, w, c, burst);
  }
  if (p.mode === MODE.AIR) {
    air(p, w, c, burst);
  }

  // A burst has no gravity, unless the dasher is rising (a jump out of a dash keeps its arc).
  const g = burst && p.vy <= 0 ? 0 : p.mode === MODE.WALLRUN ? WALLRUN_GRAVITY : 1;
  const was = p.mode;
  const hit = fly(p, w, heightOf(p), g, onFloor(was));

  if (hit >= 0) {
    if (!onFloor(p.mode)) {
      // Landed, crouching if the key is held, and sliding if fast.
      p.ev |= EV.LAND | (p.mode === MODE.WALLRUN ? EV.WALLRUN_END : 0);
      p.fall = hit;
      p.jumps = AIR_JUMPS;
      p.dashes = 1;
      p.wall = SIDE.NONE;
      if (c.keys & KEY.CROUCH) {
        const slide = len(p.vx, p.vz) >= SLIDE_MIN_SPEED;
        enter(p, slide ? MODE.SLIDE : MODE.CROUCH);
        p.ev |= slide ? EV.SLIDE_START : 0;
      } else {
        enter(p, MODE.GROUND);
      }
    }
    p.coyote = COYOTE_TICKS;
  } else if (onFloor(p.mode)) {
    // Walked off an edge: the coyote window stays open.
    p.ev |= p.mode === MODE.SLIDE ? EV.SLIDE_END : 0;
    enter(p, MODE.AIR);
  }
  if (p.mode === MODE.AIR) {
    const ledge = ledgeAt(p, w);
    if (ledge) {
      grab(p, ledge);
    } else {
      startRun(p, w, c);
    }
  }
};

/** On the floor: jump, crouch, slide, stand up, and the speed. */
const onGround = (p: PlayerState, w: World, c: Ctl, burst: boolean): void => {
  const low = (c.keys & KEY.CROUCH) !== 0;
  if (p.buffer > 0 && (p.mode === MODE.GROUND || canStand(p, w))) {
    p.ev |= p.mode === MODE.SLIDE ? EV.SLIDE_END : 0;
    enter(p, MODE.AIR);
    leap(p, JUMP_SPEED);
    return;
  }
  const speed = len(p.vx, p.vz);
  if (p.mode === MODE.GROUND && low) {
    const slide = speed >= SLIDE_MIN_SPEED;
    enter(p, slide ? MODE.SLIDE : MODE.CROUCH);
    p.ev |= slide ? EV.SLIDE_START : 0;
  } else if (
    p.mode === MODE.SLIDE &&
    (p.t >= SLIDE_TICKS || speed < SLIDE_END_SPEED || c.stumble)
  ) {
    p.ev |= EV.SLIDE_END;
    enter(p, !low && canStand(p, w) ? MODE.GROUND : MODE.CROUCH);
  } else if (p.mode === MODE.SLIDE && !low && canStand(p, w)) {
    p.ev |= EV.SLIDE_END;
    enter(p, MODE.GROUND);
  } else if (p.mode === MODE.CROUCH && !low && canStand(p, w)) {
    enter(p, MODE.GROUND);
  }
  if (burst) {
    return;
  }
  if (c.stumble) {
    // Thrown back: the knock slides out at STUMBLE_DRAG, with no steering, then a slow walk.
    if (speed > STUMBLE_SPEED) {
      const k = Math.max(STUMBLE_SPEED, speed - STUMBLE_DRAG * DT) / speed;
      p.vx *= k;
      p.vz *= k;
    } else {
      steer(p, unwalled(p, w, c, heightOf(p)), STUMBLE_SPEED);
    }
  } else if (p.mode === MODE.SLIDE) {
    const k = Math.max(0, speed - SLIDE_DECEL * DT) / speed;
    p.vx *= k;
    p.vz *= k;
  } else if (p.mode === MODE.CROUCH) {
    steer(p, unwalled(p, w, c, LOW_H), CROUCH_SPEED);
  } else {
    const sprint = (c.keys & KEY.SPRINT) !== 0 && c.fwd;
    steer(p, unwalled(p, w, c, PLAYER_H), sprint ? SPRINT_SPEED : RUN_SPEED);
  }
};

/** In the air: the extra jump, a jump just after an edge (coyote), and air control. */
const air = (p: PlayerState, w: World, c: Ctl, burst: boolean): void => {
  if (p.buffer > 0) {
    if (p.coyote > 0) {
      leap(p, JUMP_SPEED);
    } else if (p.jumps > 0 && !landingSoon(p, w)) {
      p.jumps--;
      leap(p, DOUBLE_JUMP_SPEED);
      p.ev = (p.ev & ~EV.JUMP) | EV.DOUBLE;
    }
  }
  if (burst || (!c.wx && !c.wz)) {
    return;
  }
  const before = len(p.vx, p.vz);
  p.vx += c.wx * AIR_ACCEL * DT;
  p.vz += c.wz * AIR_ACCEL * DT;
  cap(p, Math.max(before, AIR_SPEED));
};

/**
 * Applies one input for 1 / TICK_HZ s, in place: yaw and pitch from the input (pitch clamped to
 * MAX_PITCH), then the step of the current mode (see the top of the file). Feet under the world's
 * kill floor put the player back at a spawn of his `team` (EV.RESPAWN).
 */
export const move = (p: PlayerState, i: Input, w: World, team = 0): void => {
  p.yaw = norm(i.yaw);
  p.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, i.pitch));

  const f = (i.keys & KEY.FORWARD ? 1 : 0) - (i.keys & KEY.BACK ? 1 : 0);
  const s = (i.keys & KEY.RIGHT ? 1 : 0) - (i.keys & KEY.LEFT ? 1 : 0);
  const n = len(f, s) || 1;
  const [fx, fz] = forward(p.yaw);
  const pressed = (bit: number): boolean => (i.keys & bit) !== 0 && (p.held & bit) === 0;
  // A stumble (STUMBLE_TICKS steps from the tackle) drops the jump and dash presses.
  const stumbling = p.stun > 0;
  const c: Ctl = {
    keys: i.keys,
    stumble: stumbling,
    jump: !stumbling && pressed(KEY.JUMP),
    dash: !stumbling && pressed(KEY.DASH),
    fwd: f > 0,
    wx: (fx * f - fz * s) / n,
    wz: (fz * f + fx * s) / n,
    fx,
    fz,
  };

  const before = p.mode;
  p.ev = 0;
  p.fall = 0;
  if (c.jump) {
    // The press tick uses one: a press stays good for JUMP_BUFFER_TICKS steps after it.
    p.buffer = JUMP_BUFFER_TICKS + 1;
  }
  if (stumbling) {
    p.stun--;
  }
  if (p.dash > 0) {
    p.dash--;
    // The burst is over: the speed falls from DASH_EXIT_SPEED to the top speed.
    if (p.dash === DASH_COOLDOWN - DASH_TICKS) {
      cap(p, DASH_EXIT_SPEED);
    }
  }

  if (p.mode === MODE.HANG) {
    hang(p, w, c);
  }
  if (p.mode === MODE.CLIMB) {
    climb(p, w);
  } else if (p.mode !== MODE.HANG) {
    free(p, w, c);
  }

  // Drained by a rail hit: slowed on the floor plane.
  if (p.slow) {
    p.slow--;
    cap(p, SLOW_SPEED);
  }
  if (p.y < w.def.floor) {
    // Fallen off the roofs: back at the spawn of the player's id in his team.
    respawn(p, w, team);
  }
  p.t = p.mode === before ? Math.min(255, p.t + 1) : p.t;
  p.buffer = Math.max(0, p.buffer - 1);
  if (p.mode === MODE.AIR && before === MODE.AIR) {
    p.coyote = Math.max(0, p.coyote - 1);
  }
  p.held = i.keys & (KEY.JUMP | KEY.DASH);
  p.ground = onFloor(p.mode);
  // Host and client then hold identical values and the snapshot carries them exactly, so the
  // replay is exact (barring Math.sin / Math.cos differences between JS engines).
  p.x = f32(p.x);
  p.y = f32(p.y);
  p.z = f32(p.z);
  p.vx = f32(p.vx);
  p.vy = f32(p.vy);
  p.vz = f32(p.vz);
  p.edge = f32(p.edge);
};
