// The rover's wheel, fender and steering yoke, each built once per level of detail.
import { TAU } from '../../shared/physics';
import { STRIDE, dress, smooth } from '../mesh';
import type { Vec3 } from '../mesh';
import { ALU, CARCASS, DARK, FENDER, GOLD, HALF, MESH, STEEL, TREAD } from './constants';
import { LINK, panel, rod } from './mesh';

/**
 * A wheel about the x axis, its outer face toward +x: the wire-mesh tyre, a dished hub with a gold
 * cap, and near by a zigzag of raised treads, one a facet.
 */
export const wheel = (level: number): number[] => {
  const sides = [6, 8, 12][level];
  const v = [
    ...dress(
      smooth(
        level
          ? [
              [0.3, -HALF + 0.02],
              [CARCASS, -HALF],
              [CARCASS, HALF],
              [0.3, HALF - 0.02],
            ]
          : [
              [CARCASS, -HALF],
              [CARCASS, HALF],
            ],
        sides,
      ),
      MESH,
    ),
    ...dress(
      smooth(
        level
          ? [
              [0.33, HALF - 0.022],
              [0.1, 0.06],
            ]
          : [
              [CARCASS, HALF],
              [0, 0.1],
            ],
        6,
      ),
      level ? ALU : STEEL,
    ),
    ...(level > 1
      ? [
          ...dress(
            smooth(
              [
                [0.1, 0.06],
                [0, 0.13],
              ],
              6,
            ),
            GOLD,
          ),
          ...dress(
            smooth(
              [
                [0, -0.07],
                [0.33, 0.022 - HALF],
              ],
              6,
            ),
            STEEL,
          ),
        ]
      : []),
  ];
  for (let i = 0; i < v.length; i += STRIDE) {
    const n = i / STRIDE / 6;
    // The sidewalls are dark, and every other sector of the hub: its spokes.
    if (level && (n < sides || (n >= 2 * sides && n < 3 * sides + 6 && (n < 3 * sides || n & 1)))) {
      [v[i + 6], v[i + 7], v[i + 9]] = STEEL;
    }
    // smooth() revolves about -z: turned a quarter, its length runs along +x.
    [v[i], v[i + 2], v[i + 3], v[i + 5]] = [-v[i + 2], v[i], -v[i + 5], v[i + 3]];
  }
  if (level > 1) {
    const at = (l: number, t: number, r: number): Vec3 => [l, r * Math.cos(t), r * Math.sin(t)];
    for (let i = 0; i < sides; i++) {
      // Over the middle of a facet, slanted one way then the other.
      const t = ((i + 0.5) * TAU) / sides;
      const k = i % 2 ? 0.09 : -0.09;
      const [p, q] = [at(-HALF - 0.01, t - k, TREAD), at(HALF + 0.01, t + k, TREAD)];
      for (const e of [-0.12, 0.12]) {
        panel(
          v,
          [
            p,
            q,
            at(HALF + 0.01, t + k + e, CARCASS - 0.03),
            at(-HALF - 0.01, t - k + e, CARCASS - 0.03),
          ],
          DARK,
          at(0, t + e, 1),
        );
      }
    }
  }
  return v;
};

/** A fender over a wheel about the x axis, white: an arc of `n` plates over the top. */
export const fender = (n: number): number[] => {
  const v: number[] = [];
  const span = n > 1 ? 0.9 : 0.6;
  for (let i = 0; i < n; i++) {
    const [p, q] = [i, i + 1].map(k => span * ((2 * k) / n - 1));
    const at = (l: number, t: number, r = FENDER): Vec3 => [l, r * Math.cos(t), -r * Math.sin(t)];
    const [l0, l1] = [-HALF - 0.01, HALF + 0.05];
    panel(v, [at(l0, p), at(l1, p), at(l1, q), at(l0, q)], [1, 1, 1], [0, 1, 0]);
    // A lip down its outer edge, near by.
    if (n > 2) {
      panel(
        v,
        [at(l1, p), at(l1, q), at(l1, q, FENDER - 0.09), at(l1, p, FENDER - 0.09)],
        [1, 1, 1],
        [1, 0, 0],
      );
    }
  }
  return v;
};

/**
 * The steering yoke, its hub at the origin and its column running on along -z: a bar with a grip
 * at each end.
 */
export const yoke = (): number[] => {
  const v: number[] = [];
  rod(v, LINK, [0, 0, 0], [0, 0, -0.32], 0.022, STEEL);
  rod(v, LINK, [-0.17, 0, 0], [0.17, 0, 0], 0.02, STEEL);
  for (const x of [-0.17, 0.17]) {
    rod(v, LINK, [x, -0.02, 0], [x, 0.1, 0.03], 0.026, DARK);
  }
  return v;
};
