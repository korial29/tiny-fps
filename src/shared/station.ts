// The orbital station over the moon (the user, 2026-11-14): a side mission. A ship flies up into
// its hangar, the pilot finds the command post beside it and presses its button: a countdown for
// everyone, and unless an enemy presses the same button in time, lasers from the sky disintegrate
// his whole team, who lie OUT ticks before they are back. Then the station recharges. The host's
// rules, ticked at TICK_HZ like ctf.ts: no DOM, no Node API, nothing here moves a player.
import { TICK_HZ } from './constants';
import { TEX } from './types';
import type { PlayerState, StationState } from './types';
import type { Brush, Door } from './world';

type Vec3 = [number, number, number];

/**
 * The station of a map: its command post (the console, a box), the inside of the station (a box),
 * the satellite's body, and the muzzle of its laser cannon, pointed down at the moon, where the
 * strike's lasers leave from.
 */
export interface StationDef {
  post: [min: Vec3, max: Vec3];
  /** The height of the hangar's deck and of the command room's floor. */
  deck: number;
  hall: [min: Vec3, max: Vec3];
  /** The satellite's cylinder (HULL.R wide): its axis at (x, z), from y0 to y1. */
  hull: [x: number, y0: number, z: number, y1: number];
  gun: Vec3;
}

/** Where the mission stands. */
export const PHASE = { READY: 0, ARMED: 1, STRUCK: 2, COOL: 3 } as const;

/**
 * Metres from the console's sides on the floor plane within which a player on foot reaches its
 * button, and the ticks of the countdown (30 s), of the disintegrated team's wait (15 s) and of the
 * recharge from the strike or the cancel to the next mission (90 s); a ship left empty in the
 * station goes home RECALL ticks after the last player has left it (20 s).
 */
export const STATION = {
  REACH: 1,
  ARM: 30 * TICK_HZ,
  OUT: 15 * TICK_HZ,
  COOL: 90 * TICK_HZ,
  RECALL: 20 * TICK_HZ,
};

/** Where the console's red button stands on its desk (client/station/): its middle and the desk's top. */
export const knob = ({ post: [lo, hi] }: StationDef): Vec3 => [
  lo[0] + 0.55,
  hi[1],
  (lo[2] + hi[2]) / 2,
];

/** True when the feet of `p` are within STATION.REACH of the console's sides, at its foot. */
export const reaches = ({ post: [min, max] }: StationDef, { x, y, z }: PlayerState): boolean =>
  y > min[1] - 1 &&
  y < max[1] &&
  Math.max(min[0] - x, x - max[0], 0) ** 2 + Math.max(min[2] - z, z - max[2], 0) ** 2 <=
    STATION.REACH ** 2;

/** True when (x, y, z) is inside the station. */
export const inside = (
  { hall: [min, max] }: StationDef,
  x: number,
  y: number,
  z: number,
): boolean => x > min[0] && x < max[0] && y > min[1] && y < max[1] && z > min[2] && z < max[2];

/**
 * The command room east of the hangar (the user, 2026-11-27, after a picture of a throne room): from
 * the hangar's east wall (X0) to the window (X1) over the station's axis, Z either side of its middle
 * along z, H high. A flight of steps (STEPS of RISE, from STAIR0 to STAIR1, W either side) climbs to
 * the dais (from STAIR1 to the window, DAIS high, the console on it); galleries as high stand along
 * the side walls from GALLERY to STAIR1, from SIDE out. The window is a round pane in the east wall,
 * R across, its middle UP over the dais, which shows space: the wall there is a ghost, the hull cut.
 */
export const COMMAND = {
  X0: 24,
  X1: 41,
  Z: 13,
  H: 30,
  STAIR0: 29,
  STAIR1: 35,
  STEPS: 10,
  W: 4,
  DAIS: 4,
  GALLERY: 27,
  SIDE: 9,
  R: 11,
  UP: 11,
};

/** The hangar and the command room, each [min, max]: shut but for the hangar's mouths (station()). */
export const rooms = ({ hull: [x, , z], deck: Y }: StationDef): [Vec3, Vec3][] => [
  [
    [x - 24, Y, z - HULL.R],
    [x + 24, Y + 14, z + HULL.R],
  ],
  [
    [x + COMMAND.X0, Y, z - COMMAND.Z],
    [x + COMMAND.X1, Y + COMMAND.H, z + COMMAND.Z],
  ],
];

/** The command room's window: the square round its pane, four corners on the east wall. */
export const vista = ({ hull: [x, , z], deck: Y }: StationDef): Vec3[][] => {
  const { X1, R, DAIS, UP } = COMMAND;
  const y = Y + DAIS + UP;
  return [
    [
      [x + X1, y - R, z - R],
      [x + X1, y - R, z + R],
      [x + X1, y + R, z + R],
      [x + X1, y + R, z - R],
    ],
  ];
};

/** The hangar's two mouths, between its side walls and under the lintels: four corners each. */
export const mouths = ({ hull: [x, , z], deck: Y }: StationDef): Vec3[][] =>
  [z - HULL.R, z + HULL.R].map(m => [
    [x - 20, Y, m],
    [x + 20, Y, m],
    [x + 20, Y + 11, m],
    [x - 20, Y + 11, m],
  ]);

export class Station {
  public phase: number = PHASE.READY;
  /** The team that armed the mission (ARMED, STRUCK). */
  public team = 0;
  /** Ticks left in the phase. */
  public ticks = 0;

  /** Back to READY: a new match, a new map, an empty room. */
  public reset(): void {
    [this.phase, this.team, this.ticks] = [PHASE.READY, 0, 0];
  }

  /**
   * A player of `team` pressed the button: READY arms it for his team, ARMED by the other team is
   * cancelled and recharges. Anything else does nothing. Returns what it did.
   */
  public press(team: number): 'armed' | 'cancelled' | undefined {
    if (this.phase === PHASE.READY) {
      [this.phase, this.team, this.ticks] = [PHASE.ARMED, team, STATION.ARM];
      return 'armed';
    }
    if (this.phase === PHASE.ARMED && team !== this.team) {
      [this.phase, this.ticks] = [PHASE.COOL, STATION.COOL];
      return 'cancelled';
    }
    return undefined;
  }

  /** One tick. 'strike' on the tick the countdown runs out: the room disintegrates the other team. */
  public tick(): 'strike' | undefined {
    if (this.phase === PHASE.READY || --this.ticks > 0) {
      return undefined;
    }
    if (this.phase === PHASE.ARMED) {
      [this.phase, this.ticks] = [PHASE.STRUCK, STATION.OUT];
      return 'strike';
    }
    if (this.phase === PHASE.STRUCK) {
      [this.phase, this.ticks] = [PHASE.COOL, STATION.COOL - STATION.OUT];
    } else {
      this.reset();
    }
    return undefined;
  }

  public wire(): StationState {
    return { phase: this.phase, team: this.team, left: Math.ceil(this.ticks / TICK_HZ) };
  }
}

const { METAL, STEEL, PAINT, GLASS, GRATE } = TEX;
const box = (
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  top: number,
  side = top,
  tint?: Vec3,
): Brush => ({ min: [x0, y0, z0], max: [x1, y1, z1], top, side, tint });

/**
 * The satellite's body: a cylinder standing round the hangar, its radius and its bottom and top over
 * the deck. As in the user's picture it is about twice as long as it is wide.
 */
export const HULL = { R: 44, LOW: -40, TOP: 130 };

/**
 * The rest of the satellite, which satellite.ts draws and the ghost brushes stop ships at: the
 * cannon's barrel (its radius as a share of the body's, its length under it), each wing (its boom
 * out from the wall, its four panels' length, height and gap, its height up the body as a share),
 * the cap's dome and the mast of its dish.
 */
export const PARTS = {
  BARREL: 0.68,
  GUN: 44,
  BOOM: 16,
  PANEL: 44,
  SPAN: 50,
  GAP: 2,
  WING: 0.54,
  DOME: 7,
  MAST: 16,
};

/**
 * The station over the point (x, Y, z), symmetric across z: a satellite after the user's picture, a
 * cylinder standing on its axis (HULL) wrapped in foil, solar wings each side, and under it the laser
 * cannon's aperture pointed down at the moon, all drawn by the client (satellite.ts). Through it a
 * hangar along z opens at both ends in the cylinder's wall, so each team's ship flies in from its own
 * side (40 m wide, 88 long, 11 m high at the mouths), the deck at Y; through a doorway in its east
 * wall the command room behind a sliding door, the console in its middle. The cylinder, the
 * cannon, the wings and the dish are solid and not drawn (ghost brushes, the round ones in slices of
 * 4 m), so a ship stops on what it sees. Returns the brushes, the StationDef and the door.
 */
export const station = (x: number, Y: number, z: number): [Brush[], StationDef, Door] => {
  const { R, LOW, TOP } = HULL;
  // The hangar runs out to the body's wall, flush at its middle, out past the curve at its corners.
  const [w, e, s, n] = [x - 24, x + 24, z - R, z + R];
  const grey: Vec3 = [0.78, 0.8, 0.84];
  const lit: Vec3 = [0.95, 0.55, 0.15];
  const { X0, X1, Z, H, STAIR0, STAIR1, STEPS, W, DAIS, GALLERY, SIDE } = COMMAND;
  const [rx0, rx1] = [x + X0, x + X1];
  const post: [Vec3, Vec3] = [
    [x + 37, Y + DAIS, z - 1.5],
    [x + 39, Y + DAIS + 1.1, z + 1.5],
  ];
  // The body's slices: whole under the deck and over the roof, round the hangar and the room between.
  const body: Brush[] = [];
  for (let a = x - R; a < x + R; a += 4) {
    const off = Math.max(Math.abs(a - x), Math.abs(a + 4 - x));
    const h = Math.sqrt(R * R - off * off);
    const slice = (y0: number, y1: number, z0: number, z1: number) =>
      z1 > z0 && body.push({ ...box(a, y0, z0, a + 4, y1, z1, METAL), ghost: true });
    slice(Y + LOW, Y - 2, z - h, z + h);
    // Round the command room the band is H + 2 high, round the hangar 18.
    const room = a >= e && a < rx1 + 1;
    const top = room ? Y + H + 2 : Y + 16;
    slice(top, Y + TOP, z - h, z + h);
    const [h0, h1] = a < e ? (a + 4 > w ? [s, n] : [z, z]) : room ? [z - Z - 1, z + Z + 1] : [z, z];
    slice(Y - 2, top, z - h, Math.min(h0, z + h));
    slice(Y - 2, top, Math.max(h1, z - h), z + h);
    // The cap's dome, a slice of its top.
    const d = Math.sqrt(Math.max(0, (0.75 * R) ** 2 - off * off));
    slice(Y + TOP, Y + TOP + PARTS.DOME - 2, z - d, z + d);
    // The cannon's barrel under the body, banded and flared past its radius.
    const B = PARTS.BARREL * R + 3;
    const g = Math.sqrt(Math.max(0, B * B - off * off));
    slice(Y + LOW - PARTS.GUN, Y + LOW, z - g, z + g);
  }
  // The wings: each panel row a thin wall, its boom a beam; the dish's mast and bowl a block.
  const mid = Y + LOW + (TOP - LOW) * PARTS.WING;
  const reach = PARTS.BOOM + 4 * (PARTS.PANEL + PARTS.GAP) + 3;
  for (const k of [-1, 1]) {
    const [a, b] = [z + k * R, z + k * (R + reach)];
    body.push(
      {
        ...box(x - 1.5, mid - 1.5, Math.min(a, b), x + 1.5, mid + 1.5, Math.max(a, b), METAL),
        ghost: true,
      },
      {
        ...box(
          x - 0.4,
          mid - PARTS.SPAN / 2,
          Math.min(a, b),
          x + 0.4,
          mid + PARTS.SPAN / 2,
          Math.max(a, b),
          METAL,
        ),
        ghost: true,
      },
    );
  }
  body.push({
    ...box(x - 25, Y + TOP + 3, z - 7, x - 7, Y + TOP + PARTS.MAST + 6, z + 7, METAL),
    ghost: true,
  });
  const door: [Vec3, Vec3] = [
    [e - 2.15, Y, z - 3],
    [e - 1.85, Y + 3.2, z + 3],
  ];
  return [
    [
      // The hangar: deck, roof, the west wall, the east one round its doorway, the mouths' lintels.
      box(w, Y - 2, s, e, Y, n, GRATE, METAL),
      box(w, Y + 14, s, e, Y + 16, n, METAL),
      box(w, Y, s, w + 4, Y + 14, n, PAINT, PAINT, grey),
      box(e - 4, Y, s, e, Y + 14, z - 3, PAINT, PAINT, grey),
      box(e - 4, Y, z + 3, e, Y + 14, n, PAINT, PAINT, grey),
      box(e - 4, Y + 3.2, z - 3, e, Y + 14, z + 3, PAINT, PAINT, grey),
      box(w + 4, Y + 11, s, e - 4, Y + 14, s + 4, STEEL, STEEL, lit),
      box(w + 4, Y + 11, n - 4, e - 4, Y + 14, n, STEEL, STEEL, lit),
      // The command room: floor, ceiling, its side walls, its west wall over the hangar's roof, the
      // window east (a ghost: space shows through, client/station/command.ts draws its frame).
      box(rx0, Y - 2, z - Z - 1, rx1 + 0.5, Y, z + Z + 1, METAL),
      box(rx0, Y + H, z - Z - 1, rx1 + 0.5, Y + H + 1, z + Z + 1, METAL),
      box(rx0, Y, z - Z - 1, rx1 + 0.5, Y + H, z - Z, PAINT, PAINT, grey),
      box(rx0, Y, z + Z, rx1 + 0.5, Y + H, z + Z + 1, PAINT, PAINT, grey),
      box(e - 2, Y + 14, z - Z, rx0, Y + H, z + Z, PAINT, PAINT, grey),
      { ...box(rx1, Y, z - Z, rx1 + 0.5, Y + H, z + Z, GLASS), ghost: true },
      // The steps, the dais and the galleries each side.
      ...Array.from({ length: STEPS }, (_, k) => {
        const run = (STAIR1 - STAIR0) / STEPS;
        return box(
          x + STAIR0 + run * k,
          Y,
          z - W,
          x + STAIR0 + run * (k + 1),
          Y + (DAIS * (k + 1)) / STEPS,
          z + W,
          METAL,
          PAINT,
          grey,
        );
      }),
      box(x + STAIR1, Y, z - Z, rx1, Y + DAIS, z + Z, METAL, PAINT, grey),
      box(x + GALLERY, Y, z - Z, x + STAIR1, Y + DAIS, z - SIDE, METAL, PAINT, grey),
      box(x + GALLERY, Y, z + SIDE, x + STAIR1, Y + DAIS, z + Z, METAL, PAINT, grey),
      // The console: a ghost with no tint (a tinted one is drawn as furniture on the moon, client/
      // moonbase/), drawn as a computer with its button (client/station/).
      { ...box(...post[0], ...post[1], STEEL), ghost: true },
      ...body,
    ],
    {
      post,
      deck: Y,
      hall: [
        [w, Y - 1, s],
        [rx1, Y + H, n],
      ],
      hull: [x, Y + LOW, z, Y + TOP],
      gun: [x, Y + LOW - PARTS.GUN, z],
    },
    { min: door[0], max: door[1] },
  ];
};
