// The moon's space helmet, to the shape of the marine's helmet the user gave (2026-11-11, a
// picture of its front; until then a wider one with a long snout): a boxy hard shell; a block on
// top, set back from the brow, with a pale bar in segments across its front; a tall green visor
// under a heavy brow, its lower edge falling from its ends to the jaw box, which comes up into its
// middle; the jaw box with a short slot at its top and four vent slots under it; a vent each side
// of it and one each side of the visor; a tall plate on each ear with a light strip; L-shaped
// blocks down the sides; a ring at the neck. A pure function of the head joint's place: no state,
// no DOM. Built once per level of detail, in the head's own frame (the head joint's rest pose,
// metres, -z the front) and appended where the head is.
import { TAU } from '../shared/physics';
import { GLOW, glow } from './flag';
import { GLOSS, SHINE, STRIDE, aim, dress, place, smooth } from './mesh';
import type { Vec3 } from './mesh';
import { turn } from './rig';
import type { Quat } from './rig';

/**
 * The shell, a superellipsoid in the head joint's frame: its centre and half width, height and
 * depth, its exponents across (square seen from above) and up (flat on top), and its rim, the
 * height it is cut at under the chin. It holds the ellipsoid of the same half axes, which holds the
 * head of the skin (skin.ts, 1.555 to 1.803 m, the head joint at 1.62) from the jaw up.
 */
export const SHELL = {
  c: [0, 0.05, 0.003] as Vec3,
  r: [0.114, 0.1495, 0.139] as Vec3,
  e: [3.2, 3] as [number, number],
  rim: -0.08,
};

/**
 * The visor's opening, wrapped round the shell: a rounded band in (u, y), u the arc round the
 * shell from the front (the turn times `WRAP`, metres-like, + to the right): its centre and half
 * width and height. Across the eyes (at 0.07 over the head joint) and round to the sides, its lower
 * edge curving up there by `rise` at its ends while its top stays level (the user, 2026-11-10:
 * curved on the sides, then curved up). The visor is a plate on the shell `LIFT` over it; the rim
 * round it stands out, most at the brow.
 */
export const VISOR = {
  c: [0, 0.068] as [number, number],
  r: [0.124, 0.052] as [number, number],
  rise: 0.052,
  /** How much lower its upper edge is in the middle than at its ends: a frown under the brow. */
  frown: 0.012,
  /** The notch in its lower edge where the guard comes up (the user: the mouth rises in the middle): how high, and the half widths of its flat top and of its foot. */
  up: 0.034,
  notch: [0.028, 0.062] as [number, number],
};
/**
 * The whole helmet is drawn this much smaller than built, about the shell's middle (the user,
 * 2026-11-10: a little smaller overall); the head still has room inside (its crown, the nearest,
 * is at 0.89 of the shell).
 */
export const SCALE = 0.93;

/** A point of the helmet as built to where it is drawn, in the head's frame. */
export const shrunk = (p: Vec3): Vec3 =>
  [0, 1, 2].map(k => SHELL.c[k] + (p[k] - SHELL.c[k]) * SCALE) as Vec3;

/** Metres of u a radian of turn round the shell. */
export const WRAP = 0.125;
/** The visor's corners: the exponent of its superellipse. */
const CORNER = 7;
const LIFT = 0.003;
/** How far past the visor's edge its rim covers the shell (it is RIM[0] + 0.6 RIM[2] wide). */
const COVER = 0.012;
/** The rim: how wide it is round the visor, how far it stands out, and how much more at the brow. */
const RIM = [0.006, 0.005, 0.016];

/**
 * The mouth guard: rings from its top under the visor to the chin, each [height, half width at its
 * front and at its back, front, back] (y, x, z): a snout jutting well ahead (the user, 2026-11-10),
 * its front a rounded trapezoid, narrow at the top; wider behind, boxy (superellipses of
 * `GUARD_E`). Its back is inside the shell.
 */
const GUARD = [
  [0.05, 0.02, 0.034, -0.146, -0.085],
  [0.036, 0.03, 0.052, -0.164, -0.085],
  [0.012, 0.036, 0.062, -0.176, -0.085],
  [-0.02, 0.04, 0.07, -0.18, -0.085],
  [-0.055, 0.04, 0.072, -0.178, -0.085],
  [-0.082, 0.038, 0.066, -0.168, -0.085],
  [-0.094, 0.03, 0.054, -0.15, -0.085],
];
const GUARD_E = 6;

/**
 * The cheek blocks (the user, 2026-11-10): a raised band on each side, along the ear plate's front
 * edge straight down, then at a right angle forward along the jaw to the guard. Its path in (u, y) (see
 * VISOR) for the right side, the corner's radius, its half width and how far it stands out.
 */
const CHEEK = {
  path: [
    [0.172, 0.04],
    [0.172, -0.045],
    [0.082, -0.045],
  ],
  round: 0.01,
  w: 0.028,
  h: 0.036,
};

/**
 * The air intakes (the user, 2026-11-10: more vents on top and on the sides): framed openings
 * standing out of the shell, dark inside, crossed by slats. Each [u, y, half width, half height,
 * slats, slats upright, how far it stands out]: one small on each cheek beside the guard. The
 * big one on top is a block of its own (ROOF).
 */
/**
 * The vent block on top (the user, 2026-11-10: just that on top, no crest, one block the helmet's
 * whole length with a grille at its front only): a slab lying on the crown from the brow to the
 * back, following its curve; its half width, its front and back (z), how far it stands over the
 * shell, the grille's slats and how far back from the front the grille goes.
 */
const ROOF = { w: 0.07, z: [-0.104, 0.13], h: 0.028, slats: 6 };

/** The height of the shell's top at (x, z). */
const topAt = (x: number, z: number) => {
  const [A, B, D] = SHELL.r;
  const [p, q] = SHELL.e;
  const g = Math.abs(x / A) ** p + Math.abs((z - SHELL.c[2]) / D) ** p;
  return SHELL.c[1] + B * Math.max(1 - g ** (q / p), 0) ** (1 / q);
};

/** How deep in the shell the intakes' walls start, so a big one meets the curve all round. */
const FOOT = -0.03;
const INTAKES = [
  [0.092, -0.034, 0.013, 0.032, 0, 0, 0.009],
  [-0.092, -0.034, 0.013, 0.032, 0, 0, 0.009],
  [0.142, 0.082, 0.008, 0.028, 3, 0, 0.006],
  [-0.142, 0.082, 0.008, 0.028, 3, 0, 0.006],
];

/** The ear plates: centre (y, z), half height and depth, and from where in the shell out to where. */
const PLATE = { c: [0.035, 0.024], r: [0.092, 0.064], x: [0.09, 0.148] };

/**
 * Sides around and rows up of the shell; points round the visor's edge; sides of the guard, the
 * plates; whether there are vents and the collar. The far helmet is the shell and the visor.
 */
const DETAIL = [
  {
    shell: [12, 4],
    visor: 28,
    guard: 0,
    plate: 0,

    vents: false,
    collar: 0,
  },
  {
    shell: [20, 8],
    visor: 40,
    guard: 12,
    plate: 12,

    vents: false,
    collar: 12,
  },
  {
    shell: [32, 12],
    visor: 56,
    guard: 20,
    plate: 20,

    vents: true,
    collar: 20,
  },
];

const WHITE = [0.88, 0.89, 0.92];
const PALE = [0.74, 0.76, 0.8];
const GREY = [0.5, 0.52, 0.56];
/** The side blocks: darker than the shell, so their volumes read in the moon's hard light. */
const BLOCK = [0.6, 0.62, 0.66];
const IRON = [0.25, 0.27, 0.3];
const VENT = [0.05, 0.05, 0.06];
const LIGHT = [0.97, 0.98, 1];
const TINT = [0.02, 0.1, 0.06];

export type Spot = [Vec3, Vec3];

export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const unit = (v: Vec3): Vec3 => {
  const l = Math.hypot(...v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
/** A signed power: the superellipse's |t|^p keeping t's sign. */
export const pow = (t: number, p: number) => Math.sign(t) * Math.abs(t) ** p;

/** A triangle over `p`, wound as its first normal faces, in `col` on `layer`; none if it has no area. */
const face = (out: number[], col: number[], layer: number, p: Spot[]) => {
  const c = cross(sub(p[1][0], p[0][0]), sub(p[2][0], p[0][0]));
  if (Math.hypot(...c) < 1e-9) {
    return;
  }
  const n = p[0][1];
  const flip = c[0] * n[0] + c[1] * n[1] + c[2] * n[2] < 0;
  (flip ? [p[0], p[2], p[1]] : p).forEach(([q, m]) =>
    out.push(...q, ...m, col[0], col[1], layer, col[2]),
  );
};

/**
 * Triangles between the rows of points `rows`, each a closed ring of n (the first and the last may
 * be one point), in `col` on `layer`; wound as the normals face. Triangles of no area are left out.
 */
export const sheet = (rows: Spot[][], col: number[], layer: number, out: number[] = []) => {
  const tri = (...p: Spot[]) => face(out, col, layer, p);
  rows.slice(1).forEach((row, r) => {
    const prev = rows[r];
    const n = Math.max(row.length, prev.length);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const [a, b] = [prev[i % prev.length], prev[j % prev.length]];
      const [c, d] = [row[i % row.length], row[j % row.length]];
      tri(a, c, d);
      tri(a, d, b);
    }
  });
  return out;
};

/** A flat quad over the corners `q` (in turn round it), facing `m`, in `col` on `layer`. */
export const quad = (out: number[], q: Vec3[], m: Vec3, col: number[], layer = -1) => {
  const s = q.map(p => [p, m] as Spot);
  face(out, col, layer, [s[0], s[1], s[2]]);
  face(out, col, layer, [s[0], s[2], s[3]]);
};

/**
 * A closed loft: `f(t, s)` the point at the turn t (0 to 1 round) of its ring s (0 to 1 along),
 * `n` points round and the rows at `along`; the ends closed by a point at `ends` (its first and
 * last). Normals by differences, away from the loft's middle line `mid(s)`.
 */
export const loft = (
  f: (t: number, s: number) => Vec3,
  mid: (s: number) => Vec3,
  n: number,
  along: number[],
  ends: [Vec3, Vec3],
  col: number[],
  out: number[] = [],
) => {
  const h = 1e-4;
  const at = (t: number, s: number): Spot => {
    const p = f(t, s);
    let m = unit(
      cross(sub(f(t + h, s), f(t - h, s)), sub(f(t, Math.min(s + h, 1)), f(t, Math.max(s - h, 0)))),
    );
    const o = sub(p, mid(s));
    if (m[0] * o[0] + m[1] * o[1] + m[2] * o[2] < 0) {
      m = [-m[0], -m[1], -m[2]];
    }
    return [p, m];
  };
  // The end caps are flat: their normal is along the loft, out.
  const cap = (s: number): Spot => {
    const d = unit(sub(mid(s ? 1 : 0), mid(s ? 1 - 0.01 : 0.01)));
    return [ends[s], d];
  };
  const rows = along.map(s => Array.from({ length: n }, (_, i) => at(i / n, s)));
  return sheet([[cap(0)], ...rows, [cap(1)]], col, -1, out);
};

/** The shell's surface grown by `off` at (u, y) (see VISOR), and its normal. */
const onShell = (u: number, y: number, off: number): Spot => {
  const [A, B, D] = SHELL.r.map(v => v + off);
  const [p, q] = SHELL.e;
  const h = Math.max(1 - Math.abs((y - SHELL.c[1]) / B) ** q, 0) ** (1 / q);
  const a = u / WRAP;
  const pt: Vec3 = [
    SHELL.c[0] + A * h * pow(Math.sin(a), 2 / p),
    y,
    SHELL.c[2] - D * h * pow(Math.cos(a), 2 / p),
  ];
  return [pt, normal(pt, off)];
};

/** Where `pt` on the shell is in (u, y) (see VISOR). */
export const uOf = (pt: Vec3): number => {
  const [A, , D] = SHELL.r;
  const p = SHELL.e[0];
  return (
    WRAP * Math.atan2(pow((pt[0] - SHELL.c[0]) / A, p / 2), pow((SHELL.c[2] - pt[2]) / D, p / 2))
  );
};

/** The visor's band at u: its middle height and half height, its lower edge rising to the sides and in the notch. */
export const band = (u: number): [number, number] => {
  const [n0, n1] = VISOR.notch;
  const a = Math.abs(u);
  // The notch: where the guard comes up into it, between the eyes.
  const up = a < n0 ? 1 : a < n1 ? (1 + Math.cos((Math.PI * (a - n0)) / (n1 - n0))) / 2 : 0;
  // Its lower edge runs straight up to its ends, a V; its upper edge comes down to the middle, a frown.
  const t = Math.min(a / VISOR.r[0], 1);
  const top = VISOR.c[1] + VISOR.r[1] - VISOR.frown * (1 - t);
  const low = VISOR.c[1] - VISOR.r[1] + VISOR.rise * t ** 1.15 + VISOR.up * up;
  return [(top + low) / 2, (top - low) / 2];
};

/** The shell's normal at `pt` (grown by `off`): the gradient of its implicit form. */
const normal = (pt: Vec3, off = 0): Vec3 => {
  const [A, B, D] = SHELL.r.map(v => v + off);
  const [p, q] = SHELL.e;
  const [x, y, z] = sub(pt, SHELL.c);
  const g = Math.abs(x / A) ** p + Math.abs(z / D) ** p;
  if (g < 1e-12) {
    return [0, Math.sign(y) || 1, 0];
  }
  const k = g ** (q / p - 1);
  return unit([(k * pow(x / A, p - 1)) / A, pow(y / B, q - 1) / B, (k * pow(z / D, p - 1)) / D]);
};

/** The point of the shell at latitude `a` (radians from its equator) and turn `t` (0 the front, 0.25 the right). */
const shellAt = (a: number, t: number): Vec3 => {
  const [A, B, D] = SHELL.r;
  const [p, q] = SHELL.e;
  const h = Math.abs(Math.cos(a)) ** (2 / q);
  const th = t * TAU;
  return [
    SHELL.c[0] + A * h * pow(Math.sin(th), 2 / p),
    SHELL.c[1] + B * pow(Math.sin(a), 2 / q),
    SHELL.c[2] - D * h * pow(Math.cos(th), 2 / p),
  ];
};

/** The visor's edge, dense, in (u, y), with the length along it up to each point: its points spread evenly by length (edge()). */
const CONTOUR = (() => {
  const n = 4096;
  const pts = Array.from({ length: n + 1 }, (_, i): [number, number] => {
    const a = (i / n) * TAU;
    const u = VISOR.c[0] + VISOR.r[0] * pow(Math.cos(a), 2 / CORNER);
    const [m, h] = band(u);
    return [u, m + h * pow(Math.sin(a), 2 / CORNER)];
  });
  const len = [0];
  pts.slice(1).forEach((p, i) => len.push(len[i] + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1])));
  return { pts, len };
})();

/** The visor's edge at `t` (0 to 1 round it by length, from the right end), grown out by `w` metres, in (u, y), and its outward direction there. */
const edge = (t: number, w: number): [number, number, number, number] => {
  const { pts, len } = CONTOUR;
  const at = (f: number): [number, number] => {
    const L = (((f % 1) + 1) % 1) * len[len.length - 1];
    let [lo, hi] = [0, len.length - 1];
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      [lo, hi] = len[m] <= L ? [m, hi] : [lo, m];
    }
    const k = (L - len[lo]) / (len[hi] - len[lo] || 1);
    return [pts[lo][0] + (pts[hi][0] - pts[lo][0]) * k, pts[lo][1] + (pts[hi][1] - pts[lo][1]) * k];
  };
  const [p, a, b] = [at(t), at(t - 1e-3), at(t + 1e-3)];
  const d = unit([b[1] - a[1], -(b[0] - a[0]), 0]);
  return [p[0] + d[0] * w, p[1] + d[1] * w, d[0], d[1]];
};

/** Whether (u, y) is inside the visor's opening shrunk by `k`. */
export const inside = (u: number, y: number, k = 1) => {
  const [m, h] = band(u);
  return (
    Math.abs((u - VISOR.c[0]) / VISOR.r[0]) ** CORNER + Math.abs((y - m) / h) ** CORNER <
    k ** CORNER
  );
};

/** The guard's ring at s (0 its top, 1 the chin), eased between its rows: [y, half width, front, back]. */
const guardAt = (s: number) => {
  const f = s * (GUARD.length - 1);
  const i = Math.min(Math.floor(f), GUARD.length - 2);
  const k = f - i;
  return GUARD[i].map((v, j) => v + (GUARD[i + 1][j] - v) * k);
};

/** The guard's half width at depth z of its ring [y, front width, back width, front, back]. */
const wide = ([, wf, wb, front, back]: number[], z: number) =>
  wf + ((wb - wf) * (z - front)) / (back - front);

/** The guard's surface at turn t (0 the front, 0.25 the right) of its ring s. */
const guard = (t: number, s: number): Vec3 => {
  const g = guardAt(s);
  const [y, , , front, back] = g;
  const [zc, d] = [(front + back) / 2, (back - front) / 2];
  const th = t * TAU;
  const z = zc - d * pow(Math.cos(th), 2 / GUARD_E);
  return [wide(g, z) * pow(Math.sin(th), 2 / GUARD_E), y, z];
};

/** The guard's ring s at height y: its rows are not evenly spaced in y. */
const guardOf = (y: number) => {
  const i = Math.max(
    GUARD.findIndex((r, k) => k && r[0] <= y),
    1,
  );
  const [a, b] = [GUARD[i - 1][0], GUARD[i][0]];
  return (i - 1 + (a - y) / (a - b)) / (GUARD.length - 1);
};

/** How many scratches the close helmet has, and their colours: the shell's paint worn to its grey, or scuffed paler. */
const SCRATCHES = 70;
const WORN = [
  [0.46, 0.47, 0.5],
  [0.6, 0.61, 0.64],
  [0.97, 0.97, 0.98],
];

/**
 * Thin scratches over the shell (the user, 2026-11-10), matte on the gloss: short strokes bent a
 * little, at random but the same every time, kept off the visor; a hair over the shell's surface.
 */
const scratches = (out: number[]) => {
  let seed = 0x5eed;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let z = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) ^ z;
    return ((z ^ (z >>> 14)) >>> 0) / 2 ** 32;
  };
  const a0 = Math.asin(pow((SHELL.rim + 0.015 - SHELL.c[1]) / SHELL.r[1], SHELL.e[1] / 2));
  for (let n = 0; n < SCRATCHES;) {
    const [lat, t] = [a0 + rand() * (1.35 - a0), rand()];
    const p = shellAt(lat, t);
    const keep = !(p[2] < -0.02 && inside(uOf(p), p[1], 1.6));
    const [len, wide, turn, col] = [
      0.01 + rand() * 0.03,
      0.0006 + rand() * 0.0007,
      rand() * TAU,
      WORN[Math.floor(rand() * 3)],
    ];
    const bend = (rand() - 0.5) * 0.8;
    if (!keep) {
      continue;
    }
    n++;
    const nn = normal(p);
    const e1 = unit(cross(nn, Math.abs(nn[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]));
    const e2 = cross(nn, e1);
    // A stroke of three pieces, on the plane touching the shell, carried back onto it.
    const pts = Array.from({ length: 4 }, (_, i) => {
      const s = (i / 3 - 0.5) * len;
      const a = turn + bend * (i / 3 - 0.5);
      const d = [0, 1, 2].map(k => p[k] + (e1[k] * Math.cos(a) + e2[k] * Math.sin(a)) * s) as Vec3;
      const m = normal(d);
      // Back onto the surface: along the normal to where the implicit form is 1, roughly.
      const [A, B, Dd] = SHELL.r;
      const [pp, q] = SHELL.e;
      const [x, y, z] = sub(d, SHELL.c);
      const f = (Math.abs(x / A) ** pp + Math.abs(z / Dd) ** pp) ** (q / pp) + Math.abs(y / B) ** q;
      const k = f ** (-1 / q);
      return [[SHELL.c[0] + x * k, SHELL.c[1] + y * k, SHELL.c[2] + z * k], m] as Spot;
    });
    for (let i = 0; i < 3; i++) {
      const [[a, m], [b]] = [pts[i], pts[i + 1]];
      const along = unit(sub(b, a));
      const side = cross(m, along).map(v => v * wide) as Vec3;
      const lift = m.map(v => v * 0.0007) as Vec3;
      const c = (o: Vec3, sgn: number): Vec3 =>
        [0, 1, 2].map(k => o[k] + lift[k] + side[k] * sgn) as Vec3;
      quad(out, [c(a, -1), c(b, -1), c(b, 1), c(a, 1)], m, col);
    }
  }
};

interface Kit {
  shell: number[];
  visor: number[];
  rim: number[];
  guard: number[];
  vents: number[];
  plates: number[];
  strips: number[];
  intakes: number[];
  cheeks: number[];
  scratches: number[];
  collar: number[];
}

const kits = new Map<number, Kit>();

const kit = (lod: number): Kit => {
  const level = Math.min(lod, 2);
  const k = kits.get(level);
  if (k) {
    return k;
  }
  const D = DETAIL[level];
  const [lon, lat] = D.shell;
  // The shell from its rim up to the crown, less what the visor hides.
  const a0 = Math.asin(pow((SHELL.rim - SHELL.c[1]) / SHELL.r[1], SHELL.e[1] / 2));
  const rows: Spot[][] = Array.from({ length: lat }, (_, r) => {
    const a = a0 + ((TAU / 4 - a0) * r) / lat;
    return Array.from({ length: lon }, (_, i) => {
      const p = shellAt(a, i / lon);
      return [p, normal(p)] as Spot;
    });
  });
  const crown: Spot = [
    [SHELL.c[0], SHELL.c[1] + SHELL.r[1], SHELL.c[2]],
    [0, 1, 0],
  ];
  const whole = sheet([...rows, [crown]], WHITE, -1);
  const shell: number[] = [];
  for (let i = 0; i < whole.length; i += 30) {
    // The triangles the visor and its rim cover all of: the others show round it, and none is
    // left just behind the visor to flicker through it.
    const hidden = [0, 10, 20].every(j => {
      const y = whole[i + j + 1];
      const u = uOf(whole.slice(i + j, i + j + 3) as Vec3);
      const m = band(u)[0];
      const near = (v: number, c: number) => v - Math.max(-COVER, Math.min(COVER, v - c));
      return whole[i + j + 2] < -0.02 && inside(near(u, VISOR.c[0]), near(y, m), 1);
    });
    if (!hidden) {
      shell.push(...whole.slice(i, i + 30));
    }
  }
  const n = D.visor;
  const ring = (w: number, lift: (t: number) => number): Spot[] =>
    Array.from({ length: n }, (_, i) => {
      const [x, y] = edge(i / n, w);
      return onShell(x, y, lift(i / n));
    });
  // The plate's rows from its middle out to the opening's edge.
  const scaled = (s: number): Spot[] =>
    Array.from({ length: n }, (_, i) => {
      // Scaled about the band's own middle line, which curves down at the sides.
      const [u, y] = edge(i / n, 0);
      const v = VISOR.c[0] + (u - VISOR.c[0]) * s;
      const [[m, h], [mv, hv]] = [band(u), band(v)];
      return onShell(v, mv + ((y - m) / h) * hv * s, LIFT);
    });
  const visor = sheet(
    [[onShell(VISOR.c[0], VISOR.c[1], LIFT)], scaled(0.35), scaled(0.7), scaled(1)],
    TINT,
    SHINE,
  );
  // The rim: from the shell up to a lip round the visor, the brow standing out most, and down its
  // inner wall to the visor. Far, none.
  const [RW, RO, RB] = RIM;
  const height = (t: number) => RO + RB * Math.max(edge(t, 0)[3], 0) ** 2;
  const rim =
    level > 0
      ? sheet(
          [
            ring(RW + RB * 0.6, () => 0),
            ring(0.004, height),
            ring(0, height),
            ring(-0.0005, () => LIFT),
          ],
          GREY,
          -1,
        )
      : [];
  const kitOut: Kit = {
    shell,
    visor,
    rim,
    guard: [],
    vents: [],
    plates: [],
    strips: [],
    intakes: [],
    cheeks: [],
    scratches: [],
    collar: [],
  };
  if (D.guard) {
    const steps = GUARD.map((_, i) => i / (GUARD.length - 1));
    const top = guardAt(0);
    const low = guardAt(1);
    loft(
      guard,
      s => {
        const [y, , , f, b] = guardAt(s);
        return [0, y, (f + b) / 2];
      },
      D.guard,
      steps,
      [
        [0, top[0] + 0.003, (top[3] + top[4]) / 2],
        [0, low[0] - 0.003, (low[3] + low[4]) / 2],
      ],
      PALE,
      kitOut.guard,
    );
  }
  if (D.vents) {
    // Four slots across the guard's front, as wide as it is there, a hair out of it; each in
    // pieces, so it follows the front's curve.
    const on = (k: number, y: number): Vec3 => {
      const g = guardAt(guardOf(y));
      const [, , , front, back] = g;
      const [zc, d] = [(front + back) / 2, (back - front) / 2];
      const x = k * wide(g, front);
      return [x, y, zc - d * Math.max(1 - Math.abs(k) ** GUARD_E, 0) ** (1 / GUARD_E) - 0.0025];
    };
    const PIECES = 6;
    // And a short one over them, at the box's top.
    for (const [y, span] of [
      [0.028, 0.38],
      [-0.012, 0.72],
      [-0.03, 0.72],
      [-0.048, 0.72],
      [-0.066, 0.72],
    ]) {
      const [y0, y1] = [y - 0.0032, y + 0.0032];
      for (let i = 0; i < PIECES; i++) {
        const [k0, k1] = [-span + (2 * span * i) / PIECES, -span + (2 * span * (i + 1)) / PIECES];
        const q = [on(k0, y0), on(k1, y0), on(k1, y1), on(k0, y1)];
        const m = unit(cross(sub(q[1], q[0]), sub(q[3], q[0])));
        quad(kitOut.vents, q, m[2] > 0 ? (m.map(v => -v) as Vec3) : m, VENT);
      }
    }
  }
  if (D.plate) {
    for (const side of [-1, 1]) {
      // The band's middle line: the path's two legs, the corner rounded by a quarter circle.
      const [[u0, y0], [u1, y1], [u2, y2]] = CHEEK.path;
      const r = CHEEK.round;
      const line: [number, number][] = [];
      const legs = D.plate;
      for (let i = 0; i <= legs; i++) {
        line.push([u0, y0 + (y1 + r - y0) * (i / legs)]);
      }
      for (let i = 1; i < 6; i++) {
        const a = (i / 6) * (TAU / 4);
        line.push([u1 - r + r * Math.cos(a), y1 + r - r * Math.sin(a)]);
      }
      for (let i = 0; i <= legs; i++) {
        line.push([u1 - r + (u2 - u1 + r) * (i / legs), y2]);
      }
      const [W, H] = [CHEEK.w, CHEEK.h];
      const pt = (u: number, y: number, off: number) => onShell(u * side, y, off)[0];
      const rows = line.map(([u, y], i) => {
        const [a, b] = [line[Math.max(i - 1, 0)], line[Math.min(i + 1, line.length - 1)]];
        // Across the band, in (u, y), then the 3D directions: out of the shell and across it.
        const d = unit([-(b[1] - a[1]), b[0] - a[0], 0]);
        const [, n] = onShell(u * side, y, 0);
        const across = unit(
          sub(pt(u + d[0] * 1e-3, y + d[1] * 1e-3, 0), pt(u - d[0] * 1e-3, y - d[1] * 1e-3, 0)),
        );
        const wall = (k: number) => unit([0, 1, 2].map(j => n[j] * 0.45 + across[j] * k) as Vec3);
        const at = (k: number, off: number) => pt(u + d[0] * k, y + d[1] * k, off);
        // Its foot in the shell, the bevelled top's two edges, the other foot.
        return [
          [at(-W * 1.2, -0.002), wall(-1)],
          [at(-W, H), unit([0, 1, 2].map(j => n[j] + across[j] * -0.3) as Vec3)],
          [at(W, H), unit([0, 1, 2].map(j => n[j] + across[j] * 0.3) as Vec3)],
          [at(W * 1.2, -0.002), wall(1)],
        ] as Spot[];
      });
      // Its ends closed flat.
      const end = (i: number, j: number): Spot => {
        const [u, y] = line[i];
        const [pu, py] = line[j];
        const t = unit(sub(pt(u, y, 0), pt(pu, py, 0)));
        return [pt(u, y, H * 0.5), t];
      };
      sheet(
        [[end(0, 1)], ...rows, [end(line.length - 1, line.length - 2)]],
        BLOCK,
        -1,
        kitOut.cheeks,
      );
    }
    for (const [u, y, w, h, slats, upright, out] of INTAKES) {
      // A frame on the shell where it is: across its surface along `side` and up, out along `n`.
      const [o, n] = onShell(u, y, 0);
      const flat = n[1] > 0.9;
      const up = unit(
        sub(flat ? [0, 0, -1] : [0, 1, 0], n.map(v => v * (flat ? -n[2] : n[1])) as Vec3),
      );
      const side = cross(up, n);
      const at = (a: number, b: number, c: number): Vec3 =>
        [0, 1, 2].map(k => o[k] + side[k] * a + up[k] * b + n[k] * c) as Vec3;
      const ring = (t: number, k: number, c: number): Vec3 => {
        const th = t * TAU;
        return at(w * k * pow(Math.cos(th), 2 / CORNER), h * k * pow(Math.sin(th), 2 / CORNER), c);
      };
      // The frame: from inside the shell out to its lip, then in to the opening's edge.
      loft(
        (t, s) => {
          const [k, c] =
            s < 0.5
              ? [1 + 0.06 * (1 - 2 * s), FOOT + (out - FOOT) * 2 * s]
              : [1 - (0.3 * (2 * s - 1) * 0.012) / Math.min(w, h), out];
          return ring(t, k, c);
        },
        s => at(0, 0, FOOT + (out - FOOT) * s),
        D.plate,
        [0, 0.45, 0.5, 1],
        [at(0, 0, FOOT), at(0, 0, out - 0.0001)],
        PALE,
        kitOut.intakes,
      );
      // The dark inside, a little in from the lip, and the slats across it.
      const dark = Array.from(
        { length: D.plate },
        (_, i) => [ring(i / D.plate, 0.72, out + 0.0004), n] as Spot,
      );
      sheet([[[at(0, 0, out + 0.0004), n]], dark], VENT, -1, kitOut.intakes);
      for (let i = 1; i <= slats; i++) {
        const f = (2 * i) / (slats + 1) - 1;
        const [a0, b0] = upright ? [f * w * 0.7, -h * 0.7] : [-w * 0.7, f * h * 0.7];
        const [a1, b1] = upright ? [a0, h * 0.7] : [w * 0.7, b0];
        const t = upright ? [0.0016, 0] : [0, 0.0016];
        quad(
          kitOut.intakes,
          [
            at(a0 - t[0], b0 - t[1], out + 0.0012),
            at(a1 - t[0], b1 - t[1], out + 0.0012),
            at(a1 + t[0], b1 + t[1], out + 0.0012),
            at(a0 + t[0], b0 + t[1], out + 0.0012),
          ],
          n,
          GREY,
        );
      }
    }
    const [cy, cz] = PLATE.c;
    const [hy, hz] = PLATE.r;
    const [x0, x1] = PLATE.x;
    for (const side of [-1, 1]) {
      // Along x out of the shell: the plate's full face, a bevel, then its flat front.
      const xs = [x0, x1 - 0.022, x1];
      const scale = [1, 0.96, 0.58];
      loft(
        (t, s) => {
          const f = s * (xs.length - 1);
          const i = Math.min(Math.floor(f), xs.length - 2);
          const k = f - i;
          const x = xs[i] + (xs[i + 1] - xs[i]) * k;
          const c = scale[i] + (scale[i + 1] - scale[i]) * k;
          const th = t * TAU;
          return [
            x * side,
            cy + hy * c * pow(Math.sin(th), 2 / CORNER),
            cz + hz * c * pow(Math.cos(th), 2 / CORNER),
          ];
        },
        s => [(x0 + (x1 - x0) * s) * side, cy, cz],
        D.plate,
        [0, 0.5, 1],
        [
          [(x0 - 0.001) * side, cy, cz],
          [(x1 + 0.0005) * side, cy, cz],
        ],
        BLOCK,
        kitOut.plates,
      );
      // A light strip up the plate's back edge, a hair out of its face.
      const x = (x1 + 0.0012) * side;
      const [za, zb] = [cz + hz * 0.45, cz + hz * 0.62];
      const [ya, yb] = [cy - hy * 0.55, cy + hy * 0.55];
      const m: Vec3 = [side, 0, 0];
      quad(
        kitOut.strips,
        [
          [x, ya, za],
          [x, ya, zb],
          [x, yb, zb],
          [x, yb, za],
        ],
        m,
        [1, 1, 1],
      );
    }
  }
  if (D.plate) {
    // The roof block: rings across it along z, each from its feet sunk in the shell to its flat top.
    const { w, h } = ROOF;
    const [za, zb] = ROOF.z;
    const zOf = (s: number) => za + (zb - za) * s;
    // From the middle back it sinks into the shell (the user: fading into the mass at the back):
    // its height falls under the surface and its top bends to the shell's curve.
    const fade = (s: number) => (s < 0.4 ? 1 : (1 + Math.cos((Math.PI * (s - 0.4)) / 0.6)) / 2);
    const tall = (s: number) => h * (fade(s) * 1.15 - 0.15);
    const ring = (t: number, s: number): Vec3 => {
      const z = zOf(s);
      const th = t * TAU;
      const x = w * pow(Math.cos(th), 2 / 6);
      const f = fade(s);
      const yb = topAt(x, z) - 0.01;
      const yt = topAt(0, z) * f + topAt(x, z) * (1 - f) + tall(s);
      return [x, yb + ((yt - yb) * (1 + pow(Math.sin(th), 2 / 6))) / 2, z];
    };
    loft(
      ring,
      s => [0, topAt(0, zOf(s)) + tall(s) / 2 - 0.005, zOf(s)],
      D.plate,
      Array.from({ length: 25 }, (_, i) => i / 24),
      [
        [0, topAt(0, za) + h / 2, za - 0.002],
        [0, topAt(0, zb) - 0.006, zb + 0.001],
      ],
      PALE,
      kitOut.intakes,
    );
    // The panel on its front face: a pale bar in a row of segments, a hair in front of it.
    const [y0, y1] = [topAt(0, za) + 0.003, topAt(0, za) + h - 0.004];
    const bar = (x0: number, x1: number, z: number, col: number[]) =>
      quad(
        kitOut.intakes,
        [
          [x0, y0, z],
          [x1, y0, z],
          [x1, y1, z],
          [x0, y1, z],
        ],
        [0, 0, -1],
        col,
      );
    bar(-w * 0.8, w * 0.8, za - 0.0035, LIGHT);
    for (let k = 1; k <= ROOF.slats; k++) {
      const x = -w * 0.8 + (k * 1.6 * w) / (ROOF.slats + 1);
      bar(x - 0.0012, x + 0.0012, za - 0.0042, GREY);
    }
  }
  if (D.collar) {
    kitOut.collar = dress(
      smooth(
        [
          [0.92, 0],
          [1, 1],
        ],
        D.collar,
      ),
      [1, 1, 1],
    );
  }
  // Hard and glossy (the user, 2026-11-10: reflections), then scratched close up.
  for (const v of [kitOut.shell, kitOut.guard, kitOut.plates, kitOut.intakes, kitOut.cheeks]) {
    for (let i = 8; i < v.length; i += STRIDE) {
      v[i] = v[i] == -1 ? GLOSS : v[i];
    }
  }
  if (D.vents) {
    scratches(kitOut.scratches);
  }
  kits.set(level, kitOut);
  return kitOut;
};

/**
 * Appends the helmet at level of detail `lod` (0 far, 1 near, 2 and up close) on the head joint at
 * `at` turned by `q` (see solve() in rig.ts), in `rgb`, the team's colour (0 to 1): the strips on
 * the ear plates, which glow. The far helmet is the shell and the visor.
 */
export const helmet = (out: number[], at: Vec3, q: Quat, rgb: number[], lod: number) => {
  const k = kit(lod);
  const head = (v: Vec3) => turn(q, v);
  /** Places `src` scaled by `s` at `p` in the head's frame (shrunk by SCALE about the shell's middle), its axis along `to`, its x as near `side` as it can be. */
  const part = (src: number[], p: Vec3, to: Vec3, side: Vec3, s: Vec3, tint?: number[]) => {
    const [r, u, f] = aim(to, side);
    const o = head(shrunk(p));
    place(
      out,
      src,
      [at[0] + o[0], at[1] + o[1], at[2] + o[2]],
      [head(r), head(u), head(f)],
      [0, 0, 0],
      s.map(v => v * SCALE) as Vec3,
      tint,
    );
  };
  const asIs = (src: number[], tint?: number[]) =>
    part(src, [0, 0, 0], [0, 0, -1], [1, 0, 0], [1, 1, 1], tint);
  // All of it is built in the head's frame already, but the collar (a unit tube).
  for (const src of [
    k.shell,
    k.visor,
    k.rim,
    k.guard,
    k.vents,
    k.plates,
    k.intakes,
    k.cheeks,
    k.scratches,
  ]) {
    asIs(src);
  }
  if (!lod) {
    return;
  }
  part(k.collar, [0, SHELL.rim - 0.005, 0], [0, 1, 0], [1, 0, 0], [0.085, 0.098, 0.03], IRON);
  const from = out.length;
  asIs(k.strips, rgb);
  glow(out, from, GLOW);
};
