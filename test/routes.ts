// Test helper: flies the legs of src/shared/routes.ts with a small pilot on test/pilot.ts.
import { dashKeys } from '../src/client/input';
import type { Leg } from '../src/shared/routes';
import { EV, KEY, MODE } from '../src/shared/types';
import { toward } from './pilot';
import type { Sim } from './pilot';

export * from '../src/shared/routes';

const { FORWARD, JUMP, SPRINT, CROUCH } = KEY;

export interface Flight {
  ok: boolean;
  /** The leg that did not end on its roof: its index, and where the player stood. */
  failed?: { n: number; leg: Leg; at: [number, number, number] };
  /** Seconds flown. */
  seconds: number;
}

/** Flies one leg. */
const fly1 = (s: Sim, l: Leg): void => {
  if (l.k === 'go') {
    s.goTo(l.to[0], l.to[1], { sprint: l.sprint, r: l.sprint ? 0.4 : 0.15 });
    s.settle();
    return;
  }
  if (l.k === 'slide') {
    s.goTo(l.from[0], l.from[1], { sprint: true, r: 0.4 });
    const [x0, z0] = [s.p.x, s.p.z];
    s.until(
      p => Math.hypot(l.to[0] - p.x, l.to[1] - p.z) < 0.4,
      p => {
        const d = Math.hypot(p.x - x0, p.z - z0);
        return FORWARD | SPRINT | (d >= l.c[0] && d <= l.c[1] ? CROUCH : 0);
      },
      p => toward(p.x, p.z, l.to[0], l.to[1]),
      300,
    );
    s.settle();
    return;
  }
  const keys = FORWARD | (l.sprint ? SPRINT : 0);
  s.goTo(l.at[0], l.at[1], { sprint: l.sprint, r: 0.2 });
  let k = -1;
  let ran = false;
  let ended = -1;
  s.until(
    p => k >= 0 && p.ground,
    p => {
      if (k < 0) {
        k = 0;
        return keys | JUMP;
      }
      k++;
      if (p.mode === MODE.WALLRUN) {
        ran = true;
      } else if (ran && ended < 0) {
        ended = k;
      }
      const t = l.run ? (ended < 0 ? -1 : k - ended) : k;
      return (t === l.dash ? dashKeys(keys, FORWARD) : keys) | (t === l.double ? JUMP : 0);
    },
    p => toward(p.x, p.z, l.to[0], l.to[1]),
    300,
  );
};

/**
 * Flies the legs from where the player stands, and stops at the first that does not end standing on
 * its roof (or that fell to the kill floor). `onLeg` hears each leg's length in steps.
 */
export const fly = (
  s: Sim,
  legs: Leg[],
  onLeg?: (n: number, leg: Leg, steps: number) => void,
): Flight => {
  const start = s.inputs.length;
  const seconds = () => (s.inputs.length - start) / 60;
  for (const [n, l] of legs.entries()) {
    s.ev &= ~EV.RESPAWN;
    const before = s.inputs.length;
    fly1(s, l);
    onLeg?.(n, l, s.inputs.length - before);
    // A roof's trims stand 12 cm proud: within 20 cm of the roof is on it.
    if (s.ev & EV.RESPAWN || !s.p.ground || Math.abs(s.p.y - l.y) > 0.2) {
      return { ok: false, failed: { n, leg: l, at: [s.p.x, s.p.y, s.p.z] }, seconds: seconds() };
    }
  }
  return { ok: true, seconds: seconds() };
};
