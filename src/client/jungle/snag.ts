// Landfall's forest (docs/BEACH.md): the trees the crash broke and the fire burnt round the nose.
import { TAU } from '../../shared/physics';
import { hash } from '../../shared/relief';
import { segment, unit } from '../mesh';
import type { Vec3 } from '../mesh';
import { ASH, SPIKE, charred, splinters } from '../burnt/charred';
import { broken } from '../burnt/clearing';
import { CHAR, DRY } from './constants';
import type { Ground } from './constants';
import { frond } from './models';

/**
 * What the crash left of a tree whose foot is at (x, z), seed s: a charred stump snapped off low
 * or a trunk broken higher up, its roots flared, leaning the way the ship pushed it, forward and
 * away from the centre line, splinters at the break. Most have their top on the ground on that
 * side, still hinged to a low stump or lying by a high one, splintered at both breaks, a stub of a
 * branch on it. A tall one keeps the bare black branches of a broadleaf, or a palm's dead fronds
 * hanging. Black, some greyed with ash.
 */
export const snag = (o: number[], gy: Ground, x: number, z: number, s: number) => {
  const h = (k: number) => hash(s, k, 81);
  const y = gy(x, z);
  const { a, c, d, tall, r, len, lean, top } = broken(x, y, z, s);
  const tone = CHAR.map((v, i) => (v + (ASH[i] - v) * h(15) ** 3) * (0.3 + 0.4 * h(5)));
  const up = unit([lean * tall * c, tall, lean * tall * d]);
  // The roots flared at the foot, under the sand's top, to 0.4 m over it; narrowing up to the break.
  const l = tall + 0.3;
  charred(
    o,
    [x, y - 0.3, z],
    top,
    [
      [0, 1.9 * r],
      [Math.min(0.45 / l, 0.4), 1.3 * r],
      [Math.min(0.7 / l, 0.7), r],
      [1, 0.78 * r],
    ],
    s,
    tone,
  );
  splinters(o, top, up, 0.78 * r, s, tone);
  const tree = h(17) < 0.55;
  if (tall > 3.5) {
    for (let i = 0; i < (tree ? 3 : 2); i++) {
      const [b, t] = [TAU * (i / 3 + 0.3 * h(6 + i)), 0.5 + 0.4 * h(8 + i)];
      const at: Vec3 = [x + lean * tall * t * c, y + tall * t, z + lean * tall * t * d];
      if (tree) {
        const l = 1.2 + 1.6 * h(11 + i);
        const tip: Vec3 = [
          at[0] + 0.6 * l * Math.cos(b),
          at[1] + 0.8 * l,
          at[2] + 0.6 * l * Math.sin(b),
        ];
        segment(o, SPIKE, at, tip, [0, 1, 0], 1, 0.4 * r, tone);
      } else {
        frond(o, top, a + 5 * h(11 + i), -0.4, 2 + h(13 + i), 0.45, 3, DRY);
      }
    }
  }
  const fallen = h(10) < 0.7;
  if (fallen) {
    const from: Vec3 = tall < 2.5 ? top : [x + 0.6 * c, y + 0.7 * r, z + 0.6 * d];
    const end: Vec3 = [x + len * c, gy(x + len * c, z + len * d) + 0.5 * r, z + len * d];
    const f = unit([end[0] - from[0], end[1] - from[1], end[2] - from[2]]);
    charred(
      o,
      from,
      end,
      [
        [0, 0.85 * r],
        [0.5, 0.74 * r],
        [1, 0.62 * r],
      ],
      s + 300,
      tone,
    );
    splinters(o, end, f, 0.62 * r, s + 500, tone);
    if (tall >= 2.5) {
      splinters(o, from, f.map(v => -v) as Vec3, 0.85 * r, s + 700, tone);
    }
    // A branch's stub on the log, standing up off it.
    const t = 0.35 + 0.4 * h(18);
    const at = from.map((e, j) => e + (end[j] - e) * t) as Vec3;
    const l = 0.6 + 1.2 * h(19);
    const side = h(20) < 0.5 ? -1 : 1;
    segment(
      o,
      SPIKE,
      at,
      [at[0] - side * d * 0.6 * l, at[1] + l, at[2] + side * c * 0.6 * l],
      [0, 1, 0],
      1,
      0.35 * r,
      tone,
    );
    for (let i = 0; i < 2 && !tree; i++) {
      frond(o, end, a + 5 * h(11 + i), 0.5, 2 + h(13 + i), 0.5, 3, DRY);
    }
  }
};
