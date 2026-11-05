// Ray against the sector map: the distance to the first wall, step face, floor or ceiling. No DOM,
// no Node API.
import { sectorAt } from './level';
import type { Edge, Level } from './types';

type Vec3 = [number, number, number];

/**
 * Distance along the ray from o (inside the map) in the unit direction d to the first wall, step
 * face, floor or ceiling, at most max.
 *
 * Walks the sectors: in the current convex one the ray leaves through the edge with the least
 * crossing distance among the edges it goes outward through, or ends earlier on the floor or the
 * ceiling. A solid edge, or a portal whose opening does not hold the crossing height, ends it.
 */
export const trace = (lvl: Level, o: Vec3, d: Vec3, max: number): number => {
  const { map, edges } = lvl;
  let s = Math.max(sectorAt(lvl, o[0], o[2]), 0);
  let t = 0;
  // A straight ray meets each convex sector once: more hops than sectors is a vertex graze.
  for (let hop = 0; hop <= map.sectors.length; hop++) {
    const { floor, ceil } = map.sectors[s];
    let exit = Infinity;
    let through: Edge | undefined;
    for (const e of edges) {
      if (e.front !== s) {
        continue;
      }
      const [ex, ez] = [e.bx - e.ax, e.bz - e.az];
      // Outward is where the cross product with the edge goes negative: inside is on its left.
      const out = d[2] * ex - d[0] * ez;
      if (out >= 0) {
        continue;
      }
      const x = Math.max(((o[2] - e.az) * ex - (o[0] - e.ax) * ez) / -out, t);
      // Collinear pieces of one wall share the crossing distance: only the piece holding the
      // crossing counts. At a vertex two pieces hold it: the solid one wins.
      const u =
        ((o[0] + x * d[0] - e.ax) * ex + (o[2] + x * d[2] - e.az) * ez) / (ex * ex + ez * ez);
      if (u > -1e-9 && u < 1 + 1e-9 && (x < exit - 1e-9 || (x < exit + 1e-9 && e.back < 0))) {
        [exit, through] = [x, e];
      }
    }
    const flat = d[1] < 0 ? (floor - o[1]) / d[1] : d[1] > 0 ? (ceil - o[1]) / d[1] : Infinity;
    if (flat <= exit || !through) {
      return Math.min(Math.max(flat, t), max);
    }
    if (exit >= max) {
      return max;
    }
    const y = o[1] + exit * d[1];
    const k = through.back < 0 ? undefined : map.sectors[through.back];
    if (!k || y < Math.max(floor, k.floor) || y > Math.min(ceil, k.ceil)) {
      return exit;
    }
    [s, t] = [through.back, exit];
  }
  return t;
};
