// The xenomorph's own pieces (ROLE.XENO, the user 2026-11-15), round the skin of skin.ts's beast():
// its spine down the back and on into the tail, and the glowing slits of its eyes (its claws are
// hand()'s, body.ts). All
// of it generated, original: a lean biomechanical stalker, not a copy of any film's creature.
import { TAU } from '../shared/physics';
import { cross, sheet } from './helmet';
import type { Spot } from './helmet';
import { unit } from './mesh';
import type { Vec3 } from './mesh';
import { JOINT as J, turn } from './rig';
import type { Quat } from './rig';
import type { Out } from './verts';

/** Its chitin: a near black with a cold sheen. */
export const CHITIN_X = [0.045, 0.05, 0.06];

/** Metres: the tail's length, its root's radius and its tip's, the stinger's length. */
export const TAIL = { len: 1.45, root: 0.06, tip: 0.012, sting: 0.17 };

/** A point of a piece in the frame (at, q) of its joint. */
const on = (at: Vec3, q: Quat, v: Vec3): Vec3 => {
  const w = turn(q, v);
  return [at[0] + w[0], at[1] + w[1], at[2] + w[2]];
};

/** A ring of `n` spots round `c` square to the unit `tan`, `side` steadying it, of radius `r`. */
const ring = (c: Vec3, tan: Vec3, side: Vec3, r: number, n: number): Spot[] => {
  const a = unit(cross(tan, side));
  const b = cross(a, tan);
  return Array.from({ length: n }, (_, i) => {
    const [cs, sn] = [Math.cos((i / n) * TAU), Math.sin((i / n) * TAU)];
    const m: Vec3 = [a[0] * cs + b[0] * sn, a[1] * cs + b[1] * sn, a[2] * cs + b[2] * sn];
    return [[c[0] + m[0] * r, c[1] + m[1] * r, c[2] + m[2] * r], m];
  });
};

/** A solved skeleton (solve() in rig.ts): each joint's place and turn in the world. */
interface Solved {
  pos: Vec3[];
  rot: Quat[];
}

/** A point of the column: where, out of the back (a unit vector), and how thick. */
type Bone = [p: Vec3, up: Vec3, r: number];

const mix3 = (a: Vec3, b: Vec3, k: number): Vec3 => [
  a[0] + (b[0] - a[0]) * k,
  a[1] + (b[1] - a[1]) * k,
  a[2] + (b[2] - a[2]) * k,
];
const far = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * Its spine, in the world, from the base of the skull down the back and on into the tail (the user,
 * 2026-11-15: vertebrae linked to one another, from the tail up the back to the head): one chain of
 * vertebrae, each a bead pinched at its joints with a spine standing out of it, on the back half
 * sunk in the skin, the tail free. The tail bends from down and back up to its tip, sways with the
 * clock `t` and more with the speed `run` (0 to 1); `sting` (0 to 1) arches it up over the back and
 * forward past the head. The stinger glows in the team's `color`. `lod` 0 far, 1 near, 2 close.
 */
export const column = (
  out: Out,
  s: Solved,
  t: number,
  run: number,
  sting: number,
  color: number[],
  lod: number,
) => {
  const [P, q] = [s.pos[J.PELVIS], s.rot[J.PELVIS]];
  const back = (j: number, v: Vec3, r: number): Bone => [
    on(s.pos[j], s.rot[j], v),
    turn(s.rot[j], [0, 0, 1]),
    r,
  ];
  const bones: Bone[] = [
    back(J.HEAD, [0, 0.01, 0.12], 0.016),
    back(J.NECK, [0, 0.03, 0.055], 0.019),
    back(J.CHEST, [0, 0.12, 0.115], 0.024),
    back(J.CHEST, [0, -0.04, 0.12], 0.027),
    back(J.SPINE, [0, 0, 0.1], 0.029),
    back(J.PELVIS, [0, -0.03, 0.09], 0.032),
  ];
  // The tail in the pelvis' frame: its angle in the pelvis' plane (0 back, up from there) along it.
  const steps = 12;
  let p: Vec3 = [0, -0.06, 0.13];
  for (let k = 1; k <= steps; k++) {
    const u = k / steps;
    const lift = -0.55 + 1.15 * u + 0.25 * run;
    const a = lift + (u * Math.PI * 1.08 - lift) * sting;
    const sway = (1 - sting) * (0.35 + 0.4 * run) * u * Math.sin(t * (1.6 + 2.4 * run) - u * 3.5);
    const way: Vec3 = [Math.sin(sway), Math.sin(a), Math.cos(a) * Math.cos(sway)];
    p = [0, 1, 2].map(i => p[i] + (way[i] * TAIL.len) / steps) as Vec3;
    bones.push([
      on(P, q, p),
      turn(q, [0, Math.cos(a), -Math.sin(a)]),
      TAIL.tip + (TAIL.root - TAIL.tip) * (1 - u) ** 1.3,
    ]);
  }
  // A smooth curve through them (Catmull-Rom), then walked by its length: a vertebra every so often.
  const dense: Bone[] = [];
  bones.forEach((b, i) => {
    const [a, c, d] = [bones[i - 1] ?? b, bones[i + 1], bones[i + 2] ?? bones[i + 1]];
    if (!c) {
      dense.push(b);
      return;
    }
    for (let k = 0; k < 4; k++) {
      const u = k / 4;
      const [u2, u3] = [u * u, u * u * u];
      const w = [-u3 + 2 * u2 - u, 3 * u3 - 5 * u2 + 2, -3 * u3 + 4 * u2 + u, u3 - u2];
      const pt = [0, 1, 2].map(
        j => (a[0][j] * w[0] + b[0][j] * w[1] + c[0][j] * w[2] + d[0][j] * w[3]) / 2,
      );
      dense.push([pt as Vec3, unit(mix3(b[1], c[1], u)), b[2] + (c[2] - b[2]) * u]);
    }
  });
  const len = [0];
  for (let i = 1; i < dense.length; i++) {
    len.push(len[i - 1] + far(dense[i][0], dense[i - 1][0]));
  }
  const total = len[len.length - 1];
  /** The column `l` metres down it from the skull, and its way there. */
  const at = (l: number): [Bone, Vec3] => {
    const i = Math.min(
      Math.max(
        1,
        len.findIndex(v => v >= l),
      ),
      dense.length - 1,
    );
    const [a, b] = [dense[i - 1], dense[i]];
    const k = Math.min(Math.max((l - len[i - 1]) / Math.max(len[i] - len[i - 1], 1e-6), 0), 1);
    return [
      [mix3(a[0], b[0], k), unit(mix3(a[1], b[1], k)), a[2] + (b[2] - a[2]) * k],
      unit([0, 1, 2].map(j => b[0][j] - a[0][j]) as Vec3),
    ];
  };
  // The vertebrae, each bead's rings from joint to joint, and their spines but far and near the tip.
  const n = lod ? 34 : 14;
  const sides = [4, 6, 8][Math.min(lod, 2)];
  const shape = lod ? [0.55, 0.92, 1, 0.92] : [0.7, 1];
  const side = turn(q, [1, 0, 0]);
  const rows: Spot[][] = [];
  for (let v = 0; v < n; v++) {
    shape.forEach((k, j) => {
      const [b, tan] = at(((v + j / shape.length) / n) * total);
      rows.push(ring(b[0], tan, side, b[2] * k, sides));
    });
    if (lod && v < n - 6) {
      const [b, tan] = at(((v + 0.5) / n) * total);
      const d = unit(mix3(b[1], tan, 0.45));
      const h = b[2] * (v < 8 ? 2.6 : 1.6);
      const root = [0, 1, 2].map(i => b[0][i] + b[1][i] * b[2] * 0.6) as Vec3;
      const top = [0, 1, 2].map(i => root[i] + d[i] * h) as Vec3;
      sheet([ring(root, d, side, b[2] * 0.35, 4), [[top, d]]], CHITIN_X, -1, out);
    }
  }
  const [[end], w] = at(total);
  const [[head], down] = at(0);
  sheet([[[head, down.map(x => -x) as Vec3]], ...rows], CHITIN_X, -1, out);
  // The stinger: a blade swelling to a barb, then a point, glowing.
  const pt = (k: number): Vec3 => [end[0] + w[0] * k, end[1] + w[1] * k, end[2] + w[2] * k];
  sheet(
    [
      ring(end, w, side, TAIL.tip, sides),
      ring(pt(TAIL.sting * 0.35), w, side, 0.03, sides),
      [[pt(TAIL.sting), w]],
    ],
    color,
    -2,
    out,
  );
};

/** Bone: its claws. */
export const BONE = [0.62, 0.6, 0.52];
/** Its tendons: the chitin, a little lighter. */
const SINEW = CHITIN_X.map(v => v * 1.9);

/**
 * A tube through `pts` in the frame (at, q) of a joint, `radii` thick at them, closed at both ends,
 * its rings steadied by the joint's x axis.
 */
const strand = (
  out: Out,
  at: Vec3,
  q: Quat,
  pts: Vec3[],
  radii: number[],
  n: number,
  col: number[],
  layer = -1,
) => {
  const w = pts.map(p => on(at, q, p));
  const side = turn(q, [1, 0, 0]);
  const way = (i: number) =>
    unit(
      [0, 1, 2].map(j => w[Math.min(i + 1, w.length - 1)][j] - w[Math.max(i - 1, 0)][j]) as Vec3,
    );
  const [a, b] = [way(0), way(w.length - 1)];
  sheet(
    [
      [[w[0], a.map(v => -v) as Vec3]],
      ...w.map((p, i) => ring(p, way(i), side, radii[i], n)),
      [[w[w.length - 1], b]],
    ],
    col,
    layer,
    out,
  );
};

/**
 * Its toes on a toe joint (the ball of the foot): three long digits splayed forward, each bending
 * down at its knuckle into a hooked claw of bone.
 */
export const toes = (out: Out, at: Vec3, q: Quat, lod: number) => {
  const n = lod ? 5 : 3;
  for (const x of [-1, 0, 1]) {
    const [s, l] = [x * 0.022, x ? 0.075 : 0.09];
    const pts: Vec3[] = [
      [s * 0.6, 0.002, 0.02],
      [s, 0.004, -l * 0.55],
      [s * 1.15, -0.006, -l],
    ];
    strand(out, at, q, pts, [0.016, 0.012, 0.009], n, CHITIN_X);
    const [tx, ty, tz] = pts[2];
    strand(
      out,
      at,
      q,
      [
        [tx, ty + 0.004, tz],
        [tx * 1.05, ty - 0.004, tz - 0.024],
        [tx * 1.08, ty - 0.018, tz - 0.034],
      ],
      [0.008, 0.005, 0],
      n,
      BONE,
    );
  }
};

/** Its tendons on a shin joint: the heel's cord down the back of the shin, and one down each side of its front. */
export const sinews = (out: Out, at: Vec3, q: Quat, lod: number) => {
  const n = lod ? 4 : 3;
  strand(
    out,
    at,
    q,
    [
      [0, -0.1, 0.03],
      [0, -0.28, 0.032],
      [0, -0.43, 0.04],
    ],
    [0.012, 0.009, 0.011],
    n,
    SINEW,
  );
  for (const x of [-0.022, 0.022]) {
    strand(
      out,
      at,
      q,
      [
        [x, -0.14, -0.024],
        [x * 0.8, -0.3, -0.026],
        [x * 0.6, -0.42, -0.022],
      ],
      [0.007, 0.006, 0.007],
      n,
      SINEW,
    );
  }
};

/** Its tendons on a foot joint: two cords over the instep from the ankle to the toes. */
export const instep = (out: Out, at: Vec3, q: Quat, lod: number) => {
  const n = lod ? 4 : 3;
  for (const x of [-0.018, 0.018]) {
    strand(
      out,
      at,
      q,
      [
        [x * 0.5, 0.005, -0.03],
        [x, -0.012, -0.08],
        [x * 1.3, -0.03, -0.125],
      ],
      [0.006, 0.006, 0.005],
      n,
      SINEW,
    );
  }
};

/** The slits of its eyes on the head joint: a pair of thin glowing blades along the skull's sides, in the team's `color`. */
export const eyes = (out: Out, at: Vec3, q: Quat, color: number[]) => {
  for (const s of [-1, 1]) {
    strand(
      out,
      at,
      q,
      [
        [s * 0.062, 0.05, -0.12],
        [s * 0.088, 0.069, -0.015],
      ],
      [0.009, 0],
      4,
      color,
      -2,
    );
  }
};
