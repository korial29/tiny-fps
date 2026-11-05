// The other players' model: a runner of smooth solids (mesh.ts), in the renderer's vertex format.
// Pure functions of the pose, no state, no DOM. A player's (x, y, z) is the bottom of the feet.
import { PLAYER_H } from '../shared/constants';
import type { PlayerState } from '../shared/types';
import { RADII, SKIN, neck, shoe, torso } from './figure';
import { aim, place, segment, solid, sub, unit } from './mesh';
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
  return chain(hip, a, a - bend, THIGH, SHIN);
};

/** Hip height at rest: the legs reach the floor with the ankle 7 cm up. */
const HIP = 0.88;
const [UPPER, FORE, THIGH, SHIN] = [0.31, 0.27, 0.43, 0.38];
const [TROUSERS, HAIR, SHOE, SHADES] = [
  [0.12, 0.13, 0.17],
  [0.09, 0.07, 0.06],
  [0.16, 0.16, 0.19],
  [0.03, 0.03, 0.04],
];

/**
 * Appends another player as a runner at level of detail `lod` (see DETAIL): the jacket in `color`
 * (r, g, b), dark trousers, skin, hair and light shoes. The legs stride with `walked` and `pace`,
 * and each arm swings against the leg on its side, the elbow bent more the faster it goes.
 */
export const soldier = (
  out: number[],
  p: PlayerState,
  color: number[],
  walked: number,
  pace: number,
  lod = 1,
) => {
  const ph = walked * GAIT;
  const hy = HIP - 0.08 * Math.sin(ph) ** 2 * pace;
  const lean = 0.12 * pace;
  const [o, w] = [at(p, 0, 0, 0), (r: number, u: number, f: number) => at(p, r, u, f)];
  const dir = (r: number, u: number, f: number) => sub(w(r, u, f), o);
  const [fwd, right, spine] = [dir(0, 0, 1), dir(1, 0, 0), dir(0, Math.cos(lean), Math.sin(lean))];
  const pelvis = w(0, hy, 0);
  torso(out, lod, pelvis, spine, fwd, right, color, TROUSERS);
  const [ball, small] = [lod, 0].map(l => solid(l, 0, [1, 1]));
  const [head, face] = [
    w(0, hy + (PLAYER_H - 0.133 - HIP) * Math.cos(lean), (PLAYER_H - 0.133 - HIP) * Math.sin(lean)),
    aim(fwd, right),
  ];
  if (lod) {
    neck(out, lod, pelvis, spine, right);
  }
  place(out, ball, head, face, [0, 0, 0.012], [0.082, 0.12, 0.1], SKIN);
  place(out, ball, head, face, [0, 0.02, -0.004], [0.088, 0.113, 0.11], HAIR);
  if (lod) {
    // A hood rolled down behind the neck, and a nose.
    place(
      out,
      small,
      w(0, hy + 0.58 * Math.cos(lean), 0.58 * Math.sin(lean)),
      face,
      [0, 0, -0.075],
      [0.115, 0.055, 0.06],
      color,
    );
    place(out, small, head, face, [0, -0.02, 0.108], [0.016, 0.028, 0.022], SKIN);
    place(out, small, head, face, [0, 0.025, 0.083], [0.068, 0.016, 0.03], SHADES);
  }
  for (const side of [-1, 1]) {
    const [knee, ankle] = leg([side * 0.11, hy, 0], ph + (side > 0 ? Math.PI : 0), pace).map(q =>
      w(...q),
    );
    segment(
      out,
      solid(lod, THIGH, RADII.thigh, [0.5, 1]),
      w(side * 0.11, hy, 0),
      knee,
      right,
      THIGH,
      1,
      TROUSERS,
    );
    segment(out, solid(lod, SHIN, RADII.shin, [0.5, 0.5]), knee, ankle, right, SHIN, 1, TROUSERS);
    shoe(out, lod, ankle, unit(sub(ankle, knee)), fwd, right, SHOE);
    const root: Vec3 = [side * 0.205, hy + 0.5 * Math.cos(lean), 0.5 * Math.sin(lean)];
    const a = 0.5 * Math.sin(ph + (side < 0 ? Math.PI : 0)) * pace;
    const [elbow, wrist] = chain(root, a, a + 0.15 + 0.9 * pace, UPPER, FORE).map(q => w(...q));
    segment(
      out,
      solid(lod, UPPER, RADII.upper, [1, 0.5]),
      w(...root),
      elbow,
      right,
      UPPER,
      1,
      color,
    );
    segment(out, solid(lod, FORE, RADII.fore, [0.5, 0]), elbow, wrist, right, FORE, 1, color);
    place(
      out,
      small,
      wrist,
      aim(unit(sub(wrist, elbow)), right),
      [0, 0, 0.04],
      [0.04, 0.036, 0.058],
      SKIN,
    );
  }
};
