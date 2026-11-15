// The xenomorph's own pieces (ROLE.XENO, the user 2026-11-15), round the skin of skin.ts's beast():
// its spine down the back and on into the tail, and the glowing slits of its eyes (its claws are
// hand()'s, body.ts). All
// of it generated, original: a lean biomechanical stalker, not a copy of any film's creature.
import { TAU } from '../shared/physics';
import { cross, face, sheet } from './helmet';
import type { Spot } from './helmet';
import { unit } from './mesh';
import type { Vec3 } from './mesh';
import { JOINT as J, turn } from './rig';
import type { Quat } from './rig';
import type { Out } from './verts';

/** Its chitin: a near black with a cold sheen. */
export const CHITIN_X = [0.045, 0.05, 0.06];

/** Metres: the tail's length, its root's radius and its tip's, the stinger's length. */
export const TAIL = { len: 1.45, root: 0.046, tip: 0.012, sting: 0.17 };

/** Sides round a piece at each level of detail (far, near, the own body, close), by how fine it is. */
const SIDES = [
  [3, 4, 5, 6],
  [3, 5, 7, 9],
  [4, 6, 9, 12],
];

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
    back(J.PELVIS, [0, -0.03, 0.09], 0.038),
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
  const sides = SIDES[2][lod];
  // Each bead pinched at its joints; close, rounder.
  const shape = lod > 2 ? [0.7, 0.86, 0.98, 1, 0.98, 0.86] : lod ? [0.7, 0.94, 1, 0.94] : [0.8, 1];
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
      const h = b[2] * (v < 8 ? 3.4 : 2.1);
      const root = [0, 1, 2].map(i => b[0][i] + b[1][i] * b[2] * 0.6) as Vec3;
      const top = [0, 1, 2].map(i => root[i] + d[i] * h) as Vec3;
      sheet([ring(root, d, side, b[2] * 0.35, SIDES[0][lod]), [[top, d]]], CHITIN_X, -1, out);
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

/** Where the metatarsal (the foot) ends, from the ankle, in the foot joint's frame: longer than the rig's foot. */
export const FOOT_TIP: Vec3 = [0, -0.035, -0.25];

/** The three front toes: how far out to the side each goes (in widths of TOE_W) and its length. */
const TOES = [
  [-1, 0.11],
  [0, 0.13],
  [1, 0.11],
];
const TOE_W = 0.034;

/**
 * Its foot on a foot joint (the user, 2026-11-15: an arched sole, tendons and toes): a round ankle
 * over the joint, which the shin's end sinks into, then the bone bowing up along its top into an
 * arch, a pad under the heel and one under the ball at its end (FOOT_TIP); three tendons stand out
 * over the instep from the ankle to the toes, where toes() carries them on to the claws. The pose
 * stands it near upright (prowl() in soldier.ts): a third segment to the leg.
 */
export const metatarsal = (out: Out, at: Vec3, q: Quat, lod: number) => {
  const n = SIDES[2][lod];
  const [x, y, z] = FOOT_TIP;
  /** A point along the foot, k from the ankle (0) to the ball (1), lifted by the arch. */
  const along = (k: number, up = 0, side = 0): Vec3 => [
    x * k + side,
    y * k + 0.022 * Math.sin(Math.PI * k) + up,
    z * k,
  ];
  strand(
    out,
    at,
    q,
    [[0, 0.03, 0.03], [0, 0.005, 0.012], along(0.2), along(0.5), along(0.8), along(1)],
    [0.02, 0.043, 0.034, 0.028, 0.027, 0.029],
    n,
    CHITIN_X,
  );
  // The pads: the heel's behind and under the ankle, the ball's under the foot's end.
  strand(
    out,
    at,
    q,
    [
      [0, -0.012, 0.03],
      [0, -0.03, 0.005],
    ],
    [0.024, 0.016],
    n,
    CHITIN_X,
  );
  strand(out, at, q, [along(0.82, -0.016), along(1.02, -0.02)], [0.02, 0.024], n, CHITIN_X);
  if (!lod) {
    return;
  }
  for (const [t] of TOES) {
    const w = t * 0.011;
    strand(
      out,
      at,
      q,
      [
        [w * 0.3, 0.032, -0.01],
        along(0.35, 0.03, w * 0.8),
        along(0.7, 0.031, w * 1.6),
        along(1, 0.03, t * TOE_W * 0.4),
      ],
      [0.006, 0.0075, 0.0075, 0.0065],
      SIDES[0][lod],
      SINEW,
    );
  }
};

/**
 * Its toes at the end of the foot (FOOT_TIP), level: three long digits splayed forward and a fourth,
 * short, behind. Each is two phalanges with a knuckle standing up between them, its tendon along
 * its top, and at its end a big hooked claw of bone curving down past the toe.
 */
export const toes = (out: Out, at: Vec3, q: Quat, lod: number) => {
  const n = SIDES[1][lod];
  for (const [t, l] of [...TOES, [0, -0.05]]) {
    const s = t * TOE_W;
    const d = Math.sign(l);
    const p: Vec3[] = [
      [s * 0.4, 0.006, 0],
      [s * 0.75, 0.016, -l * 0.45],
      [s, 0.012, -l * 0.62],
      [s * 1.15, 0, -l],
    ];
    strand(out, at, q, p, [0.021, 0.017, 0.016, 0.012], n, CHITIN_X);
    // The knuckle, and the toe's pad under its end.
    strand(
      out,
      at,
      q,
      [
        [s * 0.72, 0.02, -l * 0.43],
        [s * 0.78, 0.02, -l * 0.5],
      ],
      [0.016, 0.014],
      n,
      CHITIN_X,
    );
    strand(
      out,
      at,
      q,
      [
        [s * 1.1, -0.008, -l * 0.85],
        [s * 1.15, -0.01, -l * 0.97],
      ],
      [0.012, 0.01],
      n,
      CHITIN_X,
    );
    if (lod && d > 0) {
      strand(
        out,
        at,
        q,
        [
          [s * 0.45, 0.026, -l * 0.05],
          [s * 0.76, 0.034, -l * 0.47],
          [s * 1.12, 0.014, -l * 0.95],
        ],
        [0.0065, 0.006, 0.005],
        SIDES[0][lod],
        SINEW,
      );
    }
    const [tx, ty, tz] = p[3];
    strand(
      out,
      at,
      q,
      [
        [tx, ty + 0.008, tz + 0.008 * d],
        [tx * 1.05, ty + 0.008, tz - 0.05 * d],
        [tx * 1.1, ty - 0.024, tz - 0.082 * d],
      ],
      [0.014, 0.009, 0],
      n,
      BONE,
    );
  }
};

/** Its tendons on a shin joint: the heel's cord down the back of the shin, and one down each side of its front. */
export const sinews = (out: Out, at: Vec3, q: Quat, lod: number) => {
  const n = SIDES[0][lod];
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

/**
 * Its rib cage on the chest joint, standing out of a starved trunk in a lighter chitin: five pairs of ribs from the
 * spine round to the breastbone, each sloping down toward the front, the lower ones shorter, and
 * the keel of the breastbone down the middle. Each row: the height at the spine, the half width and
 * the half depth of the arch (a hair outside the skin's).
 */
export const ribs = (out: Out, at: Vec3, q: Quat, lod: number, low = false) => {
  const n = SIDES[1][lod];
  // On the spine joint, the lower ribs down to the hips (the user, 2026-11-15), shorter, not
  // reaching round to the front: the floating ribs over the waist.
  const rows = low
    ? [
        [0.06, 0.122, 0.108],
        [0.01, 0.124, 0.106],
        [-0.04, 0.128, 0.104],
        [-0.09, 0.134, 0.102],
      ]
    : [
        [0.09, 0.158, 0.141],
        [0.04, 0.156, 0.137],
        [-0.01, 0.153, 0.133],
        [-0.06, 0.146, 0.127],
        [-0.11, 0.136, 0.118],
      ];
  rows.forEach(([y, w, d], i) => {
    for (const s of [-1, 1]) {
      const pts: Vec3[] = [];
      // From the spine's vertebra at the middle of the back (the user, 2026-11-15) round the side
      // to the front.
      const end = low ? 0.75 + 0.12 * i : i > 2 ? 0.55 : 0.4;
      for (let k = 0; k <= 8; k++) {
        const a = Math.PI - ((Math.PI - end) * k) / 8;
        pts.push([s * w * Math.sin(a), y - 0.06 * (k / 8), -0.013 - d * Math.cos(a)]);
      }
      strand(
        out,
        at,
        q,
        pts,
        [0.014, 0.012, 0.012, 0.013, 0.013, 0.013, 0.012, 0.011, 0.007],
        n,
        SINEW,
      );
    }
  });
  if (!low) {
    strand(
      out,
      at,
      q,
      [
        [0, 0.12, -0.15],
        [0, 0.03, -0.158],
        [0, -0.08, -0.15],
      ],
      [0.012, 0.016, 0.01],
      n,
      SINEW,
    );
  }
};

/** A spur of bone on a joint: from `base` along `dir` (in its frame), `len` long, `r` thick at its root. */
const spur = (
  out: Out,
  at: Vec3,
  q: Quat,
  base: Vec3,
  dir: Vec3,
  len: number,
  r: number,
  n: number,
) => {
  const d = unit(dir);
  const pt = (k: number, bend: number): Vec3 => [
    base[0] + d[0] * len * k,
    base[1] + d[1] * len * k - bend,
    base[2] + d[2] * len * k,
  ];
  strand(out, at, q, [base, pt(0.5, 0.004), pt(1, 0.016)], [r, r * 0.6, 0], n, BONE);
};

/** Its spurs: one out of the back of each elbow (a forearm joint), one out of the back of each ankle (a shin joint). */
export const elbow = (out: Out, at: Vec3, q: Quat, lod: number) =>
  spur(out, at, q, [0, -0.02, 0.03], [0, 0.45, 1], 0.12, 0.016, SIDES[1][lod]);
export const heel = (out: Out, at: Vec3, q: Quat, lod: number) =>
  spur(out, at, q, [0, -0.4, 0.035], [0, 0.35, 1], 0.09, 0.014, SIDES[1][lod]);

/** A value on a curve through [y, value] points, by y, highest first. */
const curve = (pts: number[][], y: number) => {
  const k = Math.min(
    Math.max(
      pts.findIndex(p => p[0] < y),
      1,
    ),
    pts.length - 1,
  );
  const [[y0, a], [y1, b]] = [pts[k - 1], pts[k]];
  const t = Math.min(Math.max((y - y0) / (y1 - y0), 0), 1);
  return a + (b - a) * t * t * (3 - 2 * t);
};

// Its face, a human skull's (the user, 2026-11-15), on the head joint, in front of the dome and in
// the dome's colour: how far forward and how wide it is at each height, from a round forehead down
// to the chin.
const DEPTH = [
  [0.115, 0.098],
  [0.09, 0.113],
  [0.06, 0.12],
  [0.035, 0.121],
  [0.012, 0.115],
  [-0.02, 0.12],
  [-0.05, 0.118],
  [-0.07, 0.112],
  [-0.09, 0.088],
];
/** Its head's chitin: the dome's (the skin's TRIM, soldier.ts) and its face's, one colour. */
export const HEAD = CHITIN_X.map(v => v * 1.6);
const [DARK, TEETH] = [
  [0.02, 0.02, 0.025],
  [0.42, 0.42, 0.4],
];
/**
 * The middle of an orbit and how its long axis rises toward the temple (the user, 2026-11-15: less
 * round, squinting, meaner): a narrow slanted slit, its inner corner low.
 */
const [EYE, SLANT] = [[0.032, 0.012], 0.35];
/** How deep in an orbit (0 to 1) the point of the face (x, y) is. */
const orbit = (x: number, y: number) => {
  const dx = Math.abs(x) - EYE[0];
  return Math.max(0, 1 - (dx / 0.024) ** 2 - ((y - EYE[1] - SLANT * dx) / 0.0085) ** 2);
};
/** The frown over each orbit: a ridge along its upper edge, pressing down on it. */
const frown = (x: number, y: number) => {
  const dx = Math.abs(x) - EYE[0];
  return Math.exp(-(((y - EYE[1] - SLANT * dx - 0.013) / 0.006) ** 2) - (dx / 0.03) ** 2);
};
/**
 * The head's front (the user, 2026-11-15: one smooth block with the back): an ellipsoid round the
 * middle of the head, its centre's height and its half width, height and depth. Its rim is the
 * dome's front ring (CREST in skin.ts), so the face, as wide as it at every height, meets the dome
 * with no seam; over the orbits the face is the ellipsoid itself, a smooth forehead.
 */
const [EY, EA, EB, EC] = [0.04, 0.072, 0.135, 0.125];
/** How much of the forehead's sphere the face is at height y: none under the orbits, all over them. */
const brow = (y: number) => {
  const t = Math.min(Math.max((y - 0.005) / 0.025, 0), 1);
  return t * t * (3 - 2 * t);
};
/** The top of the face, and its half width at height y. */
const TOP = EY + EB;
/** The bottom of the chin (the user, 2026-11-15: a short one). */
const CHIN = EY - EB;
const widthOf = (y: number) => EA * Math.sqrt(Math.max(0, 1 - ((y - EY) / EB) ** 2));
/** The face's surface at (x, y): an ellipse's front under a forehead's sphere, the orbits sunk, the cheekbones out. */
const faceZ = (x: number, y: number) => {
  const u = Math.min(Math.abs(x) / Math.max(widthOf(y), 1e-6), 1);
  const low = -curve(DEPTH, y) * Math.sqrt(1 - u * u);
  const dome = -EC * Math.sqrt(Math.max(0, 1 - (x / EA) ** 2 - ((y - EY) / EB) ** 2));
  return (
    low +
    (dome - low) * brow(y) +
    0.028 * orbit(x, y) ** 0.6 -
    0.007 * frown(x, y) -
    0.008 * Math.exp(-(((Math.abs(x) - 0.056) / 0.013) ** 2) - ((y + 0.008) / 0.012) ** 2)
  );
};
/**
 * The mouth (the user, 2026-11-15: menacing lips over grey teeth, small and high): its half width,
 * the height of its middle and where the fangs are, and how far its lips part at x: the upper one
 * curled up over the fangs, a snarl.
 */
const [MW, MY, FANG] = [0.032, -0.038, 0.018];
const above = (x: number) =>
  (0.0055 + 0.008 * Math.exp(-(((Math.abs(x) - FANG) / 0.008) ** 2))) * (1 - (x / MW) ** 2) ** 0.5;
const below = (x: number) => 0.008 * (1 - (x / MW) ** 2) ** 0.6;
const parted = (x: number, y: number) => Math.abs(x) < MW && y < MY + above(x) && y > MY - below(x);
/** The lips' line round the mouth, from the left corner over the upper lip and back under the lower one. */
const lipline = (n: number): [number, number][] => {
  const top = Array.from({ length: n + 1 }, (_, i): [number, number] => {
    const x = -MW + (2 * MW * i) / n;
    return [x, MY + above(x)];
  });
  const low = Array.from({ length: n - 1 }, (_, i): [number, number] => {
    const x = MW - (2 * MW * (i + 1)) / n;
    return [x, MY - below(x)];
  });
  return [...top, ...low];
};

/**
 * The face of its skull, a human skull's in its chitin: a forehead a smooth sphere, the
 * orbits sunk, the cheekbones, no nose; the mouth an opening whose edge the lips hide, dark inside,
 * with grey teeth, the fangs longest. A grid over the face, finer the closer.
 */
export const skull = (out: Out, at: Vec3, q: Quat, lod: number) => {
  const [nx, ny] = [
    [8, 10],
    [18, 30],
    [18, 30],
    [44, 72],
  ][lod];
  const spot = (u: number, v: number): Spot => {
    const y = TOP - (TOP - CHIN) * v;
    const x = u * widthOf(y);
    // The slope from central differences a hair inside the rim (outside it the surface is flat),
    // turned at the rim to the dome's own normal there, straight out of the ellipse: no seam in the
    // light where the face meets the back of the head.
    const h = 1e-3;
    const [xi, yi] = [x * 0.97, EY + (y - EY) * 0.97];
    const dz = [
      (faceZ(xi + h, yi) - faceZ(xi - h, yi)) / (2 * h),
      (faceZ(xi, yi + h) - faceZ(xi, yi - h)) / (2 * h),
    ];
    const m: Vec3 = unit([dz[0], dz[1], -1]);
    const rim = unit([x / (EA * EA), (y - EY) / (EB * EB), 0]);
    const e = Math.hypot(x / EA, (y - EY) / EB);
    const w = Math.min(Math.max((e - 0.62) / 0.38, 0), 1) ** 2;
    const n = unit([0, 1, 2].map(i => m[i] * (1 - w) + rim[i] * w) as Vec3);
    return [on(at, q, [x, y, faceZ(x, y)]), turn(q, n)];
  };
  // The grid, but where the lips part: the hole's edge, in steps, lies under the lips.
  const tri = (p: [number, number][]) => {
    const [u, v] = [0, 1].map(k => (p[0][k] + p[1][k] + p[2][k]) / 3);
    const y = TOP - (TOP - CHIN) * v;
    if (!parted(u * widthOf(y), y)) {
      face(
        out,
        HEAD,
        -1,
        p.map(([a, b]) => spot(a, b)),
      );
    }
  };
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const [u0, u1, v0, v1] = [(2 * i) / nx - 1, (2 * (i + 1)) / nx - 1, j / ny, (j + 1) / ny];
      tri([
        [u0, v0],
        [u1, v0],
        [u1, v1],
      ]);
      tri([
        [u0, v0],
        [u1, v1],
        [u0, v1],
      ]);
    }
  }
  if (!lod) {
    return;
  }
  const n = lod > 2 ? 24 : 12;
  const sides = SIDES[1][lod];
  const line = lipline(n);
  const fwd = turn(q, [0, 0, -1]);
  // Inside the mouth, dark, a hair behind the lips.
  sheet(
    [
      [[on(at, q, [0, MY, faceZ(0, MY) + 0.018]), fwd]],
      line.map(([x, y]): Spot => [on(at, q, [x, y, faceZ(x, y) + 0.004]), fwd]),
    ],
    DARK,
    -1,
    out,
  );
  // The teeth, grey, from under each lip toward the other; the fangs, a lip's curl apart, longest.
  for (const [k, up] of [
    [9, true],
    [8, false],
  ] as const) {
    for (let i = 0; i < k; i++) {
      const x = -MW * 0.8 + (1.6 * MW * i) / (k - 1);
      const fang = Math.exp(-(((Math.abs(x) - FANG) / 0.005) ** 2));
      const [edge, tip] = up
        ? [MY + above(x), MY - 0.0015 - 0.006 * fang]
        : [MY - below(x), MY + 0.0015 + 0.0045 * fang];
      const z = faceZ(x, MY) + 0.003;
      strand(
        out,
        at,
        q,
        [
          [x, edge + (up ? 0.003 : -0.003), z],
          [x, tip, z - 0.002],
        ],
        [0.0034 + 0.0012 * fang, 0.0007],
        sides,
        TEETH,
      );
    }
  }
  // The lips round it, thick in their middle, curled.
  const pts = [...line, line[0]].map(([x, y]): Vec3 => [x, y, faceZ(x, y) - 0.002]);
  strand(
    out,
    at,
    q,
    pts,
    pts.map(([x]) => 0.0032 + 0.0028 * (1 - (x / MW) ** 2)),
    sides,
    HEAD,
  );
};

/** Its eyes, glowing slits at the back of the orbits in the team's `color`. */
export const eyes = (out: Out, at: Vec3, q: Quat, color: number[]) => {
  for (const s of [-1, 1]) {
    // A glowing slit along the orbit's slant.
    const pts = [-0.014, 0, 0.014].map((d): Vec3 => {
      const [x, y] = [s * (EYE[0] + d), EYE[1] + SLANT * d];
      return [x, y, faceZ(x, y) - 0.003];
    });
    strand(out, at, q, pts, [0.002, 0.0045, 0.002], 6, color, -2);
  }
};
