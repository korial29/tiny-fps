// Client prediction and interpolation: no DOM, unit-tested.
// The own player runs ahead of the host: each local step applies the input with the shared
// physics and keeps it until the host acks it. On a snapshot the own player is reset to the
// host's state and the unacked inputs are replayed on top. Other players are drawn
// INTERP_DELAY in the past, interpolated between the two snapshots around that time.
import { INTERP_DELAY } from '../shared/constants';
import { step } from '../shared/gun';
import { TAU, norm } from '../shared/physics';
import { onWire } from '../shared/protocol';
import type { Input, PlayerState, SnapPlayer, Snapshot } from '../shared/types';
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
   * Undefined until a snapshot shows the own player.
   */
  me(alpha: number): PlayerState | undefined;
  /** The other players at now - INTERP_DELAY; a player missing from the latest snapshot is gone. */
  others(now: number): PlayerState[];
}

/** Unacked inputs kept at most (2 s at 60 Hz): a stalled host does not grow the list. */
const MAX_PENDING = 120;
/** Snapshots kept for interpolation (about 0.5 s at 30 Hz). */
const MAX_SNAPS = 16;

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
      if (own) {
        prev = state(own);
        step(own, input, world, team, armed);
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
      armed = !s.over;
      pending = pending.filter(i => !acked(i.seq, me.ack));
      own = state(me);
      prev = state(own);
      pending.forEach((i, k) => {
        if (k === pending.length - 1) {
          prev = state(own!);
        }
        step(own!, i, world, team, armed);
      });
    },

    events: () => {
      const out = { ev, fall };
      ev = fall = 0;
      return out;
    },

    me: alpha => (own && prev ? lerp(prev, own, Math.max(0, Math.min(1, alpha))) : undefined),

    others,
  };
};
