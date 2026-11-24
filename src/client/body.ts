// The own player's body in first person, Mirror's Edge style: the runners' skin (skin.ts) on the rig
// (rig.ts), posed by its own gait (gait.ts) from the predicted state and seen from its head, which
// is left out. The gait gives the stride, the trunk and the feet it plants. Here the body is moved
// so that its head sits at the camera, leaned with the look, the legs are solved again onto the
// planted feet and the hands are put on goals placed in the view: the frame edges on a run, the
// ledge on a hang, the wall on a wall-run. Drawn by the renderer over a cleared depth, like a view
// model. No DOM, pure but for the state it keeps.
import {
  BLOW,
  CHARGE_TAP,
  CHARGE_TICKS,
  CUTS,
  DASH_COOLDOWN,
  DASH_TICKS,
  GLORY_TICKS,
  GRAB_GAP,
  PLAYER_R,
  STEP_H,
  HEAT_MAX,
  PUNCHES,
  HUNTER_CELLS,
} from '../shared/constants';
import { powerOf, sabering } from '../shared/gun';
import { TAU, eyeHeight, speedOf, sprinting } from '../shared/physics';
import { MODE } from '../shared/types';
import type { PlayerState } from '../shared/types';
import { ray } from '../shared/world';
import type { World } from '../shared/world';
import { SIDE, blowOf, createGait, frame, thrown } from './gait';
import { FIRE_KEY, wristComputer } from './computer';
import { fetched, pouch, pouchAt } from './pouch';
import { blades, drape } from './sash';
import { createFours } from './fours';
import type { Floor } from './gait';
import {
  GUN_ON,
  axes as gunAxes,
  RIFLE_CURL,
  RIFLE_HOLD,
  RIFLE_TILT,
  grip as gunGrip,
  pressAt,
  buttonAt,
  firsts,
  poke,
  thumbTo,
  tune,
  REAR,
  TILT,
  charge,
  ease,
  fore,
  kindOf,
  held,
  loadFrame,
  TAP,
  BROUGHT,
  screwed,
  pointed,
  power,
  span,
  swapOf,
  tip,
  cellsOf,
  handOf,
} from './gun';
import {
  BASE,
  BOW,
  C,
  S,
  SWAY,
  bent,
  cutting,
  ends,
  held as sword,
  PARRY_IN,
  deflect,
  locked,
  parrying,
  poised,
  progress,
  BLADE_EXTEND,
  wristBlades,
  wristHousing,
  wristEnds,
  BEHIND as BACK,
} from './katana';
import { STRIDE, add, basis, dot, mix, sub, unit } from './mesh';
import type { Vec3 } from './mesh';
import { JOINT as J, PARENT, REST, axis, mul, rest, slerp, solve, turn as spin } from './rig';
import type { Pose, Quat } from './rig';
import { armor } from './armor';
import {
  CANNON_FOLD,
  CANNON_HINGE,
  CANNON_MUZZLE,
  CANNON_POST as POST_BASE,
  DISC_CURL,
  DISC_HOLD,
  DISC_HOOK,
  DISC_RAISE,
  DISC_SPREAD,
  DISC_TILT,
  drawDisc,
  hunter as hunterModel,
  drawHarpoon,
  harpoonFeed,
  HARPOON_GONE,
  HARPOON_OUT,
  folded,
  handsFree,
  unfold,
} from './hunter';

import { CUFF, CUFF_NEAR, CUFF_SIDES, REGION, beast, body, palette, skin } from './skin';
import { CHITIN_X, CLAW, FOOT_TIP, HOOKED, PART, lashOf, partsOf, tail } from './xeno';
import type { Part } from './xeno';
import { CLOTH } from './mask';
import { createTrail } from './trail';
import { room } from './verts';
import type { Out } from './verts';
import { ID, ORIGIN, expand, mesh } from './store';
import type { Pieces } from './store';

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
  /** How far a share of the trunk's twist in a cut has turned the body as of the last update (radians, trunk()): the drawn view turns with it. */
  spun(): number;
  /** The katana in hand just struck a ball back: it snaps into the parry (DEFLECT, katana.ts) and eases back. */
  parried(): void;
  /** Its gait's footsteps so far and stride phase (Gait.steps, Gait.phase): the sounds of its steps and the bob of the view go with its feet. */
  readonly steps: number;
  readonly phase: number;
  /** The joints for a camera at `eye`; undefined without a player, or with the camera away from the body. */
  pose(eye: Vec3, yaw: number, pitch: number, roll?: number): Solved | undefined;
  /**
   * Appends the body's vertices (see STRIDE) in the jacket `color`; nothing when pose() has none.
   * Its rigid pieces go to `pieces` when given (the Hunter's armour and harpoon): kept on the GPU,
   * they carry their rest place, which their textures need, where the frame's vertices have none.
   */
  draw(
    out: Out,
    eye: Vec3,
    yaw: number,
    pitch: number,
    roll?: number,
    color?: number[],
    pieces?: Pieces,
  ): void;
  /** The own player's character (BUILD in rig.ts, PlayerInfo.body): the woman's arms are slimmer and her hands smaller, on the same grips; `tone` the skin he picked (the default's when absent). */
  wear(build: number, tone?: number[], ninja?: boolean, xeno?: boolean, hunter?: boolean): void;
}

/** The xenomorph's feet: each foot's joint and its toes'. */
const FEET = [
  [J.FOOT_L, J.TOE_L],
  [J.FOOT_R, J.TOE_R],
];
/** What mesh() makes of a part: the part at the origin. */
const made =
  ({ make }: Part) =>
  (o: Out) =>
    make(o, ORIGIN, ID);

/** Metres the camera may be from the eye of the body and still show it: the bob is centimetres, a crouch's ease under a metre. */
const AWAY = 1;
/** On a ledge the camera sits this far behind the head and below it, so that the arms reach the ledge. */
const [BEHIND, DROP] = [0.12, 0.03];
const [X, Y, Z]: Vec3[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
const POLE: Vec3 = [0.7, -1, -0.5];
const clamp = (v: number, lo = 0, hi = 1) => Math.min(Math.max(v, lo), hi);

/**
 * The own Hunter's disc throw, seconds from the click: the hand winds back across the chest until
 * `wound`, sweeps out to the right until `swept` and lets the disc go at `release` on the way,
 * then is back at the hold at `back`. Its arc round `centre` (camera space), `radius` metres.
 */
const THROW = {
  wound: 0.08,
  release: 0.12,
  swept: 0.17,
  back: 0.42,
  centre: [0.06, -0.15, 0.24] as Vec3,
  radius: 0.36,
  /** The arc's angle from straight ahead, radians: wound back to the left, swept out to the right. */
  from: -1,
  to: 0.95,
};

/** The weight of the throw's pose over the hold, and the hand's angle on its arc, `t` seconds after the click. */
const throwOf = (t: number): [number, number] => {
  const k =
    t < THROW.wound
      ? ease(t / THROW.wound)
      : t < THROW.swept
        ? 1
        : 1 - ease(clamp((t - THROW.swept) / (THROW.back - THROW.swept)));
  const phi = THROW.from + (THROW.to - THROW.from) * ease(span(t, THROW.wound, THROW.swept));
  return [k, phi];
};
export const inv = ([x, y, z, w]: Quat): Quat => [-x, -y, -z, w];
const dist = (a: Vec3, b: Vec3) => Math.hypot(...sub(a, b));

type HunterViewPart = { key: string; joint: number; orientation: number; vertices: number[] };
const hunterViewParts = new Map<string, HunterViewPart[]>();

/** The Hunter's equipment that can be seen from the eye: wrists, shoulder, chest and belt. */
/**
 * A bracer on its first-person forearm at rest, a smooth thick tube (the runner's, cut from
 * his forearm's facets, is angular this close): from the wrist over the whole forearm (BRACER_TOP), each ring an ellipse round the skin's slice there, which holds all of the
 * slice, BRACER_GAP off it; the inner face, then BRACER_THICK out, the outer, and rims at both ends.
 * Its colour and layer are the runner's bracer's (`source`).
 */
const BRACER_GAP = 0.008;
/** The bracer's thickness, its outer face off its inner one. */
const BRACER_THICK = 0.006;
/** How far from the wrist toward the elbow the bracer reaches. */
const BRACER_TOP = 0.8;
/** The share of the bracer, at its elbow's end, over which it slopes down onto the arm. */
const BRACER_BEVEL = 0.035;
/** Where the grooves round the bracer's outer face lie, of the way from the wrist. */
const BRACER_GROOVES = [0.2, 0.4, 0.6, 0.8];
/** A groove's half width (of the bracer's length) and its depth, metres. */
const [GROOVE_W, GROOVE_DEPTH] = [0.02, 0.0025];
/** How far into the skin the sloped end sinks, so no gap shows round it. */
const BRACER_SINK = 0.003;
const fitBracer = (source: number[], build: number, joints: Solved, right: boolean): number[] => {
  const [hand, fore] = right ? [J.HAND_R, J.FOREARM_R] : [J.HAND_L, J.FOREARM_L];
  const skinOf = body(2, build);
  const [wrist, elbow] = [joints.pos[hand], joints.pos[fore]];
  const length = elbow[1] - wrist[1];
  const arm: Vec3[] = [];
  for (let k = 0; k < skinOf.v.length / 6; k++) {
    if (skinOf.j[2 * k] === fore || skinOf.j[2 * k + 1] === fore) {
      arm.push([skinOf.v[6 * k], skinOf.v[6 * k + 1], skinOf.v[6 * k + 2]]);
    }
  }
  // The whole forearm, from the wrist to just short of the elbow's bend.
  const top = BRACER_TOP;
  // Even rings along the bracer, and closer ones over its short slope at the elbow's end.
  // Each groove gets its edges and its floor as rings of their own.
  const fracs = [
    ...Array.from({ length: 12 }, (_, j) => ((1 - BRACER_BEVEL) * j) / 12),
    ...Array.from({ length: 5 }, (_, j) => 1 - BRACER_BEVEL + (BRACER_BEVEL * j) / 4),
    ...BRACER_GROOVES.flatMap(f => [
      f - GROOVE_W,
      f - GROOVE_W / 3,
      f,
      f + GROOVE_W / 3,
      f + GROOVE_W,
    ]),
  ]
    .sort((a, b) => a - b)
    .filter((f, j, all) => !j || f - all[j - 1] > 1e-4);
  // How deep the outer face is grooved at `f` of the way, 0 to 1.
  const groove = (f: number) =>
    Math.max(0, ...BRACER_GROOVES.map(g => 1 - (Math.abs(f - g) / GROOVE_W) ** 2));
  const [rows, sides] = [fracs.length - 1, 28];
  // Each ring: its height, its centre (x, z) and its half axes across and through.
  const rings = Array.from({ length: rows + 1 }, (_, j) => {
    const y = wrist[1] + top * fracs[j] * length;
    // The skin a little above the wrist, clear of the hand's heel.
    const at = wrist[1] + Math.max(0.1 * length, y - wrist[1]);
    // The skin's rings are some 2.5 cm apart: the nearest one or two of them.
    // Its own height too, so the wrist's skin at the bracer's mouth stays inside it.
    const slice = arm.filter(q => Math.min(Math.abs(q[1] - at), Math.abs(q[1] - y)) < 0.026);
    const lo = [0, 2].map(k => Math.min(...slice.map(q => q[k])));
    const hi = [0, 2].map(k => Math.max(...slice.map(q => q[k])));
    const mid = [0, 1].map(k => (lo[k] + hi[k]) / 2);
    const half = [0, 1].map(k => (hi[k] - lo[k]) / 2);
    // The ellipse through the box's sides misses its corners: grown until it holds every point.
    const fit = Math.max(
      1,
      ...slice.map(q => Math.hypot((q[0] - mid[0]) / half[0], (q[2] - mid[1]) / half[1])),
    );
    return { y, mid, half: half.map(h => h * fit) };
  });
  // Neighbouring rings averaged, so the skin's bumps do not dent the tube.
  const even = rings.map((r, j) => {
    const near = rings.slice(Math.max(0, j - 1), j + 2);
    const avg = (f: (x: (typeof rings)[0]) => number[]) =>
      [0, 1].map(k => near.reduce((n, x) => n + f(x)[k], 0) / near.length);
    return { y: r.y, mid: avg(x => x.mid), half: avg(x => x.half) };
  });
  const [r, g, layer, b] = [source[6], source[7], source[8], source[9]];
  const out: number[] = [];
  // Toward the elbow both faces slope down onto the arm and end a little in it (BRACER_SINK), so
  // no gap shows between the bracer's end and the skin: how far each face stands off the skin.
  const bevel = (j: number) => {
    const t = Math.min(1, Math.max(0, (fracs[j] - 1 + BRACER_BEVEL) / BRACER_BEVEL));
    return t * t * (3 - 2 * t);
  };
  const off = (j: number, outer: boolean) => {
    const from = outer ? BRACER_GAP + BRACER_THICK - GROOVE_DEPTH * groove(fracs[j]) : BRACER_GAP;
    return from + (-BRACER_SINK - from) * bevel(j);
  };
  const at = (j: number, i: number, outer: boolean): Vec3 => {
    const { y, mid, half } = even[j];
    const grow = off(j, outer);
    const a = (2 * Math.PI * i) / sides;
    return [mid[0] + (half[0] + grow) * Math.cos(a), y, mid[1] + (half[1] + grow) * Math.sin(a)];
  };
  // The ellipse's normal, tipped up the arm as the face slopes down to it.
  const normal = (j: number, i: number, outer: boolean): Vec3 => {
    const a = (2 * Math.PI * i) / sides;
    const [lo, hi] = [Math.max(0, j - 1), Math.min(rows, j + 1)];
    const slope = (off(hi, outer) - off(lo, outer)) / (even[hi].y - even[lo].y);
    const n = unit([Math.cos(a) / even[j].half[0], 0, Math.sin(a) / even[j].half[1]]);
    return unit([n[0], -slope, n[2]]);
  };
  // A triangle wound to face its first corner's normal.
  const tri = (p: Vec3[], n: Vec3[], shade = [0, 0, 0]) => {
    const [u, w] = [sub(p[1], p[0]), sub(p[2], p[0])];
    const c: Vec3 = [
      u[1] * w[2] - u[2] * w[1],
      u[2] * w[0] - u[0] * w[2],
      u[0] * w[1] - u[1] * w[0],
    ];
    const order = dot(c, n[0]) < 0 ? [0, 2, 1] : [0, 1, 2];
    for (const k of order) {
      const dark = 1 - 0.45 * shade[k];
      out.push(...p[k], ...n[k], r * dark, g * dark, layer, b * dark);
    }
  };
  const quad = (p: Vec3[], n: Vec3[], shade = [0, 0, 0, 0]) => {
    tri([p[0], p[1], p[2]], [n[0], n[1], n[2]], [shade[0], shade[1], shade[2]]);
    tri([p[0], p[2], p[3]], [n[0], n[2], n[3]], [shade[0], shade[2], shade[3]]);
  };
  const flip = (n: Vec3): Vec3 => [-n[0], -n[1], -n[2]];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < sides; i++) {
      const corners: [number, number][] = [
        [j, i],
        [j, i + 1],
        [j + 1, i + 1],
        [j + 1, i],
      ];
      quad(
        corners.map(([jj, ii]) => at(jj, ii, true)),
        corners.map(([jj, ii]) => normal(jj, ii, true)),
        corners.map(([jj]) => groove(fracs[jj])),
      );
      quad(
        corners.map(([jj, ii]) => at(jj, ii, false)),
        corners.map(([jj, ii]) => flip(normal(jj, ii, false))),
      );
    }
  }
  // The rim at the wrist; the elbow's end has sloped into the arm.
  for (let i = 0; i < sides; i++) {
    const face: Vec3 = [0, -1, 0];
    quad(
      [at(0, i, false), at(0, i + 1, false), at(0, i + 1, true), at(0, i, true)],
      [face, face, face, face],
    );
  }
  return out;
};

const hunterView = (build: number): HunterViewPart[] => {
  const key = `1:${build}`;
  const cached = hunterViewParts.get(key);
  if (cached) {
    return cached;
  }
  const joints = solve(rest([0, 0, 0], 0, build));
  const at = (name: string) => {
    if (name === 'Belt' || name === 'Flying disc') {
      return J.PELVIS;
    }
    if (name === 'Left bracer') {
      return J.HAND_L;
    }
    if (name === 'Blade cuff') {
      return J.HAND_R;
    }
    return J.CHEST;
  };
  const visible = new Set([
    'Harpoon harness',
    'Blade cuff',
    'Left bracer',
    'Laser saddle',
    'Laser mount',
    // Not the shoulder plates: beside the eye, they showed grey in the view's top corners.
    'Belt',
    'Flying disc',
  ]);
  const model = hunterModel(1);
  const parts = Object.entries(model)
    .filter(([name]) => visible.has(name))
    .map(([name, source]) => {
      const joint = at(name);
      const wrist = joint === J.HAND_L || joint === J.HAND_R;
      const orientation = wrist ? (joint === J.HAND_L ? J.FOREARM_L : J.FOREARM_R) : joint;
      // The bracelet is drawn on the runner's sculpted, scaled wrist. Rebase
      // its lower rim onto the first-person wrist and let the forearm turn it.
      // The left bracer is first refitted onto the first-person forearm itself.
      // Both bracers (the right one under the blades' housing) are refitted onto the first-person forearms.
      const bracer = name === 'Left bracer' || name === 'Blade cuff';
      const anchor: Vec3 = bracer
        ? joints.pos[joint]
        : wrist
          ? [(joint === J.HAND_L ? -1 : 1) * 0.392 * 1.08, 0.884 * 1.2, -0.002 * 1.104]
          : joints.pos[joint];
      const fit = wrist && !bracer ? 0.78 : 1;
      const rotation = joints.rot[orientation];
      const inverse: Quat = [-rotation[0], -rotation[1], -rotation[2], rotation[3]];
      const vertices = bracer
        ? fitBracer(source, build, joints, joint === J.HAND_R)
        : source.slice();
      for (let i = 0; i < vertices.length; i += STRIDE) {
        const [qx, qy, qz, qw] = inverse;
        const x = (vertices[i] - anchor[0]) * fit,
          y = (vertices[i + 1] - anchor[1]) * fit,
          z = (vertices[i + 2] - anchor[2]) * fit;
        const tx = 2 * (qy * z - qz * y),
          ty = 2 * (qz * x - qx * z),
          tz = 2 * (qx * y - qy * x);
        vertices[i] = x + qw * tx + qy * tz - qz * ty;
        vertices[i + 1] = y + qw * ty + qz * tx - qx * tz;
        vertices[i + 2] = z + qw * tz + qx * ty - qy * tx;
        const nx = vertices[i + 3],
          ny = vertices[i + 4],
          nz = vertices[i + 5];
        const ntx = 2 * (qy * nz - qz * ny),
          nty = 2 * (qz * nx - qx * nz),
          ntz = 2 * (qx * ny - qy * nx);
        vertices[i + 3] = nx + qw * ntx + qy * ntz - qz * nty;
        vertices[i + 4] = ny + qw * nty + qz * ntx - qx * ntz;
        vertices[i + 5] = nz + qw * ntz + qx * nty - qy * ntx;
      }
      return { key: `hunter view ${build} ${name}`, joint, orientation, vertices };
    });
  hunterViewParts.set(key, parts);
  return parts;
};

/** The shoulder cannon's vertices from its hinge, for the own view, made once. */
let cannonBuilt: number[] | undefined;
const cannonVertices = (): number[] => {
  if (!cannonBuilt) {
    cannonBuilt = hunterModel(1)['Shoulder laser'].slice();
    for (let i = 0; i < cannonBuilt.length; i += STRIDE) {
      for (let k = 0; k < 3; k++) {
        cannonBuilt[i + k] -= CANNON_HINGE[k];
      }
    }
  }
  return cannonBuilt;
};
/**
 * The cannon's post in the own view: it stands on the left shoulder, at SHOULDER in the camera's
 * space (right, up, forward), and is ARM metres long to the cannon's hinge. Stowed, it lies back
 * behind the shoulder, out of sight; out, it swings up and forward so the cannon rides over the
 * left of the view and the post comes in from the bottom left corner, fixed to the shoulder (the
 * user, 2026-11-23). Its turn about the camera's right, ARM_DOWN stowed and ARM_UP out.
 */
const SHOULDER: Vec3 = [-0.39, -0.34, 0.13];
/** How much stouter the post is in the own view than on the runner. */
const POST_THICK = 1.1;
const ARM = 0.4;
const [ARM_DOWN, ARM_UP] = [1.6, -0.46];
/** The post leans in towards the middle of the view as it rises (a turn about the forward axis). */
const LEAN = -0.35;
/** The post's turn in the model's axes when folded out by `f` (0 to 1): its +y to the hinge. */
const armTurn = (f: number): Quat =>
  mul(axis([1, 0, 0], ARM_DOWN + (ARM_UP - ARM_DOWN) * f), axis([0, 0, 1], LEAN));
/** The cannon's hinge in the camera's space, its post folded out by `f`. */
const hingeAt = (f: number): Vec3 => {
  const t = ARM_DOWN + (ARM_UP - ARM_DOWN) * f;
  const c = Math.cos(LEAN);
  return add(SHOULDER, [-ARM * Math.sin(LEAN), ARM * c * Math.cos(t), -ARM * c * Math.sin(t)]);
};
/**
 * The post's vertices for the own view, made once: the model's 'Laser mount' stretched to ARM
 * along +y, its top at the origin, on its 'Laser saddle', both a little stouter.
 */
let postBuilt: number[] | undefined;
const postVertices = (): number[] => {
  if (!postBuilt) {
    const parts = hunterModel(1);
    const u = unit(sub(CANNON_HINGE, POST_BASE));
    const long = Math.hypot(...sub(CANNON_HINGE, POST_BASE));
    const e1 = unit([u[1], -u[0], 0]);
    const e2: Vec3 = [
      e1[1] * u[2] - e1[2] * u[1],
      e1[2] * u[0] - e1[0] * u[2],
      e1[0] * u[1] - e1[1] * u[0],
    ];
    postBuilt = [];
    for (const [name, from, stretch, drop] of [
      ['Laser mount', CANNON_HINGE, ARM / long, 0],
      ['Laser saddle', POST_BASE, 1, -ARM],
    ] as const) {
      const v = parts[name];
      for (let i = 0; i < v.length; i += STRIDE) {
        const d = sub([v[i], v[i + 1], v[i + 2]], from);
        const n: Vec3 = [v[i + 3], v[i + 4], v[i + 5]];
        postBuilt.push(
          dot(d, e1) * POST_THICK,
          dot(d, u) * stretch + drop,
          dot(d, e2) * POST_THICK,
          dot(n, e1),
          dot(n, u),
          dot(n, e2),
          ...v.slice(i + 6, i + STRIDE),
        );
      }
    }
  }
  return postBuilt;
};
/** A direction in the camera's space (right, up, forward) in the model's axes (right, up, back). */
const model = ([a, b, c]: Vec3): Vec3 => [a, b, -c];
/**
 * The own shoulder cannon, folded out by `k`: its hinge in the camera's space and its turn from
 * the camera's frame. Out, it points from its hinge at what the look meets (`target`).
 */
const cannonInView = (k: number, target: Vec3): [Vec3, Quat] => {
  const f = folded(k);
  const hinge = hingeAt(f);
  const [dx, dy, dz] = model(unit(sub(target, hinge)));
  const look = mul(axis([0, 1, 0], Math.atan2(-dx, -dz)), axis([1, 0, 0], Math.asin(dy)));
  return [hinge, slerp(axis([1, 0, 0], CANNON_FOLD), look, f)];
};

/** Draws one rigid Hunter part from its rest joint onto the first-person pose. */
const drawHunterPart = (out: Out, part: HunterViewPart, s: Solved, pieces?: Pieces): void =>
  placeRigid(out, part.key, part.vertices, s.rot[part.orientation], s.pos[part.joint], pieces);

/** Draws `vertices` turned by `q` and moved to `at`: a store piece with `pieces`, else into `out`. */
const placeRigid = (
  out: Out,
  key: string,
  vertices: number[],
  q: Quat,
  at: Vec3,
  pieces?: Pieces,
): void => {
  const part = { vertices };
  if (pieces) {
    const m = mesh(key, o => {
      const from = o.length;
      const a = room(o, part.vertices.length);
      part.vertices.forEach((v, i) => (a[from + i] = v));
      o.length = from + part.vertices.length;
    });
    pieces.push({ m, q, t: at, k: 1 });
    return;
  }
  const [qx, qy, qz, qw] = q;
  const start = out.length;
  const placed = room(out, part.vertices.length);
  for (let i = 0; i < part.vertices.length; i += STRIDE) {
    const x = part.vertices[i],
      y = part.vertices[i + 1],
      z = part.vertices[i + 2];
    const tx = 2 * (qy * z - qz * y),
      ty = 2 * (qz * x - qx * z),
      tz = 2 * (qx * y - qy * x);
    const nx = part.vertices[i + 3],
      ny = part.vertices[i + 4],
      nz = part.vertices[i + 5];
    const ntx = 2 * (qy * nz - qz * ny),
      nty = 2 * (qz * nx - qx * nz),
      ntz = 2 * (qx * ny - qy * nx);
    const k = start + i;
    placed[k] = at[0] + x + qw * tx + qy * tz - qz * ty;
    placed[k + 1] = at[1] + y + qw * ty + qz * tx - qx * tz;
    placed[k + 2] = at[2] + z + qw * tz + qx * ty - qy * tx;
    placed[k + 3] = nx + qw * ntx + qy * ntz - qz * nty;
    placed[k + 4] = ny + qw * nty + qz * ntx - qx * ntz;
    placed[k + 5] = nz + qw * ntz + qx * nty - qy * ntx;
    placed[k + 6] = part.vertices[i + 6];
    placed[k + 7] = part.vertices[i + 7];
    placed[k + 8] = part.vertices[i + 8];
    placed[k + 9] = part.vertices[i + 9];
  }
  out.length = start + part.vertices.length;
};
/** The point `k` along the direction `d` from `o`. */
const along = (o: Vec3, d: Vec3, k: number): Vec3 => add(o, mix([0, 0, 0], d, k));

/** The shortest rotation that turns the direction a into b. */
export const arc = (a: Vec3, b: Vec3): Quat => {
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

/** The part of `v` across the unit vector `u`. */
const across = (v: Vec3, u: Vec3): Vec3 => along(v, u, -dot(v, u));
/** The twist of the turn `q` about the unit axis `b`, radians in [-PI, PI]. */
const twist = (q: Quat, b: Vec3): number => {
  const t = 2 * Math.atan2(q[0] * b[0] + q[1] * b[1] + q[2] * b[2], q[3]);
  return t > Math.PI ? t - 2 * Math.PI : t < -Math.PI ? t + 2 * Math.PI : t;
};
/** The rotation `r` turned the shortest way so that its bone of rest offset `rest` lies along `d`. */
const lay = (r: Quat, rest: Vec3, d: Vec3): Quat => mul(arc(spin(r, rest), d), r);

/** The share of the trunk's twist the hands go round with in the first person, on top of the view's SWAY. */
const HANDS = 0.3;
/** The trunk seen from above, with a fist round it: half its width and half its depth, metres. */
const [TRUNK_W, TRUNK_D] = [0.22, 0.17];
/** How far under the neck the chest stands out the most, and half the width it hides across, to the shoulders. */
const [CHEST_AT, SHOULDERS] = [0.16, 0.3];
/**
 * How far forward (along the body's front, `yaw`) the point `p` must go to be in sight from `eye`
 * and out of the trunk of `s`: an upright ellipse TRUNK_W by TRUNK_D round the line from under the
 * hips to the neck. Under the chest, the line from the eye over its front hides what is behind it,
 * so a point there must be ahead of that line. 0 when it is clear already, or beside the trunk.
 */
const outOf = (s: Solved, yaw: number, eye: Vec3, p: Vec3): number => {
  const [a, b] = [add(s.pos[J.PELVIS], [0, -0.25, 0]), s.pos[J.NECK]];
  if (p[1] > b[1] + 0.05) {
    return 0;
  }
  const c = mix(a, b, clamp((p[1] - a[1]) / (b[1] - a[1])));
  /** On the body's right and front, from the trunk's line at that height. */
  const [side, front] = [
    (v: Vec3) => v[0] * Math.cos(yaw) - v[2] * Math.sin(yaw),
    (v: Vec3) => -v[0] * Math.sin(yaw) - v[2] * Math.cos(yaw),
  ];
  const d = sub(p, c);
  const k = Math.abs(side(d)) / TRUNK_W;
  let need = k < 1 && p[1] >= a[1] ? TRUNK_D * Math.sqrt(1 - k * k) : -Infinity;
  // The chest stands out as far all the way to the shoulders: the line from the eye over it.
  const top = b[1] - CHEST_AT;
  if (k < SHOULDERS / TRUNK_W && p[1] < top && eye[1] > top) {
    const e = front(sub(eye, c));
    need = Math.max(need, e + ((TRUNK_D - e) * (eye[1] - p[1])) / (eye[1] - top));
  }
  return Math.max(0, need - front(d));
};

/** The shoulder of arm `j` of `q` (`s` solved) goes with the hand at `at`: up as it rises over it, forward as it reaches out. */
export const shrug = (q: Pose, s: Solved, j: number, at: Vec3) => {
  const sd = j === J.ARM_L ? -1 : 1;
  const d = sub(at, s.pos[j]);
  const [up, out] = [
    clamp((d[1] + 0.12) * 1.6, 0, 0.5),
    clamp((Math.hypot(...d) - 0.4) * 2.5, 0, 0.45),
  ];
  q.rot[j - 1] = mul(q.rot[j - 1], mul(axis(Y, sd * out), axis(Z, sd * up)));
};

/** The most a clavicle turns for a held hand out of reach (wield()), radians. */
const REACH = 0.75;
/** Where a fist holds a handle, from the wrist: along the fingers, and toward the palm. */
export const FIST = [0.078, 0.022];
/**
 * The left hand round the rail gun's capsule, 3.7 cm thick: its axis through the hollow of the
 * hand, further from the palm than a handle's, the fingers less closed (the user, 2026-11-10: the
 * fist closed beside it).
 */
export const CAPSULE_HOLD = [0.07, 0.038];
export const CAPSULE_CURL = 0.6;
/** How far up the capsule from its foot the middle of the hand is. */
const CAPSULE_UP = 0.036;
/**
 * The left fist on the katana's grip: 8 mm further along the fingers and 6 mm nearer the palm than
 * FIST, so the grip runs through its curled fingers (the user, 2026-11-09).
 */
export const KATANA_LEFT = [0.086, 0.016];
/**
 * How far the left fist's fingers lean toward the blade, as [sin, cos]: less than the right's [S, C]
 * (0.55 rad), so the grip runs along the curl of its fingers, through the fist (the user,
 * 2026-11-09: at 0.9 it left the fist). The arms are still solved for a hand held as the right
 * (clasp()); the left wrist bends slightly by the difference, a set angle.
 */
export const KATANA_TILT = [Math.sin(0.25), Math.cos(0.25)];
const [S0, C0] = [S, C];
/**
 * Puts the arm of shoulder joint `j` (ARM_R or ARM_L) of `q` on a handle running along the unit
 * `g`, the hand round the point `at`, the elbow toward `pole`; `solved` is q solved. The shoulder
 * (the clavicle) rises with a hand over it and comes forward with a long reach. The hand comes
 * first: its axis leaves the handle on the shoulder's side, the thumb along the handle (the tilt of
 * katana.ts), and the elbow goes where the forearm carries on that axis, as near as the bones
 * allow. The elbow is a hinge, and the forearm's turn about itself goes half to the elbow and half
 * to the wrist, as a forearm's twist does. Out of reach the hand stops short.
 */
export const wield = (
  q: Pose,
  solved: Solved,
  j: number,
  at: Vec3,
  g: Vec3,
  pole: Vec3,
  held?: Vec3,
  [reach, palm] = FIST,
  [S, C]: number[] = [S0, C0],
  /** The forearm on `held`'s line, not the hand's: the wrist cocked by the hand's own tilt. */
  bent = false,
  /** The shoulder follows a hand out of reach. */
  far = false,
) => {
  if (!held) {
    shrug(q, solved, j, at);
  }
  let s = solve(q);
  let a = s.pos[j];
  const [l1, l2] = [dist(a, s.pos[j + 1]), dist(s.pos[j + 1], s.pos[j + 2])];
  // Away from the elbow too, for a handle that points at the shoulder or away from it; or the
  // side that puts the fingers along `held`, a straight wrist (clasp()), the shoulder already
  // shrugged by the caller.
  const side = held
    ? unit(along(held, g, -dot(held, g)))
    : unit(add(across(unit(sub(at, a)), g), along([0, 0, 0], unit(across(pole, g)), -0.3)));
  const th = add(along([0, 0, 0], g, C), along([0, 0, 0], side, -S));
  const fing = add(along([0, 0, 0], g, S), along([0, 0, 0], side, C));
  const x = cross(fing, th);
  const hand = frame(x, fing);
  // The grip is `reach` along the fingers from the wrist and `palm` toward the palm (FIST), which
  // the left hand, a mirror, has on its other side.
  const wrist = along(along(at, fing, -reach), x, j == J.ARM_L ? -palm : palm);
  // `far`: out of reach the shoulder comes after the hand (the clavicle turns toward the wrist,
  // REACH at most) rather than the hand stop short: crouched, the shoulders are further back.
  const c = s.pos[j - 1];
  const [R, D, L] = [dist(a, c), dist(wrist, c), (l1 + l2) * 0.985];
  if (far && dist(a, wrist) > L) {
    const to = unit(sub(wrist, c));
    const now = Math.acos(clamp(dot(unit(sub(a, c)), to), -1, 1));
    const need = Math.acos(clamp((R * R + D * D - L * L) / (2 * R * D), -1, 1));
    const w = axis(unit(cross(sub(a, c), to)), Math.min(now - need, REACH));
    const up = s.rot[PARENT[j - 1]];
    q.rot[j - 1] = mul(inv(up), mul(w, mul(up, q.rot[j - 1])));
    s = solve(q);
    a = s.pos[j];
  }
  // The elbow where the forearm carries on the hand's axis: toward the pole too for a free hand,
  // exactly there for a held one; bent, on the line `held` gave it (clasp()'s square hold).
  const ideal = sub(along(wrist, bent && held ? unit(held) : fing, -l2), a);
  const [e, f] = ik(a, wrist, held ? ideal : add(ideal, pole), l1, l2);
  const [u, v] = [unit(sub(e, a)), unit(sub(f, e))];
  const bend = cross(u, v);
  const h = unit(Math.hypot(...bend) > 1e-3 ? bend : cross(u, mix([0, 0, 0], pole, -1)));
  const [upper, fore] = [unit(REST[j + 1]), unit(REST[j + 2])];
  const r1 = lay(frame(h, u), upper, u);
  const r0 = lay(frame(h, v), fore, v);
  const r2 = mul(r0, axis(fore, twist(mul(inv(r0), hand), fore) / 2));
  q.rot[j] = mul(inv(s.rot[PARENT[j]]), r1);
  q.rot[j + 1] = mul(inv(r1), r2);
  q.rot[j + 2] = mul(inv(r2), hand);
};

/** `v` turned by the rotation vector `w` (its length the angle, radians). */
const rotate = (v: Vec3, w: Vec3): Vec3 => {
  const t = Math.hypot(...w);
  if (t < 1e-12) {
    return v;
  }
  const k = mix([0, 0, 0], w, 1 / t);
  const [c, sn] = [Math.cos(t), Math.sin(t)];
  return add(
    add(mix([0, 0, 0], v, c), mix([0, 0, 0], cross(k, v), sn)),
    mix([0, 0, 0], k, dot(k, v) * (1 - c)),
  );
};

/**
 * The katana and both fists as one rigid piece, the wrists straight, so that a cut is the arms'
 * alone (the user, 2026-11-07): the right hand round the grip, the left BEHIND it, each turned a
 * fixed way about the handle (from `at`, `g` and the elbows' `poles`) and its forearm carrying on
 * along its fingers, so that each elbow is a forearm's length back from its wrist. The piece goes
 * the least way from where the cut puts it (a radian of the blade weighs as 3 m of the hands) to
 * where both elbows are an upper arm's length from their shoulders; `turn` is what a radian of the
 * blade weighs against a metre of the hands, as a freedom (a parry holds its line: less). Returns
 * the grip, the blade, and the fingers of the right hand and of the left.
 */
export const clasp = (
  s: Solved,
  at: Vec3,
  g: Vec3,
  poles: [Vec3, Vec3],
  turn = 0.1,
): [Vec3, Vec3, Vec3, Vec3] => {
  const arms = [J.ARM_R, J.ARM_L];
  const len = arms.map(j => [dist(s.pos[j], s.pos[j + 1]), dist(s.pos[j + 1], s.pos[j + 2])]);
  // Each hand's turn about the handle, as a free hand would take it where the cut puts it.
  const sides = arms.map((j, k) =>
    unit(
      add(
        across(unit(sub(k ? along(at, g, -BACK) : at, s.pos[j])), g),
        along([0, 0, 0], unit(across(poles[k], g)), -0.3),
      ),
    ),
  );
  /** The piece moved by `x`: the grip on by x[0..2], the blade and the hands turned by x[3..5]. */
  const place = (x: number[]) => {
    const w: Vec3 = [x[3], x[4], x[5]];
    const b = unit(rotate(g, w));
    const f = sides.map(sd => {
      const side = unit(across(rotate(sd, w), b));
      return add(along([0, 0, 0], b, S), along([0, 0, 0], side, C));
    });
    return { p: add(at, [x[0], x[1], x[2]]), b, f };
  };
  /** How far each elbow, a forearm back from its wrist, is from an upper arm's length off its shoulder. */
  const miss = (x: number[]) => {
    const { p, b, f } = place(x);
    return arms.map((j, k) => {
      const side = unit(along(f[k], b, -S));
      const back = cross(f[k], add(along([0, 0, 0], b, C), along([0, 0, 0], side, -S)));
      const [reach, palm] = k ? KATANA_LEFT : FIST;
      const wrist = along(along(k ? along(p, b, -BACK) : p, f[k], -reach), back, k ? -palm : palm);
      return dist(along(wrist, f[k], -len[k][1]), s.pos[j]) - len[k][0];
    });
  };
  // Gauss-Newton, the least weighed step that takes both misses to 0: a radian of the blade
  // weighs as 3 m of the hands, so the hands move and the blade keeps the line of its cut.
  const free = [1, 1, 1, turn, turn, turn];
  const x = [0, 0, 0, 0, 0, 0];
  for (let n = 0; n < 12; n++) {
    const r = miss(x);
    if (Math.abs(r[0]) + Math.abs(r[1]) < 1e-4) {
      break;
    }
    const J = x.map((_, i) => {
      const y = x.slice();
      y[i] += 1e-5;
      return miss(y).map((v, k) => (v - r[k]) / 1e-5);
    });
    // M = J W J^T, 2 by 2, and the step -W J^T M^-1 r.
    const m = [0, 1].map(a => [0, 1].map(c => J.reduce((t, d, i) => t + d[a] * free[i] * d[c], 0)));
    const det = m[0][0] * m[1][1] - m[0][1] * m[1][0] || 1e-12;
    const y = [(m[1][1] * r[0] - m[0][1] * r[1]) / det, (m[0][0] * r[1] - m[1][0] * r[0]) / det];
    x.forEach((_, i) => (x[i] -= free[i] * (J[i][0] * y[0] + J[i][1] * y[1])));
  }
  const { p, b, f } = place(x);
  return [p, b, f[0], f[1]];
};

/** The unit vector toward a wall on each SIDE, on the floor plane. */
const TOWARD = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Finger thicknesses against FINGER_R, index to little: the little finger is thinner. */
const THICK = [1, 1.02, 0.95, 0.82];
/** The xenomorph's, as the fingers were before the man's were reworked (2026-11-17): its hand was tuned on them. */
const THICK_X = [1, 1, 0.96, 0.86];
const LENGTH_X = [1, 1.1, 1, 0.82];
/** Finger lengths against 4 cm, index to little. */
const LENGTH = [0.92, 1.08, 1, 0.8];
/** The thumb's two segments when the palm carries the rifle's handguard: closed on its near side, along it (the user, 2026-11-10). */
const CUP: Vec3[] = [unit([0.7, -0.7, 0]), unit([0.9, -0.4, 0.1])];
/** The thumb's two segments open and in a fist, as directions in the hand (x toward the thumb). */
/** The thumb's two bones swung out from the palm, in the hand's space: a hand spread wide (shape()'s `spread`). */
const THUMB_WIDE: Vec3[] = [
  [1, -0.05, 0.08],
  [0.8, -0.4, 0.4],
];
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
/** The woman's hand to the man's, about the wrist (SCALE in skin.ts has her glove's). */
export const HAND_F = 0.92;
/** The xenomorph's hands against the man's, about the wrist. */
export const CLAW_HAND = 1.3;

/** Sides around a finger (6 until the user, 2026-11-09: more detail on the hands). */
export const FINGER_SIDES = 10;
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
const tube = (
  rings: Ring[],
  sides: number,
  put: (p: Vec3, n: Vec3, r: number) => void,
  lean?: number,
) => {
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
          put(at(P, j, k), at(N, j, k), j);
        }
      }
    }
  }
};

/** The xenomorph's fingers against a man's: long (the user's picture, 2026-11-17). */
const LANK = 1.28;
/** The curl the xenomorph's fingers close to at most. */
export const RAKE = 0.35;
/** How far each of the xenomorph's claws reaches past the root of its last phalanx, metres. */
const CLAW_L = 0.042;
export const HUNTER_HAND: Vec3 = [0.45, 0.315, 0.22];
/** Where the back of the Hunter's right wrist faces, in the view, with the blades out: up and well over to the right. */
export const CLAW_ROLL: Vec3 = [0.8, 0.45, -0.4];

/**
 * A claw's rake in the own view, by its share of the swing: the striking hand (x out on its own
 * side, y up, z ahead, metres from the eye) raised high and out, then slashed down and across to
 * the other side, low and further out: up over the swing's first fifth, across by two fifths.
 */
const [RAKE_UP, RAKE_DOWN]: Vec3[] = [
  [0.38, 0.12, 0.4],
  [-0.2, -0.2, 0.58],
];

/** The Hunter's left hand in its guard while the blades are out (view space, mirrored): low left, ahead. */
export const GUARD: Vec3 = [0.3, -0.24, 0.44];
/**
 * The Hunter's left wrist with the shoulder cannon out (view space, mirrored): low on the left,
 * close, the arm bent toward the eye, the computer on the forearm facing up, the view above it
 * clear (the user, 2026-11-24, after a reference shot).
 */
export const COMPUTER: Vec3 = [0.1, -0.2, 0.42];
/** The right forearm and hand's line to the key (view space): in from the right, nearly level, a little ahead. */
const POKE: Vec3 = [-0.95, 0.15, 0.25];
/** Where its elbow goes then (view space, mirrored): out to the left, down and back. */
const COMPUTER_POLE: Vec3 = [1, -0.5, -0.6];
/** How closed that guard hand is: open, the fingers a little bent. */
const GUARD_CURL = 0.15;
/** The guard hand thrown out ahead through a cut's wind-up, and pulled in to the belly on its strike. */
export const LUNGE_L: Vec3 = [0.36, -0.1, 0.62];
export const TUCK: Vec3 = [0.1, -0.24, 0.4];
/**
 * How far the Hunter's left hand is out ahead (LUNGE_L) and in at the belly (TUCK), 0 to 1 each, at
 * `prog` of his cut (-1: none): out through the wind-up to the strike, then in within a tenth of
 * the cut, held, and back to the guard over its last quarter.
 */
export const counter = (p: Pick<PlayerState, 'cut'>, prog: number): [number, number] => {
  if (prog < 0) {
    return [0, 0];
  }
  const c = CUTS[p.cut ?? 0] ?? CUTS[0];
  const st = c.strike / c.ticks;
  const snap = ease(span(prog, st, st + 0.1));
  const back = 1 - ease(span(prog, 0.75, 1));
  return [ease(span(prog, 0, st)) * (1 - snap), snap * back];
};
const HUNTER_CLAW: Vec3 = [0.7, 0.61, 0.44];
type Claws = boolean | 'short';
/** A finger's half thickness at its root (11.2 mm until the fingers closed round a grip, 2026-11-09). */
const FINGER_R = 0.01;
/** The lengths of a finger's three phalanges against `l`, the root one first. */
const BONES = [1, 0.62, 0.42];
/** The ring of a finger from which on it is bare: the glove's fingers end 60 % along the middle phalanx. */
export const BARE = 8;
/** The rings of a finger a near runner's hand keeps past its root (hand()'s `lite`): the knuckle's bend, the glove's edge, the last bend, the tip. */
const LITE = [5, 8, 12];

/**
 * The rings of a finger, in the hand's space: from `p` along `d1`, `d2` then `d3`, its three
 * phalanges (BONES of `l`), `r` thick at the root, the first ring across `t`. Each bend is a curve
 * through the joint, not a corner, so that a fist keeps a round knuckle. The glove ends at ring
 * BARE in a rolled edge; the skin goes on to the tip.
 */
/** How far a joint's curve reaches along each bone (finger()'s `knee`): a wide, soft knuckle. */
const KNEE = 0.6;
/** A spread hand's (the Hunter's disc, the user 2026-11-23): sharper joints. */
const KNEE_SHARP = 0.25;

export const finger = (
  p: Vec3,
  d1: Vec3,
  d2: Vec3,
  d3: Vec3,
  l: number,
  r: number,
  t: Vec3,
  /** 0 to 1: a skeleton's finger (the xenomorph's), thin bones between swollen knuckles, a fine tip. */
  bony = 0,
  /** How far each joint's curve reaches along the bones, a share of them: less, a sharper joint. */
  knee = KNEE,
): Ring[] => {
  const [l1, l2, l3] = BONES.map(k => k * l);
  const shaft = 1 - 0.34 * bony;
  const oval = 0.93 + 0.07 * bony;
  const taper = 1 - bony;
  const j1 = along(p, d1, l1);
  const j2 = along(j1, d2, l2);
  /** A ring at `c` across `d`, `k` thick, `h` of that from the palm side to the back. */
  const ring = (c: Vec3, d: Vec3, k: number, h = 1): Ring => {
    const [t, y] = [unit(d), unit(cross(d, X))];
    // A man's finger is a little wider than it is deep (the user, 2026-11-17: more real hands).
    return [c, cross(y, t).map(v => v * r * k) as Vec3, y.map(v => v * r * k * h * oval) as Vec3];
  };
  /**
   * The bend from `a` to `b` round the joint `j`, a curve on it (its ends along the two bones, no
   * kink where it meets them): four rings, `k0` to `k1` thick.
   */
  const bend = (a: Vec3, j: Vec3, b: Vec3, k0: number, k1: number, flat = 0) => {
    const c = j;
    return [1 / 5, 2 / 5, 3 / 5, 4 / 5].map(k =>
      ring(
        mix(mix(a, c, k), mix(c, b, k), k),
        add(mix(sub(c, a), [0, 0, 0], k), mix(sub(b, c), [0, 0, 0], 1 - k)),
        // A knuckle swells a little over its joint; a skeleton's, a lot.
        (k0 + (k1 - k0) * k) * (shaft + (0.06 + 0.18 * bony) * Math.sin(Math.PI * k)),
        // Flatter across the joint, most at its middle: the inside of the bend does not fold.
        1 - flat * Math.sin(Math.PI * k),
      ),
    );
  };
  // The first bend from 60 % back along the first bone to 60 % along the second: a wide knuckle,
  // its inside not folded.
  const sharp = knee < KNEE;
  const [a1, mid, b2] = [
    along(j1, d1, -knee * l1),
    along(j1, d2, knee * l2),
    along(j2, d3, (sharp ? knee : 0.5) * l3),
  ];
  // The second bend starts past the glove's edge, or closer to its joint on a sharp one.
  const s2 = sharp ? along(j2, d2, -knee * l2) : along(mid, d2, 0.003);
  // The root sunk 12 mm in the palm and flared, a fillet that leaves it at a slant with no seam
  // (the user, 2026-11-09).
  return [
    // The xenomorph's thin finger leaves the palm thinner too: no step down just past its root.
    ring(along(p, unit(t), -0.012), t, 1.35 * (1 - 0.2 * bony)),
    ring(p, t, 1.1 * (1 - 0.2 * bony)),
    // It tapers from its root to its tip (the user, 2026-11-17: they were tubes), a human one.
    ring(a1, d1, shaft * (1 - 0.04 * taper)),
    ...bend(a1, j1, mid, 0.98 - 0.02 * taper, 0.95 - 0.05 * taper, 0.22),
    // The glove's edge, rolled, then the bare finger a hair beyond it.
    ring(mid, d2, (0.95 - 0.05 * taper) * shaft),
    ring(along(mid, d2, 0.003), d2, (0.88 - 0.05 * taper) * shaft),
    ...bend(s2, j2, b2, 0.86 - 0.04 * taper, 0.84 - 0.07 * taper),
    // The xenomorph's last phalanx as wide as its claw's root, which goes on from it.
    ring(b2, d3, (0.82 - 0.06 * taper) * (1 - 0.24 * bony)),
    // Its tip thinner inside the claw, which sheathes it: none of it through the claw.
    // A round tip: the pad of the finger, not a cone.
    ...(bony
      ? [ring(along(j2, d3, l3 - 0.001), d3, 0.7 * (1 - 0.4 * bony))]
      : [ring(along(j2, d3, l3 - 0.003), d3, 0.72), ring(along(j2, d3, l3 + 0.003), d3, 0.46)]),
    ring(along(j2, d3, l3 + 0.006), d3, 0),
  ];
};

/**
 * The directions of the three phalanges of the finger i (index to little) at `curl`, in the hand's
 * space. At 0.9, the curl of every grip, they go round a handle 2.5 cm thick 7.8 cm along the
 * fingers from the wrist and 2.2 cm toward the palm, their tips back at the heel of the palm (the
 * user, 2026-11-09: the fingers stood off the katana's grip).
 */
/**
 * The share of phalanges()' `hook` each joint takes: the knuckle (below 0, the first bone lifts,
 * the user 2026-11-23), the middle joint, the last.
 */
const HOOK = [-0.04, 0.6, 0.44];
/** The share of phalanges()' extra `spread` each bone turns by: the first less, so its root does not kink. */
const FAN = [0.35, 1, 1.1];
/** A spread hand's little finger fanned out only this share as far as the rule would: it went off too far to the right. */
const LITTLE_IN = 0.55;
/** A spread hand's thumb mound, from its foot on the palm to the thumb's root, in this many steps (others 2). */
const MOUND_RINGS = 4;

export const phalanges = (curl: number, i: number, spread = 1, hook = 0): [Vec3, Vec3, Vec3] => {
  // `spread` times the open hand's fan: wider apart, as on the Hunter's disc. What it adds turns
  // the first bone only partly, the rest further out (FAN), so the finger leaves the knuckle
  // without a kink.
  const base = -(i - 1.5) * 0.08 * (1 - curl);
  // A spread hand's little finger turns in toward the ring finger (LITTLE_IN, the user 2026-11-23).
  const little = spread > 1 && i === 3 ? LITTLE_IN : 1;
  const splays = FAN.map(f => base * little * (1 + (spread - 1) * f));
  // Past a grip's curl the joints bend no more (tighter, a bend folds into itself): the finger
  // turns at its root.
  const k = Math.min(curl, 0.9);
  const a = 0.1 + 1.81 * curl;
  const b = a + 0.08 + 1.74 * k;
  // `hook` (radians) bends the finger further as a hand gripping an edge does, over its three
  // joints: the first bone lifted a little at the knuckle, most of the bend at the middle joint,
  // the rest at the last (HOOK, each joint's share).
  const [x, y, z] = [
    a + HOOK[0] * hook,
    b + (HOOK[0] + HOOK[1]) * hook,
    b + 0.06 + 0.99 * k + hook,
  ].map((n, j) => unit([splays[j], -Math.sin(n), Math.cos(n)]));
  return [x, y, z];
};

/** The knuckles' shell and the strap's buckle: near-black hard plastic. */
const SHELL = [0.09, 0.09, 0.1];
/** The strap round the wrist (the user, 2026-11-14: finer): its width, and how far it stands out of the palm's ring. */
export const STRAP = { w: 0.009, k: 1.045 };
/** The marine's lit buttons on it, in place of the buckle (the user, 2026-11-14: no black box): across (toward the thumb), and colour. */
export const WRIST_LIGHTS: [number, number[]][] = [
  [0.0048, [0.25, 1, 0.4]],
  [0, [1, 0.65, 0.1]],
  [-0.0048, [0.2, 0.8, 1]],
];

/**
 * A gloved hand at the wrist `end`: the fingers along `f`, the back of the hand along `u`, the thumb
 * toward `th` (unit vectors). `curl` runs from 0, a flat open hand with the fingers spread, to 1, a
 * fist. The palm is one tube that starts as the sleeve's cuff ends and spreads to the knuckles,
 * and each finger and the thumb one tube from there, bent at its joints: no solid meets another
 * in a line, and the normals are smooth all over. A tactical glove (the user, 2026-11-09: more
 * detail): fingerless from halfway along the middle phalanx, the bare tips in `bare` with a nail
 * each; a hard shell over the knuckles, a padded plate on the back, a strap round the wrist.
 */
export const hand = (
  out: Out,
  end: Vec3,
  f: Vec3,
  u: Vec3,
  th: Vec3,
  curl: number,
  tint: number[],
  point = 0,
  push = 0,
  to?: Vec3,
  bare = tint,
  /** 0 to 1: the thumb out of the fist to CUP, up the side of what the palm carries. */
  cup = 0,
  /** A near runner's hand: fewer sides, on the near sleeve's cuff, and none of the glove's small parts. */
  lite = false,
  /** The marine's: lit buttons on the strap round the wrist (WRIST_LIGHTS). */
  lights = false,
  /** The xenomorph's claws on the fingertips (Grip). */
  claws: Claws = false,
  /** Its size: the xenomorph's grows from the wrist over 4 cm, hers is smaller (hands()). */
  grow = 1,
  /** How far the fingers fan out, times an open hand's (phalanges()). */
  spread = 1,
  /** How far the fingers' last bones bend further, radians (phalanges()). */
  hook = 0,
) => {
  // A hand is built in its own space, the same as long as nothing it is made of changes (a grip
  // held, the hand at rest): some ten thousand vertices that are then only carried to the wrist.
  // Its numbers to a billionth: a grip's curl eased onto its 0.9 wanders in its last bits frame
  // to frame, and every frame built the hand again.
  [curl, point, push, cup] = [curl, point, push, cup].map(tidy);
  to &&= to.map(tidy) as Vec3;
  const key = `${claws} ${+lite} ${+lights} ${curl} ${point} ${push} ${to} ${cup} ${tint} ${bare} ${+(bare === tint)} ${grow} ${spread} ${hook}`;
  let m = BUILT.get(key);
  if (!m) {
    if (BUILT.size >= KEPT) {
      BUILT.clear();
    }
    BUILT.set(
      key,
      (m = shape(curl, tint, point, push, to, bare, cup, lite, lights, claws, spread, hook)),
    );
    // Grown about the wrist, the origin here: the claws' from the wrist's cuff on.
    for (let i = 0; grow != 1 && i < m.length; i += 10) {
      const t = claws ? Math.min(Math.hypot(m[i], m[i + 1], m[i + 2]) / 0.04, 1) : 1;
      const g = 1 + (grow - 1) * t * t * (3 - 2 * t);
      m[i] *= g;
      m[i + 1] *= g;
      m[i + 2] *= g;
    }
  }
  // Hand space (x toward the thumb, y the back, z toward the fingers), a point and a direction, to the world.
  let o = out.length;
  const dst = room(out, (m.length / 10) * STRIDE);
  for (let i = 0; i < m.length; i += 10, o += STRIDE) {
    const x = m[i];
    const y = m[i + 1];
    const z = m[i + 2];
    const a = m[i + 3];
    const b = m[i + 4];
    const c = m[i + 5];
    dst[o] = end[0] + th[0] * x + u[0] * y + f[0] * z;
    dst[o + 1] = end[1] + th[1] * x + u[1] * y + f[1] * z;
    dst[o + 2] = end[2] + th[2] * x + u[2] * y + f[2] * z;
    dst[o + 3] = th[0] * a + u[0] * b + f[0] * c;
    dst[o + 4] = th[1] * a + u[1] * b + f[1] * c;
    dst[o + 5] = th[2] * a + u[2] * b + f[2] * c;
    dst[o + 6] = m[i + 6];
    dst[o + 7] = m[i + 7];
    dst[o + 8] = m[i + 9];
    dst[o + 9] = m[i + 8];
  }
  out.length = o;
};

/** A number to a billionth. */
const tidy = (x: number) => Math.round(x * 1e9) / 1e9;

/** The hands built in their own space, by what they are made of; forgotten all at once past KEPT (a grip closing makes a new one a frame). */
const BUILT = new Map<string, number[]>();
const KEPT = 128;

/** hand()'s vertices in the hand's own space: position, normal, colour and layer, ten numbers each. */
const shape = (
  curl: number,
  tint: number[],
  point: number,
  push: number,
  to: Vec3 | undefined,
  bare: number[],
  cup: number,
  lite: boolean,
  lights: boolean,
  clawStyle: Claws = false,
  spread = 1,
  hook = 0,
): number[] => {
  const claws = clawStyle === true;
  const shortClaws = clawStyle === 'short';
  // A spread hand's joints bend sharply (the user, 2026-11-23), the others' softly.
  const knee = spread > 1 ? KNEE_SHARP : KNEE;
  /** How spread the hand is, 0 to 1 (fully by a spread of 5): its thumb, mound and index follow. */
  const wide = Math.min(1, Math.max(0, (spread - 1) / 4));
  const out: number[] = [];
  const [FS, CS] = lite ? [4, CUFF_NEAR] : [FINGER_SIDES, CUFF_SIDES];
  let paint = (_: number) => tint;
  let layer = -1;
  /** A point and a direction in hand space, in `paint` of its ring. */
  const put = ([x, y, z]: Vec3, [m, n, w]: Vec3, r = 0) => {
    const c = paint(r);
    out.push(x, y, z, m, n, w, c[0], c[1], c[2], layer);
  };
  // The palm starts as the sleeve's cuff does, vertex for vertex, its normals leaning to the fingers.
  const PALM = [
    [WRIST[1] - CUFF[0], CUFF[1] - WRIST[0], CUFF[3], CUFF[4]],
    // The heel of the hand narrower than the knuckles and thick, the palm thinner toward the fingers
    // (the user, 2026-11-17: it was a mitt, as wide at the wrist as at the knuckles).
    ...(claws
      ? [
          [0.025, 0, 0.043, 0.024],
          [0.06, -0.002, 0.046, 0.019],
        ]
      : [
          [0.025, 0, 0.038, 0.0235],
          [0.06, -0.002, 0.045, 0.018],
        ]),
    [0.092, -0.004, 0.046, 0.0125],
    [0.104, -0.004, 0, 0],
  ];
  const palm = ([z, y, a, b]: number[], k = 1): Ring => [
    [0, y, z],
    [a * k, 0, 0],
    [0, b * k, 0],
  ];
  // The palm up to WELD; from there a skin welds it to the four fingers' roots (weld(), below).
  tube(
    (lite ? [PALM[0], PALM[2]] : PALM.slice(0, 3)).map(r => palm(r)),
    CS,
    put,
    0.75,
  );
  // A whole glove (`bare` the glove's own colour, a space suit's) has no nails showing.
  const nail = bare === tint ? tint : mix(bare as Vec3, [0.98, 0.74, 0.7], 0.4);
  /** A finger's tube, its glove to ring BARE and bare beyond, and the nail on its tip. */
  const digit = (
    p: Vec3,
    ds: [Vec3, Vec3, Vec3],
    l: number,
    r: number,
    t: Vec3,
    from = 1,
    /** Its claw's length against CLAW_L, how hard it hooks down and its root's width (the thumb's: short, curled, fine). */
    [reach, hook, slim] = [1, 1, 1],
  ) => {
    paint = k => (k < BARE ? tint : bare);
    // From where it leaves the palm, ring `from`: a weld skins its root.
    const all = finger(p, ...ds, l, r, t, +claws, knee);
    const ks = lite
      ? [from, ...LITE.filter(k => k > from), all.length - 1]
      : all.map((_, k) => k).slice(from);
    tube(
      ks.map(k => all[k]),
      FS,
      (q, n, k) => put(q, n, ks[k]),
    );
    const d = ds[2];
    const j2 = along(along(p, ds[0], BONES[0] * l), ds[1], BONES[1] * l);
    const y = unit(cross(d, X));
    const x = cross(y, d);
    if (clawStyle) {
      // A claw for the nail: from the back of the last phalanx, out past the tip and hooked down
      // toward the palm, tapering to a point.
      const length = (shortClaws ? 0.022 : CLAW_L) * reach;
      paint = () => (shortClaws ? HUNTER_CLAW : CLAW);
      const ring = (k: number, w: number): Ring => {
        const c = add(
          // On the finger's own axis, from just before its tip: one line from the finger into the claw.
          along(j2, d, BONES[2] * l * 0.68 + length * k * (1 - 0.25 * (hook - 1) * k)),
          y.map(v => v * (r * (shortClaws ? 0.38 : 0.04) - length * 0.45 * hook * k * k)) as Vec3,
        );
        const t = unit(add(d, y.map(v => -v * 0.9 * hook * k) as Vec3));
        const b = unit(cross(t, x));
        return [c, x.map(v => v * r * w * slim) as Vec3, b.map(v => v * r * w * slim) as Vec3];
      };
      // Flush on the finger at its root, then swelling clear of the fingertip inside it.
      tube(
        // Its first ring inside the finger: no open rim behind the claw to see into.
        [
          ring(0, 0.35),
          ring(0.04, 0.66),
          ring(0.16, 0.74),
          ring(0.4, 0.56),
          ring(0.7, 0.3),
          ring(1, 0),
        ],
        lite ? 4 : FS,
        (q, n) => put(q, n),
      );
      return;
    }
    if (lite) {
      return;
    }
    paint = () => nail;
    // The nail: an oval on the back of the last phalanx, toward its tip, a hair out of it.
    const c = add(along(j2, d, BONES[2] * l * 0.6), y.map(v => v * (r * 0.79 + 0.0003)) as Vec3);
    const rim = (k: number): Vec3 =>
      add(
        c,
        add(
          x.map(v => v * r * 0.42 * Math.cos((k * TAU) / 8)) as Vec3,
          d.map(v => v * 0.005 * Math.sin((k * TAU) / 8)) as Vec3,
        ),
      );
    for (let k = 0; k < 8; k++) {
      for (const q of [c, rim(k), rim(k + 1)]) {
        put(q, y);
      }
    }
  };
  /** Each finger's ring where it leaves the palm: its middle and its vertices, as finger() places them. */
  const roots: [Vec3, Vec3[], Vec3, Vec3][] = [];
  const nexts: Ring[] = [];
  for (let i = 0; i < 4; i++) {
    // `point` straightens the index out of the fist, to press a button.
    const ds = phalanges(i ? curl : curl * (1 - point), i, spread, hook);
    const at: Vec3 = [0.034 - 0.0225 * i, -0.004, 0.092];
    // A spread hand's lifted first bones leave the palm along it, not tilted with them: no dip
    // behind their root (the user, 2026-11-23).
    const t = unit(add(ds[0], [0, 0, 1 + 3 * wide]));
    // The xenomorph's long and lean (the user's picture, 2026-11-17: a skeleton's hand).
    const [fl, fr] = claws
      ? [0.04 * LENGTH_X[i] * LANK, FINGER_R * THICK_X[i]]
      : [0.04 * LENGTH[i], FINGER_R * THICK[i]];
    digit(at, ds, fl, fr, t);
    const rings = finger(at, ...ds, fl, fr, t, +claws, knee);
    const [, x, y] = rings[1];
    // The finger's next ring as it is drawn (digit()), for its root's normals (seamless, below).
    nexts.push(rings[lite ? LITE[0] : 2]);
    roots.push([
      at,

      Array.from({ length: FS }, (_, k) => {
        const a = (k * TAU) / FS;
        return [0, 1, 2].map(d => at[d] + x[d] * Math.cos(a) + y[d] * Math.sin(a)) as Vec3;
      }),
      unit(y),
      t,
    ]);
  }
  // The weld (the user, 2026-11-09: one piece, no joint): the palm's last ring zipped to the outline
  // of the four roots (their vertices that are not inside a neighbour), by angle round the palm's
  // axis; between two fingers it dips into a web.
  paint = () => tint;
  const [wz, y0, a0, b0] = PALM[2];
  type W = [Vec3, Vec3];
  const palmLoop = Array.from({ length: CS }, (_, k): W => {
    const a = (k * TAU) / CS;
    return [
      [a0 * Math.cos(a), y0 + b0 * Math.sin(a), wz],
      unit([Math.cos(a) / a0, Math.sin(a) / b0, 0]),
    ];
  });
  /** A finger's root vertices that are not inside a neighbour, on the back (`top`) or the palm side, round it the way the palm's loop goes. */
  const arc = (i: number, top: boolean): W[] => {
    const [c, ring] = roots[i];
    return ring
      .map((p, k): [Vec3, number] => [p, k])
      .filter(([p, k]) => {
        const a = (k * TAU) / FS;
        const side = i == 3 ? a <= Math.PI + 1e-6 : a < Math.PI - 1e-6;
        return (
          (top ? side : !side) && roots.every(([o], j) => j == i || dist(p, o) > FINGER_R * 1.1)
        );
      })
      .map(([p]): W => [p, unit(sub(p, c))]);
  };
  /** The web's low point between fingers `i` and `i + 1`, on the back or the palm side: where their roots cross, a little back toward the palm. */
  const web = (i: number, s: number): W => {
    const [[c0, , y0r, t0], [c1, , y1r, t1]] = [roots[i], roots[i + 1]];
    const up = unit(add(y0r, y1r));
    const back = unit(add(t0, t1));
    return [
      add(
        mix(c0, c1, 0.5),
        add(up.map(c => c * s * 0.005) as Vec3, back.map(c => c * -0.003) as Vec3),
      ),
      [0, 0, 0],
    ];
  };
  // The outline in order, from the index's outer side over the back to the little finger and
  // round under the palm back to the index, the way the palm's loop goes (the user, 2026-11-09).
  const outline: W[] = [
    ...[0, 1, 2, 3].flatMap(i => (i ? [web(i - 1, 1), ...arc(i, true)] : arc(i, true))),
    ...[3, 2, 1, 0].flatMap(i => (i < 3 ? [web(i, -1), ...arc(i, false)] : arc(i, false))),
  ];
  /** Each vertex of a closed loop with how far round it it is, 0 to 1, by length. */
  const round = (l: W[]): [W, number][] => {
    const d = l.map((w, k) => dist(w[0], l[(k + 1) % l.length][0]));
    const all = d.reduce((a, b) => a + b, 0);
    let run = 0;
    return l.map((w, k) => {
      const t = run / all;
      run += d[k];
      return [w, t];
    });
  };
  const [A, B] = [round(palmLoop), round(outline)];
  let [i, j] = [0, 0];
  const v = (l: [W, number][], k: number): [W, number] =>
    k >= l.length ? [l[k % l.length][0], l[k % l.length][1] + 1] : l[k];
  const tris: W[][] = [];
  while (i < A.length || j < B.length) {
    // Advance on the loop whose next vertex comes first round it.
    const ta = i < A.length ? v(A, i + 1)[1] : Infinity;
    const tb = j < B.length ? v(B, j + 1)[1] : Infinity;
    tris.push(
      ta < tb ? [v(A, i)[0], v(A, i + 1)[0], v(B, j)[0]] : [v(A, i)[0], v(B, j + 1)[0], v(B, j)[0]],
    );
    if (ta < tb) {
      i++;
    } else {
      j++;
    }
  }
  // Each vertex's normal: its own surface's, and the weld's faces round it, outward, as much.
  const sum = new Map<Vec3, Vec3>();
  for (const t of tris) {
    const [p, q, w] = t.map(x => x[0]);
    let n = unit(cross(sub(q, p), sub(w, p)));
    if (dot(n, [p[0], p[1] - y0, 0]) < 0) {
      n = n.map(c => -c) as Vec3;
    }
    for (const [x] of t) {
      sum.set(x, add(sum.get(x) ?? [0, 0, 0], n));
    }
  }
  // The xenomorph's (the user, 2026-11-17: a seam where its fingers leave the palm): a root's
  // vertex takes the very normal its finger's tube gives it (tube()), so the light does not break
  // across the joint.
  // A spread hand's too (the user, 2026-11-23: a sharp line across the index's root): its
  // fingers fan out most from the weld, and the light broke there.
  const seamless = new Map<Vec3, Vec3>();
  if (claws || wide > 0) {
    roots.forEach(([, ring], f) => {
      const [c, x, y] = nexts[f];
      ring.forEach((v, k) => {
        const a = (k * TAU) / FS;
        const on = [0, 1, 2].map(d => c[d] + x[d] * Math.cos(a) + y[d] * Math.sin(a)) as Vec3;
        seamless.set(v, unit(cross(sub(ring[(k + 1) % FS], ring[(k + FS - 1) % FS]), sub(on, v))));
      });
    });
  }
  for (const t of tris) {
    for (const [p, n] of t) {
      put(p, seamless.get(p) ?? unit(add(n, unit(sum.get(p)!))));
    }
  }
  // `push` (0 to 1) reaches the thumb's tip out along `to`, onto the katana's button.
  // A spread hand (`spread` past 1, the Hunter's disc) swings its thumb out to the side as well,
  // fully by a spread of 5 (`wide`).
  const [d1, d2] = THUMB.map(([open, fist], k) => {
    const d = unit(mix(unit(mix(unit(mix(open, fist, curl)), CUP[k], cup)), THUMB_WIDE[k], wide));
    return k && to ? unit(mix(d, to, push)) : d;
  });
  const tp: Vec3 = [0.032, -0.01, 0.025];
  // The thumb's thickness, the spread of its foot on the palm and its mound's height: the
  // xenomorph's as they were.
  // A spread hand's thumb (the Hunter's on his disc, the user 2026-11-23) is shorter, thicker at
  // its foot, on a fuller mound.
  const [tr, SPREAD, mound] = claws ? [0.0124, 1.7, 0.003] : [0.0116, 2, 0.0065];
  const [TL, TR, MOUND] = [
    0.037 * (1 - 0.12 * wide),
    tr * (1 + 0.1 * wide),
    mound * (1 + 0.5 * wide),
  ];
  digit(tp, [d1, d2, d2], TL, TR, d1, 2, [0.6, 2.2, 0.7]);
  // The thumb's mound (the user, 2026-11-09: the thumb shows the most, holding a gun): from a
  // footprint on the palm round its root, its ring there pushed out onto the palm's surface, a
  // skin swells into the thumb halfway along its first bone. One piece with the palm.
  paint = () => tint;
  {
    // As the thumb is drawn (digit()): the xenomorph's thin bone, or the mound ended in a step.
    const rings = finger(tp, d1, d2, d2, TL, TR, d1, +claws, knee);
    const [, x1, y1] = rings[1];
    const [c2, x2, y2] = rings[2];
    /** The palm's ring at `z`: its middle's height, half its width and its height. */
    const section = (z: number) => {
      const k = Math.min(
        Math.max(
          PALM.findIndex(row => row[0] > z),
          1,
        ),
        PALM.length - 2,
      );
      const [a, b] = [PALM[k - 1], PALM[k]];
      const f = Math.min(Math.max((z - a[0]) / (b[0] - a[0]), 0), 1);
      return [1, 2, 3].map(i => a[i] + (b[i] - a[i]) * f);
    };
    const foot = Array.from({ length: FS }, (_, k): [Vec3, Vec3] => {
      const a = (k * TAU) / FS;
      // A spread thumb's foot is wider on the palm, for a gentler slope up to it.
      const q = [0, 1, 2].map(
        d => tp[d] + SPREAD * (1 + 0.35 * wide) * (x1[d] * Math.cos(a) + y1[d] * Math.sin(a)),
      ) as Vec3;
      const [yc, w, h] = section(q[2]);
      // Out from the palm's axis onto its surface.
      const e = Math.hypot(q[0] / w, (q[1] - yc) / h) || 1;
      const on: Vec3 = [q[0] / e, yc + (q[1] - yc) / e, q[2]];
      return [on, unit([on[0] / (w * w), (on[1] - yc) / (h * h), 0])];
    });
    const top = Array.from({ length: FS }, (_, k): [Vec3, Vec3] => {
      const a = (k * TAU) / FS;
      const d: Vec3 = [0, 1, 2].map(i => x2[i] * Math.cos(a) + y2[i] * Math.sin(a)) as Vec3;
      return [add(c2, d), unit(d)];
    });
    // Rings between, swollen: the mound, the ball of the thumb. Eased from the palm to the thumb
    // over MOUND_RINGS steps, its normals turning from the palm's to the thumb's, so no seam shows
    // where it meets either (the user, 2026-11-23).
    // Only a spread hand's (the disc's) takes the extra rings: the others keep the vertex budget.
    const steps = wide > 0 ? MOUND_RINGS : 2;
    const rings2 = Array.from({ length: steps + 1 }, (_, j) => {
      const t = j / steps;
      const e = t * t * (3 - 2 * t);
      return foot.map(([q, n], k): [Vec3, Vec3] =>
        j === 0
          ? [q, n]
          : j === steps
            ? top[k]
            : [
                add(mix(q, top[k][0], e), n.map(c => c * MOUND * Math.sin(Math.PI * t)) as Vec3),
                unit(mix(n, top[k][1], e)),
              ],
      );
    });
    for (const [a, b] of rings2.slice(1).map((r, j) => [rings2[j], r])) {
      for (let k = 0; k < FS; k++) {
        const n = (k + 1) % FS;
        for (const [q, m] of [a[k], a[n], b[n], a[k], b[n], b[k]]) {
          put(q, m);
        }
      }
    }
  }
  // The xenomorph's tendons over the back of its hand: each from the wrist straight to its
  // finger's root and on along the finger's first bone (the user, 2026-11-17: in line with it).
  if (claws && !lite) {
    paint = () => tint.map(c => c * 1.5);
    /** The top of the palm's back at (x, z). */
    const top = (x: number, z: number): Vec3 => {
      const n = Math.min(
        Math.max(
          PALM.findIndex(r => r[0] > z),
          1,
        ),
        PALM.length - 1,
      );
      const [a, b] = [PALM[n - 1], PALM[n]];
      const f = Math.min(Math.max((z - a[0]) / (b[0] - a[0]), 0), 1);
      const [y, w, h] = [1, 2, 3].map(k => a[k] + (b[k] - a[k]) * f);
      return [x, y + h * Math.sqrt(Math.max(1 - (x / w) ** 2, 0)) + 0.0006, z];
    };
    roots.forEach(([at], f) => {
      const [d1] = phalanges(f ? curl : curl * (1 - point), f, spread, hook);
      const up = unit(cross(d1, X));
      const r = FINGER_R * THICK[f];
      // On the finger: over its root, then down into its first bone.
      const [on, end] = [0.004, 0.02].map((l, k) =>
        add(along(at, d1, l), up.map(v => v * r * (k ? 0.45 : 0.86)) as Vec3),
      );
      // The same line back to the wrist, a little drawn in toward its middle.
      const back = [0.012, 0.036, 0.06, 0.082].map(z => {
        const u = (0.092 - z) / 0.08;
        return top((at[0] - d1[0] * (0.092 - z)) * (1 - 0.45 * u), z);
      });
      const pts = [...back, on, end];
      tube(
        pts.map((c, k): Ring => {
          // Out of the wrist as a hair (tube() starts on a ring), into the bone as a point.
          const w = k == pts.length - 1 ? 0 : k ? 0.0026 : 0.0008;
          return [c, [w, 0, 0], [0, w, 0]];
        }),
        5,
        put,
      );
    });
  }
  // No glove's shell, plate or strap on a near hand, nor on the xenomorph's bare one.
  if (lite || clawStyle) {
    return out;
  }
  /** The back of the palm at `z` forward and `x` across, its height in the hand. */
  const back = (z: number, x = 0) => {
    const k = PALM.findIndex(r => r[0] > z);
    const [a, b] = [PALM[k - 1], PALM[k]];
    const t = (z - a[0]) / (b[0] - a[0]);
    const [y, w, h] = [1, 2, 3].map(i => a[i] + (b[i] - a[i]) * t);
    return y + h * Math.sqrt(Math.max(1 - (x / w) ** 2, 0));
  };
  // The knuckles' shell: a hard ridge across their backs, swelling over each.
  paint = () => SHELL;
  tube(
    Array.from({ length: 20 }, (_, i) => -0.0475 + i * 0.005).map((x, i, a): Ring => {
      // A swell over each knuckle (the fingers 2.25 cm apart), the ends rounded off.
      const swell = 1 + 0.18 * Math.cos(((x - 0.034) / 0.0225) * TAU);
      const e = Math.min(Math.max((0.0475 - Math.abs(x - 0.0005)) / 0.005, 0), 1);
      // Each end a ring of almost nothing then a point: tube() starts on a ring.
      const k = i == a.length - 1 ? 0 : swell * Math.max(Math.sqrt(e * (2 - e)), 0.1);
      return [
        [-x, back(0.084, x) + 0.003, 0.084],
        [0, 0.0038 * k, 0],
        [0, 0, 0.009 * k],
      ];
    }),
    // Eight sides: half of the ridge is sunk in the glove (10 until the fingers' round tips, 2026-11-18).
    8,
    put,
  );
  // A padded plate on the back of the hand, and the strap round the wrist with its buckle.
  paint = () => tint.map(v => v * 0.72);
  tube(
    // No ring across its middle: the back of the hand is straight under it, within 0.1 mm.
    [0.03, 0.031, 0.034, 0.066, 0.069, 0.071].map((z, i): Ring => {
      const k = [0.1, 0.6, 0.92, 1, 0.75, 0][i];
      return [
        [0, back(z) + 0.0004, z],
        [0.019 * k, 0, 0],
        [0, 0.0034 * k, 0],
      ];
    }),
    12,
    put,
  );
  // Its stitching, light dashes round it a little inside its edge.
  paint = () => tint.map(v => v * 1.45);
  const top = (x: number, z: number): Vec3 => [
    x,
    back(z) + 0.0004 + 0.0034 * Math.sqrt(Math.max(1 - (x / 0.019) ** 2, 0)) + 0.0002,
    z,
  ];
  const loop = (t: number): number[] => {
    // Round a rounded rectangle, 3 cm by 3.4, from 0 to 1.
    const a = t * TAU;
    const [c, s] = [Math.cos(a), Math.sin(a)];
    return [
      0.0155 * Math.sign(c) * Math.abs(c) ** 0.4,
      0.05 + 0.0145 * Math.sign(s) * Math.abs(s) ** 0.4,
    ];
  };
  for (let i = 0; i < 28; i++) {
    const [a, b] = [loop(i / 28), loop((i + 0.55) / 28)];
    const d = unit([b[0] - a[0], 0, b[1] - a[1]]);
    const w: Vec3 = [-d[2] * 0.0005, 0, d[0] * 0.0005];
    const q = [a, b].flatMap(([x, z]) => [top(x + w[0], z + w[2]), top(x - w[0], z - w[2])]);
    for (const v of [q[0], q[2], q[3], q[0], q[3], q[1]]) {
      put(v, [0, 1, 0]);
    }
  }
  paint = () => tint.map(v => v * 0.5);
  const strap = (z: number, k: number) => {
    const [a, b] = PALM;
    const t = (z - a[0]) / (b[0] - a[0]);
    return palm(
      a.map((v, i) => v + (b[i] - v) * t),
      k,
    );
  };
  const [z0, z1, k] = [PALM[0][0] + 0.004, PALM[0][0] + 0.004 + STRAP.w, STRAP.k];
  tube([strap(z0, 0.97), strap(z0 + 0.001, k), strap(z1 - 0.001, k), strap(z1, 0.97)], CS, put);
  const zb = (z0 + z1) / 2;
  const yb = strap(zb, k)[0][1] + strap(zb, k)[2][1];
  /** A small block on the strap's back, `x` across, `w` and `d` its half sizes, `h` high. */
  const block = (x: number, w: number, d: number, h: number) =>
    tube(
      [x - w, x - w * 0.85, x + w * 0.85, x + w].map((q, i): Ring => {
        const s = i % 3 ? 1 : i ? 0 : 0.1;
        return [
          [q, yb, zb],
          [0, h * s, 0],
          [0, 0, d * s],
        ];
      }),
      6,
      put,
    );
  if (!lights) {
    paint = () => SHELL;
    block(0, 0.008, STRAP.w / 2 - 0.0015, 0.0016);
  } else {
    // Lit: unshaded, they bloom.
    layer = -2;
    for (const [x, c] of WRIST_LIGHTS) {
      paint = () => c;
      block(x, 0.0016, 0.0016, 0.0014);
    }
    layer = -1;
  }
  return out;
};

/** What a hand does besides closing (hand()): the left index pointing, the right thumb pushing toward `to`, the left thumb cupped. */
export interface Grip {
  point?: number;
  push?: number;
  to?: Vec3;
  cup?: number;
  /** The marine's lit buttons on the wrists' straps. */
  lights?: boolean;
  /** The xenomorph's: a hooked claw of bone on each fingertip, for the nail. */
  claws?: Claws;
  /** The right hand's fingers fanned out this many times an open hand's (the Hunter's disc). */
  spread?: number;
  /** The right hand's fingers' last bones bent further, radians: gripping an edge. */
  hook?: number;
  /** The right index straightened out of the fist as `point` the left (the Hunter's wrist computer). */
  poke?: number;
}

/**
 * Both hands of the skeleton `s` on its wrists, left then right, each closed `curls[i]` (hand()), in
 * the glove `glove` with the bare fingertips `bare`; hers smaller about the wrist (HAND_F). The own
 * body and the runners share it, so a runner's fist closes on a grip as the own one does. `lite` is
 * a near runner's hand, `skip` a hand not drawn (the one a cut took off with its arm).
 */
export const hands = (
  out: Out,
  s: Solved,
  build: number,
  curls: number[],
  glove: number[],
  bare: number[],
  {
    point = 0,
    push = 0,
    to,
    cup = 0,
    lights = false,
    claws = false,
    spread = 1,
    hook = 0,
    poke = 0,
  }: Grip = {},
  lite = false,
  skip = -1,
) =>
  [J.HAND_L, J.HAND_R].forEach((j, i) => {
    if (j == skip) {
      return;
    }
    const q = s.rot[j];
    hand(
      out,
      s.pos[j],
      spin(q, [0, -1, 0]),
      spin(q, [i * 2 - 1, 0, 0]),
      spin(q, [0, 0, -1]),
      curls[i],
      glove,
      i ? poke : point,
      i * push,
      to,
      bare,
      i ? 0 : cup,
      lite,
      lights,
      claws,
      // The xenomorph's hands larger (CLAW_HAND), but at the wrist, where they meet the arm's
      // cuff, and growing from it over 4 cm; hers smaller.
      claws === true ? CLAW_HAND : build ? HAND_F : 1,
      i ? spread : 1,
      i ? hook : 0,
    );
  });

/** The floor under a player standing at height `y`: the first top within a step above or below it. */
const floorOf =
  (world: World, y: number): Floor =>
  (x, z) => {
    const d = ray(world, [x, y + STEP_H, z], [0, -1, 0], 2 * STEP_H);
    return d > 0 && d < 2 * STEP_H ? y + STEP_H - d : y;
  };

/** On a wall run the rail gun is put away, unless its bolt is going out. */
export const stowed = (p: PlayerState): boolean => p.mode == MODE.WALLRUN && !p.zapping;

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
  feast: 12,
};

/**
 * Ticks into a glory kill where the head starts back, where it strikes and where the strike is home:
 * GLORY_TICKS takes his head 0.1 s later (the user, 2026-11-16: the head went too long after).
 */
export const BITE = [46, 104, 114];

/**
 * The bite of a glory kill (the user, 2026-11-16, after DOOM 2016) at `lock` ticks left of its
 * GLORY_TICKS: once on him (feast.ts) the head drawn slowly back as the claws hold the prey, then
 * driven down into him; the neck's turn for menace().
 */
export const devour = (lock: number): number => {
  const e = GLORY_TICKS - lock;
  const k = (a: number, b: number) => Math.min(Math.max((e - a) / (b - a), 0), 1);
  const back = k(BITE[0], BITE[1]);
  return -0.5 * back * back * (3 - 2 * back) + 1.2 * k(BITE[1], BITE[2]);
};

export const createBody = (world?: World): Body => {
  let gait = createGait(0);
  let build = 0;
  let tone: number[] | undefined;
  /** The ninja's black suit, with no armour (soldier.ts). */
  let ninja = false;
  /** The xenomorph: its own body (beast()) in chitin, claws on its fingertips (hand()). */
  let xeno = false;
  /** The Hunter's wrist blades use the same deterministic cut timing as the shared blade. */
  let hunter = false;
  /** The own player as last seen. */
  let me: PlayerState | undefined;
  /**
   * The xenomorph on a wall: on all fours over it as the others see it (fours.ts), heading where it
   * looks, so the body turns with the mouse (the user, 2026-11-16); and until that has blended out.
   */
  const fours = createFours();
  let clung = false;
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
    feast: 0,
  };
  /** The kick of the last shot, 0 to 1, and how much of the right hand's pose the gun and the katana take, as of the last pose(). */
  let [kick, hold, grasp, wide] = [0, 0, 0, 1.6];
  /** How far through its cut the katana is, -1 when it is not cutting; and the light it leaves. */
  let prog = -1;
  /** In a saber lock: the presses seen so far, and the jolt of the last one (1, easing to 0). */
  let [pushes, jolt] = [0, 0];
  const trail = createTrail();
  /** Where the gun points, in the camera's space. */
  let target: Vec3 = [0, 0, 8];
  /** How far the gun is pushed out of the trunk, in the camera's space, as of the last pose(). */
  let lift: Vec3 = [0, 0, 0];
  /** Seconds, for the flailing of a stumble; and since the last parry. */
  let [clock, parry] = [0, Infinity];
  /** How far into the parry the katana is (parrying()). */
  let braced = 0;
  /** Which hand the wall is on: -1 left, 1 right, eased. */
  let side = 0;
  /** The ledge the hands are on: the body's x and z, the height of its top, and the way the wall faces. */
  let grip: { x: number; y: number; z: number; dx: number; dz: number } | undefined;
  /** How closed each hand is, left then right, as of the last pose(); how far the left index is out, pressing a button. */
  const curls = [0, 0];
  let pointing = 0;
  /** How far the right index is out, on the wrist computer's fire key, as of the last pose(). */
  let poking = 0;
  /** How much the left hand cups the rifle's handguard, 0 to 1, as of the last pose(). */
  let cupping = 0;
  /** The new battery in the left hand as it brings it from the pouch, in the world; undefined when it is not carrying one. */
  let carried: [Vec3, Vec3[]] | undefined;
  /**
   * The weapon in hand as last seen (0 the gun, 1 the katana, 2 the rail gun, -1 none), and the
   * seconds since it came to hand or a swap put its new battery in: it lights up over them (power()).
   */
  let drawn = -1;
  let harpoonDraw = 0;
  /** Seconds since the harpoon's last shot: its bolt is drawn leaving the tube (HARPOON_OUT). */
  let harpoonShot = Infinity;
  /** Seconds since the own Hunter threw his disc, and since he caught it back; whether it is out (`clip`, gun.ts). */
  let [discThrow, discBack, discOut] = [Infinity, Infinity, false];
  /** Whether the disc is drawn in his hand: not out, or still in it before the release of a throw. */
  const discIn = () => !discOut || discThrow < THROW.release;
  /** How far the Hunter's own shoulder cannon is folded out: 0 stowed, 1 out (unfold()). */
  let cannon = 0;
  /** Whether the Hunter's own shoulder cannon is in use (the state drawn has it masked). */
  let railed = false;
  let since = 9;
  /** Whether the weapon in hand came to it for the first time (firsts()): only then is it switched on, by hand (the user, 2026-11-09). */
  const fresh = firsts();
  let first = false;
  /** When the weapon of `kind` in hand is switched on, seconds after it came; -1, at once, when it is not new. */
  const pressOf = (kind: number) => (first ? pressAt(kind) : -1);

  const update: Body['update'] = (p, dt, k = 0, aspect = 1.6) => {
    // A fresh kick is the harpoon's shot: its bolt leaves the tube; the reload feeds the next.
    harpoonShot = k > kick + 0.5 ? 0 : harpoonShot + dt;
    kick = k;
    wide = aspect;
    if (!p) {
      me = undefined;
      return;
    }
    cannon = hunter ? unfold(cannon, !!p.railed && !p.down, dt) : 0;
    // The shoulder cannon leaves his hands free: they move as with no weapon (handsFree()).
    railed = hunter && !!p.railed;
    if (railed) {
      p = handsFree(p);
    }
    const floor = world && floorOf(world, p.y);
    gait.update(p, dt, floor);
    if (xeno) {
      fours.update(p, dt, floor);
      clung = p.mode == MODE.CLING || (clung && fours.weight > 0.002);
    }
    // A new shot with the disc in hand is a throw (gun.ts STRIKE.DISK): the arm sweeps it out.
    discThrow = hunter && p.rifled && me && p.shots !== me.shots ? 0 : discThrow + dt;
    const out = hunter && !!p.clip;
    discBack = discOut && !out ? 0 : discBack + dt;
    discOut = out;
    const now = handOf(p);
    harpoonDraw = hunter && now === 0 ? Math.min(1, harpoonDraw + dt / 0.55) : 0;
    const f = fresh(p);
    first = now !== drawn ? f : first && !(me?.reload && !p.reload);
    since = now !== drawn || (me?.reload && !p.reload) ? 0 : since + dt;
    drawn = now;
    me = { ...p };
    clock += dt;
    parry += dt;
    braced = parrying(parry);
    prog = progress(prog, p, dt);
    jolt = (p.pushes ?? 0) !== pushes && sabering(p) ? 1 : jolt * Math.exp(-dt * 12);
    pushes = p.pushes ?? 0;
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
      // Weapons are put away on a wall unless the rail gun's bolt is going out: a hand on the
      // wall, the other swinging with the stride. This also keeps the rifle's left hand from
      // staying locked to its handguard while wall-running.
      gun: +(!p.down && !p.wield && !stowed(p) && (p.ammo >= 0 || !!p.rifled || !!p.railed)),
      blade: +(!!p.wield && !p.down),
      // A glory kill's hold (room.ts feast()): the xenomorph's, with no blade in it.
      feast: +(xeno && !!p.lock && !p.down),
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

  /** The rail gun's grip against the gun's: the share of the way in toward the middle, and the metres back. */
  const RIFLE = [0.45, 0.14];

  /**
   * The gun in camera space: where its grip is (lower right, rising from below as it is taken, kicked
   * back by a shot, swaying with the run, shaking with a charge) and its axes, pointing at `target`.
   */
  const holster = (): [Vec3, Vec3[]] => {
    const a = w.amp * (1 + 0.5 * w.sprint);
    // A charge past a tap shakes the gun like the rail gun's bolt (the user, 2026-11-09): 1.5 mm
    // at once, 6 mm at the full charge, and kicks it 8 times a second, harder as it grows.
    // The rail gun's bolt kicks it at each pulse of the arc, 7 a second, and shakes it, harder as
    // it heats; overheated it trembles (the user, 2026-11-08).
    const zap = +!!me?.zapping;
    const heat = (me?.heat ?? 0) / HEAT_MAX;
    const held =
      me && !me.wield && (me.charge ?? 0) >= CHARGE_TAP
        ? Math.min(1, (me.charge! - CHARGE_TAP) / (CHARGE_TICKS - CHARGE_TAP))
        : -1;
    const kicked =
      kick +
      0.6 * zap * Math.max(0, Math.sin(clock * TAU * 7)) ** 6 +
      0.35 * Math.max(held, 0) * Math.max(0, Math.sin(clock * TAU * 8)) ** 6;
    const shake =
      (held < 0 ? 0 : 0.0015 + 0.0045 * held) +
      zap * (0.0012 + 0.004 * heat) +
      (me?.hot ? 0.002 : 0);
    const [s, c] = [Math.sin(TAU * gait.phase), Math.cos(TAU * gait.phase)];
    // The rail gun is held in both hands like a rifle: nearer the middle and the chest, so that
    // the left hand reaches its front grip.
    // The Hunter's disc (`rifled`) is held in one hand, not shouldered as the rifle.
    const rifle = !!me?.rifled && !hunter;
    const r = me?.railed || rifle || harpoonDraw ? 1 : 0;
    // A swap tips the gun over to show the battery under it, or the capsule on its top, and back.
    // The harpoon stays in aim: its next bolt feeds in on its own (drawHarpoon()).
    const sp = me && !harpoonDraw ? swapOf(me) : -1;
    // Tipped over from the start, and back into aim after the slap (the user, 2026-11-09).
    const tipped = sp < 0 ? 0 : ease(span(sp, 0, 0.12)) * (1 - ease(span(sp, 0.8, 1)));
    const drawTilt = harpoonDraw ? 1 - ease(harpoonDraw) : 0;
    const disc = hunter && !!me?.rifled;
    const roll = tipped * (rifle ? -1.1 : r ? 0.35 : -1.25) - 0.78 * drawTilt;
    const at: Vec3 = [
      Math.min(0.22, 0.18 * wide) * (1 - RIFLE[0] * r) +
        0.012 * a * s +
        lift[0] +
        shake * Math.sin(clock * 53),
      -0.25 + 0.018 * a * c - 0.3 * (1 - w.gun) + lift[1] + shake * Math.sin(clock * 61 + 1),
      0.4 - RIFLE[1] * r - 0.05 * kicked + lift[2],
    ];
    // The rifle sits further out and higher than the rail gun, its counter in the lower view.
    const rf = rifle || harpoonDraw ? 1 : 0;
    at[0] += 0.02 * rf + 0.085 * drawTilt;
    at[1] += 0.045 * rf - 0.045 * drawTilt;
    at[2] += 0.02 * rf;
    at[0] -= (rf ? 0.1 : r ? 0.04 : 0.12) * tipped;
    at[1] += 0.03 * rf * tipped;
    at[2] += 0.1 * rf * tipped;
    at[1] += (r ? 0.03 : 0.17) * tipped;
    // The disc is held up into the lower right of the view, so that it shows whole.
    if (disc) {
      at[0] += DISC_RAISE[0];
      at[1] += DISC_RAISE[1];
      at[2] += DISC_RAISE[2];
    }
    // The slap home jolts the gun or the rifle: up 1.5 cm and back 1 cm, the nose kicked up, and
    // it settles (the user, 2026-11-09: a slight shock).
    const jolt = sp >= 0 && !me?.railed ? Math.max(0, 1 - Math.abs(sp - TAP - 0.02) / 0.04) : 0;
    at[1] += 0.015 * jolt;
    at[2] += 0.01 * jolt;
    // A shot kicks the nose up; a swap lifts it too, the rail gun's down.
    const l = Math.hypot(...target);
    const to: Vec3 = [
      target[0],
      target[1] + (0.1 * kicked + (r ? 0 : 0.2) * tipped + 0.06 * jolt) * l,
      target[2],
    ];
    if (disc) {
      // The disc as in the user's picture (2026-11-23): the back of the hand to the eye, the
      // fingers up and leaning ahead by DISC_TILT, the palm flat on the hub of the disc standing
      // behind it, the fingers over its face between the blades.
      const hold = pointed(at, add(at, [0, 1, DISC_TILT]), [0, 0, -1], [-1, 0, 0]);
      // Empty, the hand sinks a little; the disc caught back knocks it back and down.
      const empty = discIn() ? 0 : 1;
      const caught = Math.max(0, 1 - discBack / 0.25) ** 2;
      at[1] -= 0.035 * empty + 0.03 * caught;
      at[2] -= 0.05 * caught;
      const [k, phi] = throwOf(discThrow);
      if (k <= 0) {
        return [at, hold];
      }
      // The throw (the user, 2026-11-24): a flat backhand, the disc lying under the palm. The hand
      // swings on an arc round the chest from across it on the left out to the right, the fingers
      // along the arc's radius, and comes back to the hold.
      const [s, c] = [Math.sin(phi), Math.cos(phi)];
      const [side, up, fingers]: Vec3[] = [
        [0, 1, 0],
        [-c, 0, s],
        [s, -0.15, c],
      ];
      const to: Vec3 = [
        THROW.centre[0] + THROW.radius * s,
        THROW.centre[1],
        THROW.centre[2] + THROW.radius * c,
      ];
      const p = mix(at, to, k);
      return [
        p,
        pointed(p, add(p, mix(hold[2], fingers, k)), mix(hold[0], side, k), mix(hold[1], up, k)),
      ];
    }
    const [rc, rs] = [Math.cos(roll), Math.sin(roll)];
    return [at, pointed(at, to, [rc, rs, 0], [-rs, rc, 0])];
  };

  /**
   * The katana in camera space, in the guard (rising from below as it is drawn, swaying with the
   * run) or in the cut: where the right hand holds its grip and the way the blade points.
   */
  const blade = () => {
    const a = w.amp * (1 + 0.5 * w.sprint);
    const [s, c] = [Math.sin(TAU * gait.phase), Math.cos(TAU * gait.phase)];
    // In a saber lock the blade crosses the foe's, shaking, and each press drives it on.
    const k = deflect(
      me && sabering(me) ? locked(clock, jolt) : poised(me ?? {}, Math.max(prog, 0), clock),
      braced,
    );
    const at: Vec3 = [k[0] + 0.012 * a * s, k[1] + 0.018 * a * c - 0.35 * (1 - w.blade), k[2]];
    return { at, g: unit([k[3], k[4], k[5]]) };
  };

  const pose: Body['pose'] = (eye, yaw, pitch, roll = 0) => {
    if (!me || me.down || dist(eye, [me.x, me.y + eyeHeight(me), me.z]) > AWAY) {
      return undefined;
    }
    const wf = xeno && clung ? fours.weight : 0;
    const g = wf ? fours.apply(gait.pose()) : gait.pose();
    const q: Pose = {
      at: [...g.at],
      yaw: g.yaw,
      hips: [...g.hips],
      rot: g.rot.map(r => [...r] as Quat),
      rest: g.rest,
    };
    const pawed = g.rot;
    const [r, u, f] = basis(yaw, pitch, roll);
    /** Camera space (right, up, forward) as a direction in the world, and a world direction in it. */
    const turn = ([a, b, c]: Vec3): Vec3 => [
      r[0] * a + u[0] * b + f[0] * c,
      r[1] * a + u[1] * b + f[1] * c,
      r[2] * a + u[2] * b + f[2] * c,
    ];
    const view = (v: Vec3): Vec3 => [dot(v, r), dot(v, u), dot(v, f)];
    // The trunk follows the look a little, and moves through the katana's cut (trunk()): it
    // twists, bends and leans, the chest more than the waist, so the shoulders carry the arms.
    const sw = w.blade > 0.002 ? blade() : undefined;
    // Locked, the trunk leans into the foe.
    const [tw, bd, ln] =
      sw && sabering(me)
        ? [0, 0.15 * w.blade, 0]
        : sw && prog >= 0
          ? bent(me, prog).map(v => v * w.blade)
          : [0, 0, 0];
    // The body turns on its feet as the view does: a share of the twist.
    q.yaw += sw && prog >= 0 ? SWAY * tw : 0;
    // The katana's space: the camera's, tipped down BOW at most, so the guard stays upright, and
    // carried round by the chest: the view turns SWAY of its twist and the hands HANDS of it on
    // top (any more and they leave the view in a wind-up). The bend is the trunk's alone, so the
    // strike stays on the crosshair.
    const [kr, ku, kf] = basis(yaw + HANDS * tw, Math.max(pitch, -BOW), roll);
    const keep = ([a, b, c]: Vec3): Vec3 => [
      kr[0] * a + ku[0] * b + kf[0] * c,
      kr[1] * a + ku[1] * b + kf[1] * c,
      kr[2] * a + ku[2] * b + kf[2] * c,
    ];
    for (const [j, k] of [
      [J.SPINE, 0.4],
      [J.CHEST, 0.6],
    ]) {
      q.rot[j] = mul(
        q.rot[j],
        mul(
          mul(axis(Y, tw * k), axis(X, 0.12 * clamp(pitch, -1.3, 1.3) - bd * k)),
          axis(Z, ln * k),
        ),
      );
    }
    // The head goes to the camera, the planted feet stay where they are.
    const s0 = solve(q);
    const ahead: Vec3 = [-Math.sin(yaw), 0, -Math.cos(yaw)];
    const nose = add(s0.pos[J.HEAD], spin(s0.rot[J.HEAD], [0, 0.02, -0.08]));
    const shift = sub(eye, along(nose, [-ahead[0] * BEHIND, -DROP, -ahead[2] * BEHIND], w.plant));
    q.at = add(q.at, shift);
    const s = solve(q);
    const fwd: Vec3 = [-Math.sin(q.yaw), 0, -Math.cos(q.yaw)];
    for (const j of [J.THIGH_L, J.THIGH_R]) {
      // On all fours the paws go with the body, which is laid out round its head.
      reach(q, s, j, along(s0.pos[j + 2], shift, wf), fwd, true);
    }
    // The weapons stay out of the trunk and in sight: looking down, their grips would sink into the
    // chest or under it, so they go forward until they are clear. The katana's two grips and its
    // guard go together.
    const out = (pts: Vec3[], to = turn) =>
      along([0, 0, 0], fwd, Math.max(...pts.map(p => outOf(s, q.yaw, eye, add(eye, to(p))))));
    lift = [0, 0, 0];
    const [g0, gx] = holster();
    // The gun's grip, the back of its body and the top of its counter, which lie toward the chest.
    const on = ([x, y, z]: Vec3): Vec3 =>
      [0, 1, 2].map(i => g0[i] + gx[0][i] * x + gx[1][i] * y - gx[2][i] * z) as Vec3;
    lift = view(out([g0, on(REAR), on([0, 0.146, 0.038])]));
    const clear = sw
      ? out([sw.at, along(sw.at, sw.g, -BACK), along(sw.at, sw.g, BASE)], keep)
      : lift;
    // The gun hand's wrist: the grip is 8 cm along the fingers from it and 2 cm toward the palm.
    const [gp, ga] = holster();
    /** The weapon in hand by kind, for its button: the gun, the katana, the rail gun, the rifle. */
    const pk = me?.wield ? 1 : me ? kindOf(me) : 0;
    const fh = [0, 1, 2].map(i => TILT[1] * ga[2][i] - TILT[0] * ga[1][i]) as Vec3;
    const wrist = [0, 1, 2].map(i => gp[i] - 0.078 * fh[i] + 0.022 * ga[0][i]) as Vec3;
    // The rail gun's front grip, for the left hand.
    // Cup the fixed lower shell with the thumb along the tube as the sleeve extends.
    const [fc, fd, fu] = harpoonDraw
      ? [along(along(gp, ga[2], 0.19), ga[1], 0.091), ga[2], ga[0]]
      : fore(gp, ga, me ? kindOf(me) : 2);
    // The katana and both fists as one piece, the wrists straight, the shoulders gone with the
    // hands (clasp()).
    const kq = { ...q, rot: q.rot.slice() };
    let [grip0, blade0, fingR, fingL]: Vec3[] = [eye, Y, Y, Y];
    if (sw && !hunter) {
      // In the guard 6 cm toward the middle of the body and 5 cm up, back in a cut: the left arm
      // crosses less before the chest, the right fist stays in sight (the user, 2026-11-09).
      const [at, g] = [
        add(
          add(
            eye,
            keep(
              add(
                sw.at,
                mix(
                  [0, 0, 0],
                  [-0.05, 0.05, 0],
                  prog < 0 ? 1 : (1 - Math.sin(Math.PI * clamp(prog))) ** 2,
                ),
              ),
            ),
          ),
          clear,
        ),
        keep(sw.g),
      ];
      shrug(kq, s, J.ARM_R, at);
      shrug(kq, s, J.ARM_L, along(at, g, -BACK));
      [grip0, blade0, fingR, fingL] = clasp(
        solve(kq),
        at,
        g,
        [keep([0.5, -1, -0.35]), keep([-0.5, -1, -0.35])],
        0.1 * (1 - 0.98 * braced),
      );
    }
    /** The left hand's slap of the gun's battery: its weight and how far off the battery it is. */
    let [slapW, slapTap] = [0, 0];
    /** The wrist computer's fire key in the world and how far up it is read, once the left arm is posed. */
    let [key, keyW]: [Vec3, number] = [eye, 0];
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
      // Firing the rail gun on a wall takes both hands off it.
      const toWall = w.wall * clamp(side * sd) * (me?.railed ? 1 - w.gun : 1);
      h = mix(h, [0.42, -0.16, 0.42], toWall);
      h = mix(h, sd > 0 ? [0.36, -0.26, 0.38] : [0.28, -0.1, 0.42], w.slide);
      // Reeling from a tackle: the hands thrown out and up, flailing against each other.
      const flail = Math.sin(clock * 12 + (sd > 0 ? Math.PI : 0));
      // A punch (no weapon at all, FIRE) drives the striking fist of its blow (SIDE) up to the
      // middle of the view and brings the other into its lower corner, drawn back. A hook comes
      // round from the side, a lunge goes further out.
      const jab = me ? thrown(me, xeno) : 0;
      const blow = me ? blowOf(me, xeno) : 0;
      const strikes = sd == SIDE[blow];
      const fist: Vec3 =
        blow == BLOW.HOOK
          ? [0.04 + 0.5 * Math.sin(Math.PI * jab), -0.06, 0.52]
          : blow == BLOW.LUNGE
            ? [0.02, -0.12, 0.78]
            : [0.02, -0.13, 0.66];
      // The xenomorph's claws rake (the user, 2026-11-23: a richer swipe than a punch): the
      // striking hand flies up and out on its side, claws spread, slashes down and across the view
      // through the strike, then comes back; the other is drawn back as a punch's. `rake`: the
      // share of a claw's swing (-1 for none), `clutch` how much the striking hand follows it.
      const rake =
        me?.swing && strikes && (blow == BLOW.CLAW_L || blow == BLOW.CLAW_R)
          ? 1 - me.swing / PUNCHES[blow].ticks
          : -1;
      const clutch = rake < 0 ? 0 : Math.min(1, 2.5 * (1 - rake));
      h = mix(
        h,
        rake < 0
          ? strikes
            ? fist
            : [0.26, -0.36, 0.26]
          : mix(mix(h, RAKE_UP, ease(span(rake, 0, 0.2))), RAKE_DOWN, ease(span(rake, 0.2, 0.4))),
        rake < 0 ? jab : clutch,
      );
      h = mix(h, [0.46, 0.05 + 0.2 * flail, 0.4 + 0.1 * flail], w.stun);
      // A glory kill: both claws up in the view holding the prey, torn apart as the bite goes in.
      const bite = me?.lock ? Math.max(devour(me.lock), 0) : 0;
      h = mix(h, [0.17 + 0.16 * bite, -0.02 - 0.1 * bite, 0.46 - 0.06 * bite], w.feast);
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
      const onSword = sw ? w.blade * free * (hunter && sd < 0 ? 0 : 1) : 0;
      // With his wrist blades out the Hunter's left arm comes up into view in a guard, balanced
      // against the right, its hand open, ready to fight (the user, 2026-11-23).
      const guard = hunter && sd < 0 && sw ? w.blade * free : 0;
      // In a cut it fights too (the user, 2026-11-23): it reaches out ahead through the wind-up,
      // the swing's momentum, then snaps back in tight to the belly on the strike, and returns.
      const [reached, tucked] = guard > 0 && me ? counter(me, prog) : [0, 0];
      h = mix(h, mix(mix(GUARD, LUNGE_L, reached), TUCK, tucked), guard);
      h[1] += 0.012 * k * guard * (1 - reached - tucked);
      // With the shoulder cannon out, the left forearm comes up across the view, the computer on
      // the bracer turned to the eye, as the cannon unfolds (handsFree() took `railed` off `me`).
      const reading = hunter && sd < 0 && railed ? ease(cannon) * free : 0;
      h = mix(h, COMPUTER, reading);
      let taken = onSword;
      if (sd > 0) {
        hold = w.gun * free;
        h = mix(h, wrist, hold);
        grasp = onSword;
        taken = Math.max(hold, grasp);
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
        [0.5, w.feast],
      ]) {
        curl += (open - curl) * t;
      }
      // Raking, the striking hand's claws spread wide up to the strike, then hook in as it tears
      // through.
      curl += (0.45 * +(rake > 0.4) - curl) * clutch;
      // The Hunter's blades come out of the bracer over a clenched fist (the user, 2026-11-23).
      curls[(sd + 1) / 2] =
        curl +
        ((hunter && onSword
          ? 1
          : hunter && me?.rifled && sd > 0
            ? discIn()
              ? DISC_CURL
              : 0.3
            : 0.9) -
          curl) *
          taken +
        (GUARD_CURL + 0.5 * tucked - curl) * guard +
        (0.55 - curl) * reading;
      let to = add(eye, turn([h[0] * sd, h[1], h[2]]));
      // The right hand over the wrist computer, its fingers on the fire key: pressed in the first
      // 4 ticks of the cannon's 15 between shots (`cool`), let go over the next 6, else hovering
      // 3 cm off it.
      const typing = sd > 0 ? keyW * free : 0;
      if (sd > 0) {
        poking = typing;
        // The other fingers loosely bent under the index.
        curls[1] += (0.45 - curls[1]) * typing;
      }
      if (typing > 0.002) {
        const press = ease(clamp(((me?.cool ?? 0) - 5) / 6));
        const off = add(key, along([0, 0, 0], unit(sub(eye, key)), 0.03 * (1 - press) + 0.004));
        // The forearm comes into the view from its lower right corner, running ahead, the hand on
        // its line (the user's reference, 2026-11-23): the wrist the index's length back from its
        // tip on the key, along POKE.
        to = mix(to, along(off, unit(turn(POKE)), -0.165), typing);
      }
      const arm = sd < 0 ? J.ARM_L : J.ARM_R;
      const pole = mix(POLE, COMPUTER_POLE, reading);
      let bend = turn([pole[0] * sd, pole[1], pole[2]]);
      if (typing > 0.002) {
        // The elbow where the forearm runs along POKE into the wrist: the arm bends toward it.
        const fore = dist(s.pos[J.FOREARM_R], s.pos[J.HAND_R]);
        const elbow = along(to, unit(turn(POKE)), -fore);
        bend = mix(bend, unit(sub(elbow, mix(s.pos[J.ARM_R], to, 0.5))), typing);
      }
      reach(q, s, arm, to, bend);
      // The palm turns down, the back of the hand to the view, flat on a ledge or the floor;
      // raking, it turns to face the way of the slash.
      q.rot[arm + 2] = axis(Y, sd * (1 + 0.5 * (w.plant + w.slide) + 0.9 * clutch));
      if (typing > 0.002) {
        // The back of the right wrist up (its forearm's local +x, as with the blades), the hand
        // straight on the forearm's line (the user, 2026-11-24).
        const held = { ...q, rot: q.rot.slice() };
        const solved = solve(held);
        const forearm = unit(sub(solved.pos[J.HAND_R], solved.pos[J.FOREARM_R]));
        held.rot[J.FOREARM_R] = mul(inv(solved.rot[arm]), frame(unit(across(Y, forearm)), forearm));
        held.rot[J.HAND_R] = ID;
        for (const k of [arm + 1, arm + 2]) {
          q.rot[k] = slerp(q.rot[k], held.rot[k], typing);
        }
      }
      if (sd > 0 && hold > 0.002) {
        // The back of the hand along the gun's right, the fingers around the grip.
        const rot = frame(turn(ga[0]), turn(fh));
        q.rot[arm + 2] = slerp(q.rot[arm + 2], mul(inv(solve(q).rot[J.FOREARM_R]), rot), hold);
      }
      if (reading > 0.002) {
        // The forearm rolled so that the bracer's back, its local -x, faces up and toward the eye,
        // halfway (the user, 2026-11-23: less turned to the view); the hand straight on it.
        const held = { ...q, rot: q.rot.slice() };
        const solved = solve(held);
        const forearm = unit(sub(solved.pos[J.HAND_L], solved.pos[J.FOREARM_L]));
        const look = unit(sub(solved.pos[J.HAND_L], eye));
        const x = unit(across(add(look, [0, -2, 0]), forearm));
        held.rot[J.FOREARM_L] = mul(inv(solved.rot[J.ARM_L]), frame(x, forearm));
        held.rot[J.HAND_L] = ID;
        for (const k of [arm + 1, arm + 2]) {
          q.rot[k] = slerp(q.rot[k], held.rot[k], reading);
        }
        const posed = solve(q);
        // The right hand's finger presses its fire key at each shot (the user, 2026-11-23).
        key = add(posed.pos[J.HAND_L], spin(posed.rot[J.FOREARM_L], FIRE_KEY));
        keyW = reading;
      }
      if (hunter && sw && onSword > 0.002) {
        // Lead with the wrist. The elbow stays wide so the two blades cross into view.
        const at = add(eye, add(keep(add(sw.at, [0.1, 0.12, -0.14])), clear));
        const held = { ...q, rot: q.rot.slice() };
        reach(held, s, arm, at, keep([1, -0.8, 0.25]));
        const solved = solve(held);
        const forearm = unit(sub(solved.pos[J.HAND_R], solved.pos[J.FOREARM_R]));
        // The back of the wrist rolled well over to the right: the blades lean on their side (the
        // user, 2026-11-23).
        const dorsal = unit(across(keep(CLAW_ROLL), forearm));
        held.rot[J.FOREARM_R] = mul(inv(solved.rot[arm]), frame(dorsal, forearm));
        held.rot[J.HAND_R] = ID;
        for (const k of [arm, arm + 1, arm + 2]) {
          q.rot[k] = slerp(q.rot[k], held.rot[k], onSword);
        }
      } else if (sw && onSword > 0.002) {
        // Both hands round the grip, the left one BACK behind the right, the wrists straight.
        const at = along(grip0, blade0, sd > 0 ? 0 : -BACK);
        const held = { ...q, rot: q.rot.slice() };
        held.rot[arm - 1] = kq.rot[arm - 1];
        wield(
          held,
          s,
          arm,
          at,
          blade0,
          keep([0.5 * sd, -1, -0.35]),
          sd > 0 ? fingR : fingL,
          sd > 0 ? FIST : KATANA_LEFT,
          sd > 0 ? [S, C] : KATANA_TILT,
          sd < 0,
        );
        for (const k of [arm - 1, arm, arm + 1, arm + 2]) {
          q.rot[k] = slerp(q.rot[k], held.rot[k], onSword);
        }
      }
      // The rail gun takes the left hand too, on its front grip, the elbow down and out; the
      // rifle's handguard lies in its palm, a cup (RIFLE_HOLD).
      const two =
        sd < 0 && ((me?.railed && !hunter) || (me?.rifled && !hunter) || harpoonDraw)
          ? w.gun * free
          : 0;
      if (two > 0.002) {
        const held = { ...q, rot: q.rot.slice() };
        if (fu) {
          shrug(held, s, arm, add(eye, turn(fc)));
        }
        wield(
          held,
          s,
          arm,
          add(eye, turn(fc)),
          unit(turn(fd)),
          turn([-0.5, -1, -0.35]),
          fu && turn(fu),
          fu ? RIFLE_HOLD : FIST,
          fu ? RIFLE_TILT : undefined,
          false,
          !!fu,
        );
        for (const k of [arm - 1, arm, arm + 1, arm + 2]) {
          q.rot[k] = slerp(q.rot[k], held.rot[k], two);
        }
        curls[0] += ((fu ? RIFLE_CURL : 0.9) - curls[0]) * two;
      }
      if (sd < 0) {
        cupping = fu ? two : 0;
      }
      // In a swap the left hand brings the new battery up under the grip, or takes the capsule
      // off the top and screws the new one on.
      const sp = me ? swapOf(me) : -1;
      const rail = !!me?.railed;
      const onLoad =
        sd < 0 && !harpoonDraw && sp >= 0
          ? w.gun *
            free *
            (rail
              ? ease(span(sp, 0.34, 0.46)) * (1 - ease(span(sp, 0.88, 0.96)))
              : ease(span(sp, BROUGHT - 0.03, BROUGHT)) * (1 - ease(span(sp, TAP + 0.03, 0.9))))
          : 0;
      // The gun's or the rifle's new battery from the pouch on the left hip (the user, 2026-11-09):
      // the hand off the gun down to it, into it and the battery out, then up with it under the
      // grip, where the gun takes it (above BROUGHT). The battery is drawn in the hand (carried).
      const fetch =
        sd < 0 && !harpoonDraw && sp >= 0 && !rail
          ? w.gun * free * ease(span(sp, 0.12, 0.2)) * (1 - ease(span(sp, BROUGHT - 0.03, BROUGHT)))
          : 0;
      if (sd < 0) {
        carried = undefined;
      }
      if (fetch > 0.002 && me) {
        const [foot, ax] = loadFrame(gp, ga, kindOf(me), BROUGHT);
        const f = fetched(
          sp,
          pouchAt(s.pos[J.PELVIS], s.rot[J.PELVIS]),
          [add(eye, turn(foot)), ax.map(turn)],
          add(eye, turn(along(gp, ga[1], -0.12))),
        );
        carried = f.carry;
        const held = { ...q, rot: q.rot.slice() };
        wield(held, s, arm, f.at, f.g, turn([-0.5, -1, -0.35]));
        for (const k of [arm - 1, arm, arm + 1, arm + 2]) {
          q.rot[k] = slerp(q.rot[k], held.rot[k], fetch);
        }
        curls[0] += (f.curl - curls[0]) * fetch;
        cupping *= 1 - fetch;
      }
      if (onLoad > 0.002) {
        // On the new battery or capsule, which comes with the hand. The capsule is held round its
        // side, the wrist turning about it as it screws it in.
        const [foot, [, , up]] = loadFrame(
          gp,
          ga,
          me ? kindOf(me) : 0,
          Math.max(sp, rail ? 0.42 : 0.4),
        );
        // The battery in but for its last 12 mm, held there a moment; then the palm drops 12 cm off
        // it and slaps it home at TAP, faster and faster (the user, 2026-11-09).
        const tap =
          0.12 *
          (sp < TAP - 0.04 ? ease(span(sp, 0.64, TAP - 0.04)) : 1 - span(sp, TAP - 0.04, TAP) ** 3);
        const mid = [0, 1, 2].map(i => foot[i] + up[i] * (rail ? CAPSULE_UP : -0.01 - tap)) as Vec3;
        let fing: Vec3 | undefined;
        if (rail) {
          // From the capsule's axis out to its left, turned with the wrist.
          const o = rotate(mix([0, 0, 0], ga[0], -1), mix([0, 0, 0], up, screwed(sp)[1]));
          fing = turn(mix([0, 0, 0], o, -1));
        }
        const held = { ...q, rot: q.rot.slice() };
        if (fing) {
          shrug(held, s, arm, add(eye, turn(mid)));
        }
        wield(
          held,
          s,
          arm,
          add(eye, turn(mid)),
          unit(turn(up)),
          turn([-0.5, -1, -0.35]),
          fing,
          rail ? CAPSULE_HOLD : FIST,
          undefined,
          false,
          rail,
        );
        // The battery in, the hand lets go of it and opens flat, the palm up to its foot, the
        // fingers along the gun, to slap it home with the palm (the user, 2026-11-09).
        // The battery in, the hand lets go of it and opens flat to slap it home (below).
        const flat = rail ? 0 : ease(span(sp, 0.6, 0.64));
        [slapW, slapTap] = [onLoad * flat, tap];
        for (const k of [arm - 1, arm, arm + 1, arm + 2]) {
          q.rot[k] = slerp(q.rot[k], held.rot[k], onLoad);
        }
        curls[0] += ((rail ? CAPSULE_CURL : 0.9) - 0.85 * flat - curls[0]) * onLoad;
        cupping *= 1 - onLoad;
      }
      // Each weapon comes on its own way (the user, 2026-11-09): the left index presses the laser
      // rifle's button, the hand off its front grip, flat, the index out, and back; the right thumb
      // presses the plasma gun's and the katana's (draw()); the left hand turns the rail gun's
      // capsule (below).
      const pw = sd < 0 && me && sp < 0 && pk == 3 ? poke(since, pressOf(pk)) * w.gun * free : 0;
      // The rail gun's capsule: the left hand off the front grip onto its side, turning it a
      // quarter of a turn with the wrist, as it screws a new one in, and back.
      const tw = sd < 0 && me && sp < 0 && pk == 2 ? poke(since, pressOf(2)) * w.gun * free : 0;
      if (tw > 0.002) {
        const th = tune(since, pressOf(2));
        const [foot, [, , up]] = loadFrame(gp, ga, 2, -1, 1, 0, th);
        const mid = [0, 1, 2].map(i => foot[i] + up[i] * CAPSULE_UP) as Vec3;
        const o = rotate(mix([0, 0, 0], ga[0], -1), mix([0, 0, 0], up, th));
        const held = { ...q, rot: q.rot.slice() };
        shrug(held, s, arm, add(eye, turn(mid)));
        wield(
          held,
          s,
          arm,
          add(eye, turn(mid)),
          unit(turn(up)),
          turn([-0.5, -1, -0.35]),
          turn(mix([0, 0, 0], o, -1)),
          CAPSULE_HOLD,
          undefined,
          false,
          true,
        );
        for (const k of [arm - 1, arm, arm + 1, arm + 2]) {
          q.rot[k] = slerp(q.rot[k], held.rot[k], tw);
        }
        curls[0] += (CAPSULE_CURL - curls[0]) * tw;
      }
      if (sd < 0) {
        pointing = pw;
        cupping *= 1 - pw;
      }
      if (pw > 0.002) {
        // The gun's model frame in the world, from the holster.
        const [bat, bax]: [Vec3, Vec3[]] = [add(eye, turn(gp)), ga.map(turn)];
        const [b, n] = buttonAt(pk, bat, bax);
        // The index level with the gun, into the button, the thumb back toward the player: the hand
        // flat, its back up (the user, 2026-11-09).
        const into = unit(across(mix([0, 0, 0], n, -1), bax[1]));
        const g = unit(across(mix([0, 0, 0], bax[2], -1), into));
        const sid = unit(along(into, g, -S));
        const fing = along(mix([0, 0, 0], g, S), sid, C);
        const th = along(mix([0, 0, 0], g, C), sid, -S);
        const held = { ...q, rot: q.rot.slice() };
        wield(
          held,
          s,
          arm,
          along(along(b, fing, -0.1), th, -0.034),
          g,
          turn([-0.5, -1, -0.35]),
          into,
        );
        for (const k of [arm - 1, arm, arm + 1, arm + 2]) {
          q.rot[k] = slerp(q.rot[k], held.rot[k], pw);
        }
      }
      // On a wall the fore paws stay on it (fours.ts).
      for (const k of [arm - 1, arm, arm + 1, arm + 2]) {
        q.rot[k] = slerp(q.rot[k], pawed[k], wf);
      }
    }
    // The slap, once the right hand has the gun (the user, 2026-11-09: the hand flat, the palm
    // striking the battery): on the battery as drawn, the palm's middle 5 cm along the fingers from
    // the wrist and its skin on the foot at TAP; the left hand's x, its palm side, up the battery.
    if (slapW > 0.002 && me) {
      const r = solve(q);
      const ax = gunAxes(r.rot[J.HAND_R]);
      const [foot, [, , up]] = loadFrame(
        gunGrip(r.pos[J.HAND_R], r.rot[J.HAND_R]),
        ax,
        kindOf(me),
        Math.max(swapOf(me), 0.4),
      );
      // The hand straight on the forearm (the user, 2026-11-09): the fingers carry on its line, the
      // palm turned up the battery as far as that allows; the wrist set again from the forearm.
      const slap = { ...q, rot: q.rot.slice() };
      let d = unit(across(ax[0], up));
      let x = up;
      for (let k = 0; k < 3; k++) {
        const palm = along(along(foot, up, -slapTap), d, -0.05);
        reach(slap, r, J.ARM_L, along(palm, x, -0.012), turn([-0.5, -1, -0.35]));
        const t = solve(slap);
        d = unit(sub(t.pos[J.HAND_L], t.pos[J.FOREARM_L]));
        x = unit(across(up, d));
      }
      // The wrist bent a little, half the way to the fingers square to the battery, so that the
      // palm meets it flat and the hand still reads along the arm (the user, 2026-11-09).
      const f = unit(mix(d, unit(across(d, up)), 0.5));
      const xf = unit(across(up, f));
      reach(
        slap,
        r,
        J.ARM_L,
        along(along(along(foot, up, -slapTap), f, -0.05), xf, -0.012),
        turn([-0.5, -1, -0.35]),
      );
      slap.rot[J.HAND_L] = mul(inv(solve(slap).rot[J.FOREARM_L]), frame(xf, f));
      for (const k of [J.ARM_L - 1, J.ARM_L, J.FOREARM_L, J.HAND_L]) {
        q.rot[k] = slerp(q.rot[k], slap.rot[k], slapW);
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
    wear(b, t, n = false, x = false, h = false) {
      [tone, ninja, xeno] = [x ? CHITIN_X : t, n, x];
      hunter = h;
      if (b != build) {
        // Her own skeleton: a gait of its own, in the pose of the player at once.
        [build, gait] = [b, createGait(0, b)];
        if (me) {
          gait.update(me, 0, world && floorOf(world, me.y));
        }
      }
    },
    draw(out, eye, yaw, pitch, roll = 0, color = [0.7, 0.7, 0.7], pieces) {
      const s = pose(eye, yaw, pitch, roll);
      if (s) {
        // An armoured suit (see palette()): its gloves cover the fingers too; white armour in space,
        // else in the team's colour.
        const suit = !!world?.def.armor && !ninja && !xeno && !hunter;
        const plate = world?.def.helmets ? undefined : color;
        const colors = palette(
          hunter ? [0.34, 0.25, 0.17] : ninja || xeno ? CLOTH : color,
          undefined,
          undefined,
          suit,
          hunter ? [0.42, 0.29, 0.19] : tone,
        );
        if (hunter) {
          colors[REGION.PANTS] = HUNTER_HAND;
          colors[REGION.UPPER] = [0.38, 0.27, 0.17];
          colors[REGION.GLOVE] = HUNTER_HAND;
          colors[REGION.BELT] = [0.19, 0.15, 0.11];
        }
        if (ninja || xeno) {
          const { PANTS, UPPER, GLOVE, BELT } = REGION;
          // His belt is cut in a V by armor(), as on the others (soldier.ts).
          [colors[PANTS], colors[UPPER], colors[GLOVE], colors[BELT]] = [
            CLOTH,
            CLOTH,
            CLOTH,
            CLOTH,
          ];
        }
        const from = out.length;
        if (xeno) {
          const { PANTS, UPPER, GLOVE, JACKET, TRIM, SOLE, BELT } = REGION;
          for (const k of [PANTS, UPPER, GLOVE, JACKET, TRIM, SOLE, BELT]) {
            colors[k] = CHITIN_X;
          }
        }
        skin(out, xeno ? beast(2) : body(2, build), s, colors);
        if (xeno) {
          // Its feet, the skin's legs ending at the ankles (soldier.ts draws them on the others).
          // The runners' close ones (partsOf()), made once, carried here.
          const [foot, toes] = [partsOf(3)[PART.FOOT], partsOf(3)[PART.TOES]];
          for (const [f, t] of FEET) {
            expand(out, { m: mesh(foot.key, made(foot)), q: s.rot[f], t: s.pos[f], k: 1 });
            const at = add(s.pos[f], spin(s.rot[f], FOOT_TIP));
            expand(out, { m: mesh(toes.key, made(toes)), q: s.rot[t], t: at, k: 1 });
          }
          // Its tail (the user, 2026-11-16: seen in the own view as the katana is), only while it
          // strikes: round the hip or over the shoulder, into the view.
          const lash = me ? lashOf(me, clock) : HOOKED;
          if (lash != HOOKED) {
            tail(out, s, clock, 0, lash, color, 2, 0, me);
          }
        }
        // The ninja's own plates in his team's colour (soldier.ts).
        if ((world?.def.armor && !xeno && !hunter) || ninja) {
          armor(out, from, body(2, build), true, plate, ninja, color, !world?.def.armor);
        }
        if (hunter) {
          for (const part of hunterView(build)) {
            // The hip's disc is in his hand while it is the weapon.
            if (!(me?.rifled && part.key.endsWith('Flying disc'))) {
              drawHunterPart(out, part, s, pieces);
            }
          }
          // The wrist computer on the left bracer, its glyphs the cannon's shots left.
          const shots = me?.cap ?? HUNTER_CELLS;
          placeRigid(
            out,
            `wrist computer ${shots}`,
            wristComputer(shots),
            s.rot[J.FOREARM_L],
            s.pos[J.HAND_L],
            pieces,
          );
          // The shoulder cannon, from the camera: stowed, it is out of sight and not drawn.
          if (cannon > 0) {
            const [hinge, q] = cannonInView(cannon, target);
            const view = mul(
              mul(axis([0, 1, 0], yaw), axis([1, 0, 0], pitch)),
              axis([0, 0, 1], -roll),
            );
            const [r, u, f] = basis(yaw, pitch, roll);
            const at = [0, 1, 2].map(
              i => eye[i] + r[i] * hinge[0] + u[i] * hinge[1] + f[i] * hinge[2],
            ) as Vec3;
            placeRigid(out, 'hunter view cannon', cannonVertices(), mul(view, q), at, pieces);
            // Its post, from the shoulder up to the hinge.
            placeRigid(
              out,
              'hunter view post',
              postVertices(),
              mul(view, armTurn(folded(cannon))),
              at,
              pieces,
            );
          }
        }
        pouch(out, s.pos[J.PELVIS], s.rot[J.PELVIS]);
        if (ninja) {
          blades(out, s.pos[J.PELVIS], s.rot[J.PELVIS], build);
          drape(out, s, build, clock, me ? Math.hypot(me.vx, me.vz) : 0, color, 1);
        }
        // The right thumb presses the button of the katana or the plasma gun as it comes on.
        const tk = me?.wield ? 1 : me ? kindOf(me) : -1;
        const push =
          me &&
          !harpoonDraw &&
          swapOf(me) < 0 &&
          ((tk == 1 && grasp > 0.2) || (tk == 0 && hold > 0.2))
            ? poke(since, pressOf(tk))
            : 0;
        // Her hand: the same one, smaller about the wrist, so it closes on the same grips.
        // The xenomorph's hands stay half open, its claws out: it rakes, it does not punch.
        hands(
          out,
          s,
          build,
          xeno ? curls.map(c => Math.min(c, RAKE)) : curls,
          hunter ? HUNTER_HAND : colors[7],
          hunter ? HUNTER_HAND : suit ? colors[7] : colors[3],
          {
            point: pointing,
            poke: poking,
            push,
            to: thumbTo(Math.max(tk, 0)),
            cup: cupping,
            lights: suit && !!plate,
            claws: hunter ? 'short' : xeno,
            // The fingers fanned out over the disc's hub (the user, 2026-11-23).
            spread: hunter && me?.rifled && discIn() ? DISC_SPREAD : 1,
            hook: hunter && me?.rifled && discIn() ? DISC_HOOK : 0,
          },
        );
        if (hold > 0.2) {
          // The gauge lights once a press is more than a tap: the strength the shot would have.
          const level =
            me && (me.charge ?? 0) >= CHARGE_TAP ? Math.min(powerOf(me.charge!), me.mag ?? 0) : 0;
          const kind = me ? kindOf(me) : 0;
          const rail = kind == 2;
          const sp = me ? swapOf(me) : -1;
          const on = since - Math.max(pressOf(kind), 0);
          if (hunter && kind === 0) {
            drawHarpoon(
              out,
              1,
              gunGrip(s.pos[J.HAND_R], s.rot[J.HAND_R]),
              gunAxes(s.rot[J.HAND_R]),
              0.82,
              ease(harpoonDraw),
              !!me?.mag || sp >= 0,
              harpoonFeed(sp),
              pieces,
              (HARPOON_GONE * harpoonShot) / HARPOON_OUT,
            );
          } else if (hunter && kind === 3 && !discIn()) {
            // Thrown: the hand is empty until it comes back.
          } else if (hunter && kind === 3) {
            // The armour's disc held by its hub (the user, 2026-11-23): the palm on the hub, the
            // fingers over its face between the blades; its face along the back of the hand
            // (gunAxes()' right), the disc beyond the palm.
            const q = s.rot[J.HAND_R];
            const [ax, up, fwd] = gunAxes(q);
            const at = gunGrip(s.pos[J.HAND_R], q).map(
              (c, i) => c + fwd[i] * DISC_HOLD[0] - ax[i] * DISC_HOLD[1],
            ) as Vec3;
            drawDisc(out, at, fwd, up, ax);
          } else if (!(hunter && rail)) {
            held(
              out,
              s.pos[J.HAND_R],
              s.rot[J.HAND_R],
              1,
              clamp(hold * 1.5 - 0.5),
              kind == 3 ? me!.clip : rail ? charge(me!.cap ?? 0) : me?.mag,
              level,
              kind,
              clock,
              {
                // Dark from when the old one comes out until the new one is in, the gun's counter
                // dark with it; then the thumb presses the button on its side and the gun boots: the
                // light comes on, and the counter fades in with the boot's whine.
                light:
                  sp < 0 ? power(on, kind ? undefined : GUN_ON.lit) : 1 - ease(span(sp, 0.1, 0.2)),
                swap: sp,
                empty: !(kind == 3 ? me?.clip : rail ? me?.cap : me?.mag),
                screen: sp < 0 ? span(on, GUN_ON.from, GUN_ON.up) : 1 - ease(span(sp, 0.1, 0.2)),
                digits: sp < 0 && on >= GUN_ON.digits,
                press: sp < 0 && kind != 2 ? span(poke(since, pressOf(kind)), 0.8, 1) : 0,
                tune: rail && sp < 0 ? tune(since, pressOf(2)) : 0,
                nades: kind == 3 ? (me?.nades ?? 0) : undefined,
                id: me?.id,
                floor: me?.ground ? me.y : undefined,
                vel: me && [me.vx, me.vy, me.vz],
                carry: carried,
                cells: me && cellsOf(me),
                heat: (me?.heat ?? 0) / HEAT_MAX,
                hot: me?.hot,
              },
            );
          }
        }
        if (hunter) {
          // The housing stays on the bracer; the blades slide out of it as they are taken, in
          // time with their sound (combat.ts: after the press, on a first taking), and back in.
          wristHousing(out, s.pos[J.HAND_R], s.rot[J.FOREARM_R], 1, pieces);
          const extended = me?.wield
            ? ease(clamp((since - Math.max(pressOf(1), 0)) / BLADE_EXTEND))
            : clamp(grasp * 1.5 - 0.5);
          if (extended > 0.01) {
            wristBlades(out, s.pos[J.HAND_R], s.rot[J.FOREARM_R], 1, extended, pieces);
          }
        }
        if (grasp > 0.2) {
          if (!hunter) {
            sword(
              out,
              s.pos[J.HAND_R],
              s.rot[J.HAND_R],
              1,
              clock,
              clamp(grasp * 1.5 - 0.5),
              // The thumb presses the button on the hilt and the blade lights up, all of it: it is no
              // light saber (the user, 2026-11-09).
              power(since - Math.max(pressOf(1), 0), 0.3),
              span(poke(since, pressOf(1)), 0.8, 1),
            );
          }
        }
        const [base, point] = hunter
          ? wristEnds(s.pos[J.HAND_R], s.rot[J.FOREARM_R])
          : ends(s.pos[J.HAND_R], s.rot[J.HAND_R]);
        // The parry's sweep leaves a streak like a cut's.
        trail.mark(base, point, grasp > 0.5 && (cutting(prog) || parry < 2 * PARRY_IN));
        trail.draw(out);
      }
    },
    aim(t) {
      const l = Math.hypot(...t);
      target = l < 3 ? (l ? (t.map(v => (v * 3) / l) as Vec3) : [0, 0, 3]) : t;
    },
    muzzle: () => {
      if (railed) {
        // The shoulder cannon's muzzle, where its shots are seen to leave.
        const [hinge, q] = cannonInView(cannon, target);
        return add(hinge, model(spin(q, CANNON_MUZZLE)));
      }
      return tip(...holster(), me ? kindOf(me) : 0);
    },
    spun: () => (me && prog >= 0 ? SWAY * bent(me, prog)[0] * w.blade : 0),
    parried: () => (parry = 0),
    get steps() {
      return gait.steps;
    },
    get phase() {
      return gait.phase;
    },
  };
};
