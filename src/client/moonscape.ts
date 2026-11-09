// What is drawn around and over the moon level (docs/MOON.md), once, from fixed numbers and a
// hash: red's half (the dome and its windows, the tubes, the pad and its shuttle, masts, rovers,
// boulders) mirrored for blue, then the crater rim, the stars and the Earth. Nothing here is collided
// with. Every part is lit paint (layer -1) or glow (layer -2: windows, lamps, stars, the Earth).
import { TAU } from '../shared/physics';
import type { WorldDef } from '../shared/world';
import { GLOW, glow, ring, tri } from './flag';
import { STRIDE, dot, dress, mix, place, segment, smooth, sub, unit } from './mesh';
import type { Vec3 } from './mesh';
import { hash } from './textures';

/** The play area is x 0..W, z 0..Z, its middle C. The rim runs D metres out, the plain beyond it. */
const [W, Z, D] = [160, 280, 300];
const C: Vec3 = [80, 0, 140];
/** Radius of the star dome and the Earth's distance, metres: 700 from the middle is 540..860 from any spot of the play area, inside the far clip of 900. */
const SKY = 700;
const PAINT = [0.8, 0.82, 0.86];
const GREY = [0.52, 0.54, 0.58];
/** Models whose length runs up (y), along x (hull) or along z (wheels): the frames place() takes. */
const UP: Vec3[] = [
  [1, 0, 0],
  [0, 0, 1],
  [0, 1, 0],
];
const ID: Vec3[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
const HULL: Vec3[] = [
  [0, 0, 1],
  [0, 1, 0],
  [1, 0, 0],
];

const sm = (t: number) => {
  t = Math.min(Math.max(t, 0), 1);
  return t * t * (3 - 2 * t);
};
const cross = (u: Vec3, v: Vec3): Vec3 => [
  u[1] * v[2] - u[2] * v[1],
  u[2] * v[0] - u[0] * v[2],
  u[0] * v[1] - u[1] * v[0],
];
/** Smooth value noise on a lattice, and three octaves of it (in 0..1). */
const noise = (x: number, y: number, s: number) => {
  const [i, j] = [Math.floor(x), Math.floor(y)];
  const [u, v] = [x - i, y - j].map(t => t * t * (3 - 2 * t));
  const h = (a: number, b: number) => hash(i + a, j + b, s);
  return (h(0, 0) * (1 - u) + h(1, 0) * u) * (1 - v) + (h(0, 1) * (1 - u) + h(1, 1) * u) * v;
};
const fbm = (x: number, y: number, s: number) =>
  noise(x, y, s) * 0.55 + noise(x * 2, y * 2, s + 1) * 0.3 + noise(x * 4, y * 4, s + 2) * 0.15;

/** A convex polygon of one colour, wound so that it faces away from `away` when given. */
const face = (o: number[], p: Vec3[], rgb: number[], away?: Vec3) => {
  const n = cross(sub(p[1], p[0]), sub(p[2], p[0]));
  const q = away && dot(n, sub(p[0], away)) < 0 ? [...p].reverse() : p;
  for (let k = 1; k < q.length - 1; k++) {
    tri(o, q[0], q[k], q[k + 1], rgb);
  }
};
/** What `make` adds to `o` glows, k times its colour. */
const lit = (o: number[], k: number, make: () => void) => {
  const from = o.length;
  make();
  glow(o, from, k);
};
const box = (o: number[], lo: Vec3, hi: Vec3, rgb: number[]) => {
  const mid = lo.map((v, i) => (v + hi[i]) / 2) as Vec3;
  const p = (i: number): Vec3 => [
    i & 1 ? hi[0] : lo[0],
    i & 2 ? hi[1] : lo[1],
    i & 4 ? hi[2] : lo[2],
  ];
  for (const f of [
    [0, 1, 3, 2],
    [4, 5, 7, 6],
    [0, 1, 5, 4],
    [2, 3, 7, 6],
    [0, 2, 6, 4],
    [1, 3, 7, 5],
  ]) {
    face(o, f.map(p), rgb, mid);
  }
};
/** Carries a model's vertices to (x, y, z), turned by `yaw` about y. */
const put = (o: number[], v: number[], [x, y, z]: Vec3, yaw = 0) => {
  const [c, s] = [Math.cos(yaw), Math.sin(yaw)];
  for (let i = 0; i < v.length; i += STRIDE) {
    o.push(
      x + c * v[i] + s * v[i + 2],
      y + v[i + 1],
      z - s * v[i] + c * v[i + 2],
      c * v[i + 3] + s * v[i + 5],
      v[i + 4],
      c * v[i + 5] - s * v[i + 3],
      ...v.slice(i + 6, i + 10),
    );
  }
};
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

const TUBE = dress(
  smooth(
    [
      [1, 0],
      [1, 1],
    ],
    12,
  ),
  PAINT,
);
const RIB = dress(
  smooth(
    [
      [1.06, 0],
      [1.06, 0.3],
    ],
    12,
  ),
  [0.35, 0.36, 0.4],
);
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
const WHEEL = dress(
  smooth(
    [
      [0, 0],
      [0.5, 0],
      [0.5, 0.45],
      [0, 0.45],
    ],
    8,
  ),
  [0.12, 0.12, 0.13],
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

/** The dome at (x, z): a drum with a band of windows on a hemisphere over the stepped tiers (radius 22, tops to 16). */
const dome = (o: number[], x: number, z: number) => {
  const R = 22.4;
  const arc = Array.from({ length: 9 }, (_, j): [number, number] => {
    const a = ((j + 1) / 10) * (TAU / 4);
    return [R * Math.cos(a), 5 + 12 * Math.sin(a)];
  });
  place(
    o,
    dress(smooth([[R, 0], [R, 5], ...arc, [0, 17]], 48), PAINT),
    [x, 0, z],
    UP,
    [0, 0, 0],
    1,
  );
  const p = (t: number, y: number): Vec3 => [
    x + (R + 0.06) * Math.cos(t),
    y,
    z + (R + 0.06) * Math.sin(t),
  ];
  for (let i = 0; i < 36; i++) {
    const [a, b] = [(i * TAU) / 36, ((i + 0.6) * TAU) / 36];
    lit(o, 1.6, () =>
      face(o, [p(a, 1.4), p(b, 1.4), p(b, 3.4), p(a, 3.4)], [1, 0.85, 0.5], [x, 2.4, z]),
    );
  }
};

/** The tubes from the dome to the modules, rounded, with a rib every 5 m. */
const TUBES: [Vec3, Vec3][] = [
  [
    [80, 1.75, 236],
    [112, 1.75, 226],
  ],
  [
    [80, 1.75, 236],
    [106, 1.75, 200],
  ],
];
const tubes = (o: number[]) =>
  TUBES.forEach(([a, b]) => {
    const l = Math.hypot(...sub(b, a));
    segment(o, TUBE, a, b, [0, 1, 0], 1, [1.75, 2.1]);
    for (let d = 5; d < l - 1; d += 5) {
      const p = a.map((v, i) => v + ((b[i] - v) * d) / l) as Vec3;
      const q = a.map((v, i) => v + ((b[i] - v) * (d + 0.3)) / l) as Vec3;
      segment(o, RIB, p, q, [0, 1, 0], 0.3, [1.75, 2.1]);
    }
  });

/** The strips of windows on the long faces of the two modules (14 x 5 x 8 at these centres). */
const modules = (o: number[]) => {
  for (const [cx, cz] of [
    [118, 226],
    [112, 200],
  ]) {
    for (const s of [-1, 1]) {
      const z = cz + s * 4.05;
      for (let k = 0; k < 7; k++) {
        const x = cx - 7 + 0.4 + 2 * k;
        lit(o, 1.5, () =>
          face(
            o,
            [
              [x, 2.2, z],
              [x + 1.2, 2.2, z],
              [x + 1.2, 3.8, z],
              [x, 3.8, z],
            ],
            [0.9, 0.95, 1],
            [cx, 2.5, cz],
          ),
        );
      }
    }
  }
};

/** A landing pad (radius 13) with its painted rings and 24 lights, and a shuttle lying on it, nose toward +x. */
const pad = (o: number[], px: number, pz: number) => {
  place(
    o,
    dress(
      smooth(
        [
          [13, 0],
          [13, 0.25],
          [0, 0.25],
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
  ring(o, [px, 0.27, pz], 7.6, 8, [0.8, 0.8, 0.82]);
  for (let i = 0; i < 24; i++) {
    const t = (i * TAU) / 24;
    const [x, z] = [px + 11.6 * Math.cos(t), pz + 11.6 * Math.sin(t)];
    const q = (a: number, b: number): Vec3 => [x + a, 0.3, z + b];
    lit(o, 1.8, () =>
      face(
        o,
        [q(-0.25, -0.25), q(0.25, -0.25), q(0.25, 0.25), q(-0.25, 0.25)],
        i % 3 ? [1, 0.95, 0.8] : [1, 0.45, 0.1],
        [x, -5, z],
      ),
    );
  }
  const s = px - 7;
  const hull: [number, number][] = [
    [0, 0],
    [0.5, 1.6],
    [0.85, 3.5],
    [1, 6],
    [1, 10],
    [0.8, 12.5],
    [0.55, 14],
    [0, 14],
  ];
  place(o, dress(smooth(hull, 12), [0.9, 0.9, 0.92]), [s, 1.8, pz], HULL, [0, 0, 0], [2, 1.5, 1]);
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
  lit(o, 1.4, () => box(o, [s + 2.2, 2.5, pz - 0.7], [s + 4.6, 2.95, pz + 0.7], [0.5, 0.8, 1]));
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

/** A light mast: a pole 10 m high, a foot, a glowing lamp. */
const mast = (o: number[], x: number, z: number) => {
  place(o, POLE, [x, 0, z], UP, [0, 0, 0], [0.2, 0.2, 10]);
  place(o, POLE, [x, 0, z], UP, [0, 0, 0], [0.5, 0.5, 0.5]);
  lit(o, GLOW, () =>
    place(o, BLOB, [x, 10.4, z], UP, [0, 0, 0], [0.55, 0.55, 0.45], [1, 0.93, 0.75]),
  );
};

/** A rover facing +x turned by yaw: body, cab with a glowing visor, four wheels, an antenna. */
const rover = (o: number[], x: number, z: number, yaw: number) => {
  const m: number[] = [];
  box(m, [-1.7, 0.5, -0.9], [1.7, 1.1, 0.9], [0.75, 0.76, 0.8]);
  box(m, [-0.5, 1.1, -0.7], [1, 1.8, 0.7], [0.8, 0.8, 0.84]);
  lit(m, 1.5, () =>
    face(
      m,
      [
        [1.01, 1.25, -0.55],
        [1.01, 1.25, 0.55],
        [1.01, 1.7, 0.55],
        [1.01, 1.7, -0.55],
      ],
      [0.4, 0.7, 1],
      [0, 1.5, 0],
    ),
  );
  for (const a of [-1, 1]) {
    for (const b of [-1, 1]) {
      place(m, WHEEL, [a * 1.1, 0.5, b * 1.05 - 0.225], ID, [0, 0, 0], 1);
    }
  }
  place(m, POLE, [-1.2, 1.1, 0.5], UP, [0, 0, 0], [0.04, 0.04, 1.3]);
  place(m, BLOB, [-1.2, 2.45, 0.5], UP, [0, 0, 0], [0.4, 0.4, 0.12]);
  put(o, m, [x, 0, z], yaw);
};

/** Red's half: everything but the crater, the stars and the Earth. */
const base = (o: number[]) => {
  dome(o, 80, 236);
  tubes(o);
  modules(o);
  pad(o, 40, 220);
  for (const [x, z] of [
    [25, 205],
    [55, 205],
    [25, 235],
    [55, 235],
  ]) {
    mast(o, x, z);
  }
  TUBES.forEach(([a, b], k) => {
    const l = Math.hypot(b[0] - a[0], b[2] - a[2]);
    for (const t of [0.4, 0.8]) {
      const s = (k + (t > 0.5 ? 1 : 0)) % 2 ? 3.4 : -3.4;
      mast(
        o,
        a[0] + (b[0] - a[0]) * t - ((b[2] - a[2]) / l) * s,
        a[2] + (b[2] - a[2]) * t + ((b[0] - a[0]) / l) * s,
      );
    }
  });
  rover(o, 100, 178, 0.6);
  rover(o, 30, 255, -0.4);
  // Boulders along the three walls of the half, small enough to be walked through.
  for (let i = 0; i < 36; i++) {
    const h = (k: number) => hash(i, k, 41);
    const b = Math.floor(h(1) * 3);
    const [x, z] =
      b < 2 ? [(b ? 151 : 0) + h(2) * 9, 150 + h(3) * 122] : [5 + h(2) * 150, 273 + h(3) * 7];
    const r = 0.6 + 2.4 * h(4) ** 2;
    rock(o, [x, r * 0.15, z], r, i, grey(0.2 + 0.15 * h(5)));
  }
};

/** Height of the crater wall outside the play area: from the top of the stone walls (58) to a ragged crest of 60..90 m about 80 m out, then down to the plain. */
const height = (x: number, z: number) => {
  const d = Math.hypot(Math.max(-x, 0, x - W), Math.max(-z, 0, z - Z));
  const crest = 60 + 30 * sm((fbm(x / 70, z / 70, 3) - 0.25) * 2);
  const ridge =
    (1 - Math.abs(2 * fbm(x / 11, z / 11, 7) - 1) - 0.5) *
    18 *
    sm(d / 25) *
    (1 - sm((d - 200) / 100));
  return (d < 80 ? 58 + (crest - 58) * sm(d / 80) : crest * (1 - sm((d - 80) / (D - 80)))) + ridge;
};

/** The crater wall: a grid of 10 m cells round the play area, flat shaded; the plain out to the stars beyond. */
const crater = (o: number[]) => {
  const c = 10;
  for (let i = 0; i < (W + 2 * D) / c; i++) {
    for (let j = 0; j < (Z + 2 * D) / c; j++) {
      const [x, z] = [i * c - D, j * c - D];
      if (x >= 0 && x + c <= W && z >= 0 && z + c <= Z) {
        continue;
      }
      const p = (a: number, b: number): Vec3 => [
        x + a * c,
        height(x + a * c, z + b * c),
        z + b * c,
      ];
      const q = [p(0, 0), p(1, 0), p(1, 1), p(0, 1)];
      const g = (k: number) => 0.2 + 0.1 * hash(i, j, k) + (0.06 * (q[0][1] + q[2][1])) / 180;
      const below: Vec3 = [x, -500, z];
      const [s, t] =
        (i + j) & 1
          ? [
              [0, 1, 2],
              [0, 2, 3],
            ]
          : [
              [0, 1, 3],
              [1, 2, 3],
            ];
      face(
        o,
        s.map(k => q[k]),
        [g(5) * 1.04, g(5), g(5) * 0.95],
        below,
      );
      face(
        o,
        t.map(k => q[k]),
        [g(6) * 1.04, g(6), g(6) * 0.95],
        below,
      );
    }
  }
  for (const [x0, x1, z0, z1] of [
    [-720, -D, -660, 940],
    [W + D, 880, -660, 940],
    [-D, W + D, -660, -D],
    [-D, W + D, Z + D, 940],
  ]) {
    face(
      o,
      [
        [x0, 0, z0],
        [x1, 0, z0],
        [x1, 0, z1],
        [x0, 0, z1],
      ],
      grey(0.2),
      [x0, -50, z0],
    );
  }
  // Boulders on the wall, big against it.
  for (let k = 0, n = 0; n < 90 && k < 3000; k++) {
    const [x, z] = [-D + (W + 2 * D) * hash(k, 1, 51), -D + (Z + 2 * D) * hash(k, 2, 51)];
    const d = Math.hypot(Math.max(-x, 0, x - W), Math.max(-z, 0, z - Z));
    if (d > 3 && d < 150) {
      const r = 3 + 9 * hash(k, 3, 51) ** 3;
      rock(o, [x, height(x, z) + 0.2 * r, z], r, k, grey(0.2 + 0.12 * hash(k, 4, 51)));
      n++;
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

/** The Earth: a disc of 52 m about 40 degrees up, toward blue's side, its cells coloured from noise on a globe: oceans, green and brown land, white clouds and ice. */
const earth = (o: number[]) => {
  const dir = unit([0.3, 0.62, -0.75]);
  const n = dir.map(v => -v) as Vec3;
  const e = unit([n[2], 0, -n[0]]);
  const f = cross(n, e);
  const at = dir.map((v, k) => C[k] + v * SKY) as Vec3;
  const away = dir.map((v, k) => at[k] + v * 100) as Vec3;
  const [N, S] = [28, 64];
  const P = (r: number, a: number) =>
    at.map((c, k) => c + 52 * r * (e[k] * Math.cos(a) + f[k] * Math.sin(a))) as Vec3;
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
export const moonscape = (_def: WorldDef): number[] => {
  const red: number[] = [];
  base(red);
  const o = red.concat(mirror(red));
  crater(o);
  stars(o);
  earth(o);
  return o;
};
