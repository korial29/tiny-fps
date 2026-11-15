// The orbital station's mission as the HUD tells it (the user, 2026-11-14): a line under the score
// and where its marker points. It shows to a pilot and to who is in the station, and to everyone
// once a strike is armed. Pure, no DOM.
import { PHASE } from '../shared/station';
import type { StationDef } from '../shared/station';
import type { StationState } from '../shared/types';
import type { Vec3 } from './mesh';

/** The line, whether it is urgent, and what the marker points at: the station from outside, its console from inside. */
export interface Brief {
  text: string;
  hot?: boolean;
  to?: 'station' | 'post';
}

const clock = (s: number) => `${Math.floor(s / 60)}:${`${s % 60}`.padStart(2, '0')}`;

/** The brief of the own player of `team`: `flying` a ship, `inside` the station. */
export const brief = (
  st: StationState | undefined,
  team: number,
  flying: boolean,
  inside: boolean,
): Brief | undefined => {
  if (!st) {
    return undefined;
  }
  const [t, ours] = [clock(st.left), st.team === team];
  if (st.phase === PHASE.READY) {
    return inside
      ? { text: 'Secondary mission · find the command post, press E', to: 'post' }
      : flying
        ? { text: 'Secondary mission · fly up to the orbital station', to: 'station' }
        : undefined;
  }
  if (st.phase === PHASE.ARMED) {
    return ours
      ? { text: `Orbital strike in ${t} · hold the station`, hot: true }
      : {
          text: `Enemy strike in ${t} · cancel it at the station`,
          hot: true,
          to: inside ? 'post' : 'station',
        };
  }
  if (st.phase === PHASE.STRUCK) {
    return ours
      ? { text: `Enemies disintegrated · go score! ${t}` }
      : { text: `Your team was disintegrated · back in ${t}`, hot: true };
  }
  return flying || inside ? { text: `Orbital station recharging · ${t}` } : undefined;
};

/** Where a brief's marker points: the middle of the hangar, or the top of the console. */
export const goal = ({ post: [lo, hi], hall: [a, b] }: StationDef, to: Brief['to']): Vec3 =>
  to === 'post'
    ? [(lo[0] + hi[0]) / 2, hi[1], (lo[2] + hi[2]) / 2]
    : [(a[0] + b[0]) / 2 - 8, a[1] + 7, (a[2] + b[2]) / 2];
