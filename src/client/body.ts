// The own player's body in first person, Mirror's Edge style: two arms in the view, two legs below
// it. A small animation state eased each frame from the own PlayerState and its events picks the
// pose; the joints come from two-bone IK; the pieces are smooth solids placed per frame (figure.ts).
// Drawn by the renderer over a cleared depth, like a view model. No DOM, pure but for the state it
// keeps.
import { DASH_COOLDOWN, DASH_TICKS, GRAB_GAP, PLAYER_R, SPRINT_SPEED } from '../shared/constants';
import { eyeHeight, speedOf, sprinting } from '../shared/physics';
import { EV, MODE } from '../shared/types';
import type { PlayerState } from '../shared/types';
import { RADII, hand, shoe, torso } from './figure';
import { add, basis, dot, mix, segment, solid, sub, unit } from './mesh';
import type { Vec3 } from './mesh';

/** What the predictor reports of the live steps since the last frame. */
export interface Events {
  ev: number;
  fall: number;
}

/**
 * A limb in world space: its root, its joint, its end, and where the hand or foot points. A hand
 * also has `curl`, 0 open to 1 a fist, and `roll`, 1 with the palm toward the body, 0 down, -1 out.
 */
export interface Limb {
  root: Vec3;
  mid: Vec3;
  end: Vec3;
  dir: Vec3;
  curl: number;
  roll: number;
}

/** The joints of the body: index 0 is the left side, 1 the right. */
export interface Rig {
  arms: Limb[];
  legs: Limb[];
  /** Pelvis and the top of the chest. */
  torso: [Vec3, Vec3];
  /** 0 to 1: how much the hands hold a ledge; the sleeves slim down, being this close to the eye. */
  grip: number;
  /** 0 to 1: how low the body is (a crouch or a slide). */
  low: number;
}

export interface Body {
  /** Advances dt seconds: the own player (eased, undefined before the first snapshot) and the events of its steps. */
  update(me: PlayerState | undefined, e: Events, dt: number): void;
  /** The joints for a camera at `eye`; undefined without a player, or with the camera away from the body. */
  rig(eye: Vec3, yaw: number, pitch: number, roll?: number): Rig | undefined;
  /** Appends the body's vertices (see STRIDE) for that camera; nothing when rig() has none. */
  draw(out: number[], eye: Vec3, yaw: number, pitch: number, roll?: number): void;
}

/** Limb phase per metre run, slower on a sprint (longer strides): one stride is 2.9 m, matching the camera bob. */
const GAIT = 2.2;
/** Metres the camera may be from the eye of the body and still show it (the bob is centimetres). */
const AWAY = 0.5;
/** Pitch below which the legs can be in view (the field of view is 70 degrees, its bottom 35 below the look). */
const LOOK_DOWN = -0.15;
const [UPPER, FORE] = [0.35, 0.38];
const [THIGH, SHIN] = [0.43, 0.45];
const RED = [0.95, 0.22, 0.1];

/**
 * The joint and the end of a two-bone limb from `a` toward `b`, segments l1 and l2: the joint
 * bends toward `pole`, and out of reach the limb stretches straight.
 */
const ik = (a: Vec3, b: Vec3, pole: Vec3, l1: number, l2: number): [Vec3, Vec3] => {
  const d = sub(b, a);
  const n = unit(d);
  const len = Math.max(Math.min(Math.hypot(...d), (l1 + l2) * 0.99), 0.15);
  const x = (l1 * l1 - l2 * l2 + len * len) / (2 * len);
  const h = Math.sqrt(Math.max(l1 * l1 - x * x, 0));
  const k = dot(pole, n);
  const p = unit([pole[0] - n[0] * k, pole[1] - n[1] * k, pole[2] - n[2] * k]);
  return [
    [a[0] + n[0] * x + p[0] * h, a[1] + n[1] * x + p[1] * h, a[2] + n[2] * x + p[2] * h],
    [a[0] + n[0] * len, a[1] + n[1] * len, a[2] + n[2] * len],
  ];
};

const [JACKET, TROUSERS, SHOE] = [
  [0.3, 0.32, 0.37],
  [0.14, 0.15, 0.2],
  [0.6, 0.61, 0.65],
];
/** The solids, built from the first frame: the sleeves, the cuff, the legs at the middle level of detail. */
const kit = () => ({
  upper: solid(2, UPPER, RADII.upper, [1, 1]),
  fore: solid(2, FORE, RADII.fore, [1, 0]),
  cuff: solid(2, 0.03, [0.033, 0.033], [0, 0]),
  thigh: solid(1, THIGH, RADII.thigh, [0.5, 1]),
  shin: solid(1, SHIN, RADII.shin, [0.5, 0.5]),
});

/** The unit vector toward a wall on each SIDE, on the floor plane. */
const TOWARD = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** A hand's goal: where the wrist goes (view space: right, up, forward) and where the elbow bends. */
type Goal = [wrist: Vec3, pole: Vec3];

/** A goal for the hand of side s: the numbers are for the right hand, mirrored for the left. */
const goal = (
  s: number,
  x: number,
  y: number,
  z: number,
  px: number,
  py: number,
  pz: number,
): Goal => [
  [s * x, y, z],
  [s * px, py, pz],
];
const layer = ([w0, p0]: Goal, [w1, p1]: Goal, t: number): Goal => [mix(w0, w1, t), mix(p0, p1, t)];
const clamp = (v: number, lo = 0, hi = 1) => Math.min(Math.max(v, lo), hi);

/** The blends the animation eases, each toward 0 or 1, and how fast (1 / s). */
const RATES = {
  sprint: 6,
  air: 12,
  dash: 14,
  hang: 16,
  climb: 12,
  wall: 10,
  slide: 10,
  low: 12,
  amp: 8,
};
/** Events that kick a pulse up at once and let it die away (1 / s). */
const DECAY = { jump: 5, tuck: 4, land: 7 };

export const createBody = (): Body => {
  /** The own player as last seen. */
  let me: PlayerState | undefined;
  const w = { sprint: 0, air: 0, dash: 0, hang: 0, climb: 0, wall: 0, slide: 0, low: 0, amp: 0 };
  /** Pulses: `v` follows `kick` (which an event sets to 1 and which decays), so they ease in as well. */
  const kick = { jump: 0, tuck: 0, land: 0 };
  const v = { jump: 0, tuck: 0, land: 0 };
  /** Stride phase, run distance times GAIT. */
  let phase = 0;
  /** Which hand the wall is on: -1 left, 1 right, eased. */
  let side = 0;
  /** The ledge the hands are planted on: where its lip is, and the way the wall faces. */
  let grip: { x: number; z: number; y: number; dx: number; dz: number } | undefined;

  const walks = (m: number) => m == MODE.GROUND || m == MODE.WALLRUN || m == MODE.CROUCH;

  const update: Body['update'] = (p, { ev, fall }, dt) => {
    if (!p) {
      me = undefined;
      return;
    }
    const d = me && walks(me.mode) && walks(p.mode) ? Math.hypot(p.x - me.x, p.z - me.z) : 0;
    const run = walks(p.mode) && d < 1;
    phase += run ? d * (GAIT - 0.6 * w.sprint) : 0;
    me = { ...p };
    const to = {
      sprint: +sprinting(p),
      air: +(p.mode == MODE.AIR && p.dash <= DASH_COOLDOWN - DASH_TICKS),
      dash: +(p.dash > DASH_COOLDOWN - DASH_TICKS),
      hang: +(p.mode == MODE.HANG),
      climb: +(p.mode == MODE.CLIMB),
      wall: +(p.mode == MODE.WALLRUN),
      slide: +(p.mode == MODE.SLIDE),
      low: +(p.mode == MODE.SLIDE || p.mode == MODE.CROUCH),
      amp: walks(p.mode) ? clamp(speedOf(p) / SPRINT_SPEED) : 0,
    };
    for (const n of Object.keys(RATES) as (keyof typeof RATES)[]) {
      w[n] += (to[n] - w[n]) * (1 - Math.exp(-dt * RATES[n]));
    }
    if (ev & EV.JUMP) {
      kick.jump = 1;
    }
    if (ev & EV.DOUBLE) {
      kick.tuck = 1;
    }
    if (ev & EV.LAND) {
      kick.land = clamp(fall / 12, 0.3);
    }
    for (const n of Object.keys(DECAY) as (keyof typeof DECAY)[]) {
      v[n] += (kick[n] - v[n]) * (1 - Math.exp(-dt * 24));
      kick[n] *= Math.exp(-dt * DECAY[n]);
    }
    const [tx, tz] = TOWARD[p.wall];
    // Right of a body that faces `yaw` is (cos, -sin): the wall's side is its dot with it.
    side +=
      (clamp(tx * Math.cos(p.yaw) - tz * Math.sin(p.yaw), -1, 1) - side) * (1 - Math.exp(-dt * 10));
    if ((p.mode == MODE.HANG || p.mode == MODE.CLIMB) && p.edge) {
      grip = { x: p.x, z: p.z, y: p.edge, dx: tx, dz: tz };
    }
  };

  const rig: Body['rig'] = (eye, yaw, pitch, roll = 0) => {
    if (!me || Math.hypot(...sub(eye, [me.x, me.y + eyeHeight(me), me.z])) > AWAY) {
      return undefined;
    }
    const [r, u, f] = basis(yaw, pitch, roll);
    const rot = (a: Vec3): Vec3 => [dot(a, r), dot(a, u), dot(a, f)];
    /** View space (right, up, forward) as a direction in the world, and as a point. */
    const turn = ([a, b, c]: Vec3): Vec3 => [
      r[0] * a + u[0] * b + f[0] * c,
      r[1] * a + u[1] * b + f[1] * c,
      r[2] * a + u[2] * b + f[2] * c,
    ];
    const view = (p: Vec3): Vec3 => add(eye, turn(p));
    const [sy, cy] = [Math.sin(yaw), Math.cos(yaw)];
    const body = ([a, b, c]: Vec3): Vec3 => [
      me!.x + a * cy - c * sy,
      me!.y + b,
      me!.z - a * sy - c * cy,
    ];
    const a = w.amp * (1 + 0.5 * w.sprint);
    const plant = Math.max(w.hang, w.climb);

    const arms = [-1, 1].map((s): Limb => {
      const sn = Math.sin(phase + (s > 0 ? Math.PI : 0));
      const k = Math.sign(sn) * Math.abs(sn) ** (1 - 0.4 * w.sprint);
      const rest = mix([0.27, -0.27, 0.46], [0.2, -0.16, 0.44], w.sprint);
      let g: Goal = goal(s, rest[0], rest[1] + 0.08 * a * k, rest[2] + 0.1 * a * k, 0.7, -1, -0.5);
      g = layer(g, goal(s, 0.4, -0.2, 0.36, 0.8, -0.8, -0.3), w.air);
      g = layer(g, goal(s, 0.3, 0.04, 0.5, 0.6, -1, -0.2), v.jump);
      g = layer(g, goal(s, 0.15, -0.24, 0.28, 0.9, -0.4, -0.6), v.tuck);
      g = layer(g, goal(s, 0.42, -0.4, 0.3, 1, -1, -0.2), v.land);
      g = layer(g, goal(s, 0.13, -0.1, 0.64, 0.7, -1, -0.3), w.dash);
      const wallHand = goal(s, 0.4, -0.2 + 0.02 * Math.sin(phase * 2), 0.52, 0.4, -1, -0.5);
      const toWall = w.wall * clamp(side * s);
      g = layer(g, wallHand, toWall);
      g = layer(
        g,
        s > 0
          ? goal(1, 0.46, -0.32, 0.4, 1, -0.4, -0.5)
          : goal(1, -0.3, -0.12, 0.5, -0.8, -0.6, -0.3),
        w.slide,
      );
      let dir: Vec3 | undefined;
      if (grip) {
        // Planted: the wrist on the ledge's lip, the hands a hand-width apart along the wall.
        let tx = -grip.dz;
        let tz = grip.dx;
        if (tx * cy - tz * sy < 0) {
          [tx, tz] = [-tx, -tz];
        }
        const lip = PLAYER_R + GRAB_GAP;
        const at: Vec3 = [
          grip.x + grip.dx * lip + tx * 0.12 * s,
          grip.y + 0.06,
          grip.z + grip.dz * lip + tz * 0.12 * s,
        ];
        const [px, py, pz] = rot(sub(at, eye));
        // Pushing down on it while the body rises past: the hands stay in the lower view.
        g = layer(
          g,
          [
            [px, Math.max(py, -0.36), Math.max(pz, 0.3)],
            [s * 0.5, -1, -0.4],
          ],
          plant,
        );
        dir = rot([grip.dx, -0.15, grip.dz]);
      }
      // A loose fist, tighter as the pace goes up; open to catch the air, flat on a ledge or a wall.
      let curl = 0.55 + 0.35 * w.sprint;
      for (const [to, t] of [
        [0.3, w.air],
        [0.1, v.jump],
        [0.9, v.tuck],
        [1, w.dash],
        [0.1, toWall],
        [0.35, w.slide],
        [0.1, plant],
      ]) {
        curl += (to - curl) * t;
      }
      const shoulder: Vec3 = [s * (0.15 - 0.05 * plant), -0.22 + 0.08 * plant, -0.2 + 0.12 * plant];
      const [elbow, wrist] = ik(shoulder, g[0], g[1], UPPER, FORE);
      const pointing = unit(sub(wrist, elbow));
      return {
        root: view(shoulder),
        mid: view(elbow),
        end: view(wrist),
        dir: turn(dir ? mix(pointing, unit(dir), plant) : pointing),
        curl,
        roll: (1 - plant) * (1 - 2 * toWall),
      };
    });

    const stand = mix([0, 0.88, -0.12], [0, 0.46, -0.2], w.low);
    const pelvis = mix(stand, [0, 0.26, -0.4], w.slide);
    pelvis[1] -= 0.22 * v.land;
    const chest = mix(mix([0, 1.4, -0.2], [0, 0.55, -0.12], w.low), [0, 0.5, -0.3], w.slide);
    const legs = [-1, 1].map((s): Limb => {
      const sn = Math.sin(phase + (s > 0 ? 0 : Math.PI));
      const cn = Math.cos(phase + (s > 0 ? 0 : Math.PI));
      const swing = w.amp * (1 + 0.5 * w.sprint);
      let ankle: Vec3 = [
        s * 0.12,
        0.07 + 0.2 * swing * Math.max(0, cn),
        -0.02 - 0.1 * w.low + 0.3 * swing * sn,
      ];
      ankle = mix(ankle, [s * 0.12, 0.3, s * 0.2], w.air);
      ankle = mix(ankle, [s * 0.12, 0.62, 0.1], v.tuck);
      ankle = mix(ankle, [s * 0.1, 0.28, -0.4], w.dash);
      ankle = mix(ankle, [s * 0.1, 0.12, -0.12], w.hang);
      ankle = mix(ankle, s > 0 ? [0.1, 0.5, 0.2] : [-0.1, 0.1, -0.1], w.climb);
      ankle = mix(ankle, [s * 0.11, 0.2, 0.84 + 0.08 * s], w.slide);
      const hip: Vec3 = [pelvis[0] + s * 0.11, pelvis[1], pelvis[2]];
      const [knee, end] = ik(hip, ankle, [s * 0.15, 0.2, 1], THIGH, SHIN);
      return {
        root: body(hip),
        mid: body(knee),
        end: body(end),
        dir: [-sy, 0, -cy],
        curl: 0,
        roll: 1,
      };
    });
    return { arms, legs, torso: [body(pelvis), body(chest)], grip: plant, low: w.low };
  };

  return {
    update,
    rig,
    draw(out, eye, yaw, pitch, roll = 0) {
      const j = rig(eye, yaw, pitch, roll);
      if (!j) {
        return;
      }
      const [r] = basis(yaw, pitch, roll);
      const [right, fwd]: Vec3[] = [
        [Math.cos(yaw), 0, -Math.sin(yaw)],
        [-Math.sin(yaw), 0, -Math.cos(yaw)],
      ];
      const [pelvis, chest] = j.torso;
      const k = kit();
      // Below the view, unless the body is low: the legs are only seen looking down.
      if (pitch < LOOK_DOWN || j.low > 0.2) {
        torso(out, 2, pelvis, unit(sub(chest, pelvis)), fwd, right, JACKET, TROUSERS, 0.75);
        for (const { root, mid, end } of j.legs) {
          segment(out, k.thigh, root, mid, right, THIGH, 1, TROUSERS);
          segment(out, k.shin, mid, end, right, SHIN, 1, TROUSERS);
          shoe(out, 1, end, unit(sub(end, mid)), fwd, right, SHOE);
        }
      }
      j.arms.forEach(({ root, mid, end, dir, curl, roll: turn }, i) => {
        const s = i ? 1 : -1;
        const along = unit(sub(end, mid));
        segment(out, k.upper, root, mid, r, UPPER, 1 - 0.4 * j.grip, JACKET);
        segment(out, k.fore, mid, end, r, FORE, 1 - 0.3 * j.grip, JACKET);
        segment(
          out,
          k.cuff,
          sub(end, along.map(v => v * 0.025) as Vec3),
          add(end, along.map(v => v * 0.005) as Vec3),
          r,
          0.03,
          1,
          RED,
        );
        // The palm turns from down, on a ledge, to toward the body, to out against a wall.
        const side = add(r.map(v => v * (1 - Math.abs(turn))) as Vec3, [0, -s * turn, 0]);
        hand(out, end, dir, side, -s, curl);
      });
    },
  };
};
