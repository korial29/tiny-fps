// The routes of HIGHLINE as lists of legs, flown with the real physics by the tests (test/routes.ts)
// and by the bots (bot.ts). A route is written once for red's half, outbound (a spawn to the
// centre line) and inbound (the centre line to the flag); the blue half's are their mirror images
// across z = 120, so a whole way across is `out` then the mirror of `in`.

export type P = [x: number, z: number];

/**
 * One leg of a route, ending standing on a roof `y` metres up:
 * - `go`: run (or walk) to a point;
 * - `leap`: run to `at`, jump there and steer for `to`. `dash` and `double` are the steps after the
 *   jump (after the wall-run ends, when `run`) at which to dash forward and to jump again;
 * - `slide`: run to `from`, then toward `to`, crouched between `c` metres along the way.
 */
export type Leg =
  | { k: 'go'; to: P; y: number; sprint: boolean }
  | {
      k: 'leap';
      at: P;
      to: P;
      y: number;
      dash?: number;
      double?: number;
      run?: boolean;
      sprint: boolean;
      /** In the air, forward or back so as to come down on `to`, a stone or a ledge: the bots' (bot.ts). */
      land?: boolean;
    }
  | { k: 'slide'; from: P; to: P; c: [number, number]; y: number };

export const go = (x: number, z: number, y: number, sprint = true): Leg => ({
  k: 'go',
  to: [x, z],
  y,
  sprint,
});

export const leap = (
  at: P,
  to: P,
  y: number,
  o: { dash?: number; double?: number; run?: boolean; sprint?: boolean; land?: boolean } = {},
): Leg => ({ k: 'leap', at, to, y, sprint: true, ...o });

/** The mirror image of a leg across z = zed / 2. */
export const mirror = (l: Leg, zed: number): Leg => {
  const f = ([x, z]: P): P => [x, zed - z];
  return l.k === 'go'
    ? { ...l, to: f(l.to) }
    : l.k === 'leap'
      ? { ...l, at: f(l.at), to: f(l.to) }
      : { ...l, from: f(l.from), to: f(l.to) };
};

/** The mirror image of a leg across HIGHLINE's centre line. */
export const flip = (l: Leg): Leg => mirror(l, 240);

/** The same legs with no dash, double jump or wall-run: plain runs and jumps. */
export const plain = (legs: Leg[]): Leg[] =>
  legs.map(l => (l.k === 'leap' ? { ...l, dash: undefined, double: undefined, run: false } : l));

// ---------------------------------------------------------------------------------------------
// Red's half of the three routes, from a spawn of red's (`start`) to the middle of the map, and
// from there back to the flag at (32, 224). Where each route crosses the centre line is `mid`.
// ---------------------------------------------------------------------------------------------

export interface Route {
  /** Legs to run before `out` when the trip starts at the flag, not at a spawn: room for the run-up. */
  flag: Leg[];
  out: Leg[];
  in: Leg[];
  mid: [x: number, y: number, z: number];
  start: number;
}

/** The Spine: the tower's north edge across 11 m, the viaduct along its wall, the beam over the plaza. */
export const HIGH: Route = {
  mid: [15.6, 26, 120],
  start: 0,
  // From the flag, round the back of the tower first: the 11 m gap wants a run of 20 m.
  flag: [go(16.5, 236, 26)],
  out: [
    go(16.5, 213, 26),
    leap([16.5, 212.2], [16.5, 192], 26, { dash: 32 }),
    go(15.6, 166, 26),
    leap([15.6, 164.2], [15.6, 142], 26, { run: true, dash: 1, double: 12 }),
    go(15.6, 134.5, 26),
    go(15.6, 120, 26),
  ],
  in: [
    go(15.6, 134.5, 26),
    go(15.6, 146.5, 26),
    leap([15.6, 146.8], [15.6, 170], 26, { run: true, dash: 1, double: 12 }),
    go(16.5, 199, 26),
    leap([16.5, 200.8], [16.5, 225], 26, { dash: 32 }),
    go(32, 224, 26),
  ],
};

/** Midtown: down onto the forecourt, two roofs, the plaza and its dais; back by the ledge ladders. */
export const MID: Route = {
  mid: [45.5, 17.2, 120],
  start: 4,
  flag: [],
  out: [
    go(45.5, 214, 26),
    leap([45.5, 212.2], [45.5, 196], 19),
    go(45.5, 188, 19),
    leap([45.5, 186.2], [45.5, 176], 21.2),
    go(45.5, 167.5, 21.2),
    leap([45.5, 166.2], [45.5, 150], 19),
    go(45.5, 141.5, 19),
    leap([45.5, 140.2], [45.5, 131], 15),
    go(45.5, 130, 15),
    leap([45.5, 129.3], [45.5, 120], 17.2),
  ],
  in: [
    go(38, 131, 15),
    leap([38, 133.8], [38, 138], 17.2, { sprint: false }),
    leap([38, 139], [38, 150], 19, { sprint: false }),
    go(38, 159.8, 19),
    leap([38, 160.4], [38, 172], 21.2),
    go(38, 181.2, 21.2),
    leap([38, 181.8], [38, 195], 19),
    go(34.5, 207, 19),
    leap([34.5, 208], [35, 211], 21.2, { sprint: false }),
    leap([36.8, 210.5], [42, 210.5], 23.4, { sprint: false }),
    leap([43.8, 210.5], [49, 210.5], 25, { sprint: false }),
    leap([49, 211.5], [49, 215], 26, { sprint: false }),
    go(32, 224, 26),
  ],
};

/** The Lowline: the stairs down the tower's east face, short gaps, the east terrace; back up. */
export const LOW: Route = {
  mid: [86, 14.5, 120],
  start: 7,
  flag: [],
  out: [
    go(52.5, 229, 26),
    go(78, 229, 14.5),
    go(88, 222, 14.5),
    go(88, 214.3, 14.5),
    leap([88, 213.3], [88, 206], 14.5),
    go(88, 186.3, 14.5),
    leap([88, 185.3], [88, 178], 14.5),
    go(98, 176, 14.5),
    go(98, 139, 14.5),
    leap([98, 138.3], [98, 130], 14.5),
    go(86, 120, 14.5),
  ],
  in: [
    go(98, 131, 14.5),
    leap([98, 133.7], [98, 141], 14.5),
    go(98, 180.5, 14.5),
    leap([98, 181.2], [98, 189], 14.5),
    go(98, 207.5, 14.5),
    leap([98, 208.5], [98, 216], 14.5),
    go(86, 229, 14.5),
    go(77.2, 229, 14.5),
    go(52.3, 229, 26),
    go(32, 224, 26),
  ],
};

/** The legs of a trip from a spawn of one base to the other flag, and from that flag home. */
export const trip = (r: Route, from: 'red' | 'blue'): { there: Leg[]; back: Leg[] } => {
  const [mine, theirs] = from === 'red' ? [(l: Leg) => l, flip] : [flip, (l: Leg) => l];
  return {
    there: [...r.out.map(mine), ...r.in.map(theirs)],
    back: [...r.flag.map(theirs), ...r.out.map(theirs), ...r.in.map(mine)],
  };
};

/**
 * The ways back up after a miss, from the roof a fall lands on to the roof above (red's half):
 * the terrace under the first gap of the Spine, the roof under the viaduct, the plaza under the
 * beam, and the shortcut from the forecourt of Midtown up to the first Spine roof. Each starts with
 * the player on the lower roof, standing at `from`.
 */
export const UP: Record<
  'terrace' | 'viaduct' | 'plaza' | 'forecourt',
  { from: [number, number, number]; legs: Leg[] }
> = {
  terrace: {
    from: [8, 19, 208],
    legs: [
      leap([8, 206.6], [8, 203], 21.2, { sprint: false }),
      go(6.6, 203, 21.2, false),
      leap([9.4, 203], [15, 203], 23.4, { sprint: false }),
      go(13.6, 203, 23.4, false),
      leap([16.4, 203], [22, 203], 25, { sprint: false }),
      leap([22, 202.2], [22, 196], 26, { sprint: false }),
    ],
  },
  viaduct: {
    from: [20, 19, 149],
    legs: [
      leap([20, 150.6], [20, 154], 21.2, { sprint: false }),
      leap([20, 155.4], [20, 160], 23.4, { sprint: false }),
      leap([21.4, 161], [24.5, 161], 25, { sprint: false }),
      leap([24.5, 163], [24.5, 168], 26, { sprint: false }),
    ],
  },
  forecourt: {
    from: [36, 19, 198],
    legs: [
      leap([34, 198], [30, 198], 21.2, { sprint: false }),
      leap([30.4, 196.6], [30, 192], 23.4, { sprint: false }),
      leap([30, 190.4], [28, 186], 25, { sprint: false }),
      leap([27.2, 186], [21, 186], 26, { sprint: false }),
    ],
  },
  plaza: {
    from: [8.5, 15, 124],
    legs: [
      leap([8.5, 127.5], [8.5, 131], 17.2, { sprint: false }),
      leap([10.1, 131], [14.5, 131], 19.4, { sprint: false }),
      leap([16.1, 131], [20.5, 131], 21.6, { sprint: false }),
      leap([22.1, 131], [26.5, 131], 23.8, { sprint: false }),
      leap([25.5, 133], [25.5, 138], 26, { sprint: false }),
    ],
  },
};

/** What is left of a way up from a roof `y` high: the legs from the first ledge above it, with the run-up to it. */
export const above = (legs: Leg[], y: number): Leg[] => {
  const i = legs.findIndex(l => l.k === 'leap' && l.y > y + 0.1);
  return legs.slice(i > 0 && legs[i - 1].k === 'go' ? i - 1 : i);
};
