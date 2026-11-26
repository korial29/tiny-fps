// The rail gun: its model, its insulators and the Tesla details.
import { SHINE, sub, unit } from '../mesh';
import type { Vec3 } from '../mesh';
import type { Out } from '../verts';
import { mix, ring, tube } from './loft';
import type { Paint, Station } from './loft';
import { CERAMIC, EMBER, arcing, cable, copper, dim, drab, steel, wood } from './paint';
import { lip, rect, screw, slot } from './rifle';

/** The rail gun's muzzle, between its electrodes' tips: on the gun's long axis (REAR to MUZZLE), 36 cm further out. */
export const RAIL_MUZZLE: Vec3 = [0, 0.048, -0.575];
/** The electrodes' tips stand this far above and below the muzzle. */
export const SPREAD = 0.05;
/** The middle of the rail gun's front grip, under the barrel, where the left hand holds it. */
export const FOREGRIP: Vec3 = [0, 0.012, -0.19];
/** The height of the long axis at `f` ahead of the grip, in the side view. */
export const axisY = (f: number) => 0.0906 - 0.0741 * f;

/** A station on the long axis, `up` above it. */
export const on = (f: number, up: number, a: number, b = a, x = 0): Station => [
  f,
  axisY(f) + up,
  a,
  b,
  x,
];
export const railed: number[][] = [];
/** The rail gun's receiver, a tube: its long middle from station 2 to 3. */
const RECEIVER = [
  on(-0.13, 0.004, 0),
  on(-0.125, 0.004, 0.026, 0.03),
  on(-0.1, 0.004, 0.034, 0.04),
  on(0.13, 0.002, 0.034, 0.038),
  on(0.16, 0, 0.024),
  on(0.165, 0, 0),
];

/**
 * The rail gun's small details (the user, 2026-11-09: lines and screw heads on its tube), near
 * only: on the receiver's ten flat faces, grooves round it with a bright lip, a seam along each
 * flank above and under its middle, cross-head screws; grooves round the barrel between the
 * insulators and the coils.
 */
const teslaDetails = (out: Out) => {
  /** The receiver's surface at `f` forward, `k` round (of its 10 vertices, between them on a flat face), `d` out of it, and the face's normal. */
  const at = (f: number, k: number, d = 0.0003): Vec3[] => {
    const t = (f + 0.1) / 0.23;
    const v = (j: number) => mix(ring(RECEIVER, 2, j, 10), ring(RECEIVER, 3, j, 10), t) as Vec3;
    const [a, b] = [v(Math.floor(k)), v(Math.floor(k) + 1)];
    const e = unit(sub(ring(RECEIVER, 3, 0, 10), ring(RECEIVER, 2, 0, 10)));
    const w = unit(sub(b, a));
    // Outward: the cross of the way along and the way round.
    const n = unit([
      e[1] * w[2] - e[2] * w[1],
      e[2] * w[0] - e[0] * w[2],
      e[0] * w[1] - e[1] * w[0],
    ]);
    const p = mix(a, b, k % 1);
    return [p.map((c, i) => c + n[i] * d) as Vec3, n, e, w];
  };
  const band = (f0: number, f1: number, k0: number, k1: number, paint: Paint, d = 0.0003) =>
    rect(out, (f, k) => at(f, k, d)[0], f0, f1, k0, k1, at(f0, k0)[1], paint);
  for (const f of [-0.085, -0.035, 0.07, 0.118]) {
    for (let k = 0; k < 10; k++) {
      band(f - 0.0011, f + 0.0011, k, k + 0.999, slot);
      band(f + 0.0011, f + 0.0019, k, k + 0.999, lip);
    }
  }
  // Seams along the flanks, a screw at each end; a panel on the top between the first two
  // grooves, a screw at each corner.
  for (const k of [0.5, 4.5, 5.5, 9.5]) {
    band(-0.095, 0.125, k - 0.02, k + 0.02, slot);
    for (const f of [-0.06, 0.095]) {
      const [c, n, e, w] = at(f, k + (k % 9 < 1 || k > 5 ? 0.25 : -0.25));
      screw(out, c, e, w, n, 1.4);
    }
  }
  for (const k of [2.12, 2.84]) {
    band(-0.0839, -0.0361, k, k + 0.04, slot);
  }
  for (const f of [-0.074, -0.046]) {
    for (const k of [2.3, 2.7]) {
      const [c, n, e, w] = at(f, k);
      screw(out, c, e, w, n, 1.2);
    }
  }
  for (const f of [0.175, 0.228, 0.283]) {
    tube(
      out,
      [
        on(f - 0.001, 0, 0),
        on(f - 0.001, 0, 0.0195),
        on(f + 0.001, 0, 0.0195),
        on(f + 0.001, 0, 0),
      ],
      10,
      slot,
    );
  }
};

/**
 * The rail gun at a level of detail (0 far, 1 near), built once like gun(), after a Tesla gun held
 * in both hands: a stock to the shoulder, a gunmetal receiver over the same grip, a front grip under
 * a barrel in three copper coils, and two electrodes forking out of its end, up and down, each
 * tipped with a glowing ball. arc() is the spark between them.
 */
export const railgun = (lod: number): number[] => {
  if (railed[lod]) {
    return railed[lod];
  }
  const [n, m] = lod ? [10, 6] : [6, 4];
  const out: number[] = [];
  // The stock, from the butt plate to the receiver, a little under the long axis.
  tube(
    out,
    [
      on(-0.392, -0.045, 0),
      on(-0.39, -0.045, 0.024, 0.05),
      on(-0.36, -0.042, 0.024, 0.05),
      on(-0.25, -0.025, 0.02, 0.034),
      on(-0.13, -0.006, 0.024, 0.032),
      on(-0.1, 0, 0),
    ],
    m,
    wood,
  );
  tube(out, RECEIVER, n, drab);
  // The grip, upright in the fist that holds it (LONG_TILT): leaning back as the pistol's, it
  // came out of the fingers (the user, 2026-11-25: the hands clipped on the rail gun).
  tube(
    out,
    [
      [0, 0.07, 0, 0],
      [0, 0.05, 0.013, 0.021],
      [0, 0, 0.013, 0.021],
      [0, -0.046, 0.013, 0.021],
      [0, -0.06, 0, 0],
    ],
    m,
    steel,
  );
  tube(
    out,
    [
      [0.18, axisY(0.18) - 0.015, 0, 0],
      [0.183, axisY(0.183) - 0.02, 0.013, 0.015],
      [0.197, -0.035, 0.012, 0.014],
      [0.2, -0.04, 0, 0],
    ],
    m,
    steel,
  );
  tube(
    out,
    [on(0.15, 0, 0), on(0.155, 0, 0.019), on(0.42, 0, 0.019), on(0.43, 0, 0.025), on(0.44, 0, 0)],
    n,
    steel,
  );
  for (const f of [0.31, 0.355, 0.4]) {
    tube(
      out,
      [on(f - 0.011, 0, 0), on(f - 0.01, 0, 0.03), on(f + 0.01, 0, 0.03), on(f + 0.011, 0, 0)],
      n,
      copper,
    );
  }
  if (lod) {
    teslaDetails(out);
  }
  const f = -RAIL_MUZZLE[2];
  for (const s of [-1, 1]) {
    const up = s * SPREAD;
    tube(
      out,
      [
        on(0.42, s * 0.014, 0.008),
        on(0.47, up * 0.8, 0.007),
        on(0.53, up * 1.1, 0.006),
        on(f - 0.006, up, 0.0055),
        on(f - 0.004, up, 0),
      ],
      m,
      steel,
    );
    tube(
      out,
      [
        on(f - 0.012, up, 0),
        on(f - 0.008, up, 0.012),
        on(f + 0.008, up, 0.012),
        on(f + 0.012, up, 0),
      ],
      m,
      arcing,
    );
    tube(
      out,
      [on(-0.08, -0.004, 0.002, 0.003, s * 0.034), on(0.12, -0.004, 0.002, 0.003, s * 0.034)],
      3,
      dim,
    );
  }
  // A steel collar for each cell, along it: on the top the socket the cell in use screws into, its
  // hole the cell's thread; on each flank the cradle of a smaller one.
  for (let i = 0; i < 3; i++) {
    tube(
      out,
      [
        [-0.017, 0],
        [-0.016, 0.024],
        [0.005, 0.024],
        [0.007, 0.0215],
        [0.0075, 0.0195],
        [0.008, 0],
      ].map(([h, a]): Station => {
        const [f, y, x] = onCell(i, h);
        return [f, y, a * SLOTS[i][5], a * SLOTS[i][5], x];
      }),
      n,
      steel,
    );
  }
  // Red cables, punk (the user, 2026-11-08): from the socket over the insulators (insulators()) to
  // the first coil, from each flank cell's terminal up to the socket, a loop sticking out of the
  // right flank and a loose one off the back.
  const wires = [
    [
      [0.123, 0.118, 0.008],
      [0.16, 0.175, 0.01],
      [0.2, 0.142, 0],
    ],
    [
      [0.2, 0.142, 0],
      [0.228, 0.17, 0],
      [0.255, 0.138, 0],
    ],
    [
      [0.255, 0.138, 0],
      [0.29, 0.16, 0],
      [0.31, 0.097, 0],
    ],
    [onCell(1, 0.08), [0.13, 0.1, -0.07], onCell(0, 0.004, -0.022)],
    [onCell(2, 0.08), [0.13, 0.14, 0.08], onCell(0, 0.004, 0.022)],
    [
      [0.09, 0.094, 0.034],
      [0.07, 0.16, 0.09],
      [0.03, 0.09, 0.035],
    ],
    [
      [-0.08, 0.13, 0.01],
      [-0.11, 0.22, -0.01],
      [-0.15, 0.17, -0.03],
    ],
  ];
  for (const [a, c, b] of wires) {
    tube(
      out,
      [0, 1, 2, 3, 4, 5, 6].map((k): Station => {
        const t = k / 6;
        const p = [0, 1, 2].map(j => (1 - t) ** 2 * a[j] + 2 * t * (1 - t) * c[j] + t * t * b[j]);
        return [p[0], p[1], 0.0028, 0.0028, p[2]];
      }),
      lod ? 5 : 3,
      cable,
    );
  }
  return (railed[lod] = out);
};

/**
 * The feet of the rail gun's three cells (the user, 2026-11-08): the one in use standing on the
 * receiver's top, the capsule a swap replaces, and two smaller ones lying along its flanks low,
 * between the hands and under the counter, pointing forward. Each forward, up and across, how far it leans back and aside
 * (radians), and its size.
 */
export const SLOTS = [
  [0.1, 0.121, 0, 0, 0, 1],
  [0.03, 0.072, -0.046, -Math.PI / 2, 0, 0.7],
  [0.03, 0.072, 0.046, -Math.PI / 2, 0, 0.7],
];
/** The point `h` up the axis of cell `i` from its foot (in the cell's size) and `x` across, forward, up and across in model space. */
const onCell = (i: number, h: number, x = 0): number[] => {
  const [f, y, xo, b, s, k] = SLOTS[i];
  h *= k;
  const [c, ax] = [Math.cos(b), [Math.cos(b) * Math.sin(s), -Math.sin(b)]];
  return [f + h * ax[1], y + h * c * Math.cos(s), xo + x + h * ax[0]];
};
/** The two insulators on the barrel, forward and the height of their foot. */
const POSTS = [
  [0.2, 0.091],
  [0.255, 0.087],
];
export const posts: number[][] = [];

/**
 * The rail gun's two ceramic insulators standing on its barrel, stacks of four ribbed discs, built
 * once for each of 5 steps of `heat` (0 to 1): from grey green to orange as the gun heats, glowing
 * in its last quarter.
 */
export const insulators = (lod: number, heat = 0): number[] => {
  const h = Math.round(Math.min(Math.max(heat, 0), 1) * 4);
  return (posts[lod * 5 + h] ??= ((out: number[]) => {
    const glows = h > 2;
    const paint: Paint = (_, n) => {
      const lit = mix(CERAMIC[0], CERAMIC[1], Math.max(n[1], 0) ** 1.5 * 0.8);
      const [r, g, b] = mix(glows ? EMBER.map(c => c * 0.5) : lit, EMBER, h / 4);
      return [r, g, glows ? -2 : SHINE, b];
    };
    for (const [f, y] of POSTS) {
      tube(
        out,
        [
          [f, y, 0, 0],
          ...[0, 1, 2, 3].flatMap((k): Station[] => [
            [f, y + 0.002 + k * 0.011, 0.008, 0.008],
            [f, y + 0.005 + k * 0.011, 0.016, 0.016],
            [f, y + 0.008 + k * 0.011, 0.016, 0.016],
            [f, y + 0.011 + k * 0.011, 0.008, 0.008],
          ]),
          [f, y + 0.05, 0.005, 0.005],
          [f, y + 0.053, 0, 0],
        ],
        lod ? 8 : 5,
        paint,
      );
    }
    return out;
  })([]));
};
