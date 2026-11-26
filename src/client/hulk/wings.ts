import { HULL as SHAPE, LAYOUT, SHIP, WING, edge, thick } from '../../shared/beach';
import type { Piece } from '../../shared/beach';
import { noise } from '../../shared/relief';
import type { V } from './types';
import { MID, SKIN, GIRDER, SOOT, sm, off, loft, bar } from './common';
import { sheet, ragged } from './hull';

// ---------------------------------------------------------------------------------------------
// The wings.

/** The aerofoil along the chord, from the trailing edge to the leading one: the chord's share, and how much of the wing's thickness is under the top there. Both edges are sharp. */
export const FOIL = [
  [0, 0],
  [0.08, 0.3],
  [0.3, 0.8],
  [0.55, 1],
  [0.8, 0.75],
  [0.95, 0.3],
  [1, 0],
];

/** A wing (red's with s = 1): three thin slabs, each a plane through the tops of its rows of the map, torn at the breaks. */
export const wing = (s: number) => {
  const flip = (p: V) => [p[0], p[1], MID + s * (p[2] - MID)];
  const rows = LAYOUT.pieces.filter(p => p.kind == 'wingpiece' && p.min[2] > MID);
  const z0 = MID + SHAPE.r + SHIP[1].fair[1][2];
  WING.pieces.forEach(([v0, v1, push, , , shear], n) => {
    const zv = (v: number) => z0 + WING.span * v + push;
    const mine = rows
      .filter(p => p.min[2] > zv(v0) - 0.01 && p.max[2] < zv(v1) + 0.01)
      .sort((a, b) => a.min[2] - b.min[2]);
    const [a, b] = [mine[0], mine[mine.length - 1]];
    const zm = (p: Piece) => (p.min[2] + p.max[2]) / 2;
    /** The top at a span: the line through the middles of the first and the last row's tops. */
    const top = (v: number) =>
      a.max[1] + ((b.max[1] - a.max[1]) * (zv(v) - zm(a))) / (zm(b) - zm(a));
    const coarse = Math.ceil((WING.span * (v1 - v0)) / 1.4);
    const at = (v: number, u: number, t: number): V => {
      const e = Math.min(v, 47.49);
      const [xa, xb] = [edge(WING.trail, e), edge(WING.lead, e)];
      return flip([
        xa + (xb - xa) * u + shear * coarse * ((v - v0) / (v1 - v0) - 0.5),
        top(v) - t * thick(v),
        zv(v),
      ]);
    };
    // Each corner of the outline in the piece is a line of the sheet, the notches twice.
    const marks = [
      v0,
      ...[...WING.lead, ...WING.trail]
        .map(p => p[1])
        .filter(v => v > v0 + 0.01 && v < v1 - 0.01)
        .flatMap(v => [v - 0.01, v + 0.01]),
      v1,
    ].sort((p, q) => p - q);
    const vs = marks.flatMap((v, i) =>
      i && v - marks[i - 1] > 3.4 ? [(v + marks[i - 1]) / 2, v] : [v],
    );
    const lit = (p: V) => {
      const d = Math.min(
        n ? Math.abs(Math.abs(p[2] - MID) + MID - zv(v0)) : 9,
        n < 2 ? Math.abs(Math.abs(p[2] - MID) + MID - zv(v1)) : 9,
      );
      return 0.12 + 0.88 * sm((d - 0.7 * noise(p[0] / 1.3, p[2] / 1.3, 17)) / 0.9);
    };
    sheet(
      vs.map(v => FOIL.map(([u]) => at(v, u, 0))),
      () => SKIN,
      lit,
      s < 0,
    );
    sheet(
      vs.map(v => FOIL.map(([u, t]) => at(v, u, t))),
      () => SKIN,
      p => 0.75 * lit(p),
      s > 0,
    );
    // The breaks: the thin section open, a spar or two between the skins, the top skin torn.
    for (const [v, d] of [...(n ? [[v0, -1]] : []), ...(n < 2 ? [[v1, 1]] : [])]) {
      const [p, q] = [0, 1].map(e => FOIL.map(([u, t]) => at(v, u, e * t)));
      const c = at(v - 3 * d, 0.5, 0.5);
      loft(p, q, () => SOOT, c);
      ragged(p, [0, 0.06, s * d * 0.3], off(c, [0, -9, 0]));
      for (const u of [0.3, 0.62]) {
        bar(
          at(v - 0.4 * d, u, 0.5),
          at(v + 0.45 * d, u + 0.01 * d, 0.6),
          0.14,
          GIRDER,
          0.6 * thick(v),
        );
      }
    }
  });
};
