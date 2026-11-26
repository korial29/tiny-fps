import { frame } from '../gait';
import { C, S, BEHIND as BACK } from '../katana';
import { add, dot, mix, sub, unit } from '../mesh';
import type { Vec3 } from '../mesh';
import { JOINT as J, PARENT, REST, axis, mul, solve } from '../rig';
import type { Pose } from '../rig';

import { clamp, dist, inv } from './constants';
import { cross } from './fingers';
import { C0, FIST, KATANA_LEFT, REACH, S0, across, along, ik, lay, shrug, twist } from './reach';
import type { Solved } from './types';

/**
 * Puts the arm of shoulder joint `j` (ARM_R or ARM_L) of `q` on a handle running along the unit
 * `g`, the hand round the point `at`, the elbow toward `pole`; `solved` is q solved. The shoulder
 * (the clavicle) rises with a hand over it and comes forward with a long reach. The hand comes
 * first: its axis leaves the handle on the shoulder's side, the thumb along the handle (the tilt of
 * katana.ts), and the elbow goes where the forearm carries on that axis, as near as the bones
 * allow. The elbow is a hinge, and the forearm's turn about itself goes half to the elbow and half
 * to the wrist, as a forearm's twist does. Out of reach the hand stops short.
 */
export const wield = (
  q: Pose,
  solved: Solved,
  j: number,
  at: Vec3,
  g: Vec3,
  pole: Vec3,
  held?: Vec3,
  [reach, palm] = FIST,
  [S, C]: number[] = [S0, C0],
  /** The forearm on `held`'s line, not the hand's: the wrist cocked by the hand's own tilt. */
  bent = false,
  /** The shoulder follows a hand out of reach. */
  far = false,
) => {
  if (!held) {
    shrug(q, solved, j, at);
  }
  let s = solve(q);
  let a = s.pos[j];
  const [l1, l2] = [dist(a, s.pos[j + 1]), dist(s.pos[j + 1], s.pos[j + 2])];
  // Away from the elbow too, for a handle that points at the shoulder or away from it; or the
  // side that puts the fingers along `held`, a straight wrist (clasp()), the shoulder already
  // shrugged by the caller.
  const side = held
    ? unit(along(held, g, -dot(held, g)))
    : unit(add(across(unit(sub(at, a)), g), along([0, 0, 0], unit(across(pole, g)), -0.3)));
  const th = add(along([0, 0, 0], g, C), along([0, 0, 0], side, -S));
  const fing = add(along([0, 0, 0], g, S), along([0, 0, 0], side, C));
  const x = cross(fing, th);
  const hand = frame(x, fing);
  // The grip is `reach` along the fingers from the wrist and `palm` toward the palm (FIST), which
  // the left hand, a mirror, has on its other side.
  const wrist = along(along(at, fing, -reach), x, j == J.ARM_L ? -palm : palm);
  // `far`: out of reach the shoulder comes after the hand (the clavicle turns toward the wrist,
  // REACH at most) rather than the hand stop short: crouched, the shoulders are further back.
  const c = s.pos[j - 1];
  const [R, D, L] = [dist(a, c), dist(wrist, c), (l1 + l2) * 0.985];
  if (far && dist(a, wrist) > L) {
    const to = unit(sub(wrist, c));
    const now = Math.acos(clamp(dot(unit(sub(a, c)), to), -1, 1));
    const need = Math.acos(clamp((R * R + D * D - L * L) / (2 * R * D), -1, 1));
    const w = axis(unit(cross(sub(a, c), to)), Math.min(now - need, REACH));
    const up = s.rot[PARENT[j - 1]];
    q.rot[j - 1] = mul(inv(up), mul(w, mul(up, q.rot[j - 1])));
    s = solve(q);
    a = s.pos[j];
  }
  // The elbow where the forearm carries on the hand's axis: toward the pole too for a free hand,
  // exactly there for a held one; bent, on the line `held` gave it (clasp()'s square hold).
  const ideal = sub(along(wrist, bent && held ? unit(held) : fing, -l2), a);
  const [e, f] = ik(a, wrist, held ? ideal : add(ideal, pole), l1, l2);
  const [u, v] = [unit(sub(e, a)), unit(sub(f, e))];
  const bend = cross(u, v);
  const h = unit(Math.hypot(...bend) > 1e-3 ? bend : cross(u, mix([0, 0, 0], pole, -1)));
  const [upper, fore] = [unit(REST[j + 1]), unit(REST[j + 2])];
  const r1 = lay(frame(h, u), upper, u);
  const r0 = lay(frame(h, v), fore, v);
  const r2 = mul(r0, axis(fore, twist(mul(inv(r0), hand), fore) / 2));
  q.rot[j] = mul(inv(s.rot[PARENT[j]]), r1);
  q.rot[j + 1] = mul(inv(r1), r2);
  q.rot[j + 2] = mul(inv(r2), hand);
};

/** `v` turned by the rotation vector `w` (its length the angle, radians). */
export const rotate = (v: Vec3, w: Vec3): Vec3 => {
  const t = Math.hypot(...w);
  if (t < 1e-12) {
    return v;
  }
  const k = mix([0, 0, 0], w, 1 / t);
  const [c, sn] = [Math.cos(t), Math.sin(t)];
  return add(
    add(mix([0, 0, 0], v, c), mix([0, 0, 0], cross(k, v), sn)),
    mix([0, 0, 0], k, dot(k, v) * (1 - c)),
  );
};

/**
 * The katana and both fists as one rigid piece, the wrists straight, so that a cut is the arms'
 * alone (the user, 2026-11-07): the right hand round the grip, the left BEHIND it, each turned a
 * fixed way about the handle (from `at`, `g` and the elbows' `poles`) and its forearm carrying on
 * along its fingers, so that each elbow is a forearm's length back from its wrist. The piece goes
 * the least way from where the cut puts it (a radian of the blade weighs as 3 m of the hands) to
 * where both elbows are an upper arm's length from their shoulders; `turn` is what a radian of the
 * blade weighs against a metre of the hands, as a freedom (a parry holds its line: less). Returns
 * the grip, the blade, and the fingers of the right hand and of the left.
 */
export const clasp = (
  s: Solved,
  at: Vec3,
  g: Vec3,
  poles: [Vec3, Vec3],
  turn = 0.1,
): [Vec3, Vec3, Vec3, Vec3] => {
  const arms = [J.ARM_R, J.ARM_L];
  const len = arms.map(j => [dist(s.pos[j], s.pos[j + 1]), dist(s.pos[j + 1], s.pos[j + 2])]);
  // Each hand's turn about the handle, as a free hand would take it where the cut puts it.
  const sides = arms.map((j, k) =>
    unit(
      add(
        across(unit(sub(k ? along(at, g, -BACK) : at, s.pos[j])), g),
        along([0, 0, 0], unit(across(poles[k], g)), -0.3),
      ),
    ),
  );
  /** The piece moved by `x`: the grip on by x[0..2], the blade and the hands turned by x[3..5]. */
  const place = (x: number[]) => {
    const w: Vec3 = [x[3], x[4], x[5]];
    const b = unit(rotate(g, w));
    const f = sides.map(sd => {
      const side = unit(across(rotate(sd, w), b));
      return add(along([0, 0, 0], b, S), along([0, 0, 0], side, C));
    });
    return { p: add(at, [x[0], x[1], x[2]]), b, f };
  };
  /** How far each elbow, a forearm back from its wrist, is from an upper arm's length off its shoulder. */
  const miss = (x: number[]) => {
    const { p, b, f } = place(x);
    return arms.map((j, k) => {
      const side = unit(along(f[k], b, -S));
      const back = cross(f[k], add(along([0, 0, 0], b, C), along([0, 0, 0], side, -S)));
      const [reach, palm] = k ? KATANA_LEFT : FIST;
      const wrist = along(along(k ? along(p, b, -BACK) : p, f[k], -reach), back, k ? -palm : palm);
      return dist(along(wrist, f[k], -len[k][1]), s.pos[j]) - len[k][0];
    });
  };
  // Gauss-Newton, the least weighed step that takes both misses to 0: a radian of the blade
  // weighs as 3 m of the hands, so the hands move and the blade keeps the line of its cut.
  const free = [1, 1, 1, turn, turn, turn];
  const x = [0, 0, 0, 0, 0, 0];
  for (let n = 0; n < 12; n++) {
    const r = miss(x);
    if (Math.abs(r[0]) + Math.abs(r[1]) < 1e-4) {
      break;
    }
    const J = x.map((_, i) => {
      const y = x.slice();
      y[i] += 1e-5;
      return miss(y).map((v, k) => (v - r[k]) / 1e-5);
    });
    // M = J W J^T, 2 by 2, and the step -W J^T M^-1 r.
    const m = [0, 1].map(a => [0, 1].map(c => J.reduce((t, d, i) => t + d[a] * free[i] * d[c], 0)));
    const det = m[0][0] * m[1][1] - m[0][1] * m[1][0] || 1e-12;
    const y = [(m[1][1] * r[0] - m[0][1] * r[1]) / det, (m[0][0] * r[1] - m[1][0] * r[0]) / det];
    x.forEach((_, i) => (x[i] -= free[i] * (J[i][0] * y[0] + J[i][1] * y[1])));
  }
  const { p, b, f } = place(x);
  return [p, b, f[0], f[1]];
};
