// What happened in the match, read off two snapshots in a row: the banners and the sounds of the
// flags. The wire carries states, not events: a take, a drop, a return, a capture and a new match
// are the differences between the flags and the score of one snapshot and the next. No DOM.
import { TEAM_NAME } from '../shared/constants';
import { FLAG } from '../shared/types';
import type { Snapshot } from '../shared/types';
import { SOUND } from './sfx';

/** One thing that happened. `flag` is the team the flag belongs to. */
export type Beat =
  | { kind: 'take'; flag: number; by: number }
  | { kind: 'drop'; flag: number }
  | { kind: 'return'; flag: number }
  | { kind: 'capture'; team: number }
  | { kind: 'start' };

/**
 * The beats from snapshot `a` to `b`. Nothing at the first snapshot, nothing while a match is
 * over (the flags and the score are frozen), and a new match is one beat of its own, whatever
 * its flags and score reset from. A capture is one beat: the carried flag going home with it is
 * not a return.
 */
export const beats = (a: Snapshot | undefined, b: Snapshot): Beat[] => {
  if (!a) {
    return [];
  }
  if (a.over || b.over) {
    return a.over && !b.over ? [{ kind: 'start' }] : [];
  }
  const out: Beat[] = [];
  for (const team of [0, 1]) {
    if (b.score[team] > a.score[team]) {
      out.push({ kind: 'capture', team });
    }
  }
  b.flags.forEach((f, flag) => {
    const was = a.flags[flag];
    if (f.state === FLAG.CARRIED && (was.state !== FLAG.CARRIED || was.by !== f.by)) {
      out.push({ kind: 'take', flag, by: f.by });
    } else if (f.state === FLAG.DROPPED && was.state === FLAG.CARRIED) {
      out.push({ kind: 'drop', flag });
    } else if (f.state === FLAG.HOME && was.state === FLAG.DROPPED) {
      out.push({ kind: 'return', flag });
    }
  });
  return out;
};

/** A line for the banner, and the team whose colour it is in. `me` is the own player. */
export const say = (
  beat: Beat,
  me: { id: number; team: number },
  name: (id: number) => string,
): { text: string; team?: number } => {
  const flag = (k: number) => TEAM_NAME[k].toLowerCase();
  switch (beat.kind) {
    case 'take': {
      const taker = 1 - beat.flag;
      return {
        team: taker,
        text:
          beat.flag === me.team
            ? `${TEAM_NAME[taker]} took your flag`
            : beat.by === me.id
              ? `You took the ${flag(beat.flag)} flag`
              : `${name(beat.by)} took the ${flag(beat.flag)} flag`,
      };
    }
    case 'drop':
      return {
        team: beat.flag,
        text:
          beat.flag === me.team ? 'Your flag was dropped' : `${TEAM_NAME[beat.flag]} flag dropped`,
      };
    case 'return':
      return {
        team: beat.flag,
        text:
          beat.flag === me.team ? 'Your flag returned' : `${TEAM_NAME[beat.flag]} flag returned`,
      };
    case 'capture':
      return { team: beat.team, text: `${TEAM_NAME[beat.team]} scored` };
    default:
      return { text: 'New match' };
  }
};

/**
 * The sound of a beat and its speed: a lower pitch for bad news for the own team (its flag taken,
 * the enemy flag dropped or returned, a point for the other side), the plain one for good news.
 * Undefined for a beat with no sound.
 */
export const cue = (beat: Beat, team: number): [id: number, rate: number] | undefined => {
  switch (beat.kind) {
    case 'take':
      return [SOUND.TAKE, beat.flag === team ? 0.8 : 1];
    case 'drop':
      return [SOUND.DROP, beat.flag === team ? 1 : 0.85];
    case 'return':
      return [SOUND.RETURN, beat.flag === team ? 1 : 0.85];
    case 'capture':
      return [SOUND.CAPTURE, beat.team === team ? 1 : 0.8];
    default:
      return undefined;
  }
};
