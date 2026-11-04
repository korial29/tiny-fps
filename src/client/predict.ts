// Client prediction and interpolation: no DOM, unit-tested.
// The own player runs ahead of the host: each local step applies the input with the shared
// physics and keeps it until the host acks it. On a snapshot the own player is reset to the
// host's state and the unacked inputs are replayed on top. Other players are drawn
// INTERP_DELAY in the past, interpolated between the two snapshots around that time.
import { INTERP_DELAY } from '../shared/constants';
import { TAU, move, norm } from '../shared/physics';
import { onWire } from '../shared/protocol';
import { body, fire } from '../shared/shoot';
import type {
  Bullet,
  Input,
  Level,
  Monster,
  PlayerState,
  Shot,
  SnapPlayer,
  Snapshot,
} from '../shared/types';

export interface Predictor {
  /** The own player id, from the roster. Snapshots before it are only used for the others. */
  you(id: number): void;
  /**
   * One local step: gives the input the next seq, rounds its yaw and pitch to the wire, moves the
   * own player with it, keeps it for replay, and returns it for the caller to send (the very
   * values predicted with, which the host reads back). Until the own player is known (no snapshot
   * shows it yet) it only numbers and keeps the input: the first snapshot replays it.
   * With `now` (ms, performance.now()) the input carries the view tick the others are drawn at.
   */
  step(i: Omit<Input, 'seq' | 'view'>, now?: number): Input;
  /**
   * The shot the last step fired, resolved with fire() against others(now) of that step; undefined
   * when it did not fire. Replays on a snapshot never fire again.
   */
  shot(): Shot | undefined;
  /** A decoded snapshot, received at `now` (ms, performance.now()). */
  snapshot(s: Snapshot, now: number): void;
  /**
   * The own player, eased between the state before and after the last step by alpha in [0, 1]
   * (the share of a step elapsed since it), so the camera moves smoothly at any frame rate.
   * Undefined until a snapshot shows the own player.
   */
  me(alpha: number): PlayerState | undefined;
  /** The other players at now - INTERP_DELAY; a player missing from the latest snapshot is gone. */
  others(now: number): PlayerState[];
  /**
   * The living monsters at now - INTERP_DELAY, interpolated like others() (yaw along the shortest
   * arc); a monster missing from the latest snapshot is gone.
   */
  monsters(now: number): Monster[];
  /** The bullets in flight at now - INTERP_DELAY, interpolated the same way. */
  bullets(now: number): Bullet[];
}

/** Unacked inputs kept at most (2 s at 60 Hz): a stalled host does not grow the list. */
const MAX_PENDING = 120;
/** Snapshots kept for interpolation (about 0.5 s at 30 Hz). */
const MAX_SNAPS = 16;

const state = ({
  id,
  x,
  y,
  z,
  vy,
  yaw,
  pitch,
  ground,
  cool,
}: SnapPlayer | PlayerState): PlayerState => ({ id, x, y, z, vy, yaw, pitch, ground, cool });

/** Whether the host's ack covers seq, on the u16 circle: seq is at most half a turn behind it. */
const acked = (seq: number, ack: number): boolean => ((ack - seq) & 0xffff) < 0x8000;

/** a to b by t, positions and pitch linearly, yaw along the shortest arc. */
const lerp = (a: PlayerState, b: PlayerState, t: number): PlayerState => {
  const l = (u: number, v: number): number => u + (v - u) * t;
  const arc = ((((b.yaw - a.yaw + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
  return {
    ...b,
    x: l(a.x, b.x),
    y: l(a.y, b.y),
    z: l(a.z, b.z),
    yaw: norm(a.yaw + arc * t),
    pitch: l(a.pitch, b.pitch),
  };
};

export const createPredictor = (lvl: Level): Predictor => {
  let id: number | undefined;
  let seq = 0;
  let pending: Input[] = [];
  /** The own player after the last step, and before it. */
  let own: PlayerState | undefined;
  let prev: PlayerState | undefined;
  let shot: Shot | undefined;
  const snaps: { t: number; s: Snapshot }[] = [];

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
    you: n => {
      id = n;
    },

    step: (i, now) => {
      const input = onWire({ ...i, seq, view: now === undefined ? undefined : view(now) });
      shot = undefined;
      seq = (seq + 1) & 0xffff;
      pending.push(input);
      if (pending.length > MAX_PENDING) {
        pending.shift();
      }
      if (own) {
        prev = state(own);
        if (move(own, input, lvl)) {
          // Without a clock, the others as of the newest snapshot.
          shot = fire(lvl, own, input.seq, others(now ?? Infinity).map(body));
        }
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
      pending = pending.filter(i => !acked(i.seq, me.ack));
      own = state(me);
      prev = state(own);
      pending.forEach((i, k) => {
        if (k === pending.length - 1) {
          prev = state(own!);
        }
        move(own!, i, lvl);
      });
    },

    monsters: () => [],

    bullets: () => [],

    shot: () => shot,

    me: alpha => (own && prev ? lerp(prev, own, Math.max(0, Math.min(1, alpha))) : undefined),

    others,
  };
};
