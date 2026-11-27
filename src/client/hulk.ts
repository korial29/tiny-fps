// Landfall's scenery (docs/BEACH.md): the crashed ship and its debris, drawn once on the map's
// boxes (shared/beach.ts), which are ghosts: what is drawn here is what stops a runner.
// The hull is a smooth loft through the map's own section(), each row of collision a chord of it;
// its holes are the map's tears, cut along the loft's lines. Gloss-white paint (HULL, a layer the
// shader mirrors the sky in, compiled only into Landfall's program), textures inside, a few glows.
export * from './hulk/types';
export * from './hulk/common';
export * from './hulk/hull';
export * from './hulk/inside';
export * from './hulk/shapes';
export * from './hulk/trim';
export * from './hulk/seats';
export * from './hulk/hold';
export * from './hulk/pilot';
export * from './hulk/cabin';
export * from './hulk/wings';
export * from './hulk/debris';
export * from './hulk/parts';
