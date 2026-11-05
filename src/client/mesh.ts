// Vertex format and the shapes built from it, shared by the renderer and the models. No DOM.
export type Vec3 = [number, number, number];

/**
 * Floats per vertex: position, normal, then c. A map vertex has c = (u, v, texture layer, light),
 * u and v in metres. A player vertex has layer -1 and its flat colour in c.x, c.y, c.w; layer -2 is
 * the same colour, bright and unlit (flashes, sparks, eyes).
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
      for (const [i, j] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, -1],
        [1, 1],
        [-1, 1],
      ]) {
        const l: Vec3 = [0, 0, 0];
        [l[a], l[b], l[d]] = [side, i, j];
        const [x, z] = turn(l[0] * hx, l[2] * hz);
        out.push(cx + x, cy + l[1] * hy, cz + z, nx, n[1], nz, color[0], color[1], layer, color[2]);
      }
    }
  }
};

/** gun.ts vertices (position, normal) given a flat colour, in the vertex format above. */
export const dress = (v: number[], [r, g, b]: number[]): number[] =>
  Array.from({ length: v.length * (STRIDE / 6) }, (_, i) => {
    const [k, j] = [Math.floor(i / STRIDE), i % STRIDE];
    return j < 6 ? v[k * 6 + j] : [r, g, -1, b][j - 6];
  });

/**
 * Appends gun-space vertices (x right, y up, -z forward) scaled by k (one factor, or one per axis
 * before the turn), turned by spin about z, then carried to the world: axes `[r, u, f]` at eye,
 * moved by off = (right, up, forward) along them. `tint` multiplies the flat colour. Written
 * without allocations: a body is placed a thousand vertices at a time.
 */
export const place = (
  out: number[],
  src: number[],
  eye: Vec3,
  [r, u, f]: Vec3[],
  off: Vec3,
  k: number | Vec3,
  spin = 0,
  tint: number[] = [1, 1, 1],
) => {
  const [kx, ky, kz] = typeof k == 'number' ? [k, k, k] : k;
  const [s, c] = [Math.sin(spin), Math.cos(spin)];
  const o = [0, 1, 2].map(i => eye[i] + r[i] * off[0] + u[i] * off[1] + f[i] * off[2]);
  for (let i = 0; i < src.length; i += STRIDE) {
    const [x, y, z] = [src[i] * kx, src[i + 1] * ky, src[i + 2] * kz];
    const [a, b] = [x * c - y * s, x * s + y * c];
    const [m, n] = [src[i + 3] * c - src[i + 4] * s, src[i + 3] * s + src[i + 4] * c];
    const w = src[i + 5];
    out.push(
      o[0] + r[0] * a + u[0] * b - f[0] * z,
      o[1] + r[1] * a + u[1] * b - f[1] * z,
      o[2] + r[2] * a + u[2] * b - f[2] * z,
      r[0] * m + u[0] * n - f[0] * w,
      r[1] * m + u[1] * n - f[1] * w,
      r[2] * m + u[2] * n - f[2] * w,
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

/** Appends a quad a, b, c, d, lit on both faces: a membrane. */
export const pushQuad = (
  out: number[],
  a: Vec3,
  b: Vec3,
  c: Vec3,
  d: Vec3,
  color: number[],
  layer = -1,
) => {
  const [e, f] = [b, d].map(q => q.map((v, i) => v - a[i]));
  const n = [e[1] * f[2] - e[2] * f[1], e[2] * f[0] - e[0] * f[2], e[0] * f[1] - e[1] * f[0]];
  const l = Math.hypot(...n) || 1;
  for (const s of [1, -1]) {
    for (const q of s > 0 ? [a, b, c, a, c, d] : [a, c, b, a, d, c]) {
      out.push(...q, ...n.map(v => (v * s) / l), color[0], color[1], layer, color[2]);
    }
  }
};
