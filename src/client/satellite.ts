// The orbital station drawn as a satellite (the user, 2026-11-14, after a picture): a cylinder
// standing on its axis wrapped in crinkled gold foil between bands of silver, the hangar's mouths
// cut in its wall toward each base, a domed cap with a small dish on top, a wing of four solar
// panels on a boom over each mouth, and under it the laser cannon: a black aperture barrel pointed down at
// the moon, a sunshade beside it, its lens glowing red. Drawn once with the scenery; the cylinder's
// volume is the station's ghost brushes. Symmetric across the station's z, as the map is. No DOM.
import { SORTIE } from '../shared/sortie';
import { HULL, PARTS } from '../shared/station';
import type { StationDef } from '../shared/station';
import { GILT, SHINE, aim, place } from './mesh';
import type { Vec3 } from './mesh';
import { command, cut } from './station/command';
import { PLATE, foiled, plating } from './station/hull';
import { bar, lathed, slab, vert } from './station/kit';

type Out = number[];

const SILVER = [0.78, 0.8, 0.84];
const GOLD = [0.95, 0.68, 0.22];
const DARK = [0.06, 0.06, 0.07];
const WHITE = [0.9, 0.9, 0.88];
const CELLS = [0.14, 0.24, 0.55];
const COPPER = [0.75, 0.42, 0.2];
/** The lens: bright and unlit, so the bloom makes it glow. */
const LENS = [3.2, 0.35, 0.15];
const TAU = 2 * Math.PI;
/** A revolved profile ([radius, length] from back to front) along `to` from `at`. */
const lathe = (
  o: Out,
  profile: [number, number][],
  at: Vec3,
  to: Vec3,
  rgb: number[],
  layer = -1,
  sides = 48,
) =>
  place(
    o,
    lathed(profile, rgb, layer, sides),
    at,
    aim(to, Math.abs(to[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]),
    [0, 0, 0],
    1,
  );

/** A small hash in [-1, 1): the foil's crinkles, the same on every screen. */
const crinkle = (i: number, j: number, k: number) => {
  const h = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453;
  return 2 * (h - Math.floor(h)) - 1;
};

/** The grey plating's panels, 4 columns by 3 rows of the wall each, a shade apart, mirrored across z. */
const tone = (t: number, y: number) => {
  const k = crinkle(Math.floor(Math.min(t, TAU - t) / ((4 * TAU) / 72)), Math.floor(y / 6), 3);
  return PLATE.map(c => c * (1 + 0.12 * k));
};

export const satellite = (def: StationDef): number[] => {
  const {
    hall: [lo],
    deck,
    hull: [cx, y0, cz, y1],
    gun,
  } = def;
  const o: Out = [];
  const { R } = HULL;
  const [w, e] = [lo[0], lo[0] + 48];
  // The wall in 2 m rows; the angles where the hangar's sides meet it are among the columns, so its
  // mouths are cut on their edges.
  const meet = [w, e].flatMap(x => {
    const a = Math.acos((x - cx) / R);
    return [a, TAU - a];
  });
  const cols = [...Array.from({ length: 72 }, (_, i) => (i * TAU) / 72), ...meet, TAU].sort(
    (a, b) => a - b,
  );
  for (let y = y0; y < y1 - 0.01; y += 2) {
    // Gold foil round the middle, grey plating under it and over it (station/hull.ts).
    const foil = foiled(y, deck, y1);
    for (let i = 0; i + 1 < cols.length; i++) {
      const [a, b] = [cols[i], cols[i + 1]];
      const m = (a + b) / 2;
      const mx = cx + R * Math.cos(m);
      if (
        (mx > w && mx < e && y >= deck - 2 && y < deck + 16) ||
        cut(def, cx + R * Math.cos(m), cz + R * Math.sin(a), cz + R * Math.sin(b), y, y + 2)
      ) {
        continue;
      }
      const gold = foil;
      const rgb = gold ? GOLD : tone(m, y);
      // The foil's normals lean a little each their own way at every corner, shared by the
      // facets round it, so it shades in soft crinkles; the silver is smoother.
      const k = gold ? 0.22 : 0.03;
      for (const [j, h] of [
        [i, y],
        [i + 1, y],
        [i + 1, y + 2],
        [i, y],
        [i + 1, y + 2],
        [i, y + 2],
      ]) {
        const c = cols[j];
        const j0 = j % (cols.length - 1);
        const [t, u] = [crinkle(j0, h, 1) * k, crinkle(j0, h, 2) * k];
        const n: Vec3 = [Math.cos(c) + t * Math.sin(c), u, Math.sin(c) - t * Math.cos(c)];
        vert(o, [cx + R * Math.cos(c), h, cz + R * Math.sin(c)], n, rgb, gold ? GILT : -1);
      }
    }
  }
  // The cap: a low dome, a mast with a small dish.
  lathe(
    o,
    [
      [R, 0],
      [R - 3, 3],
      [R * 0.6, PARTS.DOME - 1],
      [0, PARTS.DOME],
    ],
    [cx, y1, cz],
    [0, 1, 0],
    SILVER,
    SHINE,
  );
  const mast: Vec3 = [cx - 16, y1 + PARTS.MAST, cz];
  bar(o, [mast[0], y1 + 4, cz], mast, 0.8, SILVER);
  const up: Vec3 = [-0.6, 0.8, 0];
  const bowl = Array.from({ length: 6 }, (_, i): [number, number] => [2.4 * i, 3.6 * (i / 5) ** 2]);
  lathe(
    o,
    [...bowl, ...[...bowl].reverse().map(([r, l]): [number, number] => [r, l - 0.3])],
    mast,
    up,
    WHITE,
    -1,
    20,
  );
  // Under the body: a silver floor, then the cannon's aperture barrel, B wide (as the picture's,
  // seven tenths of the body), banded, its lip flared, the lens sunk in it.
  const B = PARTS.BARREL * R;
  const len = y0 - gun[1];
  lathe(
    o,
    [
      [R, 0],
      [R - 1.5, 2],
      [B + 2, 2.6],
      [0, 2.6],
    ],
    [cx, y0, cz],
    [0, -1, 0],
    SILVER,
    SHINE,
  );
  lathe(
    o,
    [
      [0, 2.6],
      [B + 2, 2.6],
      [B + 2, 5],
      [B, 6.5],
      [B, len - 4],
      [B + 3, len - 1.5],
      [B + 3, len],
      [B - 2, len],
      [B - 3, len - 10],
      [0, len - 10.5],
    ],
    [cx, y0, cz],
    [0, -1, 0],
    DARK,
    SHINE,
  );
  for (let l = 10; l < len - 8; l += 7) {
    lathe(
      o,
      [
        [0, l],
        [B + 0.8, l],
        [B + 0.8, l + 1.6],
        [0, l + 1.6],
      ],
      [cx, y0, cz],
      [0, -1, 0],
      SILVER,
      SHINE,
    );
  }
  lathe(
    o,
    [
      [0, len - 10.3],
      [B - 3.5, len - 10.1],
      [0, len - 9.9],
    ],
    [cx, y0, cz],
    [0, -1, 0],
    LENS,
    -2,
  );
  // The sunshade: a white panel hung off the lip on the west.
  slab(o, [cx - B - 8, gun[1] - 18, cz - 16], [cx - B - 7.2, gun[1] + 8, cz + 16], WHITE, SHINE);
  bar(o, [cx - B - 1, gun[1] + 3, cz], [cx - B - 7.2, gun[1] + 3, cz], 0.6, SILVER);
  // A wing each side over the hangar's mouths, longer than the body as in the picture, so the
  // command room's window looks out between them: a boom and its yoke, four panels of cells in a row
  // facing east and west, a copper spar along them, frames and cell lines in silver. u runs out
  // along the wing (z), v across it (x).
  const mid = y0 + (y1 - y0) * PARTS.WING;
  const [P, H, G] = [PARTS.PANEL, PARTS.SPAN, PARTS.GAP];
  const box = (u0: number, u1: number, ya: number, yb: number, v: number, rgb: number[]) =>
    slab(o, [cx - v, ya, cz + Math.min(u0, u1)], [cx + v, yb, cz + Math.max(u0, u1)], rgb, SHINE);
  for (const s of [-1, 1]) {
    const start = s * (R + PARTS.BOOM);
    bar(o, [cx, mid, cz + s * R], [cx, mid, cz + start], 1.4, SILVER);
    box(start, start + s * 3, mid - 6, mid + 6, 2, SILVER);
    bar(o, [cx, mid, cz + start], [cx, mid, cz + start + s * (4 * (P + G) + 2)], 0.6, COPPER);
    for (let k = 0; k < 4; k++) {
      const a = start + s * (3 + k * (P + G));
      const [u0, u1] = [Math.min(a, a + s * P), Math.max(a, a + s * P)];
      box(u0, u1, mid - H / 2, mid + H / 2, 0.2, CELLS);
      for (const p of [mid - H / 2, mid + H / 2 - 0.6, mid - 0.3, mid - H / 4, mid + H / 4 - 0.3]) {
        box(u0, u1, p, p + 0.6, 0.3, SILVER);
      }
      for (const c of [u0, u0 + P / 2 - 0.3, u1 - 0.6]) {
        box(c, c + 0.6, mid - H / 2, mid + H / 2, 0.3, SILVER);
      }
    }
  }
  plating(def, o);
  return o;
};

/** A flat glowing quad on the deck at height y: the corners in order, its colour bright and unlit. */
const decal = (o: Out, q: [number, number][], y: number, rgb: number[], layer = -2) => {
  for (const i of [0, 1, 2, 0, 2, 3]) {
    vert(o, [q[i][0], y, q[i][1]], [0, 1, 0], rgb, layer);
  }
};

const PIPE = [0.55, 0.57, 0.6];
const VALVE = [0.9, 0.45, 0.08];
const PAINT = [0.95, 0.75, 0.1];
const EXIT = [0.4, 2.6, 1.6];
const AMBER = [2.6, 1.3, 0.25];
const LAMP = [2.2, 2.3, 2.6];

/**
 * The station's inside (the user, 2026-11-14): pipes along the hangar's walls and ducts under its
 * roof, a painted landing circle with its lights where each team's ship sets down (sortie.ts lands
 * there), the way out to space lit (a green bar across each mouth's edge and up its sides, amber
 * chevrons on the deck toward it), lamps under the roof, and the command room (station/command.ts). The hangar's x0..x1 inside its walls, its mouths at z0 and z1.
 */
export const hangar = (def: StationDef): number[] => {
  const {
    hall: [lo],
    deck: Y,
    hull: [cx, , cz],
  } = def;
  const o: Out = [];
  const [x0, x1] = [lo[0] + 4, lo[0] + 44];
  const [z0, z1] = [cz - HULL.R, cz + HULL.R];
  // Pipes along the walls: low ones on the west, high ones on the east over the door; brackets.
  for (const [x, h, r, side] of [
    [x0 + 0.5, 2.4, 0.25, 1],
    [x0 + 0.5, 3.1, 0.16, 1],
    [x0 + 0.7, 8.5, 0.4, 1],
    [x1 - 0.5, 4.6, 0.25, -1],
    [x1 - 0.7, 8.5, 0.4, -1],
  ]) {
    bar(o, [x, Y + h, z0 + 5], [x, Y + h, z1 - 5], r, PIPE);
    for (let z = z0 + 8; z < z1 - 5; z += 8) {
      slab(
        o,
        [Math.min(x, x - side * 0.5), Y + h - r - 0.1, z - 0.15],
        [Math.max(x, x - side * 0.5) + 0.01, Y + h + r + 0.1, z + 0.15],
        DARK,
      );
      if ((z / 8) % 3 < 1) {
        bar(o, [x, Y + h, z + 1.5], [x, Y + h, z + 1.8], r + 0.12, VALVE, -1);
      }
    }
  }
  for (const x of [x0 + 0.6, x1 - 0.6]) {
    for (const z of [z0 + 6, z1 - 6]) {
      bar(o, [x, Y, z], [x, Y + 14, z], 0.3, PIPE);
    }
  }
  // Ducts under the roof, and lamps between them.
  for (const x of [cx - 10, cx + 10]) {
    bar(o, [x, Y + 13.2, z0 + 5], [x, Y + 13.2, z1 - 5], 0.6, PIPE);
  }
  for (let z = z0 + 10; z < z1 - 5; z += 12) {
    slab(o, [cx - 4, Y + 13.7, z - 0.6], [cx + 4, Y + 13.9, z + 0.6], LAMP, -2);
  }
  // The landing circles: a yellow ring, lights round it.
  for (const s of [-1, 1]) {
    const [px, pz] = [cx + SORTIE.EAST, cz + s * SORTIE.LAND];
    const N = 32;
    for (let i = 0; i < N; i++) {
      const [a, b] = [(i * TAU) / N, ((i + 1) * TAU) / N];
      const at = (t: number, r: number): [number, number] => [
        px + r * Math.cos(t),
        pz + r * Math.sin(t),
      ];
      decal(o, [at(a, 7), at(b, 7), at(b, 6.4), at(a, 6.4)], Y + 0.03, PAINT, -1);
      if (i % 4 === 0) {
        slab(
          o,
          [px + 7.4 * Math.cos(a) - 0.15, Y, pz + 7.4 * Math.sin(a) - 0.15],
          [px + 7.4 * Math.cos(a) + 0.15, Y + 0.12, pz + 7.4 * Math.sin(a) + 0.15],
          AMBER,
          -2,
        );
      }
    }
    // The way out: chevrons from the circle to the mouth, then the mouth's edge and sides in green.
    const edge = s < 0 ? z0 : z1;
    for (let z = pz + s * 10; s * (edge - z) > 4; z += s * 5) {
      for (const d of [-1, 1]) {
        decal(
          o,
          [
            [px + d * 0.4, z + s * 1.2],
            [px + d * 3.2, z - s * 0.6],
            [px + d * 3.2, z - s * 1.3],
            [px + d * 0.4, z + s * 0.5],
          ],
          Y + 0.04,
          AMBER,
        );
      }
    }
    decal(
      o,
      [
        [x0, edge - s * 0.6],
        [x1, edge - s * 0.6],
        [x1, edge - s * 0.2],
        [x0, edge - s * 0.2],
      ],
      Y + 0.04,
      EXIT,
    );
    for (const x of [x0 + 0.06, x1 - 0.06]) {
      slab(
        o,
        [x - 0.06, Y, edge - s * 0.6 - 0.2],
        [x + 0.06, Y + 11, edge - s * 0.6 + 0.2],
        EXIT,
        -2,
      );
    }
    slab(o, [x0, Y + 10.94, edge - s * 0.6 - 0.2], [x1, Y + 11.0, edge - s * 0.6 + 0.2], EXIT, -2);
  }
  command(o, def);
  return o;
};
