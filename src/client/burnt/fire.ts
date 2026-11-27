// What still burns among the broken trees round the wreck's nose (burnt/clearing.ts): small fires,
// on a low stump's break or at a tall one's foot, each under a thin column of smoke. Drawn only,
// by smoke.ts with the wreck's fires: they stand past the ghost wall, where nobody goes, so they
// are not the map's (WorldDef.fires) and burn nobody.
import { ground, hash, raise } from '../../shared/relief';
import type { World, WorldDef } from '../../shared/world';
import { CLEARING, broken } from './clearing';

/** Stumps under this height burn at their break; the others at their foot. Metres. */
const LOW = 2.2;

/**
 * The fires among the snags, as smoke.ts's FIRES (x, y, z, the smoke's height, its radius at the
 * foot and at the top) and the flames' scale: about three in five of the clearing's stumps.
 */
export const blazes = (def: WorldDef): number[][] => {
  const w = def.relief && ({ relief: raise(def.relief) } as World);
  return CLEARING.filter(([, , s]) => hash(s, 30, 89) < 0.6).map(([x, z, s]) => {
    const g = w ? ground(w, x, z) : 0;
    const y = g > -1e9 ? g : 0;
    const { tall, top } = broken(x, y, z, s);
    const h = (k: number) => hash(s, k, 89);
    const at = tall < LOW ? top : [x, y, z];
    return [at[0], at[1], at[2], 5 + 4 * h(1), 0.5, 1.6 + h(2), 0.8 + 0.4 * h(3)];
  });
};
