import { DOWN_TICKS, EXEC, RUN_SPEED, TICK_HZ } from '../../shared/constants';
import { floored } from '../../shared/physics';
import { MODE } from '../../shared/types';
import type { PlayerState } from '../../shared/types';
import { stowed } from '../body';
import { dashing } from '../expression';
import { PUMMEL, pummeling } from '../feast';
import type { Seat } from '../gait';
import { ARC, LONG_CURL, RIFLE_CURL, handOf, swapOf } from '../gun';
import { STRIDE, unit } from '../mesh';
import type { Vec3 } from '../mesh';
import { room } from '../verts';
import type { Out } from '../verts';
import type { Runner } from './types';

/** A dash trails three streaks: thin glowing (layer -2) spikes, a pair of crossed triangles each. */
export const streaks = (out: Out, r: Runner, color: number[], at: (v: Vec3) => Vec3) => {
  const back = unit([-r.p.vx, 0, -r.p.vz]);
  const [cr, cg, cb] = color.map(v => 0.6 + 0.6 * v);
  [
    [0.5, 0.12, 1.3],
    [0.9, -0.16, 1.7],
    [1.25, 0.14, 1.2],
  ].forEach(([u, x, len], i) => {
    const a = at([x, u, -0.2 - 0.1 * i]);
    const tip = a.map((v, k) => v + back[k] * len * r.dash);
    for (const d of [
      [-back[2] * 0.03, 0, back[0] * 0.03],
      [0, 0.03, 0],
    ]) {
      for (const p of [a.map((v, k) => v + d[k]), a.map((v, k) => v - d[k]), tip]) {
        out.push(...p, 0, 1, 0, cr, cg, -2, cb);
      }
    }
  });
};

/** Whether the runner is at a rover's wheel: unarmed, his weapons put away. */
export const driving = (r: Pick<Runner, 'p' | 'seat'>) => r.p.mode == MODE.RIDE && r.seat?.s === 0;

/** How fast a hand closes or opens, 1 / s. */
export const CLOSE = 14;

/**
 * How closed the hands of `p` are, left then right (hand() in body.ts: 0 flat, 0.9 round a grip, 1
 * a fist), as the own body closes its own: round what they hold and on the wheel, fists with
 * nothing in them (the guard), a loose fist on a run, tighter at a sprint, open in the air, flat
 * on a ledge, a wall or the floor, limp lying down.
 */
export const grasp = (p: PlayerState, seat?: Seat, hunter = false): number[] => {
  if (p.down || floored(p)) {
    return [0.3, 0.3];
  }
  if (driving({ p, seat })) {
    return [0.9, 0.9];
  }
  // The fists' execution: both fists, the left hand opening on his head (feast.ts PUMMEL.GRAB).
  if (pummeling(p)) {
    return [EXEC.TICKS - p.lock! > PUMMEL.GRAB[0] ? 0.45 : 1, 1];
  }
  const armed = handOf(p) >= 0;
  const pace = Math.min(Math.max((Math.hypot(p.vx, p.vz) - RUN_SPEED) / 3, 0), 1);
  const free = dashing(p)
    ? 1
    : p.mode == MODE.HANG || p.mode == MODE.CLIMB || p.mode == MODE.WALLRUN || p.mode == MODE.SLIDE
      ? 0.1
      : p.stun > 0
        ? 0.25
        : p.mode == MODE.AIR
          ? 0.35
          : armed
            ? 0.75 + 0.15 * pace
            : 1;
  if (p.wield) {
    return [0.9, 0.9];
  }
  if (p.rifled || (p.railed && !stowed(p))) {
    // A long gun's grips in an opener hand (LONG_CURL); not the Hunter's, whose disc and cannon
    // only borrow these flags.
    const round = hunter ? 0.9 : LONG_CURL;
    return [p.rifled ? RIFLE_CURL : round, round];
  }
  // In a swap the left hand brings the new battery up from the pouch.
  return [
    p.ammo >= 0 && !p.fists && !p.railed && swapOf(p) >= 0 ? 0.7 : free,
    (p.railed ? !stowed(p) : p.ammo >= 0 && !p.fists) ? 0.9 : free,
  ];
};

/** Seconds a runner the rail gun's bolt put down takes to come apart. */
export const FRY = 0.9;

/** How far a runner has come apart, 0 (whole, or not fried) to 1 (gone). */
export const fried = (p: PlayerState): number =>
  p.fried && p.down ? Math.min((DOWN_TICKS - p.down) / TICK_HZ / FRY, 1) : 0;

/**
 * The triangles of `out` from `from` coming apart `k` of the way (0 to 1): they glow violet white
 * at once, each drifts up and out on its own, and goes when `k` passes its own share, so the body
 * thins to nothing.
 */
export const dissolve = (out: Out, from: number, k: number) => {
  const T = 3 * STRIDE;
  let w = from;
  const a = room(out, 0);
  for (let o = from, i = 0; o < out.length; o += T, i++) {
    const h = ((Math.imul(i + 1, 0x9e3779b1) >>> 0) % 1000) / 1000;
    if (h < k) {
      continue;
    }
    const lift = [Math.sin(i) * 0.3, 1.2 * h, Math.cos(i) * 0.3].map(v => v * k * k);
    const glow = Math.min(1, k * 4);
    for (let v = 0; v < T; v += STRIDE) {
      for (let j = 0; j < STRIDE; j++) {
        a[w + v + j] = a[o + v + j] + (j < 3 ? lift[j] : 0);
      }
      [6, 7, 9].forEach((j, c) => (a[w + v + j] += (ARC[c] * (1 - k) - a[w + v + j]) * glow));
      a[w + v + 8] = glow > 0.5 ? -2 : a[w + v + 8];
    }
    w += T;
  }
  out.length = w;
};
