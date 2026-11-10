// The plasma balls on screen. The own ones fly from the predicted shot at once, along the same
// line as the host's and stopped by the same walls; the host's copy of one only tells where it
// burst, when that is short of the wall (a body). The others' come from the snapshots and are
// drawn INTERP_DELAY in the past like the players, flying on at PLASMA_SPEED from the last place
// a snapshot gave. A ball is drawn from the muzzle that fired it and joins its true line in CATCH
// seconds. The katana's arcs of energy fly the same way, at ARC_SPEED, from the eye. No DOM.
import {
  ARC_SPEED,
  BOLT,
  BOLT_SPEED,
  INTERP_DELAY,
  PLASMA_R,
  PLASMA_SPEED,
} from '../shared/constants';
import { launch, wave } from '../shared/plasma';
import type { Ball, PlayerState } from '../shared/types';
import { ray } from '../shared/world';
import type { World } from '../shared/world';
import type { Orb } from './beams';
import type { Vec3 } from './mesh';

/** Seconds a ball takes to come from the muzzle onto its line, and the metres of its trail. */
export const CATCH = 0.12;
export const TRAIL = 1.2;

/** A ball in flight: at `o` at the time `t` (ms), going `d`, until `end`. */
interface Flight {
  own: boolean;
  by: number;
  /** The time it was fired, or first sent: it is not drawn before. */
  t0: number;
  o: Vec3;
  t: number;
  d: Vec3;
  /** Where it stops, once known (always for an own ball: the wall or the range), and whether it bursts there. */
  end?: Vec3;
  pop: boolean;
  /** The time, as drawn, by which it is over whatever its place says: the snapshot that ended it. */
  due: number;
  /** The muzzle it is drawn from, and the time it was first drawn. */
  from?: Vec3;
  born?: number;
  /** Its strength (Ball.power). */
  power: number;
  /** An arc of energy: the CUT that threw it (Ball.arc). */
  arc?: number;
}

export interface Balls {
  /** The own player fired, or threw an arc with the katana: `p` is his state after the step, `now` the time of the step (ms). */
  fire(p: PlayerState, now: number): void;
  /** The balls of a snapshot received at `now` (ms); `me` is the own id. */
  snapshot(balls: Ball[], me: number, now: number): void;
  /**
   * The balls to draw at `now` (ms) and the places where one burst since the last frame. `muzzle`
   * gives the muzzle of a player's gun, where a new ball is first drawn.
   */
  frame(
    now: number,
    muzzle: (id: number) => Vec3 | undefined,
  ): { orbs: Orb[]; bursts: [Vec3, number][] };
}

const at = (b: { x: number; y: number; z: number }): Vec3 => [b.x, b.y, b.z];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export const createBalls = (world: World): Balls => {
  const live = new Map<number, Flight>();
  /** Own balls that ended here before the host's word of their burst came: it is not drawn twice. */
  const spent = new Set<number>();

  return {
    fire(p, now) {
      const b = p.wield ? wave(p) : launch(p);
      const [o, d]: Vec3[] = [at(b), [b.dx, b.dy, b.dz]];
      // The wall it bursts on, as the host's fly() finds it.
      const r = ray(world, o, d, b.left, PLASMA_R);
      const key = (p.id << 8) | b.id;
      spent.delete(key);
      live.set(key, {
        own: true,
        by: p.id,
        t0: now,
        o,
        t: now,
        d,
        end: o.map((v, i) => v + d[i] * r) as Vec3,
        pop: r < b.left,
        due: Infinity,
        power: b.power ?? 1,
        arc: b.arc,
      });
    },

    snapshot(balls, me, now) {
      const keys = new Set<number>();
      for (const b of balls) {
        const key = (b.by << 8) | b.id;
        let f = live.get(key);
        keys.add(key);
        if (b.by == me && (f?.own || spent.has(key))) {
          if (b.burst) {
            spent.delete(key);
            if (f) {
              [f.end, f.pop] = [at(b), true];
            }
          }
          continue;
        }
        if (!f) {
          live.set(
            key,
            (f = {
              own: false,
              by: b.by,
              t0: now,
              o: at(b),
              t: now,
              d: [0, 0, 0],
              pop: false,
              due: Infinity,
              power: b.power ?? 1,
              arc: b.arc,
            }),
          );
        }
        if (b.burst) {
          [f.end, f.pop, f.due] = [at(b), true, now];
        } else {
          [f.o, f.t, f.d] = [at(b), now, [b.dx, b.dy, b.dz]];
        }
      }
      // A ball the host no longer sends without a burst has flown its range.
      for (const [key, f] of live) {
        if (!f.own && !keys.has(key) && f.due == Infinity) {
          f.due = now;
        }
      }
    },

    frame(now, muzzle) {
      const orbs: Orb[] = [];
      const bursts: [Vec3, number][] = [];
      for (const [key, f] of live) {
        const t = f.own ? now : now - INTERP_DELAY;
        const s =
          ((t - f.t) * (f.arc ? ARC_SPEED : f.power === BOLT ? BOLT_SPEED : PLASMA_SPEED)) / 1000;
        if ((f.end && s >= dot(f.end.map((v, i) => v - f.o[i]) as Vec3, f.d)) || t >= f.due) {
          if (f.pop) {
            bursts.push([f.end!, f.power]);
          }
          if (f.own) {
            spent.add(key);
          }
          live.delete(key);
          continue;
        }
        if (t < f.t0) {
          // Not fired yet, as the others are drawn.
          continue;
        }
        const p = f.o.map((v, i) => v + f.d[i] * s) as Vec3;
        f.born ??= now;
        // An arc leaves the eye, not a muzzle.
        f.from ??= (!f.arc && muzzle(f.by)) || p;
        // Eased out of the muzzle onto the line.
        const k = Math.min(1, (now - f.born) / 1000 / CATCH);
        const from = f.from;
        const q = p.map((v, i) => from[i] + (v - from[i]) * k * (2 - k)) as Vec3;
        orbs.push({
          p: q,
          d: f.d,
          tail: Math.min(TRAIL, Math.hypot(...q.map((v, i) => v - from[i]))),
          power: f.power,
          arc: f.arc,
        });
      }
      return { orbs, bursts };
    },
  };
};
