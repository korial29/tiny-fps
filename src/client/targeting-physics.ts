import { BOLT_SPEED, PLAYER_R } from '../shared/constants';
import { heightOf } from '../shared/physics';
import { cylinder } from '../shared/plasma';
import { aimOf, homeOf, struck } from '../shared/rover';
import { SHIP, SHIP_GUNS, point } from '../shared/ship';
import { MODE, NOBODY } from '../shared/types';
import type { Rover } from '../shared/types';
import { hidden, ray } from '../shared/world';

// Keep the vehicle HUD chunk from splitting core simulation code into another initial download.
export const targetingPhysics = {
  BOLT_SPEED,
  PLAYER_R,
  range: SHIP.GUN_RANGE,
  MODE,
  NOBODY,
  aimOf,
  cylinder,
  heightOf,
  homeOf,
  hidden,
  ray,
  struck,
  // The port and starboard guns share the same height and forward offset.
  muzzleOf: (ship: Rover) => point(ship, 0, SHIP_GUNS[0][1], SHIP_GUNS[0][2]),
};
