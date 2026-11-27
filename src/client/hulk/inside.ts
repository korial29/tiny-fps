import { DECKS, EDGE, HULL as SHAPE, LAYOUT, SHIP, section } from '../../shared/beach';
import { hash } from '../../shared/relief';
import { TEX } from '../../shared/types';
import {
  tex,
  MID,
  SKIN,
  SOOT,
  LAMP,
  WALL,
  FLAT,
  UNDER,
  TRIM,
  CARPET,
  off,
  QUAD,
  face,
  box,
  bar,
  teeth,
  RAW,
  DOWN,
} from './common';
import { sheet, ARCH, SILL, form, wide, stations, lines, lining, open } from './hull';

/** The holds' floors: bright galvanised steel grating, its bars 12.5 cm apart (the user, 2026-11-26: metallic). */
const FLOOR = tex(TEX.GRATE, 1.7, 2);

// ---------------------------------------------------------------------------------------------
// The inside.

export const UP = [0, 99, 0];
/** A level rectangle. */
export const flat = (xa: number, xb: number, y: number, za: number, zb: number) =>
  QUAD.map(i => [i & 1 ? xb : xa, y, i & 2 ? zb : za]);

/**
 * How far the lining of section n runs: from the stern's bulkhead (or the broken end) to x1, and
 * in the nose to the arch over the sill (the canopy is its own lining there) but to the wall in
 * the trees under it, where a bulkhead closes the main deck and the hold.
 */
export const reach = (n: number) => {
  const [x0, x1] = SHAPE.sections[n];
  const { cut } = SHIP[n];
  return [cut[0][3] ? cut[0][1] : x0, n > 1 ? EDGE.east : x1];
};

/** What one sees from inside a section: the skin's lining, the decks with the twisted edges of their holes, lamps and cables under them. */
export const inside = (n: number) => {
  const [x0, x1] = SHAPE.sections[n];
  const c = SHAPE.axis[n];
  const { holes } = SHIP[n];
  const l = lines(n);
  const [xa, xb] = reach(n);
  const xs = stations(n, x0, xb).filter(x => x >= xa);
  for (const sg of [-1, 1]) {
    sheet(
      xs.map(x => l.map((_, i) => lining(n, x, i, sg))),
      (i, j) =>
        open(n, xs[i], xs[i + 1], l[j], l[j + 1]) || (xs[i] >= ARCH - 0.01 && l[j] >= SILL)
          ? undefined
          : WALL,
      () => 1,
      sg > 0,
    );
  }
  if (xa > x0) {
    // The stern's bulkhead.
    const wall = [1, -1].flatMap(sg =>
      (sg > 0 ? l : [...l].reverse()).map(h => lining(n, xa, l.indexOf(h), sg)),
    );
    face(wall, WALL, [xa - 9, c, MID]);
  }
  if (n > 1) {
    // The nose's bulkhead under the flight deck, from the hold's floor to the upper deck.
    const under = l.filter(h => h <= SILL);
    const wall = [1, -1].flatMap(sg =>
      (sg > 0 ? under : [...under].reverse()).map(h => lining(n, xb, l.indexOf(h), sg)),
    );
    face(wall, WALL, [xb + 9, c, MID]);
  }
  // The decks, on the map's boxes, kept inside the drawn skin: a white ceiling under each, its
  // edges grey, the carpet on the passengers' decks and the grating in the holds.
  for (const { kind, min: a, max: b } of LAYOUT.pieces) {
    if (kind != 'deck' || a[0] < x0 || b[0] > x1) {
      continue;
    }
    const back = b[1] > c + 6.9;
    const hold = a[1] < c - 6.9;
    const [p, q] = [a.slice(), b.slice()];
    if (back && n > 1) {
      q[0] = Math.min(q[0], ARCH);
    }
    const w =
      Math.min(...[p[0], (p[0] + q[0]) / 2, q[0]].map(x => wide(n, x, Math.min(b[1] - c, 6.4)))) -
      0.3;
    [p[2], q[2]] = [Math.max(p[2], MID - w), Math.min(q[2], MID + w)];
    if (q[0] > p[0] && q[2] > p[2]) {
      // The back's top is the skin's; a floor that goes down to the keel shows its top only.
      if (!hold) {
        box(p, q, UNDER, UNDER, 63 - 4);
      }
      box(p, q, TRIM, hold ? FLOOR : CARPET, back ? 8 + 4 : hold ? 52 : 4);
    }
  }
  for (const [deck, p, q, half] of holes) {
    const y = c + DECKS[deck];
    const w = Math.min(
      half,
      (deck > 1 ? 2.5 : section(DECKS[deck])) * form(n, (p + q) / 2)[0] - SHAPE.skin,
    );
    const m = deck > 1 ? SKIN : FLAT;
    const k = deck > 1 ? 0.14 : 1.05;
    // Inside, the torn panels' backs are flat grey: a texture's lines shimmered on them.
    const back = deck > 1 ? RAW : TRIM;
    for (const [x, d] of [
      [p, 0.4],
      [q, -0.4],
    ]) {
      teeth([x, y, MID - w], [x, y, MID + w], [d, -0.3, 0], 6, m, k, DOWN, back);
    }
    if (half < 9) {
      for (const sg of [-1, 1]) {
        teeth(
          [p, y, MID + sg * w],
          [q, y, MID + sg * w],
          [0, -0.3, -sg * 0.4],
          6,
          m,
          k,
          DOWN,
          back,
        );
      }
    }
  }
  // Emergency lamps under each deck and the back, and cables down from them, over a runner's head.
  [...DECKS.slice(0, 2), 6.5 + 0.3].forEach((h, d) => {
    const y = c + h - 0.33;
    for (let x = xa + 2; x < Math.min(xb, ARCH); x += 5) {
      const z = MID + (d > 1 ? 2.1 : 3.9) * form(n, x)[0] * (hash(x, d, 43) < 0.5 ? -1 : 1);
      const at = [x + 1.6, y + 0.03, MID + 4 * (hash(x, d, 41) - 0.5)];
      // Neither the lamp nor its cable's top under a hole: nothing would hold them.
      const over = (px: number, pz: number, r: number) =>
        holes.some(
          ([e, p, q, half]) =>
            e == d && px > p - r && px < q + r && Math.abs(pz - MID) < half + 0.3,
        );
      if (!over(x, z, 0.8) && !over(at[0], at[2], 0.3)) {
        face(flat(x - 0.5, x + 0.5, y, z - 0.07, z + 0.07), LAMP, UP);
        bar(at, off(at, [0.2, -0.3 - 0.8 * hash(x, d, 42), 0.25]), 0.05, SOOT);
      }
    }
  });
};
