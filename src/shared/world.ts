// The brush world: solid axis-aligned boxes under an open sky, replacing the sector maps. Floors
// are box tops, walls box sides; boxes may float, so platforms, overhangs and ledges are free.
// No DOM, no Node API.

import { raise, trace } from './relief';
import type { Relief, ReliefDef } from './relief';

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
  /** Collided with but not drawn: the shape under a drawn-only mesh (the moon's domes). */
  ghost?: boolean;
}

/** Feet x, y, z (standing on a top) and the yaw to face. */
export type Spawn = [x: number, y: number, z: number, yaw: number];

/** What one team owns on a map. */
export interface TeamDef {
  /** Where its flag stands (a point on a top, the foot of the pole) and where its carriers score. */
  base: Vec3;
  /** Where its players start, and come back to after a fall. */
  spawns: Spawn[];
  /** The gun rack near the spawns, a point on a top: walking within RACK_R gives the gun with AMMO_MAX shots. */
  rack?: Vec3;
  /** The katana rack, next to the gun rack, a point on a top: walking within RACK_R gives the katana. */
  blade?: Vec3;
  /** The rail gun rack, on the other side of the gun rack: walking within RACK_R gives the rail gun with RAIL_MAX shots. */
  rail?: Vec3;
  /** The laser rifle rack, past the rail gun's: walking within RACK_R gives the rifle with RIFLE_MAX rounds. */
  rifle?: Vec3;
}

/** A sliding door (doors.ts): the box its two panels fill when shut, in a doorway of the brushes. */
export interface Door {
  min: Vec3;
  max: Vec3;
}

export interface WorldDef {
  /** Shown on the title screen. */
  name?: string;
  /** What kind of place it is, in a few words, and its story in two or three sentences: the title screen and the demo's map cards. */
  tag?: string;
  lore?: string;
  brushes: Brush[];
  /** The red team, then the blue one (TEAM). */
  teams: [red: TeamDef, blue: TeamDef];
  /** Feet below this height have fallen off the roofs: the player is put back at a spawn of the team. */
  floor: number;
  /** Health packs, points on tops (with the ammo packs and the rail cells at most PACK_BITS): walking within PACK_R gives PACK_HP, then it is gone PACK_BACK seconds. */
  packs?: Vec3[];
  /** Ammo packs, points on tops (with the health packs and the rail cells at most PACK_BITS): within PACK_R a player with the gun and fewer than AMMO_MAX shots takes AMMO_PACK, then it is gone AMMO_BACK seconds. */
  ammo?: Vec3[];
  /** Rail cells, points on tops (with the health and ammo packs at most PACK_BITS): within PACK_R a player with the rail gun and less than RAIL_MAX of lightning takes RAIL_CELL, then it is gone PACK_BACK seconds. */
  cells?: Vec3[];
  /** Armours, points on tops (with the packs and the cells at most PACK_BITS): within PACK_R a player short of ARMOR_MAX is filled to it, then it is gone ARMOR_BACK seconds. */
  vests?: Vec3[];
  /** Unit direction toward the sun, and its colour (linear RGB, may exceed 1). */
  sun: { dir: Vec3; color: Vec3 };
  /** Sky colours at the zenith and the horizon, linear RGB. */
  sky: [zenith: Vec3, horizon: Vec3];
  /** Fog colour and density per metre. Absent: none. */
  fog?: [r: number, g: number, b: number, density: number];
  /** The share of GRAVITY that pulls the players down. Absent: 1. */
  gravity?: number;
  /** What is drawn around the play area: the city (street, towers, parks, traffic) or the moon (crater rim, base, stars, the Earth). Absent: the city. */
  scenery?: 'city' | 'moon';
  /** Whether the runners wear space helmets, with the pack on the back, its hose and the breath. */
  helmets?: boolean;
  /** Whether the runners wear armour over a grey suit: white with space helmets, else in the team's colour. */
  armor?: boolean;
  /** Ground that is not flat (relief.ts), round the brushes: the moon's crater floor. Absent: none. */
  relief?: ReliefDef;
  /** Where the rovers (rover.ts) are parked, each as a spawn: the middle of its wheels on the ground and the yaw of its nose. Absent: none. */
  rovers?: Spawn[];
  /** Where the spaceships (ship.ts) stand on their pads: the floor under the skids and the yaw of the nose. Absent: none. */
  ships?: Spawn[];
  /** The automatic doors (doors.ts). Absent: none. */
  doors?: Door[];
  /** The height of the edge of space (ORBIT.SEAM): a shot that crosses it either way bursts there. Absent: none. */
  seam?: number;
}

/** A world ready for physics and drawing: the definition and a grid of brushes on the floor plane. */
export interface World {
  def: WorldDef;
  /** Metres per grid cell. */
  cell: number;
  /** Cell key (see key()) to the indices of the brushes overlapping it. */
  grid: Map<number, number[]>;
  /** The lattice of WorldDef.relief. */
  relief?: Relief;
  /**
   * The state of each of WorldDef.doors: how far it is open, 0 shut to 1, and the ticks it stays
   * open with nobody near. The host's doors.ts moves it, the client copies it from the snapshot:
   * ray() stops at a door less than half open, a body never does.
   */
  doors?: { open: number; wait: number }[];
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
  return {
    def,
    cell,
    grid,
    ...(def.relief ? { relief: raise(def.relief) } : {}),
    ...(def.doors ? { doors: def.doors.map(() => ({ open: 0, wait: 0 })) } : {}),
  };
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
 * Distance along the ray from o in the unit direction d to the first brush face or to the ground of
 * the relief, at most max. A ray that starts inside a brush hits at 0; one that starts on a face
 * and moves away from it does not hit it.
 * With `grow`, every brush is that much bigger on each side: the path of a sphere of that radius
 * (its corners square, and a brush is only found in the cells the ray crosses).
 */
export const ray = (w: World, o: Vec3, d: Vec3, max: number, grow = 0): number => {
  let hit = faces(w, o, d, max, grow);
  // A door less than half open is a wall to a shot and to the eye.
  w.doors?.forEach(({ open }, i) => {
    if (open < 0.5) {
      const { min, max } = w.def.doors![i];
      let [lo, hi] = [0, hit];
      for (let a = 0; a < 3; a++) {
        const [t0, t1] = d[a]
          ? [(min[a] - grow - o[a]) / d[a], (max[a] + grow - o[a]) / d[a]]
          : o[a] < min[a] - grow || o[a] > max[a] + grow
            ? [1, -1]
            : [-Infinity, Infinity];
        lo = Math.max(lo, Math.min(t0, t1));
        hi = Math.min(hi, Math.max(t0, t1));
      }
      if (lo <= hi && hi > 0) {
        hit = lo;
      }
    }
  });
  return w.relief ? trace(w, o, d, hit, grow) : hit;
};

/**
 * The brushes' share of ray(). Walks the grid cells the ray crosses (Amanatides and Woo), testing
 * the brushes of each against the exact slab test, and stops once the next cell starts beyond the
 * best hit or max. A brush spanning several cells is tested in each: the hit is the same, and
 * lists are short.
 */
const faces = (w: World, o: Vec3, d: Vec3, max: number, grow: number): number => {
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
          if (o[a] < b.min[a] - grow || o[a] > b.max[a] + grow) {
            hi = -1;
          }
          continue;
        }
        const t0 = (b.min[a] - grow - o[a]) / d[a];
        const t1 = (b.max[a] + grow - o[a]) / d[a];
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
