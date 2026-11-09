// The maps a room can play, by the key `Rules.map` and the roster carry.
import { HIGHLINE } from './map';
import { MOON } from './moon';
import type { WorldDef } from './world';

export const MAPS: Record<string, WorldDef> = { highline: HIGHLINE, tranquility: MOON };

/** The map of a key; an unknown or missing one is HIGHLINE. */
export const mapOf = (key?: string): WorldDef => (key !== undefined && MAPS[key]) || HIGHLINE;

/** The key of a known map, else 'highline'. */
export const mapKey = (key?: string): string =>
  key !== undefined && Object.hasOwn(MAPS, key) ? key : 'highline';
