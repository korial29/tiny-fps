// Vertex format and the shapes built from it, shared by the renderer and the models. No DOM.
import { TAU } from '../shared/physics';

export type Vec3 = [number, number, number];

export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const mix = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
export const unit = (a: Vec3): Vec3 => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/**
 * Floats per vertex: position, normal, then c. A map vertex has c = (u, v, texture layer, light),
 * u and v in metres. A player vertex has layer -1 and its flat colour in c.x, c.y, c.w; layer -2 is
 * the same colour, bright and unlit (dust, visors, markers).
 */
export const STRIDE = 10;
/**
 * The layer of polished metal (the guns): a flat colour lit like -1, with a sharp highlight and the
 * sky reflected in it, more at a grazing angle.
 */
export const SHINE = -1.25;

/**
 * Camera axes [right, up, forward]: forward is (-sin yaw cos pitch, sin pitch, -cos yaw cos pitch),
 * y up at roll 0. A positive roll leans the camera right: up tilts toward right.
 */
export const basis = (yaw: number, pitch: number, roll = 0): [Vec3, Vec3, Vec3] => {
  const [sy, cy, sp, cp, sr, cr] = [yaw, pitch, roll].flatMap(a => [Math.sin(a), Math.cos(a)]);
  const r: Vec3 = [cy, 0, -sy];
  const u: Vec3 = [sy * sp, cp, cy * sp];
  return [
    r.map((v, i) => v * cr - u[i] * sr) as Vec3,
    u.map((v, i) => v * cr + r[i] * sr) as Vec3,
    [-sy * cp, sp, -cy * cp],
  ];
};

/**
 * Revolves a profile of [radius, length] points around the axis through `at` along -z: `length`
 * runs forward from `at`. Returns triangles as x, y, z, nx, ny, nz per vertex, `sides` quads per
 * profile segment. The profile goes from back to front and closes on the axis. The normals are
 * smooth around the ring and along the profile (a point takes the mean of its two segments'; on
 * the axis, the axis), so a coarse profile still reads round. A segment that touches the axis is
 * one triangle per side, not a quad.
 */
export const smooth = (
  points: [number, number][],
  sides: number,
  at: Vec3 = [0, 0, 0],
): number[] => {
  const out: number[] = [];
  const profile = points.filter(
    (p, i) => !i || Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1]) > 1e-9,
  );
  // Outward in the (radius, length) plane: the segment tangent turned a quarter.
  const seg = profile.slice(1).map(([r1, l1], k) => {
    const [r0, l0] = profile[k];
    const len = Math.hypot(r1 - r0, l1 - l0);
    return [(l1 - l0) / len, -(r1 - r0) / len];
  });
  const norm = profile.map(([r], k) => {
    const [nr, nl] = [0, 1].map(i => (seg[k - 1]?.[i] ?? 0) + (seg[k]?.[i] ?? 0));
    const h = Math.hypot(nr, nl);
    return r ? [nr / h, nl / h] : [0, Math.sign(nl)];
  });
  const ring = (i: number, k: number) => {
    const [r, l] = profile[k];
    const [c, s] = [Math.cos((i * TAU) / sides), Math.sin((i * TAU) / sides)];
    out.push(at[0] + r * c, at[1] + r * s, at[2] - l, norm[k][0] * c, norm[k][0] * s, -norm[k][1]);
  };
  for (let k = 1; k < profile.length; k++) {
    for (let i = 0; i < sides; i++) {
      // The two triangles of a quad, less the one that has collapsed onto the axis.
      const tris = [
        ...(profile[k - 1][0]
          ? [
              [i, k - 1],
              [i + 1, k - 1],
              [i + 1, k],
            ]
          : []),
        ...(profile[k][0]
          ? [
              [i, k - 1],
              [i + 1, k],
              [i, k],
            ]
          : []),
      ];
      tris.forEach(([j, q]) => ring(j, q));
    }
  }
  return out;
};

/**
 * A tapered capsule along -z from `at`, `len` between the centres of its two end spheres: the
 * radius at equal steps along it is `radii` (more than two for a bulge, a muscle), and each end is
 * a hemisphere of `rings` steps from the equator to the pole, or a flat cut with 0.
 */
export const capsule = (
  len: number,
  radii: number[],
  sides: number,
  [a, b]: [number, number],
  at?: Vec3,
) => {
  /** The steps of an end sphere of radius r short of the equator, pole first; d is -1 at the far end. */
  const cap = (r: number, n: number, l: number, d: number): [number, number][] =>
    Array.from({ length: n }, (_, i) => {
      const t = (i * TAU) / n / 4;
      return [r * Math.sin(t), l - d * r * Math.cos(t)];
    });
  return smooth(
    [
      ...(a ? cap(radii[0], a, 0, 1) : [[0, 0] as [number, number]]),
      ...radii.map((r, i): [number, number] => [r, (len * i) / (radii.length - 1)]),
      ...(b ? cap(radii[radii.length - 1], b, len, -1).reverse() : [[0, len] as [number, number]]),
    ],
    sides,
    at,
  );
};

/** smooth() vertices (position, normal) given a flat colour, in the vertex format above. */
export const dress = (v: number[], [r, g, b]: number[]): number[] =>
  Array.from({ length: v.length * (STRIDE / 6) }, (_, i) => {
    const [k, j] = [Math.floor(i / STRIDE), i % STRIDE];
    return j < 6 ? v[k * 6 + j] : [r, g, -1, b][j - 6];
  });

/**
 * Levels of detail of a solid: sides around, and rings from the equator to the pole of a round
 * end. Far runners, near runners, the own hands and arms.
 */
export const DETAIL: [number, number][] = [
  [5, 1],
  [7, 2],
  [10, 3],
];

const solids = new Map<string, number[]>();

/**
 * A white capsule (see capsule) at a level of detail, built once: tinted when placed. `ends` is
 * the fraction of the level's rings each end gets, 0 for a flat cut: an end buried in the next part
 * can be cheap. The coarsest level keeps three radii at most. A sphere is a capsule of no length,
 * an ellipsoid that sphere scaled by place().
 */
export const solid = (
  lod: number,
  len: number,
  radii: number[],
  ends: [number, number] = [1, 1],
) => {
  const [sides, rings] = DETAIL[lod];
  if (!lod && radii.length > 3) {
    radii = [radii[0], radii[radii.length >> 1], radii[radii.length - 1]];
  }
  const key = `${lod} ${len} ${radii} ${ends}`;
  let v = solids.get(key);
  if (!v) {
    v = dress(
      capsule(len, radii, sides, ends.map(e => Math.ceil(rings * e)) as [number, number]),
      [1, 1, 1],
    );
    solids.set(key, v);
  }
  return v;
};

/**
 * Appends model-space vertices (x right, y up, -z forward) scaled by k (one factor, or one per
 * axis), then carried to the world: axes `[r, u, f]` at eye, moved by off = (right, up, forward)
 * along them. `tint` multiplies the flat colour. A normal is turned with the inverse of the scale,
 * so an ellipsoid made of a sphere shades like one. Written without allocations: a body is placed
 * a thousand vertices at a time.
 */
export const place = (
  out: number[],
  src: number[],
  eye: Vec3,
  [r, u, f]: Vec3[],
  off: Vec3,
  k: number | Vec3,
  tint: number[] = [1, 1, 1],
) => {
  const [kx, ky, kz] = typeof k == 'number' ? [k, k, k] : k;
  const even = kx == ky && ky == kz;
  const [rx, ry, rz, ux, uy, uz, fx, fy, fz] = [...r, ...u, ...f];
  const ox = eye[0] + rx * off[0] + ux * off[1] + fx * off[2];
  const oy = eye[1] + ry * off[0] + uy * off[1] + fy * off[2];
  const oz = eye[2] + rz * off[0] + uz * off[1] + fz * off[2];
  for (let i = 0; i < src.length; i += STRIDE) {
    const [x, y, z] = [src[i] * kx, src[i + 1] * ky, src[i + 2] * kz];
    let [m, n, w] = [src[i + 3], src[i + 4], src[i + 5]];
    if (!even) {
      [m, n, w] = [m / kx, n / ky, w / kz];
      const h = Math.sqrt(m * m + n * n + w * w) || 1;
      [m, n, w] = [m / h, n / h, w / h];
    }
    out.push(
      ox + rx * x + ux * y - fx * z,
      oy + ry * x + uy * y - fy * z,
      oz + rz * x + uz * y - fz * z,
      rx * m + ux * n - fx * w,
      ry * m + uy * n - fy * w,
      rz * m + uz * n - fz * w,
      src[i + 6] * tint[0],
      src[i + 7] * tint[1],
      src[i + 8],
      src[i + 9] * tint[2],
    );
  }
};

/** Dims by `k` the glow (layer -2) of the vertices of `out` from the float `from` on: a light that is off, or coming on. */
export const dim = (out: number[], from: number, k: number) => {
  for (let i = from; k < 1 && i < out.length; i += STRIDE) {
    if (out[i + 8] == -2) {
      out[i + 6] *= k;
      out[i + 7] *= k;
      out[i + 9] *= k;
    }
  }
};

/**
 * Axes [r, u, f] with f along the unit vector `to` and r as near `side` as it can be: the frame of
 * a bone, which `place` takes. Right-handed like `basis`.
 */
export const aim = (to: Vec3, side: Vec3): [Vec3, Vec3, Vec3] => {
  const d = to[0] * side[0] + to[1] * side[1] + to[2] * side[2];
  const r = side.map((v, i) => v - to[i] * d) as Vec3;
  const l = Math.hypot(...r) || 1;
  const [x, y, z] = r.map(v => v / l);
  return [[x, y, z], [y * to[2] - z * to[1], z * to[0] - x * to[2], x * to[1] - y * to[0]], to];
};

/**
 * Places the solid `src`, built `len` long, from `a` to `b`: stretched to the distance between
 * them, `k` wide (a number, or across `side` and across the other way), `side` being where
 * its x axis points as near as it can.
 */
export const segment = (
  out: number[],
  src: number[],
  a: Vec3,
  b: Vec3,
  side: Vec3,
  len: number,
  k: number | [number, number] = 1,
  tint?: number[],
) => {
  const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const l = Math.hypot(...d) || 1;
  const [kx, ky] = typeof k == 'number' ? [k, k] : k;
  place(out, src, a, aim([d[0] / l, d[1] / l, d[2] / l], side), [0, 0, 0], [kx, ky, l / len], tint);
};
