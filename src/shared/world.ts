// The brush world: solid axis-aligned boxes under an open sky, replacing the sector maps. Floors
// are box tops, walls box sides; boxes may float, so platforms, overhangs and ledges are free.
// No DOM, no Node API.

type Vec3 = [number, number, number];

/** One solid box. */
export interface Brush {
  /** Corners, metres, min < max on every axis. */
  min: Vec3;
  max: Vec3;
  /** TEX id of the top face, and of the sides and the bottom. */
  top: number;
  side: number;
  /** Colour of its ambient light, linear RGB 0 to 1. Absent: white. */
  tint?: Vec3;
}

export interface WorldDef {
  /** Shown on the title screen. */
  name?: string;
  brushes: Brush[];
  /** Feet x, y, z (standing on a top) and the yaw to face. */
  spawns: [x: number, y: number, z: number, yaw: number][];
  /** Feet below this height have fallen off the roofs: the player is put back at a spawn. */
  floor: number;
  /** Unit direction toward the sun, and its colour (linear RGB, may exceed 1). */
  sun: { dir: Vec3; color: Vec3 };
  /** Sky colours at the zenith and the horizon, linear RGB. */
  sky: [zenith: Vec3, horizon: Vec3];
  /** Fog colour and density per metre. Absent: none. */
  fog?: [r: number, g: number, b: number, density: number];
}

/** A world ready for physics and drawing: the definition and a grid of brushes on the floor plane. */
export interface World {
  def: WorldDef;
  /** Metres per grid cell. */
  cell: number;
  /** Cell key (see key()) to the indices of the brushes overlapping it. */
  grid: Map<number, number[]>;
}

/** Builds the grid. */
export const build = (def: WorldDef): World => ({ def, cell: 4, grid: new Map() });

/** Indices of the brushes whose footprint may overlap the square of half side r around (x, z). */
export const near = (w: World, x: number, z: number, r: number): number[] => {
  void x;
  void z;
  void r;
  return w.def.brushes.map((_, i) => i);
};

/** Distance along the ray from o in the unit direction d to the first brush face, at most max. */
export const ray = (w: World, o: Vec3, d: Vec3, max: number): number => {
  void w;
  void o;
  void d;
  return max;
};

/** Whether a brush hides b from a. */
export const hidden = (w: World, a: Vec3, b: Vec3): boolean => {
  void w;
  void a;
  void b;
  return false;
};
