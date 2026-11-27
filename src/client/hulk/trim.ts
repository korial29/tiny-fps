import { DECKS, HULL as SHAPE, LINES, SHIP } from '../../shared/beach';
import { hash } from '../../shared/relief';
import type { V, Mat } from './types';
import { ink, MID, CEIL, FLAT, TRIM, WALL, SOOT, off, face, loft } from './common';
import { ARCH, SILL, lines, lining, stations } from './hull';
import { reach } from './inside';
import { cube } from './shapes';

// ---------------------------------------------------------------------------------------------
// The cabin's trim (the user, 2026-11-27: an airliner's): the overhead bins along the main deck,
// rounded coves where the other walls meet a ceiling or a floor, and the windows.

/** The windows' panes, dark, and a shade pulled down over some. */
export const PANE_DARK = ink([0.04, 0.06, 0.09]);
/** The cabin's lighting strips along the ceilings, a cool white glow. */
const GLOW = ink([0.85, 0.88, 0.92], 1, -2);
/** The oxygen masks that dropped from the bins: yellow cups on clear tubes. */
export const MASK = ink([0.75, 0.6, 0.08]);

/**
 * The storeys of a section: their floor and ceiling over the axis (lines of LINES), the deck
 * holed under them and over them (an index in DECKS, -1 none), and whether passengers sat there.
 */
export const STOREYS = (n: number) => [
  { floor: SHIP[n].floor, ceil: LINES[1], under: -1, over: 0, seated: false },
  { floor: DECKS[0], ceil: LINES[4], under: 0, over: 1, seated: true },
  { floor: DECKS[1], ceil: 6.5, under: 1, over: 2, seated: true },
];

/** The lining at x and the height h over the axis, between two of its lines, on the side sg. */
export const wall = (n: number, x: number, h: number, sg: number): V => {
  const l = lines(n);
  const i = Math.max(0, Math.min(l.findIndex(e => e > h) - 1, l.length - 2));
  const t = (h - l[i]) / (l[i + 1] - l[i]);
  const [a, b] = [lining(n, x, i, sg), lining(n, x, i + 1, sg)];
  return a.map((v, k) => v + (b[k] - v) * t);
};

/** Whether a flank of section n is torn anywhere from xa to xb between the heights a and b over the axis. */
export const torn = (n: number, xa: number, xb: number, a: number, b: number) =>
  SHIP[n].tears.some(([p, q, lo, hi]) => p < xb && q > xa && lo < b && hi > a);

/** Whether a hole in deck d runs from xa to xb out to within `w` of the line. */
export const gone = (n: number, d: number, xa: number, xb: number, w: number) =>
  SHIP[n].holes.some(([e, p, q, half]) => e == d && p < xb && q > xa && half >= w);

/** The x the trim of section n is cut at: the lining's stations and every hole's edges. */
const marks = (n: number) => {
  const [xa, xb] = reach(n);
  const all = [
    ...stations(n, SHAPE.sections[n][0], xb),
    ...SHIP[n].holes.flatMap(([, p, q]) => [p, q]),
  ].filter(x => x >= xa && x <= xb);
  return [...new Set(all.map(x => Math.round(x * 100) / 100))].sort((a, b) => a - b);
};

/**
 * A strip along a flank from xa to xb, its profile `pr` (how far in from the lining, and the
 * height over the axis) in materials `m` (one each step of the profile, or none), facing in and
 * down (`up` 1: under a ceiling) or in and up (`up` -1: on a floor). `d` is measured in from the
 * lining at each point's height.
 */
const strip = (
  n: number,
  sg: number,
  xa: number,
  xb: number,
  pr: number[][],
  m: (j: number) => Mat | undefined,
  up = 1,
) => {
  const at = (x: number) =>
    pr.map(([d, h]) => {
      const p = wall(n, x, h, sg);
      return [x, p[1], p[2] - sg * d];
    });
  const a = at(xa);
  // Behind the profile: out past the wall, over the ceiling or under the floor.
  const behind = [(xa + xb) / 2, a[up > 0 ? a.length - 1 : 0][1] + 9 * up, MID + sg * 30];
  loft(a, at(xb), m, behind);
};

/** The bins' profile over the main deck's floor: their underside, the curved door, then a cove up to the ceiling. */
const BIN = [
  [0, 2.05],
  [0.6, 2.0],
  [0.68, 2.12],
  [0.72, 2.45],
  [0.66, 2.78],
  [0.9, 3.25],
  [1.3, 3.58],
  [1.75, 3.7],
];
/** A cove's profile: a quarter round of radius 1 from the wall (0, -1) to the ceiling (1, 0). */
const COVE = [0, 1, 2, 3].map(i => [
  1 - Math.cos((i * Math.PI) / 6),
  Math.sin((i * Math.PI) / 6) - 1,
]);

/** The trim of section n. */
export const trim = (n: number) => {
  const xs = marks(n);
  STOREYS(n).forEach(({ floor, ceil, under, over, seated }, s) => {
    const bins = s == 1;
    // The cove's radius under the ceiling: the hold's is wide, the upper deck's narrow wall short.
    const r = s == 0 ? 0.45 : 0.35;
    for (const sg of [-1, 1]) {
      xs.slice(1).forEach((xb, i) => {
        const xa = xs[i];
        const x = (xa + xb) / 2;
        // Under the canopy the flight deck's own lining is the skin.
        if (xb - xa < 0.05 || (n > 1 && xa >= ARCH - 0.01 && floor >= SILL)) {
          return;
        }
        const w = Math.abs(wall(n, x, ceil, sg)[2] - MID);
        const top = bins
          ? BIN.map(([d, h]) => [d, floor + h])
          : COVE.map(([d, h]) => [d * r, ceil + h * r]);
        if (!torn(n, xa, xb, top[0][1], ceil) && !gone(n, over, xa, xb, w - 2)) {
          strip(n, sg, xa, xb, top, j => (bins && j == 0 ? TRIM : s ? CEIL : WALL));
          // The lighting strip where the profile meets the ceiling, dead here and there.
          const [d, h] = top[top.length - 1];
          if (hash(Math.round(xa * 4), n * 2 + (sg > 0 ? 1 : 0) + s * 8, 85) > 0.3) {
            strip(
              n,
              sg,
              xa,
              xb,
              [
                [d + 0.04, h - 0.012],
                [d + 0.16, h - 0.012],
              ],
              () => GLOW,
            );
          }
          if (bins) {
            doors(n, sg, xa, xb, floor);
          }
        }
        // A small cove at the floor, the wall's foot.
        const foot = [
          [0, floor + 0.12],
          [0.12, floor],
        ];
        if (!torn(n, xa, xb, floor, floor + 0.15) && !gone(n, under, xa, xb, w - 1)) {
          strip(n, sg, xa, xb, foot, () => TRIM, -1);
        }
        if (seated) {
          windows(n, sg, xa, xb, floor + 1.2);
        }
      });
    }
  });
};

/**
 * The bins' doors from xa to xb: a seam every 1.5 m, and now and then a door burst open (the
 * bin a dark hollow, its door up) or an oxygen mask hanging from the panel under it.
 */
const doors = (n: number, sg: number, xa: number, xb: number, floor: number) => {
  const door = (k: number) => BIN.slice(1, 5).map(([d, h]) => [d + k, floor + h]);
  for (let x = Math.ceil(xa / 1.5) * 1.5; x < xb; x += 1.5) {
    if (x - xa > 0.02) {
      strip(n, sg, x - 0.015, x + 0.015, door(0.006), () => TRIM);
    }
    const r = hash(Math.round(x * 4), n * 2 + (sg > 0 ? 1 : 0), 81);
    const end = Math.min(x + 1.5, xb);
    if (r < 0.14 && end - x > 1) {
      // Burst open: the bin's hollow, and its door swung up.
      strip(n, sg, x + 0.03, end - 0.03, door(0.01), () => SOOT);
      strip(
        n,
        sg,
        x + 0.05,
        end - 0.05,
        [
          [0.68, floor + 2.78],
          [0.97, floor + 3.0],
          [1.17, floor + 3.25],
        ],
        () => CEIL,
      );
    }
    if (r > 0.7 && end - x > 1) {
      // An oxygen mask, dropped from the panel under the bin on its tube.
      const k = Math.round(x * 4);
      const t = off(wall(n, x + 0.6, floor + 2.0, sg), [0, -0.03, 0]);
      t[2] -= sg * (0.2 + 0.35 * hash(k, 3, 82));
      const b = [t[0] + 0.03, t[1] - 0.45 - 0.4 * hash(k, 4, 83), t[2]];
      face(
        [
          off(t, [-0.006, 0, 0]),
          off(t, [0.006, 0, 0]),
          off(b, [0.006, 0, 0]),
          off(b, [-0.006, 0, 0]),
        ],
        FLAT,
        off(b, [0, 0, 9]),
      );
      cube(
        b,
        [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
        ],
        [-0.055, -0.1, -0.055],
        [0.055, 0, 0.055],
        MASK,
      );
    }
  }
};

/** Rounded windows along a flank from xa to xb, their middle at the height y over the axis: a bezel, the pane, now and then a shade down. */
const windows = (n: number, sg: number, xa: number, xb: number, y: number) => {
  for (let x = Math.ceil(xa) + 0.5; x < xb - 0.3; x += 1) {
    if (x - xa < 0.3 || torn(n, x - 0.35, x + 0.35, y - 0.4, y + 0.4)) {
      continue;
    }
    /** An octagon, its corners rounding a rectangle, round the window's middle, a by b, `d` in from the wall. */
    const oct = (a: number, b: number, d: number) =>
      [0, 1, 2, 3, 4, 5, 6, 7].map(i => {
        const t = ((i + 0.5) * Math.PI) / 4;
        const [u, v] = [Math.cos(t) * a * 1.25, Math.sin(t) * b * 1.25];
        const [cu, cv] = [Math.max(-a, Math.min(a, u)), Math.max(-b, Math.min(b, v))];
        const p = wall(n, x + cu, y + cv, sg);
        return [x + cu, p[1], p[2] - sg * d];
      });
    const away = [x, SHAPE.axis[n] + y, MID + sg * 20];
    face(oct(0.2, 0.27, 0.012), FLAT, away);
    const shade = hash(Math.round(x * 3), n * 2 + (sg > 0 ? 1 : 0), 84);
    face(oct(0.13, 0.19, 0.02), shade < 0.3 ? WALL : PANE_DARK, away);
  }
};
