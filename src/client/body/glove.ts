import { TAU } from '../../shared/physics';
import { STRIDE, add, dot, mix, sub, unit } from '../mesh';
import type { Vec3 } from '../mesh';

import { CUFF, CUFF_NEAR, CUFF_SIDES } from '../skin';
import { CLAW } from '../xeno';
import { room } from '../verts';
import type { Out } from '../verts';
import { X, dist } from './constants';
import {
  BARE,
  BONES,
  CLAW_L,
  CUP,
  FINGER_R,
  FINGER_SIDES,
  HUNTER_CLAW,
  KNEE,
  KNEE_SHARP,
  LANK,
  LENGTH,
  LENGTH_X,
  LITE,
  MOUND_RINGS,
  SHELL,
  STRAP,
  THICK,
  THICK_X,
  THUMB,
  THUMB_WIDE,
  WRIST,
  WRIST_LIGHTS,
  cross,
  finger,
  phalanges,
  tube,
} from './fingers';
import type { Claws, Ring } from './fingers';
import { along } from './reach';

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
  out: Out,
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
  /** 0 to 1: the thumb out of the fist to CUP, up the side of what the palm carries. */
  cup = 0,
  /** A near runner's hand: fewer sides, on the near sleeve's cuff, and none of the glove's small parts. */
  lite = false,
  /** The marine's: lit buttons on the strap round the wrist (WRIST_LIGHTS). */
  lights = false,
  /** The xenomorph's claws on the fingertips (Grip). */
  claws: Claws = false,
  /** Its size: the xenomorph's grows from the wrist over 4 cm, hers is smaller (hands()). */
  grow = 1,
  /** How far the fingers fan out, times an open hand's (phalanges()). */
  spread = 1,
  /** How far the fingers' last bones bend further, radians (phalanges()). */
  hook = 0,
) => {
  // A hand is built in its own space, the same as long as nothing it is made of changes (a grip
  // held, the hand at rest): some ten thousand vertices that are then only carried to the wrist.
  // Its numbers to a billionth: a grip's curl eased onto its 0.9 wanders in its last bits frame
  // to frame, and every frame built the hand again.
  [curl, point, push, cup] = [curl, point, push, cup].map(tidy);
  to &&= to.map(tidy) as Vec3;
  const key = `${claws} ${+lite} ${+lights} ${curl} ${point} ${push} ${to} ${cup} ${tint} ${bare} ${+(bare === tint)} ${grow} ${spread} ${hook}`;
  let m = BUILT.get(key);
  if (!m) {
    if (BUILT.size >= KEPT) {
      BUILT.clear();
    }
    BUILT.set(
      key,
      (m = shape(curl, tint, point, push, to, bare, cup, lite, lights, claws, spread, hook)),
    );
    // Grown about the wrist, the origin here: the claws' from the wrist's cuff on.
    for (let i = 0; grow != 1 && i < m.length; i += 10) {
      const t = claws ? Math.min(Math.hypot(m[i], m[i + 1], m[i + 2]) / 0.04, 1) : 1;
      const g = 1 + (grow - 1) * t * t * (3 - 2 * t);
      m[i] *= g;
      m[i + 1] *= g;
      m[i + 2] *= g;
    }
  }
  // Hand space (x toward the thumb, y the back, z toward the fingers), a point and a direction, to the world.
  let o = out.length;
  const dst = room(out, (m.length / 10) * STRIDE);
  for (let i = 0; i < m.length; i += 10, o += STRIDE) {
    const x = m[i];
    const y = m[i + 1];
    const z = m[i + 2];
    const a = m[i + 3];
    const b = m[i + 4];
    const c = m[i + 5];
    dst[o] = end[0] + th[0] * x + u[0] * y + f[0] * z;
    dst[o + 1] = end[1] + th[1] * x + u[1] * y + f[1] * z;
    dst[o + 2] = end[2] + th[2] * x + u[2] * y + f[2] * z;
    dst[o + 3] = th[0] * a + u[0] * b + f[0] * c;
    dst[o + 4] = th[1] * a + u[1] * b + f[1] * c;
    dst[o + 5] = th[2] * a + u[2] * b + f[2] * c;
    dst[o + 6] = m[i + 6];
    dst[o + 7] = m[i + 7];
    dst[o + 8] = m[i + 9];
    dst[o + 9] = m[i + 8];
  }
  out.length = o;
};

/** A number to a billionth. */
const tidy = (x: number) => Math.round(x * 1e9) / 1e9;

/** The hands built in their own space, by what they are made of; forgotten all at once past KEPT (a grip closing makes a new one a frame). */
const BUILT = new Map<string, number[]>();
const KEPT = 128;

/** hand()'s vertices in the hand's own space: position, normal, colour and layer, ten numbers each. */
const shape = (
  curl: number,
  tint: number[],
  point: number,
  push: number,
  to: Vec3 | undefined,
  bare: number[],
  cup: number,
  lite: boolean,
  lights: boolean,
  clawStyle: Claws = false,
  spread = 1,
  hook = 0,
): number[] => {
  const claws = clawStyle === true;
  const shortClaws = clawStyle === 'short';
  // A spread hand's joints bend sharply (the user, 2026-11-23), the others' softly.
  const knee = spread > 1 ? KNEE_SHARP : KNEE;
  /** How spread the hand is, 0 to 1 (fully by a spread of 5): its thumb, mound and index follow. */
  const wide = Math.min(1, Math.max(0, (spread - 1) / 4));
  const out: number[] = [];
  const [FS, CS] = lite ? [4, CUFF_NEAR] : [FINGER_SIDES, CUFF_SIDES];
  let paint = (_: number) => tint;
  let layer = -1;
  /** A point and a direction in hand space, in `paint` of its ring. */
  const put = ([x, y, z]: Vec3, [m, n, w]: Vec3, r = 0) => {
    const c = paint(r);
    out.push(x, y, z, m, n, w, c[0], c[1], c[2], layer);
  };
  // The palm starts as the sleeve's cuff does, vertex for vertex, its normals leaning to the fingers.
  const PALM = [
    [WRIST[1] - CUFF[0], CUFF[1] - WRIST[0], CUFF[3], CUFF[4]],
    // The heel of the hand narrower than the knuckles and thick, the palm thinner toward the fingers
    // (the user, 2026-11-17: it was a mitt, as wide at the wrist as at the knuckles).
    ...(claws
      ? [
          [0.025, 0, 0.043, 0.024],
          [0.06, -0.002, 0.046, 0.019],
        ]
      : [
          [0.025, 0, 0.038, 0.0235],
          [0.06, -0.002, 0.045, 0.018],
        ]),
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
    (lite ? [PALM[0], PALM[2]] : PALM.slice(0, 3)).map(r => palm(r)),
    CS,
    put,
    0.75,
  );
  // A whole glove (`bare` the glove's own colour, a space suit's) has no nails showing.
  const nail = bare === tint ? tint : mix(bare as Vec3, [0.98, 0.74, 0.7], 0.4);
  /** A finger's tube, its glove to ring BARE and bare beyond, and the nail on its tip. */
  const digit = (
    p: Vec3,
    ds: [Vec3, Vec3, Vec3],
    l: number,
    r: number,
    t: Vec3,
    from = 1,
    /** Its claw's length against CLAW_L, how hard it hooks down and its root's width (the thumb's: short, curled, fine). */
    [reach, hook, slim] = [1, 1, 1],
  ) => {
    paint = k => (k < BARE ? tint : bare);
    // From where it leaves the palm, ring `from`: a weld skins its root.
    const all = finger(p, ...ds, l, r, t, +claws, knee);
    const ks = lite
      ? [from, ...LITE.filter(k => k > from), all.length - 1]
      : all.map((_, k) => k).slice(from);
    tube(
      ks.map(k => all[k]),
      FS,
      (q, n, k) => put(q, n, ks[k]),
    );
    const d = ds[2];
    const j2 = along(along(p, ds[0], BONES[0] * l), ds[1], BONES[1] * l);
    const y = unit(cross(d, X));
    const x = cross(y, d);
    if (clawStyle) {
      // A claw for the nail: from the back of the last phalanx, out past the tip and hooked down
      // toward the palm, tapering to a point.
      const length = (shortClaws ? 0.022 : CLAW_L) * reach;
      paint = () => (shortClaws ? HUNTER_CLAW : CLAW);
      const ring = (k: number, w: number): Ring => {
        const c = add(
          // On the finger's own axis, from just before its tip: one line from the finger into the claw.
          along(j2, d, BONES[2] * l * 0.68 + length * k * (1 - 0.25 * (hook - 1) * k)),
          y.map(v => v * (r * (shortClaws ? 0.38 : 0.04) - length * 0.45 * hook * k * k)) as Vec3,
        );
        const t = unit(add(d, y.map(v => -v * 0.9 * hook * k) as Vec3));
        const b = unit(cross(t, x));
        return [c, x.map(v => v * r * w * slim) as Vec3, b.map(v => v * r * w * slim) as Vec3];
      };
      // Flush on the finger at its root, then swelling clear of the fingertip inside it.
      tube(
        // Its first ring inside the finger: no open rim behind the claw to see into.
        [
          ring(0, 0.35),
          ring(0.04, 0.66),
          ring(0.16, 0.74),
          ring(0.4, 0.56),
          ring(0.7, 0.3),
          ring(1, 0),
        ],
        lite ? 4 : FS,
        (q, n) => put(q, n),
      );
      return;
    }
    if (lite) {
      return;
    }
    paint = () => nail;
    // The nail: an oval on the back of the last phalanx, toward its tip, a hair out of it.
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
  const nexts: Ring[] = [];
  for (let i = 0; i < 4; i++) {
    // `point` straightens the index out of the fist, to press a button.
    const ds = phalanges(i ? curl : curl * (1 - point), i, spread, hook);
    const at: Vec3 = [0.034 - 0.0225 * i, -0.004, 0.092];
    // A spread hand's lifted first bones leave the palm along it, not tilted with them: no dip
    // behind their root (the user, 2026-11-23).
    const t = unit(add(ds[0], [0, 0, 1 + 3 * wide]));
    // The xenomorph's long and lean (the user's picture, 2026-11-17: a skeleton's hand).
    const [fl, fr] = claws
      ? [0.04 * LENGTH_X[i] * LANK, FINGER_R * THICK_X[i]]
      : [0.04 * LENGTH[i], FINGER_R * THICK[i]];
    digit(at, ds, fl, fr, t);
    const rings = finger(at, ...ds, fl, fr, t, +claws, knee);
    const [, x, y] = rings[1];
    // The finger's next ring as it is drawn (digit()), for its root's normals (seamless, below).
    nexts.push(rings[lite ? LITE[0] : 2]);
    roots.push([
      at,

      Array.from({ length: FS }, (_, k) => {
        const a = (k * TAU) / FS;
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
  const palmLoop = Array.from({ length: CS }, (_, k): W => {
    const a = (k * TAU) / CS;
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
        const a = (k * TAU) / FS;
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
  // The xenomorph's (the user, 2026-11-17: a seam where its fingers leave the palm): a root's
  // vertex takes the very normal its finger's tube gives it (tube()), so the light does not break
  // across the joint.
  // A spread hand's too (the user, 2026-11-23: a sharp line across the index's root): its
  // fingers fan out most from the weld, and the light broke there.
  const seamless = new Map<Vec3, Vec3>();
  if (claws || wide > 0) {
    roots.forEach(([, ring], f) => {
      const [c, x, y] = nexts[f];
      ring.forEach((v, k) => {
        const a = (k * TAU) / FS;
        const on = [0, 1, 2].map(d => c[d] + x[d] * Math.cos(a) + y[d] * Math.sin(a)) as Vec3;
        seamless.set(v, unit(cross(sub(ring[(k + 1) % FS], ring[(k + FS - 1) % FS]), sub(on, v))));
      });
    });
  }
  for (const t of tris) {
    for (const [p, n] of t) {
      put(p, seamless.get(p) ?? unit(add(n, unit(sum.get(p)!))));
    }
  }
  // `push` (0 to 1) reaches the thumb's tip out along `to`, onto the katana's button.
  // A spread hand (`spread` past 1, the Hunter's disc) swings its thumb out to the side as well,
  // fully by a spread of 5 (`wide`).
  const [d1, d2] = THUMB.map(([open, fist], k) => {
    const d = unit(mix(unit(mix(unit(mix(open, fist, curl)), CUP[k], cup)), THUMB_WIDE[k], wide));
    return k && to ? unit(mix(d, to, push)) : d;
  });
  const tp: Vec3 = [0.032, -0.01, 0.025];
  // The thumb's thickness, the spread of its foot on the palm and its mound's height: the
  // xenomorph's as they were.
  // A spread hand's thumb (the Hunter's on his disc, the user 2026-11-23) is shorter, thicker at
  // its foot, on a fuller mound.
  const [tr, SPREAD, mound] = claws ? [0.0124, 1.7, 0.003] : [0.0116, 2, 0.0065];
  const [TL, TR, MOUND] = [
    0.037 * (1 - 0.12 * wide),
    tr * (1 + 0.1 * wide),
    mound * (1 + 0.5 * wide),
  ];
  digit(tp, [d1, d2, d2], TL, TR, d1, 2, [0.6, 2.2, 0.7]);
  // The thumb's mound (the user, 2026-11-09: the thumb shows the most, holding a gun): from a
  // footprint on the palm round its root, its ring there pushed out onto the palm's surface, a
  // skin swells into the thumb halfway along its first bone. One piece with the palm.
  paint = () => tint;
  {
    // As the thumb is drawn (digit()): the xenomorph's thin bone, or the mound ended in a step.
    const rings = finger(tp, d1, d2, d2, TL, TR, d1, +claws, knee);
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
    const foot = Array.from({ length: FS }, (_, k): [Vec3, Vec3] => {
      const a = (k * TAU) / FS;
      // A spread thumb's foot is wider on the palm, for a gentler slope up to it.
      const q = [0, 1, 2].map(
        d => tp[d] + SPREAD * (1 + 0.35 * wide) * (x1[d] * Math.cos(a) + y1[d] * Math.sin(a)),
      ) as Vec3;
      const [yc, w, h] = section(q[2]);
      // Out from the palm's axis onto its surface.
      const e = Math.hypot(q[0] / w, (q[1] - yc) / h) || 1;
      const on: Vec3 = [q[0] / e, yc + (q[1] - yc) / e, q[2]];
      return [on, unit([on[0] / (w * w), (on[1] - yc) / (h * h), 0])];
    });
    const top = Array.from({ length: FS }, (_, k): [Vec3, Vec3] => {
      const a = (k * TAU) / FS;
      const d: Vec3 = [0, 1, 2].map(i => x2[i] * Math.cos(a) + y2[i] * Math.sin(a)) as Vec3;
      return [add(c2, d), unit(d)];
    });
    // Rings between, swollen: the mound, the ball of the thumb. Eased from the palm to the thumb
    // over MOUND_RINGS steps, its normals turning from the palm's to the thumb's, so no seam shows
    // where it meets either (the user, 2026-11-23).
    // Only a spread hand's (the disc's) takes the extra rings: the others keep the vertex budget.
    const steps = wide > 0 ? MOUND_RINGS : 2;
    const rings2 = Array.from({ length: steps + 1 }, (_, j) => {
      const t = j / steps;
      const e = t * t * (3 - 2 * t);
      return foot.map(([q, n], k): [Vec3, Vec3] =>
        j === 0
          ? [q, n]
          : j === steps
            ? top[k]
            : [
                add(mix(q, top[k][0], e), n.map(c => c * MOUND * Math.sin(Math.PI * t)) as Vec3),
                unit(mix(n, top[k][1], e)),
              ],
      );
    });
    for (const [a, b] of rings2.slice(1).map((r, j) => [rings2[j], r])) {
      for (let k = 0; k < FS; k++) {
        const n = (k + 1) % FS;
        for (const [q, m] of [a[k], a[n], b[n], a[k], b[n], b[k]]) {
          put(q, m);
        }
      }
    }
  }
  // The xenomorph's tendons over the back of its hand: each from the wrist straight to its
  // finger's root and on along the finger's first bone (the user, 2026-11-17: in line with it).
  if (claws && !lite) {
    paint = () => tint.map(c => c * 1.5);
    /** The top of the palm's back at (x, z). */
    const top = (x: number, z: number): Vec3 => {
      const n = Math.min(
        Math.max(
          PALM.findIndex(r => r[0] > z),
          1,
        ),
        PALM.length - 1,
      );
      const [a, b] = [PALM[n - 1], PALM[n]];
      const f = Math.min(Math.max((z - a[0]) / (b[0] - a[0]), 0), 1);
      const [y, w, h] = [1, 2, 3].map(k => a[k] + (b[k] - a[k]) * f);
      return [x, y + h * Math.sqrt(Math.max(1 - (x / w) ** 2, 0)) + 0.0006, z];
    };
    roots.forEach(([at], f) => {
      const [d1] = phalanges(f ? curl : curl * (1 - point), f, spread, hook);
      const up = unit(cross(d1, X));
      const r = FINGER_R * THICK[f];
      // On the finger: over its root, then down into its first bone.
      const [on, end] = [0.004, 0.02].map((l, k) =>
        add(along(at, d1, l), up.map(v => v * r * (k ? 0.45 : 0.86)) as Vec3),
      );
      // The same line back to the wrist, a little drawn in toward its middle.
      const back = [0.012, 0.036, 0.06, 0.082].map(z => {
        const u = (0.092 - z) / 0.08;
        return top((at[0] - d1[0] * (0.092 - z)) * (1 - 0.45 * u), z);
      });
      const pts = [...back, on, end];
      tube(
        pts.map((c, k): Ring => {
          // Out of the wrist as a hair (tube() starts on a ring), into the bone as a point.
          const w = k == pts.length - 1 ? 0 : k ? 0.0026 : 0.0008;
          return [c, [w, 0, 0], [0, w, 0]];
        }),
        5,
        put,
      );
    });
  }
  // No glove's shell, plate or strap on a near hand, nor on the xenomorph's bare one.
  if (lite || clawStyle) {
    return out;
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
    // Eight sides: half of the ridge is sunk in the glove (10 until the fingers' round tips, 2026-11-18).
    8,
    put,
  );
  // A padded plate on the back of the hand, and the strap round the wrist with its buckle.
  paint = () => tint.map(v => v * 0.72);
  tube(
    // No ring across its middle: the back of the hand is straight under it, within 0.1 mm.
    [0.03, 0.031, 0.034, 0.066, 0.069, 0.071].map((z, i): Ring => {
      const k = [0.1, 0.6, 0.92, 1, 0.75, 0][i];
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
  const [z0, z1, k] = [PALM[0][0] + 0.004, PALM[0][0] + 0.004 + STRAP.w, STRAP.k];
  tube([strap(z0, 0.97), strap(z0 + 0.001, k), strap(z1 - 0.001, k), strap(z1, 0.97)], CS, put);
  const zb = (z0 + z1) / 2;
  const yb = strap(zb, k)[0][1] + strap(zb, k)[2][1];
  /** A small block on the strap's back, `x` across, `w` and `d` its half sizes, `h` high. */
  const block = (x: number, w: number, d: number, h: number) =>
    tube(
      [x - w, x - w * 0.85, x + w * 0.85, x + w].map((q, i): Ring => {
        const s = i % 3 ? 1 : i ? 0 : 0.1;
        return [
          [q, yb, zb],
          [0, h * s, 0],
          [0, 0, d * s],
        ];
      }),
      6,
      put,
    );
  if (!lights) {
    paint = () => SHELL;
    block(0, 0.008, STRAP.w / 2 - 0.0015, 0.0016);
  } else {
    // Lit: unshaded, they bloom.
    layer = -2;
    for (const [x, c] of WRIST_LIGHTS) {
      paint = () => c;
      block(x, 0.0016, 0.0016, 0.0014);
    }
    layer = -1;
  }
  return out;
};
