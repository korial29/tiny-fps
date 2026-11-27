// Tranquility's rift (the user, 2026-11-27: parkour by the rille): the rille's lips and the cracks
// and sinkholes that run from them into the field, one grid of half metres over red's side out to
// 76 m from the centre line, blue's the mirror. The rille's meander (LIP), long cracks that wind
// almost to the dome's door and the east module's airlock, short ones in the lips, and sinkholes
// with pylons to hop across. Collision, the relief's voids and the scenery's outline all come from
// the same corners: a cell is open when its four corners are, so the outline the scenery draws
// through them never leaves a brush's edge undrawn by more than a chamfer.
import { box } from '../moonbase';
import { noise } from '../relief';
import { TEX } from '../types';
import type { Brush } from '../world';

/** Where the lip stays straight, x0 to x1: the west jump's spurs, a mound and its flanks, the bridge, the east stones and the other mound. */
const STRAIGHT = [
  [12, 24],
  [36, 60],
  [72, 88],
  [124, 156],
];
/**
 * The rille's lip on red's side, a number for each metre of x from 0: how far it is behind z 148,
 * in half metres. A meander from two octaves of noise, 0 on STRAIGHT, never more than half a
 * metre from one metre to the next between the ends, at most 6.5 m. Under 0, a spur into the
 * rille: only over the last 8 m of each end, where it closes (a narrower rille is a new jump).
 * Blue's lip is the mirror.
 */
export const LIP = (() => {
  const d = Array.from({ length: 160 }, (_, x) =>
    STRAIGHT.some(([a, b]) => x >= a - 1 && x <= b)
      ? 0
      : Math.min(
          Math.round(Math.max(26 * noise(x / 17, 0, 33) + 8 * noise(x / 5, 0, 35) - 11, 0)) / 2,
          6.5,
        ),
  );
  for (const k of [1, -1]) {
    for (let x = k > 0 ? 1 : 158; x >= 0 && x < 160; x += k) {
      d[x] = Math.min(d[x], d[x - k] + 0.5);
    }
  }
  // The ends close as they did: 6 m in over the last 4 m, 3 m over the 4 m before.
  return d.map((v, x) => {
    const e = Math.min(x, 159 - x);
    return e < 4 ? -6 : e < 8 ? -3 : v;
  });
})();

/** A hollow in red's field, its middle x, z and how deep: the slab is lowered under it (HOLLOW's square, 3 m), the relief is the floor there. */
export const HOLLOW = [114, 176, 2];

/**
 * The cracks, red's: each a line of points x, z from the centre line and half its width there.
 * The width swells and narrows with a noise along it (0.8 to 1.2 times) and its edge is broken by
 * a finer one (half a metre). They join (the user, 2026-11-27: from island to island): the
 * front one runs across the field from wall to wall in front of the base, and the long ones,
 * the side ones and the sinkholes cut what is between it and the rille into islands, each
 * reached by a jump (CROSSINGS). The two long ones still run on almost to the dome's door and
 * the module's airlock. Kept whole: the west jump's run-up and take-off, the bridge's landing,
 * the east stones' approach, and each mound with the rover's run-up behind it.
 */
export const CRACKS = [
  // The long one to the dome's door.
  [
    [66, 6, 2.4],
    [65.5, 14, 2.8],
    [63.5, 22, 4],
    [63, 30, 5],
    [66, 38, 4.6],
    [71, 46, 3.8],
    [75, 54, 3],
    [78, 62, 2.2],
    [79.5, 67, 0.9],
  ],
  // The long one to the airlock.
  [
    [96, 6, 2.4],
    [94, 14, 3.2],
    [89.5, 22, 4.2],
    [88, 30, 4.4],
    [88.5, 38, 4],
    [92, 45, 3.2],
    [96, 49, 2.2],
    [99, 51, 1.1],
  ],
  // From the west sinkhole to the front.
  [
    [34.5, 36, 2.4],
    [37, 45, 3],
    [36.5, 53, 2.4],
    [35, 58, 1.8],
    [34.5, 61, 1.8],
  ],
  // From the lip to the west sinkhole, east of the west jump.
  [
    [28.5, 6, 1.6],
    [29, 14, 1.6],
    [29.5, 21, 1.8],
    [31, 27, 2],
  ],
  // The front: wall to the first long one, on to the second, on to the east wall.
  [
    [-1, 60, 2.2],
    [12, 61, 2.3],
    [26, 60, 2.5],
    [40, 61, 2.4],
    [48, 61.5, 2.4],
    [56, 62, 2.4],
    [64, 61, 2.4],
    [70, 59, 2.4],
    [76.5, 58, 2.4],
    [82, 57, 2.3],
    [88, 55.5, 2.3],
    [94, 51.5, 2.1],
    [98.5, 50.5, 2],
    [106, 50.5, 2],
    [114, 50.8, 2],
    [122, 50.8, 2],
    [128, 52, 2],
    [132, 54.5, 2.2],
    [136, 58, 2.4],
    [148, 62, 2.4],
    [161, 63, 2.2],
  ],
  // Across the west: the wall to the west sinkhole.
  [
    [-1, 36, 2.2],
    [10, 35, 2.5],
    [22, 34, 2.3],
    [29, 31.5, 2],
  ],
  // Across the middle: the first long one to the second.
  [
    [64.5, 35, 2.2],
    [70, 36, 2.3],
    [77, 35.5, 2.2],
    [83, 34.5, 2.2],
    [88, 33, 2],
  ],
  // Across the east: the second long one by the lip's cracks to the east sinkhole.
  [
    [89.5, 22, 2],
    [94, 21, 2.2],
    [100, 20, 2.3],
    [107, 18.5, 2.1],
    [115, 17.5, 2],
    [122, 21.5, 2.1],
    [128, 24.5, 2],
    [132, 27, 2],
  ],
  // From the east sinkhole to the front, west of the east run-up.
  [
    [132, 27, 1.6],
    [134, 33, 1.4],
    [136, 42, 1.4],
    [136, 52, 1.4],
    [136, 58, 1.6],
  ],
  // A short one in the lip.
  [
    [31.5, 6, 1.6],
    [31, 10, 0.9],
  ],
];
/**
 * The jumps between the islands, red's: a point in a crack and the way across it (x, z from the
 * centre line, a unit vector). A body takes off a metre short of the edge and lands 1.5 m past
 * the far one (hops()): the bots' links, flown both ways in moon.test.ts.
 */
export const CROSSINGS = [
  // Over the front: the north-west, the mound's, the middle, the hollow's and the east island.
  [18, 60.6, 0, 1],
  [44, 61.2, 0, 1],
  [85, 56.3, 0, 1],
  [118, 50.8, 0, 1],
  [141, 59.7, 0, 1],
  // Between the islands.
  [6, 35.5, 0, 1],
  [29, 12, 1, 0],
  [65.7, 10, 1, 0],
  [93, 16, 1, 0],
  [78, 35.3, 0, 1],
  [103, 19.6, 0, 1],
  [136, 45, 1, 0],
];
/**
 * The rovers' ramps, red's (the user, 2026-11-27: discreet, marked by an orange band at the top as
 * the west long jump's spur is): a point in a crack's middle, the way a rover jumps it (a unit
 * vector). The relief rises KICK_H m over 7 m to 2 m short of the point, level 4 m across and 2.5 m
 * of flank each side (moon.ts at()); a rover at speed flies the crack off it. One on each branch
 * of the cracks between two islands where there is room for one, and both ways over the front
 * crack facing the rovers parked before the base.
 */
export const KICKERS = [
  // Over the front: both ways facing the parked rovers, one way elsewhere.
  [62, 61.25, 0, -1],
  [62, 61.25, 0, 1],
  [154, 62.5, 0, -1],
  [154, 62.5, 0, 1],
  [18, 60.6, 0, 1],
  [90, 54.7, 0, -1],
  [117, 50.8, 0, 1],
  // Between the islands.
  [35.8, 55, 1, 0],
  [14, 34.8, 0, -1],
  [65, 17, 1, 0],
  [74, 52.5, 1, 0],
  [78, 35.5, 0, -1],
  [91.7, 44, 1, 0],
];
export const KICK_H = 1.2;
/** Round each ramp, x0, z0, x1, z1 from the centre line: its slope and flanks, the field level under it. */
export const KICKER_RECTS = KICKERS.map(([rx, rz, ux, uz]) => {
  const [xs, zs] = [
    [rx - 9 * ux, rx + ux],
    [rz - 9 * uz, rz + uz],
  ];
  const [ex, ez] = [4.5 * Math.abs(uz), 4.5 * Math.abs(ux)];
  return [Math.min(...xs) - ex, Math.min(...zs) - ez, Math.max(...xs) + ex, Math.max(...zs) + ez];
});
/** The ramps' relief at (x, z from the centre line): 0 off them. */
export const ramped = (x: number, z: number) => {
  let h = 0;
  for (const [rx, rz, ux, uz] of KICKERS) {
    const [a, b] = [(x - rx) * ux + (z - rz) * uz, (z - rz) * ux - (x - rx) * uz];
    h = Math.max(h, KICK_H * c1((a + 9) / 7) * c1((1.5 - a) / 3) * c1((4.5 - Math.abs(b)) / 2.5));
  }
  return h;
};
/** The sinkholes, red's: x, z from the centre line, radius (0.85 to 1.15 of it with the bearing). */
export const SINKS = [
  [33, 30.5, 5.5],
  [132, 27, 5.5],
];
/** The pylons to hop on, red's: x, z from the centre line, half side, top. In the sinkholes and the cracks' wide parts. */
export const PYLONS = [
  [31, 30.5, 0.8, 0.3],
  [33.8, 31.8, 0.8, 1.1],
  [36.4, 30, 0.8, 0.4],
  [130, 25, 0.8, 0.8],
  [131, 28.5, 0.8, 0],
  [61, 30, 0.9, 0.6],
  [64, 33.5, 0.8, -0.4],
  [88, 26, 0.8, 0.9],
  [88.5, 34, 0.8, 0.2],
];

const far = (a: number, b: number) => Math.sqrt(a * a + b * b);
/** t clamped to [0, 1]. */
export const c1 = (t: number) => Math.min(Math.max(t, 0), 1);

/** How far (x, z from the centre line) is inside a crack or a sinkhole: over 0 open. */
const open = (x: number, z: number) => {
  let o = -Infinity;
  const jag = 0.5 * (noise(x / 1.3, z / 1.3, 93) - 0.5);
  CRACKS.forEach((l, k) => {
    let along = 0;
    for (let i = 0; i < l.length - 1; i++) {
      const [[ax, az, aw], [bx, bz, bw]] = [l[i], l[i + 1]];
      const [dx, dz] = [bx - ax, bz - az];
      const n = far(dx, dz);
      const t = Math.min(Math.max(((x - ax) * dx + (z - az) * dz) / (n * n), 0), 1);
      const w = (aw + (bw - aw) * t) * (0.8 + 0.4 * noise((along + t * n) / 5, k + 0.5, 91));
      o = Math.max(o, w + jag - far(x - ax - t * dx, z - az - t * dz));
      along += n;
    }
  });
  for (const [k, [cx, cz, r]] of SINKS.entries()) {
    const d = far(x - cx, z - cz);
    const [ux, uz] = d ? [(x - cx) / d, (z - cz) / d] : [1, 0];
    o = Math.max(o, r * (0.85 + 0.3 * noise(2.5 * ux + 7 * k, 2.5 * uz, 95)) + jag - d);
  }
  return o;
};

/** The grid: cells of S m, NX across x 0 to 160 and NZ from the centre line out. */
export const [S, NX, NZ] = [0.5, 320, 152];
/** The cell (i, j) in the rille or a notch of its lip, by its column of x (a metre, two cells). Past the centre line its mirror. */
const lipped = (i: number, j: number) =>
  i >= 0 && i < NX && ((j < 0 ? -1 - j : j) + 1) * S <= 8 + LIP[Math.floor(i * S)];
/** The cracks' and the sinkholes' corners, 1 open: (i, j) at x = i S, z = j S from the centre line. */
const CRACKED = (() => {
  const c = new Uint8Array((NX + 1) * (NZ + 1));
  for (let j = 0; j <= NZ; j++) {
    for (let i = 0; i <= NX; i++) {
      c[i + j * (NX + 1)] = +(open(i * S, j * S) > 0);
    }
  }
  return c;
})();
const cracked = (i: number, j: number) =>
  i < 0 || i > NX || j > NZ ? 0 : CRACKED[i + Math.abs(j) * (NX + 1)];
/** A corner open: a crack's, or on a cell of the rille or a notch. Past the grid's sides closed (the rille's plugs, the field), past the centre line its mirror. */
export const corner = (i: number, j: number) =>
  cracked(i, j) || +(lipped(i - 1, j - 1) || lipped(i, j - 1) || lipped(i - 1, j) || lipped(i, j));
/** Open corners of cell (i, j), as a mask: 1 (i, j), 2 (i + 1, j), 4 (i + 1, j + 1), 8 (i, j + 1). */
export const mask = (i: number, j: number) =>
  corner(i, j) | (corner(i + 1, j) << 1) | (corner(i + 1, j + 1) << 2) | (corner(i, j + 1) << 3);
/** Three of a cell's corners open in a crack or more. */
const loose = (i: number, j: number) =>
  cracked(i, j) + cracked(i + 1, j) + cracked(i + 1, j + 1) + cracked(i, j + 1) >= 3;
/**
 * The cells open, from the centre line out: the rille and its notches, cell for cell as LIP
 * says; and in the cracks the loose ones in a square of four loose or lipped ones, so no slot is
 * under a metre wide, which a body could fall into and not climb out of.
 */
const GAPS = (() => {
  const g = new Uint8Array(NX * NZ);
  const either = (i: number, j: number) => lipped(i, j) || loose(i, j);
  for (let j = 0; j < NZ; j++) {
    for (let i = 0; i < NX; i++) {
      g[i + j * NX] = +(
        lipped(i, j) ||
        (loose(i, j) &&
          [-1, 0].some(a =>
            [-1, 0].some(
              b =>
                either(i + a, j + b) &&
                either(i + a + 1, j + b) &&
                either(i + a, j + b + 1) &&
                either(i + a + 1, j + b + 1),
            ),
          ))
      );
    }
  }
  return g;
})();
/** A cell open: no floor, the scenery draws none or a chamfer's triangle. Past the grid's sides closed, past the centre line its mirror. */
export const gap = (i: number, j: number) =>
  i < 0 || i >= NX || j >= NZ ? 0 : GAPS[i + (j < 0 ? -1 - j : j) * NX];

/**
 * The cells as rectangles, rows merged where a run of one kind goes on unchanged: x0, z0, x1, z1
 * (z from the centre line) and the kind (`kind(i, j)`, -1 left out), in columns of 8 m. Few where
 * the edges are straight, a row each where they wander.
 */
const rects = (kind: (i: number, j: number) => number) => {
  const out: number[][] = [];
  let live = new Map<string, number[]>();
  for (let j = 0; j <= NZ; j++) {
    const next = new Map<string, number[]>();
    for (let i = 0; j < NZ && i < NX;) {
      const k = kind(i, j);
      // A run ends at its kind's end or at the next column of 8 m: away from a crack the
      // columns go on unchanged row after row, one box each.
      let e = i + 1;
      while (e < NX && e % 16 && kind(e, j) === k) {
        e++;
      }
      if (k >= 0) {
        const key = `${i},${e},${k}`;
        const r = live.get(key) ?? [i * S, j * S, e * S, j * S, k];
        live.delete(key);
        r[3] = (j + 1) * S;
        next.set(key, r);
      }
      i = e;
    }
    out.push(...live.values());
    live = next;
  }
  return out;
};

/** In the hollow's square: its slab is 3 m down. */
const hollowed = (x: number, z: number) =>
  Math.abs(x - HOLLOW[0]) < 12 && Math.abs(z + 140 - HOLLOW[1]) < 12;

/** Red's floor over the grid, ghosts the scenery draws over: a box for each rectangle of closed cells, 3 m down in the hollow. */
export const floor = (): Brush[] =>
  rects((i, j) => (gap(i, j) ? -1 : hollowed((i + 0.5) * S, (j + 0.5) * S) ? 1 : 0)).map(
    ([x0, z0, x1, z1, k]) => ({
      ...box(x0, -30, 140 + z0, x1, k ? -3 : 0, 140 + z1, TEX.STONE),
      ghost: true,
    }),
  );

/** The pylons, red's, ghosts the scenery draws as rock pillars. */
export const pylons = (): Brush[] =>
  PYLONS.map(([x, z, h, y]) => ({
    ...box(x - h, -30, 140 + z - h, x + h, y, 140 + z + h, TEX.STONE),
    ghost: true,
  }));

/** The relief's voids past the rille, both sides: x0, z0, x1, z1. */
export const voids = (): [number, number, number, number][] =>
  rects((i, j) => (j >= 8 / S && gap(i, j) ? 0 : -1)).flatMap(([x0, z0, x1, z1]) => [
    [x0, 140 + z0, x1, 140 + z1],
    [x0, 140 - z1, x1, 140 - z0],
  ]);

/**
 * The jumps as the bots fly them, red's: take-off and landing, x and z from the centre line, and
 * whether it needs a sprint (over 5 m of void). Found along each of CROSSINGS from its point:
 * the first closed cell each way.
 */
export const hops = () =>
  CROSSINGS.map(([x, z, dx, dz]) => {
    const edge = (k: number) => {
      let d = 0;
      while (gap(Math.floor((x + k * d * dx) / S), Math.floor((z + k * d * dz) / S)) && d < 20) {
        d += 0.1;
      }
      return d;
    };
    const [a, b] = [edge(-1), edge(1)];
    return {
      from: [x - (a + 1) * dx, z - (a + 1) * dz],
      to: [x + (b + 1.5) * dx, z + (b + 1.5) * dz],
      sprint: a + b > 5,
    };
  });
