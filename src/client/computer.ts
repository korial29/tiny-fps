// The Hunter's wrist computer (the user, 2026-11-23): a dark armoured housing along the back of
// his left bracer, a long screen in it with three square cells, each showing a red Yautja-like
// glyph of segments, a row of red lights and the fire key at the wrist end. The glyphs count the
// shoulder cannon's shots: each lit branch is one, and they go out from the right-hand glyph to
// the left. Built in the left forearm's frame (body.ts): y up the forearm from the wrist, the
// bracer's back toward -x.
import { HUNTER_CELLS } from '../shared/constants';
import { glow, tri } from './flag';
import { SHINE, STRIDE } from './mesh';
import type { Vec3 } from './mesh';

/** Shots per glyph: the cannon's HUNTER_CELLS over the three glyphs. */
export const PER_GLYPH = HUNTER_CELLS / 3;

/**
 * The segments of a glyph, in a square cell `c` wide: three rows of diagonals with a vertical
 * between them (ids 0 to 8, left, middle, right by row from the top), the two outer diagonals
 * leaning in and out by turns, and two rows of horizontals between them (9 to 12, left and right).
 * Each is its middle and its half extent, across the cell (u, toward the forearm's elbow is its
 * left) and up it (v), in cells.
 */
const SEGMENTS: [number, number, number, number][] = (() => {
  const out: [number, number, number, number][] = [];
  const rows = [0.13, 0.5, 0.87];
  rows.forEach((v, r) => {
    const lean = r % 2 ? -1 : 1;
    out.push([0.2, v, -0.1 * lean, 0.1], [0.5, v, 0, 0.11], [0.8, v, 0.1 * lean, 0.1]);
  });
  for (const v of [0.315, 0.685]) {
    out.push([0.29, v, 0.12, 0], [0.71, v, 0.12, 0]);
  }
  return out;
})();

/**
 * The three glyphs, left to right, each its PER_GLYPH lit segments in the order they are lit: the
 * last one goes out first.
 */
const GLYPHS = [
  [1, 9, 4, 12, 6],
  [0, 10, 4, 11, 8],
  [1, 2, 5, 8, 7],
];

// Worn bronze metal, a pale bone-white frame round the cells, dark red glass (the user's
// reference, 2026-11-23: a lid open over a row of red squares).
const METAL = [0.3, 0.18, 0.1];
const EDGE = [0.42, 0.27, 0.15];
const FRAME = [0.62, 0.56, 0.46];
const SCREEN = [0.06, 0.008, 0.008];
const DIM = [0.05, 0.01, 0.01];
const RED = [1, 0.1, 0.06];

/** Where it lies on the bracer: from the wrist up the forearm, across it, out of its back. */
const [Y0, Y1, HALF, BACK, OUT] = [0.03, 0.2, 0.03, 0.05, 0.068];
/** How far the lid is open from shut over the screen, radians: past upright. */
const LID = 1.95;
/** The screen's run up the forearm and its cells. */
const [S0, S1, CELL] = [0.066, 0.194, 0.034];
/** The fire key, in the forearm's frame (the right hand presses it). */
export const FIRE_KEY: Vec3 = [-OUT - 0.003, 0.045, 0];

const built = new Map<number, number[]>();

/** The computer with `shots` of the cannon's shots left, in the left forearm's frame; made once each. */
export const wristComputer = (shots: number): number[] => {
  const n = Math.max(0, Math.min(HUNTER_CELLS, Math.round(shots)));
  const cached = built.get(n);
  if (cached) {
    return cached;
  }
  const v: number[] = [];
  /** A point at height `x` out of the back (positive outward), `y` up the forearm, `z` across. */
  const p = (x: number, y: number, z: number): Vec3 => [-x, y, z];
  const quad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3, rgb: number[]) => {
    tri(v, a, b, c, rgb);
    tri(v, a, c, d, rgb);
  };
  const shine = (from: number) => {
    for (let i = from; i < v.length; i += STRIDE) {
      v[i + 8] = SHINE;
    }
  };
  // The housing: a slab with bevelled long edges, its ends closed.
  const from = v.length;
  const bevel = 0.006;
  const top = (y: number) => [
    p(BACK, y, -HALF),
    p(OUT - bevel, y, -HALF),
    p(OUT, y, -HALF + bevel),
    p(OUT, y, HALF - bevel),
    p(OUT - bevel, y, HALF),
    p(BACK, y, HALF),
  ];
  const [a, b] = [top(Y0), top(Y1)];
  for (let i = 0; i < a.length - 1; i++) {
    quad(a[i], a[i + 1], b[i + 1], b[i], i == 0 || i == 4 ? EDGE : METAL);
  }
  for (const end of [a, b]) {
    for (let i = 1; i < end.length - 1; i++) {
      tri(v, end[0], end[i], end[i + 1], METAL);
    }
  }
  // Ribs across it between the screen and the lights, and at the elbow end.
  for (const y of [0.058, 0.196]) {
    quad(
      p(OUT + 0.002, y, -HALF + bevel),
      p(OUT + 0.002, y + 0.004, -HALF + bevel),
      p(OUT + 0.002, y + 0.004, HALF - bevel),
      p(OUT + 0.002, y, HALF - bevel),
      EDGE,
    );
  }
  shine(from);
  // The lid, hinged along the +z edge and open past upright (LID), its inside ribbed.
  const lidFrom = v.length;
  const [lc, ls] = [Math.cos(LID), Math.sin(LID)];
  /** A point `d` out along the open lid from its hinge, `h` off its inner face, `y` up the forearm. */
  const l = (d: number, h: number, y: number): Vec3 =>
    p(OUT + d * ls + h * lc, y, HALF - d * lc + h * ls);
  const lidW = 2 * HALF - 0.004;
  for (const [h0, h1] of [[0, 0.005]]) {
    quad(l(0, h0, Y0), l(lidW, h0, Y0), l(lidW, h0, Y1), l(0, h0, Y1), METAL);
    quad(l(0, h1, Y0), l(lidW, h1, Y0), l(lidW, h1, Y1), l(0, h1, Y1), METAL);
    quad(l(lidW, h0, Y0), l(lidW, h1, Y0), l(lidW, h1, Y1), l(lidW, h0, Y1), EDGE);
    for (const y of [Y0, Y1]) {
      quad(l(0, h0, y), l(lidW, h0, y), l(lidW, h1, y), l(0, h1, y), EDGE);
    }
  }
  for (const d of [0.012, 0.022, 0.032, 0.042]) {
    quad(
      l(d, -0.0012, Y0 + 0.012),
      l(d + 0.004, -0.0012, Y0 + 0.012),
      l(d + 0.004, -0.0012, Y1 - 0.012),
      l(d, -0.0012, Y1 - 0.012),
      EDGE,
    );
  }
  shine(lidFrom);
  // The frame, pale, a hair out of the housing; in it each cell's dark red glass.
  const sh = HALF - 0.006;
  quad(
    p(OUT + 0.0006, S0, -sh),
    p(OUT + 0.0006, S1, -sh),
    p(OUT + 0.0006, S1, sh),
    p(OUT + 0.0006, S0, sh),
    FRAME,
  );
  // The cells, left to right: the left one nearest the elbow (the forearm across the view, the
  // wrist on the right). Their up is +z.
  const gap = (S1 - S0 - 3 * CELL) / 4;
  for (let g = 0; g < 3; g++) {
    const left = S1 - gap - g * (CELL + gap);
    const half = CELL / 2;
    quad(
      p(OUT + 0.0011, left, -half),
      p(OUT + 0.0011, left - CELL, -half),
      p(OUT + 0.0011, left - CELL, half),
      p(OUT + 0.0011, left, half),
      SCREEN,
    );
  }
  const lit = v.length;
  const unlit: number[] = [];
  GLYPHS.forEach((glyph, g) => {
    const left = S1 - gap - g * (CELL + gap);
    const on = new Set(glyph.slice(0, Math.max(0, Math.min(PER_GLYPH, n - g * PER_GLYPH))));
    SEGMENTS.forEach(([u, w, du, dv], id) => {
      // u runs from the cell's left (toward the elbow, high y) to its right; w from its bottom (-z) up.
      const at = (k: number, t: number): Vec3 => {
        const cu = u + du * k;
        const cw = w + dv * k;
        // Across the segment: a constant half width, normal to its run.
        const l = Math.hypot(du, dv) || 1;
        const [nu, nw] = [(-dv / l) * t, (du / l) * t];
        return p(OUT + 0.0016, left - (cu + nu) * CELL, (cw + nw - 0.5) * CELL);
      };
      const t = 0.045;
      const target = on.has(id) ? v : unlit;
      quad(at(-1, -t), at(1, -t), at(1, t), at(-1, t), on.has(id) ? RED : DIM);
      if (target === unlit) {
        unlit.push(...v.splice(v.length - 6 * STRIDE));
      }
    });
  });
  glow(v, lit, 1.6);
  // The unlit segments glow too, faintly: no light of the scene greys them.
  const dark = v.length;
  v.push(...unlit);
  glow(v, dark, 1);
  // The lights at the wrist end and the fire key, lit.
  const lights = v.length;
  for (const z of [-0.016, -0.006]) {
    quad(
      p(OUT + 0.001, 0.038, z),
      p(OUT + 0.001, 0.05, z),
      p(OUT + 0.001, 0.05, z + 0.006),
      p(OUT + 0.001, 0.038, z + 0.006),
      RED,
    );
  }
  const [ky, kz, kr] = [FIRE_KEY[1], 0.012, 0.0055];
  const ring = 8;
  for (let i = 0; i < ring; i++) {
    const [c0, c1] = [(i / ring) * 2 * Math.PI, ((i + 1) / ring) * 2 * Math.PI];
    tri(
      v,
      p(OUT + 0.0035, ky, kz),
      p(OUT + 0.0025, ky + kr * Math.cos(c0), kz + kr * Math.sin(c0)),
      p(OUT + 0.0025, ky + kr * Math.cos(c1), kz + kr * Math.sin(c1)),
      RED,
    );
  }
  glow(v, lights, 1.8);
  built.set(n, v);
  return v;
};
