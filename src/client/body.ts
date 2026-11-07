// The own player's body in first person, Mirror's Edge style: the runners' skin (skin.ts) on the rig
// (rig.ts), posed by its own gait (gait.ts) from the predicted state and seen from its head, which
// is left out. The gait gives the stride, the trunk and the feet it plants. Here the body is moved
// so that its head sits at the camera, leaned with the look, the legs are solved again onto the
// planted feet and the hands are put on goals placed in the view: the frame edges on a run, the
// ledge on a hang, the wall on a wall-run. Drawn by the renderer over a cleared depth, like a view
// model. No DOM, pure but for the state it keeps.
import {
  CHARGE_TAP,
  CHARGE_TICKS,
  DASH_COOLDOWN,
  DASH_TICKS,
  GRAB_GAP,
  PLAYER_R,
  STEP_H,
} from '../shared/constants';
import { powerOf } from '../shared/gun';
import { TAU, eyeHeight, speedOf, sprinting } from '../shared/physics';
import { MODE } from '../shared/types';
import type { PlayerState } from '../shared/types';
import { ray } from '../shared/world';
import type { World } from '../shared/world';
import { createGait, frame } from './gait';
import type { Floor } from './gait';
import { REAR, TILT, held, pointed, tip } from './gun';
import {
  BASE,
  BEHIND as BACK,
  BOW,
  C,
  S,
  SWAY,
  cutting,
  ends,
  held as sword,
  locked,
  progress,
  stroke,
  trunk,
  whirl,
} from './katana';
import { add, basis, dot, mix, sub, unit } from './mesh';
import type { Vec3 } from './mesh';
import { JOINT as J, PARENT, REST, axis, mul, rest, slerp, solve, turn as spin } from './rig';
import type { Pose, Quat } from './rig';
import { CUFF, CUFF_SIDES, body, palette, skin } from './skin';
import { createTrail } from './trail';

export type Solved = ReturnType<typeof solve>;

export interface Body {
  /** The own player's id, -1 before the first snapshot. */
  readonly id: number;
  /** Advances dt seconds: the own player, eased (undefined before the first snapshot), the kick of the gun (0 to 1) and the aspect of the screen, which keeps the gun in a narrow one. */
  update(me: PlayerState | undefined, dt: number, kick?: number, aspect?: number): void;
  /**
   * Where the look ray ends, in the camera's space (right, up, forward), each frame: the gun points
   * at it, at least 3 m out, so that the beam leaves the emitter along its long axis.
   */
  aim(target: Vec3): void;
  /** The muzzle of the gun in the right hand, in the camera's space (right, up, forward), as of the last update. */
  muzzle(): Vec3;
  /** How far round a spin, and a share of the trunk's twist in a cut, have turned the body as of the last update (radians, whirl(), trunk()): the drawn view turns with it. */
  spun(): number;
  /** The joints for a camera at `eye`; undefined without a player, or with the camera away from the body. */
  pose(eye: Vec3, yaw: number, pitch: number, roll?: number): Solved | undefined;
  /** Appends the body's vertices (see STRIDE) in the jacket `color`; nothing when pose() has none. */
  draw(out: number[], eye: Vec3, yaw: number, pitch: number, roll?: number, color?: number[]): void;
}

/** Metres the camera may be from the eye of the body and still show it: the bob is centimetres, a crouch's ease under a metre. */
const AWAY = 1;
/** On a ledge the camera sits this far behind the head and below it, so that the arms reach the ledge. */
const [BEHIND, DROP] = [0.12, 0.03];
const [X, Y, Z]: Vec3[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
const POLE: Vec3 = [0.7, -1, -0.5];
const clamp = (v: number, lo = 0, hi = 1) => Math.min(Math.max(v, lo), hi);
export const inv = ([x, y, z, w]: Quat): Quat => [-x, -y, -z, w];
const dist = (a: Vec3, b: Vec3) => Math.hypot(...sub(a, b));
/** The point `k` along the direction `d` from `o`. */
const along = (o: Vec3, d: Vec3, k: number): Vec3 => add(o, mix([0, 0, 0], d, k));

/** The shortest rotation that turns the direction a into b. */
const arc = (a: Vec3, b: Vec3): Quat => {
  const [u, v] = [unit(a), unit(b)];
  const q = [
    u[1] * v[2] - u[2] * v[1],
    u[2] * v[0] - u[0] * v[2],
    u[0] * v[1] - u[1] * v[0],
    1 + dot(u, v),
  ];
  const n = Math.hypot(...q) || 1;
  return q.map(c => c / n) as Quat;
};

/**
 * The middle joint of a two-bone limb from `a` toward `b`, bones l1 and l2, bent toward `pole`; and
 * the end it reaches, which is short of `b` when that is out of reach.
 */
const ik = (a: Vec3, b: Vec3, pole: Vec3, l1: number, l2: number): [Vec3, Vec3] => {
  const d = sub(b, a);
  const n = unit(d);
  const len = Math.max(Math.min(Math.hypot(...d), (l1 + l2) * 0.99), 0.15);
  const x = (l1 * l1 - l2 * l2 + len * len) / (2 * len);
  const h = Math.sqrt(Math.max(l1 * l1 - x * x, 0));
  const p = unit(sub(pole, mix([0, 0, 0], n, dot(pole, n))));
  return [along(along(a, n, x), p, h), along(a, n, len)];
};

/**
 * Turns the limb of root joint j (a shoulder, a hip) in `q` so that its end reaches `to`, the
 * middle joint toward `pole`. `s` is q solved: the bones keep their twist and swing the shortest
 * way. The end joint keeps its own turn in the world (a foot stays flat) or follows the bone (a hand).
 */
export const reach = (q: Pose, s: Solved, j: number, to: Vec3, pole: Vec3, flat = false) => {
  const [a, b, c] = [s.pos[j], s.pos[j + 1], s.pos[j + 2]];
  const [e, f] = ik(a, to, pole, dist(a, b), dist(b, c));
  const r1 = mul(arc(sub(b, a), sub(e, a)), s.rot[j]);
  const r2 = mul(arc(sub(c, b), sub(f, e)), s.rot[j + 1]);
  q.rot[j] = mul(inv(s.rot[PARENT[j]]), r1);
  q.rot[j + 1] = mul(inv(r1), r2);
  if (flat) {
    q.rot[j + 2] = mul(inv(r2), s.rot[j + 2]);
  }
};

/** The part of `v` across the unit vector `u`. */
const across = (v: Vec3, u: Vec3): Vec3 => along(v, u, -dot(v, u));
/** The twist of the turn `q` about the unit axis `b`, radians in [-PI, PI]. */
const twist = (q: Quat, b: Vec3): number => {
  const t = 2 * Math.atan2(q[0] * b[0] + q[1] * b[1] + q[2] * b[2], q[3]);
  return t > Math.PI ? t - 2 * Math.PI : t < -Math.PI ? t + 2 * Math.PI : t;
};
/** The rotation `r` turned the shortest way so that its bone of rest offset `rest` lies along `d`. */
const lay = (r: Quat, rest: Vec3, d: Vec3): Quat => mul(arc(spin(r, rest), d), r);

/** The share of the trunk's twist the hands go round with in the first person, on top of the view's SWAY. */
const HANDS = 0.3;
/** The trunk seen from above, with a fist round it: half its width and half its depth, metres. */
const [TRUNK_W, TRUNK_D] = [0.22, 0.17];
/** How far under the neck the chest stands out the most, and half the width it hides across, to the shoulders. */
const [CHEST_AT, SHOULDERS] = [0.16, 0.3];
/**
 * How far forward (along the body's front, `yaw`) the point `p` must go to be in sight from `eye`
 * and out of the trunk of `s`: an upright ellipse TRUNK_W by TRUNK_D round the line from under the
 * hips to the neck. Under the chest, the line from the eye over its front hides what is behind it,
 * so a point there must be ahead of that line. 0 when it is clear already, or beside the trunk.
 */
const outOf = (s: Solved, yaw: number, eye: Vec3, p: Vec3): number => {
  const [a, b] = [add(s.pos[J.PELVIS], [0, -0.25, 0]), s.pos[J.NECK]];
  if (p[1] > b[1] + 0.05) {
    return 0;
  }
  const c = mix(a, b, clamp((p[1] - a[1]) / (b[1] - a[1])));
  /** On the body's right and front, from the trunk's line at that height. */
  const [side, front] = [
    (v: Vec3) => v[0] * Math.cos(yaw) - v[2] * Math.sin(yaw),
    (v: Vec3) => -v[0] * Math.sin(yaw) - v[2] * Math.cos(yaw),
  ];
  const d = sub(p, c);
  const k = Math.abs(side(d)) / TRUNK_W;
  let need = k < 1 && p[1] >= a[1] ? TRUNK_D * Math.sqrt(1 - k * k) : -Infinity;
  // The chest stands out as far all the way to the shoulders: the line from the eye over it.
  const top = b[1] - CHEST_AT;
  if (k < SHOULDERS / TRUNK_W && p[1] < top && eye[1] > top) {
    const e = front(sub(eye, c));
    need = Math.max(need, e + ((TRUNK_D - e) * (eye[1] - p[1])) / (eye[1] - top));
  }
  return Math.max(0, need - front(d));
};

/** The shoulder of arm `j` of `q` (`s` solved) goes with the hand at `at`: up as it rises over it, forward as it reaches out. */
export const shrug = (q: Pose, s: Solved, j: number, at: Vec3) => {
  const sd = j === J.ARM_L ? -1 : 1;
  const d = sub(at, s.pos[j]);
  const [up, out] = [
    clamp((d[1] + 0.12) * 1.6, 0, 0.5),
    clamp((Math.hypot(...d) - 0.4) * 2.5, 0, 0.45),
  ];
  q.rot[j - 1] = mul(q.rot[j - 1], mul(axis(Y, sd * out), axis(Z, sd * up)));
};

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
) => {
  if (!held) {
    shrug(q, solved, j, at);
  }
  const s = solve(q);
  const a = s.pos[j];
  const [l1, l2] = [dist(a, s.pos[j + 1]), dist(s.pos[j + 1], s.pos[j + 2])];
  // Away from the elbow too, for a handle that points at the shoulder or away from it; or the
  // side that puts the fingers along `held`, a straight wrist (clasp()), the shoulder already
  // shrugged by the caller.
  const side = held
    ? unit(along(held, g, -S))
    : unit(add(across(unit(sub(at, a)), g), along([0, 0, 0], unit(across(pole, g)), -0.3)));
  const th = add(along([0, 0, 0], g, C), along([0, 0, 0], side, -S));
  const fing = add(along([0, 0, 0], g, S), along([0, 0, 0], side, C));
  const x = cross(fing, th);
  const hand = frame(x, fing);
  // The grip is 7.8 cm along the fingers from the wrist and 2.2 cm toward the palm, which the
  // left hand, a mirror, has on its other side.
  const wrist = along(along(at, fing, -0.078), x, j == J.ARM_L ? -0.022 : 0.022);
  // The elbow where the forearm carries on the hand's axis: toward the pole too for a free hand,
  // exactly there for a held one.
  const ideal = sub(along(wrist, fing, -l2), a);
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
const rotate = (v: Vec3, w: Vec3): Vec3 => {
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
 * the least way from where the cut puts it (a radian of the blade weighs as 10 cm of the hands) to
 * where both elbows are an upper arm's length from their shoulders. Returns the grip, the blade,
 * and the fingers of the right hand and of the left.
 */
export const clasp = (
  s: Solved,
  at: Vec3,
  g: Vec3,
  poles: [Vec3, Vec3],
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
      const wrist = along(
        along(k ? along(p, b, -BACK) : p, f[k], -0.078),
        back,
        k ? -0.022 : 0.022,
      );
      return dist(along(wrist, f[k], -len[k][1]), s.pos[j]) - len[k][0];
    });
  };
  // Gauss-Newton, the least weighed step that takes both misses to 0: a radian of the blade
  // weighs as 10 cm of the hands.
  const free = [1, 1, 1, 100, 100, 100];
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

/** The unit vector toward a wall on each SIDE, on the floor plane. */
const TOWARD = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Finger lengths against 4 cm, index to little. */
const LENGTH = [1, 1.1, 1, 0.82];
/** The thumb's two segments open and in a fist, as directions in the hand (x toward the thumb). */
const THUMB: [Vec3, Vec3][] = [
  [
    [0.55, -0.2, 0.8],
    [0.2, -0.75, 0.6],
  ],
  [
    [0.4, -0.1, 0.9],
    [-0.55, -0.5, 0.65],
  ],
];
/** Sides around a finger. */
const FINGER_SIDES = 6;
/** The wrist joint at rest: the cuff's ring is placed from it. */
const WRIST = solve(rest()).pos[J.HAND_R];

/** A ring of a tube: its centre and its two half axes. */
type Ring = [c: Vec3, x: Vec3, y: Vec3];

const cross = ([a, b, c]: Vec3, [d, e, f]: Vec3): Vec3 => [
  b * f - c * e,
  c * d - a * f,
  a * e - b * d,
];

/**
 * Appends, through `put(position, normal)`, the tube through `rings`: `sides` around, the normals
 * smooth along it and around it (from the rings either side), a ring of no extent a point that
 * closes the tube. The first ring's normals are its radial ones with `lean` along the tube, to meet
 * the surface it grows out of.
 */
const tube = (rings: Ring[], sides: number, put: (p: Vec3, n: Vec3) => void, lean?: number) => {
  const P = rings.map(([c, x, y]) =>
    x.some(Boolean)
      ? Array.from({ length: sides }, (_, i) => {
          const [s, k] = [Math.sin((i * TAU) / sides), Math.cos((i * TAU) / sides)];
          return [0, 1, 2].map(d => c[d] + x[d] * k + y[d] * s) as Vec3;
        })
      : [c],
  );
  /** Vertex i of ring r in a grid, the rings clamped and a point the same for every i. */
  const at = (G: Vec3[][], r: number, i: number) => {
    const row = G[Math.min(Math.max(r, 0), G.length - 1)];
    return row[(i + row.length) % row.length];
  };
  const N = P.map((row, r) =>
    row.map((_, i): Vec3 => {
      if (lean != null && !r) {
        const a = (i * TAU) / sides;
        return unit([Math.cos(a), Math.sin(a), lean]);
      }
      // A point has no ring to go round: its normal is the way the tube runs into it.
      if (row.length < 2) {
        return unit(sub(row[0], rings[r - 1][0]));
      }
      return unit(
        cross(sub(at(P, r, i + 1), at(P, r, i - 1)), sub(at(P, r + 1, i), at(P, r - 1, i))),
      );
    }),
  );
  for (let r = 1; r < P.length; r++) {
    for (let i = 0; i < sides; i++) {
      const [p, q, a, b] = [
        [r - 1, i],
        [r - 1, i + 1],
        [r, i + 1],
        [r, i],
      ];
      for (const t of P[r].length > 1
        ? [
            [p, q, a],
            [p, a, b],
          ]
        : [[p, q, a]]) {
        for (const [j, k] of t) {
          put(at(P, j, k), at(N, j, k));
        }
      }
    }
  }
};

/**
 * The rings of a finger, in the hand's space: from `p` along `d1` for `l`, then along `d2` for `l`,
 * `r` thick at the root, the first ring across `t`. The bend is a curve through the joint, not a
 * corner, so that a fist keeps a round knuckle.
 */
export const finger = (p: Vec3, d1: Vec3, d2: Vec3, l: number, r: number, t: Vec3): Ring[] => {
  const joint = along(p, d1, l);
  const [a, b] = [along(joint, d1, -l / 2), along(joint, d2, l / 2)];
  const ring = (c: Vec3, d: Vec3, k: number): Ring => {
    const [t, y] = [unit(d), unit(cross(d, X))];
    return [c, cross(y, t).map(v => v * r * k) as Vec3, y.map(v => v * r * k) as Vec3];
  };
  return [
    ring(p, t, 1.03),
    ring(a, d1, 1),
    ring(mix(joint, mix(a, b, 0.5), 0.5), sub(b, a), 0.94),
    ring(b, d2, 0.9),
    ring(along(joint, d2, l - 0.001), d2, 0.74),
    ring(along(joint, d2, l + 0.006), d2, 0),
  ];
};

/** The directions of the two phalanges of the finger i (index to little) at `curl`, in the hand's space. */
export const phalanges = (curl: number, i: number): [Vec3, Vec3] => {
  const splay = -(i - 1.5) * 0.08 * (1 - curl);
  const [a, b] = [0.1 + 1.3 * curl, 0.2 + 3 * curl].map(n =>
    unit([splay, -Math.sin(n), Math.cos(n)]),
  );
  return [a, b];
};

/**
 * A gloved hand at the wrist `end`: the fingers along `f`, the back of the hand along `u`, the thumb
 * toward `th` (unit vectors). `curl` runs from 0, a flat open hand with the fingers spread, to 1, a
 * fist. The palm is one tube that starts as the sleeve's cuff ends and spreads to the knuckles,
 * and each finger and the thumb one tube from there, bent at its joints: no solid meets another
 * in a line, and the normals are smooth all over.
 */
export const hand = (
  out: number[],
  end: Vec3,
  f: Vec3,
  u: Vec3,
  th: Vec3,
  curl: number,
  tint: number[],
) => {
  /** Hand space (x toward the thumb, y the back, z toward the fingers), a point and a direction, to the world. */
  const put = ([x, y, z]: Vec3, [m, n, w]: Vec3) =>
    out.push(
      ...[0, 1, 2].map(d => end[d] + th[d] * x + u[d] * y + f[d] * z),
      ...[0, 1, 2].map(d => th[d] * m + u[d] * n + f[d] * w),
      tint[0],
      tint[1],
      -1,
      tint[2],
    );
  // The palm starts as the sleeve's cuff does, vertex for vertex, its normals leaning to the fingers.
  const palm = ([z, y, a, b]: number[]): Ring => [
    [0, y, z],
    [a, 0, 0],
    [0, b, 0],
  ];
  tube(
    [
      palm([WRIST[1] - CUFF[0], CUFF[1] - WRIST[0], CUFF[3], CUFF[4]]),
      palm([0.025, 0, 0.04, 0.021]),
      palm([0.06, -0.002, 0.0425, 0.017]),
      palm([0.092, -0.004, 0.0425, 0.0105]),
      palm([0.104, -0.004, 0, 0]),
    ],
    CUFF_SIDES,
    put,
    0.75,
  );
  for (let i = 0; i < 4; i++) {
    const [d1, d2] = phalanges(curl, i);
    tube(
      finger(
        [0.0315 - 0.021 * i, -0.004, 0.092],
        d1,
        d2,
        0.04 * LENGTH[i],
        0.0105,
        unit(add(d1, [0, 0, 1])),
      ),
      FINGER_SIDES,
      put,
    );
  }
  const [d1, d2] = THUMB.map(([open, fist]) => unit(mix(open, fist, curl)));
  tube(finger([0.029, -0.01, 0.025], d1, d2, 0.037, 0.0118, d1), FINGER_SIDES, put);
};

/** The floor under a player standing at height `y`: the first top within a step above or below it. */
const floorOf =
  (world: World, y: number): Floor =>
  (x, z) => {
    const d = ray(world, [x, y + STEP_H, z], [0, -1, 0], 2 * STEP_H);
    return d > 0 && d < 2 * STEP_H ? y + STEP_H - d : y;
  };

/** The blends the animation eases, each toward 0 or 1, and how fast (1 / s). */
const RATES = {
  amp: 8,
  sprint: 6,
  air: 12,
  rise: 10,
  dash: 14,
  plant: 16,
  wall: 10,
  slide: 10,
  stun: 14,
  gun: 10,
  blade: 10,
};

export const createBody = (world?: World): Body => {
  const gait = createGait();
  /** The own player as last seen. */
  let me: PlayerState | undefined;
  const w = {
    amp: 0,
    sprint: 0,
    air: 0,
    rise: 0,
    dash: 0,
    plant: 0,
    wall: 0,
    slide: 0,
    stun: 0,
    gun: 0,
    blade: 0,
  };
  /** The kick of the last shot, 0 to 1, and how much of the right hand's pose the gun and the katana take, as of the last pose(). */
  let [kick, hold, grasp, wide] = [0, 0, 0, 1.6];
  /** How far through its cut the katana is, -1 when it is not cutting; and the light it leaves. */
  let prog = -1;
  /** In a saber lock: the presses seen so far, and the jolt of the last one (1, easing to 0). */
  let [pushes, jolt] = [0, 0];
  const trail = createTrail();
  /** Where the gun points, in the camera's space. */
  let target: Vec3 = [0, 0, 8];
  /** How far the gun is pushed out of the trunk, in the camera's space, as of the last pose(). */
  let lift: Vec3 = [0, 0, 0];
  /** Seconds, for the flailing of a stumble. */
  let clock = 0;
  /** Which hand the wall is on: -1 left, 1 right, eased. */
  let side = 0;
  /** The ledge the hands are on: the body's x and z, the height of its top, and the way the wall faces. */
  let grip: { x: number; y: number; z: number; dx: number; dz: number } | undefined;
  /** How closed each hand is, left then right, as of the last pose(). */
  const curls = [0, 0];

  const update: Body['update'] = (p, dt, k = 0, aspect = 1.6) => {
    kick = k;
    wide = aspect;
    if (!p) {
      me = undefined;
      return;
    }
    gait.update(p, dt, world && floorOf(world, p.y));
    me = { ...p };
    clock += dt;
    prog = progress(prog, p, dt);
    jolt = (p.pushes ?? 0) !== pushes && p.lock ? 1 : jolt * Math.exp(-dt * 12);
    pushes = p.pushes ?? 0;
    trail.update(dt);
    const walks = p.mode == MODE.GROUND || p.mode == MODE.CROUCH || p.mode == MODE.WALLRUN;
    const dash = p.dash > DASH_COOLDOWN - DASH_TICKS;
    const air = p.mode == MODE.AIR && !dash;
    const to = {
      amp: walks ? clamp(speedOf(p) / 9) : 0,
      sprint: +sprinting(p),
      air: +air,
      rise: +(air && p.vy > 0.5),
      dash: +dash,
      plant: +(p.mode == MODE.HANG || p.mode == MODE.CLIMB),
      wall: +(p.mode == MODE.WALLRUN),
      slide: +(p.mode == MODE.SLIDE),
      stun: +(p.stun > 0),
      gun: +(p.ammo >= 0 && !p.down && !p.wield),
      blade: +(!!p.wield && !p.down),
    };
    for (const n of Object.keys(RATES) as (keyof typeof RATES)[]) {
      w[n] += (to[n] - w[n]) * (1 - Math.exp(-dt * RATES[n]));
    }
    const [tx, tz] = TOWARD[p.wall];
    // Right of a body that faces `yaw` is (cos, -sin): the wall's side is its dot with it.
    side +=
      (clamp(tx * Math.cos(p.yaw) - tz * Math.sin(p.yaw), -1, 1) - side) * (1 - Math.exp(-dt * 10));
    if (to.plant && p.edge) {
      grip = { x: p.x, y: p.edge, z: p.z, dx: tx, dz: tz };
    }
  };

  /**
   * The gun in camera space: where its grip is (lower right, rising from below as it is taken, kicked
   * back by a shot, swaying with the run, shaking with a charge) and its axes, pointing at `target`.
   */
  const holster = (): [Vec3, Vec3[]] => {
    const a = w.amp * (1 + 0.5 * w.sprint);
    // A charge past a tap shakes the gun, harder as it grows: 4.5 mm at the full charge.
    const shake =
      me && !me.wield && (me.charge ?? 0) >= CHARGE_TAP
        ? 0.0045 * Math.min(1, (me.charge! - CHARGE_TAP) / (CHARGE_TICKS - CHARGE_TAP))
        : 0;
    const [s, c] = [Math.sin(TAU * gait.phase), Math.cos(TAU * gait.phase)];
    const at: Vec3 = [
      Math.min(0.22, 0.18 * wide) + 0.012 * a * s + lift[0] + shake * Math.sin(clock * 53),
      -0.25 + 0.018 * a * c - 0.3 * (1 - w.gun) + lift[1] + shake * Math.sin(clock * 61 + 1),
      0.4 - 0.05 * kick + lift[2],
    ];
    // A shot kicks the nose up.
    const to: Vec3 = [target[0], target[1] + 0.1 * kick * Math.hypot(...target), target[2]];
    return [at, pointed(at, to, X, Y)];
  };

  /**
   * The katana in camera space, in the guard (rising from below as it is drawn, swaying with the
   * run) or in the cut: where the right hand holds its grip and the way the blade points.
   */
  const blade = () => {
    const a = w.amp * (1 + 0.5 * w.sprint);
    const [s, c] = [Math.sin(TAU * gait.phase), Math.cos(TAU * gait.phase)];
    // In a saber lock the blade crosses the foe's, shaking, and each press drives it on.
    const k = me?.lock ? locked(clock, jolt) : stroke(me?.cut ?? 0, Math.max(prog, 0));
    const at: Vec3 = [k[0] + 0.012 * a * s, k[1] + 0.018 * a * c - 0.35 * (1 - w.blade), k[2]];
    return { at, g: unit([k[3], k[4], k[5]]) };
  };

  const pose: Body['pose'] = (eye, yaw, pitch, roll = 0) => {
    if (!me || me.down || dist(eye, [me.x, me.y + eyeHeight(me), me.z]) > AWAY) {
      return undefined;
    }
    const g = gait.pose();
    const q: Pose = {
      at: [...g.at],
      yaw: g.yaw,
      hips: [...g.hips],
      rot: g.rot.map(r => [...r] as Quat),
    };
    const [r, u, f] = basis(yaw, pitch, roll);
    /** Camera space (right, up, forward) as a direction in the world, and a world direction in it. */
    const turn = ([a, b, c]: Vec3): Vec3 => [
      r[0] * a + u[0] * b + f[0] * c,
      r[1] * a + u[1] * b + f[1] * c,
      r[2] * a + u[2] * b + f[2] * c,
    ];
    const view = (v: Vec3): Vec3 => [dot(v, r), dot(v, u), dot(v, f)];
    // The trunk follows the look a little, and moves through the katana's cut (trunk()): it
    // twists, bends and leans, the chest more than the waist, so the shoulders carry the arms.
    const sw = w.blade > 0.002 ? blade() : undefined;
    // Locked, the trunk leans into the foe.
    const [tw, bd, ln] =
      sw && me.lock
        ? [0, 0.15 * w.blade, 0]
        : sw && prog >= 0
          ? trunk(me.cut ?? 0, prog).map(v => v * w.blade)
          : [0, 0, 0];
    // The body turns on its feet as the view does: round in a spin, and a share of the twist.
    q.yaw += sw && prog >= 0 ? whirl(me.cut ?? 0, prog) * w.blade + SWAY * tw : 0;
    // The katana's space: the camera's, tipped down BOW at most, so the guard stays upright, and
    // carried round by the chest: the view turns SWAY of its twist and the hands HANDS of it on
    // top (any more and they leave the view in a wind-up). The bend is the trunk's alone, so the
    // strike stays on the crosshair.
    const [kr, ku, kf] = basis(yaw + HANDS * tw, Math.max(pitch, -BOW), roll);
    const keep = ([a, b, c]: Vec3): Vec3 => [
      kr[0] * a + ku[0] * b + kf[0] * c,
      kr[1] * a + ku[1] * b + kf[1] * c,
      kr[2] * a + ku[2] * b + kf[2] * c,
    ];
    for (const [j, k] of [
      [J.SPINE, 0.4],
      [J.CHEST, 0.6],
    ]) {
      q.rot[j] = mul(
        q.rot[j],
        mul(
          mul(axis(Y, tw * k), axis(X, 0.12 * clamp(pitch, -1.3, 1.3) - bd * k)),
          axis(Z, ln * k),
        ),
      );
    }
    // The head goes to the camera, the planted feet stay where they are.
    const s0 = solve(q);
    const ahead: Vec3 = [-Math.sin(yaw), 0, -Math.cos(yaw)];
    const nose = add(s0.pos[J.HEAD], spin(s0.rot[J.HEAD], [0, 0.02, -0.08]));
    q.at = add(
      q.at,
      sub(eye, along(nose, [-ahead[0] * BEHIND, -DROP, -ahead[2] * BEHIND], w.plant)),
    );
    const s = solve(q);
    const fwd: Vec3 = [-Math.sin(q.yaw), 0, -Math.cos(q.yaw)];
    for (const j of [J.THIGH_L, J.THIGH_R]) {
      reach(q, s, j, s0.pos[j + 2], fwd, true);
    }
    // The weapons stay out of the trunk and in sight: looking down, their grips would sink into the
    // chest or under it, so they go forward until they are clear. The katana's two grips and its
    // guard go together.
    const out = (pts: Vec3[], to = turn) =>
      along([0, 0, 0], fwd, Math.max(...pts.map(p => outOf(s, q.yaw, eye, add(eye, to(p))))));
    lift = [0, 0, 0];
    const [g0, gx] = holster();
    // The gun's grip, the back of its body and the top of its counter, which lie toward the chest.
    const on = ([x, y, z]: Vec3): Vec3 =>
      [0, 1, 2].map(i => g0[i] + gx[0][i] * x + gx[1][i] * y - gx[2][i] * z) as Vec3;
    lift = view(out([g0, on(REAR), on([0, 0.156, 0.04])]));
    const clear = sw
      ? out([sw.at, along(sw.at, sw.g, -BACK), along(sw.at, sw.g, BASE)], keep)
      : lift;
    // The gun hand's wrist: the grip is 8 cm along the fingers from it and 2 cm toward the palm.
    const [gp, ga] = holster();
    const fh = [0, 1, 2].map(i => TILT[1] * ga[2][i] - TILT[0] * ga[1][i]) as Vec3;
    const wrist = [0, 1, 2].map(i => gp[i] - 0.078 * fh[i] + 0.022 * ga[0][i]) as Vec3;
    // The katana and both fists as one piece, the wrists straight, the shoulders gone with the
    // hands (clasp()).
    const kq = { ...q, rot: q.rot.slice() };
    let [grip0, blade0, fingR, fingL]: Vec3[] = [eye, Y, Y, Y];
    if (sw) {
      const [at, g] = [add(add(eye, keep(sw.at)), clear), keep(sw.g)];
      shrug(kq, s, J.ARM_R, at);
      shrug(kq, s, J.ARM_L, along(at, g, -BACK));
      [grip0, blade0, fingR, fingL] = clasp(solve(kq), at, g, [
        keep([0.5, -1, -0.35]),
        keep([-0.5, -1, -0.35]),
      ]);
    }
    for (const sd of [-1, 1]) {
      const k = Math.cos(TAU * gait.phase) * sd;
      // The numbers are for the right hand, mirrored below. The arms hang along the body, out of
      // view; in a stride each swings like a pendulum, up into the lower view ahead and out of it
      // behind, more with speed and highest in a sprint.
      const g = clamp(w.amp * 1.8) + 0.2 * w.sprint;
      let h: Vec3 = [0.24 - 0.05 * g, -0.66 + 0.46 * g * ((k + 1) / 2) ** 1.2, 0.1 + 0.26 * g * k];
      h = mix(h, [0.38, -0.2, 0.34], w.air);
      h = mix(h, [0.3, 0.02, 0.45], w.rise);
      h = mix(h, [0.14, -0.1, 0.5], w.dash);
      const toWall = w.wall * clamp(side * sd);
      h = mix(h, [0.42, -0.16, 0.42], toWall);
      h = mix(h, sd > 0 ? [0.36, -0.26, 0.38] : [0.28, -0.1, 0.42], w.slide);
      // Reeling from a tackle: the hands thrown out and up, flailing against each other.
      const flail = Math.sin(clock * 12 + (sd > 0 ? Math.PI : 0));
      h = mix(h, [0.46, 0.05 + 0.2 * flail, 0.4 + 0.1 * flail], w.stun);
      if (grip) {
        // On the ledge's lip, a hand-width apart along the wall, the right hand on the right.
        let [tx, tz] = [-grip.dz, grip.dx];
        if (dot([tx, 0, tz], r) < 0) {
          [tx, tz] = [-tx, -tz];
        }
        // The wrist a hand's length short of the lip, the fingers over it.
        const lip = PLAYER_R + GRAB_GAP - 0.08;
        const at: Vec3 = [
          grip.x + grip.dx * lip + tx * 0.12 * sd,
          grip.y + 0.03,
          grip.z + grip.dz * lip + tz * 0.12 * sd,
        ];
        // Rising past it the hands push down on it and stay in the lower view.
        const [px, py, pz] = view(sub(at, eye));
        h = mix(h, [px * sd, Math.max(py, -0.28), Math.max(pz, 0.4)], w.plant);
      }
      // The weapons take the hand unless it is on a ledge or a wall or reeling. The katana takes
      // both hands.
      const free = 1 - clamp(w.plant + toWall + w.stun);
      const onSword = sw ? w.blade * free : 0;
      let taken = onSword;
      if (sd > 0) {
        hold = w.gun * free;
        h = mix(h, wrist, hold);
        grasp = onSword;
        taken = Math.max(hold, grasp);
      }
      // A loose fist, tighter as the pace goes up; open to catch the air, flat on a ledge, a wall or the floor.
      let curl = 0.75 + 0.25 * w.sprint;
      for (const [open, t] of [
        [0.25, w.air],
        [0.1, w.rise],
        [1, w.dash],
        [0.1, toWall],
        [0.1, w.slide],
        [0.1, w.plant],
        [0.2, w.stun],
      ]) {
        curl += (open - curl) * t;
      }
      curls[(sd + 1) / 2] = curl + (0.9 - curl) * taken;
      const to = add(eye, turn([h[0] * sd, h[1], h[2]]));
      const arm = sd < 0 ? J.ARM_L : J.ARM_R;
      reach(q, s, arm, to, turn([POLE[0] * sd, POLE[1], POLE[2]]));
      // The palm turns down, the back of the hand to the view, flat on a ledge or the floor.
      q.rot[arm + 2] = axis(Y, sd * (1 + 0.5 * (w.plant + w.slide)));
      if (sd > 0 && hold > 0.002) {
        // The back of the hand along the gun's right, the fingers around the grip.
        const rot = frame(turn(ga[0]), turn(fh));
        q.rot[arm + 2] = slerp(q.rot[arm + 2], mul(inv(solve(q).rot[J.FOREARM_R]), rot), hold);
      }
      if (sw && onSword > 0.002) {
        // Both hands round the grip, the left one BACK behind the right, the wrists straight.
        const at = along(grip0, blade0, sd > 0 ? 0 : -BACK);
        const held = { ...q, rot: q.rot.slice() };
        held.rot[arm - 1] = kq.rot[arm - 1];
        wield(held, s, arm, at, blade0, keep([0.5 * sd, -1, -0.35]), sd > 0 ? fingR : fingL);
        for (const k of [arm - 1, arm, arm + 1, arm + 2]) {
          q.rot[k] = slerp(q.rot[k], held.rot[k], onSword);
        }
      }
    }
    return solve(q);
  };

  return {
    get id() {
      return me?.id ?? -1;
    },
    update,
    pose,
    draw(out, eye, yaw, pitch, roll = 0, color = [0.7, 0.7, 0.7]) {
      const s = pose(eye, yaw, pitch, roll);
      if (s) {
        const colors = palette(color);
        skin(out, body(2), s, colors);
        [J.HAND_L, J.HAND_R].forEach((j, i) => {
          const q = s.rot[j];
          hand(
            out,
            s.pos[j],
            spin(q, [0, -1, 0]),
            spin(q, [i * 2 - 1, 0, 0]),
            spin(q, [0, 0, -1]),
            curls[i],
            colors[7],
          );
        });
        if (hold > 0.2) {
          // The gauge lights once a press is more than a tap: the strength the shot would have.
          const level =
            me && (me.charge ?? 0) >= CHARGE_TAP ? Math.min(powerOf(me.charge!), me.ammo) : 0;
          held(out, s.pos[J.HAND_R], s.rot[J.HAND_R], 1, clamp(hold * 1.5 - 0.5), me?.ammo, level);
        }
        if (grasp > 0.2) {
          sword(out, s.pos[J.HAND_R], s.rot[J.HAND_R], 1, clock, clamp(grasp * 1.5 - 0.5));
        }
        const [base, point] = ends(s.pos[J.HAND_R], s.rot[J.HAND_R]);
        trail.mark(base, point, grasp > 0.5 && cutting(prog));
        trail.draw(out);
      }
    },
    aim(t) {
      const l = Math.hypot(...t);
      target = l < 3 ? (l ? (t.map(v => (v * 3) / l) as Vec3) : [0, 0, 3]) : t;
    },
    muzzle: () => tip(...holster()),
    spun: () =>
      me && prog >= 0 ? whirl(me.cut ?? 0, prog) + SWAY * trunk(me.cut ?? 0, prog)[0] * w.blade : 0,
  };
};
