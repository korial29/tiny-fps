// Tranquility's scenery (docs/MOON.md), loaded with its own chunk when a match starts on the moon:
// the crater and its base, the station in orbit and the Earth. Nothing else imports these meshes.
import type { WorldDef } from '../shared/world';
import type { Decor } from './render';
import { furnishing } from './moonbase';
import { HEAVENS, heavens, moonscape } from './moonscape';
import { hangar, satellite } from './satellite';

/** The moon's ground drawn once, its runners' colours by key (render.ts palette), and its Earth apart. */
export default (def: WorldDef, keys: string[]): Decor => ({
  land: [
    ...moonscape(def),
    ...furnishing(def, keys),
    ...(def.station ? [...satellite(def.station), ...hangar(def.station)] : []),
  ],
  sky: heavens(),
  heavens: HEAVENS,
});
