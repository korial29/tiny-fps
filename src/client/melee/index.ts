// The feedback of a melee hit (the user, 2026-11-28: the most there can be), for the katana and
// the xenomorph's claws and tail, whoever strikes: a glowing scar on the victim (scars.ts), blood
// thrown the way of the blow, sparks, its own sound, a kill's and a severed limb's; and for the
// own blow a hit-stop (the drawn clock stands still), a shake and a zoom of the view.
import { heightOf } from '../../shared/physics';
import type { PlayerState } from '../../shared/types';
import type { World } from '../../shared/world';
import type { Audio } from '../audio';
import type { Tracer } from '../beams';
import type { Effects } from '../effects';
import type { Vec3 } from '../mesh';
import { SOUND } from '../sfx';
import type { Out } from '../verts';
import { CHEST_AT, DROPS, KILL_DROPS, SKIN, SMITE_K, SPRAY, STOP, THROW } from './constants';
import { createHits } from './hits';
import type { Landed } from './hits';
import { createScars, strokeOf } from './scars';

export * from './constants';
export * from './hits';
export * from './scars';

export interface Melee {
  /** Takes the frame's players (the own one first, if any) on dt seconds: the blows landed, and their feedback. */
  frame(me: PlayerState | undefined, others: PlayerState[], dt: number): Landed[];
  /** The clock to draw with, ms: `now`, held still through a hit-stop. */
  clock(now: number): number;
  /** Appends the scars of the runners drawn. */
  draw(out: Out, players: PlayerState[]): void;
}

export const createMelee = (
  world: World,
  audio: Pick<Audio, 'play'>,
  tracer: Pick<Tracer, 'gore' | 'shock'>,
  fx: Pick<Effects, 'smite'>,
  xeno: (id: number) => boolean,
): Melee => {
  const hits = createHits(world, xeno);
  const scars = createScars();
  /** Seconds of hit-stop left, and the ms the drawn clock has stood still in all. */
  let stop = 0;
  let lag = 0;
  const rate = () => 0.93 + 0.14 * Math.random();
  return {
    frame(me, others, dt) {
      const all = me ? [me, ...others] : others;
      const landed = hits.frame(all);
      for (const l of landed) {
        const { by, victim, kind, kill, severed } = l;
        const [ux, uz] = [by.x - victim.x, by.z - victim.z];
        const ul = Math.hypot(ux, uz) || 1;
        const at: Vec3 = [
          victim.x + (ux / ul) * SKIN,
          victim.y + heightOf(victim) * CHEST_AT,
          victim.z + (uz / ul) * SKIN,
        ];
        const mine = !!me && by.id === me.id;
        const own = !!me && victim.id === me.id;
        if (!own) {
          scars.add(by, victim, kind);
          const { d } = strokeOf(by, kind);
          const throwAt: Vec3 = [
            d[0] * THROW + (ux / ul) * 0.8,
            d[1] * THROW * 0.3,
            d[2] * THROW + (uz / ul) * 0.8,
          ];
          tracer.gore(at, kill ? KILL_DROPS : DROPS, SPRAY, throwAt);
          tracer.shock(at);
        }
        const where = own ? undefined : at;
        audio.play(kind === 'claw' ? SOUND.REND : SOUND.SLICE, where, mine ? 0 : -2, rate());
        if (kill) {
          audio.play(SOUND.KILL, where, mine ? 0 : -4, rate());
        }
        if (severed) {
          audio.play(SOUND.SEVER, where, -1, rate());
        }
        if (mine) {
          const i = kill ? 2 : by.heavy ? 1 : 0;
          stop = Math.max(stop, STOP[i]);
          fx.smite(strokeOf(by, kind).side, SMITE_K[i]);
        }
      }
      if (stop > 0) {
        lag += Math.min(dt, stop) * 1000;
        stop -= dt;
      }
      scars.update(dt, all);
      return landed;
    },
    clock(now) {
      return now - lag;
    },
    draw(out, players) {
      scars.draw(out, players);
    },
  };
};
