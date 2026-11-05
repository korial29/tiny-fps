// The other players' model: a runner of smooth solids (mesh.ts), in the renderer's vertex format.
// Each runner keeps a small animation state, eased every frame from the interpolated PlayerState
// the snapshots give: the movement mode, the velocity, the ledge, the dash timer. The jump, double
// jump and landing are found in the changes between two frames (the events are not on the wire).
// The pose is layered like body.ts does for the own arms: a stride, then one pose per move
// weighted by its blend, the limbs placed by two-bone IK. A player's (x, y, z) is the bottom of
// the feet. No DOM.
import {
  DASH_COOLDOWN,
  DASH_TICKS,
  GRAB_GAP,
  HANG_H,
  PLAYER_R,
  SPRINT_SPEED,
} from '../shared/constants';
import { speedOf, sprinting } from '../shared/physics';
import { MODE } from '../shared/types';
import type { PlayerState } from '../shared/types';
import { RADII, SKIN, TOWARD, ik, neck, shoe, torso } from './figure';
import { aim, mix, place, segment, solid, sub, unit } from './mesh';
import type { Vec3 } from './mesh';

const clamp = (v: number, lo = 0, hi = 1) => Math.min(Math.max(v, lo), hi);
/** The shortest signed turn from angle a to angle b. */
const arc = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** The blends the animation eases, each toward its target, and how fast (1 / s). */
const RATES = {
  speed: 8,
  sprint: 6,
  air: 12,
  rise: 14,
  dash: 14,
  hang: 16,
  climb: 12,
  wr: 10,
  wl: 10,
  slide: 10,
  low: 12,
};
type Blends = Record<keyof typeof RATES, number>;

/** What a runner keeps between frames. */
export interface Runner {
  /** The player as last seen. */
  p: PlayerState;
  /** The yaw it is drawn at: where it looks, turned toward where it goes in a slide, a dash or a wall-run. */
  yaw: number;
  /** Stride phase, radians: the distance run times a gait. */
  phase: number;
  /** Seconds since the first frame, for the idle sway. */
  time: number;
  w: Blends;
  /** The dip of a landing: `kick` jumps up with the impact and dies away, `dip` follows it. */
  kick: number;
  dip: number;
  /** The double jump's somersault, 0 when none, then up to 1. */
  flip: number;
  /** Fastest fall since the feet left the floor, m/s (negative). */
  fall: number;
  /** The ledge being held: the height of its top above the feet, its distance ahead, the yaw that faces it. */
  h: number;
  f: number;
  wy: number;
  grip?: { x: number; z: number };
}

const walks = (m: number) => m == MODE.GROUND || m == MODE.CROUCH;
const floors = (m: number) => walks(m) || m == MODE.SLIDE;
const holds = (m: number) => m == MODE.HANG || m == MODE.CLIMB;

/** Where the player goes: its heading when it moves (else where it looks), and the side of the wall on it. */
const heading = (p: PlayerState) => (speedOf(p) > 1 ? Math.atan2(-p.vx, -p.vz) : p.yaw);
const sideOf = (p: PlayerState) => {
  const [tx, tz] = TOWARD[p.wall];
  const h = heading(p);
  return tx * Math.cos(h) - tz * Math.sin(h);
};

/** The blends a state asks for. */
const aims = (p: PlayerState): Blends => {
  const wall = p.mode == MODE.WALLRUN;
  const side = sideOf(p);
  return {
    speed: walks(p.mode) ? speedOf(p) : 0,
    sprint: +sprinting(p),
    air: +(p.mode == MODE.AIR),
    rise: +(p.mode == MODE.AIR && p.vy > 0.5),
    dash: +(p.dash > DASH_COOLDOWN - DASH_TICKS),
    hang: +(p.mode == MODE.HANG),
    climb: +(p.mode == MODE.CLIMB),
    wr: +(wall && side >= 0),
    wl: +(wall && side < 0),
    slide: +(p.mode == MODE.SLIDE),
    low: +(p.mode == MODE.SLIDE || p.mode == MODE.CROUCH),
  };
};

/** A runner as first seen: already in the pose its state asks for. */
export const createRunner = (p: PlayerState): Runner => ({
  p: { ...p },
  yaw: p.yaw,
  phase: 0,
  time: 0,
  w: aims(p),
  kick: 0,
  dip: 0,
  flip: 0,
  fall: 0,
  h: HANG_H,
  f: PLAYER_R + GRAB_GAP,
  wy: p.yaw,
});

/** Metres a respawn moves a player in a frame, at the least. */
const TELEPORT = 5;

/**
 * Moves the runner to the state `p` after dt seconds. Finds from the change since the last frame:
 * a double jump (in the air, an extra jump spent and the climb up reversed), a landing (the air
 * ended on a floor, hard in proportion to the fall), and runs the stride with the distance covered.
 */
export const step = (r: Runner, p: PlayerState, dt: number) => {
  const q = r.p;
  const d = Math.hypot(p.x - q.x, p.z - q.z);
  if (Math.hypot(d, p.y - q.y) > TELEPORT) {
    Object.assign(r, createRunner(p));
    return;
  }
  r.kick *= Math.exp(-dt * 7);
  const air = p.mode == MODE.AIR;
  if (air && q.mode == MODE.AIR && p.jumps < q.jumps && p.vy > q.vy) {
    r.flip = 1e-3;
  }
  if (air) {
    r.fall = Math.min(r.fall, p.vy);
  } else {
    if (q.mode == MODE.AIR && floors(p.mode) && r.fall < -3) {
      r.kick = clamp(-r.fall / 12, 0.3);
    }
    r.fall = 0;
  }
  if (r.flip) {
    r.flip += dt * (air ? 2.2 : 8);
    r.flip = r.flip >= 1 ? 0 : r.flip;
  }
  r.phase += walks(p.mode) && walks(q.mode) ? d * (2.3 - 0.7 * r.w.sprint) : 0;
  const to = aims(p);
  for (const n of Object.keys(RATES) as (keyof Blends)[]) {
    r.w[n] += (to[n] - r.w[n]) * (1 - Math.exp(-dt * RATES[n]));
  }
  r.dip += (r.kick - r.dip) * (1 - Math.exp(-dt * 24));
  r.time += dt;
  if (holds(p.mode) && p.wall) {
    const [tx, tz] = TOWARD[p.wall];
    if (!r.grip || p.mode == MODE.HANG) {
      r.grip = { x: p.x, z: p.z };
    }
    r.h = p.edge ? p.edge - p.y : r.h;
    r.f = (r.grip.x - p.x) * tx + (r.grip.z - p.z) * tz + PLAYER_R + GRAB_GAP;
    r.wy = Math.atan2(-tx, -tz);
  } else if (!holds(p.mode) && r.w.hang + r.w.climb < 0.01) {
    r.grip = undefined;
  }
  // Facing: along the way it goes while it slides, dashes or runs a wall, at the wall on a ledge.
  const way = clamp(r.w.wr + r.w.wl + r.w.slide + r.w.dash);
  const face = p.yaw + arc(p.yaw, heading(p)) * way;
  r.yaw = face + arc(face, r.wy) * clamp(r.w.hang + r.w.climb);
  r.p = { ...p };
};

/**
 * Moves each runner of `book` to its player in `others` after dt seconds: a new player gets a
 * runner already in pose, one that left loses it.
 */
export const animate = (book: Map<number, Runner>, others: PlayerState[], dt: number) => {
  for (const id of book.keys()) {
    if (!others.some(p => p.id == id)) {
      book.delete(id);
    }
  }
  for (const p of others) {
    const r = book.get(p.id);
    if (r) {
      step(r, p, dt);
    } else {
      book.set(p.id, createRunner(p));
    }
  }
};

/** A limb of the pose in metres, local: x right, y up, z forward, from the feet of the runner. */
export interface Limb {
  root: Vec3;
  mid: Vec3;
  end: Vec3;
  /** An arm: the way the hand points. A leg: how far the foot is rolled toward its right, radians. */
  dir: Vec3;
  tilt: number;
}

export interface Pose {
  pelvis: Vec3;
  /** Up the spine, and the way the chest faces: unit. */
  spine: Vec3;
  chest: Vec3;
  /** The centre of the head, and the way it faces. */
  head: Vec3;
  look: Vec3;
  /** Left then right. */
  arms: Limb[];
  legs: Limb[];
}

/**
 * A goal is [x, y, z, px, py, pz, tilt]: where the wrist or ankle goes (right, up, forward) and
 * where the elbow or knee bends, written for the right limb and mirrored for the left. A layer
 * is a pose of the move: the core [pelvis height, pelvis forward, lean forward, lean right]
 * and the goals of the arms and the legs, left then right. What a layer leaves out is kept.
 */
interface Layer {
  c?: number[];
  a?: number[][];
  l?: number[][];
}
const mir = (g: number[]) => g.map((v, i) => (i % 3 ? v : -v));
const sym = (g: number[]) => [mir(g), g];
/** The limbs near the wall (h = 1: on the right) and far from it, as left and right. */
const pair = (h: number, near: number[], far: number[]) =>
  h > 0 ? [far, near] : [mir(near), mir(far)];
const handed = (h: number, c: number[], an: number[], af: number[], ln: number[], lf: number[]) =>
  ({ c: [c[0], c[1], c[2], c[3] * h], a: pair(h, an, af), l: pair(h, ln, lf) }) as Layer;

const KNEE = [0.15, 0.2, 1];
const POSES = {
  crouch: { c: [0.5, 0.05, 0.45, 0], a: sym([0.3, 0.75, 0.35, 0.5, -1, -0.4]) } as Layer,
  air: {
    c: [0.9, 0, 0.12, 0],
    a: sym([0.72, 1.3, 0.05, 0.3, -1, -0.6]),
    l: [
      [-0.14, 0.2, -0.18, -0.15, 0.2, 1, 0],
      [0.14, 0.32, 0.3, ...KNEE, 0],
    ],
  } as Layer,
  rise: {
    c: [0.95, 0.02, 0.2, 0],
    a: sym([0.32, 1.95, 0.28, 0.7, -0.3, -1]),
    l: [
      [-0.12, 0.32, -0.18, -0.15, 0.2, 1, 0],
      [0.13, 0.5, 0.2, ...KNEE, 0],
    ],
  } as Layer,
  tuck: {
    c: [0.95, 0, 0.55, 0],
    a: sym([0.2, 0.78, 0.32, 0.8, -0.2, -0.2]),
    l: sym([0.13, 0.5, -0.12, ...KNEE, 0]),
  } as Layer,
  land: {
    c: [0.52, 0.06, 0.45, 0],
    a: sym([0.3, 0.85, 0.35, 0.5, -1, -0.5]),
    l: sym([0.15, 0.07, 0.05, ...KNEE, 0]),
  } as Layer,
  dash: {
    c: [0.64, 0.15, 1, 0],
    a: sym([0.3, 0.95, 0.1, 0.3, 1, -0.3]),
    l: [
      [-0.11, 0.5, -0.62, 0, -1, 0.3, 0],
      [0.12, 0.38, 0.6, ...KNEE, 0],
    ],
  } as Layer,
  slide: handed(
    1,
    [0.2, -0.12, -1.15, 0],
    [0.42, 0.62, 0.35, 0.5, -0.3, -1],
    [-0.4, 0.06, -0.5, -0.5, 0.3, -1],
    [0.14, 0.3, 0.95, 0.1, 1, 0.3, 0],
    [-0.2, 0.08, 0.15, -0.3, 1, 0.5, 0],
  ),
};
/** Running a wall on the right (h = 1) or the left: leaning away, the near foot flat on it, the far arm out. */
const WALL = [1, -1].map(h =>
  handed(
    h,
    [0.9, 0, 0.22, -0.35],
    [0.4, 1, 0.35, 0.4, -1, -0.2],
    [-0.82, 1.3, 0.1, -0.2, -1, -0.4],
    [0.38, 0.55, 0.3, 0.3, 0.3, 1, -1.3],
    [-0.1, 0.3, -0.5, 0, -1, 0.3, 0],
  ),
);

/**
 * Holding a ledge `h` above the feet and `f` ahead: hands on its lip, the body pulled up to it, then
 * a knee over it as h falls and the hands let go at the hip.
 */
const ledge = (r: Runner): Layer => {
  const { h, f } = r;
  const over = clamp((1.5 - h) / 0.9);
  const sway = 0.05 * Math.sin(r.time * 3);
  const hold = (s: number) => [
    s * 0.14,
    Math.max(h + 0.03, 0.6),
    f + 0.04 - 0.1 * over,
    s * 0.6,
    -1,
    -0.4,
  ];
  const lerp = (a: number[], b: number[]) => a.map((v, i) => v + (b[i] - v) * over);
  return {
    c: [Math.max(0.88, h - 0.95) + 0.17 * over, f - 0.22 + 0.2 * over, 0.6 * over, 0],
    a: [hold(-1), hold(1)],
    l: [
      lerp([-0.11, 0.12, 0.05 - sway, -0.15, 0.2, 1, 0], [-0.11, 0.25, 0.1, -0.15, 0.2, 1, 0]),
      lerp([0.11, 0.1, -0.12 + sway, ...KNEE, 0], [0.12, h + 0.07, f + 0.25, ...KNEE, 0]),
    ],
  };
};

const lerp = (a: number[], b: number[] | undefined, t: number) =>
  b ? a.map((v, i) => v + ((b[i] ?? v) - v) * t) : a;
/** The spine of a core: up, leaning forward and to the right. */
const spineOf = (c: number[]) =>
  unit([Math.sin(c[3]), Math.cos(c[2]) * Math.cos(c[3]), Math.sin(c[2])]);
/** The right of a body whose spine is `s`: the world's, with the part along the spine taken out. */
const rightOf = (s: Vec3): Vec3 => unit([1 - s[0] * s[0], -s[0] * s[1], -s[0] * s[2]]);
const [UPPER, FORE, THIGH, SHIN] = [0.31, 0.27, 0.43, 0.38];
/** The point `k` up the spine of core `c` and `x` to its right. */
const point = (c: number[], k: number, x: number): Vec3 => {
  const [s, r] = [spineOf(c), rightOf(spineOf(c))];
  return [r[0] * x + s[0] * k, c[0] + r[1] * x + s[1] * k, c[1] + r[2] * x + s[2] * k];
};

/** The pose of a runner now, in its own frame. */
export const pose = (r: Runner): Pose => {
  const { w } = r;
  const [pace, amp] = [clamp(w.speed / 2.5), clamp(w.speed / SPRINT_SPEED)];
  const hard = 1 + 0.2 * w.sprint;
  const sn = Math.sin(r.phase);
  // The stride: the pelvis dips twice a stride, leans with the speed, the legs reach and lift.
  let c = [
    0.88 - 0.03 * amp - 0.05 * w.sprint - 0.05 * pace * amp * sn * sn,
    0,
    0.04 + 0.28 * amp + 0.1 * w.sprint,
    0.04 * amp * sn,
  ];
  const plant = clamp(w.hang + w.climb);
  let arms = [-1, 1].map(s => {
    // Each arm swings against the leg on its side, the elbow lifting the hand as the pace goes up.
    const k = Math.sin(r.phase + (s > 0 ? Math.PI : 0));
    const [x, y, z] = point(c, 0.5, s * 0.205);
    return [
      x + s * 0.04,
      y - 0.52 + pace * amp * (0.12 + 0.3 * Math.max(0, k)),
      z + pace * (0.05 + 0.45 * amp * hard) * k,
      s * 0.5,
      -1,
      -0.6,
    ];
  });
  let legs = [-1, 1].map(s => {
    const a = r.phase + (s > 0 ? 0 : Math.PI);
    const lift = pace * (0.05 + 0.3 * amp * hard);
    return [
      s * 0.11,
      0.07 + lift * Math.max(0, Math.cos(a)),
      pace * (0.1 + 0.42 * amp * hard) * Math.sin(a),
      s * 0.15,
      0.2,
      1,
      0,
    ];
  });
  const tuck = r.flip ? Math.sqrt(Math.sin(Math.PI * r.flip)) : 0;
  const stack: [number, Layer][] = [
    [w.low, POSES.crouch],
    [w.air, POSES.air],
    [w.rise, POSES.rise],
    [r.dip, POSES.land],
    [w.dash, POSES.dash],
    [w.wr, WALL[0]],
    [w.wl, WALL[1]],
    [w.slide, POSES.slide],
    [plant, plant > 0.001 ? ledge(r) : {}],
    [tuck, POSES.tuck],
  ];
  for (const [t, l] of stack) {
    if (t > 0.001) {
      c = lerp(c, l.c, t);
      arms = arms.map((g, i) => lerp(g, l.a?.[i], t));
      legs = legs.map((g, i) => lerp(g, l.l?.[i], t));
    }
  }
  const [s, f]: Vec3[] = [spineOf(c), [0, 0, 1]];
  const pelvis = point(c, 0, 0);
  const chest = unit(sub(f, [s[0] * s[2], s[1] * s[2], s[2] * s[2]]));
  const limbs = (goals: number[][], root: (x: number) => Vec3, l1: number, l2: number) =>
    goals.map((g, i): Limb => {
      const a = root(i ? 1 : -1);
      const [mid, end] = ik(a, g.slice(0, 3) as Vec3, g.slice(3, 6) as Vec3, l1, l2);
      return { root: a, mid, end, dir: unit(sub(end, mid)), tilt: g[6] ?? 0 };
    });
  const out: Pose = {
    pelvis,
    spine: s,
    chest,
    head: point(c, 0.787, 0),
    look: unit(mix(chest, f, 0.5)),
    arms: limbs(arms, x => point(c, 0.5, x * 0.205), UPPER, FORE),
    legs: limbs(legs, x => point(c, 0, x * 0.11), THIGH, SHIN),
  };
  for (const a of out.arms) {
    a.dir = unit(mix(a.dir, [0, -0.15, 1], plant));
  }
  if (r.flip) {
    // Somersault forward about the middle of the body.
    const th = 2 * Math.PI * (3 - 2 * r.flip) * r.flip * r.flip;
    const [co, si] = [Math.cos(th), Math.sin(th)];
    const turn = ([x, y, z]: Vec3, o: Vec3 = [0, 0, 0]): Vec3 => [
      x,
      o[1] + (y - o[1]) * co - (z - o[2]) * si,
      o[2] + (z - o[2]) * co + (y - o[1]) * si,
    ];
    const mid: Vec3 = [0, pelvis[1] + 0.15, pelvis[2]];
    out.pelvis = turn(pelvis, mid);
    out.head = turn(out.head, mid);
    for (const k of ['spine', 'chest', 'look'] as const) {
      out[k] = turn(out[k]);
    }
    for (const l of [...out.arms, ...out.legs]) {
      [l.root, l.mid, l.end] = [l.root, l.mid, l.end].map(q => turn(q, mid));
      l.dir = turn(l.dir);
    }
  }
  return out;
};

const [TROUSERS, HAIR, SHOE, SHADES] = [
  [0.12, 0.13, 0.17],
  [0.09, 0.07, 0.06],
  [0.16, 0.16, 0.19],
  [0.03, 0.03, 0.04],
];

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
    const tip = a.map((v, k) => v + back[k] * len * r.w.dash);
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
 * Appends a runner at level of detail `lod` (see DETAIL): the jacket in `color` (r, g, b), dark
 * trousers, skin, hair and light shoes, posed by pose(). A dash trails a few glowing streaks.
 */
export const soldier = (out: number[], r: Runner, color: number[], lod = 1) => {
  const j = pose(r);
  const [s, c] = [Math.sin(r.yaw), Math.cos(r.yaw)];
  const { x, y, z } = r.p;
  /** The runner's frame (right, up, forward) as a point in the world, and as a direction. */
  const at = ([a, u, f]: Vec3): Vec3 => [x + a * c - f * s, y + u, z - a * s - f * c];
  const dir = ([a, u, f]: Vec3): Vec3 => [a * c - f * s, u, -a * s - f * c];
  const [right, fwd, spine] = [dir([1, 0, 0]), dir(j.chest), dir(j.spine)];
  const pelvis = at(j.pelvis);
  torso(out, lod, pelvis, spine, fwd, right, color, TROUSERS);
  const [ball, small] = [lod, 0].map(l => solid(l, 0, [1, 1]));
  const [head, face] = [at(j.head), aim(dir(j.look), right)];
  if (lod) {
    neck(out, lod, pelvis, spine, right);
  }
  place(out, ball, head, face, [0, 0, 0.012], [0.082, 0.12, 0.1], SKIN);
  place(out, ball, head, face, [0, 0.02, -0.004], [0.088, 0.113, 0.11], HAIR);
  if (lod) {
    // A hood rolled down behind the neck, and a nose.
    const hood = pelvis.map((v, i) => v + spine[i] * 0.58) as Vec3;
    place(out, small, hood, face, [0, 0, -0.075], [0.115, 0.055, 0.06], color);
    place(out, small, head, face, [0, -0.02, 0.108], [0.016, 0.028, 0.022], SKIN);
    place(out, small, head, face, [0, 0.025, 0.083], [0.068, 0.016, 0.03], SHADES);
  }
  const toes = dir([0, 0, 1]);
  for (const { root, mid, end, tilt } of j.legs) {
    const [hip, knee, ankle] = [root, mid, end].map(at);
    segment(out, solid(lod, THIGH, RADII.thigh, [0.5, 1]), hip, knee, right, THIGH, 1, TROUSERS);
    segment(out, solid(lod, SHIN, RADII.shin, [0.5, 0.5]), knee, ankle, right, SHIN, 1, TROUSERS);
    // The foot's top turns toward the left of the body as it rolls: on a wall the sole faces it.
    const top: Vec3 = [Math.sin(tilt) * right[0], Math.cos(tilt), Math.sin(tilt) * right[2]];
    shoe(out, lod, ankle, unit(sub(ankle, knee)), toes, cross(toes, top), SHOE);
  }
  for (const { root, mid, end, dir: d } of j.arms) {
    const [shoulder, elbow, wrist] = [root, mid, end].map(at);
    segment(out, solid(lod, UPPER, RADII.upper, [1, 0.5]), shoulder, elbow, right, UPPER, 1, color);
    segment(out, solid(lod, FORE, RADII.fore, [0.5, 0]), elbow, wrist, right, FORE, 1, color);
    place(out, small, wrist, aim(dir(d), right), [0, 0, 0.04], [0.04, 0.036, 0.058], SKIN);
  }
  if (r.w.dash > 0.15) {
    streaks(out, r, color, at);
  }
};
