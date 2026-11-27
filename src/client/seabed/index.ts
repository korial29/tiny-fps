// Landfall's seabed (docs/BEACH.md, the user, 2026-11-27): pebbles, shells and laminaria in the
// lagoon, drawn once with the land. Each is placed on the relief's ground and mirrored about the
// centre line, so both halves look alike. No DOM.
import { FRAME, HULL, ZED } from '../../shared/beach';
import { ground, hash, raise } from '../../shared/relief';
import type { World, WorldDef } from '../../shared/world';
import { basis, dress, place, smooth } from '../mesh';
import type { Vec3 } from '../mesh';

/** How many of each on one half of the map: groups of pebbles, shells, clumps of kelp. */
export const [PEBBLE_GROUPS, SHELLS, CLUMPS] = [45, 150, 30];
/** The bed's x range searched, metres: from the deep out to just past the waterline (FRAME.shore). */
const [X0, X1] = [-26, FRAME.shore + 3];
/** Kelp grows where the bed is at least this deep, metres, and its tips stay this far under the surface. */
const [KELP_DEPTH, KELP_CLEAR] = [1.2, 0.25];

/** A rounded stone at the origin, 1 m across, to be squashed and tinted. */
const STONE = dress(
  smooth(
    [
      [0, -0.5],
      [0.5, 0],
      [0, 0.5],
    ],
    4,
  ),
  [1, 1, 1],
);
/** A whelk's pointed shell along -z, 1 m long: its mouth wide at the back, its spire to the tip. */
const WHELK = dress(
  smooth(
    [
      [0, 0.5],
      [0.32, 0.25],
      [0.14, -0.2],
      [0, -0.5],
    ],
    4,
  ),
  [1, 1, 1],
);
/** A scallop's valve at the origin, 1 m across: a fan of ribs, ridges and furrows, domed in the middle. */
const SCALLOP = (() => {
  const o: number[] = [];
  const RIBS = 9;
  const at = (k: number, rim: boolean): number[] => {
    const a = Math.PI * (0.1 + (0.8 * k) / RIBS);
    const r = rim ? 0.5 : 0;
    const y = rim ? (k % 2 ? 0.05 : 0.02) : 0.12;
    return [r * Math.cos(a), y, 0.2 - r * Math.sin(a)];
  };
  for (let k = 0; k < RIBS; k++) {
    const [p, q, s] = [at(k, false), at(k, true), at(k + 1, true)];
    const u = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
    const v = [s[0] - p[0], s[1] - p[1], s[2] - p[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const h = Math.hypot(n[0], n[1], n[2]) * Math.sign(n[1] || 1);
    for (const c of [p, s, q]) {
      o.push(...c, n[0] / h, n[1] / h, n[2] / h);
    }
  }
  return dress(o, [1, 1, 1]);
})();

/** Stones: grey granite, a sandy brown, a pale quartz and a dark basalt from the volcano. */
const STONES = [
  [0.46, 0.45, 0.43],
  [0.5, 0.42, 0.32],
  [0.75, 0.73, 0.68],
  [0.2, 0.2, 0.21],
];
/** Shells: cream, a sunset pink, an orange and a slate blue (a mussel's). */
const SHELL_TINTS = [
  [0.86, 0.8, 0.68],
  [0.86, 0.6, 0.56],
  [0.84, 0.56, 0.34],
  [0.24, 0.26, 0.34],
];
/** Laminaria's olive brown, and its paler, yellower tips. */
const [KELP, KELP_TIP] = [
  [0.22, 0.18, 0.06],
  [0.42, 0.36, 0.12],
];

/** The tail's section of the hull lies in the water: nothing goes under it. */
const underHull = (x: number, z: number) =>
  Math.abs(z - ZED / 2) < HULL.r + 1.5 &&
  x > HULL.sections[0][0] - 1 &&
  x < HULL.sections[0][1] + 1;

/**
 * One laminaria from its holdfast at `at`: a single ribbon, a stipe as thin as a finger that
 * widens into the blade, `len` long, rising and leaning with the swell toward the shore (+x)
 * along `yaw`, its edge rippled. Drawn double sided (the renderer culls no face).
 */
const blade = (o: number[], at: Vec3, len: number, yaw: number, lean: number, seed: number) => {
  const SEGS = 6;
  const [cy, sy] = [Math.cos(yaw), Math.sin(yaw)];
  const pts: [Vec3, number][] = [];
  for (let i = 0; i <= SEGS; i++) {
    const t = i / SEGS;
    // Up first, then bending over along the lean; a slow S of the current.
    const bend = lean * t * t;
    const sway = 0.12 * Math.sin(3 * t + seed * 6);
    const up = len * t * (1 - 0.35 * bend);
    const out = len * (0.6 * bend * t) + sway;
    pts.push([
      [at[0] + out, at[1] + up, at[2] + out * 0.3 * sy + sway * cy],
      // The stipe for the first fifth, then the blade, widest past its middle, to a ragged tip.
      t < 0.2 ? 0.012 : 0.05 + 0.13 * Math.sin(Math.PI * Math.min((t - 0.2) / 0.85, 1)),
    ]);
  }
  for (let i = 0; i < SEGS; i++) {
    const [[a, wa], [b, wb]] = [pts[i], pts[i + 1]];
    const t = (i + 0.5) / SEGS;
    const c = KELP.map((v, m) => v + (KELP_TIP[m] - v) * t * t);
    // Across the blade: horizontal, along `yaw`, the edges rippled.
    const ripple = (w: number, k: number) => w * (1 + 0.25 * Math.sin(k * 9 + seed * 11));
    const [ra, rb] = [ripple(wa, i), ripple(wb, i + 1)];
    const ex = (p: Vec3, w: number, s: number): number[] => [
      p[0] - sy * w * s,
      p[1],
      p[2] + cy * w * s,
    ];
    // The blade faces across its width: its normal the up-ish side of the ribbon's plane.
    const n = [cy * 0.7, 0.7, sy * 0.7];
    for (const v of [
      ex(a, ra, -1),
      ex(b, rb, 1),
      ex(a, ra, 1),
      ex(a, ra, -1),
      ex(b, rb, -1),
      ex(b, rb, 1),
    ]) {
      o.push(v[0], v[1], v[2], n[0], n[1], n[2], c[0], c[1], -1, c[2]);
    }
  }
};

/** Both halves: the point and its mirror about the centre line. */
const both = (z: number) => [z, ZED - z];

/** Pebbles, shells and laminaria on the bed, in the renderer's format (the land's). */
export const seabed = (def: WorldDef): number[] => {
  const o: number[] = [];
  if (!def.relief) {
    return o;
  }
  const w = { relief: raise(def.relief) } as World;
  const gy = (x: number, z: number) => ground(w, x, z);
  // Pebbles in groups: a few big ones and many small, over the shallows and the wet sand.
  for (let g = 0; g < PEBBLE_GROUPS; g++) {
    const h = (k: number) => hash(g, k, 53);
    const [cx, cz] = [X1 - 28 * h(1) ** 1.5, FRAME.cape + 4 + (ZED / 2 - 8) * h(2)];
    const n = 6 + Math.floor(9 * h(3));
    for (let i = 0; i < n; i++) {
      const s = (k: number) => hash(g * 31 + i, k, 59);
      const [x, z0] = [cx + 1.3 * (s(1) - 0.5) * 2, cz + 1.3 * (s(2) - 0.5) * 2];
      const size = 0.06 + 0.26 * s(3) ** 2;
      const tint = STONES[Math.floor(s(4) * STONES.length)].map(v => v * (0.85 + 0.3 * s(5)));
      for (const z of both(z0)) {
        if (underHull(x, z)) {
          continue;
        }
        place(
          o,
          STONE,
          [x, gy(x, z) + 0.15 * size, z],
          basis(7 * s(6), 0.3 * (s(7) - 0.5)),
          [0, 0, 0],
          [size * (0.9 + 0.5 * s(8)), size * (0.45 + 0.25 * s(9)), size],
          tint,
        );
      }
    }
  }
  // Shells, most near the waterline where the swash leaves them, a few out in the deep.
  for (let i = 0; i < SHELLS; i++) {
    const h = (k: number) => hash(i, k, 67);
    const [x, z0] = [X1 - (X1 - X0) * h(1) ** 3, FRAME.cape + 3 + (ZED / 2 - 6) * h(2)];
    const whelk = h(3) < 0.4;
    const size = whelk ? 0.07 + 0.08 * h(4) : 0.06 + 0.07 * h(4);
    const tint = SHELL_TINTS[Math.floor(h(5) * SHELL_TINTS.length)].map(
      v => v * (0.9 + 0.2 * h(6)),
    );
    for (const z of both(z0)) {
      if (underHull(x, z)) {
        continue;
      }
      place(
        o,
        whelk ? WHELK : SCALLOP,
        [x, gy(x, z) + (whelk ? 0.25 * size : 0.005), z],
        basis(7 * h(7), whelk ? 0.2 : 0.15 * (h(8) - 0.5), whelk ? 0.4 * (h(9) - 0.5) : 0),
        [0, 0, 0],
        whelk ? [0.7 * size, 0.7 * size, size] : size,
        tint,
      );
    }
  }
  // Laminaria in clumps where the bed is deep enough, each blade short of the surface.
  for (let c = 0; c < CLUMPS; c++) {
    const h = (k: number) => hash(c, k, 71);
    const [cx, cz] = [X0 + (FRAME.shore - 12 - X0) * h(1), FRAME.cape + 6 + (ZED / 2 - 12) * h(2)];
    const n = 6 + Math.floor(6 * h(3));
    for (let i = 0; i < n; i++) {
      const s = (k: number) => hash(c * 17 + i, k, 73);
      const [x, z0] = [cx + 1.1 * (s(1) - 0.5) * 2, cz + 1.1 * (s(2) - 0.5) * 2];
      for (const z of both(z0)) {
        const y = gy(x, z);
        const room = FRAME.water - KELP_CLEAR - y;
        if (FRAME.water - y < KELP_DEPTH || underHull(x, z)) {
          continue;
        }
        const len = Math.min(room, 0.9 + 1.6 * s(3));
        blade(o, [x, y, z], len, Math.PI * (s(4) - 0.5), 0.3 + 0.5 * s(5), s(6));
      }
    }
  }
  return o;
};
