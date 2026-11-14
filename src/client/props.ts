// The things lying on the roofs: a team's gun rack (a stand in its colour with a gun turning over
// it), the health packs (a white box with a glowing green cross, bobbing) and the armour. Pure functions of the
// place and the clock, in the renderer's vertex format. Lit and shadowed, but the glow parts.
import { RACK_R } from '../shared/constants';
import { GLOW, glow, ring, teamRgb, tri } from './flag';
import { gun, railgun, rifle } from './gun';
import { sword } from './katana';
import { GILT, GLOSS, STRIDE, basis, dim, place, segment, solid } from './mesh';
import type { Vec3 } from './mesh';
import { room } from './verts';
import type { Out } from './verts';

/**
 * The packs of `all` whose bit is set in `mask`, if any: the ones that are there to take. The bits
 * count from `from`: the ammo packs come after the health packs.
 */
export const packsOf = (all: readonly Vec3[] = [], mask = 0, from = 0): Vec3[] =>
  all.filter((_, n) => Math.floor(mask / 2 ** (from + n)) % 2 === 1);

/**
 * A rack at `at` (a point on a top): a post and a dish, a ring on the roof of the radius that gives
 * the weapon, and the weapon over it: the gun, or by `kind` the katana (1), crackling, the rail
 * gun (2) or the laser rifle (3).
 */
export const rack = (out: Out, at: Vec3, rgb: number[], t: number, kind = 0) => {
  const dark = rgb.map(c => c * 0.45);
  segment(
    out,
    solid(1, 1, [1, 1], [0, 0]),
    at,
    [at[0], at[1] + 0.72, at[2]],
    [1, 0, 0],
    1,
    0.06,
    dark,
  );
  const [x, y, z] = at;
  place(out, solid(1, 0, [1, 1]), [x, y + 0.74, z], basis(0, 0), [0, 0, 0], [0.3, 0.035, 0.3], rgb);
  const from = out.length;
  ring(out, [x, y + 0.045, z], RACK_R - 0.07, RACK_R, rgb);
  glow(out, from, 1.2 * GLOW * (0.7 + 0.3 * Math.sin(t * 2.5)));
  const over: Vec3 = [x, y + 1.05 + 0.04 * Math.sin(t * 2), z];
  const ax = basis(t * 0.8, 0);
  if (kind == 1) {
    // Lying level, turning about its middle, 42 cm ahead of the grip.
    sword(out, over.map((v, i) => v - ax[2][i] * 0.42) as Vec3, ax, 0, t);
  } else {
    place(out, [gun, gun, railgun, rifle][kind](0), over, ax, [0, 0, 0], kind == 3 ? 1.2 : 1.5);
  }
};

/** Each team's gun rack, katana rack, rail gun rack and laser rifle rack, where it has them. */
export const racks = (
  out: Out,
  guns: readonly (Vec3 | undefined)[] = [],
  blades: readonly (Vec3 | undefined)[] = [],
  t = 0,
  rails: readonly (Vec3 | undefined)[] = [],
  rifles: readonly (Vec3 | undefined)[] = [],
) =>
  [guns, blades, rails, rifles].forEach((list, kind) =>
    list.forEach((at, team) => at && rack(out, at, teamRgb(team), t, kind)),
  );

/** The faces of a cube: the normal and the two edges. */
const FACES: Vec3[][] = [
  [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
  [
    [-1, 0, 0],
    [0, 0, 1],
    [0, 1, 0],
  ],
  [
    [0, 1, 0],
    [0, 0, 1],
    [1, 0, 0],
  ],
  [
    [0, -1, 0],
    [1, 0, 0],
    [0, 0, 1],
  ],
  [
    [0, 0, 1],
    [1, 0, 0],
    [0, 1, 0],
  ],
  [
    [0, 0, -1],
    [0, 1, 0],
    [1, 0, 0],
  ],
];

/** A glyph on a face: triangles of points across and up the face, in metres from its middle. */
type Glyph = [number, number][][];
/** A rectangle as two triangles. */
const rect = (a: number, b: number, d: number, e: number): Glyph => [
  [
    [a, b],
    [d, b],
    [d, e],
  ],
  [
    [a, b],
    [d, e],
    [a, e],
  ],
];
const CROSS: Glyph = [...rect(-0.13, -0.04, 0.13, 0.04), ...rect(-0.04, -0.13, 0.04, 0.13)];
/** A cartridge: a round, a pointed tip and a rim. */
const BULLET: Glyph = [
  ...rect(-0.035, -0.09, 0.035, 0.04),
  [
    [-0.035, 0.04],
    [0.035, 0.04],
    [0, 0.11],
  ],
  ...rect(-0.05, -0.12, 0.05, -0.095),
];

/** A bolt of lightning: a stroke down to the left, then one down to the right. */
const BOLT: Glyph = [
  [
    [0.03, 0.13],
    [-0.06, 0],
    [0.02, 0],
  ],
  [
    [-0.02, 0.01],
    [0.06, 0.01],
    [-0.03, -0.13],
  ],
];

/** A shield: a square top and a point at the bottom. */
const SHIELD: Glyph = [
  ...rect(-0.11, 0, 0.11, 0.12),
  [
    [-0.11, 0],
    [0, -0.14],
    [0.11, 0],
  ],
];

/** A box of half side `h` turning and bobbing a little over `at` (on a top), `glyph` glowing in `lit` on each face, `k` times its size. */
const crate = (
  out: Out,
  at: Vec3,
  t: number,
  h: number,
  rgb: number[],
  glyph: Glyph,
  lit: number[],
  k = 1,
) => {
  const [r, , f] = basis(t * 0.9, 0);
  const o: Vec3 = [at[0], at[1] + 0.45 + 0.07 * Math.sin(t * 2.2 + at[0]), at[2]];
  /** A box-space vector to the world. */
  const w = ([a, b, d]: Vec3): Vec3 => [r[0] * a - f[0] * d, b, r[2] * a - f[2] * d];
  for (const [n, u, v] of FACES) {
    const q = (a: number, b: number, k: number): Vec3 => {
      const [X, Y, Z] = w([0, 1, 2].map(i => n[i] * h * k + u[i] * a + v[i] * b) as Vec3);
      return [o[0] + X, o[1] + Y, o[2] + Z];
    };
    tri(out, q(-h, -h, 1), q(h, -h, 1), q(h, h, 1), rgb);
    tri(out, q(-h, -h, 1), q(h, h, 1), q(-h, h, 1), rgb);
    const from = out.length;
    for (const [a, b, c] of glyph) {
      const g = ([x, y]: [number, number]) => q(x * k, y * k, 1.01);
      tri(out, g(a), g(b), g(c), lit);
    }
    const a = room(out, 0);
    for (let i = from; i < out.length; i += STRIDE) {
      a[i + 8] = -2;
    }
  }
};

/** How much bigger the health and ammo packs are than they were (the user, 2026-11-14: bigger). */
const BIG = 1.5;

/** A health pack at `at`: a white box with a glowing green cross on each side. */
export const kit = (out: Out, at: Vec3, t: number) =>
  crate(out, at, t, 0.17 * BIG, [0.86, 0.9, 0.88], CROSS, [0.1, 1.2, 0.4], BIG);

/** An ammo pack at `at`: a violet box with a glowing cyan cartridge on each side, the gun's colours. */
export const cell = (out: Out, at: Vec3, t: number) =>
  crate(out, at, t, 0.15 * BIG, [0.34, 0.14, 0.58], BULLET, [0.3, 1.4, 1.8], BIG);

/** A rail cell at `at`: a gunmetal box with a glowing violet-white bolt on each side, the rail gun's colours. */
export const battery = (out: Out, at: Vec3, t: number) =>
  crate(out, at, t, 0.15, [0.14, 0.15, 0.18], BOLT, [1.1, 0.85, 2.6]);

/** The armour's green, its grooves', its inside's, and its glowing shield's. */
const ARMOUR = [0.16, 0.85, 0.22];
const GROOVE = [0.05, 0.26, 0.07];
const INSIDE = [0.04, 0.12, 0.05];
const EMBLEM = [0.9, 1.7, 0.35];

/** The cuirass's half width and half depth at the height y (-0.25 to 0.25 m): broad at the chest, in at the waist. */
const girth = (y: number): [number, number] => [
  0.145 + 0.075 * Math.sqrt(Math.max(0, y + 0.25)),
  0.09 + 0.05 * Math.sqrt(Math.max(0, y + 0.25)),
];

/**
 * Its edges at the angle a round it (0 in front): the top dips in a neckline front and back and
 * deep into an armhole at each side, the shoulders between; the bottom comes to a point in front.
 */
const edges = (a: number): [number, number] => {
  const [c, s] = [Math.cos(a), Math.abs(Math.sin(a))];
  return [
    -0.25 - 0.05 * Math.max(0, c) ** 6,
    0.25 - 0.24 * s ** 4 - 0.09 * Math.max(0, c) ** 8 - 0.04 * Math.max(0, -c) ** 8,
  ];
};

/** The point of the cuirass at the angle a and the share t of the way up, `k` of its size. */
const shellAt = (a: number, t: number, k = 1): Vec3 => {
  const [lo, hi] = edges(a);
  const y = lo + t * (hi - lo);
  const [w, d] = girth(y);
  // The chest stands out in front, over the belly.
  const chest =
    0.025 * Math.max(0, Math.cos(a)) ** 2 * Math.max(0, Math.sin((Math.PI * (y + 0.05)) / 0.3));
  return [Math.sin(a) * w * k, y, -(Math.cos(a) * d + chest) * k];
};

let cuirass: number[] | undefined;

/** The outward normal of the cuirass at the angle a and the share t of the way up. */
const shellNormal = (a: number, t: number): Vec3 => {
  const e = 1e-3;
  const [p, q, r] = [shellAt(a, t), shellAt(a + e, t), shellAt(a, t + e)];
  const [u, v] = [q.map((c, i) => c - p[i]), r.map((c, i) => c - p[i])];
  const n: Vec3 = [u[2] * v[1] - u[1] * v[2], u[0] * v[2] - u[2] * v[0], u[1] * v[0] - u[0] * v[1]];
  const l = Math.hypot(...n) || 1;
  return n.map(c => c / l) as Vec3;
};

/**
 * The armour (the user, 2026-11-14: a green armour as in Quake 3, and it must shine), built once in
 * model space: a shell of polished green metal (GILT: a sharp highlight and the sky in it tinted by
 * its colour, smooth normals so they glide) round the chest and back, open at the neck and the
 * arms, grooves across the belly, a plate on each shoulder and a glowing shield on the chest.
 */
const armour = (): number[] => {
  if (cuirass) {
    return cuirass;
  }
  const out: number[] = [];
  const [N, M] = [32, 16];
  const at = (i: number, j: number, k: number) => shellAt(((i / N) * 2 - 1) * Math.PI, j / M, k);
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < M; j++) {
      // The belly's grooves: the rows between its plates, in front.
      const front = Math.abs(((i + 0.5) / N) * 2 - 1) < 0.35;
      const [cr, cg, cb] = front && (j == 2 || j == 4 || j == 6) ? GROOVE : ARMOUR;
      for (const [di, dj] of [
        [0, 0],
        [1, 1],
        [1, 0],
        [0, 0],
        [0, 1],
        [1, 1],
      ]) {
        const a = (((i + di) / N) * 2 - 1) * Math.PI;
        out.push(...at(i + di, j + dj, 1), ...shellNormal(a, (j + dj) / M), cr, cg, GILT, cb);
      }
      // The inside, a little in, facing in.
      const [e, f, g, h] = [
        at(i, j, 0.96),
        at(i + 1, j, 0.96),
        at(i + 1, j + 1, 0.96),
        at(i, j + 1, 0.96),
      ];
      tri(out, e, f, g, INSIDE);
      tri(out, e, g, h, INSIDE);
    }
  }
  for (let i = 0; i < out.length; i += STRIDE) {
    if (out[i + 8] == -1) {
      out[i + 8] = GLOSS;
    }
  }
  // The shoulder plates, over the tops between the neck and the armholes, sloping down outward.
  for (const x of [-1, 1]) {
    place(
      out,
      solid(2, 0, [1]),
      [x * 0.165, 0.19, 0.005],
      basis(0, 0, x * 0.5),
      [0, 0, 0],
      [0.1, 0.045, 0.125],
      ARMOUR,
    );
  }
  for (let i = out.length - 2 * solid(2, 0, [1]).length; i < out.length; i += STRIDE) {
    out[i + 8] = GILT;
  }
  // The shield on the chest, a little proud of it.
  const z = shellAt(0, 0.62)[2] - 0.012;
  const from = out.length;
  for (const [p, q, r] of SHIELD) {
    const v = (u: [number, number]): Vec3 => [u[0] * 0.55, shellAt(0, 0.62)[1] + u[1] * 0.55, z];
    tri(out, v(p), v(q), v(r), EMBLEM);
  }
  for (let i = from; i < out.length; i += STRIDE) {
    out[i + 8] = -2;
  }
  return (cuirass = out);
};

/** An armour at `at`: a green cuirass turning and bobbing over it, its shield pulsing. */
export const vest = (out: Out, at: Vec3, t: number) => {
  const from = out.length;
  place(
    out,
    armour(),
    [at[0], at[1] + 0.6 + 0.07 * Math.sin(t * 2.2 + at[0]), at[2]],
    basis(t * 0.9, 0),
    [0, 0, 0],
    1,
  );
  dim(out, from, 0.75 + 0.25 * Math.sin(t * 3));
};
