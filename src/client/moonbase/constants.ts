// The moon base's drawn colours and measures (docs/MOON.md), shared by the pieces of moonbase/.
import { BASE, DOME, HEAD, ROOM } from '../../shared/moonbase';
import { TEX } from '../../shared/types';

export const PAINT = [0.8, 0.82, 0.86];
export const DARK = [0.35, 0.36, 0.4];
/** The beams over the doorways of the modules. */
export const LINTELS = BASE.filter(b => b.min[1] === HEAD && b.max[1] === ROOM);
export const [CX, CZ] = DOME;
export const C = [CX, 0, CZ];
export const R = 22.4;
/** The hall's walls are drawn this high, where a ledge closes them against the inner shell: over a double jump from the mezzanine. */
export const TOP = 8;
/**
 * The normal of what is drawn indoors, whichever way it faces: up and away from the sun (east,
 * low), in both halves. The sun's shadow map is 64 m wide, so a true normal would be sunlit seen
 * from across the hall; with this one a texture takes the sky's ambient only. It leans off all
 * three axes: the shader's relief needs a normal out of the face's plane.
 */
export const INDOORS = [-0.6, 0.6, 0.53];
/** Texture axes of a face flat on x, y and z: world metres, as the brushes'. */
export const UV = [
  [2, 1],
  [0, 2],
  [0, 1],
];
/**
 * The layers of the glass seen from inside (the user, 2026-11-27: reflections on the windows): glows
 * whose reflection of the room is traced per pixel (mirror.ts), in a module and in the hall.
 */
export const [ROOM_GLASS, HALL_GLASS] = [-2.35, -2.4];
/** Lamps, the windows' glass seen from inside, their frames. */
export const LAMP = [1.25, 1.3, 1.4];
export const GLASS = [0.56, 0.48, 0.28];
export const FRAME = [0.04, 0.04, 0.05];
export const { CONCRETE, HULL, PAINT: WHITE, WALL: WALL_COAT } = TEX;
/** The dark grey of the trim on the base's walls inside: skirting, rails, pilasters, the corridors' frames. */
export const TRIM = [0.2, 0.21, 0.235];

/** Flat colours of the kit. */
export const [SNOW, GREY, IRON, INK, BLUISH, SOIL] = [
  [0.86, 0.87, 0.9],
  [0.55, 0.57, 0.6],
  [0.32, 0.33, 0.36],
  [0.07, 0.075, 0.085],
  [0.42, 0.52, 0.66],
  [0.2, 0.13, 0.08],
];
/** Glows: screens, status lights, grow lights. */
export const [CYAN, GREEN, AMBER, RED, MAUVE, PINK] = [
  [0.3, 0.8, 1],
  [0.35, 1, 0.5],
  [1, 0.7, 0.25],
  [1, 0.2, 0.15],
  [0.7, 0.35, 1],
  [1, 0.35, 0.85],
];
