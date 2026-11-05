// Procedural monsters: boxes and one lathe, in the renderer's vertex format. Pure functions of the
// pose, no state, no DOM. A monster's (x, y, z) is the bottom of its body.
import { BULLET_R, FLYER_H, FLYER_R, WALKER_H } from '../shared/constants';
import { TAU } from '../shared/physics';
import type { Bullet, Monster } from '../shared/types';
import { lathe } from './gun';
import { aim, basis, dress, place, pushBox } from './mesh';
import type { Vec3 } from './mesh';

/** Seconds a walker's blow takes. */
export const SWING = 0.3;
/** Limb phase per metre walked: a full stride every 1.75 m. */
export const GAIT = 3.6;

/** Flat colours, shared with the gibs. Eyes are the unlit layer: they glow in the dark. */
export const COLOR = {
  body: [0.27, 0.22, 0.25],
  arm: [0.4, 0.26, 0.22],
  leg: [0.18, 0.17, 0.22],
  head: [0.45, 0.33, 0.3],
  shell: [0.36, 0.2, 0.32],
  fin: [0.5, 0.25, 0.25],
  gore: [0.6, 0.08, 0.07],
  calm: [0.6, 0.05, 0.04],
  chase: [1, 0.3, 0.15],
  blob: [1, 0.3, 0.05],
  core: [1, 0.8, 0.4],
};

/** What a monster of each MONSTER kind bursts into. */
export const CHUNKS = [
  [COLOR.body, COLOR.arm, COLOR.head, COLOR.gore, COLOR.gore, COLOR.chase],
  [COLOR.shell, COLOR.fin, COLOR.shell, COLOR.gore, COLOR.chase],
];

const eyes = (chase: boolean) => (chase ? COLOR.chase : COLOR.calm);

/** Where a body stands and faces: a monster or a player. */
interface Pose {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

/** Local (right, up, forward) of a body, to the world: forward is forward(yaw). */
const at = ({ x, y, z, yaw }: Pose, r: number, u: number, f: number): Vec3 => {
  const [s, c] = [Math.sin(yaw), Math.cos(yaw)];
  return [x + r * c - f * s, y + u, z - r * s - f * c];
};

/** What the client keeps of each body it draws: the limbs follow the distance, the pace the speed. */
export interface Gait {
  x: number;
  z: number;
  /** Distance covered, metres. */
  walked: number;
  /** Eased velocity on x and z, m/s. */
  vx: number;
  vz: number;
}

/** Moves the gait of `id` to (x, z) after dt seconds. A jump of metres (a respawn) is not a walk. */
export const follow = (book: Map<number, Gait>, id: number, x: number, z: number, dt: number) => {
  const g = book.get(id) ?? { x, z, walked: 0, vx: 0, vz: 0 };
  const d = Math.hypot(x - g.x, z - g.z);
  const k = dt > 0 && d < 1 ? 1 - Math.exp(-dt * 8) : 0;
  g.vx += ((x - g.x) / (dt || 1) - g.vx) * k;
  g.vz += ((z - g.z) / (dt || 1) - g.vz) * k;
  g.walked += d < 1 ? d : 0;
  [g.x, g.z] = [x, z];
  book.set(id, g);
  return g;
};

/** 0 standing to 1 striding: the limbs swing less when slow. */
export const pace = (g: Gait) => Math.min(1, Math.hypot(g.vx, g.vz) / 2);

/** A unit piece: a lathe of length 1 along its axis, radii in metres, coloured by the tint. */
const piece = (profile: [number, number][], sides: number) =>
  dress(lathe(profile, sides), [1, 1, 1]);
/** A tapered limb segment, radius 1 at the top. */
const LIMB = piece(
  [
    [0, 0],
    [1, 0.05],
    [0.65, 1],
    [0, 1],
  ],
  5,
);
/** A forearm that ends in a fist. */
const FORE = piece(
  [
    [0, 0],
    [0.8, 0.05],
    [0.55, 0.7],
    [1, 0.8],
    [0.5, 1],
    [0, 1],
  ],
  5,
);
const TORSO = piece(
  [
    [0, 0],
    [0.15, 0],
    [0.13, 0.25],
    [0.22, 0.7],
    [0.2, 0.95],
    [0, 1],
  ],
  6,
);
const HEAD = piece(
  [
    [0, 0],
    [0.1, 0.06],
    [0.155, 0.4],
    [0.13, 0.8],
    [0, 1],
  ],
  8,
);
const CONE = piece(
  [
    [0, 0],
    [1, 0],
    [0, 1],
  ],
  5,
);

/** A piece from local `a` to local `b`, `k` wide, `w` times that along the body's right. */
const bone = (
  out: number[],
  src: number[],
  m: Pose,
  a: Vec3,
  b: Vec3,
  k: number,
  tint: number[],
  w = 1,
) => {
  const [p, q] = [at(m, ...a), at(m, ...b)];
  const d = q.map((v, i) => v - p[i]);
  const len = Math.hypot(...d);
  const axes = aim(d.map(v => v / len) as Vec3, [Math.cos(m.yaw), 0, -Math.sin(m.yaw)]);
  place(out, src, p, axes, [0, 0, 0], [k * w, k, len], 0, tint);
};

/**
 * The joint and the end of a two-part limb hanging from `root` (right, up, forward): the first
 * part at angle `a` radians from straight down, swung forward, the second at `b`.
 */
const chain = ([r, u, f]: Vec3, a: number, b: number, l1: number, l2: number): Vec3[] => {
  const [uj, fj] = [u - l1 * Math.cos(a), f + l1 * Math.sin(a)];
  return [
    [r, uj, fj],
    [r, uj - l2 * Math.cos(b), fj + l2 * Math.sin(b)],
  ];
};

/**
 * A leg at a stride phase, hanging from `hip`: the thigh swings, the knee bends while the leg
 * trails and comes through, never backward. Returns the knee and the ankle.
 */
const leg = (hip: Vec3, phase: number, pace: number) => {
  const a = 0.55 * Math.sin(phase) * pace;
  const bend = 0.9 * Math.max(0, -Math.sin(phase + 0.5)) * pace;
  return chain(hip, a, a - bend, 0.43, 0.45);
};

/** Hip height at rest, torso length, and the skull's lean and length: its widest ring ends at WALKER_H. */
const HIP = 0.88;
const BACK = 0.66;
const LEAN = 0.4;
const SKULL = (WALKER_H - HIP - BACK * Math.cos(0.25) - 0.065) / (0.8 * Math.cos(LEAN));

/** Arm angle during a blow, `s` in (0, 1] the share of SWING elapsed: raised overhead, slammed down, back. */
export const strike = (s: number) =>
  s < 0.4
    ? 2.6 * Math.sin(((s / 0.4) * Math.PI) / 2)
    : s < 0.7
      ? 2.6 - 2.3 * ((s - 0.4) / 0.3) ** 2
      : 0.3 * (1 - (s - 0.7) / 0.3);

/**
 * Appends a walker: `walked` is the distance it has covered (the limbs swing with it), `pace` how
 * fast it goes (0 stands), `blow` the share of SWING elapsed, 0 when not swinging.
 */
export const walker = (out: number[], m: Monster, walked: number, blow: number, pace = 1) => {
  const ph = walked * GAIT;
  const raise = blow > 0 ? strike(blow) : 0;
  const hy = HIP - 0.1 * Math.sin(ph) ** 2 * pace;
  // The back bends forward, less so with the arm raised.
  const hunch = 0.25 - 0.12 * raise;
  const [pelvis, neck]: Vec3[] = [
    [0, hy, -0.02],
    [0, hy + BACK * Math.cos(hunch), BACK * Math.sin(hunch) - 0.02],
  ];
  bone(out, TORSO, m, pelvis, neck, 1.1, COLOR.body, 1.3);
  const crown: Vec3 = [0, neck[1] + SKULL * Math.cos(LEAN), neck[2] + SKULL * Math.sin(LEAN)];
  bone(out, HEAD, m, neck, crown, 1.25, COLOR.head);
  const glow = m.chase ? 0.06 : 0.045;
  for (const side of [-1, 1]) {
    const [knee, ankle] = leg([side * 0.14, hy, -0.02], ph + (side > 0 ? Math.PI : 0), pace);
    bone(out, LIMB, m, [side * 0.14, hy, -0.02], knee, 0.105, COLOR.leg);
    bone(out, LIMB, m, knee, ankle, 0.085, COLOR.leg);
    pushBox(
      out,
      at(m, ankle[0], ankle[1] + 0.03, ankle[2] + 0.06),
      [0.06, 0.03, 0.1],
      m.yaw,
      COLOR.leg,
    );
    const shoulder: Vec3 = [
      side * 0.28,
      hy + 0.55 * Math.cos(hunch),
      0.55 * Math.sin(hunch) - 0.02,
    ];
    // The right arm swings with the left leg, and takes the blow.
    const a = 0.45 * Math.sin(ph + (side < 0 ? Math.PI : 0)) * pace + (side > 0 ? raise : 0);
    const [elbow, fist] = chain(shoulder, a, a + 0.3, 0.38, 0.42);
    bone(out, LIMB, m, shoulder, elbow, 0.095, COLOR.arm);
    bone(out, FORE, m, elbow, fist, 0.085, COLOR.arm);
    bone(
      out,
      CONE,
      m,
      shoulder,
      [shoulder[0] + side * 0.18, shoulder[1] + 0.2, shoulder[2] - 0.02],
      0.08,
      COLOR.fin,
    );
    // On the face of the skull, a little proud of it.
    const eye = at(
      m,
      side * 0.075,
      neck[1] + SKULL * 0.45 * Math.cos(LEAN) - 0.18 * Math.sin(LEAN),
      neck[2] + SKULL * 0.45 * Math.sin(LEAN) + 0.18 * Math.cos(LEAN),
    );
    pushBox(out, eye, [glow, glow * 0.7, 0.02], m.yaw, eyes(m.chase), -2);
  }
};

/** The flyer's pod, upright: its length runs from the underside up. */
const SHELL = dress(
  lathe(
    [
      [0, 0],
      [0.18, 0.06],
      [FLYER_R, 0.32],
      [FLYER_R * 0.93, 0.5],
      [0.22, 0.78],
      [0, FLYER_H],
    ],
    8,
  ),
  COLOR.shell,
);

/** Appends a flyer at time t (seconds): it bobs on a slow sine and its fins spin. */
export const flyer = (out: number[], m: Monster, t: number) => {
  const bob = Math.sin(t * 2 + m.id) * 0.06;
  const base: Vec3 = [m.x, m.y + bob, m.z];
  place(out, SHELL, base, basis(0, Math.PI / 2), [0, 0, 0], 1);
  for (let i = 0; i < 4; i++) {
    const a = t * 1.5 + (i * TAU) / 4;
    const fin: Vec3 = [m.x + Math.cos(a) * 0.4, base[1] + 0.35, m.z + Math.sin(a) * 0.4];
    pushBox(out, fin, [0.16, 0.03, 0.04], -a, COLOR.fin);
  }
  const eye = at({ ...m, y: base[1] }, 0, FLYER_H * 0.45, FLYER_R * 0.9);
  const glow = m.chase ? 1.3 : 1;
  pushBox(out, eye, [0.1 * glow, 0.07 * glow, 0.05], m.yaw, eyes(m.chase), -2);
};

/**
 * Appends a bullet: a glowing blob with a short tail behind it when `dir` (unit, its heading) is
 * known.
 */
export const bullet = (out: number[], b: Bullet, dir?: Vec3) => {
  const p: Vec3 = [b.x, b.y, b.z];
  pushBox(out, p, [BULLET_R * 0.8, BULLET_R * 0.8, BULLET_R * 0.8], 0, COLOR.blob, -2);
  pushBox(out, p, [BULLET_R * 0.5, BULLET_R * 0.5, BULLET_R * 0.5], Math.PI / 4, COLOR.core, -2);
  if (dir) {
    for (const k of [1, 2]) {
      const h = BULLET_R * (1 - k * 0.3);
      pushBox(out, p.map((x, i) => x - dir[i] * k * 0.2) as Vec3, [h, h, h], 0, COLOR.blob, -2);
    }
  }
};
