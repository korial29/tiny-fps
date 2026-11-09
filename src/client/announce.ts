// What the announcer says, read off two snapshots in a row and the beats between them: the match
// starting and its last minute, the flags and the captures told from the own team's side, the own
// takedowns in quick succession and in a row, and a run of shots that mostly hit. No DOM, no sound.
import type { Snapshot } from '../shared/types';
import type { Beat } from './beats';
import { LINE } from './voice/clips';

/** Seconds between two takedowns for them to count as a double, a triple. */
export const MULTI = 4;
/** Shots of the gun in one run judged for the aim, and the share of them that must hit. */
export const AIM_SHOTS = 12;
export const AIM_SHARE = 0.75;

export interface Announcer {
  /**
   * The lines for the step from snapshot `a` to `b`, given its beats, the own player `me` and the
   * time in seconds. The own takedowns are the foes who went down in a step where the own `hits`
   * grew, as many as it grew by at most: the wire does not say who put a player down, and a
   * teammate's takedown in the same step as an own hit on someone else is counted as the own.
   */
  step(
    a: Snapshot | undefined,
    b: Snapshot,
    beats: Beat[],
    me: { id: number; team: number },
    now: number,
  ): number[];
  /** The line for a match that ended `score` (red, blue), told to `team`. */
  end(score: [number, number], team: number): number;
}

export const createAnnouncer = (): Announcer => {
  /** Takedowns since the own player last went down, and in the current quick succession. */
  let [streak, multi, last] = [0, 0, -Infinity];
  /** The gun's shots and hits in the current run. */
  let [shots, hits] = [0, 0];
  /** The last minute has been told, or the match was too short for it. */
  let told = false;
  const reset = () => {
    [streak, multi, last, shots, hits] = [0, 0, -Infinity, 0, 0];
  };
  return {
    step(a, b, beats, me, now) {
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
      const fell = b.players.filter(
        p => p.id != me.id && p.down && !a.players.find(q => q.id == p.id)?.down,
      ).length;
      const downs = landed ? Math.min(fell, landed) : 0;
      for (let i = 0; i < downs; i++) {
        multi = now - last <= MULTI ? multi + 1 : 1;
        last = now;
        streak++;
      }
      if (downs) {
        const run =
          streak >= 10 && streak - downs < 10
            ? LINE.TEN
            : streak >= 5 && streak - downs < 5
              ? LINE.FIVE
              : -1;
        const quick = multi == 3 ? LINE.TRIPLE : multi == 2 ? LINE.DOUBLE : -1;
        // A run reached says more than a double within it; past a triple, only the runs.
        if (run >= 0 || quick >= 0) {
          out.push(run >= 0 ? run : quick);
        }
      }
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
    end(score, team) {
      return score[team] > score[1 - team]
        ? LINE.WIN
        : score[team] < score[1 - team]
          ? LINE.LOSS
          : LINE.DRAW;
    },
  };
};
