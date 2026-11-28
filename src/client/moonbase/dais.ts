// The flag's dais in the middle of each hall (docs/MOON.md): four white octagonal tiers up to the
// flag at 2 m (shared/moon.ts DAIS), a line of the team's light under each tier's lip, a lit ring
// round the flag, and bands of the team's colour inlaid in the floor round it, as on a command deck.
import { DAIS, DAIS_STEP } from '../../shared/moon';
import { lit } from '../brick';
import type { Vec3 } from '../mesh';
import type { Out } from '../verts';
import { HULL, INK, UV, WHITE } from './constants';
import { quad } from './kit';

/** The eight corners of an octagon h out each way, its corners cut c, at height y round (x, z). */
const octagon = (x: number, z: number, h: number, c: number, y: number): Vec3[] =>
  [
    [h, -(h - c)],
    [h, h - c],
    [h - c, h],
    [-(h - c), h],
    [-h, h - c],
    [-h, -(h - c)],
    [-(h - c), -h],
    [h - c, -h],
  ].map(([a, b]) => [x + a, y, z + b]);

/** A flat ring between two octagons at the same height, `rgb` a colour or a texture. */
const ring = (o: Out, a: Vec3[], b: Vec3[], c: number | number[], l = 1.85) => {
  for (let i = 0; i < 8; i++) {
    const j = (i + 1) % 8;
    quad(o, [a[i], a[j], b[j], b[i]], c, l, UV[1]);
  }
};

/** A band of the octagons scaled from r0 to r1 of (h, c) at height y. */
const band = (
  o: Out,
  x: number,
  z: number,
  y: number,
  r0: number,
  r1: number,
  c: number | number[],
  l = 1.85,
) => ring(o, octagon(x, z, r0, r0 * 0.42, y), octagon(x, z, r1, r1 * 0.42, y), c, l);

/** The dais round the flag at `base`, `tint` the team's colour: white sides, composite tops, team light under each lip. */
export const dais = (o: Out, [x, , z]: Vec3, tint: number[]) => {
  DAIS.forEach(([h, c], i) => {
    const [y0, y1] = [i * DAIS_STEP, (i + 1) * DAIS_STEP];
    const [lo, hi] = [octagon(x, z, h, c, y0), octagon(x, z, h, c, y1)];
    for (let k = 0; k < 8; k++) {
      const n = (k + 1) % 8;
      // Faces along x take the u, v of a face flat on z, and the others of one flat on x.
      const flatOnZ = Math.abs(lo[k][2] - lo[n][2]) < Math.abs(lo[k][0] - lo[n][0]);
      quad(o, [lo[n], lo[k], hi[k], hi[n]], WHITE, 1.25 - (k & 1) * 0.12, UV[flatOnZ ? 2 : 0]);
    }
    // Its top, up to the next tier (or whole on the last), then a light line under its lip.
    const inner = DAIS[i + 1]
      ? octagon(x, z, DAIS[i + 1][0], DAIS[i + 1][1], y1)
      : octagon(x, z, 0, 0, y1);
    ring(o, hi, inner, HULL, 1.85);
    const out = octagon(x, z, h + 0.01, c + 0.004, 0);
    lit(o, 1.4, () => {
      for (let k = 0; k < 8; k++) {
        const n = (k + 1) % 8;
        const at = (p: Vec3, y: number): Vec3 => [p[0], y, p[2]];
        quad(
          o,
          [
            at(out[n], y1 - 0.09),
            at(out[k], y1 - 0.09),
            at(out[k], y1 - 0.05),
            at(out[n], y1 - 0.05),
          ],
          tint,
        );
      }
    });
  });
  // On top: a dark plate under the flag and a lit ring of the team's colour round it.
  const top = DAIS.length * DAIS_STEP + 0.01;
  band(
    o,
    x,
    z,
    top,
    0,
    1.2,
    INK.map(v => v * 2),
  );
  lit(o, 1.5, () => band(o, x, z, top, 1.45, 1.6, tint));
  // In the floor: a wide band of the team's colour between dark lines, and the spokes out to it
  // from the bottom tier's corners.
  const [h0, c0] = DAIS[0];
  const dark = [0.16, 0.165, 0.18];
  band(o, x, z, 0.03, 6.4, 6.55, dark);
  band(
    o,
    x,
    z,
    0.03,
    6.55,
    7.25,
    tint.map(v => v * 0.45),
  );
  band(o, x, z, 0.03, 7.25, 7.4, dark);
  const [inner, outer] = [octagon(x, z, h0, c0, 0.03), octagon(x, z, 6.4, 6.4 * 0.42, 0.03)];
  for (let k = 0; k < 8; k++) {
    const [p, q] = [inner[k], outer[k]];
    const [dx, dz] = [q[0] - p[0], q[2] - p[2]];
    const l = Math.hypot(dx, dz);
    const [sx, sz] = [(-dz / l) * 0.07, (dx / l) * 0.07];
    quad(
      o,
      [
        [p[0] - sx, 0.03, p[2] - sz],
        [q[0] - sx, 0.03, q[2] - sz],
        [q[0] + sx, 0.03, q[2] + sz],
        [p[0] + sx, 0.03, p[2] + sz],
      ],
      dark,
    );
  }
};
