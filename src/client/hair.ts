// The woman's hair (the user, 2026-11-11): five styles made in code, one per player (styleOf()),
// laid on the skull of skin.ts and carried by the head joint: a ponytail, a bob, a bun, a braid
// tied back, a shaved side under a swept top. Each is a shell over the scalp down to its own line
// (never over the face or the ears' front) and, for three of them, a piece behind the head that
// hangs no lower than the chin, so nothing reaches the collar or the shoulder plates. A tail and a
// braid sway a little with the run. Under the moon's helmet no hair is drawn: it is tucked in.
import { JOINT as J, turn } from './rig';
import type { Quat } from './rig';
import type { Vec3 } from './mesh';
import { hash } from './features';
import { HAIRLINE_F, TOP, bindOf, scalp } from './skin';

export const STYLE = { PONYTAIL: 0, BOB: 1, BUN: 2, BRAID: 3, UNDERCUT: 4 } as const;
export const STYLES = Object.keys(STYLE).length;

/** The hair style of the woman `id`: the one she picked (`c.hair`), else her id's, the same for everyone who sees her. */
export const styleOf = (id: number, c?: { hair?: number }): number =>
  c?.hair ?? Math.floor(hash(id, 311) * STYLES);

/** The woman's head to the man's (SCALE in skin.ts), and the lowest a style may hang on the man's head at rest, metres: the chin's height. */
export const [HEAD_SCALE, LOWEST] = [0.96, 1.592];

const clamp = (v: number) => Math.min(Math.max(v, 0), 1);
const ease = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** A curve through [x, y] points, eased between them. */
const curve = (pts: number[][], x: number) => {
  const k = pts.findIndex(p => p[0] >= x);
  const [a, b] = [pts[Math.max(k - 1, 0)], pts[k < 0 ? pts.length - 1 : k]];
  return a[1] + (b[1] - a[1]) * ease(0, 1, (x - a[0]) / (b[0] - a[0] || 1));
};

/** Her hairline by the angle from the front, 0 to pi (skin.ts tints her scalp from it): a pulled style ends 2 mm short of it, on the hair. */
const LINE = HAIRLINE_F.map(([a, y]) => [a, y + 0.002]);

/** A style's shell: where it ends at the signed angle `a` (+ toward her right), and how far off the skull it stands `t` of the way down (0 the crown). */
interface Shell {
  low: (a: number) => number;
  off: (a: number, t: number) => number;
}
/** Hair drawn back: full over the top, down to almost nothing at the hairline, where it leaves the skin. */
const bell = (v: number, s: number) => Math.exp(-((v / s) ** 2));
/** `fringe` gives how far under the hairline a lock comes down over the forehead at the angle a. */
const pulled = (off: number, fringe: (a: number) => number = () => 0): Shell => ({
  low: a => curve(LINE, Math.abs(a)) - fringe(a),
  off: (a, t) => 0.0045 + off * (1 - t ** 2.5) + 0.2 * fringe(a) * t,
});
/** How many locks run down a shell, half round the head. */
const LOCKS = 7;
const SHELLS: Shell[] = [
  // The ponytail: a lock swept across the forehead to her right.
  pulled(0.011, a => 0.024 * bell(a - 0.5, 0.42)),
  // The bob: a fringe over the forehead, the sides and the back down to the jaw, fuller toward its ends.
  {
    low: a =>
      curve(
        [
          [0, 1.741],
          [0.5, 1.738],
          [0.82, 1.66],
          [1.05, 1.612],
          [Math.PI, 1.606],
        ],
        Math.abs(a),
      ),
    off: (a, t) => 0.011 + 0.012 * t * ease(0.5, 1, Math.abs(a)),
  },
  pulled(0.01),
  // The braid: parted in the middle, a lock down each temple.
  pulled(0.011, a => 0.02 * bell(Math.abs(a) - 0.72, 0.3)),
  // A shaved left side (the scalp's short hair alone) under a top swept to her right, where it falls to the cheekbone.
  {
    low: a =>
      a < 0
        ? curve(
            [
              [0, 1.75],
              [0.5, 1.752],
              [0.9, 1.764],
              [2.5, 1.762],
              [Math.PI, 1.7],
            ],
            -a,
          )
        : curve(
            [
              [0, 1.75],
              [0.45, 1.735],
              [0.85, 1.672],
              [1.7, 1.668],
              [2.3, 1.69],
              [Math.PI, 1.7],
            ],
            a,
          ),
    off: (a, t) => 0.012 + 0.008 * ease(-0.6, 0.6, a) * (0.4 + 0.6 * t),
  },
];

/** A vertex of a style at rest on the man's head: its place, its normal, how light it is, how much it sways. */
type V = number[];

/** Triangles (three V each) of a grid of rows of V, its normals smooth, facing away from `mid`; `wrap` joins each row's ends. */
const sheet = (out: V[], rows: V[][], wrap: boolean, mid: Vec3) => {
  const n = rows[0].length;
  const at = (r: number, i: number) =>
    rows[Math.min(Math.max(r, 0), rows.length - 1)][
      wrap ? (i + n) % n : Math.min(Math.max(i, 0), n - 1)
    ];
  rows.forEach((row, r) =>
    row.forEach((v, i) => {
      const [a, b, c, d] = [at(r, i - 1), at(r, i + 1), at(r - 1, i), at(r + 1, i)];
      const [u, w] = [
        [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
        [d[0] - c[0], d[1] - c[1], d[2] - c[2]],
      ];
      let m = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      const out = [v[0] - mid[0], v[1] - mid[1], v[2] - mid[2]];
      if (Math.hypot(...m) < 1e-12) {
        m = out;
      }
      const s =
        (m[0] * out[0] + m[1] * out[1] + m[2] * out[2] < 0 ? -1 : 1) * (Math.hypot(...m) || 1);
      [v[3], v[4], v[5]] = [m[0] / s, m[1] / s, m[2] / s];
    }),
  );
  for (let r = 0; r + 1 < rows.length; r++) {
    for (let i = 0; i < (wrap ? n : n - 1); i++) {
      const [a, b, c, d] = [
        rows[r][i],
        rows[r][(i + 1) % n],
        rows[r + 1][(i + 1) % n],
        rows[r + 1][i],
      ];
      for (const tri of [
        [a, b, c],
        [a, c, d],
      ]) {
        const [p, q, s] = tri;
        const f = [
          (q[1] - p[1]) * (s[2] - p[2]) - (q[2] - p[2]) * (s[1] - p[1]),
          (q[2] - p[2]) * (s[0] - p[0]) - (q[0] - p[0]) * (s[2] - p[2]),
          (q[0] - p[0]) * (s[1] - p[1]) - (q[1] - p[1]) * (s[0] - p[0]),
        ];
        if (Math.hypot(...f) < 1e-12) {
          continue;
        }
        // Wound as its normal faces.
        out.push(...(f[0] * p[3] + f[1] * p[4] + f[2] * p[5] >= 0 ? [p, q, s] : [p, s, q]));
      }
    }
  }
};

/**
 * A lock of hair along `path` ([x, y, z, radius]), `wide` times wider across than deep, its ends
 * closed, of `sides` sides: it sways from nothing at its root to all at its tip. `plait` > 0 knots
 * it like a braid.
 */
const lock = (
  out: V[],
  path: number[][],
  sides: number,
  wide: number,
  light: number,
  plait = 0,
) => {
  const rows = path.map((p, k) => {
    const [a, b] = [path[Math.max(k - 1, 0)], path[Math.min(k + 1, path.length - 1)]];
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const l = Math.hypot(...d) || 1;
    // Across is x; the other axis of the section is square to the path in the y, z plane.
    const up = [0, -d[2] / l, d[1] / l];
    const t = k / (path.length - 1);
    const knot = plait ? 1 + plait * Math.abs(Math.sin(t * Math.PI * 4)) : 1;
    return Array.from({ length: sides }, (_, i) => {
      const th = (2 * Math.PI * i) / sides;
      const [cx, cy] = [Math.cos(th) * p[3] * wide * knot, Math.sin(th) * p[3] * knot];
      const side = plait ? 0.004 * Math.sin(t * Math.PI * 8) : 0;
      return [
        p[0] + cx + side,
        p[1] + up[1] * cy,
        p[2] + up[2] * cy,
        0,
        0,
        0,
        light * (0.86 + 0.14 * Math.sin(th * 3 + t * 9)) * (plait ? 0.8 + 0.2 * knot : 1),
        t,
      ];
    });
  });
  const mid = (k: number) => path[k].slice(0, 3) as Vec3;
  // Each ring's normals away from its own middle: a lock bends.
  rows.forEach((row, k) => {
    const m = mid(k);
    row.forEach(v => {
      const o = [v[0] - m[0], v[1] - m[1], v[2] - m[2]];
      const l = Math.hypot(...o) || 1;
      [v[3], v[4], v[5]] = [o[0] / l, o[1] / l, o[2] / l];
    });
  });
  for (let r = 0; r + 1 < rows.length; r++) {
    for (let i = 0; i < sides; i++) {
      const [a, b, c, d] = [
        rows[r][i],
        rows[r][(i + 1) % sides],
        rows[r + 1][(i + 1) % sides],
        rows[r + 1][i],
      ];
      for (const [p, q, s] of [
        [a, b, c],
        [a, c, d],
      ]) {
        const f = [
          (q[1] - p[1]) * (s[2] - p[2]) - (q[2] - p[2]) * (s[1] - p[1]),
          (q[2] - p[2]) * (s[0] - p[0]) - (q[0] - p[0]) * (s[2] - p[2]),
          (q[0] - p[0]) * (s[1] - p[1]) - (q[1] - p[1]) * (s[0] - p[0]),
        ];
        if (Math.hypot(...f) > 1e-12) {
          out.push(...(f[0] * p[3] + f[1] * p[4] + f[2] * p[5] >= 0 ? [p, q, s] : [p, s, q]));
        }
      }
    }
  }
  // The ends: a fan each.
  for (const k of [0, path.length - 1]) {
    const m = mid(k);
    const d = k ? 1 : -1;
    const n = [
      path[k][0] - path[k - d]?.[0],
      path[k][1] - path[k - d]?.[1],
      path[k][2] - path[k - d]?.[2],
    ];
    const l = Math.hypot(...n) || 1;
    const c: V = [...m, n[0] / l, n[1] / l, n[2] / l, light * 0.8, k ? 1 : 0];
    for (let i = 0; i < sides; i++) {
      const [p, q] = [rows[k][i], rows[k][(i + 1) % sides]];
      const f = [
        (p[1] - c[1]) * (q[2] - c[2]) - (p[2] - c[2]) * (q[1] - c[1]),
        (p[2] - c[2]) * (q[0] - c[0]) - (p[0] - c[0]) * (q[2] - c[2]),
        (p[0] - c[0]) * (q[1] - c[1]) - (p[1] - c[1]) * (q[0] - c[0]),
      ];
      out.push(...(f[0] * c[3] + f[1] * c[4] + f[2] * c[5] >= 0 ? [c, p, q] : [c, q, p]));
    }
  }
};

/** The rest mesh of a style, `fine` or not: its triangles' corners, each 8 floats (V), on the man's head. */
const make = (style: number, fine: boolean): Float32Array => {
  const out: V[] = [];
  const [cols, rows] = fine ? [44, 9] : [12, 5];
  // Loose ends are cut in tips, lock by lock: the bob's all round, the swept top's on its long side.
  const loose = (a: number) => (style == STYLE.BOB ? 1 : style == STYLE.UNDERCUT ? +(a > 0.3) : 0);
  const { low, off } = SHELLS[style];
  const top = TOP - 0.012;
  const grid: V[][] = [];
  for (let r = 0; r <= rows + 1; r++) {
    // The last row tucks the shell's edge in to the scalp, a little lower: it has a thickness.
    const t = Math.min(r / rows, 1);
    const tuck = r > rows;
    grid.push(
      Array.from({ length: cols }, (_, i) => {
        const a = -Math.PI + (2 * Math.PI * (i + 0.5)) / cols;
        // The locks (the user, 2026-11-12): ridges that run down the shell, wavering, a groove
        // between two of them; fuller to the ends.
        const ridge = fine ? Math.abs(Math.sin(a * LOCKS + 1.3 * Math.sin(t * 3.2 + style))) : 0.6;
        const tip = fine ? 0.016 * ridge ** 2 * loose(a) : 0;
        const y = Math.max(
          top + (low(a) - tip - top) * t ** 0.85 - (tuck ? 0.004 : 0),
          LOWEST + 0.007,
        );
        const p = scalp(
          a,
          y,
          tuck ? 0.0015 : off(a, t) + 0.0065 * (ridge ** 0.7 - 0.6) * (0.25 + 0.75 * t),
        );
        // Lighter where the light catches the top's turn, darker to the ends; strands round it.
        const light =
          (0.78 + 0.34 * Math.exp(-(((t - 0.3) / 0.22) ** 2)) - 0.12 * t) * (0.58 + 0.5 * ridge);
        return [...p, 0, 0, 0, tuck ? 0.6 : light, 0];
      }),
    );
  }
  // The crown: a ring just round the top closes the shell.
  const cap = scalp(0, TOP - 0.002, off(0, 0));
  grid.unshift(grid[0].map(() => [0, cap[1] + 0.001, 0.012, 0, 0, 0, 0.95, 0]));
  sheet(out, grid, true, [0, 1.7, 0.005]);
  const back = (y: number, o: number) => scalp(Math.PI, y, o);
  const sides = fine ? 10 : 6;
  if (style == STYLE.PONYTAIL) {
    const [, y, z] = back(1.742, 0.01);
    lock(
      out,
      [
        [0, y, z - 0.004, 0.012],
        [0, y + 0.012, z + 0.026, 0.019],
        [0, y - 0.012, z + 0.05, 0.021],
        [0, y - 0.05, z + 0.054, 0.019],
        [0, y - 0.08, z + 0.046, 0.014],
        [0, y - 0.1, z + 0.038, 0.005],
      ],
      sides,
      1.15,
      0.95,
    );
  } else if (style == STYLE.BUN) {
    const [, y, z] = back(1.752, 0.012);
    const R = 0.034;
    lock(
      out,
      [0, 0.25, 0.5, 0.75, 1].map(k => {
        const th = Math.PI * (0.08 + 0.84 * k);
        // A ball leaning back and up off the head.
        return [0, y + 0.012 + 0.012 * k, z - 0.012 + R * (1 - Math.cos(th)), R * Math.sin(th)];
      }),
      sides,
      1.1,
      0.92,
    );
    out.forEach(v => (v[7] *= 0.15));
  } else if (style == STYLE.BRAID) {
    const [, y, z] = back(1.726, 0.008);
    const n = fine ? 9 : 5;
    lock(
      out,
      Array.from({ length: n }, (_, k) => {
        const t = k / (n - 1);
        return [
          0,
          y - 0.062 * t,
          z + 0.012 + 0.014 * Math.sin(t * Math.PI * 0.6) - 0.016 * t,
          0.017 - 0.007 * t ** 2,
        ];
      }),
      sides,
      1.2,
      0.92,
      0.22,
    );
  }
  // Loose strands that frame the face: off the temple, down in front of the ear to the jaw,
  // curling out at their ends. They sway with the run. The bob's sides are its own.
  const strand = (side: number, a0: number, len: number, r: number) => {
    const n = fine ? 6 : 3;
    lock(
      out,
      Array.from({ length: n }, (_, k) => {
        const t = k / (n - 1);
        const [x, y, z] = scalp(
          side * (a0 - 0.1 * t + 0.07 * Math.sin(t * 5.5)),
          1.742 - len * t,
          0.007 + 0.007 * Math.sin(t * 3) + 0.012 * t ** 3,
        );
        return [x, y, z, r * (1 - 0.75 * t ** 2)];
      }),
      fine ? 6 : 4,
      1.5,
      0.9,
    );
  };
  if (style == STYLE.PONYTAIL || style == STYLE.BRAID) {
    strand(1, 1.02, 0.115, 0.0052);
    strand(-1, 1.02, 0.105, 0.0052);
  } else if (style == STYLE.BUN) {
    strand(1, 0.98, 0.095, 0.004);
    strand(-1, 0.98, 0.12, 0.004);
  } else if (style == STYLE.UNDERCUT) {
    strand(1, 0.62, 0.1, 0.006);
  }
  return new Float32Array(out.flat());
};

const made = new Map<number, Float32Array>();
/** The style's rest mesh (make()), built once per style and fineness. */
export const tress = (style: number, fine: boolean) => {
  const key = style * 2 + +fine;
  let m = made.get(key);
  if (!m) {
    made.set(key, (m = make(style, fine)));
  }
  return m;
};

/**
 * How a runner's tail or braid swings, in the head's frame (to her right, up, back), metres at its
 * tip: side to side with her stride (`phase`, 0 to 1), back and a little up with her speed (m/s),
 * a breath when she stands (`t` seconds).
 */
export const sway = (phase: number, speed: number, t: number): Vec3 => {
  const k = clamp(speed / 7);
  return [
    0.022 * k * Math.sin(2 * Math.PI * phase) + 0.002 * Math.sin(t * 1.3),
    0.012 * k * Math.abs(Math.cos(2 * Math.PI * phase)),
    0.02 * k,
  ];
};

/**
 * Appends the hair `style` in `rgb` on the woman's head joint at `at` turned by `q` (see solve()),
 * at level of detail `lod` (0 far), its loose end moved by `swing` (sway()).
 */
export const hair = (
  out: number[],
  at: Vec3,
  q: Quat,
  style: number,
  rgb: number[],
  lod: number,
  swing: Vec3 = [0, 0, 0],
) => {
  const m = tress(style, lod > 0);
  const o = bindOf(0)[J.HEAD];
  let w = out.length;
  for (let i = 0; i < m.length; i += 8, w += 10) {
    const s = m[i + 7] ** 1.5;
    const p = turn(q, [
      (m[i] - o[0]) * HEAD_SCALE + swing[0] * s,
      (m[i + 1] - o[1]) * HEAD_SCALE + swing[1] * s,
      (m[i + 2] - o[2]) * HEAD_SCALE + swing[2] * s,
    ]);
    const n = turn(q, [m[i + 3], m[i + 4], m[i + 5]]);
    const k = m[i + 6];
    out[w] = at[0] + p[0];
    out[w + 1] = at[1] + p[1];
    out[w + 2] = at[2] + p[2];
    out[w + 3] = n[0];
    out[w + 4] = n[1];
    out[w + 5] = n[2];
    out[w + 6] = rgb[0] * k;
    out[w + 7] = rgb[1] * k;
    out[w + 8] = -1;
    out[w + 9] = rgb[2] * k;
  }
};
