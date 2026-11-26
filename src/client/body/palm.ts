import { TAU } from '../../shared/physics';
import { sub, unit } from '../mesh';
import type { Vec3 } from '../mesh';

import { cross } from './fingers';

/** A ring of the palm: how far along the hand it is, its middle's height, its half width and its half height. */
export type Row = number[];

/** The rings a whole hand's palm is drawn in, from the cuff to where the weld to the fingers starts. */
export const PALM_RINGS = 8;
/** Where a whole hand's palm ends and its weld starts, metres along the hand: 14 mm short of the knuckles. */
export const PALM_END = 0.078;

const bell = (x: number, at: number, wide: number) => Math.exp(-0.5 * ((x - at) / wide) ** 2);
/** An angle's distance to another, radians, the short way round. */
const turn = (a: number, b: number) => Math.abs(((a - b + Math.PI * 3) % TAU) - Math.PI);

/**
 * What a man's palm has that a tube has not (the user, 2026-11-26: a more real hand), metres out of
 * its ring at the angle `a` round it (0 toward the thumb, a quarter turn the back) and `u` of the
 * way from the cuff to PALM_END: the pad along its little finger's edge, the hollow in its middle
 * and the pads under the knuckles. None at the cuff nor at the weld, which meet plain rings, and
 * none on the back, where the glove's plate lies.
 */
export const relief = (a: number, u: number) => {
  const edge = Math.min(1, u / 0.2) * Math.min(1, (1 - u) / 0.12);
  const ease = edge * edge * (3 - 2 * edge);
  return (
    ease *
    (0.004 * bell(turn(a, 3.75), 0, 0.55) * bell(u, 0.4, 0.3) -
      0.003 * bell(turn(a, 4.6), 0, 0.4) * bell(u, 0.62, 0.22) +
      0.0016 * bell(turn(a, 4.5), 0, 0.9) * bell(u, 0.95, 0.12))
  );
};

/** The row of the piecewise palm `keys` at `z` along the hand. */
export const rowAt = (keys: Row[], z: number): Row => {
  const k = Math.min(
    Math.max(
      keys.findIndex(r => r[0] > z),
      1,
    ),
    keys.length - 1,
  );
  const [a, b] = [keys[k - 1], keys[k]];
  const f = Math.min(Math.max((z - a[0]) / (b[0] - a[0]), 0), 1);
  return a.map((v, i) => v + (b[i] - v) * f);
};

/** A point of the palm's skin at the angle `a` round the row `[z, y, w, h]`, `out` off its ring. */
export const onPalm = ([z, y, w, h]: Row, a: number, out: number): Vec3 => {
  const [c, s] = [Math.cos(a), Math.sin(a)];
  const n = unit([c / w, s / h, 0]);
  return [w * c + n[0] * out, y + h * s + n[1] * out, z];
};

/** What stands out of the back of a hand at x across it and z along it, metres: a bare hand's tendons. */
export type Back = (x: number, z: number) => number;

/**
 * A point of a whole hand's palm at the angle `a` round it and `z` along it: on the rows between
 * `keys`, with relief() on it times `flesh` and, on its back, `back`, which fades out down the
 * sides of the hand and at the cuff.
 */
export const palmAt = (keys: Row[], a: number, z: number, flesh = 1, back?: Back): Vec3 => {
  const z0 = keys[0][0];
  const u = Math.min(Math.max((z - z0) / (PALM_END - z0), 0), 1);
  const row = rowAt(keys, z);
  const ridge = back
    ? Math.max(0, Math.sin(a)) * Math.min(1, u / 0.25) * back(onPalm(row, a, 0)[0], z)
    : 0;
  return onPalm(row, a, flesh * relief(a, u) + ridge);
};

/** The way the palm's skin faces at that point (palmAt()): what lies on it takes the light as it does. */
export const palmNormal = (keys: Row[], a: number, z: number, flesh = 1, back?: Back): Vec3 => {
  const at = (da: number, dz: number) => palmAt(keys, a + da, z + dz, flesh, back);
  const n = unit(cross(sub(at(0.03, 0), at(-0.03, 0)), sub(at(0, 0.0015), at(0, -0.0015))));
  // Outward: the way the ring's own normal goes.
  const out = Math.cos(a) * n[0] + Math.sin(a) * n[1];
  return out < 0 ? (n.map(v => -v) as Vec3) : n;
};

/**
 * A whole hand's palm: PALM_RINGS rings from the first of `keys`, the cuff's, to PALM_END, each on
 * the rows between `keys` with relief() on it times `flesh`. The first ring is the cuff's, `sides`
 * round. With `back` (what stands out of the back of the hand at x across and z along: a bare
 * hand's tendons) the rings past it are twice as fine, each of the cuff's sides opening in two.
 * Its normals are smooth as a tube's (tube()), the first ring's leaning `lean` along the hand to
 * meet the cuff. Gives back its last ring, vertices and normals: the weld starts on it.
 */
export const palmSkin = (
  keys: Row[],
  sides: number,
  put: (p: Vec3, n: Vec3, r: number) => void,
  lean: number,
  flesh = 1,
  back?: Back,
): [Vec3, Vec3][] => {
  const z0 = keys[0][0];
  const fine = back ? 2 : 1;
  const P = Array.from({ length: PALM_RINGS }, (_, r) => {
    const u = r / (PALM_RINGS - 1);
    const n = r ? sides * fine : sides;
    return Array.from({ length: n }, (_, i) =>
      palmAt(keys, (i * TAU) / n, z0 + (PALM_END - z0) * u, flesh, back),
    );
  });
  const at = (G: Vec3[][], r: number, i: number) => {
    const row = G[Math.min(Math.max(r, 0), G.length - 1)];
    return row[(i + row.length) % row.length];
  };
  const N = P.map((row, r) =>
    row.map((_, i): Vec3 => {
      if (!r) {
        const a = (i * TAU) / sides;
        return unit([Math.cos(a), Math.sin(a), lean]);
      }
      // Along the hand from the ring before, the second ring from itself: the cuff's is coarser.
      return unit(
        cross(
          sub(at(P, r, i + 1), at(P, r, i - 1)),
          sub(at(P, r + 1, i), at(P, Math.max(r - 1, fine > 1 ? 1 : 0), i)),
        ),
      );
    }),
  );
  const tri = (...v: [number, number][]) => {
    for (const [j, k] of v) {
      put(at(P, j, k), at(N, j, k), j);
    }
  };
  for (let r = 1; r < P.length; r++) {
    for (let i = 0; i < P[r - 1].length; i++) {
      if (P[r].length > P[r - 1].length) {
        // The cuff's side opens in two.
        tri([0, i], [0, i + 1], [1, 2 * i + 1]);
        tri([0, i], [1, 2 * i + 1], [1, 2 * i]);
        tri([0, i + 1], [1, 2 * i + 2], [1, 2 * i + 1]);
      } else {
        tri([r - 1, i], [r - 1, i + 1], [r, i + 1]);
        tri([r - 1, i], [r, i + 1], [r, i]);
      }
    }
  }
  const last = P.length - 1;
  return P[last].map((p, i) => [p, N[last][i]]);
};
