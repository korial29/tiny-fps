import { GLOSS, WEAVE } from '../mesh';
import type { Skin } from '../skin';
import { TURN } from './types';
import type { Corner, Recipe, Moulded } from './types';
import {
  PART,
  GUSSET,
  beltOff,
  BROWN,
  CLOTH,
  PAD,
  REGIONS,
  OFF,
  WHITE,
  WALL,
  partOf,
} from './regions';
import type { Region } from './regions';
import { angle, split, landed, clip, REACH, BITS, LIMITS, SPANS } from './clip';
import { shaped, moulding, casting } from './shell';
import { scratchesOn } from './scratches';
import { OWN } from './details';

/** The ninja's plates' walls: its colour a shade down, as wear() shades the plates' walls. */
const EDGE = PAD.map(c => c * 0.75);

/** Skin triangles cooking() goes through between two of its pauses: some 40 ms on an M2. */
const SLICE = 250;

/**
 * The recipe of the armour on the skin `s`, `fine` (curved outlines refined, scratches) or not,
 * pausing (yield) every SLICE skin triangles and before the scratches: the close one takes a
 * third of a second, which preparing() spreads over tasks of their own.
 */
export function* cooking(s: Skin, fine: boolean): Generator<undefined, Recipe, undefined> {
  // The regions are written on the man's rest mesh: another build's plates are cut there and sit
  // on its own skin, corner for corner.
  const { t, l } = s;
  const v = s.u ?? s.v;
  const r: Recipe = { c: [], t: [] };
  if (!l) {
    return r;
  }
  /** The region of the triangles added now: -1 for the scratches. */
  let at = -1;
  /** The corners turned (TURN) of the skin triangle the triangles added now are cut out of. */
  let flat = 0;
  const add = (
    cs: Corner[],
    offs: number[],
    swell: Region['swell'],
    col: number[],
    layer: number,
    wall: number,
    k: number,
    moulded?: Moulded[],
  ) => {
    cs.forEach((c, i) => {
      let g = [0, 0, 0];
      if (moulded) {
        const m = moulded[i];
        r.c.push(k, c[3], c[4], c[5], offs[i], m[1], m[2], m[3], m[4], m[5], m[6]);
        return;
      }
      if (swell) {
        const e = 1e-3;
        g = [
          (swell(c[0] + e, c[1], c[2]) - swell(c[0] - e, c[1], c[2])) / (2 * e),
          (swell(c[0], c[1] + e, c[2]) - swell(c[0], c[1] - e, c[2])) / (2 * e),
          0,
        ];
        const nl = Math.hypot(c[6], c[7], c[8]) || 1;
        const n = [c[6] / nl, c[7] / nl, c[8] / nl];
        const gn = g[0] * n[0] + g[1] * n[1];
        g = g.map((x, j) => x - n[j] * gn);
      }
      r.c.push(k, c[3], c[4], c[5], offs[i], g[0], g[1], g[2], c[6], c[7], c[8]);
    });
    r.t.push(col[0], col[1], col[2], layer, wall | flat, at);
  };
  /** A corner at rest set `d` off along its rest normal: to wind the walls out. */
  const lift = (c: Corner, d: number) => {
    const nl = Math.hypot(c[6], c[7], c[8]) || 1;
    return [0, 1, 2].map(j => c[j] + (c[6 + j] / nl) * d);
  };
  const moulds = REGIONS.map((g, i) =>
    g.mould ? moulding(s, i) : g.cast ? casting(s) : undefined,
  );
  for (let k = 0; k < t.length / 3; k++) {
    if (k % SLICE == SLICE - 1) {
      yield;
    }
    const part = partOf(l[k]);
    if (part < 0) {
      continue;
    }
    const ys = [0, 1, 2].map(c => v[t[k * 3 + c] * 6 + 1]);
    const [lo, hi] = [Math.min(...ys), Math.max(...ys)];
    for (let g = 0; g < REGIONS.length; g++) {
      const region = shaped(REGIONS[g], s);
      at = g;
      if (
        region.part != part ||
        hi < SPANS[g][0] ||
        lo > SPANS[g][1] ||
        (region.fem && !s.b) ||
        (region.man && s.b)
      ) {
        continue;
      }
      const tri: Corner[] = [0, 1, 2].map(c => {
        const i = t[k * 3 + c] * 6;
        return [
          v[i],
          v[i + 1],
          v[i + 2],
          +(c == 0),
          +(c == 1),
          +(c == 2),
          v[i + 3],
          v[i + 4],
          v[i + 5],
          0,
        ];
      });
      // A triangle on the rim of a hole of the trunk's skin (the arm's): the rim's normals point
      // in, against its face. A plate set off along them dived into the body, a breach across it
      // (the user, 2026-11-13): such a corner's normal is taken the other way, level (TURN, a bit a
      // corner of the skin triangle), the same for every triangle that shares it, so they still meet.
      flat = 0;
      if (part == PART.TRUNK) {
        const [p, q, w] = tri;
        const [e, f] = [q.map((x, j) => x - p[j]), w.map((x, j) => x - p[j])];
        const n = [e[1] * f[2] - e[2] * f[1], e[2] * f[0] - e[0] * f[2], e[0] * f[1] - e[1] * f[0]];
        // Its face, the way out of the trunk; one that faces up or down has no rim to tell.
        const out =
          (n[0] * p[0] + n[2] * p[2]) / ((Math.hypot(...n) || 1) * Math.hypot(p[0], p[2]));
        const sign = out < 0 ? -1 : 1;
        if (Math.abs(out) > 0.3) {
          tri.forEach((c, i) => {
            if ((n[0] * c[6] + n[1] * c[7] + n[2] * c[8]) * sign < 0) {
              flat |= TURN << i;
            }
          });
        }
        // All three against it: a face of the skin turned in, not a rim. Left as it was.
        if (flat == TURN * 7) {
          flat = 0;
        }
        // The other way, and level: tilted up or down it made a point on the plate's edge.
        tri.forEach((c, i) => {
          if (flat & (TURN << i)) {
            [c[6], c[7], c[8]] = [-c[6], 0, -c[8]];
          }
        });
      }
      // A triangle across the turn opposite the plate's face, where its angles jump by 360, would
      // seem to cross the plate's edges: it is out of every plate short of a whole ring.
      // Nor is one wholly far round from it: the middle of the back reads +180 or -180 by the sign
      // of a hair, and a moulded plate's corners set off there flipped across it, the clip taking
      // that jump for its edge and leaving slivers 8 cm out behind the back (the user, 2026-11-13).
      if (region.a[1] - region.a[0] < 360) {
        const as = tri.map(c => angle(region, c[0], c[2]));
        if (
          Math.max(...as) - Math.min(...as) > 180 ||
          as.every(q => q < region.a[0] - REACH) ||
          as.every(q => q > region.a[1] + REACH)
        ) {
          continue;
        }
      }
      // A round or curved outline needs finer pieces than the skin's, close up.
      // A moulded plate's curves, finer still: the woman's domes. Not close up too: on the near
      // skin its outline went by the skin's big triangles, in steps, and the V at the neck was gone
      // (the user, 2026-11-13: smooth the stairs on the pecs).
      const pieces =
        region.mould || region.cast
          ? split(fine ? split([tri]) : [tri])
          : fine && (region.round || region.low || region.high)
            ? split([tri])
            : [tri];
      for (const piece of pieces) {
        const shell = moulds[g];
        const mould = shell && ((c: Corner, k: number) => shell(c, k, flat));
        // A moulded plate is cut where it lies, on its shell, not where its skin is: set off some
        // centimetres along normals that fan out, the edges of two pieces of skin (the trunk's and
        // the shoulder's) did not meet, a triangle standing out by the armpit (the user, 2026-11-13).
        const poly = LIMITS[g].reduce(
          (p, f, i) => clip(p, mould ? c => f(landed(c, mould(c, k))) : f, 1 << i),
          piece,
        );
        if (poly.length < 3) {
          continue;
        }
        if (region.belt) {
          // The sash: woven cloth in dark brown, no wall.
          const off = (c: Corner) => beltOff(angle({ ...region, face: 0 }, c[0], c[2]), c[1]);
          for (let i = 1; i + 1 < poly.length; i++) {
            add(
              [poly[0], poly[i], poly[i + 1]],
              [off(poly[0]), off(poly[i]), off(poly[i + 1])],
              undefined,
              BROWN,
              WEAVE,
              0,
              k,
            );
          }
          continue;
        }
        if (region.thin) {
          // Cloth: no wall.
          for (let i = 1; i + 1 < poly.length; i++) {
            add(
              [poly[0], poly[i], poly[i + 1]],
              [GUSSET.off, GUSSET.off, GUSSET.off],
              undefined,
              CLOTH,
              -1,
              0,
              k,
            );
          }
          continue;
        }
        const off = (c: Corner) =>
          mould
            ? mould(c, k)[0]
            : (region.off ?? OFF) + (region.swell ? region.swell(c[0], c[1], c[2]) : 0);
        for (let i = 1; i + 1 < poly.length; i++) {
          const cs = [poly[0], poly[i], poly[i + 1]];
          // The ninja's in its own near black (OWN), not the plate's that wear() gives the others.
          add(
            cs,
            cs.map(off),
            region.swell,
            region.alone ? PAD : WHITE,
            GLOSS,
            region.alone ? OWN : 0,
            k,
            mould && cs.map(c => mould(c, k)),
          );
        }
        // The walls along the plate's edge, wound outward (away from its middle, at rest).
        const mid = [0, 1, 2].map(j => poly.reduce((sum, c) => sum + c[j], 0) / poly.length);
        for (let i = 0; i < poly.length; i++) {
          const [p, q] = [poly[i], poly[(i + 1) % poly.length]];
          if (!(p[BITS] & q[BITS])) {
            continue;
          }
          const [pt, qt, qb] = [lift(p, off(p)), lift(q, off(q)), lift(q, 0.0015)];
          const f = [
            (qt[1] - pt[1]) * (qb[2] - pt[2]) - (qt[2] - pt[2]) * (qb[1] - pt[1]),
            (qt[2] - pt[2]) * (qb[0] - pt[0]) - (qt[0] - pt[0]) * (qb[2] - pt[2]),
            (qt[0] - pt[0]) * (qb[1] - pt[1]) - (qt[1] - pt[1]) * (qb[0] - pt[0]),
          ];
          const outward =
            f[0] * (p[0] - mid[0]) + f[1] * (p[1] - mid[1]) + f[2] * (p[2] - mid[2]) >= 0;
          const [P, Q] = outward ? [p, q] : [q, p];
          const [wall, kind] = region.alone ? [EDGE, 1 | OWN] : [WALL, 1];
          add([P, Q, Q], [off(P), off(Q), 0.0015], undefined, wall, -1, kind, k);
          add([P, Q, P], [off(P), 0.0015, 0.0015], undefined, wall, -1, kind, k);
        }
      }
    }
  }
  at = -1;
  flat = 0;
  if (fine) {
    yield;
    scratchesOn(s, add, moulds, g => (at = g));
    at = -1;
  }
  return r;
}

/**
 * The plates' details (the user, 2026-11-13, on a picture of a trooper's armour: discreet, on the
 * chest plate and the forearms): dark strokes drawn as the scratches are. Each is [the part, its
 * middle line across, the angle round it (degrees, 0 the front, + outward), its height, its tilt
 * from upright (degrees), its length, its half width, the side it is on (0: both)].
 */
