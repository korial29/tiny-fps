// The flag's dais in the middle of each hall (docs/MOON.md): four white round tiers up to the flag
// at 2 m (shared/moon.ts DAIS), a line of the team's light under each tier's lip, a lit ring round
// the flag, and bands of the team's colour inlaid in the floor round it, as on a command deck.
import { DAIS, DAIS_STEP } from '../../shared/moon';
import { lit } from '../brick';
import type { Vec3 } from '../mesh';
import type { Out } from '../verts';
import { HULL, INK, UV, WHITE } from './constants';
import { quad } from './kit';

/** Sides round a circle. */
const N = 32;
/** N points round the circle of radius r at height y round (x, z). */
const circle = (x: number, z: number, r: number, y: number): Vec3[] =>
  Array.from({ length: N }, (_, k) => {
    const a = (k * 2 * Math.PI) / N;
    return [x + r * Math.cos(a), y, z + r * Math.sin(a)];
  });

/** A flat ring between two circles at the same height, `rgb` a colour or a texture. */
const ring = (o: Out, a: Vec3[], b: Vec3[], c: number | number[], l = 1.85) => {
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    quad(o, [a[i], a[j], b[j], b[i]], c, l, UV[1]);
  }
};

/** A band between the circles of radii r0 and r1 at height y. */
const band = (
  o: Out,
  x: number,
  z: number,
  y: number,
  r0: number,
  r1: number,
  c: number | number[],
  l = 1.85,
) => ring(o, circle(x, z, r0, y), circle(x, z, r1, y), c, l);

/** The dais round the flag at `base`, `tint` the team's colour: white sides, composite tops, team light under each lip. */
export const dais = (o: Out, [x, , z]: Vec3, tint: number[]) => {
  DAIS.forEach((r, i) => {
    const [y0, y1] = [i * DAIS_STEP, (i + 1) * DAIS_STEP];
    const [lo, hi] = [circle(x, z, r, y0), circle(x, z, r, y1)];
    for (let k = 0; k < N; k++) {
      const n = (k + 1) % N;
      // Faces more along x take the u, v of a face flat on z, the others of one flat on x; the
      // light falls off from the sides that face the hall's door and back to those across.
      const flatOnZ = Math.abs(lo[k][2] - lo[n][2]) < Math.abs(lo[k][0] - lo[n][0]);
      const l = 1.19 + 0.06 * Math.cos((4 * (k + 0.5) * Math.PI) / N);
      quad(o, [lo[n], lo[k], hi[k], hi[n]], WHITE, l, UV[flatOnZ ? 2 : 0]);
    }
    // Its top, up to the next tier (or whole on the last), then a light line under its lip.
    ring(o, hi, circle(x, z, DAIS[i + 1] ?? 0, y1), HULL, 1.85);
    const out = circle(x, z, r + 0.01, 0);
    lit(o, 1.4, () => {
      for (let k = 0; k < N; k++) {
        const n = (k + 1) % N;
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
  // In the floor: a wide band of the team's colour between dark lines, and eight spokes out to it
  // from the bottom tier.
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
  const [inner, outer] = [circle(x, z, DAIS[0], 0.03), circle(x, z, 6.4, 0.03)];
  for (let k = 0; k < N; k += N / 8) {
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
