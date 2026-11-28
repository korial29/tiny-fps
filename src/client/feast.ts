// The xenomorph's glory kill as drawn (the user, 2026-11-16: it climbs onto its prey and eats his
// head; not as high as his chest, its head over his, its knees bent as knees bend): after its dash
// it lunges into him and climbs a little on him, its feet on his thighs, its claws over his
// shoulders, leaning over his head, rears its head back and bites; he bends back under it, his
// hands up against its chest. After the kill it lets go of him as he falls. Poses only: the host
// still holds the two a metre apart and nothing of it is on the wire. Pure, no DOM.
import { CUTS, EXEC, GLORY_TICKS, TICK_HZ } from '../shared/constants';
import { CUT } from '../shared/types';
import { BITE, arc, inv, reach } from './body';
import { add, basis, mix, sub, unit } from './mesh';
import type { Vec3 } from './mesh';
import { JOINT as J, RESTS, axis, mul, slerp, solve, turn } from './rig';
import type { Pose } from './rig';

export const FEAST = {
  /** The tick of the lock its lunge starts on (its dash is over at GLORY_DASH, 20), and the ticks it takes. */
  LEAP: [18, 18],
  /** Seconds it takes to let go of him after the kill. */
  DROP: 0.5,
  /** Its hop back off him after the kill (the user, 2026-11-17): how high it arcs, metres. */
  HOP: 0.45,
  /** Its pelvis in front of his feet, toward it, and how far it climbs, metres: a little, its head over his (the user, 2026-11-16). */
  CLING: 0.5,
  LIFT: 0.35,
  /** The tip back of its pelvis that stands its bent back up against him, radians. */
  UPRIGHT: 0.05,
  /** Its feet on the front of his thighs: across from his middle, toward it, and up; its knees forward and apart, as a knee bends. */
  FEET: [0.17, 0.22, 0.6],
  /** Its claws over his shoulders: across, toward it (negative: behind his front), and up. */
  CLAWS: [0.19, -0.08, 1.52],
  /** His bend back under its weight, spine to head (radians), and how far his hips sink (metres). */
  BEND: [0.16, 0.2, 0.12, 0.22],
  SINK: 0.1,
  /** His head thrown about in panic: the most it turns (radians) left and right, up and down, and over. */
  PANIC: [0.55, 0.35, 0.3],
  /**
   * His body fighting it (the user, 2026-11-16): the jerk back as it seizes him (radians, at the
   * middle of its lunge), then his chest twisting and his trunk rocking (radians), his hands shoving (metres).
   */
  STARTLE: 0.35,
  STRUGGLE: [0.3, 0.12, 0.07],
  /** Its head shaken left and right as it eats (the user, 2026-11-16): the most it turns (radians) and how often (Hz). */
  CHEW: [0.32, 6],
  /** Drops of blood a second from his head as it eats, and in the burst when his head goes. */
  GORE: [110, 40],
  /** His hands raised against it, at its neck and its chest, to tear it off him (the user, 2026-11-17): across, toward it, and up. */
  PUSH: [0.2, 0.36, 1.78],
  /** His hands clawing at it, each its own way: metres up and down, and across. */
  CLAW: [0.06, 0.04],
  /**
   * His hands on its belly as drawn (the user, 2026-11-17: on it, not through it): across from its
   * middle, off it toward him (its belly's radius), and up; they shove by pulling back off it.
   */
  HOLD: [0.1, 0.16, 0.04],
  /**
   * The two rocking left and right together as they fight (the user, 2026-11-17): metres aside,
   * radians of lean, and beats a second, on the lock's own ticks so both screens agree.
   */
  SWAY: [0.07, 0.12, 1.7],
  /** Drops of blood a second from his thighs while its feet grip them, and where: across and up. */
  GRIP: [30, 0.17, 0.62],
  /**
   * Seconds it keeps its head down at his after the kill, chewing, turned to him, and the last of
   * them lifting it slowly as the chewing dies out (the user, 2026-11-17: not all at once), only
   * once the killer's camera is back in his eye (KILLCAM.HOLD and BLEND).
   */
  FEED: [2.2, 0.8],
  /** How far down its head stays once it has lifted it (devour()'s scale: 0.7 in him), and the seconds it then takes to come up the rest (the user, 2026-11-17: it went too high). */
  LOW: [0.3, 1.2],
  /**
   * Its low hunting crouch at the end, as its head comes up from eating, as a cat's (the user,
   * 2026-11-17: standing first, on the hunt again only at the end): how far its hips sink and go back (metres); its back bent forward (radians:
   * spine, chest) and its neck lifting the head back up level; its claws ahead and low (metres
   * ahead of its pelvis, over the floor, across).
   */
  CROUCH: [0.3, 0.12, 0.35, 0.3, 0.45, 0.5, 0.35, 0.22],
} as const;

const length = (v: Vec3) => Math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2);
const clamp = (v: number) => Math.min(Math.max(v, 0), 1);
const ease = (u: number) => u * u * (3 - 2 * u);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const X: Vec3 = [1, 0, 0];

/** How far onto its prey the xenomorph is with `lock` ticks of its glory kill left: 0 on its feet, 1 on him. */
export const mounted = (lock: number): number =>
  ease(clamp((GLORY_TICKS - lock - FEAST.LEAP[0]) / FEAST.LEAP[1]));

/** Where `at` is from the other one, `to`: the yaw that faces him, the unit way to him, its right. */
const facing = (at: Vec3, to: Vec3): [number, Vec3, Vec3] => {
  const yaw = Math.atan2(-(to[0] - at[0]), -(to[2] - at[2]));
  const [right, , fwd] = basis(yaw, 0);
  return [yaw, fwd, right];
};

/** The point `side` across, `toward` along `f` and `up` over the floor from `o`. */
const off = (o: Vec3, r: Vec3, f: Vec3, side: number, toward: number, up: number): Vec3 => [
  o[0] + r[0] * side + f[0] * toward,
  o[1] + up,
  o[2] + r[2] * side + f[2] * toward,
];

/** The pose's limb from `j` (thigh or upper arm) onto `to`, the share `m` of the way from where it is. */
const limb = (q: Pose, j: number, to: Vec3, pole: Vec3, m: number) => {
  const s = solve(q);
  reach(q, s, j, mix(s.pos[j + 2], to, m), pole);
};

/**
 * The xenomorph's `pose` on its prey, whose feet are at `prey`, by the share `m` (mounted()): turned
 * to him and up on him, its feet on his thighs, its claws over his shoulders, leaning over his head.
 * `size` is his body's to a man's (Kit size): its holds and its climb go with it.
 */
export const seize = (pose: Pose, prey: Vec3, m: number, sway = 0, hop = 0, size = 1): Pose => {
  if (m <= 0) {
    return pose;
  }
  const [yaw, f, r] = facing(pose.at, prey);
  const rot = pose.rot.slice();
  rot[J.PELVIS] = mul(rot[J.PELVIS], axis(X, FEAST.UPRIGHT * m));
  const q: Pose = { ...pose, yaw: pose.yaw + wrap(yaw - pose.yaw) * m, rot };
  // The whole of it from where it is up to him, and up on him.
  const pelvis = solve(q).pos[J.PELVIS];
  const want = off(prey, r, f, 0, -FEAST.CLING * size, 0);
  const lift = FEAST.LIFT + FEAST.CLAWS[2] * (size - 1);
  q.at = [0, 1, 2].map(i => q.at[i] + (i == 1 ? lift : want[i] - pelvis[i]) * m) as Vec3;
  // Rocked to its right and back (swaying()): aside and leaning. Off him after the kill, a hop
  // back on an arc (`hop`, 0 to 1 and back), the back leaning away.
  q.at = off(q.at, r, f, FEAST.SWAY[0] * sway, 0, FEAST.HOP * hop);
  rot[J.PELVIS] = mul(rot[J.PELVIS], axis(X, 0.3 * hop));
  rot[J.PELVIS] = mul(axis([0, 0, 1], -FEAST.SWAY[1] * sway), rot[J.PELVIS]);
  // On a bigger prey (Kit size: the Hunter), its holds on him to his scale.
  const [feet, claws] = [FEAST.FEET, FEAST.CLAWS].map(v => v.map(c => c * size));
  for (const [side, thigh, arm] of [
    [-1, J.THIGH_L, J.ARM_L],
    [1, J.THIGH_R, J.ARM_R],
  ]) {
    limb(
      q,
      thigh,
      off(prey, r, f, side * feet[0], -feet[1], feet[2]),
      off([0, 0, 0], r, f, 0.6 * side, 1, 0.4),
      m,
    );
    // The elbows out and back.
    limb(
      q,
      arm,
      off(prey, r, f, side * claws[0], -claws[1], claws[2]),
      off([0, 0, 0], r, f, side, -0.5, -0.4),
      m,
    );
  }
  return q;
};

/**
 * The prey's `pose` under the xenomorph whose feet are at `eater`, by the share `m`: turned to it,
 * bent back with his hips sunk, his feet where they were, his arms raised against it (his hands on
 * its belly `bust` as drawn, when it is known), jerked
 * back as it seizes him, then fighting it, his head thrown about in panic, at `t` seconds (the
 * user, 2026-11-16).
 */
export const clutched = (
  pose: Pose,
  eater: Vec3,
  m: number,
  t = 0,
  bust?: Vec3,
  sway = 0,
): Pose => {
  if (m <= 0) {
    return pose;
  }
  const [yaw, f, r] = facing(pose.at, eater);
  const rot = pose.rot.slice();
  FEAST.BEND.forEach((a, i) => (rot[J.SPINE + i] = mul(rot[J.SPINE + i], axis(X, a * m))));
  const [tw, rk, shove] = FEAST.STRUGGLE.map(a => a * m);
  rot[J.SPINE] = mul(
    rot[J.SPINE],
    mul(
      axis(X, FEAST.STARTLE * Math.sin(Math.PI * m)),
      axis([0, 0, 1], rk * Math.sin(4.3 * t + 1)),
    ),
  );
  rot[J.CHEST] = mul(
    rot[J.CHEST],
    axis([0, 1, 0], tw * (0.6 * Math.sin(5.7 * t) + 0.4 * Math.sin(9.1 * t + 2))),
  );
  // Each way at its own pace, so it never repeats the same jerk.
  const [yw, pt, rl] = FEAST.PANIC.map(a => a * m);
  rot[J.HEAD] = mul(
    rot[J.HEAD],
    mul(
      axis([0, 1, 0], yw * (0.7 * Math.sin(11.3 * t) + 0.3 * Math.sin(17.9 * t + 1))),
      mul(axis(X, pt * Math.sin(8.7 * t + 2)), axis([0, 0, 1], rl * Math.sin(6.1 * t + 4))),
    ),
  );
  // Rocked with it, the same way in the world: to his left as it goes to its right.
  rot[J.SPINE] = mul(rot[J.SPINE], axis([0, 0, 1], FEAST.SWAY[1] * sway));
  const q: Pose = { ...pose, yaw: pose.yaw + wrap(yaw - pose.yaw) * m, rot };
  const feet = solve(q);
  q.hips = [q.hips[0] - 0.6 * FEAST.SWAY[0] * sway, q.hips[1] - FEAST.SINK * m, q.hips[2]];
  for (const [side, thigh, arm] of [
    [-1, J.THIGH_L, J.ARM_L],
    [1, J.THIGH_R, J.ARM_R],
  ]) {
    // Each foot back where it stood, the knee bent ahead.
    reach(q, solve(q), thigh, feet.pos[thigh + 2], f);
    // Raised against it in panic, each hand shoving and clawing at its own time, the elbows down
    // and a little out, as a push bends them (the user, 2026-11-17): on its belly as drawn
    // (`bust`), shoving by pulling back off it, never into it.
    const [lift, wide] = FEAST.CLAW.map(a => a * m);
    const jab = shove * Math.max(Math.sin(7.9 * t + (side - 1) * 1.7), 0);
    const claw = lift * Math.sin(9.7 * t + side * 2.3);
    const sway = wide * Math.sin(6.1 * t + side);
    const [across, out, up] = FEAST.HOLD;
    const push = FEAST.PUSH;
    const to = bust
      ? off(bust, r, f, side * across + sway, -out - jab, up + claw)
      : off(pose.at, r, f, side * push[0] + sway, push[1] - jab, push[2] + claw);
    limb(q, arm, to, off([0, 0, 0], r, f, 0.6 * side, -0.2, -1), m);
  }
  return q;
};

/**
 * How hard the xenomorph eats, 0 to 1: from its strike (BITE[1]) to the kill with `lock` ticks
 * left, then `mount` as it lets go of him (lock 0).
 */
export const eating = (lock: number, mount: number): number =>
  lock ? +(GLORY_TICKS - lock >= BITE[1]) * mount : mount;

/** The xenomorph's `pose` with its head shaken left and right, `a` of the way (eating()), at `t` seconds. */
export const chew = (pose: Pose, a: number, t: number): Pose => {
  if (a <= 0) {
    return pose;
  }
  const rot = pose.rot.slice();
  const w = 2 * Math.PI * FEAST.CHEW[1] * t;
  rot[J.NECK] = mul(rot[J.NECK], axis([0, 1, 0], 0.4 * FEAST.CHEW[0] * a * Math.sin(w - 0.6)));
  rot[J.HEAD] = mul(rot[J.HEAD], axis([0, 1, 0], FEAST.CHEW[0] * a * Math.sin(w)));
  return { ...pose, rot };
};

/**
 * The katana's execution as drawn (EXEC, the user 2026-11-17): its victim turns to the swordsman as
 * he dashes in (TURN ticks), drops on the strike of the thrust (KNEEL: from that tick, over so
 * many) onto one knee, the right, the left foot ahead (STEP, metres), his hips LOW metres lower,
 * bent over in pain (BOW, radians: spine, chest, neck) with his hands on his belly (BELLY: across,
 * ahead and over his pelvis), panting (PANT: radians of the chest's heave, beats a second) and his
 * head shaking no (NO: radians each way, shakes a second); the swordsman runs him through, draws
 * the blade out, raises it over his head in both hands (RAISE: from that tick, over so many),
 * holds it there and brings it down on the bowed neck (the user, 2026-11-19: a samurai's
 * execution, a thrust first, no turn on himself); on the thrust a spurt of WOUND drops of blood, and when
 * his head goes NECK drops, then BLEED a second from the neck for BLEEDING seconds.
 */
export const EXECUTE = {
  TURN: 8,
  KNEEL: [EXEC.CUTS[0] + CUTS[CUT.THRUST].strike, 10],
  STEP: 0.4,
  /** The kneeling leg over the floor, metres: the knee joint, the ankle and the toes' joint. */
  SOLE: [0.09, 0.15, 0.06],
  LOW: 0.42,
  BOW: [0.25, 0.4, 0.2],
  BELLY: [0.08, 0.2, 0.1],
  PANT: [0.07, 2.6],
  NO: [0.4, 1.4],
  RAISE: [EXEC.CUTS[0] + CUTS[CUT.THRUST].ticks, 14],
  /** The beheaded body, still on its knee, tips over onto its right side about it: in so many seconds, so far (radians). */
  FALL: [0.7, 1.45],
  /** Its bounce on the floor: a share of the fall, how fast it dies out, its rate (rad/s); and the seconds it takes to go limp. */
  SETTLE: [0.06, 5, 14],
  LIMP: 1.1,
  WOUND: 25,
  NECK: 45,
  BLEED: 60,
  BLEEDING: 0.8,
} as const;

/** Ticks into the execution with `lock` ticks of it left. */
const into = (lock: number) => EXEC.TICKS - lock;

/** How far down on his knees its victim is with `lock` ticks left, 0 to 1. */
export const kneeling = (lock: number): number =>
  ease(clamp((into(lock) - EXECUTE.KNEEL[0]) / EXECUTE.KNEEL[1]));

/**
 * Where in the cut down's swing (katana.ts stroke()) the swordsman's blade is drawn with `lock`
 * ticks left and his own swing at `prog`: his thrust first (-1: his own cut, as it is), then, the
 * blade drawn out of him and back in the guard, up to the top of the cut down's wind-up (`top`),
 * held there until that cut comes down from it.
 */
export const raised = (lock: number, prog: number, top: number): number => {
  const [e, [from, over]] = [into(lock), EXECUTE.RAISE];
  return e < from
    ? -1
    : e < EXEC.CUTS[1]
      ? top * ease(clamp((e - from) / over))
      : Math.max(prog, top);
};

/**
 * The victim's `pose` before the swordsman whose feet are at `killer`, with `lock` ticks of the
 * execution left, at `t` seconds: turned to him, then down on his right knee, his left foot ahead,
 * bent over with his hands on his belly, panting, his head shaking no.
 */
export const kneel = (pose: Pose, killer: Vec3, lock: number, t = 0): Pose => {
  const [turn, k] = [clamp(into(lock) / EXECUTE.TURN), kneeling(lock)];
  const [yaw, f, r] = facing(pose.at, killer);
  const q: Pose = { ...pose, yaw: pose.yaw + wrap(yaw - pose.yaw) * turn };
  if (k <= 0) {
    return q;
  }
  const rot = (q.rot = pose.rot.slice());
  const [pant, beat] = EXECUTE.PANT;
  const heave = pant * Math.sin(2 * Math.PI * beat * t);
  const [no, shakes] = EXECUTE.NO;
  EXECUTE.BOW.forEach((a, i) => {
    rot[J.SPINE + i] = mul(rot[J.SPINE + i], axis(X, -(a + (i == 1 ? heave : 0)) * k));
  });
  rot[J.HEAD] = mul(rot[J.HEAD], axis([0, 1, 0], no * k * Math.sin(2 * Math.PI * shakes * t)));
  q.hips = [q.hips[0], q.hips[1] - (EXECUTE.LOW + 0.3 * heave) * k, q.hips[2]];
  // The left foot planted ahead, its knee up.
  const floor = q.at[1];
  let s = solve(q);
  const hipL = s.pos[J.THIGH_L];
  const step: Vec3 = [hipL[0] + f[0] * EXECUTE.STEP, floor + 0.1, hipL[2] + f[2] * EXECUTE.STEP];
  reach(q, s, J.THIGH_L, mix(s.pos[J.FOOT_L], step, k), [f[0], 1, f[2]]);
  // The right knee down on the floor, as far ahead of the hip as the thigh lets it; the shin back
  // from it, the heel up, the toes tucked under on the floor (they went through it, flat).
  s = solve(q);
  const [hip, kn, ft, toe] = [J.THIGH_R, J.SHIN_R, J.FOOT_R, J.TOE_R].map(j => s.pos[j]);
  const [thigh, shin, foot] = [length(sub(kn, hip)), length(sub(ft, kn)), length(sub(toe, ft))];
  const [knee, ankle, tip] = EXECUTE.SOLE;
  const fore = Math.sqrt(Math.max(thigh ** 2 - (hip[1] - floor - knee) ** 2, 0));
  const back = Math.sqrt(shin ** 2 - (ankle - knee) ** 2) - fore;
  const heel: Vec3 = [hip[0] - f[0] * back, floor + ankle, hip[2] - f[2] * back];
  reach(q, s, J.THIGH_R, mix(ft, heel, k), f);
  s = solve(q);
  const under = Math.sqrt(Math.max(foot ** 2 - (ankle - tip) ** 2, 0));
  const to = sub(off(s.pos[J.FOOT_R], [0, 0, 0], f, 0, under, tip - ankle), s.pos[J.FOOT_R]);
  const laid = mul(arc(unit(sub(s.pos[J.TOE_R], s.pos[J.FOOT_R])), unit(to)), s.rot[J.FOOT_R]);
  q.rot[J.FOOT_R] = slerp(q.rot[J.FOOT_R], mul(inv(s.rot[J.SHIN_R]), laid), k);
  // His hands on his belly, the elbows out.
  const pelvis = solve(q).pos[J.PELVIS];
  const [across, ahead, up] = EXECUTE.BELLY;
  for (const [side, arm] of [
    [-1, J.ARM_L],
    [1, J.ARM_R],
  ]) {
    const to = off(pelvis, r, f, side * across, ahead, up);
    limb(q, arm, to, off([0, 0, 0], r, f, side, 0.2, -0.6), k);
  }
  return q;
};

/**
 * How far the beheaded body has tipped over `t` seconds after the kill, radians: faster as it goes,
 * as a fall does, then a small bounce on the floor (SETTLE: its share, how fast it dies out, its rate).
 */
export const toppled = (t: number): number => {
  const [T, A] = EXECUTE.FALL;
  const [k, damp, w] = EXECUTE.SETTLE;
  return t < T ? A * (t / T) ** 2 : A * (1 + k * Math.exp(-damp * (t - T)) * Math.sin(w * (t - T)));
};

/** How far a beheaded body's joints go limp, toward their rest, as it tips over: the arms down along it (the user, 2026-11-17). */
const LIMP: [number, number][] = [
  [J.THIGH_L, 0.7],
  [J.SHIN_L, 0.85],
  [J.FOOT_L, 0.5],
  [J.ARM_L, 1],
  [J.FOREARM_L, 0.9],
  [J.HAND_L, 1],
  [J.ARM_R, 1],
  [J.FOREARM_R, 0.9],
  [J.HAND_R, 1],
];

/**
 * The kneeling `pose` `t` seconds after his head went: tipped onto its right side about its right
 * knee on the floor (toppled()), or about `pivot` (the xenomorph's prey, standing: his right foot),
 * going limp as it goes (the user, 2026-11-17: not stiff): the raised leg stretching out, the arms
 * falling along the body, the trunk slumping and turning a little.
 */
export const topple = (pose: Pose, t: number, pivot: number = J.SHIN_R): Pose => {
  const a = toppled(t);
  if (a <= 0) {
    return pose;
  }
  const limp = ease(clamp(t / EXECUTE.LIMP));
  const rot = pose.rot.slice();
  for (const [j, k] of LIMP) {
    rot[j] = slerp(rot[j], [0, 0, 0, 1], k * limp);
  }
  rot[J.SPINE] = mul(rot[J.SPINE], axis(X, -0.25 * limp));
  rot[J.CHEST] = mul(rot[J.CHEST], mul(axis(X, -0.15 * limp), axis([0, 1, 0], 0.2 * limp)));
  const s = solve({ ...pose, rot });
  const knee = s.pos[pivot];
  const R = axis(basis(pose.yaw, 0)[2], a);
  const Y = axis([0, 1, 0], pose.yaw);
  // The turn about the knee in the frame of the yaw, the pelvis put where it takes it.
  rot[J.PELVIS] = mul(mul(inv(Y), mul(R, Y)), rot[J.PELVIS]);
  const pelvis = add(knee, turn(R, sub(s.pos[J.PELVIS], knee)));
  const base = (pose.rest ?? RESTS[0])[0];
  const hips = turn(inv(Y), sub(pelvis, pose.at)).map((v, i) => v - base[i]) as Vec3;
  return { ...pose, rot, hips };
};

/**
 * How far the two rock as they fight with `lock` ticks of the glory kill left, -1 to 1, times how
 * far it is on him (`m`): on the lock's ticks, which both of them count, so the two go together.
 */
export const swaying = (lock: number, m: number): number =>
  m * Math.sin((2 * Math.PI * FEAST.SWAY[2] * (GLORY_TICKS - lock)) / TICK_HZ);

/**
 * The xenomorph's `pose` turned to its prey at `prey`, `w` of the way, its neck and head with its
 * body rather than after the player's look (the user, 2026-11-17: its head on him all along).
 */
export const intent = (pose: Pose, prey: Vec3, w: number): Pose => {
  if (w <= 0) {
    return pose;
  }
  const [yaw] = facing(pose.at, prey);
  const rot = pose.rot.slice();
  for (const j of [J.NECK, J.HEAD]) {
    rot[j] = slerp(rot[j], [0, 0, 0, 1], w);
  }
  return { ...pose, yaw: pose.yaw + wrap(yaw - pose.yaw) * w, rot };
};

/**
 * The xenomorph's `pose` down in a low hunting crouch, `w` of the way (CROUCH): its hips sunk and
 * back, its feet where they were, its back bent forward and its head kept up, its claws ahead and low.
 */
export const crouch = (pose: Pose, w: number): Pose => {
  if (w <= 0) {
    return pose;
  }
  const [sink, back, spine, chest, neck, ahead, low, across] = FEAST.CROUCH;
  const f = basis(pose.yaw, 0)[2];
  const r = basis(pose.yaw, 0)[0];
  const feet = solve(pose);
  const rot = pose.rot.slice();
  rot[J.SPINE] = mul(rot[J.SPINE], axis(X, -spine * w));
  rot[J.CHEST] = mul(rot[J.CHEST], axis(X, -chest * w));
  rot[J.NECK] = mul(rot[J.NECK], axis(X, neck * w));
  const q: Pose = {
    ...pose,
    rot,
    hips: [pose.hips[0], pose.hips[1] - sink * w, pose.hips[2] + back * w],
  };
  for (const [side, thigh, arm] of [
    [-1, J.THIGH_L, J.ARM_L],
    [1, J.THIGH_R, J.ARM_R],
  ]) {
    // The feet where they stood, the knees bent ahead over them.
    reach(q, solve(q), thigh, feet.pos[thigh + 2], f);
    const pelvis = solve(q).pos[J.PELVIS];
    const claw = off([pelvis[0], pose.at[1], pelvis[2]], r, f, side * across, ahead, low);
    limb(q, arm, claw, off([0, 0, 0], r, f, side, -0.3, 0.2), w);
  }
  return q;
};

/**
 * The fists' execution as drawn (EXEC, the user 2026-11-17: a glory kill for everyone, the victim's
 * kneel the katana's, the killer's blows his own), in ticks of the lock: turned to his victim over
 * TURN, the right fist drawn back low by the hip (GUT: cocked, still cocked), driven up into his
 * belly on the strike of the katana's thrust, so the victim kneels on it (home), buried there as he
 * folds (held), back to the guard (back); the left hand on the back of his bowed head, holding it
 * (GRAB: from, on); the right fist raised high over the shoulder (SMASH: from, raised), held there a
 * beat, brought down onto his head on the lock's last tick, as it bursts. Past the lock, the punch
 * follows through and the guard comes back (AFTER: ticks of each). The body turns behind the blows:
 * the chest's TWIST, the trunk's BEND forward (radians) and the hips' SINK (metres) at the gut punch
 * and at the smash, the trunk leaning back RISE as the fist is raised. Places are across, ahead and
 * up from the killer's feet: the GUARD by the chin (right, left), the fist COCKED by the hip, RAISED
 * over the shoulder and through, PAST, after the head; on the victim: the fist on his belly, ahead of
 * his spine (BELLY), and on the front of his head (FACE: toward the killer, up from its joint); the
 * left hand on the back of it (NAPE).
 */
export const PUMMEL = {
  TURN: 6,
  GUT: [24, 31, EXECUTE.KNEEL[0], 44, 54],
  GRAB: [50, 60],
  SMASH: [58, 74, 80, EXEC.TICKS],
  AFTER: [8, 24],
  TWIST: [0.45, 0.55],
  BEND: [0.35, 0.45],
  SINK: [0.08, 0.16],
  RISE: 0.08,
  GUARD: [
    [0.15, 0.3, 1.36],
    [-0.13, 0.34, 1.4],
  ],
  COCKED: [0.3, -0.1, 0.98],
  RAISED: [0.26, -0.16, 1.98],
  PAST: [0.1, 0.5, 0.72],
  BELLY: 0.19,
  FACE: [0.12, 0.06],
  // Over the crown on his side, where the arm reaches at EXEC.FIST (the user, 2026-11-24).
  NAPE: [-0.1, 0.12],
  /** Drops of blood as the head bursts, and how fast they fly; a spurt from the belly and the mouth on the gut punch. */
  BURST: [140, 4.5],
  SPURT: [14, 8],
  /**
   * His way in (the user, 2026-11-17: not a slide, and a leap that looks like one): a fighter's
   * bound over the host's dash (GLORY_DASH ticks). He dips and pushes off the back foot, is in the
   * air from tick OFF to ON, TOP metres up at the middle (a parabola), the left knee driven up ahead
   * and the right leg folded behind, the left foot reaching down to land first and the right one
   * stepping in after; the knees take the landing. Keys [tick, value] of each foot (metres ahead of
   * his feet and up from them, the flight's lift apart), of the hips (metres down) and of the lean
   * forward (radians); the last of each his fighting stance, the feet under him whatever the gait
   * left behind, WIDE apart.
   */
  LEAP: { OFF: 3, ON: 19, TOP: 0.3, WIDE: 0.13 },
  LEAD: [
    [0, 0.13, 0],
    [3, 0.08, 0.03],
    [8, 0.32, 0.26],
    [14, 0.36, 0.18],
    [19, 0.2, 0],
    [21, 0.13, 0],
  ],
  TRAIL: [
    [0, -0.16, 0],
    [3, -0.36, 0],
    [7, -0.46, 0.22],
    [13, -0.34, 0.3],
    [19, -0.28, 0.06],
    [24, -0.16, 0],
  ],
  HIPS: [
    [0, 0.05],
    [2, 0.15],
    [4, 0.02],
    [11, 0.06],
    [19, 0.04],
    [22, 0.2],
    [27, 0.12],
    [34, 0.05],
  ],
  LEAN: [
    [0, 0],
    [2, 0.12],
    [5, 0.3],
    [14, 0.15],
    [21, 0.32],
    [30, 0.06],
    [36, 0],
  ],
} as const;

/** A fists' execution's killer, in its lock: his blows are drawn (pummel()), no weapon in hand. */
export const pummeling = (p: { exec?: number; lock?: number; wield?: boolean }): boolean =>
  p.exec === EXEC.KILLER && !!p.lock && !p.wield;

/** The victim of a fists' execution as the killer last saw him: his feet, and his belly and head when drawn. */
export interface Prey {
  feet: Vec3;
  belly?: Vec3;
  head?: Vec3;
}

/** Of eased keys [tick, value], the value at `e`: a strike's key (`hard`) speeds up into it, as a blow does. */
const along = <T>(
  keys: [number, T, boolean?][],
  e: number,
  blend: (a: T, b: T, u: number) => T,
): T => {
  let i = 0;
  while (i < keys.length - 1 && e >= keys[i + 1][0]) {
    i++;
  }
  if (i == keys.length - 1 || e <= keys[0][0]) {
    return keys[e <= keys[0][0] ? 0 : i][1];
  }
  const [[t0, a], [t1, b, hard]] = [keys[i], keys[i + 1]];
  const u = clamp((e - t0) / (t1 - t0));
  return blend(a, b, hard ? u * u : ease(u));
};

const num = (a: number, b: number, u: number) => a + (b - a) * u;

/**
 * The swordsman's legs through the katana's execution (the user, 2026-11-19: he stood fixed to the
 * floor): keys [tick of the lock, hips forward, hips down, right foot forward, right foot up]
 * (metres). He draws back, lunges onto his right foot behind the thrust, comes back as he draws
 * the blade out, rises as he raises it, then steps in and sinks under the cut down, and stands
 * up again after it.
 */
const [c0, home] = [EXEC.CUTS[0], EXECUTE.KNEEL[0]];
const [top, down] = [EXECUTE.RAISE[0] + EXECUTE.RAISE[1], EXEC.TICKS - 1];
export const LUNGE = [
  [c0 - 4, 0, 0, 0, 0],
  // A tick from the draw and two from the strike, not three each: the thrust strikes 8 ticks in since
  // the user's quicker cuts (2026-11-28), not 10: the lunge keeps 5 ticks between, and is
  // further on by the last key (0.1, 0.08, 0.2, 0.07 before), so that its last two ticks are no jump.
  [c0 + 1, -0.07, 0.05, 0, 0],
  [home - 2, 0.15, 0.1, 0.25, 0.06],
  [home, 0.26, 0.15, 0.34, 0],
  [home + 7, 0.26, 0.15, 0.34, 0],
  [home + 14, 0.1, 0.06, 0.18, 0.06],
  [top - 6, 0, 0.02, 0, 0],
  [top, -0.04, 0, 0, 0],
  [down - 9, -0.04, 0, 0, 0],
  [down - 4, 0.04, 0.06, 0.14, 0.06],
  [down, 0.14, 0.15, 0.26, 0],
  [down + 16, 0.14, 0.15, 0.26, 0],
  [down + 30, 0.04, 0.05, 0.1, 0.05],
  [down + 40, 0, 0, 0, 0],
];

/** The swordsman's `pose` `e` ticks into the katana's execution (past EXEC.TICKS after the kill): his hips and his right foot on LUNGE, the left where it stands. */
export const lunge = (pose: Pose, e: number): Pose => {
  const [fwd, sink, step, up] = along(
    LUNGE.map(([t, ...v], i) => [t, v, i == 3 || i == 10] as [number, number[], boolean]),
    e,
    (a, b, u) => a.map((v, j) => num(v, b[j], u)),
  );
  if (!(fwd || sink || step || up)) {
    return pose;
  }
  const q: Pose = { ...pose, rot: pose.rot.slice() };
  const [r, , f] = basis(q.yaw, 0);
  const was = solve(q);
  q.hips = [q.hips[0], q.hips[1] - sink, q.hips[2] - fwd];
  for (const [j, a, h] of [
    [J.THIGH_L, 0, 0],
    [J.THIGH_R, step, up],
  ]) {
    reach(q, solve(q), j, off(was.pos[j + 2], r, f, 0, a, h), [f[0], 0.3, f[2]]);
    // The sole as it lay, whatever the shin does over it.
    q.rot[j + 2] = mul(inv(solve(q).rot[j + 1]), was.rot[j + 2]);
  }
  return q;
};

/**
 * The killer's `pose` in the fists' execution `e` ticks into its lock (past EXEC.TICKS after the
 * kill, a fraction between ticks), on `prey`: turned to him, the blows of PUMMEL, his feet where
 * they were. Faded out over the end of AFTER.
 */
export const pummel = (pose: Pose, e: number, prey: Prey): Pose => {
  const [follow, back] = PUMMEL.AFTER;
  const end = EXEC.TICKS + follow;
  const w = e <= end ? 1 : 1 - ease(clamp((e - end) / back));
  if (w <= 0) {
    return pose;
  }
  const [yaw, f, r] = facing(pose.at, prey.feet);
  const turn = ease(clamp(e / PUMMEL.TURN)) * w;
  const q: Pose = { ...pose, yaw: pose.yaw + wrap(yaw - pose.yaw) * turn, rot: pose.rot.slice() };
  const [g0, c0, home, held, gone] = PUMMEL.GUT;
  const [from, raised, poised, smash] = PUMMEL.SMASH;
  // The chest turned behind each blow, the trunk bent into it, the hips down.
  const k = (a: number, b: number): [number, number][] => [
    [0, 0],
    [g0, -0.6 * a],
    [c0, -0.7 * a],
    [home, b],
    [held, b],
    [gone, 0],
    [from, 0],
    [raised, -a],
    [poised, -a],
    [smash, b],
    [end, 0.6 * b],
    [end + back, 0],
  ];
  const keyed = (a: number, b: number) =>
    along(
      k(a, b).map(([t, v], i) => [t, v, i == 3 || i == 9] as [number, number, boolean]),
      e,
      num,
    ) * w;
  const twist = keyed(PUMMEL.TWIST[0], PUMMEL.TWIST[1]);
  // Forward into the gut punch (BEND[0]), back as the fist is raised, forward into the smash.
  const first = (i: number) => (e < from ? PUMMEL.BEND[0] / PUMMEL.BEND[1] : 1) * i;
  const lean = (k: readonly (readonly number[])[]) =>
    along(
      k.map(([t, v]) => [t, v] as [number, number]),
      e,
      num,
    );
  const bend = first(keyed(PUMMEL.RISE, PUMMEL.BEND[1])) + lean(PUMMEL.LEAN) * w;
  const sink =
    Math.max(keyed(0, PUMMEL.SINK[1]), 0) * (e < from ? PUMMEL.SINK[0] / PUMMEL.SINK[1] : 1);
  const feet = solve(q);
  q.rot[J.SPINE] = mul(q.rot[J.SPINE], axis(X, -0.4 * bend));
  q.rot[J.CHEST] = mul(axis([0, 1, 0], twist), mul(q.rot[J.CHEST], axis(X, -0.6 * bend)));
  // The bound in over the dash (LEAP): its flight a parabola, the hips his own (not the gait's dash
  // crouch), each foot on its keys, the left knee ahead, the right folded behind.
  const { OFF, ON, TOP, WIDE } = PUMMEL.LEAP;
  const v = clamp((e - OFF) / (ON - OFF));
  q.at = [q.at[0], q.at[1] + TOP * 4 * v * (1 - v) * w, q.at[2]];
  const down = lean(PUMMEL.HIPS);
  q.hips = q.hips.map((h, i) => h * (1 - w) + (i == 1 ? -down * w - sink : 0)) as Vec3;
  for (const [side, thigh, keys] of [
    [-1, J.THIGH_L, PUMMEL.LEAD],
    [1, J.THIGH_R, PUMMEL.TRAIL],
  ] as const) {
    const [ahead, up] = along(
      keys.map(([t, a, u]) => [t, [a, u]] as [number, number[]]),
      e,
      (a, b, u) => [num(a[0], b[0], u), num(a[1], b[1], u)],
    );
    const own = off(q.at, r, f, side * WIDE, ahead, 0.06 + up);
    reach(q, solve(q), thigh, mix(feet.pos[thigh + 2], own, w), off([0, 0, 0], r, f, 0, 1, -0.4));
  }
  // Where the blows land on him: his belly and his head as drawn, else as a kneel would put them.
  const kn = kneeling(EXEC.TICKS - Math.min(e, EXEC.TICKS));
  const belly = off(
    prey.belly ?? off(prey.feet, r, f, 0, 0, 1.1 - EXECUTE.LOW * kn),
    r,
    f,
    0,
    -PUMMEL.BELLY,
    0,
  );
  const head = prey.head ?? off(prey.feet, r, f, 0, -0.15 * kn, 1.62 - EXECUTE.LOW * kn);
  const at = (p: readonly number[]) => off(pose.at, r, f, p[0], p[1], p[2]);
  const [guardR, guardL] = PUMMEL.GUARD.map(at);
  const fist = along<Vec3>(
    [
      [0, guardR],
      [g0, at(PUMMEL.COCKED)],
      [c0, at(PUMMEL.COCKED)],
      [home, belly, true],
      [held, belly],
      [gone, guardR],
      [from, guardR],
      [raised, at(PUMMEL.RAISED)],
      [poised, at(PUMMEL.RAISED)],
      [smash, off(head, r, f, 0, -PUMMEL.FACE[0], PUMMEL.FACE[1]), true],
      [end, at(PUMMEL.PAST)],
      [end + back, guardR],
    ],
    e,
    mix,
  );
  const [grab, holding] = PUMMEL.GRAB;
  const hand = along<Vec3>(
    [
      [0, guardL],
      [grab, guardL],
      [holding, off(head, r, f, 0, PUMMEL.NAPE[0], PUMMEL.NAPE[1])],
      [smash, off(head, r, f, 0, PUMMEL.NAPE[0], PUMMEL.NAPE[1])],
      [end, guardL],
    ],
    e,
    mix,
  );
  // The elbow down and out, raised and out over the shoulder for the punch down.
  const high = along<number>(
    [
      [0, 0],
      [from, 0],
      [raised, 1],
      [smash, 0.6],
      [end, 0],
    ],
    e,
    num,
  );
  limb(q, J.ARM_R, fist, off([0, 0, 0], r, f, 0.7, -0.4, 1.4 * high - 0.8), w);
  limb(q, J.ARM_L, hand, off([0, 0, 0], r, f, -0.7, -0.3, -0.8), w);
  return q;
};
