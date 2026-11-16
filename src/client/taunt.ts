// The players' own voices (voice/cast.ts): the taunt a player throws at the one he just fragged (an
// ally's over the radio, wherever he is), and the cry of one going down. Each player has a voice of
// his body's, by his id, the same on every screen, and so are the lines he picks.
import { FRAG } from '../shared/protocol';
import type { Audio } from './audio';
import type { Vec3 } from './mesh';
import { SOUND } from './sfx';
import { CAST, KIND, LINES, VOICES } from './voice/cast';

/** Seconds from a frag to its taunt: the victim's cry first. */
export const TAUNT_DELAY = 0.6;
/** Seconds from an own frag to its taunt when the announcer has a line for it: after the line. */
export const TAUNT_LATE = 1.3;
/** Seconds a player keeps quiet after a taunt: a quick run of frags gets one. */
export const TAUNT_GAP = 4;
/** Metres over the feet a player's voice comes from. */
const MOUTH = 1.6;

/** The voice of player `id` in a build (BODY): one of the man's or one of the woman's. */
export const speakerOf = (id: number, body = 0): number => (body ? VOICES : 0) + (id % VOICES);

/** A player's speed of speech, a little off the next's by his id, so that two in a voice differ. */
export const paceOf = (id: number): number => 0.95 + 0.1 * ((id * 0.618) % 1);

/** Clip `k` of a kind, wrapped round its lines. */
const pick = ([a, b]: readonly [number, number], k: number) => a + (k % (b - a));

/**
 * The clip (CAST) of what `speaker` says after his `n`th frag made `how` (FRAG): a word of his own
 * for the fists and the katana, else one of the taunts, a new one each frag.
 */
export const tauntOf = (speaker: number, how: number, n: number): number =>
  speaker * LINES +
  pick(
    how == FRAG.FIST ? KIND.FISTS : how == FRAG.BLADE ? KIND.BLADE : KIND.TAUNT,
    speaker * 3 + n * 7,
  );

/** The clip (CAST) of `speaker`'s `k`th cry as he goes down. */
export const deathOf = (speaker: number, k: number): number =>
  speaker * LINES + pick(KIND.DEATH, k);

/** An ally's line that began: who says it, and its seconds. */
export interface Said {
  by: number;
  s: number;
}

export interface Taunts {
  /**
   * The host's frag message `m` at `now` (s), told to the own player `me`: its author taunts
   * `wait` s later, unless he taunted less than TAUNT_GAP s before.
   */
  frag(
    m: { by: number; who: number; how: number; n: number },
    me: number,
    now: number,
    wait?: number,
  ): void;
  /**
   * Says the taunts due at `now` (s): the own and the one aimed at the own player centred, an
   * ally's over the radio wherever he is, an enemy's from where `where` draws him (feet), unheard
   * when it does not draw him. Returns the allies' lines that began.
   */
  frame(now: number, where: (id: number) => Vec3 | undefined): Said[];
}

export const createTaunts = (
  audio: Pick<Audio, 'speak'> & Partial<Pick<Audio, 'play'>>,
  /** A player's build (BODY) from the roster. */
  body: (id: number) => number | undefined,
  /** A player's team from the roster. */
  team: (id: number) => number | undefined = () => undefined,
  /** Whether a player is a xenomorph: it roars (ROAR), with no words and no radio. */
  beast: (id: number) => boolean = () => false,
): Taunts => {
  /**
   * The taunts waiting: when, who says it, the clip, and whether the own player hears it close
   * (his own, or aimed at him) or over the radio (an ally's).
   */
  const due: { t: number; by: number; clip: number; close: boolean; ally: boolean }[] = [];
  /** When each player last taunted. */
  const last = new Map<number, number>();
  return {
    frag(m, me, now, wait = TAUNT_DELAY) {
      if (now - (last.get(m.by) ?? -Infinity) < TAUNT_GAP) {
        return;
      }
      last.set(m.by, now);
      const clip = beast(m.by) ? -1 : tauntOf(speakerOf(m.by, body(m.by)), m.how, m.n);
      const close = m.by == me || m.who == me;
      const ally = !close && team(m.by) !== undefined && team(m.by) === team(me);
      due.push({ t: now + wait, by: m.by, clip, close, ally });
    },
    frame(now, where) {
      const said: Said[] = [];
      for (let i = due.length; i--;) {
        const d = due[i];
        if (now < d.t) {
          continue;
        }
        due.splice(i, 1);
        const p = d.close || d.ally ? undefined : where(d.by);
        if (d.clip < 0) {
          // An enemy's from where it is drawn, and none when it is not.
          if (d.close || d.ally || p) {
            audio.play?.(SOUND.ROAR, p, p ? 1 : 0.7, paceOf(d.by));
          }
        } else if (d.close) {
          audio.speak(d.clip, undefined, 0.75, paceOf(d.by));
        } else if (d.ally) {
          if (audio.speak(d.clip, undefined, 0.7, paceOf(d.by), true)) {
            said.push({ by: d.by, s: CAST[d.clip][1] / paceOf(d.by) });
          }
        } else if (p) {
          audio.speak(d.clip, [p[0], p[1] + MOUTH, p[2]], 1, paceOf(d.by));
        }
      }
      return said;
    },
  };
};
