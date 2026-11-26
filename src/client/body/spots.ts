import { add, mix, unit } from '../mesh';
import type { Vec3 } from '../mesh';

import { cross } from './fingers';
import type { Ring } from './fingers';

/** A point of a hand's skin and the way it faces. */
type On = [Vec3, Vec3];

/**
 * The Hunter's hand's spots (the user, 2026-11-26: small spots, symmetric, along the hand's edges):
 * how many pairs on the back of the hand and on each finger, their radius (the least, and what the
 * largest adds, metres) there and there, and how far they lie over the skin.
 */
/** Their green: his body's spots' (HIDE_SPOT), lighter (the user, 2026-11-27), on the hand's lighter skin. */
export const HAND_SPOT: number[] = [0.17, 0.3, 0.15];
export const HAND_SPOTS = {
  back: 26,
  finger: 5,
  size: [0.0011, 0.0019],
  small: [0.0007, 0.0009],
  over: 0.00025,
};

/**
 * The Hunter's hide goes on over his hands: dark spots as his body's (spots() in hunter/marine.ts),
 * each a flat hexagon laid a hair over the skin. They keep to the hand's edges, thick along them
 * and thinning toward the middle of its back, and along the two sides of each finger's back; each
 * has its twin across the middle of the hand, or of its finger. `palm(a, z)` is the skin of the
 * palm at the angle `a` round it and `z` along it, between `z0` and `z1`; `fingers` their rings as
 * drawn. A fixed sequence places them: the same spots at every build, on both hands.
 */
export const handSpots = (
  palm: (a: number, z: number) => On,
  [z0, z1]: number[],
  fingers: Ring[][],
  put: (p: Vec3, n: Vec3) => void,
) => {
  // mulberry32, as the body's spots.
  let seed = 0x51f0a7d;
  const random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  /** A hexagon of `radius` on the skin at `at`, turned `spin`: four triangles from one corner. */
  const spot = ([at, n]: On, radius: number, spin: number) => {
    const side = unit(Math.abs(n[2]) < 0.9 ? cross(n, [0, 0, 1]) : cross(n, [1, 0, 0]));
    const up = cross(n, side);
    const corner = (i: number): Vec3 => {
      const turn = spin + (Math.PI * i) / 3;
      const [x, y] = [radius * Math.cos(turn), radius * Math.sin(turn)];
      return [0, 1, 2].map(k => at[k] + HAND_SPOTS.over * n[k] + x * side[k] + y * up[k]) as Vec3;
    };
    for (let i = 1; i < 5; i++) {
      for (const p of [corner(0), corner(i), corner(i + 1)]) {
        put(p, n);
      }
    }
  };
  const [least, more] = HAND_SPOTS.size;
  for (let i = 0; i < HAND_SPOTS.back; i++) {
    // From the hand's edge up onto its back, most of them near the edge; larger there too.
    const t = random() ** 1.7;
    const a = 0.3 + 1.05 * t;
    // One to each slice of the hand's length, so they spread from the wrist to the knuckles.
    const z = z0 + (z1 - z0) * (0.14 + (0.84 * (i + random())) / HAND_SPOTS.back);
    const radius = least + more * random() ** 2 * (1 - 0.6 * t);
    const spin = random() * Math.PI;
    spot(palm(a, z), radius, spin);
    spot(palm(Math.PI - a, z), radius, -spin);
  }
  const [fine, grow] = HAND_SPOTS.small;
  /** The skin of a finger between its rings `r` and `r + 1`, `f` of the way, at the angle `a` round it. */
  const onFinger = (F: Ring[], r: number, f: number, a: number): On => {
    const at = ([c, x, y]: Ring): On => {
      const d = [0, 1, 2].map(k => x[k] * Math.cos(a) + y[k] * Math.sin(a)) as Vec3;
      return [add(c, d), unit(d)];
    };
    const [p, q] = [at(F[r]), at(F[r + 1])];
    return [mix(p[0], q[0], f), unit(mix(p[1], q[1], f))];
  };
  for (const F of fingers) {
    for (let i = 0; i < HAND_SPOTS.finger; i++) {
      // Along its first two phalanges (finger(): the rings past the web, short of the last joint),
      // on the two sides of its back.
      const r = 4 + Math.floor(random() * 7);
      const a = 0.35 + 0.6 * random();
      const [f, radius, spin] = [random(), fine + grow * random(), random() * Math.PI];
      spot(onFinger(F, r, f, a), radius, spin);
      spot(onFinger(F, r, f, Math.PI - a), radius, -spin);
    }
  }
};
