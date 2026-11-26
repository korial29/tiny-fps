import { DECKS, HULL as SHAPE } from '../../shared/beach';
import { hash } from '../../shared/relief';
import { TEX } from '../../shared/types';
import type { V, Mat } from './types';
import {
  tex,
  ink,
  MID,
  SOOT,
  PANE,
  DOWN,
  sub,
  cross,
  unit,
  mid,
  off,
  QUAD,
  o,
  face,
  loft,
  teeth,
} from './common';
import { ROWS, ROUND, SILL, form, wide, spot, ring, SHATTER, lines, inner, skin } from './hull';
import { flat } from './inside';
import { setO } from './common';

// ---------------------------------------------------------------------------------------------
// The cabin: it carried troops. Seats along the flanks, the flight deck in the nose.

/** Olive drab canvas, its webbing darker, the seats' tubes dark grey. */
export const CANVAS = ink([0.3, 0.31, 0.16]);
export const WEB = ink([0.15, 0.16, 0.085]);
export const TUBE = ink([0.17, 0.17, 0.18]);
/** The flight deck: its consoles and seats, their cushions, and the instruments' faces, dim (a glow) or dead. */
export const CONSOLE = ink([0.13, 0.135, 0.145]);
export const CUSHION = ink([0.2, 0.21, 0.12]);
export const DIAL = ink([0.06, 0.22, 0.12], 1, -2);
export const AMBER = ink([0.3, 0.15, 0.02], 1, -2);
export const DEAD = ink([0.02, 0.025, 0.03]);

/** A tube from a to b, w across: three sides and no ends, enough at arm's length. */
export const rod = (a: V, b: V, w: number, m: Mat) => {
  const d = unit(sub(b, a));
  const s = unit(cross(d, Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]));
  const u = cross(s, d);
  const r = 0.58 * w;
  const tri = [0, 1, 2, 0].map(i =>
    off(off([0, 0, 0], s, r * Math.cos(2.0944 * i)), u, r * Math.sin(2.0944 * i)),
  );
  loft(
    tri.map(t => off(a, t)),
    tri.map(t => off(b, t)),
    () => m,
    mid(a, b),
  );
};

/** A box in the frame of `o` and its axes `ax`, from `lo` to `hi` along them: its six faces, the top (+ax[1]) in `top`. */
export const cube = (o: V, ax: V[], lo: V, hi: V, m: Mat, top = m) => {
  const at = (t: V) => off(off(off(o, ax[0], t[0]), ax[1], t[1]), ax[2], t[2]);
  const c = at(mid(lo, hi));
  for (let i = 0; i < 6; i++) {
    const [e, p, q] = [i >> 1, ((i >> 1) + 1) % 3, ((i >> 1) + 2) % 3];
    face(
      QUAD.map(k => {
        const t = [0, 0, 0];
        [t[e], t[p], t[q]] = [(i & 1 ? hi : lo)[e], (k & 1 ? hi : lo)[p], (k & 2 ? hi : lo)[q]];
        return at(t);
      }),
      i == 3 ? top : m,
      c,
    );
  }
};

/** The axes `ax` turned by `t` round the unit axis `a` (Rodrigues). */
export const turn = (ax: V[], a: V, t: number) =>
  ax.map(v => {
    const [c, s] = [Math.cos(t), Math.sin(t)];
    const k = (1 - c) * (a[0] * v[0] + a[1] * v[1] + a[2] * v[2]);
    const x = cross(a, v);
    return [0, 1, 2].map(i => v[i] * c + x[i] * s + a[i] * k);
  });

/**
 * A row of fold-down troop seats along a flank, facing in: a canvas pan and a webbed back on each,
 * slung from three tubes that run the row, legs every other seat. From xa to xb on the floor at y,
 * the lining at `w` from the line on the side sg. A seat is down, folded up, hanging broken or
 * gone, a strap of its belt dangling now and then.
 */
export const troops = (xa: number, xb: number, y: number, w: number, sg: number) => {
  /** A point `d` in from the lining. */
  const at = (x: number, h: number, d: number) => [x, y + h, MID + sg * (w - d)];
  const wall = [0, y, MID + sg * (w + 9)];
  const [d0, d1, pitch] = [0.22, 0.64, 0.55];
  const n = Math.floor((xb - xa) / pitch);
  const x0 = (xa + xb - n * pitch) / 2;
  const x1 = x0 + n * pitch;
  rod(at(x0, 1.2, d0 - 0.03), at(x1, 1.2, d0 - 0.03), 0.045, TUBE);
  rod(at(x0, 0.46, d0), at(x1, 0.46, d0), 0.04, TUBE);
  rod(at(x0, 0.45, d1), at(x1, 0.45, d1), 0.04, TUBE);
  for (let i = 0; i <= n; i += 2) {
    const x = x0 + i * pitch;
    rod(at(x, 0, d1 - 0.1), at(x, 0.45, d1), 0.035, TUBE);
    rod(at(x, 0.46, d0), at(x, 1.2, d0 - 0.03), 0.03, TUBE);
  }
  for (let i = 0; i < n; i++) {
    const [a, b] = [x0 + i * pitch + 0.035, x0 + (i + 1) * pitch - 0.035];
    const seed = Math.round(a * 20) + (sg > 0 ? 7919 : 0);
    const r = hash(seed, Math.round(y * 4), 61);
    const k = 0.85 + 0.3 * hash(seed, 3, 62);
    // The back: a sheet of webbing, two straps up and two across it, on the side facing in.
    if (r < 0.95) {
      face(
        [at(a, 0.5, d0 + 0.015), at(b, 0.5, d0 + 0.015), at(b, 1.17, d0), at(a, 1.17, d0)],
        WEB,
        wall,
        k,
      );
      for (const u of [0.3, 0.7]) {
        const x = a + u * (b - a);
        face(
          [
            at(x - 0.03, 0.5, d0 + 0.03),
            at(x + 0.03, 0.5, d0 + 0.03),
            at(x + 0.03, 1.17, d0 + 0.02),
            at(x - 0.03, 1.17, d0 + 0.02),
          ],
          CANVAS,
          wall,
          k,
        );
      }
      for (const h of [0.7, 0.98]) {
        face(
          [
            at(a, h, d0 + 0.035),
            at(b, h, d0 + 0.035),
            at(b, h + 0.1, d0 + 0.035),
            at(a, h + 0.1, d0 + 0.035),
          ],
          CANVAS,
          wall,
          k,
        );
      }
    }
    if (r < 0.58) {
      // Down: the canvas sags between the rails.
      const sag = [
        at(a, 0.46, d0),
        at(b, 0.46, d0),
        at(b, 0.42, (d0 + d1) / 2),
        at(a, 0.42, (d0 + d1) / 2),
      ];
      face(sag, CANVAS, DOWN, k);
      face([sag[3], sag[2], at(b, 0.45, d1), at(a, 0.45, d1)], CANVAS, DOWN, k);
    } else if (r < 0.84) {
      // Folded up against the back.
      face(
        [
          at(a, 0.5, d0 + 0.07),
          at(b, 0.5, d0 + 0.07),
          at(b, 0.92, d0 + 0.09),
          at(a, 0.92, d0 + 0.09),
        ],
        CANVAS,
        wall,
        0.8 * k,
      );
    } else if (r < 0.93) {
      // Torn off its front rail, hanging from the back one.
      face(
        [
          at(a, 0.46, d0),
          at(b, 0.46, d0),
          at(b - 0.04, 0.08, d0 + 0.18),
          at(a + 0.06, 0.1, d0 + 0.2),
        ],
        CANVAS,
        wall,
        0.75 * k,
      );
    }
    if (hash(seed, 5, 63) < 0.3) {
      // A belt's strap hanging from the front rail, its buckle at the end.
      const x = a + (b - a) * (0.25 + 0.5 * hash(seed, 6, 64));
      const l = 0.15 + 0.2 * hash(seed, 7, 65);
      const s = 0.06 * (hash(seed, 8, 66) - 0.5);
      face(
        [
          at(x - 0.025, 0.44, d1 + 0.02),
          at(x + 0.025, 0.44, d1 + 0.02),
          at(x + 0.025 + s, l, d1 + 0.05),
          at(x - 0.025 + s, l, d1 + 0.05),
        ],
        WEB,
        wall,
        k,
      );
      face(
        [
          at(x - 0.04 + s, l, d1 + 0.055),
          at(x + 0.04 + s, l, d1 + 0.055),
          at(x + 0.04 + s, l - 0.06, d1 + 0.055),
          at(x - 0.04 + s, l - 0.06, d1 + 0.055),
        ],
        TUBE,
        wall,
      );
    }
  }
};

/**
 * Where the troops sat: rows along both flanks of the middle section's hold and deck and of the
 * nose's, each section, its floor (-1 the lowest, else the index in DECKS) and x0, x1. The rows leave the doors, the tears,
 * the holes across a deck and the broken ends free, and stop short of the wall in the trees.
 */
export const ROWS_OF_SEATS = [
  [1, -1, 44.6, 57.1],
  [1, -1, 60.9, 73.4],
  [1, 0, 44.6, 47.3],
  [1, 0, 55.3, 66.8],
  [1, 0, 70.7, 73.4],
  [2, -1, 82.6, 88.9],
  [2, -1, 91.1, 94.5],
  [2, 0, 91.2, 94.5],
];

/** The flight deck behind the canopy: two pilots' seats, the instrument panel under the windscreen, the pedestal with its throttles, the overhead panel, and what the crash threw about. */
export const cockpit = () => {
  const c = SHAPE.axis[2];
  const y = c + SILL;
  /** The drawn skin's half width at x and the height y. */
  const half = (x: number) => {
    const [, k, q, d] = form(2, x);
    return wide(2, x, (y - c + d) / ((1 - 0.2 * k) * q));
  };
  // The floor, from the upper deck's end to the panel, inside the skin.
  const fx = [97, 98.5, 100, 101.4];
  fx.slice(1).forEach((x, i) => {
    const [p, q] = [fx[i], x].map(e => half(e) - 0.12);
    face(
      [
        [fx[i], y, MID - p],
        [x, y, MID - q],
        [x, y, MID + q],
        [fx[i], y, MID + p],
      ],
      tex(TEX.METAL, 0.3),
      DOWN,
    );
  });
  const F = [1, 0, 0];
  const U = [0, 1, 0];
  const S = [0, 0, 1];
  // The pilots' seats, the co-pilot's torn from its rails and tipped against the pedestal.
  for (const sg of [-1, 1]) {
    const o = [98.35, y, MID + sg * 0.85];
    let ax = [F, U, S];
    if (sg < 0) {
      ax = turn(turn(ax, F, -0.32), U, 0.35);
      o[1] += 0.06;
    }
    cube(o, ax, [-0.2, 0, -0.17], [0.2, 0.32, 0.17], CONSOLE);
    cube(o, ax, [-0.26, 0.32, -0.26], [0.27, 0.44, 0.26], CUSHION);
    const bk = turn(ax, ax[2], 0.22);
    const p = off(off(o, ax[0], -0.24), ax[1], 0.42);
    cube(p, bk, [-0.13, 0, -0.26], [0, 0.82, 0.26], CUSHION);
    cube(p, bk, [-0.12, 0.84, -0.16], [0.03, 1.08, 0.16], CONSOLE);
    for (const e of [-0.24, 0.24]) {
      // The harness's straps over the back, and the armrests.
      const h = (t: V) => off(off(off(p, bk[0], t[0]), bk[1], t[1]), bk[2], t[2]);
      face(
        [
          h([0.01, 0.8, e * 0.5 - 0.04]),
          h([0.01, 0.8, e * 0.5 + 0.04]),
          h([0.02, 0.05, e * 0.7 + 0.04]),
          h([0.02, 0.05, e * 0.7 - 0.04]),
        ],
        WEB,
        h([-1, 0.4, 0]),
      );
      const a = (t: V) => off(off(off(o, ax[0], t[0]), ax[1], t[1]), ax[2], t[2]);
      rod(a([-0.22, 0.68, e * 1.25]), a([0.2, 0.68, e * 1.25]), 0.06, CONSOLE);
      rod(a([0.14, 0.68, e * 1.25]), a([0.14, 0.42, e * 1.1]), 0.035, TUBE);
    }
  }
  // The pedestal between them, its throttles, two pulled back.
  cube([98.75, y, MID], [F, U, S], [0, 0, -0.22], [1.7, 0.66, 0.22], CONSOLE);
  for (let i = 0; i < 4; i++) {
    const z = MID - 0.13 + (0.26 * i) / 3;
    const b = [99.15 + (i == 1 || i == 2 ? 0.12 : 0), y + 0.66, z];
    const t = off(b, [i % 3 ? 0.16 : -0.1, 0.24, 0]);
    rod(b, t, 0.035, TUBE);
    cube(t, [F, U, S], [-0.035, -0.02, -0.04], [0.035, 0.05, 0.04], i < 2 ? CUSHION : DEAD);
  }
  for (let i = 0; i < 3; i++) {
    face(
      flat(99.6 + 0.3 * i, 99.82 + 0.3 * i, y + 0.665, MID - 0.15, MID + 0.15),
      i == 1 ? AMBER : DEAD,
      DOWN,
    );
  }
  // The instrument panel under the windscreen, a glare shield over it, its faces dim or dead.
  const lean = turn([F, U, S], S, 0.28);
  cube([100.45, y, MID], lean, [0, 0, -1.75], [0.85, 0.92, 1.75], CONSOLE);
  cube(off([100.45, y, MID], lean[1], 0.92), lean, [-0.18, 0, -1.6], [0.6, 0.07, 1.6], DEAD);
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 9; i++) {
      const z = -1.5 + (3 * i) / 8;
      const wd = i == 3 || i == 5 ? 0.17 : 0.1;
      const r = hash(i, row, 71);
      const m = i == 4 ? DEAD : r < 0.45 ? DIAL : r < 0.55 ? AMBER : DEAD;
      const p = off(off([100.45, y, MID], lean[1], 0.38 + 0.3 * row), lean[0], -0.005);
      face(
        QUAD.map(k =>
          off(off(p, lean[1], (k & 2 ? 1 : -1) * (wd - 0.02)), lean[2], z + (k & 1 ? wd : -wd)),
        ),
        m,
        off(p, [9, 0, 0]),
      );
    }
  }
  // The overhead panel, still held aft under the roof, torn from its forward mount and hanging, cables down from it.
  const hang = turn([F, U, S], S, -0.35);
  const o = [99.1, spot(2, 97.6, 0, SHAPE.r, 1)[1] - 0.75, MID];
  cube(o, hang, [-1.6, -0.07, -0.5], [0, 0.07, 0.5], CONSOLE, DEAD);
  for (let i = 0; i < 5; i++) {
    const p = off(off(o, hang[0], -0.2 - 0.3 * i), hang[1], -0.075);
    face(
      QUAD.map(k =>
        off(off(p, hang[0], k & 1 ? 0.1 : -0.1), hang[2], (k & 2 ? 0.3 : -0.3) + 0.08 * (i - 2)),
      ),
      i == 1 ? AMBER : i == 3 ? DIAL : DEAD,
      off(p, hang[1], 9),
    );
  }
  for (let i = 0; i < 4; i++) {
    const p = off(o, hang[0], -0.4 - 0.35 * i);
    rod(
      p,
      off(p, [0.1 * (i - 1.5), -0.5 - 0.4 * hash(i, 1, 72), 0.15 * (i - 1.5)]),
      0.03,
      i & 1 ? SOOT : TUBE,
    );
  }
  // Debris on the floor: a fallen panel, a seat's cushion, plates against the flanks.
  cube(
    [97.5, y, MID + 0.35],
    turn([F, U, S], U, 0.6),
    [-0.3, 0, -0.2],
    [0.3, 0.05, 0.2],
    CONSOLE,
    DEAD,
  );
  cube(
    [97.3, y, MID - 1.9],
    turn([F, U, S], U, -0.4),
    [-0.25, 0, -0.22],
    [0.25, 0.1, 0.22],
    CUSHION,
  );
  for (const sg of [-1, 1]) {
    const z = MID + sg * (half(99.6) - 0.25);
    face(
      [
        [99, y, z],
        [100.2, y, z],
        [100.1, y + 0.7, z - sg * 0.12],
        [99.1, y + 0.65, z - sg * 0.12],
      ],
      CONSOLE,
      [99.6, y, MID],
    );
  }
};

/** The canopy's glass, apart from the hull: its panes, and the shards round the broken ones. */
export const canopy = (): number[] => {
  setO([]);
  skin(2, 'glass');
  const c = SHAPE.axis[2];
  for (const [p, q, a, b, sg] of SHATTER) {
    const ja = ROWS.indexOf(a);
    const jb = ROWS.indexOf(b);
    const pt = (x: number, j: number) => ring(2, x)[sg > 0 ? j : ROUND - j];
    const edges = [
      Array.from({ length: jb - ja + 1 }, (_, j) => pt(p, ja + j)),
      Array.from({ length: jb - ja + 1 }, (_, j) => pt(q, ja + j)),
      [pt(p, ja), pt(q, ja)],
      [pt(p, jb), pt(q, jb)],
    ];
    const cen = mid(mid(pt(p, ja), pt(q, jb)), mid(pt(q, ja), pt(p, jb)));
    for (const e of edges) {
      e.slice(1).forEach((v, i) => {
        const d = unit(sub(cen, mid(e[i], v)));
        teeth(
          e[i],
          v,
          d.map(t => t * 0.45),
          3,
          PANE,
          1,
          [e[i][0], c, MID],
        );
      });
    }
  }
  return o;
};

/** Inside the hull: the troops' seats in rows on its flanks and the flight deck. */
export const cabin = () => {
  for (const [n, deck, xa, xb] of ROWS_OF_SEATS) {
    const i = deck < 0 ? 0 : lines(n).indexOf(DECKS[deck]);
    for (const sg of [-1, 1]) {
      troops(xa, xb, SHAPE.axis[n] + lines(n)[i], inner(n, (xa + xb) / 2, i), sg);
    }
  }
  cockpit();
};
