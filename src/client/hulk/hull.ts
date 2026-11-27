import { DECKS, HULL as SHAPE, LINES, SHIP, section } from '../../shared/beach';
import { hash, noise } from '../../shared/relief';
import { dress, smooth } from '../mesh';
import { HULL } from '../paint';
import type { V, Mat } from './types';
import {
  ink,
  MID,
  SKIN,
  TRIM,
  IRON,
  BELT,
  PANE,
  sm,
  sub,
  cross,
  mid,
  off,
  QUAD,
  o,
  put,
  face,
  loft,
  teeth,
  stand,
  RAW,
} from './common';
import { setO } from './common';

// ---------------------------------------------------------------------------------------------
// The hull.

/** A smooth sheet through a grid of points, its normals from the grid: `m` each square's material, or none; `k` a point's light; `inv` turns it over. */
export const sheet = (
  g: V[][],
  m: (i: number, j: number) => Mat | undefined,
  k: (p: V) => number = () => 1,
  inv = false,
) => {
  const at = (i: number, j: number) =>
    g[Math.min(Math.max(i, 0), g.length - 1)][Math.min(Math.max(j, 0), g[0].length - 1)];
  const nrm = g.map((row, i) =>
    row.map((_, j) => {
      const n = cross(sub(at(i + 1, j), at(i - 1, j)), sub(at(i, j + 1), at(i, j - 1)));
      const l = Math.hypot(n[0], n[1], n[2]) * (inv ? -1 : 1);
      return l ? [n[0] / l, n[1] / l, n[2] / l] : [0, 1, 0];
    }),
  );
  for (let i = 0; i < g.length - 1; i++) {
    for (let j = 0; j < g[0].length - 1; j++) {
      const mat = m(i, j);
      if (mat) {
        for (const e of [0, 1, 3, 0, 3, 2]) {
          const [a, b] = [i + (e & 1), j + (e >> 1)];
          put(g[a][b], nrm[a][b], mat, k(g[a][b]));
        }
      }
    }
  }
};

/** smooth()'s vertices in a material, each lit by `k` of where it is. */
export const coat = (v: number[], m: Mat, k: (p: V) => number = () => 1) => {
  const keep = o;
  setO([]);
  for (let i = 0; i < v.length; i += 6) {
    put(v.slice(i, i + 3), v.slice(i + 3, i + 6), m, k(v.slice(i, i + 3)));
  }
  const made = o;
  setO(keep);
  return made;
};

/** The heights over the axis the loft's rows run at, up a flank; then the edge of the back, the edge of a hole in it and its middle: half width, height. */
export const ROWS = [
  -7, -6.6, -6, -5, -4, -3, -2.05, -1.75, -0.9, 0, 1, 1.95, 2.25, 2.9, 3.6, 4.3, 5, 5.5, 6, 6.5,
];
export const BACK = [
  [2.75, 6.72],
  [2.5, 6.93],
  [2.3, 7],
  [0, 7],
  [0, 7],
];
export const HALF = ROWS.length + BACK.length;
/** The loft's squares round the hull: twice a flank's. */
export const ROUND = 2 * HALF - 2;
/** The square `q` round the hull, counted up its own flank. */
export const up = (q: number) => (q < HALF - 1 ? q : ROUND - 1 - q);
/** The height a flank's point `j` is at. */
export const high = (j: number) => ROWS[j] ?? BACK[j - ROWS.length][1];

/** The nose, x: where its canopy's rear arch stands, where the windscreen's foot is, its sensor's tip; and how far the tip droops. */
export const [ARCH, FOOT, TIP, DROOP] = [92, 104, 114, 2.4];
/** The canopy's sill over the axis: the upper deck's line. */
export const SILL = DECKS[1];

/**
 * A section's form at x: its width's share (the map's `cut`, each step eased over 2 m), how far
 * the nose has turned from the round section to the chined one, its scale and how far its axis
 * has sunk (the nose tapers straight from the windscreen to its tip).
 */
export const form = (n: number, x: number) => {
  const c = SHIP[n].cut;
  let s = c[0][2];
  for (let i = 1; i < c.length; i++) {
    s += (c[i][2] - c[i - 1][2]) * sm((x - c[i][0] + 1) / 2);
  }
  const t = n > 1 ? Math.max(x - 99, 0) / (TIP - 99) : 0;
  return [s, n > 1 ? sm((x - 94) / 5) : 0, 1 - 0.85 * t, DROOP * t];
};
/** The nose's chined section after Tranquility's ship: a flat top, a slope to the shoulder, another to the chine at the belt, a V keel. */
export const chine = (h: number) =>
  h < 0
    ? Math.max(0, 7 + 2 * h)
    : h >= 5.6
      ? 2.38
      : h >= 3.15
        ? 4.34 - 0.8 * (h - 3.15)
        : 7 - 0.844 * h;
/** The drawn hull's half width at x and a height over the axis. */
export const wide = (n: number, x: number, h: number) => {
  const [s, k, q] = form(n, x);
  return (section(h) + (chine(h) - section(h)) * k) * s * q;
};
/** A point of section `n` at x: `w` from the line on the side `sg`, at the height `h` over the axis as the round section counts it. */
export const spot = (n: number, x: number, w: number, h: number, sg: number): V => {
  const [, k, q, d] = form(n, x);
  return [
    x,
    SHAPE.axis[n] - d + (h > 0 ? h * (1 - 0.2 * k) : Math.max(h, 3.5 * k - 7)) * q,
    MID + sg * w,
  ];
};
/** The hull's skin at x and a height, on a flank. */
export const shell = (n: number, x: number, h: number, sg: number) =>
  spot(n, x, wide(n, x, h), h, sg);
/** The loft's ring at the station x: up red's flank, across the back, down blue's. The nose's lines lean aft over the sill, so the windscreen's edge is one of them. */
export const ring = (n: number, x: number): V[] => {
  const rake = n > 1 && x > ARCH ? (x < FOOT ? (5 * (x - ARCH)) / 12 : (5 * (TIP - x)) / 10) : 0;
  const half = Array.from({ length: HALF }, (_, j) => {
    const h = high(j);
    const xr = x - rake * Math.min(Math.max((h - SILL) / (7 - SILL), 0), 1);
    const [s, k, q] = form(n, xr);
    const b = BACK[j - ROWS.length];
    // The back's edge, then the edge of a hole in it: as far in as the map leaves a rim.
    const w = !b
      ? wide(n, xr, h)
      : (j == HALF - 2 ? 2.5 * s - SHAPE.skin : Math.min(b[0], b[0] + (2.38 - b[0]) * k) * s) * q;
    return (sg: number) => spot(n, xr, w, h, sg);
  });
  return [
    ...half.map(f => f(1)),
    ...half
      .slice(0, -1)
      .reverse()
      .map(f => f(-1)),
  ];
};

/** The stations a section is lofted at: its ends, every edge of a hole, the eased steps of its width, and no two over 2 m apart. */
export const stations = (n: number, x0: number, x1: number) => {
  const { cut, tears, holes } = SHIP[n];
  const marks = [
    x0,
    x1,
    ...tears.flatMap(t => [t[0], t[1]]),
    ...holes.filter(e => e[0] == 2).flatMap(e => [e[1], e[2]]),
    ...cut.slice(1).flatMap(c => [-1, -0.33, 0.33, 1].map(d => c[0] + d)),
  ]
    .filter(x => x >= x0 && x <= x1)
    .sort((a, b) => a - b);
  const out: number[] = [];
  marks.forEach((x, i) => {
    const gap = x - (marks[i - 1] ?? x);
    if (i && gap < 0.05) {
      return;
    }
    const k = Math.ceil(gap / 2);
    for (let e = 1; e < k; e++) {
      out.push(x - (gap * (k - e)) / k);
    }
    out.push(x);
  });
  return out;
};
/** The nose's stations past the arch: narrow ones are the canopy's frame. */
export const AHEAD = [93.5, 95, 95.3, 98, 98.3, 101, 101.3, FOOT, 106.5, 109, 111.5, 113, TIP];
/**
 * The canopy's panes the crash broke, past the wall in the trees where nobody reaches: x0, x1
 * (stations of AHEAD), the heights over the axis (rows of ROWS) and the flank. The flight deck
 * shows through them.
 */
export const SHATTER = [
  [98.3, 101, 2.9, 5, 1],
  [98.3, 101, 3.6, 5.5, -1],
];
export const shattered = (xa: number, xb: number, ha: number, hb: number, sg: number) =>
  SHATTER.some(
    ([p, q, a, b, s]) =>
      s == sg && xa >= p - 0.01 && xb <= q + 0.01 && ha >= a - 0.01 && hb <= b + 0.01,
  );

/** The floors' lines of a section, from its floor up to under its back. */
export const lines = (n: number) => [
  SHIP[n].floor,
  ...LINES.filter(h => h > SHIP[n].floor + 0.5 && h < 7),
];
/** The inner face of the skin at x on the line `i` of lines(): the inner lower corner of the map's row there, plumb from each floor up to the belt. */
export const inner = (n: number, x: number, i: number) => {
  const l = lines(n);
  const a = l[Math.min(i, l.length - 2)];
  const b = l[Math.min(i, l.length - 2) + 1];
  const low = a < DECKS[0] ? l[0] : a < DECKS[1] ? DECKS[0] : DECKS[1];
  return Math.max(Math.min(section(b), section(low)) * form(n, x)[0] - SHAPE.skin, 0.05);
};
export const lining = (n: number, x: number, i: number, sg: number): V => [
  x,
  SHAPE.axis[n] + lines(n)[i],
  MID + sg * inner(n, x, i),
];

/** Whether h is a deck's line. */
const deck = (h: number) => DECKS.some(e => Math.abs(e - h) < 1e-6);

/** Whether the map leaves the skin open between two heights of a flank, from one station to the next. */
export const open = (n: number, xa: number, xb: number, ha: number, hb: number) =>
  SHIP[n].tears.some(
    ([p, q, a, b]) => xa >= p - 0.01 && xb <= q + 0.01 && ha >= a - 0.01 && hb <= b + 0.01,
  );
/** Whether the back is holed there. */
export const holed = (n: number, xa: number, xb: number) =>
  SHIP[n].holes.some(([d, p, q]) => d == 2 && xa >= p - 0.01 && xb <= q + 0.01);

/** The broken ends of a section: the tail's east, both of the middle, the nose's west. */
export const ends = (n: number) => [
  ...(n ? [[SHAPE.sections[n][0], -1]] : []),
  ...(n < 2 ? [[SHAPE.sections[n][1], 1]] : []),
];
/** The light left on burnt skin: dark, yet its panels' lines still read (at 0.1 it was a flat black void). */
const BURNT = 0.22;
/**
 * How much of its paint a point of section n's skin has left: burnt black at a broken end and
 * round a tear or a hole, stained along the belly, clean elsewhere.
 */
export const paint = (n: number) => {
  const c = SHAPE.axis[n];
  const torn = ends(n).map(e => e[0]);
  const { tears, holes } = SHIP[n];
  return (p: V) => {
    const [x, h, z] = [p[0], p[1] - c, Math.abs(p[2] - MID)];
    const f = 0.9 * noise(x / 1.7, p[1] / 1.7 + p[2] / 2.3, 9);
    let d = Math.min(9, ...torn.map(t => Math.abs(x - t)));
    for (const [x0, x1, a, b] of tears) {
      if (z > 2.4) {
        d = Math.min(d, Math.hypot(Math.max(x0 - x, x - x1, 0), Math.max(a - h, h - b, 0)));
      }
    }
    for (const [deck, x0, x1] of holes) {
      if (deck == 2 && h > 5) {
        d = Math.min(d, Math.hypot(Math.max(x0 - x, x - x1, 0), 0.5 * z) * 1.4);
      }
    }
    return (
      (BURNT + (1 - BURNT) * sm((d - f) / 1.1)) *
      (0.5 + 0.5 * sm((h + 6.3 + 0.5 * f) / 2.4)) *
      (0.93 + 0.07 * noise(x / 5, (p[1] + p[2]) / 4, 4 + n))
    );
  };
};

/** The seven segments of a figure in a cell 1 by 2 (x0, y0, x1, y1), and the hull number's figures as bits of them. */
export const SEG = [
  [0, 1.75, 1, 2],
  [0.75, 1, 1, 2],
  [0.75, 0, 1, 1],
  [0, 0, 1, 0.25],
  [0, 0, 0.25, 1],
  [0, 1, 0.25, 2],
  [0, 0.875, 1, 1.125],
];
export const NUMBER = [63, 102, 91, 7];

/** An engine bell, its throat at the origin, 1.8 m long and 1.7 m at the lip, dark inside. */
export const BELL = dress(
  smooth(
    [
      [0, -0.1],
      [0.7, -0.1],
      [1, 0.6],
      [1.5, 1.4],
      [1.7, 1.8],
      [1.5, 1.72],
      [0.6, 0.3],
      [0, 0.3],
    ],
    14,
  ),
  [0.15, 0.14, 0.14],
);

/** A fin's outline, chord by height from its root's trailing end; and the one that snapped half way up. */
export const FIN = [
  [0, 0],
  [11, 0],
  [12.5, 1.2],
  [10.5, 8.5],
  [9.2, 10],
  [6.4, 10],
  [5.2, 8.8],
];
export const SNAPPED = [
  ...FIN.slice(0, 3),
  [11.6, 4.4],
  [10.2, 3.5],
  [9, 5.2],
  [7.4, 4],
  [5.9, 5.6],
  [3.3, 5.5],
];

/** Torn metal round an opening of the skin: teeth on each edge of the line `l`, reaching `d` into it. */
export const ragged = (l: V[], d: V, c: V) =>
  l.slice(1).forEach((b, i) => teeth(l[i], b, d, 2, SKIN, 0.14, c));

/** A section's outer skin: one loft, holed where the map is; its torn ends, the edges of its holes in the skin's thickness. */
/** `only`: the canopy's glass alone instead of the skin. */
export const skin = (n: number, only?: 'glass') => {
  const [x0, x1] = SHAPE.sections[n];
  const c = SHAPE.axis[n];
  const xs = n > 1 ? [...stations(n, x0, ARCH), ...AHEAD] : stations(n, x0, x1);
  const lit = paint(n);
  const axis = (x: number) => [x, c, MID];
  sheet(
    xs.map(x => ring(n, x)),
    (i, q) => {
      const j = up(q);
      const [xa, xb, ha, hb] = [xs[i], xs[i + 1], high(j), high(j + 1)];
      if (
        j == HALF - 2
          ? holed(n, xa, xb)
          : open(n, xa, xb, ha, hb) || (n > 1 && shattered(xa, xb, ha, hb, q < HALF - 1 ? 1 : -1))
      ) {
        return undefined;
      }
      // The canopy: the skin's own squares over the sill, from the arch to the windscreen's foot, glazed; the narrow ones and the back's edge are its frame.
      const pane =
        xa >= ARCH &&
        xb <= FOOT &&
        xb - xa > 0.5 &&
        ha >= SILL &&
        (hb <= 6.5 || (j > HALF - 4 && xa >= 98));
      if (only || pane) {
        return only && pane ? PANE : undefined;
      }
      return ha == -0.9 ? BELT : SKIN;
    },
    lit,
  );
  if (only) {
    return;
  }
  const l = lines(n);
  for (const sg of [-1, 1]) {
    // The tears, in the thickness: the panels' edge in flat grey between the skin and its lining (a texture's lines shimmered on so thin a face), bent teeth outside.
    for (const [p, q, a, b] of SHIP[n].tears) {
      const hs = l.map((h, i) => [h, i]).filter(([h]) => h >= a && h <= b);
      const mid = [(p + q) / 2, c + (a + b) / 2, MID + sg * 6];
      for (const [x, d] of [
        [p, 0.4],
        [q, -0.4],
      ]) {
        const out = hs.map(([h]) => shell(n, x, h, sg));
        loft(
          out,
          hs.map(([, i]) => lining(n, x, i, sg)),
          () => TRIM,
          mid,
          undefined,
          undefined,
          true,
        );
        ragged(out, [d, 0, sg * 0.12], axis(x));
      }
      const along = xs.filter(x => x >= p && x <= q);
      for (const [[h, i], d] of [
        [hs[0], 0.35],
        [hs[hs.length - 1], -0.35],
      ] as [number[], number][]) {
        // A sill on a deck's top or a lintel on its underside goes 2 cm into the deck: it does not fight its face.
        const y = deck(h) ? -0.02 : deck(h + 0.3) ? 0.02 : 0;
        const out = along.map(x => off(shell(n, x, h, sg), [0, y, 0]));
        loft(
          out,
          along.map(x => off(lining(n, x, i, sg), [0, y, 0])),
          () => TRIM,
          mid,
          undefined,
          undefined,
          true,
        );
        ragged(out, [0, d, sg * 0.12], axis(p));
      }
    }
  }
  for (const [x, d] of ends(n)) {
    // A broken end: the skin torn past it, and the ring of its thickness.
    const rim = ring(n, x);
    const torn = rim.map((p, i) => off(p, [d * (0.15 + 1.1 * hash(i, n, 3 + d)), 0, 0]));
    loft(
      rim,
      torn,
      () => SKIN,
      axis(x),
      rim.map(() => BURNT),
    );
    // Its back, 2 cm in, bare metal: seen from inside, the sheet's outer face read as a black void.
    const back = (p: V) => {
      const r = sub(p, axis(p[0]));
      const l = Math.hypot(r[1], r[2]) || 1;
      return [p[0], p[1] - (0.02 * r[1]) / l, p[2] - (0.02 * r[2]) / l];
    };
    loft(rim.map(back), torn.map(back), () => RAW, axis(x), undefined, undefined, true);
    for (const sg of [-1, 1]) {
      loft(
        l.map(h => shell(n, x, h, sg)),
        l.map((_, i) => lining(n, x, i, sg)),
        j => (j & 1 ? TRIM : IRON),
        axis(x - 9 * d),
      );
    }
  }
};

/** The tail's stern, its bell, the stubs of its two engines' pylons, the fins on its shoulders and the number on its flanks. */
export const tail = () => {
  const [x0] = SHAPE.sections[0];
  const c = SHAPE.axis[0];
  const rim = ring(0, x0);
  rim.slice(1).forEach((p, j) => face([[x0, c, MID], rim[j], p], IRON, [x0 + 9, c, MID], 0.8));
  stand(BELL, [x0 + 0.2, c + 1.6, MID], [-1, 0, 0], [1.75, 1.75, 1.75]);
  for (const sg of [-1, 1]) {
    // A pylon's root, faired into the flank, torn where the engine left. Its inner side stays
    // in the skin's thickness, out of the cabin's lining: it runs where the hull is widest, from
    // x 12.6 to 20.85, and reaches 0.7 m inside the skin at most (the lining is 1 m in).
    const at = [12.6, c + 0.4, MID + sg * (wide(0, 16, 0.4) + 0.3)];
    stand(
      coat(
        smooth(
          [
            [0, 0],
            [0.7, 0.35],
            [1, 2.4],
            [1, 6.4],
            [0.6, 8],
            [0, 8.25],
          ],
          10,
        ),
        SKIN,
        p => 0.25 + 0.75 * sm((-p[2] - 2) / 5) * sm(1.6 - sg * p[0]),
      ),
      at,
      [1, 0, 0],
    );
    const stub = [2.4, 6].map(u => [at[0] + u, at[1], at[2] + sg * 0.95]);
    loft(
      stub,
      stub.map(p => off(p, [0, 0.5, 0])),
      () => IRON,
      at,
    );
    teeth(stub[0], stub[1], [0, 0.2, sg * 0.8], 7, SKIN, 0.16, at);
    teeth(off(stub[0], [0, 0.5, 0]), off(stub[1], [0, 0.5, 0]), [0, 0.1, sg * 0.8], 5, SKIN, 0.2);
    // A fin, canted out from the shoulder and swept aft; blue's snapped half way up.
    const cant = 0.45;
    const fin = (t: number) =>
      (sg > 0 ? FIN : SNAPPED).map(([u, v]) => {
        const x = x0 + 14 - u;
        const w = wide(0, Math.max(x, x0), 5.3) - 0.3 + v * Math.sin(cant);
        const e = t * (0.35 - 0.017 * v);
        return [
          x,
          c + 5.3 + v * Math.cos(cant) - e * Math.sin(cant),
          MID + sg * (w + e * Math.cos(cant)),
        ];
      });
    const [p, q] = [-1, 1].map(t => {
      const f = fin(t);
      face(
        f,
        SKIN,
        fin(-t)[3],
        f.map((_, i) => (sg < 0 && i > 2 ? 0.2 : i > 2 ? 0.95 : 0.8)),
      );
      return f;
    });
    loft([...p, p[0]], [...q, q[0]], () => IRON, mid(p[0], p[3]));
    // The number, read from each side.
    NUMBER.forEach((bits, i) =>
      SEG.forEach(([u0, v0, u1, v1], b) => {
        if ((bits >> b) & 1) {
          const q4 = QUAD.map(e => {
            const [x, h] = [
              16.6 + sg * ((i - 2) * 1.5 + (e & 1 ? u1 : u0) * 1.05),
              2.5 + (e & 2 ? v1 : v0) * 1.05,
            ];
            return spot(0, x, wide(0, x, h) + 0.03, h, sg);
          });
          face(q4, ink([0.05, 0.08, 0.16], 1, HULL), [17, c, MID]);
        }
      }),
    );
  }
};

/** The nose's blunt tip and its probe. */
export const tip = () => {
  const tip = ring(2, TIP);
  const c = mid(tip[0], tip[HALF - 1]);
  tip.slice(1).forEach((p, j) => face([off(c, [0.5, 0, 0]), tip[j], p], IRON, [0, c[1], MID]));
  stand(
    dress(
      smooth(
        [
          [0, 0],
          [0.22, 0],
          [0.08, 2.4],
          [0, 2.4],
        ],
        6,
      ),
      [0.2, 0.2, 0.22],
    ),
    off(c, [0.3, -0.1, 0]),
    [1, 0, 0],
  );
};

/** The fairings along the flanks, whose tops are ledges. */
export const fairings = () => {
  SHIP.forEach(({ fair }, n) => {
    const lit = paint(n);
    for (const [p, q, e] of fair) {
      // The nose's last fairing runs out along the chine.
      const far = n > 1 && q > ARCH ? FOOT : q;
      const steps = Math.ceil((far - p) / 2);
      const xs = Array.from({ length: steps + 1 }, (_, i) => p + (i * (far - p)) / steps);
      for (const sg of [-1, 1]) {
        const cut = (x: number) => {
          const b = wide(n, x, 0);
          const out =
            x > q
              ? (SHAPE.r + e - wide(n, q, 0)) * (1 - (x - q) / (far - q)) + 0.05
              : SHAPE.r + e - b;
          return [
            [wide(n, x, SILL) - 0.15, SILL],
            [b + out - 0.3, SILL],
            [b + out - 0.08, SILL - 0.08],
            [b + out, SILL - 0.3],
            [b + out - 0.06, SILL - 0.75],
            [b + 0.6 * out, 0.2],
            [b + 0.25 * out, -0.8],
            [wide(n, x, -1.7) - 0.15, -1.7],
          ].map(([w, h]) => spot(n, x, w, h, sg));
        };
        sheet(xs.map(cut), () => SKIN, lit, sg > 0);
        for (const [x, d] of [
          [p, -1],
          [q, 1],
        ]) {
          if (x == far || x == p) {
            const end = cut(x);
            face(end, IRON, [x - 9 * d, 0, MID + sg * 8]);
            ragged(end.slice(0, 6), [d * 0.5, 0, 0], [x, SHAPE.axis[n], MID]);
          }
        }
      }
    }
  });
};
