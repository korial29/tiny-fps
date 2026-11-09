// The spent batteries, cells and capsules thrown out of a swap (the user, 2026-11-09: let the
// battery fall to the floor): free bodies that fall, spin, bounce on the floor under the player,
// lie down there and are gone after a few seconds. Drawn only; the physics of the game never sees them.
import { add, place, unit } from './mesh';
import type { Vec3 } from './mesh';

/** Seconds a drop lies about, and the last of them it shrinks away in. */
export const [LIFE, GONE] = [3, 0.3];
/** A drop's half length and radius, metres: the battery's (the others are near it). */
const [HALF, R] = [0.046, 0.018];

interface Drop {
  /** Its model, its middle and its axes (right, up, along it), its speed, its spin (radians a second about each world axis). */
  model: number[];
  c: Vec3;
  ax: Vec3[];
  v: Vec3;
  w: Vec3;
  floor: number;
  age: number;
}
const list: Drop[] = [];

/** `v` turned by the rotation vector `w` (its length the angle, radians). */
const turn = (v: Vec3, w: Vec3): Vec3 => {
  const t = Math.hypot(...w);
  if (t < 1e-9) {
    return v;
  }
  const k = w.map(x => x / t) as Vec3;
  const [c, s] = [Math.cos(t), Math.sin(t)];
  const d = k[0] * v[0] + k[1] * v[1] + k[2] * v[2];
  const x: Vec3 = [k[1] * v[2] - k[2] * v[1], k[2] * v[0] - k[0] * v[2], k[0] * v[1] - k[1] * v[0]];
  return [0, 1, 2].map(i => v[i] * c + x[i] * s + k[i] * d * (1 - c)) as Vec3;
};

/** Throws out `model`, its foot at `foot` with axes `ax` (as place() takes them), at speed `v` spinning by `w`, to fall to `floor`. */
export const drop = (model: number[], foot: Vec3, ax: Vec3[], v: Vec3, w: Vec3, floor: number) =>
  list.push({ model, c: add(foot, ax[2].map(x => x * HALF) as Vec3), ax, v, w, floor, age: 0 });

/** How many drops there are. */
export const drops = () => list.length;

/** Moves the drops on by `dt` seconds: falling, spinning, bouncing and settling on their floor. */
export const fall = (dt: number) => {
  for (let i = list.length; i--;) {
    const d = list[i];
    if ((d.age += dt) > LIFE) {
      list.splice(i, 1);
      continue;
    }
    d.v[1] -= 9.8 * dt;
    d.c = add(d.c, d.v.map(x => x * dt) as Vec3);
    d.ax = d.ax.map(a => unit(turn(a, d.w.map(x => x * dt) as Vec3)));
    // On the floor: a bounce that loses most of the speed, the spin damped, and the body laid
    // on its side, its length level (a lying cylinder's lowest point is its radius under the middle).
    const low = R + Math.abs(d.ax[2][1]) * (HALF - R);
    if (d.c[1] - low < d.floor) {
      d.c[1] = d.floor + low;
      if (d.v[1] < 0) {
        d.v = [d.v[0] * 0.6, -d.v[1] * (d.v[1] < -0.6 ? 0.35 : 0), d.v[2] * 0.6];
        d.w = d.w.map(x => x * 0.5) as Vec3;
      }
      const f = d.ax[2];
      const tip: Vec3 = [f[2], 0, -f[0]];
      // Rolling on the floor: slowed, its spin damped, tipped over onto its side.
      const k = Math.max(0, 1 - 6 * dt);
      [d.v[0], d.v[2]] = [d.v[0] * k, d.v[2] * k];
      d.w = add(
        d.w.map(x => x * Math.max(0, 1 - 4 * dt)) as Vec3,
        tip.map(x => x * f[1] * 30 * dt) as Vec3,
      );
    }
  }
};

/** Appends the drops, each shrinking away in its last GONE seconds. */
export const drawDrops = (out: number[]) => {
  for (const d of list) {
    const k = Math.min(1, (LIFE - d.age) / GONE);
    place(out, d.model, add(d.c, d.ax[2].map(x => -x * HALF * k) as Vec3), d.ax, [0, 0, 0], k);
  }
};

/** Forgets every drop (a new world). */
export const clearDrops = () => (list.length = 0);
