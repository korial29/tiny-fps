// Sound synthesis, jsfxr style: each sound is a handful of numbers rendered once into samples.
// No DOM, no Web Audio: audio.ts turns the samples into buffers. Music is rendered the same way.

export * from './sfx/synth';
export * from './sfx/sounds';
export * from './sfx/layers';
export * from './sfx/render';
export * from './sfx/voices';
export * from './sfx/music';
export * from './sfx/air';
export * from './sfx/anthem';
