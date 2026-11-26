import { swingOf } from '../../shared/blade';
import { HEAVY_TAP, STING, TAILS } from '../../shared/constants';
import { TAU } from '../../shared/physics';
import type { PlayerState } from '../../shared/types';
import { ease } from '../gun';
import { SHINE, basis, unit } from '../mesh';
import type { Vec3 } from '../mesh';
import { JOINT as J, turn } from '../rig';
import { room } from '../verts';
import type { Floats, Out } from '../verts';
import { CHITIN_X, SIDES, far, mix3, on } from './common';
import type { Solved } from './common';
import {
  BACK,
  BEAD,
  FIN,
  FINS,
  VERTEBRAE,
  along,
  backOf,
  bonesOf,
  curveOf,
  fin,
  finH,
} from './back';

/** How far a full charge bends the tail to one side at its root and the other at its tip: an S, radians. */
export const COIL = 0.8;
/** How far the tail turns back toward the level when the body is on all fours (fours.ts), radians. */
export const LAID = 1.4;
/** Metres: the tail's length, its root's radius and its tip's, the stinger's length, width and thickness. */
export const TAIL = { len: 1.45, root: 0.072, tip: 0.024, sting: 0.3, wide: 0.07, thin: 0.014 };
/** How far the tip of the tail at rest curls up and forward: a hook (the user, 2026-11-16). */
export const HOOK = 6;

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
export const CHARGE_LEAN = 0.4;
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
export const THRUST: Lash = [1.08, 0, 0, 0.6, 0, 0, 0, 1];
export const DOWN: Lash = [0.9, 0, 0.7, 0.3, 0, 0, 0, 0];
/** A charged release: the thrust, the tail stretched out far (TAIL_FAR, the user 2026-11-23). */
export const FAR: Lash = [1.08, 0, 0, 0.9, 0, 0, 0, 1];
export const LASH: Record<number, [Lash, Lash]> = {
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

/** Scratch rings of tail(): each spot's place then normal. */
export let [RA, RB] = [new Float64Array(96), new Float64Array(96)];
export const [RC, RD] = [new Float64Array(96), new Float64Array(6)];

/** A ring of `n` spots into `R`, as ring() makes them; or the point `c` facing `tan` (n 1). */
export const ringTo = (R: Float64Array, c: Vec3, tan: Vec3, side: Vec3, r: number, n: number) => {
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
export const spot = (
  a: Floats,
  w: number,
  S: Float64Array,
  s: number,
  col: number[],
  layer: number,
) => {
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
export const tri = (
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
export const strip = (
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
export const AIM_AT = 6;
/** Where a strike's tip lands: metres ahead of the eyes, more per share of reach (Lash), and under the crosshair. */
export const HIT_AT = [1.1, 1.2, 0.12] as const;
/** Metres the drawn tail keeps from the eyes (tail()). */
export const CLEAR = 0.45;
/** Radians the stinger's root turns up from the foe: about half its curve (blade()), so its point meets him. */
export const AIM_LIFT = 0.85;
/** The tail's last steps that curve round into an aimed stinger. */
export const BEND = 5;

/** The stinger's steel: a cold, dark polish that takes the sky's reflection (SHINE). */
export const STING_STEEL = [0.42, 0.44, 0.48];
/** Ring scratch of blade(): four spots a ring, a place then a normal each. */
export const [BA, BB] = [new Float64Array(24), new Float64Array(24)];

/**
 * The stinger (the user, 2026-11-16: a curved knife's blade), from the tail's end `at` along `w`,
 * its flat faces to the sides and its back on the tail's `up`: it swells out of a collar to its
 * widest a quarter along, then narrows to its point, curving down under the tail's way, both its
 * back and its edge sharp, thin across. Polished steel (the user, 2026-11-23: a metallic texture),
 * out of a collar glowing in the team's `color`.
 */
export const blade = (
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
