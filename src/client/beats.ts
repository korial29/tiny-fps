// What happened in the match, read off two snapshots in a row: the banners and the sounds of the
// flags and of the tackles. The wire carries states, not events: a take, a drop, a return, a capture,
// a new match and a tackle are the differences between the flags, the score and the stumble timers
// of one snapshot and the next. No DOM.
import { TEAM_NAME } from '../shared/constants';
import { FLAG } from '../shared/types';
import type { Snapshot } from '../shared/types';
import type { Vec3 } from './mesh';
import { SOUND } from './sfx';

/** One thing that happened. `flag` is the team the flag belongs to. */
export type Beat =
  | { kind: 'take'; flag: number; by: number }
  | { kind: 'drop'; flag: number }
  | { kind: 'return'; flag: number }
  | { kind: 'capture'; team: number }
  | { kind: 'start' }
  /** Player `who` was tackled by player `by`, at `at` (the middle of his body in the snapshot). */
  | { kind: 'tackle'; who: number; by: number; at: Vec3 };

/**
 * The beats from snapshot `a` to `b`. Nothing at the first snapshot, nothing while a match is
 * over (the flags and the score are frozen), and a new match is one beat of its own, whatever
 * its flags and score reset from. A capture is one beat: the carried flag going home with it is
 * not a return. A carried flag that is home in the next snapshot without a capture was dropped and
 * sent home by its tackler within the same two ticks: one return. A tackle is a player whose
 * stumble timer is higher than it was (a new stumble), one beat each, after the flag beats.
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
  const scored = out.length > 0;
  b.flags.forEach((f, flag) => {
    const was = a.flags[flag];
    if (f.state === FLAG.CARRIED && (was.state !== FLAG.CARRIED || was.by !== f.by)) {
      out.push({ kind: 'take', flag, by: f.by });
    } else if (f.state === FLAG.DROPPED && was.state === FLAG.CARRIED) {
      out.push({ kind: 'drop', flag });
    } else if (
      f.state === FLAG.HOME &&
      (was.state === FLAG.DROPPED || (was.state === FLAG.CARRIED && !scored))
    ) {
      out.push({ kind: 'return', flag });
    }
  });
  for (const p of b.players) {
    if (p.stun > (a.players.find(q => q.id === p.id)?.stun ?? Infinity)) {
      out.push({ kind: 'tackle', who: p.id, by: p.by, at: [p.x, p.y + 1, p.z] });
    }
  }
  return out;
};

/**
 * A line for the banner, and the team whose colour it is in, or none: a tackle is told to the
 * tackler only. `me` is the own player.
 */
export const say = (
  beat: Beat,
  me: { id: number; team: number },
  name: (id: number) => string,
): { text: string; team?: number } | undefined => {
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
    case 'tackle':
      return beat.by === me.id ? { team: me.team, text: `Tackled ${name(beat.who)}!` } : undefined;
    default:
      return { text: 'New match' };
  }
};

/** A sound to play: its id, where (none: centred, the own player's), how loud and at what speed. */
export interface Cue {
  id: number;
  at?: Vec3;
  gain?: number;
  rate?: number;
}

/**
 * The sounds of a beat: a lower pitch for bad news for the own team (its flag taken, the enemy
 * flag dropped or returned, a point for the other side), the plain one for good news. A tackle
 * is an impact at the spot for the others, a close one for the tackler, and for the one tackled
 * an impact and a grunt, centred. None for a new match.
 */
export const cues = (beat: Beat, me: { id: number; team: number }): Cue[] => {
  const { team } = me;
  switch (beat.kind) {
    case 'take':
      return [{ id: SOUND.TAKE, rate: beat.flag === team ? 0.8 : 1 }];
    case 'drop':
      return [{ id: SOUND.DROP, rate: beat.flag === team ? 1 : 0.85 }];
    case 'return':
      return [{ id: SOUND.RETURN, rate: beat.flag === team ? 1 : 0.85 }];
    case 'capture':
      return [{ id: SOUND.CAPTURE, rate: beat.team === team ? 1 : 0.8 }];
    case 'tackle':
      return beat.who === me.id
        ? [{ id: SOUND.TACKLE }, { id: SOUND.GRUNT }]
        : beat.by === me.id
          ? [{ id: SOUND.TACKLE, gain: 0.8, rate: 1.1 }]
          : [{ id: SOUND.TACKLE, at: beat.at }];
    default:
      return [];
  }
};
