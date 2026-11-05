// The brush world: solid axis-aligned boxes under an open sky, replacing the sector maps. Floors
// are box tops, walls box sides; boxes may float, so platforms, overhangs and ledges are free.
// No DOM, no Node API.

type Vec3 = [number, number, number];

/** One solid box. */
export interface Brush {
  /** Corners, metres, min < max on every axis. */
  min: Vec3;
  max: Vec3;
  /** TEX id of the top face, and of the sides and the bottom. */
  top: number;
  side: number;
  /** Colour of its ambient light, linear RGB 0 to 1. Absent: white. */
  tint?: Vec3;
}

export interface WorldDef {
  /** Shown on the title screen. */
  name?: string;
  brushes: Brush[];
  /** Feet x, y, z (standing on a top) and the yaw to face. */
  spawns: [x: number, y: number, z: number, yaw: number][];
  /** Feet below this height have fallen off the roofs: the player is put back at a spawn. */
  floor: number;
  /** Unit direction toward the sun, and its colour (linear RGB, may exceed 1). */
  sun: { dir: Vec3; color: Vec3 };
  /** Sky colours at the zenith and the horizon, linear RGB. */
  sky: [zenith: Vec3, horizon: Vec3];
  /** Fog colour and density per metre. Absent: none. */
  fog?: [r: number, g: number, b: number, density: number];
}

/** A world ready for physics and drawing: the definition and a grid of brushes on the floor plane. */
export interface World {
  def: WorldDef;
  /** Metres per grid cell. */
  cell: number;
  /** Cell key (see key()) to the indices of the brushes overlapping it. */
  grid: Map<number, number[]>;
}

/** Metres per grid cell: about the size of the player's reach, so a query touches 1 to 4 cells. */
const CELL = 4;
/** Cell coordinates run from -OFF to OFF - 1: a 8 km square at 4 m, far more than any map. */
const OFF = 1024;

/** The key of the cell with integer coordinates (cx, cz). */
export const key = (cx: number, cz: number): number => (cx + OFF) * (2 * OFF) + cz + OFF;

/** Integer cell coordinate of a metre value, clamped to the keyed range. */
const at = (v: number, cell: number): number =>
  Math.min(Math.max(Math.floor(v / cell), -OFF), OFF - 1);

/** Builds the grid: each brush is listed in every cell its footprint covers. */
export const build = (def: WorldDef, cell = CELL): World => {
  const grid = new Map<number, number[]>();
  def.brushes.forEach(({ min, max }, i) => {
    for (let cx = at(min[0], cell); cx <= at(max[0], cell); cx++) {
      for (let cz = at(min[2], cell); cz <= at(max[2], cell); cz++) {
        const k = key(cx, cz);
        const list = grid.get(k);
        if (list) {
          list.push(i);
        } else {
          grid.set(k, [i]);
        }
      }
    }
  });
  return { def, cell, grid };
};

/**
 * Indices of the brushes whose footprint may overlap the square of half side r around (x, z): every
 * brush listed in a cell the square touches, once each. A candidate list, not an exact overlap.
 */
export const near = (w: World, x: number, z: number, r: number): number[] => {
  const out: number[] = [];
  for (let cx = at(x - r, w.cell); cx <= at(x + r, w.cell); cx++) {
    for (let cz = at(z - r, w.cell); cz <= at(z + r, w.cell); cz++) {
      for (const i of w.grid.get(key(cx, cz)) ?? []) {
        if (!out.includes(i)) {
          out.push(i);
        }
      }
    }
  }
  return out;
};

/**
 * Distance along the ray from o in the unit direction d to the first brush face, at most max. A ray
 * that starts inside a brush hits at 0; one that starts on a face and moves away from it does not hit it.
 *
 * Walks the grid cells the ray crosses (Amanatides and Woo), testing the brushes of each against
 * the exact slab test, and stops once the next cell starts beyond the best hit or max. A brush
 * spanning several cells is tested in each: the hit is the same, and lists are short.
 */
export const ray = (w: World, o: Vec3, d: Vec3, max: number): number => {
  const { cell, def } = w;
  let best = max;
  // Cell of the origin, step direction, distance to the next boundary and between boundaries.
  let cx = at(o[0], cell);
  let cz = at(o[2], cell);
  const sx = Math.sign(d[0]);
  const sz = Math.sign(d[2]);
  const nx = sx ? ((cx + (sx > 0 ? 1 : 0)) * cell - o[0]) / d[0] : Infinity;
  const nz = sz ? ((cz + (sz > 0 ? 1 : 0)) * cell - o[2]) / d[2] : Infinity;
  let tx = nx;
  let tz = nz;
  const dx = sx ? cell / Math.abs(d[0]) : Infinity;
  const dz = sz ? cell / Math.abs(d[2]) : Infinity;
  for (;;) {
    for (const i of w.grid.get(key(cx, cz)) ?? []) {
      const b = def.brushes[i];
      let [lo, hi] = [0, best];
      for (let a = 0; a < 3 && lo <= hi; a++) {
        if (!d[a]) {
          // Parallel to the slab: inside it for the whole ray, or never.
          if (o[a] < b.min[a] || o[a] > b.max[a]) {
            hi = -1;
          }
          continue;
        }
        const t0 = (b.min[a] - o[a]) / d[a];
        const t1 = (b.max[a] - o[a]) / d[a];
        lo = Math.max(lo, Math.min(t0, t1));
        hi = Math.min(hi, Math.max(t0, t1));
      }
      // hi > 0: a ray on a face and leaving the box has hi = 0 and misses it.
      if (lo <= hi && hi > 0 && lo < best) {
        best = lo;
      }
    }
    const next = Math.min(tx, tz);
    // Past the keyed range nothing is listed: stop, whatever max is.
    if (next >= best || Math.abs(cx) > OFF || Math.abs(cz) > OFF) {
      return best;
    }
    if (tx < tz) {
      cx += sx;
      tx += dx;
    } else {
      cz += sz;
      tz += dz;
    }
  }
};

/** Whether a brush hides b from a. */
export const hidden = (w: World, a: Vec3, b: Vec3): boolean => {
  const [dx, dy, dz] = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(dx, dy, dz);
  // A point on a face is not behind it: 0.1 mm of slack for rounding.
  return len > 0 && ray(w, a, [dx / len, dy / len, dz / len], len) < len - 1e-4;
};
