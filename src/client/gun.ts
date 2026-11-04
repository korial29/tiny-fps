// Procedural chaingun: profiles revolved into triangles. Gun space: x right, y up, the muzzle
// points toward -z. No DOM.
import { TAU } from '../shared/physics';

type Vec3 = [number, number, number];

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
 * The chaingun, built once per level of detail: `barrels` turn around the central axis (the caller
 * spins them), the `body` stays. Vertices as in lathe.
 */
export const chaingun = (sides: number) => {
  const barrels: number[] = [];
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
  return { barrels, body };
};
