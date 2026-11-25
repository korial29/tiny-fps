// The helpers the moon base's meshes are built with (moonbase.ts, moonhull.ts) that the doors
// share (doors.ts): kept apart so that the base's scenery loads with Tranquility's chunk alone.
import { glow, tri } from './flag';
import { STRIDE, dot, sub } from './mesh';
import type { Vec3 } from './mesh';
import type { Out } from './verts';

/** A model whose length runs up (y): the frame place() takes. */
export const UP: Vec3[] = [
  [1, 0, 0],
  [0, 0, 1],
  [0, 1, 0],
];

export const cross = (u: Vec3, v: Vec3): Vec3 => [
  u[1] * v[2] - u[2] * v[1],
  u[2] * v[0] - u[0] * v[2],
  u[0] * v[1] - u[1] * v[0],
];
/** A convex polygon of one colour, wound so that it faces away from `away` when given. */
export const face = (o: Out, p: Vec3[], rgb: number[], away?: Vec3) => {
  const n = cross(sub(p[1], p[0]), sub(p[2], p[0]));
  const q = away && dot(n, sub(p[0], away)) < 0 ? [...p].reverse() : p;
  for (let k = 1; k < q.length - 1; k++) {
    tri(o, q[0], q[k], q[k + 1], rgb);
  }
};
/** A box of one colour between two corners, its faces outward, less those whose bit is in `skip`: 1 and 2 its low and high z, 4 and 8 y, 16 and 32 x. */
export const box = (o: Out, lo: Vec3, hi: Vec3, rgb: number[], skip = 0) => {
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
  ].filter((_, i) => !((skip >> i) & 1))) {
    face(o, f.map(p), rgb, mid);
  }
};
/** Carries a model's vertices to (x, y, z), turned by `yaw` about y. */
export const put = (o: Out, v: number[], [x, y, z]: Vec3, yaw = 0) => {
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
/** What `make` adds to `o` glows, k times its colour. */
export const lit = (o: Out, k: number, make: () => void) => {
  const from = o.length;
  make();
  glow(o, from, k);
};
