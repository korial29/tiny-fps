// The limb a katana's finishing cut takes off (PlayerState.lost), drawn: the skin's limb (cut() in
// skin.ts) frozen in the pose of the cut and thrown off the body as one rigid piece that tumbles,
// bounces on the roof and lies there until the body is gone. Both cut faces glow, cauterized; the
// cut bursts in cyan sparks and the stump spits a few more for a second. Changes no rule. No DOM.
import { GRAVITY } from '../shared/constants';
import { LIMB } from '../shared/types';
import type { PlayerState } from '../shared/types';
import { ray } from '../shared/world';
import type { World } from '../shared/world';
import type { Tracer } from './beams';
import type { Gait } from './gait';
import { STRIDE, unit } from './mesh';
import type { Vec3 } from './mesh';
import { JOINT as J, axis, mul, solve, turn } from './rig';
import type { Quat } from './rig';
import { hands } from './body';
import { REGION, cut, palette, skin } from './skin';
import { room } from './verts';
import type { Out } from './verts';

/** How closed the hand of an arm cut off is (hand() in body.ts). */
export const LIMP = 0.35;

/** Seconds the stump spits sparks, and sparks a second. */
const SPIT = 1;
const SPITS = 12;

/** The height of the floor under (x, z) for something whose middle is at height y. */
export type Ground = (x: number, y: number, z: number) => number;

/** The first top under a point, none (it falls out of sight) off the roofs; without a world, the height `y0`. */
export const ground =
  (world: World | undefined, y0: number): Ground =>
  (x, y, z) => {
    if (!world) {
      return y0;
    }
    const d = ray(world, [x, y + 0.2, z], [0, -1, 0], 99);
    return d < 99 ? y + 0.2 - d : -Infinity;
  };

export interface Piece {
  limb: number;
  /** The joints in the pose of the cut, which the limb is skinned with, and its middle then. */
  s: ReturnType<typeof solve>;
  c: Vec3;
  /** Its points around that middle, for the floor, and its long axis, middle away from the cut. */
  pts: Vec3[];
  long: Vec3;
  /** Where its middle is now, its velocity, its turn since the cut and its spin (axis times rad/s). */
  p: Vec3;
  v: Vec3;
  q: Quat;
  w: Vec3;
  /** The stump's cut face on the body (soldier() keeps it there), and seconds since the cut. */
  at: Vec3;
  age: number;
  /** The BUILD of the body it came off (rig.ts). */
  b?: number;
}

/**
 * The limb `limb` of `p` coming off the body posed as `s`: thrown with the body's speed, a little
 * outward (and back) from the hips and up, tumbling outward.
 */
export const sever = (
  limb: number,
  s: ReturnType<typeof solve>,
  p: PlayerState,
  build = 0,
): Piece => {
  const v: number[] = [];
  skin(v, cut(1, limb, build)[1], s, palette([0, 0, 0]));
  const n = v.length / STRIDE;
  const at = v.slice(v.length - STRIDE, v.length - STRIDE + 3) as Vec3;
  const c = [0, 1, 2].map(k => v.reduce((m, x, i) => (i % STRIDE == k ? m + x : m), 0) / n) as Vec3;
  const pts: Vec3[] = [];
  for (let i = 0; i < v.length; i += STRIDE * 3) {
    pts.push([v[i] - c[0], v[i + 1] - c[1], v[i + 2] - c[2]]);
  }
  const hip = s.pos[J.PELVIS];
  const out = unit([
    at[0] - hip[0] + 0.3 * Math.sin(p.yaw),
    0,
    at[2] - hip[2] + 0.3 * Math.cos(p.yaw),
  ]);
  return {
    limb,
    s,
    c,
    pts,
    long: unit([c[0] - at[0], c[1] - at[1], c[2] - at[2]]),
    p: [...c],
    v: [p.vx + out[0] * 1.5, Math.max(p.vy, 0) + 3, p.vz + out[2] * 1.5],
    q: [0, 0, 0, 1],
    w: [out[2] * 7, 1.5, -out[0] * 7],
    at,
    age: 0,
    b: build,
  };
};

/**
 * One step of dt seconds of a piece's fall: gravity and spin, then the floor under it, which it
 * bounces off, rubs along and lies down on (its long axis toppling to the level).
 */
export const fall = (c: Piece, dt: number, floor: Ground) => {
  c.age += dt;
  c.v[1] -= GRAVITY * dt;
  c.p = c.p.map((x, i) => x + c.v[i] * dt) as Vec3;
  const a = Math.hypot(...c.w);
  if (a > 1e-6) {
    c.q = mul(axis(unit(c.w), a * dt), c.q);
  }
  const low = Math.min(...c.pts.map(x => turn(c.q, x)[1]));
  const d = floor(c.p[0], c.p[1], c.p[2]) - c.p[1] - low;
  if (d > 0) {
    c.p[1] += d;
    c.v[1] = c.v[1] < -2 ? -0.3 * c.v[1] : Math.max(c.v[1], 0);
    const k = Math.exp(-6 * dt);
    const [x, y, z] = turn(c.q, c.long);
    // A turn about up x long lowers the long axis' high end.
    c.w = [c.w[0] * k + 40 * z * y * dt, c.w[1] * k, c.w[2] * k - 40 * x * y * dt];
    c.v[0] *= k;
    c.v[2] *= k;
  }
};

/**
 * Keeps the piece of a runner in step with its player `r.p`: made when `lost` is set while down,
 * with a burst of sparks at the cut, or already lying when the runner was `fresh` (first seen that
 * way); moved by dt, the stump spitting; forgotten once he is up.
 */
export const track = (
  r: { p: PlayerState; gait: Pick<Gait, 'pose'>; cut?: Piece; build?: number },
  dt: number,
  floor: Ground,
  fresh: boolean,
  tracer?: Pick<Tracer, 'shock' | 'spit'>,
) => {
  const k = r.p.down ? (r.p.lost ?? 0) : 0;
  if (!k) {
    r.cut = undefined;
    return;
  }
  if (!r.cut) {
    r.cut = sever(k, solve(r.gait.pose()), r.p, r.build);
    if (fresh) {
      for (let i = 0; i < 240; i++) {
        fall(r.cut, 1 / 60, floor);
      }
      return;
    }
    tracer?.shock(r.cut.at);
  }
  const t = r.cut.age;
  fall(r.cut, dt, floor);
  if (t < SPIT && Math.floor(r.cut.age * SPITS) > Math.floor(t * SPITS)) {
    tracer?.spit(r.cut.at);
  }
};

/**
 * Appends the piece at level of detail `lod`, in `colors` (see palette()), sunk by `sink` metres with
 * the body; an arm with its hand, limp, in a space suit's glove on `suit`.
 */
export const piece = (
  out: Out,
  c: Piece,
  colors: number[][],
  lod: number,
  sink: number,
  face?: ArrayLike<number>,
  suit = false,
) => {
  const from = out.length;
  // A head off has its owner's face: down, the eyes shut.
  skin(out, cut(lod, c.limb, c.b)[1], c.s, colors, face);
  const arm = c.limb == LIMB.ARM_L || c.limb == LIMB.ARM_R;
  if (arm && lod) {
    const glove = colors[REGION.GLOVE];
    // hands() leaves out the other one.
    const other = c.limb == LIMB.ARM_L ? J.HAND_R : J.HAND_L;
    hands(
      out,
      c.s,
      c.b ?? 0,
      [LIMP, LIMP],
      glove,
      suit ? glove : colors[REGION.FLESH],
      {},
      lod < 3,
      other,
    );
  }
  const a = room(out, 0);
  for (let i = from; i < out.length; i += STRIDE) {
    const x = turn(c.q, [a[i] - c.c[0], a[i + 1] - c.c[1], a[i + 2] - c.c[2]]);
    const nv = turn(c.q, [a[i + 3], a[i + 4], a[i + 5]]);
    for (let k = 0; k < 3; k++) {
      a[i + k] = x[k] + c.p[k] - (k == 1 ? sink : 0);
      a[i + 3 + k] = nv[k];
    }
  }
};
