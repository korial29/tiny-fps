// The sounds of the glory kills (the user, 2026-11-17), cued on the ticks of the lock as the
// killer counts them, so they fall with what is drawn (feast.ts): the xenomorph landing on its prey,
// his cries, its claws, its hiss, its bite and its chewing; the katana's cut biting, his cry, his knee
// on the roof, his panting, the blade coming round; the fists' bound in, the punch in his belly, his
// knee, his panting, the hand on his head, the effort and the whoosh of the punch down. After the
// kill, a few more on the clock: the fists' is the head bursting (SMASH). Sfx.ts's own sounds, at
// other gains and rates. No DOM.
import { EXEC, GLORY_TICKS } from '../shared/constants';
import type { PlayerState } from '../shared/types';
import type { Vec3 } from './mesh';
import { SOUND } from './sfx';

/**
 * A cue: the tick of the lock it plays on, the sound, on the killer (0) or the victim (1), its gain
 * and rate, and, to repeat it, every so many ticks up to a last; a victim's cue `voiced` is said in
 * his own voice (its rate times voiceOf()).
 */
export type Cue = [
  tick: number,
  sound: number,
  on: number,
  gain: number,
  rate: number,
  every?: number,
  last?: number,
  voiced?: boolean,
];

/** The xenomorph's, over GLORY_TICKS: on him at 18, its head back from 46, the bite home at 114. */
export const FEAST_CUES: Cue[] = [
  [18, SOUND.TACKLE, 1, 0.9, 0.8],
  [19, SOUND.PAIN, 1, 1, 1.2, 0, 0, true],
  [30, SOUND.PAIN, 1, 0.8, 1.25, 21, 100, true],
  [24, SOUND.CLAW, 1, 0.45, 0.8, 16, 100],
  [46, SOUND.XENO_HISS, 0, 0.9, 0.85],
  [100, SOUND.SHRIEK, 0, 0.9, 1.3],
  [106, SOUND.TACKLE, 1, 1, 0.5],
  [108, SOUND.CLAW, 1, 0.6, 0.55, 8, 119],
];

/** The katana's, over EXEC.TICKS: the thrust goes in at 36, he is on his knee at 46. */
export const EXEC_CUES: Cue[] = [
  [36, SOUND.ZAP, 1, 0.9, 1],
  [37, SOUND.PAIN, 1, 1, 1, 0, 0, true],
  [46, SOUND.THUD, 1, 0.8, 1.5],
  // The blade rings as it goes up over his head.
  [48, SOUND.SHING, 0, 0.7, 0.9],
  [50, SOUND.EXHALE, 1, 0.45, 1.5, 23, 72],
  [61, SOUND.INHALE, 1, 0.45, 1.6, 23, 72],
];

/**
 * The fists', over EXEC.TICKS (feast.ts PUMMEL): the push off at 2 and 3, down on the left foot at 19
 * and the right at 24, the fist driven in from 31 and home in his belly at 36, his knee at 46, the
 * hand on his head at 58, the breath and the effort of the punch down from 76, its whoosh from 82.
 */
export const FIST_CUES: Cue[] = [
  [2, SOUND.GRUNT, 0, 0.45, 1.2],
  [3, SOUND.JUMP, 0, 0.7, 0.9],
  [19, SOUND.LAND, 0, 0.9, 1],
  [24, SOUND.STEP, 0, 0.7, 1],
  [31, SOUND.SWISH, 0, 0.6, 1.3],
  [36, SOUND.TACKLE, 1, 1.4, 0.5],
  [37, SOUND.PAIN, 1, 0.9, 0.85, 0, 0, true],
  [46, SOUND.THUD, 1, 0.8, 1.5],
  [50, SOUND.EXHALE, 1, 0.45, 1.5, 23, 72],
  [61, SOUND.INHALE, 1, 0.45, 1.6, 23, 72],
  [58, SOUND.GRAB, 1, 0.7, 1],
  [76, SOUND.INHALE, 0, 0.5, 1.2],
  [81, SOUND.GRUNT, 0, 0.9, 0.9],
  [83, SOUND.SWISH, 0, 0.8, 0.7],
];

/** After the kill: seconds, then as a cue (on the place each stood). */
export const FEAST_AFTER: [number, number, number, number, number][] = [
  [0.5, SOUND.XENO_LAND, 0, 0.8, 1],
  [0.15, SOUND.CLAW, 1, 0.4, 0.5],
  [0.45, SOUND.CLAW, 1, 0.35, 0.55],
  [1.7, SOUND.XENO_HISS, 0, 0.7, 0.7],
];
export const EXEC_AFTER: [number, number, number, number, number][] = [
  [0.7, SOUND.THUD, 1, 1, 1.1],
];
export const FIST_AFTER: [number, number, number, number, number][] = [
  [0, SOUND.SMASH, 1, 1.5, 1],
  [0, SOUND.TACKLE, 1, 1.1, 0.45],
  [0.7, SOUND.THUD, 1, 1, 1.1],
];

export interface GloryFx {
  /** Plays what the glory kills of `players` (the own one among them) cue since the last frame. */
  frame(players: PlayerState[]): void;
}

/** One killer in a glory kill as last seen: its lock, whose, and where the two stood. */
interface Kill {
  lock: number;
  exec: boolean;
  /** An execution with no katana in hand: the fists'. */
  fist: boolean;
  victim: number;
  at: [Vec3, Vec3];
}

export const createGloryFx = (
  play: (id: number, at: Vec3, gain: number, rate: number) => void,
  voice: (id: number) => number,
  xeno: (id: number) => boolean,
  later: (f: () => void, ms: number) => void = (f, ms) => setTimeout(f, ms),
): GloryFx => {
  const kills = new Map<number, Kill>();
  const sound = (k: Kill, [, s, on, gain, rate, , , voiced]: Cue | number[]) =>
    play(s, k.at[on], gain, rate * (voiced ? voice(k.victim) : 1));
  return {
    frame(players) {
      for (const p of players) {
        const foe = players.find(q => q.id === p.foe);
        const was = kills.get(p.id);
        const exec = p.exec === EXEC.KILLER;
        // The killer: the swordsman, or the xenomorph on one who is not.
        if (p.lock && foe && (exec || (!p.exec && xeno(p.id) && !xeno(foe.id)))) {
          const k: Kill = {
            lock: p.lock,
            exec,
            fist: exec && !p.wield,
            victim: foe.id,
            at: [p, foe].map(q => [q.x, q.y + 1.3, q.z] as Vec3) as [Vec3, Vec3],
          };
          const all = exec ? EXEC.TICKS : GLORY_TICKS;
          // From the tick last seen (none when first seen: what has gone is not played late).
          const [e0, e1] = [all - (was?.lock ?? p.lock), all - p.lock];
          for (const cue of k.fist ? FIST_CUES : exec ? EXEC_CUES : FEAST_CUES) {
            const [tick, , , , , every, last] = cue;
            for (let t = tick; t <= (every ? last! : tick); t += every || 1) {
              if (e0 < t && t <= e1) {
                sound(k, cue);
              }
            }
          }
          kills.set(p.id, k);
        } else if (was) {
          // The kill (or the lock let go): what follows plays on the clock, where they stood.
          kills.delete(p.id);
          if (was.lock <= 2) {
            for (const [s, ...cue] of was.fist ? FIST_AFTER : was.exec ? EXEC_AFTER : FEAST_AFTER) {
              later(() => sound(was, [0, ...cue]), s * 1000);
            }
          }
        }
      }
    },
  };
};
