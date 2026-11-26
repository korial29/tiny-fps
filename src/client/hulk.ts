// Landfall's scenery (docs/BEACH.md): the crashed ship and its debris, drawn once on the map's
// boxes (shared/beach.ts), which are ghosts: what is drawn here is what stops a runner.
// The hull is a smooth loft through the map's own section(), each row of collision a chord of it;
// its holes are the map's tears, cut along the loft's lines. Gloss-white paint (HULL, a layer the
// shader mirrors the sky in, compiled only into Landfall's program), textures inside, a few glows.
import {
  DECKS,
  ENGINES,
  HULL as SHAPE,
  LAYOUT,
  LINES,
  SHIP,
  WING,
  ZED,
  edge,
  section,
  thick,
} from '../shared/beach';
import type { Piece } from '../shared/beach';
import { TEAM_TINT } from '../shared/map';
import { ground, hash, noise, raise } from '../shared/relief';
import { TEX } from '../shared/types';
import type { World, WorldDef } from '../shared/world';
import { SHINE, dress, place, smooth } from './mesh';
import type { Vec3 } from './mesh';
import { CANOPY, HULL } from './paint';
import { SAND } from './shore';

type V = number[];
/** A material: a texture (`l` its layer, c[0] its light, `s` its tiles a metre) or a flat paint (`l` under 0, `c` its colour). */
interface Mat {
  l: number;
  c: V;
  s: number;
}
const tex = (l: number, k = 1, s = 1): Mat => ({ l, c: [k], s });
const ink = (c: V, k = 1, l = -1): Mat => ({ l, c: c.map(v => v * k), s: 1 });

const MID = ZED / 2;
const WHITE = ink([0.68, 0.69, 0.71], 1, HULL);
const SKIN = WHITE;
const GIRDER = tex(TEX.STEEL, 0.45);
const PLATE = tex(TEX.METAL, 0.7);
const SOOT = ink([0.03, 0.03, 0.035]);
const IRON = ink([0.13, 0.135, 0.15]);
const STRIPE = [0.8, 0.3, 0.04];
const BELT = ink([1, 0.36, 0.05], 1, HULL);
const GLASS = ink([0.03, 0.06, 0.09], 1, SHINE);
/** The canopy's glass: the shader's own layer, drawn blended (paint.ts); no colour of its own here. */
const PANE = ink([0, 0, 0], 1, CANOPY);
/** Dry sand, as shore.ts paints it. */
const DUNE = ink([0.64, 0.59, 0.48], 1, SAND);
/** An emergency lamp's glow. */
const LAMP = ink([1, 0.62, 0.25], 1, -2);
const DOWN = [0, -99, 0];

const sm = (t: number) => {
  t = Math.min(Math.max(t, 0), 1);
  return t * t * (3 - 2 * t);
};
const sub = (a: V, b: V) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V, b: V) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (a: V) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const mid = (a: V, b: V) => a.map((v, i) => (v + b[i]) / 2);
/** `a` moved by k times `d`. */
const off = (a: V, d: V, k = 1) => a.map((v, i) => v + d[i] * k);
/** A rectangle across two axes: corner `i` of 4 picks a or b on each. */
const QUAD = [0, 1, 3, 2];

/** What is being drawn. */
let o: number[] = [];
/** The sand's height. */
let gy = (_x: number, _z: number) => 0;

const put = (p: V, n: V, m: Mat, k: number) => {
  if (m.l < 0) {
    o.push(p[0], p[1], p[2], n[0], n[1], n[2], m.c[0] * k, m.c[1] * k, m.l, m.c[2] * k);
  } else {
    // A texture runs in world metres on the plane the face is nearest, as on a brush.
    const [u, v] =
      Math.abs(n[1]) > 0.7 ? [p[0], p[2]] : Math.abs(n[0]) > 0.7 ? [p[2], p[1]] : [p[0], p[1]];
    o.push(p[0], p[1], p[2], n[0], n[1], n[2], u * m.s, v * m.s, m.l, Math.min(m.c[0] * k, 1.99));
  }
};

/** A flat face, a fan from its first corner, turned away from the point `c`; `k` dims it, or each corner. */
const face = (q: V[], m: Mat, c: V, k: number | number[] = 1) => {
  let n = [0, 0, 0];
  q.forEach((a, i) => {
    const b = q[(i + 1) % q.length];
    n = off(n, [
      (a[1] - b[1]) * (a[2] + b[2]),
      (a[2] - b[2]) * (a[0] + b[0]),
      (a[0] - b[0]) * (a[1] + b[1]),
    ]);
  });
  if (Math.hypot(n[0], n[1], n[2]) < 1e-9) {
    return;
  }
  n = unit(n);
  const d = sub(mid(q[0], q[2]), c);
  if (n[0] * d[0] + n[1] * d[1] + n[2] * d[2] < 0) {
    n = n.map(v => -v);
  }
  for (let i = 1; i < q.length - 1; i++) {
    for (const j of [0, i, i + 1]) {
      put(q[j], n, m, typeof k == 'number' ? k : k[j]);
    }
  }
};

/** The skin between two lines of as many points, away from `c` (toward it with `inv`): `m` each strip's material, or none; ka and kb the points' light. */
const loft = (
  a: V[],
  b: V[],
  m: (j: number) => Mat | undefined,
  c: V,
  ka?: number[],
  kb = ka,
  inv = false,
) => {
  for (let j = 0; j < a.length - 1; j++) {
    const mat = m(j);
    if (mat) {
      face(
        [a[j], a[j + 1], b[j + 1], b[j]],
        mat,
        inv ? off(a[j], sub(a[j], c)) : c,
        ka && kb ? [ka[j], ka[j + 1], kb[j + 1], kb[j]] : 1,
      );
    }
  }
};

/** A box's faces, less those of `skip` (a bit each: 1 and 2 across x, 4 the bottom, 8 the top, 16 and 32 across z). */
const box = (a: V, b: V, m: Mat, top = m, skip = 4) => {
  const c = mid(a, b);
  for (let i = 0; i < 6; i++) {
    if (!((skip >> i) & 1)) {
      const [x, p, q] = [i >> 1, ((i >> 1) + 1) % 3, ((i >> 1) + 2) % 3];
      face(
        QUAD.map(e => {
          const v = [0, 0, 0];
          [v[x], v[p], v[q]] = [(i & 1 ? b : a)[x], (e & 1 ? b : a)[p], (e & 2 ? b : a)[q]];
          return v;
        }),
        i == 3 ? top : m,
        c,
      );
    }
  }
};

/** A beam from a to b, w across and h deep. */
const bar = (a: V, b: V, w: number, m: Mat, h = w) => {
  const d = unit(sub(b, a));
  const s = unit(cross(d, Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]));
  const u = cross(s, d);
  const [p, q] = [a, b].map(e =>
    QUAD.map(i => off(off(e, s, ((i & 1) - 0.5) * w), u, ((i >> 1) - 0.5) * h)),
  );
  const c = mid(a, b);
  loft([...p, p[0]], [...q, q[0]], () => m, c);
  face(p, m, c);
  face(q, m, c);
};

/** Torn metal: n teeth on the edge a to b, each reaching as far as `d` at most, turned away from `c`. */
const teeth = (a: V, b: V, d: V, n: number, m: Mat, k = 1, c = DOWN) => {
  for (let i = 0; i < n; i++) {
    const [p, q] = [off(a, sub(b, a), i / n), off(a, sub(b, a), (i + 1) / n)];
    face([p, q, off(mid(p, q), d, 0.3 + 0.7 * hash(i, a[0] * 7 + a[2] * 3 + a[1], 11))], m, c, k);
  }
};

/** A box with its upright edges cut by `cut`, grown by `grow`: its sides, lit `k` at the foot and at the top, and its top in `top`. */
const prism = (a: V, b: V, cut: number, m: Mat, top?: Mat, grow = 0, k = [1, 1]) => {
  const [x0, x1, z0, z1] = [a[0] - grow, b[0] + grow, a[2] - grow, b[2] + grow];
  const ring = (y: number) =>
    [
      [x0 + cut, z0],
      [x1 - cut, z0],
      [x1, z0 + cut],
      [x1, z1 - cut],
      [x1 - cut, z1],
      [x0 + cut, z1],
      [x0, z1 - cut],
      [x0, z0 + cut],
      [x0 + cut, z0],
    ].map(([x, z]) => [x, y, z]);
  const [p, q] = [ring(a[1]), ring(b[1])];
  loft(
    p,
    q,
    () => m,
    mid(a, b),
    p.map(() => k[0]),
    p.map(() => k[1]),
  );
  if (top) {
    face(q.slice(1), top, a);
  }
};

/** Sand blown against the foot of a box that stands in the dry beach. */
const drift = ({ min: a, max: b }: Piece) => {
  const c = mid(a, b);
  if (gy(c[0], c[2]) < 0.3 || a[1] > gy(c[0], c[2])) {
    return;
  }
  const at = (i: number, out: number) => {
    const [x, z] = [(i + 1) & 2 ? b[0] + out : a[0] - out, i & 2 ? b[2] + out : a[2] - out];
    const g = gy(x, z);
    return [
      x,
      g + (out ? -0.04 : Math.min(0.12 + 0.35 * hash(i % 4, c[0] + c[2], 5), b[1] - g)),
      z,
    ];
  };
  for (let i = 0; i < 4; i++) {
    const q = [at(i, 0), at(i + 1, 0), at(i + 1, 0.9), at(i, 0.9)];
    face(
      q,
      DUNE,
      DOWN,
      q.map(p => 0.92 + 0.16 * noise(p[0] / 11, p[2] / 11, 5)),
    );
  }
};

/** A model of mesh.ts set at `at`, its length (-z) along `f`, level: `k` its scale across, up and along. */
const stand = (src: number[], at: V, f: V, k: V = [1, 1, 1]) =>
  place(o, src, at as Vec3, [[-f[2], 0, f[0]], [0, 1, 0], f as Vec3], [0, 0, 0], k as Vec3);

// ---------------------------------------------------------------------------------------------
// The hull.

/** A smooth sheet through a grid of points, its normals from the grid: `m` each square's material, or none; `k` a point's light; `inv` turns it over. */
const sheet = (
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
const coat = (v: number[], m: Mat, k: (p: V) => number = () => 1) => {
  const keep = o;
  o = [];
  for (let i = 0; i < v.length; i += 6) {
    put(v.slice(i, i + 3), v.slice(i + 3, i + 6), m, k(v.slice(i, i + 3)));
  }
  const made = o;
  o = keep;
  return made;
};

/** The heights over the axis the loft's rows run at, up a flank; then the edge of the back, the edge of a hole in it and its middle: half width, height. */
const ROWS = [
  -7, -6.6, -6, -5, -4, -3, -2.05, -1.75, -0.9, 0, 1, 1.95, 2.25, 2.9, 3.6, 4.3, 5, 5.5, 6, 6.5,
];
const BACK = [
  [2.75, 6.72],
  [2.5, 6.93],
  [2.3, 7],
  [0, 7],
  [0, 7],
];
const HALF = ROWS.length + BACK.length;
/** The loft's squares round the hull: twice a flank's. */
const ROUND = 2 * HALF - 2;
/** The square `q` round the hull, counted up its own flank. */
const up = (q: number) => (q < HALF - 1 ? q : ROUND - 1 - q);
/** The height a flank's point `j` is at. */
const high = (j: number) => ROWS[j] ?? BACK[j - ROWS.length][1];

/** The nose, x: where its canopy's rear arch stands, where the windscreen's foot is, its sensor's tip; and how far the tip droops. */
const [ARCH, FOOT, TIP, DROOP] = [92, 104, 114, 2.4];
/** The canopy's sill over the axis: the upper deck's line. */
const SILL = DECKS[1];

/**
 * A section's form at x: its width's share (the map's `cut`, each step eased over 2 m), how far
 * the nose has turned from the round section to the chined one, its scale and how far its axis
 * has sunk (the nose tapers straight from the windscreen to its tip).
 */
const form = (n: number, x: number) => {
  const c = SHIP[n].cut;
  let s = c[0][2];
  for (let i = 1; i < c.length; i++) {
    s += (c[i][2] - c[i - 1][2]) * sm((x - c[i][0] + 1) / 2);
  }
  const t = n > 1 ? Math.max(x - 99, 0) / (TIP - 99) : 0;
  return [s, n > 1 ? sm((x - 94) / 5) : 0, 1 - 0.85 * t, DROOP * t];
};
/** The nose's chined section after Tranquility's ship: a flat top, a slope to the shoulder, another to the chine at the belt, a V keel. */
const chine = (h: number) =>
  h < 0
    ? Math.max(0, 7 + 2 * h)
    : h >= 5.6
      ? 2.38
      : h >= 3.15
        ? 4.34 - 0.8 * (h - 3.15)
        : 7 - 0.844 * h;
/** The drawn hull's half width at x and a height over the axis. */
const wide = (n: number, x: number, h: number) => {
  const [s, k, q] = form(n, x);
  return (section(h) + (chine(h) - section(h)) * k) * s * q;
};
/** A point of section `n` at x: `w` from the line on the side `sg`, at the height `h` over the axis as the round section counts it. */
const spot = (n: number, x: number, w: number, h: number, sg: number): V => {
  const [, k, q, d] = form(n, x);
  return [
    x,
    SHAPE.axis[n] - d + (h > 0 ? h * (1 - 0.2 * k) : Math.max(h, 3.5 * k - 7)) * q,
    MID + sg * w,
  ];
};
/** The hull's skin at x and a height, on a flank. */
const shell = (n: number, x: number, h: number, sg: number) => spot(n, x, wide(n, x, h), h, sg);
/** The loft's ring at the station x: up red's flank, across the back, down blue's. The nose's lines lean aft over the sill, so the windscreen's edge is one of them. */
const ring = (n: number, x: number): V[] => {
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
const stations = (n: number, x0: number, x1: number) => {
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
const AHEAD = [93.5, 95, 95.3, 98, 98.3, 101, 101.3, FOOT, 106.5, 109, 111.5, 113, TIP];
/**
 * The canopy's panes the crash broke, past the wall in the trees where nobody reaches: x0, x1
 * (stations of AHEAD), the heights over the axis (rows of ROWS) and the flank. The flight deck
 * shows through them.
 */
const SHATTER = [
  [98.3, 101, 2.9, 5, 1],
  [98.3, 101, 3.6, 5.5, -1],
];
const shattered = (xa: number, xb: number, ha: number, hb: number, sg: number) =>
  SHATTER.some(
    ([p, q, a, b, s]) =>
      s == sg && xa >= p - 0.01 && xb <= q + 0.01 && ha >= a - 0.01 && hb <= b + 0.01,
  );

/** The floors' lines of a section, from its floor up to under its back. */
const lines = (n: number) => [
  SHIP[n].floor,
  ...LINES.filter(h => h > SHIP[n].floor + 0.5 && h < 7),
];
/** The inner face of the skin at x on the line `i` of lines(): the inner lower corner of the map's row there, plumb from each floor up to the belt. */
const inner = (n: number, x: number, i: number) => {
  const l = lines(n);
  const a = l[Math.min(i, l.length - 2)];
  const b = l[Math.min(i, l.length - 2) + 1];
  const low = a < DECKS[0] ? l[0] : a < DECKS[1] ? DECKS[0] : DECKS[1];
  return Math.max(Math.min(section(b), section(low)) * form(n, x)[0] - SHAPE.skin, 0.05);
};
const lining = (n: number, x: number, i: number, sg: number): V => [
  x,
  SHAPE.axis[n] + lines(n)[i],
  MID + sg * inner(n, x, i),
];

/** Whether the map leaves the skin open between two heights of a flank, from one station to the next. */
const open = (n: number, xa: number, xb: number, ha: number, hb: number) =>
  SHIP[n].tears.some(
    ([p, q, a, b]) => xa >= p - 0.01 && xb <= q + 0.01 && ha >= a - 0.01 && hb <= b + 0.01,
  );
/** Whether the back is holed there. */
const holed = (n: number, xa: number, xb: number) =>
  SHIP[n].holes.some(([d, p, q]) => d == 2 && xa >= p - 0.01 && xb <= q + 0.01);

/** The broken ends of a section: the tail's east, both of the middle, the nose's west. */
const ends = (n: number) => [
  ...(n ? [[SHAPE.sections[n][0], -1]] : []),
  ...(n < 2 ? [[SHAPE.sections[n][1], 1]] : []),
];
/**
 * How much of its paint a point of section n's skin has left: burnt black at a broken end and
 * round a tear or a hole, stained along the belly, clean elsewhere.
 */
const paint = (n: number) => {
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
      (0.1 + 0.9 * sm((d - f) / 1.1)) *
      (0.5 + 0.5 * sm((h + 6.3 + 0.5 * f) / 2.4)) *
      (0.93 + 0.07 * noise(x / 5, (p[1] + p[2]) / 4, 4 + n))
    );
  };
};

/** The seven segments of a figure in a cell 1 by 2 (x0, y0, x1, y1), and the hull number's figures as bits of them. */
const SEG = [
  [0, 1.75, 1, 2],
  [0.75, 1, 1, 2],
  [0.75, 0, 1, 1],
  [0, 0, 1, 0.25],
  [0, 0, 0.25, 1],
  [0, 1, 0.25, 2],
  [0, 0.875, 1, 1.125],
];
const NUMBER = [63, 102, 91, 7];

/** An engine bell, its throat at the origin, 1.8 m long and 1.7 m at the lip, dark inside. */
const BELL = dress(
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
const FIN = [
  [0, 0],
  [11, 0],
  [12.5, 1.2],
  [10.5, 8.5],
  [9.2, 10],
  [6.4, 10],
  [5.2, 8.8],
];
const SNAPPED = [
  ...FIN.slice(0, 3),
  [11.6, 4.4],
  [10.2, 3.5],
  [9, 5.2],
  [7.4, 4],
  [5.9, 5.6],
  [3.3, 5.5],
];

/** Torn metal round an opening of the skin: teeth on each edge of the line `l`, reaching `d` into it. */
const ragged = (l: V[], d: V, c: V) =>
  l.slice(1).forEach((b, i) => teeth(l[i], b, d, 2, SKIN, 0.14, c));

/** A section's outer skin: one loft, holed where the map is; its torn ends, the edges of its holes in the skin's thickness. */
/** `only`: the canopy's glass alone instead of the skin. */
const skin = (n: number, only?: 'glass') => {
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
    // The tears, in the thickness: frames and stringers between the skin and its lining, bent teeth outside.
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
          j => (j & 1 ? GIRDER : IRON),
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
        const out = along.map(x => shell(n, x, h, sg));
        loft(
          out,
          along.map(x => lining(n, x, i, sg)),
          j => (j & 1 ? GIRDER : IRON),
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
    loft(
      rim,
      rim.map((p, i) => off(p, [d * (0.15 + 1.1 * hash(i, n, 3 + d)), 0, 0])),
      () => SKIN,
      axis(x),
      rim.map(() => 0.1),
    );
    for (const sg of [-1, 1]) {
      loft(
        l.map(h => shell(n, x, h, sg)),
        l.map((_, i) => lining(n, x, i, sg)),
        j => (j & 1 ? GIRDER : IRON),
        axis(x - 9 * d),
      );
    }
  }
};

/** The tail's stern, its bell, the stubs of its two engines' pylons, the fins on its shoulders and the number on its flanks. */
const tail = () => {
  const [x0] = SHAPE.sections[0];
  const c = SHAPE.axis[0];
  const rim = ring(0, x0);
  rim.slice(1).forEach((p, j) => face([[x0, c, MID], rim[j], p], IRON, [x0 + 9, c, MID], 0.8));
  stand(BELL, [x0 + 0.2, c + 1.6, MID], [-1, 0, 0], [1.75, 1.75, 1.75]);
  for (const sg of [-1, 1]) {
    // A pylon's root, faired into the flank, torn where the engine left.
    const at = [10.5, c + 0.4, MID + sg * (wide(0, 15, 0.4) - 0.5)];
    stand(
      coat(
        smooth(
          [
            [0, 0],
            [1, 0.4],
            [1.5, 3],
            [1.5, 8],
            [0.9, 10],
            [0, 10.3],
          ],
          10,
        ),
        SKIN,
        p => 0.25 + 0.75 * sm((-p[2] - 2) / 5) * sm(1.6 - sg * p[0]),
      ),
      at,
      [1, 0, 0],
    );
    const stub = [3, 7.5].map(u => [at[0] + u, at[1], at[2] + sg * 1.45]);
    loft(
      stub,
      stub.map(p => off(p, [0, 0.5, 0])),
      () => IRON,
      at,
    );
    teeth(stub[0], stub[1], [0, 0.2, sg * 1.1], 7, SKIN, 0.16, at);
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
const tip = () => {
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
const fairings = () => {
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

// ---------------------------------------------------------------------------------------------
// The inside.

const UP = [0, 99, 0];
/** A level rectangle. */
const flat = (xa: number, xb: number, y: number, za: number, zb: number) =>
  QUAD.map(i => [i & 1 ? xb : xa, y, i & 2 ? zb : za]);

/** What one sees from inside a section: the skin's lining with its ribs, the decks with the twisted edges of their holes, lamps and cables under them. */
const inside = (n: number) => {
  const [x0, x1] = SHAPE.sections[n];
  const c = SHAPE.axis[n];
  const { cut, tears, holes } = SHIP[n];
  const l = lines(n);
  // Not in the solid stern, nor under the canopy, which is its own lining.
  const [xa, xb] = [cut[0][3] ? cut[0][1] : x0, n > 1 ? ARCH : x1];
  const xs = stations(n, x0, xb).filter(x => x >= xa);
  for (const sg of [-1, 1]) {
    sheet(
      xs.map(x => l.map((_, i) => lining(n, x, i, sg))),
      (i, j) => (open(n, xs[i], xs[i + 1], l[j], l[j + 1]) ? undefined : PLATE),
      () => 1,
      sg > 0,
    );
    // A rib every 5 m, proud of the lining, from each floor to the next.
    for (let x = xa + 2.5; x < xb; x += 5) {
      l.slice(1).forEach((h, j) => {
        if (
          !DECKS.includes(h) &&
          !tears.some(([p, q, a, b]) => x > p - 0.3 && x < q + 0.3 && l[j] >= a && h <= b)
        ) {
          const [p, q] = [j, j + 1].map(i =>
            [
              [-0.08, 0],
              [-0.08, 0.2],
              [0.08, 0.2],
              [0.08, 0],
            ].map(([dx, dz]) => off(lining(n, x, i, sg), [dx, 0, -sg * dz])),
          );
          loft(p, q, () => GIRDER, [x, c, MID + sg * 20]);
        }
      });
    }
  }
  if (xa > x0) {
    // The stern's bulkhead.
    const wall = [1, -1].flatMap(sg =>
      (sg > 0 ? l : [...l].reverse()).map(h => lining(n, xa, l.indexOf(h), sg)),
    );
    face(wall, PLATE, [xa - 9, c, MID]);
  }
  // The decks, on the map's boxes, kept inside the drawn skin.
  for (const { kind, min: a, max: b } of LAYOUT.pieces) {
    if (kind != 'deck' || a[0] < x0 || b[0] > x1) {
      continue;
    }
    const back = b[1] > c + 6.9;
    const [p, q] = [a.slice(), b.slice()];
    if (back && n > 1) {
      q[0] = Math.min(q[0], ARCH);
    }
    const w =
      Math.min(...[p[0], (p[0] + q[0]) / 2, q[0]].map(x => wide(n, x, Math.min(b[1] - c, 6.4)))) -
      0.3;
    [p[2], q[2]] = [Math.max(p[2], MID - w), Math.min(q[2], MID + w)];
    if (q[0] > p[0] && q[2] > p[2]) {
      // The back's top is the skin's; a floor that goes down to the keel shows its top only.
      box(p, q, back ? PLATE : GIRDER, tex(TEX.GRATE), back ? 8 : a[1] < c - 6.9 ? 52 : 0);
    }
  }
  for (const [deck, p, q, half] of holes) {
    const y = c + DECKS[deck];
    const w = Math.min(
      half,
      (deck > 1 ? 2.5 : section(DECKS[deck])) * form(n, (p + q) / 2)[0] - SHAPE.skin,
    );
    const m = deck > 1 ? SKIN : PLATE;
    const k = deck > 1 ? 0.14 : 0.5;
    for (const [x, d] of [
      [p, 0.4],
      [q, -0.4],
    ]) {
      teeth([x, y, MID - w], [x, y, MID + w], [d, -0.3, 0], 6, m, k);
    }
    if (half < 9) {
      for (const sg of [-1, 1]) {
        teeth([p, y, MID + sg * w], [q, y, MID + sg * w], [0, -0.3, -sg * 0.4], 6, m, k);
      }
    }
  }
  // Emergency lamps under each deck and the back, and cables down from them, over a runner's head.
  [...DECKS.slice(0, 2), 6.5 + 0.3].forEach((h, d) => {
    const y = c + h - 0.33;
    for (let x = xa + 2; x < xb; x += 5) {
      const z = MID + (d > 1 ? 2.1 : 3.9) * form(n, x)[0] * (hash(x, d, 43) < 0.5 ? -1 : 1);
      if (!holes.some(([e, p, q, half]) => e == d && x > p - 0.8 && x < q + 0.8 && half > 3.5)) {
        face(flat(x - 0.5, x + 0.5, y, z - 0.07, z + 0.07), LAMP, UP);
        const at = [x + 1.6, y + 0.03, MID + 4 * (hash(x, d, 41) - 0.5)];
        bar(at, off(at, [0.2, -0.3 - 0.8 * hash(x, d, 42), 0.25]), 0.05, SOOT);
      }
    }
  });
};

// ---------------------------------------------------------------------------------------------
// The cabin: it carried troops. Seats along the flanks, the flight deck in the nose.

/** Olive drab canvas, its webbing darker, the seats' tubes dark grey. */
const CANVAS = ink([0.3, 0.31, 0.16]);
const WEB = ink([0.15, 0.16, 0.085]);
const TUBE = ink([0.17, 0.17, 0.18]);
/** The flight deck: its consoles and seats, their cushions, and the instruments' faces, dim (a glow) or dead. */
const CONSOLE = ink([0.13, 0.135, 0.145]);
const CUSHION = ink([0.2, 0.21, 0.12]);
const DIAL = ink([0.06, 0.22, 0.12], 1, -2);
const AMBER = ink([0.3, 0.15, 0.02], 1, -2);
const DEAD = ink([0.02, 0.025, 0.03]);

/** A tube from a to b, w across: three sides and no ends, enough at arm's length. */
const rod = (a: V, b: V, w: number, m: Mat) => {
  const d = unit(sub(b, a));
  const s = unit(cross(d, Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]));
  const u = cross(s, d);
  const r = 0.58 * w;
  const tri = [0, 1, 2, 0].map(i =>
    off(off([0, 0, 0], s, r * Math.cos(2.0944 * i)), u, r * Math.sin(2.0944 * i)),
  );
  loft(
    tri.map(t => off(a, t)),
    tri.map(t => off(b, t)),
    () => m,
    mid(a, b),
  );
};

/** A box in the frame of `o` and its axes `ax`, from `lo` to `hi` along them: its six faces, the top (+ax[1]) in `top`. */
const cube = (o: V, ax: V[], lo: V, hi: V, m: Mat, top = m) => {
  const at = (t: V) => off(off(off(o, ax[0], t[0]), ax[1], t[1]), ax[2], t[2]);
  const c = at(mid(lo, hi));
  for (let i = 0; i < 6; i++) {
    const [e, p, q] = [i >> 1, ((i >> 1) + 1) % 3, ((i >> 1) + 2) % 3];
    face(
      QUAD.map(k => {
        const t = [0, 0, 0];
        [t[e], t[p], t[q]] = [(i & 1 ? hi : lo)[e], (k & 1 ? hi : lo)[p], (k & 2 ? hi : lo)[q]];
        return at(t);
      }),
      i == 3 ? top : m,
      c,
    );
  }
};

/** The axes `ax` turned by `t` round the unit axis `a` (Rodrigues). */
const turn = (ax: V[], a: V, t: number) =>
  ax.map(v => {
    const [c, s] = [Math.cos(t), Math.sin(t)];
    const k = (1 - c) * (a[0] * v[0] + a[1] * v[1] + a[2] * v[2]);
    const x = cross(a, v);
    return [0, 1, 2].map(i => v[i] * c + x[i] * s + a[i] * k);
  });

/**
 * A row of fold-down troop seats along a flank, facing in: a canvas pan and a webbed back on each,
 * slung from three tubes that run the row, legs every other seat. From xa to xb on the floor at y,
 * the lining at `w` from the line on the side sg. A seat is down, folded up, hanging broken or
 * gone, a strap of its belt dangling now and then.
 */
const troops = (xa: number, xb: number, y: number, w: number, sg: number) => {
  /** A point `d` in from the lining. */
  const at = (x: number, h: number, d: number) => [x, y + h, MID + sg * (w - d)];
  const wall = [0, y, MID + sg * (w + 9)];
  const [d0, d1, pitch] = [0.22, 0.64, 0.55];
  const n = Math.floor((xb - xa) / pitch);
  const x0 = (xa + xb - n * pitch) / 2;
  const x1 = x0 + n * pitch;
  rod(at(x0, 1.2, d0 - 0.03), at(x1, 1.2, d0 - 0.03), 0.045, TUBE);
  rod(at(x0, 0.46, d0), at(x1, 0.46, d0), 0.04, TUBE);
  rod(at(x0, 0.45, d1), at(x1, 0.45, d1), 0.04, TUBE);
  for (let i = 0; i <= n; i += 2) {
    const x = x0 + i * pitch;
    rod(at(x, 0, d1 - 0.1), at(x, 0.45, d1), 0.035, TUBE);
    rod(at(x, 0.46, d0), at(x, 1.2, d0 - 0.03), 0.03, TUBE);
  }
  for (let i = 0; i < n; i++) {
    const [a, b] = [x0 + i * pitch + 0.035, x0 + (i + 1) * pitch - 0.035];
    const seed = Math.round(a * 20) + (sg > 0 ? 7919 : 0);
    const r = hash(seed, Math.round(y * 4), 61);
    const k = 0.85 + 0.3 * hash(seed, 3, 62);
    // The back: a sheet of webbing, two straps up and two across it, on the side facing in.
    if (r < 0.95) {
      face(
        [at(a, 0.5, d0 + 0.015), at(b, 0.5, d0 + 0.015), at(b, 1.17, d0), at(a, 1.17, d0)],
        WEB,
        wall,
        k,
      );
      for (const u of [0.3, 0.7]) {
        const x = a + u * (b - a);
        face(
          [
            at(x - 0.03, 0.5, d0 + 0.03),
            at(x + 0.03, 0.5, d0 + 0.03),
            at(x + 0.03, 1.17, d0 + 0.02),
            at(x - 0.03, 1.17, d0 + 0.02),
          ],
          CANVAS,
          wall,
          k,
        );
      }
      for (const h of [0.7, 0.98]) {
        face(
          [
            at(a, h, d0 + 0.035),
            at(b, h, d0 + 0.035),
            at(b, h + 0.1, d0 + 0.035),
            at(a, h + 0.1, d0 + 0.035),
          ],
          CANVAS,
          wall,
          k,
        );
      }
    }
    if (r < 0.58) {
      // Down: the canvas sags between the rails.
      const sag = [
        at(a, 0.46, d0),
        at(b, 0.46, d0),
        at(b, 0.42, (d0 + d1) / 2),
        at(a, 0.42, (d0 + d1) / 2),
      ];
      face(sag, CANVAS, DOWN, k);
      face([sag[3], sag[2], at(b, 0.45, d1), at(a, 0.45, d1)], CANVAS, DOWN, k);
    } else if (r < 0.84) {
      // Folded up against the back.
      face(
        [
          at(a, 0.5, d0 + 0.07),
          at(b, 0.5, d0 + 0.07),
          at(b, 0.92, d0 + 0.09),
          at(a, 0.92, d0 + 0.09),
        ],
        CANVAS,
        wall,
        0.8 * k,
      );
    } else if (r < 0.93) {
      // Torn off its front rail, hanging from the back one.
      face(
        [
          at(a, 0.46, d0),
          at(b, 0.46, d0),
          at(b - 0.04, 0.08, d0 + 0.18),
          at(a + 0.06, 0.1, d0 + 0.2),
        ],
        CANVAS,
        wall,
        0.75 * k,
      );
    }
    if (hash(seed, 5, 63) < 0.3) {
      // A belt's strap hanging from the front rail, its buckle at the end.
      const x = a + (b - a) * (0.25 + 0.5 * hash(seed, 6, 64));
      const l = 0.15 + 0.2 * hash(seed, 7, 65);
      const s = 0.06 * (hash(seed, 8, 66) - 0.5);
      face(
        [
          at(x - 0.025, 0.44, d1 + 0.02),
          at(x + 0.025, 0.44, d1 + 0.02),
          at(x + 0.025 + s, l, d1 + 0.05),
          at(x - 0.025 + s, l, d1 + 0.05),
        ],
        WEB,
        wall,
        k,
      );
      face(
        [
          at(x - 0.04 + s, l, d1 + 0.055),
          at(x + 0.04 + s, l, d1 + 0.055),
          at(x + 0.04 + s, l - 0.06, d1 + 0.055),
          at(x - 0.04 + s, l - 0.06, d1 + 0.055),
        ],
        TUBE,
        wall,
      );
    }
  }
};

/**
 * Where the troops sat: rows along both flanks of the middle section's hold and deck and of the
 * nose's, each section, its floor (-1 the lowest, else the index in DECKS) and x0, x1. The rows leave the doors, the tears,
 * the holes across a deck and the broken ends free, and stop short of the wall in the trees.
 */
const ROWS_OF_SEATS = [
  [1, -1, 44.6, 57.1],
  [1, -1, 60.9, 73.4],
  [1, 0, 44.6, 47.3],
  [1, 0, 55.3, 66.8],
  [1, 0, 70.7, 73.4],
  [2, -1, 82.6, 88.9],
  [2, -1, 91.1, 94.5],
  [2, 0, 91.2, 94.5],
];

/** The flight deck behind the canopy: two pilots' seats, the instrument panel under the windscreen, the pedestal with its throttles, the overhead panel, and what the crash threw about. */
const cockpit = () => {
  const c = SHAPE.axis[2];
  const y = c + SILL;
  /** The drawn skin's half width at x and the height y. */
  const half = (x: number) => {
    const [, k, q, d] = form(2, x);
    return wide(2, x, (y - c + d) / ((1 - 0.2 * k) * q));
  };
  // The floor, from the upper deck's end to the panel, inside the skin.
  const fx = [97, 98.5, 100, 101.4];
  fx.slice(1).forEach((x, i) => {
    const [p, q] = [fx[i], x].map(e => half(e) - 0.12);
    face(
      [
        [fx[i], y, MID - p],
        [x, y, MID - q],
        [x, y, MID + q],
        [fx[i], y, MID + p],
      ],
      tex(TEX.METAL, 0.3),
      DOWN,
    );
  });
  const F = [1, 0, 0];
  const U = [0, 1, 0];
  const S = [0, 0, 1];
  // The pilots' seats, the co-pilot's torn from its rails and tipped against the pedestal.
  for (const sg of [-1, 1]) {
    const o = [98.35, y, MID + sg * 0.85];
    let ax = [F, U, S];
    if (sg < 0) {
      ax = turn(turn(ax, F, -0.32), U, 0.35);
      o[1] += 0.06;
    }
    cube(o, ax, [-0.2, 0, -0.17], [0.2, 0.32, 0.17], CONSOLE);
    cube(o, ax, [-0.26, 0.32, -0.26], [0.27, 0.44, 0.26], CUSHION);
    const bk = turn(ax, ax[2], 0.22);
    const p = off(off(o, ax[0], -0.24), ax[1], 0.42);
    cube(p, bk, [-0.13, 0, -0.26], [0, 0.82, 0.26], CUSHION);
    cube(p, bk, [-0.12, 0.84, -0.16], [0.03, 1.08, 0.16], CONSOLE);
    for (const e of [-0.24, 0.24]) {
      // The harness's straps over the back, and the armrests.
      const h = (t: V) => off(off(off(p, bk[0], t[0]), bk[1], t[1]), bk[2], t[2]);
      face(
        [
          h([0.01, 0.8, e * 0.5 - 0.04]),
          h([0.01, 0.8, e * 0.5 + 0.04]),
          h([0.02, 0.05, e * 0.7 + 0.04]),
          h([0.02, 0.05, e * 0.7 - 0.04]),
        ],
        WEB,
        h([-1, 0.4, 0]),
      );
      const a = (t: V) => off(off(off(o, ax[0], t[0]), ax[1], t[1]), ax[2], t[2]);
      rod(a([-0.22, 0.68, e * 1.25]), a([0.2, 0.68, e * 1.25]), 0.06, CONSOLE);
      rod(a([0.14, 0.68, e * 1.25]), a([0.14, 0.42, e * 1.1]), 0.035, TUBE);
    }
  }
  // The pedestal between them, its throttles, two pulled back.
  cube([98.75, y, MID], [F, U, S], [0, 0, -0.22], [1.7, 0.66, 0.22], CONSOLE);
  for (let i = 0; i < 4; i++) {
    const z = MID - 0.13 + (0.26 * i) / 3;
    const b = [99.15 + (i == 1 || i == 2 ? 0.12 : 0), y + 0.66, z];
    const t = off(b, [i % 3 ? 0.16 : -0.1, 0.24, 0]);
    rod(b, t, 0.035, TUBE);
    cube(t, [F, U, S], [-0.035, -0.02, -0.04], [0.035, 0.05, 0.04], i < 2 ? CUSHION : DEAD);
  }
  for (let i = 0; i < 3; i++) {
    face(
      flat(99.6 + 0.3 * i, 99.82 + 0.3 * i, y + 0.665, MID - 0.15, MID + 0.15),
      i == 1 ? AMBER : DEAD,
      DOWN,
    );
  }
  // The instrument panel under the windscreen, a glare shield over it, its faces dim or dead.
  const lean = turn([F, U, S], S, 0.28);
  cube([100.45, y, MID], lean, [0, 0, -1.75], [0.85, 0.92, 1.75], CONSOLE);
  cube(off([100.45, y, MID], lean[1], 0.92), lean, [-0.18, 0, -1.6], [0.6, 0.07, 1.6], DEAD);
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 9; i++) {
      const z = -1.5 + (3 * i) / 8;
      const wd = i == 3 || i == 5 ? 0.17 : 0.1;
      const r = hash(i, row, 71);
      const m = i == 4 ? DEAD : r < 0.45 ? DIAL : r < 0.55 ? AMBER : DEAD;
      const p = off(off([100.45, y, MID], lean[1], 0.38 + 0.3 * row), lean[0], -0.005);
      face(
        QUAD.map(k =>
          off(off(p, lean[1], (k & 2 ? 1 : -1) * (wd - 0.02)), lean[2], z + (k & 1 ? wd : -wd)),
        ),
        m,
        off(p, [9, 0, 0]),
      );
    }
  }
  // The overhead panel, still held aft under the roof, torn from its forward mount and hanging, cables down from it.
  const hang = turn([F, U, S], S, -0.35);
  const o = [99.1, spot(2, 97.6, 0, SHAPE.r, 1)[1] - 0.75, MID];
  cube(o, hang, [-1.6, -0.07, -0.5], [0, 0.07, 0.5], CONSOLE, DEAD);
  for (let i = 0; i < 5; i++) {
    const p = off(off(o, hang[0], -0.2 - 0.3 * i), hang[1], -0.075);
    face(
      QUAD.map(k =>
        off(off(p, hang[0], k & 1 ? 0.1 : -0.1), hang[2], (k & 2 ? 0.3 : -0.3) + 0.08 * (i - 2)),
      ),
      i == 1 ? AMBER : i == 3 ? DIAL : DEAD,
      off(p, hang[1], 9),
    );
  }
  for (let i = 0; i < 4; i++) {
    const p = off(o, hang[0], -0.4 - 0.35 * i);
    rod(
      p,
      off(p, [0.1 * (i - 1.5), -0.5 - 0.4 * hash(i, 1, 72), 0.15 * (i - 1.5)]),
      0.03,
      i & 1 ? SOOT : TUBE,
    );
  }
  // Debris on the floor: a fallen panel, a seat's cushion, plates against the flanks.
  cube(
    [97.5, y, MID + 0.35],
    turn([F, U, S], U, 0.6),
    [-0.3, 0, -0.2],
    [0.3, 0.05, 0.2],
    CONSOLE,
    DEAD,
  );
  cube(
    [97.3, y, MID - 1.9],
    turn([F, U, S], U, -0.4),
    [-0.25, 0, -0.22],
    [0.25, 0.1, 0.22],
    CUSHION,
  );
  for (const sg of [-1, 1]) {
    const z = MID + sg * (half(99.6) - 0.25);
    face(
      [
        [99, y, z],
        [100.2, y, z],
        [100.1, y + 0.7, z - sg * 0.12],
        [99.1, y + 0.65, z - sg * 0.12],
      ],
      CONSOLE,
      [99.6, y, MID],
    );
  }
};

/** The canopy's glass, apart from the hull: its panes, and the shards round the broken ones. */
export const canopy = (): number[] => {
  o = [];
  skin(2, 'glass');
  const c = SHAPE.axis[2];
  for (const [p, q, a, b, sg] of SHATTER) {
    const ja = ROWS.indexOf(a);
    const jb = ROWS.indexOf(b);
    const pt = (x: number, j: number) => ring(2, x)[sg > 0 ? j : ROUND - j];
    const edges = [
      Array.from({ length: jb - ja + 1 }, (_, j) => pt(p, ja + j)),
      Array.from({ length: jb - ja + 1 }, (_, j) => pt(q, ja + j)),
      [pt(p, ja), pt(q, ja)],
      [pt(p, jb), pt(q, jb)],
    ];
    const cen = mid(mid(pt(p, ja), pt(q, jb)), mid(pt(q, ja), pt(p, jb)));
    for (const e of edges) {
      e.slice(1).forEach((v, i) => {
        const d = unit(sub(cen, mid(e[i], v)));
        teeth(
          e[i],
          v,
          d.map(t => t * 0.45),
          3,
          PANE,
          1,
          [e[i][0], c, MID],
        );
      });
    }
  }
  return o;
};

/** Inside the hull: the troops' seats in rows on its flanks and the flight deck. */
const cabin = () => {
  for (const [n, deck, xa, xb] of ROWS_OF_SEATS) {
    const i = deck < 0 ? 0 : lines(n).indexOf(DECKS[deck]);
    for (const sg of [-1, 1]) {
      troops(xa, xb, SHAPE.axis[n] + lines(n)[i], inner(n, (xa + xb) / 2, i), sg);
    }
  }
  cockpit();
};

// ---------------------------------------------------------------------------------------------
// The wings.

/** The aerofoil along the chord, from the trailing edge to the leading one: the chord's share, and how much of the wing's thickness is under the top there. Both edges are sharp. */
const FOIL = [
  [0, 0],
  [0.08, 0.3],
  [0.3, 0.8],
  [0.55, 1],
  [0.8, 0.75],
  [0.95, 0.3],
  [1, 0],
];

/** A wing (red's with s = 1): three thin slabs, each a plane through the tops of its rows of the map, torn at the breaks. */
const wing = (s: number) => {
  const flip = (p: V) => [p[0], p[1], MID + s * (p[2] - MID)];
  const rows = LAYOUT.pieces.filter(p => p.kind == 'wingpiece' && p.min[2] > MID);
  const z0 = MID + SHAPE.r + SHIP[1].fair[1][2];
  WING.pieces.forEach(([v0, v1, push, , , shear], n) => {
    const zv = (v: number) => z0 + WING.span * v + push;
    const mine = rows
      .filter(p => p.min[2] > zv(v0) - 0.01 && p.max[2] < zv(v1) + 0.01)
      .sort((a, b) => a.min[2] - b.min[2]);
    const [a, b] = [mine[0], mine[mine.length - 1]];
    const zm = (p: Piece) => (p.min[2] + p.max[2]) / 2;
    /** The top at a span: the line through the middles of the first and the last row's tops. */
    const top = (v: number) =>
      a.max[1] + ((b.max[1] - a.max[1]) * (zv(v) - zm(a))) / (zm(b) - zm(a));
    const coarse = Math.ceil((WING.span * (v1 - v0)) / 1.4);
    const at = (v: number, u: number, t: number): V => {
      const e = Math.min(v, 47.49);
      const [xa, xb] = [edge(WING.trail, e), edge(WING.lead, e)];
      return flip([
        xa + (xb - xa) * u + shear * coarse * ((v - v0) / (v1 - v0) - 0.5),
        top(v) - t * thick(v),
        zv(v),
      ]);
    };
    // Each corner of the outline in the piece is a line of the sheet, the notches twice.
    const marks = [
      v0,
      ...[...WING.lead, ...WING.trail]
        .map(p => p[1])
        .filter(v => v > v0 + 0.01 && v < v1 - 0.01)
        .flatMap(v => [v - 0.01, v + 0.01]),
      v1,
    ].sort((p, q) => p - q);
    const vs = marks.flatMap((v, i) =>
      i && v - marks[i - 1] > 3.4 ? [(v + marks[i - 1]) / 2, v] : [v],
    );
    const lit = (p: V) => {
      const d = Math.min(
        n ? Math.abs(Math.abs(p[2] - MID) + MID - zv(v0)) : 9,
        n < 2 ? Math.abs(Math.abs(p[2] - MID) + MID - zv(v1)) : 9,
      );
      return 0.12 + 0.88 * sm((d - 0.7 * noise(p[0] / 1.3, p[2] / 1.3, 17)) / 0.9);
    };
    sheet(
      vs.map(v => FOIL.map(([u]) => at(v, u, 0))),
      () => SKIN,
      lit,
      s < 0,
    );
    sheet(
      vs.map(v => FOIL.map(([u, t]) => at(v, u, t))),
      () => SKIN,
      p => 0.75 * lit(p),
      s > 0,
    );
    // The breaks: the thin section open, a spar or two between the skins, the top skin torn.
    for (const [v, d] of [...(n ? [[v0, -1]] : []), ...(n < 2 ? [[v1, 1]] : [])]) {
      const [p, q] = [0, 1].map(e => FOIL.map(([u, t]) => at(v, u, e * t)));
      const c = at(v - 3 * d, 0.5, 0.5);
      loft(p, q, () => SOOT, c);
      ragged(p, [0, 0.06, s * d * 0.3], off(c, [0, -9, 0]));
      for (const u of [0.3, 0.62]) {
        bar(
          at(v - 0.4 * d, u, 0.5),
          at(v + 0.45 * d, u + 0.01 * d, 0.6),
          0.14,
          GIRDER,
          0.6 * thick(v),
        );
      }
    }
  });
};

// ---------------------------------------------------------------------------------------------
// The debris and the camps.

/** A wheel lying along -z from its hub's back: 0.6 m in radius, 1 m wide. */
const WHEEL = dress(
  smooth(
    [
      [0, 0.1],
      [0.3, 0.1],
      [0.36, 0],
      [0.52, 0],
      [0.6, 0.15],
      [0.6, 0.85],
      [0.52, 1],
      [0.36, 1],
      [0.3, 0.9],
      [0, 0.9],
    ],
    12,
  ),
  [0.05, 0.05, 0.055],
);

/** The fallen engine's nacelle, its tail at the origin: 19 m to the intake's lip, dark inside it and scorched toward the bell. */
const POD = coat(
  smooth(
    [
      [0, 0],
      [1.5, 0],
      [2.1, 2.5],
      [2.2, 4],
      [2.7, 6.5],
      [2.75, 12.5],
      [2.45, 17.5],
      [2.1, 19],
      [1.75, 19.1],
      [1.5, 17.6],
      [0, 17.4],
    ],
    16,
  ),
  SKIN,
  p =>
    Math.hypot(p[0], p[1]) < 1.7 && p[2] < -16
      ? 0.05
      : (0.12 + 0.88 * sm((-p[2] - 5 - 3 * noise(p[0], p[1] * 2 - p[2] / 2, 61)) / 5)) *
        (0.55 + 0.45 * sm((p[1] + 2.2) / 1.6)),
);

/** A line of points [across, up] carried to (x + across, y + up, z), then its mirror across x. */
const arch = (pts: number[][], x: number, y: number, z: number) =>
  [...pts, ...pts.map(([h, v]) => [-h, v]).reverse()].map(([h, v]) => [x + h, y + v, z]);

/** Each kind of piece, drawn on its box: `t` its tint in the map, `s` 1 in red's half and -1 in blue's. */
const KIND: Record<
  string,
  (p: { min: V; max: V }, t: V | undefined, s: number, d?: number) => void
> = {
  // Skin lying flat or afloat, its edge torn; or a slab of it standing in the sand, its stringers on one face.
  panel: ({ min: a, max: b }, _t, s) => {
    const k = 0.55 + 0.45 * hash(a[0], a[2], 51);
    const paint = ink(WHITE.c, k, HULL);
    const thin = b[0] - a[0] < 1 ? 0 : b[2] - a[2] < 1 ? 2 : -1;
    if (thin >= 0) {
      box(a, b, paint, IRON);
      const [p, q] = [a.slice(), b.slice()];
      p[1] = q[1] = b[1];
      p[thin] = q[thin] = (a[thin] + b[thin]) / 2;
      teeth(p, q, [0, 0.4, 0], 9, SKIN, 0.3);
      for (const y of [0.5, 1.1, 1.7]) {
        const [e, f] = [a.slice(), b.slice()];
        e[1] = f[1] = b[1] - y;
        e[thin] = f[thin] = (s > 0 ? a : b)[thin] - s * 0.04;
        bar(e, f, 0.08, IRON);
      }
      return;
    }
    box(a, b, GIRDER, paint);
    const rim = [0, 1, 3, 2, 0].map(i => [i & 1 ? b[0] : a[0], b[1], i & 2 ? b[2] : a[2]]);
    rim.slice(1).forEach((q, i) => {
      const out = sub(mid(rim[i], q), [(a[0] + b[0]) / 2, b[1], (a[2] + b[2]) / 2]);
      teeth(rim[i], q, [Math.sign(out[0]) * 0.35, -0.12, Math.sign(out[2]) * 0.35], 4, SKIN, 0.35);
    });
    if (k > 0.75) {
      face(
        QUAD.map(i => [a[0] + (i & 1 ? 1.1 : 0.7), b[1] + 0.02, i & 2 ? b[2] : a[2]]),
        ink(STRIPE),
        DOWN,
        k,
      );
    }
  },
  // A cargo container: corrugated sides, door bars on one end.
  container: ({ min: a, max: b }, t = STRIPE) => {
    box(a, b, ink(t, 0.5));
    const long = b[0] - a[0] > b[2] - a[2] ? 0 : 2;
    for (let u = a[long] + 0.3; u < b[long] - 0.2; u += 0.6) {
      const [p, q] = [a.map(v => v - 0.05), b.map(v => v + 0.05)];
      [p[long], q[long], p[1], q[1]] = [u, u + 0.3, a[1], b[1] - 0.15];
      box(p, q, ink(t, 0.68));
    }
    for (const u of [0.35, 0.65]) {
      const e = off(a, sub(b, a), u);
      [e[long], e[1]] = [a[long] - 0.04, a[1]];
      bar(e, [e[0], b[1] - 0.1, e[2]], 0.08, IRON);
    }
  },
  // A supply case: planks, two straps, the lid in the team's colour on those that carry its long guns.
  crate: ({ min: a, max: b }, t) => {
    if (b[1] - a[1] > 1.2) {
      // A locker fallen from a bulkhead, its doors' seams.
      box(a, b, tex(TEX.STEEL, 0.75));
      for (const u of [0.33, 0.66]) {
        const x = a[0] + (b[0] - a[0]) * u;
        box([x - 0.02, a[1] + 0.1, a[2] - 0.01], [x + 0.02, b[1] - 0.1, b[2] + 0.01], SOOT);
      }
      return;
    }
    box(a, b, tex(TEX.WOOD), t && ink(t, 0.75));
    for (const u of [0.25, 0.75]) {
      const z = a[2] + (b[2] - a[2]) * u;
      box([a[0] - 0.02, a[1], z - 0.1], [b[0] + 0.02, b[1] + 0.02, z + 0.1], IRON);
    }
  },
  // The flag's step: a hatch cover in the team's colour.
  dais: ({ min: a, max: b }, t = STRIPE) => {
    box(a, b, GIRDER, ink(t, 0.6));
    face(
      QUAD.map(i => [
        i & 1 ? b[0] - 0.5 : a[0] + 0.5,
        b[1] + 0.02,
        i & 2 ? b[2] - 0.5 : a[2] + 0.5,
      ]),
      ink(t, 0.95),
      DOWN,
    );
  },
  // A tarpaulin sagging between its four poles, lit on both faces.
  shelter: ({ min: a, max: b }, t) => {
    if (!t) {
      box(a, b, tex(TEX.STEEL, 0.8));
      return;
    }
    const at = (i: number, j: number, d: number) => [
      a[0] + ((b[0] - a[0]) * i) / 6,
      b[1] - d - 0.25 * Math.sin((Math.PI * i) / 6) * Math.sin((Math.PI * j) / 4),
      a[2] + ((b[2] - a[2]) * j) / 4,
    ];
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 4; j++) {
        for (const d of [0, 0.03]) {
          face(
            [at(i, j, d), at(i + 1, j, d), at(i + 1, j + 1, d), at(i, j + 1, d)],
            ink(t, i & 1 ? 0.62 : 0.8),
            [a[0], d ? 99 : -99, a[2]],
          );
        }
      }
    }
  },
  // The landing gear: its strut's housing, cut at the corners, and the bogie's three wheels on their beam.
  gear: ({ min: a, max: b }, t) => {
    if (t) {
      prism(a, b, 0.4, ink(t, 0.7), ink(t, 0.55));
      prism([a[0], b[1] - 0.9, a[2]], [b[0], b[1] - 0.6, b[2]], 0.4, IRON, undefined, 0.04);
      return;
    }
    const z = (a[2] + b[2]) / 2;
    for (let i = 0; i < 3; i++) {
      stand(WHEEL, [a[0] + 0.7 + i * 1.5, b[1] - 0.6, b[2]], [0, 0, -1], [1, 1, b[2] - a[2]]);
    }
    box([a[0] + 0.3, b[1] - 0.8, z - 0.2], [b[0] - 0.3, b[1] - 0.4, z + 0.2], GIRDER);
  },
  // The engine torn off its pylon, lying askew on the sand: a faired nacelle, its intake's lip, its bell, the pylon's stub on its back, scorched. Drawn whole from its first strip.
  fallen: ({ max: b }, t, s) => {
    if (!t) {
      return;
    }
    const [x, z, , l, skew] = ENGINES[0];
    const f = unit([1, 0, s * skew]);
    const at = [x, b[1] - 2.2, MID + s * (z - MID)];
    stand(POD, off(at, f, -l / 2), f, [0.84, 0.8, 1]);
    stand(
      BELL,
      off(at, f, -l / 2 + 0.3),
      f.map(v => -v),
      [1.15, 1.15, 1.15],
    );
    const stub = [-1, 3.5].map(u => off(off(at, f, u), [0, 2.1, 0]));
    const lean = [-f[2] * 0.5, 1.1, f[0] * 0.5];
    loft(
      stub,
      stub.map(p => off(p, lean)),
      () => IRON,
      at,
    );
    teeth(off(stub[0], lean), off(stub[1], lean), lean, 6, SKIN, 0.16, at);
  },
  // A rail through a break of a wing: a beam deeper than the wing it carries, its flanges proud.
  rail: ({ min: a, max: b }) => {
    box([a[0] + 0.14, a[1], a[2]], [b[0] - 0.14, b[1], b[2]], GIRDER);
    for (const y of [a[1], b[1] - 0.07]) {
      box([a[0], y, a[2]], [b[0], y + 0.07, b[2]], GIRDER, GIRDER, 0);
    }
  },
  // The engine in the lagoon, awash: its housing, and at each end its fan.
  engine: ({ min: a, max: b }, t = STRIPE) => {
    const x = (a[0] + b[0]) / 2;
    const shell = (z: number) =>
      arch(
        [
          [2.5, -5],
          [2.5, -0.4],
          [2.1, 0],
        ],
        x,
        b[1],
        z,
      );
    const c = [x, b[1] - 2.5, (a[2] + b[2]) / 2];
    const k = shell(0).map((_, j) => 0.45 + 0.4 * hash(j, 3, 62));
    loft(shell(a[2]), shell(b[2]), j => (j == 2 ? ink(t, 0.6) : SKIN), c, k);
    for (const [z, d] of [
      [a[2], -1],
      [b[2], 1],
    ]) {
      face(shell(z), SOOT, c);
      const at = (r: number, w: number, out: number) => [
        x + r * Math.cos(w),
        c[1] + r * Math.sin(w),
        z + d * out,
      ];
      const step = Math.PI / 7;
      for (let i = 0; i < 14; i++) {
        const w = i * step;
        face(
          [
            at(0.5, w, 0.2),
            at(2.25, w - 0.1, 0.22),
            at(2.25, w + 0.22, 0.05),
            at(0.5, w + 0.3, 0.08),
          ],
          ink([0.42, 0.43, 0.46]),
          c,
        );
        face([at(0, 0, 0.3), at(0.55, w, 0.1), at(0.55, w + step, 0.1)], IRON, c);
        face(
          [at(2.3, w, 0.04), at(2.3, w + step, 0.04), at(2.48, w + step, 0.04), at(2.48, w, 0.04)],
          PLATE,
          c,
        );
      }
    }
  },
  // The escape pod: its corners cut, its foot scorched, a band in the team's colour, the hatch open toward the flag, its parachute on the sand behind.
  pod: ({ min: a, max: b }, _t, s) => {
    const team = TEAM_TINT[s > 0 ? 0 : 1];
    const g = a[1] + 0.5;
    const c = mid(a, b);
    const [x, z] = [c[0], (s > 0 ? a[2] : b[2]) - s * 0.04];
    prism(a, b, 0.42, SKIN, ink(WHITE.c, 0.8, HULL), 0, [0.5, 1]);
    prism(a, [b[0], g + 0.8, b[2]], 0.42, SOOT, undefined, 0.04);
    prism([a[0], g + 2, a[2]], [b[0], g + 2.4, b[2]], 0.42, ink(team, 0.8), undefined, 0.03);
    face(
      QUAD.map(i => [x + (i & 1 ? 0.65 : -0.65), g + (i & 2 ? 1.95 : 0), z]),
      SOOT,
      c,
    );
    for (const u of [-0.7, 0.7]) {
      bar([x + u, g, z], [x + u, g + 2, z], 0.1, IRON);
      face(
        QUAD.map(i => [
          x + 3.03 * Math.sign(u),
          g + (i & 2 ? 1.7 : 1.2),
          c[2] + (i & 1 ? 0.3 : -0.3),
        ]),
        GLASS,
        c,
      );
    }
    bar([x - 0.7, g + 2, z], [x + 0.7, g + 2, z], 0.1, IRON);
    box([x + 1, g - 0.1, z - s * 2.6 - 0.95], [x + 2.3, g + 0.1, z - s * 2.6 + 0.95], SKIN);
    const hub = [x, g + 0.28, c[2] + s * 7];
    const rim = (i: number) => {
      const r = 3 + 1.3 * hash(i % 14, s, 71);
      return [
        x + r * Math.cos((i * Math.PI) / 7),
        g + 0.03 + 0.2 * hash(i % 14, s, 72),
        hub[2] + r * Math.sin((i * Math.PI) / 7),
      ];
    };
    for (let i = 0; i < 14; i++) {
      face([hub, rim(i), rim(i + 1)], ink(i & 1 ? STRIPE : [0.8, 0.8, 0.76], 0.9), DOWN);
    }
  },
  // A heap of wreckage across a gap, broken end to broken end: plates of skin leaning on a dark
  // core on both faces, their tops torn, a deck plate on top; a broken end's lowest floor crushed
  // shut (`jam`, d = 0): the same plates across it, on the face toward the gap.
  heap: ({ min: a, max: b }, t = STRIPE, _s = 1, d = 0) => {
    const [o, u] = d ? [0, 2] : [2, 0];
    box(a, b, IRON, d ? IRON : ink(t, 0.55));
    const n = Math.round((b[u] - a[u]) / 1.6);
    for (const e of d ? [d] : [-1, 1]) {
      const w = (e < 0 ? a : b)[o];
      for (let i = 0; i < n; i++) {
        const h = (k: number) => hash(i, w * 7 + k, 41);
        const q = (j: number, y: number, out: number): V => {
          const p = [0, y, 0];
          p[u] = a[u] + ((b[u] - a[u]) * (i + j)) / n;
          p[o] = w + e * out;
          return p;
        };
        const top = b[1] - 0.15 - 0.5 * h(3);
        const out = 0.12 + 0.12 * h(4);
        const l = [
          q(0.05, a[1], out),
          q(0.95, a[1], out),
          q(0.95, top, 0.02),
          q(0.05, top - 0.2 * h(6), 0.02),
        ];
        const c = q(0.5, top / 2, -9);
        face(l, h(5) > 0.45 ? SKIN : PLATE, c, [0.75, 0.75, 1, 1]);
        teeth(l[3], l[2], [0, 0.35, 0], 3, PLATE, 0.9, c);
      }
    }
  },
  // A frame fallen at a broken end, two girders of it on the sand and a rib still standing against the hull.
  frame: ({ min: a, max: b }, _t, s) => {
    box([a[0] + 0.2, a[1], a[2]], [b[0] - 0.2, b[1], b[2]], IRON);
    box([a[0], b[1] - 0.16, a[2]], b, GIRDER, GIRDER, 0);
    box([a[0], b[1] - 0.8, a[2]], [b[0], b[1] - 0.64, b[2]], GIRDER, GIRDER, 0);
    const z = (a[2] + b[2]) / 2;
    bar([a[0] + 0.14, b[1], z - s * 0.7], [a[0] + 0.14, b[1] + 3.4, z + s * 0.6], 0.26, GIRDER);
  },
};
KIND.float = KIND.raft = KIND.panel;
// A jam faces the gap: +x at a section's east end.
KIND.jam = (p, t, s) => KIND.heap(p, t, s, SHAPE.sections.some(e => e[1] == p.max[0]) ? 1 : -1);

/** The kinds of the camps: the rest is debris. */
const CAMP = ['pod', 'dais', 'crate', 'shelter'];
/** The kinds no sand lies against: afloat, or cloth, or the flag's step, or drawn off their boxes. */
const BARE = ['shelter', 'float', 'raft', 'engine', 'dais', 'fallen', 'rail'];

/**
 * The wreck by part, each its vertices in the renderer's format: the hull's skin and fairings,
 * the tail's and the nose's ends, what is inside the hull, the two wings, the debris (the engines, the rails), the camps. Read from the map at the call.
 */
export const parts = (def: WorldDef) => {
  const w = def.relief && ({ relief: raise(def.relief) } as World);
  gy = (x, z) => {
    const g = w ? ground(w, x, z) : 0;
    return g > -1e9 ? g : 0;
  };
  const made = (f: () => void) => {
    o = [];
    f();
    return o;
  };
  const scrap = (camp: boolean) => () => {
    for (const p of LAYOUT.pieces) {
      // The crates inside the hull are the wreck's.
      const home = CAMP.includes(p.kind) && Math.abs((p.min[2] + p.max[2]) / 2 - MID) > 1;
      if (KIND[p.kind] && home == camp) {
        const b = def.brushes.find(e =>
          e.min.every((v, i) => v == p.min[i] && e.max[i] == p.max[i]),
        );
        KIND[p.kind](p, b?.tint, (p.min[2] + p.max[2]) / 2 < MID ? -1 : 1);
        if (!BARE.includes(p.kind)) {
          drift(p);
        }
      }
    }
  };
  return {
    // First: drawn before the skin and the linings, what they hide from inside is not shaded twice.
    cabin: made(cabin),
    hull: made(() => {
      SHIP.forEach((_, n) => skin(n));
      fairings();
    }),
    ends: made(() => {
      tail();
      tip();
    }),
    inside: made(() => SHIP.forEach((_, n) => inside(n))),
    wings: made(() => [1, -1].forEach(wing)),
    debris: made(scrap(false)),
    camps: made(scrap(true)),
  };
};

/** Its vertices, in the renderer's format. */
export const hulk = (def: WorldDef): number[] => Object.values(parts(def)).flat();
