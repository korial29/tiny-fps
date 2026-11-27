import { hash, noise } from '../../shared/relief';
import type { V } from './types';
import { MID, DOWN, ink, face, teeth } from './common';

// ---------------------------------------------------------------------------------------------
// The carpet round a hole in a passengers' deck (the user, 2026-11-27): burnt black at the
// hole's edge, browning out to a rim of round bites where the fire ate into it, the rim still
// smouldering here and there; its torn hem curled over the edge and hanging.

/** How far over the carpet's top the char lies: it hides the carpet under it, near and far. */
const LIFT = 0.012;
/** Singed carpet, a dull brown, lit darker toward the hole down to black char. */
const CHAR = ink([0.12, 0.085, 0.06]);
/** The hem's underside, burnt through: darker than the char, yet no soot (a lamp's cable is). */
const UNDERSIDE = ink([0.1, 0.07, 0.05]);
/** The burn's front, nearly out: a dull orange glow, dimmed toward the carpet. */
const FRONT = ink([0.8, 0.34, 0.07], 1, -2);

/**
 * How far the burn reaches from the edge at s metres along it: the farthest of round bites
 * along the edge (each a centre s, a radius and how far out its centre stands), so its rim is
 * a run of arcs meeting in cusps.
 */
const bites = (length: number, seed: number) => {
  const all: number[][] = [];
  for (let s = 0, i = 0; s < length + 0.5; i++) {
    const r = 0.25 + 0.5 * hash(i, seed, 95);
    all.push([s, r, 0.05 + 0.3 * hash(i, seed, 96)]);
    s += r * (0.9 + 0.6 * hash(i, seed, 97));
  }
  return (s: number) =>
    Math.max(
      0.12,
      ...all.map(([c, r, o]) => (Math.abs(s - c) < r ? o + Math.sqrt(r * r - (s - c) ** 2) : 0)),
    );
};

/**
 * The char round a hole from x p to q in the deck whose carpet's top is at y, open across z to
 * `w` either side of the line (`full`: from flank to flank, so its edges at p and q only), the
 * carpet `lim` either side of the line and from x0 to x1. A hole's edge on the deck's own end
 * has no carpet past it, so neither char nor hem.
 */
export const scorch = (
  p: number,
  q: number,
  y: number,
  w: number,
  lim: number,
  full: boolean,
  [x0, x1]: number[],
) => {
  // The edge, each point with the way out from it (a corner's is the diagonal), every 30 cm.
  const loops: [number, number, number, number][][] = [];
  const run = (a: number[], b: number[], d: number[]) => {
    const out: [number, number, number, number][] = [];
    const n = Math.max(2, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.3));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, d[0], d[1]]);
    }
    return out;
  };
  const [za, zb] = [MID - w, MID + w];
  if (full) {
    if (p > x0 + 0.1) {
      loops.push(run([p, zb], [p, za], [-1, 0]));
    }
    if (q < x1 - 0.1) {
      loops.push(run([q, za], [q, zb], [1, 0]));
    }
  } else {
    const c = [
      [p, za],
      [q, za],
      [q, zb],
      [p, zb],
    ];
    const n = [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ];
    const ring = c.flatMap((a, i) => {
      const e = run(a, c[(i + 1) % 4], n[i]).slice(0, -1);
      const k = (i + 3) % 4;
      e[0] = [a[0], a[1], n[i][0] + n[k][0], n[i][1] + n[k][1]];
      return e;
    });
    loops.push([...ring, ring[0]]);
  }
  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
  // Red's and blue's twins burn alike: the seed is the hole's, not its side's.
  const seed = Math.round(p * 10 + q * 3);
  loops.forEach((pts, l) => {
    // The edge again every 15 cm, the arcs of the rim drawn smooth; s its length so far.
    const fine: number[][] = [];
    let s = 0;
    pts.slice(1).forEach((b, i) => {
      const a = pts[i];
      const step = Math.hypot(b[0] - a[0], b[1] - a[1]) / 2;
      for (let k = 0; k < 2; k++) {
        const t = k / 2;
        // The way out turns from a's to b's over the segment: a corner's diagonal blends in.
        const u = k ? b : a;
        fine.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, u[2], u[3], s]);
        s += step;
      }
    });
    const end = pts[pts.length - 1];
    fine.push([end[0], end[1], end[2], end[3], s]);
    const reach = bites(s, seed + l * 31);
    // From the edge out to the rim: black at the edge, singed brown at the rim.
    const [edge, rim] = [0, 1].map(k =>
      fine.map(([x, z, dx, dz, at]) => {
        const e = k * reach(at);
        const h = Math.hypot(dx, dz);
        return [
          clamp(x + (dx / h) * e, x0, x1),
          y + LIFT,
          clamp(z + (dz / h) * e, MID - lim, MID + lim),
        ];
      }),
    );
    for (let i = 0; i < fine.length - 1; i++) {
      face([edge[i], edge[i + 1], rim[i + 1], rim[i]], CHAR, DOWN, [0.15, 0.15, 1, 1]);
    }
    // The rim's front, along its own arcs, thin: embers alive in patches, none between them.
    const out = rim.map((_, i) => {
      const [a, b] = [rim[Math.max(0, i - 1)], rim[Math.min(rim.length - 1, i + 1)]];
      let [nx, nz] = [b[2] - a[2], a[0] - b[0]];
      const h = Math.hypot(nx, nz) || 1;
      // Away from the hole: the side the edge's own way out points.
      if (nx * fine[i][2] + nz * fine[i][3] < 0) {
        [nx, nz] = [-nx, -nz];
      }
      return [nx / h, nz / h];
    });
    const glow = fine.map(([, , , , at]) =>
      Math.max(0, Math.min(1, 1.6 * noise(at / 0.6, seed * 0.37 + l, 21) - 0.35)),
    );
    const at = (j: number, e: number) => [
      rim[j][0] + out[j][0] * e,
      y + LIFT + 0.001,
      rim[j][2] + out[j][1] * e,
    ];
    for (let i = 0; i < rim.length - 1; i++) {
      if (glow[i] + glow[i + 1] > 0.1) {
        // Orange on the char's side, darker out on the carpet's.
        const [g, h] = [glow[i], glow[i + 1]];
        face([at(i, -0.016), at(i + 1, -0.016), at(i + 1, 0.028), at(i, 0.028)], FRONT, DOWN, [
          g,
          h,
          h * 0.5,
          g * 0.5,
        ]);
      }
    }
    // The carpet's torn hem, charred, curled over the edge and hanging into the hole: a shred
    // every 60 cm.
    for (let i = 0; i < pts.length - 1; i += 2) {
      const [a, b] = [pts[i], pts[Math.min(i + 2, pts.length - 1)]];
      const on = (e: number[]): V => [e[0], y + LIFT, e[1]];
      teeth(on(a), on(b), [-a[2] * 0.2, -0.25, -a[3] * 0.2], 1, CHAR, 0.35, DOWN, UNDERSIDE);
    }
  });
};
