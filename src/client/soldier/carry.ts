import { RUN_SPEED } from '../../shared/constants';
import { sabering } from '../../shared/gun';
import { TAU } from '../../shared/physics';
import { MODE } from '../../shared/types';
import type { PlayerState } from '../../shared/types';
import { KATANA_LEFT, KATANA_TILT, clasp, inv, reach, shrug, wield } from '../body';
import { LONG_HOLD, RIFLE_HOLD, RIFLE_TILT, foregrip, kindOf, shouldered } from '../gun';
import { BEHIND, BOW, DEFLECT_LOW, SWAY, bent, deflect, locked, parrying, poised } from '../katana';
import { add, basis, dot, sub, unit } from '../mesh';
import type { Vec3 } from '../mesh';
import { JOINT as J, PARENT, axis, mul, solve, turn } from '../rig';
import type { Pose } from '../rig';
import { lifted } from './animate';
import { far } from './common';
import type { Runner } from './types';

/**
 * A long gun's butt plate in the hollow of the right shoulder: from the shoulder joint, in the
 * chest's frame (to its right, up, back). The gun goes from there along the look, so it is
 * shouldered whatever the pitch (the user, 2026-11-10: it hung across the belly).
 */
export const POCKET: Vec3 = [-0.025, -0.01, -0.13];
/** How much further ahead the butt is when the gun points straight up or down the chest: its plate, on end, clear of it. */
const TIPPED = 0.05;
/**
 * How far the chest turns to the right behind a shouldered gun, the left shoulder toward its front
 * grip, at least and at most: a rifleman's bladed stance, radians.
 */
const BLADED = [0.5, 1.25];
/** The share of the barrel's pitch the trunk leans with. */
const LEAN = 0.6;
/**
 * How far the left wrist is from its shoulder at most, which the trunk turns for: the elbow bent
 * under 120 degrees under the gun, the shoulder left where it is (the user, 2026-11-10: the arm
 * stretched and pulled the shoulder out to reach the grip).
 */
const BENT = 0.47;
/** The low ready of a sprint: the barrel this far under the horizon and to the left of the look, the butt still in the shoulder. */
const LOW = [0.6, 0.35];
export const ease = (v: number) => (v = Math.min(Math.max(v, 0), 1)) * v * (3 - 2 * v);
/** How far a runner has his long gun down to the low ready, 0 to 1: in a sprint, when he is not firing. */
export const lowered = (r: Runner): number =>
  ease((Math.hypot(r.p.vx, r.p.vz) - RUN_SPEED - 0.5) / 1.5) * (1 - r.aim);

/**
 * The pose `from` (solved: `s0`) with the runner's long gun in both hands: the butt in the right
 * shoulder, the barrel along the look (at the shot while it fires) or down and across at the low
 * ready of a sprint, the left hand on its front grip. The trunk turns about the vertical behind
 * the gun until the left arm reaches its grip bent (BENT), and leans with the barrel's pitch; the
 * head stays on the look.
 */
export const carried = (from: Pose, s0: ReturnType<typeof solve>, r: Runner): Pose => {
  const { p } = r;
  const kind = kindOf(p);
  const low = lowered(r);
  const [side, top, look] = basis(p.yaw, p.pitch);
  const [x, u, f] = basis(p.yaw, 0);
  const d = basis(p.yaw + LOW[1], -LOW[0])[2];
  const way = unit([0, 1, 2].map(i => look[i] + (d[i] - look[i]) * low) as Vec3);
  const riding = p.mode == MODE.RIDE;
  const lean = axis(x, riding ? 0 : (LEAN * Math.asin(way[1])) / 2);
  const ahead = far(p);
  const pole = [0, 1, 2].map(i => -0.4 * x[i] - u[i] - 0.2 * f[i]) as Vec3;
  /** The trunk turned by `turned`, the gun shouldered in the right hand; the left hand's place on it, and how far its wrist is from its shoulder. */
  const hold = (turned: number) => {
    const pose = { ...from, rot: from.rot.slice() };
    for (const [j, k] of [
      [J.SPINE, 0.4],
      [J.CHEST, 0.6],
    ]) {
      const up = solve(pose).rot[PARENT[j]];
      pose.rot[j] = mul(
        inv(up),
        mul(mul(lean, axis([0, 1, 0], -k * turned)), mul(up, pose.rot[j])),
      );
    }
    let s = solve(pose);
    pose.rot[J.NECK] = mul(inv(s.rot[J.CHEST]), s0.rot[J.NECK]);
    const spine = turn(s.rot[J.CHEST], [0, 1, 0]);
    const tipped = Math.abs(way[0] * spine[0] + way[1] * spine[1] + way[2] * spine[2]);
    const butt = add(
      s.pos[J.ARM_R],
      turn(s.rot[J.CHEST], [POCKET[0], POCKET[1], POCKET[2] - TIPPED * tipped]),
    );
    const to = [0, 1, 2].map(
      i => (ahead[i] + (r.focus[i] - ahead[i]) * r.aim) * (1 - low) + (butt[i] + 30 * d[i]) * low,
    ) as Vec3;
    const [at, ax] = shouldered(butt, to, side, top, kind);
    const q = lifted(pose, s, [at, ax], 1, kind);
    s = solve(q);
    const [fore, g, up] = foregrip(s.pos[J.HAND_R], s.rot[J.HAND_R], kind);
    // The rail gun's front grip, as thin as its rear one, in the same open hold.
    const [len, palm] = up ? RIFLE_HOLD : LONG_HOLD;
    const sh = s.pos[J.ARM_L];
    // The rail gun's grip is taken from the shoulder's side and a little from over the elbow, as
    // a free hand takes a handle (wield()), the shoulder left where it is.
    const near = unit(sub(fore, sh));
    const over = unit(sub(pole, g.map(v => v * dot(pole, g)) as Vec3));
    wield(
      q,
      s,
      J.ARM_L,
      fore,
      g,
      pole,
      up ?? (near.map((v, i) => v - 0.3 * over[i]) as Vec3),
      [len, palm],
      up ? RIFLE_TILT : undefined,
    );
    // The elbow down under the gun, the hand as it holds: not out along the fingers.
    const held = solve(q);
    const hand = held.rot[J.HAND_L];
    reach(q, held, J.ARM_L, held.pos[J.HAND_L], pole);
    q.rot[J.HAND_L] = mul(inv(solve(q).rot[J.FOREARM_L]), hand);
    // Where the hand's turn puts the wrist, in reach or not, from the shoulder.
    const [fing, back] = [turn(hand, [0, -1, 0]), turn(hand, [1, 0, 0])];
    return {
      q,
      far: Math.hypot(...fore.map((v, i) => v - fing[i] * len - back[i] * palm - sh[i])),
    };
  };
  // The least turn that bends the left arm enough, by the secant. Seated, the trunk is square
  // to the seat unless the arm needs it.
  const least = riding ? 0 : BLADED[0];
  let [t0, h0] = [0, hold(least)];
  let [t, h] = [least, h0];
  for (let i = 0; i < 4 && (i ? Math.abs(h.far - BENT) > 2e-3 : h.far > BENT); i++) {
    const slope = i ? (h.far - h0.far) / (t - t0 || 1) : -0.3;
    [t0, h0] = [t, h];
    t = Math.min(Math.max(t + (BENT - h.far) / Math.min(slope, -0.05), least), BLADED[1]);
    h = hold(t);
  }
  return h.q;
};

/**
 * The katana in a swordsman's middle guard (the user, 2026-11-10: stand like a samurai): both
 * hands on the grip a fist before the navel, on the body's middle, the blade rising ahead toward a
 * foe's throat. The guard's numbers (see katana.ts) from the eye.
 */
const CARRY = [-0.02, -0.5, 0.26, 0, 0.45, 0.89];
/** How far left of the right hand the Hunter's left one is in his guard (brandish()), metres. */
const OFF_HAND = 0.26;
/**
 * The Hunter's guard, as CARRY: the claw higher and further ahead than a katana's grip, a
 * predator's (the user, 2026-11-24: more aggressive), its blades rising toward a foe.
 */
const HUNT = [0, -0.36, 0.42, 0, 0.6, 0.8];
/** How far the Hunter's trunk bends forward over his guard, radians (none through a cut). */
const HUNCH = 0.2;

/**
 * The pose with the katana in both hands: in the guard, or in a cut, which is the first person's cut
 * seen from the runner's eye (the share `e` of it, so that it is drawn from the guard and back to
 * it), and the trunk twisting, bending and leaning through it (trunk()).
 */
export const brandish = (
  from: Pose,
  p: PlayerState,
  prog: number,
  ph: number,
  t = 0,
  parry = Infinity,
  oneHand = false,
): Pose => {
  // In a saber lock the blade crosses the foe's, shaking, and the trunk leans into him.
  const lk = sabering(p);
  const e = lk ? 1 : prog < 0 ? 0 : ease(prog * 6) * ease((1 - prog) * 5);
  const k = lk ? locked(t) : poised(p, Math.max(prog, 0), t);
  // A parry snaps the blade across from whatever hold it is in, and holds its line (clasp()).
  const pe = parrying(parry);
  const base = oneHand ? HUNT : CARRY;
  const g = deflect(
    base.map((v, i) => v + (k[i] - v) * e),
    pe,
    DEFLECT_LOW,
  );
  g[1] += 0.02 * Math.sin(TAU * ph) * (1 - e);
  // A cut turns the whole body on its feet with a share of the trunk's twist.
  const [tw, sweep, ln] = lk ? [0, 0.15, 0] : prog < 0 ? [0, 0, 0] : bent(p, prog).map(v => v * e);
  // The Hunter hunched over his guard.
  const bd = sweep + (oneHand ? HUNCH * (1 - e) : 0);
  const spin = prog < 0 ? 0 : SWAY * tw;
  const pose = { ...from, yaw: from.yaw + spin };
  // The hands go round with the chest's whole twist and down and up with its bend.
  const [r, u, f] = basis(p.yaw + spin + (1 - SWAY) * tw, Math.max(p.pitch, -BOW) * e - 0.6 * bd);
  /** The camera's space at the eye (right, up, forward) to the world. */
  const turn = ([a, b, c]: number[]): Vec3 => [
    r[0] * a + u[0] * b + f[0] * c,
    r[1] * a + u[1] * b + f[1] * c,
    r[2] * a + u[2] * b + f[2] * c,
  ];
  const rot = pose.rot.slice();
  const q = { ...pose, rot };
  // The trunk twists, bends and leans through the cut (trunk()), the chest more than the waist.
  for (const [j, k] of [
    [J.SPINE, 0.4],
    [J.CHEST, 0.6],
  ]) {
    rot[j] = mul(
      rot[j],
      mul(mul(axis([0, 1, 0], tw * k), axis([1, 0, 0], -bd * k)), axis([0, 0, 1], ln * k)),
    );
  }
  const s = solve(q);
  // The eye of the head, which a run leans forward and the trunk carries: the hands go with it.
  const eye = s.pos[J.HEAD];
  // Both hands round the grip, the left one BEHIND the right, the elbows down and out, the wrists
  // straight: the katana and the fists go as one piece where the arms hold it (clasp()).
  const at = add(eye, turn(g.slice(0, 3)));
  const dir = unit(turn(g.slice(3, 6)));
  shrug(q, s, J.ARM_R, at);
  const poles: [Vec3, Vec3] = [turn([0.5, -1, -0.35]), turn([-0.5, -1, -0.35])];
  if (oneHand) {
    // The claw rides the forearm: each fist straight in line with its arm (the user, 2026-11-24),
    // the wrist left as the pose has it rather than turned onto a handle as wield() does. The
    // left hand up in the guard too, at the right one's height beside it, held there through a cut.
    reach(q, solve(q), J.ARM_R, at, poles[0]);
    const left = add(eye, turn([HUNT[0] - OFF_HAND, HUNT[1], HUNT[2]]));
    shrug(q, s, J.ARM_L, left);
    reach(q, solve(q), J.ARM_L, left, poles[1]);
    return q;
  }
  shrug(q, s, J.ARM_L, add(at, dir.map(v => -BEHIND * v) as Vec3));
  const [grip, d, right, left] = clasp(solve(q), at, dir, poles, 0.1 * (1 - 0.98 * pe));
  wield(q, s, J.ARM_R, grip, d, poles[0], right);
  wield(
    q,
    s,
    J.ARM_L,
    add(grip, d.map(v => -BEHIND * v) as Vec3),
    d,
    poles[1],
    left,
    KATANA_LEFT,
    KATANA_TILT,
    true,
  );
  return q;
};
