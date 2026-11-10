// The outside of the moon base (docs/MOON.md), red's half: seams, portholes, antennas and lights on
// the dome, the tubes and the modules that moonbase.ts draws. moonscape.ts mirrors it for blue as
// it is, so nothing here is in a team's colour. Drawn only: thin, or out of a player's way.
import { DOME, HEAD, MODULES, MOUTHS, TUBES, WALL } from '../shared/moonbase';
import { TAU } from '../shared/physics';
import { glow } from './flag';
import { STRIDE, dress, place, segment, smooth, unit } from './mesh';
import type { Vec3 } from './mesh';
import { GAPS, INDOORS, LINTELS, UP, box, face, lit } from './moonbase';

const [CX, CZ] = DOME;
const R = 22.4;
/** How high the beacon of the dome's aerial is. */
export const TIP = 25.4;
/** The angle of a side of the drawn dome. */
const STEP = TAU / 48;
/** Seams and ribs, dark fittings, bare metal, then the glows. */
export const SEAM = [0.4, 0.42, 0.46];
const [IRON, STEEL, WARM, COOL, AMBER, RED, GREEN] = [
  [0.16, 0.17, 0.2],
  [0.6, 0.62, 0.66],
  [1, 0.8, 0.45],
  [0.7, 0.9, 1],
  [1, 0.6, 0.2],
  [1, 0.12, 0.08],
  [0.35, 1, 0.5],
];
const SIDE: Vec3 = [0.6, 0.64, 0.48];
const ROD = dress(
  smooth(
    [
      [1, 0],
      [1, 1],
    ],
    6,
  ),
  [1, 1, 1],
);
const BEAD = dress(
  smooth(
    [
      [0, -1],
      [1, 0],
      [0, 1],
    ],
    6,
  ),
  [1, 1, 1],
);
/** A dish 1 m in radius, hollow toward where its length runs. */
const DISH = dress(
  smooth(
    [
      [0, 0],
      [1, 0.4],
      [0.93, 0.42],
      [0, 0.12],
    ],
    12,
  ),
  [0.82, 0.84, 0.88],
);
const rod = (o: number[], a: Vec3, b: Vec3, r: number, rgb = STEEL) =>
  segment(o, ROD, a, b, SIDE, 1, r, rgb);
/** A lamp: a glowing bead, or a dull one with k 0. */
const bead = (o: number[], at: Vec3, r: number, rgb: number[], k = 2.2) => {
  const from = o.length;
  place(o, BEAD, at, UP, [0, 0, 0], r, rgb);
  if (k) {
    glow(o, from, k);
  }
};
/** A light flush in the ground. */
const dot = (o: number[], x: number, z: number) =>
  lit(o, 1.8, () =>
    face(
      o,
      [
        [x - 0.15, 0.03, z - 0.15],
        [x + 0.15, 0.03, z - 0.15],
        [x + 0.15, 0.03, z + 0.15],
        [x - 0.15, 0.03, z + 0.15],
      ],
      COOL,
      [x, -5, z],
    ),
  );

/**
 * A point of the dome as drawn (48 flat sides), `e` proud of it, at the angle t about its axis: h
 * metres up the drum, or past 5 the angle up the shell's arc more.
 */
const skin = (t: number, h: number, e = 0.02): Vec3 => {
  const a = Math.max(h - 5, 0);
  const [c, s] = [Math.cos(a), Math.sin(a)];
  const n = unit([c / R, s / 12, 0]);
  const r =
    (R * c * Math.cos(STEP / 2)) / Math.cos((((t % STEP) + STEP) % STEP) - STEP / 2) + e * n[0];
  return [CX + r * Math.cos(t), Math.min(h, 5) + 12 * s + e * n[1], CZ + r * Math.sin(t)];
};
/** The drum's openings (the door, the tubes) and a margin, as angles; whether an angle is off them. */
const OPEN = GAPS.map(([g0, g1]) => [g0 - 0.03, g1 + 0.03]);
const free = (t: number) => !OPEN.some(([g0, g1]) => [t, t - TAU].some(s => s > g0 && s < g1));

/**
 * The portholes: the middle (x, y, z), the way out (x, z), the radius, and whether the wall is one
 * to see through (a module's: it gets a pane inside too). On the drum over every other window but
 * at its openings, two on each end wall of a module but where a tube comes in.
 */
export const PORTHOLES = [
  ...Array.from({ length: 35 }, (_, i) => ((2 * i + 1) * TAU) / 70)
    .filter(t => free(t - 0.03) && free(t + 0.03))
    .map(t => {
      const [c, s] = [Math.cos(t), Math.sin(t)];
      return [CX + (R + 0.02) * c, 4.02, CZ + (R + 0.02) * s, c, s, 0.38, 0];
    }),
  ...MODULES.flatMap(({ min, max }) =>
    [-1, 1].flatMap(s =>
      [-2, 2].map(d => [
        (s > 0 ? max[0] : min[0]) + 0.02 * s,
        3.1,
        (min[2] + max[2]) / 2 + d,
        s,
        0,
        0.45,
        1,
      ]),
    ),
  ).filter(
    ([x, , z]) =>
      !TUBES.some(
        t => x > t.min[0] - 0.5 && x < t.max[0] + 0.5 && z > t.min[2] - 0.6 && z < t.max[2] + 0.6,
      ),
  ),
];
/** A disc of 12 sides about a porthole's middle, e out from it. */
const disc = (o: number[], [x, y, z, nx, nz]: number[], r: number, e: number, rgb: number[]) =>
  face(
    o,
    Array.from({ length: 12 }, (_, i): Vec3 => {
      const c = r * Math.cos((i * TAU) / 12);
      return [x + e * nx - nz * c, y + r * Math.sin((i * TAU) / 12), z + e * nz + nx * c];
    }),
    rgb,
    [x - nx, y, z - nz],
  );
const portholes = (o: number[]) => {
  for (const p of PORTHOLES) {
    const r = p[5];
    disc(o, p, r + 0.1, 0, IRON);
    lit(o, 0.7, () => disc(o, p, r, 0.015, WARM));
    if (p[6]) {
      // Seen from the room: a dark frame and grey glass on the lining, as its windows.
      const from = o.length;
      const q = [p[0], p[1], p[2], -p[3], -p[4]];
      disc(o, q, r + 0.1, WALL + 0.06, [0.04, 0.04, 0.05]);
      disc(o, q, r, WALL + 0.08, [0.45, 0.48, 0.5]);
      for (let i = from; i < o.length; i += STRIDE) {
        [o[i + 3], o[i + 4], o[i + 5], o[i + 8]] = [...INDOORS, -2];
      }
    }
  }
};

/**
 * The dome: seams between plates up the shell (rings, and meridians staggered row on row), a band
 * where the shell springs, plates round the drum's windows, a dark foot with a strip of light, a
 * second lit frame round the door and lights in the ground up to it, an aerial on top.
 */
const dome = (o: number[]) => {
  const q = (p: Vec3[], rgb = SEAM) => face(o, p, rgb, [CX, 5, CZ]);
  /** A band round the dome from the angle t0 to t1, between two heights, bent at the corners of its sides. */
  const band = (t0: number, t1: number, lo: number, hi: number, rgb?: number[], e?: number) => {
    for (let t = t0; t < t1 - 1e-9;) {
      const n = Math.min(t1, (Math.floor(t / STEP + 1e-9) + 1) * STEP);
      q([skin(t, lo, e), skin(n, lo, e), skin(n, hi, e), skin(t, hi, e)], rgb);
      t = n;
    }
  };
  for (const [t0, t1] of [
    [OPEN[0][1], OPEN[1][0]],
    [OPEN[1][1], OPEN[0][0] + TAU],
  ]) {
    band(t0, t1, 0, 0.45, IRON);
    lit(o, 1.6, () => band(t0, t1, 0.16, 0.3, COOL, 0.035));
    band(t0, t1, 3.18, 3.32);
  }
  band(0, TAU, 4.8, 5.012, IRON, 0.03);
  // Between the windows.
  for (let i = 0; i < 70; i++) {
    const t = ((i + 0.5) * TAU) / 70;
    const d = 0.07 / R;
    if (free(t)) {
      q([skin(t - d, 0.45), skin(t + d, 0.45), skin(t + d, 4.8), skin(t - d, 4.8)]);
    }
  }
  for (let j = 0; j < 9; j++) {
    const [a, b] = [(j * TAU) / 40, ((j + 1) * TAU) / 40];
    if (j) {
      const d = 0.09 / Math.hypot(R * Math.sin(a), 12 * Math.cos(a));
      band(0, TAU, 5 + a - d, 5 + a + d);
    }
    const m = j < 6 ? 2 : j < 8 ? 4 : 8;
    for (let i = ((j % 2) * m) / 2; i < 48; i += m) {
      const [t, d0, d1] = [i * STEP, 0.08 / (R * Math.cos(a)), 0.08 / (R * Math.cos(b))];
      q([skin(t - d0, 5 + a), skin(t + d0, 5 + a), skin(t + d1, 5 + b), skin(t - d1, 5 + b)]);
    }
  }
  // Round the portal of moonbase.ts: two posts and a beam more, an amber strip on each.
  const [, mz, w, h, d] = MOUTHS[0];
  const z = CZ + mz - d;
  for (const [x0, x1, y0] of [
    [-w - 0.62, -w - 0.3, 0],
    [w + 0.3, w + 0.62, 0],
    [-w - 0.62, w + 0.62, h + 0.3],
  ]) {
    box(o, [CX + x0, y0, z - 0.04], [CX + x1, h + 0.62, z + 0.6], IRON);
    lit(o, 1.5, () =>
      face(
        o,
        [
          [x0 + 0.1, y0 + 0.1],
          [x1 - 0.1, y0 + 0.1],
          [x1 - 0.1, h + 0.52],
          [x0 + 0.1, h + 0.52],
        ].map(([x, y]): Vec3 => [CX + x, y, z - 0.055]),
        AMBER,
        [CX, 1, CZ],
      ),
    );
  }
  for (let i = 1; i < 7; i++) {
    for (const x of [-2.6, 2.6]) {
      dot(o, CX + x, z - 2.5 * i);
    }
  }
  // The aerial: a foot, a mast, three cross-bars, a red beacon.
  const up = (y: number, x = 0, s = 0): Vec3 => [CX + x, y, CZ + s];
  bead(o, up(17), 0.7, IRON, 0);
  rod(o, up(17), up(TIP - 0.3), 0.11);
  [1.9, 1.5, 1.1].forEach((l, i) => {
    const y = 20 + 1.6 * i;
    rod(o, i & 1 ? up(y, 0, -l) : up(y, -l), i & 1 ? up(y, 0, l) : up(y, l), 0.06);
  });
  bead(o, up(TIP), 0.34, RED);
};

/** Hoops round the tubes between the ribs of moonbase.ts, a lamp on each side of each. */
const tubes = (o: number[]) =>
  TUBES.forEach(({ min, max }, n) => {
    const k = n ? 2 : 0;
    const j = 2 - k;
    const [a0, b0] = [min[k], n ? TUBES[0].min[2] : max[k]];
    for (let i = 1; a0 + (i * 5) / 3 < b0 - 1; i++) {
      if (i % 3) {
        const [lo, hi]: Vec3[] = [
          [0, 0, 0],
          [0, 3.53, 0],
        ];
        [lo[k], hi[k]] = [a0 + (i * 5) / 3 - 0.06, a0 + (i * 5) / 3 + 0.06];
        for (const s of [0, 1]) {
          lo[j] = s ? max[j] : min[j] - 0.12;
          hi[j] = lo[j] + 0.12;
          box(o, lo, hi, SEAM, 12 | ((k ? 32 : 2) >> s));
          const at = s ? hi[j] + 0.015 : lo[j] - 0.015;
          lit(o, 1.8, () =>
            face(
              o,
              [
                [lo[k] + 0.015, 2.7],
                [hi[k] - 0.015, 2.7],
                [hi[k] - 0.015, 2.9],
                [lo[k] + 0.015, 2.9],
              ].map(([a, y]) => {
                const v: Vec3 = [0, y, 0];
                [v[k], v[j]] = [a, at];
                return v;
              }),
              COOL,
              [(min[0] + max[0]) / 2, 2.8, (min[2] + max[2]) / 2],
            ),
          );
        }
        [lo[j], hi[j], lo[1]] = [min[j] - 0.12, max[j] + 0.12, 3.5];
        box(o, lo, hi, SEAM, 4 | (k ? 48 : 3));
      }
    }
  });

/**
 * The modules: a coping and a plinth round each, ribs between the windows of the long walls, a
 * vent on an end wall with no door, a lamp and a sensor over each airlock and lights in the ground
 * out from it, a dish on the first roof's corner and whip aerials along the second's end.
 */
const modules = (o: number[]) =>
  MODULES.forEach(({ min, max }, n) => {
    for (const k of [0, 2]) {
      const j = 2 - k;
      for (const s of [-1, 1]) {
        const at = s > 0 ? max[k] : min[k];
        /** The face of a box that is in the wall. */
        const IN = (k ? 1 : 16) * (s > 0 ? 1 : 2);
        /** A point a along the wall, y up, e out of it; a box between two; a flat piece e out. */
        const P = (a: number, y: number, e: number): Vec3 => {
          const v: Vec3 = [0, y, 0];
          [v[k], v[j]] = [at + s * e, a];
          return v;
        };
        const B = (p: Vec3, q: Vec3, rgb: number[], skip = 0) =>
          box(
            o,
            p.map((v, i) => Math.min(v, q[i])) as Vec3,
            p.map((v, i) => Math.max(v, q[i])) as Vec3,
            rgb,
            skip,
          );
        const F = (a0: number, y0: number, a1: number, y1: number, e: number, rgb: number[]) =>
          face(o, [P(a0, y0, e), P(a1, y0, e), P(a1, y1, e), P(a0, y1, e)], rgb, P(a0, y0, -1));
        // The wall's doorway, if it has one: from, to, how high to keep clear, and an airlock's middle (a tube's door is wider).
        const [door] = LINTELS.filter(
          l =>
            Math.abs((s > 0 ? l.max[k] : l.min[k]) - at) < 0.01 &&
            l.min[j] > min[j] &&
            l.max[j] < max[j],
        ).map(l => {
          const c = (l.min[j] + l.max[j]) / 2;
          return l.max[j] - l.min[j] > 3
            ? [c - 2.25, c + 2.25, 3.62, 0]
            : [c - 1.32, c + 1.32, HEAD + 0.14, c];
        });
        B(P(min[j] - 0.06, 4.7, 0), P(max[j] + 0.06, 5, 0.06), IRON, IN | (k ? 48 : 3));
        for (const [a, b] of door
          ? [
              [min[j], door[0]],
              [door[1], max[j]],
            ]
          : [[min[j], max[j]]]) {
          B(P(a, 0, 0), P(b, 0.3, 0.04), SEAM, IN | 4);
        }
        for (let i = 1; k && i < 7; i++) {
          const x = min[0] + 2 * i;
          B(
            P(x - 0.07, door && x > door[0] && x < door[1] ? door[2] : 0.3, 0),
            P(x + 0.07, 4.7, 0.06),
            SEAM,
            IN | 12,
          );
        }
        const c = (min[j] + max[j]) / 2;
        if (!k && !door) {
          F(c - 1.1, 0.9, c + 1.1, 1.9, 0.02, IRON);
          for (let i = 0; i < 4; i++) {
            F(c - 1, 1.05 + 0.2 * i, c + 1, 1.15 + 0.2 * i, 0.035, STEEL);
          }
        }
        if (door?.[3]) {
          const m = door[3];
          B(P(m - 0.5, 2.95, 0), P(m + 0.5, 3.05, 0.22), IRON, IN);
          lit(o, 1.8, () => B(P(m - 0.4, 2.83, 0), P(m + 0.4, 2.95, 0.12), WARM, IN | 8));
          // The sensors: an arm, a radar bar with a status light, a stub aerial with a beacon.
          B(P(m - 0.05, 4.1, 0), P(m + 0.05, 4.2, 0.5), IRON, IN);
          B(P(m - 0.5, 4.2, 0.32), P(m + 0.5, 4.42, 0.5), STEEL);
          lit(o, 2, () => F(m - 0.42, 4.27, m - 0.3, 4.35, 0.515, GREEN));
          rod(o, P(m + 0.35, 4.42, 0.41), P(m + 0.35, 5.4, 0.41), 0.03);
          bead(o, P(m + 0.35, 5.45, 0.41), 0.07, RED);
          for (const e of [1.5, 3.5, 5.5]) {
            for (const a of [m - 1.5, m + 1.5]) {
              const [x, , z] = P(a, 0, e);
              dot(o, x, z);
            }
          }
        }
      }
    }
    if (n) {
      const x = max[0] - 0.7;
      box(o, [x - 0.3, 5, min[2] + 2], [x + 0.3, 5.2, max[2] - 2], IRON);
      [3.4, 4.6, 2.8].forEach((h, i) => {
        const z = min[2] + 2.5 + 1.5 * i;
        rod(o, [x, 5.2, z], [x, 5.2 + h, z], 0.04);
        bead(o, [x, 5.26 + h, z], 0.07, i & 1 ? RED : COOL);
      });
    } else {
      const at: Vec3 = [max[0] - 1.4, 6.35, min[2] + 1.4];
      const to = (l: number): Vec3 => [at[0] + 0.6 * l, at[1] + 0.8 * l, at[2]];
      box(o, [at[0] - 0.4, 5, at[2] - 0.4], [at[0] + 0.4, 5.12, at[2] + 0.4], IRON);
      rod(o, [at[0], 5, at[2]], at, 0.16);
      bead(o, at, 0.26, IRON, 0);
      segment(o, DISH, to(0.1), to(1.1), SIDE, 1, 1.15);
      rod(o, to(0.2), to(1.05), 0.03);
      bead(o, to(1.1), 0.08, RED);
    }
  });

/** The outside of red's half of the base, on what moonbase() draws. */
export const hull = (o: number[]): void => {
  dome(o);
  tubes(o);
  modules(o);
  portholes(o);
};
