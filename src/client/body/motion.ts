import { GLORY_TICKS, STEP_H } from '../../shared/constants';
import { TAU } from '../../shared/physics';
import { MODE } from '../../shared/types';
import type { PlayerState } from '../../shared/types';
import { ray } from '../../shared/world';
import type { World } from '../../shared/world';
import type { Floor } from '../gait';
import type { Vec3 } from '../mesh';

/** The floor under a player standing at height `y`: the first top within a step above or below it. */
export const floorOf =
  (world: World, y: number): Floor =>
  (x, z) => {
    const d = ray(world, [x, y + STEP_H, z], [0, -1, 0], 2 * STEP_H);
    return d > 0 && d < 2 * STEP_H ? y + STEP_H - d : y;
  };

/** On a wall run the rail gun is put away, unless its bolt is going out; a swimmer's hands are free. */
export const stowed = (p: PlayerState): boolean =>
  (p.mode == MODE.WALLRUN && !p.zapping) || p.mode == MODE.SWIM;

/**
 * A swimmer's right hand in the view (camera space, mirrored for the left) at six evenly spaced
 * keys of gait.ts's STROKE: reaching ahead, swept wide and down, joined under the chin, then
 * shot out ahead and straight into the next pull.
 */
const PULL: Vec3[] = [
  [0.1, -0.1, 0.76],
  [0.42, -0.26, 0.5],
  [0.48, -0.33, 0.34],
  [0.1, -0.28, 0.3],
  [0.1, -0.16, 0.52],
  [0.1, -0.11, 0.7],
];
/** How flat the hand lies (0 open, 1 a fist) and how far it rolls about the forearm (radians, added to the palm down), at the same keys: joined and flat, cupped through the pull, joined again under the chin. */
export const CURLS = [0.05, 0.3, 0.42, 0.05, 0.05, 0.08];
export const ROLLS = [-0.9, -0.2, 0.3, -0.9, -0.9, -0.9];
/** A closed Catmull-Rom curve through `keys` at phase `u`: it never stops at a key. */
export const loop = (keys: number[], u: number): number => {
  const n = keys.length;
  const x = u * n;
  const i = Math.floor(x) % n;
  const t = x - Math.floor(x);
  const [k0, k1, k2, k3] = [-1, 0, 1, 2].map(d => keys[(i + d + n) % n]);
  return (
    0.5 *
    (2 * k1 +
      (k2 - k0) * t +
      (2 * k0 - 5 * k1 + 4 * k2 - k3) * t * t +
      (3 * k1 - k0 - 3 * k2 + k3) * t * t * t)
  );
};
/** The hand at phase `u` along PULL; `m` of the way from treading water (each hand sculling in turn) to it. */
export const strokeHand = (u: number, sd: number, m: number): Vec3 => {
  const o = sd > 0 ? 0 : 0.5;
  const tread: Vec3 = [
    0.22 + 0.08 * Math.sin(TAU * (u + o)),
    -0.28 + 0.06 * Math.cos(TAU * (u + o)),
    0.45 + 0.1 * Math.sin(TAU * (u + o + 0.25)),
  ];
  return tread.map(
    (v, j) =>
      v +
      (loop(
        PULL.map(k => k[j]),
        u,
      ) -
        v) *
        m,
  ) as Vec3;
};

/** The blends the animation eases, each toward 0 or 1, and how fast (1 / s). */
export const RATES = {
  amp: 8,
  sprint: 6,
  air: 12,
  rise: 10,
  dash: 14,
  plant: 16,
  wall: 10,
  slide: 10,
  stun: 14,
  gun: 10,
  blade: 10,
  feast: 12,
  swim: 8,
};

/**
 * Ticks into a glory kill where the head starts back, where it strikes and where the strike is home:
 * GLORY_TICKS takes his head 0.1 s later (the user, 2026-11-16: the head went too long after).
 */
export const BITE = [46, 104, 114];

/**
 * The bite of a glory kill (the user, 2026-11-16, after DOOM 2016) at `lock` ticks left of its
 * GLORY_TICKS: once on him (feast.ts) the head drawn slowly back as the claws hold the prey, then
 * driven down into him; the neck's turn for menace().
 */
export const devour = (lock: number): number => {
  const e = GLORY_TICKS - lock;
  const k = (a: number, b: number) => Math.min(Math.max((e - a) / (b - a), 0), 1);
  const back = k(BITE[0], BITE[1]);
  return -0.5 * back * back * (3 - 2 * back) + 1.2 * k(BITE[1], BITE[2]);
};
