// Progression props in the renderer's vertex format: pickups, gate bars, the exit marker and the
// goal pad. Pure functions of the level and the clock (seconds), no state, no DOM.
import { GOAL_R } from '../shared/constants';
import { sectorAt } from '../shared/level';
import { ITEM } from '../shared/types';
import type { Edge, Item, Level } from '../shared/types';
import { pushBox } from './mesh';
import type { Vec3 } from './mesh';

/** Colour of each ITEM kind: the pickup, the bars of its gate, the HUD mark and the pickup fade. */
export const ITEM_COLOR: number[][] = [
  [1, 1, 1],
  [0.95, 0.15, 0.1],
  [0.2, 0.4, 1],
  [1, 0.85, 0.15],
];

/** A 0 to 1 colour as CSS, with alpha a. */
export const css = (c: number[], a = 1) => `rgba(${c.map(v => Math.round(v * 255))},${a})`;

/** Metres between two gate bars, at most. */
const GAP = 0.3;
const GREEN = [0.25, 1, 0.45];
const CROSS = [0.85, 0.1, 0.1];
const HOLE = [0.05, 0.05, 0.06];

/** A box at `at` plus a local (x, y, z) offset turned by `yaw` about the vertical, as pushBox does. */
const piece = (
  out: number[],
  [x, y, z]: Vec3,
  [lx, ly, lz]: Vec3,
  half: Vec3,
  yaw: number,
  c: number[],
  layer = -1,
) => {
  const [s, k] = [Math.sin(yaw), Math.cos(yaw)];
  pushBox(out, [x + lx * k + lz * s, y + ly, z - lx * s + lz * k], half, yaw, c, layer);
};

/**
 * A pickup, bobbing and spinning above its floor: HEALTH a white box with a red cross, a key a
 * ring (glowing), a shaft and two teeth in its colour.
 */
export const item = (out: number[], { id, kind, x, y, z }: Item, t: number) => {
  const yaw = t * 2 + id;
  const at: Vec3 = [x, y + (kind ? 0.55 : 0.4) + Math.sin(t * 2.5 + id) * 0.07, z];
  const c = ITEM_COLOR[kind];
  if (kind == ITEM.HEALTH) {
    // The slab crosses the four sides, each upright bar two of the faces.
    pushBox(out, at, [0.2, 0.2, 0.2], yaw, c);
    for (const h of [
      [0.21, 0.06, 0.21],
      [0.06, 0.21, 0.21],
      [0.21, 0.21, 0.06],
    ] as Vec3[]) {
      pushBox(out, at, h, yaw, CROSS);
    }
    return;
  }
  piece(out, at, [0, 0.17, 0], [0.1, 0.1, 0.025], yaw, c, -2);
  piece(out, at, [0, 0.17, 0], [0.04, 0.04, 0.035], yaw, HOLE);
  piece(out, at, [0, -0.1, 0], [0.025, 0.17, 0.025], yaw, c);
  piece(out, at, [0.06, -0.24, 0], [0.05, 0.03, 0.025], yaw, c);
  piece(out, at, [0.045, -0.15, 0], [0.035, 0.025, 0.025], yaw, c);
};

/** The opening of a portal edge: from the higher floor to the lower ceiling. */
const opening = ({ map }: Level, { front, back }: Edge): [number, number] => {
  const [f, k] = [map.sectors[front], map.sectors[back]];
  return [Math.max(f.floor, k.floor), Math.min(f.ceil, k.ceil)];
};

/** A flat bar along an edge, its section 2w by 2h, centred at height y. */
const rail = (out: number[], e: Edge, y: number, h: number, w: number, c: number[], layer = -1) => {
  const [dx, dz] = [e.bx - e.ax, e.bz - e.az];
  pushBox(
    out,
    [(e.ax + e.bx) / 2, y, (e.az + e.bz) / 2],
    [Math.hypot(dx, dz) / 2, h, w],
    Math.atan2(-dz, dx),
    c,
    layer,
  );
};

/**
 * Every barred gate gets upright bars across the portal edges of its sector, in its key's colour:
 * they go with the key. The exit, once open, gets a glowing frame on its portals, pulsing.
 */
export const gates = (out: number[], lvl: Level, t: number) => {
  const { gates = [], exit } = lvl.map;
  for (const { sector, key } of gates) {
    if (!lvl.barred.has(sector)) {
      continue;
    }
    const c = ITEM_COLOR[key];
    for (const e of lvl.edges.filter(e => e.front == sector && e.back >= 0)) {
      const [y0, y1] = opening(lvl, e);
      const n = Math.ceil(Math.hypot(e.bx - e.ax, e.bz - e.az) / GAP);
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n;
        pushBox(
          out,
          [e.ax + (e.bx - e.ax) * u, (y0 + y1) / 2, e.az + (e.bz - e.az) * u],
          [0.03, (y1 - y0) / 2, 0.03],
          0,
          c,
        );
      }
      rail(out, e, y0 + 0.1, 0.04, 0.04, c);
      rail(out, e, y1 - 0.1, 0.04, 0.04, c);
    }
  }
  if (exit !== undefined && !lvl.barred.has(exit)) {
    const c = GREEN.map(v => v * (0.75 + 0.25 * Math.sin(t * 4)));
    for (const e of lvl.edges.filter(e => e.front == exit && e.back >= 0)) {
      const [y0, y1] = opening(lvl, e);
      for (const y of [y0 + 0.04, y1 - 0.04]) {
        rail(out, e, y, 0.04, 0.04, c, -2);
      }
      for (const [x, z] of [
        [e.ax, e.az],
        [e.bx, e.bz],
      ]) {
        pushBox(out, [x, (y0 + y1) / 2, z], [0.05, (y1 - y0) / 2, 0.05], 0, c, -2);
      }
    }
  }
};

/** The goal: a pad on the floor that swells and fades with the clock, and a crystal above it. */
export const pad = (out: number[], lvl: Level, t: number) => {
  const goal = lvl.map.goal;
  const floor = goal && lvl.map.sectors[sectorAt(lvl, goal[0], goal[1])]?.floor;
  if (!goal || floor === undefined) {
    return;
  }
  const pulse = Math.sin(t * 4);
  const [k, c] = [
    GOAL_R * (0.7 + pulse * 0.07),
    [1, 0.85, 0.25].map(v => v * (0.75 + pulse * 0.25)),
  ];
  // Two squares, one turned 45°, a hair apart.
  for (const i of [0, 1]) {
    pushBox(
      out,
      [goal[0], floor + 0.03 + i * 0.005, goal[1]],
      [k, 0.03, k],
      t / 2 + (i * Math.PI) / 4,
      c,
      -2,
    );
  }
  pushBox(
    out,
    [goal[0], floor + 0.8 + Math.sin(t * 2) * 0.1, goal[1]],
    [0.15, 0.15, 0.15],
    t * 2,
    [1, 0.95, 0.5],
    -2,
  );
};

/** Items, gates, the exit frame and the goal pad. */
export const props = (out: number[], lvl: Level, items: Item[], t: number) => {
  for (const i of items) {
    item(out, i, t);
  }
  gates(out, lvl, t);
  pad(out, lvl, t);
};
