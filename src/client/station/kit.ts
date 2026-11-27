// Small mesh helpers shared by the station's meshes (satellite.ts, station/command.ts): boxes and
// bars in flat colours, in the scenery's vertex layout (position, normal, r, g, layer, b).
import { SHINE, dress, segment, smooth } from '../mesh';
import type { Vec3 } from '../mesh';

export type Out = number[];

export const vert = (o: Out, p: Vec3, n: Vec3, rgb: number[], layer: number) =>
  o.push(...p, ...n, rgb[0], rgb[1], layer, rgb[2]);

/** A box from a to b with outward normals, a flat colour on layer `layer`. */
export const slab = (o: Out, a: Vec3, b: Vec3, rgb: number[], layer = -1) => {
  const [[x0, x1], [y0, y1], [z0, z1]] = [0, 1, 2].map(k => [a[k], b[k]]);
  const faces: [Vec3, Vec3[]][] = [
    [
      [0, 1, 0],
      [
        [x0, y1, z0],
        [x0, y1, z1],
        [x1, y1, z1],
        [x1, y1, z0],
      ],
    ],
    [
      [0, -1, 0],
      [
        [x0, y0, z0],
        [x1, y0, z0],
        [x1, y0, z1],
        [x0, y0, z1],
      ],
    ],
    [
      [1, 0, 0],
      [
        [x1, y0, z0],
        [x1, y1, z0],
        [x1, y1, z1],
        [x1, y0, z1],
      ],
    ],
    [
      [-1, 0, 0],
      [
        [x0, y0, z0],
        [x0, y0, z1],
        [x0, y1, z1],
        [x0, y1, z0],
      ],
    ],
    [
      [0, 0, 1],
      [
        [x0, y0, z1],
        [x1, y0, z1],
        [x1, y1, z1],
        [x0, y1, z1],
      ],
    ],
    [
      [0, 0, -1],
      [
        [x0, y0, z0],
        [x0, y1, z0],
        [x1, y1, z0],
        [x1, y0, z0],
      ],
    ],
  ];
  for (const [n, q] of faces) {
    for (const i of [0, 1, 2, 0, 2, 3]) {
      vert(o, q[i], n, rgb, layer);
    }
  }
};

/** smooth() of a profile, `sides` round, in a flat colour on `layer`. */
export const lathed = (
  profile: [number, number][],
  rgb: number[],
  layer: number,
  sides: number,
) => {
  const v = dress(smooth(profile, sides), rgb);
  for (let i = 8; i < v.length; i += 10) {
    v[i] = layer;
  }
  return v;
};

/** A round bar of radius r from a to b. */
export const bar = (o: Out, a: Vec3, b: Vec3, r: number, rgb: number[], layer = SHINE) =>
  segment(
    o,
    lathed(
      [
        [0, 0],
        [r, 0],
        [r, 1],
        [0, 1],
      ],
      rgb,
      layer,
      8,
    ),
    a,
    b,
    [0, 1, 0],
    1,
  );
