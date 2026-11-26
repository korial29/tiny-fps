// The other players' model: a runner's skin (skin.ts) posed by its gait (gait.ts), in the
// renderer's vertex format. A runner is the last PlayerState seen and the gait that eases the body
// toward it; the dash streaks are the only thing drawn here that the gait does not pose. A
// player's (x, y, z) is the bottom of the feet. No DOM.
export * from './soldier/common';
export * from './soldier/types';
export * from './soldier/runner';
export * from './soldier/animate';
export * from './soldier/carry';
export * from './soldier/grasp';
export * from './soldier/stance';
export * from './soldier/hunter';
export * from './soldier/draw';
