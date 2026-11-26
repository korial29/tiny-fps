import { sheet } from '../helmet';
import type { Spot } from '../helmet';
import { STRIDE, TUBE, unit } from '../mesh';
import type { Vec3 } from '../mesh';
import { turn } from '../rig';
import type { Quat } from '../rig';
import { room } from '../verts';
import type { Out } from '../verts';
import { CHITIN_X, SIDES, far, on, ring } from './common';

/** Bone: its claws and teeth, nothing else. */
export const BONE = [0.62, 0.6, 0.52];
/** Its claws, hands and feet (the user, 2026-11-17: less white): a dull horn, darker than bone. */
export const CLAW = [0.3, 0.28, 0.24];
/** Its tendons and ribs: the chitin, a little lighter. */
export const SINEW = CHITIN_X.map(v => v * 1.45);

/**
 * A tube through `pts` in the frame (at, q) of a joint, `radii` thick at them, closed at both ends,
 * its rings steadied by the joint's `axis` (x), which must never lie along it: a ring whose way is
 * the axis collapses flat, and a tube along it pinched there. An end thicker than a hair is a dome
 * (`round`): a flat cap read as a cut-off pipe.
 */
export const strand = (
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
export const tubed = (
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
export const THIGH = 0.44;
export const onThigh = (s: number, t: number, a: number, off: number): Vec3 => {
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
export const WINDOWS = [[0.85, 0.38, 0.92, 0.022]];
/**
 * Windows in a limb (WINDOWS' rows), on its joint: in each a ribbed tube (tubed()) sunk in the limb,
 * swelling to its middle, framed by two bony cords that part round it and meet at its ends. `at(t,
 * a, off)` is a point of the limb's skin, `girth` its radius, for the cords' angle off the tube.
 */
export const windows = (
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
export const DIM = 0.45;
export const CORD = CHITIN_X.map(v => v * 1.15);
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
