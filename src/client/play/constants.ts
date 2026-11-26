import { TICK_HZ } from '../../shared/constants';

export const STEP = 1 / TICK_HZ;
/** Steps run in one frame at most: a background tab catches up by this much, not by minutes. */
export const MAX_STEPS = 5;
/** The Hunter's harpoon scope: the view's field of view change in degrees (70 to 18, about 4×) and its ease-in time (s). */
export const [SCOPE_FOV, SCOPE_IN] = [-52, 0.18];
/** Metres within which a vehicle shows its health over it: a rover, a ship. */
export const NEAR_HULL = [14, 24];
/** Ms after a hard landing during which a loss of health is the fall's, not a foe's: the snapshot's lag. */
export const FELL = 500;
/** Frames a second of the menu's character picture: each is a frame of the scene of its own. */
export const PREVIEW_HZ = 30;
