// Landfall's buggy (docs/BEACH.md): the rover's chassis and physics with a body and tyres of its
// own, brought by Landfall's chunk (landfall.ts, Decor.car) and drawn by rover() in rover/draw.ts.
import type { Look } from '../rover';
import { body } from './body';
import { fender, wheel } from './wheel';

export const BUGGY: Look = { body, wheel, fender };
