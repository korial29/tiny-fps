// Pieces kept on the GPU (docs/PERFORMANCE.md): a rigid piece (a shoulder pad, a guard, a helmet)
// is built once at the origin, its vertices go to the GPU once, and a frame only says where each
// one stands: a turn, a place and a scale, applied by the scene's vertex shader as turn() does.
import { STRIDE } from './mesh';
import type { Vec3 } from './mesh';
import type { Quat } from './rig';
import { Verts, room } from './verts';
import type { Out } from './verts';

/** A piece built once: where its vertices start in the store and how many there are. */
export interface Mesh {
  first: number;
  count: number;
}

/** One piece drawn: `m` turned by `q`, scaled by `k`, moved to `t`; or, with `f`, flesh posed by the shader. */
export interface Draw {
  m: Mesh;
  q: Quat;
  t: Vec3;
  k: number;
  f?: Flesh;
  /** Worn: armour, which the shader scuffs (grime, chipped paint, scratches) on its glossy and gold parts. */
  w?: boolean;
  /** Close hair (hair.ts), coloured `rgb`, swung by `sw` in the head's frame at the time `t`: the shader sways it (swayOf()). */
  h?: { rgb: number[]; sw: Vec3; t: number };
}

/**
 * A runner's skin (`kind` 1) or armour (2) posed by the vertex shader from `data` (flesh.ts): the
 * texels of the skin's vertices, of the drawn vertices and of the skin's corners; the joints' dual
 * quaternions (eight numbers each), the palette, the face's weights; the plates' colour (absent:
 * not coloured) and the accent.
 */
export interface Flesh {
  kind: number;
  at: [number, number, number];
  d: Float32Array;
  pal: Float32Array;
  face: Float32Array;
  plate?: number[];
  accent?: number[];
  /** The runner's id: the marks of his skin (moles, freckles, scars) in the shader. */
  seed?: number;
}

/** What the vertex shader reads by texel (flesh.ts): four floats each, 2048 a row. */
export let data = new Float32Array(1 << 18);
/** The floats of `data` written: a renderer uploads what it has not yet. */
export let used = 0;

/** Appends `v` to `data`, from a new texel on, and gives that texel's index. */
export const texels = (v: ArrayLike<number>) => {
  const n = Math.ceil(v.length / 4) * 4;
  if (used + n > data.length) {
    const d = new Float32Array(Math.max(used + n, data.length * 2));
    d.set(data);
    data = d;
  }
  data.set(v, used);
  used += n;
  return (used - n) / 4;
};

/** Every piece's vertices one after the other, in the renderer's vertex format: what the GPU gets. */
export let stored = new Float32Array(1 << 16);
/** The floats of `stored` written: a renderer uploads what it has not yet. */
export let filled = 0;
const meshes = new Map<string, Mesh>();

/** The piece `key`, made by `make` (into an empty array, at the origin) the first time it is asked for. */
export const mesh = (key: string, make: (out: Out) => void): Mesh => {
  let m = meshes.get(key);
  if (!m) {
    // Into a Verts, as in a frame: a plain array through the same models would slow them for good (V8).
    const v = new Verts();
    make(v);
    if (filled + v.length > stored.length) {
      const s = new Float32Array(Math.max(filled + v.length, stored.length * 2));
      s.set(stored);
      stored = s;
    }
    stored.set(v.a.subarray(0, v.length), filled);
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
const NONE = [0, 0, 0];
const SWAY = [0, 0, 0];
/**
 * How far the hair vertex at `v[i]` (closeOf() in hair.ts: its normal at 3, how free at 7, its
 * phase at 9) moves in the head's frame at the time `t`, swung by `sw` (sway()): a share of the
 * swing, and a flutter of its own on its phase, out from the head too; a phase of -1 only swings.
 * The scene's vertex shader does the same sums (mode 3).
 */
export const swayOf = (v: ArrayLike<number>, i: number, t: number, sw: ArrayLike<number>) => {
  const [f, ph] = [v[i + 7], v[i + 9]];
  const on = ph >= 0 ? f : 0;
  const out = on * (0.002 + 0.0015 * Math.sin(t * 2.7 + ph));
  SWAY[0] =
    0.6 * f * sw[0] +
    on * (0.005 * Math.sin(t * 2.3 + ph) + 0.003 * Math.sin(t * 5.1 + ph * 1.7)) +
    v[i + 3] * out;
  SWAY[1] = 0.6 * f * sw[1] + on * 0.002 * Math.sin(t * 3.1 + ph * 0.7) + v[i + 4] * out;
  SWAY[2] = 0.6 * f * sw[2] + on * (0.004 * Math.sin(t * 1.9 + ph * 1.3) + 0.003) + v[i + 5] * out;
  return SWAY;
};

export const expand = (out: Out, { m, q, t, k, h: hair }: Draw) => {
  const a = room(out, m.count * STRIDE);
  let w = out.length;
  const [qx, qy, qz, qw] = q;
  for (let i = m.first * STRIDE; i < (m.first + m.count) * STRIDE; i += STRIDE, w += STRIDE) {
    // Hair (mode 3) sways in the head's frame before the turn, as the shader does.
    const sway = hair ? swayOf(stored, i, hair.t, hair.sw) : NONE;
    for (let h = 0; h < 6; h += 3) {
      const s = h ? 1 : k;
      const x = stored[i + h] * s + (h ? 0 : sway[0]);
      const y = stored[i + h + 1] * s + (h ? 0 : sway[1]);
      const z = stored[i + h + 2] * s + (h ? 0 : sway[2]);
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
    if (hair) {
      a[w + 6] = hair.rgb[0] * stored[i + 6];
      a[w + 7] = hair.rgb[1] * stored[i + 6];
      a[w + 9] = hair.rgb[2] * stored[i + 6];
    }
  }
  out.length = w;
};
