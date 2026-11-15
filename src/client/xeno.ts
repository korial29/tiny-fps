// The xenomorph's own pieces (ROLE.XENO, the user 2026-11-15), round the skin of skin.ts's beast():
// its tail, the spines on its back and the glowing slits of its eyes (its claws are hand()'s, body.ts). All
// of it generated, original: a lean biomechanical stalker, not a copy of any film's creature.
import { TAU } from '../shared/physics';
import { cross, sheet } from './helmet';
import type { Spot } from './helmet';
import { unit } from './mesh';
import type { Vec3 } from './mesh';
import { turn } from './rig';
import type { Quat } from './rig';
import type { Out } from './verts';

/** Its chitin: a near black with a cold sheen. */
export const CHITIN_X = [0.045, 0.05, 0.06];

/** Metres: the tail's length, its root's radius and its tip's, the stinger's length. */
export const TAIL = { len: 1.45, root: 0.06, tip: 0.012, sting: 0.17 };

/** A point of a piece in the frame (at, q) of its joint. */
const on = (at: Vec3, q: Quat, v: Vec3): Vec3 => {
  const w = turn(q, v);
  return [at[0] + w[0], at[1] + w[1], at[2] + w[2]];
};

/** A ring of `n` spots round `c` square to the unit `tan`, `side` steadying it, of radius `r`. */
const ring = (c: Vec3, tan: Vec3, side: Vec3, r: number, n: number): Spot[] => {
  const a = unit(cross(tan, side));
  const b = cross(a, tan);
  return Array.from({ length: n }, (_, i) => {
    const [cs, sn] = [Math.cos((i / n) * TAU), Math.sin((i / n) * TAU)];
    const m: Vec3 = [a[0] * cs + b[0] * sn, a[1] * cs + b[1] * sn, a[2] * cs + b[2] * sn];
    return [[c[0] + m[0] * r, c[1] + m[1] * r, c[2] + m[2] * r], m];
  });
};

/** A cone from `base` along `dir` (a unit vector) `len` long, `r` wide at its base, in the joint's frame. */
const cone = (
  out: Out,
  at: Vec3,
  q: Quat,
  base: Vec3,
  dir: Vec3,
  len: number,
  r: number,
  n: number,
  col: number[],
  layer = -1,
) => {
  const d = unit(turn(q, dir));
  const b = on(at, q, base);
  const tip: Vec3 = [b[0] + d[0] * len, b[1] + d[1] * len, b[2] + d[2] * len];
  const side = turn(q, [1, 0, 0]);
  sheet([[[b, d.map(v => -v) as Vec3]], ring(b, d, side, r, n), [[tip, d]]], col, layer, out);
};

/**
 * The tail, in the world, from the pelvis joint (at, q): a chain bending from down and back up to
 * its tip, swaying with the clock `t` and more with the speed `run` (0 to 1), ribbed close. `sting`
 * (0 to 1) arches it up over the back and forward past the head: the tail's strike. The stinger at
 * its tip glows in the team's `color`. `lod` 0 far, 1 near, 2 close.
 */
export const tail = (
  out: Out,
  at: Vec3,
  q: Quat,
  t: number,
  run: number,
  sting: number,
  color: number[],
  lod: number,
) => {
  const [steps, sides] = [
    [7, 12, 22],
    [4, 6, 9],
  ].map(l => l[Math.min(lod, 2)]);
  const side = turn(q, [1, 0, 0]);
  const rows: Spot[][] = [];
  // Its angle in the pelvis' plane (0 back, up from there) along it, its place and its way.
  let p: Vec3 = [0, -0.06, 0.1];
  let way: Vec3 = [0, 0, 1];
  const step = TAIL.len / steps;
  for (let k = 0; k <= steps; k++) {
    const s = k / steps;
    const lift = -0.55 + 1.15 * s + 0.25 * run;
    const a = lift + (s * Math.PI * 1.08 - lift) * sting;
    const sway = (1 - sting) * (0.35 + 0.4 * run) * s * Math.sin(t * (1.6 + 2.4 * run) - s * 3.5);
    way = unit([Math.sin(sway), Math.sin(a), Math.cos(a) * Math.cos(sway)]);
    if (k) {
      p = [p[0] + way[0] * step, p[1] + way[1] * step, p[2] + way[2] * step];
    }
    const ribs = lod > 1 ? 1 + 0.14 * Math.cos(s * TAU * 9) ** 8 : 1;
    const r = (TAIL.tip + (TAIL.root - TAIL.tip) * (1 - s) ** 1.3) * ribs;
    rows.push(ring(on(at, q, p), unit(turn(q, way)), side, r, sides));
  }
  const root = on(at, q, [0, -0.06, 0.1]);
  sheet([[[root, unit(turn(q, [0, 0, -1]))]], ...rows], CHITIN_X, -1, out);
  // The stinger: a blade swelling to a barb, then a point, glowing.
  const w = unit(turn(q, way));
  const tip = on(at, q, p);
  const pt = (k: number): Vec3 => [tip[0] + w[0] * k, tip[1] + w[1] * k, tip[2] + w[2] * k];
  sheet(
    [
      ring(tip, w, side, TAIL.tip, sides),
      ring(pt(TAIL.sting * 0.35), w, side, 0.03, sides),
      [[pt(TAIL.sting), w]],
    ],
    color,
    -2,
    out,
  );
};

/**
 * The spines on its back, on the chest joint: three pairs of curved horns from between the shoulder
 * blades, swept back and out, the upper ones the longest.
 */
export const spines = (out: Out, at: Vec3, q: Quat, lod: number) => {
  const n = lod ? 6 : 4;
  for (const [y, len] of [
    [0.2, 0.2],
    [0.12, 0.16],
    [0.03, 0.11],
  ]) {
    for (const s of [-1, 1]) {
      cone(out, at, q, [s * 0.06, y, 0.09], [s * 0.3, 0.45, 1], len, 0.024, n, CHITIN_X);
    }
  }
};

/** The slits of its eyes on the head joint: a pair of thin glowing blades along the skull's sides, in the team's `color`. */
export const eyes = (out: Out, at: Vec3, q: Quat, color: number[]) => {
  for (const s of [-1, 1]) {
    cone(out, at, q, [s * 0.062, 0.05, -0.12], [s * 0.25, 0.18, 1], 0.11, 0.009, 4, color, -2);
  }
};
