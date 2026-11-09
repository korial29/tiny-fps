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
  HEAT_MAX,
} from '../shared/constants';
import { powerOf } from '../shared/gun';
import { TAU, eyeHeight, speedOf, sprinting } from '../shared/physics';
import { MODE } from '../shared/types';
import type { PlayerState } from '../shared/types';
import { ray } from '../shared/world';
import type { World } from '../shared/world';
import { createGait, frame } from './gait';
import { fetched, pouch, pouchAt } from './pouch';
import type { Floor } from './gait';
import {
  GUN_ON,
  axes as gunAxes,
  grip as gunGrip,
  pressAt,
  buttonAt,
  firsts,
  poke,
  thumbTo,
  tune,
  REAR,
  TILT,
  charge,
  ease,
  fore,
  kindOf,
  held,
  loadFrame,
  TAP,
  BROUGHT,
  screwed,
  pointed,
  power,
  span,
  swapOf,
  tip,
  cellsOf,
} from './gun';
import {
  BASE,
  BOW,
  C,
  S,
  SWAY,
  bent,
  cutting,
  ends,
  held as sword,
  locked,
  poised,
  progress,
  BEHIND as BACK,
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
  /** How far a share of the trunk's twist in a cut has turned the body as of the last update (radians, trunk()): the drawn view turns with it. */
  spun(): number;
  /** Its gait's footsteps so far and stride phase (Gait.steps, Gait.phase): the sounds of its steps and the bob of the view go with its feet. */
  readonly steps: number;
  readonly phase: number;
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
 * the least way from where the cut puts it (a radian of the blade weighs as 3 m of the hands) to
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
  // weighs as 3 m of the hands, so the hands move and the blade keeps the line of its cut.
  const free = [1, 1, 1, 0.1, 0.1, 0.1];
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

/** Finger thicknesses against FINGER_R, index to little: the little finger is thinner. */
const THICK = [1, 1, 0.96, 0.86];
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
/** Sides around a finger (6 until the user, 2026-11-09: more detail on the hands). */
export const FINGER_SIDES = 10;
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
const tube = (
  rings: Ring[],
  sides: number,
  put: (p: Vec3, n: Vec3, r: number) => void,
  lean?: number,
) => {
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
          put(at(P, j, k), at(N, j, k), j);
        }
      }
    }
  }
};

/** A finger's half thickness at its root (11.2 mm until the fingers closed round a grip, 2026-11-09). */
const FINGER_R = 0.01;
/** The lengths of a finger's three phalanges against `l`, the root one first. */
const BONES = [1, 0.62, 0.42];
/** The ring of a finger from which on it is bare: the glove's fingers end 60 % along the middle phalanx. */
export const BARE = 8;

/**
 * The rings of a finger, in the hand's space: from `p` along `d1`, `d2` then `d3`, its three
 * phalanges (BONES of `l`), `r` thick at the root, the first ring across `t`. Each bend is a curve
 * through the joint, not a corner, so that a fist keeps a round knuckle. The glove ends at ring
 * BARE in a rolled edge; the skin goes on to the tip.
 */
export const finger = (
  p: Vec3,
  d1: Vec3,
  d2: Vec3,
  d3: Vec3,
  l: number,
  r: number,
  t: Vec3,
): Ring[] => {
  const [l1, l2, l3] = BONES.map(k => k * l);
  const j1 = along(p, d1, l1);
  const j2 = along(j1, d2, l2);
  /** A ring at `c` across `d`, `k` thick, `h` of that from the palm side to the back. */
  const ring = (c: Vec3, d: Vec3, k: number, h = 1): Ring => {
    const [t, y] = [unit(d), unit(cross(d, X))];
    return [c, cross(y, t).map(v => v * r * k) as Vec3, y.map(v => v * r * k * h) as Vec3];
  };
  /**
   * The bend from `a` to `b` round the joint `j`, a curve on it (its ends along the two bones, no
   * kink where it meets them): four rings, `k0` to `k1` thick.
   */
  const bend = (a: Vec3, j: Vec3, b: Vec3, k0: number, k1: number, flat = 0) => {
    const c = j;
    return [1 / 5, 2 / 5, 3 / 5, 4 / 5].map(k =>
      ring(
        mix(mix(a, c, k), mix(c, b, k), k),
        add(mix(sub(c, a), [0, 0, 0], k), mix(sub(b, c), [0, 0, 0], 1 - k)),
        k0 + (k1 - k0) * k,
        // Flatter across the joint, most at its middle: the inside of the bend does not fold.
        1 - flat * Math.sin(Math.PI * k),
      ),
    );
  };
  // The first bend from 60 % back along the first bone to 60 % along the second: a wide knuckle,
  // its inside not folded.
  const [a1, mid, b2] = [along(j1, d1, -0.6 * l1), along(j1, d2, 0.6 * l2), along(j2, d3, l3 / 2)];
  // The root sunk 12 mm in the palm and flared, a fillet that leaves it at a slant with no seam
  // (the user, 2026-11-09).
  return [
    ring(along(p, unit(t), -0.012), t, 1.35),
    ring(p, t, 1.1),
    ring(a1, d1, 1),
    ...bend(a1, j1, mid, 0.98, 0.95, 0.22),
    // The glove's edge, rolled, then the bare finger a hair beyond it.
    ring(mid, d2, 0.95),
    ring(along(mid, d2, 0.003), d2, 0.88),
    ...bend(along(mid, d2, 0.003), j2, b2, 0.86, 0.84),
    ring(b2, d3, 0.82),
    ring(along(j2, d3, l3 - 0.001), d3, 0.7),
    ring(along(j2, d3, l3 + 0.006), d3, 0),
  ];
};

/**
 * The directions of the three phalanges of the finger i (index to little) at `curl`, in the hand's
 * space. At 0.9, the curl of every grip, they go round a handle 2.5 cm thick 7.8 cm along the
 * fingers from the wrist and 2.2 cm toward the palm, their tips back at the heel of the palm (the
 * user, 2026-11-09: the fingers stood off the katana's grip).
 */
export const phalanges = (curl: number, i: number): [Vec3, Vec3, Vec3] => {
  const splay = -(i - 1.5) * 0.08 * (1 - curl);
  // Past a grip's curl the joints bend no more (tighter, a bend folds into itself): the finger
  // turns at its root.
  const k = Math.min(curl, 0.9);
  const a = 0.1 + 1.81 * curl;
  const b = a + 0.08 + 1.74 * k;
  const [x, y, z] = [a, b, b + 0.06 + 0.99 * k].map(n => unit([splay, -Math.sin(n), Math.cos(n)]));
  return [x, y, z];
};

/** The knuckles' shell and the strap's buckle: near-black hard plastic. */
const SHELL = [0.09, 0.09, 0.1];

/**
 * A gloved hand at the wrist `end`: the fingers along `f`, the back of the hand along `u`, the thumb
 * toward `th` (unit vectors). `curl` runs from 0, a flat open hand with the fingers spread, to 1, a
 * fist. The palm is one tube that starts as the sleeve's cuff ends and spreads to the knuckles,
 * and each finger and the thumb one tube from there, bent at its joints: no solid meets another
 * in a line, and the normals are smooth all over. A tactical glove (the user, 2026-11-09: more
 * detail): fingerless from halfway along the middle phalanx, the bare tips in `bare` with a nail
 * each; a hard shell over the knuckles, a padded plate on the back, a strap round the wrist.
 */
export const hand = (
  out: number[],
  end: Vec3,
  f: Vec3,
  u: Vec3,
  th: Vec3,
  curl: number,
  tint: number[],
  point = 0,
  push = 0,
  to?: Vec3,
  bare = tint,
) => {
  let paint = (_: number) => tint;
  /** Hand space (x toward the thumb, y the back, z toward the fingers), a point and a direction, to the world, in `paint` of its ring. */
  const put = ([x, y, z]: Vec3, [m, n, w]: Vec3, r = 0) => {
    const c = paint(r);
    out.push(
      ...[0, 1, 2].map(d => end[d] + th[d] * x + u[d] * y + f[d] * z),
      ...[0, 1, 2].map(d => th[d] * m + u[d] * n + f[d] * w),
      c[0],
      c[1],
      -1,
      c[2],
    );
  };
  // The palm starts as the sleeve's cuff does, vertex for vertex, its normals leaning to the fingers.
  const PALM = [
    [WRIST[1] - CUFF[0], CUFF[1] - WRIST[0], CUFF[3], CUFF[4]],
    [0.025, 0, 0.043, 0.024],
    [0.06, -0.002, 0.046, 0.019],
    [0.092, -0.004, 0.046, 0.0125],
    [0.104, -0.004, 0, 0],
  ];
  const palm = ([z, y, a, b]: number[], k = 1): Ring => [
    [0, y, z],
    [a * k, 0, 0],
    [0, b * k, 0],
  ];
  // The palm up to WELD; from there a skin welds it to the four fingers' roots (weld(), below).
  tube(
    PALM.slice(0, 3).map(r => palm(r)),
    CUFF_SIDES,
    put,
    0.75,
  );
  const nail = mix(bare as Vec3, [0.98, 0.74, 0.7], 0.4);
  /** A finger's tube, its glove to ring BARE and bare beyond, and the nail on its tip. */
  const digit = (p: Vec3, ds: [Vec3, Vec3, Vec3], l: number, r: number, t: Vec3, from = 1) => {
    paint = k => (k < BARE ? tint : bare);
    // From where it leaves the palm, ring `from`: a weld skins its root.
    tube(finger(p, ...ds, l, r, t).slice(from), FINGER_SIDES, (q, n, k) => put(q, n, k + from));
    paint = () => nail;
    // The nail: an oval on the back of the last phalanx, toward its tip, a hair out of it.
    const d = ds[2];
    const j2 = along(along(p, ds[0], BONES[0] * l), ds[1], BONES[1] * l);
    const y = unit(cross(d, X));
    const x = cross(y, d);
    const c = add(along(j2, d, BONES[2] * l * 0.6), y.map(v => v * (r * 0.79 + 0.0003)) as Vec3);
    const rim = (k: number): Vec3 =>
      add(
        c,
        add(
          x.map(v => v * r * 0.42 * Math.cos((k * TAU) / 8)) as Vec3,
          d.map(v => v * 0.005 * Math.sin((k * TAU) / 8)) as Vec3,
        ),
      );
    for (let k = 0; k < 8; k++) {
      for (const q of [c, rim(k), rim(k + 1)]) {
        put(q, y);
      }
    }
  };
  /** Each finger's ring where it leaves the palm: its middle and its vertices, as finger() places them. */
  const roots: [Vec3, Vec3[], Vec3, Vec3][] = [];
  for (let i = 0; i < 4; i++) {
    // `point` straightens the index out of the fist, to press a button.
    const ds = phalanges(i ? curl : curl * (1 - point), i);
    const at: Vec3 = [0.034 - 0.0225 * i, -0.004, 0.092];
    const t = unit(add(ds[0], [0, 0, 1]));
    digit(at, ds, 0.04 * LENGTH[i], FINGER_R * THICK[i], t);
    const [, x, y] = finger(at, ...ds, 0.04 * LENGTH[i], FINGER_R * THICK[i], t)[1];
    roots.push([
      at,

      Array.from({ length: FINGER_SIDES }, (_, k) => {
        const a = (k * TAU) / FINGER_SIDES;
        return [0, 1, 2].map(d => at[d] + x[d] * Math.cos(a) + y[d] * Math.sin(a)) as Vec3;
      }),
      unit(y),
      t,
    ]);
  }
  // The weld (the user, 2026-11-09: one piece, no joint): the palm's last ring zipped to the outline
  // of the four roots (their vertices that are not inside a neighbour), by angle round the palm's
  // axis; between two fingers it dips into a web.
  paint = () => tint;
  const [wz, y0, a0, b0] = PALM[2];
  type W = [Vec3, Vec3];
  const palmLoop = Array.from({ length: CUFF_SIDES }, (_, k): W => {
    const a = (k * TAU) / CUFF_SIDES;
    return [
      [a0 * Math.cos(a), y0 + b0 * Math.sin(a), wz],
      unit([Math.cos(a) / a0, Math.sin(a) / b0, 0]),
    ];
  });
  /** A finger's root vertices that are not inside a neighbour, on the back (`top`) or the palm side, round it the way the palm's loop goes. */
  const arc = (i: number, top: boolean): W[] => {
    const [c, ring] = roots[i];
    return ring
      .map((p, k): [Vec3, number] => [p, k])
      .filter(([p, k]) => {
        const a = (k * TAU) / FINGER_SIDES;
        const side = i == 3 ? a <= Math.PI + 1e-6 : a < Math.PI - 1e-6;
        return (
          (top ? side : !side) && roots.every(([o], j) => j == i || dist(p, o) > FINGER_R * 1.1)
        );
      })
      .map(([p]): W => [p, unit(sub(p, c))]);
  };
  /** The web's low point between fingers `i` and `i + 1`, on the back or the palm side: where their roots cross, a little back toward the palm. */
  const web = (i: number, s: number): W => {
    const [[c0, , y0r, t0], [c1, , y1r, t1]] = [roots[i], roots[i + 1]];
    const up = unit(add(y0r, y1r));
    const back = unit(add(t0, t1));
    return [
      add(
        mix(c0, c1, 0.5),
        add(up.map(c => c * s * 0.005) as Vec3, back.map(c => c * -0.003) as Vec3),
      ),
      [0, 0, 0],
    ];
  };
  // The outline in order, from the index's outer side over the back to the little finger and
  // round under the palm back to the index, the way the palm's loop goes (the user, 2026-11-09).
  const outline: W[] = [
    ...[0, 1, 2, 3].flatMap(i => (i ? [web(i - 1, 1), ...arc(i, true)] : arc(i, true))),
    ...[3, 2, 1, 0].flatMap(i => (i < 3 ? [web(i, -1), ...arc(i, false)] : arc(i, false))),
  ];
  /** Each vertex of a closed loop with how far round it it is, 0 to 1, by length. */
  const round = (l: W[]): [W, number][] => {
    const d = l.map((w, k) => dist(w[0], l[(k + 1) % l.length][0]));
    const all = d.reduce((a, b) => a + b, 0);
    let run = 0;
    return l.map((w, k) => {
      const t = run / all;
      run += d[k];
      return [w, t];
    });
  };
  const [A, B] = [round(palmLoop), round(outline)];
  let [i, j] = [0, 0];
  const v = (l: [W, number][], k: number): [W, number] =>
    k >= l.length ? [l[k % l.length][0], l[k % l.length][1] + 1] : l[k];
  const tris: W[][] = [];
  while (i < A.length || j < B.length) {
    // Advance on the loop whose next vertex comes first round it.
    const ta = i < A.length ? v(A, i + 1)[1] : Infinity;
    const tb = j < B.length ? v(B, j + 1)[1] : Infinity;
    tris.push(
      ta < tb ? [v(A, i)[0], v(A, i + 1)[0], v(B, j)[0]] : [v(A, i)[0], v(B, j + 1)[0], v(B, j)[0]],
    );
    if (ta < tb) {
      i++;
    } else {
      j++;
    }
  }
  // Each vertex's normal: its own surface's, and the weld's faces round it, outward, as much.
  const sum = new Map<Vec3, Vec3>();
  for (const t of tris) {
    const [p, q, w] = t.map(x => x[0]);
    let n = unit(cross(sub(q, p), sub(w, p)));
    if (dot(n, [p[0], p[1] - y0, 0]) < 0) {
      n = n.map(c => -c) as Vec3;
    }
    for (const [x] of t) {
      sum.set(x, add(sum.get(x) ?? [0, 0, 0], n));
    }
  }
  for (const t of tris) {
    for (const [p, n] of t) {
      put(p, unit(add(n, unit(sum.get(p)!))));
    }
  }
  // `push` (0 to 1) reaches the thumb's tip out along `to`, onto the katana's button.
  const [d1, d2] = THUMB.map(([open, fist], k) => {
    const d = unit(mix(open, fist, curl));
    return k && to ? unit(mix(d, to, push)) : d;
  });
  const tp: Vec3 = [0.032, -0.01, 0.025];
  digit(tp, [d1, d2, d2], 0.037, 0.0124, d1, 2);
  // The thumb's mound (the user, 2026-11-09: the thumb shows the most, holding a gun): from a
  // footprint on the palm round its root, its ring there pushed out onto the palm's surface, a
  // skin swells into the thumb halfway along its first bone. One piece with the palm.
  paint = () => tint;
  {
    const rings = finger(tp, d1, d2, d2, 0.037, 0.0124, d1);
    const [, x1, y1] = rings[1];
    const [c2, x2, y2] = rings[2];
    /** The palm's ring at `z`: its middle's height, half its width and its height. */
    const section = (z: number) => {
      const k = Math.min(
        Math.max(
          PALM.findIndex(row => row[0] > z),
          1,
        ),
        PALM.length - 2,
      );
      const [a, b] = [PALM[k - 1], PALM[k]];
      const f = Math.min(Math.max((z - a[0]) / (b[0] - a[0]), 0), 1);
      return [1, 2, 3].map(i => a[i] + (b[i] - a[i]) * f);
    };
    const foot = Array.from({ length: FINGER_SIDES }, (_, k): [Vec3, Vec3] => {
      const a = (k * TAU) / FINGER_SIDES;
      const q = [0, 1, 2].map(
        d => tp[d] + 1.7 * (x1[d] * Math.cos(a) + y1[d] * Math.sin(a)),
      ) as Vec3;
      const [yc, w, h] = section(q[2]);
      // Out from the palm's axis onto its surface.
      const e = Math.hypot(q[0] / w, (q[1] - yc) / h) || 1;
      const on: Vec3 = [q[0] / e, yc + (q[1] - yc) / e, q[2]];
      return [on, unit([on[0] / (w * w), (on[1] - yc) / (h * h), 0])];
    });
    const top = Array.from({ length: FINGER_SIDES }, (_, k): [Vec3, Vec3] => {
      const a = (k * TAU) / FINGER_SIDES;
      const d: Vec3 = [0, 1, 2].map(i => x2[i] * Math.cos(a) + y2[i] * Math.sin(a)) as Vec3;
      return [add(c2, d), unit(d)];
    });
    // A third ring between, swollen: the mound.
    const mid = foot.map(([q, n], k): [Vec3, Vec3] => [
      add(mix(q, top[k][0], 0.5), n.map(c => c * 0.003) as Vec3),
      unit(add(n, top[k][1])),
    ]);
    for (const [a, b] of [
      [foot, mid],
      [mid, top],
    ]) {
      for (let k = 0; k < FINGER_SIDES; k++) {
        const n = (k + 1) % FINGER_SIDES;
        for (const [q, m] of [a[k], a[n], b[n], a[k], b[n], b[k]]) {
          put(q, m);
        }
      }
    }
  }
  /** The back of the palm at `z` forward and `x` across, its height in the hand. */
  const back = (z: number, x = 0) => {
    const k = PALM.findIndex(r => r[0] > z);
    const [a, b] = [PALM[k - 1], PALM[k]];
    const t = (z - a[0]) / (b[0] - a[0]);
    const [y, w, h] = [1, 2, 3].map(i => a[i] + (b[i] - a[i]) * t);
    return y + h * Math.sqrt(Math.max(1 - (x / w) ** 2, 0));
  };
  // The knuckles' shell: a hard ridge across their backs, swelling over each.
  paint = () => SHELL;
  tube(
    Array.from({ length: 20 }, (_, i) => -0.0475 + i * 0.005).map((x, i, a): Ring => {
      // A swell over each knuckle (the fingers 2.25 cm apart), the ends rounded off.
      const swell = 1 + 0.18 * Math.cos(((x - 0.034) / 0.0225) * TAU);
      const e = Math.min(Math.max((0.0475 - Math.abs(x - 0.0005)) / 0.005, 0), 1);
      // Each end a ring of almost nothing then a point: tube() starts on a ring.
      const k = i == a.length - 1 ? 0 : swell * Math.max(Math.sqrt(e * (2 - e)), 0.1);
      return [
        [-x, back(0.084, x) + 0.003, 0.084],
        [0, 0.0038 * k, 0],
        [0, 0, 0.009 * k],
      ];
    }),
    10,
    put,
  );
  // A padded plate on the back of the hand, and the strap round the wrist with its buckle.
  paint = () => tint.map(v => v * 0.72);
  tube(
    [0.03, 0.031, 0.034, 0.05, 0.066, 0.069, 0.071].map((z, i): Ring => {
      const k = [0.1, 0.6, 0.92, 1, 1, 0.75, 0][i];
      return [
        [0, back(z) + 0.0004, z],
        [0.019 * k, 0, 0],
        [0, 0.0034 * k, 0],
      ];
    }),
    12,
    put,
  );
  // Its stitching, light dashes round it a little inside its edge.
  paint = () => tint.map(v => v * 1.45);
  const top = (x: number, z: number): Vec3 => [
    x,
    back(z) + 0.0004 + 0.0034 * Math.sqrt(Math.max(1 - (x / 0.019) ** 2, 0)) + 0.0002,
    z,
  ];
  const loop = (t: number): number[] => {
    // Round a rounded rectangle, 3 cm by 3.4, from 0 to 1.
    const a = t * TAU;
    const [c, s] = [Math.cos(a), Math.sin(a)];
    return [
      0.0155 * Math.sign(c) * Math.abs(c) ** 0.4,
      0.05 + 0.0145 * Math.sign(s) * Math.abs(s) ** 0.4,
    ];
  };
  for (let i = 0; i < 28; i++) {
    const [a, b] = [loop(i / 28), loop((i + 0.55) / 28)];
    const d = unit([b[0] - a[0], 0, b[1] - a[1]]);
    const w: Vec3 = [-d[2] * 0.0005, 0, d[0] * 0.0005];
    const q = [a, b].flatMap(([x, z]) => [top(x + w[0], z + w[2]), top(x - w[0], z - w[2])]);
    for (const v of [q[0], q[2], q[3], q[0], q[3], q[1]]) {
      put(v, [0, 1, 0]);
    }
  }
  paint = () => tint.map(v => v * 0.5);
  const strap = (z: number, k: number) => {
    const [a, b] = PALM;
    const t = (z - a[0]) / (b[0] - a[0]);
    return palm(
      a.map((v, i) => v + (b[i] - v) * t),
      k,
    );
  };
  const [z0, z1] = [PALM[0][0] + 0.004, PALM[0][0] + 0.016];
  tube(
    [strap(z0, 0.96), strap(z0 + 0.0015, 1.07), strap(z1 - 0.0015, 1.07), strap(z1, 0.96)],
    CUFF_SIDES,
    put,
  );
  paint = () => SHELL;
  const zb = (z0 + z1) / 2;
  const yb = strap(zb, 1.07)[0][1] + strap(zb, 1.07)[2][1];
  tube(
    [-0.009, -0.008, 0.008, 0.009].map((x, i): Ring => {
      const k = i % 3 ? 1 : i ? 0 : 0.1;
      return [
        [x, yb, zb],
        [0, 0.0018 * k, 0],
        [0, 0, 0.0055 * k],
      ];
    }),
    6,
    put,
  );
};

/** The floor under a player standing at height `y`: the first top within a step above or below it. */
const floorOf =
  (world: World, y: number): Floor =>
  (x, z) => {
    const d = ray(world, [x, y + STEP_H, z], [0, -1, 0], 2 * STEP_H);
    return d > 0 && d < 2 * STEP_H ? y + STEP_H - d : y;
  };

/** On a wall run the rail gun is put away, unless its bolt is going out. */
export const stowed = (p: PlayerState): boolean => p.mode == MODE.WALLRUN && !p.zapping;

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
  const gait = createGait(0);
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
  /** How closed each hand is, left then right, as of the last pose(); how far the left index is out, pressing a button. */
  const curls = [0, 0];
  let pointing = 0;
  /** The new battery in the left hand as it brings it from the pouch, in the world; undefined when it is not carrying one. */
  let carried: [Vec3, Vec3[]] | undefined;
  /**
   * The weapon in hand as last seen (0 the gun, 1 the katana, 2 the rail gun, -1 none), and the
   * seconds since it came to hand or a swap put its new battery in: it lights up over them (power()).
   */
  let drawn = -1;
  let since = 9;
  /** Whether the weapon in hand came to it for the first time (firsts()): only then is it switched on, by hand (the user, 2026-11-09). */
  const fresh = firsts();
  let first = false;
  /** When the weapon of `kind` in hand is switched on, seconds after it came; -1, at once, when it is not new. */
  const pressOf = (kind: number) => (first ? pressAt(kind) : -1);

  const update: Body['update'] = (p, dt, k = 0, aspect = 1.6) => {
    kick = k;
    wide = aspect;
    if (!p) {
      me = undefined;
      return;
    }
    gait.update(p, dt, world && floorOf(world, p.y));
    const now = p.down ? -1 : p.wield ? 1 : p.rifled ? 3 : p.railed ? 2 : p.ammo >= 0 ? 0 : -1;
    const f = fresh(p);
    first = now !== drawn ? f : first && !(me?.reload && !p.reload);
    since = now !== drawn || (me?.reload && !p.reload) ? 0 : since + dt;
    drawn = now;
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
      // The rail gun is put away on a wall unless its bolt is going out: a hand on the wall, the
      // other swinging with the stride.
      gun: +(!p.down && !p.wield && (p.ammo >= 0 || !!p.rifled || (!!p.railed && !stowed(p)))),
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

  /** The rail gun's grip against the gun's: the share of the way in toward the middle, and the metres back. */
  const RIFLE = [0.45, 0.14];

  /**
   * The gun in camera space: where its grip is (lower right, rising from below as it is taken, kicked
   * back by a shot, swaying with the run, shaking with a charge) and its axes, pointing at `target`.
   */
  const holster = (): [Vec3, Vec3[]] => {
    const a = w.amp * (1 + 0.5 * w.sprint);
    // A charge past a tap shakes the gun like the rail gun's bolt (the user, 2026-11-09): 1.5 mm
    // at once, 6 mm at the full charge, and kicks it 8 times a second, harder as it grows.
    // The rail gun's bolt kicks it at each pulse of the arc, 7 a second, and shakes it, harder as
    // it heats; overheated it trembles (the user, 2026-11-08).
    const zap = +!!me?.zapping;
    const heat = (me?.heat ?? 0) / HEAT_MAX;
    const held =
      me && !me.wield && (me.charge ?? 0) >= CHARGE_TAP
        ? Math.min(1, (me.charge! - CHARGE_TAP) / (CHARGE_TICKS - CHARGE_TAP))
        : -1;
    const kicked =
      kick +
      0.6 * zap * Math.max(0, Math.sin(clock * TAU * 7)) ** 6 +
      0.35 * Math.max(held, 0) * Math.max(0, Math.sin(clock * TAU * 8)) ** 6;
    const shake =
      (held < 0 ? 0 : 0.0015 + 0.0045 * held) +
      zap * (0.0012 + 0.004 * heat) +
      (me?.hot ? 0.002 : 0);
    const [s, c] = [Math.sin(TAU * gait.phase), Math.cos(TAU * gait.phase)];
    // The rail gun is held in both hands like a rifle: nearer the middle and the chest, so that
    // the left hand reaches its front grip.
    const r = me?.railed || me?.rifled ? 1 : 0;
    // A swap tips the gun over to show the battery under it, or the capsule on its top, and back.
    const sp = me ? swapOf(me) : -1;
    // Tipped over from the start, and back into aim after the slap (the user, 2026-11-09).
    const tipped = sp < 0 ? 0 : ease(span(sp, 0, 0.12)) * (1 - ease(span(sp, 0.8, 1)));
    const roll = tipped * (me?.rifled ? -1.1 : r ? 0.35 : -1.25);
    const at: Vec3 = [
      Math.min(0.22, 0.18 * wide) * (1 - RIFLE[0] * r) +
        0.012 * a * s +
        lift[0] +
        shake * Math.sin(clock * 53),
      -0.25 + 0.018 * a * c - 0.3 * (1 - w.gun) + lift[1] + shake * Math.sin(clock * 61 + 1),
      0.4 - RIFLE[1] * r - 0.05 * kicked + lift[2],
    ];
    // The rifle sits further out and higher than the rail gun, its counter in the lower view.
    const rf = me?.rifled ? 1 : 0;
    at[0] += 0.02 * rf;
    at[1] += 0.045 * rf;
    at[2] += 0.02 * rf;
    at[0] -= (rf ? 0.1 : r ? 0.04 : 0.12) * tipped;
    at[1] += 0.03 * rf * tipped;
    at[2] += 0.1 * rf * tipped;
    at[1] += (r ? 0.03 : 0.17) * tipped;
    // The slap home jolts the gun or the rifle: up 1.5 cm and back 1 cm, the nose kicked up, and
    // it settles (the user, 2026-11-09: a slight shock).
    const jolt = sp >= 0 && !me?.railed ? Math.max(0, 1 - Math.abs(sp - TAP - 0.02) / 0.04) : 0;
    at[1] += 0.015 * jolt;
    at[2] += 0.01 * jolt;
    // A shot kicks the nose up; a swap lifts it too, the rail gun's down.
    const l = Math.hypot(...target);
    const to: Vec3 = [
      target[0],
      target[1] + (0.1 * kicked + (r ? 0 : 0.2) * tipped + 0.06 * jolt) * l,
      target[2],
    ];
    const [rc, rs] = [Math.cos(roll), Math.sin(roll)];
    return [at, pointed(at, to, [rc, rs, 0], [-rs, rc, 0])];
  };

  /**
   * The katana in camera space, in the guard (rising from below as it is drawn, swaying with the
   * run) or in the cut: where the right hand holds its grip and the way the blade points.
   */
  const blade = () => {
    const a = w.amp * (1 + 0.5 * w.sprint);
    const [s, c] = [Math.sin(TAU * gait.phase), Math.cos(TAU * gait.phase)];
    // In a saber lock the blade crosses the foe's, shaking, and each press drives it on.
    const k = me?.lock ? locked(clock, jolt) : poised(me ?? {}, Math.max(prog, 0), clock);
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
          ? bent(me, prog).map(v => v * w.blade)
          : [0, 0, 0];
    // The body turns on its feet as the view does: a share of the twist.
    q.yaw += sw && prog >= 0 ? SWAY * tw : 0;
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
    lift = view(out([g0, on(REAR), on([0, 0.146, 0.038])]));
    const clear = sw
      ? out([sw.at, along(sw.at, sw.g, -BACK), along(sw.at, sw.g, BASE)], keep)
      : lift;
    // The gun hand's wrist: the grip is 8 cm along the fingers from it and 2 cm toward the palm.
    const [gp, ga] = holster();
    /** The weapon in hand by kind, for its button: the gun, the katana, the rail gun, the rifle. */
    const pk = me?.wield ? 1 : me ? kindOf(me) : 0;
    const fh = [0, 1, 2].map(i => TILT[1] * ga[2][i] - TILT[0] * ga[1][i]) as Vec3;
    const wrist = [0, 1, 2].map(i => gp[i] - 0.078 * fh[i] + 0.022 * ga[0][i]) as Vec3;
    // The rail gun's front grip, for the left hand.
    const [fc, fd, fu] = fore(gp, ga, me ? kindOf(me) : 2);
    // The katana and both fists as one piece, the wrists straight, the shoulders gone with the
    // hands (clasp()).
    const kq = { ...q, rot: q.rot.slice() };
    let [grip0, blade0, fingR, fingL]: Vec3[] = [eye, Y, Y, Y];
    if (sw) {
      // In the guard 6 cm toward the middle of the body, back in a cut: the left arm crosses less
      // before the chest (the user, 2026-11-09).
      const [at, g] = [
        add(
          add(
            eye,
            keep(
              add(
                sw.at,
                mix(
                  [0, 0, 0],
                  [-0.05, 0.035, 0],
                  prog < 0 ? 1 : (1 - Math.sin(Math.PI * clamp(prog))) ** 2,
                ),
              ),
            ),
          ),
          clear,
        ),
        keep(sw.g),
      ];
      shrug(kq, s, J.ARM_R, at);
      shrug(kq, s, J.ARM_L, along(at, g, -BACK));
      [grip0, blade0, fingR, fingL] = clasp(solve(kq), at, g, [
        keep([0.5, -1, -0.35]),
        keep([-0.5, -1, -0.35]),
      ]);
    }
    /** The left hand's slap of the gun's battery: its weight and how far off the battery it is. */
    let [slapW, slapTap] = [0, 0];
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
      // Firing the rail gun on a wall takes both hands off it.
      const toWall = w.wall * clamp(side * sd) * (me?.railed ? 1 - w.gun : 1);
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
      // The rail gun takes the left hand too, on its front grip, the elbow down and out.
      const two = sd < 0 && (me?.railed || me?.rifled) ? w.gun * free : 0;
      if (two > 0.002) {
        const held = { ...q, rot: q.rot.slice() };
        if (fu) {
          shrug(held, s, arm, add(eye, turn(fc)));
        }
        wield(
          held,
          s,
          arm,
          add(eye, turn(fc)),
          unit(turn(fd)),
          turn([-0.5, -1, -0.35]),
          fu && turn(fu),
        );
        for (const k of [arm - 1, arm, arm + 1, arm + 2]) {
          q.rot[k] = slerp(q.rot[k], held.rot[k], two);
        }
        curls[0] += (0.9 - curls[0]) * two;
      }
      // In a swap the left hand brings the new battery up under the grip, or takes the capsule
      // off the top and screws the new one on.
      const sp = me ? swapOf(me) : -1;
      const rail = !!me?.railed;
      const onLoad =
        sd < 0 && sp >= 0
          ? w.gun *
            free *
            (rail
              ? ease(span(sp, 0.34, 0.46)) * (1 - ease(span(sp, 0.88, 0.96)))
              : ease(span(sp, BROUGHT - 0.03, BROUGHT)) * (1 - ease(span(sp, TAP + 0.03, 0.9))))
          : 0;
      // The gun's or the rifle's new battery from the pouch on the left hip (the user, 2026-11-09):
      // the hand off the gun down to it, into it and the battery out, then up with it under the
      // grip, where the gun takes it (above BROUGHT). The battery is drawn in the hand (carried).
      const fetch =
        sd < 0 && sp >= 0 && !rail
          ? w.gun * free * ease(span(sp, 0.12, 0.2)) * (1 - ease(span(sp, BROUGHT - 0.03, BROUGHT)))
          : 0;
      if (sd < 0) {
        carried = undefined;
      }
      if (fetch > 0.002 && me) {
        const [foot, ax] = loadFrame(gp, ga, kindOf(me), BROUGHT);
        const f = fetched(
          sp,
          pouchAt(s.pos[J.PELVIS], s.rot[J.PELVIS]),
          [add(eye, turn(foot)), ax.map(turn)],
          add(eye, turn(along(gp, ga[1], -0.12))),
        );
        carried = f.carry;
        const held = { ...q, rot: q.rot.slice() };
        wield(held, s, arm, f.at, f.g, turn([-0.5, -1, -0.35]));
        for (const k of [arm - 1, arm, arm + 1, arm + 2]) {
          q.rot[k] = slerp(q.rot[k], held.rot[k], fetch);
        }
        curls[0] += (f.curl - curls[0]) * fetch;
      }
      if (onLoad > 0.002) {
        // On the new battery or capsule, which comes with the hand. The capsule is held round its
        // side, the wrist turning about it as it screws it in.
        const [foot, [, , up]] = loadFrame(
          gp,
          ga,
          me ? kindOf(me) : 0,
          Math.max(sp, rail ? 0.42 : 0.4),
        );
        // The battery in but for its last 12 mm, held there a moment; then the palm drops 12 cm off
        // it and slaps it home at TAP, faster and faster (the user, 2026-11-09).
        const tap =
          0.12 *
          (sp < TAP - 0.04 ? ease(span(sp, 0.64, TAP - 0.04)) : 1 - span(sp, TAP - 0.04, TAP) ** 3);
        const mid = [0, 1, 2].map(i => foot[i] + up[i] * (rail ? 0.04 : -0.01 - tap)) as Vec3;
        let fing: Vec3 | undefined;
        if (rail) {
          // From the capsule's axis out to its left, turned with the wrist.
          const o = rotate(mix([0, 0, 0], ga[0], -1), mix([0, 0, 0], up, screwed(sp)[1]));
          [0, 1, 2].forEach(i => (mid[i] += o[i] * 0.026));
          fing = turn(mix([0, 0, 0], o, -1));
        }
        const held = { ...q, rot: q.rot.slice() };
        if (fing) {
          shrug(held, s, arm, add(eye, turn(mid)));
        }
        wield(held, s, arm, add(eye, turn(mid)), unit(turn(up)), turn([-0.5, -1, -0.35]), fing);
        // The battery in, the hand lets go of it and opens flat, the palm up to its foot, the
        // fingers along the gun, to slap it home with the palm (the user, 2026-11-09).
        // The battery in, the hand lets go of it and opens flat to slap it home (below).
        const flat = rail ? 0 : ease(span(sp, 0.6, 0.64));
        [slapW, slapTap] = [onLoad * flat, tap];
        for (const k of [arm - 1, arm, arm + 1, arm + 2]) {
          q.rot[k] = slerp(q.rot[k], held.rot[k], onLoad);
        }
        curls[0] += (0.9 - 0.85 * flat - curls[0]) * onLoad;
      }
      // Each weapon comes on its own way (the user, 2026-11-09): the left index presses the laser
      // rifle's button, the hand off its front grip, flat, the index out, and back; the right thumb
      // presses the plasma gun's and the katana's (draw()); the left hand turns the rail gun's
      // capsule (below).
      const pw = sd < 0 && me && sp < 0 && pk == 3 ? poke(since, pressOf(pk)) * w.gun * free : 0;
      // The rail gun's capsule: the left hand off the front grip onto its side, turning it a
      // quarter of a turn with the wrist, as it screws a new one in, and back.
      const tw = sd < 0 && me && sp < 0 && pk == 2 ? poke(since, pressOf(2)) * w.gun * free : 0;
      if (tw > 0.002) {
        const th = tune(since, pressOf(2));
        const [foot, [, , up]] = loadFrame(gp, ga, 2, -1, 1, 0, th);
        const mid = [0, 1, 2].map(i => foot[i] + up[i] * 0.04) as Vec3;
        const o = rotate(mix([0, 0, 0], ga[0], -1), mix([0, 0, 0], up, th));
        [0, 1, 2].forEach(i => (mid[i] += o[i] * 0.026));
        const held = { ...q, rot: q.rot.slice() };
        shrug(held, s, arm, add(eye, turn(mid)));
        wield(
          held,
          s,
          arm,
          add(eye, turn(mid)),
          unit(turn(up)),
          turn([-0.5, -1, -0.35]),
          turn(mix([0, 0, 0], o, -1)),
        );
        for (const k of [arm - 1, arm, arm + 1, arm + 2]) {
          q.rot[k] = slerp(q.rot[k], held.rot[k], tw);
        }
        curls[0] += (0.9 - curls[0]) * tw;
      }
      if (sd < 0) {
        pointing = pw;
      }
      if (pw > 0.002) {
        // The gun's model frame in the world, from the holster.
        const [bat, bax]: [Vec3, Vec3[]] = [add(eye, turn(gp)), ga.map(turn)];
        const [b, n] = buttonAt(pk, bat, bax);
        // The index level with the gun, into the button, the thumb back toward the player: the hand
        // flat, its back up (the user, 2026-11-09).
        const into = unit(across(mix([0, 0, 0], n, -1), bax[1]));
        const g = unit(across(mix([0, 0, 0], bax[2], -1), into));
        const sid = unit(along(into, g, -S));
        const fing = along(mix([0, 0, 0], g, S), sid, C);
        const th = along(mix([0, 0, 0], g, C), sid, -S);
        const held = { ...q, rot: q.rot.slice() };
        wield(
          held,
          s,
          arm,
          along(along(b, fing, -0.1), th, -0.034),
          g,
          turn([-0.5, -1, -0.35]),
          into,
        );
        for (const k of [arm - 1, arm, arm + 1, arm + 2]) {
          q.rot[k] = slerp(q.rot[k], held.rot[k], pw);
        }
      }
    }
    // The slap, once the right hand has the gun (the user, 2026-11-09: the hand flat, the palm
    // striking the battery): on the battery as drawn, the palm's middle 5 cm along the fingers from
    // the wrist and its skin on the foot at TAP; the left hand's x, its palm side, up the battery.
    if (slapW > 0.002 && me) {
      const r = solve(q);
      const ax = gunAxes(r.rot[J.HAND_R]);
      const [foot, [, , up]] = loadFrame(
        gunGrip(r.pos[J.HAND_R], r.rot[J.HAND_R]),
        ax,
        kindOf(me),
        Math.max(swapOf(me), 0.4),
      );
      // The hand straight on the forearm (the user, 2026-11-09): the fingers carry on its line, the
      // palm turned up the battery as far as that allows; the wrist set again from the forearm.
      const slap = { ...q, rot: q.rot.slice() };
      let d = unit(across(ax[0], up));
      let x = up;
      for (let k = 0; k < 3; k++) {
        const palm = along(along(foot, up, -slapTap), d, -0.05);
        reach(slap, r, J.ARM_L, along(palm, x, -0.012), turn([-0.5, -1, -0.35]));
        const t = solve(slap);
        d = unit(sub(t.pos[J.HAND_L], t.pos[J.FOREARM_L]));
        x = unit(across(up, d));
      }
      // The wrist bent a little, half the way to the fingers square to the battery, so that the
      // palm meets it flat and the hand still reads along the arm (the user, 2026-11-09).
      const f = unit(mix(d, unit(across(d, up)), 0.5));
      const xf = unit(across(up, f));
      reach(
        slap,
        r,
        J.ARM_L,
        along(along(along(foot, up, -slapTap), f, -0.05), xf, -0.012),
        turn([-0.5, -1, -0.35]),
      );
      slap.rot[J.HAND_L] = mul(inv(solve(slap).rot[J.FOREARM_L]), frame(xf, f));
      for (const k of [J.ARM_L - 1, J.ARM_L, J.FOREARM_L, J.HAND_L]) {
        q.rot[k] = slerp(q.rot[k], slap.rot[k], slapW);
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
        pouch(out, s.pos[J.PELVIS], s.rot[J.PELVIS]);
        // The right thumb presses the button of the katana or the plasma gun as it comes on.
        const tk = me?.wield ? 1 : me ? kindOf(me) : -1;
        const push =
          me && swapOf(me) < 0 && ((tk == 1 && grasp > 0.2) || (tk == 0 && hold > 0.2))
            ? poke(since, pressOf(tk))
            : 0;
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
            i ? 0 : pointing,
            i * push,
            thumbTo(Math.max(tk, 0)),
            colors[3],
          );
        });
        if (hold > 0.2) {
          // The gauge lights once a press is more than a tap: the strength the shot would have.
          const level =
            me && (me.charge ?? 0) >= CHARGE_TAP ? Math.min(powerOf(me.charge!), me.mag ?? 0) : 0;
          const kind = me ? kindOf(me) : 0;
          const rail = kind == 2;
          const sp = me ? swapOf(me) : -1;
          const on = since - Math.max(pressOf(kind), 0);
          held(
            out,
            s.pos[J.HAND_R],
            s.rot[J.HAND_R],
            1,
            clamp(hold * 1.5 - 0.5),
            kind == 3 ? me!.clip : rail ? charge(me!.cap ?? 0) : me?.mag,
            level,
            kind,
            clock,
            {
              // Dark from when the old one comes out until the new one is in, the gun's counter
              // dark with it; then the thumb presses the button on its side and the gun boots: the
              // light comes on, and the counter fades in with the boot's whine.
              light:
                sp < 0 ? power(on, kind ? undefined : GUN_ON.lit) : 1 - ease(span(sp, 0.1, 0.2)),
              swap: sp,
              empty: !(kind == 3 ? me?.clip : rail ? me?.cap : me?.mag),
              screen: sp < 0 ? span(on, GUN_ON.from, GUN_ON.up) : 1 - ease(span(sp, 0.1, 0.2)),
              digits: sp < 0 && on >= GUN_ON.digits,
              press: sp < 0 && kind != 2 ? span(poke(since, pressOf(kind)), 0.8, 1) : 0,
              tune: rail && sp < 0 ? tune(since, pressOf(2)) : 0,
              id: me?.id,
              floor: me?.ground ? me.y : undefined,
              vel: me && [me.vx, me.vy, me.vz],
              carry: carried,
              cells: me && cellsOf(me),
              heat: (me?.heat ?? 0) / HEAT_MAX,
              hot: me?.hot,
            },
          );
        }
        if (grasp > 0.2) {
          sword(
            out,
            s.pos[J.HAND_R],
            s.rot[J.HAND_R],
            1,
            clock,
            clamp(grasp * 1.5 - 0.5),
            // The thumb presses the button on the hilt and the blade lights up, all of it: it is no
            // light saber (the user, 2026-11-09).
            power(since - Math.max(pressOf(1), 0), 0.3),
            span(poke(since, pressOf(1)), 0.8, 1),
          );
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
    muzzle: () => tip(...holster(), me ? kindOf(me) : 0),
    spun: () => (me && prog >= 0 ? SWAY * bent(me, prog)[0] * w.blade : 0),
    get steps() {
      return gait.steps;
    },
    get phase() {
      return gait.phase;
    },
  };
};
