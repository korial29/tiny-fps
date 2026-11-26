import { DECKS, HULL as SHAPE, LAYOUT, SHIP, section } from '../../shared/beach';
import { hash } from '../../shared/relief';
import { TEX } from '../../shared/types';
import {
  tex,
  MID,
  SKIN,
  GIRDER,
  PLATE,
  SOOT,
  LAMP,
  off,
  QUAD,
  face,
  loft,
  box,
  bar,
  teeth,
} from './common';
import { sheet, ARCH, form, wide, stations, lines, lining, open } from './hull';

/** The floors' grating: bright galvanised steel, its bars 12.5 cm apart (the user, 2026-11-26: metallic). */
const FLOOR = tex(TEX.GRATE, 1.7, 2);

// ---------------------------------------------------------------------------------------------
// The inside.

export const UP = [0, 99, 0];
/** A level rectangle. */
export const flat = (xa: number, xb: number, y: number, za: number, zb: number) =>
  QUAD.map(i => [i & 1 ? xb : xa, y, i & 2 ? zb : za]);

/** What one sees from inside a section: the skin's lining with its ribs, the decks with the twisted edges of their holes, lamps and cables under them. */
export const inside = (n: number) => {
  const [x0, x1] = SHAPE.sections[n];
  const c = SHAPE.axis[n];
  const { cut, tears, holes } = SHIP[n];
  const l = lines(n);
  // Not in the solid stern, nor under the canopy, which is its own lining.
  const [xa, xb] = [cut[0][3] ? cut[0][1] : x0, n > 1 ? ARCH : x1];
  const xs = stations(n, x0, xb).filter(x => x >= xa);
  for (const sg of [-1, 1]) {
    sheet(
      xs.map(x => l.map((_, i) => lining(n, x, i, sg))),
      (i, j) => (open(n, xs[i], xs[i + 1], l[j], l[j + 1]) ? undefined : PLATE),
      () => 1,
      sg > 0,
    );
    // A rib every 5 m, proud of the lining, from each floor to the next.
    for (let x = xa + 2.5; x < xb; x += 5) {
      l.slice(1).forEach((h, j) => {
        if (
          !DECKS.includes(h) &&
          !tears.some(([p, q, a, b]) => x > p - 0.3 && x < q + 0.3 && l[j] >= a && h <= b)
        ) {
          const [p, q] = [j, j + 1].map(i =>
            [
              [-0.08, 0],
              [-0.08, 0.2],
              [0.08, 0.2],
              [0.08, 0],
            ].map(([dx, dz]) => off(lining(n, x, i, sg), [dx, 0, -sg * dz])),
          );
          loft(p, q, () => GIRDER, [x, c, MID + sg * 20]);
        }
      });
    }
  }
  if (xa > x0) {
    // The stern's bulkhead.
    const wall = [1, -1].flatMap(sg =>
      (sg > 0 ? l : [...l].reverse()).map(h => lining(n, xa, l.indexOf(h), sg)),
    );
    face(wall, PLATE, [xa - 9, c, MID]);
  }
  // The decks, on the map's boxes, kept inside the drawn skin.
  for (const { kind, min: a, max: b } of LAYOUT.pieces) {
    if (kind != 'deck' || a[0] < x0 || b[0] > x1) {
      continue;
    }
    const back = b[1] > c + 6.9;
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
      box(p, q, back ? PLATE : GIRDER, FLOOR, back ? 8 : a[1] < c - 6.9 ? 52 : 0);
    }
  }
  for (const [deck, p, q, half] of holes) {
    const y = c + DECKS[deck];
    const w = Math.min(
      half,
      (deck > 1 ? 2.5 : section(DECKS[deck])) * form(n, (p + q) / 2)[0] - SHAPE.skin,
    );
    const m = deck > 1 ? SKIN : PLATE;
    const k = deck > 1 ? 0.14 : 0.5;
    for (const [x, d] of [
      [p, 0.4],
      [q, -0.4],
    ]) {
      teeth([x, y, MID - w], [x, y, MID + w], [d, -0.3, 0], 6, m, k);
    }
    if (half < 9) {
      for (const sg of [-1, 1]) {
        teeth([p, y, MID + sg * w], [q, y, MID + sg * w], [0, -0.3, -sg * 0.4], 6, m, k);
      }
    }
  }
  // Emergency lamps under each deck and the back, and cables down from them, over a runner's head.
  [...DECKS.slice(0, 2), 6.5 + 0.3].forEach((h, d) => {
    const y = c + h - 0.33;
    for (let x = xa + 2; x < xb; x += 5) {
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
