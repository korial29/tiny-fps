// The detail on the station's plated hull (the user, 2026-11-27: plating, greebles, lit windows and
// trenches, as on a big ship): two trenches round the body with blocks in them, raised plates,
// blocks on the wall and rows of lit windows, on the grey bands under and over the gold foil
// (satellite.ts). Everything is placed at an angle and its mirror across the station's z, as the map
// is, and kept off the hangar's mouths and the wings' booms. Drawn only: the ghost cylinder stops ships.
import { COMMAND, HULL, PARTS } from '../../shared/station';
import type { StationDef } from '../../shared/station';
import { face } from '../brick';
import { glow } from '../flag';
import type { Vec3 } from '../mesh';
import { hole } from './command';

type Out = number[];

const TAU = 2 * Math.PI;
/** The plated hull's greys: the wall's panels, lighter plates, darker blocks, the trenches' floor. */
export const PLATE = [0.5, 0.51, 0.53];
const LIGHT = [0.62, 0.63, 0.64];
const BLOCK = [0.36, 0.37, 0.4];
const FLOOR = [0.16, 0.17, 0.19];
/** The windows' light: warm white, unlit and over 1 so the bloom takes it. */
const WINDOW = [1.5, 1.4, 1.05];
/** Columns round the body, as the wall's (satellite.ts). */
const COLS = 72;

/** A hash in [0, 1): the same layout on every screen. */
const hash = (i: number, k: number) => {
  const h = Math.sin(i * 91.7 + k * 47.3 + 3.1) * 43758.5453;
  return h - Math.floor(h);
};

/** The grey bands of the wall: where the gold foil is not (the hangar's floor to its top, then the cap). */
export const foiled = (y: number, deck: number, y1: number) => y >= deck + 44 && y < y1 - 36;

/** Adds the plated hull's detail to `o`, and returns it. */
export const plating = (def: StationDef, o: Out = []): Out => {
  const {
    hall: [lo],
    deck,
    hull: [cx, y0, cz, y1],
  } = def;
  const { R } = HULL;
  const [w, e] = [lo[0], lo[0] + 48];
  const wing = y0 + (y1 - y0) * PARTS.WING;
  /** A point at angle t round the axis, s along the wall's tangent, r from the axis, height y. */
  const at = (t: number, s: number, r: number, y: number): Vec3 => [
    cx + r * Math.cos(t) - s * Math.sin(t),
    y,
    cz + r * Math.sin(t) + s * Math.cos(t),
  ];
  /** Whether a piece at angle t, half w wide, from y0 to y1 would stand in a mouth or on a boom. */
  const clear = (t: number, hw: number, a: number, b: number) => {
    const x = cx + R * Math.cos(t);
    const mouth = x > w - 4 - hw && x < e + 4 + hw && b > deck - 4 && a < deck + 19;
    const boom = Math.abs(Math.cos(t)) < 0.2 && b > wing - 10 && a < wing + 10;
    const z = cz + R * Math.sin(t);
    const glass = hole(def, x, z, Math.max(a, Math.min(b, deck + COMMAND.DAIS + COMMAND.UP)), hw);
    return !mouth && !boom && !glass;
  };
  /**
   * A block on the wall at angle t: w wide, from height a to b, standing out from d0 to d1 past the
   * wall's radius; its back is left out, in the wall.
   */
  const block = (
    t: number,
    hw: number,
    a: number,
    b: number,
    d0: number,
    d1: number,
    rgb: number[],
  ) => {
    const [r0, r1] = [R + d0, R + d1];
    const mid = at(t, 0, (r0 + r1) / 2, (a + b) / 2);
    const p = (s: number, r: number, y: number) => at(t, s * hw, r, y);
    for (const q of [
      [p(-1, r1, a), p(1, r1, a), p(1, r1, b), p(-1, r1, b)],
      [p(-1, r0, b), p(-1, r1, b), p(1, r1, b), p(1, r0, b)],
      [p(-1, r0, a), p(1, r0, a), p(1, r1, a), p(-1, r1, a)],
      [p(-1, r0, a), p(-1, r1, a), p(-1, r1, b), p(-1, r0, b)],
      [p(1, r0, a), p(1, r0, b), p(1, r1, b), p(1, r1, a)],
    ]) {
      face(o, q, rgb, mid);
    }
  };
  /** Each angle of the half from 0 to PI with its mirror, the two ends once. */
  const both = (t: number) => (t < 1e-6 || t > Math.PI - 1e-6 ? [t] : [t, TAU - t]);
  /** A ring round the body in the wall's columns, from height a, da out from the wall, to b, db out. */
  const ring = (a: number, da: number, b: number, db: number, rgb: number[]) => {
    for (let i = 0; i < COLS; i++) {
      const [t0, t1] = [(i * TAU) / COLS, ((i + 1) * TAU) / COLS];
      const [ra, rb] = [R + da, R + db];
      face(
        o,
        [at(t0, 0, ra, a), at(t1, 0, ra, a), at(t1, 0, rb, b), at(t0, 0, rb, b)],
        rgb,
        at((t0 + t1) / 2, 0, R - 1, (a + b) / 2),
      );
    }
  };
  // Two trenches, under the mouths and under the cap: a dark floor between two bevelled lips,
  // blocks in it.
  for (const [k, y] of [
    [0, y0 + 14],
    [1, y1 - 24],
  ]) {
    ring(y, 0.12, y + 3, 0.12, FLOOR);
    ring(y - 0.6, 0, y, 0.45, LIGHT);
    ring(y + 3, 0.45, y + 3.6, 0, LIGHT);
    for (let i = 0; i < 14; i++) {
      const t = ((i + 0.5 + 0.4 * hash(i, k)) * Math.PI) / 14;
      const hw = 0.5 + 0.9 * hash(i, k + 7);
      for (const u of both(t)) {
        block(u, hw, y + 0.4, y + 1.2 + 1.4 * hash(i, k + 3), 0.1, 0.35, BLOCK);
      }
    }
  }
  // Raised plates and blocks over the grey bands, rows of lit windows between them.
  const bands = [
    [y0 + 1, y0 + 13],
    [y0 + 18, deck + 44],
    [y1 - 36, y1 - 25],
    [y1 - 20, y1 - 1],
  ];
  bands.forEach(([a, b], k) => {
    // Seams: a dark line up the band every four columns.
    for (let i = 0; i < COLS / 4; i++) {
      const t = (i * 4 * TAU) / COLS;
      if (clear(t, 0.1, a, b)) {
        const p = (s: number, y: number) => at(t, s * 0.09, R + 0.03, y);
        face(o, [p(-1, a), p(1, a), p(1, b), p(-1, b)], FLOOR, at(t, 0, R, a));
      }
    }
    // Plates, some with a smaller one on them, then blocks.
    const many = Math.round((b - a) * 0.5);
    for (let i = 0; i < many; i++) {
      const t = ((i + 0.15 + 0.7 * hash(i, 10 + k)) * Math.PI) / many;
      const h = Math.min(b - a - 2, 3 + 8 * hash(i, 20 + k));
      const y = a + 1 + (b - a - 2 - h) * hash(i, 30 + k);
      const hw = 2 + 4 * hash(i, 40 + k);
      if (!clear(t, hw, y, y + h)) {
        continue;
      }
      for (const u of both(t)) {
        block(u, hw, y, y + h, 0, 0.35, LIGHT);
        if (hash(i, 45 + k) < 0.5 && h > 3) {
          block(u, hw * 0.6, y + h * 0.25, y + h * 0.75, 0.35, 0.7, PLATE);
        }
      }
    }
    for (let i = 0; i < many; i++) {
      const t = ((i + hash(i, 50 + k)) * Math.PI) / many;
      const h = 0.8 + 2.4 * hash(i, 60 + k);
      const y = a + 0.5 + (b - a - 1 - h) * hash(i, 70 + k);
      const hw = 0.6 + 1.8 * hash(i, 80 + k);
      if (clear(t, hw, y, y + h)) {
        for (const u of both(t)) {
          block(u, hw, y, y + h, 0, 0.6 + 1.2 * hash(i, 90 + k), BLOCK);
        }
      }
    }
    // Windows: a line every 10 m up the band, in groups of four to eight, 0.7 by 0.45 m.
    for (let l = 0; a + 3 + 10 * l < b - 1; l++) {
      const y = a + 3 + 10 * l;
      for (let g = 0; g < 9; g++) {
        const n = 4 + Math.floor(5 * hash(g, 100 + k + 9 * l));
        const step = 1.2 / R;
        const span = (n - 1) * step;
        const t0 = ((g + 0.1 + 0.5 * hash(g, 110 + k + 9 * l)) * Math.PI) / 9;
        // clear() is the same at an angle and its mirror.
        if (t0 + span > Math.PI || !clear(t0 + span / 2, (span * R) / 2 + 1, y, y + 0.45)) {
          continue;
        }
        const from = o.length;
        for (let j = 0; j < n; j++) {
          for (const u of both(t0 + j * step)) {
            const p = (s: number, yy: number) => at(u, s * 0.35, R + 0.06, yy);
            face(o, [p(-1, y), p(1, y), p(1, y + 0.45), p(-1, y + 0.45)], WINDOW, at(u, 0, R, y));
          }
        }
        glow(o, from, 1);
      }
    }
  });
  return o;
};
