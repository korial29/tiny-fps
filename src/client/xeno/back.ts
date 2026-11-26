import { TAU } from '../../shared/physics';
import { cross } from '../helmet';
import type { Spot } from '../helmet';
import { unit } from '../mesh';
import type { Vec3 } from '../mesh';
import { JOINT as J, rest, solve, turn } from '../rig';
import { REGION } from '../skin';
import { SIDES, far, mix3, on, ring, smooth } from './common';
import type { Bone, Solved } from './common';
import { COIL, HOOK, HOOKED, LAID, TAIL } from './tail';
import type { Lash } from './tail';

/** The joints the back's points hang on, from the base of the skull to the coccyx (bonesOf()). */
export const BACK = [J.HEAD, J.NECK, J.CHEST, J.CHEST, J.SPINE, J.PELVIS, J.PELVIS];

/**
 * Its spine's points in the world, from the solved skeleton `s` (the user, 2026-11-15: vertebrae
 * linked to one another, from the tail up the back to the head): the back's seven (BACK), from the
 * base of the skull down to the coccyx low over the rear, then the tail's twelve. The tail bends
 * from down and back up to its tip, hooked at the end, sways with the clock `t` (none with `sway`
 * 0) and more with the speed `run` (0 to 1), and takes the pose `lash` (Lash): the arch, the turn
 * most of all toward the tip, the lean toward the tip so it curls back in as it comes down.
 * `fours` (0 to 1) is how far the body is on all fours, its pelvis level: the tail trails behind,
 * as much as it keeps its hook (a strike lifts it out of that).
 */
export const bonesOf = (
  s: Solved,
  t: number,
  run: number,
  lash: Lash = HOOKED,
  sway = 1,
  fours = 0,
): Bone[] => {
  const [sting, side, lean, reach, hook, rise, coil = 0] = lash;
  const laid = fours * hook;
  const [P, q] = [s.pos[J.PELVIS], s.rot[J.PELVIS]];
  const back = (j: number, v: Vec3, r: number): Bone => [
    on(s.pos[j], s.rot[j], v),
    turn(s.rot[j], [0, 0, 1]),
    r,
  ];
  const bones: Bone[] = [
    // As thick as the tail's from the chest down (the user, 2026-11-17: the tail's design up the back).
    // Up the neck to the base of the skull, ending fine (the user, 2026-11-17).
    back(J.HEAD, [0, 0.075, 0.105], 0.007),
    back(J.NECK, [0, 0.07, 0.06], 0.019),
    back(J.CHEST, [0, 0.12, 0.125], 0.03),
    back(J.CHEST, [0, -0.04, 0.132], 0.042),
    back(J.SPINE, [0, 0, 0.114], 0.047),
    back(J.PELVIS, [0, -0.03, 0.124], 0.053),
    // Down to the coccyx, low over the rear (the user, 2026-11-15), where the tail leaves it.
    back(J.PELVIS, [0, -0.12, 0.14], 0.058),
  ];
  // The tail in the pelvis' frame: its angle in the pelvis' plane (0 back, up from there) along it.
  const steps = 12;
  const len = (TAIL.len * (1 + reach)) / steps;
  let p: Vec3 = [0, -0.15, 0.16];
  for (let k = 1; k <= steps; k++) {
    const u = k / steps;
    // On all fours it trails straight back, its end hardly up.
    const lift =
      -0.55 +
      (1.15 * u + 0.25 * run + hook * HOOK * Math.max(0, u - 0.55) ** 1.5) * (1 - 0.65 * laid) +
      rise * (1 - u);
    const a = lift - LAID * laid * (1 - sting) + ((0.3 + 1.1 * u ** 1.3) * Math.PI - lift) * sting;
    const swing =
      sway *
        hook *
        (1 - sting) *
        (0.35 + 0.4 * run) *
        u *
        Math.sin(t * (1.6 + 2.4 * run) - u * 3.5) +
      // Coiled: an S, one way near the root and back the other toward the tip.
      COIL * coil * Math.cos(TAU * u);
    const [c, n] = [Math.cos(side * (0.3 + 0.7 * u)), Math.sin(side * (0.3 + 0.7 * u))];
    // Leaning more toward the tip: a hook, the stinger curling in under the arch.
    const [lc, ls] = [Math.cos(lean * (0.4 + u)), Math.sin(lean * (0.4 + u))];
    const [sx, sy, sz] = [Math.sin(swing), Math.sin(a), Math.cos(a) * Math.cos(swing)];
    const wx = sx * lc + sy * ls;
    const way: Vec3 = [wx * c + sz * n, sy * lc - sx * ls, sz * c - wx * n];
    p = [0, 1, 2].map(i => p[i] + way[i] * len) as Vec3;
    const nx = Math.cos(a) * ls;
    bones.push([
      on(P, q, p),
      turn(q, [nx * c - Math.sin(a) * n, Math.cos(a) * lc, -Math.sin(a) * c - nx * n]),
      TAIL.tip + (TAIL.root - TAIL.tip) * (1 - u) ** 1.3,
    ]);
  }
  return bones;
};

/** A smooth curve through bones (smooth()), from its `skip`th point, and its length up to each. */
export interface Curve {
  dense: Bone[];
  len: number[];
  total: number;
}
export const curveOf = (bones: Bone[], skip = 0): Curve => {
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
export const along = ({ dense, len }: Curve, l: number): [Bone, Vec3, number] => {
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

/**
 * Vertebrae down the whole column, far and nearer, and the rings of one (the user, 2026-11-17: a
 * spine, an alien's): a spool, a rim at each end and a waist between, pinched to a disc at its joints.
 */
export const VERTEBRAE = [14, 34, 34, 34];
export const BEAD = [
  [0.8, 1],
  [0.6, 1, 0.8, 1],
  [0.6, 1, 0.8, 1],
  [0.58, 0.97, 0.84, 0.78, 0.84, 0.97],
];

/**
 * The blade out of the top of each vertebra (the user's picture, 2026-11-17: a comb of thin curved
 * blades down the column): metres high at the skull, at the coccyx and at its highest on the tail,
 * how far along the tail that is and where the blades stop before the stinger; its lean toward the
 * tail's tip at its root and how much more at its point, radians; half its chord as a share of a
 * vertebra's length, half its thickness as a share of the column's radius; rings by level of detail.
 */
export const FIN = {
  skull: 0.012,
  coccyx: 0.13,
  high: 0.16,
  at: 0.22,
  end: 0.84,
  lean: 0.05,
  bend: 0.5,
  chord: 0.4,
  thick: 0.26,
  steps: [0, 2, 3, 4],
};
/** A blade's height `u` of the way down the tail: up from the coccyx's, then down to a nub. */
export const finH = (u: number) =>
  u < FIN.at
    ? FIN.coccyx + (FIN.high - FIN.coccyx) * Math.sin(((u / FIN.at) * Math.PI) / 2)
    : FIN.high * (1 - 0.85 * ((u - FIN.at) / (FIN.end - FIN.at)) ** 1.2);

/** The rings of the last blade fin() made, four spots each (a place then a normal), then its point. */
export const FINS = Array.from({ length: 5 }, () => new Float64Array(24));
/**
 * A blade into FINS, `steps` rings and a point: from `base` out along `up`, `h` high, leaning toward
 * `tan` and bending further that way up to its point; flat, its faces to the unit `x` and -x, its
 * edges sharp, `chord` and `thick` its half chord and half thickness at the root.
 */
export const fin = (
  base: Vec3,
  up: Vec3,
  tan: Vec3,
  x: Vec3,
  h: number,
  chord: number,
  thick: number,
  steps: number,
  lean = FIN.lean,
) => {
  let [cx, cy, cz] = base;
  for (let k = 0; k <= steps; k++) {
    const f = k / steps;
    const a = lean + FIN.bend * f;
    const [cs, sn] = [Math.cos(a), Math.sin(a)];
    const [dx, dy, dz] = [
      up[0] * cs + tan[0] * sn,
      up[1] * cs + tan[1] * sn,
      up[2] * cs + tan[2] * sn,
    ];
    if (k) {
      cx += (dx * h) / steps;
      cy += (dy * h) / steps;
      cz += (dz * h) / steps;
    }
    const R = FINS[k];
    if (k == steps) {
      R[0] = cx;
      R[1] = cy;
      R[2] = cz;
      R[3] = dx;
      R[4] = dy;
      R[5] = dz;
      break;
    }
    // Across the blade in its plane, toward the tail's tip: its trailing edge.
    const [ex, ey, ez] = [
      tan[0] * cs - up[0] * sn,
      tan[1] * cs - up[1] * sn,
      tan[2] * cs - up[2] * sn,
    ];
    const w = chord * (1 - 0.55 * f ** 1.3);
    const t = thick * (1 - 0.6 * f);
    for (let i = 0; i < 4; i++) {
      // Its leading edge, a face, its trailing edge, the other face.
      const [m, n] = i % 2 ? [0, 2 - i] : [i - 1, 0];
      R[i * 6] = cx + ex * m * w + x[0] * n * t;
      R[i * 6 + 1] = cy + ey * m * w + x[1] * n * t;
      R[i * 6 + 2] = cz + ez * m * w + x[2] * n * t;
      R[i * 6 + 3] = ex * m + x[0] * n;
      R[i * 6 + 4] = ey * m + x[1] * n;
      R[i * 6 + 5] = ez * m + x[2] * n;
    }
  }
};

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
export class Bake implements Baked {
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
export interface Back {
  baked: Baked;
  n: number;
  /** The last ring's middle in the pelvis' frame, its way, its radius. */
  c: Vec3;
  tan: Vec3;
  r: number;
}
export const backs: Back[] = [];

/** The pipes' colour: a very dark grey, lighter than the chitin. */
export const PIPE = [0.1, 0.1, 0.105];

/**
 * The back's half of its spine, sunk in the skin, and the pipes up its neck, baked into the skin of
 * `lod` (shape() in skin.ts): they only follow the joints, so the shader poses them with the rest
 * of it. The vertebrae lie at rest as column() spaced them; each point hangs on the joints of the
 * two bones it lies between, the last ring on the pelvis alone, where tail() takes the column on.
 */
export const backOf = (lod: number): Back => (backs[lod] ??= bake(lod));
export const bake = (lod: number): Back => {
  const S = solve(rest());
  const out = new Bake();
  const curve = curveOf(bonesOf(S, 0, 0, [0, 0, 0, 0, 0, 0], 0));
  // The pelvis' bone, where the tail's free part starts.
  const L = curve.len[(BACK.length - 2) * 4];
  // As long as the tail's (the user, 2026-11-17: the same blades up the back), whatever its pose.
  const n = Math.round((VERTEBRAE[lod] * L) / (L + TAIL.len));
  const [sides, shape, side] = [SIDES[2][lod], BEAD[lod], [1, 0, 0] as Vec3];
  // The column on a region of its own: the tail's smooth black, not the skin's plates (render.ts).
  const { BELT: JACKET, STRIPE } = REGION;
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
      // Its blade, a nub under the skull, higher down the back to the tail's.
      const u = (v + 0.5) / n;
      const [b, tan, f] = along(curve, u * L);
      const root = [0, 1, 2].map(i => b[0][i] + b[1][i] * b[2] * 0.5) as Vec3;
      const h = FIN.skull + (FIN.coccyx - FIN.skull) * u;
      const steps = FIN.steps[lod];
      // The whole blade smaller toward the skull, not only lower: the tail's shape, reduced.
      const k = h / FIN.coccyx;
      // Swept down toward the tail as the tail's are toward its tip: there the column's up lags its curve.
      fin(root, b[1], tan, side, h, (k * FIN.chord * L) / n, k * FIN.thick * b[2], steps, 0.6);
      out.sheet(
        FINS.slice(0, steps + 1).map((R, k) =>
          hang(
            Array.from({ length: k < steps ? 4 : 1 }, (_, i): Spot => [
              [R[i * 6], R[i * 6 + 1], R[i * 6 + 2]],
              [R[i * 6 + 3], R[i * 6 + 4], R[i * 6 + 5]],
            ]),
            f,
          ),
        ),
        JACKET,
      );
      // The processes out of its sides, swept down toward the tail, as the tail's.
      for (const k of lod > 1 ? [1, -1] : []) {
        const d = unit(mix3([k, 0, 0], tan, 0.35));
        const at = [0, 1, 2].map(i => b[0][i] + d[i] * b[2] * 0.7) as Vec3;
        const top = [0, 1, 2].map(i => at[i] + d[i] * b[2] * 0.9) as Vec3;
        out.sheet([hang(ring(at, d, b[1], b[2] * 0.35, 3), f), hang([[top, d]], f)], JACKET);
      }
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
export const pipes = (out: Bake, s: Solved, lod: number, region: number) => {
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
      // Wound round the neck (the user, 2026-11-16: pipes that cross), every other one the other
      // way, so each crosses its neighbours; where they cross the one wound forward rides over
      // the other, and both lie on the neck between.
      const wind = i % 2 ? 1 : -1;
      const pts = ctl.map(([j, y, r, z], c): Vec3 => {
        const b = a + 0.1 * Math.sin(c * 1.4 + i * 2.1) + wind * 0.55 * (c - 2);
        const lift = wind > 0 ? 0.006 * Math.sin((Math.PI * c) / 4) : 0;
        return on(s.pos[j], s.rot[j], [
          k * (r + lift) * Math.sin(b),
          y,
          z - (r + lift) * Math.cos(b),
        ]);
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
          ...w.map((p, m) => hang(ring(p, way(m), side, 0.0056 - 0.0018 * (m / last), n), m)),
          hang([[w[last], way(last)]], last),
        ],
        region,
      );
    });
  }
};
