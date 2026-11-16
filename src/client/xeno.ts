// The xenomorph's own pieces (ROLE.XENO, the user 2026-11-15), round the skin of skin.ts's beast():
// its spine down the back and on into the tail, and the glowing slits of its eyes (its claws are
// hand()'s, body.ts). All
// of it generated, original: a lean biomechanical stalker, not a copy of any film's creature.
import { TAU } from '../shared/physics';
import { cross, face, sheet } from './helmet';
import type { Spot } from './helmet';
import { unit } from './mesh';
import type { Vec3 } from './mesh';
import { JOINT as J, rest, solve, turn } from './rig';
import type { Quat } from './rig';
import { REGION, bindOf, domeAt } from './skin';
import { room } from './verts';
import type { Floats, Out } from './verts';

/**
 * Its chitin: a near black with a cold sheen, one colour from the skull to the tail: a lighter head
 * drew a collar's line round the neck.
 */
export const CHITIN_X = [0.06, 0.065, 0.078];

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
 * A smooth curve through `pts` (Catmull-Rom), three more points between each two; `mid(i, u)` is
 * what else a point carries, `u` of the way from point i to the next.
 */
const smooth = <T>(pts: Vec3[], mid: (i: number, u: number) => T): [Vec3, T][] =>
  pts.flatMap((b, i) => {
    const [a, c, d] = [pts[i - 1] ?? b, pts[i + 1], pts[i + 2] ?? pts[i + 1]];
    return c
      ? [0, 0.25, 0.5, 0.75].map((u): [Vec3, T] => {
          const [u2, u3] = [u * u, u * u * u];
          const w = [-u3 + 2 * u2 - u, 3 * u3 - 5 * u2 + 2, -3 * u3 + 4 * u2 + u, u3 - u2];
          return [
            [0, 1, 2].map(j => (a[j] * w[0] + b[j] * w[1] + c[j] * w[2] + d[j] * w[3]) / 2) as Vec3,
            mid(i, u),
          ];
        })
      : [[b, mid(i, 0)]];
  });

/** The joints the back's points hang on, from the base of the skull to the coccyx (bonesOf()). */
const BACK = [J.HEAD, J.NECK, J.CHEST, J.CHEST, J.SPINE, J.PELVIS, J.PELVIS];

/**
 * Its spine's points in the world, from the solved skeleton `s` (the user, 2026-11-15: vertebrae
 * linked to one another, from the tail up the back to the head): the back's seven (BACK), from the
 * base of the skull down to the coccyx low over the rear, then the tail's twelve. The tail bends
 * from down and back up to its tip, sways with the clock `t` (none with `sway` 0) and more with the
 * speed `run` (0 to 1); `sting` (0 to 1) arches it up over the back and forward past the head.
 */
const bonesOf = (s: Solved, t: number, run: number, sting: number, sway = 1): Bone[] => {
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
    back(J.PELVIS, [0, -0.03, 0.11], 0.036),
    // Down to the coccyx, low over the rear (the user, 2026-11-15), where the tail leaves it.
    back(J.PELVIS, [0, -0.12, 0.13], 0.04),
  ];
  // The tail in the pelvis' frame: its angle in the pelvis' plane (0 back, up from there) along it.
  const steps = 12;
  let p: Vec3 = [0, -0.15, 0.16];
  for (let k = 1; k <= steps; k++) {
    const u = k / steps;
    const lift = -0.55 + 1.15 * u + 0.25 * run;
    const a = lift + (u * Math.PI * 1.08 - lift) * sting;
    const swing =
      sway * (1 - sting) * (0.35 + 0.4 * run) * u * Math.sin(t * (1.6 + 2.4 * run) - u * 3.5);
    const way: Vec3 = [Math.sin(swing), Math.sin(a), Math.cos(a) * Math.cos(swing)];
    p = [0, 1, 2].map(i => p[i] + (way[i] * TAIL.len) / steps) as Vec3;
    bones.push([
      on(P, q, p),
      turn(q, [0, Math.cos(a), -Math.sin(a)]),
      TAIL.tip + (TAIL.root - TAIL.tip) * (1 - u) ** 1.3,
    ]);
  }
  return bones;
};

/** A smooth curve through bones (smooth()), from its `skip`th point, and its length up to each. */
interface Curve {
  dense: Bone[];
  len: number[];
  total: number;
}
const curveOf = (bones: Bone[], skip = 0): Curve => {
  const dense = smooth(
    bones.map(b => b[0]),
    (i, u): [Vec3, number] => {
      const [b, c] = [bones[i], bones[i + 1] ?? bones[i]];
      return [unit(mix3(b[1], c[1], u)), b[2] + (c[2] - b[2]) * u];
    },
  )
    .slice(skip)
    .map(([p, [up, r]]): Bone => [p, up, r]);
  const len = [0];
  for (let i = 1; i < dense.length; i++) {
    len.push(len[i - 1] + far(dense[i][0], dense[i - 1][0]));
  }
  return { dense, len, total: len[len.length - 1] };
};

/** The curve `c` `l` metres along it, its way there, and where that is between its points (2.5: halfway from the third to the fourth). */
const along = ({ dense, len }: Curve, l: number): [Bone, Vec3, number] => {
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
    i - 1 + k,
  ];
};

/** Vertebrae down the whole column, far and nearer, and the rings of a bead pinched at its joints: close, rounder. */
const VERTEBRAE = [14, 34, 34, 34];
const BEAD = [
  [0.8, 1],
  [0.7, 0.94, 1, 0.94],
  [0.7, 0.94, 1, 0.94],
  [0.7, 0.86, 0.98, 1, 0.98, 0.86],
];

/**
 * Geometry baked into the beast's skin (shape() in skin.ts), posed with it by flesh() at no cost a
 * frame: places and normals at rest, six numbers a vertex, its two joints and its weight on the
 * second, three vertex indices a triangle and the palette region of each corner.
 */
export interface Baked {
  v: number[];
  j: number[];
  w: number[];
  t: number[];
  c: number[];
}

/** Rows of spots, each on two joints, sewn into triangles as sheet() sews them. */
class Bake implements Baked {
  v: number[] = [];
  j: number[] = [];
  w: number[] = [];
  t: number[] = [];
  c: number[] = [];

  /** The spots of a row, hanging on joints `a` and `b`, `u` of the way to `b`: their indices. */
  row(spots: Spot[], a: number, b: number, u: number) {
    return spots.map(([p, m]) => {
      this.v.push(p[0], p[1], p[2], m[0], m[1], m[2]);
      this.j.push(a, b);
      this.w.push(u);
      return this.w.length - 1;
    });
  }

  /** A triangle as face() makes it: none of no area, wound as its first corner's normal faces. */
  tri(p: number, q: number, r: number, region: number) {
    const V = this.v;
    const [a, b, d] = [p * 6, q * 6, r * 6];
    const c = cross(
      [V[b] - V[a], V[b + 1] - V[a + 1], V[b + 2] - V[a + 2]],
      [V[d] - V[a], V[d + 1] - V[a + 1], V[d + 2] - V[a + 2]],
    );
    if (Math.hypot(...c) < 1e-9) {
      return;
    }
    const flip = c[0] * V[a + 3] + c[1] * V[a + 4] + c[2] * V[a + 5] < 0;
    this.t.push(...(flip ? [p, r, q] : [p, q, r]));
    this.c.push(region, region, region);
  }

  sheet(rows: number[][], region: number) {
    rows.slice(1).forEach((row, r) => {
      const prev = rows[r];
      const n = Math.max(row.length, prev.length);
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const [a, b] = [prev[i % prev.length], prev[j % prev.length]];
        const [c, d] = [row[i % row.length], row[j % row.length]];
        this.tri(a, c, d, region);
        this.tri(a, d, b, region);
      }
    });
  }
}

/** The back's part of the column at a level of detail: baked, how many vertebrae, and the ring the tail goes on from, on the pelvis. */
interface Back {
  baked: Baked;
  n: number;
  /** The last ring's middle in the pelvis' frame, its way, its radius. */
  c: Vec3;
  tan: Vec3;
  r: number;
}
const backs: Back[] = [];

/** The pipes' colour: a very dark grey, lighter than the chitin. */
export const PIPE = [0.1, 0.1, 0.105];

/**
 * The back's half of its spine, sunk in the skin, and the pipes up its neck, baked into the skin of
 * `lod` (shape() in skin.ts): they only follow the joints, so the shader poses them with the rest
 * of it. The vertebrae lie at rest as column() spaced them; each point hangs on the joints of the
 * two bones it lies between, the last ring on the pelvis alone, where tail() takes the column on.
 */
export const backOf = (lod: number): Back => (backs[lod] ??= bake(lod));
const bake = (lod: number): Back => {
  const S = solve(rest());
  const out = new Bake();
  const curve = curveOf(bonesOf(S, 0, 0, 0, 0));
  // The pelvis' bone, where the tail's free part starts.
  const L = curve.len[(BACK.length - 2) * 4];
  const n = Math.round((VERTEBRAE[lod] * L) / curve.total);
  const [sides, shape, side] = [SIDES[2][lod], BEAD[lod], [1, 0, 0] as Vec3];
  const { JACKET, STRIPE } = REGION;
  /** The joints of the bones at `f` between the curve's points (along()), and how far from the first. */
  const hang = (spots: Spot[], f: number) => {
    const b = Math.min(Math.floor(f / 4), BACK.length - 2);
    return out.row(spots, BACK[b], BACK[b + 1], (f - 4 * b) / 4);
  };
  const [[head], down, f0] = along(curve, 0);
  const rows = [hang([[head, down.map(x => -x) as Vec3]], f0)];
  for (let v = 0; v < n; v++) {
    shape.forEach((k, j) => {
      const [b, tan, f] = along(curve, ((v + j / shape.length) / n) * L);
      rows.push(hang(ring(b[0], tan, side, b[2] * k, sides), f));
    });
    if (lod) {
      // Its spine, short on the back.
      const [b, tan, f] = along(curve, ((v + 0.5) / n) * L);
      const d = unit(mix3(b[1], tan, 0.45));
      const root = [0, 1, 2].map(i => b[0][i] + b[1][i] * b[2] * 0.6) as Vec3;
      const top = [0, 1, 2].map(i => root[i] + d[i] * b[2] * 1.2) as Vec3;
      out.sheet(
        [hang(ring(root, d, side, b[2] * 0.35, SIDES[0][lod]), f), hang([[top, d]], f)],
        JACKET,
      );
    }
  }
  const [b, tan] = along(curve, L);
  const r = b[2] * shape[0];
  rows.push(out.row(ring(b[0], tan, side, r, sides), J.PELVIS, J.PELVIS, 0));
  out.sheet(rows, JACKET);
  if (lod) {
    pipes(out, S, lod, STRIPE);
  }
  const c = S.pos[J.PELVIS];
  return { baked: out, n, c: [b[0][0] - c[0], b[0][1] - c[1], b[0][2] - c[2]], tan, r };
};

/**
 * Thin pipes up its neck (the user, 2026-11-15: following the neck, in curves, many): six each side,
 * from the top of the chest round the neck's sides into the underside of the skull, each through
 * points carried by the chest, the neck and the head, so it bends with them, on a smooth curve
 * that snakes round the neck. Baked at rest from `s` (backOf()), in the palette's `region`.
 */
const pipes = (out: Bake, s: Solved, lod: number, region: number) => {
  // The joint, the height over it and the neck's radius there (on its muscles), its centre's z.
  const ctl: [number, number, number, number][] = [
    [J.CHEST, 0.15, 0.08, 0],
    [J.NECK, 0.0, 0.062, 0.002],
    [J.NECK, 0.06, 0.057, 0.004],
    [J.HEAD, 0.0, 0.055, 0.006],
    [J.HEAD, 0.05, 0.05, 0.01],
  ];
  const n = SIDES[0][lod];
  const side: Vec3 = [1, 0, 0];
  for (const k of [-1, 1]) {
    [0.4, 0.75, 1.1, 1.45, 1.8, 2.15].forEach((a, i) => {
      // A wave round the neck, each pipe out of step with the next.
      const pts = ctl.map(([j, y, r, z], c): Vec3 => {
        const b = a + 0.22 * Math.sin(c * 1.4 + i * 2.1);
        return on(s.pos[j], s.rot[j], [k * r * Math.sin(b), y, z - r * Math.cos(b)]);
      });
      const w = smooth(pts, () => 0).map(([p]) => p);
      const last = w.length - 1;
      const way = (m: number) =>
        unit([0, 1, 2].map(j => w[Math.min(m + 1, last)][j] - w[Math.max(m - 1, 0)][j]) as Vec3);
      /** Point `m` of the curve hangs on the joints of the two controls it lies between. */
      const hang = (spots: Spot[], m: number) => {
        const c = Math.min(Math.floor(m / 4), ctl.length - 2);
        return out.row(spots, ctl[c][0], ctl[c + 1][0], (m - 4 * c) / 4);
      };
      // Both ends are buried in the chest and the skull: no caps but a point.
      out.sheet(
        [
          hang([[w[0], way(0).map(v => -v) as Vec3]], 0),
          ...w.map((p, m) => hang(ring(p, way(m), side, 0.0042 - 0.0015 * (m / last), n), m)),
          hang([[w[last], way(last)]], last),
        ],
        region,
      );
    });
  }
};

/** Scratch rings of tail(): each spot's place then normal. */
let [RA, RB] = [new Float64Array(96), new Float64Array(96)];
const [RC, RD] = [new Float64Array(96), new Float64Array(6)];

/** A ring of `n` spots into `R`, as ring() makes them; or the point `c` facing `tan` (n 1). */
const ringTo = (R: Float64Array, c: Vec3, tan: Vec3, side: Vec3, r: number, n: number) => {
  if (n == 1) {
    R.set(c);
    R.set(tan, 3);
    return 1;
  }
  let ax = tan[1] * side[2] - tan[2] * side[1];
  let ay = tan[2] * side[0] - tan[0] * side[2];
  let az = tan[0] * side[1] - tan[1] * side[0];
  const l = Math.hypot(ax, ay, az) || 1;
  [ax, ay, az] = [ax / l, ay / l, az / l];
  const bx = ay * tan[2] - az * tan[1];
  const by = az * tan[0] - ax * tan[2];
  const bz = ax * tan[1] - ay * tan[0];
  for (let i = 0; i < n; i++) {
    const cs = Math.cos((i / n) * TAU);
    const sn = Math.sin((i / n) * TAU);
    const mx = ax * cs + bx * sn;
    const my = ay * cs + by * sn;
    const mz = az * cs + bz * sn;
    R[i * 6] = c[0] + mx * r;
    R[i * 6 + 1] = c[1] + my * r;
    R[i * 6 + 2] = c[2] + mz * r;
    R[i * 6 + 3] = mx;
    R[i * 6 + 4] = my;
    R[i * 6 + 5] = mz;
  }
  return n;
};

/** Spot `s` of `S` into `a` at `w`, in `col` on `layer`; the next place to write. */
const spot = (a: Floats, w: number, S: Float64Array, s: number, col: number[], layer: number) => {
  a[w] = S[s];
  a[w + 1] = S[s + 1];
  a[w + 2] = S[s + 2];
  a[w + 3] = S[s + 3];
  a[w + 4] = S[s + 4];
  a[w + 5] = S[s + 5];
  a[w + 6] = col[0];
  a[w + 7] = col[1];
  a[w + 8] = layer;
  a[w + 9] = col[2];
  return w + 10;
};

/** The triangle of spots p, q, r as face() draws it, into `a` at `w`; the next place to write. */
const tri = (
  a: Floats,
  w: number,
  P: Float64Array,
  p: number,
  Q: Float64Array,
  q: number,
  R: Float64Array,
  r: number,
  col: number[],
  layer: number,
) => {
  const ux = Q[q] - P[p];
  const uy = Q[q + 1] - P[p + 1];
  const uz = Q[q + 2] - P[p + 2];
  const vx = R[r] - P[p];
  const vy = R[r + 1] - P[p + 1];
  const vz = R[r + 2] - P[p + 2];
  const cx = uy * vz - uz * vy;
  const cy = uz * vx - ux * vz;
  const cz = ux * vy - uy * vx;
  if (cx * cx + cy * cy + cz * cz < 1e-18) {
    return w;
  }
  w = spot(a, w, P, p, col, layer);
  return cx * P[p + 3] + cy * P[p + 4] + cz * P[p + 5] < 0
    ? spot(a, spot(a, w, R, r, col, layer), Q, q, col, layer)
    : spot(a, spot(a, w, Q, q, col, layer), R, r, col, layer);
};

/** Triangles between the rows A (`na` spots) and B (`nb`) into `out`, as sheet() sews them. */
const strip = (
  out: Out,
  A: Float64Array,
  na: number,
  B: Float64Array,
  nb: number,
  col: number[],
  layer: number,
) => {
  const n = Math.max(na, nb);
  const a = room(out, n * 60);
  let w = out.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const pa = (i % na) * 6;
    const pb = (j % na) * 6;
    const pc = (i % nb) * 6;
    const pd = (j % nb) * 6;
    w = tri(a, w, A, pa, B, pc, B, pd, col, layer);
    w = tri(a, w, A, pa, B, pd, A, pb, col, layer);
  }
  out.length = w;
};

/**
 * Its tail, in the world, from the solved skeleton `s`: the column's free part, from the pelvis
 * on (the back's is in the skin, backOf()), each vertebra a bead pinched at its joints with a spine
 * standing out of it but near the tip, as bonesOf() bends and sways it; the stinger at its end, a
 * blade swelling to a barb, then a point, glowing in the team's `color`. Written straight into
 * `out`. `lod` 0 far, 1 near, 3 close.
 */
export const tail = (
  out: Out,
  s: Solved,
  t: number,
  run: number,
  sting: number,
  color: number[],
  lod: number,
) => {
  const back = backOf(lod);
  // From the spine's bone, whose place shapes the curve's start at the pelvis.
  const curve = curveOf(bonesOf(s, t, run, sting).slice(BACK.length - 3), 4);
  const { len, total } = curve;
  const all = VERTEBRAE[lod];
  const n = all - back.n;
  const [sides, shape] = [SIDES[2][lod], BEAD[lod]];
  const [P, q] = [s.pos[J.PELVIS], s.rot[J.PELVIS]];
  const side = turn(q, [1, 0, 0]);
  // The ring the back's last bead ends on, carried by the pelvis as the skin's is: no crack.
  let na = ringTo(RA, on(P, q, back.c), turn(q, back.tan), side, back.r, sides);
  for (let v = 0; v < n; v++) {
    for (let j = v ? 0 : 1; j < shape.length; j++) {
      const [b, tan] = along(curve, ((v + j / shape.length) / n) * total);
      const nb = ringTo(RB, b[0], tan, side, b[2] * shape[j], sides);
      strip(out, RA, na, RB, nb, CHITIN_X, -1);
      [RA, RB, na] = [RB, RA, nb];
    }
    if (lod && back.n + v < all - 6) {
      // Its spine: short down to the coccyx (the user, 2026-11-15), the tail's long.
      const l = ((v + 0.5) / n) * total;
      const [b, tan] = along(curve, l);
      const d = unit(mix3(b[1], tan, 0.45));
      const h = b[2] * (l < len[4] ? 1.2 : 2.1);
      const root = [0, 1, 2].map(i => b[0][i] + b[1][i] * b[2] * 0.6) as Vec3;
      const top = [0, 1, 2].map(i => root[i] + d[i] * h) as Vec3;
      const m = ringTo(RC, root, d, side, b[2] * 0.35, SIDES[0][lod]);
      strip(out, RC, m, RD, ringTo(RD, top, d, side, 0, 1), CHITIN_X, -1);
    }
  }
  // The stinger.
  const [[end], w] = along(curve, total);
  const pt = (k: number): Vec3 => [end[0] + w[0] * k, end[1] + w[1] * k, end[2] + w[2] * k];
  na = ringTo(RA, end, w, side, TAIL.tip, sides);
  let nb = ringTo(RB, pt(TAIL.sting * 0.35), w, side, 0.03, sides);
  strip(out, RA, na, RB, nb, color, -2);
  nb = ringTo(RC, pt(TAIL.sting), w, side, 0, 1);
  strip(out, RB, sides, RC, nb, color, -2);
};

/** Bone: its claws and teeth, nothing else. */
export const BONE = [0.62, 0.6, 0.52];
/** Its tendons and ribs: the chitin, a little lighter. */
const SINEW = CHITIN_X.map(v => v * 1.45);

/**
 * A tube through `pts` in the frame (at, q) of a joint, `radii` thick at them, closed at both ends,
 * its rings steadied by the joint's `axis` (x), which must never lie along it: a ring whose way is
 * the axis collapses flat, and a tube along it pinched there. An end thicker than a hair is a dome
 * (`round`): a flat cap read as a cut-off pipe.
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
  round = true,
  axis: Vec3 = [1, 0, 0],
) => {
  const w = pts.map(p => on(at, q, p));
  const side = turn(q, axis);
  const way = (i: number) =>
    unit(
      [0, 1, 2].map(j => w[Math.min(i + 1, w.length - 1)][j] - w[Math.max(i - 1, 0)][j]) as Vec3,
    );
  /** The end at `p` going out along `d`, `r` thick: a ring at 45 degrees round the dome, then its top. */
  const cap = (p: Vec3, d: Vec3, r: number): Spot[][] => {
    if (!round || r < 0.002) {
      return [[[p, d]]];
    }
    const c = r * Math.SQRT1_2;
    const mid = ring([p[0] + d[0] * c, p[1] + d[1] * c, p[2] + d[2] * c], d, side, c, n).map(
      ([v, m]): Spot => [v, unit([m[0] + d[0], m[1] + d[1], m[2] + d[2]])],
    );
    return [[[[p[0] + d[0] * r, p[1] + d[1] * r, p[2] + d[2] * r], d]], mid];
  };
  const [a, b] = [way(0), way(w.length - 1)];
  const last = w.length - 1;
  sheet(
    [
      ...cap(w[0], a.map(v => -v) as Vec3, radii[0]),
      ...w.map((p, i) => ring(p, way(i), side, radii[i], n)),
      ...cap(w[last], b, radii[last]).reverse(),
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
    // The ankle's ball just over the shin's end (thicker, it stood round it as a boot's cuff), then
    // the bone thinning evenly to the ball of the foot.
    [0.024, 0.037, 0.032, 0.028, 0.027, 0.029],
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
    // The knuckle, and the toe's pad under its end; far, the digit and its claw alone.
    if (lod) {
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
    }
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
  // On the spine joint, two more under the cage (the user, 2026-11-15), shorter, not reaching
  // round to the front: the floating ribs.
  // Many, close together (the user, 2026-11-16: tighter, more of them, higher up on the pecs):
  // a row every 3 cm, the top ones over the pecs only across the front, clear of the armpits.
  // [height at the back, half width, half depth, where it starts round from the back]
  const CAGE = [
    [0.2, 0.14, 0.108],
    [0.165, 0.145, 0.116],
    [0.135, 0.152, 0.126],
    [0.09, 0.158, 0.141],
    [0.04, 0.156, 0.137],
    [-0.01, 0.153, 0.133],
    [-0.06, 0.146, 0.127],
    [-0.11, 0.136, 0.118],
    [-0.15, 0.129, 0.112],
  ];
  const size = (y: number) => {
    const k = Math.min(
      Math.max(
        CAGE.findIndex(v => v[0] < y),
        1,
      ),
      CAGE.length - 1,
    );
    const t = Math.min(Math.max((y - CAGE[k - 1][0]) / (CAGE[k][0] - CAGE[k - 1][0]), 0), 1);
    return [1, 2].map(j => CAGE[k - 1][j] + (CAGE[k][j] - CAGE[k - 1][j]) * t);
  };
  const rows = low
    ? [
        [0.035, 0.122, 0.108, Math.PI],
        [0.005, 0.124, 0.106, Math.PI],
      ]
    : Array.from({ length: 13 }, (_, i) => {
        const y = 0.23 - 0.03 * i;
        // Where it reaches the front, a few centimetres lower than at the back.
        const [w, d] = size(y - 0.04);
        // Over the pecs, out on their fuller curve.
        const pec = Math.min(Math.max((y - 0.04) / 0.1, 0), 1);
        return [y, w + 0.008 * pec, d + 0.022 * pec, y > 0.1 ? 1.15 : Math.PI];
      });
  // Far, every third row of the cage: the ribs there are hairs, and their count would be half the body's.
  rows.forEach(([y, w, d, from], i) => {
    if (!lod && !low && i % 3) {
      return;
    }
    for (const s of [-1, 1]) {
      const pts: Vec3[] = [];
      // From the spine's vertebra at the middle of the back (the user, 2026-11-15) round the side
      // to the front; the pecs' only across the front.
      // Each meets the breastbone in the middle (the user, 2026-11-16).
      const end = low ? 0.75 + 0.12 * i : 0.05;
      // Sixteen steps round a whole one: with eight, each bend showed as a knee on the side.
      // Far, five.
      const K = lod ? Math.max(6, Math.round((16 * (from - end)) / (Math.PI - 0.4))) : 5;
      for (let k = 0; k <= K; k++) {
        const a = from - ((from - end) * k) / K;
        // Sloping down toward the front, by how far round it is from the back.
        const drop = (0.06 * (Math.PI - a)) / (Math.PI - 0.4);
        let py = y - drop;
        // The lower ones rise toward the breastbone's foot as they near the front (the user,
        // 2026-11-16), as a human cage's cartilage does: they fan in under it.
        // A shorter breastbone (the user, 2026-11-16): its foot higher, the ribs under it climbing
        // to it over more of their way round.
        const foot = 0.0;
        if (!low && py < foot) {
          const f = Math.min(Math.max((1.9 - a) / 1.75, 0), 1);
          py += (foot + 0.12 * (py - foot) - py) * f * f * (3 - 2 * f);
        }
        pts.push([s * w * Math.sin(a), py, -0.013 - d * Math.cos(a)]);
      }
      // Thin at its ends, fullest in its middle; thinner than they were, being closer.
      strand(
        out,
        at,
        q,
        pts,
        pts.map((_, k) => 0.0025 + 0.0075 * Math.sin((Math.PI * k) / K) ** 0.7),
        n,
        SINEW,
        -1,
        true,
        // They run across the back and the front: steadied by the up axis.
        [0, 1, 0],
      );
    }
  });
  if (!low && lod) {
    // The ribs linked to one another down their outer side (the user, 2026-11-16): a cord through
    // each row at the same angle round, full where it crosses a rib, pinched between two.
    // Near the shoulder's line only (the user, 2026-11-16): the outer ends of the upper rows.
    // On the ribs' starts (the user, 2026-11-16), where they come out of the pecs' skin.
    for (const [a, k0, k1] of [[0.92, 0, 5]] as const) {
      for (const s of [-1, 1]) {
        const pts: Vec3[] = [];
        const radii: number[] = [];
        const on = rows.slice(k0, k1);
        on.forEach(([y, w, d], i) => {
          const drop = (0.06 * (Math.PI - a)) / (Math.PI - 0.4);
          const p = (yy: number): Vec3 => {
            // As the ribs: the lower ones rise toward the breastbone's foot.
            if (yy < -0.07) {
              const f = Math.min(Math.max((1.3 - a) / 1.2, 0), 1);
              yy += (-0.07 + 0.2 * (yy + 0.07) - yy) * f * f * (3 - 2 * f);
            }
            // Lifted a little: the pecs' skin swells over the ribs' outer ends.
            const [W, D] = [w + 0.009, d + 0.009];
            return [s * W * Math.sin(a), yy, -0.013 - D * Math.cos(a)];
          };
          const r = 0.0075;
          pts.push(p(y - drop));
          radii.push(r);
          const next = on[i + 1];
          if (next) {
            // Halfway to the next, a little sunk and thinner.
            const [ny, nw, nd] = next;
            const [p0, p1] = [p(y - drop), p(ny - drop)];
            const [mw, md] = [(w + nw) / 2 + 0.011, (d + nd) / 2 + 0.011];
            pts.push([s * mw * Math.sin(a), (p0[1] + p1[1]) / 2, -0.013 - md * Math.cos(a)]);
            radii.push(0.006);
          }
        });
        strand(out, at, q, pts, radii, n, SINEW, -1, true, [1, 0, 0]);
      }
    }
  }
  if (!low) {
    strand(
      out,
      at,
      q,
      // Sunk in the skin (the user, 2026-11-15: more a part of its body), out of it at both ends.
      [
        [0, 0.17, -0.112],
        [0, 0.13, -0.128],
        [0, 0.09, -0.142],
        [0, 0.045, -0.147],
        [0, 0.005, -0.146],
      ],
      [0.004, 0.009, 0.011, 0.012, 0.006],
      n,
      SINEW,
    );
  }
};

/**
 * Its collarbones on the chest joint (the user, 2026-11-15: standing out, an exoskeleton), in the
 * ribs' chitin: from the notch over the breastbone forward and out, then back to a knob over each
 * shoulder.
 */
export const clavicles = (out: Out, at: Vec3, q: Quat, lod: number) => {
  // Sunk in the skin and close under the neck (the user, 2026-11-15: more a part of its body): a
  // ridge under it, rising out of it at the notch and going back into it at the shoulder.
  for (const s of [-1, 1]) {
    strand(
      out,
      at,
      q,
      (
        [
          [0.02, 0.208, -0.07],
          [0.036, 0.212, -0.08],
          [0.064, 0.217, -0.083],
          [0.097, 0.222, -0.072],
          [0.128, 0.225, -0.052],
          [0.15, 0.226, -0.032],
          [0.166, 0.226, -0.012],
        ] as Vec3[]
      ).map(([x, y, z]): Vec3 => [s * x, y - 0.003, z + 0.004]),
      // Thinner and deeper: a rod lying on the shoulder, it read as a pipe.
      [0.003, 0.006, 0.0085, 0.0085, 0.0085, 0.0075, 0.003],
      SIDES[1][lod],
      SINEW,
      -1,
      true,
      [0, 1, 0],
    );
  }
};

/**
 * Curved horns out of its back (the user, 2026-11-15): a pair on a joint, each from beside the spine
 * out of the back near square to it and well out to the side, clear of the head, curling up a little, `len` long and `r` thick at its root, at `base` (the right
 * one) in the joint's frame.
 */
export const horns = (
  out: Out,
  at: Vec3,
  q: Quat,
  lod: number,
  base: Vec3,
  len: number,
  r: number,
) => {
  for (const s of [-1, 1]) {
    const pts = Array.from({ length: 7 }, (_, i): Vec3 => {
      const t = i / 6;
      return [
        s * (base[0] + len * 0.66 * t),
        base[1] + len * (0.02 * t + 0.22 * t * t),
        base[2] + len * (0.72 * t - 0.1 * t * t),
      ];
    });
    strand(
      out,
      at,
      q,
      pts,
      pts.map((_, i) => r * (1 - i / 6) ** 0.85 + 0.0012),
      SIDES[1][lod],
      CHITIN_X,
      -1,
      true,
      [0, 1, 0],
    );
  }
};
/** The three pairs of horns: the joint, the root, the length and thickness, small low, large high. */
export const HORNS: [number, Vec3, number, number][] = [
  [J.SPINE, [0.09, 0.02, 0.062], 0.13, 0.014],
  [J.CHEST, [0.1, -0.03, 0.085], 0.2, 0.019],
  [J.CHEST, [0.105, 0.09, 0.083], 0.3, 0.025],
];

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
  hook = 0.016,
) => {
  const d = unit(dir);
  // The horns' taper and a curve down to the point: every spike of its body one family, in its
  // chitin (bone is for the claws and the teeth).
  const pts = Array.from({ length: 5 }, (_, i): Vec3 => {
    const k = i / 4;
    return [
      base[0] + d[0] * len * k,
      base[1] + d[1] * len * k - hook * k * k,
      base[2] + d[2] * len * k,
    ];
  });
  strand(
    out,
    at,
    q,
    pts,
    pts.map((_, i) => r * (1 - i / 4) ** 0.85 + 0.0008),
    n,
    CHITIN_X,
    -1,
    true,
    // Off the spike's way, so its rings never pinch.
    Math.abs(d[0]) > 0.7 ? [0, 1, 0] : [1, 0, 0],
  );
};

/** Its spurs: one out of the back of each elbow (a forearm joint), one out of the back of each ankle (a shin joint). */
export const elbow = (out: Out, at: Vec3, q: Quat, lod: number) =>
  spur(out, at, q, [0, -0.02, 0.03], [0, 0.45, 1], 0.12, 0.016, SIDES[1][lod]);
export const heel = (out: Out, at: Vec3, q: Quat, lod: number) =>
  spur(out, at, q, [0, -0.4, 0.035], [0, 0.35, 1], 0.09, 0.014, SIDES[1][lod]);

/**
 * The disc at the top of its arm (the user, 2026-11-16: where the shoulder ends and the arm
 * begins), on the arm's swing (its joint without its twist, as the skin's top is), `s` 1 the right
 * arm: a full disc slanting through the shoulder, thin with a rounded rim and low domed faces,
 * its rim fading into the skin toward the armpit.
 */
export const cuff = (out: Out, at: Vec3, q: Quat, lod: number, s: number) => {
  if (!lod) {
    return;
  }
  const n = [8, 20, 24, 36][lod];
  // Set in the round of the shoulder at 45 degrees (the user, 2026-11-16): its plane through the
  // humerus' head, slanting from the armpit up over the point of the shoulder; `ax` square to it,
  // out and down, `e1` in it, out and up, `e2` front to back.
  const ax: Vec3 = [s * Math.SQRT1_2, -Math.SQRT1_2, 0];
  const e1: Vec3 = [s * Math.SQRT1_2, Math.SQRT1_2, 0];
  const e2: Vec3 = [0, 0, 1];
  // The shoulder's section in that plane: its middle, half width (along e1) and half depth.
  const [c, rx, rz]: [Vec3, number, number] = [[s * -0.024, 0.0, 0.0], 0.054, 0.058];
  // Across it, out along `ax`: [offset, scale of the section].
  // A full disc (the user, 2026-11-16: the circle filled): a low dome closes each face.
  // Thicker and wider (the user, 2026-11-16).
  const PROFILE = Array.from({ length: 13 }, (_, i) => {
    const a = (Math.PI * i) / 12;
    return [-0.027 * Math.cos(a), 1.41 * Math.sin(a) ** 0.55];
  });

  const R = (rx + rz) / 2;
  const rows = PROFILE.map(([h0, k0], i): Spot[] => {
    const [a, b] = [PROFILE[Math.max(i - 1, 0)], PROFILE[Math.min(i + 1, PROFILE.length - 1)]];
    const [dh, dk] = [b[0] - a[0], (b[1] - a[1]) * R];
    const l = Math.hypot(dh, dk) || 1;
    if (!k0) {
      const p: Vec3 = [0, 1, 2].map(x => c[x] + ax[x] * h0) as Vec3;
      return [[on(at, q, p), turn(q, h0 > 0 ? ax : (ax.map(v => -v) as Vec3))]];
    }
    return Array.from({ length: n }, (_, j): Spot => {
      const t = (j / n) * TAU;
      const [cs, sn] = [Math.cos(t), Math.sin(t)];
      // Down toward the armpit it fades back into the skin: there it cut through the chest.
      const v = Math.min(Math.max((-cs - 0.1) / 0.6, 0), 1);
      const fade = v * v * (3 - 2 * v);
      const k = k0 > 0.92 ? k0 + (0.92 - k0) * fade : k0;
      const h = h0 * (1 - fade);
      const p: Vec3 = [0, 1, 2].map(
        x => c[x] + e1[x] * rx * k * cs + e2[x] * rz * k * sn + ax[x] * h,
      ) as Vec3;
      const nr = unit([0, 1, 2].map(x => (e1[x] * cs) / rx + (e2[x] * sn) / rz) as Vec3);
      const m = unit([0, 1, 2].map(x => (nr[x] * dh - ax[x] * dk) / l) as Vec3);
      return [on(at, q, p), turn(q, m)];
    });
  });
  sheet(rows, CHITIN_X, -1, out);
};

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
  [-0.07, 0.115],
  [-0.088, 0.105],
  [-0.095, 0.088],
];
/** Its head's chitin: the dome's (the skin's TRIM, soldier.ts) and its face's, the body's own. */
export const HEAD = CHITIN_X;
const [DARK, TEETH] = [
  [0.02, 0.02, 0.025],
  // Steel bright (the user, 2026-11-16: metal teeth).
  [0.66, 0.68, 0.72],
];
/**
 * The middle of an orbit and how its long axis rises toward the temple (the user, 2026-11-15: less
 * round, squinting, meaner): a narrow slanted slit, its inner corner low.
 */
const [EYE, SLANT] = [[0.032, 0.012], 0.35];
/**
 * How deep in an orbit (0 to 1) the point of the face (x, y) is, eased at its rim and its floor: a
 * rim falling steeply drew the grid's diagonals as steps along the slit's edge.
 */
const orbit = (x: number, y: number) => {
  const dx = Math.abs(x) - EYE[0];
  const o = Math.max(0, 1 - (dx / 0.025) ** 2 - ((y - EYE[1] - SLANT * dx) / 0.0095) ** 2);
  return o * o * (3 - 2 * o);
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
/**
 * How far the head is carried over its joint (the user, 2026-11-15: a neck that shows): the face
 * here, the dome in skin.ts (PROFILE), the neck's skin run up to it.
 */
export const HEAD_UP = 0.065;
// A lower, flatter forehead (the user, 2026-11-15: too conical), the chin where it was.
const [EY, EA, EB, EC] = [0.005, 0.084, 0.1, 0.105];
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
/** [0, 1] onto itself, the steps packed where `density` (of the place, 0 to 1) is high. */
const warp = (density: (t: number) => number) => {
  const n = 400;
  const acc = [0];
  for (let i = 1; i <= n; i++) {
    acc.push(acc[i - 1] + density((i - 0.5) / n));
  }
  return (v: number) => {
    const goal = v * acc[n];
    // The first step at or past the goal, by halving: the face's grid asks for thousands.
    let [lo, hi] = [0, n + 1];
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      [lo, hi] = acc[m] >= goal ? [lo, m] : [m + 1, hi];
    }
    const i = Math.min(Math.max(lo > n ? -1 : lo, 1), n);
    return (i - 1 + (goal - acc[i - 1]) / (acc[i] - acc[i - 1])) / n;
  };
};
/**
 * The rows packed round the eyes' slits (the user, 2026-11-15: no steps round the eyes), and the
 * columns over the orbits, whose slanted rims crossed even columns in steps along the slit: near,
 * three and twice as close; close, five and three and a half times, on a grid of fewer rows and
 * columns (its steps there as fine as on the old one of 64 by 92, a third of the vertices).
 */
const [ROWS, COLS] = [
  [2.2, 4].map(k =>
    warp(t => 1 + k * Math.exp(-(((TOP - (TOP - CHIN) * t - EYE[1]) / 0.02) ** 2))),
  ),
  [1.6, 2.6].map(k => warp(t => 1 + k * Math.exp(-(((Math.abs(2 * t - 1) - 0.38) / 0.26) ** 2)))),
];
/** The height of the grid's row `v` (0 the top, 1 the chin), on the close grid if `fine`. */
const rowY = (v: number, fine: boolean) => TOP - (TOP - CHIN) * ROWS[+fine](v);
/** The grid's column `u` (-1 to 1, evenly spaced) moved to pack over the orbits, on the close grid if `fine`. */
const colU = (u: number, fine: boolean) => -1 + 2 * COLS[+fine]((u + 1) / 2);
/**
 * The jawbone's line on the right (the user, 2026-11-15: thin, bony, standing out low on the face,
 * its angle marked): down from under the ear to a sharp angle, then forward to the chin.
 */
const JAW = [
  [0.075, -0.005],
  [0.071, -0.06],
  [0.05, -0.075],
  [0.028, -0.085],
  [0, -0.09],
];
/** How far (x, y) is from the jawbone. */
const jawline = (x: number, y: number) => {
  const ax = Math.abs(x);
  let d = 1;
  for (let i = 1; i < JAW.length; i++) {
    const x0 = JAW[i - 1][0];
    const y0 = JAW[i - 1][1];
    const dx = JAW[i][0] - x0;
    const dy = JAW[i][1] - y0;
    const t = Math.min(Math.max(((ax - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy), 0), 1);
    d = Math.min(d, Math.hypot(ax - x0 - dx * t, y - y0 - dy * t));
  }
  return d;
};
/** The face's surface at (x, y): an ellipse's front under a forehead's sphere, the orbits sunk, the cheekbones out. */
const faceZ = (x: number, y: number) => {
  const u = Math.min(Math.abs(x) / Math.max(widthOf(y), 1e-6), 1);
  const low = -curve(DEPTH, y) * Math.sqrt(1 - u * u);
  const dome = -EC * Math.sqrt(Math.max(0, 1 - (x / EA) ** 2 - ((y - EY) / EB) ** 2));
  return (
    low +
    (dome - low) * brow(y) +
    0.03 * orbit(x, y) -
    0.007 * frown(x, y) -
    0.008 * Math.exp(-(((Math.abs(x) - 0.056) / 0.013) ** 2) - ((y + 0.008) / 0.012) ** 2) +
    0.016 * Math.exp(-(((Math.abs(x) - 0.052) / 0.015) ** 2) - ((y + 0.036) / 0.016) ** 2) -
    0.022 * Math.exp(-((jawline(x, y) / 0.009) ** 2)) * (1 - u ** 6)
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
export const skull = (out: Out, head: Vec3, q: Quat, lod: number) => {
  const at = on(head, q, [0, HEAD_UP, 0]);
  const [nx, ny] = [
    [8, 10],
    [22, 38],
    [22, 38],
    [50, 72],
  ][lod];
  const spot = (u: number, v: number): Spot => {
    const y = rowY(v, lod > 2);
    const x = colU(u, lod > 2) * widthOf(y);
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
    // The rim tucked a hair under the dome's front ring: no crack where their vertices differ.
    const g = 1 + 0.01 * w;
    return [on(at, q, [x * g, EY + (y - EY) * g, faceZ(x, y) + 0.004 * w]), turn(q, n)];
  };
  // Each node of the grid worked out once: it is the corner of six triangles.
  const nodes: Spot[] = [];
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      nodes.push(spot((2 * i) / nx - 1, j / ny));
    }
  }
  /** The grid's node in column i, row j. */
  const node = (i: number, j: number) => nodes[j * (nx + 1) + i];
  // The grid, but where the lips part: the hole's edge, in steps, lies under the lips. Far, with no
  // lips or inside drawn, the mouth is the grid painted dark: a hole there showed the sky through.
  const tri = (p: [number, number][], s: Spot[]) => {
    const [u, v] = [0, 1].map(k => (p[0][k] + p[1][k] + p[2][k]) / 3);
    const y = rowY(v, lod > 2);
    const open = parted(colU(u, lod > 2) * widthOf(y), y);
    if (!open || !lod) {
      face(out, open ? DARK : HEAD, -1, s);
    }
  };
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const [u0, u1, v0, v1] = [(2 * i) / nx - 1, (2 * (i + 1)) / nx - 1, j / ny, (j + 1) / ny];
      tri(
        [
          [u0, v0],
          [u1, v0],
          [u1, v1],
        ],
        [node(i, j), node(i + 1, j), node(i + 1, j + 1)],
      );
      tri(
        [
          [u0, v0],
          [u1, v1],
          [u0, v1],
        ],
        [node(i, j), node(i + 1, j + 1), node(i, j + 1)],
      );
    }
  }
  if (!lod) {
    return;
  }
  const n = lod > 2 ? 24 : 12;
  const sides = SIDES[1][lod];
  const line = lipline(n);
  const fwd = turn(q, [0, 0, -1]);
  // Inside the mouth, dark, its edge inside the lips: no gap between them seen from below.
  sheet(
    [
      [[on(at, q, [0, MY, faceZ(0, MY) + 0.018]), fwd]],
      line.map(([x, y]): Spot => [on(at, q, [x, y, faceZ(x, y) - 0.001]), fwd]),
    ],
    DARK,
    -1,
    out,
  );
  // The lips round it, a little thicker in their middle (the user, 2026-11-15: thinner), curled.
  const pts = [...line, line[0]].map(([x, y]): Vec3 => [x, y, faceZ(x, y) - 0.002]);
  strand(
    out,
    at,
    q,
    pts,
    pts.map(([x]) => 0.0024 + 0.002 * (1 - (x / MW) ** 2)),
    sides,
    HEAD,
    -1,
    // A loop: its two ends meet.
    false,
    // Steadied by the face's forward axis: by its x axis, along which the lips run, they pinched
    // into a V in their middle.
    [0, 0, 1],
  );
  // A band of the face round the lips, a grid cell wide (the user, 2026-11-15: no holes round the
  // mouth): it covers the steps the grid's hole leaves outside the thinner lips.
  const m = lod > 2 ? 0.005 : 0.01;
  const at3 = (x: number, y: number): Spot => {
    const h = 1e-3;
    const nz: Vec3 = unit([
      (faceZ(x + h, y) - faceZ(x - h, y)) / (2 * h),
      (faceZ(x, y + h) - faceZ(x, y - h)) / (2 * h),
      -1,
    ]);
    return [on(at, q, [x, y, faceZ(x, y) - 0.0006]), turn(q, nz)];
  };
  // Out of the lips' line (it runs clockwise: left to right over the top, back under).
  const band = line.map(([x, y], i): [number, number] => {
    const [a, b] = [line[(i + line.length - 1) % line.length], line[(i + 1) % line.length]];
    const [tx, ty] = [b[0] - a[0], b[1] - a[1]];
    const l = Math.hypot(tx, ty) || 1;
    return [x - (ty / l) * m, y + (tx / l) * m];
  });
  line.forEach(([x, y], i) => {
    const j = (i + 1) % line.length;
    const quad = [at3(x, y), at3(...line[j]), at3(...band[j]), at3(...band[i])];
    face(out, HEAD, -1, [quad[0], quad[1], quad[2]]);
    face(out, HEAD, -1, [quad[0], quad[2], quad[3]]);
  });
};

/**
 * The fine parts of its face, too thin for a shadow (soldier.ts keeps them out of the depth passes):
 * its steel teeth and the cords of sinew beside its mouth. Not far.
 */
export const teeth = (out: Out, head: Vec3, q: Quat, lod: number) => {
  if (!lod) {
    return;
  }
  const at = on(head, q, [0, HEAD_UP, 0]);
  const sides = SIDES[1][lod];
  // The teeth, steel, from under each lip toward the other, many, long and sharp (the user,
  // 2026-11-16): the fangs, a lip's curl apart, longest, the upper ones over the lower lip.
  for (const [k, up] of [
    [13, true],
    [12, false],
  ] as const) {
    for (let i = 0; i < k; i++) {
      const x = -MW * 0.84 + (1.68 * MW * i) / (k - 1);
      const fang = Math.exp(-(((Math.abs(x) - FANG) / 0.005) ** 2));
      const side = 1 - 0.35 * (x / MW) ** 2;
      const [edge, tip] = up
        ? [MY + above(x), MY - (0.003 + 0.007 * fang) * side]
        : [MY - below(x), MY + (0.0025 + 0.006 * fang) * side];
      // Rooted just inside the lip's line, set back behind the face by more than their own
      // thickness: rooted 3 mm out past the lower lip, they came through the chin under it.
      const r = 0.0024 + 0.0012 * fang;
      const root = edge + (up ? -0.0012 : 0.0012);
      const z = Math.max(faceZ(x, root), faceZ(x, MY)) + r + 0.0008;
      strand(
        out,
        at,
        q,
        [
          [x, root, z],
          [x, (root + tip) / 2, z - 0.0016],
          [x, tip, z - 0.0026],
        ],
        [r, r * 0.6, 0.0003],
        sides,
        TEETH,
        -1,
        false,
      );
    }
  }
  // Cords of sinew beside the mouth (the user, 2026-11-16: a head with more biomechanical
  // detail): each side three tendons stretched from the upper jaw to the lower one past the
  // corner of the mouth, bowed out, half sunk in the face.
  for (const s of [-1, 1]) {
    for (const [x0, x1, r0] of [
      [0.037, 0.035, 0.0019],
      [0.044, 0.042, 0.0022],
      [0.051, 0.047, 0.0018],
    ]) {
      const pts: Vec3[] = [];
      const radii: number[] = [];
      for (let j = 0; j <= 8; j++) {
        const t = j / 8;
        const x = s * (x0 + (x1 - x0) * t + 0.003 * Math.sin(Math.PI * t));
        const y = -0.016 - 0.05 * t;
        const r = r0 * (0.55 + 0.45 * Math.sin(Math.PI * t));
        pts.push([x, y, faceZ(x, y) - r * 0.35]);
        radii.push(r);
      }
      strand(out, at, q, pts, radii, SIDES[0][lod], SINEW, -1, true, [0, 0, 1]);
    }
  }
};

/**
 * Veins along its dome (the user, 2026-11-16), on the head joint: on each side three running back
 * from the face's edge along the banana, wandering a little up and down its side, thinning toward
 * the back, with a short branch off each; one along each side of the top. Half sunk in the skin.
 */
export const veins = (out: Out, head: Vec3, q: Quat, lod: number) => {
  if (!lod) {
    return;
  }
  const rest = bindOf(0)[J.HEAD];
  const n = SIDES[0][lod];
  /** The dome's surface at `z` behind the face, `a` round it from the top, `r` out of it. */
  const at = (z: number, a: number, r: number): Vec3 => {
    const [c, w, h] = domeAt(z);
    const [sn, cs] = [Math.sin(a), Math.cos(a)];
    const m = unit([sn / w, cs / h, 0]);
    return [w * sn + m[0] * r, c + h * cs + m[1] * r - rest[1], z];
  };
  /** A seeded random in [0, 1): the same tree on every screen. */
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  /**
   * A vessel on side `s` from (z0, a0), `len` long along the dome, turning by `drift` round it,
   * `r0` thick at its root and tapering. It branches as blood vessels do (the user, 2026-11-16:
   * smaller veins, like branches): two to four thinner ones leave it along its length, off to
   * either side, each branching again, down to `depth` levels and a hair's thickness.
   */
  const vessel = (
    s: number,
    z0: number,
    a0: number,
    len: number,
    drift: number,
    r0: number,
    depth: number,
    front = 0,
  ) => {
    const K = Math.max(3, Math.round((lod > 2 ? 70 : 36) * len));
    const wav = rnd() * TAU;
    const way = (t: number) => a0 + drift * t + 0.05 * Math.sin(t * 9 + wav);
    // Out of the skin at its root over the first tenth, then tapering; a trunk carried on over the
    // face (`front`) comes out of it there instead.
    const thick = (t: number) => r0 * (1 - 0.7 * t) * (front ? 1 : Math.min(1, 0.2 + t * 8));
    const pts: Vec3[] = [];
    const radii: number[] = [];
    if (front) {
      // Over the face first, from where it fades out up to the rim, in one piece with the rest.
      const F = lod > 2 ? 24 : 10;
      for (let j = 0; j < F; j++) {
        const t = j / F;
        const e = front + (0.985 - front) * t;
        const a = s * (a0 + 0.015 * Math.sin(t * 7 + wav));
        const [x, y] = [EA * e * Math.sin(a), EY + EB * e * Math.cos(a)];
        const r = r0 * Math.min(1, t * 1.6) ** 1.5;
        pts.push(onFace(x, y, r * 0.35));
        radii.push(r);
      }
      // A fork off it halfway over the face, thinner, fading out sooner.
      face3(s, a0, (front + 0.985) / 2, front + 0.1, r0 * 0.5, wav);
    }
    for (let i = 0; i <= K; i++) {
      const t = i / K;
      const r = thick(t);
      pts.push(at(Math.min(z0 + len * t, 0.41), s * way(t), r * 0.35));
      radii.push(r);
    }
    strand(out, head, q, pts, radii, r0 < 0.0012 ? 3 : n, SINEW, -1, true, [0, 0, 1]);
    if (!depth || r0 < 0.0009) {
      return;
    }
    const kids = 2 + Math.floor(rnd() * 3);
    for (let k = 0; k < kids; k++) {
      const t = (k + 0.3 + 0.5 * rnd()) / kids;
      const off = (k % 2 ? 1 : -1) * (0.5 + 0.6 * rnd());
      vessel(
        s,
        z0 + len * t,
        way(t),
        len * (0.3 + 0.25 * rnd()) * (1 - 0.4 * t),
        drift * 0.3 + off,
        thick(t) * 0.62,
        depth - 1,
      );
    }
  };
  /** The face's surface at (x, y), `r` out of it along its normal, in the head joint's frame. */
  const onFace = (x: number, y: number, r: number): Vec3 => {
    const h = 1e-3;
    const m = unit([
      (faceZ(x + h, y) - faceZ(x - h, y)) / (2 * h),
      (faceZ(x, y + h) - faceZ(x, y - h)) / (2 * h),
      -1,
    ]);
    return [x + m[0] * r, y + HEAD_UP + m[1] * r, faceZ(x, y) + m[2] * r];
  };
  /** A vein over the face only, from `e1` of the way out to the rim (r0 thick) in to `e0`, fading. */
  const face3 = (s: number, a0: number, e1: number, e0: number, r0: number, wav: number) => {
    const F = lod > 2 ? 14 : 7;
    const pts: Vec3[] = [];
    const radii: number[] = [];
    for (let j = 0; j <= F; j++) {
      const t = j / F;
      const e = e1 + (e0 - e1) * t;
      const a = s * (a0 + 0.3 * t * t + 0.015 * Math.sin(t * 6 + wav));
      const [x, y] = [EA * e * Math.sin(a), EY + EB * e * Math.cos(a)];
      const r = r0 * (1 - t) ** 1.4;
      pts.push(onFace(x, y, r * 0.35));
      radii.push(r);
    }
    strand(out, head, q, pts, radii, 3, SINEW, -1, true, [0, 0, 1]);
  };
  // Near, the trunks alone: their branches are under a pixel there.
  const depth = lod > 2 ? 4 : 0;
  for (const s of [-1, 1]) {
    // The same seed each side: the two trees mirror.
    seed = 7;
    // Each trunk carried on over the face, fading out short of the orbits and the jaw's
    // tendons (the user, 2026-11-16: thinning to nothing).
    for (const [a0, drift, len, r0, front] of [
      [0.4, 0.1, 0.36, 0.0022, 0.4],
      [1.05, 0.25, 0.34, 0.0026, 0.62],
      [1.5, -0.2, 0.3, 0.0028, 0.76],
      [1.95, 0.3, 0.26, 0.0024, 0.66],
    ]) {
      vessel(s, 0.02, a0, len, drift, r0, depth, front);
    }
  }
};

/** Its eyes, glowing slits at the back of the orbits in the team's `color`. */
export const eyes = (out: Out, head: Vec3, q: Quat, color: number[], lod = 1) => {
  const at = on(head, q, [0, HEAD_UP, 0]);
  for (const s of [-1, 1]) {
    // A glowing slit along the orbit's slant, a lens lying on its floor, thin pointed ends, a full
    // middle. Wholly in front of the floor: sunk in it, its edge was cut in steps by the grid.
    const radii = [0.0008, 0.0028, 0.0041, 0.0046, 0.0041, 0.0028, 0.0008];
    const pts = [-0.015, -0.0105, -0.0055, 0, 0.0055, 0.0105, 0.015].map((d, i): Vec3 => {
      const [x, y] = [s * (EYE[0] + d), EYE[1] + SLANT * d];
      return [x, y, faceZ(x, y) - radii[i] - 0.0004];
    });
    strand(out, at, q, pts, radii, lod ? 8 : 4, color, -2, true, [0, 0, 1]);
  }
};

/** A rigid piece made at the origin of its joint's frame, then only placed (store.ts). */
type Make = (o: Out, at: Vec3, q: Quat) => void;
/**
 * A rigid piece of the xenomorph at a level of detail: its key in the store (all its vertices
 * depend on), how it is made, and whether it is `thin`, too fine for a shadow: left out of the
 * depth passes.
 */
export interface Part {
  key: string;
  make: Make;
  thin?: boolean;
}
/** Its pieces by the joint they go on (partsOf()), those on one joint merged: one draw each a pass. */
export const PART = {
  SHIN: 0,
  FOOT: 1,
  TOES: 2,
  CHEST: 3,
  SPINE: 4,
  ELBOW: 5,
  CUFF_L: 6,
  CUFF_R: 7,
  HEAD: 8,
  FINE: 9,
};
const parts: Part[][] = [];
/** The horns on joint `j` (HORNS). */
const hornsOn = (o: Out, at: Vec3, q: Quat, lod: number, j: number) => {
  for (const [k, base, len, w] of HORNS) {
    if (k == j) {
      horns(o, at, q, lod, base, len, w);
    }
  }
};
/** The xenomorph's rigid pieces at `lod`, in PART's order; render.ts makes them all at the map's load. */
export const partsOf = (lod: number): Part[] =>
  (parts[lod] ??= [
    {
      key: `xeno shin ${lod}`,
      make: (o, a, q) => {
        sinews(o, a, q, lod);
        heel(o, a, q, lod);
      },
    },
    { key: `xeno foot ${lod}`, make: (o, a, q) => metatarsal(o, a, q, lod) },
    { key: `xeno toes ${lod}`, make: (o, a, q) => toes(o, a, q, lod) },
    {
      key: `xeno chest ${lod}`,
      make: (o, a, q) => {
        ribs(o, a, q, lod);
        clavicles(o, a, q, lod);
        hornsOn(o, a, q, lod, J.CHEST);
      },
    },
    {
      key: `xeno spine ${lod}`,
      make: (o, a, q) => {
        ribs(o, a, q, lod, true);
        hornsOn(o, a, q, lod, J.SPINE);
      },
    },
    { key: `xeno elbow ${lod}`, make: (o, a, q) => elbow(o, a, q, lod) },
    { key: `xeno cuff ${lod} -1`, make: (o, a, q) => cuff(o, a, q, lod, -1) },
    { key: `xeno cuff ${lod} 1`, make: (o, a, q) => cuff(o, a, q, lod, 1) },
    { key: `xeno head ${lod}`, make: (o, a, q) => skull(o, a, q, lod) },
    {
      key: `xeno fine ${lod}`,
      make: (o, a, q) => {
        teeth(o, a, q, lod);
        veins(o, a, q, lod);
      },
      thin: true,
    },
  ]);
