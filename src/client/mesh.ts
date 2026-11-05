// Vertex format and the shapes built from it, shared by the renderer and the models. No DOM.
import { TAU } from '../shared/physics';

export type Vec3 = [number, number, number];

/**
 * Floats per vertex: position, normal, then c. A map vertex has c = (u, v, texture layer, light),
 * u and v in metres. A player vertex has layer -1 and its flat colour in c.x, c.y, c.w; layer -2 is
 * the same colour, bright and unlit (dust, visors, markers).
 */
export const STRIDE = 10;

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

/** The corners of a unit square's two triangles, in the square's own units. */
export const QUAD = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, -1],
  [1, 1],
  [-1, 1],
];

/**
 * Appends the 36 vertices of a box centred on (cx, cy, cz) with half sizes (hx, hy, hz), turned
 * by yaw about its own vertical axis (local forward, -z, ends up along forward(yaw)).
 */
export const pushBox = (
  out: number[],
  [cx, cy, cz]: Vec3,
  [hx, hy, hz]: Vec3,
  yaw: number,
  color: number[],
  layer = -1,
) => {
  const [s, k] = [Math.sin(yaw), Math.cos(yaw)];
  const turn = (x: number, z: number) => [x * k + z * s, -x * s + z * k];
  for (let a = 0; a < 3; a++) {
    for (const side of [-1, 1]) {
      const [b, d] = [(a + 1) % 3, (a + 2) % 3];
      const n: Vec3 = [0, 0, 0];
      n[a] = side;
      const [nx, nz] = turn(n[0], n[2]);
      for (const [i, j] of QUAD) {
        const l: Vec3 = [0, 0, 0];
        [l[a], l[b], l[d]] = [side, i, j];
        const [x, z] = turn(l[0] * hx, l[2] * hz);
        out.push(cx + x, cy + l[1] * hy, cz + z, nx, n[1], nz, color[0], color[1], layer, color[2]);
      }
    }
  }
};

/**
 * Revolves a profile of [radius, length] points around the axis through `at` along -z: `length`
 * runs forward from `at`. Returns triangles as x, y, z, nx, ny, nz per vertex, `sides` quads of 2
 * triangles per profile segment. The profile goes from back to front and closes on the axis, so
 * the normals (smooth around the ring, flat along the profile) point outward.
 */
export const lathe = (
  profile: [number, number][],
  sides: number,
  at: Vec3 = [0, 0, 0],
): number[] => {
  const out: number[] = [];
  for (let k = 1; k < profile.length; k++) {
    const [[r0, l0], [r1, l1]] = [profile[k - 1], profile[k]];
    const len = Math.hypot(r1 - r0, l1 - l0);
    if (!len) {
      continue;
    }
    // Outward in the (radius, length) plane: the profile tangent turned a quarter.
    const [nr, nl] = [(l1 - l0) / len, -(r1 - r0) / len];
    const ring = (i: number, r: number, l: number) => {
      const [c, s] = [Math.cos((i * TAU) / sides), Math.sin((i * TAU) / sides)];
      out.push(at[0] + r * c, at[1] + r * s, at[2] - l, nr * c, nr * s, -nl);
    };
    for (let i = 0; i < sides; i++) {
      for (const [j, r, l] of [
        [i, r0, l0],
        [i + 1, r0, l0],
        [i + 1, r1, l1],
        [i, r0, l0],
        [i + 1, r1, l1],
        [i, r1, l1],
      ] as const) {
        ring(j, r, l);
      }
    }
  }
  return out;
};

/** lathe() vertices (position, normal) given a flat colour, in the vertex format above. */
export const dress = (v: number[], [r, g, b]: number[]): number[] =>
  Array.from({ length: v.length * (STRIDE / 6) }, (_, i) => {
    const [k, j] = [Math.floor(i / STRIDE), i % STRIDE];
    return j < 6 ? v[k * 6 + j] : [r, g, -1, b][j - 6];
  });

/**
 * Appends model-space vertices (x right, y up, -z forward) scaled by k (one factor, or one per
 * axis), then carried to the world: axes `[r, u, f]` at eye, moved by off = (right, up, forward)
 * along them. `tint` multiplies the flat colour. Written without allocations: a body is placed a
 * thousand vertices at a time.
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
  const [rx, ry, rz, ux, uy, uz, fx, fy, fz] = [...r, ...u, ...f];
  const ox = eye[0] + rx * off[0] + ux * off[1] + fx * off[2];
  const oy = eye[1] + ry * off[0] + uy * off[1] + fy * off[2];
  const oz = eye[2] + rz * off[0] + uz * off[1] + fz * off[2];
  for (let i = 0; i < src.length; i += STRIDE) {
    const [x, y, z] = [src[i] * kx, src[i + 1] * ky, src[i + 2] * kz];
    const [m, n, w] = [src[i + 3], src[i + 4], src[i + 5]];
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
