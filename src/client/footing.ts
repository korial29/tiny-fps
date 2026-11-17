// A body down on a floor stays over it (the user, 2026-11-17: the kneeling death and the
// execution's kneel went through the roof): a hand or a foot under it is reached back up onto it,
// the knee or the elbow kept on its side; whatever is still under it then lifts the whole body. The
// skin is judged by its joints and how far it stands round each (RADII). Pure, no DOM.
import { reach } from './body';
import { add, sub } from './mesh';
import type { Vec3 } from './mesh';
import { JOINT as J, JOINTS, solve, turn } from './rig';
import type { Pose } from './rig';

/** More round every joint but the soles' points: the armour stands off the skin. */
export const MARGIN = 0.035;

/** How far the skin stands round each joint, metres: the most it goes under the joint's centre. */
export const RADII = [
  0.13, 0.13, 0.15, 0.07, 0.13, 0.06, 0.07, 0.06, 0.05, 0.06, 0.07, 0.06, 0.05, 0.1, 0.08, 0.06,
  0.02, 0.1, 0.08, 0.06, 0.02,
];

/**
 * The shoe's heel and tip, in the frame of the foot and of the toes, and how far round them it
 * stands: a foot on its side or its toes reaches past a ball round its joint. All of a sole sits on
 * the floor when he stands.
 */
const [HEEL, TIP]: [Vec3, number][] = [
  [[0, -0.03, 0.07], 0.03],
  [[0, -0.01, -0.06], 0.01],
];
const SOLES: number[] = [J.FOOT_L, J.TOE_L, J.FOOT_R, J.TOE_R];

/** The points of the skin round the joints `js` of `s`, and how far round each it stands. */
const points = (s: ReturnType<typeof solve>, js: number[]): [Vec3, number][] =>
  js.flatMap(j => {
    const sole = SOLES.includes(j);
    const at: [Vec3, number][] = [[s.pos[j], RADII[j] + (sole ? 0 : MARGIN)]];
    if (sole) {
      const [o, r] = j == J.FOOT_L || j == J.FOOT_R ? HEEL : TIP;
      at.push([add(s.pos[j], turn(s.rot[j], o)), r]);
    }
    return at;
  });

/** A limb's root and the joints at its end (a foot's toe too), to be kept over the floor. */
const LIMBS = [
  [J.THIGH_L, J.FOOT_L, J.TOE_L],
  [J.THIGH_R, J.FOOT_R, J.TOE_R],
  [J.ARM_L, J.HAND_L],
  [J.ARM_R, J.HAND_R],
];

/** How far the skin round the joints `js` of `s` goes under `floor`, metres (0 when it does not). */
const under = (s: ReturnType<typeof solve>, floor: number, js: number[]) =>
  Math.max(0, ...points(s, js).map(([p, r]) => floor - (p[1] - r)));
const ALL = Array.from({ length: JOINTS }, (_, j) => j);

/** The pose `q` kept over the floor at height `floor`. */
export const footing = (q: Pose, floor: number): Pose => {
  let s = solve(q);
  if (under(s, floor, ALL) < 1e-4) {
    return q;
  }
  const p: Pose = { ...q, rot: q.rot.slice(), at: [...q.at] as Vec3 };
  for (const [root, ...end] of LIMBS) {
    const d = under(s, floor, end);
    if (d) {
      // Bent the way it is: the pole from the middle of the limb out through its middle joint.
      const mid = s.pos[root + 1];
      const out = sub(mid, add(s.pos[root], s.pos[root + 2]).map(v => v / 2) as Vec3);
      const pole: Vec3 = Math.hypot(...out) > 1e-3 ? out : [0, 1, 0];
      reach(p, s, root, add(s.pos[root + 2], [0, d, 0]), pole);
      s = solve(p);
    }
  }
  p.at[1] += under(s, floor, ALL);
  return p;
};
