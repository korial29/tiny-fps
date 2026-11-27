// Landfall's buggy: its fat sand tyres and their mudguards, in the frame the rover's are (a wheel
// about the x axis, its outer face toward +x; rover/parts.ts). The simulation's wheel is the
// rover's (WR): only the look differs.
import { TAU } from '../../shared/physics';
import { WR, panel } from '../rover';
import type { Vec3 } from '../mesh';
import { STRIDE, dress, smooth } from '../mesh';

/** Black rubber, its tread dusted with sand, the pale rim and its dark hub. */
export const RUBBER = [0.07, 0.07, 0.075];
const TREAD_RGB = [0.16, 0.15, 0.13];
export const RIM = [0.78, 0.77, 0.72];
const HUB = [0.2, 0.2, 0.22];

/** Half the tyre's width (wider than the rover's 0.15), the carcass and the paddles' tops either side of WR, the rim's radius. */
export const HALF = 0.2;
const CARCASS = WR - 0.03;
const PADDLE = WR + 0.03;
export const RIM_R = 0.27;

/** A tyre's profile, back (inner side) to front (outer side): a rounded carcass between two rim beads. */
export const TYRE: [number, number][] = [
  [RIM_R, -HALF + 0.02],
  [WR - 0.1, -HALF],
  [CARCASS, -HALF + 0.06],
  [CARCASS, HALF - 0.06],
  [WR - 0.1, HALF],
  [RIM_R, HALF - 0.02],
];

/**
 * A wheel about the x axis: the tyre, a dished rim and a dark hub; near by, paddles across the
 * tread, one every other facet, the sand tyre's scoops.
 */
export const wheel = (level: number): number[] => {
  const sides = [6, 8, 12][level];
  const v = [
    ...dress(
      smooth(
        level
          ? TYRE
          : [
              [CARCASS, -HALF],
              [CARCASS, HALF],
            ],
        sides,
      ),
      level ? RUBBER : TREAD_RGB,
    ),
    ...dress(
      smooth(
        level
          ? [
              [RIM_R, HALF - 0.02],
              [0.12, HALF - 0.1],
            ]
          : [
              [CARCASS, HALF],
              [0, HALF - 0.08],
            ],
        6,
      ),
      level ? RIM : RUBBER,
    ),
    ...(level
      ? dress(
          smooth(
            [
              [0.12, HALF - 0.1],
              [0, HALF - 0.04],
            ],
            6,
          ),
          HUB,
        )
      : []),
  ];
  // The tread's band, between the shoulders, sand-dusted: the two middle rings of the carcass.
  for (let i = 0; level && i < sides * 6 * STRIDE * 5; i += STRIDE) {
    const n = Math.floor(i / STRIDE / 6 / sides);
    if (n === 2) {
      [v[i + 6], v[i + 7], v[i + 9]] = TREAD_RGB;
    }
  }
  for (let i = 0; i < v.length; i += STRIDE) {
    // smooth() revolves about -z: turned a quarter, its length runs along +x.
    [v[i], v[i + 2], v[i + 3], v[i + 5]] = [-v[i + 2], v[i], -v[i + 5], v[i + 3]];
  }
  if (level > 1) {
    const at = (l: number, t: number, r: number): Vec3 => [l, r * Math.cos(t), r * Math.sin(t)];
    const n = 12;
    for (let i = 0; i < n; i++) {
      // A paddle 3 cm thick standing out of the tread: its two faces and its top.
      const t = ((i + 0.5) * TAU) / n;
      const [p, q] = [t - 0.035, t + 0.035];
      const [l0, l1] = [-HALF + 0.05, HALF - 0.05];
      panel(
        v,
        [at(l0, p, CARCASS), at(l1, p, CARCASS), at(l1, p, PADDLE), at(l0, p, PADDLE)],
        RUBBER,
        at(0, p - 1.6, 1),
      );
      panel(
        v,
        [at(l0, q, CARCASS), at(l1, q, CARCASS), at(l1, q, PADDLE), at(l0, q, PADDLE)],
        RUBBER,
        at(0, q + 1.6, 1),
      );
      panel(
        v,
        [at(l0, p, PADDLE), at(l1, p, PADDLE), at(l1, q, PADDLE), at(l0, q, PADDLE)],
        RUBBER,
        at(0, t, 1),
      );
    }
  }
  return v;
};

/** The mudguard's radius, over the paddles. */
const GUARD = WR + 0.1;

/**
 * A mudguard over a wheel about the x axis, as the moon rover's (rover/parts.ts) but as wide as the
 * sand tyre: an arc of `n` plates over the top in the team's colour (white), a lip down its outer
 * edge near by. It turns with the wheel's steering, not with its roll.
 */
export const fender = (n: number): number[] => {
  const v: number[] = [];
  const span = n > 1 ? 0.9 : 0.6;
  const [l0, l1] = [-HALF - 0.02, HALF + 0.04];
  for (let i = 0; i < n; i++) {
    const [p, q] = [i, i + 1].map(k => span * ((2 * k) / n - 1));
    const at = (l: number, t: number, r = GUARD): Vec3 => [l, r * Math.cos(t), -r * Math.sin(t)];
    panel(v, [at(l0, p), at(l1, p), at(l1, q), at(l0, q)], [1, 1, 1], [0, 1, 0]);
    if (n > 2) {
      panel(
        v,
        [at(l1, p), at(l1, q), at(l1, q, GUARD - 0.09), at(l1, p, GUARD - 0.09)],
        [1, 1, 1],
        [1, 0, 0],
      );
    }
  }
  return v;
};
