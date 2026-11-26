/** Spring slots, a value and its speed each: lean, bank, yaw offset, landing dip, crouch, the velocity the stride sees, the pelvis height, how far up a ledge the climb is, the knock ahead and to the right, then one per move. */
export const [LEAN, BANK, YAW, DIP, LOW, VX, VZ, HY, UP, KA, KR, W] = [
  0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22,
];
/** Metres a respawn moves a player in a frame, at the least. */
export const TELEPORT = 5;
/** Half of a hip joint's distance from the middle: the feet stand under the hips on the move. */
export const HIP = 0.1;
/**
 * The guard a still runner stands in, not straight as a post (the user, 2026-11-08): half the
 * feet's spread (metres), how far the right foot stands ahead and the left behind (metres), the
 * trunk's lean forward (radians), and how far the legs give.
 */
export const [WIDE, STEP, BOW, GIVE] = [0.16, 0.12, 0.2, 0.05];
/** How much wider, longer, further forward and lower the guard of one with nothing in his hands is: a fighter's stance (FISTS). */
export const LOW_GUARD = [0.03, 0.08, 0.06, 0.035];
/**
 * The guard of one with nothing in his hands (the user, 2026-11-11: the arms out before him as in
 * karate, not along the body, not a boxer's fists by the chin): the lead arm (the right, as the
 * right foot) nearly straight ahead at the chest's height, the rear hand half way out before the
 * solar plexus. Per arm, the lead then the rear: the upper arm's lift forward and out to the side,
 * its turn inward, and the elbow's bend (radians).
 */
export const FISTS = [
  [1.15, 0.05, 0.12, 0.4],
  [0.5, 0.1, 0.3, 1.25],
];
/**
 * The breath of one standing still (the user, 2026-11-11: see him breathe): breaths a second, the
 * chest's lift (radians), the shoulders' (radians), and the rise of the whole body on its legs (metres).
 */
export const BREATH = [0.3, 0.035, 0.03, 0.007];
/**
 * The guard with the katana in hand, a swordsman's middle guard (the user, 2026-11-10: stand like
 * a samurai): how much further ahead the right foot stands and behind the left (metres), the pitch
 * of the left foot, its heel off the floor (radians), the share of the lean forward that is left,
 * the back straight, and how much more the legs give, the knees soft.
 */
export const KAMAE = [0.02, 0.28, 0.4, -0.025];
