// The electric katana, the host's rule: which cut the keys give, which enemies a cut hits and the
// way its shock throws them. The swing timer is in `step()` (gun.ts); the room applies the result
// (damage, `stumble()`) and, when the cut puts the foe down, the limb it takes off (`limbOf()`).
// No DOM, no Node API.
import {
  CUTS,
  HEAVY,
  HEAVY_ARC,
  HEAVY_HP,
  HEAVY_MAX,
  HEAVY_REACH,
  HIPS,
  LOCK_FACING,
  LOCK_WINDOW,
  MIDLINE,
  NADE,
  NECK,
  PARRY_ARC,
  PLAYER_R,
  TAIL_HP,
  TAILS,
} from './constants';
import { forward, heightOf } from './physics';
import { CUT, KEY, LIMB, MODE, SPECIAL_CUT } from './types';
import type { Ball, PlayerState } from './types';
import { hidden } from './world';
import type { World } from './world';

/** Where on the body the blade is, as a share of its height: the chest, which a brush must not cover. */
export const CHEST = 0.7;

/**
 * Whether `p` can meet the ball `b` that reached him with the katana: in hand and idle (not in a
 * cut, a punch or charging one: the user, 2026-11-16), on his feet (not hanging, climbing, seated or
 * stumbling), a ball (not a grenade or an arc) coming at him within PARRY_ARC radians of his facing.
 * Whether he does is his kit's chance (Kit.parry, room.ts).
 */
export const fends = (p: PlayerState, b: Ball): boolean => {
  if (!p.wield || p.swing || p.charge || p.stun > 0 || b.arc || b.power === NADE) {
    return false;
  }
  if (p.mode === MODE.HANG || p.mode === MODE.CLIMB || p.mode === MODE.RIDE) {
    return false;
  }
  const [fx, fz] = forward(p.yaw);
  const h = Math.sqrt(b.dx * b.dx + b.dz * b.dz);
  return h > 1e-6 && -(b.dx * fx + b.dz * fz) >= Math.cos(PARRY_ARC) * h;
};

/** A number in [0, 1) from integers, the same for the same ones: the host's dice, which tests can replay. */
export const roll = (...n: number[]): number => {
  let h = 2166136261;
  for (const v of n) {
    h = Math.imul(h ^ v, 16777619);
  }
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  return ((h ^ (h >>> 12)) >>> 0) / 2 ** 32;
};

/**
 * The cut the keys held when FIRE starts a swing give: LEFT or RIGHT, one of them, cuts across from
 * that side; else FORWARD thrusts; else (back or no key) it slashes. Both sides held are neither.
 */
export const cutOf = (keys: number): number => {
  const [l, r] = [keys & KEY.LEFT, keys & KEY.RIGHT];
  return l && !r ? CUT.LEFT : r && !l ? CUT.RIGHT : keys & KEY.FORWARD ? CUT.THRUST : CUT.SLASH;
};

/**
 * The swing `p` is in, its numbers as CUTS has them (`table`; the xenomorph's is TAILS): the cut's
 * own, or, for a heavy release (`heavy`), the rest of it from the top of its wind-up, HEAVY times as
 * slow, with its own timer from there, and harder and wider.
 */
export const swingOf = (p: Pick<PlayerState, 'cut' | 'heavy'>, table: typeof CUTS = CUTS) => {
  const c = table[p.cut ?? 0];
  return p.heavy
    ? {
        ...c,
        ticks: Math.round((c.ticks - c.hold) * HEAVY),
        strike: Math.round((c.strike - c.hold) * HEAVY),
        reach: c.reach + HEAVY_REACH,
        arc: c.arc * HEAVY_ARC,
        hp: c.hp + HEAVY_HP,
      }
    : c;
};

/**
 * The health a xenomorph's swing `p` takes: the claws and the specials their own `hp`; the tail
 * TAIL_HP[0] let go before a charge, up to TAIL_HP[1] for a heavy release of a full one (`charge`
 * stays through the release, gun.ts).
 */
export const sting = (p: Pick<PlayerState, 'cut' | 'heavy' | 'charge'>): number => {
  const c = TAILS[p.cut ?? 0]!;
  if (c.hold < 0) {
    return c.hp;
  }
  const k = p.heavy ? Math.min(p.charge ?? 0, HEAVY_MAX) / HEAVY_MAX : 0;
  return TAIL_HP[0] + Math.round((TAIL_HP[1] - TAIL_HP[0]) * k);
};

/**
 * The enemies the cut of `p` (`p.cut`, `p` the state after the step that struck) hits, of `foes`
 * (as he saw them): each within CUTS reach of his centre less PLAYER_R on the floor plane, inside
 * the arc round his look (the foe's own angular radius counts: his edge in the arc is a hit), with
 * the heights of the two bodies overlapping and no brush between the chests.
 */
export const strike = (
  w: World,
  p: PlayerState,
  foes: PlayerState[],
  { reach, arc }: { reach: number; arc: number } = swingOf(p),
): PlayerState[] => {
  const [fx, fz] = forward(p.yaw);
  const o: [number, number, number] = [p.x, p.y + CHEST * heightOf(p), p.z];
  return foes.filter(f => {
    const [dx, dz] = [f.x - p.x, f.z - p.z];
    const d = Math.hypot(dx, dz);
    if (d - PLAYER_R > reach || p.y >= f.y + heightOf(f) || f.y >= p.y + heightOf(p)) {
      return false;
    }
    // On the foe's body, any way is in the arc.
    const off = d > PLAYER_R ? Math.abs(Math.atan2(fx * dz - fz * dx, fx * dx + fz * dz)) : 0;
    const wide = d > PLAYER_R ? Math.asin(PLAYER_R / d) : Math.PI;
    return off <= arc + wide && !hidden(w, o, [f.x, f.y + CHEST * heightOf(f), f.z]);
  });
};

/**
 * Whether the cut of `p`, striking now, meets the cut of the foe `f` (where `p` drew him) and the
 * two lock blades: `f` swings the katana and strikes within LOCK_WINDOW ticks of now, before or
 * after; each is within the other's reach and faces him within LOCK_FACING of his look; neither is
 * locked already.
 */
export const crossing = (p: PlayerState, f: PlayerState): boolean => {
  if (!f.wield || !f.swing || p.lock || f.lock) {
    return false;
  }
  const c = swingOf(f);
  if (Math.abs(c.strike - (c.ticks - f.swing)) > LOCK_WINDOW) {
    return false;
  }
  const [dx, dz] = [f.x - p.x, f.z - p.z];
  const d = Math.hypot(dx, dz);
  /** Whether `q` looks at most LOCK_FACING away from (x, z). */
  const faces = (q: PlayerState, x: number, z: number) => {
    const [fx, fz] = forward(q.yaw);
    return d < 1e-6 || (fx * x + fz * z) / d >= Math.cos(LOCK_FACING);
  };
  return (
    d - PLAYER_R <= Math.min(c.reach, swingOf(p).reach) && faces(p, dx, dz) && faces(f, -dx, -dz)
  );
};

/**
 * The way the shock of the cut of `p` throws the foe `f`, a unit vector on the floor plane: along
 * his look for a thrust, a slash and their specials; a cut across ends on the opposite side to the
 * one it starts from, so LEFT throws to his right and RIGHT to his left.
 */
export const knock = (p: PlayerState): [x: number, z: number] => {
  const [fx, fz] = forward(p.yaw);
  const c = p.cut ?? 0;
  return c === CUT.LEFT ? [-fz, fx] : c === CUT.RIGHT ? [fz, -fx] : [fx, fz];
};

/**
 * The LIMB the cut of `p` (the state after the step that struck) takes off `f` (as he saw him) when
 * it puts him down. The blade's line is his look from his chest (CHEST of his height), so a level
 * cut meets the foe's arms. It enters the foe's body (a circle of PLAYER_R on the floor plane) on
 * the near side; the side is the foe's own, measured where it enters, on his right axis. A slash
 * takes the head within MIDLINE of his middle, else the arm on that side. A thrust and a cut across
 * go by the line's height at the foe's distance, as a share of his height: above NECK the head,
 * below HIPS a leg, else an arm. A cut across takes the side facing where it comes from; a thrust
 * the side it enters, and no arm within MIDLINE of his middle. A special goes as its base cut.
 */
export const limbOf = (p: PlayerState, f: PlayerState): number => {
  const [fx, fz] = forward(p.yaw);
  const [gx, gz] = forward(f.yaw);
  const [dx, dz] = [f.x - p.x, f.z - p.z];
  // The foe's middle on the attacker's right (-fz, fx), and the way in from the line's closest
  // point to it, back along the look.
  const o = -fz * dx + fx * dz;
  const back = Math.sqrt(Math.max(PLAYER_R * PLAYER_R - o * o, 0));
  const [ex, ez] = [fz * o - fx * back, -fx * o - fz * back];
  // Where it enters on his right (-gz, gx).
  const s = -gz * ex + gx * ez;
  const c = (p.cut ?? 0) % SPECIAL_CUT;
  if (c === CUT.SLASH) {
    return Math.abs(s) <= MIDLINE ? LIMB.HEAD : s > 0 ? LIMB.ARM_R : LIMB.ARM_L;
  }
  const y = p.y + CHEST * heightOf(p) + Math.tan(p.pitch) * Math.hypot(dx, dz);
  const share = (y - f.y) / heightOf(f);
  if (share > NECK) {
    return LIMB.HEAD;
  }
  // A LEFT cut meets the side facing the attacker's left: his right when they face each other
  // (the looks opposed), his left when they look the same way. RIGHT is the other way round.
  const right = c === CUT.THRUST ? s > 0 : (c === CUT.LEFT ? 1 : -1) * (fx * gx + fz * gz) < 0;
  if (share < HIPS) {
    return right ? LIMB.LEG_R : LIMB.LEG_L;
  }
  return c === CUT.THRUST && Math.abs(s) <= MIDLINE ? LIMB.NONE : right ? LIMB.ARM_R : LIMB.ARM_L;
};
