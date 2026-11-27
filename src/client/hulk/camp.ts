// The survivors' camp round each flag on Landfall (the user, 2026-11-27): a hearth ringed with
// stones, logs to sit on round it, a pile of firewood, woven mats on the sand, dirty and torn, and a rack of fish
// drying, all askew: nothing square to the map (the user, 2026-11-27). The map lays them out (shared/beach.ts prop()); all are drawn only and walked through.
import { CABIN, LAYOUT } from '../../shared/beach';
import { hash, noise } from '../../shared/relief';
import { TEX } from '../../shared/types';
import type { Piece } from '../../shared/beach';
import type { Mat, V } from './types';
import {
  LAMP,
  MID,
  bar,
  cross,
  face,
  ink,
  loft,
  mid,
  o,
  off,
  put,
  sub,
  tex,
  tinted,
  unit,
} from './common';

/** Bark, the grain along the log; the cut ends paler. */
const BARK = tex(TEX.WOOD, 0.55, 0.7, true);
const CUT = ink([0.62, 0.5, 0.34]);
/** Wood burnt black at the hearth, and its ash. */
const CHAR = ink([0.05, 0.045, 0.04]);
const ASH = ink([0.2, 0.19, 0.18]);
/** The racks' poles, the rope between them. */
const POLE = tex(TEX.WOOD, 1.1, 0.5, true);
const ROPE = ink([0.42, 0.36, 0.25]);

/** Twins alike: a number of a piece's own, the same either side of the line. */
const seed = ({ min, max }: Piece) => min[0] * 7 + Math.abs((min[2] + max[2]) / 2 - MID) * 3;

/** A round log from a to b of radius r, n sides, its ends cut. */
const rod = (a: V, b: V, r: number, m: Mat, n = 7) => {
  const d = unit(sub(b, a));
  const s = unit(cross(d, Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]));
  const u = cross(s, d);
  const ring = (e: V) =>
    Array.from({ length: n + 1 }, (_, i) => {
      const t = (2 * Math.PI * i) / n;
      return off(off(e, s, r * Math.cos(t)), u, r * Math.sin(t));
    });
  const [p, q] = [ring(a), ring(b)];
  const c = mid(a, b);
  loft(p, q, () => m, c);
  face(p.slice(0, n), CUT, c);
  face(q.slice(0, n), CUT, c);
};

/**
 * A round stone sunk a little in the sand at `c`, turned `t` about the vertical: a squashed ball of
 * radii r (along, across, up), each point pushed in or out a little, its normals smooth.
 */
const pebble = (c: V, t: number, r: V, m: Mat, n: number) => {
  const [S, B] = [8, 3];
  const [ct, st] = [Math.cos(t), Math.sin(t)];
  const at = (i: number, j: number) => {
    // From the top (j 0) down to a little under the middle, where the sand hides the rest.
    const [a, b] = [(2 * Math.PI * i) / S, (Math.PI * 0.62 * j) / B];
    const k = j ? 0.88 + 0.24 * hash(i % S, j + n * 5, 63) : 1;
    const l = [
      r[1] * Math.sin(b) * Math.cos(a) * k,
      r[2] * Math.cos(b),
      r[0] * Math.sin(b) * Math.sin(a) * k,
    ];
    const nl = unit([l[0] / r[1] ** 2, l[1] / r[2] ** 2, l[2] / r[0] ** 2]);
    const turn = (v: V) => [ct * v[0] - st * v[2], v[1], st * v[0] + ct * v[2]];
    return { p: off(c, turn(l)), n: turn(nl) };
  };
  for (let j = 0; j < B; j++) {
    for (let i = 0; i < S; i++) {
      const [p, q, u, w] = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)];
      for (const v of j ? [p, u, q, p, w, u] : [p, u, w]) {
        put(v.p, v.n, m, 1);
      }
    }
  }
};

/** A piece's long axis (0 x, 2 z) and its ends along it, at height y, in the middle across. */
const along = ({ min: a, max: b }: Piece, y: number): [number, V, V] => {
  const k = b[0] - a[0] >= b[2] - a[2] ? 0 : 2;
  const c = mid(a, b);
  const [p, q] = [
    [c[0], y, c[2]],
    [c[0], y, c[2]],
  ];
  p[k] = a[k];
  q[k] = b[k];
  return [k, p, q];
};

/** A dried fish hung by its tail from `top`, its flat sides facing `n` (level): tail fin, body, head down. */
const fish = (top: V, n: V, len: number, k: number) => {
  const s = [-n[2], 0, n[0]];
  const at = (x: number, y: number) => off(off(top, s, 2 * x * len), [0, 1, 0], -y * len);
  const m = ink([0.5, 0.42, 0.3], k);
  for (const e of [-1, 1]) {
    const c = off(top, n, -e);
    const o = (p: V) => off(p, n, e * 0.004);
    // The tail's fork, then the body, slim: its back (+s) dark, its belly pale, the head down.
    face([at(-0.1, 0), at(0, 0.16), at(0.1, 0)].map(o), ink([0.3, 0.25, 0.18], k), c);
    face(
      [
        at(0, 0.13),
        at(0.07, 0.35),
        at(0.11, 0.62),
        at(0.06, 0.9),
        at(0, 1),
        at(-0.06, 0.88),
        at(-0.09, 0.6),
        at(-0.05, 0.35),
      ].map(o),
      m,
      c,
      [0.8, 0.55, 0.5, 0.6, 0.9, 1.25, 1.35, 1.1],
    );
  }
};

/**
 * `draw`'s vertices turned about the piece's middle by up to `spread` radians either way, plus
 * `bias`: askew, nothing square to the map. Blue's twin turns the other way, as its mirror.
 */
const askew =
  (spread: number, bias: number, draw: (p: Piece) => void) =>
  (p: Piece, _t?: V, s = 1) => {
    const from = o.length;
    draw(p);
    const t = s * (bias + spread * (2 * hash(seed(p), 3, 61) - 1));
    const [c, sn] = [Math.cos(t), Math.sin(t)];
    const m = mid(p.min, p.max);
    for (let i = from; i < o.length; i += 10) {
      const [x, z, nx, nz] = [o[i] - m[0], o[i + 2] - m[2], o[i + 3], o[i + 5]];
      [o[i], o[i + 2]] = [m[0] + c * x - sn * z, m[2] + sn * x + c * z];
      [o[i + 3], o[i + 5]] = [c * nx - sn * nz, sn * nx + c * nz];
    }
  };

const DRAW: Record<string, (p: Piece) => void> = {
  // A ring of stones, the ash inside it, a cone of burnt sticks and the embers at their foot.
  hearth: p => {
    const c = mid(p.min, p.max);
    const y = p.min[1];
    const h = (i: number, j: number) => hash(i, seed(p), 60 + j);
    const ring = (r: number, dy: number, n: number) =>
      Array.from({ length: n }, (_, i) => {
        const t = (2 * Math.PI * i) / n;
        return [c[0] + r * Math.cos(t), y + dy, c[2] + r * Math.sin(t)];
      });
    face(ring(0.66, 0.02, 10), ASH, [c[0], y - 9, c[2]]);
    for (let i = 0; i < 9; i++) {
      const t = (2 * Math.PI * (i + 0.2 * h(i, 0))) / 9;
      const r = 0.74;
      const at = [c[0] + r * Math.cos(t), y - 0.03, c[2] + r * Math.sin(t)];
      const g = 0.32 + 0.12 * h(i, 1);
      pebble(at, t, [0.2, 0.14, 0.12 + 0.06 * h(i, 2)], ink([g, g * 0.97, g * 0.93]), seed(p) + i);
    }
    for (let i = 0; i < 6; i++) {
      const t = (2 * Math.PI * (i + 0.3 * h(i, 3))) / 6;
      const foot = [c[0] + 0.5 * Math.cos(t), y + 0.05, c[2] + 0.5 * Math.sin(t)];
      bar(
        foot,
        [c[0] + 0.06 * Math.cos(t), y + 0.55, c[2] + 0.06 * Math.sin(t)],
        0.09,
        i & 1 ? CHAR : BARK,
      );
    }
    for (let i = 0; i < 5; i++) {
      const t = (2 * Math.PI * i) / 5;
      const e = [c[0] + 0.22 * Math.cos(t), y + 0.04, c[2] + 0.22 * Math.sin(t)];
      face(
        [0, 1, 2, 3].map(j =>
          off(e, [
            0.1 * Math.cos(t + (j * Math.PI) / 2),
            0.01 * (j & 1),
            0.1 * Math.sin(t + (j * Math.PI) / 2),
          ]),
        ),
        LAMP,
        [e[0], y - 9, e[2]],
      );
    }
  },
  // A log lying along its box to sit on.
  log: p => {
    const r = (p.max[1] - p.min[1]) / 2;
    const [, a, b] = along(p, p.min[1] + r - 0.02);
    rod(a, b, r, BARK);
  },
  // Firewood stacked across its box: three logs, two on them, one on top.
  wood: p => {
    const [k, a, b] = along(p, 0);
    const j = 2 - k;
    const r = 0.1;
    [3, 2, 1].forEach((n, row) => {
      for (let i = 0; i < n; i++) {
        const u = (i - (n - 1) / 2) * 2.1 * r;
        const e = [0, p.min[1] + r + row * 1.75 * r, 0];
        e[k] = (a[k] + b[k]) / 2 + u;
        const [f, g] = [e.slice(), e.slice()];
        f[j] = p.min[j] + 0.05 * hash(i, row, seed(p));
        g[j] = p.max[j] - 0.05 * hash(i, row + 3, seed(p));
        rod(f, g, r, BARK, 6);
      }
    });
  },
  // A mat woven of palm leaves or a rug from the wreck's cabin, its border another colour, dirty
  // and torn (the user, 2026-11-27): a grid of cells darkened in stains, its edge ragged, a few
  // of its border's cells torn away and a hole through it.
  mat: p => {
    const { min: a, max: b } = p;
    const n = seed(p);
    const h = (i: number, j: number, k: number) => hash(i, j + n, 67 + k);
    const [cloth, hem] = [
      [CABIN.tan, CABIN.red],
      [CABIN.red, CABIN.tan],
      [CABIN.green, CABIN.tan],
    ][Math.floor(hash(a[0], 1, 67) * 3)].map(t => tinted(TEX.FABRIC, t, 1.1, 2));
    const [I, J] = [9, 11];
    const y = a[1] + 0.02;
    const below = [a[0], y - 99, a[2]];
    const [W, D] = [b[0] - a[0], b[2] - a[2]];
    // A grid point, each shaken by up to a third of a cell, so no tear follows a line of it; the
    // edge's only along the edge.
    const pt = (i: number, j: number) => {
      const [du, dv] = [0.66 * (h(i, j, 0) - 0.5), 0.66 * (h(i, j, 5) - 0.5)];
      return [
        a[0] + (W * (i + (i % I ? du : 0))) / I,
        y + 0.004 * h(i, j, 1),
        a[2] + (D * (j + (j % J ? dv : 0))) / J,
      ];
    };
    // Dirt: grime over it all, darker stains where a noise peaks.
    const dirt = ([x, , z]: V) =>
      0.9 - 1.3 * Math.max(0, noise(x * 1.6, z * 1.6, n % 97) - 0.4) - 0.2 * noise(x * 5, z * 5, 3);
    // The hole's middle, metres into the mat.
    const hole = [W * (0.3 + 0.4 * h(0, 0, 2)), D * (0.3 + 0.4 * h(0, 0, 3))];
    for (let i = 0; i < I; i++) {
      for (let j = 0; j < J; j++) {
        const q = [pt(i, j), pt(i + 1, j), pt(i + 1, j + 1), pt(i, j + 1)];
        // Each cell in two triangles, its diagonal either way.
        const tris =
          h(i, j, 6) < 0.5
            ? [
                [0, 1, 2],
                [0, 2, 3],
              ]
            : [
                [0, 1, 3],
                [1, 2, 3],
              ];
        for (const t of tris) {
          const tri = t.map(e => q[e]);
          const [cx, cz] = [0, 2].map(k => (tri[0][k] + tri[1][k] + tri[2][k]) / 3);
          const [u, v] = [cx - a[0], cz - a[2]];
          const edge = Math.min(u, W - u, v, D - v);
          // Torn: bites of a wavy depth out of the edge, and a ragged hole.
          const bite = 0.3 * noise(u * 4.5 + n, v * 4.5, 7) - 0.08;
          const r = Math.hypot(u - hole[0], v - hole[1]);
          if (edge < bite || r < 0.08 + 0.22 * noise(u * 5, v * 5, 9)) {
            continue;
          }
          face(tri, edge < 0.2 ? hem : cloth, below, tri.map(dirt));
        }
      }
    }
  },
  // A rack of fish drying: an A of two poles at each end, a pole along their crossing and a rope
  // under it, a row of fish hung by the tail from each.
  drying: p => {
    const { min: a, max: b } = p;
    const [k, e0, e1] = along(p, 0);
    const j = 2 - k;
    const [y, top] = [a[1], b[1] - 0.1];
    const depth = (b[j] - a[j]) / 2;
    const at = (u: number, w: number, dy: number) => {
      const v = [0, y + dy, 0];
      v[k] = u;
      v[j] = (a[j] + b[j]) / 2 + w;
      return v;
    };
    for (const u of [e0[k] + 0.1, e1[k] - 0.1]) {
      for (const s of [-1, 1]) {
        bar(at(u, s * depth, -0.1), at(u, -s * 0.12, top - y + 0.2), 0.08, POLE);
      }
    }
    const ridge = top - y;
    bar(at(e0[k] - 0.15, 0, ridge), at(e1[k] + 0.15, 0, ridge), 0.08, POLE);
    bar(at(e0[k] + 0.1, 0, ridge - 0.75), at(e1[k] - 0.1, 0, ridge - 0.75), 0.015, ROPE);
    const n = [0, 0, 0];
    n[j] = 1;
    const len = e1[k] - e0[k] - 0.5;
    const count = Math.floor(len / 0.4);
    [0, 1].forEach(row => {
      for (let i = 0; i < count - row; i++) {
        const u = e0[k] + 0.25 + (len * (i + 0.5 + row / 2)) / count;
        const hang = ridge - (row ? 0.77 : 0.04);
        const l = 0.5 + 0.1 * hash(i, row, seed(p));
        const t = 0.8 * (hash(i, row + 5, seed(p)) - 0.5);
        const f = [0, 0, 0];
        f[j] = Math.cos(t);
        f[k] = Math.sin(t);
        fish(at(u, 0, hang - 0.03), f, l, 0.8 + 0.3 * hash(i, row + 9, seed(p)));
      }
    });
  },
};

/** The kinds of the camp, each drawn on its box (Piece), turned askew. */
export const CAMPSITE: Record<string, (p: Piece, t?: V, s?: number) => void> = {
  hearth: askew(Math.PI, 0, DRAW.hearth),
  log: askew(0.6, 0, DRAW.log),
  wood: askew(0.5, 0.3, DRAW.wood),
  mat: askew(0.8, 0, DRAW.mat),
  drying: askew(0.15, 0.45, DRAW.drying),
};

/** The camps' fires, drawn only (Decor.blazes, as burnt/fire.ts's): small flames, a thin column of smoke. */
export const hearths = (): number[][] =>
  LAYOUT.pieces
    .filter(p => p.kind == 'hearth')
    .map(({ min: a, max: b }) => [
      (a[0] + b[0]) / 2,
      a[1] + 0.1,
      (a[2] + b[2]) / 2,
      5,
      0.2,
      0.9,
      0.42,
    ]);
