// Landfall's undergrowth in tiles (Decor.grass): its triangles sorted by the square of
// GRASS_TILE metres their first point is in, so that cells() cuts it into one run a tile and the
// renderer draws the tiles near the eye only. The order inside a tile is kept.
import { STRIDE } from '../mesh';
import { GRASS_TILE } from '../render/scene';

/** The triangles of `v` (STRIDE floats a point), tile by tile. */
export const tiled = (v: number[]): number[] => {
  const tile = new Map<string, number[]>();
  const per = 3 * STRIDE;
  for (let t = 0; t < v.length; t += per) {
    const key = `${Math.floor(v[t] / GRASS_TILE)} ${Math.floor(v[t + 2] / GRASS_TILE)}`;
    let out = tile.get(key);
    if (!out) {
      tile.set(key, (out = []));
    }
    for (let i = 0; i < per; i++) {
      out.push(v[t + i]);
    }
  }
  const all: number[] = [];
  for (const out of tile.values()) {
    for (let i = 0; i < out.length; i++) {
      all.push(out[i]);
    }
  }
  return all;
};
