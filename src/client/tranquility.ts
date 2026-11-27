// Tranquility's scenery (docs/MOON.md), loaded with its own chunk when a match starts on the moon:
// the crater and its base, the station in orbit and the Earth. Nothing else imports these meshes.
import type { WorldDef } from '../shared/world';
import type { Decor } from './render';
import { furnishing } from './moonbase';
import { GLAZE } from './moonbase/mirror';
import { HEAVENS, heavens, moonscaping } from './moonscape';
import { hangar, satellite } from './satellite';

/**
 * The moon's ground drawn once, its runners' colours by key (render.ts palette), and its Earth
 * apart: a part at a time, a yield between two (tasks.ts drive()).
 */
export default function* (def: WorldDef, keys: string[]): Generator<undefined, Decor, undefined> {
  // concat(), not push(...): a spread of a million numbers overflows the stack.
  let land = yield* moonscaping(def);
  yield;
  land = land.concat(furnishing(def, keys));
  if (def.station) {
    yield;
    land = land.concat(satellite(def.station), hangar(def.station));
  }
  yield;
  return { land, sky: heavens(), heavens: HEAVENS, glaze: GLAZE };
}
