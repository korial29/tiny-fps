// The plasma balls on screen. The own ones fly from the predicted shot at once, along the same
// line as the host's and stopped by the same walls; the host's copy of one only tells where it
// burst, when that is short of the wall (a body). The others' come from the snapshots and are
// drawn INTERP_DELAY in the past like the players, flying on at their speed (speedOf()) from the last place
// a snapshot gave. A ball is drawn from the muzzle that fired it and joins its true line in CATCH
// seconds. The katana's arcs of energy fly the same way, at ARC_SPEED, from the eye. A grenade of
// the rifle's launcher falls as it flies: the own one along the ticks the host's toss() gives it
// from the predicted launch, the others' on the arc of the last snapshot's place, direction and
// speed; it always ends in a burst. No DOM.
import {
  ARC_R,
  BOLT,
  DISK,
  DISK_RETURN,
  DISK_R,
  HARPOON,
  HARPOON_R,
  INTERP_DELAY,
  MISSILE_R,
  NADE,
  NADE_R,
  PLASMA_R,
  PLAYER_R,
  TICK_HZ,
} from '../shared/constants';
import { gravity, heightOf } from '../shared/physics';
import { disk, launch, lob, lobbed, speedOf, toss, wave } from '../shared/plasma';
import type { Ball, PlayerState } from '../shared/types';
import { ray } from '../shared/world';
import type { World } from '../shared/world';
import type { Orb } from './beams';
import type { Vec3 } from './mesh';

/** Metres of slack round a body for onBody(): the wire keeps a ball's place to 1/32 m. */
const SLACK = 0.1;

/**
 * Whether the burst ball `b` burst on the body of `p`, both as the same snapshot has them: its
 * centre within the body's cylinder grown by the ball's radius. A hit the host counts but takes no
 * health for yet (a laser round, a vehicle's bolt) is seen this way.
 */
export const onBody = (b: Ball, p: Pick<PlayerState, 'x' | 'y' | 'z' | 'mode'>): boolean => {
  const r =
    PLAYER_R +
    (b.arc
      ? ARC_R
      : b.power === DISK || b.power === DISK_RETURN
        ? DISK_R
        : b.power === HARPOON
          ? HARPOON_R
          : PLASMA_R) +
    SLACK;
  return (
    b.burst &&
    (b.x - p.x) ** 2 + (b.z - p.z) ** 2 <= r * r &&
    b.y >= p.y - SLACK &&
    b.y <= p.y + heightOf(p) + SLACK
  );
};

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
  /** An own grenade: its place at each tick from `t`, the last where it bursts. */
  path?: Vec3[];
  /** Another's grenade: its speed along `d` at `o`, m/s. */
  v?: number;
  /** A ship's missile: it flies straight, and bursts MISSILE_R wide. */
  missile?: boolean;
  returning?: boolean;
}

export interface Balls {
  /** The own player fired, or threw an arc with the katana: `p` is his state after the step, `now` the time of the step (ms). */
  fire(p: PlayerState, now: number, harpoon?: boolean, disc?: boolean): void;
  /** The balls of a snapshot received at `now` (ms); `me` is the own id. */
  snapshot(balls: Ball[], me: number, now: number): void;
  /**
   * The balls to draw at `now` (ms) and the places where one burst since the last frame. `muzzle`
   * gives the muzzle of a player's gun, where a new ball is first drawn.
   */
  frame(
    now: number,
    muzzle: (id: number) => Vec3 | undefined,
    discSound?: (kind: 'return' | 'catch', at: Vec3) => void,
  ): { orbs: Orb[]; bursts: [Vec3, number, number?][] };
}

const at = (b: { x: number; y: number; z: number }): Vec3 => [b.x, b.y, b.z];
/**
 * The key of a ball the host sends: its shooter and id, and apart for a vehicle's bolts and
 * missiles, which a driver's bolt count names (room.ts) and could meet the number of a shot of his
 * own gun: one of those, in flight or spent, would hide it.
 */
export const keyOf = (b: Ball): number =>
  ((b.by << 8) | b.id) + (b.power === BOLT || b.missile ? 1 << 16 : 0);
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export const createBalls = (world: World): Balls => {
  const live = new Map<number, Flight>();
  /** Own balls that ended here before the host's word of their burst came: it is not drawn twice. */
  const spent = new Set<number>();
  /** Disk sound cues discovered in snapshots, played by frame where the audio system lives. */
  const discSounds: { kind: 'return' | 'catch'; at: Vec3 }[] = [];

  return {
    fire(p, now, harpoon = false, discShot = false) {
      const b =
        p.wield && !discShot
          ? wave(p)
          : discShot
            ? disk(p)
            : lobbed(p)
              ? lob(p)
              : launch(p, 0, harpoon && !p.rifled);
      const [o, d]: Vec3[] = [at(b), [b.dx, b.dy, b.dz]];
      const key = (p.id << 8) | b.id;
      if (b.power === NADE) {
        // The whole arc, tick by tick as the host flies it, to the wall it bursts on.
        const path = [o];
        while (!b.burst) {
          toss(world, b, []);
          path.push(at(b));
        }
        spent.delete(key);
        live.set(key, {
          own: true,
          by: p.id,
          t0: now,
          o,
          t: now,
          d,
          pop: true,
          due: Infinity,
          power: NADE,
          path,
        });
        return;
      }
      // The wall it bursts on, as the host's fly() finds it.
      const r = ray(world, o, d, b.left, b.power === HARPOON ? HARPOON_R : PLASMA_R);
      spent.delete(key);
      live.set(key, {
        own: true,
        by: p.id,
        t0: now,
        o,
        t: now,
        d,
        ...(b.power === DISK ? {} : { end: o.map((v, i) => v + d[i] * r) as Vec3 }),
        pop: b.power !== DISK && r < b.left,
        due: Infinity,
        power: b.power ?? 1,
        arc: b.arc,
      });
    },

    snapshot(balls, me, now) {
      const keys = new Set<number>();
      for (const b of balls) {
        const key = keyOf(b);
        let f = live.get(key);
        keys.add(key);
        const returning = b.returning || b.power === DISK_RETURN;
        const own = b.by == me && (f?.own || spent.has(key));
        if (!f && !own) {
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
              missile: b.missile,
              returning: false,
            }),
          );
        }
        if (f && returning && !f.returning) {
          discSounds.push({ kind: 'return', at: at(b) });
        }
        if (f?.returning && b.burst) {
          discSounds.push({ kind: 'catch', at: at(b) });
          f.returning = false;
        }
        if (own) {
          if (f && (b.returning || b.power === DISK_RETURN)) {
            [f.o, f.t, f.d, f.power, f.returning] = [
              at(b),
              now,
              [b.dx, b.dy, b.dz],
              DISK_RETURN,
              true,
            ];
          }
          if (b.burst) {
            spent.delete(key);
            if (f?.path) {
              // It burst on a body, short of the wall: the arc is cut where it comes nearest.
              const gap = (q: Vec3) => Math.hypot(...q.map((c, i) => c - at(b)[i]));
              const n = f.path.reduce((m, q, i, l) => (gap(q) < gap(l[m]) ? i : m), 0);
              f.path = [...f.path.slice(0, n + 1), at(b)];
            } else if (f) {
              [f.end, f.pop] = [at(b), b.power !== DISK_RETURN];
              if (b.power === DISK_RETURN) {
                f.due = now;
                f.returning = false;
              }
            }
          }
          continue;
        }
        if (!f) {
          continue;
        }
        if (b.burst) {
          [f.end, f.pop, f.due] = [at(b), true, now];
        } else {
          [f.o, f.t, f.d, f.v, f.power, f.returning] = [
            at(b),
            now,
            [b.dx, b.dy, b.dz],
            b.v,
            b.power ?? 1,
            b.returning || b.power === DISK_RETURN,
          ];
        }
      }
      // A ball the host no longer sends without a burst has flown its range.
      for (const [key, f] of live) {
        if (!f.own && !keys.has(key) && f.due == Infinity) {
          f.due = now;
        }
      }
    },

    frame(now, muzzle, discSound) {
      const orbs: Orb[] = [];
      const bursts: [Vec3, number, number?][] = [];
      for (const cue of discSounds.splice(0)) {
        discSound?.(cue.kind, cue.at);
      }
      for (const [key, f] of live) {
        const t = f.own ? now : now - INTERP_DELAY;
        const nade = f.power === NADE;
        const dt = (t - f.t) / 1000;
        const s = ((t - f.t) * speedOf(f)) / 1000;
        const tick = Math.max(0, dt * TICK_HZ);
        const last = f.path ? f.path.length - 1 : 0;
        if (
          (f.path
            ? tick >= last
            : !nade &&
              !f.returning &&
              f.end &&
              s >= dot(f.end.map((v, i) => v - f.o[i]) as Vec3, f.d)) ||
          t >= f.due
        ) {
          if (f.pop) {
            const at = f.path ? f.path[last] : f.end!;
            // A missile's burst is MISSILE_R wide, as many times a grenade's.
            bursts.push(f.missile ? [at, f.power, MISSILE_R / NADE_R] : [at, f.power]);
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
        let p = f.o.map((v, i) => v + f.d[i] * s) as Vec3;
        let d = f.d;
        if (f.returning) {
          const target = muzzle(f.by);
          if (target) {
            const delta = target.map((v, i) => v - f.o[i]);
            const distance = Math.hypot(...delta) || 1;
            d = delta.map(v => v / distance) as Vec3;
            p = f.o.map((v, i) => v + d[i] * Math.min(distance, s)) as Vec3;
          }
        }
        if (nade) {
          // Along its ticks, or down the arc gravity gives from the last snapshot.
          const [a, b] = f.path
            ? [f.path[Math.floor(tick)], f.path[Math.floor(tick) + 1]]
            : [f.o, f.o];
          const [k, v, g] = [tick % 1, f.v ?? 0, f.missile ? 0 : gravity(world)];
          const to: Vec3 = f.path
            ? (b.map((c, i) => c - a[i]) as Vec3)
            : [f.d[0] * v, f.d[1] * v - g * dt, f.d[2] * v];
          const n = Math.hypot(...to) || 1;
          d = to.map(c => c / n) as Vec3;
          p = f.path
            ? (a.map((c, i) => c + to[i] * k) as Vec3)
            : [
                f.o[0] + f.d[0] * v * dt,
                f.o[1] + f.d[1] * v * dt - 0.5 * g * dt * dt,
                f.o[2] + f.d[2] * v * dt,
              ];
        }
        f.born ??= now;
        // An arc leaves the eye, not a muzzle.
        f.from ??= (!f.arc && muzzle(f.by)) || p;
        // Eased out of the muzzle onto the line.
        const k = Math.min(1, (now - f.born) / 1000 / CATCH);
        const from = f.from;
        const q = p.map((v, i) => from[i] + (v - from[i]) * k * (2 - k)) as Vec3;
        orbs.push({
          p: q,
          d,
          tail: Math.min(TRAIL, Math.hypot(...q.map((v, i) => v - from[i]))),
          power: f.power,
          arc: f.arc,
        });
      }
      return { orbs, bursts };
    },
  };
};
