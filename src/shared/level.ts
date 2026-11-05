// Sector maps, compiled once for physics and drawing. No DOM, no Node API.
import type { Level, MapDef, Sector } from './types';

/** Joins every edge a→b with the sector that has b→a, if any: that edge is a portal. */
export const compile = (map: MapDef): Level => {
  const key = (ax: number, az: number, bx: number, bz: number) => `${ax},${az},${bx},${bz}`;
  const owner = new Map<string, number>();
  map.sectors.forEach(({ pts }, s) =>
    pts.forEach(([ax, az], i) => owner.set(key(ax, az, ...pts[(i + 1) % pts.length]), s)),
  );
  const edges = map.sectors.flatMap(({ pts }, front) =>
    pts.map(([ax, az], i) => {
      const [bx, bz] = pts[(i + 1) % pts.length];
      return { ax, az, bx, bz, front, back: owner.get(key(bx, bz, ax, az)) ?? -1 };
    }),
  );
  return { map, edges };
};

/** Whether (x, z) is inside the sector, its edges included. */
export const inside = ({ pts }: Sector, x: number, z: number): boolean =>
  pts.every(([ax, az], i) => {
    const [bx, bz] = pts[(i + 1) % pts.length];
    return (bx - ax) * (z - az) - (bz - az) * (x - ax) >= 0;
  });

/** Index of the first sector holding (x, z), -1 outside the map. */
export const sectorAt = ({ map }: Level, x: number, z: number): number =>
  map.sectors.findIndex(s => inside(s, x, z));

/**
 * Whether a wall, a step or a ceiling hides b from a (both inside the map). Between two edge
 * crossings the segment stays in one sector, and each crossing is checked against the opening of
 * its portal, so floors and ceilings need no test of their own.
 */
export const blocked = (
  { map, edges }: Level,
  [ax, ay, az]: [number, number, number],
  [bx, by, bz]: [number, number, number],
): boolean => {
  const [dx, dz] = [bx - ax, bz - az];
  return edges.some(e => {
    const [ex, ez] = [e.bx - e.ax, e.bz - e.az];
    const den = dx * ez - dz * ex;
    if (!den) {
      return false;
    }
    // a + t·d = e.a + u·e on the floor plane.
    const t = ((e.ax - ax) * ez - (e.az - az) * ex) / den;
    const u = ((e.ax - ax) * dz - (e.az - az) * dx) / den;
    if (t <= 0 || t >= 1 || u < 0 || u > 1) {
      return false;
    }
    if (e.back < 0) {
      return true;
    }
    const [f, k] = [map.sectors[e.front], map.sectors[e.back]];
    const y = ay + t * (by - ay);
    return y < Math.max(f.floor, k.floor) || y > Math.min(f.ceil, k.ceil);
  });
};
