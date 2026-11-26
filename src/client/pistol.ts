// The Hunter's pistol (the user, 2026-11-26: angular with rounded edges, after his shoulder
// cannon, tribal and dirty, its screen set into the body without a lit outline). It takes the
// place of the plasma gun's model in his hand and on his rack, in the gun's model space and on its
// marks: the grip round the origin, the muzzle at MUZZLE, the screen on the back face through BACK
// facing BACK_N, where readout() draws its count. x is to the right, y up, -z forward.
import { glow, tri } from './flag';
import { GLOSS, STRIDE } from './mesh';
import type { Vec3 } from './mesh';
import { BACK, BACK_N, MUZZLE } from './gun';

/** Worn bronze, its darker rims, the barrel's graphite, bone paint, the screen's black glass. */
const BRONZE: Vec3 = [0.34, 0.25, 0.15];
const RIM: Vec3 = [0.21, 0.155, 0.1];
const GRAPHITE: Vec3 = [0.12, 0.115, 0.1];
const BONE: Vec3 = [0.68, 0.6, 0.44];
/** Dark leather, the strips wound round the grip. */
const LEATHER: Vec3 = [0.13, 0.085, 0.05];
const GLASS: Vec3 = [0.02, 0.016, 0.014];
/** The glow: an ember, as his cannon's and his wrist computer's lights. */
const EMBER: Vec3 = [1, 0.22, 0.06];

/** A point of the gun from how far forward it is (`f`, -z), across (`x`) and up (`y`). */
const P = (f: number, x: number, y: number): Vec3 => [x, y, -f];

/** Half the screen's window across and up the back face, and its middle up the face from BACK. */
export const WINDOW = [0.036, 0.017, -0.021];

const built: number[][] = [];

/**
 * The pistol at `lod` (0 far, 1 near and in hand), made once each: smooth shells (the user,
 * 2026-11-26: no polygons showing), each vertex lit by the mean of the faces round it, the corners
 * of every section rounded in two facets far and three near (half that on a corner under 8 mm).
 */
export const hunterPistol = (lod: number): number[] => {
  if (built[lod]) {
    return built[lod];
  }
  const out: number[] = [];
  const steps = lod ? 3 : 2;
  /** The facets of a corner of radius `c`: a small one (under 8 mm) is round enough in half. */
  const facets = (c: number) => (c >= 0.008 ? steps : Math.max(1, Math.floor(steps / 2)));
  /** A quad p q r s (round its edge in that order), turned to face away from `core`. */
  const quad = (p: Vec3, q: Vec3, r: Vec3, s: Vec3, core: Vec3, tint: Vec3) => {
    const mid = [0, 1, 2].map(k => (p[k] + q[k] + r[k] + s[k]) / 4) as Vec3;
    const u = [0, 1, 2].map(k => q[k] - p[k]);
    // A triangle (s is p) takes its normal from its third corner.
    const v = [0, 1, 2].map(k => (s === p ? r : s)[k] - p[k]);
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const out_ = n[0] * (mid[0] - core[0]) + n[1] * (mid[1] - core[1]) + n[2] * (mid[2] - core[2]);
    const c = tint;
    // A quad whose last corner is its first is a triangle: a fan's.
    const three = s === p;
    if (out_ >= 0) {
      tri(out, p, q, r, c);
      if (!three) {
        tri(out, p, r, s, c);
      }
    } else {
      tri(out, p, r, q, c);
      if (!three) {
        tri(out, p, s, r, c);
      }
    }
  };
  /**
   * A section's ring: a rectangle `w` wide and `h` tall round `at`, across `u` and up `v`, its
   * corners rounded by `c` in `steps` facets.
   */
  const ring = (
    at: Vec3,
    u: Vec3,
    v: Vec3,
    w: number,
    h: number,
    c: number,
    n = facets(c),
  ): Vec3[] => {
    const corners: [number, number, number][] = [
      [w - c, h - c, 0],
      [-w + c, h - c, Math.PI / 2],
      [-w + c, -h + c, Math.PI],
      [w - c, -h + c, (3 * Math.PI) / 2],
    ];
    return corners.flatMap(([cx, cy, a0]) =>
      Array.from({ length: n + 1 }, (_, i) => {
        const a = a0 + (i * Math.PI) / 2 / n;
        const [x, y] = [cx + c * Math.cos(a), cy + c * Math.sin(a)];
        return at.map((o, k) => o + x * u[k] + y * v[k]) as Vec3;
      }),
    );
  };
  /** A vertex at `p` lit along `n`, coloured `c` (the renderer's format, layer -1). */
  const vert = (p: Vec3, n: number[], c: Vec3) => out.push(...p, ...n, c[0], c[1], -1, c[2]);
  /**
   * A shell lofted through `rings`, closed at both ends by a fan round each end's middle. Smooth,
   * each ring point lit by the mean of its faces' outward normals; else flat facets.
   */
  const loft = (rings: Vec3[][], tint: Vec3, ends: Vec3 = tint, smooth = true) => {
    const middle = (ps: Vec3[]) =>
      [0, 1, 2].map(k => ps.reduce((s, p) => s + p[k], 0) / ps.length) as Vec3;
    const core = middle(rings.flat());
    if (smooth) {
      const sum = rings.map(r => r.map(() => [0, 0, 0]));
      const faces: [number, number, number, boolean][] = [];
      for (let j = 1; j < rings.length; j++) {
        const [a, b] = [rings[j - 1], rings[j]];
        const local = middle([...a, ...b]);
        for (let i = 0; i < a.length; i++) {
          const k = (i + 1) % a.length;
          const [p, q, r] = [a[i], a[k], b[k]];
          const u = [0, 1, 2].map(x => q[x] - p[x]);
          const v = [0, 1, 2].map(x => r[x] - p[x]);
          const n = [
            u[1] * v[2] - u[2] * v[1],
            u[2] * v[0] - u[0] * v[2],
            u[0] * v[1] - u[1] * v[0],
          ];
          const away = [0, 1, 2].reduce((d, x) => d + n[x] * (p[x] - local[x]), 0) >= 0;
          for (const [jj, ii] of [
            [j - 1, i],
            [j - 1, k],
            [j, k],
            [j, i],
          ]) {
            [0, 1, 2].forEach(x => (sum[jj][ii][x] += away ? n[x] : -n[x]));
          }
          faces.push([j, i, k, away]);
        }
      }
      const normal = sum.map(r => r.map(n => n.map(x => x / (Math.hypot(...n) || 1))));
      for (const [j, i, k, away] of faces) {
        const corner = (jj: number, ii: number) => vert(rings[jj][ii], normal[jj][ii], tint);
        const quadAt: [number, number][] = [
          [j - 1, i],
          [j - 1, k],
          [j, k],
          [j, i],
        ];
        const order = away ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
        order.forEach(o => corner(...quadAt[o]));
      }
    } else {
      for (let j = 1; j < rings.length; j++) {
        const [a, b] = [rings[j - 1], rings[j]];
        for (let i = 0; i < a.length; i++) {
          const k = (i + 1) % a.length;
          quad(a[i], a[k], b[k], b[i], middle([...a, ...b]), tint);
        }
      }
    }
    for (const r of [rings[0], rings[rings.length - 1]]) {
      const m = middle(r);
      for (let i = 0; i < r.length; i++) {
        const k = (i + 1) % r.length;
        quad(m, r[i], r[k], m, core, ends);
      }
    }
  };
  const X: Vec3 = [1, 0, 0];
  const Y: Vec3 = [0, 1, 0];
  /** A hull along the gun through sections [forward, half width, low, high, corner]. */
  const hull = (stations: number[][], tint: Vec3, ends?: Vec3, smooth = true) =>
    loft(
      // One count of facets for the whole hull, from its roundest corner: its rings must match.
      stations.map(([f, w, lo, hi, c]) =>
        ring(
          P(f, 0, (lo + hi) / 2),
          X,
          Y,
          w,
          (hi - lo) / 2,
          c,
          facets(Math.max(...stations.map(st => st[4]))),
        ),
      ),
      tint,
      ends,
      smooth,
    );

  // The receiver, its back cut along the screen's face (BACK, BACK_N): the back ring's points lie
  // on that plane, the top of the back raised to hold the screen.
  const onBack = (p: Vec3): Vec3 => {
    // Along z to the plane: (p - BACK) · BACK_N = 0.
    const z = BACK[2] - ((p[1] - BACK[1]) * BACK_N[1]) / BACK_N[2];
    return [p[0], p[1], z];
  };
  const receiver = [
    [-0.06, 0.042, 0.064, 0.145, 0.011],
    [-0.02, 0.042, 0.064, 0.145, 0.011],
    [0.03, 0.038, 0.064, 0.132, 0.011],
    [0.075, 0.031, 0.062, 0.114, 0.009],
    [0.115, 0.025, 0.06, 0.1, 0.008],
  ].map(([f, w, lo, hi, c]) => ring(P(f, 0, (lo + hi) / 2), X, Y, w, (hi - lo) / 2, c));
  receiver[0] = receiver[0].map(onBack);
  loft(receiver, BRONZE, RIM);
  // The housing stepped along its top, and its spine, darker.
  hull(
    [
      [0.0, 0.022, 0.12, 0.142, 0.005],
      [0.07, 0.019, 0.105, 0.124, 0.005],
    ],
    RIM,
  );
  // The barrel, to a collar round a glowing emitter at the muzzle.
  hull(
    [
      [0.1, 0.017, 0.058, 0.092, 0.006],
      [0.19, 0.015, 0.06, 0.09, 0.006],
    ],
    GRAPHITE,
  );
  hull(
    [
      [0.186, 0.021, 0.053, 0.097, 0.008],
      [0.204, 0.021, 0.053, 0.097, 0.008],
    ],
    RIM,
  );
  const from = out.length;
  hull(
    [
      [0.204, 0.013, MUZZLE[1] - 0.013, MUZZLE[1] + 0.013, 0.006],
      [-MUZZLE[2], 0.008, MUZZLE[1] - 0.008, MUZZLE[1] + 0.008, 0.004],
    ],
    EMBER,
  );
  glow(out, from, 1.3);
  if (lod) {
    // Cooling fins across the barrel, between the receiver and the collar.
    for (let i = 0; i < 4; i++) {
      const f = 0.125 + i * 0.016;
      hull(
        [
          [f, 0.021, 0.056, 0.094, 0.004],
          [f + 0.005, 0.021, 0.056, 0.094, 0.004],
        ],
        RIM,
      );
    }
  }
  // The lower shell under the hand, from behind the grip to a strut under the barrel.
  hull(
    [
      [-0.045, 0.014, -0.034, -0.014, 0.005],
      [-0.02, 0.024, -0.064, -0.02, 0.008],
      [0.06, 0.024, -0.066, -0.03, 0.008],
      [0.115, 0.017, -0.048, -0.026, 0.006],
      [0.14, 0.012, -0.032, -0.02, 0.004],
    ],
    BRONZE,
    RIM,
  );
  hull(
    [
      [0.125, 0.011, -0.03, 0.062, 0.004],
      [0.14, 0.011, -0.03, 0.062, 0.004],
    ],
    RIM,
  );
  // The grip, leaning back down its length (TILT), from the receiver to the shell.
  const lean = Math.atan2(0.06, 0.12);
  const along: Vec3 = [0, Math.cos(lean), -Math.sin(lean)];
  const fore: Vec3 = [0, Math.sin(lean), Math.cos(lean)].map(k => -k) as Vec3;
  loft(
    [-0.075, -0.04, 0, 0.04, 0.075].map((t, i) =>
      ring(
        along.map(k => k * t) as Vec3,
        X,
        fore,
        [0.017, 0.02, 0.021, 0.02, 0.017][i],
        [0.019, 0.023, 0.024, 0.023, 0.019][i],
        0.007,
      ),
    ),
    RIM,
  );
  // Tribal chevrons of bone paint, a hair proud of each flank: three pointing to the muzzle, each
  // two arms from the flank's top and foot to a point at its middle.
  /** The receiver's half width `f` forward, where its flank is flat. */
  const flank = (f: number) =>
    f < -0.02
      ? 0.042
      : f < 0.03
        ? 0.042 - ((f + 0.02) / 0.05) * 0.004
        : 0.038 - ((f - 0.03) / 0.045) * 0.007;
  for (const s of [-1, 1]) {
    const at = (f: number, y: number) => P(f, s * (flank(f) + 0.0005), y);
    for (let i = 0; i < 3; i++) {
      const f = -0.01 + i * 0.026;
      for (const y0 of [0.078, 0.118]) {
        quad(
          at(f, y0),
          at(f + 0.012, 0.098),
          at(f + 0.019, 0.098),
          at(f + 0.007, y0),
          P(f, 0, 0.098),
          BONE,
        );
      }
    }
  }
  if (lod) {
    // Tribal marks (the user, 2026-11-26), bone paint a hair proud of the body: tally marks behind
    // the chevrons on each flank, a band of teeth along the lower shell, diamonds down the spine,
    // and dark leather wound round the grip.
    for (const s of [-1, 1]) {
      const at = (f: number, y: number) => P(f, s * (flank(f) + 0.0005), y);
      for (let i = 0; i < 3; i++) {
        const f = -0.048 + i * 0.008;
        quad(
          at(f, 0.084),
          at(f + 0.0035, 0.084),
          at(f + 0.0035, 0.112),
          at(f, 0.112),
          P(f, 0, 0.098),
          BONE,
        );
      }
      const low = (f: number, y: number) => P(f, s * 0.0245, y);
      for (let i = 0; i < 6; i++) {
        const f = -0.012 + i * 0.011;
        const [y0, y1] = i % 2 ? [-0.044, -0.055] : [-0.055, -0.044];
        const a = low(f, y0);
        quad(a, low(f + 0.011, y0), low(f + 0.0055, y1), a, P(f, 0, -0.05), BONE);
      }
    }
    // The spine's top slopes from 0.142 at its back to 0.124 at its front.
    const spine = (f: number) => 0.1425 + (f / 0.07) * (0.124 - 0.142);
    for (let i = 0; i < 4; i++) {
      const f = 0.009 + i * 0.016;
      const top = (df: number, x: number) => P(f + df, x, spine(f + df) + 0.0006);
      quad(top(-0.0045, 0), top(0, 0.0045), top(0.0045, 0), top(0, -0.0045), P(f, 0, 0.1), BONE);
    }
    for (const t of [-0.05, -0.012, 0.026]) {
      loft(
        [t - 0.005, t + 0.005].map(u =>
          ring(along.map(k => k * u) as Vec3, X, fore, 0.0215, 0.0245, 0.007),
        ),
        LEATHER,
      );
    }
  }
  // The screen's black glass on the back face, and a raised bezel of the body round it: the
  // screen sits in the gun, no light round it.
  const up: Vec3 = [0, BACK_N[2], -BACK_N[1]];
  const onFace = (a: number, b: number, lift: number): Vec3 =>
    [0, 1, 2].map(
      k => BACK[k] + (k == 0 ? a : 0) + up[k] * (WINDOW[2] + b) + BACK_N[k] * lift,
    ) as Vec3;
  const [W, H] = [WINDOW[0], WINDOW[1]];
  const inside = onFace(0, 0, -0.02);
  quad(
    onFace(-W, -H, 0.0004),
    onFace(W, -H, 0.0004),
    onFace(W, H, 0.0004),
    onFace(-W, H, 0.0004),
    inside,
    GLASS,
  );
  const [B, T] = [0.004, 0.0035];
  for (const [a0, b0, a1, b1] of [
    [-W - B, -H - B, W + B, -H],
    [-W - B, H, W + B, H + B],
    [-W - B, -H, -W, H],
    [W, -H, W + B, H],
  ]) {
    // Each bar a low block: its top, then its four walls.
    const top = [onFace(a0, b0, T), onFace(a1, b0, T), onFace(a1, b1, T), onFace(a0, b1, T)];
    const foot = [onFace(a0, b0, 0), onFace(a1, b0, 0), onFace(a1, b1, 0), onFace(a0, b1, 0)];
    quad(top[0], top[1], top[2], top[3], inside, RIM);
    for (let i = 0; i < 4; i++) {
      const k = (i + 1) % 4;
      quad(foot[i], foot[k], top[k], top[i], onFace((a0 + a1) / 2, (b0 + b1) / 2, T / 2), RIM);
    }
  }
  // Its metal and paint on GLOSS: drawn worn (Draw.w), the shader scuffs them as the armour, grime,
  // chipped paint and scratches fixed on the gun (the user, 2026-11-26: defects on its surface).
  // The screen's glass and the glow keep their layers.
  for (let i = 0; i < out.length; i += STRIDE) {
    if (out[i + 8] == -1 && out[i + 6] + out[i + 7] + out[i + 9] > 0.1) {
      out[i + 8] = GLOSS;
    }
  }
  return (built[lod] = out);
};
