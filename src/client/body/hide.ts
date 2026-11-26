import { HIDE_LIGHT } from '../hunter/constants';

/**
 * The Hunter's hide on his hands (the user, 2026-11-26): how far its middle goes to his body's
 * light hide (HIDE_LIGHT), how much darker its edges are, how wide the light band is across the
 * hand (metres), and how strong the skin's grain is: its blotches, and its fine speckle.
 */
export const HAND_HIDE = { light: 0.55, edge: 0.24, wide: 0.021, grain: [0.11, 0.08] };
/**
 * The layer of the Hunter's hand's skin: part of the way from plain skin (-1) to the shader's skin
 * pass (SKIN_LAYER), which fades in between the two. All of it turned his olive hide to a man's
 * warm skin, lighter than his arm's beside it; this much keeps the pores and the grain.
 */
export const HAND_SKIN = -1.048;

/**
 * How the Hunter's hand's skin is coloured at a point of the hand's own space (x to the thumb, y
 * the back, z to the fingers), written into `into`: how far its plain tint goes to his body's light
 * hide (HIDE_LIGHT), then what the colour is multiplied by. A gradient: lighter down the middle of
 * the hand, back and palm, a little darker along its edges, fading out into the fingers and at the
 * wrist, which meets the arm in the plain tint. And a grain: the colour wanders from vertex to
 * vertex, in blotches and a finer speckle, as his body's pigment does (hunter/marine.ts). It is a
 * function of the place alone: the same on both hands, which mirror each other, and the same at
 * every build. Called once a vertex of a hand being built: plain numbers, nothing allocated.
 */
export const hideAt = (into: number[], x: number, y: number, z: number) => {
  const t0 = Math.min(Math.max(z / 0.03, 0), 1);
  const t1 = Math.min(Math.max((z - 0.09) / 0.06, 0), 1);
  const yk = (y + 0.004) / 0.032;
  const hand = t0 * t0 * (3 - 2 * t0) * (1 - t1 * t1 * (3 - 2 * t1)) * Math.exp(-0.5 * yk * yk);
  const xk = x / HAND_HIDE.wide;
  const middle = Math.exp(-0.5 * xk * xk);
  into[0] = HAND_HIDE.light * hand * middle;
  into[1] =
    (1 - HAND_HIDE.edge * hand * (1 - middle)) *
    (1 +
      HAND_HIDE.grain[0] *
        Math.sin(913 * x + 517 * y + 1.7 * Math.sin(701 * z)) *
        Math.cos(811 * z - 433 * y + 0.9 * Math.sin(977 * x)) +
      HAND_HIDE.grain[1] * Math.sin(2311 * x - 1907 * z) * Math.cos(2099 * y + 1511 * z));
};
/** His body's light hide, which the middle of his hand goes to (hideAt()). */
export const HIDE_TO = HIDE_LIGHT;

/**
 * The size of the hand's own space as the shader's skin pass sees it (palmsOf()): under 1, its
 * pores and grain are that much larger than a man's (the user, 2026-11-26: more grain), a coarse
 * hide that reads from the eye's distance where a man's fine pores did not.
 */
export const GRAIN_SCALE = 0.6;
