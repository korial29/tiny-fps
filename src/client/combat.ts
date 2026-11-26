// The gun as the client lives it: what a change in the numbers of a player's state means. The own
// shots (from the live steps of the predictor) kick the look and the camera and launch their balls
// at once; a change of `shots` flashes the muzzle and plays the shot, for the own player and the
// others; a ball's burst splashes and zaps where it is; the own `hits`, health and
// ammo play the hit sound, the hurt and the pickups and feed the HUD. The katana's side: the start of
// a swing (a change of `swing` or `cut`) plays the swish, the own cut's strike tick punches the
// camera, drawing or sheathing it plays the shing, a hit of the own player with the katana in hand
// adds the zap, and a runner shocked by it crackles. A grenade of the rifle's launcher thumps out
// of it, and its burst is a fireball that shakes the view of who stands near. A player who loses
// health, to a weapon or a fall, cries out in his own voice, and cries out longer as he goes down. No DOM.
export type { Combat, View } from './combat/types';
export { dreadful, fired, sight, struck, swung, voiceOf } from './combat/events';
export * from './combat/create';
