// Vertex format and the shapes built from it, shared by the renderer and the models. No DOM.
export type Vec3 = [number, number, number];

/**
 * Floats per vertex: position, normal, then c. A map vertex has c = (u, v, texture layer, light),
 * u and v in metres. A player vertex has layer -1 and its flat colour in c.x, c.y, c.w; layer -2 is
 * the same colour, bright and unlit (flashes, sparks, eyes); layer METAL is a flat colour with the
 * metal's specular (the gun, brass).
 */
export const STRIDE = 10;
/** The flat colour layer that shines like the metal texture. */
export const METAL = -0.5;

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

/** gun.ts vertices (position, normal) given a flat colour, in the vertex format above. */
export const dress = (v: number[], [r, g, b]: number[], layer = -1): number[] =>
  Array.from({ length: v.length * (STRIDE / 6) }, (_, i) => {
    const [k, j] = [Math.floor(i / STRIDE), i % STRIDE];
    return j < 6 ? v[k * 6 + j] : [r, g, layer, b][j - 6];
  });

/** The cross product of two vectors. */
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** Unit axes [d, u, w] of a frame whose first axis is the unit vector d. */
export const axesAlong = (d: Vec3): Vec3[] => {
  const u = cross(Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], d);
  const e = u.map(x => x / Math.hypot(...u)) as Vec3;
  return [d, e, cross(d, e)];
};

/**
 * Appends the 36 vertices of a box centred on c with half sizes h along the unit axes `ax`. The
 * vertices at the +ax[0] end take the colour `end`: a gradient along the first axis.
 */
export const pushFrame = (
  out: number[],
  c: Vec3,
  ax: Vec3[],
  h: Vec3,
  color: number[],
  layer = -1,
  end = color,
) => {
  for (let a = 0; a < 3; a++) {
    for (const side of [-1, 1]) {
      const [b, d] = [(a + 1) % 3, (a + 2) % 3];
      for (const [i, j] of QUAD) {
        const l: Vec3 = [0, 0, 0];
        [l[a], l[b], l[d]] = [side, i, j];
        const k = l[0] > 0 ? end : color;
        const at = [0, 1, 2].map(
          n => c[n] + ax[0][n] * l[0] * h[0] + ax[1][n] * l[1] * h[1] + ax[2][n] * l[2] * h[2],
        );
        out.push(...at, ...ax[a].map(x => x * side), k[0], k[1], layer, k[2]);
      }
    }
  }
};

/**
 * Appends gun-space vertices (x right, y up, -z forward) scaled by k, turned by spin about z, then
 * carried to the world: axes `[r, u, f]` at eye, moved by off = (right, up, forward) along them.
 */
export const place = (
  out: number[],
  src: number[],
  eye: Vec3,
  [r, u, f]: Vec3[],
  off: Vec3,
  k: number,
  spin = 0,
) => {
  const [s, c] = [Math.sin(spin), Math.cos(spin)];
  const turn = (x: number, y: number, z: number) =>
    [0, 1, 2].map(i => r[i] * (x * c - y * s) + u[i] * (x * s + y * c) - f[i] * z);
  const o = [0, 1, 2].map(i => eye[i] + r[i] * off[0] + u[i] * off[1] + f[i] * off[2]);
  for (let i = 0; i < src.length; i += STRIDE) {
    const p = turn(src[i] * k, src[i + 1] * k, src[i + 2] * k);
    out.push(o[0] + p[0], o[1] + p[1], o[2] + p[2], ...turn(src[i + 3], src[i + 4], src[i + 5]));
    out.push(...src.slice(i + 6, i + STRIDE));
  }
};
