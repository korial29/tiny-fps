// The runner's body: one closed surface generated once per level of detail in the rest pose from
// rings (a cross-section at stations along the trunk, each limb), weighted to the rig's joints and
// deformed on the CPU by dual quaternion skinning, which keeps the volume of a bent joint. The
// trunk runs from the crotch to the crown; the arms hang on it at the armpits and the legs at the
// crotch by sharing its vertices, so normals flow over the joins. Clothes are colour regions of
// the triangles. See rig.ts for the joints and the pose.
import { LIMB } from '../shared/types';
import { JOINT as J, JOINTS, mul, rest, solve, turn } from './rig';
import type { Quat } from './rig';
import type { Vec3 } from './mesh';

const SKIN = [0.66, 0.45, 0.35];

/** The colour regions of a palette. */
const [JACKET, TRIM, PANTS, FLESH, HAIR, UPPER, SOLE, GLOVE, WHITE, IRIS, CAP] = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
];

/** Hair colours, one per runner (hairOf()): black, dark and mid brown, chestnut, red, dark and light blond, grey. */
const HAIRS = [
  [0.03, 0.03, 0.035],
  [0.09, 0.07, 0.06],
  [0.2, 0.12, 0.07],
  [0.36, 0.18, 0.08],
  [0.55, 0.16, 0.06],
  [0.58, 0.43, 0.2],
  [0.86, 0.72, 0.44],
  [0.6, 0.6, 0.58],
];

/** A hair colour for the runner `id`, picked at random from HAIRS but the same for everyone who sees him. */
export const hairOf = (id: number): number[] =>
  HAIRS[(Math.imul(id + 1, 0x9e3779b1) >>> 29) % HAIRS.length];

/** Jacket, its darker trim, trousers, skin, hair, shoe upper, sole, gloves, the whites of the eyes and their irises, and the cut's cauterized face, which glows. */
export const palette = (jacket: number[], hair = HAIRS[1]): number[][] => [
  jacket,
  jacket.map(v => v * 0.5),
  [0.12, 0.13, 0.17],
  SKIN,
  hair,
  [0.74, 0.74, 0.77],
  [0.93, 0.93, 0.94],
  [0.26, 0.26, 0.3],
  [0.85, 0.83, 0.8],
  [0.1, 0.06, 0.04],
  [2.8, 0.5, 0.12],
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
// Trunk: from the crotch to the crown. Its first ring is the pelvis, whose halves are the tops of
// the legs. Two rings at the armpits' height, 10 cm under the shoulder joint, are the split: the
// first is the torso alone, the second takes in the shoulders, and the sleeves hang from the
// shoulders' sides, ending in the torso's own side vertices.
const TRUNK: Loft = {
  chain: [J.PELVIS, J.SPINE, J.CHEST, J.NECK, J.HEAD],
  n: [8, 12],
  e: 2.3,
  far: [0, 2, 4, 6, 7, 9, 12, 14, 15, 17, 19, 21],
  rings: [
    [0.93, 0, 0.01, 0.187, 0.108, 0, PANTS],
    [0.99, 0, 0.005, 0.18, 0.106, 0.25, TRIM],
    [1.03, 0, 0, 0.17, 0.102, 0.5, JACKET],
    [1.12, 0, 0, 0.155, 0.097, 1, JACKET],
    [1.24, 0, -0.003, 0.176, 0.112, 1.7, JACKET],
    [1.3, 0, -0.004, 0.182, 0.12, 1.85, JACKET],
    [1.37, 0, -0.005, 0.186, 0.124, 2, JACKET],
    [1.37, 0, -0.005, 0.264, 0.124, 2, JACKET],
    [1.41, 0, -0.005, 0.268, 0.123, 2, JACKET],
    [1.45, 0, -0.004, 0.26, 0.114, 2, JACKET],
    [1.485, 0, 0, 0.235, 0.098, 2.05, JACKET],
    [1.502, 0, 0, 0.185, 0.09, 2.08, JACKET],
    [1.512, 0, 0, 0.125, 0.08, 2.1, JACKET],
    [1.532, 0, 0, 0.07, 0.068, 2.25, TRIM],
    [1.555, 0, 0, 0.06, 0.062, 2.6, FLESH],
    // The head: the jaw, the chin, the brow, shades across the eyes and a hairline that climbs from
    // the nape to the crown.
    [1.6, 0, -0.0165, 0.058, 0.0665, 3.5, FLESH],
    [1.635, 0, -0.0085, 0.072, 0.0785, 4, FLESH, 150, HAIR],
    [1.675, 0, -0.001, 0.08, 0.089, 4, FLESH, 110, HAIR],
    [1.71, 0, 0.0035, 0.083, 0.0935, 4, FLESH, 72, HAIR],
    [1.75, 0, 0.0065, 0.08, 0.0885, 4, HAIR],
    [1.785, 0, 0.011, 0.056, 0.061, 4, HAIR],
    [1.8, 0, 0.015, 0, 0, 4, HAIR],
  ],
};

// A leg to the sole: the shoe is its last rings. Its first ring is the pelvis' half, and it is not
// written here.
const LEG: Loft = {
  chain: [J.PELVIS, J.THIGH_R, J.SHIN_R, J.FOOT_R, J.TOE_R],
  n: [6, 8],
  m: true,
  far: [0, 2, 4, 6, 8, 10, 12, 14],
  rings: [
    [0.93, 0.1, 0, 0, 0, 0, PANTS],
    [0.85, 0.1, 0.006, 0.093, 0.098, 0.6, PANTS],
    [0.72, 0.1, -0.002, 0.088, 0.09, 1, PANTS],
    [0.55, 0.1, -0.003, 0.066, 0.07, 1.25, PANTS],
    [0.49, 0.1, -0.004, 0.058, 0.064, 1.5, PANTS],
    [0.42, 0.1, 0.002, 0.056, 0.064, 1.8, PANTS],
    [0.33, 0.1, 0.012, 0.055, 0.068, 2, PANTS],
    [0.19, 0.1, 0.003, 0.04, 0.047, 2.05, PANTS],
    [0.105, 0.1, 0, 0.038, 0.045, 2.3, UPPER],
    [0.085, 0.1, 0.0025, 0.038, 0.0425, 2.5, UPPER],
    [0.065, 0.1, 0.02, 0.043, 0.098, 3, UPPER],
    [0.045, 0.1, 0.039, 0.046, 0.133, 3, UPPER],
    [0.026, 0.1, 0.059, 0.046, 0.149, 3, SOLE],
    [0.008, 0.1, 0.062, 0.03, 0.138, 3, SOLE],
    [0, 0.1, 0.062, 0, 0, 3, SOLE],
  ],
};

// A sleeve to the glove. Its first ring is the shoulder's, and it is not written here either.
const ARM: Loft = {
  chain: [J.ARM_R, J.FOREARM_R, J.HAND_R],
  n: [0, 0],
  m: true,
  far: [0, 2, 4, 5, 6, 8, 10],
  rings: [
    [1.37, 0.222, 0, 0, 0, 0, JACKET],
    [1.3, 0.222, 0, 0.053, 0.056, 0.1, JACKET],
    [1.22, 0.222, 0, 0.049, 0.052, 0.2, JACKET],
    [1.18, 0.222, 0, 0.043, 0.046, 0.5, JACKET],
    [1.09, 0.222, -0.002, 0.046, 0.048, 0.8, JACKET],
    [0.975, 0.222, 0, 0.034, 0.034, 1.2, TRIM],
    [0.935, 0.222, 0, 0.03, 0.03, 1.8, GLOVE],
    [0.885, 0.222, -0.004, 0.027, 0.037, 2, GLOVE],
    [0.84, 0.222, -0.008, 0.029, 0.042, 2, GLOVE],
    [0.795, 0.222, -0.012, 0.025, 0.034, 2, GLOVE],
    [0.772, 0.222, -0.014, 0, 0, 2, GLOVE],
  ],
};

/** The ring where the eye's sleeve ends in the glove, which body.ts starts the palm on, and its sides. */
export const CUFF = [0.925, 0.222, 0, 0.027, 0.027, 2, GLOVE];
export const CUFF_SIDES = TRUNK.n[1] - 4;

// The eyes are small pieces of their own, the left the right one mirrored, buried in the face: a
// white almond with a dark iris at its front.
const EYE: Loft = {
  chain: [J.HEAD],
  n: [0, 5],
  z: true,
  m: true,
  far: [],
  rings: [
    [-0.07, 0.031, 1.692, 0.0145, 0.0088, 0, WHITE],
    [-0.088, 0.031, 1.692, 0.0145, 0.0088, 0, WHITE],
    [-0.0915, 0.031, 1.692, 0.0105, 0.0072, 0, IRIS],
    [-0.0932, 0.031, 1.692, 0.0055, 0.0055, 0, IRIS],
    [-0.094, 0.031, 1.692, 0, 0, 0, IRIS],
  ],
};

// The nose is a small piece of its own, buried in the face.
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

const LOFTS = [TRUNK, LEG, ARM, NOSE, EYE];

/** The rest mesh: per vertex a position and a normal, two joints and the weight of the second. */
export interface Skin {
  v: Float32Array;
  j: Uint8Array;
  w: Float32Array;
  /** Three vertex indices per triangle, and the palette colour of each. */
  t: Uint16Array;
  c: Uint8Array;
  /** Per triangle the LIMB it comes off with, NONE for the trunk's. */
  l?: Uint8Array;
}

const sgn = (v: number, e: number) => Math.sign(v) * Math.abs(v) ** (2 / e);
const clamp = (v: number) => Math.min(Math.max(v, 0), 1);

const generate = (lod: number): Skin => {
  const [v, j, w, t, c, l]: number[][] = [[], [], [], [], [], []];
  const N = TRUNK.n[Math.min(lod, 1)];
  /** The back vertex of a ring, and the last of the shoulder's side. */
  const [H, A] = [N / 2, N / 2 - 1];
  /** The trunk's rows of vertices, where it splits, and the crotch vertices both legs share. */
  let T: number[][] = [];
  let S = 0;
  const crotch: number[] = [];
  const put = (p: number[], a: number, b: number, k: number) => {
    v.push(...p, 0, 0, 0);
    j.push(a, b);
    w.push(k);
    return w.length - 1;
  };
  for (const L of LOFTS) {
    const n = L === ARM ? N - 4 : L.n[Math.min(lod, 1)];
    // The eye's own body has no head.
    if (!n || (lod > 1 && (L === NOSE || L === EYE))) {
      continue;
    }
    // The eye's own body ends the trunk in a cap on the shoulders and each sleeve in a cuff over a
    // thin wrist, where body.ts puts a hand.
    const rings =
      lod > 1 && L === TRUNK
        ? [...L.rings.slice(0, 10), [1.462, 0, 0, 0, 0, 2, JACKET]]
        : lod > 1 && L === ARM
          ? [
              ...L.rings.slice(0, 6),
              [0.95, 0.222, 0, 0.037, 0.037, 1.6, GLOVE],
              CUFF,
              [0.91, 0.222, 0, 0, 0, 2, GLOVE],
            ]
          : lod
            ? L.rings
            : L.far.map(i => L.rings[i]);
    const up = rings[rings.length - 1][0] > rings[0][0];
    if (L === TRUNK) {
      S = rings.findIndex((r, i) => i && r[0] == rings[i - 1][0]);
    }
    for (const m of L.m ? [1, -1] : [1]) {
      /** The left joints are the right ones' four ids before. */
      const side = (b: number) => (m < 0 && b > J.HEAD ? b - 4 : b);
      /** A vertex of a trunk row, seen from this side. */
      const col = (row: number[], i: number) => row[m < 0 ? (N - i) % N : i];
      const vertex = (x: number, y: number, z: number, u: number) => {
        // The toe bends the front of the foot.
        u = L === LEG && y < 0.12 ? 3 + clamp((-z - 0.04) / 0.14) : u;
        const g = Math.min(Math.floor(u), L.chain.length - 2);
        // The shoulder's side follows the arm.
        const q =
          L === TRUNK
            ? clamp((Math.abs(x) - 0.14) / 0.1) *
              clamp((1.53 - y) / 0.15) *
              clamp((y - 1.35) / 0.02)
            : 0;
        return q
          ? put([x, y, z], J.CHEST, x < 0 ? J.ARM_L : J.ARM_R, q)
          : put(
              [x, y, z],
              side(L.chain[Math.max(g, 0)]),
              side(L.chain[g + 1] ?? L.chain[0]),
              g < 0 ? 0 : u - g,
            );
      };
      const grid = rings.map(([at, cx, co, rx, ro, u], r) => {
        const row: number[] = [];
        if (!r && L === ARM) {
          // The shoulder's side, then the torso's own side vertices, from the back to the front.
          for (let i = 1; i <= A; i++) {
            row.push(col(T[S], i));
          }
          for (let i = A - 1; i > 1; i--) {
            row.push(col(T[S - 1], i));
          }
        } else if (!r && L === LEG) {
          // The pelvis' half, then the crotch from its back to its front.
          for (let i = 0; i <= H; i++) {
            row.push(col(T[0], i));
          }
          const [f, b] = [T[0][0] * 6, T[0][H] * 6];
          for (let i = 0; i < n - H - 1; i++) {
            const g = (i + 1) / (n - H);
            crotch[i] ??= put(
              [0, 1, 2].map(k => v[b + k] + (v[f + k] - v[b + k]) * g - (k == 1 ? 0.04 : 0)),
              J.PELVIS,
              J.PELVIS,
              0,
            );
            row.push(crotch[i]);
          }
          // Turned to start at the side, as the next ring does, so the strip does not twist.
          row.push(row.shift()!);
        } else {
          for (let i = 0; i < (rx ? n : 1); i++) {
            // The torso's ring at the split gets its other vertices from the shoulders' ring.
            if (L === TRUNK && r == S - 1 && !(i > 1 && i < A) && !(i > N - A && i < N - 1)) {
              row.push(-1);
              continue;
            }
            const q = (i * 2 * Math.PI) / n;
            // The shoe is squarer than the leg, so its toe is not a point.
            const e = (L.e ?? 2) * (L === LEG && at < 0.12 ? 2 : 1);
            const [x, o] = [cx + rx * sgn(Math.sin(q), e), co + ro * sgn(Math.cos(q), e)];
            row.push(L.z ? vertex(m * x, o, at, u) : vertex(m * x, at, -o, u));
          }
        }
        return row;
      });
      if (L === TRUNK) {
        grid[S - 1] = grid[S - 1].map((k, i) => (k < 0 ? grid[S][i] : k));
        T = grid;
      }
      grid.slice(1).forEach((b, k) => {
        if (L === TRUNK && k == S - 1) {
          return;
        }
        const a = grid[k];
        const [y, , , , , , col, ...rules] = rings[k];
        // The head comes off at the neck, an arm at the shoulder, a leg at the hip: where its loft
        // meets the trunk.
        const part =
          L === TRUNK
            ? +(y > 1.55)
            : L === NOSE || L === EYE
              ? LIMB.HEAD
              : (L === ARM ? LIMB.ARM_L : LIMB.LEG_L) + +(m > 0);
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
              l.push(part);
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
    l: new Uint8Array(l),
  };
};

const skins: Skin[] = [];
/** The skin at a level of detail (see DETAIL in mesh.ts): 0 far, 1 near, 2 near, headless and handless, for the eye. Built once. */
export const body = (lod: number) => (skins[lod] ??= generate(lod));

/** Per LIMB the joint the centre of its cut face hangs on. */
const ROOT = [0, J.NECK, J.CHEST, J.CHEST, J.PELVIS, J.PELVIS];

/**
 * The skin less a limb, and the limb alone. The edges of the limb's triangles whose other side is
 * the body's are the cut; a fan from one new vertex at its middle closes each side in CAP.
 */
const sever = (s: Skin, limb: number): Skin[] => {
  const n = s.w.length;
  const [t, c]: number[][][] = [
    [[], []],
    [[], []],
  ];
  const [own, other] = [new Set<number>(), new Set<number>()];
  s.c.forEach((col, i) => {
    const k = +(s.l![i] == limb);
    for (let e = 0; e < 3; e++) {
      t[k].push(s.t[i * 3 + e]);
      [other, own][k].add((s.t[i * 3 + e] << 16) | s.t[i * 3 + ((e + 1) % 3)]);
    }
    c[k].push(col);
  });
  const v = new Float32Array(n * 6 + 6);
  v.set(s.v);
  let m = 0;
  for (const e of own) {
    const [a, b] = [e >> 16, e & 65535];
    // The nose's base is open, buried in the face: no other side, no cut.
    if (other.has((b << 16) | a)) {
      t[0].push(a, b, n);
      t[1].push(b, a, n);
      c[0].push(CAP);
      c[1].push(CAP);
      for (let r = 0; r < 3; r++) {
        v[n * 6 + r] += s.v[a * 6 + r];
      }
      m++;
    }
  }
  for (let r = 0; r < 3; r++) {
    v[n * 6 + r] /= m;
  }
  v[n * 6 + 4] = 1;
  const j = new Uint8Array([...s.j, ROOT[limb], ROOT[limb]]);
  const w = new Float32Array([...s.w, 0]);
  return t.map((x, k) => ({ v, j, w, t: new Uint16Array(x), c: new Uint8Array(c[k]) }));
};

const parts: Skin[][] = [];
/**
 * The skin at a level of detail without the LIMB `limb`, then the limb alone, each closed by a
 * glowing cut face whose middle is the last vertex of the last triangle. Built once.
 */
export const cut = (lod: number, limb: number) =>
  (parts[lod * 8 + limb] ??= sever(body(lod), limb));

const BIND = solve(rest()).pos;
/** Per joint the dual quaternion that carries the rest pose to the pose: the rotation, then its dual. */
const D = new Float64Array(JOINTS * 8);
const E = new Float64Array(8);
let Q = new Float32Array(0);

/**
 * Appends the skin in the pose `solved` (see solve()) to `out` as triangles in the renderer's
 * vertex format, each in its palette colour: a vertex goes where the two joints it hangs on would
 * carry it, their dual quaternions mixed by the weights (so a bent joint keeps its thickness), its
 * normal turned the same way.
 */
export const skin = (
  out: number[],
  s: Skin,
  { pos, rot }: { pos: Vec3[]; rot: Quat[] },
  colors: number[][],
) => {
  for (let k = 0; k < JOINTS; k++) {
    const t = turn(rot[k], BIND[k]);
    D.set(rot[k], k * 8);
    D.set(
      mul([(pos[k][0] - t[0]) / 2, (pos[k][1] - t[1]) / 2, (pos[k][2] - t[2]) / 2, 0], rot[k]),
      k * 8 + 4,
    );
  }
  const n = s.w.length;
  if (Q.length < n * 6) {
    Q = new Float32Array(n * 6);
  }
  for (let i = 0; i < n; i++) {
    const [a, b, u, k] = [s.j[i * 2] * 8, s.j[i * 2 + 1] * 8, s.w[i], i * 6];
    // The shorter way round.
    const f =
      D[a] * D[b] + D[a + 1] * D[b + 1] + D[a + 2] * D[b + 2] + D[a + 3] * D[b + 3] < 0 ? -u : u;
    for (let r = 0; r < 8; r++) {
      E[r] = (1 - u) * D[a + r] + f * D[b + r];
    }
    const l = Math.hypot(E[0], E[1], E[2], E[3]);
    for (let r = 0; r < 8; r++) {
      E[r] /= l;
    }
    // The translation is twice the dual part times the rotation's conjugate.
    const m = [
      E[3] * E[4] - E[7] * E[0] - (E[5] * E[2] - E[6] * E[1]),
      E[3] * E[5] - E[7] * E[1] - (E[6] * E[0] - E[4] * E[2]),
      E[3] * E[6] - E[7] * E[2] - (E[4] * E[1] - E[5] * E[0]),
    ];
    for (const h of [k, k + 3]) {
      const [x, y, z] = [s.v[h], s.v[h + 1], s.v[h + 2]];
      const [p, q, r] = [E[1] * z - E[2] * y, E[2] * x - E[0] * z, E[0] * y - E[1] * x];
      const e = h == k ? 2 : 0;
      Q[h] = x + 2 * (E[3] * p + E[1] * r - E[2] * q) + e * m[0];
      Q[h + 1] = y + 2 * (E[3] * q + E[2] * p - E[0] * r) + e * m[1];
      Q[h + 2] = z + 2 * (E[3] * r + E[0] * q - E[1] * p) + e * m[2];
    }
  }
  for (let i = 0; i < s.t.length; i += 3) {
    const [r, g, b] = colors[s.c[i / 3]];
    // The cut's face glows: unlit.
    const e = s.c[i / 3] == CAP ? -2 : -1;
    for (let h = i; h < i + 3; h++) {
      const k = s.t[h] * 6;
      out.push(Q[k], Q[k + 1], Q[k + 2], Q[k + 3], Q[k + 4], Q[k + 5], r, g, e, b);
    }
  }
};
