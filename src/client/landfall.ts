// Landfall's scenery (docs/BEACH.md), loaded with its own chunk when a match starts on the beach:
// the forest, the headlands' rocks and the crashed ship. Nothing else imports these meshes.
import type { WorldDef } from '../shared/world';
import type { Decor } from './render';
import { hulk } from './hulk';
import { jungle } from './jungle';

export default (def: WorldDef): Decor => ({ land: [...jungle(def), ...hulk(def)], sky: [] });
