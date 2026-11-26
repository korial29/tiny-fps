import { ORBIT } from '../../shared/constants';
import { free, gap2, nearby } from '../../shared/rover';
import { MODE } from '../../shared/types';
import type { PlayerState, Rover } from '../../shared/types';

/**
 * What E does for a player on foot: 'drive' near a rover whose wheel is free, 'ride' when only the
 * seat beside it is, or when he carries a flag (a carrier does not drive), 'fly' near a ship that
 * is there and has no pilot (a carrier does not fly), '' with no free seat in reach, seated or
 * down. The nearest vehicle with a seat for him counts, as the room judges it (nearby(), free()).
 */
export const boarding = (
  me: Pick<PlayerState, 'x' | 'y' | 'z' | 'mode' | 'down'> | undefined,
  rovers: readonly Rover[],
  carrying = false,
): '' | 'drive' | 'ride' | 'fly' => {
  let [best, what]: [number, '' | 'drive' | 'ride' | 'fly'] = [Infinity, ''];
  if (!me || me.down || me.mode === MODE.RIDE) {
    return what;
  }
  for (const r of rovers) {
    const s = free(r, carrying);
    const d = gap2(r, me);
    if (s >= 0 && nearby(r, me) && d <= best) {
      [best, what] = [d, r.ship ? 'fly' : s ? 'ride' : 'drive'];
    }
  }
  return what;
};

/** The speed-o-meter's reading of a rover: whole km/h over the ground. */
export const kmh = (r: Pick<Rover, 'vx' | 'vz'>): number =>
  Math.round(Math.hypot(r.vx, r.vz) * 3.6);

/** The warning of the nearest limit once one is within its last half of WARN, or ''. */
export const warning = (up: number, out: number): string =>
  Math.max(up, out) < 0.5 ? '' : up >= out ? 'HIGH ORBIT · DESCEND' : 'CRATER EDGE · TURN BACK';

/** The ship's height on its panel: metres under the edge of space, kilometres in orbit. */
export const height = (alt: number): string =>
  alt <= ORBIT.SEAM
    ? `${Math.round(alt)} m`
    : `${(alt / 1000).toFixed(alt < 10_000 ? 1 : 0)} km  ·  ORBIT`;

/** Milliseconds a banner stays, and a hit marker. */
export const BANNER_MS = 2800;
/** Milliseconds an own frag's name and award stay, and a line of the kill feed; the feed's lines. */
export const FRAG_MS = 2400;
export const FEED_MS = 6000;
export const FEED_MAX = 5;
/** The radio screen's canvas, pixels a side, and the seconds it stays after its line. */
export const COMM = 192;
export const COMM_TAIL = 0.5;
export const HIT_MS = 140;

/** m:ss. */
export const clock = (s: number): string => `${Math.floor(s / 60)}:${`${s % 60}`.padStart(2, '0')}`;
