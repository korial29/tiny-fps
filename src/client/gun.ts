// Procedural chaingun: profiles revolved into triangles. Gun space: x right, y up, the muzzle
// points toward -z. No DOM.
import { TAU } from '../shared/physics';
import { QUAD, STRIDE, pushFrame } from './mesh';
import type { Vec3 } from './mesh';

/** Where the barrels end, on -z: the muzzle flash sits just past it. */
export const MUZZLE = 0.55;
const BARRELS = 6;

/**
 * Revolves a profile of [radius, length] points around the axis through `at` along -z: `length`
 * runs forward from `at`. Returns triangles as x, y, z, nx, ny, nz per vertex, `sides` quads of 2
 * triangles per profile segment. The profile goes from back to front and closes on the axis, so
 * the normals (smooth around the ring, flat along the profile) point outward.
 */
export const lathe = (
  profile: [number, number][],
  sides: number,
  at: Vec3 = [0, 0, 0],
): number[] => {
  const out: number[] = [];
  for (let k = 1; k < profile.length; k++) {
    const [[r0, l0], [r1, l1]] = [profile[k - 1], profile[k]];
    const len = Math.hypot(r1 - r0, l1 - l0);
    if (!len) {
      continue;
    }
    // Outward in the (radius, length) plane: the profile tangent turned a quarter.
    const [nr, nl] = [(l1 - l0) / len, -(r1 - r0) / len];
    const ring = (i: number, r: number, l: number) => {
      const [c, s] = [Math.cos((i * TAU) / sides), Math.sin((i * TAU) / sides)];
      out.push(at[0] + r * c, at[1] + r * s, at[2] - l, nr * c, nr * s, -nl);
    };
    for (let i = 0; i < sides; i++) {
      for (const [j, r, l] of [
        [i, r0, l0],
        [i + 1, r0, l0],
        [i + 1, r1, l1],
        [i, r0, l0],
        [i + 1, r1, l1],
        [i, r1, l1],
      ] as const) {
        ring(j, r, l);
      }
    }
  }
  return out;
};

/**
 * A box of half sizes `h` at c, turned by `roll` about the gun axis: x and y of `h` run along its
 * turned axes, z along the gun. Vertices as in lathe.
 */
const slab = (c: Vec3, h: Vec3, roll = 0) => {
  const [s, k] = [Math.sin(roll), Math.cos(roll)];
  const v: number[] = [];
  pushFrame(
    v,
    c,
    [
      [k, s, 0],
      [-s, k, 0],
      [0, 0, 1],
    ],
    h,
    [0, 0, 0],
  );
  return v.filter((_, i) => i % STRIDE < 6);
};

/** A box on a ring: angle `a` around the axis, radius `r`, `l` forward of the origin. */
const stud = (a: number, r: number, l: number, h: Vec3) =>
  slab([Math.cos(a) * r, Math.sin(a) * r, -l], h, a + Math.PI / 4);

/** A flat patch on a facet of a ring: `t` wide, `q` long, facing out at angle a, radius r. */
const patch = (a: number, r: number, l: number, t: number, q: number) =>
  QUAD.flatMap(([i, j]) => {
    const [c, s] = [Math.cos(a), Math.sin(a)];
    return [c * r - s * t * i, s * r + c * t * i, -l - q * j, c, s, 0];
  });

/**
 * The chaingun, built once per level of detail. Group by group, vertices as in lathe: `barrels` and
 * `clamps` turn around the central axis (the caller spins them), the rest stays: `body`, `trim`
 * (lighter metal), `holes` (dark) and `brass` (the belt). Past 6 sides it adds the fine parts:
 * clamps, shroud with cooling holes, bolts, ammo box, belt, handle and ejection port.
 */
export const chaingun = (sides: number) => {
  const fine = sides > 6;
  const barrels: number[] = [];
  const [clamps, trim, holes, brass]: number[][] = [[], [], [], []];
  for (let i = 0; i < BARRELS; i++) {
    const a = (i * TAU) / BARRELS;
    barrels.push(
      ...lathe(
        [
          [0, 0],
          [0.02, 0],
          [0.02, 0.45],
          [0.014, 0.45],
          [0.014, 0.55],
          [0, 0.55],
        ],
        sides,
        [Math.cos(a) * 0.05, Math.sin(a) * 0.05, 0],
      ),
    );
  }
  const body = lathe(
    [
      [0, -0.3],
      [0.08, -0.3],
      [0.09, -0.26],
      [0.09, 0],
      [0.075, 0],
      [0.075, 0.1],
      [0.03, 0.1],
      [0.03, 0.4],
      [0, 0.4],
    ],
    sides,
  );
  if (fine) {
    // A clamp is a short wide ring with bolts round its rim.
    for (const [l, n] of [
      [0.1, 4],
      [0.44, 4],
    ]) {
      clamps.push(
        ...lathe(
          [
            [0, l],
            [0.086, l],
            [0.086, l + 0.06],
            [0, l + 0.06],
          ],
          sides,
        ),
      );
      for (let i = 0; i < n; i++) {
        clamps.push(...stud((i * TAU) / n, 0.088, l + 0.03, [0.008, 0.008, 0.012]));
      }
    }
    body.push(
      ...lathe(
        [
          [0.078, 0.16],
          [0.078, 0.3],
        ],
        sides,
      ),
    );
    // Cooling holes in two staggered rows, on the facets of the shroud.
    const facet = (i: number) => ((i + 0.5) * TAU) / sides;
    // A lathe ring is a polygon: a facet sits at r cos(pi / sides), and the patch just above it.
    const skin = (r: number) => r * Math.cos(Math.PI / sides) + 0.002;
    for (let i = 0; i < sides; i++) {
      holes.push(...patch(facet(i), skin(0.078), i % 2 ? 0.21 : 0.25, 0.012, 0.02));
    }
    // The ejection port, upper right of the receiver.
    holes.push(...patch(facet(0), skin(0.075), 0.05, 0.016, 0.03));
    trim.push(
      ...lathe(
        [
          [0.088, 0.3],
          [0.088, 0.33],
          [0.07, 0.33],
        ],
        sides,
      ),
      // The rear cap: a hub, a rim and a ring of bolts.
      ...lathe(
        [
          [0, -0.325],
          [0.03, -0.325],
          [0.03, -0.3],
        ],
        sides,
      ),
      ...lathe(
        [
          [0.062, -0.3],
          [0.062, -0.31],
          [0.07, -0.31],
          [0.07, -0.3],
        ],
        sides,
      ),
    );
    for (let i = 0; i < 6; i++) {
      trim.push(...stud((i * TAU) / 6, 0.046, -0.306, [0.007, 0.007, 0.006]));
    }
    // The ammo box on the left, its lid and latch, and the chute that feeds the belt.
    body.push(...slab([-0.135, -0.03, 0.12], [0.045, 0.055, 0.09]));
    // Two ribs along its side.
    for (const y of [-0.055, -0.005]) {
      trim.push(...slab([-0.18, y, 0.12], [0.004, 0.006, 0.075]));
    }
    trim.push(
      ...slab([-0.135, 0.03, 0.12], [0.048, 0.007, 0.094]),
      ...slab([-0.135, 0.042, 0.12], [0.02, 0.006, 0.012]),
      ...slab([-0.1, 0.02, 0.0], [0.02, 0.025, 0.045]),
      // The carrying handle: a bar on two posts.
      ...slab([0, 0.118, 0.12], [0.012, 0.009, 0.075]),
      ...slab([0, 0.098, 0.055], [0.009, 0.02, 0.009]),
      ...slab([0, 0.098, 0.185], [0.009, 0.02, 0.009]),
    );
    for (let i = 0; i < 4; i++) {
      brass.push(...slab([-0.1, 0.052, 0.03 - i * 0.026], [0.007, 0.007, 0.011]));
    }
  }
  return { barrels, clamps, body, trim, holes, brass };
};
