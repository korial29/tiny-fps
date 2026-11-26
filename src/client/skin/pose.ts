import { BUILD, JOINT as J, JOINTS, RESTS, mul, rest, solve, turn } from '../rig';
import type { Quat } from '../rig';
import type { Vec3 } from '../mesh';
import { CH, CHANNELS, eyes, KIND } from '../features';
import { room } from '../verts';
import type { Out } from '../verts';

import {
  FLESH,
  LIP,
  SHADE,
  STUBBLE,
  LINE,
  GLINT,
  CAP,
  BLUSH,
  INNER,
  fem,
  female,
  bell,
  clamp,
} from './head';
import { SWING_R } from './lofts';
import type { Skin } from './lofts';
import { shape } from './shape';

/**
 * Per joint how the woman's parts scale about it from the man's (across, along y, in depth), the
 * skin's two swing joints last: a narrower waist and ribs on hips a little wider, a slimmer neck,
 * a head 4 % smaller, slimmer and shorter arms, smaller hands, slimmer shins, smaller feet.
 */
export const SCALE: number[][] = (() => {
  const [arm, fore, hand] = [
    [0.86, 0.275 / 0.29, 0.86],
    [0.85, 0.25 / 0.26, 0.85],
    [0.9, 0.92, 0.9],
  ];
  const [thigh, shin, foot] = [
    [1, 1, 1],
    [0.93, 1, 0.93],
    [0.9, 1, 0.92],
  ];
  const chest = [0.89, 0.95, 0.9];
  return [
    [1.04, 1, 1],
    [0.87, 0.115 / 0.12, 0.88],
    chest,
    [0.86, 0.955, 0.86],
    [0.96, 0.96, 0.96],
    ...[chest, arm, fore, hand],
    ...[chest, arm, fore, hand],
    ...[thigh, shin, foot, foot],
    ...[thigh, shin, foot, foot],
    arm,
    arm,
  ];
})();

/**
 * The woman's skin from the man's, vertex for vertex (the same triangles, weights and channels):
 * her volumes are shaped on his rest mesh (a bust under the ribs' line, hips and buttocks fuller,
 * the waist drawn in higher), then each vertex goes where its joints' own scales about their binds
 * carry it, mixed by its weights, onto her skeleton (RESTS). The man's mesh is kept as `u`.
 */
export const retarget = (s: Skin, build: number): Skin => {
  const n = s.w.length;
  const v = s.v.slice();
  const [from, to] = [BINDS[0], BINDS[build]];
  const ARMS: number[] = [J.ARM_L, J.FOREARM_L, J.HAND_L, J.ARM_R, J.FOREARM_R, J.HAND_R];
  /** The mix of the two joints' scales at vertex i. */
  const scaleAt = (i: number) => {
    const [a, b, w] = [s.j[2 * i], s.j[2 * i + 1], s.w[i]];
    return [0, 1, 2].map(r => SCALE[a][r] * (1 - w) + SCALE[b][r] * w);
  };
  for (let i = 0; i < n; i++) {
    const [a, b, w] = [s.j[2 * i], s.j[2 * i + 1], s.w[i]];
    const p = [v[i * 6], v[i * 6 + 1], v[i * 6 + 2]];
    const [nx, , nz] = [v[i * 6 + 3], v[i * 6 + 4], v[i * 6 + 5]];
    const arm = +ARMS.includes(a) * (1 - w) + +ARMS.includes(b) * w;
    if (s.g[i] == KIND.BODY && arm < 0.5) {
      const [ax, y, sx] = [Math.abs(p[0]), p[1], Math.sign(p[0])];
      const k = 1 - arm * 2;
      // The bust: fullest at BUST_Y, a firm line under it, a slope above it to the collarbones.
      p[2] -=
        k *
        BUST *
        clamp(-nz * 1.6) *
        bell(ax - 0.066, 0.05) *
        bell(y - BUST_Y, y < BUST_Y ? 0.042 : 0.065);
      // The buttocks, and the hips out at the sides; the waist in under the ribs.
      p[2] += k * 0.012 * clamp(nz * 1.6) * bell(ax - 0.085, 0.07) * bell(y - 0.94, 0.075);
      p[0] +=
        k *
        sx *
        clamp(Math.abs(nx) * 1.4) *
        (0.009 * bell(y - 0.93, 0.075) - 0.006 * bell(y - 1.175, 0.05));
    }
    for (let r = 0; r < 3; r++) {
      v[i * 6 + r] =
        (1 - w) * (to[a][r] + SCALE[a][r] * (p[r] - from[a][r])) +
        w * (to[b][r] + SCALE[b][r] * (p[r] - from[b][r]));
    }
  }
  // Her normals: the area-weighted mean of the triangles round each vertex, as the man's are made.
  const N = new Float32Array(n * 3);
  for (let i = 0; i < s.t.length; i += 3) {
    const [a, b, d] = [s.t[i] * 6, s.t[i + 1] * 6, s.t[i + 2] * 6];
    const [ux, uy, uz] = [v[b] - v[a], v[b + 1] - v[a + 1], v[b + 2] - v[a + 2]];
    const [wx, wy, wz] = [v[d] - v[a], v[d + 1] - v[a + 1], v[d + 2] - v[a + 2]];
    const f = [uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx];
    for (const k of [a, b, d]) {
      N[k / 2] += f[0];
      N[k / 2 + 1] += f[1];
      N[k / 2 + 2] += f[2];
    }
  }
  for (let i = 0; i < n; i++) {
    const l = Math.hypot(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]);
    // A vertex of no triangle (a cut's middle) keeps its own.
    if (l > 0) {
      for (let r = 0; r < 3; r++) {
        v[i * 6 + 3 + r] = N[i * 3 + r] / l;
      }
    }
  }
  // The channels' shifts go with their vertices' scale: the head's, all one.
  const m = s.m.map(({ i, d }) => {
    const e = d.slice();
    i.forEach((k, h) => {
      const sc = scaleAt(k);
      for (let r = 0; r < 3; r++) {
        e[h * 6 + r] *= sc[r];
      }
    });
    return { i, d: e };
  });
  return { ...s, v, m, b: build, u: s.v };
};

/** How far out the woman's bust stands at its fullest, on the man's rest mesh, metres. */
export const BUST = 0.028;
/** Where it is fullest, metres up (the user, 2026-11-11: a little higher; it was 1.345). */
export const BUST_Y = 1.37;

/** How much larger her eyes are than his. */
export const EYES = 0.09;

export const generate = (lod: number, build: number, xeno = false): Skin => {
  female(+(build == BUILD.FEMALE));
  eyes(1 + EYES * fem);
  try {
    const s = shape(lod, xeno);
    return build ? retarget(s, build) : s;
  } finally {
    female(0);
    eyes();
  }
};

export const skins: Skin[] = [];
/**
 * The skin at a level of detail: 0 far, 1 near (see DETAIL in mesh.ts), 2 near, headless, for the
 * eye, 3 close (CLOSE in render.ts), twice the rings and half more sides, the face carved finest.
 * Only the far one has hands, mittens: the others end at the wrists, where hands() goes. Built once.
 */
export const body = (lod: number, build = 0) => (skins[lod + 4 * build] ??= generate(lod, build));
/** The xenomorph's skin at a level of detail, as body()'s: on the man's joints and binds, no face. */
export const beast = (lod: number) => (skins[lod + 8] ??= generate(lod, 0, true));

/** Per LIMB the joint the centre of its cut face hangs on. */
export const ROOT = [0, J.NECK, J.CHEST, J.CHEST, J.PELVIS, J.PELVIS];

/**
 * The skin less a limb, and the limb alone. The edges of the limb's triangles whose other side is
 * the body's are the cut; a fan from one new vertex at its middle closes each side in CAP.
 */
export const sever = (s: Skin, limb: number): Skin[] => {
  const n = s.w.length;
  const [t, c, c2, cm]: number[][][] = [
    [[], []],
    [[], []],
    [[], []],
    [[], []],
  ];
  const [own, other] = [new Set<number>(), new Set<number>()];
  s.l!.forEach((part, i) => {
    const k = +(part == limb);
    for (let e = 0; e < 3; e++) {
      t[k].push(s.t[i * 3 + e]);
      c[k].push(s.c[i * 3 + e]);
      c2[k].push(s.c2[i * 3 + e]);
      cm[k].push(s.cm[i * 3 + e]);
      [other, own][k].add((s.t[i * 3 + e] << 16) | s.t[i * 3 + ((e + 1) % 3)]);
    }
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
      for (const k of [0, 1]) {
        c[k].push(CAP, CAP, CAP);
        c2[k].push(0, 0, 0);
        cm[k].push(0, 0, 0);
      }
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
  const o = new Float32Array([...s.o, 1]);
  const g = new Uint8Array([...s.g, 0]);
  // The man's mesh under another build's, with the cut's middle too.
  const u = s.u && new Float32Array(n * 6 + 6);
  u?.set(s.u!);
  u?.set(v.subarray(n * 6), n * 6);
  return t.map((x, k) => ({
    v,
    o,
    j,
    w,
    g,
    b: s.b,
    u,
    m: s.m,
    t: new Uint16Array(x),
    c: new Uint8Array(c[k]),
    c2: new Uint8Array(c2[k]),
    cm: new Float32Array(cm[k]),
  }));
};

export const parts: Skin[][] = [];
/**
 * The skin at a level of detail without the LIMB `limb`, then the limb alone, each closed by a
 * glowing cut face whose middle is the last vertex of the last triangle. Built once.
 */
export const cut = (lod: number, limb: number, build = 0) =>
  (parts[(lod + 4 * build) * 8 + limb] ??= sever(body(lod, build), limb));

/** Per BUILD the joints' places at rest, the skin's two swing joints (the shoulders') last. */
export const BINDS = RESTS.map((_, build) => {
  const b = solve(rest([0, 0, 0], 0, build)).pos;
  return [...b, b[J.ARM_R], b[J.ARM_L]];
});
/** A build's joints at rest (solve() of its rest pose), for what is placed on its body. */
export const bindOf = (build = 0) => BINDS[build];

/**
 * The upper arm of shoulder joint `j` in the world without its turn about itself: the swing of
 * its rotation from the collarbone's, about the bone's rest axis, on the collarbone's.
 */
export const swing = (rot: Quat[], j: number, build = 0): Quat => {
  const c = rot[j - 1];
  const l = mul([-c[0], -c[1], -c[2], c[3]], rot[j]);
  const b = RESTS[build][j + 1];
  const n = Math.hypot(...b);
  const p = (l[0] * b[0] + l[1] * b[1] + l[2] * b[2]) / (n * n);
  const t = [b[0] * p, b[1] * p, b[2] * p, l[3]];
  const h = Math.hypot(...t) || 1;
  return mul(c, mul(l, [-t[0] / h, -t[1] / h, -t[2] / h, t[3] / h]));
};
/** The inside of an open mouth. */
export const MOUTH = [0.09, 0.03, 0.03];

/**
 * The posed vertices `r` lists (Q) relaxed: drawn toward the mean of their neighbours, the
 * shrinking undone every other pass (Taubin), then their normals the area-weighted mean of their
 * triangles' again.
 */
export const relax = (s: Skin, r: NonNullable<Skin['r']>) => {
  // Plain loops: the own body runs it every frame on some thousand vertices, fourteen times.
  const nk = r.k.length;
  if (MOVED.length < nk * 3) {
    MOVED = new Float32Array(nk * 3);
  }
  const P = MOVED;
  for (let pass = 0; pass < 14; pass++) {
    const f = pass % 2 ? -0.53 : 0.5;
    for (let i = 0; i < nk; i++) {
      const k = r.k[i];
      const e0 = r.no[i];
      const e1 = r.no[i + 1];
      for (let d = 0; d < 3; d++) {
        let m = 0;
        for (let e = e0; e < e1; e++) {
          m += Q[r.n[e] * 6 + d];
        }
        P[i * 3 + d] = Q[k * 6 + d] + r.g[i] * f * (m / (e1 - e0) - Q[k * 6 + d]);
      }
    }
    for (let i = 0; i < nk; i++) {
      const k = r.k[i];
      for (let d = 0; d < 3; d++) {
        Q[k * 6 + d] = P[i * 3 + d];
      }
    }
  }
  for (let i = 0; i < nk; i++) {
    const k = r.k[i];
    let n0 = 0;
    let n1 = 0;
    let n2 = 0;
    for (let e = r.to[i]; e < r.to[i + 1]; e++) {
      const a = s.t[r.t[e]] * 6;
      const b = s.t[r.t[e] + 1] * 6;
      const c = s.t[r.t[e] + 2] * 6;
      const u0 = Q[b] - Q[a];
      const u1 = Q[b + 1] - Q[a + 1];
      const u2 = Q[b + 2] - Q[a + 2];
      const v0 = Q[c] - Q[a];
      const v1 = Q[c + 1] - Q[a + 1];
      const v2 = Q[c + 2] - Q[a + 2];
      n0 += u1 * v2 - u2 * v1;
      n1 += u2 * v0 - u0 * v2;
      n2 += u0 * v1 - u1 * v0;
    }
    const l = Math.hypot(n0, n1, n2) || 1;
    Q[k * 6 + 3] = n0 / l;
    Q[k * 6 + 4] = n1 / l;
    Q[k * 6 + 5] = n2 / l;
  }
};
/** relax()'s moved places, kept from call to call. */
export let MOVED = new Float32Array(0);

/** Per joint the dual quaternion that carries the rest pose to the pose: the rotation, then its dual. */
export const D = new Float64Array((JOINTS + 2) * 8);
export const E = new Float64Array(8);
export let Q = new Float32Array(0);
/** The rest mesh with the face's channels added. */
export let R = new Float32Array(0);

/** The palette regions that are bare skin: the shader's skin pass (SKIN_LAYER) takes them. */
export const BARE_REGIONS = [FLESH, LIP, STUBBLE, BLUSH, SHADE];

/**
 * The dual quaternions that carry the rest pose of the skin `s` to the pose, joint by joint and
 * then its two swings (the shoulders'): eight numbers each, the rotation then its dual.
 */
export const duals = (s: Skin, { pos, rot }: { pos: Vec3[]; rot: Quat[] }) => {
  const BIND = BINDS[s.b ?? 0];
  for (let k = 0; k < JOINTS + 2; k++) {
    const r = k < JOINTS ? rot[k] : swing(rot, k == SWING_R ? J.ARM_R : J.ARM_L, s.b);
    const p = pos[k < JOINTS ? k : k == SWING_R ? J.ARM_R : J.ARM_L];
    const t = turn(r, BIND[k]);
    D.set(r, k * 8);
    D.set(mul([(p[0] - t[0]) / 2, (p[1] - t[1]) / 2, (p[2] - t[2]) / 2, 0], r), k * 8 + 4);
  }
  return D;
};

/**
 * Where skin() puts the middle of the cut face of a skin cut() made, in the pose `pose`: its last
 * vertex, which hangs on one joint alone (sever()). The shader draws the skin, so nothing on the
 * CPU reads it back from the frame.
 */
export const capOf = (s: Skin, { pos, rot }: { pos: Vec3[]; rot: Quat[] }): Vec3 => {
  const k = s.w.length - 1;
  const j = s.j[k * 2];
  const b = BINDS[s.b ?? 0][j];
  const t = turn(rot[j], [s.v[k * 6] - b[0], s.v[k * 6 + 1] - b[1], s.v[k * 6 + 2] - b[2]]);
  return [t[0] + pos[j][0], t[1] + pos[j][1], t[2] + pos[j][2]];
};

/** The palette `colors` as the face `face` shows it: the line between the lips dark as the mouth opens (the teeth are pieces of their own, close). */
export const mouthed = (colors: number[][], face?: ArrayLike<number>) => {
  const pal = colors.slice();
  const flush = clamp(face?.[CH.FLUSH] ?? 0);
  if (flush) {
    pal[BLUSH] = colors[BLUSH].map((c, i) => c * (1 + flush * [0.14, -0.12, -0.12][i]));
  }
  const open = clamp(Math.max((face?.[CH.JAW] ?? 0) * 4, (face?.[CH.GRIT] ?? 0) * 3));
  if (open) {
    pal[LINE] = colors[LINE].map((c, i) => c + (MOUTH[i] - c) * open);
    pal[INNER] = colors[INNER].map((c, i) => c + (MOUTH[i] * 1.5 - c) * open);
  }
  return pal;
};

/**
 * Appends the skin in the pose `solved` (see solve()) to `out` as triangles in the renderer's
 * vertex format, each in its palette colour: a vertex goes where the two joints it hangs on would
 * carry it, their dual quaternions mixed by the weights (so a bent joint keeps its thickness), its
 * normal turned the same way.
 */
export const skin = (
  out: Out,
  s: Skin,
  { pos, rot }: { pos: Vec3[]; rot: Quat[] },
  colors: number[][],
  face?: ArrayLike<number>,
) => {
  duals(s, { pos, rot });
  const n = s.w.length;
  if (Q.length < n * 6) {
    Q = new Float32Array(n * 6);
    R = new Float32Array(n * 6);
  }
  // The face's channels (CH) onto the rest mesh: each moves its vertices by its weight.
  let V = s.v;
  if (face && s.m.length) {
    R.set(s.v);
    V = R;
    for (let ch = 0; ch < CHANNELS; ch++) {
      const f = face[ch];
      if (f) {
        const { i, d } = s.m[ch];
        for (let k = 0; k < i.length; k++) {
          const [a, b] = [i[k] * 6, k * 6];
          R[a] += f * d[b];
          R[a + 1] += f * d[b + 1];
          R[a + 2] += f * d[b + 2];
          R[a + 3] += f * d[b + 3];
          R[a + 4] += f * d[b + 4];
          R[a + 5] += f * d[b + 5];
        }
      }
    }
    // Their normals, turned, back to unit length.
    for (let ch = 0; ch < CHANNELS; ch++) {
      if (face[ch]) {
        for (const k of s.m[ch].i) {
          const a = k * 6 + 3;
          const l = Math.hypot(R[a], R[a + 1], R[a + 2]) || 1;
          R[a] /= l;
          R[a + 1] /= l;
          R[a + 2] /= l;
        }
      }
    }
  }
  // Scalars all through, no array a vertex: the close skin is some six thousand vertices a frame.
  for (let i = 0; i < n; i++) {
    const a = s.j[i * 2] * 8;
    const b = s.j[i * 2 + 1] * 8;
    const u = s.w[i];
    const k = i * 6;
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
    const e0 = E[0];
    const e1 = E[1];
    const e2 = E[2];
    const e3 = E[3];
    // The translation is twice the dual part times the rotation's conjugate.
    const m0 = e3 * E[4] - E[7] * e0 - (E[5] * e2 - E[6] * e1);
    const m1 = e3 * E[5] - E[7] * e1 - (E[6] * e0 - E[4] * e2);
    const m2 = e3 * E[6] - E[7] * e2 - (E[4] * e1 - E[5] * e0);
    for (let h = k, e = 2; h <= k + 3; h += 3, e = 0) {
      const x = V[h];
      const y = V[h + 1];
      const z = V[h + 2];
      const p = e1 * z - e2 * y;
      const q = e2 * x - e0 * z;
      const r = e0 * y - e1 * x;
      Q[h] = x + 2 * (e3 * p + e1 * r - e2 * q) + e * m0;
      Q[h + 1] = y + 2 * (e3 * q + e2 * p - e0 * r) + e * m1;
      Q[h + 2] = z + 2 * (e3 * r + e0 * q - e1 * p) + e * m2;
    }
  }
  if (s.r) {
    relax(s, s.r);
  }
  const pal = mouthed(colors, face);
  // Written by index rather than pushed: the close skin is some 20 000 vertices.
  let o = out.length;
  const dst = room(out, s.t.length * 10);
  for (let h = 0; h < s.t.length; h++, o += 10) {
    const k = s.t[h] * 6;
    const g = s.o[s.t[h]];
    const f = s.cm[h];
    const col = pal[s.c[h]];
    let r = col[0];
    let gr = col[1];
    let b = col[2];
    if (f) {
      const to = pal[s.c2[h]];
      r += (to[0] - r) * f;
      gr += (to[1] - gr) * f;
      b += (to[2] - b) * f;
    }
    dst[o] = Q[k];
    dst[o + 1] = Q[k + 1];
    dst[o + 2] = Q[k + 2];
    dst[o + 3] = Q[k + 3];
    dst[o + 4] = Q[k + 4];
    dst[o + 5] = Q[k + 5];
    dst[o + 6] = r * g;
    dst[o + 7] = gr * g;
    // The cut's face and the eyes' specks glow: unlit.
    dst[o + 8] = s.c[h] == GLINT || s.c[h] == CAP ? -2 : -1;
    dst[o + 9] = b * g;
  }
  out.length = o;
};
