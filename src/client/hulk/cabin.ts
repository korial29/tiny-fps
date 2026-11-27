import { DECKS, HULL as SHAPE, SHIP } from '../../shared/beach';
import { hash } from '../../shared/relief';
import type { V } from './types';
import {
  ink,
  MID,
  SOOT,
  PANE,
  DOWN,
  sub,
  unit,
  mid,
  off,
  QUAD,
  o,
  face,
  teeth,
  setO,
} from './common';
import { ROWS, ROUND, SILL, form, wide, spot, ring, SHATTER, skin } from './hull';
import { flat, reach } from './inside';
import { rod, cube, slab, turn } from './shapes';
import { trim } from './trim';
import { seats, galley, lavatory } from './seats';
import { LUGGAGE, luggage } from './hold';
import { captain, cap } from './pilot';
import { back } from './chair';

// ---------------------------------------------------------------------------------------------
// The cabin of an airliner (the user, 2026-11-27): the passengers' seats, the galleys and a
// lavatory, the luggage in the holds, the trim, and the flight deck in the nose with its captain.

/** The harnesses' webbing and the seats' tubes, dark grey. */
export const WEB = ink([0.1, 0.1, 0.11]);
export const TUBE = ink([0.17, 0.17, 0.18]);
/** The flight deck: its grey consoles and seats, their sheepskin cushions, the carpet, and the instruments' faces, dim (a glow) or dead. */
export const CONSOLE = ink([0.17, 0.18, 0.2]);
export const CUSHION = ink([0.26, 0.24, 0.21]);
const DECK_CARPET = ink([0.07, 0.07, 0.08]);
export const DIAL = ink([0.06, 0.22, 0.12], 1, -2);
export const AMBER = ink([0.3, 0.15, 0.02], 1, -2);
export const DEAD = ink([0.02, 0.025, 0.03]);

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
      DECK_CARPET,
      DOWN,
    );
  });
  const F = [1, 0, 0];
  const U = [0, 1, 0];
  const S = [0, 0, 1];
  // The pilots' seats: the captain's on the left (-z, yaw zero faces -z and the nose is +x),
  // the first officer's torn from its rails and tipped against the pedestal.
  for (const sg of [-1, 1]) {
    const o = [98.35, y, MID + sg * 0.85];
    let ax = [F, U, S];
    if (sg > 0) {
      ax = turn(turn(ax, F, -0.32), U, -0.35);
      o[1] += 0.06;
    }
    // The pedestal, then the cushion rounded at its front and back, raised at its sides, and the
    // back's shell (chair.ts).
    slab(o, ax, [-0.2, 0, -0.17], [0.2, 0.32, 0.17], 0.05, CONSOLE);
    slab(
      o,
      ax,
      [-0.26, 0.31, -0.24],
      [0.27, 0.44, 0.24],
      [0.02, 0.04, 0.07, 0.04],
      CUSHION,
      CUSHION,
      3,
    );
    for (const e of [-1, 1]) {
      const [z0, z1] = [e * 0.17, e * 0.27].sort((a, b) => a - b);
      slab(o, [ax[2], ax[1], ax[0]], [z0, 0.33, -0.25], [z1, 0.5, 0.25], 0.06, CUSHION, CUSHION, 3);
    }
    const bk = turn(ax, ax[2], 0.22);
    const p = off(off(o, ax[0], -0.24), ax[1], 0.42);
    back(p, bk, CUSHION, CONSOLE);
    for (const e of [-0.24, 0.24]) {
      // The harness's straps over the back, and the armrests.
      const h = (t: V) => off(off(off(p, bk[0], t[0]), bk[1], t[1]), bk[2], t[2]);
      face(
        [
          h([0.035, 0.8, e * 0.5 - 0.04]),
          h([0.035, 0.8, e * 0.5 + 0.04]),
          h([0.04, 0.05, e * 0.7 + 0.04]),
          h([0.04, 0.05, e * 0.7 - 0.04]),
        ],
        WEB,
        h([-1, 0.4, 0]),
      );
      const a = (t: V) => off(off(off(o, ax[0], t[0]), ax[1], t[1]), ax[2], t[2]);
      slab(o, ax, [-0.22, 0.64, e * 1.25 - 0.035], [0.2, 0.71, e * 1.25 + 0.035], 0.03, CONSOLE);
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
  captain(98.36, y + 0.44, MID - 0.85);
  cap(97.6, y, MID - 1.55, 0.7);
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

/** Inside the hull: the seats, galleys and lavatory, the luggage, the trim on the linings, and the flight deck. */
export const cabin = () => {
  SHIP.forEach((_, n) => {
    seats(n);
    trim(n);
  });
  for (const [n, xa, xb] of LUGGAGE) {
    luggage(n, xa, xb);
  }
  // The aft galley at the tail's bulkhead, the forward one and a lavatory before the nose's.
  const [stern] = reach(0);
  for (const sg of [-1, 1]) {
    galley(0, stern, DECKS[0], sg, 1);
  }
  const [, bow] = reach(2);
  galley(2, bow, DECKS[0], -1, -1);
  lavatory(2, bow, DECKS[0], 1, -1);
  cockpit();
};
