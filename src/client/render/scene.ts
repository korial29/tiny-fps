import type { World, WorldDef } from '../../shared/world';
import { tints } from '../../shared/world';
import { lagoon, shore } from '../shore';
import { plumes } from '../smoke';
import type { Vec3 } from '../mesh';
import { skyline, trees } from '../skyline';
import { deepen, street } from '../street';
import { drive } from '../tasks';
import { vision, zones } from '../vision';
import type { Look } from '../rover/draw';
import type { Instances } from '../instances/types';

import { FOG_CLIMB, FOG_FAR, FOG_LAYER, FOG_RISE, HAZE, MAX_TINTS } from './constants';

/** The tints of a world's textures (tints()): the shader's palette, MAX_TINTS at most. */
export const palette = ({ def }: Pick<World, 'def'>): Vec3[] => tints(def).slice(0, MAX_TINTS);

/** The corners of a face's two triangles, as [along p, along q] picks of its min or max. */
export const CORNERS = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 0],
  [1, 1],
  [0, 1],
];

/**
 * The faces of every brush as triangles in the vertex format of mesh.ts: the top gets the brush's
 * top texture, every other face its side texture. Texture coordinates are world metres on the face
 * (x, z on horizontal faces; z, y on faces facing x; x, y on faces facing z), so a texture runs on
 * across neighbouring brushes. A face another brush covers flush is not built, nor is the bottom
 * of a brush at or under the kill floor: nothing is seen from there. A brush's light is packed
 * with its palette index as 2 * index + 1: the light is 1 (the daylight is in the shader), and
 * the shader takes the index from floor(w / 2).
 */
export const level = (world: World): number[] => {
  const { brushes, floor } = world.def;
  const out: number[] = [];
  const keys = palette(world).map(String);
  brushes.forEach((b, bi) => {
    if (b.ghost) {
      return;
    }
    const light = 1 + 2 * Math.max(0, keys.indexOf(`${b.tint}`));
    for (let a = 0; a < 3; a++) {
      const [p, q] = [(a + 1) % 3, (a + 2) % 3];
      const [du, dv] = a == 0 ? [2, 1] : a == 1 ? [0, 2] : [0, 1];
      for (const up of [0, 1]) {
        const at = up ? b.max[a] : b.min[a];
        const covered = brushes.some(
          (c, j) =>
            j != bi &&
            !c.ghost &&
            (up ? c.min[a] : c.max[a]) == at &&
            c.min[p] <= b.min[p] &&
            c.max[p] >= b.max[p] &&
            c.min[q] <= b.min[q] &&
            c.max[q] >= b.max[q],
        );
        if (covered || (a == 1 && !up && b.min[1] <= floor)) {
          continue;
        }
        const n: Vec3 = [0, 0, 0];
        n[a] = up ? 1 : -1;
        for (const [i, j] of CORNERS) {
          const v: Vec3 = [0, 0, 0];
          [v[a], v[p], v[q]] = [at, (i ? b.max : b.min)[p], (j ? b.max : b.min)[q]];
          out.push(...v, ...n, v[du], v[dv], a == 1 && up ? b.top : b.side, light);
        }
      }
    }
  });
  return out;
};

/**
 * What the daylight of a world lights its surfaces with, linear RGB, as the shader's H uniform:
 * the ambient from the sky above, from the sides and bounced up from below, then the sky's zenith
 * and horizon colours. The ambient is the sky's own colour, washed toward white so a shadow is
 * blue-grey and not blue, and dimmer on the sides and below.
 */
export const daylight = ({ sky: [zenith, horizon] }: WorldDef): Vec3[] => [
  zenith.map(v => (v * 0.45 + 0.55) * 0.74) as Vec3,
  horizon.map(v => (v * 0.7 + 0.3) * 0.58) as Vec3,
  horizon.map((v, i) => v * [1, 0.92, 0.8][i] * 0.34) as Vec3,
  zenith,
  horizon,
];

/** The world as it is drawn: its buildings down to the street, and a city around them. The physics knows only `world`. */
export const city = (world: World): World => ({
  ...world,
  def: { ...world.def, brushes: [...deepen(world.def), ...skyline(world.def)] },
});

/**
 * A map's own scenery, loaded with its chunk before the renderer is made (decor()): its ground drawn
 * once, and on the moon the Earth (`sky`, the ground's last vertices) and where it stands.
 */
/** A map's own scenery: its land, its sky, the Earth's place, glass drawn blended after the rest (Landfall's canopy), and its rocks' GLSL. */
/** Metres a tile of Decor.grass spans: the runs it is culled by. */
export const GRASS_TILE = 16;
/** Metres from the eye within which a tile of Decor.grass is drawn. */
export const GRASS_REACH = 20;

/** Metres from the eye within which a palm is drawn finely (and casts a shadow); cheaply past it (instances/cull.ts). */
export const GROVE_NEAR = 20;
/** Metres past which no palm is drawn: the far end of the beach, the hills behind standing for the forest there. */
export const GROVE_FAR = 100;

export type Decor = {
  land: number[];
  sky: number[];
  heavens?: Vec3;
  glass?: number[];
  /** GLSL for the map's rocks (TEX.ROCK) under BEACH, spliced in by fragOf(): Landfall's granite, which its chunk brings. */
  rock?: string;
  /** GLSL for the map's indoor windows under MOON, spliced in by fragOf(): Tranquility's traced reflections, which its chunk brings. */
  glaze?: string;
  /** How the map's rovers look, if not as the moon's: Landfall's buggy, which its chunk brings. */
  car?: Look;
  /**
   * Fine detail drawn only near the eye and casting no shadow (Landfall's ferns, fronds and
   * flowers), its triangles in tiles of GRASS_TILE metres so that a run of them is a tile.
   */
  grass?: number[];
  /** What is drawn by instance (instances/): Landfall's palms, a few variants drawn finely near the eye and cheaply far from it. */
  instances?: Instances;
  /** GLSL of VERT's instance mode (instances/glsl.ts //INSTANCE), which its chunk brings: Landfall's palms. */
  instanced?: string;
  /** GLSL of FADE's pixel (//FADE), which its chunk brings: Landfall's ferns cut to blades. */
  fade?: string;
  /** GLSL for the forest's own layers under BEACH, spliced in by fragOf(): Landfall's burnt earth, which its chunk brings. */
  forest?: string;
  /** Fires drawn only, with the map's (smoke.ts plumes()): Landfall's among its burnt trees, which its chunk brings. */
  blazes?: number[][];
};
/** The scenery of a map that has none of its own: the city's is drawn here. */
export const BARE: Decor = { land: [], sky: [] };

/** The scenery of each map already loaded: it is the same each time the map is played. */
export const decors = new Map<WorldDef, Decor>();

/**
 * The scenery of the map `def`: none for a map that has no chunk of its own (Highline), and one
 * already loaded, at once; else a promise of it, from Tranquility's or Landfall's chunk.
 */
export const decor = (def: WorldDef): Decor | Promise<Decor> => {
  const had = def.scenery === 'moon' || def.scenery === 'beach' ? decors.get(def) : BARE;
  if (had) {
    return had;
  }
  const keep = (d: Decor) => (decors.set(def, d), d);
  return (
    def.scenery === 'moon'
      ? import('../tranquility').then(m => drive(m.default(def)))
      : import('../landfall').then(m => drive(m.default(def)))
  ).then(keep);
};

/** All the map's vertices, drawn once: the city (on the moon and the beach, `d` instead), the brushes, the street under them, the parks' trees, the runner's red and the team zones. */
export const scenery = (world: World, d = BARE): number[] =>
  world.def.scenery === 'moon'
    ? [...level(world), ...d.land, ...vision(world.def), ...zones(world.def), ...d.sky]
    : world.def.scenery === 'beach'
      ? [
          ...level(world),
          ...shore(world.def),
          ...d.land,
          ...vision(world.def),
          ...zones(world.def),
          ...(d.grass ?? []),
          ...(d.glass ?? []),
          ...plumes(world.def, d.blazes),
          ...lagoon(world.def),
        ]
      : [
          ...level(city(world)),
          ...street(world.def),
          ...trees(world.def),
          ...vision(world.def),
          ...zones(world.def),
        ];

/** The height the fog layer is anchored at: the lowest top of the world, so that at a roof the layer is a few percent of the haze at most. */
export const fogRef = ({ brushes }: WorldDef) => Math.min(...brushes.map(b => b.max[1]));

/**
 * The fog's optical depth from `eye` to `p`, what the shader integrates: the haze plus the layer,
 * for a world whose fog density is `density` and whose layer sits at `ref`.
 */
export const fogDepth = (density: number, ref: number, eye: Vec3, p: Vec3) => {
  const x = Math.min(Math.max(FOG_RISE * (p[1] - eye[1]), -FOG_CLIMB), FOG_CLIMB);
  const climb = Math.abs(x) < 1e-3 ? 1 - x / 2 : (1 - Math.exp(-x)) / x;
  return (
    density *
    Math.min(Math.hypot(p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]), FOG_FAR) *
    (1 + FOG_LAYER * Math.exp(FOG_RISE * (ref - eye[1])) * climb)
  );
};

/** The shader's fog uniform: the world's fog colour pulled toward its horizon by HAZE, and its density; none when the world has no fog. */
export const fogOf = ({ fog, sky }: WorldDef): [number, number, number, number] =>
  fog
    ? [...([0, 1, 2].map(i => fog[i] + (sky[1][i] - fog[i]) * HAZE) as Vec3), fog[3]]
    : [...sky[1], 0];
