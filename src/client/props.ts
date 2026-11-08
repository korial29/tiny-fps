// The things lying on the roofs: a team's gun rack (a stand in its colour with a gun turning over
// it) and the health packs (a white box with a glowing green cross, bobbing). Pure functions of the
// place and the clock, in the renderer's vertex format. Lit and shadowed, but the glow parts.
import { RACK_R } from '../shared/constants';
import { GLOW, glow, ring, teamRgb, tri } from './flag';
import { gun, railgun, rifle } from './gun';
import { sword } from './katana';
import { STRIDE, basis, place, segment, solid } from './mesh';
import type { Vec3 } from './mesh';

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
export const rack = (out: number[], at: Vec3, rgb: number[], t: number, kind = 0) => {
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
  out: number[],
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

/** A box of half side `h` turning and bobbing a little over `at` (on a top), `glyph` glowing in `lit` on each face. */
const crate = (
  out: number[],
  at: Vec3,
  t: number,
  h: number,
  rgb: number[],
  glyph: Glyph,
  lit: number[],
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
      tri(out, q(...a, 1.01), q(...b, 1.01), q(...c, 1.01), lit);
    }
    for (let i = from; i < out.length; i += STRIDE) {
      out[i + 8] = -2;
    }
  }
};

/** A health pack at `at`: a white box with a glowing green cross on each side. */
export const kit = (out: number[], at: Vec3, t: number) =>
  crate(out, at, t, 0.17, [0.86, 0.9, 0.88], CROSS, [0.1, 1.2, 0.4]);

/** An ammo pack at `at`: a violet box with a glowing cyan cartridge on each side, the gun's colours. */
export const cell = (out: number[], at: Vec3, t: number) =>
  crate(out, at, t, 0.15, [0.34, 0.14, 0.58], BULLET, [0.3, 1.4, 1.8]);

/** A rail cell at `at`: a gunmetal box with a glowing violet-white bolt on each side, the rail gun's colours. */
export const battery = (out: number[], at: Vec3, t: number) =>
  crate(out, at, t, 0.15, [0.14, 0.15, 0.18], BOLT, [1.1, 0.85, 2.6]);
