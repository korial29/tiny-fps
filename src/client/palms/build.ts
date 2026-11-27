// Landfall's palms by instance (types.ts, instances/): the variants built once, and each palm the
// forest plants written as the few numbers the vertex shader draws it from (glsl.ts).
import { TAU } from '../../shared/physics';
import { hash } from '../../shared/relief';
import { DRY, burn } from '../jungle/constants';
import { palm } from '../jungle/models';
import { BARK as WOOD } from '../foliage/layers';
import { STRIDE } from '../mesh';
import { INST } from '../instances/types';
import type { Instances } from '../instances/types';
import { DRAW_ORDER, R0, VARIANTS, meshOf } from './types';

/** The seed variant `v` is built from: one that plant() also gives to variant v (7000 + 13 v is v modulo 4). */
const seedOf = (v: number) => 7000 + 13 * v;
/** A palm's height at shape level `lod`, by its seed: palm()'s own. */
const tallOf = (s: number, lod: number) => 8 + 5 * hash(s, 1, 77) + (2 - lod);

/**
 * Collects palms as palm() takes them, and gives them as Instances with the variants' meshes. A
 * palm's 16 floats: its foot and yaw; its height over its variant's, lean x and z, crown scale;
 * trunk ratio, how burnt, sway phase, the variant's height; the fade code (instances/cull.ts).
 */
export const planter = () => {
  const [inst, sphere, near, far]: number[][] = [[], [], [], []];
  const add = (
    x: number,
    y: number,
    z: number,
    r: number,
    s: number,
    lod: number,
    lx: number,
    lz: number,
    size = 1,
  ) => {
    const v = Math.abs(Math.floor(s)) % VARIANTS;
    const tallV = tallOf(seedOf(v), lod);
    const tall = tallOf(s, lod) * size;
    // The fire's mark taken at the crown, where most of a palm's vertices are.
    const b = burn(x + lx, z + lz, 1.3);
    inst.push(
      x,
      y,
      z,
      TAU * hash(s, 90, 77),
      tall / tallV,
      lx,
      lz,
      0.3 + 0.7 * size,
      r / R0,
      b,
      TAU * hash(s, 91, 77),
      tallV,
      1,
      0,
      0,
      0,
    );
    // A sphere round trunk and crown: the middle of the leant trunk, half its height and the fronds' reach.
    sphere.push(x + 0.5 * lx, y + 0.5 * tall, z + 0.5 * lz, 0.5 * tall + 5 * (0.3 + 0.7 * size));
    near.push(meshOf(lod, false, v));
    far.push(meshOf(lod, true, v));
  };
  const done = (): Instances => {
    const mesh: number[] = [];
    const ranges: number[] = [];
    for (let lod = 0; lod < 3; lod++) {
      for (const far of [false, true]) {
        for (let v = 0; v < VARIANTS; v++) {
          const first = mesh.length / STRIDE;
          palm(mesh, 0, 0, 0, R0, seedOf(v), lod, 0, 0, far ? 0 : Math.max(lod, 1));
          ranges[meshOf(lod, far, v) * 2] = first;
          ranges[meshOf(lod, far, v) * 2 + 1] = mesh.length / STRIDE - first;
        }
      }
    }
    return { mesh, ranges, inst, sphere, near, far, order: DRAW_ORDER };
  };
  return { add, done };
};

/**
 * The palms of `t` as the vertex shader draws them at rest (glsl.ts PALM_INSTANCE, no wind), each with its
 * near mesh or, if `far`, its far one, in the renderer's format: for the tests and jungle().
 */
export const expand = (t: Instances, far = false): number[] => {
  const o: number[] = [];
  for (let i = 0; i < t.near.length; i++) {
    const a = i * INST;
    const [x, y, z, yaw, k, lx, lz, crown, rr, b, , hv] = t.inst.slice(a, a + 12);
    const mi = far ? t.far[i] : t.near[i];
    const [first, n] = [t.ranges[mi * 2], t.ranges[mi * 2 + 1]];
    const [cs, sn, H] = [Math.cos(yaw), Math.sin(yaw), hv * k];
    for (let j = first * STRIDE; j < (first + n) * STRIDE; j += STRIDE) {
      const v = t.mesh.slice(j, j + STRIDE);
      const trunk = Math.abs(v[8] - WOOD) < 0.0008;
      const [px, qy, pz] = trunk
        ? [v[0] * rr, v[1] * k, v[2] * rr]
        : [v[0] * crown, (v[1] - hv) * crown + H, v[2] * crown];
      const [qx, qz] = [cs * px - sn * pz, sn * px + cs * pz];
      const w = trunk ? Math.min(Math.max(qy / H, 0), 1) ** 2 : 1;
      const c = [v[6], v[7], v[9]];
      if (b > 0) {
        const [kk, f, g] = [Math.min(2 * b, 1), 1 - Math.max(2 * b - 1.2, 0), 4 * v[7]];
        for (let m = 0; m < 3; m++) {
          c[m] = (c[m] + (DRY[m] * g - c[m]) * kk) * f;
        }
      }
      o.push(x + qx + lx * w, y + qy, z + qz + lz * w);
      o.push(cs * v[3] - sn * v[5], v[4], sn * v[3] + cs * v[5], c[0], c[1], v[8], c[2]);
    }
  }
  return o;
};
