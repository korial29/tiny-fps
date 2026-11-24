// The Hunter's wrist computer (the user, 2026-11-24, after a prop's photograph): a worn pewter
// housing along the back of his left bracer, its lid open on a rod hinge. On its deck, from the
// elbow to the wrist: a plate with the clan's two claws, four square cells in a raised bezel, each a
// glyph of short dashes, then three bars and the fire key. A ribbed spring runs along its near
// edge, and a skirt engraved with signs falls round the forearm on each side. The glyphs count the
// shoulder cannon's shots: two lit dashes are one shot, and they go out from the wrist's cell to
// the elbow's. Built in the left forearm's frame (body.ts): y up the forearm from the wrist, the
// bracer's back toward -x.
import { HUNTER_CELLS } from '../shared/constants';
import { glow, tri } from './flag';
import { SHINE, STRIDE, TWILL } from './mesh';
import type { Vec3 } from './mesh';

/** The cannon's shots each cell counts, from the elbow's to the wrist's: HUNTER_CELLS in all. */
export const SHOTS = [4, 4, 4, 3];

/** A glyph's dash: where its middle is in its cell (to the right, up, 0 to 1) and its angle. */
type Dash = [number, number, number];

/** `n` dashes on a circle of radius `r` from the angle `from`, each turned `turn` off its radius. */
const round = (n: number, r: number, from: number, turn: (k: number) => number): Dash[] =>
  Array.from({ length: n }, (_, k) => {
    const a = from + (k * 2 * Math.PI) / n;
    return [0.5 + r * Math.cos(a), 0.5 + r * Math.sin(a), a + turn(k)];
  });

const ACROSS = Math.PI / 2;
/** The four glyphs, each its dashes in the order they are lit, two a shot: the last go out first. */
const GLYPHS: Dash[][] = [
  [...round(6, 0.31, 0, () => ACROSS), [0.42, 0.5, 1], [0.58, 0.5, -1]],
  [...round(6, 0.31, 0.52, k => (k % 2 ? ACROSS : 0.5)), [0.5, 0.41, 0], [0.5, 0.59, 0]],
  [...round(4, 0.33, 0.79, () => ACROSS), ...round(4, 0.14, 0, () => 0)],
  round(6, 0.3, 0.26, k => (k % 2 ? 0 : ACROSS)),
];

// Aged pewter, paler on what stands out of it, dark in its hollows; black glass, red light.
const METAL = [0.26, 0.27, 0.29];
const EDGE = [0.4, 0.41, 0.44];
const PALE = [0.66, 0.67, 0.7];
const DARK = [0.13, 0.13, 0.14];
const GLASS = [0.07, 0.07, 0.075];
const DIM = [0.012, 0.012, 0.014];
const RED = [1, 0.1, 0.06];

/** Where it lies on the bracer: from the wrist up the forearm, across it, out of its back. */
const [Y0, Y1, HALF, BACK, OUT] = [0.03, 0.215, 0.034, 0.048, 0.068];
/** How far the lid is open from shut over the deck, radians: past upright. */
const LID = 1.95;
/** The cells: their side, the bar between two, the elbow end of the first, their near edge. */
const [CELL, BAR, C1, CZ] = [0.025, 0.004, 0.176, -0.006];
/** The skirt's radius round the forearm's axis. */
const SKIRT = 0.056;
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
  type At = (x: number, y: number, z: number) => Vec3;
  /** A point `x` out of the back, `y` up the forearm, `z` across: a right-handed frame. */
  const deck: At = (x, y, z) => [-x, y, z];
  /** The frame the next pieces are built in. */
  let at = deck;
  /**
   * The next metal faces' layer: brushed and scratched (TWILL, on the piece's own place: the
   * brushing runs across the forearm), or polished.
   */
  let layer = TWILL;
  let worn = 0;
  /** A face given right-handed in the deck's frame: wound the other way, the forearm's mirrors it. */
  const quad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3, rgb: number[], as = -1) => {
    tri(v, a, d, c, rgb);
    tri(v, a, c, b, rgb);
    for (let i = v.length - 6 * STRIDE + 8; i < v.length; i += STRIDE) {
      v[i] = as;
    }
  };
  /** A metal face, each a little off its neighbours' tone: the wear of an old casting. */
  const face = (a: Vec3, b: Vec3, c: Vec3, d: Vec3, rgb: number[]) => {
    worn = (worn * 73 + 19) % 101;
    quad(
      a,
      b,
      c,
      d,
      rgb.map(k => k * (0.86 + (0.26 * worn) / 101)),
      layer,
    );
  };
  const box = (
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    z0: number,
    z1: number,
    rgb: number[],
  ) => {
    face(at(x1, y0, z0), at(x1, y1, z0), at(x1, y1, z1), at(x1, y0, z1), rgb);
    face(at(x0, y0, z0), at(x0, y0, z1), at(x0, y1, z1), at(x0, y1, z0), rgb);
    face(at(x0, y0, z1), at(x1, y0, z1), at(x1, y1, z1), at(x0, y1, z1), rgb);
    face(at(x0, y0, z0), at(x0, y1, z0), at(x1, y1, z0), at(x1, y0, z0), rgb);
    face(at(x0, y1, z0), at(x0, y1, z1), at(x1, y1, z1), at(x1, y1, z0), rgb);
    face(at(x0, y0, z0), at(x1, y0, z0), at(x1, y0, z1), at(x0, y0, z1), rgb);
  };
  /**
   * A tube along the forearm round the axis at (cx, cz), from the radius r0 at y0 to r1 at y1,
   * over the angles a0 to a1 (0 out of the back, positive toward +z) in `sides` faces.
   */
  const tube = (
    cx: number,
    cz: number,
    r0: number,
    r1: number,
    y0: number,
    y1: number,
    a0: number,
    a1: number,
    sides: number,
    rgb: number[],
  ) => {
    for (let i = 0; i < sides; i++) {
      const [a, b] = [i, i + 1].map(k => a0 + ((a1 - a0) * k) / sides);
      const on = (r: number, y: number, t: number) =>
        at(cx + r * Math.cos(t), y, cz + r * Math.sin(t));
      face(on(r0, y0, a), on(r1, y1, a), on(r1, y1, b), on(r0, y0, b), rgb);
    }
  };
  /**
   * A flat stroke through `pts`, each a place (a, b) and the stroke's half width there, laid by
   * `to`, whose a then b then the way out of the face are right-handed.
   */
  const stroke = (
    pts: number[][],
    to: (a: number, b: number) => Vec3,
    rgb: number[],
    put: (a: Vec3, b: Vec3, c: Vec3, d: Vec3, rgb: number[]) => void = quad,
  ) => {
    for (let i = 0; i + 1 < pts.length; i++) {
      const [[a0, b0, w0], [a1, b1, w1]] = [pts[i], pts[i + 1]];
      const l = Math.hypot(a1 - a0, b1 - b0) || 1;
      const [na, nb] = [-(b1 - b0) / l, (a1 - a0) / l];
      put(
        to(a0 - na * w0, b0 - nb * w0),
        to(a1 - na * w1, b1 - nb * w1),
        to(a1 + na * w1, b1 + nb * w1),
        to(a0 + na * w0, b0 + nb * w0),
        rgb,
      );
    }
  };

  // The housing and, on each side, the skirt that falls round the forearm from under it.
  box(BACK, OUT, Y0, Y1, -HALF, HALF, METAL);
  for (const side of [-1, 1]) {
    const [a0, a1] = side < 0 ? [-1.75, -0.5] : [0.5, 1.75];
    tube(0, 0, SKIRT, SKIRT, Y0 + 0.004, Y1 - 0.004, a0, a1, 5, METAL);
  }
  // Fins on the near wall at the wrist end, and blocks on the ledge between the cells and the spring.
  for (let i = 0; i < 4; i++) {
    box(
      BACK + 0.006,
      OUT - 0.002,
      0.034 + 0.006 * i,
      0.037 + 0.006 * i,
      -HALF - 0.003,
      -HALF,
      EDGE,
    );
  }
  for (const [y0, y1] of [
    [0.066, 0.08],
    [0.085, 0.09],
    [0.096, 0.118],
    [0.126, 0.132],
    [0.138, 0.172],
  ]) {
    box(OUT, OUT + 0.002, y0, y1, -0.019, -0.012, METAL);
  }
  // The signs cut in the near skirt: a slot along its foot, a ring, two crossed lines, and a
  // round stud at the elbow end. `s` is the angle round the forearm.
  const skin = (r: number) => (y: number, s: number) => at(r * Math.cos(s), y, r * Math.sin(s));
  const cut = skin(SKIRT + 0.0006);
  const w = 0.0011;
  stroke(
    [
      [0.05, -1.62, w],
      [0.11, -1.62, w],
    ],
    cut,
    DARK,
  );
  stroke(
    [
      [0.125, -1.62, w],
      [0.15, -1.62, w],
    ],
    cut,
    DARK,
  );
  stroke(
    Array.from({ length: 9 }, (_, k) => {
      const a = (k * Math.PI) / 4;
      return [0.1 + 0.014 * Math.cos(a), -1.08 + (0.014 * Math.sin(a)) / SKIRT, w];
    }),
    cut,
    DARK,
  );
  for (const lean of [-1, 1]) {
    stroke(
      [-1, 0, 1].map(k => [0.145 + 0.02 * k * lean, -1.1 + 0.3 * k, w]),
      cut,
      DARK,
    );
  }
  const stud = skin(SKIRT + 0.003);
  stroke(
    Array.from({ length: 9 }, (_, k) => {
      const a = (k * Math.PI) / 4;
      return [0.19 + 0.0035 * Math.cos(a), -1.1 + (0.0035 * Math.sin(a)) / SKIRT, 0.0035];
    }),
    stud,
    EDGE,
    face,
  );

  layer = SHINE;
  // The spring along the near edge: a tube of ridges, each up to its crest and down again.
  const [pitch, coilX, coilZ] = [0.0048, OUT + 0.001, -HALF + 0.007];
  for (let y = 0.06; y < 0.177; y += pitch) {
    tube(coilX, coilZ, 0.0042, 0.0066, y, y + pitch / 2, -2.4, 1.3, 3, EDGE);
    tube(coilX, coilZ, 0.0066, 0.0042, y + pitch / 2, y + pitch, -2.4, 1.3, 3, EDGE);
  }
  // The hinge's rod along the far edge, and its two knuckles.
  const [hx, hz] = [OUT + 0.002, HALF];
  tube(hx, hz, 0.004, 0.004, Y0 + 0.003, Y1 - 0.003, 0, 2 * Math.PI, 6, METAL);
  for (const y of [0.066, 0.146]) {
    tube(hx, hz, 0.0054, 0.0054, y, y + 0.034, 0, 2 * Math.PI, 6, EDGE);
  }
  // The bezel round the cells: a bar along each side of the row, one across between two cells.
  const C0 = C1 - 4 * CELL - 3 * BAR;
  const top = OUT + 0.003;
  for (const z of [CZ - BAR, CZ + CELL]) {
    box(OUT, top, C0 - BAR, C1 + BAR, z, z + BAR, EDGE);
  }
  for (let g = 0; g <= 4; g++) {
    const y = C1 - g * (CELL + BAR);
    box(OUT, top, y, y + BAR, CZ, CZ + CELL, EDGE);
  }
  // The three bars at the wrist end.
  for (let i = 0; i < 3; i++) {
    box(OUT, OUT + 0.002, 0.036 + 0.007 * i, 0.041 + 0.007 * i, -0.022, -0.008, EDGE);
  }
  // The plate at the elbow end and the clan's sign on it: a straight claw and a hooked one from
  // one tip. Drawn as seen with the elbow on the left: to the right, then up.
  const [P0, P1, PZ] = [C1 + BAR + 0.004, Y1 - 0.003, -0.012];
  layer = TWILL;
  box(OUT, OUT + 0.002, P0, P1, PZ, PZ + 0.034, METAL);
  const sign = (up: number, right: number) =>
    at(OUT + 0.0027, P1 - right * (P1 - P0), PZ + up * 0.034);
  for (const claw of [
    [
      [0.14, 0.18, 0.006],
      [0.88, 0.5, 0.07],
    ],
    [
      [0.88, 0.44, 0.02],
      [0.7, 0.66, 0.1],
      [0.42, 0.8, 0.09],
      [0.12, 0.86, 0.006],
    ],
  ]) {
    stroke(claw, sign, PALE, face);
  }

  // The lid, open on its hinge: in its own frame it lies shut over the deck, x out of its outer
  // face, z from the hinge (0) back to its free edge (-LW). A rim stands round its inner face.
  const [lc, ls] = [Math.cos(LID), Math.sin(LID)];
  at = (x, y, z) => deck(hx + x * lc - z * ls, y, hz + x * ls + z * lc);
  const [LW, rim] = [2 * HALF - 0.004, 0.005];
  box(0, 0.004, Y0, Y1, -LW, -0.004, METAL);
  // Its tabs on the free edge, stepped, and three screws in its inner face.
  for (const [y0, y1, d] of [
    [0.04, 0.075, 0.006],
    [0.048, 0.066, 0.01],
    [0.12, 0.165, 0.006],
    [0.13, 0.155, 0.01],
  ]) {
    box(0.0005, 0.0035, y0, y1, -LW - d, -LW, EDGE);
  }
  for (const y of [0.07, 0.12, 0.17]) {
    box(-0.001, 0, y, y + 0.003, -LW + 0.012, -LW + 0.015, DARK);
  }
  layer = SHINE;
  for (const [y0, y1, z0, z1] of [
    [Y0, Y1, -LW, -LW + rim],
    [Y0, Y1, -0.004 - rim, -0.004],
    [Y0, Y0 + rim, -LW + rim, -0.004 - rim],
    [Y1 - rim, Y1, -LW + rim, -0.004 - rim],
  ]) {
    box(-0.003, 0, y0, y1, z0, z1, EDGE);
  }
  layer = TWILL;
  at = deck;

  // Each cell's black glass, sunk in the bezel. The first is the elbow's, on the left with the
  // forearm across the view; a glyph's up is +z.
  const cell = (g: number) => (up: number, right: number) =>
    at(OUT + 0.0008 + 0.0005, C1 - g * (CELL + BAR) - right * CELL, CZ + up * CELL);
  for (let g = 0; g < 4; g++) {
    const to = cell(g);
    quad(to(0, 0), to(0, 1), to(1, 1), to(1, 0), GLASS);
  }
  // The dashes: the lit ones first, then the dark ones, so that the mesh keeps its size.
  let left = n;
  const dashes: [number, Dash, boolean][] = [];
  GLYPHS.forEach((glyph, g) => {
    const on = 2 * Math.min(SHOTS[g], left);
    left -= on / 2;
    glyph.forEach((dash, i) => dashes.push([g, dash, i < on]));
  });
  for (const lit of [true, false]) {
    const from = v.length;
    for (const [g, [right, up, a], on] of dashes) {
      if (on === lit) {
        const [c, s] = [0.085 * Math.cos(a), 0.085 * Math.sin(a)];
        stroke(
          [
            [up - s, right - c, 0.03],
            [up + s, right + c, 0.03],
          ],
          (u, r) => {
            const p = cell(g)(u, r);
            return [p[0] - 0.0004, p[1], p[2]];
          },
          lit ? RED : DIM,
        );
      }
    }
    // The dark ones glow too, faintly: no light of the scene greys them.
    glow(v, from, lit ? 1.6 : 1);
  }
  // The fire key at the wrist end, lit.
  const key = v.length;
  const [ky, kz, kr] = [FIRE_KEY[1], 0.012, 0.0055];
  const ring = 8;
  for (let i = 0; i < ring; i++) {
    const [c0, c1] = [(i / ring) * 2 * Math.PI, ((i + 1) / ring) * 2 * Math.PI];
    tri(
      v,
      at(OUT + 0.0035, ky, kz),
      at(OUT + 0.0025, ky + kr * Math.cos(c0), kz + kr * Math.sin(c0)),
      at(OUT + 0.0025, ky + kr * Math.cos(c1), kz + kr * Math.sin(c1)),
      RED,
    );
  }
  glow(v, key, 1.8);
  built.set(n, v);
  return v;
};
