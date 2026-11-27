// The rift of shared/moon/rift.ts drawn, both sides, each on its own ground (the lattice's
// triangles are not split as in a mirror): the ground over the grid where it has an open corner,
// and rock walls down from every edge of it that faces the void.
//
// A cell with no open corner, one, or two, is drawn whole; with three, a triangle at its closed
// corner, cut along the diagonal (the chamfer that keeps an edge from reading as steps); with four,
// not at all. A cell collides when it has two open corners or fewer (gap()... with three it is
// open): the ground drawn covers every brush, and is past one at most by a chamfer's triangle.
import { NX, NZ, S, KICKERS, corner, gap, mask } from '../../shared/moon/rift';
import { raise } from '../../shared/relief';
import type { Relief } from '../../shared/relief';
import { TEX } from '../../shared/types';
import type { WorldDef } from '../../shared/world';
import { cross, face } from '../brick';
import { sub, unit } from '../mesh';
import type { Vec3 } from '../mesh';
import { hash } from '../textures';

/** The lattice's own height at (x, z), pits or none: what ground() reads, as the scenery draws it. */
const lattice = (r: Relief, x: number, z: number) => {
  const [u, v] = [(x - r.x0) / r.cell, (z - r.z0) / r.cell];
  const [i, j] = [Math.floor(u), Math.floor(v)];
  const [fu, fv] = [u - i, v - j];
  const n = i + j * r.nx;
  const [a, b, c, d] = [r.h[n], r.h[n + 1], r.h[n + r.nx], r.h[n + r.nx + 1]];
  return fu >= fv ? a + (b - a) * fu + (d - b) * fv : a + (c - a) * fv + (d - c) * fu;
};

/** A cell's corners in metres, x and z from the centre line, in the order of mask()'s bits. */
const cornersOf = (i: number, j: number) => [
  [i * S, j * S],
  [(i + 1) * S, j * S],
  [(i + 1) * S, (j + 1) * S],
  [i * S, (j + 1) * S],
];
const count = (m: number) => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1);
/** Drawn whole: a closed cell. */
const whole = (i: number, j: number) => !gap(i, j);
/** Whether the ground is drawn at (x, z from the centre line): a whole cell, or a chamfer's triangle at its closed corner. */
const drawn = (x: number, zc: number) => {
  const [i, j] = [Math.floor(x / S), Math.floor(zc / S)];
  const m = mask(i, j);
  if (whole(i, j) || count(m) !== 3) {
    return whole(i, j);
  }
  const [u, v] = [x / S - i, zc / S - j];
  // From the closed corner, along both its sides: under the diagonal.
  const c = [1, 2, 4, 8].findIndex(b => !(m & b));
  return (c === 0 || c === 3 ? u : 1 - u) + (c < 2 ? v : 1 - v) < 1;
};

/** The lattice squares (4 m, by x / 4 and z from the centre line / 4) the grid draws: one open corner in them and more. */
export const RIFTED = (() => {
  const s = new Set<number>();
  for (let j = 0; j <= NZ; j++) {
    for (let i = 0; i <= NX; i++) {
      if (corner(i, j)) {
        // A corner on a square's side or corner is in each square it touches.
        for (const a of [i - 1, i]) {
          for (const b of [j - 1, j]) {
            if (a >= 0 && b >= 0 && a < NX && b < NZ) {
              s.add(Math.floor((a * S) / 4) * 64 + Math.floor((b * S) / 4));
            }
          }
        }
      }
    }
  }
  return s;
})();
/** Whether the lattice square from (x, z) is the rift's to draw. */
export const rifted = (x: number, z: number) => {
  const zc = z >= 140 ? z - 140 : 140 - z - 4;
  return x >= 0 && x < NX * S && zc < NZ * S && RIFTED.has((x / 4) * 64 + zc / 4);
};

/** The walls' courses: depth and tone. The top is the ground's edge. */
const COURSES = [
  [0, 1],
  [-4, 0.7],
  [-30, 0.12],
];

export const rift = (o: number[], def: WorldDef) => {
  const r = raise(def.relief!);
  for (const side of [1, -1]) {
    /** A point of the grid, x and z from the centre line, where it lies. */
    const at = (x: number, zc: number): Vec3 => {
      const z = 140 + side * zc;
      return [x, Math.max(lattice(r, x, z), 0), z];
    };
    const vert = (x: number, zc: number) => {
      const p = at(x, zc);
      const n = unit([
        lattice(r, p[0] - 1, p[2]) - lattice(r, p[0] + 1, p[2]),
        2,
        lattice(r, p[0], p[2] - 1) - lattice(r, p[0], p[2] + 1),
      ]);
      return [...p, ...n, p[0], p[2], TEX.STONE, Math.min(Math.max(1 + p[1] / 60, 0.78), 1.2)];
    };
    // Up, whichever side: blue's rows run the other way round.
    const tri = (a: number[], b: number[], c: number[]) =>
      o.push(...(side > 0 ? [...a, ...c, ...b] : [...a, ...b, ...c]));
    // The ground: in each square, runs of whole cells along a row as one quad; the chamfers.
    for (const key of RIFTED) {
      const [X, Z] = [Math.floor(key / 64) * 4, (key % 64) * 4];
      // A level square (its two triangles in one plane): its runs merged across rows too, as long
      // as a run goes on unchanged.
      const zl = side > 0 ? 140 + Z : 136 - Z;
      const sq = (u: number, v: number) => lattice(r, u, v);
      const level = sq(X, zl) + sq(X + 4, zl + 4) === sq(X + 4, zl) + sq(X, zl + 4);
      let open = new Map<number, number[]>();
      const shut = (l: number[]) => {
        const [i, e, j0, j1] = l;
        const [p, q, t, u] = [
          vert(i * S, j0 * S),
          vert(e * S, j0 * S),
          vert(e * S, j1 * S),
          vert(i * S, j1 * S),
        ];
        tri(p, t, q);
        tri(p, u, t);
      };
      for (let j = Z / S; j < (Z + 4) / S; j++) {
        const next = new Map<number, number[]>();
        for (let i = X / S; i < (X + 4) / S;) {
          if (!whole(i, j)) {
            const m = mask(i, j);
            if (count(m) === 3) {
              // The closed corner and its two neighbours.
              const c = [1, 2, 4, 8].findIndex(b => !(m & b));
              const q = cornersOf(i, j).map(([a, b]) => vert(a, b));
              tri(q[c], q[(c + 1) % 4], q[(c + 3) % 4]);
            }
            i++;
            continue;
          }
          let e = i + 1;
          while (e < (X + 4) / S && whole(e, j)) {
            e++;
          }
          if (level) {
            const l = open.get(i * 1000 + e) ?? [i, e, j, j];
            open.delete(i * 1000 + e);
            l[3] = j + 1;
            next.set(i * 1000 + e, l);
            i = e;
            continue;
          }
          // The lattice's diagonal runs from its square's low node to its high one, through one
          // cell of the row: the run on each side of it is flat, that cell is split along it.
          const low = Math.min(140 + side * j * S, 140 + side * (j + 1) * S);
          const cut = X / S + (low - 4 * Math.floor(low / 4)) / S;
          const quad = (a: number, b: number) => {
            if (a < b) {
              const [p, q, r, t] = [
                vert(a * S, j * S),
                vert(b * S, j * S),
                vert(b * S, (j + 1) * S),
                vert(a * S, (j + 1) * S),
              ];
              tri(p, r, q);
              tri(p, t, r);
            }
          };
          if (cut >= i && cut < e) {
            quad(i, cut);
            quad(cut + 1, e);
            // Its corners where they lie: the diagonal from (cut, low) to (cut + 1, low + S).
            const [p, q, r, t] = [
              vert(cut * S, j * S),
              vert((cut + 1) * S, j * S),
              vert((cut + 1) * S, (j + 1) * S),
              vert(cut * S, (j + 1) * S),
            ];
            // In red's frame the low row is j on red's side, j + 1 on blue's.
            if (side > 0) {
              tri(p, r, q);
              tri(p, t, r);
            } else {
              tri(t, q, p);
              tri(t, r, q);
            }
          } else {
            quad(i, e);
          }
          i = e;
        }
        open.forEach(shut);
        open = next;
      }
      open.forEach(shut);
    }
    // The walls: an edge of drawn ground with nothing past it, from p to q (x, z from the centre
    // line), lit from the side that is open.
    const wall = (p: number[], q: number[], k: number): void => {
      // In pieces of 3 m at most, each broken on its own: a long straight run reads as a slab.
      const n = Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 3 - 1e-9);
      if (n > 1) {
        for (let i = 0; i < n; i++) {
          const at = (t: number) => [
            p[0] + ((q[0] - p[0]) * t) / n,
            p[1] + ((q[1] - p[1]) * t) / n,
          ];
          wall(at(i), at(i + 1), k * 7 + i);
        }
        return;
      }
      const col = (x: number, zc: number) =>
        COURSES.map(([y], c): Vec3 => {
          const t = at(x, zc);
          // Broken by a hash of the point and the course: an edge shared by two walls has the same.
          const h = (s: number) =>
            0.9 * (hash(Math.round(x * 2), Math.round(zc * 2) + 400 * c, s) - 0.5);
          return c ? [x + h(61), y, t[2] + h(62)] : t;
        });
      const [a, b] = [col(p[0], p[1]), col(q[0], q[1])];
      // Off the middle of the edge, a step each way: the open side.
      const [mx, mz, ux, uz] = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, q[1] - p[1], p[0] - q[0]];
      const l = Math.hypot(ux, uz);
      const sign = drawn(mx + (0.1 * ux) / l, mz + (0.1 * uz) / l) ? -1 : 1;
      const out = [(sign * ux) / l, (side * sign * uz) / l];
      for (let c = 0; c < COURSES.length - 1; c++) {
        const f = [a[c], b[c], b[c + 1], a[c + 1]];
        for (const [u, v, w] of [
          [0, 1, 2],
          [0, 2, 3],
        ]) {
          let n = cross(sub(f[v], f[u]), sub(f[w], f[u]));
          if (Math.hypot(...n) < 1e-9) {
            continue;
          }
          n = unit(n);
          n = n[0] * out[0] + n[2] * out[1] < 0 ? (n.map(z => -z) as Vec3) : n;
          const tone = COURSES[c][1] * (0.85 + 0.3 * hash(k, c, 73));
          for (const t of [f[u], f[v], f[w]]) {
            o.push(...t, ...n, t[0] + t[2], t[1], TEX.ROCK, tone);
          }
        }
      }
    };
    let k = 0;
    // Along rows (edges at z = j S) and columns (x = i S): drawn whole on one side, open on the
    // other (four open corners, or three with the closed one off this edge). Runs merged.
    const open = (i: number, j: number) => {
      const m = mask(i, j);
      return count(m) === 4;
    };
    /** Whether the edge between whole cell a and cell b is bare: b is not drawn along it. */
    const bare = (ai: number, aj: number, bi: number, bj: number) => {
      if (!whole(ai, aj) || whole(bi, bj)) {
        return false;
      }
      if (open(bi, bj)) {
        return true;
      }
      // Three open: its triangle covers the shared edge only if its closed corner is on it.
      const [x0, z0] = [Math.max(ai, bi), Math.max(aj, bj)];
      const shared =
        ai === bi
          ? [
              [ai, z0],
              [ai + 1, z0],
            ]
          : [
              [x0, aj],
              [x0, aj + 1],
            ];
      return shared.every(([x, z]) => corner(x, z));
    };
    for (let j = 0; j <= NZ; j++) {
      for (const [d, from, to] of [
        [1, -1, 0],
        [-1, 0, -1],
      ]) {
        // d 1: drawn under the line (row j - 1), open over it (row j); -1 the other way.
        let start = -1;
        for (let i = 0; i <= NX; i++) {
          const yes = i < NX && bare(i, j + from, i, j + to);
          if (yes && start < 0) {
            start = i;
          } else if (!yes && start >= 0) {
            const [p, q] =
              d > 0
                ? [
                    [start * S, j * S],
                    [i * S, j * S],
                  ]
                : [
                    [i * S, j * S],
                    [start * S, j * S],
                  ];
            wall(p, q, k++);
            start = -1;
          }
        }
      }
    }
    for (let i = 0; i <= NX; i++) {
      for (const [d, from, to] of [
        [1, 0, -1],
        [-1, -1, 0],
      ]) {
        let start = -1;
        for (let j = 0; j <= NZ; j++) {
          const yes = j < NZ && bare(i + from, j, i + to, j);
          if (yes && start < 0) {
            start = j;
          } else if (!yes && start >= 0) {
            const [p, q] =
              d > 0
                ? [
                    [i * S, start * S],
                    [i * S, j * S],
                  ]
                : [
                    [i * S, j * S],
                    [i * S, start * S],
                  ];
            wall(p, q, k++);
            start = -1;
          }
        }
      }
    }
    // The chamfers' diagonals.
    for (let j = 0; j < NZ; j++) {
      for (let i = 0; i < NX; i++) {
        const m = mask(i, j);
        if (!whole(i, j) && count(m) === 3) {
          const c = [1, 2, 4, 8].findIndex(b => !(m & b));
          const q = cornersOf(i, j);
          wall(q[(c + 1) % 4], q[(c + 3) % 4], k++);
        }
      }
    }
  }
  // The rovers' ramps (moon/rift.ts KICKERS): an orange band painted along the crack's edge at the
  // top of each, 4 m across, as on the west long jump's spur: a jump is taken here.
  for (const side of [1, -1]) {
    for (const [rx, rz, ux, uz] of KICKERS) {
      const p = (a: number, b: number): Vec3 => {
        const [x, zc] = [rx + a * ux - b * uz, rz + a * uz + b * ux];
        return [x, Math.max(lattice(r, x, 140 + side * zc), 0) + 0.05, 140 + side * zc];
      };
      // The edge: the first open cell on the ramp's middle line.
      let e = -6;
      while (e < 0 && !gap(Math.floor((rx + e * ux) / S), Math.floor((rz + e * uz) / S))) {
        e += 0.1;
      }
      face(
        o,
        [p(e - 0.7, -2), p(e - 0.7, 2), p(e - 0.1, 2), p(e - 0.1, -2)],
        [1, 0.42, 0.08],
        [rx, -50, 140 + side * rz],
      );
    }
  }
  // The bottom of the cracks past the rille's own, black, 30 m down.
  for (const side of [1, -1]) {
    face(
      o,
      [
        [-2, -30.05, 140 + side * 17],
        [162, -30.05, 140 + side * 17],
        [162, -30.05, 140 + side * (NZ * S + 2)],
        [-2, -30.05, 140 + side * (NZ * S + 2)],
      ],
      [0.012, 0.012, 0.015],
    );
  }
};
