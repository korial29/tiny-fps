// The sounds of movement. The own player's come from the events of its live steps; the others'
// events are not on the wire, so their landings are read off the motion they are drawn with. A
// footstep sounds as a drawn foot is set down (Gait.steps), the own body's or a runner's, so the
// sound goes with the legs. No DOM, unit-tested against a fake Audio.
import { speedOf, sprinting } from '../shared/physics';
import { ROVER } from '../shared/rover';
import { SHIP } from '../shared/ship';
import { EV, KEY, MODE } from '../shared/types';
import type { PlayerState, Rover } from '../shared/types';
import type { Audio, Loop } from './audio';
import type { Hit } from './effects';
import type { Vec3 } from './mesh';
import { SOUND } from './sfx';

export interface Foley {
  /** The own player as drawn (undefined before the first snapshot), what its live steps did, and its body's footsteps so far. */
  me(p: PlayerState | undefined, hit: Hit, steps: number): void;
  /** The other players as drawn and their runners' footsteps so far: their steps and landings, at their position. */
  others(ps: PlayerState[], steps: (id: number) => number | undefined): void;
  /**
   * The rover the own player sits in, as drawn (undefined on foot), `dt` seconds after the last
   * call, and the keys he holds at its wheel (0 for the rider): the engine, the skid, the landings.
   */
  rover(r: Rover | undefined, dt: number, keys?: number): void;
  /**
   * The ship the own player flies, as drawn (undefined otherwise), `dt` seconds after the last
   * call, and the keys he holds at its stick: the engines, and a crash.
   */
  ship(r: Rover | undefined, dt: number, keys?: number): void;
  /**
   * The own player's breath in his space helmet, `dt` seconds after the last call: in and out,
   * quicker and louder the harder he has been moving lately. None when down or without a player.
   */
  breathe(p: PlayerState | undefined, dt: number): void;
}

/** A breath's cycle at rest and at the hardest effort (s), and where in it he breathes out. */
export const BREATH = [3.8, 1.5];
const OUT_AT = 0.42;
/** Seconds the effort takes to settle on a new pace: a sprint is still in the breath after it. */
const WIND_UP = 1.5;
const CALM_DOWN = 6;

/** A fall slower than this (m/s) makes no sound on the others. */
const SOFT = 3;

/** The rover: a sideways slide from this speed (m/s) skids, and is at its loudest this much over it. */
export const SKID_FROM = 2.5;
const SKID_SPAN = 8;
/**
 * A landing: the fall speeds up by at least FALL (m/s²) for AIR seconds, then the body is stopped
 * harder than STOP (m/s²) from more than SOFT_THUD (m/s) down. Rolling over a crest does neither.
 */
const FALL = 2;
const AIR = 0.3;
const STOP = 8;
const SOFT_THUD = 2;

const clamp = (v: number, lo = 0, hi = 1) => Math.min(Math.max(v, lo), hi);

export const createFoley = (a: Audio): Foley => {
  const wind = a.loop(SOUND.WIND);
  const scrape = a.loop(SOUND.SCRAPE);
  /** Footfalls of the own player so far. */
  let feet = 0;
  const seen = new Map<number, { p: PlayerState; steps?: number }>();
  let engine: Loop | undefined;
  let skid: Loop | undefined;
  let jet: Loop | undefined;
  /** The ship at the last call. */
  let flown: Rover | undefined;
  /** The rover at the last call, its time falling freely and the fastest it fell. */
  let rode: Rover | undefined;
  let [air, drop] = [0, 0];
  /** The breath: the effort eased from 0 to 1, and where in its cycle it is (0 to 1). */
  let [effort, cycle] = [0, 0];

  /** The footfall n of p: harder at a sprint, softer crouched, the two feet a little apart in pitch. */
  const tap = (p: PlayerState, n: number, at?: Vec3) => {
    const run = sprinting(p);
    a.play(
      p.mode === MODE.WALLRUN ? SOUND.WALLSTEP : SOUND.STEP,
      at,
      run || p.mode === MODE.WALLRUN ? 1 : p.mode === MODE.CROUCH ? 0.35 : 0.6,
      (run ? 0.92 : 1) * (n & 1 ? 1.06 : 0.94),
    );
  };
  /** A landing at `fall` m/s: a harder one is louder and lower. */
  const land = (fall: number, at?: Vec3) =>
    a.play(SOUND.LAND, at, clamp(fall / 14, 0.2), 1.25 - 0.5 * clamp(fall / 20));

  return {
    me(p, hit, steps) {
      const n = steps;
      const stepped = n > feet;
      feet = n;
      if (!p || a.muted) {
        return;
      }
      if (stepped) {
        tap(p, n);
      }
      for (const [bit, id] of [
        [EV.JUMP, SOUND.JUMP],
        [EV.DOUBLE, SOUND.DOUBLE],
        [EV.DASH, SOUND.DASH],
        [EV.GRAB, SOUND.GRAB],
        [EV.CLIMB, SOUND.SCUFF],
      ]) {
        if (hit.ev & bit) {
          a.play(id);
        }
      }
      if (hit.ev & EV.LAND) {
        land(hit.fall);
      }
      // Wind from 4 m/s to 16: a run is nearly silent, a dash or a long fall roars.
      const u = clamp((Math.hypot(p.vx, p.vy, p.vz) - 4) / 12);
      wind.set(0.55 * u ** 1.5, 0.6 + 0.9 * u);
      const v = clamp(speedOf(p) / 9);
      scrape.set(p.mode === MODE.SLIDE ? 0.2 + 0.5 * v : 0, 0.8 + 0.4 * v);
    },

    rover(r, dt, keys = 0) {
      const was = rode;
      rode = r && { ...r };
      if (!r || a.muted) {
        engine?.set(0, 0.6);
        skid?.set(0, 1);
        air = drop = 0;
        return;
      }
      engine ??= a.loop(SOUND.ENGINE);
      skid ??= a.loop(SOUND.SKID);
      const [fx, fz] = [-Math.sin(r.yaw), -Math.cos(r.yaw)];
      const u = clamp(Math.abs(r.vx * fx + r.vz * fz) / ROVER.VMAX);
      const gas = keys & (KEY.FORWARD | KEY.BACK) ? 1 : 0;
      // It idles, revs with the speed and growls under the throttle.
      engine.set(0.22 + 0.4 * u + 0.18 * gas, 0.6 + 1.1 * u + 0.12 * gas);
      // Another rover, or this one parked again: nothing to compare.
      const same = was && dt > 0 && Math.hypot(r.x - was.x, r.y - was.y, r.z - was.z) < 5;
      const acc = same ? (r.vy - was.vy) / dt : 0;
      // A crash into a wall or a vehicle: more speed on the level gone in a frame than the brakes
      // can take, as the host counts it (drive()'s jolt).
      const jolt = same ? Math.hypot(r.vx - was.vx, r.vz - was.vz) : 0;
      if (jolt > ROVER.CRASH) {
        a.play(SOUND.CRASH, undefined, clamp(jolt / 25, 0.4), 1.25 - 0.3 * clamp(jolt / 30));
      }
      if (!same) {
        air = drop = 0;
      } else if (acc < -FALL) {
        air += dt;
        drop = Math.max(drop, -r.vy);
      } else {
        if (acc > STOP && air >= AIR && drop > SOFT_THUD) {
          a.play(SOUND.THUD, undefined, clamp(drop / 10, 0.25), 1.1 - 0.3 * clamp(drop / 12));
        }
        // A stop empties it at once; a frame between two leaves most of it.
        air = acc > STOP ? 0 : Math.max(0, air - 2 * dt);
        drop = air ? drop : 0;
      }
      const side = clamp((Math.abs(r.vz * fx - r.vx * fz) - SKID_FROM) / SKID_SPAN);
      skid.set(air >= AIR || side <= 0 ? 0 : 0.25 + 0.45 * side, 0.8 + 0.4 * side);
    },

    ship(r, dt, keys = 0) {
      const was = flown;
      flown = r && { ...r };
      if (!r || r.wreck || a.muted) {
        jet?.set(0, 0.7);
        return;
      }
      jet ??= a.loop(SOUND.JET);
      const u = clamp(Math.hypot(r.vx, r.vy, r.vz) / SHIP.VMAX);
      const push =
        keys & (KEY.FORWARD | KEY.BACK | KEY.LEFT | KEY.RIGHT | KEY.JUMP | KEY.CROUCH) ? 1 : 0;
      const boost = keys & KEY.SPRINT && keys & KEY.FORWARD ? 1 : 0;
      // It idles low on its pad, roars with the speed and the thrust, and screams on the boost.
      const idle = r.steer < 0 && !push ? 0.6 : 1;
      jet.set(
        (0.28 + 0.35 * u + 0.15 * push + 0.2 * boost) * idle,
        0.7 + 0.55 * u + 0.1 * push + 0.25 * boost,
      );
      // A crash: more speed gone in a frame than the engines can brake, as the host counts it
      // (pilot()'s jolt). Another ship, or this one parked again: nothing to compare.
      if (was && dt > 0 && Math.hypot(r.x - was.x, r.y - was.y, r.z - was.z) < 5) {
        const jolt = Math.hypot(r.vx - was.vx, (r.vy - was.vy) / 2, r.vz - was.vz);
        if (jolt > SHIP.CRASH) {
          a.play(SOUND.CRASH, undefined, clamp(jolt / 40, 0.5), 1.1 - 0.3 * clamp(jolt / 60));
        }
      }
    },

    breathe(p, dt) {
      if (!p || p.down > 0) {
        cycle = 0;
        return;
      }
      // Hard: sprinting, dashing, on a wall or in a jump; a walk is half that; standing, none.
      const hard =
        sprinting(p) || p.mode === MODE.WALLRUN || p.dash > 0 || !p.ground
          ? 1
          : speedOf(p) > 0.5
            ? 0.4
            : 0;
      effort += (hard - effort) * Math.min(dt / (hard > effort ? WIND_UP : CALM_DOWN), 1);
      const was = cycle;
      cycle += dt / (BREATH[0] + (BREATH[1] - BREATH[0]) * effort);
      if (a.muted) {
        cycle %= 1;
        return;
      }
      const [gain, rate] = [0.3 + 0.4 * effort, 1 + 0.15 * effort];
      if (cycle >= 1) {
        cycle %= 1;
        a.play(SOUND.INHALE, undefined, gain, rate);
      } else if (was < OUT_AT && cycle >= OUT_AT) {
        a.play(SOUND.EXHALE, undefined, gain, rate);
      }
    },

    others(ps, steps) {
      for (const p of ps) {
        const s = seen.get(p.id);
        const n = steps(p.id);
        if (s && !a.muted) {
          const at: Vec3 = [p.x, p.y + 0.1, p.z];
          if (n !== undefined && s.steps !== undefined && n > s.steps) {
            tap(p, n, at);
          }
          if (p.ground && !s.p.ground && s.p.vy < -SOFT) {
            land(-s.p.vy, at);
          }
        }
        seen.set(p.id, { p, steps: n });
      }
      for (const id of seen.keys()) {
        if (!ps.some(p => p.id === id)) {
          seen.delete(id);
        }
      }
    },
  };
};
