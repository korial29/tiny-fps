import { TAU } from '../../shared/physics';
import { ease } from '../gun';
import { cross, face, sheet } from '../helmet';
import type { Spot } from '../helmet';
import { GLOSS, STRIDE, unit } from '../mesh';
import type { Vec3 } from '../mesh';
import { JOINT as J, turn } from '../rig';
import type { Quat } from '../rig';
import { CREST_E, CREST_LEN, HEAD_K, HEAD_X, RIM, bindOf, domeAt } from '../skin';
import { room } from '../verts';
import type { Out } from '../verts';
import { CHITIN_X, SIDES, on } from './common';
import { strand } from './body';
import { edgeAt } from './mouth';

/** A value on a curve through [y, value] points, by y, highest first. */
export const curve = (pts: number[][], y: number) => {
  // At or under the last point, the last segment: the first one gave the chin's lowest row the
  // forehead's depth, a spike under it.
  const i = pts.findIndex(p => p[0] < y);
  const k = Math.min(Math.max(i < 0 ? pts.length - 1 : i, 1), pts.length - 1);
  const [[y0, a], [y1, b]] = [pts[k - 1], pts[k]];
  const t = Math.min(Math.max((y - y0) / (y1 - y0), 0), 1);
  return a + (b - a) * t * t * (3 - 2 * t);
};

// Its face, a human skull's (the user, 2026-11-15), on the head joint, in front of the dome and in
// the dome's colour: how far forward and how wide it is at each height, from a round forehead down
// to the chin.
export const DEPTH = [
  [0.115, 0.098],
  [0.09, 0.113],
  [0.06, 0.12],
  [0.035, 0.121],
  [0.012, 0.115],
  // Under the carapace's edge the face falls straight, a little back: no muzzle (the user,
  // 2026-11-24: the mouth must not stand out as a beak), the cheeks full down to the chin.
  [-0.012, 0.106],
  [-0.026, 0.1],
  [-0.06, 0.098],
  [-0.08, 0.085],
  // Its underside rounding back: the face's lowest point, where its grid closes, no spike.
  [-0.095, 0.045],
];
/** How deep the throat is behind the mouth, by height, as DEPTH: under the upper jaw's edge (GUM). */
export const THROAT = [
  [-0.026, 0.1],
  [-0.034, 0.052],
  [-0.084, 0.045],
  [-0.095, 0.03],
];
/**
 * Its carapace (the user, 2026-11-24: no eyes; the whole top of the head from their line up smooth,
 * black and glossy): its colour, the height on the face it ends at, and how far its edge stands
 * out of the face under it, metres.
 */
export const SHELL = [0.012, 0.012, 0.016];
export const LIP = 0.004;
/**
 * The carapace's edge (the user, 2026-11-24: the top of the skull closes over the lower part along
 * a curve): on the face low over the upper jaw across the mouth (EDGE[0]), rising beside it to
 * EDGE[1] at the face's rim; then along the dome, as a share of each section's half height from
 * its middle, on up to EDGE[2] over RISE metres, and level from there. A rolled rim runs along it
 * (rim()), ROLL thick.
 */
export const EDGE = [-0.021, -0.004, 0.1];
export const [RISE, ROLL] = [0.16, 0.0048];
/** The height of the upper jaw's edge on the face, the throat under it (its jaws, further down). */
export const GUM = -0.026;
/** Its head's chitin: the dome's (the skin's TRIM, soldier.ts) and its face's, the body's own. */
export const HEAD = CHITIN_X;
export const [DARK, TEETH] = [
  [0.02, 0.02, 0.025],
  // Steel bright (the user, 2026-11-16: metal teeth).
  [0.66, 0.68, 0.72],
];
/**
 * The head's front (the user, 2026-11-15: one smooth block with the back): an ellipsoid round the
 * middle of the head, its centre's height and its half width, height and depth. Its rim is the
 * dome's front ring (CREST in skin.ts), so the face, as wide as it at every height, meets the dome
 * with no seam; over the orbits the face is the ellipsoid itself, a smooth forehead.
 */
/**
 * How far the head is carried over its joint (the user, 2026-11-15: a neck that shows): the face
 * here, the dome in skin.ts (PROFILE), the neck's skin run up to it.
 */
export const HEAD_UP = 0.065;
/**
 * The vertices written to `o` from `from` on, made HEAD_K larger about `at` and HEAD_X narrower
 * across the head (`q` its turn); the normals squeezed back.
 */
export const grow = (o: Out, from: number, at: Vec3, q: Quat) => {
  const a = room(o, 0);
  const [qx, qy, qz, qw] = q;
  // turn() by q (s 1) or its inverse (s -1), written out: four a vertex over the head's tens of
  // thousands allocated most of the map's load.
  let [X, Y, Z] = [0, 0, 0];
  const rot = (s: number, x: number, y: number, z: number) => {
    const [ux, uy, uz] = [s * qx, s * qy, s * qz];
    const tx = 2 * (uy * z - uz * y);
    const ty = 2 * (uz * x - ux * z);
    const tz = 2 * (ux * y - uy * x);
    X = x + qw * tx + uy * tz - uz * ty;
    Y = y + qw * ty + uz * tx - ux * tz;
    Z = z + qw * tz + ux * ty - uy * tx;
  };
  for (let i = from; i < o.length; i += STRIDE) {
    rot(-1, a[i] - at[0], a[i + 1] - at[1], a[i + 2] - at[2]);
    rot(1, X * HEAD_K * HEAD_X, Y * HEAD_K, Z * HEAD_K);
    a[i] = at[0] + X;
    a[i + 1] = at[1] + Y;
    a[i + 2] = at[2] + Z;
    rot(-1, a[i + 3], a[i + 4], a[i + 5]);
    const mx = X / HEAD_X;
    const l = Math.hypot(mx, Y, Z) || 1;
    rot(1, mx / l, Y / l, Z / l);
    a[i + 3] = X;
    a[i + 4] = Y;
    a[i + 5] = Z;
  }
};
// A lower, flatter forehead (the user, 2026-11-15: too conical), the chin where it was.
// Lower again (the user, 2026-11-24: an egg seen from the front): 1 cm off its top, and the
// section squarer than an ellipse, as the dome's (CREST_E).
export const [EY, EA, EB, EC] = [0, 0.084, 0.095, 0.105];
/** How far out of the head's section (x, y) is, 1 on its rim. */
export const reach = (x: number, y: number) =>
  (Math.abs(x / EA) ** CREST_E + Math.abs((y - EY) / EB) ** CREST_E) ** (1 / CREST_E);
/** The point at `a` radians from the top round a section of half width 1 and half height 1, and the way out of it there (to scale by the other half size each). */
export const round = (a: number) => {
  const p = [Math.sin(a), Math.cos(a)].map(v => Math.sign(v) * Math.abs(v) ** (2 / CREST_E));
  return [...p, ...p.map(v => Math.sign(v) * Math.abs(v) ** (CREST_E - 1))];
};
/** How much of the forehead's sphere the face is at height y: none under the orbits, all over them. */
export const brow = (y: number) => {
  // From under the carapace's edge: over it the head is the one smooth ellipsoid, no crease.
  const t = Math.min(Math.max((y + 0.034) / 0.03, 0), 1);
  return t * t * (3 - 2 * t);
};
/** The top of the face, and its half width at height y. */
export const TOP = EY + EB;
/** The bottom of the chin (the user, 2026-11-15: a short one). */
export const CHIN = EY - EB;
export const widthOf = (y: number) =>
  EA * Math.max(0, 1 - Math.abs((y - EY) / EB) ** CREST_E) ** (1 / CREST_E);
/** [0, 1] onto itself, the steps packed where `density` (of the place, 0 to 1) is high. */
export const warp = (density: (t: number) => number) => {
  const n = 400;
  const acc = [0];
  for (let i = 1; i <= n; i++) {
    acc.push(acc[i - 1] + density((i - 0.5) / n));
  }
  return (v: number) => {
    const goal = v * acc[n];
    // The first step at or past the goal, by halving: the face's grid asks for thousands.
    let [lo, hi] = [0, n + 1];
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      [lo, hi] = acc[m] >= goal ? [lo, m] : [m + 1, hi];
    }
    const i = Math.min(Math.max(lo > n ? -1 : lo, 1), n);
    return (i - 1 + (goal - acc[i - 1]) / (acc[i] - acc[i - 1])) / n;
  };
};
/**
 * The grid's rows and columns, near and close: the rows packed toward the top, the columns a
 * little off the middle each side.
 */
export const [ROWS, COLS] = [
  [2.2, 4].map(k =>
    // Packed toward the top, where the ellipsoid turns level: evenly spaced, its first row lay
    // 3 cm ahead of the dome's edge, a flat facet the carapace's gloss showed.
    // And round the upper jaw's edge, where it drops into the throat.
    warp(
      t =>
        1 +
        (0.25 * k) / Math.sqrt(t + 0.003) +
        k * Math.exp(-(((TOP - (TOP - CHIN) * t - GUM + 0.004) / 0.008) ** 2)),
    ),
  ),
  [1.6, 2.6].map(k => warp(t => 1 + k * Math.exp(-(((Math.abs(2 * t - 1) - 0.38) / 0.26) ** 2)))),
];
/** The height of the grid's row `v` (0 the top, 1 the chin), on the close grid if `fine`. */
export const rowY = (v: number, fine: boolean) => TOP - (TOP - CHIN) * ROWS[+fine](v);
/** The grid's column `u` (-1 to 1, evenly spaced) moved to pack over the orbits, on the close grid if `fine`. */
export const colU = (u: number, fine: boolean) => -1 + 2 * COLS[+fine]((u + 1) / 2);
/** The face's surface at (x, y): an ellipse's front under the carapace's ellipsoid, the cheekbones out, the throat under the upper jaw. */
export const faceZ = (x: number, y: number) => {
  const u = Math.min(Math.abs(x) / Math.max(widthOf(y), 1e-6), 1);
  // The mouth: between the cheeks, under the upper jaw's edge, the face falls back to the throat.
  const mouth =
    (1 - ease((Math.abs(x) - 0.036) / 0.012)) *
    ease((GUM - y) / 0.007) *
    (1 - ease((-0.1 - y) / 0.01));
  const d = curve(DEPTH, y);
  // The cheeks beside the mouth cut back under the carapace (the user, 2026-11-24: smaller
  // cheeks): past the mouth's corners the face falls back toward the dome's edge, the jaws a
  // narrow block under the wider dome.
  const cheek = 1 - 0.75 * ease((Math.abs(x) - 0.038) / 0.02) * ease((-0.012 - y) / 0.012);
  const low = -(d + (curve(THROAT, y) - d) * mouth) * Math.sqrt(1 - u * u) * cheek;
  const dome = -EC * Math.sqrt(Math.max(0, 1 - reach(x, y) ** 2));
  return (
    low +
    (dome - low) * brow(y) -
    // The cheekbones, low (the user, 2026-11-16: too wide).
    0.004 * Math.exp(-(((Math.abs(x) - 0.054) / 0.011) ** 2) - ((y + 0.008) / 0.011) ** 2)
  );
};
/** How much of the dome's rim the face takes at (x, y): none inside, all at its edge. */
export const rimOf = (x: number, y: number) =>
  Math.min(Math.max((reach(x, y) - 0.62) / 0.38, 0), 1) ** 2;
/**
 * The face as skull() draws it at (x, y): faceZ, its rim tucked a hair under the dome's front ring.
 * What lies on the face follows this.
 */
export const faceAt = (x: number, y: number): Vec3 => {
  const w = rimOf(x, y);
  const g = 1 + 0.01 * w;
  return [x * g, EY + (y - EY) * g, faceZ(x, y) + 0.004 * w];
};
/**
 * Its jaws (the user, 2026-11-24: the gaping jaws of the reference picture, no tongue). The upper
 * one is the face's edge at GUM, the throat falling back under it. The lower one is a piece of its
 * own (jaw()), a U hung open GAPE radians from HINGE (the right one) each side: its rami run
 * forward to an arc ARC[0] wide and ARC[1] deep round the point ARC[2] ahead, in a plane through
 * the hinges.
 */
export const HINGE: Vec3 = [0.05, -0.036, -0.02];
// Shut (the user, 2026-11-24: its mouth closed): the mandible's lip a tooth's length under the
// upper jaw's edge, the teeth clenched between them. It was 0.8, gaping, FLOOR 3 cm lower with it.
export const GAPE = 0.42;
// A narrow mouth (the user, 2026-11-24). Its front flush with the face over it: 1 cm further back,
// as it hung open, the shut mandible sat behind the upper jaw (the user, 2026-11-24).
export const ARC = [0.034, 0.034, -0.055];
/** The height of the mandible's underside, under the chin and at the hinges. */
export const FLOOR = [-0.091, -0.081];
/** The jaw's plane: the way its teeth point, and its height `z` ahead. */
export const JAW_UP: Vec3 = [0, Math.cos(GAPE), -Math.sin(GAPE)];
export const jawY = (z: number) => HINGE[1] - (HINGE[2] - z) * Math.tan(GAPE);
/** The middle of the right ramus `t` of the way from the hinge to the arc, and of the arc at `a` radians from its front (positive to the right). */
export const ramusAt = (t: number, s = 1): Vec3 => {
  const z = HINGE[2] + (ARC[2] - HINGE[2]) * t;
  return [s * (HINGE[0] + (ARC[0] - HINGE[0]) * (1 - (1 - t) ** 2)), jawY(z), z];
};
export const arcAt = (a: number): Vec3 => {
  const z = ARC[2] - ARC[1] * Math.cos(a);
  return [ARC[0] * Math.sin(a), jawY(z), z];
};
/** The mandible's half height where it is `x` out from the middle: deepest at the chin. */
export const jawH = (x: number) => 0.011 + 0.008 * Math.exp(-((x / 0.027) ** 2));

/**
 * Its face, eyeless: over EDGE the front of its glossy carapace, one smooth ellipsoid with the
 * dome; under it its chitin, the cheekbones, no nose, the mouth wide open, an opening whose edge
 * the lips hide, dark inside, with steel teeth, the fangs longest. A grid over the face, finer the
 * closer.
 */
export const skull = (out: Out, head: Vec3, q: Quat, lod: number) => {
  const at = on(head, q, [0, HEAD_UP, 0]);
  const [nx, ny] = [
    [8, 10],
    [22, 38],
    [22, 38],
    [50, 72],
  ][lod];
  // The row the carapace ends on: the nearest to its edge across the mouth.
  let je = 0;
  for (let j = 1; j <= ny; j++) {
    const d = (k: number) => Math.abs(rowY(k / ny, lod > 2) - EDGE[0]);
    je = d(j) < d(je) ? j : je;
  }
  const ye = rowY(je / ny, lod > 2);
  /**
   * Where the grid's node (u, v) is on the face: its rows bent up beside the mouth, most the
   * edge's, which follows the carapace's curve up to the rim, none the top's and the chin's.
   */
  const xy = (u: number, v: number): [number, number] => {
    const y0 = rowY(v, lod > 2);
    const c = colU(u, lod > 2);
    const w0 = widthOf(y0);
    const t = w0 > 0.031 ? (Math.abs(c) * w0 - 0.03) / (w0 - 0.03) : 1;
    const bend = y0 > ye ? (TOP - y0) / (TOP - ye) : (y0 - CHIN) / (ye - CHIN);
    const y = y0 + (EDGE[1] - EDGE[0]) * ease(t) * bend;
    return [c * widthOf(y), y];
  };
  const spot = (u: number, v: number, shell = false): Spot => {
    const [x, y] = xy(u, v);
    // The slope from central differences a hair inside the rim (outside it the surface is flat),
    // turned at the rim to the dome's own normal there, straight out of the ellipse: no seam in the
    // light where the face meets the back of the head.
    const h = 1e-3;
    const [xi, yi] = [x * 0.97, EY + (y - EY) * 0.97];
    const dz = [
      (faceZ(xi + h, yi) - faceZ(xi - h, yi)) / (2 * h),
      (faceZ(xi, yi + h) - faceZ(xi, yi - h)) / (2 * h),
    ];
    const m: Vec3 = unit([dz[0], dz[1], -1]);
    // The dome's own normal on its front ring, with the slope of its first strip (RIM): straight
    // out of the ellipse, it was 4 degrees off the dome's on top, a reflection cut at the join.
    const [sn, cs] = [x / EA, (y - EY) / EB];
    const [gs, gc] = [sn, cs].map(v => Math.sign(v) * Math.abs(v) ** (CREST_E - 1));
    const rim = unit([
      EB * gs,
      EA * gc,
      -(EA * gc * (RIM[0] + RIM[2] * cs) + EB * RIM[1] * Math.abs(sn) ** CREST_E),
    ]);
    const w = rimOf(x, y);
    const n = unit([0, 1, 2].map(i => m[i] * (1 - w) + rim[i] * w) as Vec3);
    // The rim tucked a hair under the dome's front ring: no crack where their vertices differ.
    const p = faceAt(x, y);
    // The carapace stands a little proud of the face, but at the rim, where it goes a hair under
    // the dome's front ring: over it, as the chitin does, its edge was a ridge in the gloss.
    const k = (1 - 0.006 * w) / (1 + 0.01 * w);
    return [
      on(at, q, shell ? [p[0] * k, EY + (p[1] - EY) * k, p[2] - LIP * (1 - w)] : p),
      turn(q, n),
    ];
  };
  // Each node of the grid worked out once: it is the corner of six triangles. The carapace's rows
  // down to its edge, then the face's from there: the edge's row twice, a step between them.
  const [nodes, over]: Spot[][] = [[], []];
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      const [u, v] = [(2 * i) / nx - 1, j / ny];
      nodes.push(spot(u, v, j < je));
      if (j == je) {
        over.push(spot(u, v, true));
      }
    }
  }
  /** The grid's node in column i, row j; `up`, the carapace's on the edge's row. */
  const node = (i: number, j: number, up = false) =>
    up && j == je ? over[i] : nodes[j * (nx + 1) + i];
  // Under the upper jaw the throat, dark in its middle, behind the mandible.
  const tri = (p: [number, number][], s: Spot[]) => {
    const [u, v] = [0, 1].map(k => (p[0][k] + p[1][k] + p[2][k]) / 3);
    const [x, y] = xy(u, v);
    const deep = y < GUM - 0.008 && Math.abs(x) < 0.039;
    face(out, v < je / ny ? SHELL : deep ? DARK : HEAD, v < je / ny ? GLOSS : -1, s);
  };
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const [u0, u1, v0, v1] = [(2 * i) / nx - 1, (2 * (i + 1)) / nx - 1, j / ny, (j + 1) / ny];
      tri(
        [
          [u0, v0],
          [u1, v0],
          [u1, v1],
        ],
        [node(i, j), node(i + 1, j), node(i + 1, j + 1, j < je)],
      );
      tri(
        [
          [u0, v0],
          [u1, v1],
          [u0, v1],
        ],
        [node(i, j), node(i + 1, j + 1, j < je), node(i, j + 1, j < je)],
      );
    }
  }
  // The underside of the carapace's edge, down to the face.
  const under = turn(q, unit([0, -1, -0.4]));
  for (let i = 0; i < nx; i++) {
    const [a, b, c, d] = [over[i], over[i + 1], node(i + 1, je), node(i, je)].map(([p]): Spot => [
      p,
      under,
    ]);
    face(out, SHELL, GLOSS, [a, b, c]);
    face(out, SHELL, GLOSS, [a, c, d]);
  }
  if (!lod) {
    return;
  }
  // The carapace's rolled rim, one piece: up one side of the dome from near its tip, across the
  // face over the step, and back down the other side, thinning out toward the tip.
  const rest = bindOf(0)[J.HEAD];
  const [n, k, len] = [lod > 2 ? 32 : 16, lod > 2 ? 28 : 14, CREST_LEN * 0.86];
  const side = (s: number) =>
    Array.from({ length: k }, (_, i): [Vec3, number] => {
      const z = (len * (i + 1)) / k;
      const [c, w, h] = domeAt(z);
      const [sn, cs, gs, gc] = round(s * edgeAt(z));
      const m = unit([gs / w, gc / h, 0]);
      return [
        [w * sn + m[0] * 0.0015, c + h * cs + m[1] * 0.0015 - rest[1], z],
        ROLL * (1 - (z / len) ** 3) + 0.0004,
      ];
    });
  const across = Array.from({ length: n + 1 }, (_, i): [Vec3, number] => {
    const [x, y] = xy((2 * i) / n - 1, je / ny);
    const p = faceAt(x, y);
    return [[p[0], p[1] + HEAD_UP, p[2] - LIP * (1 - rimOf(x, y))], ROLL];
  });
  const roll = [...side(-1).reverse(), ...across, ...side(1)];
  strand(
    out,
    head,
    q,
    roll.map(([p]) => p),
    roll.map(([, r]) => r),
    SIDES[0][lod],
    SHELL,
    GLOSS,
    true,
    [0, 1, 0],
  );
};

/**
 * Its lower jaw (HINGE, ARC), on the head joint: a bone taller than wide round the U, deepest at
 * the chin, its ends buried in the throat behind the cheeks.
 */
export const jaw = (out: Out, head: Vec3, q: Quat, lod: number) => {
  const at = on(head, q, [0, HEAD_UP, 0]);
  const [nr, na, n] = [
    [1, 4, 4],
    [2, 8, 6],
    [2, 8, 6],
    [4, 16, 10],
  ][lod];
  const pts: Vec3[] = [
    ...Array.from({ length: nr }, (_, i) => ramusAt(i / nr)),
    ...Array.from({ length: na + 1 }, (_, i) => arcAt(Math.PI / 2 - (Math.PI * i) / na)),
    ...Array.from({ length: nr }, (_, i) => ramusAt(1 - (i + 1) / nr, -1)),
  ];
  const last = pts.length - 1;
  const rings = pts.map((p, i): Spot[] => {
    const [a, b] = [pts[Math.max(i - 1, 0)], pts[Math.min(i + 1, last)]];
    const t = unit([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
    const side = unit(cross(t, JAW_UP));
    const [w, h] = [0.008 + 0.005 * Math.exp(-((p[0] / 0.03) ** 2)), jawH(p[0])];
    // Its underside does not climb to the hinge with the jaw's own slope (the user, 2026-11-24:
    // fuller, filling the space toward the head): each section reaches down to a line nearly
    // level from under the chin to the jaw's angle, under the cheek.
    const front = ARC[2] - ARC[1];
    const floor = FLOOR[0] + ((FLOOR[1] - FLOOR[0]) * (p[2] - front)) / (HINGE[2] - front);
    const down: Vec3 = [0, Math.max(0, p[1] - JAW_UP[1] * h - floor), 0];
    return Array.from({ length: n }, (_, k): Spot => {
      const [c, s] = [Math.cos((k / n) * TAU), Math.sin((k / n) * TAU)];
      const v = JAW_UP.map((u, j) => u * h + (s < 0 ? down[j] : 0));
      const l = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
      return [
        on(at, q, [0, 1, 2].map(j => p[j] + side[j] * w * c + v[j] * s) as Vec3),
        turn(q, unit([0, 1, 2].map(j => (side[j] * c) / w + (v[j] * s) / l) as Vec3)),
      ];
    });
  });
  const back = turn(q, [0, 0, 1]);
  sheet([[[on(at, q, pts[0]), back]], ...rings, [[on(at, q, pts[last]), back]]], HEAD, -1, out);
};
