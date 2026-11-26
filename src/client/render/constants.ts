import { REGION } from '../skin';

/** Tints a world can use at once, white included (see palette). */
export const MAX_TINTS = 16;
/** Bytes the dynamic tail starts with; it grows when a frame needs more. */
export const TAIL = 1 << 19;
/** Metres one texture covers. */
export const TILE = 2;
/** Shadow map side in texels. */
export const SHADOW = 1024;
/** Metres the sun's shadow window spans on a side: 9 cm a texel. */
export const SUN_AREA = 96;
/**
 * Metres the window's middle is ahead of the eye, along the look on the ground: what is behind the
 * camera needs little of it. It reaches 19 m behind the eye and 77 m ahead: a rover at 20 m/s seen
 * from a chase camera keeps its shadow, and those of the hills it drives at, for 4 s ahead.
 */
export const SUN_AHEAD = 29;
/** Half the depth range of the sun's window, metres: what stands this far from the eye along the sun's direction still casts. */
export const SUN_DEPTH = 100;
/** How far the fog colour is pulled toward the sky's horizon, 0 to 1: a fog unlike the horizon draws an edge against the sky. */
export const HAZE = 0.6;
/**
 * The height fog: besides the haze at the density of the world's fog, a layer of FOG_LAYER times that
 * density at the lowest roof, which grows by e every 1 / FOG_RISE metres down: 2 % more at the roofs,
 * about three times the haze on the street 94 m under them.
 */
export const FOG_LAYER = 0.02;
export const FOG_RISE = 0.05;
/** The bound on the fog's climb (FOG_RISE times the height between the eye and the point): a kilometre up or down, and exp() of it stays finite in float32. */
export const FOG_CLIMB = 50;
/** The far clip, metres: the moon's stars (moonscape.ts SKY) seen from the far end of its crater, the widest view of any map. */
export const FAR = 1200;
/** The bound on the distance the fog integrates over: nothing drawn is further, and a point extrapolated off a thin face can be kilometres off. */
export const FOG_FAR = 2 * FAR;
/** The vertical field of view at rest, degrees, and the tangent of its half. */
export const FOV_DEG = 70;
export const FOV = Math.tan((FOV_DEG * Math.PI) / 360);
/** Metres within which another player is drawn with the near level of detail (see DETAIL), and within which with the close one (see body()). */
export const [NEAR, CLOSE] = [10, 4];
/** Metres within which a rover is drawn with its near level of detail (rover.ts), and within which with the middle one. */
export const [ROVER_NEAR, ROVER_MID] = [22, 70];
/** A ship's, 14 m long: its cockpit and its struts within 45 m, its plain shape past 160 m. */
export const [SHIP_NEAR, SHIP_MID] = [45, 160];
/** Texels a row of the store's data texture (flesh.ts). */
export const TEXELS = 2048;

/** R of the frame's own vertices (see VERT): no turn, a scale of 1, at the origin. */
export const STILL = [0, 0, 0, 1, 0, 0, 0, 1];

/** The moon's radius, metres, and the climb over the edge of space in which the crater fades into its globe. */
export const MOON_R = 1_737_400;
export const ORBIT_FADE = 250;
/** The height from which the globe shows past the relief's edge, and the climb over which it comes in. */
export const GLOBE_FROM = 20;
export const GLOBE_IN = 60;
export const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);

/**
 * The layer of the ninja's boots' uppers, in WEAVE's band (woven as it is): the shader adds their
 * details on the rest place (the user, 2026-11-17): a band wound round the ankle, a cord tied under
 * the lip of the shaft, and the split of the toe.
 */
export const BOOT_LAYER = -0.88;
/** The regions of a ninja's skin that are woven cloth: his suit, and his boots' uppers (the user, 2026-11-17: cloth, not leather). */
export const SUIT = [REGION.PANTS, REGION.UPPER, REGION.GLOVE, REGION.STRIPE, REGION.STRIPE_LOW];

/** Samples of the scene target: the canvas' own antialiasing no longer reaches it. */
export const SAMPLES = 4;
