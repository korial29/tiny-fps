// The city around the roofs: two rings of towers beyond the play area, from a fixed seed. They are
// only drawn (the renderer adds them to its own copy of the world), never built into the physics
// grid. Glass or concrete facades, some with a coloured cap, far enough to sink into the haze.
import { TEX } from '../shared/types';
import type { Brush, WorldDef } from '../shared/world';
import { hash } from './textures';

/** Towers in the near ring (tops mostly below the roofs) and in the far one (taller, in the haze). */
const RINGS = [18, 26];
const SEED = 8;
/** Where the ring starts beyond the play area, metres, and how far each ring sits behind the last. */
const GAP = 40;
const DEPTH = 55;
/** The street the towers stand on. */
const FOOT = -60;
/** Caps colours: warm orange, sky blue, signal red, green. They colour the daylight on a near white paint. */
const CAPS = [
  [1, 0.45, 0.12],
  [0.2, 0.6, 1],
  [0.9, 0.15, 0.2],
  [0.25, 0.85, 0.55],
];

/** The towers of a world's skyline, centred on its play area; the same ones every time. */
export const skyline = ({ brushes }: WorldDef): Brush[] => {
  const [x0, x1, z0, z1] = [0, 2].flatMap(a => [
    Math.min(...brushes.map(b => b.min[a])),
    Math.max(...brushes.map(b => b.max[a])),
  ]);
  const [cx, cz, r] = [(x0 + x1) / 2, (z0 + z1) / 2, Math.hypot(x1 - x0, z1 - z0) / 2];
  return RINGS.flatMap((n, ring) =>
    Array.from({ length: n }, (_, i): Brush[] => {
      const h = (k: number) => hash(i, ring, SEED + k);
      const a = ((i + h(1) * 0.8) / n) * 2 * Math.PI;
      const d = r + GAP + ring * DEPTH + h(2) * 30;
      const [x, z] = [cx + d * Math.cos(a), cz + d * Math.sin(a)];
      const [w, e] = [5 + h(3) * 8, 5 + h(4) * 8];
      const top = ring ? -5 + h(5) ** 2 * 90 : -20 + h(5) * 30;
      const side = [TEX.GLASS, TEX.STEEL, TEX.CONCRETE][+(h(6) > 0.7) + +(h(6) > 0.85)];
      const tower: Brush = {
        min: [x - w, FOOT, z - e],
        max: [x + w, top, z + e],
        top: TEX.CONCRETE,
        side,
      };
      return h(7) < 0.35
        ? [
            tower,
            {
              min: [x - w / 2, top, z - e / 2],
              max: [x + w / 2, top + 3 + h(8) * 3, z + e / 2],
              top: TEX.PAINT,
              side: TEX.PAINT,
              tint: CAPS[Math.floor(h(9) * CAPS.length)] as Brush['tint'],
            },
          ]
        : [tower];
    }).flat(),
  );
};
