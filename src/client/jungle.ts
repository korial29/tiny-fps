// Landfall's scenery (docs/BEACH.md): the forest along the beach and the headlands' rocks, drawn
// once from the lists of shared/beach.ts and an integer hash. The rocks of ROCKS and the palms of
// TRUNKS stand where the map collides with them; everything else is drawn only, behind them: the
// rocks past the headland's line and out in the sea, the trees and the undergrowth past EDGE.
// Lit paint (layer -1) but the rocks, in basalt (TEX.ROCK).
import { FRAME, HULL, ROCKS, TRUNKS, ZED } from '../shared/beach';
import { rockMid, rockOf } from '../shared/moon';
import { TAU } from '../shared/physics';
import { ground, hash, noise, raise } from '../shared/relief';
import type { World, WorldDef } from '../shared/world';
import { STRIDE, dress, place, segment, smooth } from './mesh';
import type { Vec3 } from './mesh';
import { stone } from './moonscape';

type Ground = (x: number, z: number) => number;

/**
 * Where the forest that is only drawn begins: a line round the beach on its three dry sides, x =
 * EDGE along the trees and BACK behind each headland's line of rocks, the corners rounded by
 * TURN, from x = WEST on one headland to x = WEST on the other. Nothing of it is solid: the map's
 * ghost wall is expected between the first row of palms and this line.
 */
const [EDGE, BACK, TURN, WEST] = [FRAME.trees + 5, 12, 14, 40];
/** The line's straight run behind a headland, a corner's arc, and its whole length. */
const [RUN, ARC] = [EDGE - TURN - WEST, (TAU / 4) * TURN];
const LEN = 2 * (RUN + ARC) + ZED + 2 * (BACK - TURN);
/** The line steps this far back round the wreck's nose, which lies in the trees: a clearing at the end of its furrow. */
const NOSE = HULL.sections[2][1] + 3 - EDGE;

const sm = (t: number) => {
  t = Math.min(Math.max(t, 0), 1);
  return t * t * (3 - 2 * t);
};

/**
 * How burnt the forest is at (x, z), 0 to 1: a fan round the nose and ahead of it, where the ship
 * ended, burnt out in its middle and ragged at its edge. None on the sand's side of the first
 * trunks. `wide` is its reach: the heat browned the leaves further out than the fire felled the trees.
 */
const burn = (x: number, z: number, wide = 1.15) => {
  const [u, v] = [(x - HULL.sections[2][1] + 2) / 32, (z - ZED / 2) / 26];
  const d = u * u + v * v;
  return d < 3
    ? sm(2.2 * (wide - Math.sqrt(d) - 0.3 * noise(x / 7, z / 7, 6))) *
        sm((x - FRAME.trees + 6) / 10)
    : 0;
};
/** Scorched leaves, and charred wood. */
const [DRY, CHAR] = [
  [0.2, 0.13, 0.06],
  [0.05, 0.045, 0.04],
];
/** The fire's mark on what stands in it: leaves and bark go brown, then black, by `burn` at each vertex. */
const singe = (o: number[]) => {
  for (let i = 0; i < o.length; i += STRIDE) {
    const b = burn(o[i], o[i + 2], 1.3);
    if (b > 0) {
      // As light a brown as it was a green, so a dark mass of leaves stays one.
      const [k, d, g] = [Math.min(2 * b, 1), 1 - Math.max(2 * b - 1.2, 0), 4 * o[i + 7]];
      for (let m = 0; m < 3; m++) {
        const c = i + (m < 2 ? 6 + m : 9);
        o[c] = (o[c] + (DRY[m] * g - o[c]) * k) * d;
      }
    }
  }
};

/** The line at s metres along it: x, z and the way out of the beach. Its second half is the first one's mirror. */
const edge = (s: number): number[] => {
  if (s > LEN / 2) {
    const [x, z, nx, nz] = edge(LEN - s);
    return [x, ZED - z, nx, -nz];
  }
  const [t, c] = [(s - RUN) / TURN, TURN - BACK];
  return s < RUN
    ? [WEST + s, -BACK, 0, -1]
    : s < RUN + ARC
      ? [EDGE - TURN + TURN * Math.sin(t), c - TURN * Math.cos(t), Math.sin(t), -Math.cos(t)]
      : [EDGE, c + s - RUN - ARC, 1, 0];
};

/** The point d metres behind the line at s (x, z), and how much forest there is there: none at the headland's seaward end. */
const spot = (s: number, d: number): Vec3 => {
  const [x, z, nx, nz] = edge(s);
  const k = d + NOSE * nx * sm((22 - Math.abs(z - ZED / 2)) / 10);
  return [x + nx * k, z + nz * k, sm((x - WEST) / 30)];
};

/** A model's length (-z) stood up. */
const UP: Vec3[] = [
  [1, 0, 0],
  [0, 0, 1],
  [0, 1, 0],
];
/** A length of trunk, wider at its top than at its foot: stacked, the steps are a palm's rings. By sides. */
const BOLE = [3, 4, 5].map(n =>
  dress(
    smooth(
      [
        [0.9, 0],
        [1.1, 1],
      ],
      n,
    ),
    [1, 1, 1],
  ),
);
/** A clump of leaves or a coconut, coarse and less coarse. */
const BLOB = [
  smooth(
    [
      [0, -1],
      [1, 0],
      [0, 1],
    ],
    4,
  ),
  smooth(
    [
      [0, -1],
      [0.85, -0.45],
      [0.9, 0.35],
      [0, 1],
    ],
    5,
  ),
].map(v => dress(v, [1, 1, 1]));
const BARK = [0.4, 0.33, 0.24];
const HUSK = [0.3, 0.2, 0.08];
/** Fronds: young, grown, old. Then the broadleaves' greens. */
const FROND = [
  [0.16, 0.34, 0.07],
  [0.1, 0.26, 0.06],
  [0.22, 0.29, 0.08],
];
const LEAVES = [
  [0.05, 0.15, 0.04],
  [0.08, 0.2, 0.05],
  [0.04, 0.12, 0.05],
  [0.11, 0.21, 0.04],
];

/**
 * A feather of leaflets from `at`: its rib leaves toward the bearing a at the elevation e and
 * bends down over its length, n steps of it, a leaflet a side on each (a triangle, its tip out,
 * forward and hanging), `wide` at the middle. Darker at the rib. Its normals lean up: lit from
 * above on both faces.
 */
const frond = (
  o: number[],
  at: Vec3,
  a: number,
  e: number,
  len: number,
  wide: number,
  n: number,
  [r, g, b]: number[],
) => {
  const [c, s] = [Math.cos(a), Math.sin(a)];
  let [x, y, z] = at;
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n;
    const f = Math.max(e - 2.1 * t, -1.45);
    const [u, v] = [(Math.cos(f) * len) / n, (Math.sin(f) * len) / n];
    const [x1, y1, z1] = [x + c * u, y + v, z + s * u];
    const w = wide * (0.3 + 2.8 * t * (1 - t));
    for (const side of [-w, w]) {
      const tx = (x + x1) / 2 + 0.4 * c * u - s * side;
      const ty = (y + y1) / 2 + 0.4 * v - 0.45 * w;
      const tz = (z + z1) / 2 + 0.4 * s * u + c * side;
      let nx = v * (tz - z) - s * u * (ty - y);
      let ny = s * u * (tx - x) - c * u * (tz - z);
      let nz = c * u * (ty - y) - v * (tx - x);
      const l = (ny < 0 ? -1 : 1) / (Math.hypot(nx, ny, nz) || 1);
      [nx, ny, nz] = [nx * l, ny * l + 0.6, nz * l];
      const m = 1 / Math.hypot(nx, ny, nz);
      o.push(x, y, z, nx * m, ny * m, nz * m, r * 0.6, g * 0.6, -1, b * 0.6);
      o.push(x1, y1, z1, nx * m, ny * m, nz * m, r * 0.6, g * 0.6, -1, b * 0.6);
      o.push(tx, ty, tz, nx * m, ny * m, nz * m, r, g, -1, b);
    }
    [x, y, z] = [x1, y1, z1];
  }
};

/**
 * A coconut palm, its foot at (x, y, z), r there, seed s: a ringed trunk that leaves the ground
 * upright (what a runner touches is where the map has it) and leans (lx, lz) by its top, a crown
 * of fronds in three tiers, the lowest hanging. Level 2 is the first row's, with coconuts; 1 the
 * rows behind; 0 the back of the forest.
 */
const palm = (
  o: number[],
  x: number,
  y: number,
  z: number,
  r: number,
  s: number,
  lod: number,
  lx: number,
  lz: number,
) => {
  const h = (k: number) => hash(s, k, 77);
  const tall = 8 + 5 * h(1) + (2 - lod);
  const n = [2, 4, 8][lod];
  const at = (t: number): Vec3 => [x + lx * t * t, y + tall * t, z + lz * t * t];
  for (let k = 0; k < n; k++) {
    const t = k / n;
    const w = r * (0.62 + 0.38 * (1 - t) * (1 - t));
    const tone = k % 2 ? 0.8 : 1;
    segment(
      o,
      BOLE[lod],
      at(t),
      at(t + 1 / n),
      [1, 0, 0],
      1,
      w,
      BARK.map(v => v * tone),
    );
  }
  const top = at(1);
  const fronds = [6, 9, 11][lod];
  for (let i = 0; i < fronds; i++) {
    frond(
      o,
      top,
      (TAU * (i + 0.6 * h(10 + i))) / fronds,
      [1.15, 0.55, -0.05][i % 3] + 0.3 * h(30 + i),
      3.8 + h(50 + i) + (2 - lod) * 0.3,
      0.8 + (2 - lod) * 0.15,
      [3, 4, 6][lod],
      FROND[i % 3],
    );
  }
  for (let i = 0; lod > 1 && i < 3; i++) {
    const a = TAU * (i / 3 + h(70));
    place(
      o,
      BLOB[0],
      [top[0] + 0.24 * Math.cos(a), top[1] - 0.3, top[2] + 0.24 * Math.sin(a)],
      UP,
      [0, 0, 0],
      0.17,
      HUSK,
    );
  }
};

/** A broadleaf tree: a trunk and a crown of clumps round its top, each its own green. Coarser with `far`. */
const tree = (o: number[], x: number, y: number, z: number, s: number, far: boolean) => {
  const h = (k: number) => hash(s, k, 78);
  const tall = 8 + 7 * h(1);
  const top: Vec3 = [x + 2 * h(2) - 1, y + 0.7 * tall, z + 2 * h(3) - 1];
  segment(o, BOLE[far ? 0 : 1], [x, y, z], top, [1, 0, 0], 1, 0.3 + 0.2 * h(4), BARK);
  for (let i = 0; i < 4; i++) {
    const [a, w] = [TAU * (i / 3 + h(5)), 0.2 * tall + 1.4 * h(6 + i)];
    const out = i < 3 ? 0.8 * w : 0;
    place(
      o,
      BLOB[far ? 0 : 1],
      [
        top[0] + out * Math.cos(a),
        top[1] + (i < 3 ? h(10 + i) : 0.5 * w),
        top[2] + out * Math.sin(a),
      ],
      UP,
      [0, 0, 0],
      [w, w, 0.7 * w],
      LEAVES[Math.floor(4 * h(14 + i))],
    );
  }
};

/**
 * What the crash left of a tree whose foot is at (x, z), seed s: a black stump snapped off low or
 * a trunk broken higher up, leaning the way the ship pushed it, forward and away from the centre
 * line, splinters at the break. Most have their top on the ground on that side, still hinged to a
 * low stump or lying by a high one, a few dead fronds at its end; a tall one keeps some hanging.
 */
const snag = (o: number[], gy: Ground, x: number, z: number, s: number) => {
  const h = (k: number) => hash(s, k, 81);
  const a = (z < ZED / 2 ? -1 : 1) * (0.3 + 1.1 * h(1));
  const [c, d, y] = [Math.cos(a), Math.sin(a), gy(x, z)];
  const [tall, r, len] = [0.5 + 6 * h(2) * h(2), 0.2 + 0.14 * h(3), 4 + 5 * h(4)];
  const tone = CHAR.map(v => v * (0.6 + 0.9 * h(5)));
  const top: Vec3 = [x + 0.25 * tall * c, y + tall, z + 0.25 * tall * d];
  segment(o, BOLE[1], [x, y - r, z], top, [1, 0, 0], 1, r, tone);
  for (let i = 0; i < 2; i++) {
    frond(o, top, TAU * h(6 + i), 2.5, 0.5 + 0.6 * h(8 + i), 0.5 * r, 1, tone);
  }
  const end: Vec3 = [x + len * c, gy(x + len * c, z + len * d) + r, z + len * d];
  const fallen = h(10) < 0.7;
  if (fallen) {
    segment(o, BOLE[1], tall < 2.5 ? top : [x, y + r, z], end, [0, 1, 0], 1, 0.8 * r, tone);
  }
  for (let i = 0; i < 2 && (fallen || tall > 3.5); i++) {
    frond(
      o,
      fallen ? end : top,
      a + 5 * h(11 + i),
      fallen ? 0.5 : -0.2,
      2 + h(13 + i),
      0.5,
      3,
      DRY,
    );
  }
};

/** A rosette of feathers on the ground: a fern (`big` 0), or the broad leaves of a banana plant. */
const fern = (o: number[], x: number, y: number, z: number, s: number, big: number) => {
  const h = (k: number) => hash(s, k, 79);
  const n = 6 - big;
  for (let i = 0; i < n; i++) {
    frond(
      o,
      [x, y + 0.1 + 0.3 * big, z],
      (TAU * (i + h(i))) / n,
      1 + 0.3 * big + 0.3 * h(10 + i),
      (1 + 0.5 * h(20 + i)) * (1 + 1.4 * big),
      0.3 + 0.7 * big,
      2,
      FROND[(i + big) % 2],
    );
  }
};

/** A rock of shared/beach.ts's kind (x, z, radius, height, seed), as Tranquility's: dark basalt, darker still where the sea wets it. */
const rock = (o: number[], gy: Ground, [x, z, R, H, s]: number[], lod: number) => {
  const { reach } = rockOf(s, R, H);
  const g = gy(x, z);
  const mid = g + rockMid(H);
  const from = o.length;
  stone(
    o,
    lod,
    u => {
      const d = reach(u);
      return [x + u[0] * d, mid + u[1] * d, z + u[2] * d];
    },
    g,
    g + H,
    s,
    0.4 + 0.2 * hash(s, 5, 41),
    gy,
  );
  for (let i = from; i < o.length; i += STRIDE) {
    const wet = FRAME.water + 0.4 + 1.2 * noise(0.4 * o[i], 0.4 * o[i + 2], 9);
    o[i + 9] *= 0.4 + 0.6 * sm((o[i + 1] - wet) / 1.5);
  }
};

/**
 * Red's headland: the rocks of ROCKS, then what is only drawn. Behind them two rows, taller and
 * coarser the further, so the cape rises away from the beach; small ones in the gaps; and a reef
 * running out into the sea past x = FRAME.sea, lower and lower. `k` is 0 for red and 1 for blue,
 * whose jumble is its own. The rocks of ROCKS stand on `red`, red's ground, for both: the map's
 * boxes for blue's are the twins of red's, and the lattice's triangles are not mirrored.
 */
const cape = (gy: Ground, k: number, red: Ground): number[] => {
  const o: number[] = [];
  const h = (i: number, j: number) => hash(i, j, 90 + k);
  ROCKS.forEach(r => rock(o, red, r, r[2] < 8 ? 4 : 5));
  for (let i = 0; i < 12; i++) {
    const at = [-16 + 11 * i + 5 * h(i, 1), ZED + 5 + 4 * h(i, 2)];
    rock(o, gy, [...at, 7 + 3 * h(i, 3), 12 + 7 * h(i, 4), 100 + i + 50 * k], 3);
  }
  for (let i = 0; i < 8; i++) {
    const at = [8 + 14 * i + 6 * h(i, 5), ZED + 15 + 6 * h(i, 6)];
    rock(o, gy, [...at, 10 + 4 * h(i, 7), 18 + 10 * h(i, 8), 120 + i + 50 * k], 3);
  }
  for (let i = 0; i < 7; i++) {
    const at = [4 + 15 * i + 6 * h(i, 9), ZED + 1 + 3 * h(i, 10)];
    rock(o, gy, [...at, 2.5 + 2 * h(i, 11), 3 + 3 * h(i, 12), 130 + i + 50 * k], 2);
  }
  for (let i = 0; i < 8; i++) {
    const t = i / 7;
    const at = [FRAME.sea - 12 - 62 * t + 6 * h(i, 13), ZED - 4 - 14 * t * t + 8 * h(i, 14)];
    rock(o, gy, [...at, 7 - 4.5 * t, 9 - 7 * t, 140 + i + 50 * k], t < 0.5 ? 3 : 2);
  }
  return o;
};

/** Blue's half from red's: z becomes ZED - z, the normals follow, the triangles keep their front. */
const mirror = (v: number[]) => {
  const o = v.slice();
  for (let t = 0; t < v.length; t += 3 * STRIDE) {
    for (let k = 0; k < 3; k++) {
      const [i, j] = [t + k * STRIDE, t + ((3 - k) % 3) * STRIDE];
      for (let c = 0; c < STRIDE; c++) {
        o[i + c] = v[j + c];
      }
      o[i + 2] = ZED - o[i + 2];
      o[i + 5] = -o[i + 5];
    }
  }
  return o;
};

/** How high the forest's mass stands over the ground, d metres behind the line: a wall of leaves at once, then the crowns. */
const rise = (d: number) =>
  4.5 * sm(d / 2) + 5 * sm((d - 1.5) / 5) + 8 * sm((d - 6) / 12) + 0.14 * Math.max(d - 18, 0);
/** How far behind the line the far canopy's rows of points are. */
const ROWS = [0, 0.8, 1.7, 3, 4.5, 6.5, 9, 12, 16, 21, 28, 37, 49, 65, 88, 120];
/**
 * The mass of the forest behind the line, one lumpy sheet: it leaves the ground under the line,
 * is the undergrowth's back (some 3 m) within a few metres, the crowns of the trees further in,
 * and climbs inland. Lighter on its lumps than between them, so they read as crowns.
 */
const canopy = (o: number[], tufts: number[], gy: Ground) => {
  const n = Math.ceil(LEN / 2.5);
  const m = ROWS.length;
  const p = new Float64Array((n + 1) * m * 4);
  for (let i = 0; i <= n; i++) {
    const s = (i / n) * LEN;
    const [bx, bz] = spot(s, 0);
    const g = gy(bx, bz);
    for (let j = 0; j < m; j++) {
      const d = ROWS[j];
      const [x, z, k] = spot(s, d);
      const lump = noise(x / 6, z / 6, 3) + 0.5 * noise(x / 2.3, z / 2.3, 4) - 0.75;
      const q = (i * m + j) * 4;
      p[q] = x + (hash(i, j, 61) - 0.5) * Math.min(d, 3);
      p[q + 2] = z + (hash(i, j, 62) - 0.5) * Math.min(d, 3);
      // Where it burnt the mass is down on its own ground, not on the line's: ash, under the stumps' feet.
      const b = sm(2.5 * burn(x, z));
      p[q + 1] =
        g +
        (gy(x, z) - g) * b -
        0.4 +
        k *
          (1 - b) *
          (rise(d) +
            // Hills inland, over the trees' line from the sand.
            40 * sm((d - 25) / 95) * (0.4 + 0.6 * noise(x / 70, z / 70, 5)) +
            // Lumps the size of a crown and a jitter a point, both fading on the far hills, whose points are far apart.
            (lump * Math.min(0.5 + 0.13 * d, 4) + (hash(i, j, 63) - 0.5) * (1.4 + 0.05 * d)) *
              sm(d / 1.5) *
              (1 - 0.8 * sm((d - 50) / 50)));
      // Darker inland: hills of forest, not of grass.
      p[q + 3] = (0.4 * (lump / 1.5 + 0.5) + 0.6 * hash(i, j, 64)) * (1 - 0.5 * sm((d - 20) / 50));
      // On the wall a player sees close up, two sprigs a point: leaves that stick out of it and break its facets.
      for (let f = 0; k > 0.3 && b < 0.9 && j && j < 6 && f < 2; f++) {
        const r = (c: number) => hash(i * 2 + f, j, 65 + c);
        const [, , nx, nz] = edge(s);
        frond(
          tufts,
          [p[q], p[q + 1] - 0.3, p[q + 2]],
          Math.atan2(-nz, -nx) + 3 * r(0) - 1.5,
          0.3 + 0.8 * r(1),
          1.3 + 1.3 * r(2),
          0.9,
          1,
          (f ? FROND : LEAVES)[Math.floor(3 * r(3))],
        );
      }
    }
  }
  // Flat facets, each a green of its own: a mass of leaves, not a lawn.
  const node = (i: number, j: number) => (i * m + j) * 4;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m - 1; j++) {
      const turn = (i + j) & 1;
      const quad = [node(i, j), node(i + 1, j), node(i + 1, j + 1), node(i, j + 1)];
      for (const f of [0, 1]) {
        const [a, b, c] = [quad[turn], quad[turn + 1 + f], quad[(turn + 2 + f) % 4]];
        const [ux, uy, uz] = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]];
        const [vx, vy, vz] = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
        const [nx, ny, nz] = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
        const l = (ny < 0 ? -1 : 1) / (Math.hypot(nx, ny, nz) || 1);
        const t = (p[a + 3] + p[b + 3] + p[c + 3]) / 3;
        for (const q of [a, b, c]) {
          o.push(p[q], p[q + 1], p[q + 2], nx * l, ny * l, nz * l);
          o.push(0.02 + 0.06 * t, 0.06 + 0.13 * t, -1, 0.02 + 0.03 * t);
        }
      }
    }
  }
};

/**
 * Landfall's forest and headlands by part, each its vertices in the renderer's format: the
 * headlands' rocks, the first row's palms (TRUNKS and their twins), the trees behind, the
 * undergrowth and the far canopy, and what the crash broke and burnt of them round the nose, past
 * the first trunks. The lists and the relief are read here, at the call.
 */
export const parts = (def: WorldDef) => {
  const w = def.relief && ({ relief: raise(def.relief) } as World);
  /** Where a foot stands: on the relief, or on the slab's top where there is none. */
  const gy: Ground = (x, z) => {
    const g = w ? ground(w, x, z) : 0;
    return g > -1e9 ? g : 0;
  };
  const rocks = cape(gy, 0, gy).concat(mirror(cape((x, z) => gy(x, ZED - z), 1, gy)));

  // A palm on each solid trunk, leaning toward the sea, each its own.
  const palms: number[] = [];
  TRUNKS.forEach(([x, z, r], i) => {
    for (const k of [0, 1]) {
      const [s, at] = [i * 2 + k, k ? ZED - z : z];
      const lean = 1.2 + 2.6 * hash(s, 1, 70);
      palm(palms, x, gy(x, at), at, r, s, 2, -lean, lean * (2 * hash(s, 2, 70) - 1));
    }
  });

  // Behind the line: rows of trees, palms in front and broadleaves further in, cheaper with the distance.
  const forest: number[] = [];
  const snags: number[] = [];
  [2, 6, 11, 17, 24].forEach((d, row) => {
    const step = row < 2 ? 7.5 : 7;
    for (let i = 0; i * step < LEN; i++) {
      const h = (k: number) => hash(i, k, 80 + row);
      const s = (i + h(1)) * step;
      const far = d + 3 * h(2);
      const [x, z, k] = spot(s, far);
      if (h(3) > 0.85 * k) {
        continue;
      }
      // Where the fire went through, what is left of it.
      const b = burn(x, z);
      if (b > 0.3) {
        snag(snags, gy, x, z, 1000 + row * 100 + i);
        continue;
      }
      // Deep in the mass a tree stands in it: its crown comes out, its trunk is not seen.
      const y = gy(x, z) + Math.max(k * (1 - sm(2.5 * b)) * rise(far) - 5, 0);
      const [, , nx, nz] = edge(s);
      const seed = 1000 + row * 100 + i;
      if (h(4) > 0.25 + 0.15 * row) {
        const lean = 1 + 2.5 * h(5);
        const [lx, lz] = [-nx * lean + 2 * h(6) - 1, -nz * lean + 2 * h(7) - 1];
        palm(forest, x, y, z, 0.28, seed, row < 2 ? 1 : 0, lx, lz);
      } else {
        tree(forest, x, y, z, seed, row > 1);
      }
    }
  });

  // More of them in the clearing the nose made, on each side of it.
  for (let i = 0; i < 18; i++) {
    const h = (k: number) => hash(i, k, 88);
    const d = HULL.r + 2 + 14 * h(2);
    snag(snags, gy, EDGE + 1 + 16 * h(1), ZED / 2 + (i & 1 ? d : -d), i);
  }

  // Before the line, among the first trunks: ferns, then the broad leaves and the bushes the wall of leaves stands behind.
  const brush: number[] = [];
  for (let i = 0; i * 4 < LEN; i++) {
    const h = (k: number) => hash(i, k, 86);
    const [x, z, k] = spot((i + h(1)) * 4, -0.5 - 3 * h(2) * h(2));
    if (h(3) < k && burn(x, z) < 0.3) {
      fern(brush, x, gy(x, z), z, i, 0);
    }
  }
  for (let i = 0; i * 2.4 < LEN; i++) {
    const h = (k: number) => hash(i, k, 87);
    const [x, z, k] = spot((i + h(1)) * 2.4, 0.8 - 2.3 * h(2));
    const w = 1 + 0.8 * h(4);
    if (h(3) > k || burn(x, z) > 0.3) {
      continue;
    }
    if (h(5) < 0.6) {
      fern(brush, x, gy(x, z), z, 500 + i, 1);
    } else {
      place(
        brush,
        BLOB[1],
        [x, gy(x, z) + 0.6 * w, z],
        UP,
        [0, 0, 0],
        [w, w, 0.8 * w],
        LEAVES[i % 4],
      );
    }
  }

  const far: number[] = [];
  canopy(far, brush, gy);
  [palms, forest, brush, far].forEach(singe);
  return { rocks, palms, forest, brush, canopy: far, snags };
};

/** Its vertices, in the renderer's format. */
export const jungle = (def: WorldDef): number[] => Object.values(parts(def)).flat();
