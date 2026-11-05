// The parts of a person that the own body and the runners share, from the smooth solids of mesh.ts:
// a jacket with its hips, a shoe, a hand with fingers that curl. Built once per level of detail,
// tinted and placed per frame. No DOM, no state.
import { aim, dot, mix, place, segment, solid, unit } from './mesh';
import type { Vec3 } from './mesh';

export const SKIN = [0.66, 0.45, 0.35];
export const SOLE = [0.82, 0.82, 0.84];

/** Radii at equal steps along each limb segment, in metres: a shoulder, a biceps, a calf. */
export const RADII = {
  upper: [0.055, 0.052, 0.042],
  fore: [0.04, 0.043, 0.03],
  thigh: [0.09, 0.08, 0.058],
  shin: [0.056, 0.06, 0.05, 0.037],
};

/** The jacket from the hem to the collar: half widths at equal steps along the spine. */
const JACKET = [0.17, 0.153, 0.16, 0.18, 0.196, 0.2, 0.09];
export const SPINE = 0.62;

/** A body's axes from where it faces, `up` being the world's. */
export const frame = (fwd: Vec3, right: Vec3) => aim(fwd, right);

/**
 * The jacket and the hips of a body whose pelvis is at `pelvis`, the spine going up along `spine`
 * (unit) and shortened to `k` of its length, facing `fwd`. A torso is wider than it is deep.
 */
export const torso = (
  out: number[],
  lod: number,
  pelvis: Vec3,
  spine: Vec3,
  fwd: Vec3,
  right: Vec3,
  jacket: number[],
  trousers: number[],
  k = 1,
) => {
  const top: Vec3 = pelvis.map((v, i) => v + spine[i] * SPINE * k) as Vec3;
  segment(out, solid(lod, SPINE, JACKET, [0, 0]), pelvis, top, right, SPINE, [1, 0.62], jacket);
  place(
    out,
    solid(lod, 0, [1, 1]),
    pelvis,
    aim(fwd, right),
    [0, -0.02, 0],
    [0.165, 0.11, 0.13],
    trousers,
  );
};

/** A neck, skin, from inside the jacket up into the head: `pelvis` and `spine` as for torso(). */
export const neck = (out: number[], lod: number, pelvis: Vec3, spine: Vec3, right: Vec3) =>
  segment(
    out,
    solid(lod, 0.17, [0.06, 0.055], [0, 0.5]),
    pelvis.map((v, i) => v + spine[i] * 0.55) as Vec3,
    pelvis.map((v, i) => v + spine[i] * 0.72) as Vec3,
    right,
    0.17,
    1,
    SKIN,
  );

/**
 * A shoe on the ankle `end`, toes toward `fwd` (unit, flat) and turned a little to stay square to
 * the shin (unit, knee to ankle): an ellipsoid sole, a level coarser than the upper over it, and
 * from the finest level a toe cap. The ankle is 7 cm above the floor.
 */
export const shoe = (
  out: number[],
  lod: number,
  end: Vec3,
  shin: Vec3,
  fwd: Vec3,
  right: Vec3,
  upper: number[],
) => {
  const k = dot(fwd, shin) * 0.6;
  const axes = aim(unit([fwd[0] - shin[0] * k, fwd[1] - shin[1] * k, fwd[2] - shin[2] * k]), right);
  const small = solid(0, 0, [1, 1]);
  place(
    out,
    solid(lod && lod - 1, 0, [1, 1]),
    end,
    axes,
    [0, -0.048, 0.045],
    [0.05, 0.022, 0.135],
    SOLE,
  );
  place(out, solid(lod, 0, [1, 1]), end, axes, [0, -0.015, 0.03], [0.046, 0.042, 0.115], upper);
  if (lod > 1) {
    place(out, small, end, axes, [0, -0.04, 0.125], [0.042, 0.028, 0.05], SOLE);
  }
};

/** A finger segment, 4 cm, in the coarsest level: it is small, and there are ten a hand. */
const FINGER = () => solid(0, 0.04, [0.0105, 0.0095], [1, 2]);
/** Finger lengths against 4 cm, index to little. */
const LENGTH = [1, 1.1, 1, 0.82];
/** The thumb's two segments open and in a fist, as directions in the hand (x toward the thumb). */
const THUMB: [Vec3, Vec3][] = [
  [
    [0.55, -0.2, 0.8],
    [0.2, -0.75, 0.6],
  ],
  [
    [0.4, -0.1, 0.9],
    [-0.55, -0.5, 0.65],
  ],
];

/**
 * A hand at the wrist `end`, the fingers toward `dir` (unit), its back along the up of
 * aim(dir, side): a palm, four fingers of two segments each and a thumb. `curl` runs from 0, a
 * flat open hand, to 1, a fist. `t` is the side of the thumb: 1 on the right of the hand.
 */
export const hand = (
  out: number[],
  end: Vec3,
  dir: Vec3,
  side: Vec3,
  t: number,
  curl: number,
  tint = SKIN,
) => {
  const [r, u, f] = aim(dir, side);
  /** Hand space (x toward the thumb, y the back, z toward the fingers) to the world. */
  const at = ([x, y, z]: Vec3): Vec3 => [
    end[0] + r[0] * x * t + u[0] * y + f[0] * z,
    end[1] + r[1] * x * t + u[1] * y + f[1] * z,
    end[2] + r[2] * x * t + u[2] * y + f[2] * z,
  ];
  /** Segments of lengths `l` from `from` along `dirs` (hand space), `w` times as wide. */
  const chain = (from: Vec3, dirs: Vec3[], l: number, w: number) =>
    dirs.reduce((p, d, i) => {
      const q: Vec3 = [p[0] + d[0] * l, p[1] + d[1] * l, p[2] + d[2] * l];
      segment(out, FINGER(), at(p), at(q), r, 0.04, w * 0.88 ** i, tint);
      return q;
    }, from);
  place(out, solid(1, 0, [1, 1]), end, [r, u, f], [0, 0, 0.045], [0.0425, 0.02, 0.058], tint);
  for (let i = 0; i < 4; i++) {
    const [a, b] = [0.1 + 1.3 * curl, 0.2 + 3 * curl];
    const splay = -(i - 1.5) * 0.08 * (1 - curl);
    chain(
      [0.0315 - 0.021 * i, -0.004, 0.092],
      [a, b].map(n => unit([splay, -Math.sin(n), Math.cos(n)])),
      0.04 * LENGTH[i],
      1,
    );
  }
  chain(
    [0.034, -0.012, 0.025],
    THUMB.map(([open, fist]) => unit(mix(open, fist, curl))),
    0.037,
    1.25,
  );
};
