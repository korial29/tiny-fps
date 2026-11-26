import { SOUND } from '../sfx';

/** The sound of each cue of a swap (CUES): the gun's, then the rail gun's. */
export const RELOADS = [
  [SOUND.EJECT, SOUND.CLICK],
  [SOUND.POP, SOUND.SCREW, SOUND.SCREW, SOUND.SCREW],
];

/** Seconds between two buzzes of a saber lock, and two crackles of a rail gun's bolt. */
export const BUZZ = 0.16;
export const CRACKLE = 0.09;
/** A bolt's buzz goes up and down 1.6 times a second, by 35 % of its pitch either way. */
export const WAIL = [1.6, 0.35];

/** A heavy release's swish is told by its cut plus this. */
export const HEAVY_CUE = 8;
/** A blow of the fists' swish is told by its blow (BLOW) plus this: shorter, higher and softer than a cut's. */
export const FIST_CUE = 16;
export const WHOOSH = { rate: [1.9, 1.85, 1.45, 1.55], gain: [0.3, 0.3, 0.45, 0.5] };
/** The thud of a blow that landed, the tackle's impact played higher: its gain, by BLOW, and its rate. */
export const THUD = [[0.35, 0.35, 0.65, 0.7, 0.5, 0.5, 0.8], 1.5] as const;
/** The xenomorph's swipes, left then right a little apart in pitch, and its tail's whip: rate, by BLOW from CLAW_L. */
export const RAKE = [1.05, 0.95, 1];
/** The swish of a cut, by CUT: higher and quieter for a thrust, lower and fuller for a slash. */
export const SWISH = { rate: [1.3, 1.05, 0.95, 0.8], gain: [0.6, 0.8, 0.8, 1] };
