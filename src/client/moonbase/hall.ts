// The moon base's hall in the dome (docs/MOON.md), red's half.
import { CONSOLE_BOX, CRATES, FIT, FLIGHT, HALL, MOUTHS, PARAPETS } from '../../shared/moonbase';
import { TAU } from '../../shared/physics';
import type { Vec3 } from '../mesh';
import type { Out } from '../verts';
import { C, CONCRETE, CX, CZ, FRAME, GLASS, HALL_GLASS, LAMP, R, TOP, WHITE } from './constants';
import { block, frame, glazed, lining, panel, quad } from './kit';

const RECTS = [...HALL, ...HALL.map(([a, b]) => [b, a]).reverse()];

/**
 * The hall's wall, piece by piece round the centre: each stands in the plane of the axis k at `at`
 * (the hall toward -sign) and runs along j from s to t about the centre, with the mouth through it
 * if any (its middle, half width, height and depth) and its windows (middle along j, sill height):
 * on the long faces, a row for the floor and one for the mezzanine.
 */
export const walls = () => {
  // The wall's corners, round the centre: a quarter, then its mirrors.
  const qd = RECTS.flatMap(([c, d], i) => [
    [c, d],
    ...(RECTS[i + 1] ? [[RECTS[i + 1][0], d]] : []),
  ]);
  const loop = [
    ...qd,
    ...qd.map(([x, z]) => [-x, z]).reverse(),
    ...qd.map(([x, z]) => [-x, -z]),
    ...qd.map(([x, z]) => [x, -z]).reverse(),
  ];
  return loop.map((p, i) => {
    const n = loop[(i + 1) % loop.length];
    const k = p[0] == n[0] ? 0 : 2;
    const j = 2 - k;
    const [at, sign] = [C[k] + p[k / 2], Math.sign(p[k / 2])];
    const [s, t] = [p[j / 2], n[j / 2]].sort((a, b) => a - b);
    const m = MOUTHS.find(m => m[k / 2] == p[k / 2] && m[j / 2] > s && m[j / 2] < t);
    const [mc, mw, mh, md] = m ? [m[j / 2], m[2], m[3], m[4]] : [s, 0, 0, 0];
    const count = t - s > 6 ? Math.floor((t - s) / 2.4) : 0;
    const panes = Array.from(
      { length: count },
      (_, w) => s + ((t - s) * (w + 0.5)) / count,
    ).flatMap(c => [1.5, 4.9].filter(y => y > mh || Math.abs(c - mc) > mw + 0.8).map(y => [c, y]));
    return { p, n, k, j, at, sign, s, t, m, mc, mw, mh, md, panes };
  });
};

/**
 * The hall in the dome, all drawn here (shared/moonbase.ts collides with it as ghosts): its floor,
 * its stepped wall with windows and a strip of light, the mouths through the wall, the ledge that
 * closes the wall against the shell, the shell from inside with a lamp at its top, and what stands
 * in it.
 */
export const hall = (o: Out) => {
  for (const [c, d] of RECTS) {
    panel(o, 1, 0.02, [CX - c, 0, CZ - d], [CX + c, 0, CZ + d], CONCRETE, 1.85);
  }
  walls().forEach(({ p, k, j, at, sign, s, t, m, mc, mw, mh, md, panes }) => {
    /** A piece of it from a to b, `off` proud. */
    const put = (
      a: number,
      b: number,
      y0: number,
      y1: number,
      c: number | number[],
      l = 0,
      off = 0,
    ) => {
      const [lo, hi] = [
        [0, y0, 0],
        [0, y1, 0],
      ];
      [lo[j], hi[j]] = [C[j] + a, C[j] + b];
      panel(o, k, at - sign * off, lo, hi, c, l);
    };
    // No skirting: the dark strip below is the hall's own.
    lining(
      o,
      k,
      at,
      C[j] + s,
      C[j] + t,
      TOP,
      1.7,
      -sign,
      m ? [[C[j] + mc - mw, C[j] + mc + mw, mh]] : [],
      false,
    );
    put(s, t, 0, 0.25, FRAME, 0, 0.02);
    put(s, t, TOP - 0.6, TOP - 0.4, LAMP, 0, 0.03);
    for (const [c, y] of panes) {
      put(c - 0.72, c + 0.72, y, y + 1.4, FRAME, 0, 0.02);
      const from = o.length;
      put(c - 0.6, c + 0.6, y + 0.2, y + 1.2, GLASS, 0, 0.04);
      const n = [0, 0, 0];
      n[k] = -sign;
      glazed(o, from, n, HALL_GLASS);
    }
    // The ledge, out to the inner shell.
    const pieces = Math.ceil((t - s) / 4.2);
    for (let w = 0; w < pieces; w++) {
      const corner = (f: number, out: number): Vec3 => {
        const v: Vec3 = [0, TOP, 0];
        [v[k], v[j]] = [p[k / 2], s + ((t - s) * f) / pieces];
        const r = out ? 21.55 / Math.hypot(v[0], v[2]) : 1;
        return [CX + v[0] * r, TOP, CZ + v[2] * r];
      };
      quad(o, [corner(w, 0), corner(w + 1, 0), corner(w + 1, 1), corner(w, 1)], CONCRETE, 1);
    }
    if (m) {
      // The way through the wall: its sides, its ceiling and its floor, and a lit frame.
      const [lo, hi] = [
        [0, 0, 0],
        [0, mh, 0],
      ];
      [lo[k], hi[k]] = [at, at + sign * md].sort((a, b) => a - b);
      [lo[j], hi[j]] = [C[j] + mc - mw, C[j] + mc + mw];
      panel(o, j, lo[j], lo, hi, WHITE, 1.4);
      panel(o, j, hi[j], lo, hi, WHITE, 1.4);
      panel(o, 1, mh, lo, hi, WHITE, 0.9);
      panel(o, 1, 0.02, lo, hi, CONCRETE, 1.85);
      frame(o, k, at - sign * 0.03, lo[j], hi[j], mh);
    }
  });
  // The shell from inside: six rings of flat panels from the ledge to the top, darker toward it, and
  // a round lamp under the top. A flat colour: a texture's relief needs a normal out of the facet.
  const [M, RINGS, A] = [32, 6, Math.asin((TOP - 5) / 11.7)];
  const at = (i: number, s: number): Vec3 => {
    const [a, t] = [A + ((TAU / 4 - A) * s) / RINGS, (i * TAU) / M];
    const r = (R - 0.3) * Math.cos(a);
    return [CX + r * Math.cos(t), 5 + 11.7 * Math.sin(a), CZ + r * Math.sin(t)];
  };
  for (let s = 0; s < RINGS; s++) {
    for (let i = 0; i < M; i++) {
      const g = 0.31 - 0.028 * s - 0.018 * ((i + s) & 1);
      quad(o, [at(i, s), at(i + 1, s), at(i + 1, s + 1), at(i, s + 1)], [g, g, g * 1.06]);
    }
  }
  for (let i = 0; i < 16; i += 2) {
    const rim = (n: number): Vec3 => [
      CX + 3 * Math.cos((n * TAU) / 16),
      16.2,
      CZ + 3 * Math.sin((n * TAU) / 16),
    ];
    quad(o, [[CX, 16.2, CZ], rim(i), rim(i + 1), rim(i + 2)], LAMP);
  }
  // The railings, the console, the eagles and the machine are props.ts's (statue.ts), the stairs
  // gangway.ts's.
  const dressed = new Set([CONSOLE_BOX, ...PARAPETS, ...CRATES, ...FLIGHT]);
  FIT.filter(b => !dressed.has(b)).forEach(b => block(o, b));
};
