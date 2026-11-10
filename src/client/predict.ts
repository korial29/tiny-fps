// Client prediction and interpolation: no DOM, unit-tested.
// The own player runs ahead of the host: each local step applies the input with the shared
// physics and keeps it until the host acks it. On a snapshot the own player is reset to the
// host's state and the unacked inputs are replayed on top. Other players are drawn
// INTERP_DELAY in the past, interpolated between the two snapshots around that time.
// A rover the own player drives is predicted with him: ride() per input, as the host runs it. The
// other rovers are interpolated like the other players, and a rider is drawn on the seat of his.
// The rovers his steps meet (the bodies he walks into, the fleet the predicted ones stop on) are
// the latest snapshot's, with the predicted ones in their place: exact while they stand still.
import { INTERP_DELAY, TICK_HZ } from '../shared/constants';
import { step } from '../shared/gun';
import { TAU, norm, respawn } from '../shared/physics';
import { onWire } from '../shared/protocol';
import { drive, hull, park, ride, seat } from '../shared/rover';
import { MODE, NOBODY } from '../shared/types';
import type { Input, PlayerState, Rover, SnapPlayer, Snapshot } from '../shared/types';
import type { World } from '../shared/world';

export interface Predictor {
  /**
   * The own player id and team, from the roster. Snapshots before it are only used for the others.
   * The team picks the spawn a fall puts the player back at.
   */
  you(id: number, team?: number): void;
  /**
   * One local step: gives the input the next seq, rounds its yaw and pitch to the wire, moves the
   * own player with it, keeps it for replay, and returns it for the caller to send (the very
   * values predicted with, which the host reads back). Until the own player is known (no snapshot
   * shows it yet) it only numbers and keeps the input: the first snapshot replays it.
   * With `now` (ms, performance.now()) the input carries the view tick the others are drawn at.
   */
  step(i: Omit<Input, 'seq' | 'view'>, now?: number): Input;
  /** A decoded snapshot, received at `now` (ms, performance.now()). */
  snapshot(s: Snapshot, now: number): void;
  /**
   * What happened in the own player's live steps since the last call: the EV bits of every one of
   * them or-ed together, and the fastest landing. Replays after a snapshot do not count: a move is
   * reported once, when it is first predicted. For the camera, the body and the sounds.
   */
  events(): { ev: number; fall: number };
  /**
   * The own player, eased between the state before and after the last step by alpha in [0, 1]
   * (the share of a step elapsed since it), so the camera moves smoothly at any frame rate.
   * Undefined until a snapshot shows the own player. Seated, his body is on the seat of the rover
   * as rovers() draws it on the same frame: the predicted one at the wheel, the interpolated one
   * beside it (at the time of the last step plus alpha of a step).
   */
  me(alpha: number): PlayerState | undefined;
  /** The other players at now - INTERP_DELAY; a player missing from the latest snapshot is gone. */
  others(now: number): PlayerState[];
  /**
   * The map's rovers, in the order of WorldDef.rovers: the one the own player drives predicted and
   * eased by alpha like me(), the others at now - INTERP_DELAY. Empty on a map without rovers.
   * The one he has just left rolls on as predicted until the snapshots' one, which rolls the same
   * way a lag behind, has caught up with it.
   */
  rovers(now: number, alpha: number): Rover[];
  /** The rover the own player is seated in (its index) and his seat (0 the driver's), or undefined on foot. */
  riding(): { rover: number; seat: 0 | 1 } | undefined;
}

/** Unacked inputs kept at most (2 s at 60 Hz): a stalled host does not grow the list. */
const MAX_PENDING = 120;
/** Snapshots kept for interpolation (about 0.5 s at 30 Hz). */
const MAX_SNAPS = 16;
/**
 * A rover the own player got out of is drawn as predicted, rolling on, until the snapshots' one is
 * within GHOST_NEAR m of it or GHOST_MS have passed. One that will not get there (the host took
 * him off the wheel, someone else drives it now) is eased to the snapshots' over ROVER_BLEND ms.
 */
export const ROVER_BLEND = 300;
const GHOST_MS = 4000;
const GHOST_NEAR = 0.05;
const STEP = 1000 / TICK_HZ;

type Point = { x: number; y: number; z: number };

/** A copy of the player without the ack and the tackler a snapshot adds. */
const state = (s: SnapPlayer | PlayerState): PlayerState => {
  const p: PlayerState & { ack?: number; by?: number } = { ...s };
  delete p.ack;
  delete p.by;
  return p;
};

/** The point a share t of the way from a to b. */
const mid = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t,
});

/** The angle a share t of the way from a to b along the shortest arc. */
const turn = (a: number, b: number, t: number): number =>
  norm(a + (((((b - a + Math.PI) % TAU) + TAU) % TAU) - Math.PI) * t);

/** Whether the host's ack covers seq, on the u16 circle: seq is at most half a turn behind it. */
const acked = (seq: number, ack: number): boolean => ((ack - seq) & 0xffff) < 0x8000;

/** a to b by t, positions and pitch linearly, yaw along the shortest arc. */
const lerp = (a: PlayerState, b: PlayerState, t: number): PlayerState => ({
  ...b,
  ...mid(a, b, t),
  yaw: turn(a.yaw, b.yaw, t),
  pitch: a.pitch + (b.pitch - a.pitch) * t,
});

/** The rover a share t of the way from a to b: b itself from 1 on, the seats b's. */
const mix = (a: Rover, b: Rover, t: number): Rover => {
  const out = { ...b };
  if (t < 1) {
    for (const k of 'x y z vx vy vz pitch roll wy wp wr steer'.split(' ') as 'x'[]) {
      out[k] = a[k] + (b[k] - a[k]) * t;
    }
    out.yaw = turn(a.yaw, b.yaw, t);
  }
  return out;
};

export const createPredictor = (world: World): Predictor => {
  let id: number | undefined;
  let team = 0;
  let seq = 0;
  let pending: Input[] = [];
  /** The own player after the last step, and before it. */
  let own: PlayerState | undefined;
  let prev: PlayerState | undefined;
  const snaps: { t: number; s: Snapshot }[] = [];
  let ev = 0;
  let fall = 0;
  /** The match is on (the last snapshot): the gun works. */
  let armed = true;
  /** The rover the own player drives, after the last step and before it, and its index. */
  let car: Rover | undefined;
  let carPrev: Rover | undefined;
  let carK = 0;
  /** The rover he has just left, coasting on as predicted, and when he left it. */
  let ghost: { k: number; r: Rover; prev: Rover; t: number; end?: number } | undefined;
  /** The time of the last step, or of the last snapshot when steps carry none. */
  let clock = 0;
  let timed = false;

  /** The map's rovers as the own steps meet them: the latest snapshot's, the predicted ones instead. */
  const fleet = (): Rover[] =>
    (snaps.at(-1)?.s.rovers ?? []).map((r, k) =>
      car && k === carK ? car : ghost?.k === k ? ghost.r : r,
    );

  /** One input of the own player, as the host applies it: at the wheel the rover's step, else his own. */
  const advance = (i: Input): void => {
    if (car && own!.mode === MODE.RIDE && car.driver === id) {
      if (ride(own!, car, i, world, team, fleet())) {
        // Under the kill floor: the host puts him at a spawn and parks the rover.
        if (car.driver === id) {
          respawn(own!, world, team);
        }
        car = park(world)[carK];
      }
    } else {
      step(own!, i, world, team, armed, fleet().map(hull));
    }
  };
  const driving = (): boolean => !!car && own?.mode === MODE.RIDE && car.driver === id;
  /** The predicted rover is his no more: it coasts on as a ghost from `t`, eased out from `end` if given. */
  const drop = (t: number, end?: number): void => {
    if (car && !driving()) {
      ghost = { k: carK, r: car, prev: carPrev ?? car, t, end };
      car = carPrev = undefined;
    }
  };

  /**
   * The snapshots around the time the others are drawn at, and how far between them (0 to 1). The
   * newest one at or before it, and the next; before the first one or after the last, both are
   * the same snapshot.
   */
  const around = (now: number) => {
    const t = now - INTERP_DELAY;
    let k = 0;
    while (k + 1 < snaps.length && snaps[k + 1].t <= t) {
      k++;
    }
    const a = snaps[k];
    const b = snaps[k + 1] ?? a;
    return { a, b, u: b.t > a.t ? Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t))) : 0 };
  };

  /** The host tick the others are drawn at, fractional, in [0, 65536). */
  const view = (now: number): number | undefined => {
    if (!snaps.length) {
      return undefined;
    }
    const { a, b, u } = around(now);
    return (a.s.tick + ((b.s.tick - a.s.tick) & 0xffff) * u) % 0x10000;
  };

  const others = (now: number): PlayerState[] => {
    const last = snaps.at(-1);
    if (!last) {
      return [];
    }
    const { a, b, u } = around(now);
    return last.s.players
      .filter(p => p.id !== id)
      .map(p => {
        const pa = a.s.players.find(q => q.id === p.id);
        const pb = b.s.players.find(q => q.id === p.id);
        return pa && pb ? lerp(state(pa), state(pb), u) : state(pb ?? pa ?? p);
      });
  };

  const rovers = (now: number, alpha: number): Rover[] => {
    const last = snaps.at(-1);
    if (!last?.s.rovers) {
      return [];
    }
    const { a, b, u } = around(now);
    const t = Math.max(0, Math.min(1, alpha));
    return last.s.rovers.map((r, k) => {
      if (car && carPrev && k === carK) {
        return mix(carPrev, car, t);
      }
      const [ra, rb] = [a.s.rovers?.[k], b.s.rovers?.[k]];
      const drawn = ra && rb ? mix(ra, rb, u) : { ...(rb ?? ra ?? r) };
      if (ghost?.k !== k) {
        return drawn;
      }
      const g = mix(ghost.prev, ghost.r, t);
      if (ghost.end === undefined) {
        const near = (g.x - drawn.x) ** 2 + (g.y - drawn.y) ** 2 + (g.z - drawn.z) ** 2;
        if (near < GHOST_NEAR ** 2) {
          ghost = undefined;
          return drawn;
        }
        if ((drawn.driver === NOBODY || drawn.driver === id) && now - ghost.t < GHOST_MS) {
          return { ...g, driver: NOBODY, rider: drawn.rider };
        }
        ghost.end = now;
      }
      const w = (now - ghost.end) / ROVER_BLEND;
      if (w >= 1) {
        ghost = undefined;
      }
      return mix(g, drawn, Math.max(0, w));
    });
  };

  const riding = (): { rover: number; seat: 0 | 1 } | undefined => {
    if (own?.mode !== MODE.RIDE) {
      return undefined;
    }
    if (driving()) {
      return { rover: carK, seat: 0 };
    }
    const k = snaps.at(-1)?.s.rovers?.findIndex(r => r.rider === id) ?? -1;
    return k < 0 ? undefined : { rover: k, seat: 1 };
  };

  return {
    you: (n, t = 0) => {
      [id, team] = [n, t];
    },

    step: (i, now) => {
      const input = onWire({ ...i, seq, view: now === undefined ? undefined : view(now) });
      seq = (seq + 1) & 0xffff;
      pending.push(input);
      if (pending.length > MAX_PENDING) {
        pending.shift();
      }
      [clock, timed] = [now ?? clock, timed || now !== undefined];
      if (ghost) {
        // The rover he left rolls on with nobody at the wheel, as the host's tick rolls it.
        ghost.prev = { ...ghost.r };
        drive(ghost.r, undefined, world, fleet());
      }
      if (own) {
        prev = state(own);
        carPrev = car && { ...car };
        advance(input);
        drop(clock);
        ev |= own.ev;
        fall = Math.max(fall, own.fall);
      }
      return input;
    },

    snapshot: (s, now) => {
      snaps.push({ t: now, s });
      if (snaps.length > MAX_SNAPS) {
        snaps.shift();
      }
      const me = s.players.find(p => p.id === id);
      if (!me) {
        return;
      }
      clock = timed ? clock : now;
      armed = !s.over;
      pending = pending.filter(i => !acked(i.seq, me.ack));
      const was = car;
      own = state(me);
      prev = state(own);
      // The rover he drives is reset with him and replayed with him.
      carK = s.rovers?.findIndex(r => r.driver === id) ?? -1;
      car = me.mode === MODE.RIDE && carK >= 0 ? { ...s.rovers![carK] } : undefined;
      carPrev = car && { ...car };
      pending.forEach((i, k) => {
        if (k === pending.length - 1) {
          prev = state(own!);
          carPrev = car && { ...car };
        }
        advance(i);
      });
      if (!driving()) {
        // Off the wheel in the replay as in the live step that made the ghost; or the host took
        // him off it, and the rover he was predicting is the ghost.
        if (was && !ghost) {
          [car, carPrev] = [was, was];
          drop(clock, clock);
        }
        car = carPrev = undefined;
      } else {
        ghost = undefined;
      }
    },

    events: () => {
      const out = { ev, fall };
      ev = fall = 0;
      return out;
    },

    me: alpha => {
      if (!own || !prev) {
        return undefined;
      }
      const t = Math.max(0, Math.min(1, alpha));
      const p = lerp(prev, own, t);
      const at = riding();
      const r = at && rovers(clock + t * STEP, t)[at.rover];
      if (at && r && prev.mode === MODE.RIDE) {
        seat(p, r, at.seat);
      }
      return p;
    },

    others,
    rovers,
    riding,
  };
};
