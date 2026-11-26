import { TAU } from '../../shared/physics';
import { add, mix, sub, unit } from '../mesh';
import type { Vec3 } from '../mesh';

import { MOUND_RINGS, cross } from './fingers';
import type { Ring } from './fingers';
import { palmAt, palmNormal } from './palm';
import type { Back, Row } from './palm';

/** The ring of the thumb its mound ends on (finger()): in the bend of its first joint, so the ball of the thumb and the skin to the palm cover its first bone. */
export const THENAR = 6;
/** How far the mound's foot is drawn out along the palm's edge toward the index, metres. */
export const WEB_REACH = 0.022;

/** What the thumb's mound is made from (mound()). */
export interface Mound {
  /** The thumb's rings as drawn (finger()). */
  rings: Ring[];
  /** The thumb's root in the hand. */
  tp: Vec3;
  /** The spread of its foot on the palm, times the thumb's root ring. */
  spread: number;
  /** The mound's height, metres. */
  swell: number;
  /** How spread the hand is, 0 to 1 (hand()'s `spread`). */
  wide: number;
  lite: boolean;
  /** The sides of the thumb. */
  sides: number;
  /** The palm's rows, the share of a man's flesh on it and what stands out of its back (palmSkin()). */
  palm: Row[];
  flesh: number;
  tendons?: Back;
}

/**
 * The thumb's mound, through `put`: from a footprint on the palm round the thumb's root, pushed out
 * onto the palm's surface, a skin swells into the thumb in the bend of its first joint (THENAR).
 */
export const mound = (
  put: (p: Vec3, n: Vec3) => void,
  {
    rings,
    tp,
    spread: SPREAD,
    swell: MOUND,
    wide,
    lite,
    sides: FS,
    palm: PALM,
    flesh: FLESH_K,
    tendons,
  }: Mound,
) => {
  const [, x1, y1] = rings[1];
  const [c2] = rings[THENAR];
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
  // A whole hand's mound is twice as fine round as its thumb, and in five steps: the ball of
  // the thumb is the largest round thing on a hand, and its facets showed (the user, 2026-11-26).
  const MS = lite ? FS : 2 * FS;
  /** How much of the skin to the palm each of the foot's vertices is, 0 to 1: those toward the fingers. */
  const webbed = Array.from({ length: MS }, (_, k) => {
    const a = (k * TAU) / MS;
    const z = x1[2] * Math.cos(a) + y1[2] * Math.sin(a);
    return Math.max(0, z / Math.hypot(x1[2], y1[2]));
  });
  const foot = Array.from({ length: MS }, (_, k): [Vec3, Vec3] => {
    const a = (k * TAU) / MS;
    // A spread thumb's foot is wider on the palm, for a gentler slope up to it.
    const q = [0, 1, 2].map(
      d => tp[d] + SPREAD * (1 + 0.35 * wide) * (x1[d] * Math.cos(a) + y1[d] * Math.sin(a)),
    ) as Vec3;
    // Its side toward the fingers drawn out along the palm's edge, toward the index's knuckle:
    // the skin between the thumb and the palm (the user, 2026-11-26: a more real hand).
    q[2] += WEB_REACH * webbed[k];
    const [yc, w, h] = section(q[2]);
    // Out from the palm's axis onto its surface.
    const e = Math.hypot(q[0] / w, (q[1] - yc) / h) || 1;
    const flat: Vec3 = [q[0] / e, yc + (q[1] - yc) / e, q[2]];
    if (lite) {
      return [flat, unit([flat[0] / (w * w), (flat[1] - yc) / (h * h), 0])];
    }
    // A whole hand's: onto the skin its palm has there, facing as that skin does, so the mound
    // leaves the palm with no line round its foot (the user, 2026-11-26).
    const round = Math.atan2((flat[1] - yc) / h, flat[0] / w);
    return [
      palmAt(PALM, round, q[2], FLESH_K, tendons),
      palmNormal(PALM, round, q[2], FLESH_K, tendons),
    ];
  });
  /** The thumb's ring the mound ends on, as its tube draws it: FS vertices. */
  const thumbRing = (ring: Ring) =>
    Array.from({ length: FS }, (_, k): Vec3 => {
      const a = (k * TAU) / FS;
      return [0, 1, 2].map(
        i => ring[0][i] + ring[1][i] * Math.cos(a) + ring[2][i] * Math.sin(a),
      ) as Vec3;
    });
  const [on2, on3] = [thumbRing(rings[THENAR]), thumbRing(rings[THENAR + 1])];
  // The normals the thumb's tube gives that ring (tube(): across it, along it to the next), so
  // no line shows round the thumb where the mound ends; a near hand's, out from its middle.
  const coarse = on2.map((p, k): [Vec3, Vec3] => [
    p,
    lite
      ? unit(sub(p, c2))
      : unit(cross(sub(on2[(k + 1) % FS], on2[(k + FS - 1) % FS]), sub(on3[k], p))),
  ]);
  // A finer mound's vertices between two of the thumb's lie on the edge that joins them: no lip.
  const top = Array.from({ length: MS }, (_, k): [Vec3, Vec3] => {
    const [i, odd] = [Math.floor((k * FS) / MS), MS > FS && k % 2];
    const [p, q] = [coarse[i], coarse[(i + 1) % FS]];
    return odd ? [mix(p[0], q[0], 0.5), unit(add(p[1], q[1]))] : p;
  });
  // Rings between, swollen: the mound, the ball of the thumb. Eased from the palm to the thumb
  // over MOUND_RINGS steps, its normals turning from the palm's to the thumb's, so no seam shows
  // where it meets either (the user, 2026-11-23).
  // Only a spread hand's (the disc's) takes the extra rings: the others keep the vertex budget.
  const steps = lite ? (wide > 0 ? MOUND_RINGS : 2) : 5;
  const rings2 = Array.from({ length: steps + 1 }, (_, j) => {
    const t = j / steps;
    const e = t * t * (3 - 2 * t);
    return foot.map(([q, n], k): [Vec3, Vec3] =>
      j === 0
        ? [q, n]
        : j === steps
          ? top[k]
          : [
              // The ball of the thumb swells; the skin to the palm is drawn tight.
              add(
                mix(q, top[k][0], e),
                n.map(c => c * MOUND * 1.3 * (1 - webbed[k]) * Math.sin(Math.PI * t) ** 2) as Vec3,
              ),
              unit(mix(n, top[k][1], e)),
            ],
    );
  });
  for (const [a, b] of rings2.slice(1).map((r, j) => [rings2[j], r])) {
    for (let k = 0; k < MS; k++) {
      const n = (k + 1) % MS;
      for (const [q, m] of [a[k], a[n], b[n], a[k], b[n], b[k]]) {
        put(q, m);
      }
    }
  }
};
