import { CABIN, HULL as SHAPE, SHIP } from '../../shared/beach';
import { TEX } from '../../shared/types';
import { hash } from '../../shared/relief';
import { ink, tex, tinted, MID, face } from './common';
import { slab, turn } from './shapes';
import { wall, torn } from './trim';

// ---------------------------------------------------------------------------------------------
// The holds (the user, 2026-11-27: an airliner's): the passengers' luggage piled along both
// flanks behind cargo nets, as it slid in the crash. Drawn only: no deeper than 0.65 m from the
// lining, clear of the doors and of the broken ends, crushed shut.

/** The suitcases: black, red, green, grey and tan leather, navy cloth (steel shone like metal). */
const CASES = [
  tex(TEX.HIDE, 0.05, 2),
  tinted(TEX.FABRIC, CABIN.navy, 0.7, 3),
  tinted(TEX.HIDE, CABIN.red, 0.9, 2),
  tinted(TEX.HIDE, CABIN.green, 0.9, 2),
  tex(TEX.HIDE, 0.22, 2),
  tinted(TEX.HIDE, CABIN.tan, 0.95, 2),
];

/** The nets' olive webbing and their yellow edge straps. */
const NET = ink([0.12, 0.14, 0.07]);
const BELT = ink([0.55, 0.42, 0.05]);

/** Where the luggage lies in each section's hold: x0 and x1 (the tail's is awash). */
export const LUGGAGE = [
  [1, 44.6, 73.4],
  [2, 82.6, 94.5],
];

/** The luggage of the hold of section n from xa to xb. */
export const luggage = (n: number, xa: number, xb: number) => {
  const y = SHAPE.axis[n] + SHIP[n].floor;
  const h = SHIP[n].floor;
  for (const sg of [-1, 1]) {
    let x = xa;
    while (x < xb - 0.4) {
      const seed = Math.round(x * 16) * 2 + (sg > 0 ? 1 : 0);
      const r = (i: number) => hash(seed, i + n * 13, 101);
      const len = 0.42 + 0.3 * r(0);
      if (torn(n, x - 0.1, x + len + 0.1, h, h + 1.3)) {
        x += 0.3;
        continue;
      }
      const w = Math.abs(wall(n, x + len / 2, h + 0.5, sg)[2] - MID);
      // A stack of one to three cases, each a little askew.
      let top = y;
      const k = 1 + Math.floor(r(1) * 2.4);
      for (let i = 0; i < k; i++) {
        const deep = 0.36 + 0.22 * r(2 + i);
        const tall = 0.2 + 0.12 * r(5 + i);
        const ax = turn(
          [
            [1, 0, 0],
            [0, 1, 0],
            [0, 0, 1],
          ],
          [0, 1, 0],
          0.25 * (r(8 + i) - 0.5),
        );
        const z = MID + sg * (w - 0.05 - deep / 2 - 0.03 * i);
        // Its edges rounded as a suitcase's, seen from the aisle.
        slab(
          [x + len / 2, top, z],
          ax,
          [-len / 2 + 0.02 * i, 0, -deep / 2],
          [len / 2 - 0.02 * i, tall, deep / 2],
          0.05,
          CASES[Math.floor(r(11 + i) * CASES.length)],
          CASES[Math.floor(r(11 + i) * CASES.length)],
          1,
        );
        top += tall;
      }
      x += len + 0.04 + 0.2 * r(14);
    }
    // The cargo nets in front of the piles, 0.62 m off the lining: a diamond mesh of olive
    // webbing, a yellow strap along its top and its foot.
    for (let x0 = xa; x0 < xb - 1; x0 += 3) {
      const x1 = Math.min(x0 + 2.9, xb);
      if (torn(n, x0, x1, h, h + 1.4)) {
        continue;
      }
      const d = (x: number) => MID + sg * (Math.abs(wall(n, x, h + 0.7, sg)[2] - MID) - 0.62);
      const away = [x0, y + 0.7, MID + sg * 20];
      /** A strap from (xa, ya) to (xb, yb) over the floor, `t` thick. */
      const strap = (pa: number, ya: number, pb: number, yb: number, t: number, m: typeof NET) =>
        face(
          [
            [pa, y + ya - t, d(pa)],
            [pb, y + yb - t, d(pb)],
            [pb, y + yb + t, d(pb)],
            [pa, y + ya + t, d(pa)],
          ],
          m,
          away,
        );
      const TALL = 1.1;
      for (let s = x0 - TALL; s < x1; s += 0.45) {
        for (const dir of [1, -1]) {
          // A diagonal from the foot at s, clipped to the net's ends.
          const [fa, fb] = dir > 0 ? [s, s + TALL] : [s + TALL, s];
          const lo = Math.max(Math.min(fa, fb), x0);
          const hi = Math.min(Math.max(fa, fb), x1);
          if (hi - lo < 0.02) {
            continue;
          }
          const at = (x: number) => (dir > 0 ? x - s : s + TALL - x);
          strap(lo, at(lo), hi, at(hi), 0.018, NET);
        }
      }
      strap(x0, 0.06, x1, 0.06, 0.04, BELT);
      strap(x0, TALL, x1, TALL, 0.04, BELT);
    }
  }
};
