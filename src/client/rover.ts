// The moon's rover, drawn (the simulation is shared/rover.ts): an open two-seat buggy of its own
// design. White panels and gold foil on a tube frame, a low wedge of a nose under a shock hoop, a
// roll hoop behind the seats with a dish on its corner and a whip at the tail, and four wire-mesh
// wheels with zigzag treads far out at the corners, each on a wishbone and a long coil-over, under
// a fender in the team's colour. A pure function of the rover's state and the world: no state, no
// DOM. The rigid parts are built once per level of detail in the body's frame (x right, y up, -z
// the nose, the origin at the body's centre) and placed each frame; the wishbones and the dampers
// are stretched between their ends.
export * from './rover/constants';
export * from './rover/mesh';
export * from './rover/parts';
export * from './rover/body';
export * from './rover/draw';
