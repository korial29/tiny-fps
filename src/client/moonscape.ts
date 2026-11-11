// What is drawn around and over the moon level (docs/MOON.md), once, from fixed numbers and a
// hash: red's half (the dome and its windows, the tubes, the pad and its shuttle, masts, boulders) mirrored for blue, then the relief round the arena out over the crater wall, what
// stands on it, the stars and the Earth. Nothing here is collided with: shared/moon.ts has a ghost box
// under each piece a player can reach. Every part is lit paint
// (layer -1) or glow (layer -2: windows, lamps, stars, the Earth), but the relief and the small
// craters on the floor, in the floor's own stone, and the boulders, in basalt (TEX.ROCK).
import { LAYOUT, LIP, PIT_FLOOR, PIT_R, PIT_S, PIT_STEPS, rockMid, rockOf } from '../shared/moon';
import { TAU } from '../shared/physics';
import { ground, raise } from '../shared/relief';
import { TEX } from '../shared/types';
import type { World, WorldDef } from '../shared/world';
import { GLOW, glow, ring } from './flag';
import { STRIDE, dot, dress, mix, place, smooth, sub, unit } from './mesh';
import type { Vec3 } from './mesh';
import { UP, cross, face, lit, moonbase } from './moonbase';
import { hull } from './moonhull';
import { hash } from './textures';

/** The arena is x 0..W, z 0..Z, its middle C. */
const [W, Z] = [160, 280];
const C: Vec3 = [80, 0, 140];
/**
 * Radius of the star dome and the Earth's distance, metres: past the crater wall (drawn to 1.65
 * of the bound) and, at most 360 m more from a spot on the bound, inside the far clip (FAR).
 */
export const SKY = 800;
/** The relief is drawn to this share of the bound, where the wall's far side is down on the plain: it hides the rest. */
const OUT = 1.65;
/** Toward the Earth. */
const EARTH = unit([0.3, 0.62, -0.75]);

const sm = (t: number) => {
  t = Math.min(Math.max(t, 0), 1);
  return t * t * (3 - 2 * t);
};
/** Smooth value noise on a lattice, and three octaves of it (in 0..1). */
const noise = (x: number, y: number, s: number) => {
  const [i, j] = [Math.floor(x), Math.floor(y)];
  const [u, v] = [x - i, y - j].map(t => t * t * (3 - 2 * t));
  const h = (a: number, b: number) => hash(i + a, j + b, s);
  return (h(0, 0) * (1 - u) + h(1, 0) * u) * (1 - v) + (h(0, 1) * (1 - u) + h(1, 1) * u) * v;
};
const fbm = (x: number, y: number, s: number) =>
  noise(x, y, s) * 0.55 + noise(x * 2, y * 2, s + 1) * 0.3 + noise(x * 4, y * 4, s + 2) * 0.15;

/** Blue's half from red's: z becomes Z - z, the normals follow, the triangles keep their front. */
const mirror = (v: number[]) => {
  const o: number[] = [];
  for (let t = 0; t < v.length; t += 3 * STRIDE) {
    for (const k of [0, 2, 1]) {
      const i = t + k * STRIDE;
      o.push(
        v[i],
        v[i + 1],
        Z - v[i + 2],
        v[i + 3],
        v[i + 4],
        -v[i + 5],
        ...v.slice(i + 6, i + 10),
      );
    }
  }
  return o;
};

const POLE = dress(
  smooth(
    [
      [1, 0],
      [1, 1],
    ],
    6,
  ),
  [0.5, 0.52, 0.56],
);
const BLOB = dress(
  smooth(
    [
      [0, -1],
      [1, 0],
      [0, 1],
    ],
    6,
  ),
  [1, 1, 1],
);
/** The wrecked lander's hull, its length along -z. */
const SHIP = dress(
  smooth(
    [
      [0, 0],
      [0.5, 1.6],
      [0.85, 3.5],
      [1, 6],
      [1, 10],
      [0.8, 12.5],
      [0.55, 14],
      [0, 14],
    ],
    12,
  ),
  [0.9, 0.9, 0.92],
);
/** An antenna's dish, a lens facing -z. */
const DISH = dress(
  smooth(
    [
      [0, 0],
      [2.2, 0.6],
      [0, 0.9],
    ],
    12,
  ),
  [0.8, 0.82, 0.86],
);
/** A convex polyhedron's faces with the part over the plane n . p = h cut off and capped. */
const clip = (faces: Vec3[][], n: Vec3, h: number) => {
  const side = (p: Vec3) => p[0] * n[0] + p[1] * n[1] + p[2] * n[2] - h;
  const cap: Vec3[] = [];
  const out = faces
    .map(f => {
      const kept: Vec3[] = [];
      f.forEach((p, i) => {
        const q = f[(i + 1) % f.length];
        const [a, b] = [side(p), side(q)];
        if (a <= 0) {
          kept.push(p);
        }
        if (a * b < 0) {
          const t = a / (a - b);
          const x: Vec3 = [
            p[0] + (q[0] - p[0]) * t,
            p[1] + (q[1] - p[1]) * t,
            p[2] + (q[2] - p[2]) * t,
          ];
          kept.push(x);
          // Each cut edge is in two faces: its point goes in the cap once.
          if (
            !cap.some(
              c => Math.abs(c[0] - x[0]) + Math.abs(c[1] - x[1]) + Math.abs(c[2] - x[2]) < 1e-9,
            )
          ) {
            cap.push(x);
          }
        }
      });
      return kept;
    })
    .filter(f => f.length > 2);
  if (cap.length > 2) {
    // Round the cut's middle, in the plane.
    const m = cap.reduce((a, p) => a.map((v, k) => v + p[k] / cap.length) as Vec3, [
      0, 0, 0,
    ] as Vec3);
    const u = unit(cross(n, Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
    const w = cross(n, u);
    const ang = (p: Vec3) => {
      const d = [p[0] - m[0], p[1] - m[1], p[2] - m[2]];
      return Math.atan2(
        d[0] * w[0] + d[1] * w[1] + d[2] * w[2],
        d[0] * u[0] + d[1] * u[1] + d[2] * u[2],
      );
    };
    out.push(cap.sort((p, q) => ang(p) - ang(q)));
  }
  return out;
};
/** A cube of half side 1.2, the block a rock is cut from. */
const BLOCK: Vec3[][] = [0, 1, 2].flatMap(k =>
  [-1, 1].map(sg =>
    [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].map(([a, b]) => {
      const p = [0, 0, 0];
      p[k] = 1.2 * sg;
      p[(k + 1) % 3] = 1.2 * a;
      p[(k + 2) % 3] = 1.2 * b;
      return p as Vec3;
    }),
  ),
);

/**
 * A boulder about `at`, radii (x, y, z), seed s: a block cut by a flat bed 0.35 of the height
 * under `at`, a top and three rings of planes at hashed bearings, tilts and distances, so flat facets
 * meet at sharp edges (with `fine`, three rings more: the rocks a player gets near); stretched along a hashed bearing; in basalt (TEX.ROCK) laid flat on each
 * facet, `shade` its light, each facet a hash lighter or darker and the ones facing down darker.
 */
const rock = (
  o: number[],
  at: Vec3,
  [rx, ry, rz]: number[],
  s: number,
  shade: number,
  fine = true,
) => {
  const h = (i: number, k: number) => hash(i, k, s);
  let f = clip(BLOCK, [0, -1, 0], 0.35);
  const tilt = (y: number, t: number, d: number) => {
    const c = Math.sqrt(1 - y * y);
    f = clip(f, [c * Math.cos(t), y, c * Math.sin(t)], d);
  };
  tilt(0.92 + 0.08 * h(0, 1), TAU * h(0, 2), 0.72 + 0.15 * h(0, 3));
  // Three rings, low (leaning out over the bed), middle and high, each a turn of its own.
  for (const [n, y0, dy, d0, dd, t0] of [
    [7, -0.4, 0.2, 0.62, 0.2, 0],
    [8, -0.05, 0.25, 0.74, 0.18, 0.3],
    [6, 0.45, 0.3, 0.6, 0.2, 0.6],
    // With `fine`, as many again between them: chips off the edges the first cuts left.
    [fine ? 14 : 0, -0.22, 0.2, 0.78, 0.1, 0.5],
    [fine ? 12 : 0, 0.24, 0.2, 0.76, 0.1, 0.15],
    [fine ? 9 : 0, 0.66, 0.2, 0.74, 0.1, 0.4],
  ]) {
    for (let i = 0; i < n; i++) {
      const k = 10 * n + i;
      tilt(y0 + dy * h(k, 1), TAU * ((i + t0 + 0.45 * h(k, 2)) / n), d0 + dd * h(k, 3));
    }
  }
  // Longer one way than the other, turned to a hashed bearing.
  const [e, b] = [0.8 + 0.4 * hash(s, 1, 9), TAU * hash(s, 2, 9)];
  const [cb, sb] = [Math.cos(b), Math.sin(b)];
  const pt = ([x, y, z]: Vec3): Vec3 => {
    const [u, w] = [x * rx * e, z * rz * (2 - e)];
    return [at[0] + u * cb - w * sb, at[1] + y * ry, at[2] + u * sb + w * cb];
  };
  f.forEach((g, i) => {
    // Without a point a cut left (almost) on the one before it: no sliver triangles.
    const p = g
      .map(pt)
      .filter(
        (q, j, l) => Math.hypot(...q.map((v, k) => v - l[(j + l.length - 1) % l.length][k])) > 1e-5,
      );
    if (p.length < 3) {
      return;
    }
    const n = unit(
      cross(
        [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]],
        [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]],
      ),
    );
    // Outward, round from the rock's middle.
    if (n[0] * (p[0][0] - at[0]) + n[1] * (p[0][1] - at[1]) + n[2] * (p[0][2] - at[2]) < 0) {
      p.reverse();
      n.forEach((v, k) => (n[k] = -v));
    }
    // The basalt laid flat on the facet, in metres, shifted by the seed; each facet a shade of the rock's own.
    const t = unit(cross(n, Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
    const q = cross(n, t);
    const w =
      0.85 * shade * (0.88 + 0.24 * h(i, 7)) * (0.8 + 0.2 * Math.sqrt(Math.max(n[1] + 1, 0) / 2));
    const vert = (a: Vec3) => [
      ...a,
      ...n,
      a[0] * t[0] + a[1] * t[1] + a[2] * t[2] + 7 * h(0, 5),
      a[0] * q[0] + a[1] * q[1] + a[2] * q[2] + 7 * h(0, 6),
      TEX.ROCK,
      w,
    ];
    for (let k = 1; k < p.length - 1; k++) {
      o.push(...vert(p[0]), ...vert(p[k]), ...vert(p[k + 1]));
    }
  });
};

/** One facet of basalt, flat shaded, turned out from `mid`: a hash lighter or darker than `shade`, dark at the foot (from the ground g up a third of the way to `top`), the texture laid along its main plane. */
const facet = (
  o: number[],
  q: Vec3[],
  mid: Vec3,
  g: number,
  top: number,
  s: number,
  shade: number,
) => {
  let n = cross(sub(q[1], q[0]), sub(q[2], q[0]));
  if (Math.hypot(...n) < 1e-9) {
    return;
  }
  n = unit(n);
  if (dot(n, sub(q[0], mid)) < 0) {
    q.reverse();
    n = n.map(v => -v) as Vec3;
  }
  const y = (q[0][1] + q[1][1] + q[2][1]) / 3;
  const w =
    0.85 *
    shade *
    (0.86 + 0.28 * hash(o.length, s, 7)) *
    (0.55 + 0.45 * sm((y - g) / (0.3 * (top - g)))) *
    (0.82 + 0.18 * Math.max(n[1], 0));
  for (const v of q) {
    o.push(
      ...v,
      ...n,
      ...(Math.abs(n[1]) > 0.7
        ? [v[0], v[2]]
        : Math.abs(n[0]) > Math.abs(n[2])
          ? [v[2] + 3 * s, v[1]]
          : [v[0] + 3 * s, v[1]]),
      TEX.ROCK,
      w,
    );
  }
};

/** A unit sphere as triangles of one size and shape: an icosahedron with each edge cut in f (20 * f * f triangles). No pole, no sliver. */
const ico = (f: number): Vec3[][] => {
  const g = (1 + Math.sqrt(5)) / 2;
  const v = [
    [-1, g, 0],
    [1, g, 0],
    [-1, -g, 0],
    [1, -g, 0],
    [0, -1, g],
    [0, 1, g],
    [0, -1, -g],
    [0, 1, -g],
    [g, 0, -1],
    [g, 0, 1],
    [-g, 0, -1],
    [-g, 0, 1],
  ].map(p => unit(p as Vec3));
  const t = [
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
  ].map(q => q.map(k => v[k]));
  return t.flatMap(([a, b, c]) => {
    const at = (i: number, j: number) =>
      unit(a.map((p, k) => p + ((b[k] - p) * i + (c[k] - p) * j) / f) as Vec3);
    const out: Vec3[][] = [];
    for (let i = 0; i < f; i++) {
      for (let j = 0; i + j < f; j++) {
        out.push([at(i, j), at(i + 1, j), at(i, j + 1)]);
        if (i + j < f - 1) {
          out.push([at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)]);
        }
      }
    }
    return out;
  });
};
/** The spheres by how fine: 20, 80, 180, 320 and 720 triangles. */
const ICO = [1, 2, 3, 4, 6].map(ico);

/**
 * A rounded stone, smooth: the sphere ICO[lod - 1] thrown onto a form from its middle (`pt` gives
 * the point for a unit vector), each point's normal the mean of the faces round it, so it shades
 * as one rounded mass with no facet. One tone a stone, darker at the foot (from `g` up a third of
 * the way to `top`); what is wholly under the ground (`floor`, if given) is not drawn.
 */
const stone = (
  o: number[],
  lod: number,
  pt: (u: Vec3) => Vec3,
  g: number,
  top: number,
  s: number,
  shade: number,
  floor?: (x: number, z: number) => number,
) => {
  const key = (u: Vec3) => u.map(c => Math.round(c * 1e4)).join();
  const at = new Map<string, { p: Vec3; n: Vec3; low: boolean }>();
  const tris = ICO[lod - 1].map(t =>
    t.map(u => {
      const k = key(u);
      let v = at.get(k);
      if (!v) {
        const p = pt(u);
        v = { p, n: [0, 0, 0], low: floor ? p[1] < floor(p[0], p[2]) - 0.05 : false };
        at.set(k, v);
      }
      return v;
    }),
  );
  for (const t of tris) {
    // Not normalised: a larger face weighs more.
    const n = cross(sub(t[1].p, t[0].p), sub(t[2].p, t[0].p));
    t.forEach(v => (v.n = [v.n[0] + n[0], v.n[1] + n[1], v.n[2] + n[2]]));
  }
  for (const t of tris) {
    if (t.every(v => v.low)) {
      continue;
    }
    const f = cross(sub(t[1].p, t[0].p), sub(t[2].p, t[0].p));
    // The texture along the face's main plane.
    const flat = Math.abs(f[1]) > Math.max(Math.abs(f[0]), Math.abs(f[2]));
    const side = Math.abs(f[0]) > Math.abs(f[2]);
    for (const { p, n } of t) {
      const m: Vec3 = Math.hypot(...n) > 1e-12 ? unit(n) : [0, 1, 0];
      o.push(
        ...p,
        ...m,
        ...(flat ? [p[0], p[2]] : side ? [p[2] + 3 * s, p[1]] : [p[0] + 3 * s, p[1]]),
        TEX.ROCK,
        0.85 * shade * (0.55 + 0.45 * sm((p[1] - g) / (0.3 * (top - g)))),
      );
    }
  }
};

/**
 * A boulder round a box shared/moon.ts collides with, or a loose stone (x0, y0, z0, x1, y1, z1 of
 * its first box, low on the ground g): a rounded solid from the box's middle, a third of the way
 * up, squarer from lod 2 (a pillar, a step: feet land on its top, which is the box's, never
 * higher) and round at lod 1 (a pebble), swollen and shrunk by a low noise on its sides only.
 * 720 triangles at lod 3, 180 at lod 2, 80 for a pebble of 1.4 m and more and 20 under, smooth.
 */
const boulder = (
  o: number[],
  parts: number[][],
  g: number,
  s: number,
  lod: number,
  shade: number,
) => {
  const [x0, y0, z0, x1, y1, z1] = parts[0];
  const mid: Vec3 = [(x0 + x1) / 2, g + 0.3 * (y1 - g), (z0 + z1) / 2];
  // A pebble is an ellipsoid in its box; a pillar goes 8 % past its box's sides, its corners inside.
  const [a, c] = [(lod > 1 ? 0.54 : 0.5) * (x1 - x0), (lod > 1 ? 0.54 : 0.5) * (z1 - z0)];
  stone(
    o,
    lod > 2 ? 5 : lod > 1 ? 3 : x1 - x0 > 1.4 ? 2 : 1,
    u => {
      const b = u[1] > 0 ? y1 - mid[1] : mid[1] - y0;
      const q = [u[0] / a, u[1] / b, u[2] / c].map(v => v * v);
      const t =
        lod > 1
          ? 1 / Math.sqrt(Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2]))
          : 1 / Math.sqrt(q[0] + q[1] + q[2]);
      const k = t * (0.93 + 0.14 * noise(1.3 * u[0] + s, 1.3 * u[2] + u[1], s));
      return [mid[0] + u[0] * k, Math.min(mid[1] + u[1] * t, y1), mid[2] + u[2] * k];
    },
    g,
    y1,
    s,
    shade,
  );
};

/**
 * A landing pad (radius 13) with its painted rings and 24 lights; its ship is drawn by craft.ts.
 * The disc tops out 2 cm above the pad's metal brush (0.25): level with it, the two fought for the depth buffer.
 */
const pad = (o: number[], px: number, pz: number) => {
  place(
    o,
    dress(
      smooth(
        [
          [13, 0],
          [13, 0.27],
          [0, 0.27],
        ],
        32,
      ),
      [0.13, 0.13, 0.15],
    ),
    [px, 0, pz],
    UP,
    [0, 0, 0],
    1,
  );
  ring(o, [px, 0.29, pz], 7.6, 8, [0.8, 0.8, 0.82]);
  for (let i = 0; i < 24; i++) {
    const t = (i * TAU) / 24;
    const [x, z] = [px + 11.6 * Math.cos(t), pz + 11.6 * Math.sin(t)];
    const q = (a: number, b: number): Vec3 => [x + a, 0.31, z + b];
    lit(o, 1.8, () =>
      face(
        o,
        [q(-0.25, -0.25), q(0.25, -0.25), q(0.25, 0.25), q(-0.25, 0.25)],
        i % 3 ? [1, 0.95, 0.8] : [1, 0.45, 0.1],
        [x, -5, z],
      ),
    );
  }
};

/** A light mast standing at height y: a pole h high, a foot, a glowing lamp. */
const mast = (o: number[], x: number, z: number, y: number, h = 10, rgb = [1, 0.93, 0.75]) => {
  place(o, POLE, [x, y, z], UP, [0, 0, 0], [0.2, 0.2, h]);
  place(o, POLE, [x, y, z], UP, [0, 0, 0], [0.5, 0.5, 0.5]);
  lit(o, GLOW, () => place(o, BLOB, [x, y + h + 0.4, z], UP, [0, 0, 0], [0.55, 0.55, 0.45], rgb));
};

/**
 * One of the map's rocks, drawn from its own form (rockOf() in shared/moon.ts, which the map's
 * boxes are cut inside of): a sphere thrown onto it from its middle, smooth, 720 triangles from
 * 2.5 m of radius, 320 from 1.5 m and 180 under, less what is under the ground; its tone its own.
 */
const crag = (
  o: number[],
  { at: [x, g, z], R, H, s }: (typeof LAYOUT.crags.arena)[0],
  at: (x: number, z: number) => number,
) => {
  const { reach } = rockOf(s, R, H);
  const mid: Vec3 = [x, g + rockMid(H), z];
  stone(
    o,
    R < 1.5 ? 3 : R < 2.5 ? 4 : 5,
    u => {
      const d = reach(u);
      return [mid[0] + u[0] * d, mid[1] + u[1] * d, mid[2] + u[2] * d];
    },
    g,
    g + H,
    s,
    0.8 + 0.4 * hash(s, 5, 41),
    at,
  );
};

/** A stepping stone of the rille: a rock for its head, where feet land, and a coarser one under it for the shaft, down into the dark. */
const pillar = (
  o: number[],
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  y: number,
  s: number,
) => {
  boulder(o, [[x0, y - 4, z0, x1, y, z1]], y - 3.4, s, 3, 0.9);
  boulder(o, [[x0 + 0.15, -17, z0 + 0.15, x1 - 0.15, y - 3, z1 - 0.15]], -15, s + 9, 2, 0.5);
};

/** Red's half: everything but the crater, the stars and the Earth, on the map's LAYOUT. */
const base = (o: number[]) => {
  moonbase(o);
  hull(o);
  const [px, pz] = LAYOUT.pads[0];
  pad(o, px, pz);
  for (const [x, z] of LAYOUT.masts.slice(0, 6)) {
    mast(o, x, z, x < 60 ? 0.25 : 0);
  }
};

/** Profile of a small crater, radius 1 across: [radius, height, light] from the bowl's middle to where it meets the floor. */
const BOWL = [
  [0, 0.02, 0.6],
  [0.55, 0.04, 0.72],
  [0.88, 0.2, 1.05],
  [1, 0.24, 1.12],
  [1.4, 0.015, 1],
];

/** Whether the arena's floor at y 0, with nothing standing on it, runs under the whole circle, half a metre in from its edge. */
const bare = ({ brushes }: WorldDef, x: number, z: number, r: number) =>
  // No box that stands on the floor within half a metre of the circle.
  !brushes.some(
    b =>
      b.max[1] > 0 &&
      Math.hypot(Math.max(b.min[0] - x, x - b.max[0], 0), Math.max(b.min[2] - z, z - b.max[2], 0)) <
        r + 0.5,
  ) &&
  [0, 1, 2, 3, 4].every(k => {
    const [u, v] = k ? [x + r * Math.cos(k * 1.57), z + r * Math.sin(k * 1.57)] : [x, z];
    return (
      Math.abs(u - C[0]) <= C[0] - 0.5 &&
      Math.abs(v - C[2]) <= C[2] - 0.5 &&
      brushes.some(
        b => b.max[1] == 0 && u > b.min[0] && u < b.max[0] && v > b.min[2] && v < b.max[2],
      )
    );
  });

/**
 * Small craters on the floor, 72 of 1.2 to 5 m wide, where it is level and nothing stands: a shallow bowl
 * darker than the floor and a raised lip, in its stone texture, the slopes' normals steepened
 * so the sun lights one side of the lip and shades the other, and none within 6 m of where a rover
 * is parked. They are not collided with.
 */
const craters = (o: number[], def: WorldDef) => {
  const N = 12;
  const land = { relief: def.relief && raise(def.relief) } as World;
  /** Whether the relief is level, at 0, under the whole circle: its middle and 16 points round it. */
  const level = (x: number, z: number, r: number) =>
    !def.relief ||
    Array.from({ length: 17 }, (_, k) => (k * TAU) / 16).every(
      (a, k) => ground(land, x + (k ? r * Math.cos(a) : 0), z + (k ? r * Math.sin(a) : 0)) === 0,
    );
  for (let k = 0, n = 0; n < 72 && k < 900; k++) {
    const [x, z, r] = [W * hash(k, 1, 61), Z * hash(k, 2, 61), 0.6 + 2 * hash(k, 3, 61) ** 2];
    if (
      !bare(def, x, z, 1.5 * r) ||
      !level(x, z, 1.5 * r) ||
      // Not by the rille's lips: the mounds' sills are there.
      Math.abs(z - C[2]) < 24 ||
      (def.rovers ?? []).some(([a, , b]) => Math.hypot(x - a, z - b) < 6)
    ) {
      continue;
    }
    n++;
    const at = (i: number, j: number) => {
      // A rim that is no ring: each bearing a hash nearer or further, its lip higher or lower.
      const [f0, y0, l] = BOWL[i];
      const [f, y] = [
        f0 * (i && i < 4 ? 0.86 + 0.28 * hash(k, j % N, 67) : 1),
        i === 2 || i === 3 ? y0 * (0.55 + 0.45 * hash(k, j % N, 68)) : y0,
      ];
      const a = (j * TAU) / N;
      const [c, d] = [Math.cos(a), Math.sin(a)];
      const [p, q] = [BOWL[Math.max(i - 1, 0)], BOWL[Math.min(i + 1, BOWL.length - 1)]];
      // The slope along the radius, three times as steep for the light.
      const s = (-3 * (q[1] - p[1])) / ((q[0] - p[0]) * r);
      const m = Math.hypot(s, 1);
      const [u, v] = [x + c * f * r, z + d * f * r];
      return [u, y, v, (s * c) / m, 1 / m, (s * d) / m, u, v, TEX.STONE, l];
    };
    for (let i = 0; i < BOWL.length - 1; i++) {
      for (let j = 0; j < N; j++) {
        const [a, b, c, d] = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)];
        o.push(...a, ...c, ...b, ...a, ...d, ...c);
      }
    }
  }
};

/** Grid lines 20 m apart over the lattice, from lo to hi, then outward from both ends over the crater wall: four of 20 m, then 40 m. */
const lines = (lo: number, hi: number) => {
  const out = [0, 20, 40, 60, 80, 120, 160, 200, 240];
  return [
    ...out.map(d => lo - d).reverse(),
    ...Array.from({ length: (hi - lo) / 20 - 1 }, (_, i) => lo + 20 * (i + 1)),
    ...out.map(d => hi + d),
  ];
};

/**
 * The relief, in the floor's stone: inside the bound the lattice's own triangles, each square
 * split as ground() splits it, so what is seen is what is stood on. Past the bound, where nobody
 * goes, the same heights on squares of 20 m and more, a fan each, its sides cut where a finer
 * square is next to it: no gap. Lighter up the wall, darker down the bowls.
 */
const terrain = (o: number[], def: WorldDef) => {
  const r = raise(def.relief!);
  const [cx, cz, a, b] = r.bound;
  const [xs, zs] = [lines(r.x0, cx + a), lines(r.z0, cz + b)];
  const y = (x: number, z: number) => {
    const [i, j] = [(x - r.x0) / r.cell, (z - r.z0) / r.cell];
    return i % 1 || j % 1 || i < 0 || j < 0 || i >= r.nx || j >= r.nz
      ? def.relief!.at(x, z)
      : r.h[i + j * r.nx];
  };
  /** What a crater threw out, lighter: rays from its rim to 2.4 times its radius, a few on each, fading out. */
  const rays = (x: number, z: number) =>
    LAYOUT.bowls.reduce((t, [bx, bz, br]) => {
      const d = Math.hypot(x - bx, z - bz);
      const q = d / br;
      const ray = noise(5 * ((x - bx) / d) + bx, 5 * ((z - bz) / d) + bz, 19);
      return q > 1.05 && q < 2.4
        ? t + 0.22 * sm((ray - 0.55) * 5) * sm((2.4 - q) / 0.9) * sm((q - 1.05) * 6)
        : t;
    }, 0);
  const seen = new Map<number, number[]>();
  const vert = (x: number, z: number) => {
    const k = x * 4096 + z;
    let v = seen.get(k);
    if (!v) {
      const h = y(x, z);
      const n = unit([y(x - 4, z) - y(x + 4, z), 8, y(x, z - 4) - y(x, z + 4)]);
      v = [x, h, z, ...n, x, z, TEX.STONE, Math.min(Math.max(1 + h / 60, 0.78), 1.2) + rays(x, z)];
      seen.set(k, v);
    }
    return v;
  };
  /** The square (i, j) of the grid lines: 0 not drawn (the arena, the plain), 1 a fan, 2 the lattice. */
  const kind = (i: number, j: number) => {
    const [x0, x1, z0, z1] = [xs[i], xs[i + 1], zs[j], zs[j + 1]];
    if (!(x0 < x1 && z0 < z1)) {
      return 0;
    }
    // Its nearest point to the middle, in the ellipse's own measure.
    const k = Math.hypot(
      (Math.min(Math.max(cx, x0), x1) - cx) / a,
      (Math.min(Math.max(cz, z0), z1) - cz) / b,
    );
    return k < 1 ? 2 : k < OUT ? 1 : 0;
  };
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < zs.length - 1; j++) {
      const [x0, x1, z0, z1, k] = [xs[i], xs[i + 1], zs[j], zs[j + 1], kind(i, j)];
      if (k > 1) {
        for (let x = x0; x < x1; x += r.cell) {
          for (let z = z0; z < z1; z += r.cell) {
            // Not the rille, nor the 8 m behind each lip: ravine() draws the ground up to the rim.
            if (
              (x >= r.hole[0] && x < r.hole[2] && z >= r.hole[1] - 8 && z < r.hole[3] + 8) ||
              // Nor a pit's square of terrace: pits() draws it round the void.
              LAYOUT.pits.some(
                p => x >= p.x - PIT_S && x < p.x + PIT_S && z >= p.z - PIT_S && z < p.z + PIT_S,
              )
            ) {
              continue;
            }
            const [p, q, s, t] = [
              vert(x, z),
              vert(x + r.cell, z),
              vert(x + r.cell, z + r.cell),
              vert(x, z + r.cell),
            ];
            o.push(...p, ...s, ...q, ...p, ...t, ...s);
          }
        }
      } else if (k) {
        // Round the square, each side in steps of a cell where the lattice is across it.
        const rim: number[][] = [];
        for (const [ax, az, bx, bz, fine] of [
          [x0, z0, x1, z0, kind(i, j - 1)],
          [x1, z0, x1, z1, kind(i + 1, j)],
          [x1, z1, x0, z1, kind(i, j + 1)],
          [x0, z1, x0, z0, kind(i - 1, j)],
        ]) {
          const n = fine > 1 ? 5 : 1;
          for (let m = 0; m < n; m++) {
            rim.push(vert(ax + ((bx - ax) * m) / n, az + ((bz - az) * m) / n));
          }
        }
        const mid = vert((x0 + x1) / 2, (z0 + z1) / 2);
        rim.forEach((p, m) => o.push(...mid, ...rim[(m + 1) % rim.length], ...p));
      }
    }
  }
};

/**
 * The rows of the rille's wall: depth, how far the rock stands out into the void there (under 0:
 * back under the rim, which overhangs), how much more a buttress adds, and how light it is. Three
 * strata, a ledge under each of the upper two (out of anyone's reach: nothing collides with the
 * wall's form), then scree down to the bottom.
 */
const ROWS = [
  [0, 0, 0, 1],
  [-0.6, -0.25, 0, 0.9],
  [-3, -0.2, 0.7, 0.95],
  [-7, 0.1, 0.9, 0.85],
  [-7.4, 0.8, 0.9, 0.5],
  [-14, 1, 1.2, 0.55],
  [-14.5, 1.7, 1.2, 0.3],
  [-22, 2.1, 1.5, 0.34],
  [-30, 5.6, 1.5, 0.12],
];

/**
 * Red's side of the rille. The rim is a line through the lip of shared/moon.ts (LIP): at each
 * metre of x the nearer of the two columns' lips, a few centimetres further out, so the ground
 * drawn reaches every brush's edge and is never more than a step (0.5 m) past it; where the ends
 * close in steps of 1.5 m the line takes the steps (RIM). Behind the rim the
 * ground (apron()); under it the wall, in basalt, flat shaded:
 * buttresses and fractures from noise along x, the strata of ROWS. Then the bottom, a seam that
 * glows far down, rubble, and stones along the rim.
 */
/** The rim's points on red's side, x and z, from the middle of the closed west end to the middle of the east one. */
const RIM = (() => {
  const lip = (x: number) => LIP[Math.min(Math.max(x, 0), LIP.length - 1)];
  const rim: number[][] = [[0, 140]];
  for (let x = 0; x <= LIP.length; x++) {
    const [a, b] = [lip(x - 1), lip(x)];
    if (Math.abs(a - b) > 0.5) {
      // A step of an end's spurs: the line takes it.
      rim.push([x, 148 + a], [x, 148 + b]);
    } else {
      rim.push([x, 148 + Math.min(a, b) - 0.12 * hash(x, 1, 71)]);
    }
  }
  return [...rim, [LIP.length, 140]];
})();

/** The ground from the lattice's edge, 8 m behind the straight lip, to the rim, on both sides: in the floor's stone, laid where it lies (a mirrored copy would carry red's). */
const apron = (o: number[], def: WorldDef) => {
  const { at } = def.relief!;
  const y = (x: number, z: number) => at(x, Math.max(z, 148));
  for (const side of [1, -1]) {
    const floor = (x: number, z: number) => {
      const n = unit([y(x - 1, z) - y(x + 1, z), 2, side * (y(x, z - 1) - y(x, z + 1))]);
      return [
        x,
        Math.max(y(x, z), 0),
        140 + side * (z - 140),
        ...n,
        x,
        140 + side * (z - 140),
        TEX.STONE,
        1,
      ];
    };
    for (let i = 0; i < RIM.length - 1; i++) {
      const [p, q] = [RIM[i], RIM[i + 1]];
      if (p[0] !== q[0]) {
        const [a, b, c, d] = [
          floor(p[0], 156),
          floor(q[0], 156),
          floor(q[0], q[1]),
          floor(p[0], p[1]),
        ];
        o.push(...a, ...c, ...b, ...a, ...d, ...c);
      }
    }
  }
};

const ravine = (o: number[], def: WorldDef) => {
  const { at } = def.relief!;
  const rim = RIM;
  const ground = (x: number, z: number) => Math.max(at(x, Math.max(z, 148)), 0);
  // How far a buttress stands out at x: wide ones, split by fractures.
  const butt = (x: number) =>
    sm((noise(x / 6, 0.5, 82) - 0.35) * 4) * (0.55 + 0.45 * noise(x / 1.7, 0.5, 83));
  const wall = ([x, z]: number[], k: number): Vec3 => {
    const [y, out, more] = ROWS[k];
    return [x, k ? y : ground(x, z), z - out - more * butt(x) * (k ? 1 : 0)];
  };
  for (let i = 0; i < rim.length - 1; i++) {
    const [p, q] = [rim[i], rim[i + 1]];
    for (let k = 0; k < ROWS.length - 1; k++) {
      const f = [wall(p, k), wall(q, k), wall(q, k + 1), wall(p, k + 1)];
      for (const [a, b, c] of (i + k) & 1
        ? [
            [0, 1, 2],
            [0, 2, 3],
          ]
        : [
            [0, 1, 3],
            [1, 2, 3],
          ]) {
        let n = cross(sub(f[b], f[a]), sub(f[c], f[a]));
        if (Math.hypot(...n) < 1e-9) {
          continue;
        }
        // Out of the rock: toward the centre line or, on a step, along x; never down.
        n = unit(n);
        n = n[2] > 0 || (Math.abs(n[2]) < 1e-9 && n[1] < 0) ? (n.map(v => -v) as Vec3) : n;
        const w =
          ROWS[k][3] * (0.82 + 0.3 * hash(i, k, 73)) * (0.7 + 0.3 * butt((p[0] + q[0]) / 2));
        for (const v of [f[a], f[b], f[c]]) {
          o.push(...v, ...n, v[0] + v[2], v[1], TEX.ROCK, w);
        }
      }
    }
  }
  // Stones along the rim, a third of a metre high and less: its broken edge.
  for (let i = 0; i < 28; i++) {
    const [x, z] = rim[2 + Math.floor(hash(i, 1, 75) * (rim.length - 4))];
    const r = 0.25 + 0.35 * hash(i, 2, 75);
    const [u, v] = [x + 0.5 - hash(i, 3, 75), Math.max(z, 148) + 0.3 + r + 0.8 * hash(i, 4, 75)];
    boulder(
      o,
      [[u - r, at(u, v) - 0.3, v - r, u + r, at(u, v) + 0.7 * r, v + r]],
      at(u, v),
      i + 300,
      1,
      0.8 + 0.3 * hash(i, 5, 75),
    );
  }
  // The east stones on this side: a rock pillar round each box, down into the dark.
  LAYOUT.pillars.forEach(
    ([x0, z0, x1, z1, y], i) => z0 > 140 && pillar(o, x0, z0, x1, z1, y, i + 400),
  );
  // The bottom, black, 30 m down; a seam of light in it along the middle; rubble.
  face(
    o,
    [
      [-2, -30, 140],
      [162, -30, 140],
      [162, -30, 158],
      [-2, -30, 158],
    ],
    [0.012, 0.012, 0.015],
  );
  for (let i = 0; i < 9; i++) {
    const x = 6 + 17 * i + 8 * hash(i, 1, 77);
    lit(o, 0.1, () =>
      face(
        o,
        [
          [x, -29.9, 140],
          [x + 9 + 6 * hash(i, 2, 77), -29.9, 140],
          [x + 5, -29.9, 140.25 + 0.3 * hash(i, 3, 77)],
        ],
        [0.2, 0.55, 1],
      ),
    );
    const r = 1.5 + 2.5 * hash(i, 4, 77);
    rock(o, [x, -29.6, 142.5 + 5 * hash(i, 5, 77)], [r, 0.7 * r, r], i + 200, 0.25, false);
  }
};

/**
 * The three pits, drawn round their voids: the square of terrace cut in the lattice, darker toward
 * the edge so a driver sees it coming, out to an outline through the rows of shared/moon.ts (at
 * each metre the narrower of the two rows: the ground drawn reaches every brush's edge); the wall
 * under it in basalt, pushed in and out by a hash, darker with depth; the floor; the steps of the
 * way out, a rock on each box; blocks round the edge.
 */
const pits = (o: number[]) => {
  for (const [n, { x, z, level, rows }] of LAYOUT.pits.entries()) {
    const w = (k: number, side: number) => rows[k]?.[2 + side] ?? 0;
    // The outline at each row's edge, west then east: x from the middle.
    const rim = Array.from({ length: rows.length + 1 }, (_, k) => [
      rows[0][0] + k,
      -Math.min(w(k - 1, 0), w(k, 0)),
      Math.min(w(k - 1, 1), w(k, 1)),
    ]);
    // Darker within 3 m of the void.
    const top = (u: number, v: number) => [
      u,
      level,
      v,
      0,
      1,
      0,
      u,
      v,
      TEX.STONE,
      0.6 + 0.4 * sm((Math.hypot(u - x, v - z) - PIT_R) / 3),
    ];
    const quad = (a: number[], b: number[], c: number[], d: number[]) =>
      o.push(...a, ...c, ...b, ...a, ...d, ...c);
    for (const [z0, z1] of [
      [z - PIT_S, z - PIT_R],
      [z + PIT_R, z + PIT_S],
    ]) {
      // In strips of 2 m, so the tone follows the void's round edge.
      for (let u = x - PIT_S; u < x + PIT_S; u += 2) {
        quad(top(u, z0), top(u + 2, z0), top(u + 2, z1), top(u, z1));
      }
    }
    for (let k = 0; k < rim.length - 1; k++) {
      const [[z0, a0, b0], [z1, a1, b1]] = [rim[k], rim[k + 1]];
      quad(top(x - PIT_S, z0), top(x + a0, z0), top(x + a1, z1), top(x - PIT_S, z1));
      quad(top(x + b0, z0), top(x + PIT_S, z0), top(x + PIT_S, z1), top(x + b1, z1));
      // The walls, down to the floor in four courses.
      for (const side of [1, 2]) {
        const ys = [level, level - 0.6, level - 5, level - 10, PIT_FLOOR];
        const at = (row: number[], j: number): Vec3 => [
          x +
            row[side] +
            (side > 1 ? -1 : 1) * (j && j < 4 ? 0.9 * hash(row[0], j, 83 + side) - 0.25 : 0),
          ys[j],
          row[0],
        ];
        for (let j = 0; j < 4; j++) {
          const f = [at(rim[k], j), at(rim[k + 1], j), at(rim[k + 1], j + 1), at(rim[k], j + 1)];
          const out: Vec3 = [x + (side > 1 ? 99 : -99), ys[j], z];
          const from = o.length;
          facet(o, [f[0], f[1], f[2]], out, PIT_FLOOR - 12, level, n + j, 1.2);
          facet(o, [f[0], f[2], f[3]], out, PIT_FLOOR - 12, level, n + j, 1.2);
          // No sun reaches down here: the normals lean up to the sky, or the walls are black.
          for (let i = from + 3; i < o.length; i += 10) {
            const up = unit([o[i], o[i + 1] + 0.9, o[i + 2]]);
            [o[i], o[i + 1], o[i + 2]] = up;
          }
        }
      }
    }
    const floor = (u: number, v: number) => [u, PIT_FLOOR, v, 0, 1, 0, u, v, TEX.STONE, 0.5];
    quad(
      floor(x - PIT_R - 1.5, z - PIT_R),
      floor(x + PIT_R + 1.5, z - PIT_R),
      floor(x + PIT_R + 1.5, z + PIT_R),
      floor(x - PIT_R - 1.5, z + PIT_R),
    );
    // The steps: as shared/moon.ts stacks them against the east wall.
    const east = rows[PIT_R][3];
    const rise = (level - PIT_FLOOR) / PIT_STEPS;
    for (let k = 0; k < PIT_STEPS - 1; k++) {
      const x0 = x + east - 1.3 * (PIT_STEPS - 1 - k);
      boulder(
        o,
        [[x0, PIT_FLOOR - 1, z - 1, x0 + 1.3, PIT_FLOOR + rise * (k + 1), z + 1]],
        PIT_FLOOR,
        n * 9 + k,
        2,
        0.9,
      );
    }
    // Blocks round the edge, a metre back from it.
    for (let k = 0; k < 20; k++) {
      const t = (TAU * (k + hash(n, k, 85))) / 20;
      const [u, v, r] = [
        x + (PIT_R + 1.6) * Math.cos(t),
        z + (PIT_R + 1.6) * Math.sin(t),
        0.3 + 0.35 * hash(n, k, 86),
      ];
      boulder(
        o,
        [[u - r, level - 0.3, v - r, u + r, level + 0.9 * r, v + r]],
        level,
        n * 40 + k,
        1,
        0.9,
      );
    }
  }
};

/**
 * A band of detail on the rim of each crater of 12 m and more, laid on the relief and 4 to 25 cm
 * proud of it (the lattice's 4 m squares cannot carry an outline): five rings 1.2 m apart round
 * the crest, found on each bearing as the highest ground, a point every 1.5 m. The crest ring is
 * raised by a hash and light, the inner one dark and streaked (gullies), the outer ones fade into
 * the ground's own tone: from above the rim reads as a broken ring.
 */
const rims = (o: number[], def: WorldDef) => {
  const { at } = def.relief!;
  const land = { relief: raise(def.relief!) } as World;
  LAYOUT.bowls.forEach(([bx, bz, br], n) => {
    const count = br < 12 ? 0 : Math.round((TAU * br) / 1.5);
    // The crest on each bearing, then eased over five: a flat rim's highest point jumps about.
    const found = Array.from({ length: count }, (_, i) => {
      const [c, s] = [Math.cos((TAU * i) / count), Math.sin((TAU * i) / count)];
      let [crest, high] = [br, -Infinity];
      for (let d = 0.8 * br; d < 1.3 * br; d += 0.5) {
        const h = at(bx + c * d, bz + s * d);
        [crest, high] = h > high ? [d, h] : [crest, high];
      }
      return crest;
    });
    const ring = Array.from({ length: count }, (_, i) => {
      const [c, s] = [Math.cos((TAU * i) / count), Math.sin((TAU * i) / count)];
      const crest = [-2, -1, 0, 1, 2].reduce((t, d) => t + found[(i + d + count) % count], 0) / 5;
      const broken = hash(i, n, 87);
      return [-2.4, -1.2, 0, 1.2, 2.4].map((d, k) => {
        const [x, z] = [bx + c * (crest + d), bz + s * (crest + d)];
        const up = [0.04, 0.12, 0.1 + 0.15 * broken, 0.1, 0.04][k];
        const tone = [0.62 + 0.3 * hash(i >> 1, n, 88), 0.9, 1.22 + 0.2 * broken, 1.1, 1][k];
        return [x, ground(land, x, z) + up, z, 0, 1, 0, x, z, TEX.STONE, tone];
      });
    });
    ring.forEach((a, i) => {
      const b = ring[(i + 1) % count];
      for (let k = 0; k < 4; k++) {
        // Not over a pit or the rille.
        if ([a[k], a[k + 1], b[k], b[k + 1]].every(v => Number.isFinite(v[1]))) {
          o.push(...a[k], ...b[k + 1], ...b[k], ...a[k], ...a[k + 1], ...b[k + 1]);
        }
      }
    });
  });
};

/** What stands on the relief, on the map's LAYOUT: the boulder field, the dishes on their hill, an orange lamp each side of a ramp's lip, the wrecked lander in the Bowl, and boulders up the crater wall past the bound. */
const sites = (o: number[], def: WorldDef) => {
  const { at } = def.relief!;
  // Round each crater 12 m in radius and more: stones on its crest, where it broke, and the
  // blocks it threw out, fewer the further from it; none in the arena.
  LAYOUT.bowls.forEach(([bx, bz, br], i) => {
    for (let k = 0; br >= 12 && k < Math.round(br / 3.5); k++) {
      const h = (j: number) => hash(i, 7 * k + j, 57);
      // Two in five on the crest, the rest out to 2.6 times the radius, thinning.
      const q = k % 5 < 2 ? 0.96 + 0.16 * h(1) : 1.25 + 1.35 * h(1) * h(1);
      const [u, v] = [bx + q * br * Math.cos(TAU * h(2)), bz + q * br * Math.sin(TAU * h(2))];
      const r = (0.3 + 0.5 * h(3)) * (br > 30 ? 1.5 : 1);
      if (Math.abs(u - C[0]) > C[0] + 2 || Math.abs(v - C[2]) > C[2] + 2) {
        boulder(
          o,
          [[u - r, at(u, v) - 0.4, v - r, u + r, at(u, v) + 0.8 * r, v + r]],
          at(u, v),
          i * 31 + k,
          1,
          0.85 + 0.3 * h(4),
        );
      }
    }
  });
  // The dishes look at the Earth.
  const side = unit(cross([0, 1, 0], EARTH));
  const frame = [side, cross(EARTH, side), EARTH];
  for (const [x, z] of LAYOUT.dishes) {
    mast(o, x, z, at(x, z), 6, [1, 0.25, 0.15]);
    place(o, DISH, [x, at(x, z) + 5.2, z], frame, [0, 0, -0.9], 1);
  }
  for (const [x, z, ax, az] of LAYOUT.ramps) {
    for (const c of [-8, 8]) {
      mast(o, x + c * az, z - c * ax, at(x + c * az, z - c * ax), 2.2, [1, 0.45, 0.1]);
    }
  }
  // The lander: its hull nose down in the regolith, a torn fin, a beacon still lit.
  // On the floor of the Bowl's pit.
  const [x, z] = LAYOUT.wreck;
  const h = PIT_FLOOR;
  const nose = unit([0.8, -0.35, 0.5]);
  const wing = unit(cross([0, 1, 0], nose));
  place(
    o,
    SHIP,
    [x - 3, h + 3.1, z - 2],
    [wing, cross(nose, wing), nose],
    [0, 0, 0],
    [1.6, 1.4, 0.55],
    [0.6, 0.6, 0.62],
  );
  face(
    o,
    [
      [x + 3, h, z + 4],
      [x + 6.5, h + 0.2, z + 5],
      [x + 4, h + 2.6, z + 5.5],
    ],
    [0.7, 0.3, 0.14],
  );
  mast(o, x - 3.4, z + 2.6, h, 3.5, [1, 0.12, 0.08]);
  // Up the wall nobody gets within 60 m of them: fewer, coarse.
  for (let k = 0; k < 30; k++) {
    const [f, t] = [1.03 + 0.22 * hash(k, 1, 51), TAU * hash(k, 2, 51)];
    const [u, v] = [C[0] + 300 * f * Math.cos(t), C[2] + 360 * f * Math.sin(t)];
    const r = 3 + 9 * hash(k, 3, 51) ** 3;
    rock(o, [u, at(u, v) - 0.4 * r, v], [r, 0.7 * r, r], k, 0.8 + 0.4 * hash(k, 4, 51), false);
  }
};

/**
 * The ranges on the horizon, all round, past the crater wall: radius from the middle of the play
 * area, height of its highest peak, rows of points from foot to crest, its grey in the sun and in
 * the shade (the nearer darker and sharper, the farther paler and flatter, as the eye expects with
 * no air), seed.
 * Inside the stars' dome and, from the far side of the bound, the far plane.
 */
export const RANGES = [
  [640, 140, 4, 0.32, 0.03, 3],
  [690, 180, 3, 0.3, 0.05, 5],
  [740, 220, 3, 0.28, 0.07, 8],
];
/** Columns a range is drawn in: three quarters of a degree each, no segment shows on its skyline. */
export const RANGE_COLS = 480;
/**
 * How high a range's crest is on a bearing (u, v), as a share of its highest peak: long swells,
 * ridges, then finer and finer teeth of rock, all from noise on the circle (so it closes on itself),
 * with two massifs that stand over the rest and two passes, each range's at its own bearings: one
 * knows where one is by them.
 */
const crest = (u: number, v: number, R: number, s: number) => {
  const n = (l: number, k: number) => noise((u * R) / l + 7 * s, (v * R) / l - 3 * s, s + k);
  const turn = (k: number) => {
    const a = TAU * hash(s, k, 97);
    return u * Math.cos(a) + v * Math.sin(a);
  };
  const massif = Math.max(sm((turn(1) - 0.93) / 0.07), 0.8 * sm((turn(2) - 0.95) / 0.05));
  const pass = Math.max(sm((turn(3) - 0.985) / 0.015), sm((turn(4) - 0.985) / 0.015));
  const ridge = 1 - Math.abs(2 * n(150, 2) - 1);
  return (
    (0.42 + 0.2 * n(520, 1) + 0.14 * ridge * ridge + 0.24 * massif) * (1 - 0.5 * pass) +
    0.1 * (n(60, 3) - 0.5) +
    0.05 * (n(24, 4) - 0.5) +
    0.025 * (n(9, 5) - 0.5)
  );
};
/**
 * The ranges, painted: no texture, no light of the scene's (layer -2, which takes none and casts
 * no shade worth the name), each point's grey worked out here from the map's sun. A face that
 * looks at the sun is lit, one that looks away is in shade; spurs come down from the crest, each
 * with a lit side and a dark one; the crest itself catches the light. The foot is under the
 * horizon, behind the crater wall.
 */
const ranges = (o: number[], sun: Vec3) => {
  for (const [R, H, rows, sunny, shady, s] of RANGES) {
    const col = (i: number) => {
      const a = (i * TAU) / RANGE_COLS;
      const [u, v] = [Math.cos(a), Math.sin(a)];
      const h = H * crest(u, v, R, s);
      // The slope of the crest along the range, and of the spurs.
      const b = ((i + 1) * TAU) / RANGE_COLS;
      const along = (H * crest(Math.cos(b), Math.sin(b), R, s) - h) / ((R * TAU) / RANGE_COLS);
      return Array.from({ length: rows + 1 }, (_, j) => {
        const f = j / rows;
        // The foot nearer than the crest: a slope of three in ten.
        const r = R - 0.3 * h * (1 - f);
        // Spurs come down from the crest aslant, wider apart at the foot; a gully between two is darker whatever the sun.
        const lane = (R / (30 + 26 * (1 - f))) * (1 + 0.05 * f);
        const spur = 2 * noise(u * lane + s + 1.7 * f, v * lane - 1.3 * f, s + 9) - 1;
        const n = unit([
          -u - v * (-1.5 * along - 1.6 * spur * (1 - 0.5 * f)),
          0.75,
          -v + u * (-1.5 * along - 1.6 * spur * (1 - 0.5 * f)),
        ]);
        const lit = Math.max(dot(n, sun), 0);
        const rock =
          (0.8 + 0.3 * noise((u * R) / 90 - s, (v * R) / 90 + 2.3 * f, s + 11)) *
          (0.72 + 0.28 * sm(0.5 + 0.9 * spur));
        // In the shade a little light from the ground; on the crest a rim of light.
        const g =
          rock * (shady + (sunny - shady) * Math.min(1.2 * lit + (j === rows ? 0.3 : 0), 1));
        // Its normal looks away from the crater: no highlight of the sun's on it.
        return [C[0] + u * r, -25 + (h + 25) * f, C[2] + v * r, u, 0, v, g, g, -2, 1.03 * g];
      });
    };
    let p = col(0);
    for (let i = 1; i <= RANGE_COLS; i++) {
      const q = col(i % RANGE_COLS);
      for (let j = 0; j < rows; j++) {
        o.push(...p[j], ...q[j], ...q[j + 1], ...p[j], ...q[j + 1], ...p[j + 1]);
      }
      p = q;
    }
  }
};

/** 3000 stars, tiny glowing squares facing the middle of the play area on a dome above the horizon. */
const stars = (o: number[]) => {
  for (let i = 0; i < 3000; i++) {
    const h = (k: number) => hash(i, k, 31);
    const y = -0.05 + 1.05 * h(1);
    const [r, a] = [Math.sqrt(1 - y * y), h(2) * TAU];
    const d: Vec3 = [r * Math.cos(a), y, r * Math.sin(a)];
    const e = unit(cross(d, [0, 1, 0]));
    const f = cross(d, e);
    const s = 0.9 + 1.8 * h(3) ** 3;
    const at = d.map((v, k) => C[k] + v * SKY) as Vec3;
    const p = (u: number, v: number) => at.map((c, k) => c + (e[k] * u + f[k] * v) * s) as Vec3;
    const t = h(5);
    lit(o, 0.5 + 1.7 * h(4) ** 2, () =>
      face(
        o,
        [p(-1, -1), p(1, -1), p(1, 1), p(-1, 1)],
        [1 - 0.25 * t, 0.9 + 0.05 * t, 0.75 + 0.25 * t],
        at.map((c, k) => c + d[k] * 100) as Vec3,
      ),
    );
  }
};

/** The Earth: a disc of 60 m about 40 degrees up, toward blue's side, its cells coloured from noise on a globe: oceans, green and brown land, white clouds and ice. */
const earth = (o: number[]) => {
  const dir = EARTH;
  const n = dir.map(v => -v) as Vec3;
  const e = unit([n[2], 0, -n[0]]);
  const f = cross(n, e);
  const at = dir.map((v, k) => C[k] + v * SKY) as Vec3;
  const away = dir.map((v, k) => at[k] + v * 100) as Vec3;
  const [N, S] = [28, 64];
  const P = (r: number, a: number) =>
    at.map((c, k) => c + 60 * r * (e[k] * Math.cos(a) + f[k] * Math.sin(a))) as Vec3;
  const from = o.length;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < S; j++) {
      const [a, b] = [(j * TAU) / S, ((j + 1) * TAU) / S];
      const [r, q] = [(i + 0.5) / N, ((j + 0.5) * TAU) / S];
      const [x, y] = [r * Math.cos(q), r * Math.sin(q)];
      const z = Math.sqrt(1 - r * r);
      const [u, v] = [((Math.atan2(x, z) + 1.5) / TAU) * 12, (Math.asin(y) / Math.PI + 0.5) * 6];
      let rgb =
        fbm(u, v, 11) > 0.5
          ? mix([0.13, 0.32, 0.09], [0.4, 0.3, 0.15], fbm(u * 2, v * 2, 13))
          : [0.03, 0.16, 0.5];
      const cloud = Math.abs(y) > 0.93 ? 1 : sm((fbm(u * 1.5 + 4, v * 3, 17) - 0.5) * 4);
      rgb = mix(rgb as Vec3, [0.95, 0.97, 1], cloud).map(
        c => c * (0.55 + 0.45 * Math.max(0, 0.3 * x + 0.25 * y + 0.9 * z)) * (0.6 + 0.4 * z),
      );
      face(
        o,
        i
          ? [P(i / N, a), P((i + 1) / N, a), P((i + 1) / N, b), P(i / N, b)]
          : [P(0, 0), P(1 / N, a), P(1 / N, b)],
        rgb,
        away,
      );
    }
  }
  glow(o, from, 1.5);
};

/** The moon's scenery vertices, in the renderer's format. */
export const moonscape = (def: WorldDef): number[] => {
  const red: number[] = [];
  base(red);
  if (def.relief) {
    ravine(red, def);
  }
  // Red's rocks, after the rille (whose facets take their tone from where they fall in the list): the boulders along the three walls
  // of the half, the field's stones, and the boulder field's out on the relief south-west. shared/moon.ts collides with them all.
  const at = def.relief?.at ?? (() => 0);
  [...LAYOUT.crags.arena, ...LAYOUT.crags.field].forEach(c => crag(red, c, at));
  const o = red.concat(mirror(red));
  // The stone on the centre line is its own twin.
  for (const [x0, z0, x1, z1, y] of LAYOUT.pillars) {
    if (z0 < 140 && z1 > 140) {
      pillar(o, x0, z0, x1, z1, y, 401);
    }
  }
  craters(o, def);
  if (def.relief) {
    apron(o, def);
    pits(o);
    rims(o, def);
    terrain(o, def);
    sites(o, def);
  }
  ranges(o, unit(def.sun.dir as Vec3));
  stars(o);
  earth(o);
  return o;
};
