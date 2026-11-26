import type { Vec3 } from '../mesh';

/** The parts' name for the strips and the tassets under the belt, before each one's number: the strips 0 to 15, the tassets after them. */
export const STRIP = 'Belt strip ';

export const hide: Vec3 = [0.39, 0.42, 0.28];
export const leather: Vec3 = [0.15, 0.12, 0.105];
/** His hide: its olive, the green beige of the pecs and the abs, and its dark green spots. */
export const HIDE: Vec3 = [0.43, 0.36, 0.25];
export const HIDE_LIGHT: Vec3 = [0.66, 0.6, 0.43];
export const HIDE_SPOT: Vec3 = [0.08, 0.15, 0.08];
export const graphite: Vec3 = [0.18, 0.22, 0.23];
export const silver: Vec3 = [0.57, 0.66, 0.66];
export const bronze: Vec3 = [0.59, 0.37, 0.19];
export const light: Vec3 = [1, 0.24, 0.065];

export const stature = 1.2;
/** The helmet's width against its first build (the user, 2026-11-24: narrower). */
export const HELM_WIDTH = 0.88;
/** How far the Hunter's right fingers close (hand()'s curl): a fist, the claw's housing on its back. */
export const HUNTER_FIST = 0.9;
/** The wrist blades and their housing stand off the back of the hand and sit up the forearm (the user, 2026-11-24: they cut into the hand), in the runner's metres. */
export const WRIST_LIFT = 0.022;
export const WRIST_UP = 0.02;
/** Where the sleeves' net ends on the arm: its share from the shoulder to the wrist. */
export const NET_SLEEVE = 0.55;
/** The armpit's cut (the user, 2026-11-24): how far the flank draws in under it, and the width of the upper arm's inside. */
export const PIT = 0.11;
export const PIT_ARM = 0.85;
/** The hide's round spots to a square metre of its most spotted skin. */
export const SPOTS = 430;
/** How much thinner the chest is from the side than the runner's (the user, 2026-11-24: too thick in profile). */
export const CHEST_THIN = 0.1;
/** What the finished model is scaled by from the sculpt, off the head (hunter()'s last pass). */
export const sized = ([x, y, z]: Vec3): Vec3 => [
  x * stature * 0.9,
  y * stature,
  z * stature * 0.92,
];
/** The top of the shoulder cannon's post, sculpted (CANNON_HINGE in the finished model). */
export const HINGE: Vec3 = [-0.221, 1.637, 0.06];
/** The foot of the cannon's post, sculpted (CANNON_POST in the finished model). */
export const POST: Vec3 = [-0.233, 1.54, 0.082];
/** The joint of the cannon's arm, sculpted (CANNON_ELBOW in the finished model). */
export const ELBOW: Vec3 = [-0.227, 1.586, 0.099];
/**
 * The top of the shoulder cannon's post, in the rest model: the hinge it folds about. The model
 * draws it deployed, along the look; stowed it lies back along the top of the shoulder.
 */
export const CANNON_HINGE: Vec3 = sized(HINGE);
/** The foot of the cannon's post, on its saddle on the left shoulder. */
export const CANNON_POST: Vec3 = sized(POST);
/** The joint of the cannon's arm, between its foot and its hinge. */
export const CANNON_ELBOW: Vec3 = sized(ELBOW);
/** Radians the stowed cannon is turned about its hinge's right axis from the deployed one: muzzle back. */
export const CANNON_FOLD = 2.9;
/** The cannon's muzzle, from its hinge, deployed (the stepped muzzle's face). */
export const CANNON_MUZZLE: Vec3 = sized([-0.021, 0.006, -0.205]);
/** Seconds the cannon takes to fold out, or back. */
export const CANNON_SWING = 0.35;
