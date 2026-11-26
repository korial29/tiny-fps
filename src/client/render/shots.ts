import { LIMB } from '../../shared/types';
import type { PlayerState } from '../../shared/types';
import { rackWeapon, vestMesh } from '../props';
import { hunterSteps } from '../soldier';
import { beast, body, cut } from '../skin';
import { preparing } from '../armor';
import { STYLES, closeMesh } from '../hair';
import { ID, ORIGIN, mesh } from '../store';
import { partsOf } from '../xeno';
import { plating, textures } from '../textures';

/** Pixels high a picture is drawn at least, for a small card's to be smooth. */
export const PICTURE_MIN = 320;

/** A character card's picture: how high over the map he stands (m), the camera's height over his feet and its distance (m), its angle off his front and his own off the sun (rad), its field of view (degrees), and how far it steps to its right (m). */
export const PORTRAIT = { y: 500, eye: 1.3, away: 2.5, turn: -0.35, sun: 0.9, fov: 30, side: 0 };
/** A haircut's picture: the head alone, seen three quarters from behind so a tail or a bun shows. */
export const HEAD = { ...PORTRAIT, eye: 1.6, away: 1.5, turn: -0.9, fov: 20, side: -0.12 };
/** A picture's framing, and whether he grins in it. */
export type Shot = typeof PORTRAIT & {
  grin?: boolean;
  /** What he holds, over the empty hands of a picture (the character screen's weapon). */
  hold?: Partial<PlayerState>;
  /** Radians he is turned from his usual pose, towards his left: a weapon held ahead then shows across the picture. */
  spin?: number;
};
/** An ally's face on the radio screen: the head nearly from the front, grinning. */
export const FACE: Shot = { ...PORTRAIT, eye: 1.64, away: 1.4, turn: -0.3, fov: 14, grin: true };

/** Pixels drawn at most (1080p): every one is lit per light and shadow map, so a 4K screen at a pixel ratio of 2 would pay for 8 million. */
export const MAX_PIXELS = 1920 * 1080;

/** The canvas size in device pixels: the CSS size times the pixel ratio (2 at most), scaled down to MAX_PIXELS. */
export const backing = (cw: number, ch: number, dpr: number): [number, number] => {
  const k = Math.min(dpr, 2, Math.sqrt(MAX_PIXELS / (cw * ch || 1)));
  return [Math.round(cw * k), Math.round(ch * k)];
};

/** Throws when the browser has no WebGL2. */
/**
 * What a renderer builds before its first frame, as steps of a few tens of milliseconds, each kept
 * where every renderer finds it (memoized, or in the GPU store): the runners' skins at every level,
 * now, built on the first runner to come near (the close one with its face's channels takes a
 * tenth of a second) they would stall a frame of the match. So would their armour's recipes (a
 * quarter of a second close up; the own body's, close and of the own `build`, a third of a second
 * on the first frame), the halves a katana's cut makes of each (cut(), some 40 ms for every level
 * and limb), her close hair, every style (half a second for the five: a style can come with a
 * player who joins or change in the menu mid-match), the xenomorph's skins and rigid pieces (its
 * close skull alone took a frame of 70 ms), the racks' weapons and the textures. An armour's
 * recipe is a step of many (preparing()), a slice of its skin at a time. createRenderer()
 * runs them at once; index.ts runs them one task each before, so the loading screen paints on.
 * `own` is the own runner's build, whose first-person body is drawn close: a match's, not the
 * character screen's. `hunter`: the Hunter's pieces too (warmHunter()), which the character
 * screen draws on a tile and a match only once one comes.
 */
/** A step of a renderer's warm-up: true when it has more to do (it is run again). */
export type Step = () => boolean | void;

/** Runs `step` to its end. */
export const through = (step: Step) => {
  while (step()) {}
};

/** A build's skins at the levels runners are drawn at, their armour's recipes and the halves of the cuts. */
export const outfit = (build: number): Step[] => [
  ...[0, 1, 3].map(lod => () => preparing(body(lod, build), lod > 2)),
  ...[0, 1, 2, 3].map(lod => () => {
    for (let limb = LIMB.HEAD; limb <= LIMB.LEG_R; limb++) {
      cut(lod, limb, build);
    }
  }),
];

export const warmSteps = (own?: number, hunter = false): Step[] => [
  ...(hunter ? hunterSteps() : []),
  () => void textures(),
  plating,
  ...outfit(0),
  ...(own === undefined ? [] : [() => preparing(body(2, own), true)]),
  ...Array.from({ length: STYLES }, (_, s) => () => void closeMesh(s)),
  () => [0, 1, 2, 3].forEach(lod => beast(lod)),
  ...[0, 1, 3].map(
    lod => () => partsOf(lod).forEach(({ key, make }) => mesh(key, o => make(o, ORIGIN, ID))),
  ),
  () => {
    [0, 2, 3].forEach(kind => rackWeapon(kind));
    [0, 1, 2, 3].forEach(kind => rackWeapon(kind, 'hunter'));
    vestMesh();
  },
];
