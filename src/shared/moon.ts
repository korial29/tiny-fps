// Tranquility, the moon level (docs/MOON.md): a stub until the map is built.
import { TEX } from './types';
import type { WorldDef } from './world';

export const MOON: WorldDef = {
  name: 'Tranquility',
  brushes: [{ min: [0, -30, 0], max: [160, 0, 280], top: TEX.STONE, side: TEX.STONE }],
  teams: [
    { base: [80, 0, 205], spawns: [[80, 0, 265, 0]] },
    { base: [80, 0, 75], spawns: [[80, 0, 15, Math.PI]] },
  ],
  floor: -20,
  sun: { dir: [0.88, 0.41, 0.24], color: [3, 2.95, 2.85] },
  sky: [
    [0.002, 0.002, 0.006],
    [0.02, 0.02, 0.035],
  ],
  gravity: 0.5,
  scenery: 'moon',
  helmets: true,
};
