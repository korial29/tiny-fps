// The things lying on the roofs: a team's gun rack (a stand in its colour with a gun turning over
// it) and the health packs (a white box with a glowing green cross, bobbing). Pure functions of the
// place and the clock, in the renderer's vertex format. Lit and shadowed, but the glow parts.
import { RACK_R } from '../shared/constants';
import { GLOW, glow, ring, tri } from './flag';
import { gun } from './gun';
import { STRIDE, basis, place, segment, solid } from './mesh';
import type { Vec3 } from './mesh';

/** The health packs of `all` whose bit is set in `mask`, if any: the ones that are there to take. */
export const packsOf = (all: readonly Vec3[] = [], mask = 0): Vec3[] =>
  all.filter((_, n) => (mask >>> n) & 1);

/** A rack at `at` (a point on a top): a post and a dish, a ring on the roof of the radius that gives the gun, the gun over it. */
export const rack = (out: number[], at: Vec3, rgb: number[], t: number) => {
  const dark = rgb.map(c => c * 0.45);
  segment(
    out,
    solid(1, 1, [1, 1], [0, 0]),
    at,
    [at[0], at[1] + 0.72, at[2]],
    [1, 0, 0],
    1,
    0.06,
    dark,
  );
  const [x, y, z] = at;
  place(out, solid(1, 0, [1, 1]), [x, y + 0.74, z], basis(0, 0), [0, 0, 0], [0.3, 0.035, 0.3], rgb);
  const from = out.length;
  ring(out, [x, y + 0.045, z], RACK_R - 0.07, RACK_R, rgb);
  glow(out, from, 1.2 * GLOW * (0.7 + 0.3 * Math.sin(t * 2.5)));
  place(out, gun(0), [x, y + 1.05 + 0.04 * Math.sin(t * 2), z], basis(t * 0.8, 0), [0, 0, 0], 1.5);
};

/** The faces of a cube: the normal and the two edges. */
const FACES: Vec3[][] = [
  [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
  [
    [-1, 0, 0],
    [0, 0, 1],
    [0, 1, 0],
  ],
  [
    [0, 1, 0],
    [0, 0, 1],
    [1, 0, 0],
  ],
  [
    [0, -1, 0],
    [1, 0, 0],
    [0, 0, 1],
  ],
  [
    [0, 0, 1],
    [1, 0, 0],
    [0, 1, 0],
  ],
  [
    [0, 0, -1],
    [0, 1, 0],
    [1, 0, 0],
  ],
];

/** A health pack at `at` (on a top): a box turning and bobbing a little over it, a green cross glowing on each side. */
export const kit = (out: number[], at: Vec3, t: number) => {
  const [h, c] = [0.17, 0.13];
  const [r, , f] = basis(t * 0.9, 0);
  const o: Vec3 = [at[0], at[1] + 0.45 + 0.07 * Math.sin(t * 2.2 + at[0]), at[2]];
  /** A box-space vector to the world. */
  const w = ([a, b, d]: Vec3): Vec3 => [r[0] * a - f[0] * d, b, r[2] * a - f[2] * d];
  for (const [n, u, v] of FACES) {
    const q = (a: number, b: number, k = 1): Vec3 => {
      const p = [0, 1, 2].map(i => n[i] * h * k + u[i] * a + v[i] * b) as Vec3;
      const [X, Y, Z] = w(p);
      return [o[0] + X, o[1] + Y, o[2] + Z];
    };
    const nn = w(n);
    for (const [a, b, d, e, rgb, k] of [
      [-h, -h, h, h, [0.86, 0.9, 0.88], 1],
      [-c, -0.04, c, 0.04, [0.1, 1.2, 0.4], 1.01],
      [-0.04, -c, 0.04, c, [0.1, 1.2, 0.4], 1.01],
    ] as const) {
      const from = out.length;
      const [p0, p1, p2, p3] = [q(a, b, k), q(d, b, k), q(d, e, k), q(a, e, k)];
      tri(out, p0, p1, p2, rgb as unknown as number[]);
      tri(out, p0, p2, p3, rgb as unknown as number[]);
      if (k > 1) {
        for (let i = from; i < out.length; i += STRIDE) {
          out[i + 8] = -2;
        }
      }
      void nn;
    }
  }
};
