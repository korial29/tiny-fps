// The sounds of movement. The own player's come from the events of its live steps; the others'
// events are not on the wire, so their landings are read off the motion they are drawn with. A
// footstep sounds as a drawn foot is set down (Gait.steps), the own body's or a runner's, so the
// sound goes with the legs. No DOM, unit-tested against a fake Audio.
import { speedOf, sprinting } from '../shared/physics';
import { EV, MODE } from '../shared/types';
import type { PlayerState } from '../shared/types';
import type { Audio } from './audio';
import type { Hit } from './effects';
import type { Vec3 } from './mesh';
import { SOUND } from './sfx';

export interface Foley {
  /** The own player as drawn (undefined before the first snapshot), what its live steps did, and its body's footsteps so far. */
  me(p: PlayerState | undefined, hit: Hit, steps: number): void;
  /** The other players as drawn and their runners' footsteps so far: their steps and landings, at their position. */
  others(ps: PlayerState[], steps: (id: number) => number | undefined): void;
}

/** A fall slower than this (m/s) makes no sound on the others. */
const SOFT = 3;

const clamp = (v: number, lo = 0, hi = 1) => Math.min(Math.max(v, lo), hi);

export const createFoley = (a: Audio): Foley => {
  const wind = a.loop(SOUND.WIND);
  const scrape = a.loop(SOUND.SCRAPE);
  /** Footfalls of the own player so far. */
  let feet = 0;
  const seen = new Map<number, { p: PlayerState; steps?: number }>();

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
