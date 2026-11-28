// Which melee blows landed this frame, and on whom, as the client sees them: the host counts a
// landed swing in its attacker's `hits`; its victim is whoever lost health or went down in the
// same frame within the blow's reach as drawn (the host's strike test, a little slack). Pure.
import { strike, swingOf } from '../../shared/blade';
import { CUT } from '../../shared/types';
import type { PlayerState } from '../../shared/types';
import type { World } from '../../shared/world';
import { blowing } from '../gait/fists';
import { SLACK } from './constants';

/** The weapon of a landed blow: the katana's cut, or the xenomorph's claws or tail. */
export type Kind = 'blade' | 'claw';

export interface Landed {
  by: PlayerState;
  victim: PlayerState;
  kind: Kind;
  /** The blow put him down. */
  kill: boolean;
  /** A limb went with it. */
  severed: boolean;
}

/** What the last frame saw of a player. */
interface Seen {
  hits: number;
  hp: number;
  down: boolean;
  lost: number;
}

/** The swing's numbers a blow of `p` is struck with, or none when `p` is not in a melee swing that hits by itself. */
const swingNumbers = (p: PlayerState, xeno: boolean) => {
  if (!p.swing || p.down) {
    return undefined;
  }
  if (xeno) {
    return blowing(p, true);
  }
  // The arcs strike no one themselves: their wave does, as a shot.
  if (p.wield && p.cut !== CUT.ARC_L && p.cut !== CUT.ARC_R) {
    return swingOf(p);
  }
  return undefined;
};

export const createHits = (world: World, xeno: (id: number) => boolean) => {
  const seen = new Map<number, Seen>();
  return {
    /** The blows landed between the last call and this one, of `players` (the own one among them). */
    frame(players: PlayerState[]): Landed[] {
      const out: Landed[] = [];
      for (const p of players) {
        const was = seen.get(p.id);
        if (!was || p.hits === was.hits) {
          continue;
        }
        const c = swingNumbers(p, xeno(p.id));
        if (!c) {
          continue;
        }
        const hurt = players.filter(q => {
          const w = seen.get(q.id);
          return q !== p && w && !w.down && (q.hp < w.hp || q.down > 0);
        });
        const wide = { reach: c.reach + SLACK[0], arc: c.arc + SLACK[1] };
        for (const victim of strike(world, p, hurt, wide)) {
          out.push({
            by: p,
            victim,
            kind: xeno(p.id) ? 'claw' : 'blade',
            kill: victim.down > 0,
            severed: (victim.lost ?? 0) !== (seen.get(victim.id)?.lost ?? 0) && victim.down > 0,
          });
        }
      }
      seen.clear();
      for (const p of players) {
        seen.set(p.id, { hits: p.hits, hp: p.hp, down: p.down > 0, lost: p.lost ?? 0 });
      }
      return out;
    },
  };
};
