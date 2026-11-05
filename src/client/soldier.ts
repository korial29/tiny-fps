// The other players' model: a soldier of boxes and lathes, in the renderer's vertex format. Pure
// functions of the pose, no state, no DOM. A player's (x, y, z) is the bottom of the feet.
import { PLAYER_H } from '../shared/constants';
import type { PlayerState } from '../shared/types';
import { aim, dress, lathe, place, pushBox } from './mesh';
import type { Vec3 } from './mesh';

/** Limb phase per metre walked: a full stride every 1.75 m. */
const GAIT = 3.6;

/** Where a body stands and faces. */
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
/** A piece from world point `p` to `q`, `k` wide, `w` times that along the right of `yaw`. */
const link = (
  out: number[],
  src: number[],
  yaw: number,
  p: Vec3,
  q: Vec3,
  k: number,
  tint: number[],
  w = 1,
) => {
  const d = q.map((v, i) => v - p[i]);
  const len = Math.hypot(...d);
  const axes = aim(d.map(v => v / len) as Vec3, [Math.cos(yaw), 0, -Math.sin(yaw)]);
  place(out, src, p, axes, [0, 0, 0], [k * w, k, len], tint);
};

/** The same between two points local to a body (right, up, forward). */
const bone = (
  out: number[],
  src: number[],
  m: Pose,
  a: Vec3,
  b: Vec3,
  k: number,
  tint: number[],
  w = 1,
) => link(out, src, m.yaw, at(m, ...a), at(m, ...b), k, tint, w);

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

/** Hip height at rest. */
const HIP = 0.88;

/**
 * Appends another player as a soldier: `color` (r, g, b) for the body, darker for the legs, the
 * helmet and the gloves, a visor that glows in it. The legs stride with `walked` and `pace`, and
 * each arm swings against the leg on its side, empty handed.
 */
export const soldier = (
  out: number[],
  p: PlayerState,
  color: number[],
  walked: number,
  pace: number,
) => {
  const ph = walked * GAIT;
  const hy = HIP - 0.08 * Math.sin(ph) ** 2 * pace;
  const [dark, boot] = [color.map(v => v * 0.45), [0.1, 0.1, 0.12]];
  const [pelvis, neck]: Vec3[] = [
    [0, hy, 0],
    [0, hy + 0.55, 0.02],
  ];
  bone(out, TORSO, p, pelvis, neck, 1, color, 1.25);
  bone(out, HEAD, p, neck, [0, PLAYER_H, 0.02], 1.1, dark);
  const visor = color.map(v => 0.35 + 0.65 * v);
  pushBox(out, at(p, 0, neck[1] + 0.17, 0.17), [0.11, 0.035, 0.03], p.yaw, visor, -2);
  pushBox(out, at(p, 0, hy + 0.4, -0.2), [0.15, 0.2, 0.07], p.yaw, dark);
  for (const side of [-1, 1]) {
    const hip: Vec3 = [side * 0.12, hy, 0];
    const [knee, ankle] = leg(hip, ph + (side > 0 ? Math.PI : 0), pace);
    bone(out, LIMB, p, hip, knee, 0.1, dark);
    bone(out, LIMB, p, knee, ankle, 0.08, dark);
    pushBox(out, at(p, ankle[0], ankle[1] + 0.03, ankle[2] + 0.05), [0.06, 0.03, 0.1], p.yaw, boot);
    const shoulder: Vec3 = [side * 0.27, hy + 0.5, 0.02];
    const a = 0.45 * Math.sin(ph + (side < 0 ? Math.PI : 0)) * pace;
    const [mid, hand] = chain(shoulder, a, a + 0.3, 0.34, 0.36);
    bone(out, LIMB, p, shoulder, mid, 0.07, color);
    bone(out, FORE, p, mid, hand, 0.06, dark);
  }
};
