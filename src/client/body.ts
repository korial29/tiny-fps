// The own player's body in first person, Mirror's Edge style: the runners' skin (skin.ts) on the rig
// (rig.ts), posed by its own gait (gait.ts) from the predicted state and seen from its head, which
// is left out. The gait gives the stride, the trunk and the feet it plants. Here the body is moved
// so that its head sits at the camera, leaned with the look, the legs are solved again onto the
// planted feet and the hands are put on goals placed in the view: the frame edges on a run, the
// ledge on a hang, the wall on a wall-run. Drawn by the renderer over a cleared depth, like a view
// model. No DOM, pure but for the state it keeps.
import { DASH_COOLDOWN, DASH_TICKS, GRAB_GAP, PLAYER_R, STEP_H } from '../shared/constants';
import { TAU, eyeHeight, speedOf, sprinting } from '../shared/physics';
import { MODE } from '../shared/types';
import type { PlayerState } from '../shared/types';
import { ray } from '../shared/world';
import type { World } from '../shared/world';
import { createGait, frame } from './gait';
import type { Floor } from './gait';
import { TILT, held, pointed, tip } from './gun';
import { cutting, ends, fingers, frameOf, held as sword, progress, stroke, wrists } from './katana';
import { add, basis, dot, mix, sub, unit } from './mesh';
import type { Vec3 } from './mesh';
import { JOINT as J, PARENT, axis, mul, rest, slerp, solve, turn as spin } from './rig';
import type { Pose, Quat } from './rig';
import { CUFF, CUFF_SIDES, body, palette, skin } from './skin';
import { createTrail } from './trail';

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
  /** The joints for a camera at `eye`; undefined without a player, or with the camera away from the body. */
  pose(eye: Vec3, yaw: number, pitch: number, roll?: number): Solved | undefined;
  /** Appends the body's vertices (see STRIDE) in the jacket `color`; nothing when pose() has none. */
  draw(out: number[], eye: Vec3, yaw: number, pitch: number, roll?: number, color?: number[]): void;
}

/** Metres the camera may be from the eye of the body and still show it: the bob is centimetres, a crouch's ease under a metre. */
const AWAY = 1;
/** On a ledge the camera sits this far behind the head and below it, so that the arms reach the ledge. */
const [BEHIND, DROP] = [0.12, 0.03];
const [X, Y]: Vec3[] = [
  [1, 0, 0],
  [0, 1, 0],
];
const POLE: Vec3 = [0.7, -1, -0.5];
const clamp = (v: number, lo = 0, hi = 1) => Math.min(Math.max(v, lo), hi);
export const inv = ([x, y, z, w]: Quat): Quat => [-x, -y, -z, w];
const dist = (a: Vec3, b: Vec3) => Math.hypot(...sub(a, b));
/** The point `k` along the direction `d` from `o`. */
const along = (o: Vec3, d: Vec3, k: number): Vec3 => add(o, mix([0, 0, 0], d, k));

/** The shortest rotation that turns the direction a into b. */
const arc = (a: Vec3, b: Vec3): Quat => {
  const [u, v] = [unit(a), unit(b)];
  const q = [
    u[1] * v[2] - u[2] * v[1],
    u[2] * v[0] - u[0] * v[2],
    u[0] * v[1] - u[1] * v[0],
    1 + dot(u, v),
  ];
  const n = Math.hypot(...q) || 1;
  return q.map(c => c / n) as Quat;
};

/**
 * The middle joint of a two-bone limb from `a` toward `b`, bones l1 and l2, bent toward `pole`; and
 * the end it reaches, which is short of `b` when that is out of reach.
 */
const ik = (a: Vec3, b: Vec3, pole: Vec3, l1: number, l2: number): [Vec3, Vec3] => {
  const d = sub(b, a);
  const n = unit(d);
  const len = Math.max(Math.min(Math.hypot(...d), (l1 + l2) * 0.99), 0.15);
  const x = (l1 * l1 - l2 * l2 + len * len) / (2 * len);
  const h = Math.sqrt(Math.max(l1 * l1 - x * x, 0));
  const p = unit(sub(pole, mix([0, 0, 0], n, dot(pole, n))));
  return [along(along(a, n, x), p, h), along(a, n, len)];
};

/**
 * Turns the limb of root joint j (a shoulder, a hip) in `q` so that its end reaches `to`, the
 * middle joint toward `pole`. `s` is q solved: the bones keep their twist and swing the shortest
 * way. The end joint keeps its own turn in the world (a foot stays flat) or follows the bone (a hand).
 */
export const reach = (q: Pose, s: Solved, j: number, to: Vec3, pole: Vec3, flat = false) => {
  const [a, b, c] = [s.pos[j], s.pos[j + 1], s.pos[j + 2]];
  const [e, f] = ik(a, to, pole, dist(a, b), dist(b, c));
  const r1 = mul(arc(sub(b, a), sub(e, a)), s.rot[j]);
  const r2 = mul(arc(sub(c, b), sub(f, e)), s.rot[j + 1]);
  q.rot[j] = mul(inv(s.rot[PARENT[j]]), r1);
  q.rot[j + 1] = mul(inv(r1), r2);
  if (flat) {
    q.rot[j + 2] = mul(inv(r2), s.rot[j + 2]);
  }
};

/** The unit vector toward a wall on each SIDE, on the floor plane. */
const TOWARD = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Finger lengths against 4 cm, index to little. */
const LENGTH = [1, 1.1, 1, 0.82];
/** The thumb's two segments open and in a fist, as directions in the hand (x toward the thumb). */
const THUMB: [Vec3, Vec3][] = [
  [
    [0.55, -0.2, 0.8],
    [0.2, -0.75, 0.6],
  ],
  [
    [0.4, -0.1, 0.9],
    [-0.55, -0.5, 0.65],
  ],
];
/** Sides around a finger. */
const FINGER_SIDES = 6;
/** The wrist joint at rest: the cuff's ring is placed from it. */
const WRIST = solve(rest()).pos[J.HAND_R];

/** A ring of a tube: its centre and its two half axes. */
type Ring = [c: Vec3, x: Vec3, y: Vec3];

const cross = ([a, b, c]: Vec3, [d, e, f]: Vec3): Vec3 => [
  b * f - c * e,
  c * d - a * f,
  a * e - b * d,
];

/**
 * Appends, through `put(position, normal)`, the tube through `rings`: `sides` around, the normals
 * smooth along it and around it (from the rings either side), a ring of no extent a point that
 * closes the tube. The first ring's normals are its radial ones with `lean` along the tube, to meet
 * the surface it grows out of.
 */
const tube = (rings: Ring[], sides: number, put: (p: Vec3, n: Vec3) => void, lean?: number) => {
  const P = rings.map(([c, x, y]) =>
    x.some(Boolean)
      ? Array.from({ length: sides }, (_, i) => {
          const [s, k] = [Math.sin((i * TAU) / sides), Math.cos((i * TAU) / sides)];
          return [0, 1, 2].map(d => c[d] + x[d] * k + y[d] * s) as Vec3;
        })
      : [c],
  );
  /** Vertex i of ring r in a grid, the rings clamped and a point the same for every i. */
  const at = (G: Vec3[][], r: number, i: number) => {
    const row = G[Math.min(Math.max(r, 0), G.length - 1)];
    return row[(i + row.length) % row.length];
  };
  const N = P.map((row, r) =>
    row.map((_, i): Vec3 => {
      if (lean != null && !r) {
        const a = (i * TAU) / sides;
        return unit([Math.cos(a), Math.sin(a), lean]);
      }
      // A point has no ring to go round: its normal is the way the tube runs into it.
      if (row.length < 2) {
        return unit(sub(row[0], rings[r - 1][0]));
      }
      return unit(
        cross(sub(at(P, r, i + 1), at(P, r, i - 1)), sub(at(P, r + 1, i), at(P, r - 1, i))),
      );
    }),
  );
  for (let r = 1; r < P.length; r++) {
    for (let i = 0; i < sides; i++) {
      const [p, q, a, b] = [
        [r - 1, i],
        [r - 1, i + 1],
        [r, i + 1],
        [r, i],
      ];
      for (const t of P[r].length > 1
        ? [
            [p, q, a],
            [p, a, b],
          ]
        : [[p, q, a]]) {
        for (const [j, k] of t) {
          put(at(P, j, k), at(N, j, k));
        }
      }
    }
  }
};

/**
 * The rings of a finger, in the hand's space: from `p` along `d1` for `l`, then along `d2` for `l`,
 * `r` thick at the root, the first ring across `t`. The bend is a curve through the joint, not a
 * corner, so that a fist keeps a round knuckle.
 */
export const finger = (p: Vec3, d1: Vec3, d2: Vec3, l: number, r: number, t: Vec3): Ring[] => {
  const joint = along(p, d1, l);
  const [a, b] = [along(joint, d1, -l / 2), along(joint, d2, l / 2)];
  const ring = (c: Vec3, d: Vec3, k: number): Ring => {
    const [t, y] = [unit(d), unit(cross(d, X))];
    return [c, cross(y, t).map(v => v * r * k) as Vec3, y.map(v => v * r * k) as Vec3];
  };
  return [
    ring(p, t, 1.03),
    ring(a, d1, 1),
    ring(mix(joint, mix(a, b, 0.5), 0.5), sub(b, a), 0.94),
    ring(b, d2, 0.9),
    ring(along(joint, d2, l - 0.001), d2, 0.74),
    ring(along(joint, d2, l + 0.006), d2, 0),
  ];
};

/** The directions of the two phalanges of the finger i (index to little) at `curl`, in the hand's space. */
export const phalanges = (curl: number, i: number): [Vec3, Vec3] => {
  const splay = -(i - 1.5) * 0.08 * (1 - curl);
  const [a, b] = [0.1 + 1.3 * curl, 0.2 + 3 * curl].map(n =>
    unit([splay, -Math.sin(n), Math.cos(n)]),
  );
  return [a, b];
};

/**
 * A gloved hand at the wrist `end`: the fingers along `f`, the back of the hand along `u`, the thumb
 * toward `th` (unit vectors). `curl` runs from 0, a flat open hand with the fingers spread, to 1, a
 * fist. The palm is one tube that starts as the sleeve's cuff ends and spreads to the knuckles,
 * and each finger and the thumb one tube from there, bent at its joints: no solid meets another
 * in a line, and the normals are smooth all over.
 */
export const hand = (
  out: number[],
  end: Vec3,
  f: Vec3,
  u: Vec3,
  th: Vec3,
  curl: number,
  tint: number[],
) => {
  /** Hand space (x toward the thumb, y the back, z toward the fingers), a point and a direction, to the world. */
  const put = ([x, y, z]: Vec3, [m, n, w]: Vec3) =>
    out.push(
      ...[0, 1, 2].map(d => end[d] + th[d] * x + u[d] * y + f[d] * z),
      ...[0, 1, 2].map(d => th[d] * m + u[d] * n + f[d] * w),
      tint[0],
      tint[1],
      -1,
      tint[2],
    );
  // The palm starts as the sleeve's cuff does, vertex for vertex, its normals leaning to the fingers.
  const palm = ([z, y, a, b]: number[]): Ring => [
    [0, y, z],
    [a, 0, 0],
    [0, b, 0],
  ];
  tube(
    [
      palm([WRIST[1] - CUFF[0], CUFF[1] - WRIST[0], CUFF[3], CUFF[4]]),
      palm([0.025, 0, 0.04, 0.021]),
      palm([0.06, -0.002, 0.0425, 0.017]),
      palm([0.092, -0.004, 0.0425, 0.0105]),
      palm([0.104, -0.004, 0, 0]),
    ],
    CUFF_SIDES,
    put,
    0.75,
  );
  for (let i = 0; i < 4; i++) {
    const [d1, d2] = phalanges(curl, i);
    tube(
      finger(
        [0.0315 - 0.021 * i, -0.004, 0.092],
        d1,
        d2,
        0.04 * LENGTH[i],
        0.0105,
        unit(add(d1, [0, 0, 1])),
      ),
      FINGER_SIDES,
      put,
    );
  }
  const [d1, d2] = THUMB.map(([open, fist]) => unit(mix(open, fist, curl)));
  tube(finger([0.029, -0.01, 0.025], d1, d2, 0.037, 0.0118, d1), FINGER_SIDES, put);
};

/** The floor under a player standing at height `y`: the first top within a step above or below it. */
const floorOf =
  (world: World, y: number): Floor =>
  (x, z) => {
    const d = ray(world, [x, y + STEP_H, z], [0, -1, 0], 2 * STEP_H);
    return d > 0 && d < 2 * STEP_H ? y + STEP_H - d : y;
  };

/** The blends the animation eases, each toward 0 or 1, and how fast (1 / s). */
const RATES = {
  amp: 8,
  sprint: 6,
  air: 12,
  rise: 10,
  dash: 14,
  plant: 16,
  wall: 10,
  slide: 10,
  stun: 14,
  gun: 10,
  blade: 10,
};

export const createBody = (world?: World): Body => {
  const gait = createGait();
  /** The own player as last seen. */
  let me: PlayerState | undefined;
  const w = {
    amp: 0,
    sprint: 0,
    air: 0,
    rise: 0,
    dash: 0,
    plant: 0,
    wall: 0,
    slide: 0,
    stun: 0,
    gun: 0,
    blade: 0,
  };
  /** The kick of the last shot, 0 to 1, and how much of the right hand's pose the gun and the katana take, as of the last pose(). */
  let [kick, hold, grasp, wide] = [0, 0, 0, 1.6];
  /** How far through its cut the katana is, -1 when it is not cutting; and the light it leaves. */
  let prog = -1;
  const trail = createTrail();
  /** Where the gun points, in the camera's space. */
  let target: Vec3 = [0, 0, 8];
  /** Seconds, for the flailing of a stumble. */
  let clock = 0;
  /** Which hand the wall is on: -1 left, 1 right, eased. */
  let side = 0;
  /** The ledge the hands are on: the body's x and z, the height of its top, and the way the wall faces. */
  let grip: { x: number; y: number; z: number; dx: number; dz: number } | undefined;
  /** How closed each hand is, left then right, as of the last pose(). */
  const curls = [0, 0];

  const update: Body['update'] = (p, dt, k = 0, aspect = 1.6) => {
    kick = k;
    wide = aspect;
    if (!p) {
      me = undefined;
      return;
    }
    gait.update(p, dt, world && floorOf(world, p.y));
    me = { ...p };
    clock += dt;
    prog = progress(prog, p, dt);
    trail.update(dt);
    const walks = p.mode == MODE.GROUND || p.mode == MODE.CROUCH || p.mode == MODE.WALLRUN;
    const dash = p.dash > DASH_COOLDOWN - DASH_TICKS;
    const air = p.mode == MODE.AIR && !dash;
    const to = {
      amp: walks ? clamp(speedOf(p) / 9) : 0,
      sprint: +sprinting(p),
      air: +air,
      rise: +(air && p.vy > 0.5),
      dash: +dash,
      plant: +(p.mode == MODE.HANG || p.mode == MODE.CLIMB),
      wall: +(p.mode == MODE.WALLRUN),
      slide: +(p.mode == MODE.SLIDE),
      stun: +(p.stun > 0),
      gun: +(p.ammo >= 0 && !p.down && !p.wield),
      blade: +(!!p.wield && !p.down),
    };
    for (const n of Object.keys(RATES) as (keyof typeof RATES)[]) {
      w[n] += (to[n] - w[n]) * (1 - Math.exp(-dt * RATES[n]));
    }
    const [tx, tz] = TOWARD[p.wall];
    // Right of a body that faces `yaw` is (cos, -sin): the wall's side is its dot with it.
    side +=
      (clamp(tx * Math.cos(p.yaw) - tz * Math.sin(p.yaw), -1, 1) - side) * (1 - Math.exp(-dt * 10));
    if (to.plant && p.edge) {
      grip = { x: p.x, y: p.edge, z: p.z, dx: tx, dz: tz };
    }
  };

  /**
   * The gun in camera space: where its grip is (lower right, rising from below as it is taken, kicked
   * back by a shot, swaying with the run) and its axes, pointing at `target`.
   */
  const holster = (): [Vec3, Vec3[]] => {
    const a = w.amp * (1 + 0.5 * w.sprint);
    const [s, c] = [Math.sin(TAU * gait.phase), Math.cos(TAU * gait.phase)];
    const at: Vec3 = [
      Math.min(0.22, 0.18 * wide) + 0.012 * a * s,
      -0.25 + 0.018 * a * c - 0.3 * (1 - w.gun),
      0.4 - 0.05 * kick,
    ];
    // A shot kicks the nose up.
    const to: Vec3 = [target[0], target[1] + 0.1 * kick * Math.hypot(...target), target[2]];
    return [at, pointed(at, to, X, Y)];
  };

  /**
   * The katana in camera space, in the guard (rising from below as it is drawn, swaying with the
   * run) or in the cut: its axes [right, up, forward], the wrists of the right and the left hand
   * on its grip and where the fingers point.
   */
  const blade = () => {
    const a = w.amp * (1 + 0.5 * w.sprint);
    const [s, c] = [Math.sin(TAU * gait.phase), Math.cos(TAU * gait.phase)];
    const k = stroke(me?.cut ?? 0, Math.max(prog, 0));
    const at: Vec3 = [k[0] + 0.012 * a * s, k[1] + 0.018 * a * c - 0.35 * (1 - w.blade), k[2]];
    const ax = frameOf([k[3], k[4], k[5]], k[6]);
    const [r, l] = wrists(at, ax);
    return { ax, r, l, g: fingers(ax) };
  };

  const pose: Body['pose'] = (eye, yaw, pitch, roll = 0) => {
    if (!me || me.down || dist(eye, [me.x, me.y + eyeHeight(me), me.z]) > AWAY) {
      return undefined;
    }
    const g = gait.pose();
    const q: Pose = {
      at: [...g.at],
      yaw: g.yaw,
      hips: [...g.hips],
      rot: g.rot.map(r => [...r] as Quat),
    };
    const [r, u, f] = basis(yaw, pitch, roll);
    /** Camera space (right, up, forward) as a direction in the world, and a world direction in it. */
    const turn = ([a, b, c]: Vec3): Vec3 => [
      r[0] * a + u[0] * b + f[0] * c,
      r[1] * a + u[1] * b + f[1] * c,
      r[2] * a + u[2] * b + f[2] * c,
    ];
    const view = (v: Vec3): Vec3 => [dot(v, r), dot(v, u), dot(v, f)];
    // The trunk follows the look a little.
    for (const j of [J.SPINE, J.CHEST]) {
      q.rot[j] = mul(q.rot[j], axis(X, 0.12 * clamp(pitch, -1.3, 1.3)));
    }
    // The head goes to the camera, the planted feet stay where they are.
    const s0 = solve(q);
    const ahead: Vec3 = [-Math.sin(yaw), 0, -Math.cos(yaw)];
    const nose = add(s0.pos[J.HEAD], spin(s0.rot[J.HEAD], [0, 0.02, -0.08]));
    q.at = add(
      q.at,
      sub(eye, along(nose, [-ahead[0] * BEHIND, -DROP, -ahead[2] * BEHIND], w.plant)),
    );
    const s = solve(q);
    const fwd: Vec3 = [-Math.sin(q.yaw), 0, -Math.cos(q.yaw)];
    for (const j of [J.THIGH_L, J.THIGH_R]) {
      reach(q, s, j, s0.pos[j + 2], fwd, true);
    }
    // The gun hand's wrist: the grip is 8 cm along the fingers from it and 2 cm toward the palm.
    const [gp, ga] = holster();
    const fh = [0, 1, 2].map(i => TILT[1] * ga[2][i] - TILT[0] * ga[1][i]) as Vec3;
    const wrist = [0, 1, 2].map(i => gp[i] - 0.078 * fh[i] + 0.022 * ga[0][i]) as Vec3;
    const sw = w.blade > 0.002 ? blade() : undefined;
    for (const sd of [-1, 1]) {
      const k = Math.cos(TAU * gait.phase) * sd;
      // The numbers are for the right hand, mirrored below. The arms hang along the body, out of
      // view; in a stride each swings like a pendulum, up into the lower view ahead and out of it
      // behind, more with speed and highest in a sprint.
      const g = clamp(w.amp * 1.8) + 0.2 * w.sprint;
      let h: Vec3 = [0.24 - 0.05 * g, -0.66 + 0.46 * g * ((k + 1) / 2) ** 1.2, 0.1 + 0.26 * g * k];
      h = mix(h, [0.38, -0.2, 0.34], w.air);
      h = mix(h, [0.3, 0.02, 0.45], w.rise);
      h = mix(h, [0.14, -0.1, 0.5], w.dash);
      const toWall = w.wall * clamp(side * sd);
      h = mix(h, [0.42, -0.16, 0.42], toWall);
      h = mix(h, sd > 0 ? [0.36, -0.26, 0.38] : [0.28, -0.1, 0.42], w.slide);
      // Reeling from a tackle: the hands thrown out and up, flailing against each other.
      const flail = Math.sin(clock * 12 + (sd > 0 ? Math.PI : 0));
      h = mix(h, [0.46, 0.05 + 0.2 * flail, 0.4 + 0.1 * flail], w.stun);
      if (grip) {
        // On the ledge's lip, a hand-width apart along the wall, the right hand on the right.
        let [tx, tz] = [-grip.dz, grip.dx];
        if (dot([tx, 0, tz], r) < 0) {
          [tx, tz] = [-tx, -tz];
        }
        // The wrist a hand's length short of the lip, the fingers over it.
        const lip = PLAYER_R + GRAB_GAP - 0.08;
        const at: Vec3 = [
          grip.x + grip.dx * lip + tx * 0.12 * sd,
          grip.y + 0.03,
          grip.z + grip.dz * lip + tz * 0.12 * sd,
        ];
        // Rising past it the hands push down on it and stay in the lower view.
        const [px, py, pz] = view(sub(at, eye));
        h = mix(h, [px * sd, Math.max(py, -0.28), Math.max(pz, 0.4)], w.plant);
      }
      // The weapons take the hand unless it is on a ledge or a wall or reeling. The katana takes
      // both hands.
      const free = 1 - clamp(w.plant + toWall + w.stun);
      const onSword = sw ? w.blade * free : 0;
      let taken = onSword;
      if (sd > 0) {
        hold = w.gun * free;
        h = mix(h, wrist, hold);
        grasp = onSword;
        taken = Math.max(hold, grasp);
      }
      if (sw) {
        h = mix(h, sd > 0 ? sw.r : [-sw.l[0], sw.l[1], sw.l[2]], onSword);
      }
      // A loose fist, tighter as the pace goes up; open to catch the air, flat on a ledge, a wall or the floor.
      let curl = 0.75 + 0.25 * w.sprint;
      for (const [open, t] of [
        [0.25, w.air],
        [0.1, w.rise],
        [1, w.dash],
        [0.1, toWall],
        [0.1, w.slide],
        [0.1, w.plant],
        [0.2, w.stun],
      ]) {
        curl += (open - curl) * t;
      }
      curls[(sd + 1) / 2] = curl + (0.9 - curl) * taken;
      const to = add(eye, turn([h[0] * sd, h[1], h[2]]));
      const arm = sd < 0 ? J.ARM_L : J.ARM_R;
      reach(q, s, arm, to, turn([POLE[0] * sd, POLE[1], POLE[2]]));
      // The palm turns down, the back of the hand to the view, flat on a ledge or the floor.
      q.rot[arm + 2] = axis(Y, sd * (1 + 0.5 * (w.plant + w.slide)));
      if (sd > 0 && hold > 0.002) {
        // The back of the hand along the gun's right, the fingers around the grip.
        const rot = frame(turn(ga[0]), turn(fh));
        q.rot[arm + 2] = slerp(q.rot[arm + 2], mul(inv(solve(q).rot[J.FOREARM_R]), rot), hold);
      }
      if (sw && onSword > 0.002) {
        // Both hands: the back of the hand along the blade's right, the fingers around the grip.
        const rot = frame(turn(sw.ax[0]), turn(sw.g));
        const fore = sd > 0 ? J.FOREARM_R : J.FOREARM_L;
        q.rot[arm + 2] = slerp(q.rot[arm + 2], mul(inv(solve(q).rot[fore]), rot), onSword);
      }
    }
    return solve(q);
  };

  return {
    get id() {
      return me?.id ?? -1;
    },
    update,
    pose,
    draw(out, eye, yaw, pitch, roll = 0, color = [0.7, 0.7, 0.7]) {
      const s = pose(eye, yaw, pitch, roll);
      if (s) {
        const colors = palette(color);
        skin(out, body(2), s, colors);
        [J.HAND_L, J.HAND_R].forEach((j, i) => {
          const q = s.rot[j];
          hand(
            out,
            s.pos[j],
            spin(q, [0, -1, 0]),
            spin(q, [i * 2 - 1, 0, 0]),
            spin(q, [0, 0, -1]),
            curls[i],
            colors[7],
          );
        });
        if (hold > 0.2) {
          held(out, s.pos[J.HAND_R], s.rot[J.HAND_R], 1, clamp(hold * 1.5 - 0.5), me?.ammo);
        }
        if (grasp > 0.2) {
          sword(out, s.pos[J.HAND_R], s.rot[J.HAND_R], 1, clock, clamp(grasp * 1.5 - 0.5));
        }
        const [base, point] = ends(s.pos[J.HAND_R], s.rot[J.HAND_R]);
        trail.mark(base, point, grasp > 0.5 && cutting(prog));
        trail.draw(out);
      }
    },
    aim(t) {
      const l = Math.hypot(...t);
      target = l < 3 ? (l ? (t.map(v => (v * 3) / l) as Vec3) : [0, 0, 3]) : t;
    },
    muzzle: () => tip(...holster()),
  };
};
