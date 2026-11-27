// Landfall's palms by tile, each drawn twice (Decor.groves): near, finely, and far, cheaply. The
// renderer draws a tile's near palms when its bounds come within GROVE_NEAR of the eye, and its
// far ones otherwise, by the same bounds and the same test: no palm is drawn twice or missing.
// Only the near ones go into the shadow maps.
import { STRIDE } from '../mesh';
import { GROVE_TILE } from '../render/scene';
import type { Groves } from '../render/scene';

export { GROVE_TILE };

/** The palms whose foot is in one tile: its middle, and their vertices near and far. */
export type Grove = { x: number; z: number; near: number[]; far: number[] };

/** The groves packed as Decor.groves: their vertices one after the other, and a tile's ranges and bounds. */
export const packed = (groves: Iterable<Grove>): Groves => {
  const [near, far, tiles] = [[] as number[], [] as number[], [] as number[]];
  for (const g of groves) {
    const box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const v of [g.near, g.far]) {
      for (let i = 0; i < v.length; i += STRIDE) {
        for (let k = 0; k < 3; k++) {
          box[k] = Math.min(box[k], v[i + k]);
          box[k + 3] = Math.max(box[k + 3], v[i + k]);
        }
      }
    }
    tiles.push(
      near.length / STRIDE,
      g.near.length / STRIDE,
      far.length / STRIDE,
      g.far.length / STRIDE,
      ...box,
    );
    for (const v of g.near) {
      near.push(v);
    }
    for (const v of g.far) {
      far.push(v);
    }
  }
  return { near, far, tiles };
};
