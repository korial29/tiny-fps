import { GILT, SHINE, STRIDE, TWILL, mix, place, segment, solid, sub, unit } from '../mesh';
import type { Vec3 } from '../mesh';

import { LINK, TUBE, loft, panel, rod } from '../rover';
import { glow } from '../flag';
import type { Out } from '../verts';
import { mesh } from '../store';
import type { Pieces } from '../store';
import type { Quat } from '../rig';
import { leather, silver } from './constants';

/** The Hunter's foldable, long-bolt rifle in right-hand grip space (muzzle points along -z). */
export const harpoons: { body: number[]; slide: number[]; stock: number[]; bolt: number[] }[] = [];
export const harpoonParts = (lod: 0 | 1 | 2) => {
  if (harpoons[lod]) {
    return harpoons[lod];
  }
  const body: number[] = [],
    slide: number[] = [],
    stock: number[] = [],
    bolt: number[] = [];
  const part = (out: number[], a: Vec3, b: Vec3, radii: number[], color: Vec3, aspect = 1) => {
    const length = Math.hypot(...sub(b, a));
    segment(out, solid(lod, length, radii, [0, 0]), a, b, [1, 0, 0], length, [1, aspect], color);
  };
  // Very dark green plates, their ridges a worn, lighter green, the grooves near black (the user,
  // 2026-11-24).
  const shell: Vec3 = [0.035, 0.07, 0.042];
  const ridge: Vec3 = [0.085, 0.15, 0.09];
  const iron: Vec3 = [0.018, 0.028, 0.021];
  const ivory: Vec3 = [0.72, 0.63, 0.72];
  // The open rear cradle receives the hollow sleeve as the rifle folds.
  // Its outer face is banded in `bands` alternating plates whose seams lead at the top and bottom,
  // the chevrons of the sleeve; the ends stay square to meet the cradle and the sleeve.
  const tube = (
    out: number[],
    rear: number,
    front: number,
    r: number,
    closed: boolean,
    bands = 1,
  ) => {
    const facets = lod > 1 ? 16 : lod ? 8 : 4;
    const point = (i: number, radius: number, j: number): Vec3 => {
      const angle = (Math.PI * i) / facets;
      const lead = j % bands ? 0.03 * Math.abs(Math.sin(angle)) : 0;
      const z = rear + ((front - rear) * j) / bands - lead;
      return [radius * Math.cos(angle), 0.09 - radius * Math.sin(angle), z];
    };
    const last = closed ? 2 * facets : facets;
    for (let i = 0; i < last; i++) {
      const away: Vec3 = sub(point(i + 0.5, r, 0), [0, 0.09, rear]);
      const inward: Vec3 = [-away[0], -away[1], 0];
      for (let j = 0; j < bands; j++) {
        const face = [
          point(i, r, j),
          point(i + 1, r, j),
          point(i + 1, r, j + 1),
          point(i, r, j + 1),
        ];
        panel(out, face, j % 2 ? ridge : shell, away);
      }
      const q = r - 0.006;
      panel(
        out,
        [point(i, q, 0), point(i + 1, q, 0), point(i + 1, q, bands), point(i, q, bands)],
        iron,
        inward,
      );
      for (const j of [0, bands]) {
        const end = [point(i, r, j), point(i + 1, r, j), point(i + 1, q, j), point(i, q, j)];
        panel(out, end, ridge, [0, 0, j ? front - rear : rear - front]);
      }
      if (!closed && (i === 0 || i === last - 1)) {
        const k = i && i + 1;
        const side = [point(k, r, 0), point(k, q, 0), point(k, q, bands), point(k, r, bands)];
        panel(out, side, ridge, [0, 1, 0]);
      }
    }
  };
  tube(slide, -0.52, -1.08, 0.038, true);

  // Smooth ribbed plating: P(a, s) at the angle a round the axis and s along it, normals by
  // differences, away from the row's centre (toward it for sign -1). A rib is graded from a dark
  // groove to a bright brass crest, so the relief reads without flat colour bands.
  const groove: Vec3 = [0.012, 0.026, 0.016];
  const skin = (
    out: number[],
    P: (a: number, s: number) => Vec3,
    angles: number[],
    along: number[],
    crest: (s: number) => number,
    sign = 1,
  ) => {
    const h = 1e-4;
    const wrap = angles[angles.length - 1] - angles[0] < 6;
    const rows = along.map(s => {
      const ring = angles.map(a => P(a, s));
      const mid = ring.reduce((m, p) => m.map((v, k) => v + p[k] / ring.length) as Vec3, [0, 0, 0]);
      const t = crest(s);
      const rgb = t < 0.5 ? mix(groove, shell, 2 * t) : mix(shell, ridge, 2 * t - 1);
      return angles.map((a, i): [Vec3, number[]] => {
        const u = sub(P(a + h, s), P(a - h, s));
        const v = sub(P(a, s + h), P(a, s - h));
        let m = unit([
          u[1] * v[2] - u[2] * v[1],
          u[2] * v[0] - u[0] * v[2],
          u[0] * v[1] - u[1] * v[0],
        ]);
        const o = sub(ring[i], mid);
        if (sign * (m[0] * o[0] + m[1] * o[1] + m[2] * o[2]) < 0) {
          m = [-m[0], -m[1], -m[2]];
        }
        return [ring[i], [...m, ...rgb]];
      });
    });
    const vertex = ([p, m]: [Vec3, number[]]) =>
      out.push(...p, m[0], m[1], m[2], m[3], m[4], -1, m[5]);
    const tri = (a: [Vec3, number[]], b: [Vec3, number[]], c: [Vec3, number[]]) => {
      const u = sub(b[0], a[0]);
      const v = sub(c[0], a[0]);
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const m = a[1];
      for (const q of n[0] * m[0] + n[1] * m[1] + n[2] * m[2] < 0 ? [a, c, b] : [a, b, c]) {
        vertex(q);
      }
    };
    for (let r = 1; r < rows.length; r++) {
      for (let i = 0; i < angles.length - (wrap ? 0 : 1); i++) {
        const j = (i + 1) % angles.length;
        const [a, b, c, d] = [rows[r - 1][i], rows[r - 1][j], rows[r][i], rows[r][j]];
        tri(a, c, d);
        tri(a, d, b);
      }
    }
  };
  // Overlapping chevron plates every `period` from `from` toward -z: each rises from its front to a
  // sharp lip at its rear, then drops to the next. Rows sit just inside each plate's two ends, so
  // the drop is one thin, steep band graded from the bright lip to the dark groove.
  const period = 0.06;
  const rib = (s: number, from: number) => {
    const phase = ((from - s) / period) % 1;
    return (1 - phase) ** 0.7;
  };
  const rows = (from: number, to: number) =>
    Array.from({ length: Math.round((from - to) / period) }, (_, k) =>
      (lod > 1 ? [0.02, 0.25, 0.5, 0.75, 0.98] : lod ? [0.02, 0.5, 0.98] : [0.02, 0.98]).map(
        p => from - (k + p) * period,
      ),
    ).flat();
  const around = (n: number, half = false) =>
    Array.from({ length: half ? n + 1 : n }, (_, i) => ((half ? 1 : 2) * Math.PI * i) / n);
  /** Facets round the receiver and the sleeve, and round the receiver's open half. */
  const [ring, halfRing] = lod > 1 ? [20, 10] : lod ? [10, 5] : [6, 3];
  // The chevrons: each rib's top and bottom lead its flanks, fading out at the ribbed span's ends.
  const lead = (a: number, s: number, from: number, to: number) =>
    0.045 * Math.sin(a) ** 2 * Math.min(1, (from - s) / 0.04, (s - to) / 0.04);

  // The receiver: a fairing sloping down to the stock's neck, then a ribbed tube whose front half
  // is an open cradle showing the bolt.
  const receiver = (a: number, s: number): Vec3 => {
    const k = Math.min(1, Math.max(0, (s - 0.06) / 0.13));
    const f = k * k * (3 - 2 * k);
    const ribbed = s < 0.06 ? rib(s, 0.06) : 0;
    const r = 0.042 - 0.016 * f + 0.008 * ribbed;
    return [
      r * Math.cos(a),
      0.09 - 0.02 * f - r * Math.sin(a),
      s - (s < 0.06 ? lead(a, s, 0.06, -0.6) : 0),
    ];
  };
  const receiverCrest = (s: number) => (s < 0.06 ? rib(s, 0.06) : 0.5);
  const fairing = [0.19, 0.16, 0.13, 0.1, 0.08];
  skin(body, receiver, around(ring), [...fairing, ...rows(0.06, -0.12)], receiverCrest);
  skin(body, receiver, around(halfRing, true), rows(-0.12, -0.6), receiverCrest);
  const inner = (a: number, s: number): Vec3 => [
    0.039 * Math.cos(a),
    0.09 - 0.039 * Math.sin(a),
    s,
  ];
  skin(body, inner, around(halfRing, true), [-0.12, -0.6], () => 0, -1);
  // The fairing's end, a dark ring round the stock's neck.
  panel(
    body,
    [
      [-0.026, 0.07, 0.19],
      [0, 0.044, 0.19],
      [0.026, 0.07, 0.19],
      [0, 0.096, 0.19],
    ],
    iron,
    [0, 0, 1],
  );

  // The sleeve over the slide: a wide, ribbed lozenge swelling past the receiver and narrowing to
  // the muzzle, where the bolt leaves it.
  const sleeve = (a: number, s: number): Vec3 => {
    const t = (-0.6 - s) / 0.54;
    const swell = 0.04 + 0.04 * Math.sin(Math.PI * Math.min(1, Math.max(0, 1.3 * t))) ** 0.5;
    const r = swell + 0.012 * rib(s, -0.6);
    return [1.25 * r * Math.cos(a), 0.09 - 0.85 * r * Math.sin(a), s - lead(a, s, -0.6, -1.14)];
  };
  const sleeveRows = rows(-0.6, -1.14);
  skin(slide, sleeve, around(ring), sleeveRows, s => rib(s, -0.6));
  for (const z of [sleeveRows[0], sleeveRows[sleeveRows.length - 1]]) {
    const rim = around(ring).map(a => sleeve(a, z));
    for (let i = 0; i < rim.length; i++) {
      panel(slide, [rim[i], rim[(i + 1) % rim.length], [0, 0.09, z]], iron, [
        0,
        0,
        z < -1 ? -1 : 1,
      ]);
    }
  }
  // Raked dorsal spines along the sleeve, a triangle on each side of a thin keel.
  const spine = (out: number[], base: Vec3, length: number, color: Vec3) => {
    const [x, y, z] = base;
    const tip: Vec3 = [x, y + length, z + 0.6 * length];
    for (const side of [-1, 1]) {
      panel(out, [[x, y, z - 0.03], [x, y, z + 0.035], tip], color, [side, 0, 0]);
    }
  };
  // Each rooted on the sleeve's crest where it stands (it narrows toward the muzzle).
  for (let i = 0; i < (lod ? 4 : 2); i++) {
    const z = -0.7 - 0.11 * i;
    spine(slide, [0, sleeve((3 * Math.PI) / 2, z)[1] - 0.006, z], 0.07 - 0.008 * i, iron);
  }
  // Twin forked prongs flank the muzzle, each a flat blade ending in a hollow square socket.
  for (const side of [-1, 1]) {
    const blade = (z: number, x: number, w: number, h: number): Vec3[] => [
      [side * x, 0.09 + h, z],
      [side * (x + w), 0.09, z],
      [side * x, 0.09 - h, z],
      [side * (x - w), 0.09, z],
    ];
    const root = blade(-0.84, 0.07, 0.022, 0.04);
    const neck = blade(-1.2, 0.108, 0.014, 0.024);
    loft(slide, root, neck, [ridge], iron);
    const box = (z: number, s: number): Vec3[] => [
      [side * 0.108 - s, 0.09 + s, z],
      [side * 0.108 + s, 0.09 + s, z],
      [side * 0.108 + s, 0.09 - s, z],
      [side * 0.108 - s, 0.09 - s, z],
    ];
    loft(slide, box(-1.2, 0.024), box(-1.29, 0.02), [ridge], ridge, iron);
  }
  // An open lattice cage guards the bolt head: corner rails and square hoops of thin bars.
  const corners: [number, number][] = [
    [-1, 1],
    [1, 1],
    [1, -1],
    [-1, -1],
  ];
  const cage = (x: number, y: number, z: number): Vec3 => [0.042 * x, 0.095 + 0.042 * y, z];
  for (let i = 0; i < 4; i++) {
    const [x, y] = corners[i];
    rod(slide, lod > 1 ? TUBE : LINK, cage(x, y, -1.06), cage(x, y, -1.31), 0.006, ridge);
    for (const z of lod ? [-1.16, -1.24, -1.31] : [-1.31]) {
      const [u, v] = corners[(i + 1) % 4];
      rod(slide, lod > 1 ? TUBE : LINK, cage(x, y, z), cage(u, v, z), 0.005, ridge);
    }
  }
  // Offset the compact optic so the exposed bolt remains visible beside it. It rides high on a
  // tall post over the receiver's closed tube, behind the open cradle (the user, 2026-11-24: not
  // over the bolt), a dark green lens at each end.
  // Nearer (lod 1 and 2, the own view) it is turned round instead, below (harpoonFine()).
  const glass: Vec3 = [0.02, 0.12, 0.05];
  if (!lod) {
    part(body, [0.03, 0.075, -0.05], [0.076, 0.18, -0.05], [0.018, 0.016], iron);
    part(body, [0.076, 0.19, 0.085], [0.076, 0.19, -0.2], [0.035, 0.023, 0.023, 0.037], shell);
    part(body, [0.076, 0.19, 0.086], [0.076, 0.19, 0.09], [0.028, 0.027], glass);
    part(body, [0.076, 0.19, -0.201], [0.076, 0.19, -0.205], [0.031, 0.03], glass);
  }
  // A narrow sliding neck opens into the cheek rest and the broad shoulder pad.
  const stockSection = (z: number, top: number, bottom: number, w: number): Vec3[] => [
    [-w * 0.65, top, z],
    [w * 0.65, top, z],
    [w, top - 0.012, z],
    [w * 0.8, bottom + 0.01, z],
    [w * 0.5, bottom, z],
    [-w * 0.5, bottom, z],
    [-w * 0.8, bottom + 0.01, z],
    [-w, top - 0.012, z],
  ];
  const neck = stockSection(0.055, 0.087, 0.046, 0.022);
  const cheek = stockSection(0.235, 0.107, 0.044, 0.033);
  const heel = stockSection(0.39, 0.095, -0.049, 0.039);
  loft(stock, neck, cheek, [iron], iron);
  loft(stock, cheek, heel, [shell]);
  loft(stock, heel, stockSection(0.412, 0.097, -0.052, 0.04), [iron], undefined, iron);
  // Raised chevrons along each side of the stock between the cheek rest and the heel, pointing
  // toward the muzzle like the sleeve's (the user, 2026-11-24): each arm a strip standing out of
  // the side's slope, with its two walls.
  /** A point on the stock's side `side`, `t` from the cheek (0) to the heel (1), `v` from its top (0) to its bottom (1), `h` out of it. */
  const flank = (side: number, t: number, v: number, h: number): Vec3 => {
    const w = 0.033 + 0.006 * t;
    const top = 0.107 - 0.012 * t - 0.012;
    const bottom = 0.044 - 0.093 * t + 0.01;
    return [side * (w - 0.2 * w * v + h), top + (bottom - top) * v, 0.235 + 0.155 * t];
  };
  for (const side of [-1, 1]) {
    for (const apex of lod ? [0.18, 0.42, 0.66] : [0.3, 0.6]) {
      for (const [v0, v1] of [
        [0.12, 0.5],
        [0.5, 0.88],
      ]) {
        // The arm runs from the apex (v 0.5, t apex) back to the edge (t apex + 0.2).
        const tAt = (v: number) => apex + 0.2 * (Math.abs(v - 0.5) / 0.38);
        const [ta, tb] = [tAt(v0), tAt(v1)];
        const band = 0.07;
        const h = 0.0035;
        const out: Vec3 = [side, 0, 0];
        panel(
          stock,
          [
            flank(side, ta, v0, h),
            flank(side, tb, v1, h),
            flank(side, tb + band, v1, h),
            flank(side, ta + band, v0, h),
          ],
          ridge,
          out,
        );
        if (lod) {
          for (const [edge, to] of [
            [0, -1],
            [band, 1],
          ] as const) {
            panel(
              stock,
              [
                flank(side, ta + edge, v0, 0),
                flank(side, tb + edge, v1, 0),
                flank(side, tb + edge, v1, h),
                flank(side, ta + edge, v0, h),
              ],
              iron,
              [side * 0.3, 0, to],
            );
          }
        }
      }
    }
  }
  // The feed tube the next bolt slides into on reloading (harpoonFeed(); the user, 2026-11-25: it
  // went through the stock): a spine along the bolt's axis over the stock, from inside the receiver
  // to just past the heel, where a ridged lip opens into a dark bore. The bore ends on a dark disc
  // behind the heel's face, so the stock's own end never shows inside the hole.
  const [feedR, boreR, feedEnd] = [0.026, 0.019, 0.44];
  lathe(
    stock,
    [0, 0.095, 0],
    [0, 0, 1],
    [1, 0, 0],
    [
      [0.04, feedR],
      [feedEnd - 0.008, feedR, shell],
      [feedEnd, boreR, ridge],
    ],
    ring,
  );
  skin(
    stock,
    (a, s) => [boreR * Math.cos(a), 0.095 - boreR * Math.sin(a), s],
    around(ring),
    [feedEnd, 0.42],
    () => 0,
    -1,
  );
  disc(stock, [0, 0.095, 0.42], [0, 0, 1], [1, 0, 0], boreR, ring, groove);
  part(bolt, [0, 0.095, -0.1], [0, 0.095, -1.09], [0.015, 0.016, 0.014], ivory);
  part(bolt, [0, 0.095, -1.07], [0, 0.095, -1.24], [0.018, 0.024, 0.001], silver, 0.6);
  // Two swept barbs behind the point, flat in the horizontal plane and seen from both faces: thin
  // blades, their inner edge close along the outer (the user, 2026-11-25: finer, for realism).
  for (const side of [-1, 1]) {
    for (const up of [-1, 1]) {
      panel(
        bolt,
        [
          [0, 0.095, -1.2],
          [side * 0.045, 0.095, -1.08],
          [side * 0.027, 0.095, -1.11],
        ],
        silver,
        [0, up, 0],
      );
    }
  }
  // Lift the action as one piece above the thumb, including the stock throughout its travel.
  // Brushed, scratched bronze like the armour (TWILL), the ivory bolt plain gilt: the shell is kept
  // on the GPU in first person, so its brushing holds still on it (drawHarpoon()).
  const actionRise = 0.05;
  for (const piece of [body, slide, bolt, stock]) {
    for (let i = 0; i < piece.length; i += STRIDE) {
      piece[i + 1] += actionRise;
      piece[i + 8] = piece === bolt ? GILT : TWILL;
    }
  }
  // The pistol grip stays in the right palm beneath the raised shell.
  part(body, [0, -0.05, 0.022], [0, 0.04 + actionRise, -0.026], [0.016, 0.019, 0.02], leather);
  if (lod) {
    body.push(...harpoonFine(shell, ridge, iron, actionRise, lod > 1));
  }
  return (harpoons[lod] = { body, slide, stock, bolt });
};

/**
 * A surface of revolution about `d` (unit) through `at`: `prof` its rows, each how far along `d`,
 * its radius and the colour of the band from the row before. `e` is a unit across `d`. Normals
 * are smooth round it, outward; no row may share the one before's `s` (a step is a slope).
 */
export const lathe = (
  out: number[],
  at: Vec3,
  d: Vec3,
  e: Vec3,
  prof: [number, number, Vec3?][],
  n: number,
) => {
  const f: Vec3 = [d[1] * e[2] - d[2] * e[1], d[2] * e[0] - d[0] * e[2], d[0] * e[1] - d[1] * e[0]];
  const point = (a: number, s: number, r: number): Vec3 => {
    const [c, w] = [Math.cos(a) * r, Math.sin(a) * r];
    return [0, 1, 2].map(k => at[k] + d[k] * s + e[k] * c + f[k] * w) as Vec3;
  };
  for (let k = 1; k < prof.length; k++) {
    const [s0, r0] = prof[k - 1];
    const [s1, r1, rgb = [0, 0, 0]] = prof[k];
    const [ds, dr] = [Math.abs(s1 - s0), (r1 - r0) * Math.sign(s1 - s0)];
    const normal = (a: number) =>
      unit([0, 1, 2].map(j => (e[j] * Math.cos(a) + f[j] * Math.sin(a)) * ds - d[j] * dr) as Vec3);
    for (let i = 0; i < n; i++) {
      const [a0, a1] = [(2 * Math.PI * i) / n, (2 * Math.PI * (i + 1)) / n];
      const corners: [Vec3, Vec3][] = [
        [point(a0, s0, r0), normal(a0)],
        [point(a1, s0, r0), normal(a1)],
        [point(a1, s1, r1), normal(a1)],
        [point(a0, s1, r1), normal(a0)],
      ];
      for (const [x, y, z] of [
        [0, 1, 2],
        [0, 2, 3],
      ]) {
        const [p, q, r] = [corners[x], corners[y], corners[z]];
        const [u, v] = [sub(q[0], p[0]), sub(r[0], p[0])];
        const g = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        const m = p[1];
        for (const [c, nm] of g[0] * m[0] + g[1] * m[1] + g[2] * m[2] < 0 ? [p, r, q] : [p, q, r]) {
          out.push(...c, ...nm, rgb[0], rgb[1], -1, rgb[2]);
        }
      }
    }
  }
};

/** A flat disc of radius `r` facing `d` (unit) at `at`, `e` a unit across it. */
export const disc = (
  out: number[],
  at: Vec3,
  d: Vec3,
  e: Vec3,
  r: number,
  n: number,
  rgb: Vec3,
) => {
  const f: Vec3 = [d[1] * e[2] - d[2] * e[1], d[2] * e[0] - d[0] * e[2], d[0] * e[1] - d[1] * e[0]];
  const rim = (a: number) =>
    [0, 1, 2].map(k => at[k] + (e[k] * Math.cos(a) + f[k] * Math.sin(a)) * r) as Vec3;
  for (let i = 0; i < n; i++) {
    const [p, q] = [rim((2 * Math.PI * i) / n), rim((2 * Math.PI * (i + 1)) / n)];
    const [u, v] = [sub(p, at), sub(q, at)];
    const g = u[1] * v[2] - u[2] * v[1];
    const h = u[2] * v[0] - u[0] * v[2];
    const l = u[0] * v[1] - u[1] * v[0];
    const tri = g * d[0] + h * d[1] + l * d[2] < 0 ? [at, q, p] : [at, p, q];
    for (const c of tri) {
      out.push(...c, ...d, rgb[0], rgb[1], -1, rgb[2]);
    }
  }
};

/**
 * The harpoon's close-up finish (lod 2, the own view; the user, 2026-11-24: rounder, more
 * detailed, lit buttons): a round scope on two ring mounts, its rubber eyecup toward the eye, a
 * flared objective and a sunshade, an elevation turret and a lit illumination knob, a red reticle
 * ring glowing in the eyepiece, and on the receiver's left side, toward the eye, a panel of three
 * lit buttons. Raised by `rise` with the rest of the action; made once.
 */
export const harpoonFine = (
  shell: Vec3,
  ridge: Vec3,
  iron: Vec3,
  rise: number,
  /** The own view's facets; fewer on a runner near by (lod 1). */
  close: boolean,
): number[] => {
  const metal: number[] = [];
  const glass: number[] = [];
  const lights: number[] = [];
  const Z: Vec3 = [0, 0, -1];
  const [X, Y]: Vec3[] = [
    [1, 0, 0],
    [0, 1, 0],
  ];
  const n = close ? 24 : 12;
  const small = close ? 16 : 8;
  // The scope's axis, along -z from the eyepiece; rows by distance from it. The eyepiece is
  // `back` behind the receiver's front, so both mounts stand on its closed tube (z above -0.12),
  // not over the open cradle and the bolt.
  const back = 0.12;
  const axis: Vec3 = [0.076, 0.19, back];
  lathe(
    metal,
    axis,
    Z,
    X,
    [
      [0.024, 0.021],
      [0.022, 0.03, iron],
      [0.026, 0.033, iron],
      [0.05, 0.033, iron],
      [0.054, 0.027, iron],
      [0.056, 0.028, ridge],
      [0.064, 0.028, ridge],
      [0.066, 0.023, ridge],
      [0.236, 0.023, shell],
      [0.268, 0.035, shell],
      [0.27, 0.037, ridge],
      [0.28, 0.037, ridge],
      [0.282, 0.035, ridge],
      [0.316, 0.035, shell],
      [0.318, 0.037, iron],
      [0.334, 0.037, iron],
      [0.337, 0.031, iron],
    ],
    n,
  );
  // The ring mounts: a clamp round the tube on a post down to the receiver's top.
  for (const z of [0.105, 0.205]) {
    lathe(
      metal,
      axis,
      Z,
      X,
      [
        [z - 0.008, 0.023],
        [z - 0.006, 0.026, ridge],
        [z + 0.006, 0.026, ridge],
        [z + 0.008, 0.023, ridge],
      ],
      n,
    );
    const foot: Vec3 = [0.022, 0.118, back - z];
    const top: Vec3 = [0.07, 0.17, back - z];
    const along = unit(sub(top, foot));
    lathe(
      metal,
      foot,
      along,
      Z,
      [
        [0, 0.008],
        [Math.hypot(...sub(top, foot)), 0.006, iron],
      ],
      close ? 10 : 6,
    );
  }
  // The elevation turret on top, ribbed, and the illumination knob on the left, toward the eye.
  const turret: Vec3 = [0.076, 0.19 + 0.02, back - 0.155];
  lathe(
    metal,
    turret,
    Y,
    X,
    [
      [0, 0.012],
      [0.004, 0.012, iron],
      [0.005, 0.014, ridge],
      [0.009, 0.014, ridge],
      [0.01, 0.013, iron],
      [0.016, 0.013, iron],
      [0.0175, 0.011, ridge],
    ],
    small,
  );
  disc(metal, [turret[0], turret[1] + 0.0175, turret[2]], Y, X, 0.011, small, ridge);
  const knob: Vec3 = [0.076 - 0.02, 0.19, back - 0.155];
  const L: Vec3 = [-1, 0, 0];
  lathe(
    metal,
    knob,
    L,
    Y,
    [
      [0, 0.011],
      [0.008, 0.011, iron],
      [0.009, 0.012, ridge],
      [0.014, 0.012, ridge],
      [0.015, 0.0095, ridge],
    ],
    small,
  );
  // The receiver's button panel on its left side: a dark plate with a bevelled edge.
  const [px, py0, py1, pz0, pz1] = [-0.056, 0.072, 0.11, -0.028, -0.132];
  const b = 0.004;
  const front: Vec3[] = [
    [px, py0 + b, pz0],
    [px, py1 - b, pz0],
    [px, py1 - b, pz1],
    [px, py0 + b, pz1],
  ];
  panel(metal, front, iron, L);
  for (const [y, u] of [
    [py1, 1],
    [py0, -1],
  ] as const) {
    panel(
      metal,
      [
        [px, y - u * b, pz0],
        [px + 0.012, y, pz0],
        [px + 0.012, y, pz1],
        [px, y - u * b, pz1],
      ],
      ridge,
      [-1, u, 0],
    );
  }
  for (const z of [pz0, pz1]) {
    panel(
      metal,
      [
        [px, py0 + b, z],
        [px, py1 - b, z],
        [px + 0.012, py1, z],
        [px + 0.012, py0, z],
      ],
      ridge,
      [0, 0, z === pz0 ? 1 : -1],
    );
  }
  // Each button in a raised bezel.
  const buttons: [number, Vec3][] = [
    [-0.052, [1, 0.1, 0.04]],
    [-0.08, [1, 0.1, 0.04]],
    [-0.108, [1, 0.45, 0.06]],
  ];
  for (const [z] of buttons) {
    lathe(
      metal,
      [px, 0.091, z],
      L,
      Y,
      [
        [0, 0.0085],
        [0.002, 0.0085, ridge],
        [0.0028, 0.0068, ridge],
      ],
      small,
    );
  }
  for (let i = 0; i < metal.length; i += STRIDE) {
    metal[i + 8] = TWILL;
  }
  // The lenses, dark green glass, polished.
  disc(glass, [axis[0], axis[1], back - 0.0235], [0, 0, 1], X, 0.021, n, [0.012, 0.05, 0.04]);
  disc(glass, [axis[0], axis[1], back - 0.336], Z, X, 0.031, n, [0.015, 0.07, 0.05]);
  for (let i = 0; i < glass.length; i += STRIDE) {
    glass[i + 8] = SHINE;
  }
  // The lights: the reticle's ring in the eyepiece, the illumination knob's cap, the buttons.
  const reticle = (r: number, w: number, rgb: Vec3) => {
    for (let i = 0; i < n; i++) {
      const [a0, a1] = [(2 * Math.PI * i) / n, (2 * Math.PI * (i + 1)) / n];
      const at = (a: number, q: number): Vec3 => [
        axis[0] + q * Math.cos(a),
        axis[1] + q * Math.sin(a),
        back - 0.023,
      ];
      panel(lights, [at(a0, r), at(a1, r), at(a1, r + w), at(a0, r + w)], rgb, [0, 0, 1]);
    }
  };
  reticle(0.009, 0.0016, [1, 0.12, 0.05]);
  disc(lights, [axis[0], axis[1], back - 0.023], [0, 0, 1], X, 0.0018, 6, [1, 0.12, 0.05]);
  disc(lights, [knob[0] - 0.0152, knob[1], knob[2]], L, Y, 0.0055, small, [1, 0.12, 0.05]);
  for (const [z, rgb] of buttons) {
    disc(lights, [px - 0.0029, 0.091, z], L, Y, 0.0062, small, rgb);
  }
  glow(lights, 0, 1.8);
  const out = [...metal, ...glass, ...lights];
  for (let i = 1; i < out.length; i += STRIDE) {
    out[i] += rise;
  }
  return out;
};

/** Slide and stock travel in opposite directions as the compact back-mounted rifle opens. */
/** The turn that carries the model's x, y and z onto `right`, `up` and backward (-`forward`). */
export const quatOf = ([r, u, f]: Vec3[]): Quat => {
  // The turn's matrix by columns: right, up and back.
  const [m00, m10, m20] = r;
  const [m01, m11, m21] = u;
  const [m02, m12, m22] = [-f[0], -f[1], -f[2]];
  const trace = m00 + m11 + m22;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    return [(m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s, 0.25 / s];
  }
  if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    return [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  }
  if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    return [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s];
  }
  const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
  return [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s];
};

/**
 * Slide and stock travel in opposite directions as the compact back-mounted rifle opens. With
 * `pieces`, its shell, slide and stock are kept on the GPU (store.ts) and only placed, so their
 * brushed metal lies on their rest place; the bolt, shortened as it folds, stays in `out`.
 */
export const drawHarpoon = (
  out: Out,
  lod: 0 | 1 | 2,
  at: Vec3,
  axes: Vec3[],
  scale: number,
  open: number,
  loaded = true,
  /** 0 as the reload starts to 1: the next bolt slides forward from behind the stock into its seat. */
  feed = 1,
  pieces?: Pieces,
  /** How far (m, unscaled) the bolt just fired has flown out of the muzzle; drawn under HARPOON_GONE. */
  fired = HARPOON_GONE,
) => {
  const parts = harpoonParts(lod);
  const retracted = (1 - open) * scale;
  const q = pieces && quatOf(axes);
  const put = (name: 'body' | 'stock' | 'slide', forward: number) => {
    if (pieces && q) {
      const m = mesh(`harpoon ${lod} ${name}`, o => o.push(...parts[name]));
      const t = at.map((v, i) => v + axes[2][i] * forward) as Vec3;
      pieces.push({ m, q, t, k: scale });
    } else {
      place(out, parts[name], at, axes, [0, 0, forward], scale);
    }
  };
  put('body', 0);
  put('stock', 0.13 * retracted);
  put('slide', -0.4 * retracted);
  if (loaded && feed > 0) {
    // The next bolt comes in from behind the stock, most of a bolt's length back, and seats.
    const back = HARPOON_BACK * (1 - feed) ** 2 * scale;
    place(out, parts.bolt, at, axes, [0, 0, -back], [scale, scale, scale - retracted / 3]);
  }
  if (fired < HARPOON_GONE) {
    // The bolt just fired, seen to leave the tube forward before the ball takes over.
    place(out, parts.bolt, at, axes, [0, 0, fired * scale], scale);
  }
};
/**
 * Seconds the harpoon takes to unfold as it comes to hand (drawHarpoon()'s `open`, eased): slow
 * enough to be seen (the user, 2026-11-24), SOUND.HARPOON_OPEN timed on it.
 */
export const HARPOON_DRAW = 1.1;
/** Metres a fired bolt is drawn leaving the muzzle; past this the flying ball alone shows it. */
export const HARPOON_GONE = 1.2;
/** Metres behind its seat the next bolt starts as it feeds in. */
export const HARPOON_BACK = 0.9;
/** The share of the harpoon's reload (swapOf()) at which the next bolt starts in, and its sound. */
export const HARPOON_RACK = 0.35;
/** Seconds the fired bolt takes to leave the drawn tube (HARPOON_GONE). */
export const HARPOON_OUT = 0.09;
/**
 * The next bolt's slide into its seat at `swap` of the harpoon's reload (swapOf(), 0 to 1; -1 none):
 * absent for the first 35 % (the tube empty after the shot), then eased in by 55 % (a quick slide,
 * the user, 2026-11-25), seated after.
 */
export const harpoonFeed = (swap: number): number => {
  if (swap < 0) {
    return 1;
  }
  const t = Math.min(1, Math.max(0, (swap - HARPOON_RACK) / 0.2));
  return t * t * (3 - 2 * t);
};

export const hunterHarpoon = (lod: 0 | 1 | 2): number[] => {
  const { body, stock, slide, bolt } = harpoonParts(lod);
  return body.concat(stock, slide, bolt);
};
