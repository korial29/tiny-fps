import type { Skin } from '../skin';
import type { Corner, Moulded } from './types';
import { REGIONS, OFF, partOf } from './regions';
import type { Region } from './regions';
import { landed, LIMITS, SCRATCHES, WORN } from './clip';
import { seeded, shaped } from './shell';
import {
  DETAILS,
  SIGNS,
  VENTS,
  NINJA_DETAILS,
  ASTRO_DETAILS,
  MARINE_DETAILS,
  KIT,
  ACCENT,
  ASTRO,
  MARINE,
  OWN,
  DARK,
  PIECE,
} from './details';

export const scratchesOn = (
  s: Skin,
  add: (
    cs: Corner[],
    offs: number[],
    swell: Region['swell'],
    col: number[],
    layer: number,
    wall: number,
    k: number,
    moulded?: Moulded[],
  ) => void,
  moulds: (((c: Corner, k: number) => Moulded) | undefined)[],
  tag: (g: number) => void,
) => {
  const { t, l } = s;
  const v = s.u ?? s.v;
  const rand = seeded(0xa4f0);
  const n = t.length / 3;
  const probe = (x: number[]): Corner => [...x, 0, 0, 0, 0, 0, 0, 0];
  const dot = (p: number[], q: number[]) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  const corners = (k: number) => [0, 1, 2].map(c => [0, 1, 2].map(j => v[t[k * 3 + c] * 6 + j]));
  const cross = (p: number[], q: number[]) => [
    p[1] * q[2] - p[2] * q[1],
    p[2] * q[0] - p[0] * q[2],
    p[0] * q[1] - p[1] * q[0],
  ];
  /**
   * A stroke on the skin triangle k at `at`, L long and W half wide, turned by `a` in the
   * triangle's plane from its first edge, or from upright when `up`; in `col`, tagged as a detail
   * when `mark`. Whether it was drawn: it is wholly inside one plate.
   */
  const stroke = (
    k: number,
    at: number[],
    a: number,
    L: number,
    W: number,
    col: number[],
    up = false,
    mark = false,
    own = false,
    kind = 0,
    layer = -1,
    raise = 0,
  ) => {
    const part = partOf(l![k]);
    const P = corners(k);
    const N = [0, 1, 2].map(c => [0, 1, 2].map(j => v[t[k * 3 + c] * 6 + 3 + j]));
    const g = REGIONS.findIndex(
      (rg, i) =>
        rg.part == part &&
        !rg.alone == !own &&
        !rg.thin &&
        !rg.belt &&
        !(rg.fem && !s.b) &&
        !(rg.man && s.b) &&
        LIMITS[i].every(f => f(probe(at)) >= 0),
    );
    if (g < 0) {
      return false;
    }
    const e1 = P[1].map((x, j) => x - P[0][j]);
    const e2 = P[2].map((x, j) => x - P[0][j]);
    const nn = [
      e1[1] * e2[2] - e1[2] * e2[1],
      e1[2] * e2[0] - e1[0] * e2[2],
      e1[0] * e2[1] - e1[1] * e2[0],
    ];
    const nl = Math.hypot(...nn);
    if (nl < 1e-9) {
      return false;
    }
    // The plane's axes: its first edge, or upright in it.
    const x0 = up ? [0, 1, 0].map((q, j) => q - (nn[j] * nn[1]) / (nl * nl)) : e1;
    const l1 = Math.hypot(...x0);
    if (l1 < 1e-6) {
      return false;
    }
    const x = x0.map(q => q / l1);
    const y = [
      nn[1] * x[2] - nn[2] * x[1],
      nn[2] * x[0] - nn[0] * x[2],
      nn[0] * x[1] - nn[1] * x[0],
    ].map(q => q / nl);
    const d = x.map((q, j) => q * Math.cos(a) + y[j] * Math.sin(a));
    const sd = x.map((q, j) => -q * Math.sin(a) + y[j] * Math.cos(a));
    const quad = [
      [-0.5, -1],
      [0.5, -1],
      [0.5, 1],
      [-0.5, 1],
    ].map(([f, h]) => at.map((q, j) => q + d[j] * L * f + sd[j] * W * h));
    if (!quad.every(c => LIMITS[g].every(f => f(probe(c)) >= 0))) {
      return false;
    }
    // Weights: solve corner - P0 = c1 e1 + c2 e2 in the plane.
    const [d11, d12, d22] = [dot(e1, e1), dot(e1, e2), dot(e2, e2)];
    const det = d11 * d22 - d12 * d12;
    const swell = shaped(REGIONS[g], s).swell;
    const cs: Corner[] = quad.map(c => {
      const rr = c.map((q, j) => q - P[0][j]);
      const [r1, r2] = [dot(rr, e1), dot(rr, e2)];
      const c1 = (r1 * d22 - r2 * d12) / det;
      const c2 = (r2 * d11 - r1 * d12) / det;
      const b = [1 - c1 - c2, c1, c2];
      const nr = [0, 1, 2].map(j => N[0][j] * b[0] + N[1][j] * b[1] + N[2][j] * b[2]);
      return [...c, ...b, ...nr, 0];
    });
    const mould = moulds[g];
    const ms = mould && cs.map(c => mould(c, k));
    // On a moulded plate, inside it where it lies (cooking()).
    if (ms && !cs.every((c, i) => LIMITS[g].every(f => f(landed(c, ms[i])) >= 0))) {
      return false;
    }
    const offs = cs.map(
      (c, i) =>
        (ms ? ms[i][0] : (REGIONS[g].off ?? OFF) + (swell ? swell(c[0], c[1], c[2]) : 0)) + 0.0008,
    );
    const pick = (...i: number[]) => ms && i.map(j => ms[j]);
    const top = offs.map(o => o + raise);
    tag(mark ? g : -1);
    add(
      [cs[0], cs[1], cs[2]],
      [top[0], top[1], top[2]],
      undefined,
      col,
      layer,
      kind,
      k,
      pick(0, 1, 2),
    );
    add(
      [cs[0], cs[2], cs[3]],
      [top[0], top[2], top[3]],
      undefined,
      col,
      layer,
      kind,
      k,
      pick(0, 2, 3),
    );
    if (raise) {
      // A box: walls from the plate up to its top, wound outward as the plates' (cooking()).
      const lift = (i: number, d: number) => {
        const c = cs[i];
        const nl = Math.hypot(c[6], c[7], c[8]) || 1;
        return [0, 1, 2].map(j => c[j] + (c[6 + j] / nl) * d);
      };
      const side = col.map(q => q * 0.6);
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        const [pt, qt, qb] = [lift(i, top[i]), lift(j, top[j]), lift(j, offs[j])];
        const f = cross(
          qt.map((q, m) => q - pt[m]),
          qb.map((q, m) => q - pt[m]),
        );
        const [p, q] =
          dot(
            f,
            cs[i].map((c, m) => c - at[m]),
          ) >= 0
            ? [i, j]
            : [j, i];
        const [P, Q] = [cs[p], cs[q]];
        add(
          [P, Q, Q],
          [top[p], top[q], offs[q] - 0.001],
          undefined,
          side,
          -1,
          kind | 1,
          k,
          pick(p, q, q),
        );
        add(
          [P, Q, P],
          [top[p], offs[q] - 0.001, offs[p] - 0.001],
          undefined,
          side,
          -1,
          kind | 1,
          k,
          pick(p, q, p),
        );
      }
    }
    return true;
  };
  /** Each triangle's part, and its corners' places, nine numbers each: hitOf() goes through them all, many times. */
  const parts = Int8Array.from({ length: n }, (_, k) => partOf(l![k]));
  const T = new Float64Array(n * 9);
  for (let k = 0; k < n; k++) {
    for (let c = 0; c < 3; c++) {
      for (let j = 0; j < 3; j++) {
        T[k * 9 + c * 3 + j] = v[t[k * 3 + c] * 6 + j];
      }
    }
  }
  /** Where a ray from `o` along `w` leaves the skin of the part: its furthest triangle, and the point. */
  const hitOf = (part: number, o: number[], w: number[]): [number, number[]] | undefined => {
    let [best, most] = [-1, 0];
    const [wx, wy, wz] = [w[0], w[1], w[2]];
    for (let k = 0; k < n; k++) {
      if (parts[k] != part) {
        continue;
      }
      // cross() and dot() written out, in the same order.
      const i = k * 9;
      const [px, py, pz] = [T[i], T[i + 1], T[i + 2]];
      const [ax, ay, az] = [T[i + 3] - px, T[i + 4] - py, T[i + 5] - pz];
      const [bx, by, bz] = [T[i + 6] - px, T[i + 7] - py, T[i + 8] - pz];
      const [hx, hy, hz] = [wy * bz - wz * by, wz * bx - wx * bz, wx * by - wy * bx];
      const det = ax * hx + ay * hy + az * hz;
      if (Math.abs(det) < 1e-12) {
        continue;
      }
      const [qx, qy, qz] = [o[0] - px, o[1] - py, o[2] - pz];
      const bu = (qx * hx + qy * hy + qz * hz) / det;
      const [cx, cy, cz] = [qy * az - qz * ay, qz * ax - qx * az, qx * ay - qy * ax];
      const bv = (wx * cx + wy * cy + wz * cz) / det;
      const far = (bx * cx + by * cy + bz * cz) / det;
      if (bu >= 0 && bv >= 0 && bu + bv <= 1 && far > most) {
        [best, most] = [k, far];
      }
    }
    return best < 0 ? undefined : [best, o.map((c, j) => c + w[j] * most)];
  };
  let made = 0;
  for (let tries = 0; tries < SCRATCHES * 60 && made < SCRATCHES; tries++) {
    const k = Math.floor(rand() * n);
    const P = corners(k);
    const [u, w] = [rand(), rand()];
    const [b1, b2] = u + w > 1 ? [1 - u, 1 - w] : [u, w];
    const at = [0, 1, 2].map(j => P[0][j] + (P[1][j] - P[0][j]) * b1 + (P[2][j] - P[0][j]) * b2);
    const a = rand() * Math.PI;
    const [L, W] = [0.008 + rand() * 0.022, 0.0005 + rand() * 0.0006];
    made += +stroke(k, at, a, L, W, WORN[Math.floor(rand() * WORN.length)]);
  }
  for (const [part, cx, ang, y, tilt, L, W, only, own, astro, lit, marine, raise, look] of [
    ...DETAILS,
    ...[...NINJA_DETAILS, ...VENTS[s.b ? 1 : 0], ...SIGNS[s.b ? 1 : 0]].map(d => [...d, 1]),
    ...ASTRO_DETAILS.map(d => [...d.slice(0, 8), 0, 1, d[8]]),
    ...MARINE_DETAILS.map(d => [...d.slice(0, 8), 0, 0, 0, 1, d[8], d[9]]),
  ]) {
    const [col, layer] = marine ? KIT[look] : [lit ? ACCENT : DARK, -1];
    const kind = astro ? ASTRO : marine ? MARINE | OWN : 0;
    for (const side of only ? [only] : [1, -1]) {
      const r = (ang * Math.PI) / 180;
      const hit = hitOf(part, [cx * side, y, 0], [Math.sin(r) * side, 0, -Math.cos(r)]);
      if (!hit) {
        continue;
      }
      // A long one in short pieces, each laid on the skin where it is: one stroke flat on a skin
      // triangle went under a curved plate, in dashes.
      const parts = Math.ceil(L / PIECE);
      const P = corners(hit[0]);
      const nn = cross(
        P[1].map((q, j) => q - P[0][j]),
        P[2].map((q, j) => q - P[0][j]),
      );
      const across = cross(nn, [0, 1, 0]);
      const al = Math.hypot(...across) || 1;
      const [ct, st] = [Math.cos((tilt * Math.PI) / 180), Math.sin((tilt * Math.PI) / 180) * side];
      for (let i = 0; i < parts; i++) {
        const f = ((i + 0.5) / parts - 0.5) * L;
        const q = hit[1].map((c, j) => c + f * (ct * +(j == 1) + (st * across[j]) / al));
        const out = [q[0] - cx * side, 0, q[2]];
        const ol = Math.hypot(...out) || 1;
        const at =
          parts > 1
            ? hitOf(
                part,
                [cx * side, q[1], 0],
                out.map(c => c / ol),
              )
            : hit;
        if (at) {
          const len = L / parts + (parts > 1 ? 0.0008 : 0);
          stroke(
            at[0],
            at[1],
            ((tilt * Math.PI) / 180) * side,
            len,
            W,
            col,
            true,
            true,
            !!own,
            kind,
            layer,
            raise,
          );
        }
      }
    }
  }
};
