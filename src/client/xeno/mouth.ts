import { TAU } from '../../shared/physics';
import { ease } from '../gun';
import { cross, face, pow } from '../helmet';
import type { Spot } from '../helmet';
import { unit } from '../mesh';
import type { Vec3 } from '../mesh';
import { JOINT as J, turn } from '../rig';
import type { Quat } from '../rig';
import { CREST_E, CREST_LEN, bindOf, domeAt } from '../skin';
import type { Out } from '../verts';
import { SIDES, on } from './common';
import { SINEW, strand, tubed } from './body';
import {
  ARC,
  EB,
  EDGE,
  EY,
  GUM,
  HEAD,
  HEAD_UP,
  JAW_UP,
  RISE,
  TEETH,
  arcAt,
  faceZ,
  jawH,
  ramusAt,
  round,
} from './head';

/**
 * The chitin under its carapace (the user, 2026-11-24: glossy black from the eyes' line up), on the
 * head joint: the underside of the dome, the arc of its sections under the carapace's edge (edgeAt()) set BELLY metres out of it, its two edges turned in under the
 * carapace. At the face's edge it is no further out than the face's rim, which covers it.
 */
export const BELLY = 0.003;
/** The angle of the carapace's edge round the dome's section `z` behind the face, from its top (EDGE). */
export const edgeAt = (z: number) => {
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
