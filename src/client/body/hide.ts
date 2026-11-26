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

const bell = (x: number) => Math.exp(-0.5 * x * x);
const ramp = (x: number) => {
  const t = Math.min(Math.max(x, 0), 1);
  return t * t * (3 - 2 * t);
};

/**
 * The colour of the Hunter's hand's skin at a point of the hand's own space (x to the thumb, y the
 * back, z to the fingers), from its plain `tint`. A gradient: lighter down the middle of the hand,
 * back and palm, a little darker along its edges, fading out into the fingers and at the wrist,
 * which meets the arm in `tint`. And a grain: the colour wanders from vertex to vertex, in blotches
 * and a finer speckle, as his body's pigment does (hunter/marine.ts). It is a function of the place
 * alone: the same on both hands, which mirror each other, and the same at every build.
 */
export const hideAt = (tint: number[], x: number, y: number, z: number): number[] => {
  const hand = ramp(z / 0.03) * (1 - ramp((z - 0.09) / 0.06)) * bell((y + 0.004) / 0.032);
  const middle = bell(x / HAND_HIDE.wide);
  const light = HAND_HIDE.light * hand * middle;
  const shade = 1 - HAND_HIDE.edge * hand * (1 - middle);
  const [blotch, fine] = HAND_HIDE.grain;
  const grain =
    1 +
    blotch *
      Math.sin(913 * x + 517 * y + 1.7 * Math.sin(701 * z)) *
      Math.cos(811 * z - 433 * y + 0.9 * Math.sin(977 * x)) +
    fine * Math.sin(2311 * x - 1907 * z) * Math.cos(2099 * y + 1511 * z);
  return tint.map((c, i) => (c + (HIDE_LIGHT[i] - c) * light) * shade * grain);
};

/**
 * The size of the hand's own space as the shader's skin pass sees it (palmsOf()): under 1, its
 * pores and grain are that much larger than a man's (the user, 2026-11-26: more grain), a coarse
 * hide that reads from the eye's distance where a man's fine pores did not.
 */
export const GRAIN_SCALE = 0.6;
