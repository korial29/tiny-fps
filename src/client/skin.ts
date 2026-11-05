// The runner's body: one skin generated once per level of detail in the rest pose from rings (a
// cross-section at stations along the torso, each limb and the head), weighted to the rig's joints
// and deformed on the CPU by linear blend skinning. A limb is one tube from its root joint to its
// end, its rings shared across the joints, so it bends without a gap. Clothes are colour regions of
// the triangles. See rig.ts for the joints and the pose.
import { JOINT as J, JOINTS, rest, solve } from './rig';
import type { Quat } from './rig';
import type { Vec3 } from './mesh';

const SKIN = [0.66, 0.45, 0.35];

/** The colour regions of a palette. */
const [JACKET, TRIM, PANTS, FLESH, HAIR, UPPER, SOLE, GLOVE, SHADES] = [0, 1, 2, 3, 4, 5, 6, 7, 8];

/** Jacket, its darker trim, trousers, skin, hair, shoe upper, sole, gloves and shades. */
export const palette = (jacket: number[]): number[][] => [
  jacket,
  jacket.map(v => v * 0.5),
  [0.12, 0.13, 0.17],
  SKIN,
  [0.09, 0.07, 0.06],
  [0.74, 0.74, 0.77],
  [0.93, 0.93, 0.94],
  [0.26, 0.26, 0.3],
  [0.03, 0.03, 0.04],
];

/**
 * A ring: where it is along the loft (y, or z), the centre of its ellipse across the loft (x, then
 * z, or y), its half widths in the same order (x first), `u` its place along the loft's chain of
 * joints (its integer part the joint, the rest the blend toward the next), the colour of the strip
 * after it, then rules for that strip: [limit, colour] pairs on the angle in degrees from the loft's
 * first side, beyond a positive limit, within a negative one. A ring with no radius is a point.
 */
type Ring = number[];

interface Loft {
  rings: Ring[];
  /** The joints u runs along. */
  chain: number[];
  /** Sides around, far then near; the rings kept in the far level. */
  n: [number, number];
  far: number[];
  /** Superellipse exponent of the cross-section, 2 an ellipse. */
  e?: number;
  /** Rings run along z, not y. */
  z?: boolean;
  /** Built twice, the second time mirrored for the left side. */
  m?: boolean;
}

// Metres, rest pose, +x the runner's right, the right limbs written and the left mirrored.
// Trunk, neck: from the crotch to the collar, shoulders and neck inside the jacket's yoke.
const TRUNK: Loft = {
  chain: [J.PELVIS, J.SPINE, J.CHEST, J.NECK, J.HEAD],
  n: [8, 8],
  e: 2.3,
  far: [0, 2, 4, 6, 8, 10, 13],
  rings: [
    [0.84, 0, 0, 0, 0, 0, PANTS],
    [0.88, 0, 0.005, 0.13, 0.09, 0, PANTS],
    [0.94, 0, 0.01, 0.187, 0.108, 0, PANTS],
    [0.99, 0, 0.005, 0.18, 0.106, 0.25, TRIM],
    [1.03, 0, 0, 0.17, 0.102, 0.5, JACKET],
    [1.12, 0, 0, 0.155, 0.097, 1, JACKET],
    [1.24, 0, -0.003, 0.176, 0.112, 1.7, JACKET],
    [1.35, 0, -0.005, 0.19, 0.126, 2, JACKET],
    [1.44, 0, -0.004, 0.2, 0.116, 2, JACKET],
    [1.485, 0, 0, 0.2, 0.098, 2.05, JACKET],
    [1.512, 0, 0, 0.125, 0.08, 2.1, JACKET],
    [1.532, 0, 0, 0.07, 0.068, 2.25, TRIM],
    [1.555, 0, 0, 0.06, 0.062, 2.6, FLESH],
    [1.6, 0, 0, 0.057, 0.059, 3.5, FLESH],
  ],
};

const LEG: Loft = {
  chain: [J.PELVIS, J.THIGH_R, J.SHIN_R, J.FOOT_R],
  n: [6, 8],
  m: true,
  far: [0, 2, 4, 6, 7, 9],
  rings: [
    [1, 0.1, 0.01, 0, 0, 0, PANTS],
    [0.9, 0.1, 0.006, 0.093, 0.098, 0.5, PANTS],
    [0.72, 0.1, -0.002, 0.088, 0.09, 1, PANTS],
    [0.55, 0.1, -0.003, 0.066, 0.07, 1.25, PANTS],
    [0.49, 0.1, -0.004, 0.058, 0.064, 1.5, PANTS],
    [0.42, 0.1, 0.002, 0.056, 0.064, 1.8, PANTS],
    [0.33, 0.1, 0.012, 0.055, 0.068, 2, PANTS],
    [0.19, 0.1, 0.003, 0.04, 0.047, 2.05, PANTS],
    [0.09, 0.1, 0, 0.036, 0.04, 2.6, PANTS],
    [0.06, 0.1, 0, 0, 0, 3, PANTS],
  ],
};

const ARM: Loft = {
  chain: [J.ARM_R, J.FOREARM_R, J.HAND_R],
  n: [5, 7],
  m: true,
  far: [0, 2, 4, 6, 7, 9, 11],
  rings: [
    [1.5, 0.19, 0, 0, 0, 0, JACKET],
    [1.465, 0.192, 0, 0.052, 0.056, 0, JACKET],
    [1.38, 0.198, 0, 0.056, 0.058, 0.1, JACKET],
    [1.27, 0.21, 0, 0.049, 0.051, 0.3, JACKET],
    [1.18, 0.22, 0, 0.043, 0.046, 0.5, JACKET],
    [1.09, 0.222, -0.002, 0.046, 0.048, 0.8, JACKET],
    [0.975, 0.222, 0, 0.034, 0.034, 1.2, TRIM],
    [0.935, 0.222, 0, 0.03, 0.03, 1.8, GLOVE],
    [0.885, 0.222, -0.004, 0.027, 0.037, 2, GLOVE],
    [0.84, 0.222, -0.008, 0.029, 0.042, 2, GLOVE],
    [0.795, 0.222, -0.012, 0.025, 0.034, 2, GLOVE],
    [0.772, 0.222, -0.014, 0, 0, 2, GLOVE],
  ],
};

const SHOE: Loft = {
  chain: [J.FOOT_R, J.TOE_R],
  n: [5, 6],
  e: 2.6,
  z: true,
  m: true,
  far: [0, 1, 3, 5, 7],
  rings: [
    [0.095, 0.1, 0.05, 0, 0, 0, UPPER],
    [0.08, 0.1, 0.048, 0.032, 0.042, 0, UPPER, 130, SOLE],
    [0.03, 0.1, 0.052, 0.042, 0.052, 0.05, UPPER, 130, SOLE],
    [-0.05, 0.1, 0.04, 0.045, 0.044, 0.3, UPPER, 130, SOLE],
    [-0.12, 0.1, 0.033, 0.047, 0.034, 0.6, UPPER, 130, SOLE],
    [-0.17, 0.1, 0.028, 0.042, 0.028, 1, UPPER, 130, SOLE],
    [-0.205, 0.1, 0.024, 0.028, 0.02, 1, UPPER, 130, SOLE],
    [-0.215, 0.1, 0.022, 0, 0, 1, UPPER],
  ],
};

// A face: the jaw, the chin, the brow, shades across the eyes and a hairline that climbs from the
// nape to the crown. After a ring's colour come rules, [limit, colour] pairs on the angle in
// degrees from the first side: beyond a positive limit, within a negative one.
const HEAD: Loft = {
  chain: [J.HEAD],
  n: [7, 10],
  far: [0, 1, 3, 5, 6, 7],
  rings: [
    [1.575, 0, -0.0075, 0.034, 0.0425, 0, FLESH],
    [1.6, 0, -0.0165, 0.058, 0.0665, 0, FLESH],
    [1.635, 0, -0.0085, 0.072, 0.0785, 0, FLESH, 150, HAIR],
    [1.675, 0, -0.001, 0.08, 0.089, 0, FLESH, -36, SHADES, 110, HAIR],
    [1.71, 0, 0.0035, 0.083, 0.0935, 0, FLESH, 72, HAIR],
    [1.75, 0, 0.0065, 0.08, 0.0885, 0, HAIR],
    [1.785, 0, 0.011, 0.056, 0.061, 0, HAIR],
    [1.8, 0, 0.015, 0, 0, 0, HAIR],
  ],
};

const NOSE: Loft = {
  chain: [J.HEAD],
  n: [0, 5],
  z: true,
  far: [],
  rings: [
    [-0.075, 0, 1.675, 0.014, 0.034, 0, FLESH],
    [-0.1, 0, 1.66, 0.012, 0.024, 0, FLESH],
    [-0.115, 0, 1.649, 0, 0, 0, FLESH],
  ],
};

const LOFTS = [TRUNK, LEG, ARM, SHOE, HEAD, NOSE];

/** The rest mesh: per vertex a position and a normal, two joints and the weight of the second. */
export interface Skin {
  v: Float32Array;
  j: Uint8Array;
  w: Float32Array;
  /** Three vertex indices per triangle, and the palette colour of each. */
  t: Uint16Array;
  c: Uint8Array;
}

const sgn = (v: number, e: number) => Math.sign(v) * Math.abs(v) ** (2 / e);

const generate = (lod: number): Skin => {
  const [v, j, w, t, c]: number[][] = [[], [], [], [], []];
  for (const L of LOFTS) {
    const n = L.n[Math.min(lod, 1)];
    // The eye's own body has no head.
    if (!n || (lod > 1 && (L === HEAD || L === NOSE))) {
      continue;
    }
    // The eye's own body ends the trunk in a cap on the shoulders and each sleeve in a cuff over a
    // thin wrist, where body.ts puts a hand.
    const rings =
      lod > 1 && L === TRUNK
        ? [...L.rings.slice(0, 9), [1.455, 0, 0, 0, 0, 2, JACKET]]
        : lod > 1 && L === ARM
          ? [
              ...L.rings.slice(0, 7),
              [0.95, 0.222, 0, 0.037, 0.037, 1.6, GLOVE],
              [0.925, 0.222, 0, 0.027, 0.027, 2, GLOVE],
              [0.91, 0.222, 0, 0, 0, 2, GLOVE],
            ]
          : lod
            ? L.rings
            : L.far.map(i => L.rings[i]);
    const up = rings[rings.length - 1][0] > rings[0][0];
    for (const m of L.m ? [1, -1] : [1]) {
      /** The left joints are the right ones' four ids before. */
      const side = (a: number) => (m < 0 && a > J.HEAD ? a - 4 : a);
      const grid = rings.map(([at, cx, co, rx, ro, u]) => {
        const k = Math.min(Math.floor(u), L.chain.length - 2);
        const row: number[] = [];
        for (let i = 0; i < (rx ? n : 1); i++) {
          const a = (i * 2 * Math.PI) / n;
          const [x, o] = [
            cx + rx * sgn(Math.sin(a), L.e ?? 2),
            co + ro * sgn(Math.cos(a), L.e ?? 2),
          ];
          v.push(m * x, ...(L.z ? [o, at] : [at, -o]), 0, 0, 0);
          j.push(side(L.chain[Math.max(k, 0)]), side(L.chain[k + 1] ?? L.chain[0]));
          w.push(k < 0 || L.chain[k + 1] === undefined ? 0 : u - k);
          row.push(w.length - 1);
        }
        return row;
      });
      grid.slice(1).forEach((b, k) => {
        const a = grid[k];
        const [, , , , , , col, ...rules] = rings[k];
        for (let i = 0; i < n; i++) {
          const [p, q, r, s] = [
            a[i % a.length],
            a[(i + 1) % a.length],
            b[(i + 1) % b.length],
            b[i % b.length],
          ];
          const angle = Math.abs(((((i + 0.5) / n) * 360 + 180) % 360) - 180);
          const h = rules.findIndex((l, g) => !(g % 2) && (l > 0 ? angle > l : angle < -l));
          for (const tri of [
            [p, q, r],
            [p, r, s],
          ]) {
            if (new Set(tri).size > 2) {
              t.push(...(up !== m < 0 ? [tri[0], tri[2], tri[1]] : tri));
              c.push(h < 0 ? col : rules[h + 1]);
            }
          }
        }
      });
    }
  }
  // Smooth normals: the area-weighted mean of the triangles around a vertex.
  for (let i = 0; i < t.length; i += 3) {
    const [a, b, d] = [t[i], t[i + 1], t[i + 2]].map(k => k * 6);
    const e = [0, 1, 2].map(r => [v[b + r] - v[a + r], v[d + r] - v[a + r]]);
    const f = [
      e[1][0] * e[2][1] - e[2][0] * e[1][1],
      e[2][0] * e[0][1] - e[0][0] * e[2][1],
      e[0][0] * e[1][1] - e[1][0] * e[0][1],
    ];
    for (const k of [a, b, d]) {
      for (let r = 0; r < 3; r++) {
        v[k + 3 + r] += f[r];
      }
    }
  }
  for (let k = 0; k < v.length; k += 6) {
    const l = Math.hypot(v[k + 3], v[k + 4], v[k + 5]) || 1;
    for (let r = 3; r < 6; r++) {
      v[k + r] /= l;
    }
  }
  return {
    v: new Float32Array(v),
    j: new Uint8Array(j),
    w: new Float32Array(w),
    t: new Uint16Array(t),
    c: new Uint8Array(c),
  };
};

const skins: Skin[] = [];
/** The skin at a level of detail (see DETAIL in mesh.ts): 0 far, 1 near, 2 near, headless and handless, for the eye. Built once. */
export const body = (lod: number) => (skins[lod] ??= generate(lod));

const BIND = solve(rest()).pos;
/** Per joint the rotation matrix and the translation that carry the rest pose to the pose. */
const M = new Float64Array(JOINTS * 12);
let Q = new Float32Array(0);

/**
 * Appends the skin in the pose `solved` (see solve()) to `out` as triangles in the renderer's
 * vertex format, each in its palette colour: a vertex goes where the two joints it hangs on would
 * carry it, mixed by the weights, its normal turned the same way.
 */
export const skin = (
  out: number[],
  s: Skin,
  { pos, rot }: { pos: Vec3[]; rot: Quat[] },
  colors: number[][],
) => {
  for (let k = 0; k < JOINTS; k++) {
    const [x, y, z, w] = rot[k];
    const m = [
      1 - 2 * (y * y + z * z),
      2 * (x * y - z * w),
      2 * (x * z + y * w),
      2 * (x * y + z * w),
      1 - 2 * (x * x + z * z),
      2 * (y * z - x * w),
      2 * (x * z - y * w),
      2 * (y * z + x * w),
      1 - 2 * (x * x + y * y),
    ];
    for (let r = 0; r < 3; r++) {
      M.set(m.slice(r * 3, r * 3 + 3), k * 12 + r * 3);
      M[k * 12 + 9 + r] =
        pos[k][r] - (m[r * 3] * BIND[k][0] + m[r * 3 + 1] * BIND[k][1] + m[r * 3 + 2] * BIND[k][2]);
    }
  }
  const n = s.w.length;
  if (Q.length < n * 6) {
    Q = new Float32Array(n * 6);
  }
  for (let i = 0; i < n; i++) {
    const [a, b, u, k] = [s.j[i * 2] * 12, s.j[i * 2 + 1] * 12, s.w[i], i * 6];
    for (let r = 0; r < 6; r++) {
      const [o, h] = [(r % 3) * 3, r < 3 ? k : k + 3];
      const [x, y, z, e] = [s.v[h], s.v[h + 1], s.v[h + 2], r < 3 ? 1 : 0];
      Q[k + r] =
        (1 - u) * (M[a + o] * x + M[a + o + 1] * y + M[a + o + 2] * z + e * M[a + 9 + (r % 3)]) +
        u * (M[b + o] * x + M[b + o + 1] * y + M[b + o + 2] * z + e * M[b + 9 + (r % 3)]);
    }
    const l = Math.sqrt(Q[k + 3] ** 2 + Q[k + 4] ** 2 + Q[k + 5] ** 2) || 1;
    Q[k + 3] /= l;
    Q[k + 4] /= l;
    Q[k + 5] /= l;
  }
  for (let i = 0; i < s.t.length; i += 3) {
    const [r, g, b] = colors[s.c[i / 3]];
    for (let h = i; h < i + 3; h++) {
      const k = s.t[h] * 6;
      out.push(Q[k], Q[k + 1], Q[k + 2], Q[k + 3], Q[k + 4], Q[k + 5], r, g, -1, b);
    }
  }
};
