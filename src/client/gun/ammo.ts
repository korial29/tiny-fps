// The ammunition models: the rifle cell, the rail gun battery and the capsule.
import { TAU } from '../../shared/physics';
import { tri } from '../flag';
import type { Vec3 } from '../mesh';
import { tube } from './loft';
import type { Station } from './loft';
import { DARK, copper, core, glow, metal, shade, steel } from './paint';
import { olive, red } from './rifle';

/** The rifle's power cell, built once: a box of olive metal along its own forward from its foot, a red band near the foot. */
export const cell = (lod: number): number[] =>
  (packs[lod] ??= ((out: number[]) => {
    const n = lod ? 8 : 4;
    tube(
      out,
      [
        [0, 0, 0, 0],
        [0.003, 0, 0.022, 0.03],
        [0.1, 0, 0.022, 0.03],
        [0.102, 0, 0, 0],
      ],
      n,
      olive,
    );
    tube(
      out,
      [
        [0.01, 0, 0.0228, 0.0308],
        [0.02, 0, 0.0228, 0.0308],
      ],
      n,
      red,
    );
    return out;
  })([]));
const packs: number[][] = [];

/**
 * The mouth of the gun's battery seat, in the battery's frame: a dark disc a little wider than it,
 * laid on the slanted shell where the battery goes in, 2 mm out of it. The shell's distance from
 * the battery's foot, in 0.1 mm, round two rings (measured on gun(1)).
 */
export const WELL_HOLE = (() => {
  const out: number[] = [];
  const rims = [
    [0.0086, [226, 239, 257, 260, 258, 239, 226, 227, 225, 221, 225, 227]],
    [0.0172, [235, 278, 314, 320, 315, 278, 235, 237, 233, 225, 233, 237]],
  ] as const;
  const at = (k: number, j: number): Vec3 => [
    rims[k][0] * Math.cos((j * TAU) / 12),
    rims[k][0] * Math.sin((j * TAU) / 12),
    0.002 - rims[k][1][j % 12] / 1e4,
  ];
  for (let j = 0; j < 12; j++) {
    const c = [0.01, 0.01, 0.012];
    tri(out, [0, 0, -0.0198], at(0, j), at(0, j + 1), c);
    tri(out, at(0, j), at(1, j), at(1, j + 1), c);
    tri(out, at(0, j), at(1, j + 1), at(0, j + 1), c);
  }
  return out;
})();

/**
 * The gun's battery (the user, 2026-11-08), built once: a gunmetal cell in the grip, along its own
 * forward from its foot, which stands out under the lower shell with a band of glow round it.
 */
export const battery = (lod: number): number[] =>
  (cells[lod] ??= ((out: number[]) => {
    const n = lod ? 10 : 6;
    tube(
      out,
      [
        [0, 0, 0, 0],
        [0.003, 0, 0.016, 0.016],
        [0.09, 0, 0.016, 0.016],
        [0.092, 0, 0, 0],
      ],
      n,
      metal(0.35),
    );
    tube(
      out,
      [
        [0.008, 0, 0.0168, 0.0168],
        [0.018, 0, 0.0168, 0.0168],
      ],
      n,
      glow,
    );
    return out;
  })([]));
export const cells: number[][] = [];

/**
 * The rail gun's cell (the user, 2026-11-08: its batteries in view), built once for each of 9 steps
 * of `level` (0 to 1): a threaded copper base (it screws into the socket on the gun), a column of
 * violet lightning as high as the level in a dark glass tube, in a cage of three steel posts, and a
 * cap with its terminal, standing along its own forward from its base.
 */
export const capsule = (lod: number, level = 1): number[] => {
  const l = Math.round(Math.min(Math.max(level, 0), 1) * 8);
  return (caps[lod * 9 + l] ??= ((out: number[]) => {
    const n = lod ? 10 : 6;
    tube(
      out,
      [
        [0, 0, 0, 0],
        ...[0.001, 0.003, 0.005, 0.007, 0.009, 0.011, 0.014].map((f, i): Station => [
          f,
          0,
          0.0175 + 0.0015 * (i % 2),
          0.0175 + 0.0015 * (i % 2),
        ]),
        [0.016, 0, 0.012, 0.012],
      ],
      n,
      copper,
    );
    const top = 0.014 + 0.006 * l;
    if (l) {
      tube(
        out,
        [
          [0.014, 0, 0.009, 0.009],
          [top, 0, 0.009, 0.009],
          [top + 0.001, 0, 0, 0],
        ],
        n,
        core,
      );
    }
    if (l < 8) {
      tube(
        out,
        [
          [top, 0, 0, 0],
          [top + 0.001, 0, 0.0095, 0.0095],
          [0.062, 0, 0.0095, 0.0095],
          [0.066, 0, 0, 0],
        ],
        n,
        shade(DARK, [0.2, 0.18, 0.3]),
      );
    }
    for (let k = 0; k < 3; k++) {
      const [c, s] = [Math.cos((k * TAU) / 3), Math.sin((k * TAU) / 3)];
      tube(
        out,
        [
          [0.014, 0.016 * s, 0.0025, 0.0025, 0.016 * c],
          [0.066, 0.016 * s, 0.0025, 0.0025, 0.016 * c],
        ],
        3,
        steel,
      );
    }
    tube(
      out,
      [
        [0.064, 0, 0.019, 0.019],
        [0.072, 0, 0.017, 0.017],
        [0.074, 0, 0.005, 0.005],
        [0.08, 0, 0.005, 0.005],
        [0.081, 0, 0, 0],
      ],
      n,
      steel,
    );
    return out;
  })([]));
};
const caps: number[][] = [];
