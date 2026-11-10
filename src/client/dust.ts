// The regolith a rover's wheels throw up: puffs of smoke (layer -3: see-through, casting nothing)
// from each tyre on the ground while the rover goes fast or slides. No air on the moon: a puff
// flies the arc it was thrown on, under the world's gravity, and is gone where it comes down; it
// does not billow or hang. No DOM.
import { forward, gravity } from '../shared/physics';
import type { Rover } from '../shared/types';
import type { World } from '../shared/world';
import { dress, place, smooth } from './mesh';
import type { Vec3 } from './mesh';
import { contacts, springs } from './rover';

/** Metres a second along the ground from which the wheels raise dust, and across the nose (a slide) from which they do at any speed. */
export const DUST_SPEED = 6;
export const DUST_SLIP = 2.5;
/** Puffs a second a wheel throws at DUST_SPEED (more with speed, twice as many at most), puffs alive at most, and seconds one lasts at most. */
export const DUST_RATE = 28;
export const DUST_MAX = 240;
export const DUST_LIFE = 1.6;
/** Metres from the eye past which no dust is raised: it is too small to see. */
export const DUST_FAR = 120;

/** A ball of radius 1, built once: grey smoke, its opacity in green (see FRAG in render.ts). */
const PUFF = dress(
  smooth(
    [
      [0, -1],
      [0.8, -0.55],
      [0.8, 0.55],
      [0, 1],
    ],
    6,
  ),
  [0.4, 0.42, 0.41],
);
for (let i = 8; i < PUFF.length; i += 10) {
  PUFF[i] = -3;
}
const WORLD: Vec3[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

/** A puff: where it is, its speed, its age and the height it is gone under. */
type Puff = [
  x: number,
  y: number,
  z: number,
  vx: number,
  vy: number,
  vz: number,
  t: number,
  floor: number,
];

export interface Dust {
  /** Moves the puffs by dt seconds, then lets the rovers' wheels throw new ones. */
  update(rovers: Rover[], world: World, dt: number, eye?: Vec3): void;
  /** Appends the puffs: each swells and thins as it flies. */
  draw(out: number[]): void;
  /** Puffs in flight. */
  readonly count: number;
}

/** The wheels of `r` that raise dust (in the order of the model's wheels): on the ground, the rover fast or sliding. */
export const raising = (r: Rover, w: World): boolean[] => {
  const [fx, fz] = forward(r.yaw);
  const fast = Math.hypot(r.vx, r.vz) >= DUST_SPEED || Math.abs(r.vz * fx - r.vx * fz) >= DUST_SLIP;
  return springs(r, w).map(c => fast && c > 0);
};

export const createDust = (): Dust => {
  const puffs: Puff[] = [];
  /** What each wheel of each rover owes: a puff when it passes 1. */
  const owed: number[] = [];
  let seed = 1;
  /** In [0, 1): the same run every time. */
  const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  return {
    update(rovers, world, dt, eye) {
      const g = gravity(world);
      for (let i = puffs.length - 1; i >= 0; i--) {
        const p = puffs[i];
        p[4] -= g * dt;
        p[0] += p[3] * dt;
        p[1] += p[4] * dt;
        p[2] += p[5] * dt;
        p[6] += dt;
        if (p[6] > DUST_LIFE || p[1] < p[7]) {
          puffs.splice(i, 1);
        }
      }
      rovers.forEach((r, n) => {
        if (eye && Math.hypot(r.x - eye[0], r.z - eye[2]) > DUST_FAR) {
          return;
        }
        const on = raising(r, world);
        if (!on.some(Boolean)) {
          return;
        }
        const v = Math.hypot(r.vx, r.vz);
        const at = contacts(r, world);
        on.forEach((up, k) => {
          const slot = n * 4 + k;
          owed[slot] = up ? (owed[slot] ?? 0) + DUST_RATE * Math.min(v / DUST_SPEED, 2) * dt : 0;
          while (owed[slot] >= 1 && up) {
            owed[slot]--;
            if (puffs.length >= DUST_MAX) {
              puffs.shift();
            }
            // Thrown up and back off the tyre, a little to the sides: a share of the rover's speed is left in it.
            const [a, s] = [rnd() * 6.283, 0.2 + 1.3 * rnd()];
            puffs.push([
              at[k][0],
              at[k][1] + 0.1,
              at[k][2],
              r.vx * 0.35 + Math.cos(a) * s,
              0.6 + 2 * rnd() + 0.04 * v,
              r.vz * 0.35 + Math.sin(a) * s,
              0,
              at[k][1] - 0.2,
            ]);
          }
        });
      });
    },
    draw(out) {
      for (const [x, y, z, , , , t] of puffs) {
        const k = t / DUST_LIFE;
        place(out, PUFF, [x, y, z], WORLD, [0, 0, 0], 0.14 + 0.42 * k, [1, 1 - k * k, 1]);
      }
    },
    get count() {
      return puffs.length;
    },
  };
};
