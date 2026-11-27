// Landfall's palms by instance (instances/, docs/BEACH.md): a few palms built once at the origin,
// each drawn many times, moved, turned, stretched and leant by the vertex shader (glsl.ts).

/** Palms built for each shape level (lod 0 to 2), at each of its two details: near and far. */
export const VARIANTS = 4;
/** A trunk's radius the variants are built with: a palm's is a ratio of it. */
export const R0 = 0.28;

/** The mesh of shape `lod` (0 to 2), near (`far` false) or far, variant `v`: its index in Instances.ranges. */
export const meshOf = (lod: number, far: boolean, v: number) => (lod * 2 + +far) * VARIANTS + v;
/** How many meshes there are. */
export const MESHES = 3 * 2 * VARIANTS;

/** The meshes in the order they are drawn: the near ones first, the first row's (lod 2) first among them, so that the depth test spares the shading of what they hide. */
export const DRAW_ORDER = Array.from({ length: MESHES }, (_, j) => {
  const v = j % VARIANTS;
  const lod = 2 - (Math.floor(j / VARIANTS) % 3);
  return meshOf(lod, j >= MESHES / 2, v);
});
