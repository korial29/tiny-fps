// Things drawn by instance (docs/PERFORMANCE.md): a few meshes built once, each drawn many times
// from a few numbers a copy, which the map's vertex shader code (Decor.instanced, VERT's Sm 4)
// turns into the copy's vertices. Each copy is drawn with a fine mesh near the eye and a cheap
// one past it, the two dithered into each other across the change (cull.ts, glsl.ts).

/** Floats a copy sends the vertex shader: four vec4s (VERT's Pa to Pd), the first three the map's own. */
export const INST = 16;
/** The float of a copy cull.ts writes its fade code into (Pd.x): the rest of Pd is unused. */
export const FADE_AT = 12;

/**
 * Copies of a few meshes. `mesh`: the meshes' vertices one after the other (the renderer's
 * format); `ranges`: each mesh's first vertex and count; `inst`: INST floats a copy, its place
 * first (x, y, z); `sphere`: four a copy, the middle and radius of a sphere round all it draws;
 * `near` and `far`: the mesh each copy is drawn with within reach and past it (-1: none);
 * `order`: the meshes in the order they are drawn, those that hide most first.
 */
export type Instances = {
  mesh: number[];
  ranges: number[];
  inst: number[];
  sphere: number[];
  near: number[];
  far: number[];
  order: number[];
};
