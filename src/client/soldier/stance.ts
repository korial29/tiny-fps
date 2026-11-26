import { BLOW, EXEC } from '../../shared/constants';
import { ROLE } from '../../shared/kit';
import { floored } from '../../shared/physics';
import { CUT, MODE } from '../../shared/types';
import type { PlayerState } from '../../shared/types';
import { arc, devour, reach, stowed, wield } from '../body';
import {
  FEAST,
  chew,
  clutched,
  crouch,
  eating,
  intent,
  kneel,
  lunge,
  pummel,
  raised,
  seize,
  swaying,
  topple,
} from '../feast';
import { footing } from '../footing';
import { FOOT_UP } from '../fours';
import { HOOK, JAB, LUNGE, SIDE, TAIL_BLOW, armOf } from '../gait';
import { BROUGHT, aimed, axes, grip, kindOf, loadFrame, span, swapOf } from '../gun';
import { SLASH_TOP } from '../katana';
import { basis } from '../mesh';
import type { Vec3 } from '../mesh';
import { fetched, pouchAt } from '../pouch';
import { JOINT as J, REST, RESTS, axis, mul, rest, slerp, solve, turn } from '../rig';
import type { Pose, Quat } from '../rig';
import { FOOT_TIP } from '../xeno';
import { FLINCH, lifted } from './animate';
import { brandish, carried, ease } from './carry';
import { driving } from './grasp';
import { SEATED } from './runner';
import type { Runner } from './types';

/**
 * Appends a runner at level of detail `lod` (see body(): 0 far, 1 near, 3 close; its weapon is near
 * when the runner is close): the jacket in `color` (r, g, b), dark
 * trousers, skin, hair in his own colour (hairOf()) and light shoes, posed by its gait. A dash trails a few glowing streaks.
 */
/**
 * The xenomorph's crouch over the gait's pose: the back bent forward and the head held up level, and
 * on a floor the hips lower with the heels lifted off it, the balls of the feet where they were:
 * the legs read as an animal's: the hips a little higher, the foot's long bone near upright over its
 * ball, the bones straight (the user, 2026-11-15: a deeper crouch bowed the legs into an arc).
 */
/** Where the ankle stands over the ball once the foot is tipped FOOT_UP: up, and behind it. */
const ANKLE = [
  -(FOOT_TIP[1] * Math.cos(FOOT_UP) + FOOT_TIP[2] * Math.sin(FOOT_UP)),
  FOOT_TIP[1] * Math.sin(FOOT_UP) - FOOT_TIP[2] * Math.cos(FOOT_UP),
];

const prowl = (pose: Pose, s: ReturnType<typeof solve>, p: PlayerState): Pose => {
  const rot = pose.rot.slice();
  const X: Vec3 = [1, 0, 0];
  // Bent, but not squat (the user, 2026-11-15): the neck clear. The head a little lower than the
  // look, the face tipped down at the foe (the user, 2026-11-25: held too high, it lacked menace).
  rot[J.SPINE] = mul(rot[J.SPINE], axis(X, -0.2));
  rot[J.CHEST] = mul(rot[J.CHEST], axis(X, -0.16));
  rot[J.NECK] = mul(rot[J.NECK], axis(X, 0.06));
  rot[J.HEAD] = mul(rot[J.HEAD], axis(X, -0.16));
  // Out of a blow, the upper arms hang lower than the runner's guard, the elbows still bent so the
  // claws point ahead: raised forward, the shoulder's skin pinched into a fold (the user, 2026-11-15).
  // A swing of the bone the shortest way toward hanging, its twist about itself kept: a blend of the
  // whole turn toward rest undid the twist too, and wrung the arm at the shoulder.
  if (!p.swing) {
    for (const a of [J.ARM_L, J.ARM_R]) {
      const bone = REST[a + 1];
      const now = turn(rot[a], bone);
      const k = 0.45;
      const want: Vec3 = [0, 1, 2].map(i => now[i] * (1 - k) + bone[i] * k) as Vec3;
      rot[a] = mul(arc(now, want), rot[a]);
    }
  }
  const q: Pose = { ...pose, rot };
  if (p.mode != MODE.GROUND && p.mode != MODE.CROUCH) {
    return q;
  }
  q.hips = [pose.hips[0], pose.hips[1] + 0.06, pose.hips[2]];
  const t = solve(q);
  const [fx, , fz] = basis(pose.yaw, 0)[2];
  for (const [thigh, foot, toe] of [
    [J.THIGH_L, J.FOOT_L, J.TOE_L],
    [J.THIGH_R, J.FOOT_R, J.TOE_R],
  ]) {
    // The long bone of the foot near upright over the ball, which stays where the gait put it: a third
    // segment to the leg (the user, 2026-11-15: longer legs); the toes flat on the floor ahead.
    const b = s.pos[toe];
    reach(
      q,
      t,
      thigh,
      [b[0] - fx * ANKLE[1], b[1] + ANKLE[0], b[2] - fz * ANKLE[1]],
      [fx, 0, fz],
      true,
    );
    q.rot[foot] = mul(q.rot[foot], axis(X, -FOOT_UP));
    q.rot[toe] = mul(q.rot[toe], axis(X, FOOT_UP));
  }
  return q;
};

/**
 * The xenomorph threatening, for the menu's picture (the user, 2026-11-16: an offensive posture):
 * bent lower over the prowl, the head pushed forward at the camera, the arms raised forward, the
 * elbows bent so the claws open ahead of the chest.
 */
const menace = (pose: Pose, bite = 0): Pose => {
  const X: Vec3 = [1, 0, 0];
  const rot = pose.rot.slice();
  // The spine, the chest, the neck and the head, joints in a row; a glory kill's bite (devour())
  // draws the neck and the head back, then drives them down into the prey.
  [-0.12, -0.1 - 0.3 * Math.abs(bite), 0.18 + bite, 0.08 + 0.6 * bite].forEach(
    (v, i) => (rot[J.SPINE + i] = mul(rot[J.SPINE + i], axis(X, v))),
  );
  // About x alone, in the parent's frame: the two arms' frames are mirrored, so a turn about
  // another axis sent one out and the other in.
  for (const a of [J.ARM_L, J.ARM_R]) {
    rot[a] = mul(axis(X, 0.68), rot[a]);
    rot[a + 1] = mul(rot[a + 1], axis(X, 1.05));
  }
  return { ...pose, rot };
};

/** The runner's pose this frame, solved: the gait, the fall and sink of one down, and the weapon's hold; and the way the body faces. */
/** A pose with nothing in it, for one wholly laid over: shared, so frozen. */
const BARE: Pose = Object.freeze({ ...rest(), rot: Object.freeze(rest().rot) as Quat[] });

export const stance = (r: Runner) => {
  const { p } = r;
  // Down or floored, the weapon stays in the hand as it falls. At the wheel both hands are on the yoke.
  const lying = !!p.down || floored(p) || driving(r);
  // In a glory kill (feast.ts) the arms are the kill's: no weapon is held up.
  const mate = (r.mount ?? 0) > 0 ? r.with : undefined;
  const busy = lying || !!mate || (p.exec === EXEC.VICTIM && !!p.lock) || r.pum !== undefined;
  // All on fours (fours.ts) the gait's pose is wholly laid over: it is not built.
  const fours = !lying && (r.fours?.weight ?? 0) > 0.998;
  let pose = fours
    ? { ...BARE, at: [p.x, p.y, p.z] as Vec3, yaw: p.yaw, rest: RESTS[r.build ?? 0] }
    : r.gait.pose();
  // Lying down, it sinks into the roof for the last half second.
  const sink = p.down ? 0.5 * Math.min(Math.max(1 - p.down / 30, 0), 1) : 0;
  if (p.down) {
    pose = {
      ...pose,
      at: [pose.at[0], pose.at[1] - sink, pose.at[2]],
    };
  }
  if (r.jab > 0.002 && !lying && r.blow != TAIL_BLOW) {
    // A punch: the striking fist out (the blow's), the other back to the hip, the chest behind it.
    // The xenomorph's sting is its tail's (xeno.ts), not an arm's.
    const rot = pose.rot.slice();
    const sd = SIDE[r.blow];
    const blow = r.blow == BLOW.HOOK ? HOOK : r.blow == BLOW.LUNGE ? LUNGE : JAB;
    const [out, back] = [armOf(sd, blow.out), armOf(-sd, JAB.back)];
    const [a, f, ba, bf] =
      sd < 0
        ? [J.ARM_L, J.FOREARM_L, J.ARM_R, J.FOREARM_R]
        : [J.ARM_R, J.FOREARM_R, J.ARM_L, J.FOREARM_L];
    rot[a] = slerp(rot[a], out[0], r.jab);
    rot[f] = slerp(rot[f], out[1], r.jab);
    rot[ba] = slerp(rot[ba], back[0], r.jab);
    rot[bf] = slerp(rot[bf], back[1], r.jab);
    rot[J.CHEST] = mul(axis([0, 1, 0], sd * blow.twist * r.jab), rot[J.CHEST]);
    pose = { ...pose, rot };
  }
  if (r.flinch > 0 && !lying) {
    // Hit by a fist: the head snapped back and the chest after it, springing back.
    const rot = pose.rot.slice();
    const t = 1 - r.flinch;
    const k = t < 0.2 ? t / 0.2 : (1 - t) / 0.8;
    rot[J.HEAD] = mul(rot[J.HEAD], axis([1, 0, 0], FLINCH[1] * k));
    rot[J.CHEST] = mul(rot[J.CHEST], axis([1, 0, 0], FLINCH[2] * k));
    pose = { ...pose, rot };
  }
  if (r.look?.role === ROLE.XENO && !lying) {
    // On all fours in a sprint and on a wall, which leaves nothing of the prowl once it is all in.
    if (!fours) {
      pose = prowl(pose, solve(pose), p);
    }
    // Its head still down at his a while after the kill (FEAST.FEED), lifted slowly at the end;
    // turned to him all along, whatever the player looks at.
    const fed = ease((r.feed ?? 0) / FEAST.FEED[1]);
    const prey = mate ?? (fed ? r.fedOn : undefined);
    if (prey) {
      pose = intent(pose, prey, Math.max(r.mount ?? 0, fed));
    }
    // Lifting, it keeps its head low (FEAST.LOW), then lets it come up slowly: not too high at once.
    const [held, slow] = FEAST.LOW;
    if (r.menace || p.lock || mate || fed) {
      const bite = r.feed ? held + (devour(0) - held) * fed : 0;
      pose = menace(pose, p.lock ? devour(p.lock) : bite);
    } else if (r.low) {
      // The whole of its menace let go of together, as its head comes up.
      const k = ease(r.low / slow);
      const m = menace(pose, held);
      pose = { ...pose, rot: pose.rot.map((q, j) => slerp(q, m.rot[j], k)) };
    }
    pose = r.fours?.apply(pose) ?? pose;
    if (mate) {
      // After the kill it hops back off him on an arc (FEAST.HOP), its head still at his.
      const hop = p.lock ? 0 : Math.sin(Math.PI * (1 - r.mount!));
      pose = seize(pose, mate, r.mount!, p.lock ? swaying(p.lock, r.mount!) : 0, hop, r.size);
    }
    // Chewing as it bites, and on after the kill, dying out as its head lifts.
    pose = chew(pose, p.lock ? eating(p.lock, r.mount ?? 0) : fed, r.t);
    // Standing as it eats; down in a low hunting crouch only at the end, as its head comes up
    // (FEAST.CROUCH, the user 2026-11-17), then back to its prowl slowly.
    pose = crouch(pose, r.feed ? 1 - fed : ease((r.low ?? 0) / slow));
  } else if (mate && !lying) {
    const sway = p.lock ? swaying(p.lock, r.mount!) : 0;
    pose = r.knelt = clutched(pose, mate, r.mount!, r.t, r.bust, sway);
  } else if (p.exec === EXEC.VICTIM && p.lock && r.with && !lying) {
    pose = r.knelt = kneel(pose, r.with, p.lock, r.t);
  }
  // The fists' execution's blows, and their follow-through after the kill.
  if (r.pum !== undefined && r.prey && !lying) {
    pose = pummel(pose, r.pum, r.prey);
  }
  // Beheaded on his knee: the same kneel, tipping over, not another fall.
  if (r.slain && p.down && r.knelt) {
    pose = topple({ ...r.knelt, at: [p.x, p.y - sink, p.z] }, r.slain.t, r.slain.pivot);
  }
  // Down, kneeling or held by the xenomorph, nothing goes through the floor (it still sinks into
  // it at the end).
  const held = !!mate && r.look?.role !== ROLE.XENO;
  if (p.down || (p.exec === EXEC.VICTIM && p.lock) || held) {
    pose = footing(pose, p.y - sink);
  }
  let s = solve(pose);
  if (p.wield && !busy) {
    // The execution's last cut: the blade raised back over the head, held, then down on his neck.
    const up =
      p.exec === EXEC.KILLER && p.lock
        ? raised(EXEC.TICKS - (r.exe ?? EXEC.TICKS - p.lock), r.prog, SLASH_TOP)
        : -1;
    // His legs go with his blade.
    pose = r.exe === undefined ? pose : lunge(pose, r.exe);
    pose = brandish(
      pose,
      up < 0 ? p : { ...p, cut: CUT.SLASH },
      up < 0 ? r.prog : up,
      r.gait.phase,
      r.t,
      r.parry,
      r.look?.role === ROLE.HUNTER,
    );
    s = solve(pose);
  } else if ((p.railed || (p.rifled && r.look?.role !== ROLE.HUNTER)) && !busy) {
    // The rail gun or the rifle in both hands, at the ready when not firing: the left on its front grip, the
    // elbow down and out. On a wall it is put away, unless its bolt is going out (stowed()).
    if (p.railed && stowed(p)) {
      return { s, sink, yaw: pose.yaw };
    }
    pose = carried(pose, s, r);
    s = solve(pose);
  } else if (r.aim > 0.01 && p.ammo >= 0 && !p.fists && !busy) {
    // Seated, the eye the gun is held out from is lower.
    pose = lifted(
      pose,
      s,
      aimed(p.mode == MODE.RIDE ? { ...p, y: p.y - SEATED } : p, r.focus),
      r.aim,
      r.look?.role === ROLE.HUNTER ? 0 : kindOf(p),
    );
    s = solve(pose);
  }
  // In a swap of the gun or the rifle the left hand fetches the new battery from the pouch on the
  // hip and brings it up under the grip (pouch.ts, the user, 2026-11-09).
  const sp = swapOf(p);
  const w =
    busy || p.wield || p.railed || sp < 0
      ? 0
      : ease(span(sp, 0.12, 0.2)) * (1 - ease(span(sp, BROUGHT - 0.03, BROUGHT)));
  let carry: [Vec3, Vec3[]] | undefined;
  if (w > 0.002) {
    const q = s.rot[J.HAND_R];
    const f = fetched(
      sp,
      pouchAt(s.pos[J.PELVIS], s.rot[J.PELVIS]),
      loadFrame(grip(s.pos[J.HAND_R], q, kindOf(p)), axes(q, kindOf(p)), kindOf(p), BROUGHT),
      s.pos[J.HAND_L],
    );
    carry = f.carry;
    const [x, u, fw] = basis(p.yaw, 0);
    const arm = { ...pose, rot: pose.rot.slice() };
    wield(
      arm,
      s,
      J.ARM_L,
      f.at,
      f.g,
      [0, 1, 2].map(i => -0.5 * x[i] - u[i] - 0.35 * fw[i]) as Vec3,
    );
    for (const k of [J.ARM_L - 1, J.ARM_L, J.FOREARM_L, J.HAND_L]) {
      pose.rot[k] = slerp(pose.rot[k], arm.rot[k], w);
    }
    s = solve(pose);
  }
  return { s, sink, yaw: pose.yaw, carry };
};
