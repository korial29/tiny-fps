// Test helper: the `teams` of a small world from two lists of spawns, the flag stand of each at its first spawn.
import type { FlagState } from '../src/shared/types';
import type { Spawn, WorldDef } from '../src/shared/world';

/** Red spawns on `red`, blue ones on `blue` (the same by default). */
export const duo = (red: Spawn[], blue: Spawn[] = red): WorldDef['teams'] => [
  { base: [red[0][0], red[0][1], red[0][2]], spawns: red },
  { base: [blue[0][0], blue[0][1], blue[0][2]], spawns: blue },
];

/** The match part of a snapshot at rest: no captures, a full clock, both flags at home. */
export const IDLE = {
  score: [0, 0] as [number, number],
  clock: 480,
  over: false,
  flags: [
    { state: 0, by: 0, x: 0, y: 0, z: 0, left: 0 },
    { state: 0, by: 0, x: 0, y: 0, z: 0, left: 0 },
  ] as [FlagState, FlagState],
};
