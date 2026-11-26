import { CHITIN, STRIDE } from '../mesh';
import type { Vec3 } from '../mesh';
import { JOINT as J } from '../rig';
import type { Quat } from '../rig';
import { room } from '../verts';
import type { Out } from '../verts';
import { CHITIN_X } from './common';
import {
  HORNS,
  clavicles,
  cuff,
  elbow,
  forearm,
  heel,
  horns,
  metatarsal,
  sinews,
  toes,
} from './limbs';
import { hips, ribs, thigh } from './body';
import { grow, jaw, skull } from './head';
import { belly, hoses, teeth } from './mouth';

/** A rigid piece made at the origin of its joint's frame, then only placed (store.ts). */
export type Make = (o: Out, at: Vec3, q: Quat) => void;
/**
 * A rigid piece of the xenomorph at a level of detail: its key in the store (all its vertices
 * depend on), how it is made, and whether it is `thin`, too fine for a shadow: left out of the
 * depth passes.
 */
export interface Part {
  key: string;
  make: Make;
  thin?: boolean;
}
/** Its pieces by the joint they go on (partsOf()), those on one joint merged: one draw each a pass. */
export const PART = {
  SHIN: 0,
  FOOT: 1,
  TOES: 2,
  CHEST: 3,
  SPINE: 4,
  ELBOW: 5,
  CUFF_L: 6,
  CUFF_R: 7,
  HEAD: 8,
  FINE: 9,
  THIGH_L: 10,
  THIGH_R: 11,
  HIPS: 12,
  FOREARM_L: 13,
  FOREARM_R: 14,
};
export const parts: Part[][] = [];
/** The horns on joint `j` (HORNS). */
export const hornsOn = (o: Out, at: Vec3, q: Quat, lod: number, j: number) => {
  for (const [k, base, len, w] of HORNS) {
    if (k == j) {
      horns(o, at, q, lod, base, len, w);
    }
  }
};
/** Its chitin's vertices written to `o` from `from` on (the body's colour at -1) put on CHITIN. */
export const shell = (o: Out, from: number) => {
  const a = room(o, 0);
  for (let i = from; i < o.length; i += STRIDE) {
    if (a[i + 8] == -1 && [6, 7, 9].every((k, j) => Math.abs(a[i + k] - CHITIN_X[j]) < 1e-6)) {
      a[i + 8] = CHITIN;
    }
  }
};
/** The xenomorph's rigid pieces at `lod`, in PART's order; render.ts makes them all at the map's load. */
export const partsOf = (lod: number): Part[] =>
  (parts[lod] ??= (
    [
      {
        key: `xeno shin ${lod}`,
        make: (o, a, q) => {
          sinews(o, a, q, lod);
          heel(o, a, q, lod);
        },
      },
      { key: `xeno foot ${lod}`, make: (o, a, q) => metatarsal(o, a, q, lod) },
      { key: `xeno toes ${lod}`, make: (o, a, q) => toes(o, a, q, lod) },
      {
        key: `xeno chest ${lod}`,
        make: (o, a, q) => {
          ribs(o, a, q, lod);
          clavicles(o, a, q, lod);
          hornsOn(o, a, q, lod, J.CHEST);
        },
      },
      {
        key: `xeno spine ${lod}`,
        make: (o, a, q) => {
          ribs(o, a, q, lod, true);
          hornsOn(o, a, q, lod, J.SPINE);
        },
      },
      { key: `xeno elbow ${lod}`, make: (o, a, q) => elbow(o, a, q, lod) },
      { key: `xeno cuff ${lod} -1`, make: (o, a, q) => cuff(o, a, q, lod, -1) },
      { key: `xeno cuff ${lod} 1`, make: (o, a, q) => cuff(o, a, q, lod, 1) },
      {
        key: `xeno head ${lod}`,
        make: (o, a, q) => {
          const from = o.length;
          skull(o, a, q, lod);
          jaw(o, a, q, lod);
          belly(o, a, q, lod);
          grow(o, from, a, q);
        },
      },
      {
        key: `xeno fine ${lod}`,
        make: (o, a, q) => {
          const from = o.length;
          teeth(o, a, q, lod);
          hoses(o, a, q, lod);
          grow(o, from, a, q);
        },
        thin: true,
      },
      { key: `xeno thigh ${lod} -1`, make: (o, a, q) => thigh(o, a, q, lod, -1) },
      { key: `xeno thigh ${lod} 1`, make: (o, a, q) => thigh(o, a, q, lod, 1) },
      { key: `xeno hips ${lod}`, make: (o, a, q) => hips(o, a, q, lod) },
      { key: `xeno forearm ${lod} -1`, make: (o, a, q) => forearm(o, a, q, lod, -1) },
      { key: `xeno forearm ${lod} 1`, make: (o, a, q) => forearm(o, a, q, lod, 1) },
    ] as Part[]
  ).map(({ make, ...rest }) => ({
    ...rest,
    make: (o: Out, a: Vec3, q: Quat) => {
      const from = o.length;
      make(o, a, q);
      shell(o, from);
    },
  })));
