// The station's command room, drawn (the user, 2026-11-27, after a picture of a throne room): a
// hall 30 m high whose east wall is a round window on space, framed by a ring with spokes under a
// lit arch, a flight of lit steps between railings up to the dais and its console, a high-backed
// chair facing the window, galleries each side under walls of ribs and glowing screens, beams and
// two hanging lamps under the ceiling. The brushes (shared/station.ts) are the floor, the walls,
// the steps, the dais and the galleries; this is their dressing. No DOM.
import { COMMAND, HULL } from '../../shared/station';
import type { StationDef } from '../../shared/station';
import type { Vec3 } from '../mesh';
import { computer } from './computer';
import { bar, slab, vert } from './kit';
import type { Out } from './kit';

const WALL = [0.2, 0.22, 0.26];
const FRAME = [0.5, 0.53, 0.58];
const RIB = [0.13, 0.14, 0.17];
const RAIL = [0.62, 0.65, 0.7];
const COLLARED = [0.42, 0.44, 0.48];
const DARK = [0.06, 0.06, 0.07];
const SEAT = [0.1, 0.1, 0.12];
/** Bright and unlit: the bloom makes them glow. */
const GLOW = [0.3, 0.45, 0.9];
const PANEL = [0.55, 0.7, 1.1];
const SCREEN = [0.08, 0.35, 0.8];
const LAMP = [2.2, 2.3, 2.6];
const TAU = 2 * Math.PI;
/** Segments round the window. */
const N = 48;

/** A flat quad a b c d, its normal from its winding (right hand), two triangles. */
const quad = (o: Out, a: Vec3, b: Vec3, c: Vec3, d: Vec3, rgb: number[], layer = -1) => {
  const [u, v] = [b, c].map(p => p.map((k, i) => k - a[i]));
  const n: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const l = Math.hypot(...n) || 1;
  for (const p of [a, b, c, a, c, d]) {
    vert(o, p, [n[0] / l, n[1] / l, n[2] / l], rgb, layer);
  }
};

/**
 * A piece of the window's wall: the shape q in the (z, y) plane (four corners, counter-clockwise
 * seen from the room) from x0 (its face to the room) back to x1, its sides closed.
 */
const prism = (
  o: Out,
  q: [number, number][],
  x0: number,
  x1: number,
  rgb: number[],
  layer = -1,
) => {
  const at = ([z, y]: [number, number], x: number): Vec3 => [x, y, z];
  quad(o, at(q[0], x0), at(q[1], x0), at(q[2], x0), at(q[3], x0), rgb, layer);
  for (let i = 0; i < 4; i++) {
    const [a, b] = [q[i], q[(i + 1) % 4]];
    quad(o, at(b, x0), at(a, x0), at(a, x1), at(b, x1), rgb, layer);
  }
};

/** The window's middle (z, y) and its radius, and the x of its pane. */
const window = ({ hull: [x, , z], deck }: StationDef) => ({
  cz: z,
  cy: deck + COMMAND.DAIS + COMMAND.UP,
  px: x + COMMAND.X1,
});

/**
 * The collar round the window on the hull: from the pane's radius out to COLLAR, wider than a hull
 * facet's diagonal past it, so it covers the stepped edge of the facets left out (cut()).
 */
const COLLAR = COMMAND.R + 5;

/**
 * Whether a hull facet over z0..z1 and y0..y1, its middle at x, is left out for the window: on the
 * window's side, any of it within the pane's radius of the window's middle.
 */
export const cut = (def: StationDef, x: number, z0: number, z1: number, y0: number, y1: number) => {
  const { cz, cy, px } = window(def);
  const dz = Math.max(Math.min(z0, z1) - cz, cz - Math.max(z0, z1), 0);
  const dy = Math.max(y0 - cy, cy - y1, 0);
  return x > px - 4 && Math.hypot(dz, dy) < COMMAND.R + 0.3;
};

/** Whether a piece on the hull at (x, z), height y, half `pad` wide, would stand on the collar. */
export const hole = (def: StationDef, x: number, z: number, y: number, pad: number): boolean => {
  const { cz, cy, px } = window(def);
  return x > px - 4 && Math.hypot(z - cz, y - cy) < COLLAR + 0.5 + pad;
};

/** The command room's dressing, onto o. */
export const command = (o: Out, def: StationDef) => {
  const { X0, X1, Z, H, STAIR0, STAIR1, STEPS, W, DAIS, GALLERY, SIDE, R } = COMMAND;
  const {
    hull: [cx, , cz],
    deck: Y,
  } = def;
  const { cy, px } = window(def);
  const [x0, x1] = [cx + X0, cx + X1];
  const ring = (r: number, t: number): [number, number] => [
    cz + r * Math.cos(t),
    cy + r * Math.sin(t),
  ];
  // The wall round the pane, from the circle out to the room's sides, floor and ceiling: a fan with
  // the rectangle's corners among its angles so each piece of it is straight. Both sides drawn:
  // from outside it is seen down the window's tube.
  const corners = [
    [Z, Y + H - cy],
    [-Z, Y + H - cy],
    [-Z, Y - cy],
    [Z, Y - cy],
  ].map(([dz, dy]) => (Math.atan2(dy, dz) + TAU) % TAU);
  const angles = [...Array.from({ length: N + 1 }, (_, i) => (i * TAU) / N), ...corners].sort(
    (a, b) => a - b,
  );
  const edge = (t: number): [number, number] => {
    const [c, s] = [Math.cos(t), Math.sin(t)];
    const k = Math.min(
      Math.abs(c) > 1e-9 ? Z / Math.abs(c) : Infinity,
      s > 1e-9 ? (Y + H - cy) / s : s < -1e-9 ? (Y - cy) / s : Infinity,
    );
    return [cz + k * c, cy + k * s];
  };
  for (let i = 0; i + 1 < angles.length; i++) {
    const [a, b] = [angles[i], angles[i + 1]];
    if (b - a < 1e-6) {
      continue;
    }
    const q = [ring(R, a), ring(R, b), edge(b), edge(a)];
    const at = ([z, y]: [number, number], x: number): Vec3 => [x, y, z];
    quad(o, at(q[0], px), at(q[1], px), at(q[2], px), at(q[3], px), WALL);
    quad(o, at(q[3], px + 0.5), at(q[2], px + 0.5), at(q[1], px + 0.5), at(q[0], px + 0.5), WALL);
  }
  // Outside: a tube from the pane out through the hull and a collar lying on the hull round it.
  // One face each, the one seen: the tube's faces its axis (it is seen from inside it, from the
  // room as from space), the collar's faces out. Nothing is culled, so a second face the other way
  // would lie on the first, split along the other diagonal, and the two would flicker in turn.
  const hull = (r: number, t: number, off: number): Vec3 => {
    const [z, y] = ring(r, t);
    return [cx + Math.sqrt(HULL.R ** 2 - (z - cz) ** 2) + off, y, z];
  };
  for (let i = 0; i < N; i++) {
    const [a, b] = [(i * TAU) / N, ((i + 1) * TAU) / N];
    const [za, ya] = ring(R, a);
    const [zb, yb] = ring(R, b);
    quad(o, [px + 0.5, ya, za], [px + 0.5, yb, zb], hull(R, b, 0.3), hull(R, a, 0.3), FRAME);
    quad(
      o,
      hull(R, a, 0.3),
      hull(R, b, 0.3),
      hull(COLLAR, b, 0.15),
      hull(COLLAR, a, 0.15),
      COLLARED,
    );
    quad(
      o,
      hull(COLLAR, a, 0.15),
      hull(COLLAR, b, 0.15),
      hull(COLLAR, b, -0.3),
      hull(COLLAR, a, -0.3),
      RIB,
    );
  }
  // The frame: a deep ring round the pane, a lit arch of panels over it, a ring and spokes in it.
  for (let i = 0; i < N; i++) {
    const [a, b] = [(i * TAU) / N, ((i + 1) * TAU) / N];
    prism(o, [ring(R, a), ring(R - 0.7, a), ring(R - 0.7, b), ring(R, b)], px - 0.8, px, FRAME);
    prism(o, [ring(R + 1.6, a), ring(R, a), ring(R, b), ring(R + 1.6, b)], px - 0.3, px, RIB);
    prism(o, [ring(4.6, a), ring(4.1, a), ring(4.1, b), ring(4.6, b)], px - 0.4, px, FRAME);
  }
  for (let i = 0; i < 9; i++) {
    const [a, b] = [((i + 0.06) * Math.PI) / 9, ((i + 0.94) * Math.PI) / 9];
    prism(
      o,
      [ring(R + 3, a), ring(R + 1.7, a), ring(R + 1.7, b), ring(R + 3, b)],
      px - 1.2,
      px,
      FRAME,
    );
    prism(
      o,
      [ring(R + 2.8, a), ring(R + 1.9, a), ring(R + 1.9, b), ring(R + 2.8, b)],
      px - 1.25,
      px,
      PANEL,
      -2,
    );
  }
  for (let i = 0; i < 8; i++) {
    const t = (i * TAU) / 8 + TAU / 16;
    const [c, s] = [Math.cos(t), Math.sin(t)];
    const w = 0.18;
    const p = (r: number, k: number): [number, number] => [cz + r * c - k * s, cy + r * s + k * c];
    prism(o, [p(R - 0.6, w), p(4.4, w), p(4.4, -w), p(R - 0.6, -w)], px - 0.3, px, FRAME);
  }
  // The steps: a lit edge on each; railings up both sides, along the galleries and the dais.
  const run = (STAIR1 - STAIR0) / STEPS;
  for (let k = 0; k < STEPS; k++) {
    const [x, y] = [cx + STAIR0 + run * k, Y + (DAIS * (k + 1)) / STEPS];
    slab(o, [x - 0.02, y - 0.08, cz - W + 0.1], [x + 0.06, y - 0.02, cz + W - 0.1], GLOW, -2);
  }
  for (const s of [-1, 1]) {
    const z = cz + s * (W - 0.15);
    const lo = cx + STAIR0 + 0.3;
    bar(o, [lo, Y + 1.1, z], [cx + STAIR1, Y + DAIS + 1.1, z], 0.05, RAIL);
    for (let x = lo; x < cx + STAIR1; x += 1.5) {
      const y = Y + (DAIS * (x - cx - STAIR0 + run)) / (STAIR1 - STAIR0);
      bar(o, [x, Math.min(y, Y + DAIS), z], [x, Math.min(y, Y + DAIS) + 1.1, z], 0.04, RAIL);
    }
    // Along the gallery's edge and across the dais's front, between the steps and the gallery.
    const g = cz + s * (SIDE + 0.15);
    for (const [a, b] of [
      [
        [cx + GALLERY + 0.15, g],
        [cx + STAIR1 + 0.15, g],
      ],
      [
        [cx + STAIR1 + 0.15, g],
        [cx + STAIR1 + 0.15, cz + s * W],
      ],
      [
        [cx + GALLERY + 0.15, g],
        [cx + GALLERY + 0.15, cz + s * (Z - 0.3)],
      ],
    ]) {
      bar(o, [a[0], Y + DAIS + 1.1, a[1]], [b[0], Y + DAIS + 1.1, b[1]], 0.05, RAIL);
      const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 1.5));
      for (let j = 0; j <= n; j++) {
        const [x, z2] = [a[0] + ((b[0] - a[0]) * j) / n, a[1] + ((b[1] - a[1]) * j) / n];
        bar(o, [x, Y + DAIS, z2], [x, Y + DAIS + 1.1, z2], 0.04, RAIL);
      }
    }
    // The side walls: ribs to the ceiling, a cornice, screens over each gallery, lamps along its foot.
    const wall = cz + s * Z;
    const inner = (d: number): [number, number] => (s < 0 ? [wall, wall + d] : [wall - d, wall]);
    for (let x = x0 + 1.5; x < x1 - 0.5; x += 3) {
      const [za, zb] = inner(0.7);
      slab(o, [x - 0.3, Y, za], [x + 0.3, Y + H, zb], RIB);
    }
    const [ca, cb] = inner(1.1);
    slab(o, [x0, Y + 19, ca], [x1, Y + 19.6, cb], RIB);
    const [sa, sb] = inner(0.05);
    for (let x = x0 + 4.6; x < cx + STAIR1; x += 3) {
      slab(o, [x - 1.1, Y + 8, sa], [x + 1.1, Y + 12, sb], PANEL, -2);
      slab(o, [x - 1.1, Y + 22, sa], [x + 1.1, Y + 26, sb], SCREEN, -2);
    }
    // A console along the gallery's wall, its screens over it.
    const [da, db] = inner(1.1);
    slab(o, [cx + GALLERY + 0.6, Y + DAIS, da], [cx + STAIR1 - 0.4, Y + DAIS + 1, db], DARK);
    for (let x = cx + GALLERY + 1; x < cx + STAIR1 - 1.8; x += 2.3) {
      slab(o, [x, Y + DAIS + 1.4, sa], [x + 1.9, Y + DAIS + 2.6, sb], SCREEN, -2);
    }
    const [la, lb] = inner(0.25);
    slab(o, [x0, Y + 0.05, la], [cx + GALLERY, Y + 0.15, lb], GLOW, -2);
    // On the dais, a lit pedestal each side of the console.
    const pz = cz + s * 6;
    slab(o, [cx + 37.4, Y + DAIS, pz - 0.6], [cx + 38.6, Y + DAIS + 1.2, pz + 0.6], DARK);
    slab(
      o,
      [cx + 37.3, Y + DAIS + 1.2, pz - 0.7],
      [cx + 38.7, Y + DAIS + 1.3, pz + 0.7],
      PANEL,
      -2,
    );
    // Two lamps hang over the dais from arms under the ceiling.
    const hz = cz + s * 3;
    bar(o, [cx + 36, Y + H, hz], [cx + 36, Y + 18, hz], 0.25, FRAME);
    bar(o, [cx + 36, Y + 18, hz], [cx + 38, Y + 14, hz], 0.2, FRAME);
    slab(o, [cx + 37.6, Y + 13.4, hz - 0.4], [cx + 38.4, Y + 14, hz + 0.4], LAMP, -2);
  }
  computer(o, def);
  // The chair, behind the console facing the window: a seat on a pedestal, a high back.
  const [kx, ky] = [cx + 39.6, Y + DAIS];
  slab(o, [kx - 0.3, ky, cz - 0.3], [kx + 0.3, ky + 0.45, cz + 0.3], DARK);
  slab(o, [kx - 0.45, ky + 0.45, cz - 0.45], [kx + 0.45, ky + 0.6, cz + 0.45], SEAT);
  slab(o, [kx - 0.6, ky + 0.6, cz - 0.5], [kx - 0.45, ky + 2.2, cz + 0.5], SEAT);
  for (const s of [-1, 1]) {
    slab(
      o,
      [kx - 0.45, ky + 0.6, cz + s * 0.45 - 0.07],
      [kx + 0.4, ky + 0.9, cz + s * 0.45 + 0.07],
      SEAT,
    );
  }
  // The west wall: a lit frame round the doorway, the cornice across.
  for (const s of [-1, 1]) {
    slab(o, [x0, Y, cz + s * 3.2 - 0.12], [x0 + 0.08, Y + 3.4, cz + s * 3.2 + 0.12], GLOW, -2);
  }
  slab(o, [x0, Y + 3.3, cz - 3.3], [x0 + 0.08, Y + 3.45, cz + 3.3], GLOW, -2);
  slab(o, [x0, Y + 19, cz - Z], [x0 + 1.1, Y + 19.6, cz + Z], RIB);
  // Beams across the ceiling, and a lamp between each two.
  for (let x = x0 + 1.5; x < x1 - 0.5; x += 3) {
    slab(o, [x - 0.3, Y + H - 1.2, cz - Z], [x + 0.3, Y + H, cz + Z], RIB);
    if (x + 1.5 < x1 - 1) {
      slab(o, [x + 1.1, Y + H - 0.15, cz - 4], [x + 1.9, Y + H - 0.05, cz + 4], LAMP, -2);
    }
  }
};
