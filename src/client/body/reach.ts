import { C, S } from '../katana';
import { STRIDE, add, dot, mix, sub, unit } from '../mesh';
import type { Vec3 } from '../mesh';
import { JOINT as J, PARENT, axis, mul, turn as spin } from '../rig';
import type { Pose, Quat } from '../rig';

import { room } from '../verts';
import type { Out } from '../verts';
import { mesh } from '../store';
import type { Pieces } from '../store';
import { Y, Z, clamp, dist, inv } from './constants';
import type { Solved } from './types';

/** Draws `vertices` turned by `q` and moved to `at`: a store piece with `pieces`, else into `out`. */
export const placeRigid = (
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
export const along = (o: Vec3, d: Vec3, k: number): Vec3 => add(o, mix([0, 0, 0], d, k));

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
export const ik = (a: Vec3, b: Vec3, pole: Vec3, l1: number, l2: number): [Vec3, Vec3] => {
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
export const across = (v: Vec3, u: Vec3): Vec3 => along(v, u, -dot(v, u));
/** The twist of the turn `q` about the unit axis `b`, radians in [-PI, PI]. */
export const twist = (q: Quat, b: Vec3): number => {
  const t = 2 * Math.atan2(q[0] * b[0] + q[1] * b[1] + q[2] * b[2], q[3]);
  return t > Math.PI ? t - 2 * Math.PI : t < -Math.PI ? t + 2 * Math.PI : t;
};
/** The rotation `r` turned the shortest way so that its bone of rest offset `rest` lies along `d`. */
export const lay = (r: Quat, rest: Vec3, d: Vec3): Quat => mul(arc(spin(r, rest), d), r);

/** The share of the trunk's twist the hands go round with in the first person, on top of the view's SWAY. */
export const HANDS = 0.3;
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
export const outOf = (s: Solved, yaw: number, eye: Vec3, p: Vec3): number => {
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
export const REACH = 0.75;
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
export const CAPSULE_UP = 0.036;
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
export const [S0, C0] = [S, C];
