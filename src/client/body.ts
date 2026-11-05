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
import { createGait } from './gait';
import type { Floor } from './gait';
import { add, basis, dot, mix, sub, unit } from './mesh';
import type { Vec3 } from './mesh';
import { JOINT as J, PARENT, axis, mul, solve, turn as spin } from './rig';
import type { Pose, Quat } from './rig';
import { body, palette, skin } from './skin';

export type Solved = ReturnType<typeof solve>;

export interface Body {
  /** The own player's id, -1 before the first snapshot. */
  readonly id: number;
  /** Advances dt seconds: the own player, eased (undefined before the first snapshot). */
  update(me: PlayerState | undefined, dt: number): void;
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
const inv = ([x, y, z, w]: Quat): Quat => [-x, -y, -z, w];
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
const reach = (q: Pose, s: Solved, j: number, to: Vec3, pole: Vec3, flat = false) => {
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
};

export const createBody = (world?: World): Body => {
  const gait = createGait();
  /** The own player as last seen. */
  let me: PlayerState | undefined;
  const w = { amp: 0, sprint: 0, air: 0, rise: 0, dash: 0, plant: 0, wall: 0, slide: 0, stun: 0 };
  /** Seconds, for the flailing of a stumble. */
  let clock = 0;
  /** Which hand the wall is on: -1 left, 1 right, eased. */
  let side = 0;
  /** The ledge the hands are on: the body's x and z, the height of its top, and the way the wall faces. */
  let grip: { x: number; y: number; z: number; dx: number; dz: number } | undefined;

  const update: Body['update'] = (p, dt) => {
    if (!p) {
      me = undefined;
      return;
    }
    gait.update(p, dt, world && floorOf(world, p.y));
    me = { ...p };
    clock += dt;
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

  const pose: Body['pose'] = (eye, yaw, pitch, roll = 0) => {
    if (!me || dist(eye, [me.x, me.y + eyeHeight(me), me.z]) > AWAY) {
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
    for (const sd of [-1, 1]) {
      const k = Math.cos(TAU * gait.phase) * sd;
      const a = w.amp * (1 + 0.5 * w.sprint);
      // The numbers are for the right hand, mirrored below.
      let h = mix([0.25, -0.17, 0.36], [0.2, -0.14, 0.42], w.sprint);
      h = [h[0], h[1] + 0.07 * a * k, h[2] + 0.12 * a * k];
      h = mix(h, [0.38, -0.2, 0.34], w.air);
      h = mix(h, [0.3, 0.02, 0.45], w.rise);
      h = mix(h, [0.14, -0.1, 0.5], w.dash);
      h = mix(h, [0.42, -0.16, 0.42], w.wall * clamp(side * sd));
      h = mix(h, sd > 0 ? [0.4, -0.3, 0.34] : [0.28, -0.1, 0.42], w.slide);
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
      const to = add(eye, turn([h[0] * sd, h[1], h[2]]));
      const arm = sd < 0 ? J.ARM_L : J.ARM_R;
      reach(q, s, arm, to, turn([POLE[0] * sd, POLE[1], POLE[2]]));
      // The palm turns down, the back of the hand to the view, flat on a ledge.
      q.rot[arm + 2] = axis(Y, -sd * (1 + 0.5 * w.plant));
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
        skin(out, body(2), s, palette(color));
      }
    },
  };
};
