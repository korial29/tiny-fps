import type { V, Mat } from './types';
import { off, loft } from './common';

// The pilots' seats' backs (the user, 2026-11-27: rounder seats): one shell from the cushion to
// over the head, hollowed in front between two bolsters and round behind, narrowing at the
// neck into the headrest, its top rounded off. Its foot is hidden in the cushion: no cap there.

/** The back's half width at the height h over its foot, in metres: the shoulders, the neck, the headrest's round top. */
const half = (h: number) => {
  const neck = Math.min(Math.max((h - 0.6) / 0.18, 0), 1);
  const w = 0.26 - 0.09 * neck * neck * (3 - 2 * neck);
  const top = Math.max(h - 0.96, 0) / 0.16;
  return w * Math.sqrt(Math.max(1 - top * top, 0));
};

/** Heights of the shell's rings, closer together where the top rounds off. */
const RINGS = [0, 0.2, 0.4, 0.55, 0.66, 0.78, 0.9, 0.98, 1.04, 1.08, 1.11, 1.12];
/** Points across each face of a ring, -1 to 1. */
const ACROSS = [-1, -0.75, -0.4, 0, 0.4, 0.75, 1];

/**
 * The back at its foot `p`, its axes `bk` (ax[0] ahead, ax[1] up it, ax[2] across): the front in
 * `front`, the back and the sides in `rear`.
 */
export const back = (p: V, bk: V[], front: Mat, rear: Mat) => {
  const at = (f: number, h: number, z: number) => off(off(off(p, bk[0], f), bk[1], h), bk[2], z);
  // A ring: the front from one side to the other, then the rear back. The bolsters stand forward
  // at the sides; the rear bulges in the middle; the sides draw in a little behind.
  const ring = (h: number) => {
    const w = half(h);
    const thin = 1 - (0.5 * Math.max(h - 0.78, 0)) / 0.34;
    return [
      ...ACROSS.map(t => at(0.02 + 0.08 * t ** 4 * +(h < 0.7), h, w * t)),
      ...ACROSS.map(t => at(-0.11 * thin - 0.04 * (1 - t * t), h, -0.9 * w * t)),
    ];
  };
  const rings = RINGS.map(ring);
  const n = ACROSS.length;
  for (let i = 0; i < rings.length - 1; i++) {
    const c = at(-0.05, (RINGS[i] + RINGS[i + 1]) / 2, 0);
    const [a, b] = [rings[i], rings[i + 1]];
    loft([...a, a[0]], [...b, b[0]], j => (j < n - 1 ? front : rear), c);
  }
};
