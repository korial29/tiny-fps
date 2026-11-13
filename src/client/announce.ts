// What the announcer says, read off two snapshots in a row and the beats between them: the match
// starting and its last minute, the flags and the captures told from the own team's side, and a run
// of shots that mostly hit; and off the host's frag messages, the own frags in quick succession and
// in a row, the first blood and a kill with the fists. No DOM, no sound.
import { FRAG } from '../shared/protocol';
import type { ServerText } from '../shared/protocol';
import type { Snapshot } from '../shared/types';
import type { Beat } from './beats';
import { LINE } from './voice/clips';

/** Seconds between two frags for them to count as a double kill, a multi kill and on. */
export const MULTI = 4;
/** The lines of the 2nd, 3rd, 4th, 5th frag in quick succession; the last for every one after. */
export const QUICK = [LINE.DOUBLE, LINE.MULTI, LINE.MEGA, LINE.ULTRA, LINE.MONSTER];
/** Frags without going down between two lines of a run; the last line for every SPREE after. */
export const SPREE = 5;
export const RUNS = [LINE.SPREE, LINE.RAMPAGE, LINE.DOMINATING, LINE.UNSTOPPABLE, LINE.GODLIKE];
/** Shots of the gun in one run judged for the aim, and the share of them that must hit. */
export const AIM_SHOTS = 12;
export const AIM_SHARE = 0.75;

export interface Announcer {
  /**
   * The lines for the step from snapshot `a` to `b`, given its beats and the own player `me`: the
   * match, the flags, the aim. The own player going down ends his run of frags.
   */
  step(
    a: Snapshot | undefined,
    b: Snapshot,
    beats: Beat[],
    me: { id: number; team: number },
  ): number[];
  /**
   * The line for the host's frag message `m` at `now` seconds, for the own player `me`: none when
   * the frag is not his. One line at most: a run reached, else a quick succession, else a kill with
   * the fists, else the first blood.
   */
  frag(m: Extract<ServerText, { t: 'frag' }>, me: { id: number }, now: number): number | undefined;
  /** The line for a match that ended `score` (red, blue), told to `team`. */
  end(score: [number, number], team: number): number;
}

export const createAnnouncer = (): Announcer => {
  /** Frags since the own player last went down, in the current quick succession, and the last's time. */
  let [streak, multi, last] = [0, 0, -Infinity];
  /** The gun's shots and hits in the current run. */
  let [shots, hits] = [0, 0];
  /** The last minute has been told, or the match was too short for it. */
  let told = false;
  const reset = () => {
    [streak, multi, last, shots, hits] = [0, 0, -Infinity, 0, 0];
  };
  return {
    step(a, b, beats, me) {
      const out: number[] = [];
      for (const beat of beats) {
        if (beat.kind == 'start') {
          reset();
          told = false;
          out.push(LINE.START);
        } else if (beat.kind == 'take') {
          out.push(beat.flag == me.team ? LINE.STOLEN : LINE.TAKEN);
        } else if (beat.kind == 'return') {
          out.push(beat.flag == me.team ? LINE.BACK : LINE.GONE);
        } else if (beat.kind == 'capture') {
          out.push(beat.team == me.team ? LINE.SCORE : LINE.CONCEDE);
        }
      }
      if (!a || a.over || b.over) {
        return out;
      }
      if (!told && b.clock <= 60) {
        // Joined in the last minute, or a match of a minute: nothing to tell.
        told = true;
        if (a.clock > 60) {
          out.push(LINE.MINUTE);
        }
      }
      const was = a.players.find(p => p.id == me.id);
      const is = b.players.find(p => p.id == me.id);
      if (!was || !is) {
        return out;
      }
      if (is.down) {
        reset();
        return out;
      }
      const landed = (is.hits - was.hits) & 255;
      // The gun's balls only: the katana's cuts and arcs, the rifle's rounds and the bolt hit
      // without a shot or a shot at a time.
      if (is.ammo >= 0 && !is.wield && !is.rifled && !is.railed) {
        shots += (is.shots - was.shots) & 255;
        hits += landed;
        if (shots >= AIM_SHOTS) {
          if (hits >= AIM_SHARE * shots) {
            out.push(LINE.AIM);
          }
          [shots, hits] = [0, 0];
        }
      }
      return out;
    },
    frag(m, me, now) {
      if (m.by != me.id) {
        return undefined;
      }
      multi = now - last <= MULTI ? multi + 1 : 1;
      last = now;
      streak++;
      return streak % SPREE == 0
        ? RUNS[Math.min(streak / SPREE, RUNS.length) - 1]
        : multi > 1
          ? QUICK[Math.min(multi, QUICK.length + 1) - 2]
          : m.how == FRAG.FIST
            ? LINE.HUMILIATION
            : m.first
              ? LINE.FIRST
              : undefined;
    },
    end(score, team) {
      return score[team] > score[1 - team]
        ? LINE.WIN
        : score[team] < score[1 - team]
          ? LINE.LOSS
          : LINE.DRAW;
    },
  };
};
