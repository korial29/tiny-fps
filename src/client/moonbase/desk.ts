// The control desks round the hall (docs/MOON.md), one under each window of the floor's row: a
// dark grey cabinet against the wall, its top a dark sloped panel with a screen and rows of lit keys.
// Drawn only, 0.32 m deep: a runner along the wall brushes through its front.
import { box, face, lit } from '../brick';
import type { Vec3 } from '../mesh';
import type { Out } from '../verts';
import { AMBER, C, CYAN, GREEN, INK, IRON, RED, TRIM } from './constants';
import { inside } from './kit';
import { walls } from './hall';
import { KIT } from '../../shared/moonbase';

const KEYS = [CYAN, AMBER, GREEN, [0.9, 0.92, 1], RED, CYAN, GREEN];

/**
 * The desk on the wall flat on axis k at `at` (the hall inside toward -sign), along the axis j from
 * s0 to s1.
 */
export const desk = (
  o: Out,
  k: number,
  at: number,
  sign: number,
  s0: number,
  s1: number,
  y0 = 0,
  deep = 0.3,
) => {
  const j = 2 - k;
  /** The point d out from the wall, y up, s along it. */
  const W = (d: number, y: number, s: number): Vec3 => {
    const p: Vec3 = [0, y0 + y, 0];
    p[k] = at - sign * d;
    p[j] = s;
    return p;
  };
  /** A box d0..d1 out, y0..y1 up, a..b along, without its face on the wall nor its foot. */
  const cube = (
    d0: number,
    y0: number,
    a: number,
    d1: number,
    y1: number,
    b: number,
    rgb: number[],
  ) => {
    const [p, q] = [W(d0, y0, a), W(d1, y1, b)];
    const wall = (k ? 1 : 16) << (sign > 0 ? 1 : 0);
    box(
      o,
      p.map((v, i) => Math.min(v, q[i])) as Vec3,
      p.map((v, i) => Math.max(v, q[i])) as Vec3,
      rgb,
      wall | 4,
    );
  };
  const away = W(-1, 0.9, (s0 + s1) / 2);
  /** A quad on the sloped top, from (t0, a) to (t1, b): t from its front edge up to the wall. */
  const slope = (t0: number, a: number, t1: number, b: number, lift: number, rgb: number[]) => {
    const on = (t: number, s: number) =>
      W(deep + 0.02 - 0.24 * t + lift * 0.6, 0.86 + 0.24 * t + lift * 0.8, s);
    face(o, [on(t0, a), on(t0, b), on(t1, b), on(t1, a)], rgb, away);
  };
  inside(o, () => {
    // The cabinet, a dark kick at its foot, and the panel on its top.
    cube(0, 0.08, s0, deep, 0.86, s1, TRIM);
    cube(0, 0, s0 + 0.04, deep - 0.04, 0.08, s1 - 0.04, IRON);
    slope(0, s0, 1, s1, 0.005, INK);
    // Its cheeks under the slope.
    for (const s of [s0, s1]) {
      face(
        o,
        [W(0, 0.86, s), W(deep, 0.86, s), W(deep - 0.22, 1.1, s), W(0, 1.1, s)],
        TRIM,
        W(0.1, 0.9, (s0 + s1) / 2),
      );
    }
  });
  // A screen on its left half, keys in two rows of four on its right.
  const mid = (s0 + s1) / 2;
  inside(o, () => lit(o, 0.5, () => slope(0.25, s0 + 0.1, 0.85, mid - 0.05, 0.012, CYAN)));
  inside(o, () =>
    lit(o, 1.2, () => {
      for (let r = 0; r < 2; r++) {
        for (let n = 0; n < 4; n++) {
          const a = mid + 0.06 + n * ((s1 - 0.1 - mid - 0.06) / 4);
          const t = 0.25 + r * 0.35;
          slope(
            t,
            a,
            t + 0.15,
            a + 0.1,
            0.012,
            KEYS[(n * 3 + r * 2 + Math.round(s0)) % KEYS.length],
          );
        }
      }
    }),
  );
};

/** A desk under each window of the hall's floor row, but where kit stands against the wall there. */
export const desks = (o: Out) => {
  for (const { k, j, at, sign, panes } of walls()) {
    for (const [c, y] of panes) {
      const [a, b] = [C[j] + c - 0.72, C[j] + c + 0.72];
      const [d0, d1] = [at, at - sign * 0.6].sort((p, q) => p - q);
      const clear = !KIT.some(
        ([, x0, z0, x1, z1, y0]) =>
          y0 < 1 &&
          [x0, z0][k / 2] < d1 &&
          [x1, z1][k / 2] > d0 &&
          [x0, z0][j / 2] < b &&
          [x1, z1][j / 2] > a,
      );
      if (y < 2 && clear) {
        desk(o, k, at, sign, a, b);
      }
    }
  }
};
