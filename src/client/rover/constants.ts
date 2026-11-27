// The rover's model: sizes, colours and fixed points in the body's frame (x right, y up, -z the nose).
import { ROVER } from '../../shared/rover';
import { SHINE } from '../mesh';
import type { Vec3 } from '../mesh';

export const { A, B, WR, L0 } = ROVER;
/** The wheels, front left, front right, rear left, rear right: metres along the nose and to the right. */
export const AT = [
  [A, -B],
  [A, B],
  [-A, -B],
  [-A, B],
];

export const WHITE = [0.74, 0.75, 0.78];
export const ALU = [0.5, 0.52, 0.56];
export const STEEL = [0.24, 0.25, 0.28];
export const DARK = [0.09, 0.095, 0.11];
/** Foil: the fourth number is the layer, polished. */
export const GOLD = [0.9, 0.62, 0.17, SHINE];
export const MESH = [0.4, 0.41, 0.44];
export const LAMP = [1, 0.95, 0.8];
export const TAIL = [1, 0.1, 0.06];
export const SCREEN = [0.3, 0.8, 1];

/** The carcass of a tyre and the top of its treads, either side of WR; half its width. */
export const CARCASS = WR - 0.025;
export const TREAD = WR + 0.025;
export const HALF = 0.15;
/** The fender's radius, over the treads. */
export const FENDER = WR + 0.1;
/** Where the wishbones and the damper hold the hub carrier, inboard of the wheel's middle; the damper's top; its body's length. */
export const CARRIER = B - 0.2;
export const TOWER: [number, number] = [0.46, 0.42];
export const DAMPER = 0.42;
/** The headlights' lenses and the steering yoke's hub: right, up, ahead. */
export const LENS: Vec3 = [0.5, -0.2, 2.1];
export const YOKE: Vec3 = [-0.45, 0.3, 0.6];
/** The yoke turns this many times the front wheels' angle. */
export const GEAR = 2.5;
