// Pieces kept on the GPU (docs/PERFORMANCE.md): a rigid piece (a shoulder pad, a guard, a helmet)
// is built once at the origin, its vertices go to the GPU once, and a frame only says where each
// one stands: a turn, a place and a scale, applied by the scene's vertex shader as turn() does.
import { STRIDE } from './mesh';
import type { Vec3 } from './mesh';
import type { Quat } from './rig';
import { room } from './verts';
import type { Out } from './verts';

/** A piece built once: where its vertices start in the store and how many there are. */
export interface Mesh {
  first: number;
  count: number;
}

/** One piece drawn: `m` turned by `q`, scaled by `k`, moved to `t`. */
export interface Draw {
  m: Mesh;
  q: Quat;
  t: Vec3;
  k: number;
}

/** Every piece's vertices one after the other, in the renderer's vertex format: what the GPU gets. */
export let stored = new Float32Array(1 << 16);
/** The floats of `stored` written: a renderer uploads what it has not yet. */
export let filled = 0;
const meshes = new Map<string, Mesh>();

/** The piece `key`, made by `make` (into an empty array, at the origin) the first time it is asked for. */
export const mesh = (key: string, make: (out: number[]) => void): Mesh => {
  let m = meshes.get(key);
  if (!m) {
    const v: number[] = [];
    make(v);
    if (filled + v.length > stored.length) {
      const s = new Float32Array(Math.max(filled + v.length, stored.length * 2));
      s.set(stored);
      stored = s;
    }
    stored.set(v, filled);
    meshes.set(key, (m = { first: filled / STRIDE, count: v.length / STRIDE }));
    filled += v.length;
  }
  return m;
};

/** The frame's pieces, drawn after its other vertices. */
export type Pieces = Draw[];

/** The turn and the place of no move: a rigid piece made with them is at the origin. */
export const ID: Quat = [0, 0, 0, 1];
export const ORIGIN: Vec3 = [0, 0, 0];

/**
 * Appends the vertices of a drawn piece to `out` as the vertex shader places them (the tests'
 * eyes): position turned and scaled then moved, normal turned, colour as is.
 */
export const expand = (out: Out, { m, q, t, k }: Draw) => {
  const a = room(out, m.count * STRIDE);
  let w = out.length;
  const [qx, qy, qz, qw] = q;
  for (let i = m.first * STRIDE; i < (m.first + m.count) * STRIDE; i += STRIDE, w += STRIDE) {
    for (let h = 0; h < 6; h += 3) {
      const s = h ? 1 : k;
      const x = stored[i + h] * s;
      const y = stored[i + h + 1] * s;
      const z = stored[i + h + 2] * s;
      const tx = 2 * (qy * z - qz * y);
      const ty = 2 * (qz * x - qx * z);
      const tz = 2 * (qx * y - qy * x);
      const o = h ? [0, 0, 0] : t;
      a[w + h] = o[0] + (x + qw * tx + qy * tz - qz * ty);
      a[w + h + 1] = o[1] + (y + qw * ty + qz * tx - qx * tz);
      a[w + h + 2] = o[2] + (z + qw * tz + qx * ty - qy * tx);
    }
    for (let c = 6; c < STRIDE; c++) {
      a[w + c] = stored[i + c];
    }
  }
  out.length = w;
};
