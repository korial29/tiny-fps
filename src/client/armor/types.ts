/** A corner being clipped: its place at rest, its weights of its skin triangle's corners, its normal at rest, then the limits it lies on (BITS). */
export type Corner = number[];

/**
 * A recipe: triangles of corners, each [skin triangle, its three weights, how far off the skin,
 * the slope of the swell at rest (x, y, z), the normal at rest (x, y, z)], and per triangle its
 * colour, layer, whether it is a wall (its normal its own, flat) and its region (-1: a scratch).
 */
export interface Recipe {
  c: number[];
  t: number[];
  /** The triangles each kind of wearer has (armor()'s `ninja`, astronaut and `bare` bits), listed on first use. */
  k?: Int32Array[];
  /** Their corners, each distinct one once (shared()), by the same wearer. */
  s?: Shared[];
}

/**
 * A wearer's corners, each distinct one once: its first number in the recipe's `c` and its turned
 * weights (TURN bits) in `u`, two numbers a corner; in `x` the three of each triangle of its list.
 * Next to each other, triangles share their corners, two or three times over on the marine.
 */
export interface Shared {
  u: Int32Array;
  x: Int32Array;
  rest: Float64Array;
}

export const CORNER = 11;
export const TRI = 6;
/** A triangle's kind, bits: 1 a wall (its normal its own, flat); from TURN on, one for each corner of its skin triangle whose normal is taken the other way. */
export const TURN = 2;

/** A moulded corner: how far off the skin, the tilt of its normal (rest normal less the shell's), its rest normal. */
export type Moulded = number[];

/** A moulded plate's shell: its axis, the fit's weights, its clearance, per build and region. */
export interface Shell {
  z0: number;
  w: number[];
  clear: number;
}
