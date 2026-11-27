// Landfall's scenery (docs/BEACH.md), loaded with its own chunk when a match starts on the beach:
// the forest, the headlands' rocks and their granite, and the crashed ship. Nothing else imports
// these meshes. Its buggies' look comes with it too.
import type { WorldDef } from '../shared/world';
import type { Decor } from './render';
import { BUGGY } from './buggy';
import { GRANITE } from './granite';
import { canopy, hulk } from './hulk';
import { blazes } from './burnt/fire';
import { packed } from './foliage/grove';
import { FOREST_GLSL } from './foliage/layers';
import { tiled } from './foliage/tiles';
import { parts } from './jungle';

/** The beach's forest, then its wreck: a yield between the two (tasks.ts drive()). */
export default function* (def: WorldDef): Generator<undefined, Decor, undefined> {
  // The undergrowth apart (Decor.grass): drawn near the eye only, in no shadow map.
  const { brush, groves, ...rest } = parts(def);
  const land = ([] as number[]).concat(...Object.values(rest));
  const grass = tiled(brush);
  yield;
  // concat(), not push(...): a spread of a million numbers overflows the stack.
  return {
    land: land.concat(hulk(def)),
    sky: [],
    glass: canopy(),
    rock: GRANITE,
    car: BUGGY,
    grass,
    groves: packed(groves.values()),
    forest: FOREST_GLSL,
    blazes: blazes(def),
  };
}
