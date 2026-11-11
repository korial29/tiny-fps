// Tranquility, the moon level (docs/MOON.md): a capture the flag in a crater, half gravity.
// Red's half (z 140 to 280) is written and flipped across z = 140; the rille, which stands on the
// line, is written once, symmetric by hand. The crater floor is a relief, at(), out to an ellipse
// of 600 by 720 m: in the arena (x 0..160, z 0..280) it lies on the floor's slabs, never under
// them, flat where a base, a pack or a route's jump needs it; only the rille and the notches of
// its lips have none. Compact on purpose: the local bundle carries it (budget in scripts/size.mjs).
import { PLAYER_R } from './constants';
import { TEAM_TINT } from './map';
import { BASE, DOME, MODULES, TUBES, box, bx, fromBx } from './moonbase';
import type { Bx, Vec3 } from './moonbase';
import { hash, noise } from './relief';
import { TEX } from './types';
import type { Brush, Spawn, WorldDef } from './world';

/** The crater is 280 m long: a point at z has its twin at ZED - z. */
export const ZED = 280;
const [RED, BLUE] = TEAM_TINT;
const { STONE, CONCRETE, METAL, STEEL, PAINT } = TEX;

/**
 * The west long jump: the rille is 16 m wide, the spurs of the lip leave this much open. At half
 * gravity (GRAVITY 20 becomes 10) a jump of 7 m/s rises 2.45 m and hangs 1.4 s: a run flies 8.4 m,
 * a sprint 12.6 m, a dash adds about 1.2 m and more. At full gravity those are 4.2 and 6.3 m.
 */
export const WEST_GAP = 13.5;

/** The twin of a box across the centre line. */
const mirror = ({ min, max }: Bx): Bx =>
  bx(min[0], min[1], ZED - max[2], max[0], max[1], ZED - min[2]);

/** The domes' centres, the landing pads (x, z, radius), the shuttles, the modules, the tubes and the masts (centres), red's then blue's: what the scenery draws on. */
const PAD = [40, 220, 13];
const SHUTTLE = bx(33, 0.25, 218, 47, 3.25, 222);
const MASTS = [
  [27.3, 207.3],
  [52.7, 207.3],
  [27.3, 232.7],
  [52.7, 232.7],
  [106.2, 230.4],
  [103.2, 212.4],
];

/** Red's flag: in the hall, 2 m from the dome's centre toward the door. */
const FLAG = DOME[1] - 2;

const c1 = (t: number) => Math.min(Math.max(t, 0), 1);
const sm = (t: number) => c1(t) * c1(t) * (3 - 2 * c1(t));
const far = (a: number, b: number) => Math.sqrt(a * a + b * b);

// The relief's pieces, x and the distance from the centre line (so blue's half is red's mirror).
/** Craters, x, z, radius: a bowl 0.19 of the radius deep under a rim 0.06 of it high, flat for 4 m. The first is the Bowl. */
const BOWLS = [
  [-100, 0, 46],
  [20, 215, 22],
  [110, 236, 16],
  [-112, 108, 14],
  [236, 170, 13],
  [-28, 228, 12],
];
/** Jump ramps, where the rise starts and the unit way up: 16 m long, 5.6 m high (19 degrees), 12 m wide, the lip flat for 4 m (no knife edge under a rover). */
const RAMPS = [
  [-20, 0, -1, 0],
  [192, 124, 0, -1],
  [64, 236, 1, 0],
  [-60, 100, 0, 1],
];
/** The ridge east of the arena (x, the z its crest ends at) and the antennas' hill south-east (x, z). */
const [RIDGE, HILL] = [
  [248, 64],
  [180, 200],
];
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
 * metre from one metre to the next between the ends (so the rim the scenery draws through it is never more than
 * that from a brush), at most 6.5 m. Under 0, a spur into the rille: only over the last 8 m of
 * each end, where it closes (a narrower rille is a new jump). Blue's lip is the mirror.
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
/** Runs of a list of numbers a metre of x apart: first x, metres, value. */
const runs = (l: number[]) =>
  l.reduce<number[][]>((r, n, x) => {
    if (r.at(-1)?.[2] === n) {
      r.at(-1)![1]++;
    } else {
      r.push([x, 1, n]);
    }
    return r;
  }, []);
const RUNS = runs(LIP);
/** A hollow in red's field, its middle x, z and how deep: the slab is lowered under it (HOLLOW's square), the relief is the floor there. */
export const HOLLOW = [114, 176, 2];
/**
 * The mounds by the rille, their middle x: a ramp up to the lip, RISE m long and MOUND m high (21
 * degrees), 8 m wide with 8 m of flank each side. A rover at speed flies the 16 m to the twin
 * across and lands on its back.
 */
export const MOUNDS = [48, 144];
export const [MOUND, RISE] = [3, 8];
/**
 * Where the field stays flat at y 0, x0, z0, x1, z1 with z from the centre line: the landing pad,
 * the dome with the armoury and the spawns, the modules and tubes, the two rovers, the packs on the
 * floor, the run-up to each mound. The relief is 0 for 6 m round each (so the lattice's
 * triangles are level over it) and back to itself 6 m further. The lips need none: the field
 * starts 12 m behind them.
 */
export const FLATS = [
  [27, 67, 53, 93],
  [56, 74, 104, 133],
  [96, 56, 125, 90],
  [98, 36, 102, 40],
  [28, 113, 32, 117],
  [30, 45, 30, 45],
  [135, 50, 135, 50],
  [50, 106, 50, 106],
  [35, 104, 35, 104],
  [115, 22, 115, 22],
  [45, 20, 51, 62],
  // The hollow's middle: the field is level round it, the bowl goes down from there.
  [114, 36, 114, 36],
  [141, 20, 147, 66],
];
/** The boulder field south-west: x, z, radius. */
const FIELD = [
  [0, 0, 4.5],
  [-14, 6, 3],
  [10, -12, 3.5],
  [16, 10, 2.5],
  [-8, -16, 2.2],
  [-20, -8, 3.8],
  [6, 18, 3],
  [22, -4, 2],
  [-12, 20, 2.4],
].map(([x, z, r]) => [x - 50, z + 330, r]);
/** The east stepping stones in the rille, x0, z0, x1, z1 and the top. */
const PILLARS = [
  [126, 143, 131, 147, 1.2],
  [130, 138.5, 135, 141.5, 2.4],
  [126, 133, 131, 137, 1.2],
];
/** The three dishes on the hill and the lander wrecked in the Bowl. */
const DISHES = [
  [180, 340],
  [173, 346],
  [186, 347],
];
const WRECK = [BOWLS[0][0], ZED / 2];
/** Boulders in the arena's field, red's (x, z, width, depth, height): drawn as rocks round their box. */
const STONES = [
  [4, 172, 4, 4, 2.2],
  [30, 154, 5, 5, 3],
  [66, 158, 3, 3, 1.6],
  [95, 164, 5, 4, 2.6],
  [125, 175, 6, 5, 3.2],
  [92, 186, 4, 4, 2.4],
];
/**
 * Boulders along the three walls of red's half (x, z, radius), not on the field's first stone
 * (4..8, 172..176). Each stands in the boxes of a crag reaching REACH r (the brushes below); one whose box
 * would leave a crack a player could not get out of next to an earlier one is left out.
 */
/** How far a boulder of radius r reaches from its middle, in r: its boxes' footprint. */
const REACH = 0.85;
const BOULDERS = Array.from({ length: 36 }, (_, i) => {
  const h = (k: number) => hash(i, k, 41);
  const b = Math.floor(h(1) * 3);
  const [x, z0] =
    b < 2 ? [(b ? 151 : 0) + h(2) * 9, 150 + h(3) * 122] : [5 + h(2) * 150, 273 + h(3) * 7];
  return [x, z0 + (b === 0 && Math.abs(z0 - 174) < 8 ? 16 : 0), 0.6 + 2.4 * h(4) * h(4)];
}).filter(
  ([x, z, r], i, l) =>
    !l.slice(0, i).some(([u, w, q]) => {
      const gap = Math.max(Math.abs(x - u), Math.abs(z - w)) - REACH * (r + q);
      return gap > 0 && gap < 2 * PLAYER_R + 0.2;
    }),
);

/**
 * How much of a mound's height there is at x, across it: all of it for 4 m each side of its
 * middle cx, none 8 m further, and none over the spurs that close the rille's east end. Straight
 * between the lattice's lines, so the ground between two nodes is what at() says.
 */
const across = (cx: number, x: number) => {
  const f = (u: number) => c1((12 - Math.abs(u - cx)) / 8) * c1((152 - u) / 4);
  const x0 = 4 * Math.floor(x / 4);
  return f(x0) + ((f(x0 + 4) - f(x0)) * (x - x0)) / 4;
};

/**
 * The height of the crater floor round the arena. Only + - * /, Math.sqrt, Math.abs, min, max, floor
 * and the integer hash: every engine builds the same lattice. In the arena, the field (see FLATS)
 * and the mounds; exactly 0 for 12 m round it (a rectangle on lattice lines, so between the nodes
 * too); then rolling hills, the pieces above, then the crater wall: it starts 0.78 of the way to the bound,
 * is 20 m high on it and, past it where nobody goes, climbs to a ragged crest of 60 to 95 m and
 * falls to the plain at 1.65 of the bound.
 */
const at = (x: number, z: number): number => {
  z = Math.abs(z - ZED / 2);
  const k = far((x - 80) / 300, z / 360);
  const t = Math.max((k - 0.78) / 0.22, 0);
  // How far out of the arena (under 0: in it).
  const out = Math.max(Math.abs(x - 80) - 80, z - 140);
  let h =
    sm((out - 12) / 48) *
    (1 - 0.7 * sm(t)) *
    (16 * noise(x / 96, z / 96, 1) +
      6 * noise(x / 52, z / 52, 4) +
      5 * noise(x / 36, z / 36, 2) +
      1.4 * noise(x / 22, z / 22, 3) -
      14.2);
  if (out < 0) {
    // The field: swells and mounds over the slabs, never under them, flat by the lips, the edge and the FLATS.
    // It starts 16 to 26 m from the centre line, not along a ruled line.
    let m = sm((z - 16 - 10 * noise(x / 19, 0.5, 37)) / 8) * sm(-out / 10);
    for (const [x0, z0, x1, z1] of FLATS) {
      m *= sm((far(Math.max(x0 - x, x - x1, 0), Math.max(z0 - z, z - z1, 0)) - 6) / 6);
    }
    h =
      m *
      Math.min(
        Math.max(4.8 * noise(x / 15, z / 15, 21) - 0.9, 0) +
          Math.max(3 * noise(x / 31, z / 31, 23) - 0.6, 0),
        2.6,
      );
    // The hollow: the field gives way to a bowl, back to 0 by the edge of its square.
    const s = sm((10 - far(x - HOLLOW[0], z - (HOLLOW[1] - ZED / 2))) / 8);
    h = h * (1 - s) - HOLLOW[2] * s;
    for (const cx of MOUNDS) {
      h += MOUND * c1((8 + RISE - z) / RISE) * across(cx, x);
    }
    // No relief in the rille: its nodes are the lips'.
    h = z < 8 ? 0 : h;
  }
  for (const [cx, cz, r] of BOWLS) {
    const q = far(x - cx, z - cz) / r;
    // The rim is flat for 4 m: a rover's belly clears it.
    const s = 1 - c1((q - 1 - 4 / r) / 0.6);
    h += r * (q < 1 ? 0.25 * q * q - 0.19 : 0.06 * s * s);
  }
  for (const [rx, rz, ax, az] of RAMPS) {
    const [p, q] = [x - rx, z - rz];
    const a = p * ax + q * az;
    h += 5.6 * c1(Math.min(a / 16, (32 - a) / 12)) * c1((18 - Math.abs(p * az - q * ax)) / 12);
  }
  const d = c1(far(x - RIDGE[0], Math.max(z - RIDGE[1], 0)) / 36);
  h += 12 * (1 - d * d) * (1 - d * d) + 8 * sm((36 - far(x - HILL[0], z - HILL[1])) / 24);
  let w = 10 * t * (1 + t);
  if (k > 1) {
    w =
      (w + (k - 1) * 60 * (Math.abs(2 * noise(x / 45, z / 45, 5) - 1) - 0.5)) *
      (1 + (k - 1) * (1.2 * noise(x / 90, z / 90, 7) - 0.6)) *
      (1 - sm((k - 1.25) / 0.4));
  }
  // The Bowl's floor stays 5 m over the kill floor.
  return Math.max(h, -14.5) + w;
};

type V3 = [number, number, number];
/** Five bearings a fifth of a turn apart, as unit vectors: no Math.cos in what the host and the clients must agree on. */
const FIFTHS = [
  [1, 0],
  [0.309, 0.951],
  [-0.809, 0.588],
  [-0.809, -0.588],
  [0.309, -0.951],
];
/**
 * The form of a boulder of radius R and height H from a seed: how far it reaches from its middle
 * (a quarter of its height over the ground) along a unit vector. One to three lobes, each a block
 * cut by five leaning planes round it and a nearly level one on top, its corners rounded by an
 * ellipsoid: a main mass, a shoulder beside it half as high from 1.3 m of radius, a low one from
 * 3.2 m. One plane cuts under a side (an overhang), and the whole swells and shrinks by 6 % with
 * the bearing. Only + - * /, Math.sqrt and the hash: the boxes below come from it on every side.
 * `tops` are the lobes' middles (x, z) and the height of their top over the rock's middle.
 */
export const rockOf = (s: number, R: number, H: number) => {
  const h = (k: number) => hash(s, k, 131);
  const flat = (k: number) => {
    const [a, b] = [2 * h(k) - 1, 2 * h(k + 1) - 1];
    const l = Math.sqrt(a * a + b * b) || 1;
    return [a / l, b / l];
  };
  const lobes = [0, 1, 2].slice(0, R < 1.3 ? 1 : R < 3.2 ? 2 : 3).map(k => {
    const [fx, fz] = flat(20 * k + 1);
    const [off, rad] = [[0.1, 0.45, 0.42][k] * R, [0.8, 0.75, 0.65][k] * R];
    const o = [fx * off, fz * off];
    const top = [H, (0.5 + 0.15 * h(20 * k + 3)) * H, 0.34 * H][k] - 0.25 * H;
    // The top, tilted by 0.12 m at most across the lobe; then the five sides.
    const tilt = Math.min(0.06, 0.06 / rad);
    const [tx, tz] = [(2 * h(20 * k + 4) - 1) * tilt, (2 * h(20 * k + 5) - 1) * tilt];
    const tl = Math.sqrt(tx * tx + 1 + tz * tz);
    const planes = [
      [tx / tl, 1 / tl, tz / tl, (tx * o[0] + top + tz * o[1]) / tl],
      ...FIFTHS.map(([px, pz], j) => {
        const [ax, az] = [px + h(20 * k + 6 + j) - 0.5, pz + h(20 * k + 11 + j) - 0.5];
        const l = Math.sqrt(ax * ax + az * az);
        const y = -0.15 + 0.5 * h(20 * k + 16 + j);
        const c = Math.sqrt(1 - y * y);
        const [nx, nz] = [(c * ax) / l, (c * az) / l];
        return [nx, y, nz, nx * o[0] + nz * o[1] + rad * (0.72 + 0.22 * h(20 * k + 21 + j))];
      }),
    ];
    return { o, rad, top, planes };
  });
  const [ux, uz] = flat(91);
  const under = [0.866 * ux, -0.5, 0.866 * uz, 0.72 * R];
  const reach = (u: V3) => {
    let far = 0;
    for (const { o, rad, planes } of lobes) {
      // Out of the lobe's ellipsoid, wide and very tall, from the rock's middle inside it.
      const [a, c] = [1.2 * rad, 1.15 * H];
      const A = (u[0] * u[0] + u[2] * u[2]) / (a * a) + (u[1] * u[1]) / (c * c);
      const B = (-2 * (u[0] * o[0] + u[2] * o[1])) / (a * a);
      const C = (o[0] * o[0] + o[1] * o[1]) / (a * a) - 1;
      let t = (-B + Math.sqrt(B * B - 4 * A * C)) / (2 * A);
      for (const [nx, ny, nz, d] of [...planes, under]) {
        const k = u[0] * nx + u[1] * ny + u[2] * nz;
        t = k > 1e-9 ? Math.min(t, d / k) : t;
      }
      far = Math.max(far, t);
    }
    return far * (0.94 + 0.12 * noise(1.5 * u[0] + s, 1.5 * u[2] + 2 * u[1], s));
  };
  return { reach, tops: lobes.map(({ o, top }) => [o[0], o[1], top]) };
};

/**
 * The boxes inside a boulder, one for each lobe, each x0, y0, z0, x1, y1, z1 round its middle
 * (y from the middle's height): the widest box under the lobe's top, standing from `foot` under
 * the middle, whose corners and the middles of its sides are all in the rock at its foot, half
 * way up and on top. A body is stopped a little inside what is drawn, never outside it.
 */
const inside = ({ reach, tops }: ReturnType<typeof rockOf>, R: number, foot: number) => {
  // Within 9 cm of the rock: a box may stand that far out of it.
  const holds = (x: number, y: number, z: number, slack = 0.09) => {
    const l = Math.sqrt(x * x + y * y + z * z);
    return l < 1e-6 || l <= reach([x / l, y / l, z / l]) + slack;
  };
  const grid = [-1, 0, 1];
  /** A box of half sides p and q round (cx, cz) from the foot up to t: in the rock at its foot, half way up and on top, and with no rock 0.2 m over its top (what stands on it is not in the rock). */
  const fits = (cx: number, cz: number, p: number, q: number, t: number) =>
    [foot + 0.05, (foot + t) / 2, t].every(y =>
      grid.every(i => grid.every(j => holds(cx + i * p, y, cz + j * q))),
    ) && grid.every(i => grid.every(j => !holds(cx + i * p, t + 0.2, cz + j * q, 0)));
  return tops.flatMap(([ox, oz, top], k) => {
    let best = [0, 0, 0, 0, 0, 0];
    // Round the main lobe's middle; for the others, out from the rock's middle past theirs, where the main mass is not over them.
    const l = Math.sqrt(ox * ox + oz * oz) || 1;
    for (const a of k ? [0.1, 0.3, 0.5] : [-0.15, 0, 0.15]) {
      for (const b of [-0.15, 0, 0.15]) {
        const [cx, cz] = k
          ? [ox + (a * ox - b * oz) * (R / l), oz + (a * oz + b * ox) * (R / l)]
          : [ox + a * R, oz + b * R];
        // The highest top that holds a small box there; then the box wider both ways, one way, the other.
        let t = 0;
        for (let y = top + 0.1; !t && y > foot + 0.3; y -= 0.1) {
          t = fits(cx, cz, 0.08 * R, 0.08 * R, y) ? y : 0;
        }
        let [p, q] = [0.08 * R, 0.08 * R];
        for (const [fa, fb] of t
          ? [
              [1, 1],
              [1, 0],
              [0, 1],
            ]
          : []) {
          for (let step = 0.5 * R; step > 0.03; step /= 2) {
            [p, q] = fits(cx, cz, p + fa * step, q + fb * step, t)
              ? [p + fa * step, q + fb * step]
              : [p, q];
          }
        }
        if (t && p * q * (t - foot) > best[0]) {
          best = [p * q * (t - foot), cx, cz, p, q, t];
        }
      }
    }
    // A lobe with no room for a box 0.5 m wide has none: the main one always has.
    const [, cx, cz, p, q, t] = best;
    return Math.min(p, q) < (k ? 0.25 : 0) ? [] : [[cx - p, foot, cz - q, cx + p, t, cz + q]];
  });
};

/** A rock of the map: where its middle is over the ground (x, the ground's height, z), its radius, height and seed, and the boxes it collides with (x0, y0, z0, x1, y1, z1), inside what rockOf() draws. */
const crag = (x: number, z: number, R: number, H: number, s: number, deep = 0) => {
  const g = at(x, z);
  const y = g + 0.25 * H;
  return {
    at: [x, g, z],
    R,
    H,
    s,
    parts: inside(rockOf(s, R, H), R, -0.25 * H)
      // Not a second box that leaves a crack a body is caught in between it and the first.
      .filter((b, k, l) => {
        const gap = Math.max(b[0] - l[0][3], l[0][0] - b[3], b[2] - l[0][5], l[0][2] - b[5]);
        return !k || gap <= 0 || gap > 1.2;
      })
      .map(([x0, , z0, x1, y1, z1]) => [x + x0, deep, z + z0, x + x1, y + y1, z + z1]),
  };
};
/** Red's rocks: in the arena the field's stones (as wide as their old box was long, a fifth higher) and the boulders along the walls, then the boulder field's. */
const CRAGS = {
  arena: [
    ...STONES.map(([x, z, w, d, h], i) =>
      crag(x + w / 2, z + d / 2, 0.31 * (w + d), 1.15 * h, i + 61),
    ),
    ...BOULDERS.map(([x, z, r], i) => crag(x, z, r, 0.8 * r, i)),
  ],
  field: FIELD.map(([x, z, r], i) => crag(x, z, r, 0.75 * r, i + 100, at(x, z) - 6)),
};
const ghosts = (l: { parts: number[][] }[]): Brush[] =>
  l
    .flatMap(c => c.parts)
    .map(([x0, y0, z0, x1, y1, z1]) => ({ ...box(x0, y0, z0, x1, y1, z1, STONE), ghost: true }));

/** The ghost under a drawn rock or mast: a box of half side s from under the ground to h above it. */
const lump = (x: number, z: number, s: number, h: number): Brush => ({
  ...box(x - s, at(x, z) - 6, z - s, x + s, at(x, z) + h, z + s, STONE),
  ghost: true,
});

export const LAYOUT = {
  /** Outside the arena: the boulders (x, z, radius), the dishes, the ramps (the middle of the lip and the unit way up it), the wreck. */
  rocks: [...FIELD, ...FIELD.map(([x, z, r]) => [x, ZED - z, r])],
  dishes: [...DISHES, ...DISHES.map(([x, z]) => [x, ZED - z])],
  // A ramp on the centre line is its own twin.
  ramps: RAMPS.flatMap(([x, z, ax, az]) =>
    (z ? [1, -1] : [1]).map(m => [x + 16 * ax, ZED / 2 + m * (z + 16 * az), ax, m * az + 0]),
  ),
  wreck: WRECK,
  /** Red's boulders along its walls and the field's stones; blue's are their mirrors, drawn by the scenery's flip. */
  boulders: BOULDERS,
  /** Red's rocks, in the arena and in the boulder field: blue's are their mirrors. */
  crags: CRAGS,

  stones: STONES,
  pillars: PILLARS,
  domes: [DOME, [DOME[0], ZED - DOME[1]]],
  pads: [PAD, [PAD[0], ZED - PAD[1], PAD[2]]],
  shuttles: [SHUTTLE, mirror(SHUTTLE)],
  modules: [...MODULES, ...MODULES.map(mirror)],
  tubes: [...TUBES, ...TUBES.map(mirror)],
  masts: [...MASTS, ...MASTS.map(([x, z]) => [x, ZED - z])],
};

/** The twin of a brush, a point or a spawn across the centre line. */
const flip = (b: Brush): Brush => ({
  ...b,
  min: [b.min[0], b.min[1], ZED - b.max[2]],
  max: [b.max[0], b.max[1], ZED - b.min[2]],
  tint: b.tint === RED ? BLUE : b.tint,
});
const flipPoint = ([x, y, z]: Vec3): Vec3 => [x, y, ZED - z];
/** The list and its twins, then the pieces by the rille. */
const both = (l: Vec3[], ...mid: Vec3[]) => [...l, ...l.map(flipPoint), ...mid];

/** Red's half: z from 140 to 280. */
const half: Brush[] = [
  // The crater floor, regolith, from the rille to the rim: ghosts, the scenery draws the relief
  // over them and the rille's rock.
  ...[
    // The slab from 12 m behind the lip, in four round the hollow's square, and its floor 3 m down.
    box(0, -30, 160, 160, 0, HOLLOW[1] - 12, STONE),
    box(0, -30, HOLLOW[1] - 12, HOLLOW[0] - 12, 0, HOLLOW[1] + 12, STONE),
    box(HOLLOW[0] + 12, -30, HOLLOW[1] - 12, 160, 0, HOLLOW[1] + 12, STONE),
    box(0, -30, HOLLOW[1] + 12, 160, 0, 280, STONE),
    box(HOLLOW[0] - 12, -30, HOLLOW[1] - 12, HOLLOW[0] + 12, -3, HOLLOW[1] + 12, STONE),
    // The lip's own pieces: at each end a spur for each run, between them a strip half a metre
    // deep for each depth of the notches, wherever the lip is no deeper, and what is behind them all.
    ...RUNS.filter(r => r[2] < 0).map(([x, w, n]) => box(x, -30, 148 + n, x + w, 0, 160, STONE)),
    ...Array.from({ length: 14 }, (_, k) =>
      runs(LIP.map(n => (n < 0 ? 2 : n > k / 2 ? 1 : 0)))
        .filter(r => !r[2])
        .map(([x, w]) => box(x, -30, 148 + k / 2, x + w, 0, k < 13 ? 148.5 + k / 2 : 160, STONE)),
    ).flat(),
    // A sill under each mound's lip, half a metre thick and as high as the ground behind it: a body
    // flying in under the crest meets rock. Past it the ground would lift it for free.
    ...MOUNDS.flatMap(x =>
      [-12, -10, -8, -6, -4, 4, 6, 8, 10]
        .map(a => [a, a + (a === -4 ? 8 : 2)])
        .map(([a, b]) => [
          x + a,
          x + b,
          MOUND * Math.min(across(x, x + a), across(x, x + b)) * (1 - 0.5 / RISE) - 0.12,
        ])
        .filter(r => r[2] > 0.3)
        .map(([a, b, y]) => box(a, 0, 148, b, y, 148.5, STONE)),
    ),
  ].map(b => ({ ...b, ghost: true })),
  // The base: the dome's ghosts, the modules, the tubes and their stairs.
  ...BASE,
  // The flag's dais in the hall: a red step of 0.5 m and a dais at 1 m, ghosts as all in the hall,
  // drawn by client/moonbase.ts (daises()), the zone's square of 8.4 m on top.
  { ...box(75.25, 0, FLAG - 4.75, 84.75, 0.5, FLAG + 4.75, PAINT, CONCRETE, RED), ghost: true },
  { ...box(75.75, 0.5, FLAG - 4.25, 84.25, 1, FLAG + 4.25, PAINT, CONCRETE, RED), ghost: true },
  // The armoury, a red plinth behind the dome: the racks stand on it.
  box(60, 0, 259, 70, 1.5, 265, STEEL, PAINT, RED),
  // The landing pad, a shuttle on it (cover), and masts at the pad's corners and by the tubes.
  box(27, 0, 207, 53, 0.25, 233, METAL),
  { ...fromBx(SHUTTLE, PAINT), tint: [0.82, 0.84, 0.88] },
  // Its wings (y 1 to 1.2, 3.5 m out from the hull's sides) and its tail fin over the hull, as drawn by the scenery.
  { ...box(42, 1, 222, 45.8, 1.25, 225.5, METAL), ghost: true },
  { ...box(42, 1, 214.5, 45.8, 1.25, 218, METAL), ghost: true },
  { ...box(43, 3.25, 219.9, 46.8, 5.4, 220.1, PAINT), ghost: true },
  ...MASTS.map(([x, z]) =>
    box(x - 0.2, x < 60 ? 0.25 : 0, z - 0.2, x + 0.2, x < 60 ? 10.25 : 10, z + 0.2, STEEL),
  ),
  // The west long jump: a spur of the lip into the rille, orange.
  box(12, -30, 148 - (16 - WEST_GAP) / 2, 24, 0, 148, PAINT, STONE, [1, 0.42, 0.08]),
  // The field's stones, the boulders along the walls and, out on the relief, the boulder field:
  // each two or three boxes, drawn as one rock by the scenery.
  ...ghosts(CRAGS.arena),
  ...ghosts(CRAGS.field),
  ...DISHES.map(([x, z]) => lump(x, z, 0.4, 6)),
];

/** What stands on the centre line, symmetric as written: the bridge, the stones, the rille's plugs and the wreck. */
const centre: Brush[] = [
  // The bridge: a deck level with the floor and a low wall on each side.
  box(74, -1.5, 132, 86, 0, 148, METAL, STEEL),
  box(74, 0, 132, 74.4, 1.1, 148, CONCRETE),
  box(85.6, 0, 132, 86, 1.1, 148, CONCRETE),
  // The east stones, 1.2 m, 2.4 m, 1.2 m high: ghosts, the scenery draws a rock pillar round each.
  ...PILLARS.map(([x0, z0, x1, z1, y]) => ({ ...box(x0, -30, z0, x1, y, z1, STONE), ghost: true })),
  // The rille ends in the relief: a ghost plug under the ground at each end keeps a player in it.
  { ...box(-10, -30, 132, 0, 0, 148, STONE), ghost: true },
  { ...box(160, -30, 132, 170, 0, 148, STONE), ghost: true },
  // The wrecked lander's hull, wide enough to take in its beacon's mast (3.4 m west, 2.6 m south).
  lump(WRECK[0], WRECK[1], 3.6, 3.5),
  // The orange lamps each side of a ramp's lip.
  ...LAYOUT.ramps.flatMap(([x, z, ax, az]) =>
    [-8, 8].map(c => lump(x + c * az, z - c * ax, 0.2, 2.2)),
  ),
];

/** Red's spawns behind the dome facing blue (yaw 0 looks toward -z): five in a row, three in front. */
const SPAWNS: Spawn[] = [
  ...[56, 68, 80, 92, 104].map((x): Spawn => [x, 0, 271, 0]),
  ...[62, 80, 98].map((x): Spawn => [x, 0, 267, 0]),
];
/** The racks on the plinth, 2.5 m apart: rifle, rail, gun, katana. */
const racks = (z: number) =>
  Object.fromEntries(
    ['rifle', 'rail', 'rack', 'blade'].map((k, i) => [k, [61.25 + 2.5 * i, 1.5, z] as Vec3]),
  );
const team = (z: number, s: Spawn[]) => ({
  base: [80, 1, z] as Vec3,
  spawns: s,
  ...racks(z + (z > 140 ? 28 : -28)),
});

export const MOON: WorldDef = {
  name: 'Tranquility',
  brushes: [...half, ...half.map(flip), ...centre],
  teams: [
    team(FLAG, SPAWNS),
    team(
      ZED - FLAG,
      SPAWNS.map(([x, y, z]): Spawn => [x, y, ZED - z, Math.PI]),
    ),
  ],
  // Health 4 (one in the dome), ammo 3 and rail cells 2 in a half, and by the rille two of each pack and one cell.
  packs: both(
    [
      [90, 0, 210],
      [118, 5, 226],
      [30, 0, 185],
      // In the dome, on the mezzanine's north balcony.
      [80, 3.5, 253.5],
    ],
    [45, 0, 162],
    [45, 0, 118],
  ),
  ammo: both(
    [
      [50, 0, 246],
      [103, 5, 200],
      [135, 0, 190],
    ],
    [115, 0, 162],
    [115, 0, 118],
  ),
  cells: both(
    [
      [106.5, 3.5, 226],
      [35, 0, 244],
    ],
    [80, 0, 140],
  ),
  floor: -20,
  // The crater floor, out to an ellipse of 600 by 720 m nobody crosses: none in the rille and the notches of its lips.
  relief: {
    hole: [0, 132, 160, 148],
    pits: RUNS.flatMap(([x, w, n]): [number, number, number, number][] =>
      n > 0
        ? [
            [x, 148, x + w, 148 + n],
            [x, 132 - n, x + w, 132],
          ]
        : [],
    ),
    bound: [80, ZED / 2, 300, 360],
    cell: 4,
    at,
  },
  // Low from the east, white and hard; a near black sky.
  sun: { dir: [0.87996, 0.40998, 0.23999], color: [3, 2.95, 2.85] },
  sky: [
    [0.002, 0.002, 0.006],
    [0.02, 0.02, 0.035],
  ],
  gravity: 0.5,
  // Two rovers a base, by the field and behind the landing pad, their noses toward the other base.
  rovers: [
    [100, 0, 178, 0],
    [30, 0, 255, 0],
    [100, 0, ZED - 178, Math.PI],
    [30, 0, ZED - 255, Math.PI],
  ],
  scenery: 'moon',
  helmets: true,
  armor: true,
};
