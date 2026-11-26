import { LIMB } from '../../shared/types';
import { JOINT as J } from '../rig';
import {
  CHANNELS,
  EYE as EYE_AT,
  IRIS_R,
  KIND,
  MOUTH_X,
  MOUTH_Y,
  PUPIL_R,
  ball,
  iris,
  lid,
  lipLine,
  shift,
  socket,
  white,
} from '../features';
import type { Uv } from '../features';
import { backOf } from '../xeno';

import {
  JACKET,
  FLESH,
  HAIR,
  GLOVE,
  WHITE,
  IRIS,
  LIP,
  SHADE,
  BROW,
  LINE,
  GLINT,
  PUPIL,
  LASH,
  TEETH,
  NECK_Y,
  CROWN,
  fem,
  NECK,
  jaw,
  section,
  nape,
  hairline,
  bell,
  step,
  face,
  tint,
  sgn,
  clamp,
  onHead,
} from './head';
import {
  SPLIT,
  TRUNK,
  LEG,
  SWING_R,
  SWING_L,
  ARM,
  CUFF,
  finer,
  LOFTS,
  TRUNK_X,
  LEG_X,
  ARM_X,
  CREST,
  WING,
  BOWL,
} from './lofts';
import type { Skin } from './lofts';

export const shape = (lod: number, xeno = false): Skin => {
  const [TR, LG, AR] = xeno ? [TRUNK_X, LEG_X, ARM_X] : [TRUNK, LEG, ARM];
  const [v, j, w, t, c, l, g, c2, cm]: number[][] = [[], [], [], [], [], [], [], [], []];
  /** The KIND of the vertices being put, and what the fields know of each (Uv). */
  let kind: number = KIND.BODY;
  const uvs: Uv[] = [];
  /** Far, near, or close; the eye's own body is near: the camera's near plane and the hands' budget hold it. */
  // The eye's own body is close too: its chest, seen looking down, is round (the user, 2026-11-09).
  const tier = [0, 1, 2, 2][lod];
  const N = TR.n[tier];
  /** The back vertex of a ring, and the last of the shoulder's side. */
  const [H, A] = [N / 2, N / 2 - 1];
  /** The trunk's rows of vertices, where it splits, and the crotch vertices both legs share. */
  let T: number[][] = [];
  let S = 0;
  const crotch: number[] = [];
  const put = (p: number[], a: number, b: number, k: number) => {
    v.push(...p, 0, 0, 0);
    g.push(kind);
    j.push(a, b);
    w.push(k);
    return w.length - 1;
  };
  for (const L of xeno ? [TR, LG, AR, CREST] : LOFTS) {
    kind = KIND.BODY;
    // The eye's own arms have their rings doubled too (the user, 2026-11-09: smoother arms).
    const arm = lod == 2 && L === AR;
    const n = L.n[tier];
    // The eye's own body has no head.
    if (!n || (lod == 2 && (L.z || L.x))) {
      continue;
    }
    // The eye's own body ends the trunk in a cap on the shoulders. Each sleeve but a far one ends
    // in a cuff over a thin wrist, where body.ts puts a hand with fingers (hands()); far, a mitten.
    const base =
      lod == 2 && L === TR
        ? [...L.rings.filter(r => r[0] < 1.45), [1.462, 0, 0, 0, 0, 2, JACKET]]
        : lod && L === AR
          ? [
              ...L.rings.filter(r => r[0] > 0.96),
              [0.95, 0.222, 0, 0.035, 0.036, 2.6, GLOVE],
              CUFF,
              [0.91, 0.222, 0, 0, 0, 3, GLOVE],
            ]
          : lod
            ? L.rings
            : L.far.map(i => L.rings[i]);
    // Close, the trunk's rings doubled; the eye's arms' too.
    // Not the eye's trunk: doubled, its rings would come in front of the near plane.
    // The xenomorph's legs and arms, their rings doubled near and close: a smooth outline.
    const rings =
      (lod == 3 && L === TR) || arm || (xeno && lod && (L === LG || L === AR))
        ? finer(base, arm || L === LG || L === AR)
        : base;
    const up = rings[rings.length - 1][0] > rings[0][0];
    if (L === TR) {
      S = rings.findIndex((r, i) => i && r[0] == rings[i - 1][0]);
    }
    for (const m of L.m ? [1, -1] : [1]) {
      /** The left joints are the right ones' four ids before. */
      const side = (b: number) => (m > 0 ? b : b == SWING_R ? SWING_L : b > J.HEAD ? b - 4 : b);
      /** A vertex of a trunk row, seen from this side. */
      const col = (row: number[], i: number) => row[m < 0 ? (N - i) % N : i];
      const vertex = (x: number, y: number, z: number, u: number) => {
        // The toe bends the front of the foot.
        u = L === LG && y < 0.12 && !xeno ? 3 + clamp((-z - 0.04) / 0.14) : u;
        // The buttock stays more with the pelvis than the front of the hip does: 5 cm further back
        // than it was, it swung further with the thigh, and its skin stretched 2.5 times at 90 degrees.
        u = L === LG && !xeno && u < 1 ? u * (1 - 0.35 * (1 - u) * clamp(z / 0.06)) : u;
        const g = Math.min(Math.floor(u), L.chain.length - 2);
        // The shoulder is a chain like the arm under it: the chest, the collarbone and the shoulder
        // blade (the top of the shoulder, up to the neck, which rises in a shrug), then the
        // deltoid's cap over the joint, which goes with the arm, the armpit's skin half.
        const ax = Math.abs(x);
        const ease = (k: number) => clamp(k) ** 2 * (3 - 2 * clamp(k));
        const top = clamp((1.535 - y) / 0.05);
        // The arm's side of a slanting line through the humerus' head (0.19, 1.47), from the
        // armpit up over the point of the shoulder; the folds in front of the armpit and behind
        // it (the chest's and the back's muscles to the arm) stretch between, half and half, and
        // the deltoid over them, round the joint, is the arm's.
        const q =
          L === TR
            ? ease(
                (0.85 * (ax - (xeno ? 0.175 : 0.19)) -
                  0.53 * (y - 1.47) -
                  (xeno ? 0.6 : 1.2) * Math.abs(z) * clamp((1.47 - y) / 0.08) +
                  0.03) /
                  // The xenomorph's blended wider (the user, 2026-11-15: a fold in front of the
                  // armpit as its arms reach forward), round its narrower shoulders.
                  (xeno ? 0.22 : 0.13),
              ) *
              top *
              clamp((y - SPLIT + 0.03) / 0.04)
            : 0;
        const k = L === TR ? ease((ax - 0.06) / 0.08) * top * clamp((y - SPLIT - 0.02) / 0.03) : 0;
        const [clav, arm] = x < 0 ? [J.CLAVICLE_L, SWING_L] : [J.CLAVICLE_R, SWING_R];
        // The xenomorph's hip bones rise at the sides (the user, 2026-11-17: the hips go up): the
        // pelvis' girdle lifted the further out it is, a wing each side over the waist.
        const wing =
          xeno && L === TR
            ? WING * clamp((ax - 0.07) / 0.085) ** 3 * Math.exp(-(((y - 1.01) / 0.045) ** 2))
            : 0;
        // Its pelvis open in front as a skeleton's (the user, 2026-11-17: a hollow in the middle,
        // between the hip bones): the front sunk in toward the middle, under the belly.
        const bowl =
          xeno && L === TR && z < 0
            ? BOWL * (1 - clamp(ax / 0.11)) ** 1.5 * Math.exp(-(((y - 0.99) / 0.05) ** 2))
            : 0;
        return q
          ? put([x, y, z], k > 0.5 ? clav : J.CHEST, arm, q)
          : k
            ? put([x, y, z], J.CHEST, clav, k)
            : put(
                [x, y + wing, z + bowl],
                side(L.chain[Math.max(g, 0)]),
                side(L.chain[g + 1] ?? L.chain[0]),
                g < 0 ? 0 : u - g,
              );
      };
      const grid = rings.map(([at, cx, co, rx, ro, u], r) => {
        const row: number[] = [];
        if (!r && L === AR) {
          // The shoulder's side, then the torso's own side vertices, from the back to the front.
          for (let i = 1; i <= A; i++) {
            row.push(col(T[S], i));
          }
          for (let i = A - 1; i > 1; i--) {
            row.push(col(T[S - 1], i));
          }
        } else if (!r && L === LG) {
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
            if (L === TR && r == S - 1 && !(i > 1 && i < A) && !(i > N - A && i < N - 1)) {
              row.push(-1);
              continue;
            }
            const q = (i * 2 * Math.PI) / n;
            // The shoe is squarer than the leg, so its toe is not a point.
            // The shoulders are rounder than the chest under them: the deltoids' caps.
            // Eased over 8 cm, or the back creases in a line across the shoulder blades.
            const e =
              L === TR && rx > 0.19
                ? lod == 2
                  ? 2.6
                  : 1.9 + 0.1 * clamp((at - SPLIT) / 0.07)
                : // The shoe's square; the xenomorph's ankle round.
                  (L.e ?? 2) * (L === LEG && at < 0.12 ? 2 : 1);
            // The back widens over the 12 cm under the armpits toward the shoulders' ring, whose
            // vertices it takes at the split: no ridge across the shoulder blades. The chest does
            // not: it would stand out of the shoulders' front (the user, 2026-11-09: no shelf).
            const flare =
              L === TR && rx < 0.2 && at <= SPLIT && Math.cos(q) < 0
                ? 1 +
                  0.65 *
                    clamp((at - SPLIT + 0.12) / 0.12) *
                    clamp((Math.abs(Math.cos(q)) - 0.83) / 0.03)
                : 1;
            const x = cx + rx * sgn(Math.sin(q), e) * flare;
            const o = co + ro * sgn(Math.cos(q), e);
            row.push(
              L.x
                ? vertex(m * at, x, o, u)
                : L.z
                  ? vertex(m * x, o, at, u)
                  : vertex(m * x, at, -o, u),
            );
          }
        }
        return row;
      });
      if (L === TR) {
        grid[S - 1] = grid[S - 1].map((k, i) => (k < 0 ? grid[S][i] : k));
        T = grid;
      }
      grid.slice(1).forEach((b, k) => {
        if (L === TR && k == S - 1) {
          return;
        }
        const a = grid[k];
        const [, , , , , , col, ...rules] = rings[k];
        // The head comes off at the neck, an arm at the shoulder, a leg at the hip: where its loft
        // meets the trunk.
        const part = L === TR ? LIMB.NONE : (L === AR ? LIMB.ARM_L : LIMB.LEG_L) + +(m > 0);
        const emit = (tri: number[], u: number) => {
          const angle = Math.abs(((u * 360 + 180) % 360) - 180);
          const h = rules.findIndex((l, g) => !(g % 2) && (l > 0 ? angle > l : angle < -l));
          if (new Set(tri).size > 2) {
            t.push(...(up !== m < 0 ? [tri[0], tri[2], tri[1]] : tri));
            c.push(...Array<number>(3).fill(h < 0 ? col : rules[h + 1]));
            l.push(part);
          }
        };
        if (a.length > 1 && b.length > 1 && a.length != b.length) {
          // A sleeve's first strip, from the shoulder's side to a ring of more sides: each step
          // goes along whichever ring is behind in its turn, so the triangles fan evenly.
          for (let i = 0, j = 0; i < a.length || j < b.length;) {
            if (i >= a.length || (j < b.length && (j + 1) / b.length <= (i + 1) / a.length)) {
              emit([a[i % a.length], b[(j + 1) % b.length], b[j]], (j + 0.5) / b.length);
              j++;
            } else {
              emit([a[i], a[(i + 1) % a.length], b[j % b.length]], (j + 0.5) / b.length);
              i++;
            }
          }
          return;
        }
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
              c.push(...Array<number>(3).fill(h < 0 ? col : rules[h + 1]));
              l.push(part);
            }
          }
        }
      });
    }
  }
  if (lod != 2 && !xeno) {
    // The head, from the trunk's last row (the neck) to a point at the crown. Its first ring has
    // twice the neck's sides, on the neck's angles and between them (2.5 times close, for the
    // face's detail: 3 times cost 80 % more skinning for no visible gain); the next crowd to the face.
    const fine = tier > 0;
    kind = KIND.HEAD;
    const M = (tier > 1 ? 2.5 : 2) * N;
    const rows: number[][] = [T[T.length - 1]];
    /** Per head vertex its colours (tint()), taken where the section put it: the socket's floor, set back, is skin. */
    const tints: number[][] = [];
    /**
     * Heights a row is put at, whatever the step: the line between the lips, and each lip's fullest;
     * then a row a step apart round the eye from its middle, so the socket's opening (cut along the
     * rows) frames the lids the same wherever the rows under it fell.
     */
    const lap = tier > 1 ? 0.003 : 0.007;
    const KEYS = fine
      ? [
          // Close, the lips' inner edges nearer the line (±0.6 mm), dark as the mouth opens: the inside of the lips.
          ...(tier > 1
            ? [-0.0046, -0.0006, 0, 0.0006, 0.004]
            : [-0.0046, -0.001, 0, 0.001, 0.004]
          ).map(k => MOUTH_Y + k),
          ...Array.from(
            { length: 2 * Math.ceil(0.016 / lap) + 1 },
            (_, i) => EYE_AT[1] + (i + 0.5 - Math.ceil(0.016 / lap)) * lap,
          ),
        ]
      : [];
    const tri = (a: number, b: number, d: number, col: number) => {
      if (new Set([a, b, d]).size < 3) {
        return;
      }
      // Wound as the trunk's; each corner coloured where it is, so the hairline, the brows and the
      // lips blend over a triangle instead of stepping.
      for (const k of [a, d, b]) {
        t.push(k);
        const [p, q, mix] = col < 0 ? (tints[k] ?? [FLESH, FLESH, 0]) : [col, col, 0];
        c.push(p);
        c2[c.length - 1] = q;
        cm[c.length - 1] = mix;
      }
      l.push(LIMB.HEAD);
    };
    /** The joints along the trunk's chain: the chest and the neck at the neck, the head from the jaw up. */
    const hang = (p: number[]) => {
      const u =
        p[1] < 1.6 ? 2.6 + (0.9 * (p[1] - NECK_Y)) / 0.045 : Math.min(3.5 + (p[1] - 1.6) / 0.07, 4);
      const g = Math.min(Math.floor(u), 3);
      return put(p, TRUNK.chain[g], TRUNK.chain[g + 1], u - g);
    };
    for (let y = NECK_Y; ;) {
      const y0 = y;
      y += [
        [0.035, 0.035, 0.035],
        [0.014, 0.009, 0.007],
        [0.006, 0.0042, 0.003],
      ][tier][+(y > 1.575 && y < 1.745) + +((y > 1.6 && y < 1.66) || (y > 1.678 && y < 1.722))];
      const key = KEYS.find(k => k > y0 + 0.0002 && k < y + 0.0005);
      y = key ?? y;
      if (y > CROWN - 0.003) {
        break;
      }
      const yr = y;
      const ramp = clamp((yr - NECK_Y) / 0.025);
      const warp = fine ? -0.6 * ramp : 0;
      rows.push(
        Array.from({ length: M }, (_, i) => {
          const a = (2 * Math.PI * i) / M;
          const q = a + warp * Math.sin(a);
          const [sn, cs] = [Math.sin(q), Math.cos(q)];
          // The rows about the mouth bend with the line between the lips, down to its corners.
          const x0 = section(yr)[0] * sgn(sn, 2.1);
          const y = fine
            ? yr -
              (lipLine(0) - lipLine(Math.min(Math.abs(x0), 0.03))) *
                bell(yr - MOUTH_Y, 0.014) *
                Math.max(cs, 0)
            : yr;
          const [rx, zf, zb, cz] = section(y);
          const [ef, eb] = [1.9 + 0.45 * clamp((y - 1.59) / 0.07), 2.1];
          const [rz, e] = cs > 0 ? [zf, ef] : [zb, eb];
          const [x, z] = [rx * nape(y, cs) * sgn(sn, e), -rz * sgn(cs, e)];
          const n = [x / rx ** 2, z / rz ** 2];
          const aq = Math.acos(cs);
          const k = face(x, y, aq, fine) / Math.hypot(n[0], n[1]);
          const [line, soft] = jaw(aq);
          // Under the chin the blend runs mostly down the throat: the chin's bottom rounds off and
          // the line under it slopes to the neck, not a shelf over it.
          const f = clamp(1.2 - aq);
          const w = step(line - soft * (1 + 1.6 * f), line + soft * (1 - 0.2 * f), y);
          // The neck narrows a little up to the jaw, so the jaw's angle stands out of it; hers more.
          const nk =
            1 - (0.06 + 0.06 * fem) * clamp((y - NECK_Y) / 0.02) * clamp(0.5 + 0.4 * fem + cs);
          // Behind, the neck thickens up into the back of the head, one line with it in profile,
          // the jaw the only line (the user, 2026-11-14, on a photo); not wider: the jaw stands out.
          const [nx, nz] = [
            NECK[0] * nk * sgn(sn, 2.3),
            -NECK[cs > 0 ? 1 : 2] *
              (cs > 0 ? nk : 1 + 0.13 * clamp((y - NECK_Y) / 0.09) ** 1.5 * -cs) *
              sgn(cs, 2.3),
          ];
          const p = [nx + (x + n[0] * k - nx) * w, y, nz + (cz + z + n[1] * k - nz) * w];
          const ax = Math.abs(p[0]);
          const col = tint(p[0], y, aq, fine);
          // The socket's floor, behind the eye's ball: the lids (pieces of their own) are over it.
          const sk = fine ? socket(ax, y) : 0;
          p[2] += (Math.max(p[2], ball(ax, y) + 0.004) - p[2]) * sk;
          const h = hang(p);
          // Blended into the skin round its edge: a hard switch drew the rows' steps round the eye.
          tints[h] = sk > 0 ? [col[0], SHADE, Math.min(2 * sk, 1)] : col;
          // The jaw: under the line between the lips, out from its corners down to the jaw's
          // angle, the neck under it not; the lower lip whole (a lip half on the jaw stretched
          // into a slab as it opened), the line itself on the skull, going back (POCKET). And how
          // much hair is on it.
          uvs[h] = [
            fine
              ? 0.22 *
                // The skin under the chin goes down with it, to nothing down the throat.
                Math.max(w, clamp((y - NECK_Y - 0.008) / 0.02) * clamp(1.4 - aq)) *
                clamp(
                  (lipLine(ax) - 0.0003 - 0.5 * Math.max(ax - 0.019, 0) - y) /
                    (0.0003 + 0.25 * Math.max(ax - 0.014, 0) + 0.45 * Math.max(ax - MOUTH_X, 0)),
                )
              : 0,
            col[1] == HAIR ? col[2] : 0,
            clamp((y - hairline(aq)) / 0.03),
          ];
          return h;
        }),
      );
    }
    rows.push([hang([0, CROWN, 0.012])]);
    tints[rows[rows.length - 1][0]] = [HAIR, HAIR, 0];
    uvs[rows[rows.length - 1][0]] = [0, 1, 1];
    rows.slice(1).forEach((b, r) => {
      const a = rows[r];
      if (b.length > 2 * a.length) {
        // From the neck to the close head's first ring: each step along whichever ring is behind.
        for (let i = 0, j = 0; i < a.length || j < b.length;) {
          if (i >= a.length || (j < b.length && (j + 1) / b.length <= (i + 1) / a.length)) {
            tri(a[i % a.length], b[(j + 1) % b.length], b[j], FLESH);
            j++;
          } else {
            tri(a[i], a[(i + 1) % a.length], b[j % b.length], FLESH);
            i++;
          }
        }
        return;
      }
      for (let i = 0; i < a.length; i++) {
        const j = (i + 1) % a.length;
        if (b.length == 2 * a.length) {
          tri(a[i], a[j], b[2 * i + 1], FLESH);
          tri(a[i], b[2 * i + 1], b[2 * i], FLESH);
          tri(a[j], b[(2 * i + 2) % b.length], b[2 * i + 1], FLESH);
        } else {
          tri(a[i], a[j], b[j % b.length], -1);
          tri(a[i], b[j % b.length], b[i % b.length], -1);
        }
      }
    });
    /**
     * A piece of the face of its own, of kind `k`: a grid of points (the right eye's, mirrored for
     * the left; `wrap` joins its last column to its first), coloured per point, wound to face the
     * front. Points at one place are one vertex, in all the pieces.
     */
    const spots = new Map<string, number>();
    const patch = (
      k: number,
      cols: number,
      n: number,
      wrap: boolean,
      at: (i: number, j: number, m: number) => number[],
      col: (i: number, j: number) => number[],
      uv?: (i: number, j: number) => number[],
    ) => {
      kind = k;
      for (const m of [1, -1]) {
        const grid = Array.from({ length: n }, (_, r) => {
          const row: number[] = [];
          for (let i = 0; i < cols; i++) {
            const p = at(i, r, m);
            const q = [m * p[0], p[1], p[2]];
            const key = q.map(e => e.toFixed(6)).join();
            const h = spots.get(key) ?? put(q, J.HEAD, J.HEAD, 0);
            spots.set(key, h);
            uvs[h] = uv?.(i, r);
            tints[h] = col(i, r);
            row.push(h);
          }
          return row;
        });
        let flip: boolean | undefined;
        for (let r = 0; r + 1 < n; r++) {
          for (let i = 0; i < (wrap ? cols : cols - 1); i++) {
            const j = (i + 1) % cols;
            for (const q of [
              [grid[r][i], grid[r][j], grid[r + 1][j]],
              [grid[r][i], grid[r + 1][j], grid[r + 1][i]],
            ]) {
              if (new Set(q).size < 3) {
                continue;
              }
              const [a, b, d] = q.map(h => h * 6);
              flip ??=
                (v[b] - v[a]) * (v[d + 1] - v[a + 1]) - (v[b + 1] - v[a + 1]) * (v[d] - v[a]) > 0;
              tri(q[0], flip ? q[1] : q[2], flip ? q[2] : q[1], -1);
            }
          }
        }
      }
      kind = KIND.BODY;
    };
    if (!fine) {
      // Far, a face is a few pixels: a dark mark for each eye, one for the mouth and a nose, just
      // off the plain head, are what tells it from the back of a head.
      const egg = (x: number, y: number) => {
        const [rx, zf] = section(y);
        const e = 1.9 + 0.45 * clamp((y - 1.59) / 0.07);
        return -zf * (1 - (x / rx) ** e) ** (1 / e);
      };
      const mark = (x: number[], y: number[], col: number[]) =>
        patch(
          KIND.MARK,
          2,
          2,
          false,
          (i, r) => [x[i], y[r], egg(x[i], y[r]) - 0.003],
          () => col,
        );
      mark([0.018, 0.047], [1.682, 1.698], [LASH, IRIS, 0.35]);
      mark([0.019, 0.05], [1.706, 1.715], [BROW, FLESH, 0.3]);
      mark([0, 0.023], [MOUTH_Y - 0.0038, MOUTH_Y + 0.0032], [LINE, LIP, 0.35]);
      const NOSE = [1.648, 1.659, 1.7];
      patch(
        KIND.MARK,
        2,
        3,
        false,
        (i, r) => [
          i * (r > 1 ? 0.006 : 0.014),
          NOSE[r],
          egg(0, NOSE[r]) + (i ? 0.003 : -[0.003, 0.023, 0.001][r]),
        ],
        () => [FLESH, FLESH, 0],
      );
    }
    if (fine) {
      const close = tier > 1;
      const surf = (x: number, y: number) => onHead(Math.abs(x), y);
      const sides = close ? 14 : 8;
      const round = (i: number) => (2 * Math.PI * i) / sides;
      // The white: the ball, in the lids' shadow toward its rim, and its sides back into the head.
      const W = close ? [0, 0.45, 0.75, 0.93, 1, 1.5] : [0, 0.6, 1, 1.5];
      patch(
        KIND.WHITE,
        sides,
        W.length,
        true,
        (i, r) => white(W[r], round(i)),
        (_, r) => [WHITE, SHADE, W[r] > 0.9 ? 0.5 : W[r] > 0.7 ? 0.2 : 0],
      );
      // The iris on it: a dark pupil, the iris, a darker ring round it.
      const I = close ? [0, 0.34, 0.44, 0.8, 1] : [0, 0.42, 1];
      patch(
        KIND.IRIS,
        sides,
        I.length,
        true,
        (i, r) => iris(I[r], round(i)),
        (_, r) =>
          I[r] * IRIS_R < PUPIL_R * 1.01 ? [PUPIL, PUPIL, 0] : [IRIS, PUPIL, I[r] == 1 ? 0.45 : 0],
      );
      // The light caught in each eye, close only: a speck over the pupil's edge, up and to the
      // runner's right in both. It glows, and stays as the iris moves under it.
      if (close) {
        patch(
          KIND.WHITE,
          6,
          2,
          true,
          (i, r, m) => {
            const p = iris(0, 0);
            const [x, y] = [
              p[0] + m * 0.0019 + 0.0011 * r * Math.cos(i),
              p[1] + 0.0021 + 0.0011 * r * Math.sin(i),
            ];
            return [x, y, ball(x, y) - 0.0007];
          },
          () => [GLINT, GLINT, 0],
        );
      }
      // The lids, from their roots under the skin to their edges on the ball; a line of lashes
      // along the upper one's edge, a fainter one along the lower one's.
      const S = close ? [0, 0.4, 0.75, 1] : [0, 0.55, 1];
      const cols = close ? 11 : 7;
      for (const upper of [true, false]) {
        patch(
          upper ? KIND.LID_U : KIND.LID_L,
          cols,
          S.length,
          false,
          (i, r) => lid(upper, (2 * i) / (cols - 1) - 1, S[r], 0, surf),
          (_, r) =>
            S[r] == 1
              ? [FLESH, LASH, upper ? 0.9 + 0.1 * fem : 0.3]
              : fem && upper && S[r] > 0.5
                ? [FLESH, LASH, 0.45]
                : [FLESH, SHADE, upper && S[r] > 0.5 ? 0.08 : 0],
          (i, r) => [(2 * i) / (cols - 1) - 1, S[r]],
        );
      }
      // The lashes: a fringe off the upper lid's edge, forward and up, longer to the outer corner.
      // Hers are long (the user, 2026-11-12); his a trace, so the two skins keep the same triangles.
      patch(
        KIND.LID_U,
        cols,
        2,
        false,
        (i, r) => {
          const t = (2 * i) / (cols - 1) - 1;
          const p = lid(true, t, 1, 0, surf);
          const l = r * (fem ? 0.0045 + 0.0045 * step(-0.6, 0.9, t) : 0.0006) * (1 - t ** 4);
          // Rooted a hair in front of the lid's edge: vertices of its own, or the fringe would be a fold of the lid.
          return [
            p[0] + 0.5 * l * Math.max(t, 0),
            p[1] + 0.0003 + 0.8 * l,
            p[2] - 0.0003 - 0.55 * l,
          ];
        },
        () => [LASH, LASH, 0],
        i => [(2 * i) / (cols - 1) - 1, 1],
      );
      // The teeth, close only: an arch behind each lip, the incisors in front and the rows going
      // back round the curve, a shadow between two teeth, the canine a little longer; the upper
      // row on the skull, the lower one on the jaw, a little behind it (the bite). Hidden by the
      // closed lips; the mouth opening (POCKET in features.ts) shows them.
      if (close) {
        // Across from the middle: the two incisors, the canine (a shadow at each even column), the back.
        const TOOTH = [0, 0.0024, 0.0047, 0.0068, 0.0088, 0.0112, 0.0135, 0.0185];
        const z0 = surf(0, MOUTH_Y) + 0.004;
        for (const upper of [true, false]) {
          const d = upper ? 1 : -1;
          // The upper row's edge 2 mm under the line between the lips, the lower one's 1.5 mm over it.
          const rows = upper ? [0.0075, -0.0016, -0.0021] : [0.0075, -0.0001, -0.0006];
          patch(
            KIND.TEETH,
            TOOTH.length,
            rows.length,
            false,
            (i, r) => {
              const x = TOOTH[i];
              const tip = r ? 0.0008 * bell(x - 0.0112, 0.002) : 0;
              const y = lipLine(x) + d * (rows[r] - tip);
              const z =
                Math.max(z0 + 22 * x * x, surf(x, y) + 0.0035) +
                (upper ? 0 : 0.0016) +
                (r == 2 ? 0.0012 : 0);
              return [x, y, z];
            },
            (i, r) =>
              r == 0
                ? [TEETH, SHADE, 0.6]
                : i == TOOTH.length - 1
                  ? [TEETH, SHADE, 0.6]
                  : i % 2 == 0
                    ? [TEETH, SHADE, 0.3]
                    : [TEETH, TEETH, 0],
            () => [upper ? 0 : 0.22, 0, 0],
          );
        }
      }
      // The ears: a thin shell each, a hair into the head along its front, leaning back with the
      // nose's ridge and standing out of the head behind (the user, 2026-11-14). On its outer face
      // a rolled rim over the top and the back, the ridge inside it, the bowl in front sunk and in
      // shadow, a flap in front of the bowl, a soft lobe under it with no rim.
      const around = close ? 20 : 6;
      // Out from the bowl's middle to the rim on the outer face, round the rim, back on the inner.
      const RHO = close
        ? [
            0, 0.18, 0.32, 0.44, 0.54, 0.62, 0.69, 0.75, 0.8, 0.85, 0.9, 0.94, 0.98, 1.02, 0.97,
            0.8, 0.45, 0,
          ]
        : [0, 0.5, 0.72, 0.87, 1.02, 0.8, 0];
      /**
       * How near (u, v) is to a line through `pts`, 1 on it, by a bell `w` wide: the ridge inside
       * the rim (the antihelix) up from over the lobe, forking under the top into a branch up and
       * one forward.
       */
      const line = (u: number, v: number, pts: number[][], w: number) => {
        let d = Infinity;
        for (let q = 0; q + 1 < pts.length; q++) {
          const [[a, b], [c, e]] = [pts[q], pts[q + 1]];
          const l = clamp(((u - a) * (c - a) + (v - b) * (e - b)) / ((c - a) ** 2 + (e - b) ** 2));
          d = Math.min(d, Math.hypot(u - a - l * (c - a), v - b - l * (e - b)));
        }
        return Math.exp(-((d / w) ** 2));
      };
      const BODY = [
        [0.003, -0.013],
        [0.009, -0.005],
        [0.0105, 0.005],
        [0.008, 0.012],
      ];
      const [UPPER, LOWER] = [
        [
          [0.008, 0.012],
          [0.0065, 0.02],
          [0.004, 0.025],
        ],
        [
          [0.008, 0.012],
          [0.002, 0.0108],
          [-0.005, 0.0092],
        ],
      ];
      const blob = (u: number, v: number, cu: number, cv: number, su: number, sv: number) =>
        Math.exp(-(((u - cu) / su) ** 2) - ((v - cv) / sv) ** 2);
      const RIM = RHO.indexOf(1.02);
      const [TILT, OUT] = [0.3, 0.38];
      /** Across the ear (back), along it (up), out of it: its frame, the right one's. */
      const across = [
        Math.sin(OUT),
        -Math.sin(TILT) * Math.cos(OUT),
        Math.cos(TILT) * Math.cos(OUT),
      ];
      const along = [0, Math.cos(TILT), Math.sin(TILT)];
      const out = [
        along[1] * across[2] - along[2] * across[1],
        along[2] * across[0] - along[0] * across[2],
        along[0] * across[1] - along[1] * across[0],
      ];
      /** The head's side at height y, z: how far out, on the plain section. */
      const side = (y: number, z: number) => {
        const [rx, zf, zb, cz] = section(y);
        const back = z > cz;
        const e = back ? 2.1 : 1.9 + 0.45 * clamp((y - 1.59) / 0.07);
        const cs = (back ? -1 : 1) * Math.min(Math.abs(z - cz) / (back ? zb : zf), 1) ** (e / 2);
        return rx * nape(y, cs) * Math.max(1 - cs * cs, 0) ** (1 / e);
      };
      const [YC, ZF] = [1.679, -0.007];
      const root = [side(YC, ZF) - 0.0015, YC, ZF];
      for (const m of [1, -1]) {
        const rows = RHO.map((rho, r) =>
          Array.from({ length: around }, (_, i) => {
            const a = (2 * Math.PI * i) / around;
            const [cs, sn] = [Math.cos(a), Math.sin(a)];
            // The outline: wider at the top than at the lobe, its front edge flatter.
            const k = Math.min(rho, 1);
            // The outline: its top wide and round, its lobe smaller, a notch in its front edge
            // under the flap.
            const u =
              k *
              cs *
              (cs > 0
                ? 0.0165 * (1 + 0.16 * sn)
                : 0.0122 * (1 - 0.25 * Math.exp(-(((sn + 0.35) / 0.18) ** 2))));
            const vv = k * 0.031 * sn;
            const inner = r > RIM;
            // Where the rim rolls (not the lobe, not the front under the top, where the bowl opens
            // to the flap); the ridge inside it and its two branches, the hollow between them; the
            // bowl (its upper part over the rim's root, its lower and deeper part round the hole),
            // the flap in front of the hole and the bump facing it over the lobe, the notch between.
            const lobe = step(-0.012, -0.02, vv);
            const rim = (1 - lobe) * (1 - step(-0.003, -0.009, u) * step(0.011, 0.003, vv));
            const crus = line(
              u,
              vv,
              [
                [-0.0125, 0.0065],
                [-0.002, 0.0055],
              ],
              0.0022,
            );
            const ridge = Math.max(
              line(u, vv, BODY, 0.0024),
              line(u, vv, UPPER, 0.002),
              0.8 * line(u, vv, LOWER, 0.0018),
            );
            const fossa = blob(u, vv, 0.0015, 0.0185, 0.0045, 0.0042);
            const cymba = blob(u, vv, 0.001, 0.0045, 0.0055, 0.0028);
            const cavum = blob(u, vv, -0.0015, -0.0045, 0.0075, 0.0072);
            const hole = blob(u, vv, -0.0072, -0.004, 0.0024, 0.003);
            const flap = blob(u, vv, -0.0108, -0.0035, 0.0026, 0.004);
            const anti = blob(u, vv, 0.0028, -0.0128, 0.0032, 0.0026);
            const notch = blob(u, vv, -0.0055, -0.0125, 0.0025, 0.0022);
            const h = inner
              ? -0.0014 - 0.0016 * lobe - 0.004 * (1 - rho)
              : rho > 1
                ? 0
                : 0.0013 +
                  0.0016 * lobe +
                  rim *
                    (0.0042 * Math.exp(-(((rho - 0.91) / 0.055) ** 2)) -
                      0.0022 * Math.exp(-(((rho - 0.79) / 0.045) ** 2))) +
                  0.003 * ridge -
                  0.0024 * fossa -
                  0.0022 * cymba -
                  0.0034 * cavum -
                  0.0016 * hole -
                  0.0012 * notch +
                  0.0028 * flap +
                  0.0022 * anti +
                  0.0018 * crus;
            const [du, dv] = [u + 0.0125, vv];
            const p = [0, 1, 2].map(q => root[q] + across[q] * du + along[q] * dv + out[q] * h);
            // In shadow: the bowl, darkest down its hole, and the groove under the rim.
            const g = inner
              ? 0
              : Math.max(
                  clamp(cavum * 1.5 - 0.3) * 0.8,
                  0.95 * hole,
                  0.55 * cymba,
                  0.45 * fossa,
                  0.6 * notch,
                  0.5 * rim * Math.exp(-(((rho - 0.79) / 0.04) ** 2)),
                ) *
                (1 - 0.6 * ridge);
            return { p: [m * p[0], p[1], p[2]], o: [m * out[0], out[1], out[2]], g };
          }),
        );
        kind = KIND.EAR;
        // The two middles are a point each.
        const id = rows.map((row, r) => {
          let one: number | undefined;
          return row.map(q => {
            if (RHO[r] == 0 && one !== undefined) {
              return one;
            }
            const h = put(q.p, J.HEAD, J.HEAD, 0);
            tints[h] = [FLESH, SHADE, q.g];
            uvs[h] = undefined;
            return (one = h);
          });
        });
        kind = KIND.BODY;
        // One winding for the whole strip, the way that faces the outer face out.
        let flip: boolean | undefined;
        for (let r = 0; r + 1 < rows.length; r++) {
          for (let i = 0; i < around; i++) {
            const j = (i + 1) % around;
            for (const q of [
              [
                [r, i],
                [r, j],
                [r + 1, j],
              ],
              [
                [r, i],
                [r + 1, j],
                [r + 1, i],
              ],
            ]) {
              const [a, b, d] = q.map(([rr, ii]) => id[rr][ii]);
              if (new Set([a, b, d]).size < 3) {
                continue;
              }
              if (flip === undefined) {
                // tri() winds a, d, b; this is the outer face, near its middle.
                const [pa, pb, pd] = [a, b, d].map(h => [v[h * 6], v[h * 6 + 1], v[h * 6 + 2]]);
                const [e1, e2] = [pd.map((x, k) => x - pa[k]), pb.map((x, k) => x - pa[k])];
                const o = rows[r][i].o;
                flip =
                  (e1[1] * e2[2] - e1[2] * e2[1]) * o[0] +
                    (e1[2] * e2[0] - e1[0] * e2[2]) * o[1] +
                    (e1[0] * e2[1] - e1[1] * e2[0]) * o[2] <
                  0;
              }
              tri(a, flip ? d : b, flip ? b : d, -1);
            }
          }
        }
      }
    }
  }
  // The armpits relaxed: each vertex round them drawn toward the mean of its neighbours, the
  // shrinking undone every other pass (Taubin), fading out from the middle of the region. The
  // trunk splits at one height, so the shoulder stood out over the armpit in a step; relaxed, it
  // is a fold (the user, 2026-11-09).
  const near = Array.from({ length: w.length }, () => new Set<number>());
  for (let i = 0; i < t.length; i += 3) {
    for (let e = 0; e < 3; e++) {
      near[t[i + e]].add(t[i + ((e + 1) % 3)]).add(t[i + ((e + 2) % 3)]);
    }
  }
  const soft = (k: number) => clamp(k) ** 2 * (3 - 2 * clamp(k));
  const pull = Array.from({ length: w.length }, (_, k) => {
    const [ax, y] = [Math.abs(v[k * 6]), v[k * 6 + 1]];
    // The xenomorph's: a taller region round its narrower shoulders, near too (the user,
    // 2026-11-15: the joint of the shoulder and the arm still odd).
    return xeno
      ? soft((0.11 - Math.abs(y - SPLIT + 0.005)) / 0.05) *
          soft(Math.min(ax - 0.04, 0.245 - ax) / 0.035)
      : soft((0.075 - Math.abs(y - SPLIT + 0.01)) / 0.035) *
          soft(Math.min(ax - 0.05, 0.255 - ax) / 0.03);
  });
  // Close only: farther the step does not show, and the eye's own body never sees its armpits.
  for (let pass = 0; pass < (lod == 3 ? (xeno ? 40 : 24) : xeno && lod == 1 ? 24 : 0); pass++) {
    const k0 = pass % 2 ? -0.53 : 0.5;
    const next = v.slice();
    pull.forEach((g, k) => {
      if (g > 0 && near[k].size) {
        // Across and in depth only: each keeps its height, so no row crosses another.
        for (const r of [0, 2]) {
          let m = 0;
          near[k].forEach(n => (m += v[n * 6 + r]));
          next[k * 6 + r] += g * k0 * (m / near[k].size - v[k * 6 + r]);
        }
      }
    });
    next.forEach((c, i) => (v[i] = c));
  }
  /** Smooth normals of the positions P (`st` floats a vertex): the area-weighted mean of the triangles around a vertex. */
  const normals = (P: ArrayLike<number>, st: number) => {
    const out = new Float32Array(w.length * 3);
    for (let i = 0; i < t.length; i += 3) {
      const [a, b, d] = [t[i], t[i + 1], t[i + 2]];
      const e = [0, 1, 2].map(r => [P[b * st + r] - P[a * st + r], P[d * st + r] - P[a * st + r]]);
      const f = [
        e[1][0] * e[2][1] - e[2][0] * e[1][1],
        e[2][0] * e[0][1] - e[0][0] * e[2][1],
        e[0][0] * e[1][1] - e[1][0] * e[0][1],
      ];
      for (const k of [a, b, d]) {
        for (let r = 0; r < 3; r++) {
          out[k * 3 + r] += f[r];
        }
      }
    }
    for (let k = 0; k < out.length; k += 3) {
      const l = Math.hypot(out[k], out[k + 1], out[k + 2]) || 1;
      for (let r = 0; r < 3; r++) {
        out[k + r] /= l;
      }
    }
    return out;
  };
  normals(v, 6).forEach((f, i) => (v[((i / 3) | 0) * 6 + 3 + (i % 3)] = f));
  // Occlusion, baked in the rest pose so the arms stand off the chest: the torso's sides in the
  // shadow of the upper arms hanging by them, the insides of the sleeves and the armpits in the
  // torso's. Each occluder shades a vertex by the cosine toward its closest point and by how near
  // its surface is.
  const ARMS: number[] = [J.ARM_L, J.FOREARM_L, J.HAND_L, J.ARM_R, J.FOREARM_R, J.HAND_R];
  const o = new Float32Array(w.length);
  for (let i = 0; i < w.length; i++) {
    const [x, y, z, nx, ny, nz] = v.slice(i * 6, i * 6 + 6);
    const arm = +ARMS.includes(j[2 * i]) * (1 - w[i]) + +ARMS.includes(j[2 * i + 1]) * w[i];
    const at = (lo: number, hi: number) => Math.min(Math.max(y, lo), hi);
    // The torso, an elliptic cylinder from the waist to the armpits; the upper arm, a capsule.
    // The torso's fades out under the elbow: the hands swing far from it.
    const [cx, cy, cz, r, k, reach] =
      arm > 0.5
        ? [0, at(1.05, 1.33), 0, 0.152, 0.152 / 0.12, 0.15 * clamp((y - 0.97) / 0.1)]
        : [Math.sign(x) * 0.212, at(1.08, 1.3), 0, 0.044, 1, 0.1];
    const d = [cx - x, cy - y, (cz - z) * k];
    const l = Math.hypot(...d);
    // Half the sphere still shades a vertex turned a little away from its centre.
    const cos = clamp(((nx * d[0] + ny * d[1] + nz * d[2]) / l + 0.6) / 1.6);
    // Gone some centimetres off its surface, so the rest of the body keeps the palette's colours.
    o[i] = reach ? 1 - 0.9 * cos * clamp((r + reach - l) / reach) ** 0.8 : 1;
  }
  // The face's own shadows, which no light of the game is fine enough to cast: the sockets, under
  // the nose, under the lower lip, under the jaw; the upper lids' under the brow.
  for (let i = 0; i < w.length; i++) {
    const [x, y, z] = v.slice(i * 6, i * 6 + 3);
    const ax = Math.abs(x);
    if (g[i] == KIND.HEAD && tier > 0 && z < 0) {
      const aq = Math.atan2(ax, -z);
      o[i] *=
        1 -
        0.24 *
          Math.exp(-(((ax - EYE_AT[0]) / 0.021) ** 2) - ((y - EYE_AT[1] - 0.002) / 0.012) ** 2) -
        0.16 * bell(x, 0.013) * bell(y - 1.6475, 0.0045) -
        0.1 * bell(x, 0.015) * bell(y - lipLine(ax) + 0.0135, 0.004) -
        (tier > 1 ? 0.26 : 0.1) *
          (1 - step(-0.012, 0.008, y - jaw(aq)[0])) *
          clamp((y - NECK_Y) / 0.02) *
          // Under the jaw's front, to nothing up its back edge (which rises steeply across the
          // columns: they stepped it) and none behind it, where the head goes on into the neck.
          clamp((1.45 + 0.3 * fem - aq) / 0.35);
    } else if (g[i] == KIND.LID_U) {
      o[i] *= 0.9 + 0.1 * uvs[i]![1];
    } else if (g[i] == KIND.TEETH) {
      // In the mouth, out of the light.
      o[i] *= 0.8;
    }
  }
  // The channels: each field of features.ts on the vertices it moves, and what it does to the
  // normals of those and of their neighbours.
  const m: Skin['m'] = [];
  if (tier > 0 && lod != 2 && !xeno) {
    // The lids' roots are asked for again by every channel that moves a lid.
    const seen = new Map<number, number>();
    const surf = (x: number, y: number) => {
      const key = Math.abs(x) * 1e3 + y;
      const z = seen.get(key) ?? onHead(Math.abs(x), y);
      seen.set(key, z);
      return z;
    };
    // Only the head's vertices and triangles are in it: the channels are baked in a few
    // milliseconds, when a runner first comes close.
    const heads = g.flatMap((k, i) => (k ? [i] : []));
    const tris = l.flatMap((part, i) => (part == LIMB.HEAD ? [i * 3] : []));
    const P = Float32Array.from({ length: w.length * 3 }, (_, i) => v[((i / 3) | 0) * 6 + (i % 3)]);
    const N = new Float32Array(w.length * 3);
    for (let ch = 0; ch < CHANNELS; ch++) {
      const moved = new Map<number, number[]>();
      for (const i of heads) {
        const p = v.slice(i * 6, i * 6 + 6);
        const d = shift(ch, p, g[i], uvs[i], p.slice(3), surf);
        if (d && Math.hypot(d[0], d[1], d[2]) > 2e-5) {
          moved.set(i, d);
          for (let r = 0; r < 3; r++) {
            P[i * 3 + r] += d[r];
          }
        }
      }
      // The head's normals with the channel full on, as normals() makes them.
      N.fill(0);
      for (const i of tris) {
        const [a, b, d] = [t[i] * 3, t[i + 1] * 3, t[i + 2] * 3];
        const [ux, uy, uz] = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]];
        const [wx, wy, wz] = [P[d] - P[a], P[d + 1] - P[a + 1], P[d + 2] - P[a + 2]];
        const f = [uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx];
        for (const k of [a, b, d]) {
          N[k] += f[0];
          N[k + 1] += f[1];
          N[k + 2] += f[2];
        }
      }
      const all = new Set<number>();
      moved.forEach((_, i) => {
        all.add(i);
        // Not the neck's row, the trunk's: its normal is the trunk's too.
        near[i].forEach(k => g[k] && all.add(k));
        for (let r = 0; r < 3; r++) {
          P[i * 3 + r] = v[i * 6 + r];
        }
      });
      const idx = [...all].sort((a, b) => a - b);
      const d = new Float32Array(idx.length * 6);
      idx.forEach((i, k) => {
        d.set(moved.get(i) ?? [0, 0, 0], k * 6);
        const n = Math.hypot(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]) || 1;
        for (let r = 0; r < 3; r++) {
          d[k * 6 + 3 + r] = N[i * 3 + r] / n - v[i * 6 + 3 + r];
        }
      });
      m.push({ i: new Uint16Array(idx), d });
    }
  }
  // The eye's own shoulders bend hard when its arms come up (a katana held before it), on few
  // rows: the vertices round them are relaxed once posed, in skin() (the user, 2026-11-09).
  let r: Skin['r'];
  if (lod == 2) {
    const tris = Array.from({ length: w.length }, () => [] as number[]);
    for (let i = 0; i < t.length; i += 3) {
      for (let e = 0; e < 3; e++) {
        tris[t[i + e]].push(i);
      }
    }
    const ks: number[] = [];
    const gs: number[] = [];
    for (let k = 0; k < w.length; k++) {
      const [ax, y] = [Math.abs(v[k * 6]), v[k * 6 + 1]];
      const g =
        soft(Math.min(ax - 0.07, 0.34 - ax) / 0.04) * soft(Math.min(y - 1.2, 1.6 - y) / 0.06);
      // Not the poles, where many triangles meet: drawn to their ring, they would sink in a dimple.
      if (g > 0 && near[k].size && near[k].size <= 8) {
        ks.push(k);
        gs.push(g);
      }
    }
    const [no, n, to, tt] = [[0], [] as number[], [0], [] as number[]];
    for (const k of ks) {
      n.push(...near[k]);
      no.push(n.length);
      tt.push(...tris[k]);
      to.push(tt.length);
    }
    r = {
      k: new Uint32Array(ks),
      g: new Float32Array(gs),
      no: new Uint32Array(no),
      n: new Uint32Array(n),
      to: new Uint32Array(to),
      t: new Uint32Array(tt),
    };
  }
  // The xenomorph's spine down its back and the pipes up its neck (backOf() in xeno.ts): baked in,
  // so the shader poses them with the rest of it. In the open: no shade.
  let shade = o;
  if (xeno && lod != 2) {
    const x = backOf(lod).baked;
    const at = w.length;
    shade = new Float32Array(at + x.w.length).fill(1);
    shade.set(o);
    for (let i = 0; i < x.w.length; i++) {
      v.push(...x.v.slice(i * 6, i * 6 + 6));
      j.push(x.j[i * 2], x.j[i * 2 + 1]);
      w.push(x.w[i]);
      g.push(KIND.BODY);
    }
    x.t.forEach(k => t.push(k + at));
    c.push(...x.c);
    l.push(...Array<number>(x.t.length / 3).fill(LIMB.NONE));
  }
  return {
    v: new Float32Array(v),
    o: shade,
    j: new Uint8Array(j),
    w: new Float32Array(w),
    t: new Uint16Array(t),
    c: new Uint8Array(c),
    l: new Uint8Array(l),
    c2: Uint8Array.from({ length: c.length }, (_, i) => c2[i] ?? 0),
    cm: Float32Array.from({ length: c.length }, (_, i) => cm[i] ?? 0),
    g: new Uint8Array(g),
    m,
    r,
  };
};
