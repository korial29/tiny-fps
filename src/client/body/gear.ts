import { TAU } from '../../shared/physics';
import { add, unit } from '../mesh';
import type { Vec3 } from '../mesh';

import { X } from './constants';
import { FINGER_R, SHELL, STRAP, THICK, WRIST_LIGHTS, cross, tube } from './fingers';
import type { Ring } from './fingers';
import type { Row } from './palm';
import { along } from './reach';
import type { Root } from './weld';

/**
 * The xenomorph's tendons over the back of its hand, through `put`: each from the wrist straight
 * to its finger's root and on along the finger's first bone, `first(f)` (the user, 2026-11-17: in
 * line with it). `PALM` is the palm's rows and `roots` the fingers' (weld()).
 */
export const sinews = (
  put: (p: Vec3, n: Vec3) => void,
  PALM: Row[],
  roots: Root[],
  first: (f: number) => Vec3,
) => {
  /** The top of the palm's back at (x, z). */
  const top = (x: number, z: number): Vec3 => {
    const n = Math.min(
      Math.max(
        PALM.findIndex(r => r[0] > z),
        1,
      ),
      PALM.length - 1,
    );
    const [a, b] = [PALM[n - 1], PALM[n]];
    const f = Math.min(Math.max((z - a[0]) / (b[0] - a[0]), 0), 1);
    const [y, w, h] = [1, 2, 3].map(k => a[k] + (b[k] - a[k]) * f);
    return [x, y + h * Math.sqrt(Math.max(1 - (x / w) ** 2, 0)) + 0.0006, z];
  };
  roots.forEach(([at], f) => {
    const d1 = first(f);
    const up = unit(cross(d1, X));
    const r = FINGER_R * THICK[f];
    // On the finger: over its root, then down into its first bone.
    const [on, end] = [0.004, 0.02].map((l, k) =>
      add(along(at, d1, l), up.map(v => v * r * (k ? 0.45 : 0.86)) as Vec3),
    );
    // The same line back to the wrist, a little drawn in toward its middle.
    const back = [0.012, 0.036, 0.06, 0.082].map(z => {
      const u = (0.092 - z) / 0.08;
      return top((at[0] - d1[0] * (0.092 - z)) * (1 - 0.45 * u), z);
    });
    const pts = [...back, on, end];
    tube(
      pts.map((c, k): Ring => {
        // Out of the wrist as a hair (tube() starts on a ring), into the bone as a point.
        const w = k == pts.length - 1 ? 0 : k ? 0.0026 : 0.0008;
        return [c, [w, 0, 0], [0, w, 0]];
      }),
      5,
      put,
    );
  });
};

/**
 * A tactical glove's gear, through `put` (the user, 2026-11-09: more detail): a hard shell over the
 * knuckles, a padded plate on the back with its stitching, a strap round the wrist with its buckle,
 * or the marine's lit buttons (`lights`). `PALM` is the palm's rows and `palm` a ring of it; `ink`
 * sets the colour `put` writes and `lay` its layer.
 */
export const gear = (
  put: (p: Vec3, n: Vec3) => void,
  PALM: Row[],
  palm: (row: Row, k?: number) => Ring,
  tint: number[],
  lights: boolean,
  CS: number,
  ink: (f: (r: number) => number[]) => void,
  lay: (l: number) => void,
) => {
  /** The back of the palm at `z` forward and `x` across, its height in the hand. */
  const back = (z: number, x = 0) => {
    const k = PALM.findIndex(r => r[0] > z);
    const [a, b] = [PALM[k - 1], PALM[k]];
    const t = (z - a[0]) / (b[0] - a[0]);
    const [y, w, h] = [1, 2, 3].map(i => a[i] + (b[i] - a[i]) * t);
    return y + h * Math.sqrt(Math.max(1 - (x / w) ** 2, 0));
  };
  // The knuckles' shell: a hard ridge across their backs, swelling over each.
  ink(() => SHELL);
  tube(
    Array.from({ length: 20 }, (_, i) => -0.0475 + i * 0.005).map((x, i, a): Ring => {
      // A swell over each knuckle (the fingers 2.25 cm apart), the ends rounded off.
      const swell = 1 + 0.18 * Math.cos(((x - 0.034) / 0.0225) * TAU);
      const e = Math.min(Math.max((0.0475 - Math.abs(x - 0.0005)) / 0.005, 0), 1);
      // Each end a ring of almost nothing then a point: tube() starts on a ring.
      const k = i == a.length - 1 ? 0 : swell * Math.max(Math.sqrt(e * (2 - e)), 0.1);
      return [
        [-x, back(0.084, x) + 0.003, 0.084],
        [0, 0.0038 * k, 0],
        [0, 0, 0.009 * k],
      ];
    }),
    // Eight sides: half of the ridge is sunk in the glove (10 until the fingers' round tips, 2026-11-18).
    8,
    put,
  );
  // A padded plate on the back of the hand, and the strap round the wrist with its buckle.
  ink(() => tint.map(v => v * 0.72));
  tube(
    // No ring across its middle: the back of the hand is straight under it, within 0.1 mm.
    [0.03, 0.031, 0.034, 0.066, 0.069, 0.071].map((z, i): Ring => {
      const k = [0.1, 0.6, 0.92, 1, 0.75, 0][i];
      return [
        [0, back(z) + 0.0004, z],
        [0.019 * k, 0, 0],
        [0, 0.0034 * k, 0],
      ];
    }),
    12,
    put,
  );
  // Its stitching, light dashes round it a little inside its edge.
  ink(() => tint.map(v => v * 1.45));
  const top = (x: number, z: number): Vec3 => [
    x,
    back(z) + 0.0004 + 0.0034 * Math.sqrt(Math.max(1 - (x / 0.019) ** 2, 0)) + 0.0002,
    z,
  ];
  const loop = (t: number): number[] => {
    // Round a rounded rectangle, 3 cm by 3.4, from 0 to 1.
    const a = t * TAU;
    const [c, s] = [Math.cos(a), Math.sin(a)];
    return [
      0.0155 * Math.sign(c) * Math.abs(c) ** 0.4,
      0.05 + 0.0145 * Math.sign(s) * Math.abs(s) ** 0.4,
    ];
  };
  for (let i = 0; i < 28; i++) {
    const [a, b] = [loop(i / 28), loop((i + 0.55) / 28)];
    const d = unit([b[0] - a[0], 0, b[1] - a[1]]);
    const w: Vec3 = [-d[2] * 0.0005, 0, d[0] * 0.0005];
    const q = [a, b].flatMap(([x, z]) => [top(x + w[0], z + w[2]), top(x - w[0], z - w[2])]);
    for (const v of [q[0], q[2], q[3], q[0], q[3], q[1]]) {
      put(v, [0, 1, 0]);
    }
  }
  ink(() => tint.map(v => v * 0.5));
  const strap = (z: number, k: number) => {
    const [a, b] = PALM;
    const t = (z - a[0]) / (b[0] - a[0]);
    return palm(
      a.map((v, i) => v + (b[i] - v) * t),
      k,
    );
  };
  const [z0, z1, k] = [PALM[0][0] + 0.004, PALM[0][0] + 0.004 + STRAP.w, STRAP.k];
  tube([strap(z0, 0.97), strap(z0 + 0.001, k), strap(z1 - 0.001, k), strap(z1, 0.97)], CS, put);
  const zb = (z0 + z1) / 2;
  const yb = strap(zb, k)[0][1] + strap(zb, k)[2][1];
  /** A small block on the strap's back, `x` across, `w` and `d` its half sizes, `h` high. */
  const block = (x: number, w: number, d: number, h: number) =>
    tube(
      [x - w, x - w * 0.85, x + w * 0.85, x + w].map((q, i): Ring => {
        const s = i % 3 ? 1 : i ? 0 : 0.1;
        return [
          [q, yb, zb],
          [0, h * s, 0],
          [0, 0, d * s],
        ];
      }),
      6,
      put,
    );
  if (!lights) {
    ink(() => SHELL);
    block(0, 0.008, STRAP.w / 2 - 0.0015, 0.0016);
  } else {
    // Lit: unshaded, they bloom.
    lay(-2);
    for (const [x, c] of WRIST_LIGHTS) {
      ink(() => c);
      block(x, 0.0016, 0.0016, 0.0014);
    }
    lay(-1);
  }
};
