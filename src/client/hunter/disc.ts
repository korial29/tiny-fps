import { STRIDE, unit } from '../mesh';
import type { Vec3 } from '../mesh';

import type { Out } from '../verts';
import { sized } from './constants';
import { hunter } from './model';

/** The thrown disc and the disc in hand, times the hip's (the user, 2026-11-23: bigger). */
export const DISC_SCALE = 1.5;
/** The throwing disc in its own frame, per level of detail: discVertices(). */
export const cross = (u: Vec3, v: Vec3): Vec3 => [
  u[1] * v[2] - u[2] * v[1],
  u[2] * v[0] - u[0] * v[2],
  u[0] * v[1] - u[1] * v[0],
];
export const discBuilt: Partial<Record<0 | 1 | 2, number[]>> = {};

/**
 * The hip's throwing disc (the model's 'Flying disc' without its belt clip) in its own frame: the
 * hub at the origin, the disc in the x-y plane and its face along +z, DISC_SCALE times as big. The thrown disc and the disc
 * in hand are drawn with it (the user, 2026-11-23: the armour's disc).
 */
export const discVertices = (lod: 0 | 1 | 2): number[] => {
  const cached = discBuilt[lod];
  if (cached) {
    return cached;
  }
  const src = hunter(lod)['Flying disc'];
  // The sculpted disc's axes (discPoint()), through the model's stretch, made orthonormal.
  const a = unit(sized([0.89, 0, -0.456]));
  const n0 = sized([-0.456, 0, -0.89]);
  const b = unit(cross(n0, a));
  const n = unit(cross(a, b));
  const mean = (list: number[]) => {
    const c = [0, 0, 0];
    for (let i = 0; i < list.length; i += STRIDE) {
      [0, 1, 2].forEach(k => (c[k] += list[i + k] * (STRIDE / list.length)));
    }
    return c;
  };
  const off = (c: number[], i: number) =>
    Math.abs((src[i] - c[0]) * n[0] + (src[i + 1] - c[1]) * n[1] + (src[i + 2] - c[2]) * n[2]);
  // The clip reaches off the disc's plane: every triangle that does is dropped.
  const rough = mean(src);
  const kept: number[] = [];
  for (let t = 0; t < src.length; t += 3 * STRIDE) {
    if ([0, 1, 2].every(k => off(rough, t + k * STRIDE) < 0.03)) {
      kept.push(...src.slice(t, t + 3 * STRIDE));
    }
  }
  const c = mean(kept);
  const out: number[] = [];
  const dot = (v: number[], w: number[]) => v[0] * w[0] + v[1] * w[1] + v[2] * w[2];
  for (let i = 0; i < kept.length; i += STRIDE) {
    const p = [0, 1, 2].map(k => kept[i + k] - c[k]);
    const m = kept.slice(i + 3, i + 6);
    out.push(...[a, b, n].map(w => dot(p, w) * DISC_SCALE), dot(m, a), dot(m, b), dot(m, n));
    out.push(...kept.slice(i + 6, i + STRIDE));
  }
  return (discBuilt[lod] = out);
};

/**
 * The disc's hub from the hand's grip (gun.ts grip()), metres: forward along the fingers, and down
 * under the palm (against gun.ts axes()' right, the back of the hand).
 */
export const DISC_HOLD: readonly [number, number] = [-0.005, 0.022];
/** The own hand holding the disc, moved from the gun's place in camera space (right, up, ahead), metres. */
export const DISC_RAISE: Vec3 = [-0.03, 0.06, 0.06];
/** The own hand holding the disc: how far its fingers lean ahead of straight up (a slope). */
export const DISC_TILT = 2;
/** The fingers on the disc fanned out this many times an open hand's (the user, 2026-11-23). */
export const DISC_SPREAD = 5.5;
/** How far the fingers bend over the disc's edge in all, radians, over their three joints (the user, 2026-11-23). */
export const DISC_HOOK = 1.4;
/** How far the fingers close over the disc (hand()'s curl): little, long over its hub (the user, 2026-11-23). */
export const DISC_CURL = 0.05;

/**
 * The armour's disc in a hand (the user, 2026-11-23: the disc in hand is the one on his hip):
 * centred `at`, its plane along `x` and `y` and its face along `n`, all unit.
 */
export const drawDisc = (out: Out, at: Vec3, x: Vec3, y: Vec3, n: Vec3, lod: 0 | 1 | 2 = 1) => {
  const v = discVertices(lod);
  for (let i = 0; i < v.length; i += STRIDE) {
    for (const [o, w] of [
      [i, 1],
      [i + 3, 0],
    ]) {
      out.push(...[0, 1, 2].map(k => w * at[k] + v[o] * x[k] + v[o + 1] * y[k] + v[o + 2] * n[k]));
    }
    out.push(...v.slice(i + 6, i + STRIDE));
  }
};
