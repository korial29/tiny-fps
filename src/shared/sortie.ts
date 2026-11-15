// A bot's errand to the orbital station (the user, 2026-11-14: the bots play the mission too): fly
// its team's ship up in front of the hangar's mouth on its own side, in, land, walk to the command
// post and press its button; stand guard there while its team's strike counts down; then fly the
// ship home and get out on the pad. The room picks the bot (Room.errands()); bot.ts asks errand()
// each tick. Pure, no DOM, no Node API.
import { forward, norm } from './physics';
import { SHIP } from './ship';
import { nearby } from './rover';
import { HULL, inside, reaches } from './station';
import type { StationDef } from './station';
import { KEY, MODE, NOBODY } from './types';
import type { PlayerState, Rover } from './types';
import type { Spawn } from './world';

type Vec3 = [number, number, number];
export type Intent = { keys: number; yaw: number; pitch: number };

/**
 * What the room asks of a bot: its team's ship and the pad it stands on, and `go` 'press' (arm the
 * mission, or cancel the enemy's strike), 'guard' (its team's strike counts down: stay at the post),
 * or nothing (the errand is over: back home).
 */
export interface Errand {
  def: StationDef;
  team: number;
  ship: Rover;
  home: Spawn;
  go?: 'press' | 'guard';
}

const { FORWARD, BACK, JUMP, CROUCH, SPRINT, USE } = KEY;

/**
 * The flight: metres out from the mouth where it lines up; how high over the deck it flies in, over a pad it starts down; the top speed it asks, the share of
 * the distance it slows to near a stop, the nose's error past which it does not thrust, the
 * fastest it climbs or sinks and the braking it counts on, how far under the cannon's muzzle it
 * comes down out there, and where it lands: east of the hangar's middle, toward the command room's
 * door, and from the station's middle along z.
 */
export const SORTIE = {
  OUT: 70,
  ABOVE: 5.5,
  PAD: 25,
  FAST: 70,
  EASE: 1,
  AIM: 0.5,
  CLIMB: 70,
  SETTLE: 10,
  CLEAR: 80,
  EAST: 6,
  LAND: 10,
};

const flat = (ax: number, az: number, bx: number, bz: number) =>
  Math.sqrt((bx - ax) ** 2 + (bz - az) ** 2);
const toward = (x0: number, z0: number, x1: number, z1: number) =>
  norm(Math.atan2(-(x1 - x0), -(z1 - z0)));
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** A team's way into the station: in front of its mouth (red's is the +z one), then down on the deck inside. */
export const approach = ({ hull: [cx, , cz], post }: StationDef, team: number): [Vec3, Vec3] => {
  const [s, x, y] = [team ? -1 : 1, cx + SORTIE.EAST, post[0][1] + SORTIE.ABOVE];
  return [
    [x, y, cz + s * (HULL.R + SORTIE.OUT)],
    [x, post[0][1] + SHIP.DROP + 0.3, cz + s * SORTIE.LAND],
  ];
};

/**
 * The keys and look that fly the ship `r` toward `to`: the nose on it, thrust while it points there
 * and the speed is under what it asks (all it can far away, easing to a stop when `stop`), the
 * brake past it, the lift to hold the height near it.
 */
export const steer = (r: Rover, to: Vec3, stop: boolean): Intent => {
  const [dx, dy, dz] = [to[0] - r.x, to[1] - r.y, to[2] - r.z];
  const h = Math.sqrt(dx * dx + dz * dz);
  const d = Math.sqrt(h * h + dy * dy) || 1e-6;
  const yaw = h > 2 ? toward(r.x, r.z, to[0], to[2]) : r.yaw;
  const pitch = clamp(Math.atan2(dy, Math.max(h, 1)), -1.1, 1.1);
  const v = (r.vx * dx + r.vy * dy + r.vz * dz) / d;
  const want = stop ? Math.min(SORTIE.FAST, d * SORTIE.EASE) : SORTIE.FAST;
  const aimed = Math.abs(norm(yaw - r.yaw + Math.PI) - Math.PI) < SORTIE.AIM || h < 2;
  let keys = 0;
  if (v > want + 2) {
    keys |= BACK;
  } else if (v < want && aimed && h > 2) {
    keys |= FORWARD | (d > 150 ? SPRINT : 0);
  }
  // The height by its speed: climb or sink toward a speed it can still brake from in the height to go.
  const vy = Math.sign(dy) * Math.min(SORTIE.CLIMB, Math.sqrt(2 * SORTIE.SETTLE * Math.abs(dy)));
  if (r.vy < vy - 0.7) {
    keys |= JUMP;
  } else if (r.vy > vy + 0.7) {
    keys |= CROUCH;
  }
  return { keys, yaw, pitch: h > 2 ? pitch : 0 };
};

/** A straight walk on a floor to (x, z): forward, turned to it; nothing within half a metre. */
const walk = (p: PlayerState, x: number, z: number): Intent | undefined =>
  flat(p.x, p.z, x, z) < 0.5
    ? undefined
    : {
        keys: FORWARD | (flat(p.x, p.z, x, z) > 3 ? SPRINT : 0),
        yaw: toward(p.x, p.z, x, z),
        pitch: 0,
      };

/** Where its feet press the button from: in front of the console's west side. */
const spot = ({ post: [lo, hi] }: StationDef): [number, number] => [
  lo[0] - 0.6,
  (lo[2] + hi[2]) / 2,
];

/**
 * A flight's points from where the ship `r` is. Up: in front of the team's mouth, then over the deck
 * inside. Home: out of the hangar by its own mouth (the other ship may be leaving by the other), or
 * straight out from the station on its side when near it, then straight down to under the cannon's
 * muzzle, clear of it all, then over the pad.
 */
const plan = (r: Rover, { def, home, go, team }: Errand): [Vec3, boolean][] => {
  const [a, b] = approach(def, team);
  if (go) {
    return inside(def, r.x, r.y, r.z)
      ? [[b, true]]
      : [
          [a, false],
          [b, true],
        ];
  }
  const [cx, , cz] = def.hull;
  const low = def.gun[1] - SORTIE.CLEAR;
  const over: Vec3 = [home[0], home[1] + SHIP.DROP + SORTIE.PAD, home[2]];
  const out: Vec3[] = [];
  if (inside(def, r.x, r.y, r.z)) {
    out.push(a);
  } else if (r.y > low && flat(r.x, r.z, cx, cz) < HULL.R + SORTIE.OUT - 10) {
    out.push([cx, r.y, cz + (r.z < cz ? -1 : 1) * (HULL.R + SORTIE.OUT)]);
  }
  const last = out.at(-1) ?? [r.x, r.y, r.z];
  if (last[1] > low) {
    out.push([last[0], low, last[2]]);
  }
  return [...out.map((p): [Vec3, boolean] => [p, false]), [over, true]];
};

/** The bot's own memory of an errand: the stage of its flight. */
export class Sortie {
  private stage = 0;
  private landed = 0;
  /** The errand its stages are of: a change of mind starts them again. */
  private going: Errand['go'] | null = null;
  /** The points of its flight, set when it starts: each a point and whether it stops there. */
  private route: [Vec3, boolean][] | undefined;
  /** Where it walks to on the ground to board, for its own way finding; none when it is not boarding. */
  public board: Vec3 | undefined;

  /**
   * The input of this tick for the bot `id` on `p` with errand `e`, or none: then it plays as usual
   * (and walks to `board` if set). `t` is its tick, for presses.
   */
  public think(id: number, p: PlayerState, e: Errand, t: number): Intent | undefined {
    const { def, ship, go } = e;
    const press = t & 1 ? USE : 0;
    this.board = undefined;
    if (p.mode === MODE.RIDE) {
      return ship.driver === id ? this.fly(ship, e, press) : undefined;
    }
    [this.stage, this.landed, this.route] = [0, 0, undefined];
    const [cx, , cz] = def.hull;
    if (inside(def, p.x, p.y, p.z)) {
      const [px, pz] = spot(def);
      const east = def.hall[0][0] + 44;
      if (go) {
        // Into the command room through its doorway, then to the console.
        const out = reaches(def, p)
          ? undefined
          : p.x < east && Math.abs(p.z - cz) > 2
            ? walk(p, east - 4, cz)
            : walk(p, px, pz);
        return (
          out ?? { keys: go === 'press' ? press : 0, yaw: toward(p.x, p.z, px + 1, pz), pitch: 0 }
        );
      }
      // Done: back out of the room, then to the ship and in.
      if (p.x > east) {
        return walk(p, east - 4, cz);
      }
      if (ship.driver === NOBODY && !ship.wreck && inside(def, ship.x, ship.y, ship.z)) {
        // To beside its nose, clear of the wings at its back (6.4 m out): along its east side, then in.
        const [fx, fz] = forward(ship.yaw);
        const [nx, nz] = [ship.x + fx * 3, ship.z + fz * 3];
        if (nearby(ship, p)) {
          return { keys: press, yaw: toward(p.x, p.z, ship.x, ship.z), pitch: 0 };
        }
        return Math.abs(p.z - nz) > 1 ? walk(p, ship.x + 8, nz) : walk(p, nx + 3.5, nz);
      }
      // No ship to go home in: out of the mouth on its own side, and down.
      return walk(p, cx, p.z > cz ? cz + HULL.R + 5 : cz - HULL.R - 5);
    }
    if (go === 'press' && ship.driver === NOBODY && !ship.wreck) {
      if (nearby(ship, p)) {
        return { keys: press, yaw: toward(p.x, p.z, ship.x, ship.z), pitch: 0 };
      }
      this.board = [ship.x, ship.y - SHIP.DROP, ship.z];
    }
    return undefined;
  }

  /**
   * Up to the station and in, or home: out of the hangar by the mouth ahead, to over the pad and
   * down. Landed at the end, out.
   */
  private fly(r: Rover, e: Errand, press: number): Intent {
    if (e.go !== this.going || !this.route) {
      [this.going, this.stage, this.landed, this.route] = [e.go, 0, 0, plan(r, e)];
    }
    const route = this.route;
    if (this.stage < route.length) {
      const [to, stop] = route[this.stage];
      const d = Math.hypot(to[0] - r.x, to[1] - r.y, to[2] - r.z);
      if (d < (stop ? 3 : 12) && (!stop || Math.hypot(r.vx, r.vy, r.vz) < 3)) {
        this.stage++;
      }
      return steer(r, to, stop);
    }
    // Down onto the deck or the pad, level, then out.
    this.landed = r.steer < 0 ? this.landed + 1 : 0;
    return { keys: this.landed > 8 ? press : CROUCH, yaw: r.yaw, pitch: 0 };
  }
}
