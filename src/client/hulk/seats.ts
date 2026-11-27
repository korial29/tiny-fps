import { CABIN, HULL as SHAPE } from '../../shared/beach';
import { TEX } from '../../shared/types';
import { hash } from '../../shared/relief';
import type { V } from './types';
import { ink, tex, tinted, MID, TRIM, SOOT, off } from './common';
import { ARCH } from './hull';
import { reach } from './inside';
import { cube, plate, rod, slab, turn } from './shapes';
import { STOREYS, wall, torn, gone } from './trim';

// ---------------------------------------------------------------------------------------------
// The passengers' seats (the user, 2026-11-27: an airliner's cabin), facing the nose (+x): rows
// of three in economy on the main deck, pairs of wide shells on the upper one, against each
// flank, the aisle between them. The galleys at the ends and a lavatory. Drawn only, as the
// troops' seats were: none within 2.9 m of the centre line, none in a tear, on a hole or at a
// broken end.

/** Economy's dark blue cloth, business's charcoal leather and its pale shells, the seats' frames. */
export const CLOTH = tinted(TEX.FABRIC, CABIN.navy, 1, 4);
export const LEATHER = tinted(TEX.HIDE, CABIN.leather, 1, 2);
export const SHELL = tex(TEX.PAINT, 1, 0.5);
export const FRAME = ink([0.2, 0.2, 0.21]);
/** The headrests' white covers. */
const COVER = tex(TEX.FABRIC, 1.9, 4);
/** The galleys' and the lavatory's laminate, a warm off-white apart from the walls. */
const LAMINATE = tex(TEX.PAINT, 1.2, 0.5);
/** The galleys' stainless steel and the carts' fronts. */
export const INOX = tex(TEX.STEEL, 0.6, 2);

const F = [1, 0, 0];
const U = [0, 1, 0];
const S = [0, 0, 1];
/** The aisle's half width: nothing drawn only is nearer the line. */
const AISLE = 2.9;

/**
 * One seat's back, its foot at o (on the floor, the seat's middle across), `wd` wide, leaning aft,
 * a white cover on its headrest. `r` picks its state: upright, broken forward over the cushion, or
 * torn away.
 */
const back = (o: V, wd: number, r: number, wide: boolean) => {
  const h = wd / 2;
  const [m, tall] = wide ? [LEATHER, 0.95] : [CLOTH, 0.74];
  if (r > 0.9) {
    return;
  }
  const bk = turn([F, U, S], S, r < 0.8 ? 0.2 : -0.55);
  const p = off(o, U, 0.42);
  // Seen down the aisle: its width and height, the top's corners well rounded, its rear a dark
  // plastic shell.
  const across = [bk[2], bk[1], bk[0]];
  slab(p, across, [-h, 0, -0.09], [h, tall, 0.03], [0, 0, 0.13, 0.13], m, m, 2, false, FRAME);
  if (r < 0.8 && !wide) {
    // The headrest's cover, on the back's face.
    plate(off(p, bk[0], 0.031), across, [-h * 0.8, tall - 0.26, 0], [h * 0.8, tall - 0.03, 0], [0, 0, 0.09, 0.09], COVER);
  }
};

/**
 * A block of `k` seats `wd` wide against the flank sg, at x on the floor y (over the axis of
 * section n), the outer one a hand in from the lining at the height of its back: one cushion
 * across the block, the backs, armrests between the seats and at the ends, two legs. Business's
 * pairs sit in pale shells.
 */
const block = (
  n: number,
  x: number,
  y: number,
  sg: number,
  k: number,
  wd: number,
  wide: boolean,
) => {
  const out = Math.abs(wall(n, x, y + (wide ? 1.3 : 1.15), sg)[2] - MID) - (wide ? 0.12 : 0.1);
  const z = (j: number) => MID + sg * (out - wd * j);
  const fy = SHAPE.axis[n] + y;
  const seed = Math.round(x * 8) * 2 + (sg > 0 ? 1 : 0);
  const ax = [F, U, S];
  const [za, zb] = [z(0), z(k)].sort((a, b) => a - b);
  const deep = wide ? 0.6 : 0.46;
  // One cushion across the block, its front edge rolled.
  slab(
    [x, fy, 0],
    ax,
    [0.02, 0.33, za + 0.015],
    [deep, 0.48, zb - 0.015],
    [0, 0, 0.07, 0],
    wide ? LEATHER : CLOTH,
  );
  for (let j = 0; j < k; j++) {
    back([x, fy, z(j + 0.5)], wd - 0.05, hash(seed, j + n * 7 + Math.round(y), 91), wide);
  }
  for (let j = 0; j <= k; j++) {
    const e = z(j);
    if (wide) {
      // The shells' sides round each seat, their tops sweeping down to the front.
      slab([x, fy, e], ax, [-0.25, 0, -0.03], [0.8, 0.75, 0.03], [0, 0, 0.3, 0.12], SHELL);
    } else {
      // An armrest, rounded at both ends.
      // Its sides show only at the block's ends.
      const end = j == 0 || j == k;
      slab([x, fy, e], ax, [0.04, 0.55, -0.025], [0.44, 0.62, 0.025], [0, 0, 0.03, 0.03], FRAME, FRAME, 1, !end);
    }
  }
  if (wide) {
    // The shell behind the pair, shoulder high, its top corners round.
    slab([x, fy, 0], [S, U, F], [za, 0, -0.32], [zb, 1.2, -0.25], [0, 0, 0.25, 0.25], SHELL);
  } else {
    for (const j of [0.5, k - 0.5]) {
      rod([x + 0.3, fy, z(j)], [x + 0.25, fy + 0.36, z(j)], 0.05, FRAME);
    }
  }
};

/** Where the rows stop: the galleys at the stern's bulkhead and before the nose's. */
const GALLEY = 1.7;

/** The seats of section n: economy on its main deck, business on its upper one, a row every pitch. */
export const seats = (n: number) => {
  const [x0, x1] = SHAPE.sections[n];
  const [xa, xb] = reach(n);
  STOREYS(n).forEach(({ floor, under, seated }, s) => {
    if (!seated) {
      return;
    }
    const wide = s > 1 || n > 1;
    const [pitch, wd, deep] = wide ? [1.25, 0.66, 0.8] : [0.8, 0.5, 0.5];
    // The ends free: the broken ones, the galleys, and the nose's upper deck under the canopy.
    const lo = xa > x0 ? xa + GALLEY : x0 + 0.6;
    const hi = n < 2 ? x1 - 0.6 : s > 1 ? ARCH - 0.3 : xb - GALLEY;
    for (const sg of [-1, 1]) {
      for (let x = lo; x + deep < hi; x += pitch) {
        const out = Math.abs(wall(n, x, floor + 1.2, sg)[2] - MID) - 0.1;
        const k = Math.min(wide ? 2 : 3, Math.floor((out - AISLE) / wd));
        if (
          k < 1 ||
          torn(n, x - 0.25, x + deep + 0.1, floor, floor + 1.3) ||
          gone(n, under, x - 0.25, x + deep, out - k * wd - 0.1)
        ) {
          continue;
        }
        block(n, x, floor, sg, k, wd, wide);
      }
    }
  });
};

/**
 * A galley against a bulkhead at x, standing out toward `f` (+1: greater x), on the floor y of
 * section n, across the flank sg from the lining to the aisle: the carts' bay under the worktop,
 * the ovens and lockers over it. One cart has rolled out and lies on its side.
 */
export const galley = (n: number, x: number, y: number, sg: number, f: number) => {
  const fy = SHAPE.axis[n] + y;
  const out = Math.abs(wall(n, x + f * 0.9, y + 1, sg)[2] - MID) - 0.05;
  const [za, zb] = [MID + sg * out, MID + sg * AISLE];
  const lo = Math.min(za, zb);
  const hi = Math.max(za, zb);
  const ax = [[f, 0, 0], U, S];
  // The bay, a dark recess, and the carts' fronts in it.
  cube([x, fy, 0], ax, [0, 0, lo], [0.75, 1.0, hi], SOOT, INOX, 4);
  const carts = Math.floor((hi - lo - 0.1) / 0.34);
  for (let i = 0; i < carts; i++) {
    // The one by the aisle rolled out.
    if (i == (sg > 0 ? 0 : carts - 1)) {
      continue;
    }
    const z = lo + 0.07 + i * 0.34;
    // Its front, rounded at its edges, a latch bar across it.
    slab([x, fy, 0], [ax[0], S, U], [0.6, z, 0.04], [0.77, z + 0.3, 0.98], 0.025, INOX);
    slab([x, fy, 0], ax, [0.77, 0.85, z + 0.04], [0.81, 0.91, z + 0.26], 0.02, FRAME);
  }
  // The lockers and ovens over the worktop, under a white panel.
  // Their front edges rounded: seen down the aisle, the corner by it.
  const flat = [ax[0], S, U];
  slab([x, fy, 0], flat, [0, lo, 1.45], [0.55, hi, 2.15], [0, 0.08, 0.08, 0], LAMINATE);
  slab([x, fy, 0], flat, [0, lo, 0.98], [0.8, hi, 1.04], [0, 0.03, 0.03, 0], INOX);
  const ovens = Math.floor((hi - lo) / 0.55);
  for (let i = 0; i < ovens; i++) {
    const z = lo + 0.08 + i * 0.55;
    // An oven's door or a locker's, its corners round.
    slab([x, fy, 0], [ax[0], S, U], [0.5, z, 1.55], [0.57, z + 0.42, 1.95], 0.04, i & 1 ? INOX : SOOT);
  }
  // A cart rolled out into the aisle's edge, on its side.
  slab(
    [x + f * 1.5, fy, MID + sg * (AISLE + 0.62)],
    turn([F, U, S], U, 0.3 * sg),
    [-0.4, 0, -0.5],
    [0.4, 0.3, 0.5],
    0.04,
    INOX,
  );
};

/** The lavatory's door, and its sign lit green: vacant. */
const DOOR = ink([0.5, 0.5, 0.49]);
const SIGN = ink([0.1, 0.5, 0.2], 1, -2);

/** A lavatory's cubicle against a bulkhead at x, its door toward `f`, on the flank sg: its walls, its folding door, the sign over it. */
export const lavatory = (n: number, x: number, y: number, sg: number, f: number) => {
  const fy = SHAPE.axis[n] + y;
  const out = Math.abs(wall(n, x + f * 1, y + 2.1, sg)[2] - MID) - 0.05;
  const [lo, hi] = [out - 1, out].map(w => MID + sg * w).sort((a, b) => a - b);
  const ax = [[f, 0, 0], U, S];
  slab([x, fy, 0], [ax[0], S, U], [0, lo, 0], [1, hi, 2.1], [0, 0.16, 0.16, 0], LAMINATE);
  const front = [ax[0], S, U];
  slab([x, fy, 0], front, [0.98, lo + 0.18, 0.05], [1.015, hi - 0.18, 1.95], 0.08, DOOR);
  slab([x, fy, 0], front, [1.015, lo + 0.3, 1.0], [1.03, lo + 0.36, 1.2], 0.02, TRIM);
  slab([x, fy, 0], front, [1.015, lo + 0.42, 1.72], [1.025, hi - 0.42, 1.84], 0.04, SIGN);
};
