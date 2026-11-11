// Tranquility, the moon level (docs/MOON.md): a capture the flag in a crater, half gravity.
// Red's half (z 140 to 280) is written and flipped across z = 140; the rille, which stands on the
// line, is written once, symmetric by hand. The crater floor is a relief, at(), out to an ellipse
// of 600 by 720 m: in the arena (x 0..160, z 0..280) it lies on the floor's slabs, never under
// them, flat where a base, a pack or a route's jump needs it; only the rille and the notches of
// its lips have none. Compact on purpose: the local bundle carries it (budget in scripts/size.mjs).
import { PLAYER_H, PLAYER_R, STEP_H } from './constants';
import { TEAM_TINT } from './map';
import { BASE, DOME, DOORS, MODULES, TUBES, box, bx } from './moonbase';
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

/** The domes' centres, the landing pads (x, z, radius), the modules, the tubes and the masts (centres), red's then blue's: what the scenery draws on. */
const PAD = [40, 220, 13];
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
/**
 * Craters, x, z, radius and how deep as a share of the radius: a bowl under a rim, both wandering
 * with the bearing (the rim is 0.03 to 0.075 of the radius high and up to 10 % nearer or further),
 * flat for 4 m. With a fifth number, a pit's crater: a level terrace out to that share of the
 * radius (22 m and more), then one wall up to the rim; the pit is cut in the terrace (PITS). The
 * first is the Bowl; the small ones by a big one's rim are its secondaries.
 */
const BOWLS = [
  [-100, 0, 46, 0.13, 0.52],
  [-4, 224, 36, 0.12, 0.67],
  [110, 236, 16],
  [-112, 108, 14],
  [236, 170, 13],
  [-52, 230, 10],
  [80, 184, 14],
  [150, 250, 13],
  [-36, 168, 10],
  [200, 152, 12],
  [262, 134, 14],
  [240, 150, 9],
  [-140, 60, 12],
  [-66, 60, 9],
  [40, 262, 10],
  [118, 200, 11],
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
const WRECK = [BOWLS[0][0] - 4.5, ZED / 2];
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

/** What the craters dig and raise at (x, z from the centre line), and how far in a pit's crater it is (1 on its terrace, 0 well clear): the hills fade out there. */
const bowls = (x: number, z: number) => {
  let [h, m] = [0, 0];
  for (const [cx, cz, r, k = 0.17, flat = 0] of BOWLS) {
    const d = far(x - cx, z - cz);
    // The bearing, as a point on a circle: the noises of the rim's radius and height turn with it.
    const [ux, uz] = d ? [(x - cx) / d, (z - cz) / d] : [1, 0];
    const q = (d / r) * (0.9 + 0.2 * noise(2.5 * ux + 0.37 * cx, 2.5 * uz + 0.21 * cz, 9));
    const rim = 0.03 + 0.045 * noise(4 * ux - 0.1 * cz, 4 * uz + 0.1 * cx, 10);
    // The rim is flat for 4 m: a rover's belly clears it.
    const s = 1 - c1((q - 1 - 4 / r) / 0.6);
    const wall = flat ? (k + rim) * c1((q - flat) / (1 - flat)) - k : (k + rim) * q * q - k;
    h += r * (q < 1 ? wall : rim * s * s);
    // A pit's crater has no hills on its terrace (the pit's brushes stand level with it) and few round it.
    m = Math.max(m, flat ? c1((1.6 - q) / (1.5 - flat)) : 0);
  }
  return [h, m];
};

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
  const dug = bowls(x, z);
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
  h = (out < 0 ? h : h * (1 - dug[1])) + dug[0];
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
/** How high a rock's middle is over the ground: three tenths of its height, and 0.6 m or half its height if less. Its widest is there, its flank steep down to the ground: a body is stopped at its foot. */
export const rockMid = (H: number) => Math.max(0.3 * H, Math.min(0.5 * H, 0.8));
/**
 * The form of a boulder of radius R and height H from a seed: how far it reaches from its middle
 * (rockMid() over the ground) along a unit vector. A rounded solid, no plane in it:
 * an ellipsoid stretched unevenly on its three axes and turned by the seed, upright under its
 * middle (it stands in the regolith, as wide at the ground as at its middle) and a dome over it, swollen and shrunk by two low octaves
 * of noise with the bearing (large soft lobes), with one gentle hollow and one flatter side. Only
 * + - * /, Math.sqrt and the hash: the boxes below come from it on every side.
 */
export const rockOf = (s: number, R: number, H: number) => {
  const h = (k: number) => hash(s, k, 131);
  const flat = (k: number) => {
    const [a, b] = [2 * h(k) - 1, 2 * h(k + 1) - 1];
    const l = Math.sqrt(a * a + b * b) || 1;
    return [a / l, b / l];
  };
  const [cx, sx] = flat(1);
  const [a, b] = [R * (0.9 + 0.25 * h(3)), R * (0.68 + 0.22 * h(4))];
  const lean = 0.3 * h(9) - 0.15;
  const [hx, hz] = flat(5);
  const [fx, fz] = flat(7);
  const swell = (u: V3) => {
    const n =
      0.8 +
      0.28 * noise(1.1 * u[0] + s, 1.1 * u[2] + 0.9 * u[1], s) +
      0.1 * noise(2.3 * u[0] - s, 2.3 * u[2] + 1.7 * u[1], s + 1);
    const hollow = c1((0.8 * (u[0] * hx + u[2] * hz) + 0.6 * u[1] - 0.55) / 0.45);
    const side = c1((0.954 * (u[0] * fx + u[2] * fz) + 0.3 * u[1] - 0.4) / 0.6);
    return n * (1 - 0.14 * hollow * hollow) * (1 - 0.16 * side * side);
  };
  const cu = (H - rockMid(H)) / swell([0, 1, 0]);
  const deep = rockMid(H) + 0.7 * H;
  const reach = (u: V3): number => {
    if (u[1] < 0) {
      // Under its middle it goes straight down, as wide as at its middle on that bearing, to a flat bottom under the ground.
      const l = Math.sqrt(u[0] * u[0] + u[2] * u[2]);
      return l < 1e-6 ? deep : Math.min(reach([u[0] / l, 0, u[2] / l]) / l, deep / -u[1]);
    }
    // Over it, it leans a little one way.
    const x = (u[0] * cx + u[2] * sx - lean * u[1]) / a;
    const z = (u[2] * cx - u[0] * sx - (0.15 - lean) * u[1]) / b;
    const q = (u[1] * u[1]) / (cu * cu);
    // Two parts of an ellipse and one of a squarer solid: (A + 0.65 q) T + 0.35 (q T)^2 = 1, T the square of the reach.
    const [D, E] = [x * x + z * z + 0.65 * q, 0.35 * q * q];
    const T = E < 1e-12 ? 1 / D : (Math.sqrt(D * D + 4 * E) - D) / (2 * E);
    return Math.sqrt(T) * swell(u);
  };
  return { reach };
};

/**
 * The boxes a boulder collides with, x0, y0, z0, x1, y1, z1 round its middle: what stops a body is
 * where the rock is drawn. From `lo` (the ground round it) to its top it is cut in layers: up to
 * `band` (a body's height over the ground) a layer ends where the rock has moved in or out by
 * FIT[0] on a bearing, or at 0.9 m; over it by FIT[1], or at 1.5 m; none thinner than 0.25 m. In
 * each a grid of points says where the rock is at the layer's foot and top (a box may stand 7 cm
 * out of it), and boxes are picked on it one after the other: the largest first, then the one
 * that brings the most of the outline within FIT[2] (FIT[3] over the band) of a box, overlapping
 * one already there, until the whole outline is. No crack between them.
 */
/** How far over the ground a rock's first layer of boxes goes: more than a body steps up, from ground a little higher. */
const WALL = STEP_H + 0.2;
const FIT = [0.16, 0.3, 0.16, 0.3];
const fitted = (
  { reach }: ReturnType<typeof rockOf>,
  R: number,
  lo: number,
  band: number,
  foot: number,
) => {
  /**
   * The rock's outline at a height: how far it goes from its axis on 8 m bearings, m to each side
   * of a square round it (no Math.cos), 7 cm out of it; then whether a point is in that outline.
   */
  const outline = (y: number, m: number) => {
    const o = new Float64Array(8 * m);
    const u: V3 = [0, 0, 0];
    for (let k = 0; k < 8 * m; k++) {
      const t = ((k % (2 * m)) + 0.5) / m - 1;
      const side = Math.floor(k / (2 * m));
      const l = Math.sqrt(1 + t * t) * (side > 1 ? -1 : 1);
      const dx = (side % 2 ? -t : 1) / l;
      const dz = (side % 2 ? 1 : t) / l;
      let p = 0;
      let q = 1.6 * R;
      for (let it = 0; it < 8; it++) {
        const r = (p + q) / 2;
        const d = Math.sqrt(r * r + y * y);
        u[0] = (r * dx) / d;
        u[1] = y / d;
        u[2] = (r * dz) / d;
        if (d <= reach(u) + 0.07) {
          p = r;
        } else {
          q = r;
        }
      }
      o[k] = p;
    }
    return o;
  };
  const within = (o: Float64Array, x: number, z: number) => {
    const m = o.length / 8;
    const wide = Math.abs(x) >= Math.abs(z);
    if (Math.abs(x) + Math.abs(z) < 1e-9) {
      return true;
    }
    const side = wide ? (x > 0 ? 0 : 2) : z > 0 ? 1 : 3;
    const t = wide ? z / x : -x / z;
    // Between the two bearings it lies between, along the square's side.
    const f = (t + 1) * m - 0.5 + side * 2 * m;
    const k = Math.floor(f);
    const r = o[(k + 8 * m) % (8 * m)] * (1 - (f - k)) + o[(k + 1) % (8 * m)] * (f - k);
    return x * x + z * z <= r * r;
  };
  const top = reach([0, 1, 0]) - 0.1;
  const c = Math.max(0.07, Math.min(0.12, R / 12));
  const out: number[][] = [];
  // The layers' heights, then the outline at each. The first goes WALL over the highest ground round the rock: a body or a
  // rover's is stopped by it and steps onto nothing. A rock no higher than that is walked over, up its layers.
  const wall = band - PLAYER_H + WALL;
  const cuts = [lo];
  for (let a = lo; a < top - 1e-9;) {
    const shift = a < band - 1e-9 ? FIT[0] : FIT[1];
    const base = outline(a + 0.03, 2);
    let b = Math.min(a === lo && wall < top - 0.3 ? wall : a + 0.25, top);
    while (
      b < top &&
      b - a < 0.9 &&
      outline(Math.min(b + 0.1, top), 2).every((r, k) => Math.abs(r - base[k]) <= shift)
    ) {
      b = Math.min(b + 0.1, top);
    }
    a = top - b < 0.15 ? top : b;
    cuts.push(a);
  }
  const lines = cuts.map((y, k) => outline(k ? y : y + 0.03, 8));
  for (let l = 0; l + 1 < cuts.length; l++) {
    const [a, b] = [cuts[l], cuts[l + 1]];
    const near = a < band - 1e-9 ? FIT[2] : FIT[3];
    // The grid: as wide as the rock is in this layer.
    const n = Math.ceil(Math.min(Math.max(...lines[l]), Math.max(...lines[l + 1])) / c) + 1;
    const N = 2 * n + 1;
    const inl = new Uint8Array(N * N);
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const [x, z] = [(i - n) * c, (j - n) * c];
        inl[i + j * N] = within(lines[l], x, z) && within(lines[l + 1], x, z) ? 1 : 0;
      }
    }
    const NEAR = Math.max(1, Math.round(near / c));
    const on = (i: number, j: number) => i >= 0 && i < N && j >= 0 && j < N && inl[i + j * N] > 0;
    // The outline: points in the rock with a neighbour out of it. `left` counts those no box is near yet, summed from the corner.
    const edge = new Uint8Array(N * N);
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        edge[i + j * N] =
          on(i, j) && !(on(i - 1, j) && on(i + 1, j) && on(i, j - 1) && on(i, j + 1)) ? 1 : 0;
      }
    }
    // Every box on the grid that is in the rock and no wider box holds: between two columns, each run of points in all of them.
    const rects: number[][] = [];
    const all = new Uint8Array(N);
    // Between every other column on a wide grid.
    const hop = N > 48 ? 2 : 1;
    for (let i0 = 0; i0 < N; i0 += hop) {
      all.fill(1);
      for (let i1 = i0; i1 < N; i1++) {
        let any = false;
        for (let j = 0, from = 0; j <= N; j++) {
          all[j] = j < N && all[j] && inl[i1 + j * N] ? 1 : 0;
          if (!all[j]) {
            if (j - 1 - from >= 2 && i1 - i0 >= 2 && (i1 - i0) % hop === 0) {
              rects.push([i0, from, i1, j - 1]);
            }
            any ||= j - 1 > from;
            from = j + 1;
          }
        }
        if (!any) {
          break;
        }
      }
    }
    const sum = new Int32Array((N + 1) * (N + 1));
    const count = (i0: number, j0: number, i1: number, j1: number) => {
      const [a0, b0, a1, b1] = [
        Math.max(i0, 0),
        Math.max(j0, 0),
        Math.min(i1, N - 1) + 1,
        Math.min(j1, N - 1) + 1,
      ];
      return (
        sum[a1 + b1 * (N + 1)] -
        sum[a0 + b1 * (N + 1)] -
        sum[a1 + b0 * (N + 1)] +
        sum[a0 + b0 * (N + 1)]
      );
    };
    const picked: number[][] = [];
    for (let k = 0; k < 40 && rects.length; k++) {
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          sum[i + 1 + (j + 1) * (N + 1)] =
            edge[i + j * N] +
            sum[i + (j + 1) * (N + 1)] +
            sum[i + 1 + j * (N + 1)] -
            sum[i + j * (N + 1)];
        }
      }
      let [best, score] = [-1, 0];
      for (let m = 0; m < rects.length; m++) {
        const q = rects[m];
        if (k && !picked.some(p => q[0] < p[2] && p[0] < q[2] && q[1] < p[3] && p[1] < q[3])) {
          continue;
        }
        const area = (q[2] - q[0]) * (q[3] - q[1]);
        const gain = k ? count(q[0] - NEAR, q[1] - NEAR, q[2] + NEAR, q[3] + NEAR) : 2;
        const v = k ? gain * 1e6 + area : area;
        if (gain >= 2 && v > score) {
          [best, score] = [m, v];
        }
      }
      if (best < 0) {
        break;
      }
      const [i0, j0, i1, j1] = rects[best];
      picked.push(rects[best]);
      for (let i = Math.max(i0 - NEAR, 0); i <= Math.min(i1 + NEAR, N - 1); i++) {
        for (let j = Math.max(j0 - NEAR, 0); j <= Math.min(j1 + NEAR, N - 1); j++) {
          edge[i + j * N] = 0;
        }
      }
      out.push([(i0 - n) * c, l ? a : foot, (j0 - n) * c, (i1 - n) * c, b, (j1 - n) * c]);
    }
  }
  return out;
};

/** The ground as it is walked on: at()'s 4 m lattice, each square two triangles, as ground() in relief.ts reads it. */
const walked = (x: number, z: number) => {
  const [i, j] = [Math.floor(x / 4), Math.floor(z / 4)];
  const [fu, fv] = [x / 4 - i, z / 4 - j];
  const h = (u: number, v: number) => at(4 * (i + u), 4 * (j + v));
  const [a, d] = [h(0, 0), h(1, 1)];
  return fu >= fv
    ? a + (h(1, 0) - a) * fu + (d - h(1, 0)) * fv
    : a + (h(0, 1) - a) * fv + (d - h(0, 1)) * fu;
};
/** A rock of the map: where its middle is over the ground (x, the ground's height, z), its radius, height and seed, and the boxes it collides with (x0, y0, z0, x1, y1, z1), inside what rockOf() draws. */
const crag = (x: number, z: number, R: number, H: number, s: number) => {
  const g = walked(x, z);
  const y = g + rockMid(H);
  // The ground round it: a body meets the rock from the lowest of it to its height over the highest.
  const span = [-3, -2, -1, 0, 1, 2, 3].map(k => 0.4 * R * k);
  const round = span.map(u => span.map(v => walked(x + u, z + v)));
  // Not under the rock itself, which goes two thirds of its height under its middle's ground.
  const lo = Math.max(Math.min(...round.flat()), g - 0.55 * H);
  const band = Math.max(...round.flat()) + PLAYER_H;
  return {
    at: [x, g, z],
    R,
    H,
    s,
    parts: fitted(rockOf(s, R, H), R, lo - y, band - y, lo - 0.5 - y).map(
      ([x0, y0, z0, x1, y1, z1]) => [x + x0, y + y0, z + z0, x + x1, y + y1, z + z1],
    ),
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
  field: FIELD.map(([x, z, r], i) => crag(x, z, r, 0.75 * r, i + 100)),
};
const ghosts = (l: { parts: number[][] }[]): Brush[] =>
  l
    .flatMap(c => c.parts)
    .map(([x0, y0, z0, x1, y1, z1]) => ({ ...box(x0, y0, z0, x1, y1, z1, STONE), ghost: true }));

/** A pit: PIT_R in radius, cut in a square of half side PIT_S of its crater's terrace, its floor at PIT_FLOOR, 7 m over the kill floor; a flight of PIT_STEPS steps up its east wall. */
export const [PIT_R, PIT_S, PIT_FLOOR, PIT_STEPS] = [9, 12, -19, 7];
/**
 * The pits of red's side and of the centre line (the Bowl's): the middle, the terrace's level and
 * the rows, a metre of z each: z0, z1 and how far the void goes west and east of the middle. A
 * circle that wanders by 12 % with z, the same north and south of the middle, rounded up to half
 * a metre: the void is never narrower than the outline the scenery draws.
 */
const PITS = BOWLS.filter(b => b[4]).map(([x, zf], n) => {
  const z = ZED / 2 + zf;
  const rows = Array.from({ length: 2 * PIT_R }, (_, i) => {
    const dz = Math.abs(i + 0.5 - PIT_R);
    const half = Math.sqrt(PIT_R * PIT_R - dz * dz);
    const w = (side: number) =>
      Math.ceil(2 * half * (0.88 + 0.24 * noise(dz / 4, side + 0.5, 60 + n))) / 2;
    return [z - PIT_R + i, z - PIT_R + i + 1, w(0), w(1)];
  });
  return { x, z, level: at(x, z), rows };
});
/** What a pit collides with: its square of terrace in pieces round the void (two caps and, for each run of rows of one width, a box each side), its floor, and the steps: each as high again as a body jumps at half gravity, 1.3 m deep, up to the terrace at the east wall. */
const pit = ({ x, z, level, rows }: (typeof PITS)[0]): Brush[] => {
  const runs = rows.reduce<number[][]>((l, [z0, z1, a, b]) => {
    const last = l.at(-1);
    if (last && last[2] === a && last[3] === b) {
      last[1] = z1;
    } else {
      l.push([z0, z1, a, b]);
    }
    return l;
  }, []);
  const east = rows[PIT_R][3];
  const rise = (level - PIT_FLOOR) / PIT_STEPS;
  return [
    box(x - PIT_S, -30, z - PIT_S, x + PIT_S, level, z - PIT_R, STONE),
    box(x - PIT_S, -30, z + PIT_R, x + PIT_S, level, z + PIT_S, STONE),
    ...runs.flatMap(([z0, z1, a, b]) => [
      box(x - PIT_S, -30, z0, x - a, level, z1, STONE),
      box(x + b, -30, z0, x + PIT_S, level, z1, STONE),
    ]),
    box(x - PIT_R - 1.5, -30, z - PIT_R, x + PIT_R + 1.5, PIT_FLOOR, z + PIT_R, STONE),
    ...Array.from({ length: PIT_STEPS - 1 }, (_, k) =>
      box(
        x + east - 1.3 * (PIT_STEPS - 1 - k),
        PIT_FLOOR,
        z - 1,
        x + east - 1.3 * (PIT_STEPS - 2 - k),
        PIT_FLOOR + rise * (k + 1),
        z + 1,
        STONE,
      ),
    ),
  ].map(b => ({ ...b, ghost: true }));
};

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
  /** The pits, both sides: the middle, the terrace's level and the rows (z0, z1, the void's reach west and east). */
  pits: PITS.flatMap(p =>
    p.z === ZED / 2
      ? [p]
      : [
          p,
          {
            ...p,
            z: ZED - p.z,
            rows: p.rows.map(([z0, z1, a, b]) => [ZED - z1, ZED - z0, a, b]).reverse(),
          },
        ],
  ),
  /** Red's boulders along its walls and the field's stones; blue's are their mirrors, drawn by the scenery's flip. */
  /** The craters of the relief, both sides: x, z, radius, depth as a share of it. */
  bowls: BOWLS.flatMap(([x, z, r, k = 0.17]) =>
    (z ? [1, -1] : [1]).map(m => [x, ZED / 2 + m * z, r, k]),
  ),
  boulders: BOULDERS,
  /** Red's rocks, in the arena and in the boulder field: blue's are their mirrors. */
  crags: CRAGS,

  stones: STONES,
  pillars: PILLARS,
  domes: [DOME, [DOME[0], ZED - DOME[1]]],
  pads: [PAD, [PAD[0], ZED - PAD[1], PAD[2]]],
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
  // The landing pad, its spaceship's (ship.ts: a solid body, not a brush), and masts at the pad's corners and by the tubes.
  box(27, 0, 207, 53, 0.25, 233, METAL),
  ...MASTS.map(([x, z]) =>
    box(x - 0.2, x < 60 ? 0.25 : 0, z - 0.2, x + 0.2, x < 60 ? 10.25 : 10, z + 0.2, STEEL),
  ),
  // The west long jump: a spur of the lip into the rille, orange.
  box(12, -30, 148 - (16 - WEST_GAP) / 2, 24, 0, 148, PAINT, STONE, [1, 0.42, 0.08]),
  // The field's stones, the boulders along the walls and, out on the relief, the boulder field:
  // each two or three boxes, drawn as one rock by the scenery.
  // The pit of this side's deep crater.
  ...PITS.filter(p => p.z !== ZED / 2).flatMap(pit),
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
  {
    ...box(
      WRECK[0] - 3.6,
      -30,
      WRECK[1] - 3.6,
      WRECK[0] + 3.6,
      PIT_FLOOR + 3.5,
      WRECK[1] + 3.6,
      STONE,
    ),
    ghost: true,
  },
  // The Bowl's pit, the same north and south of the line.
  ...PITS.filter(p => p.z === ZED / 2).flatMap(pit),
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
  tag: 'Moon · half gravity',
  lore: 'A mining base left in a lunar crater, its domes still lit. Two crews fight for it in space helmets, under the Earth and a black sky. Jumps float twice as high, and a rille cuts the base in two.',
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
  // Under the pits' floors (PIT_FLOOR) and over the rille's bottom.
  floor: -26,
  // The crater floor, out to an ellipse of 600 by 720 m nobody crosses: none in the rille and the notches of its lips.
  relief: {
    hole: [0, 132, 160, 148],
    pits: [
      ...RUNS.flatMap(([x, w, n]): [number, number, number, number][] =>
        n > 0
          ? [
              [x, 148, x + w, 148 + n],
              [x, 132 - n, x + w, 132],
            ]
          : [],
      ),
      // The pits' voids, a row at a time.
      ...LAYOUT.pits.flatMap(({ x, rows }) =>
        rows.map(([z0, z1, a, b]): [number, number, number, number] => [x - a, z0, x + b, z1]),
      ),
    ],
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
  // A combat ship on each landing pad, its nose toward the other base.
  ships: [
    [PAD[0], 0.25, PAD[1], 0],
    [PAD[0], 0.25, ZED - PAD[1], Math.PI],
  ],
  // The dome's door and the two airlocks of each base.
  doors: [...DOORS, ...DOORS.map(mirror)],
  scenery: 'moon',
  helmets: true,
  armor: true,
};
