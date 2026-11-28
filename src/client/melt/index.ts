// The marks of molten metal that a pistol's or a laser rifle's ball leaves where it bursts on the
// world (the user, 2026-11-28: laid on the surface like a bullet's, but burnt by a laser): a small
// ragged patch flat on the face it hit, bright yellow, cooling through orange to a dull red, then
// gone. Drawn with the glows, added to what is behind: it fades back to the surface's own colour.
import { ray } from '../../shared/world';
import type { World } from '../../shared/world';
import type { Vec3 } from '../mesh';
import type { Out } from '../verts';

/** Seconds a mark glows, marks kept at most, their radius (m) and the corners of their rim. */
export const MELT = 2.4;
export const MELTS = 80;
export const MELT_R = 0.03;
const RIM = 10;
/** How far a mark sits off its face, so that it does not flicker into it. */
const LIFT = 0.006;
/** Bright yellow through orange to a dull red as it cools. */
const HEAT = [
  [3.2, 2.6, 0.45],
  [3, 1.7, 0.2],
  [2.4, 0.85, 0.08],
  [0.9, 0.16, 0.02],
  [0.25, 0.03, 0.01],
];

/**
 * A mark: on its face at `p`, `age` seconds old; `rim` holds its ragged rim's corners as offsets
 * from `p` in metres per metre of radius, x, y, z for each, worked out once when it is made.
 */
export interface Melt {
  p: Vec3;
  age: number;
  rim: number[];
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3, k = 1): Vec3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
/** Two unit axes across `n`. */
const across = (n: Vec3): [Vec3, Vec3] => {
  const s = norm(cross(n, Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
  return [s, cross(n, s)];
};

/**
 * The face a ball burst on: `at` is the ball's centre as it stopped (PLASMA_R off the face, or on
 * a body), `d` the unit way it flew. A thin ray from just behind it finds the face; two more beside
 * it give the face's slope. Nothing when no face is within reach: the ball burst on a body or in
 * the air at the end of its range.
 */
export const surface = (world: World, at: Vec3, way: Vec3): { p: Vec3; n: Vec3 } | undefined => {
  const [BACK, REACH, SIDE] = [0.1, 0.45, 0.02];
  // Another's ball seen in one snapshot only has no way yet.
  if (Math.hypot(...way) < 1e-3) {
    return undefined;
  }
  const d = norm(way);
  const o = add(at, d, -BACK);
  const hit = (from: Vec3) => {
    const t = ray(world, from, d, REACH);
    return t < REACH ? add(from, d, t) : undefined;
  };
  const p = hit(o);
  if (!p) {
    return undefined;
  }
  const [s, u] = across(d);
  const a = hit(add(o, s, SIDE));
  const b = hit(add(o, u, SIDE));
  let n = a && b ? norm(cross(sub(a, p), sub(b, p))) : ([-d[0], -d[1], -d[2]] as Vec3);
  if (dot(n, d) > 0) {
    n = [-n[0], -n[1], -n[2]];
  }
  return { p, n };
};

/** A new mark at `p` facing `n`, its rim ragged by `rnd` (a number in [-1, 1)). */
export const melt = (p: Vec3, n: Vec3, rnd: () => number): Melt => {
  const [s, u] = across(n);
  const rim: number[] = [];
  for (let i = 0; i < RIM; i++) {
    const a = (i * 2 * Math.PI) / RIM;
    const k = 0.75 + 0.3 * rnd();
    for (let j = 0; j < 3; j++) {
      rim.push((s[j] * Math.cos(a) + u[j] * Math.sin(a)) * k);
    }
  }
  return { p: add(p, n, LIFT), age: 0, rim };
};

/** The colour of HEAT `t` of the way (0 to 1) along it. */
export const heat = (t: number) => {
  const x = Math.min(Math.max(t, 0), 1) * (HEAT.length - 1);
  const i = Math.min(Math.floor(x), HEAT.length - 2);
  return HEAT[i].map((c, j) => c + (HEAT[i + 1][j] - c) * (x - i));
};

/**
 * Appends a mark as triangles in the glows' layout (position, an up normal, then red, green, -2
 * for unlit and blue, as beams' vert()): a ragged patch flat on its face that shrinks a little as it
 * cools, and while still hot a faint wider halo of glowing metal round it. Pushed number by number:
 * a rifle's burst of fire leaves fifty of these at once.
 */
export const drawMelt = (out: Out, { p, age, rim }: Melt) => {
  const t = age / MELT;
  const patch = (r: number, [cr, cg, cb]: number[]) => {
    for (let i = 0; i < RIM; i++) {
      const [a, b] = [i * 3, ((i + 1) % RIM) * 3];
      out.push(p[0], p[1], p[2], 0, 1, 0, cr, cg, -2, cb);
      out.push(
        p[0] + rim[a] * r,
        p[1] + rim[a + 1] * r,
        p[2] + rim[a + 2] * r,
        0,
        1,
        0,
        cr,
        cg,
        -2,
        cb,
      );
      out.push(
        p[0] + rim[b] * r,
        p[1] + rim[b + 1] * r,
        p[2] + rim[b + 2] * r,
        0,
        1,
        0,
        cr,
        cg,
        -2,
        cb,
      );
    }
  };
  patch(MELT_R * (1 - 0.35 * t ** 2), heat(t ** 0.7));
  if (t < 0.4) {
    const g = 1 - t / 0.4;
    patch(
      MELT_R * (1.4 + 0.6 * g),
      heat(0.4).map(c => c * 0.22 * g),
    );
  }
};
