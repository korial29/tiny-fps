// What is drawn around and over the moon level (docs/MOON.md), once, from fixed numbers and a
// hash: red's half (the dome and its windows, the tubes, the pad and its shuttle, masts, boulders) mirrored for blue, then the relief round the arena out over the crater wall, what
// stands on it, the stars and the Earth. Nothing here is collided with. Every part is lit paint
// (layer -1) or glow (layer -2: windows, lamps, stars, the Earth), but the relief and the small
// craters on the floor, in the floor's own stone.
import { LAYOUT } from '../shared/moon';
import { TAU } from '../shared/physics';
import { raise } from '../shared/relief';
import { TEX } from '../shared/types';
import type { WorldDef } from '../shared/world';
import { GLOW, glow, ring, tri } from './flag';
import { STRIDE, dress, mix, place, smooth, unit } from './mesh';
import type { Vec3 } from './mesh';
import { UP, box, cross, face, lit, moonbase } from './moonbase';
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
/** An octahedron cut once: 32 triangles, to be pushed out into a rock. */
const OCT = (() => {
  const out: Vec3[][] = [];
  const add = (p: Vec3, q: Vec3): Vec3 => [p[0] + q[0], p[1] + q[1], p[2] + q[2]];
  for (const s of [-1, 1]) {
    for (const t of [-1, 1]) {
      for (const u of [-1, 1]) {
        const [a, b, c]: Vec3[] = [
          [s, 0, 0],
          [0, t, 0],
          [0, 0, u],
        ];
        const [ab, bc, ca] = [add(a, b), add(b, c), add(c, a)];
        out.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]);
      }
    }
  }
  return out;
})();

/** A rock of radius about r (seed s) half sunk at `at`: each direction pushed out by a hash, so the pieces meet. */
const rock = (o: number[], at: Vec3, r: number, s: number, rgb: number[]) => {
  const pt = (d: Vec3): Vec3 => {
    const l = Math.hypot(...d);
    const [a, b, c] = d.map(v => Math.round((v / l) * 30));
    const k = (r * (0.6 + 0.8 * hash(a + 97 * b, c, s))) / l;
    return [at[0] + d[0] * k, at[1] + d[1] * k * 0.65, at[2] + d[2] * k];
  };
  OCT.forEach((f, i) =>
    face(
      o,
      f.map(pt),
      rgb.map(v => v * (0.85 + 0.3 * hash(i, s, 3))),
      at,
    ),
  );
};
const grey = (g: number) => [g, g, g * 0.95];

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

/** Red's half: everything but the crater, the stars and the Earth, on the map's LAYOUT. */
const base = (o: number[]) => {
  moonbase(o);
  const [px, pz] = LAYOUT.pads[0];
  pad(o, px, pz, LAYOUT.shuttles[0].min[0]);
  for (const [x, z] of LAYOUT.masts.slice(0, 6)) {
    mast(o, x, z, x < 60 ? 0.25 : 0);
  }
  // Boulders along the three walls of the half, small enough to be walked through.
  for (let i = 0; i < 36; i++) {
    const h = (k: number) => hash(i, k, 41);
    const b = Math.floor(h(1) * 3);
    const [x, z0] =
      b < 2 ? [(b ? 151 : 0) + h(2) * 9, 150 + h(3) * 122] : [5 + h(2) * 150, 273 + h(3) * 7];
    // Not on the map's own boulder at (4..8, 172..176).
    const z = z0 + (b === 0 && Math.abs(z0 - 174) < 8 ? 16 : 0);
    const r = 0.6 + 2.4 * h(4) ** 2;
    rock(o, [x, r * 0.15, z], r, i, grey(0.2 + 0.15 * h(5)));
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
  [0, 1, 2, 3, 4].every(k => {
    const [u, v] = k ? [x + r * Math.cos(k * 1.57), z + r * Math.sin(k * 1.57)] : [x, z];
    const over = (b: (typeof brushes)[0], m: number) =>
      u > b.min[0] - m && u < b.max[0] + m && v > b.min[2] - m && v < b.max[2] + m;
    return (
      Math.abs(u - C[0]) <= C[0] - 0.5 &&
      Math.abs(v - C[2]) <= C[2] - 0.5 &&
      brushes.some(b => b.max[1] == 0 && over(b, 0)) &&
      !brushes.some(b => b.max[1] > 0 && over(b, 0.5))
    );
  });

/**
 * Small craters on the floor, 60 of 1.2 to 5 m wide, where nothing stands: a shallow bowl
 * darker than the floor and a raised lip, in its stone texture, the slopes' normals steepened
 * so the sun lights one side of the lip and shades the other, and none within 6 m of where a rover
 * is parked. They are not collided with.
 */
const craters = (o: number[], def: WorldDef) => {
  const N = 12;
  for (let k = 0, n = 0; n < 60 && k < 900; k++) {
    const [x, z, r] = [W * hash(k, 1, 61), Z * hash(k, 2, 61), 0.6 + 2 * hash(k, 3, 61) ** 2];
    if (
      !bare(def, x, z, 1.5 * r) ||
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
    if (
      !(x0 < x1 && z0 < z1) ||
      (x0 >= r.hole[0] && x1 <= r.hole[2] && z0 >= r.hole[1] && z1 <= r.hole[3])
    ) {
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
  // The rille's two ends, under the ground's edge: its end walls.
  for (const [x, n] of [
    [r.hole[0], 1],
    [r.hole[2], -1],
  ]) {
    const p = (z: number, h: number) => [x, h, z, n, 0, 0, z, h, TEX.STONE, 1];
    o.push(
      ...p(132, -30),
      ...p(148, -30),
      ...p(148, 0),
      ...p(132, -30),
      ...p(148, 0),
      ...p(132, 0),
    );
  }
};

/** What stands on the relief, on the map's LAYOUT: the boulder field, the dishes on their hill, an orange lamp each side of a ramp's lip, the wrecked lander in the Bowl, and boulders up the crater wall past the bound. */
const sites = (o: number[], def: WorldDef) => {
  const { at } = def.relief!;
  LAYOUT.rocks.forEach(([x, z, r], i) =>
    rock(o, [x, at(x, z) + 0.15 * r, z], r, i + 7, grey(0.24 + 0.1 * hash(i, 5, 43))),
  );
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
  for (let k = 0; k < 90; k++) {
    const [f, t] = [1.03 + 0.22 * hash(k, 1, 51), TAU * hash(k, 2, 51)];
    const [u, v] = [C[0] + 300 * f * Math.cos(t), C[2] + 360 * f * Math.sin(t)];
    const r = 3 + 9 * hash(k, 3, 51) ** 3;
    rock(o, [u, at(u, v) - 0.4 * r, v], r, k, grey(0.2 + 0.12 * hash(k, 4, 51)));
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
  const o = red.concat(mirror(red));
  craters(o, def);
  if (def.relief) {
    terrain(o, def);
    sites(o, def);
  }
  stars(o);
  earth(o);
  return o;
};
