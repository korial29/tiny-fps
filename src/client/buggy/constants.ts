// Landfall's buggy: its colours and the body's sizes, shared by its pieces (body.ts, pods.ts).

export const CAGE = [0.8, 0.79, 0.74];
export const STEEL = [0.24, 0.25, 0.28];
export const ENGINE = [0.32, 0.32, 0.34];
export const DARK = [0.08, 0.08, 0.09];
export const SEAT = [0.13, 0.12, 0.12];
export const LAMP = [1, 0.95, 0.8];
export const TAIL = [1, 0.1, 0.06];
export const DIALS = [1, 0.62, 0.2];
export const WHITE = [1, 1, 1];
export const ROUNDEL = [0.92, 0.91, 0.87];

/** The body's half width: the pods, the floor, the cage's feet, the dash. */
export const SIDE = 0.92;
/** The top of the side pods, and where their sides meet the floor, leaning in. */
export const POD_Y = 0.1;
export const FOOT = SIDE - 0.08;
/** The pods' top edge from the tail to the dash, [ahead, height]: dipped between the hoops where the crew climbs in. */
export const EDGE: [number, number][] = [
  [-0.62, POD_Y],
  [-0.42, POD_Y],
  [-0.26, -0.06],
  [0.4, -0.06],
  [0.56, POD_Y],
  [0.8, POD_Y],
];
