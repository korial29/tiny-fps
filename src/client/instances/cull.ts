// Things drawn by instance (types.ts): which copies a pass draws and with which mesh. Each copy is
// tested alone against the pass's frustum and its distance from the eye, then the copies are
// written mesh by mesh into one array, so that a mesh is one instanced draw. Nothing allocated per
// call: a few hundred copies are a few microseconds.
//
// No copy changes at once: across FADE metres round `near` a copy is drawn with both its meshes,
// each keeping its share of the pixels by a dither (VERT's Pf, FRAG's dz()); its shadow fades out
// with its near mesh, and across FADE metres before `far` its far mesh fades out too.
import { FADE_AT, INST } from './types';
import type { Instances } from './types';

/** Metres over which a copy goes from one mesh to the other, and out of sight. */
export const FADE = 6;

export type Binner = {
  /** The copies written for the last call, mesh by mesh. */
  out: Float32Array;
  /** Each mesh's first copy in `out` and how many. */
  start: Int32Array;
  count: Int32Array;
  /**
   * Sorts the copies in the frustum of `m` within `far` metres of `eye`: near within `near`, far
   * past it, none past it if `shadow`. Returns how many draws of a copy.
   */
  bin: (
    m: Float32Array,
    eye: ArrayLike<number>,
    near: number,
    far: number,
    shadow: boolean,
  ) => number;
};

/** The fade code VERT passes on (Pf): k in [0, 1] keeps that share of the pixels, 2 + k the others. */
const keep = (k: number) => k;
const rest = (k: number) => 2 + k;

export const binner = (t: Instances): Binner => {
  const n = t.near.length;
  const meshes = t.ranges.length / 2;
  const inst = Float32Array.from(t.inst);
  const sphere = Float32Array.from(t.sphere);
  // A copy in the band is drawn twice.
  const out = new Float32Array(Math.max(n, 1) * INST * 2);
  const start = new Int32Array(meshes);
  const count = new Int32Array(meshes);
  const at = new Int32Array(meshes);
  /** Each copy's near and far mesh this pass (-1 for none) and their fade codes. */
  const [nearOf, farOf] = [new Int32Array(n), new Int32Array(n)];
  const [nearPf, farPf] = [new Float32Array(n), new Float32Array(n)];
  /** The copies drawn, nearest first, and how far each is: written by mesh in that order, the depth test throws out what they hide before it is shaded. */
  const order = new Int32Array(n);
  const dist = new Float32Array(n);
  const byDist = (a: number, b: number) => dist[a] - dist[b];
  const planes = new Float32Array(24);
  const put = (i: number, mi: number, pf: number) => {
    const o = at[mi]++ * INST;
    out.set(inst.subarray(i * INST, i * INST + INST), o);
    out[o + FADE_AT] = pf;
  };
  const bin = (
    m: Float32Array,
    eye: ArrayLike<number>,
    near: number,
    far: number,
    shadow: boolean,
  ) => {
    // The frustum's planes (Gribb and Hartmann), normalised so that a distance is in metres.
    for (let i = 0; i < 3; i++) {
      for (let s = 0; s < 2; s++) {
        const p = (i * 2 + s) * 4;
        const k = s ? -1 : 1;
        for (let j = 0; j < 4; j++) {
          planes[p + j] = m[j * 4 + 3] + k * m[j * 4 + i];
        }
        const l = 1 / (Math.hypot(planes[p], planes[p + 1], planes[p + 2]) || 1);
        for (let j = 0; j < 4; j++) {
          planes[p + j] *= l;
        }
      }
    }
    count.fill(0);
    let seen = 0;
    let total = 0;
    const [ex, ey, ez] = [eye[0], eye[1], eye[2]];
    for (let i = 0; i < n; i++) {
      const cx = sphere[i * 4];
      const cy = sphere[i * 4 + 1];
      const cz = sphere[i * 4 + 2];
      const r = sphere[i * 4 + 3];
      nearOf[i] = farOf[i] = -1;
      let out6 = false;
      for (let p = 0; p < 24 && !out6; p += 4) {
        out6 = planes[p] * cx + planes[p + 1] * cy + planes[p + 2] * cz + planes[p + 3] < -r;
      }
      if (out6) {
        continue;
      }
      const dx = cx - ex;
      const dy = cy - ey;
      const dz = cz - ez;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) - r;
      // The near mesh's share: 1 within near - FADE / 2, 0 past near + FADE / 2.
      const f = Math.min(Math.max((near + FADE / 2 - d) / FADE, 0), 1);
      // The far mesh's share of what it draws, fading out before `far`.
      const g = Math.min(Math.max((far - d) / FADE, 0), 1);
      if (f > 0 && t.near[i] >= 0) {
        nearOf[i] = t.near[i];
        nearPf[i] = keep(f);
        count[nearOf[i]]++;
        total++;
      }
      if (!shadow && f < 1 && g > 0 && t.far[i] >= 0) {
        farOf[i] = t.far[i];
        farPf[i] = f > 0 ? rest(f) : keep(g);
        count[farOf[i]]++;
        total++;
      }
      if (nearOf[i] >= 0 || farOf[i] >= 0) {
        dist[i] = d;
        order[seen++] = i;
      }
    }
    order.subarray(0, seen).sort(byDist);
    let sum = 0;
    for (let mi = 0; mi < meshes; mi++) {
      start[mi] = at[mi] = sum;
      sum += count[mi];
    }
    for (let j = 0; j < seen; j++) {
      const i = order[j];
      if (nearOf[i] >= 0) {
        put(i, nearOf[i], nearPf[i]);
      }
      if (farOf[i] >= 0) {
        put(i, farOf[i], farPf[i]);
      }
    }
    return total;
  };
  return { out, start, count, bin };
};
