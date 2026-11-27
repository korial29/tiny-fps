// Landfall's scenery (docs/BEACH.md): the forest along the beach and the headlands' rocks, drawn
// once from the lists of shared/beach.ts and an integer hash. The rocks of ROCKS and the palms of
// TRUNKS stand where the map collides with them; everything else is drawn only, behind them: the
// rocks past the headland's line and out in the sea, the trees and the undergrowth past EDGE.
// Lit paint (layer -1) but the rocks: TEX.ROCK, which Landfall's shader paints as granite (granite.ts GRANITE).
import { TRUNKS, ZED } from '../../shared/beach';
import { ground, hash, raise } from '../../shared/relief';
import type { World, WorldDef } from '../../shared/world';
import { CLEARING } from '../burnt/clearing';
import { flowers } from '../foliage/flower';
import { canopy, rise } from './canopy';
import { LEN, burn, edge, singe, sm, spot } from './constants';
import type { Ground } from './constants';
import { fern } from './models';
import { expand, planter } from '../palms/build';
import { cape, mirror } from './rocks';
import { snag } from './snag';
/**
 * Landfall's forest and headlands by part, each its vertices in the renderer's format: the
 * headlands' rocks, the undergrowth and the far canopy, and what the crash broke and burnt of them
 * round the nose, past the first trunks; and its palms by instance (palms/): the first row's
 * (TRUNKS and their twins) and the rows behind. The lists and the relief are read here, at the call.
 */
export const parts = (def: WorldDef) => {
  const w = def.relief && ({ relief: raise(def.relief) } as World);
  /** Where a foot stands: on the relief, or on the slab's top where there is none. */
  const gy: Ground = (x, z) => {
    const g = w ? ground(w, x, z) : 0;
    return g > -1e9 ? g : 0;
  };
  const rocks = cape(gy, 0, gy).concat(mirror(cape((x, z) => gy(x, ZED - z), 1, gy)));

  // The palms by instance (palms/): a few numbers each, a few variants drawn by the vertex shader,
  // near or far by their distance from the eye (instances/cull.ts).
  const trees = planter();
  const plant = trees.add;
  // A palm on each solid trunk, leaning toward the sea, each its own.
  TRUNKS.forEach(([x, z, r], i) => {
    for (const k of [0, 1]) {
      const [s, at] = [i * 2 + k, k ? ZED - z : z];
      const lean = 1.2 + 2.6 * hash(s, 1, 70);
      plant(x, gy(x, at), at, r, s, 2, -lean, lean * (2 * hash(s, 2, 70) - 1));
    }
  });

  // Behind the line: rows of trees, palms in front and broadleaves further in, cheaper with the distance.
  const snags: number[] = [];
  // Seven rows, close, so their crowns meet over a forest (the user, 2026-11-27). Each row is a
  // layer of fronds the GPU shades over the last: more lagged at the user's resolution, the
  // crowns behind hidden by those in front all the same.
  // Denser by instance (the user, 2026-11-27): nine rows, a palm every 3.5 to 4 m along each; eleven
  // and four more at the back cost some 2 ms of GPU over the seven of before.
  [2, 4.5, 7, 10, 13, 16.5, 20.5, 25, 30].forEach((d, row) => {
    const step = row < 2 ? 3.5 : 4;
    for (let i = 0; i * step < LEN; i++) {
      const h = (k: number) => hash(i, k, 80 + row);
      const s = (i + h(1)) * step;
      const far = d + 3 * h(2);
      const [x, z, k] = spot(s, far);
      if (h(3) > 0.85 * k) {
        continue;
      }
      // Where the fire went through, what is left of it.
      const b = burn(x, z);
      if (b > 0.3) {
        snag(snags, gy, x, z, 1000 + row * 1000 + i);
        continue;
      }
      // Deep in the mass a tree stands in it: its crown comes out, its trunk is not seen.
      const y = gy(x, z) + Math.max(k * (1 - sm(2.5 * b)) * rise(far) - 5, 0);
      const [, , nx, nz] = edge(s);
      const seed = 1000 + row * 1000 + i;
      // Palms only (the user, 2026-11-27): no broadleaf among them.
      const lean = 1 + 2.5 * h(5);
      const [lx, lz] = [-nx * lean + 2 * h(6) - 1, -nz * lean + 2 * h(7) - 1];
      plant(x, y, z, 0.28, seed, row < 5 ? 1 : 0, lx, lz);
      // In the first rows, a young palm half a step on, under the crowns: the forest's middle storey, so the trunks
      // do not stand bare from the ground to the fronds (the user, 2026-11-27: denser).
      const [yx, yz, yk] = spot(s + step / 2, far + 1.5 * (h(8) - 0.5));
      if (row && row < 4 && h(9) < 0.75 && yk > 0.3 && burn(yx, yz) < 0.3) {
        const ys = 0.35 + 0.25 * h(10);
        const yl = 0.4 + 0.8 * h(11);
        plant(
          yx,
          gy(yx, yz) + Math.max(yk * rise(far) - 5, 0) * 0.5,
          yz,
          0.16,
          seed + 50000,
          1,
          yl * (2 * h(12) - 1),
          yl * (2 * h(13) - 1),
          ys,
        );
      }
    }
  });

  // More of them in the clearing the nose made, on each side of it.
  for (const [x, z, s] of CLEARING) {
    snag(snags, gy, x, z, s);
  }

  // Before the line, among the first trunks: ferns, then the broad leaves and the bushes the wall of leaves stands behind.
  const brush: number[] = [];
  // Many of them along the sand's edge (the user, 2026-11-27): two a metre.
  for (let i = 0; i < 2 * LEN; i++) {
    const h = (k: number) => hash(i, k, 86);
    const [x, z, k] = spot((i + h(1)) / 2, -0.5 - 3 * h(2) * h(2));
    if (h(3) < k && burn(x, z) < 0.3) {
      fern(brush, x, gy(x, z), z, i, 0, 7, 4);
      // And flowers by one in three.
      if (h(4) < 0.33) {
        flowers(brush, x + 0.6, gy(x + 0.6, z), z + 0.4, 9000 + i);
      }
    }
  }
  for (let i = 0; i * 1.6 < LEN; i++) {
    const h = (k: number) => hash(i, k, 87);
    const [x, z, k] = spot((i + h(1)) * 1.6, 0.8 - 2.3 * h(2));
    if (h(3) > k || burn(x, z) > 0.3) {
      continue;
    }
    // Banana leaves or a fern: no round bush (the user, 2026-11-27: they read as rocks).
    fern(
      brush,
      x,
      gy(x, z),
      z,
      500 + i,
      h(5) < 0.6 ? 1 : 0,
      h(5) < 0.6 ? 7 : 9,
      h(5) < 0.6 ? 8 : 6,
    );
  }

  const far: number[] = [];
  canopy(far, brush, gy);
  [brush, far].forEach(singe);
  return { rocks, trees: trees.done(), brush, canopy: far, snags };
};

/** Its vertices, in the renderer's format: the palms as drawn near (expand()). */
export const jungle = (def: WorldDef): number[] => {
  const { trees, ...rest } = parts(def);
  return [...Object.values(rest), expand(trees)].flat();
};
