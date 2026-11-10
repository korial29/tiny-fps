// What is drawn around and over the moon level (docs/MOON.md), once, from fixed numbers and a
// hash: red's half (the dome and its windows, the tubes, the pad and its shuttle, masts, boulders) mirrored for blue, then the relief round the arena out over the crater wall, what
// stands on it, the stars and the Earth. Nothing here is collided with: shared/moon.ts has a ghost box
// under each piece a player can reach. Every part is lit paint
// (layer -1) or glow (layer -2: windows, lamps, stars, the Earth), but the relief and the small
// craters on the floor, in the floor's own stone, and the boulders, in basalt (TEX.ROCK).
import { LAYOUT, LIP, rockOf } from '../shared/moon';
import { TAU } from '../shared/physics';
import { ground, raise } from '../shared/relief';
import { TEX } from '../shared/types';
import type { World, WorldDef } from '../shared/world';
import { GLOW, glow, ring, tri } from './flag';
import { STRIDE, dot, dress, mix, place, smooth, sub, unit } from './mesh';
import type { Vec3 } from './mesh';
import { UP, box, cross, face, lit, moonbase } from './moonbase';
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
const GREY = [0.52, 0.54, 0.58];
/** A model whose length runs along x (the hull): a frame place() takes, like UP. */
const HULL: Vec3[] = [
  [0, 0, 1],
  [0, 1, 0],
  [1, 0, 0],
];

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
/** The shuttle's hull, its length along -z. */
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

/** A unit sphere as triangles: an octahedron with each face cut in four, n times (8 * 4 ** n). */
const ball = (n: number): Vec3[][] => {
  let t: Vec3[][] = [];
  for (const a of [-1, 1]) {
    for (const b of [-1, 1]) {
      for (const c of [-1, 1]) {
        t.push([
          [a, 0, 0],
          [0, b, 0],
          [0, 0, c],
        ]);
      }
    }
  }
  for (; n > 0; n--) {
    t = t.flatMap(([p, q, r]) => {
      const m = (u: Vec3, v: Vec3) => unit([u[0] + v[0], u[1] + v[1], u[2] + v[2]]);
      const [pq, qr, rp] = [m(p, q), m(q, r), m(r, p)];
      return [
        [p, pq, rp],
        [pq, q, qr],
        [rp, qr, r],
        [pq, qr, rp],
      ];
    });
  }
  return t;
};
const BALLS = [1, 2, 3].map(ball);

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

/**
 * A boulder wrapped round the boxes shared/moon.ts collides with (each x0, y0, z0, x1, y1, z1,
 * all holding the middle of the first, low on the ground g): a sphere of 8 * 4 ** lod triangles
 * (lod 1 to 3), most of them over the ground, each point thrown from that middle onto the far
 * side of the boxes, drawn back up to 0.26 m where two faces meet (no box's edge shows), then
 * moved by two octaves of noise of seed s: a side no more than 0.2 m out nor 0.05 m in, a top
 * only down, 0.08 m. The triangles that span a step from one box to the next are its slopes. Four
 * planes shave the upper half for broad breaks. Flat shaded basalt, each facet a hash lighter or
 * darker, dark at the foot.
 */
const boulder = (
  o: number[],
  parts: number[][],
  g: number,
  s: number,
  lod: number,
  shade: number,
) => {
  const top = Math.max(...parts.map(b => b[4]));
  const mid: Vec3 = [
    (parts[0][0] + parts[0][3]) / 2,
    g + 0.1 * (top - g),
    (parts[0][2] + parts[0][5]) / 2,
  ];
  const hi = [0, top, 0];
  // How far from an edge the rounding starts: less on a small rock.
  const round = Math.min(0.35, 0.2 * (parts[0][3] - parts[0][0]));
  const cuts = [0, 1, 2, 3].map(k => {
    const a = TAU * hash(s, k, 91);
    const y = 0.25 + 0.6 * hash(s, k, 92);
    const c = Math.sqrt(1 - y * y);
    return [c * Math.cos(a), y, c * Math.sin(a), (0.1 + 0.35 * hash(s, k, 93)) * round];
  });
  const far = cuts.map(() => -Infinity);
  const pt = (v: Vec3): Vec3 => {
    // Three quarters of the sphere over the middle: under it is under the ground.
    const u = unit([v[0], 0.625 * v[1] + 0.375, v[2]]);
    let [reach, hit, face] = [0, parts[0], 0];
    for (const b of parts) {
      // Where the ray leaves this box, and by which face.
      let [t, f] = [Infinity, 0];
      for (let k = 0; k < 3; k++) {
        const e =
          u[k] > 0 ? (b[k + 3] - mid[k]) / u[k] : u[k] < 0 ? (b[k] - mid[k]) / u[k] : Infinity;
        [t, f] = e < t ? [e, k] : [t, f];
      }
      [reach, hit, face] = t > reach ? [t, b, f] : [reach, hit, face];
    }
    const p = u.map((c, k) => mid[k] + c * reach) as Vec3;
    // How near the two other pairs of faces are: an edge, a corner.
    const near = [0, 1, 2]
      .filter(k => k !== face)
      .map(k => Math.min(p[k] - hit[k], hit[k + 3] - p[k]))
      .sort((x, y) => x - y);
    const edge = 0.35 * Math.max(round - near[0], 0) + 0.2 * Math.max(round - near[1], 0);
    const n =
      0.65 * noise(3 * v[0] + 1.7 * v[1] + s, 3 * v[2] - 2.1 * v[1], s) +
      0.35 * noise(7 * v[0] - 3 * v[1], 7 * v[2] + 4 * v[1] + s, s + 1);
    const d = (face === 1 ? -0.08 * n : 0.25 * n - 0.05) - edge;
    return p.map((c, k) => c + u[k] * d) as Vec3;
  };
  const tris = BALLS[lod - 1].map(t => t.map(pt));
  tris.forEach(t =>
    t.forEach(p =>
      cuts.forEach((c, k) => (far[k] = Math.max(far[k], dot(p, c as unknown as Vec3)))),
    ),
  );
  for (const t of tris) {
    const q = t.map(p => {
      let v = p;
      cuts.forEach((c, k) => {
        // Past the plane: back onto it.
        const over = dot(v, c as unknown as Vec3) - (far[k] - c[3]);
        // Only over its middle: the sides stay where a body hides behind them.
        v =
          over > 0 && v[1] > g + 0.55 * (top - g) ? (v.map((x, j) => x - over * c[j]) as Vec3) : v;
      });
      return [v[0], Math.min(v[1], hi[1]), v[2]] as Vec3;
    });
    facet(o, q, mid, g, hi[1], s, shade);
  }
};

/**
 * A landing pad (radius 13) with its painted rings and 24 lights, and a shuttle lying on it from x = s, nose toward +x.
 * The disc tops out 2 cm above the pad's metal brush (0.25): level with it, the two fought for the depth buffer.
 */
const pad = (o: number[], px: number, pz: number, s: number) => {
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
  place(o, SHIP, [s, 1.8, pz], HULL, [0, 0, 0], [2, 1.5, 1]);
  const flat = (a: Vec3, b: Vec3, c: Vec3, rgb: number[]) => {
    tri(o, a, b, c, rgb);
    tri(o, a, c, b, rgb);
  };
  for (const k of [-1, 1]) {
    flat(
      [s + 5, 1.2, pz + 1.5 * k],
      [s + 12, 1.2, pz + 1.5 * k],
      [s + 12.8, 1, pz + 6.5 * k],
      GREY,
    );
  }
  flat([s + 8, 3, pz], [s + 13.6, 2.5, pz], [s + 13.9, 5.6, pz], [0.9, 0.35, 0.15]);
  lit(o, 0.5, () => box(o, [s + 2.2, 2.5, pz - 0.7], [s + 4.6, 2.95, pz + 0.7], [0.5, 0.8, 1]));
  lit(o, 2, () =>
    face(
      o,
      [
        [s + 14.02, 1.4, pz - 0.45],
        [s + 14.02, 1.4, pz + 0.45],
        [s + 14.02, 2.2, pz + 0.45],
        [s + 14.02, 2.2, pz - 0.45],
      ],
      [0.5, 0.7, 1],
      [s, 1.8, pz],
    ),
  );
};

/** A light mast standing at height y: a pole h high, a foot, a glowing lamp. */
const mast = (o: number[], x: number, z: number, y: number, h = 10, rgb = [1, 0.93, 0.75]) => {
  place(o, POLE, [x, y, z], UP, [0, 0, 0], [0.2, 0.2, h]);
  place(o, POLE, [x, y, z], UP, [0, 0, 0], [0.5, 0.5, 0.5]);
  lit(o, GLOW, () => place(o, BLOB, [x, y + h + 0.4, z], UP, [0, 0, 0], [0.55, 0.55, 0.45], rgb));
};

/**
 * One of the map's rocks, drawn from its own form (rockOf() in shared/moon.ts, which the map's
 * boxes are cut inside of): a sphere thrown onto it from its middle, most of it over the ground,
 * chipped up to 3 cm, 512 triangles from 2.3 m of radius and 128 under; its tone its own; two
 * stones by the foot of a big one.
 */
const crag = (
  o: number[],
  { at: [x, g, z], R, H, s }: (typeof LAYOUT.crags.arena)[0],
  at: (x: number, z: number) => number,
) => {
  const { reach } = rockOf(s, R, H);
  const mid: Vec3 = [x, g + 0.25 * H, z];
  const shade = 0.8 + 0.4 * hash(s, 5, 41);
  for (const t of BALLS[R < 2.3 ? 1 : 2]) {
    facet(
      o,
      t.map(v => {
        const u = unit([v[0], 0.675 * v[1] + 0.325, v[2]]);
        const d = reach(u) - 0.03 * noise(9 * v[0] + s, 9 * v[2] + 5 * v[1], s + 3);
        return [mid[0] + u[0] * d, mid[1] + u[1] * d, mid[2] + u[2] * d] as Vec3;
      }),
      mid,
      g,
      g + H,
      s,
      shade,
    );
  }
  for (let k = 0; k < 2 && R >= 2.3; k++) {
    const [a, r] = [TAU * hash(s, k, 95), 0.2 + 0.3 * hash(s, k, 96)];
    const [u, v] = [x + (0.85 * R + r) * Math.cos(a), z + (0.85 * R + r) * Math.sin(a)];
    boulder(
      o,
      [[u - r, at(u, v) - 0.3, v - r, u + r, at(u, v) + 0.8 * r, v + r]],
      at(u, v),
      s + k,
      1,
      0.75,
    );
  }
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
  boulder(o, [[x0 + 0.15, -17, z0 + 0.15, x1 - 0.15, y - 3, z1 - 0.15]], -15, s + 9, 2, 0.6);
};

/** Red's half: everything but the crater, the stars and the Earth, on the map's LAYOUT. */
const base = (o: number[], at: (x: number, z: number) => number) => {
  moonbase(o);
  hull(o);
  const [px, pz] = LAYOUT.pads[0];
  pad(o, px, pz, LAYOUT.shuttles[0].min[0]);
  for (const [x, z] of LAYOUT.masts.slice(0, 6)) {
    mast(o, x, z, x < 60 ? 0.25 : 0);
  }
  // Boulders along the three walls of the half, and the field's stones round their boxes (shared/moon.ts collides with both).
  LAYOUT.crags.arena.forEach(c => crag(o, c, at));
  // The boulder field's, out on the relief south-west: red's side of it.
  LAYOUT.crags.field.forEach(c => crag(o, c, at));
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
 * Small craters on the floor, 60 of 1.2 to 5 m wide, where it is level and nothing stands: a shallow bowl
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
  for (let k = 0, n = 0; n < 60 && k < 900; k++) {
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
      const [f, y, l] = BOWL[i];
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
  const seen = new Map<number, number[]>();
  const vert = (x: number, z: number) => {
    const k = x * 4096 + z;
    let v = seen.get(k);
    if (!v) {
      const h = y(x, z);
      const n = unit([y(x - 4, z) - y(x + 4, z), 8, y(x, z - 4) - y(x, z + 4)]);
      v = [x, h, z, ...n, x, z, TEX.STONE, Math.min(Math.max(1 + h / 60, 0.78), 1.2)];
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
            if (x >= r.hole[0] && x < r.hole[2] && z >= r.hole[1] - 8 && z < r.hole[3] + 8) {
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

/** What stands on the relief, on the map's LAYOUT: the boulder field, the dishes on their hill, an orange lamp each side of a ramp's lip, the wrecked lander in the Bowl, and boulders up the crater wall past the bound. */
const sites = (o: number[], def: WorldDef) => {
  const { at } = def.relief!;
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
  const [x, z] = LAYOUT.wreck;
  const h = at(x, z);
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
  base(red, def.relief?.at ?? (() => 0));
  if (def.relief) {
    ravine(red, def);
  }
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
    terrain(o, def);
    sites(o, def);
  }
  stars(o);
  earth(o);
  return o;
};
