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

/** The hangar and the command room, each [min, max]: shut but for the hangar's mouths (station()). */
export const rooms = ({ hull: [x, , z], post: [[, Y]] }: StationDef): [Vec3, Vec3][] => [
  [
    [x - 24, Y, z - HULL.R],
    [x + 24, Y + 14, z + HULL.R],
  ],
  [
    [x + 24, Y, z - 10],
    [x + 40, Y + 4, z + 10],
  ],
];

/** The hangar's two mouths, between its side walls and under the lintels: four corners each. */
export const mouths = ({ hull: [x, , z], post: [[, Y]] }: StationDef): Vec3[][] =>
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
  WING: 0.45,
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
  const post: [Vec3, Vec3] = [
    [x + 30.5, Y, z - 1.5],
    [x + 32.5, Y + 1.1, z + 1.5],
  ];
  // The body's slices: whole under the deck and over the roof, round the hangar and the room between.
  const body: Brush[] = [];
  for (let a = x - R; a < x + R; a += 4) {
    const off = Math.max(Math.abs(a - x), Math.abs(a + 4 - x));
    const h = Math.sqrt(R * R - off * off);
    const slice = (y0: number, y1: number, z0: number, z1: number) =>
      z1 > z0 && body.push({ ...box(a, y0, z0, a + 4, y1, z1, METAL), ghost: true });
    slice(Y + LOW, Y - 2, z - h, z + h);
    slice(Y + 16, Y + TOP, z - h, z + h);
    const [h0, h1] = a < e ? (a + 4 > w ? [s, n] : [z, z]) : a < x + 40 ? [z - 10, z + 10] : [z, z];
    slice(Y - 2, Y + 16, z - h, Math.min(h0, z + h));
    slice(Y - 2, Y + 16, Math.max(h1, z - h), z + h);
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
    const [a, b] = [x + k * R, x + k * (R + reach)];
    body.push(
      {
        ...box(Math.min(a, b), mid - 1.5, z - 1.5, Math.max(a, b), mid + 1.5, z + 1.5, METAL),
        ghost: true,
      },
      {
        ...box(
          Math.min(a, b),
          mid - PARTS.SPAN / 2,
          z - 0.4,
          Math.max(a, b),
          mid + PARTS.SPAN / 2,
          z + 0.4,
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
      // The command room, its window east, and the console.
      box(e, Y - 2, z - 10, x + 40, Y, z + 10, METAL),
      box(e, Y + 4, z - 10, x + 40, Y + 5, z + 10, METAL),
      box(e, Y, z - 10, x + 40, Y + 4, z - 8, PAINT, PAINT, grey),
      box(e, Y, z + 8, x + 40, Y + 4, z + 10, PAINT, PAINT, grey),
      box(x + 38, Y, z - 8, x + 40, Y + 4, z + 8, GLASS),
      box(...post[0], ...post[1], STEEL, STEEL, lit),
      ...body,
    ],
    {
      post,
      hall: [
        [w, Y - 1, s],
        [x + 40, Y + 16, n],
      ],
      hull: [x, Y + LOW, z, Y + TOP],
      gun: [x, Y + LOW - PARTS.GUN, z],
    },
    { min: door[0], max: door[1] },
  ];
};
