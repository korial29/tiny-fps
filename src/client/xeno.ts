// The xenomorph's own pieces (ROLE.XENO, the user 2026-11-15), round the skin of skin.ts's beast():
// its spine down the back and on into the tail, and its eyeless head under a glossy carapace (its claws are
// hand()'s, body.ts). All
// of it generated, original: a lean biomechanical stalker, not a copy of any film's creature.
import { swingOf } from '../shared/blade';
import { HEAVY_TAP, STING, TAILS } from '../shared/constants';
import { TAU } from '../shared/physics';
import type { PlayerState } from '../shared/types';
import { ease } from './gun';
import { cross, face, pow, sheet } from './helmet';
import type { Spot } from './helmet';
import { CHITIN, GLOSS, SHINE, STRIDE, TUBE, basis, unit } from './mesh';
import type { Vec3 } from './mesh';
import { JOINT as J, rest, solve, turn } from './rig';
import type { Quat } from './rig';
import { CREST_E, CREST_LEN, HEAD_K, HEAD_X, REGION, RIM, bindOf, domeAt } from './skin';
import { room } from './verts';
import type { Floats, Out } from './verts';

/**
 * Its chitin: a near black with a cold sheen, one colour from the skull to the tail: a lighter head
 * drew a collar's line round the neck.
 */
export const CHITIN_X = [0.06, 0.065, 0.078];

/** How far a full charge bends the tail to one side at its root and the other at its tip: an S, radians. */
const COIL = 0.8;
/** How far the tail turns back toward the level when the body is on all fours (fours.ts), radians. */
const LAID = 1.4;
/** Metres: the tail's length, its root's radius and its tip's, the stinger's length, width and thickness. */
export const TAIL = { len: 1.45, root: 0.072, tip: 0.024, sting: 0.3, wide: 0.07, thin: 0.014 };
/** How far the tip of the tail at rest curls up and forward: a hook (the user, 2026-11-16). */
const HOOK = 6;

/**
 * A pose of the tail, as bonesOf() takes it: its arch over the back (0 behind, 1 over the head and
 * forward down into the view), its turn about the pelvis' up (radians, to its left: through its
 * right side, a tail pointing back turns forward), its lean to the right, its reach (as a share of
 * its length, a whip stretched), how much of the hook at its tip it keeps, how far its root
 * rises, how far it coils in an S, how strongly its stinger follows the aim, and how far its tip
 * is drawn onto the foe ahead of the eyes (tail(), the user 2026-11-23: in the own view the strike
 * lands on the crosshair).
 */
export type Lash = readonly [
  sting: number,
  side: number,
  lean: number,
  reach: number,
  hook: number,
  rise: number,
  coil?: number,
  aim?: number,
  pull?: number,
];
/** The share of its lean a charge takes off the tail, to raise it in the own view (Lash's `lean`). */
const CHARGE_LEAN = 0.4;
/** At rest: behind, hooked. */
export const HOOKED: Lash = [0, 0, 0, 0, 1, 0, 0, 0];

/**
 * Where its tail is through a strike (TAILS, by the cut): it goes from HOOKED to the strike's poise
 * in the first third of the wind-up (or most of the way to the strike for a special), so it answers
 * the click at once (the user, 2026-11-16), is driven to its end at the strike, eased in, then
 * comes back. A charge holds it at that poise, drawn in and coiled in an S over a tap of
 * charge, then still but for its breath with the clock `t` (the user, 2026-11-16); let go, it
 * strikes from there. The SPIN turns the tail low once round the body.
 */
export const lashOf = (
  p: Pick<PlayerState, 'cut' | 'swing' | 'heavy' | 'charge' | 'down'>,
  t = 0,
): Lash => {
  const c = p.cut ?? 0;
  const k = TAILS[c];
  // None but the tail's: its claws are those under the specials with no hold.
  if (!p.swing || p.down || k.hold < 0) {
    return HOOKED;
  }
  // A heavy release runs on its own timer from the top of the wind-up.
  const u = p.heavy
    ? (k.hold + (1 - p.swing / swingOf(p, TAILS).ticks) * (k.ticks - k.hold)) / k.ticks
    : 1 - p.swing / k.ticks;
  const [hit, top] = [k.strike / k.ticks, k.hold / k.ticks];
  const back = ease((u - hit) / (1 - hit));
  const mix = (a: Lash, b: Lash, d: number) =>
    (a as readonly number[]).map((v, i) => v + ((b[i] ?? 0) - v) * d) as unknown as Lash;
  const [poise, to] = LASH[c];
  // The stinger points at the foe through the whole strike (the user, 2026-11-23), but the SPIN's,
  // whipped all round: `a` of the way, as the tail comes out of its rest and goes back to it.
  const aimed = (l: Lash, a: number, pull = 0): Lash =>
    c == STING.SPIN ? l : [l[0], l[1], l[2], l[3], l[4], l[5], l[6] ?? 0, a, pull];
  if (p.charge && !p.heavy) {
    // The press starts the charge at the top of the wind-up: the tail comes out of its rest on the
    // charge's own first ticks, as a wind-up's first third would, coiled in its S, and stays at its
    // poise, drawn in by a tap of charge, then still but for its breath (the user, 2026-11-16). It no
    // longer slides from there to another pose: across the view, that read as a first blow before
    // the charge (the user, 2026-11-23). Let go, a tap or a heavy release strikes from there.
    const f = 1 - Math.max(0, 1 - (3 * p.charge) / k.hold) ** 3;
    const [g, s] = [ease(p.charge / HEAVY_TAP), Math.sin(t * 2.4)];
    const [a, b, d, r, h, l] = mix(HOOKED, poise, f);
    // Coiled as it comes in, not after: the S growing at the top swept the tip across the view.
    // Leaning less than its poise, so the lash's tail rises to mid-view at a full charge and not
    // just its stinger (the user, 2026-11-23: it showed in the bottom quarter only).
    const lean = d * (1 - CHARGE_LEAN * f);
    return aimed([a, b + 0.02 * s * f, lean, r - 0.12 * g, h, l + 0.04 * s * f, f], f);
  }
  if (u < top) {
    // In sight within a third of the wind-up, held there to its top.
    const f = 1 - Math.max(0, 1 - (3 * u) / top) ** 3;
    return aimed(mix(HOOKED, poise, f), f);
  }
  // A release from where the charge held it, the heavy one round the shorter way, far out.
  // A heavy one from its charged lean (the tap's cannot be told from a plain strike's here).
  const from: Lash = p.heavy
    ? ([poise[0], poise[1], poise[2] * (1 - CHARGE_LEAN), ...poise.slice(3)] as unknown as Lash)
    : poise;
  if (c == STING.SPIN) {
    return mix([0.3, TAU * ease((u - top) / (1 - top)), 0, 0.2, 0, 0], HOOKED, back);
  }
  const target = p.heavy ? FAR : to;
  const end: Lash = [
    target[0],
    target[1] + TAU * Math.round((from[1] - target[1]) / TAU),
    ...target.slice(2),
  ] as unknown as Lash;
  const go = Math.min((u - top) / (hit - top), 1) ** 2;
  return aimed(mix(mix(from, end, go), HOOKED, back), 1 - back, go * (1 - back));
};

/**
 * By the cut (STING): the pose the tail is poised in, then the one it is driven to. The stab and
 * the sweeps after Aliens versus Predator's first person (the user, 2026-11-16): poised up on its
 * side of the view, in sight from the click (the user, 2026-11-16: it answered late, round the hip),
 * driven into the view, curling in to the middle; the lash and the leap poised over the right
 * shoulder, in the top of the view, down from above.
 */
const THRUST: Lash = [1.08, 0, 0, 0.6, 0, 0, 0, 1];
const DOWN: Lash = [0.9, 0, 0.7, 0.3, 0, 0, 0, 0];
/** A charged release: the thrust, the tail stretched out far (TAIL_FAR, the user 2026-11-23). */
const FAR: Lash = [1.08, 0, 0, 0.9, 0, 0, 0, 1];
const LASH: Record<number, [Lash, Lash]> = {
  [STING.STAB]: [[0, 5, 0, 0.2, 0, 1.2, 0, 0], THRUST],
  [STING.SWEEP_R]: [
    [0, 4.5, 0, 0.2, 0, 1.2],
    [0, 5.6, 0, 0.45, 0, 0.6],
  ],
  [STING.SWEEP_L]: [
    [0, -4.5, 0, 0.2, 0, 1.2],
    [0, -5.6, 0, 0.45, 0, 0.6],
  ],
  [STING.LASH]: [DOWN, THRUST],
  [STING.SPIN]: [[0.3, 0, 0, 0.2, 0, 0], HOOKED],
  [STING.LEAP]: [DOWN, THRUST],
};

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
 * from down and back up to its tip, hooked at the end, sways with the clock `t` (none with `sway`
 * 0) and more with the speed `run` (0 to 1), and takes the pose `lash` (Lash): the arch, the turn
 * most of all toward the tip, the lean toward the tip so it curls back in as it comes down.
 * `fours` (0 to 1) is how far the body is on all fours, its pelvis level: the tail trails behind,
 * as much as it keeps its hook (a strike lifts it out of that).
 */
const bonesOf = (
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

/**
 * Vertebrae down the whole column, far and nearer, and the rings of one (the user, 2026-11-17: a
 * spine, an alien's): a spool, a rim at each end and a waist between, pinched to a disc at its joints.
 */
const VERTEBRAE = [14, 34, 34, 34];
const BEAD = [
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
const finH = (u: number) =>
  u < FIN.at
    ? FIN.coccyx + (FIN.high - FIN.coccyx) * Math.sin(((u / FIN.at) * Math.PI) / 2)
    : FIN.high * (1 - 0.85 * ((u - FIN.at) / (FIN.end - FIN.at)) ** 1.2);

/** The rings of the last blade fin() made, four spots each (a place then a normal), then its point. */
const FINS = Array.from({ length: 5 }, () => new Float64Array(24));
/**
 * A blade into FINS, `steps` rings and a point: from `base` out along `up`, `h` high, leaning toward
 * `tan` and bending further that way up to its point; flat, its faces to the unit `x` and -x, its
 * edges sharp, `chord` and `thick` its half chord and half thickness at the root.
 */
const fin = (
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
 * Its tail, in the world, from the solved skeleton `s`, in the pose `lash` (lashOf()): the column's
 * free part, from the pelvis on (the back's is in the skin, backOf()), thick, each vertebra a spool
 * pinched at its joints (BEAD), with a blade standing out of its top (FIN, fin()) and, close, a
 * process out of each side swept back, but near the tip; its rings follow the curve's own
 * up, so a tail turned round the hip stays round. The stinger at its end: a curved knife's blade
 * (blade()), glowing in the team's `color`. Written straight into `out`. `lod` 0 far, 1 near, 3 close.
 * `fours` (0 to 1): how far the body is on all fours (fours.ts).
 */
export const tail = (
  out: Out,
  s: Solved,
  t: number,
  run: number,
  lash: Lash,
  color: number[],
  lod: number,
  fours = 0,
  look?: Pick<PlayerState, 'yaw' | 'pitch'>,
) => {
  const back = backOf(lod);
  const bones = bonesOf(s, t, run, lash, 1, fours);
  const pull = look ? (lash[8] ?? 0) : 0;
  if (pull > 0 && look) {
    // The strike lands ahead of the eyes, a little under the crosshair, further the more the tail
    // reaches (a charged release's far out): its tip drawn there, more of the pull toward the tip.
    const [rt, vu, f] = basis(look.yaw, look.pitch);
    const eye = s.pos[J.HEAD];
    const D = HIT_AT[0] + HIT_AT[1] * lash[3];
    const tip = bones[bones.length - 1][0];
    const dt = [0, 1, 2].map(i => (eye[i] + f[i] * D - vu[i] * HIT_AT[2] - tip[i]) * pull);
    const n = bones.length - BACK.length;
    for (let k = 1; k <= n; k++) {
      const b = bones[BACK.length + k - 1];
      const w = (k / n) ** 2;
      const at: Vec3 = [b[0][0] + dt[0] * w, b[0][1] + dt[1] * w, b[0][2] + dt[2] * w];
      // Never through the head: a vertebra nearer the eyes than CLEAR goes out to it, to the right.
      const o = [0, 1, 2].map(i => at[i] - eye[i] + rt[i] * 0.1);
      const r = Math.hypot(o[0], o[1], o[2]);
      b[0] = r < CLEAR ? (o.map((v, i) => eye[i] + (v / r) * CLEAR) as Vec3) : at;
    }
  }
  // The stinger at the foe: at the point AIM_AT metres ahead of the eyes, the blade's back up the
  // view, its base lifted so its curve's chord, not its root, points there (blade() bends it down).
  // The tail's last vertebrae curve round till its end runs into the blade: no blade through the
  // tail, and a curve, never a straight run (the user, 2026-11-23).
  const aim = look ? Math.min(lash[7] ?? 0, 1) : 0;
  let stinger: [Vec3, Vec3] | undefined;
  if (look && aim > 0) {
    const [, vu, f] = basis(look.yaw, look.pitch);
    const eye = s.pos[J.HEAD];
    const L = bones.length - 1;
    const tip = bones[L][0];
    const d = unit([0, 1, 2].map(i => eye[i] + f[i] * AIM_AT - tip[i]) as Vec3);
    const dot = vu[0] * d[0] + vu[1] * d[1] + vu[2] * d[2];
    const top = unit(vu.map((v, i) => v - d[i] * dot) as Vec3);
    const [lc, ls] = [Math.cos(AIM_LIFT), Math.sin(AIM_LIFT)];
    const at = d.map((v, i) => v * lc + top[i] * ls) as Vec3;
    // A curve from BEND steps back to the tip that ends along the blade's way: a quadratic
    // Bézier whose control point is behind the tip along it, the tip kept where it was.
    const p0 = bones[L - BEND][0];
    const h = far(p0, tip) / 2;
    for (let j = 1; j < BEND; j++) {
      const [u, b] = [j / BEND, bones[L - BEND + j]];
      b[0] = b[0].map(
        (v, i) =>
          v +
          ((1 - u) ** 2 * p0[i] + 2 * (1 - u) * u * (tip[i] - at[i] * h) + u * u * tip[i] - v) *
            aim,
      ) as Vec3;
    }
    stinger = [at, top];
  }
  // From the spine's bone, whose place shapes the curve's start at the pelvis.
  const curve = curveOf(bones.slice(BACK.length - 3), 4);
  const [P, q] = [s.pos[J.PELVIS], s.rot[J.PELVIS]];
  const { total } = curve;
  const all = VERTEBRAE[lod];
  const n = all - back.n;
  const [sides, shape] = [SIDES[2][lod], BEAD[lod]];
  /** The way across the curve at a point of it, its up crossed with its way on: not unit, ringTo() makes it so. */
  const across = (up: Vec3, tan: Vec3): Vec3 => [
    up[1] * tan[2] - up[2] * tan[1],
    up[2] * tan[0] - up[0] * tan[2],
    up[0] * tan[1] - up[1] * tan[0],
  ];
  // The ring the back's last bead ends on, carried by the pelvis as the skin's is: no crack.
  let na = ringTo(RA, on(P, q, back.c), turn(q, back.tan), turn(q, [1, 0, 0]), back.r, sides);
  for (let v = 0; v < n; v++) {
    for (let j = v ? 0 : 1; j < shape.length; j++) {
      const [b, tan] = along(curve, ((v + j / shape.length) / n) * total);
      const nb = ringTo(RB, b[0], tan, across(b[1], tan), b[2] * shape[j], sides);
      strip(out, RA, na, RB, nb, CHITIN_X, -1);
      [RA, RB, na] = [RB, RA, nb];
    }
    const u = (v + 0.5) / n;
    if (lod && u < FIN.end) {
      const [b, tan] = along(curve, u * total);
      const x = unit(across(b[1], tan));
      // Its blade, sunk in the vertebra's waist.
      const steps = FIN.steps[lod];
      fin(
        [0, 1, 2].map(i => b[0][i] + b[1][i] * b[2] * 0.5) as Vec3,
        b[1],
        tan,
        x,
        finH(u),
        (FIN.chord * total) / n,
        FIN.thick * b[2],
        steps,
      );
      for (let k = 1; k <= steps; k++) {
        strip(out, FINS[k - 1], 4, FINS[k], k < steps ? 4 : 1, CHITIN_X, -1);
      }
      /** A spike out of the bead along `d`, its ring steadied by `ref` (never along `d`). */
      const thorn = (d: Vec3, h: number, at: number, ref: Vec3, sides: number) => {
        const root = [0, 1, 2].map(i => b[0][i] + d[i] * b[2] * at) as Vec3;
        const top = [0, 1, 2].map(i => root[i] + d[i] * h) as Vec3;
        const m = ringTo(RC, root, d, ref, b[2] * 0.35, sides);
        strip(out, RC, m, RD, ringTo(RD, top, d, ref, 0, 1), CHITIN_X, -1);
      };
      // The processes out of its sides, swept back toward the root: three sides are enough.
      for (const k of lod > 1 ? [1, -1] : []) {
        thorn(
          unit(mix3(x.map(e => e * k) as Vec3, tan.map(e => -e) as Vec3, 0.35)),
          b[2] * 0.9,
          0.7,
          b[1],
          3,
        );
      }
    }
  }
  const [[end, up], w] = along(curve, total);
  if (!stinger) {
    blade(out, end, w, up, color, sides, lod);
    return;
  }
  // Along the tail's own end, which now leads into the aim, so the blade grows out of it.
  const [at, top] = stinger;
  const way = aim >= 1 ? at : mix3(w, at, aim);
  blade(
    out,
    end,
    Math.hypot(...way) > 1e-3 ? unit(way) : at,
    aim >= 1 ? top : unit(mix3(up, top, aim)),
    color,
    sides,
    lod,
  );
};

/** Metres ahead of the eyes the stinger points at through a strike: past where it lands, along the crosshair. */
const AIM_AT = 6;
/** Where a strike's tip lands: metres ahead of the eyes, more per share of reach (Lash), and under the crosshair. */
const HIT_AT = [1.1, 1.2, 0.12] as const;
/** Metres the drawn tail keeps from the eyes (tail()). */
const CLEAR = 0.45;
/** Radians the stinger's root turns up from the foe: about half its curve (blade()), so its point meets him. */
const AIM_LIFT = 0.85;
/** The tail's last steps that curve round into an aimed stinger. */
const BEND = 5;

/** The stinger's steel: a cold, dark polish that takes the sky's reflection (SHINE). */
const STING_STEEL = [0.42, 0.44, 0.48];
/** Ring scratch of blade(): four spots a ring, a place then a normal each. */
const [BA, BB] = [new Float64Array(24), new Float64Array(24)];

/**
 * The stinger (the user, 2026-11-16: a curved knife's blade), from the tail's end `at` along `w`,
 * its flat faces to the sides and its back on the tail's `up`: it swells out of a collar to its
 * widest a quarter along, then narrows to its point, curving down under the tail's way, both its
 * back and its edge sharp, thin across. Polished steel (the user, 2026-11-23: a metallic texture),
 * out of a collar glowing in the team's `color`.
 */
const blade = (
  out: Out,
  at: Vec3,
  w: Vec3,
  up: Vec3,
  color: number[],
  sides: number,
  lod: number,
) => {
  const { sting: L, wide, thin, tip } = TAIL;
  // Far, two rings of it and no collar; near, four.
  const steps = [2, 4, 6, 6][lod];
  let way = w;
  let c = at;
  if (lod) {
    ringTo(RA, at, w, up, tip, sides);
    ringTo(RB, at.map((v, i) => v + w[i] * 0.02) as Vec3, w, up, tip * 1.3, sides);
    strip(out, RA, sides, RB, sides, color, -2);
    // Closed over the blade's root, a short cone: open, the sky showed through it, a gap between
    // the tail and the blade (the user, 2026-11-23).
    const shut = ringTo(RA, at.map((v, i) => v + w[i] * 0.05) as Vec3, w, up, 0, 1);
    strip(out, RB, sides, RA, shut, color, -2);
  }
  let na = 0;
  for (let k = 0; k <= steps; k++) {
    const f = k / steps;
    if (k) {
      // Bent down under the tail by a little more each step: a curve, not a corner.
      way = unit(way.map((v, i) => v - up[i] * (1.9 / steps)) as Vec3);
      c = c.map((v, i) => v + way[i] * (L / steps)) as Vec3;
    }
    // Its back's way, across its way, and the way through its faces.
    const b = unit(
      up.map((v, i) => v - way[i] * (up[0] * way[0] + up[1] * way[1] + up[2] * way[2])) as Vec3,
    );
    const x: Vec3 = [
      b[1] * way[2] - b[2] * way[1],
      b[2] * way[0] - b[0] * way[2],
      b[0] * way[1] - b[1] * way[0],
    ];
    const width = wide * (f < 0.25 ? 0.45 + 2.2 * f : (1 - f) / 0.75);
    const t = thin * (1 - f) + 0.002;
    // Its back high on the tail's side, its edge further out under it.
    const R = k % 2 ? BB : BA;
    const spots: [Vec3, number, number][] = [
      [b, width * 0.4, 0],
      [x, t, 0.5],
      [b, -width, 0],
      [x, -t, -0.5],
    ];
    spots.forEach(([d, r, lift], i) => {
      for (let j = 0; j < 3; j++) {
        R[i * 6 + j] = c[j] + d[j] * r + b[j] * lift * width * 0.3;
        R[i * 6 + 3 + j] = d[j] * Math.sign(r);
      }
    });
    if (k) {
      strip(out, k % 2 ? BA : BB, na, R, 4, STING_STEEL, SHINE);
    }
    na = 4;
  }
};

/** Bone: its claws and teeth, nothing else. */
export const BONE = [0.62, 0.6, 0.52];
/** Its claws, hands and feet (the user, 2026-11-17: less white): a dull horn, darker than bone. */
export const CLAW = [0.3, 0.28, 0.24];
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
  /** What steadies its rings: one axis, or one a point (the surface's normal under it). */
  axis: Vec3 | Vec3[] = [1, 0, 0],
) => {
  const w = pts.map(p => on(at, q, p));
  const sides = (Array.isArray(axis[0]) ? (axis as Vec3[]) : [axis as Vec3]).map(a => turn(q, a));
  const side = sides[0];
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
      ...w.map((p, i) => ring(p, way(i), sides[Math.min(i, sides.length - 1)], radii[i], n)),
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
// Long and fine (the user, 2026-11-17: slimmer, more real feet).
const TOES = [
  [-1, 0.125],
  [0, 0.15],
  [1, 0.125],
];
const TOE_W = 0.027;

/**
 * Its foot on a foot joint (the user, 2026-11-15: an arched sole, tendons and toes): a round ankle
 * over the joint, which the shin's end sinks into, then the bone bowing up along its top into an
 * arch, a pad under the heel and one under the ball at its end (FOOT_TIP); three tendons stand out
 * over the instep from the ankle to the toes, where toes() carries them on to the claws. The pose
 * stands it near upright (prowl() in soldier.ts): a third segment to the leg.
 */
/**
 * strand(), its curve rounded (the user, 2026-11-17: the feet less angular): close, three more
 * rings between each two points on a smooth curve through them (smooth()), their radii between.
 */
const rounded =
  (lod: number): typeof strand =>
  (out, at, q, pts, radii, ...rest) => {
    if (lod < 2 || pts.length < 3) {
      return strand(out, at, q, pts, radii, ...rest);
    }
    const fine = smooth(pts, (i, u) => radii[i] + ((radii[i + 1] ?? radii[i]) - radii[i]) * u);
    strand(
      out,
      at,
      q,
      fine.map(([p]) => p),
      fine.map(([, r]) => r),
      ...rest,
    );
  };
export const metatarsal = (out: Out, at: Vec3, q: Quat, lod: number) => {
  const soft = rounded(lod);
  const n = SIDES[2][lod];
  const [x, y, z] = FOOT_TIP;
  /** A point along the foot, k from the ankle (0) to the ball (1), lifted by the arch. */
  const along = (k: number, up = 0, side = 0): Vec3 => [
    x * k + side,
    // A plantar arch (the user, 2026-11-17): the bone bows well up between the heel and the ball.
    // (Past the ball, k over 1, the sine is negative: no power of it.)
    y * k + 0.042 * Math.max(Math.sin(Math.PI * k), 0) ** 0.8 + up,
    z * k,
  ];
  soft(
    out,
    at,
    q,
    [[0, 0.03, 0.03], [0, 0.005, 0.012], along(0.2), along(0.5), along(0.8), along(1)],
    // The ankle's ball just over the shin's end (thicker, it stood round it as a boot's cuff), then
    // the bone thinning evenly to the ball of the foot.
    // Lean (the user, 2026-11-17): a bone's thickness, swelling a little into the ball.
    [0.022, 0.033, 0.027, 0.021, 0.018, 0.022],
    n,
    CHITIN_X,
  );
  // The pads: the heel's behind and under the ankle, the ball's under the foot's end.
  soft(
    out,
    at,
    q,
    [
      [0, -0.012, 0.03],
      [0, -0.03, 0.005],
    ],
    [0.019, 0.012],
    n,
    CHITIN_X,
  );
  soft(out, at, q, [along(0.84, -0.012), along(1.02, -0.015)], [0.015, 0.019], n, CHITIN_X);
  // The cord under the arch, stretched straight from the heel's pad to the ball's: the hollow
  // between it and the bone is the arch.
  soft(
    out,
    at,
    q,
    [
      [0, -0.034, 0.004],
      [x * 0.5, y * 0.5 - 0.01, z * 0.5],
      [x * 0.9, y * 0.9 - 0.02, z * 0.9],
    ],
    [0.006, 0.0045, 0.006],
    SIDES[0][lod],
    SINEW,
  );
  // The ankle's two knobs, one each side of the joint.
  for (const k of [-1, 1]) {
    soft(
      out,
      at,
      q,
      [
        [k * 0.022, 0.012, 0.012],
        [k * 0.027, 0.0, 0.008],
      ],
      [0.011, 0.009],
      SIDES[0][lod],
      CHITIN_X,
      -1,
      true,
      [0, 0, 1],
    );
  }
  if (!lod) {
    return;
  }
  /** How high over the bone's middle its skin is, `side` out from it, where it is `r` thick. */
  const lie = (r: number, side: number) => Math.sqrt(Math.max(r * r - side * side, 0)) + 0.001;
  for (const [t] of TOES) {
    const w = t * 0.011;
    soft(
      out,
      at,
      q,
      [
        [w * 0.3, 0.025, -0.01],
        // On the bone's round, not over its corner: a tendon out at the side lies lower.
        along(0.35, lie(0.023, w * 0.8), w * 0.8),
        along(0.7, lie(0.019, w * 1.4), w * 1.4),
        along(1, lie(0.022, t * TOE_W * 0.4), t * TOE_W * 0.4),
      ],
      [0.004, 0.005, 0.005, 0.0045],
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
  const soft = rounded(lod);
  // Round, not faceted (the user, 2026-11-17).
  const n = SIDES[2][lod];
  for (const [t, l] of [...TOES, [0, -0.05]]) {
    const s = t * TOE_W;
    const d = Math.sign(l);
    const p: Vec3[] = [
      [s * 0.4, 0.004, 0],
      [s * 0.75, 0.013, -l * 0.45],
      [s, 0.009, -l * 0.62],
      [s * 1.15, -0.002, -l],
    ];
    soft(out, at, q, p, [0.016, 0.012, 0.0115, 0.0085], n, CHITIN_X);
    // The knuckle, and the toe's pad under its end; far, the digit and its claw alone.
    if (lod) {
      soft(
        out,
        at,
        q,
        [
          [s * 0.72, 0.016, -l * 0.43],
          [s * 0.78, 0.016, -l * 0.5],
        ],
        [0.0125, 0.0105],
        n,
        CHITIN_X,
      );
      soft(
        out,
        at,
        q,
        [
          [s * 1.1, -0.008, -l * 0.87],
          [s * 1.15, -0.009, -l * 0.97],
        ],
        [0.009, 0.0075],
        n,
        CHITIN_X,
      );
    }
    if (lod && d > 0) {
      soft(
        out,
        at,
        q,
        [
          [s * 0.45, 0.019, -l * 0.05],
          [s * 0.76, 0.027, -l * 0.47],
          [s * 1.12, 0.009, -l * 0.95],
        ],
        [0.0045, 0.004, 0.0035],
        SIDES[0][lod],
        SINEW,
      );
    }
    const [tx, ty, tz] = p[3];
    soft(
      out,
      at,
      q,
      [
        [tx, ty + 0.006, tz + 0.008 * d],
        [tx * 1.03, ty + 0.012, tz - 0.03 * d],
        [tx * 1.07, ty + 0.004, tz - 0.062 * d],
        [tx * 1.1, ty - 0.022, tz - 0.085 * d],
      ],
      [0.0105, 0.008, 0.005, 0],
      n,
      CLAW,
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
  // A striated tube down the front of the shin (the user, 2026-11-16), between its two tendons.
  if (lod) {
    tubed(
      out,
      at,
      q,
      [
        [0, -0.06, -0.048],
        [0, -0.09, -0.056],
        [0, -0.15, -0.052],
        [0, -0.25, -0.046],
        [0, -0.35, -0.039],
        [0, -0.41, -0.03],
      ],
      [0.005, 0.009, 0.0095, 0.009, 0.008, 0.004],
      n,
    );
  }
};

/**
 * Its rib cage on the chest joint, standing out of a starved trunk in a lighter chitin: five pairs of ribs from the
 * spine round to the breastbone, each sloping down toward the front, the lower ones shorter, and
 * the keel of the breastbone down the middle. Each row: the height at the spine, the half width and
 * the half depth of the arch (a hair outside the skin's).
 */
/**
 * A striated tube (TUBE) along `pts` (in the frame of `at` and `q`), `radii` thick: strand()'s,
 * each vertex's red how far along it lies, metres, for the shader's grooves.
 */
const tubed = (
  out: Out,
  at: Vec3,
  q: Quat,
  pts: Vec3[],
  radii: number[],
  n: number,
  axis: Vec3 | Vec3[] = [1, 0, 0],
  /** How bright the shader paints it: its green, 1 its usual grey. */
  shade = 1,
) => {
  const from = out.length;
  strand(out, at, q, pts, radii, n, SINEW, -1, true, axis);
  const w = pts.map(p => on(at, q, p));
  const acc = [0];
  for (let i = 1; i < w.length; i++) {
    acc.push(acc[i - 1] + far(w[i - 1], w[i]));
  }
  const a = room(out, 0);
  // Scalars only: a nearest segment for every vertex, with arrays, was a tenth of a second at load.
  for (let i = from; i < out.length; i += STRIDE) {
    const [px, py, pz] = [a[i], a[i + 1], a[i + 2]];
    let best = Infinity;
    let along = 0;
    for (let k = 1; k < w.length; k++) {
      const s = w[k - 1];
      const e = w[k];
      const dx = e[0] - s[0];
      const dy = e[1] - s[1];
      const dz = e[2] - s[2];
      const l2 = dx * dx + dy * dy + dz * dz || 1;
      const t = Math.min(
        Math.max(((px - s[0]) * dx + (py - s[1]) * dy + (pz - s[2]) * dz) / l2, 0),
        1,
      );
      const m = Math.hypot(px - (s[0] + dx * t), py - (s[1] + dy * t), pz - (s[2] + dz * t));
      if (m < best) {
        best = m;
        along = acc[k - 1] + (acc[k] - acc[k - 1]) * t;
      }
    }
    a[i + 6] = along;
    a[i + 7] = shade;
    a[i + 8] = TUBE;
  }
};

/** The thigh's length, hip to knee, and a point on its skin (a hair off it): `t` of the way down, `a` round from the front toward the outside, `off` proud of it. */
const THIGH = 0.44;
const onThigh = (s: number, t: number, a: number, off: number): Vec3 => {
  const k = (1 - t) ** 2;
  return [
    s * (0.067 + 0.028 * k + off) * Math.sin(a),
    -THIGH * t,
    -(0.086 + 0.034 * k + off) * Math.cos(a),
  ];
};
/**
 * The windows in a thigh (the user's picture, 2026-11-17): [round the thigh from its front, radians,
 * outward; from and to, as shares of its length; the ribbed tube's radius]. One, on the outside of
 * its front (the user, 2026-11-17: only the one on the side).
 */
const WINDOWS = [[0.85, 0.38, 0.92, 0.022]];
/**
 * Windows in a limb (WINDOWS' rows), on its joint: in each a ribbed tube (tubed()) sunk in the limb,
 * swelling to its middle, framed by two bony cords that part round it and meet at its ends. `at(t,
 * a, off)` is a point of the limb's skin, `girth` its radius, for the cords' angle off the tube.
 */
const windows = (
  out: Out,
  at: Vec3,
  q: Quat,
  lod: number,
  rows: number[][],
  skin: (t: number, a: number, off: number) => Vec3,
  girth: number,
  /** The tube's shade (tubed()) and the cords' colour. */
  shade = 1,
  cord = SINEW,
) => {
  if (!lod) {
    return;
  }
  const steps = lod > 1 ? 8 : 5;
  const us = Array.from({ length: steps + 1 }, (_, i) => i / steps);
  const swell = (u: number) => Math.sin(Math.PI * u) ** 0.55;
  for (const [a, t0, t1, r] of rows) {
    tubed(
      out,
      at,
      q,
      us.map(u => skin(t0 + (t1 - t0) * u, a, -0.35 * r)),
      us.map(u => r * (0.25 + 0.75 * swell(u))),
      SIDES[1][lod],
      [1, 0, 0],
      shade,
    );
    for (const k of [-1, 1]) {
      strand(
        out,
        at,
        q,
        us.map(u =>
          skin(t0 - 0.03 + (t1 - t0 + 0.06) * u, a + k * ((r + 0.004) / girth) * swell(u), 0.002),
        ),
        us.map(u => (0.0045 + 0.003 * swell(u)) * Math.min(1, r / 0.02 + 0.3)),
        SIDES[0][lod],
        cord,
      );
    }
  }
};
/** The legs' and hips' details, discreet (the user, 2026-11-17: darker): their tubes' shade and their cords' colour, hardly over the chitin's. */
const DIM = 0.45;
const CORD = CHITIN_X.map(v => v * 1.15);
/**
 * A thigh's open flesh, on the thigh joint of side `s` (-1 left): its window (WINDOWS).
 */
export const thigh = (out: Out, at: Vec3, q: Quat, lod: number, s: number) =>
  windows(out, at, q, lod, WINDOWS, (t, a, off) => onThigh(s, t, a, off), 0.07, DIM, CORD);

/**
 * Its hips, on the pelvis joint (the user's picture, 2026-11-17): each side a ribbed tube down the
 * groin from the hip bone to the crotch, the two a V, a cord along it, and a ribbed tube round the
 * hip's socket from the front over the side to the back. High on the pelvis (the user, 2026-11-17),
 * clear of the thighs as they swing.
 */
export const hips = (out: Out, at: Vec3, q: Quat, lod: number) => {
  if (!lod) {
    return;
  }
  const n = SIDES[1][lod];
  for (const s of [-1, 1]) {
    tubed(
      out,
      at,
      q,
      [
        [s * 0.141, 0.035, -0.075],
        [s * 0.108, 0.0, -0.096],
        [s * 0.07, -0.03, -0.11],
        [s * 0.03, -0.055, -0.112],
      ],
      [0.008, 0.016, 0.015, 0.007],
      n,
      [0, 0, 1],
      DIM,
    );
    strand(
      out,
      at,
      q,
      [
        [s * 0.16, 0.03, -0.066],
        [s * 0.125, -0.012, -0.098],
        [s * 0.08, -0.045, -0.112],
        [s * 0.035, -0.072, -0.112],
      ],
      [0.005, 0.007, 0.007, 0.004],
      SIDES[0][lod],
      CORD,
      -1,
      true,
      [0, 0, 1],
    );
    tubed(
      out,
      at,
      q,
      [
        [s * 0.132, 0.005, -0.09],
        [s * 0.155, -0.005, -0.04],
        [s * 0.162, -0.01, 0.03],
        [s * 0.136, -0.01, 0.09],
      ],
      [0.007, 0.014, 0.014, 0.007],
      n,
      [0, 1, 0],
      DIM,
    );
  }
};

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
    const bone: Vec3[] = [
      [0, 0.17, -0.112],
      [0, 0.13, -0.128],
      [0, 0.09, -0.142],
      [0, 0.045, -0.147],
      [0, 0.005, -0.146],
    ];
    strand(
      out,
      at,
      q,
      // Sunk in the skin (the user, 2026-11-15: more a part of its body), out of it at both ends.
      bone,
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
export const elbow = (out: Out, at: Vec3, q: Quat, lod: number) => {
  spur(out, at, q, [0, -0.02, 0.03], [0, 0.45, 1], 0.12, 0.016, SIDES[1][lod]);
  // A striated tube down the back of the forearm (the user, 2026-11-16), out of the skin under the
  // spur and back into it over the wrist.
  if (lod) {
    tubed(
      out,
      at,
      q,
      [
        [0, -0.05, 0.036],
        [0, -0.08, 0.044],
        [0, -0.12, 0.044],
        [0, -0.16, 0.039],
        [0, -0.2, 0.033],
        [0, -0.22, 0.026],
      ],
      [0.005, 0.0085, 0.009, 0.0085, 0.007, 0.004],
      SIDES[0][lod],
      [1, 0, 0],
      DIM,
    );
  }
};
/**
 * A forearm's window (the user's picture, 2026-11-17: only on the forearm's visible face), on the
 * forearm joint of side `s` (1 the right): one down its outside, elbow to wrist, 26 cm, a little
 * sunk in the skin's rough shape so no gap shows (a little clipping is fine).
 */
export const forearm = (out: Out, at: Vec3, q: Quat, lod: number, s: number) =>
  windows(
    out,
    at,
    q,
    lod,
    [[-0.7, 0.14, 0.86, 0.014]],
    (t, a, off) => [
      s * (0.032 - 0.009 * t + off) * Math.cos(a),
      -0.26 * t,
      (0.036 - 0.009 * t + off) * Math.sin(a),
    ],
    0.034,
    DIM,
    CORD,
  );
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
  // At or under the last point, the last segment: the first one gave the chin's lowest row the
  // forehead's depth, a spike under it.
  const i = pts.findIndex(p => p[0] < y);
  const k = Math.min(Math.max(i < 0 ? pts.length - 1 : i, 1), pts.length - 1);
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
  // Under the carapace's edge the face falls straight, a little back: no muzzle (the user,
  // 2026-11-24: the mouth must not stand out as a beak), the cheeks full down to the chin.
  [-0.012, 0.106],
  [-0.026, 0.1],
  [-0.06, 0.098],
  [-0.08, 0.085],
  // Its underside rounding back: the face's lowest point, where its grid closes, no spike.
  [-0.095, 0.045],
];
/** How deep the throat is behind the mouth, by height, as DEPTH: under the upper jaw's edge (GUM). */
const THROAT = [
  [-0.026, 0.1],
  [-0.034, 0.052],
  [-0.084, 0.045],
  [-0.095, 0.03],
];
/**
 * Its carapace (the user, 2026-11-24: no eyes; the whole top of the head from their line up smooth,
 * black and glossy): its colour, the height on the face it ends at, and how far its edge stands
 * out of the face under it, metres.
 */
export const SHELL = [0.012, 0.012, 0.016];
const LIP = 0.004;
/**
 * The carapace's edge (the user, 2026-11-24: the top of the skull closes over the lower part along
 * a curve): on the face low over the upper jaw across the mouth (EDGE[0]), rising beside it to
 * EDGE[1] at the face's rim; then along the dome, as a share of each section's half height from
 * its middle, on up to EDGE[2] over RISE metres, and level from there. A rolled rim runs along it
 * (rim()), ROLL thick.
 */
const EDGE = [-0.021, -0.004, 0.1];
const [RISE, ROLL] = [0.16, 0.0048];
/** The height of the upper jaw's edge on the face, the throat under it (its jaws, further down). */
const GUM = -0.026;
/** Its head's chitin: the dome's (the skin's TRIM, soldier.ts) and its face's, the body's own. */
export const HEAD = CHITIN_X;
const [DARK, TEETH] = [
  [0.02, 0.02, 0.025],
  // Steel bright (the user, 2026-11-16: metal teeth).
  [0.66, 0.68, 0.72],
];
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
/**
 * The vertices written to `o` from `from` on, made HEAD_K larger about `at` and HEAD_X narrower
 * across the head (`q` its turn); the normals squeezed back.
 */
const grow = (o: Out, from: number, at: Vec3, q: Quat) => {
  const a = room(o, 0);
  const [qx, qy, qz, qw] = q;
  // turn() by q (s 1) or its inverse (s -1), written out: four a vertex over the head's tens of
  // thousands allocated most of the map's load.
  let [X, Y, Z] = [0, 0, 0];
  const rot = (s: number, x: number, y: number, z: number) => {
    const [ux, uy, uz] = [s * qx, s * qy, s * qz];
    const tx = 2 * (uy * z - uz * y);
    const ty = 2 * (uz * x - ux * z);
    const tz = 2 * (ux * y - uy * x);
    X = x + qw * tx + uy * tz - uz * ty;
    Y = y + qw * ty + uz * tx - ux * tz;
    Z = z + qw * tz + ux * ty - uy * tx;
  };
  for (let i = from; i < o.length; i += STRIDE) {
    rot(-1, a[i] - at[0], a[i + 1] - at[1], a[i + 2] - at[2]);
    rot(1, X * HEAD_K * HEAD_X, Y * HEAD_K, Z * HEAD_K);
    a[i] = at[0] + X;
    a[i + 1] = at[1] + Y;
    a[i + 2] = at[2] + Z;
    rot(-1, a[i + 3], a[i + 4], a[i + 5]);
    const mx = X / HEAD_X;
    const l = Math.hypot(mx, Y, Z) || 1;
    rot(1, mx / l, Y / l, Z / l);
    a[i + 3] = X;
    a[i + 4] = Y;
    a[i + 5] = Z;
  }
};
// A lower, flatter forehead (the user, 2026-11-15: too conical), the chin where it was.
// Lower again (the user, 2026-11-24: an egg seen from the front): 1 cm off its top, and the
// section squarer than an ellipse, as the dome's (CREST_E).
const [EY, EA, EB, EC] = [0, 0.084, 0.095, 0.105];
/** How far out of the head's section (x, y) is, 1 on its rim. */
const reach = (x: number, y: number) =>
  (Math.abs(x / EA) ** CREST_E + Math.abs((y - EY) / EB) ** CREST_E) ** (1 / CREST_E);
/** The point at `a` radians from the top round a section of half width 1 and half height 1, and the way out of it there (to scale by the other half size each). */
const round = (a: number) => {
  const p = [Math.sin(a), Math.cos(a)].map(v => Math.sign(v) * Math.abs(v) ** (2 / CREST_E));
  return [...p, ...p.map(v => Math.sign(v) * Math.abs(v) ** (CREST_E - 1))];
};
/** How much of the forehead's sphere the face is at height y: none under the orbits, all over them. */
const brow = (y: number) => {
  // From under the carapace's edge: over it the head is the one smooth ellipsoid, no crease.
  const t = Math.min(Math.max((y + 0.034) / 0.03, 0), 1);
  return t * t * (3 - 2 * t);
};
/** The top of the face, and its half width at height y. */
const TOP = EY + EB;
/** The bottom of the chin (the user, 2026-11-15: a short one). */
const CHIN = EY - EB;
const widthOf = (y: number) =>
  EA * Math.max(0, 1 - Math.abs((y - EY) / EB) ** CREST_E) ** (1 / CREST_E);
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
 * The grid's rows and columns, near and close: the rows packed toward the top, the columns a
 * little off the middle each side.
 */
const [ROWS, COLS] = [
  [2.2, 4].map(k =>
    // Packed toward the top, where the ellipsoid turns level: evenly spaced, its first row lay
    // 3 cm ahead of the dome's edge, a flat facet the carapace's gloss showed.
    // And round the upper jaw's edge, where it drops into the throat.
    warp(
      t =>
        1 +
        (0.25 * k) / Math.sqrt(t + 0.003) +
        k * Math.exp(-(((TOP - (TOP - CHIN) * t - GUM + 0.004) / 0.008) ** 2)),
    ),
  ),
  [1.6, 2.6].map(k => warp(t => 1 + k * Math.exp(-(((Math.abs(2 * t - 1) - 0.38) / 0.26) ** 2)))),
];
/** The height of the grid's row `v` (0 the top, 1 the chin), on the close grid if `fine`. */
const rowY = (v: number, fine: boolean) => TOP - (TOP - CHIN) * ROWS[+fine](v);
/** The grid's column `u` (-1 to 1, evenly spaced) moved to pack over the orbits, on the close grid if `fine`. */
const colU = (u: number, fine: boolean) => -1 + 2 * COLS[+fine]((u + 1) / 2);
/** The face's surface at (x, y): an ellipse's front under the carapace's ellipsoid, the cheekbones out, the throat under the upper jaw. */
const faceZ = (x: number, y: number) => {
  const u = Math.min(Math.abs(x) / Math.max(widthOf(y), 1e-6), 1);
  // The mouth: between the cheeks, under the upper jaw's edge, the face falls back to the throat.
  const mouth =
    (1 - ease((Math.abs(x) - 0.036) / 0.012)) *
    ease((GUM - y) / 0.007) *
    (1 - ease((-0.1 - y) / 0.01));
  const d = curve(DEPTH, y);
  // The cheeks beside the mouth cut back under the carapace (the user, 2026-11-24: smaller
  // cheeks): past the mouth's corners the face falls back toward the dome's edge, the jaws a
  // narrow block under the wider dome.
  const cheek = 1 - 0.75 * ease((Math.abs(x) - 0.038) / 0.02) * ease((-0.012 - y) / 0.012);
  const low = -(d + (curve(THROAT, y) - d) * mouth) * Math.sqrt(1 - u * u) * cheek;
  const dome = -EC * Math.sqrt(Math.max(0, 1 - reach(x, y) ** 2));
  return (
    low +
    (dome - low) * brow(y) -
    // The cheekbones, low (the user, 2026-11-16: too wide).
    0.004 * Math.exp(-(((Math.abs(x) - 0.054) / 0.011) ** 2) - ((y + 0.008) / 0.011) ** 2)
  );
};
/** How much of the dome's rim the face takes at (x, y): none inside, all at its edge. */
const rimOf = (x: number, y: number) => Math.min(Math.max((reach(x, y) - 0.62) / 0.38, 0), 1) ** 2;
/**
 * The face as skull() draws it at (x, y): faceZ, its rim tucked a hair under the dome's front ring.
 * What lies on the face follows this.
 */
const faceAt = (x: number, y: number): Vec3 => {
  const w = rimOf(x, y);
  const g = 1 + 0.01 * w;
  return [x * g, EY + (y - EY) * g, faceZ(x, y) + 0.004 * w];
};
/**
 * Its jaws (the user, 2026-11-24: the gaping jaws of the reference picture, no tongue). The upper
 * one is the face's edge at GUM, the throat falling back under it. The lower one is a piece of its
 * own (jaw()), a U hung open GAPE radians from HINGE (the right one) each side: its rami run
 * forward to an arc ARC[0] wide and ARC[1] deep round the point ARC[2] ahead, in a plane through
 * the hinges.
 */
const HINGE: Vec3 = [0.05, -0.036, -0.02];
// Shut (the user, 2026-11-24: its mouth closed): the mandible's lip a tooth's length under the
// upper jaw's edge, the teeth clenched between them. It was 0.8, gaping, FLOOR 3 cm lower with it.
const GAPE = 0.42;
// A narrow mouth (the user, 2026-11-24). Its front flush with the face over it: 1 cm further back,
// as it hung open, the shut mandible sat behind the upper jaw (the user, 2026-11-24).
const ARC = [0.034, 0.034, -0.055];
/** The height of the mandible's underside, under the chin and at the hinges. */
const FLOOR = [-0.091, -0.081];
/** The jaw's plane: the way its teeth point, and its height `z` ahead. */
const JAW_UP: Vec3 = [0, Math.cos(GAPE), -Math.sin(GAPE)];
const jawY = (z: number) => HINGE[1] - (HINGE[2] - z) * Math.tan(GAPE);
/** The middle of the right ramus `t` of the way from the hinge to the arc, and of the arc at `a` radians from its front (positive to the right). */
const ramusAt = (t: number, s = 1): Vec3 => {
  const z = HINGE[2] + (ARC[2] - HINGE[2]) * t;
  return [s * (HINGE[0] + (ARC[0] - HINGE[0]) * (1 - (1 - t) ** 2)), jawY(z), z];
};
const arcAt = (a: number): Vec3 => {
  const z = ARC[2] - ARC[1] * Math.cos(a);
  return [ARC[0] * Math.sin(a), jawY(z), z];
};
/** The mandible's half height where it is `x` out from the middle: deepest at the chin. */
const jawH = (x: number) => 0.011 + 0.008 * Math.exp(-((x / 0.027) ** 2));

/**
 * Its face, eyeless: over EDGE the front of its glossy carapace, one smooth ellipsoid with the
 * dome; under it its chitin, the cheekbones, no nose, the mouth wide open, an opening whose edge
 * the lips hide, dark inside, with steel teeth, the fangs longest. A grid over the face, finer the
 * closer.
 */
export const skull = (out: Out, head: Vec3, q: Quat, lod: number) => {
  const at = on(head, q, [0, HEAD_UP, 0]);
  const [nx, ny] = [
    [8, 10],
    [22, 38],
    [22, 38],
    [50, 72],
  ][lod];
  // The row the carapace ends on: the nearest to its edge across the mouth.
  let je = 0;
  for (let j = 1; j <= ny; j++) {
    const d = (k: number) => Math.abs(rowY(k / ny, lod > 2) - EDGE[0]);
    je = d(j) < d(je) ? j : je;
  }
  const ye = rowY(je / ny, lod > 2);
  /**
   * Where the grid's node (u, v) is on the face: its rows bent up beside the mouth, most the
   * edge's, which follows the carapace's curve up to the rim, none the top's and the chin's.
   */
  const xy = (u: number, v: number): [number, number] => {
    const y0 = rowY(v, lod > 2);
    const c = colU(u, lod > 2);
    const w0 = widthOf(y0);
    const t = w0 > 0.031 ? (Math.abs(c) * w0 - 0.03) / (w0 - 0.03) : 1;
    const bend = y0 > ye ? (TOP - y0) / (TOP - ye) : (y0 - CHIN) / (ye - CHIN);
    const y = y0 + (EDGE[1] - EDGE[0]) * ease(t) * bend;
    return [c * widthOf(y), y];
  };
  const spot = (u: number, v: number, shell = false): Spot => {
    const [x, y] = xy(u, v);
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
    // The dome's own normal on its front ring, with the slope of its first strip (RIM): straight
    // out of the ellipse, it was 4 degrees off the dome's on top, a reflection cut at the join.
    const [sn, cs] = [x / EA, (y - EY) / EB];
    const [gs, gc] = [sn, cs].map(v => Math.sign(v) * Math.abs(v) ** (CREST_E - 1));
    const rim = unit([
      EB * gs,
      EA * gc,
      -(EA * gc * (RIM[0] + RIM[2] * cs) + EB * RIM[1] * Math.abs(sn) ** CREST_E),
    ]);
    const w = rimOf(x, y);
    const n = unit([0, 1, 2].map(i => m[i] * (1 - w) + rim[i] * w) as Vec3);
    // The rim tucked a hair under the dome's front ring: no crack where their vertices differ.
    const p = faceAt(x, y);
    // The carapace stands a little proud of the face, but at the rim, where it goes a hair under
    // the dome's front ring: over it, as the chitin does, its edge was a ridge in the gloss.
    const k = (1 - 0.006 * w) / (1 + 0.01 * w);
    return [
      on(at, q, shell ? [p[0] * k, EY + (p[1] - EY) * k, p[2] - LIP * (1 - w)] : p),
      turn(q, n),
    ];
  };
  // Each node of the grid worked out once: it is the corner of six triangles. The carapace's rows
  // down to its edge, then the face's from there: the edge's row twice, a step between them.
  const [nodes, over]: Spot[][] = [[], []];
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      const [u, v] = [(2 * i) / nx - 1, j / ny];
      nodes.push(spot(u, v, j < je));
      if (j == je) {
        over.push(spot(u, v, true));
      }
    }
  }
  /** The grid's node in column i, row j; `up`, the carapace's on the edge's row. */
  const node = (i: number, j: number, up = false) =>
    up && j == je ? over[i] : nodes[j * (nx + 1) + i];
  // Under the upper jaw the throat, dark in its middle, behind the mandible.
  const tri = (p: [number, number][], s: Spot[]) => {
    const [u, v] = [0, 1].map(k => (p[0][k] + p[1][k] + p[2][k]) / 3);
    const [x, y] = xy(u, v);
    const deep = y < GUM - 0.008 && Math.abs(x) < 0.039;
    face(out, v < je / ny ? SHELL : deep ? DARK : HEAD, v < je / ny ? GLOSS : -1, s);
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
        [node(i, j), node(i + 1, j), node(i + 1, j + 1, j < je)],
      );
      tri(
        [
          [u0, v0],
          [u1, v1],
          [u0, v1],
        ],
        [node(i, j), node(i + 1, j + 1, j < je), node(i, j + 1, j < je)],
      );
    }
  }
  // The underside of the carapace's edge, down to the face.
  const under = turn(q, unit([0, -1, -0.4]));
  for (let i = 0; i < nx; i++) {
    const [a, b, c, d] = [over[i], over[i + 1], node(i + 1, je), node(i, je)].map(([p]): Spot => [
      p,
      under,
    ]);
    face(out, SHELL, GLOSS, [a, b, c]);
    face(out, SHELL, GLOSS, [a, c, d]);
  }
  if (!lod) {
    return;
  }
  // The carapace's rolled rim, one piece: up one side of the dome from near its tip, across the
  // face over the step, and back down the other side, thinning out toward the tip.
  const rest = bindOf(0)[J.HEAD];
  const [n, k, len] = [lod > 2 ? 32 : 16, lod > 2 ? 28 : 14, CREST_LEN * 0.86];
  const side = (s: number) =>
    Array.from({ length: k }, (_, i): [Vec3, number] => {
      const z = (len * (i + 1)) / k;
      const [c, w, h] = domeAt(z);
      const [sn, cs, gs, gc] = round(s * edgeAt(z));
      const m = unit([gs / w, gc / h, 0]);
      return [
        [w * sn + m[0] * 0.0015, c + h * cs + m[1] * 0.0015 - rest[1], z],
        ROLL * (1 - (z / len) ** 3) + 0.0004,
      ];
    });
  const across = Array.from({ length: n + 1 }, (_, i): [Vec3, number] => {
    const [x, y] = xy((2 * i) / n - 1, je / ny);
    const p = faceAt(x, y);
    return [[p[0], p[1] + HEAD_UP, p[2] - LIP * (1 - rimOf(x, y))], ROLL];
  });
  const roll = [...side(-1).reverse(), ...across, ...side(1)];
  strand(
    out,
    head,
    q,
    roll.map(([p]) => p),
    roll.map(([, r]) => r),
    SIDES[0][lod],
    SHELL,
    GLOSS,
    true,
    [0, 1, 0],
  );
};

/**
 * Its lower jaw (HINGE, ARC), on the head joint: a bone taller than wide round the U, deepest at
 * the chin, its ends buried in the throat behind the cheeks.
 */
export const jaw = (out: Out, head: Vec3, q: Quat, lod: number) => {
  const at = on(head, q, [0, HEAD_UP, 0]);
  const [nr, na, n] = [
    [1, 4, 4],
    [2, 8, 6],
    [2, 8, 6],
    [4, 16, 10],
  ][lod];
  const pts: Vec3[] = [
    ...Array.from({ length: nr }, (_, i) => ramusAt(i / nr)),
    ...Array.from({ length: na + 1 }, (_, i) => arcAt(Math.PI / 2 - (Math.PI * i) / na)),
    ...Array.from({ length: nr }, (_, i) => ramusAt(1 - (i + 1) / nr, -1)),
  ];
  const last = pts.length - 1;
  const rings = pts.map((p, i): Spot[] => {
    const [a, b] = [pts[Math.max(i - 1, 0)], pts[Math.min(i + 1, last)]];
    const t = unit([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
    const side = unit(cross(t, JAW_UP));
    const [w, h] = [0.008 + 0.005 * Math.exp(-((p[0] / 0.03) ** 2)), jawH(p[0])];
    // Its underside does not climb to the hinge with the jaw's own slope (the user, 2026-11-24:
    // fuller, filling the space toward the head): each section reaches down to a line nearly
    // level from under the chin to the jaw's angle, under the cheek.
    const front = ARC[2] - ARC[1];
    const floor = FLOOR[0] + ((FLOOR[1] - FLOOR[0]) * (p[2] - front)) / (HINGE[2] - front);
    const down: Vec3 = [0, Math.max(0, p[1] - JAW_UP[1] * h - floor), 0];
    return Array.from({ length: n }, (_, k): Spot => {
      const [c, s] = [Math.cos((k / n) * TAU), Math.sin((k / n) * TAU)];
      const v = JAW_UP.map((u, j) => u * h + (s < 0 ? down[j] : 0));
      const l = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
      return [
        on(at, q, [0, 1, 2].map(j => p[j] + side[j] * w * c + v[j] * s) as Vec3),
        turn(q, unit([0, 1, 2].map(j => (side[j] * c) / w + (v[j] * s) / l) as Vec3)),
      ];
    });
  });
  const back = turn(q, [0, 0, 1]);
  sheet([[[on(at, q, pts[0]), back]], ...rings, [[on(at, q, pts[last]), back]]], HEAD, -1, out);
};

/**
 * The chitin under its carapace (the user, 2026-11-24: glossy black from the eyes' line up), on the
 * head joint: the underside of the dome, the arc of its sections under the carapace's edge (edgeAt()) set BELLY metres out of it, its two edges turned in under the
 * carapace. At the face's edge it is no further out than the face's rim, which covers it.
 */
const BELLY = 0.003;
/** The angle of the carapace's edge round the dome's section `z` behind the face, from its top (EDGE). */
const edgeAt = (z: number) => {
  const v = (EDGE[1] - EY) / EB + (EDGE[2] - (EDGE[1] - EY) / EB) * ease(z / RISE);
  return Math.acos(Math.sign(v) * Math.abs(v) ** (CREST_E / 2));
};
export const belly = (out: Out, head: Vec3, q: Quat, lod: number) => {
  const rest = bindOf(0)[J.HEAD];
  const [K, N] = [
    [6, 5],
    [12, 10],
    [12, 10],
    [24, 18],
  ][lod];
  /** The angle of the carapace's edge round a section, from its top. */
  const rows = Array.from({ length: K + 1 }, (_, k) => {
    // Closer together toward the tip, as the dome's own rings.
    const z = CREST_LEN * Math.sin(((k / K) * Math.PI) / 2);
    const [c, w, h] = domeAt(z);
    const a0 = edgeAt(z);
    const e = Math.min(z / 0.04, 1);
    const g = BELLY * (0.35 + 0.65 * e * e * (3 - 2 * e));
    return Array.from({ length: N + 3 }, (_, i): Spot => {
      // From the edge on one side, under, to the other; before and after, turned in.
      const inn = i == 0 || i == N + 2;
      const t = Math.min(Math.max((i - 1) / N, 0), 1);
      const a = a0 + (2 * Math.PI - 2 * a0) * t + (i ? (inn ? 0.1 : 0) : -0.1);
      const [sn, cs, gs, gc] = round(a);
      const m = unit([gs / Math.max(w, 1e-4), gc / Math.max(h, 1e-4), 0]);
      const off = w ? (inn ? -g : g) : 0;
      return [on(head, q, [w * sn + m[0] * off, c + h * cs + m[1] * off - rest[1], z]), turn(q, m)];
    });
  });
  for (let k = 0; k < K; k++) {
    for (let i = 0; i < N + 2; i++) {
      const [a, b, c, d] = [rows[k][i], rows[k][i + 1], rows[k + 1][i + 1], rows[k + 1][i]];
      face(out, HEAD, -1, [a, b, c]);
      face(out, HEAD, -1, [a, c, d]);
    }
  }
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
  const fang = (x: number) => Math.exp(-(((Math.abs(x) - 0.021) / 0.005) ** 2));
  const tooth = (root: Vec3, way: Vec3, len: number, r: number) =>
    strand(
      out,
      at,
      q,
      [0, 0.5, 1].map(t => root.map((v, i) => v + way[i] * len * t) as Vec3),
      [r, r * 0.72, 0.0003],
      sides,
      TEETH,
      -1,
      false,
    );
  /**
   * A human incisor (the user, 2026-11-25), in steel like the rest: a blade from `root` along `way`,
   * `len` long, `w` wide along `across` near its cutting edge and narrower at its root, thin front
   * to back and thinner still at the edge, a chisel. Its section a rounded rectangle (a
   * superellipse) and its edge's corners rounded off, so it reads as a tooth, not a box (the user,
   * 2026-11-25: less square). Its root's end unseen.
   */
  const incisor = (root: Vec3, way: Vec3, across: Vec3, len: number, w: number) => {
    const fore = unit(cross(across, way));
    const t = 0.0026;
    const n = lod > 2 ? 12 : 8;
    // Down the tooth: how far along it, the half width (of w) and half thickness (of t) there.
    const rows = [
      [0, 0.36, 0.5],
      [0.72, 0.5, 0.32],
      [0.92, 0.46, 0.22],
      [1, 0.3, 0.12],
    ];
    const at3 = (v: Vec3) => on(at, q, v);
    const ring = rows.map(([k, hw, ht]) =>
      Array.from({ length: n }, (_, i): Spot => {
        const [c, s] = [Math.cos((TAU * i) / n), Math.sin((TAU * i) / n)];
        const [a, b] = [pow(c, 0.5) * hw * w, pow(s, 0.5) * ht * t];
        const m = unit(
          [0, 1, 2].map(
            j => (across[j] * pow(c, 1.5)) / hw / w + (fore[j] * pow(s, 1.5)) / ht / t,
          ) as Vec3,
        );
        return [
          at3([0, 1, 2].map(j => root[j] + way[j] * len * k + across[j] * a + fore[j] * b) as Vec3),
          turn(q, m),
        ];
      }),
    );
    for (let r = 0; r + 1 < ring.length; r++) {
      for (let i = 0; i < n; i++) {
        const [a, b, c, d] = [
          ring[r][i],
          ring[r][(i + 1) % n],
          ring[r + 1][(i + 1) % n],
          ring[r + 1][i],
        ];
        face(out, TEETH, -1, [a, b, c]);
        face(out, TEETH, -1, [a, c, d]);
      }
    }
    // The cutting edge, a fan over the last ring.
    const tip: Spot = [
      at3([0, 1, 2].map(j => root[j] + way[j] * len * 1.01) as Vec3),
      turn(q, way),
    ];
    const last = ring[ring.length - 1];
    for (let i = 0; i < n; i++) {
      face(out, TEETH, -1, [tip, last[(i + 1) % n], last[i]]);
    }
  };
  /** The upper jaw's edge at x, a hair inside the face. */
  const gum = (x: number, r: number): Vec3 => [x, GUM + 0.003, faceZ(x, GUM + 0.004) + r];
  // The upper teeth, steel (the user, 2026-11-16), long cones hung from the upper jaw's edge round
  // its arc, the fangs longest, a little forward at their tips.
  // Close together (the user, 2026-11-24): each against the next. The middle three gave way to four
  // human incisors (the user, 2026-11-25), the two central ones widest, either side of the middle.
  for (let i = 0; i < 11; i++) {
    const x = -0.036 + (0.072 * i) / 10;
    if (Math.abs(x) < 0.012) {
      continue;
    }
    const r = 0.0036 + 0.0006 * fang(x);
    tooth(gum(x, r), [0, -1, -0.12], (0.015 + 0.005 * fang(x)) * (1 - 40 * x * x), r);
  }
  for (const [x, w, len] of [
    [0.0036, 0.0068, 0.0125],
    [0.0104, 0.0056, 0.0112],
  ]) {
    for (const s of [-1, 1]) {
      const e = 0.002;
      const across = unit([
        1,
        0,
        (s * (faceZ(s * x + e, GUM + 0.004) - faceZ(s * x - e, GUM + 0.004))) / (2 * e),
      ]);
      incisor(gum(s * x, 0.0018), unit([0, -1, -0.08]), across, len, w);
    }
  }
  // The lower ones, up out of the mandible round its arc; the front four human incisors, narrower
  // than the upper ones (the user, 2026-11-25).
  for (let i = 0; i < 12; i++) {
    const a = -1.3 + (2.6 * i) / 11;
    const p = arcAt(a);
    const h = jawH(p[0]) - 0.002;
    const base = p.map((v, j) => v + JAW_UP[j] * h) as Vec3;
    // Less forward than the jaw hangs: square to it, they pointed out of the mouth.
    const way = unit([0, JAW_UP[1] + 0.7, JAW_UP[2]]);
    if (Math.abs(a) < 0.4) {
      const across = unit([ARC[0] * Math.cos(a), 0, ARC[1] * Math.sin(a)]);
      incisor(base, way, across, 0.0138, Math.abs(a) < 0.2 ? 0.0068 : 0.0066);
      continue;
    }
    const r = 0.0034 + 0.0006 * fang(p[0]);
    tooth(base, way, (0.0165 + 0.004 * fang(p[0])) * (1 - 36 * p[0] * p[0]), r);
  }
  // Its upper gum, a band of sinew along the jaw's edge over the roots of the teeth.
  const band = Array.from({ length: 17 }, (_, i) => -0.046 + (0.092 * i) / 16);
  strand(
    out,
    at,
    q,
    // Half sunk in the face: proud of it, it read as a rod laid along the jaw.
    band.map(x => gum(x, 0.0016)),
    band.map(x => 0.0034 - 0.0016 * (x / 0.046) ** 2),
    SIDES[0][lod],
    SINEW,
    -1,
    true,
    [0, 0, 1],
  );
  // Its lower lip, thin, round the mandible's upper outer edge.
  const lip = Array.from({ length: 17 }, (_, i) => arcAt(-1.45 + (2.9 * i) / 16));
  strand(
    out,
    at,
    q,
    lip.map(p => {
      const o = unit([p[0], 0, (p[2] - ARC[2]) * (ARC[0] / ARC[1]) ** 2]);
      const h = jawH(p[0]) - 0.0015;
      return p.map((v, j) => v + JAW_UP[j] * h + o[j] * 0.004) as Vec3;
    }),
    lip.map(p => 0.003 - 0.001 * (p[0] / ARC[0]) ** 2),
    SIDES[0][lod],
    SINEW,
    -1,
    true,
    [0, 1, 0],
  );
  // Tendons across the open cheek (the user, 2026-11-16: a head with more biomechanical detail;
  // 2026-11-24: stretched from the upper jaw to the lower one, the gap showing between them):
  // each side two, thick at their ends, bowed out a little.
  for (const s of [-1, 1]) {
    for (const [x, t, r0] of [
      [0.042, 0.85, 0.004],
      [0.05, 0.5, 0.0034],
    ]) {
      // Its upper end buried in the jaw: on the face, its round end was a knob there.
      const a: Vec3 = [s * x, GUM + 0.006, faceZ(x, GUM + 0.006) + r0 + 0.002];
      const m = ramusAt(t, s);
      const b = m.map((v, j) => v + JAW_UP[j] * (jawH(m[0]) - 0.003)) as Vec3;
      const [pts, radii]: [Vec3[], number[]] = [[], []];
      for (let j = 0; j <= 8; j++) {
        const k = j / 8;
        const bow = Math.sin(Math.PI * k);
        pts.push([
          a[0] + (b[0] - a[0]) * k + s * 0.004 * bow,
          a[1] + (b[1] - a[1]) * k,
          a[2] + (b[2] - a[2]) * k,
        ]);
        radii.push(r0 * (1 - 0.45 * bow));
      }
      strand(out, at, q, pts, radii, SIDES[0][lod], SINEW, -1, true, [0, 0, 1]);
    }
  }
};

/**
 * Striated tubes blended into the sides of its dome (the user, 2026-11-16), on the head joint: two
 * each side running back from behind the face along the banana's lower flank, half sunk in it and
 * sinking wholly at both ends.
 */
export const hoses = (out: Out, head: Vec3, q: Quat, lod: number) => {
  if (!lod) {
    return;
  }
  const rest = bindOf(0)[J.HEAD];
  const n = SIDES[0][lod];
  for (const s of [-1, 1]) {
    for (const [a0, a1, z0, z1, r0] of [
      [2.0, 1.85, 0.03, 0.3, 0.0095],
      [2.3, 2.2, 0.05, 0.26, 0.008],
    ]) {
      const K = lod > 2 ? 40 : 16;
      const pts: Vec3[] = [];
      const radii: number[] = [];
      const ns: Vec3[] = [];
      for (let i = 0; i <= K; i++) {
        const t = i / K;
        const z = z0 + (z1 - z0) * t;
        const a = s * (a0 + (a1 - a0) * t);
        const [c, w, h] = domeAt(z);
        const [sn, cs, gs, gc] = round(a);
        const m = unit([gs / w, gc / h, 0]);
        // Out of the skin over its middle, under it at its ends: grown out of the head.
        const e = Math.sin(Math.PI * t) ** 0.5;
        const r = r0 * (0.5 + 0.5 * e);
        const off = r * (0.6 * e - 1.1 * (1 - e));
        pts.push([w * sn + m[0] * off, c + h * cs + m[1] * off - rest[1], z]);
        radii.push(r);
        ns.push(m);
      }
      tubed(out, head, q, pts, radii, n, ns);
    }
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
  THIGH_L: 10,
  THIGH_R: 11,
  HIPS: 12,
  FOREARM_L: 13,
  FOREARM_R: 14,
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
/** Its chitin's vertices written to `o` from `from` on (the body's colour at -1) put on CHITIN. */
const shell = (o: Out, from: number) => {
  const a = room(o, 0);
  for (let i = from; i < o.length; i += STRIDE) {
    if (a[i + 8] == -1 && [6, 7, 9].every((k, j) => Math.abs(a[i + k] - CHITIN_X[j]) < 1e-6)) {
      a[i + 8] = CHITIN;
    }
  }
};
/** The xenomorph's rigid pieces at `lod`, in PART's order; render.ts makes them all at the map's load. */
export const partsOf = (lod: number): Part[] =>
  (parts[lod] ??= (
    [
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
      {
        key: `xeno head ${lod}`,
        make: (o, a, q) => {
          const from = o.length;
          skull(o, a, q, lod);
          jaw(o, a, q, lod);
          belly(o, a, q, lod);
          grow(o, from, a, q);
        },
      },
      {
        key: `xeno fine ${lod}`,
        make: (o, a, q) => {
          const from = o.length;
          teeth(o, a, q, lod);
          hoses(o, a, q, lod);
          grow(o, from, a, q);
        },
        thin: true,
      },
      { key: `xeno thigh ${lod} -1`, make: (o, a, q) => thigh(o, a, q, lod, -1) },
      { key: `xeno thigh ${lod} 1`, make: (o, a, q) => thigh(o, a, q, lod, 1) },
      { key: `xeno hips ${lod}`, make: (o, a, q) => hips(o, a, q, lod) },
      { key: `xeno forearm ${lod} -1`, make: (o, a, q) => forearm(o, a, q, lod, -1) },
      { key: `xeno forearm ${lod} 1`, make: (o, a, q) => forearm(o, a, q, lod, 1) },
    ] as Part[]
  ).map(({ make, ...rest }) => ({
    ...rest,
    make: (o: Out, a: Vec3, q: Quat) => {
      const from = o.length;
      make(o, a, q);
      shell(o, from);
    },
  })));
