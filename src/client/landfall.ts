// Landfall's scenery (docs/BEACH.md), loaded with its own chunk when a match starts on the beach:
// the forest, the headlands' rocks and the crashed ship. Nothing else imports these meshes.
import type { WorldDef } from '../shared/world';
import type { Decor } from './render';
import { hulk } from './hulk';
import { jungle } from './jungle';

/** The beach's forest, then its wreck: a yield between the two (tasks.ts drive()). */
export default function* (def: WorldDef): Generator<undefined, Decor, undefined> {
  const land = jungle(def);
  yield;
  // concat(), not push(...): a spread of a million numbers overflows the stack.
  return { land: land.concat(hulk(def)), sky: [] };
}
