// What stands in the flag's hall in place of white blocks (the user, 2026-11-27): metal railings on
// the mezzanine's parapets, two eagles of dark metal on white plinths by the door, a dark machine
// for the big crate and a console at the mezzanine's back. Each keeps its ghost's box
// (shared/moonbase.ts) to collide with; an eagle stands over its plinth's top and is not collided.
import { CONSOLE_BOX, CRATES, PARAPETS } from '../../shared/moonbase';
import type { Brush } from '../../shared/world';
import { capsule, dress, segment } from '../mesh';
import { face, lit } from '../brick';
import type { Vec3 } from '../mesh';
import type { Out } from '../verts';
import { C, CYAN, INK, SNOW, TOP, TRIM } from './constants';
import { inside, panel } from './kit';
import { walls } from './hall';
import { bevel } from './round';
import { desk } from './desk';
import { gangway } from './gangway';

const ROD = dress(capsule(1, [1, 1], 6, [0, 0]), [1, 1, 1]);
const STEEL = [0.6, 0.62, 0.66];

/** A box between two corners in any order. */
const cube = (o: Out, p: Vec3, q: Vec3, rgb: number[], e: number) =>
  bevel(
    o,
    p.map((v, i) => Math.min(v, q[i])) as Vec3,
    p.map((v, i) => Math.max(v, q[i])) as Vec3,
    rgb,
    e,
  );

/** A railing over the box b along x: posts at most 1.1 m apart, a hand rail, a middle rail and a kick plate. */
const railing = (o: Out, { min, max }: Brush) => {
  const [z, y0, y1] = [(min[2] + max[2]) / 2, min[1], max[1]];
  const n = Math.ceil((max[0] - min[0]) / 1.1);
  for (let i = 0; i <= n; i++) {
    const x = min[0] + 0.05 + ((max[0] - min[0] - 0.1) * i) / n;
    segment(o, ROD, [x, y0, z], [x, y1 - 0.03, z], [1, 0, 0], 1, 0.03, STEEL);
  }
  segment(o, ROD, [min[0], y1 - 0.04, z], [max[0], y1 - 0.04, z], [0, 1, 0], 1, 0.04, STEEL);
  segment(
    o,
    ROD,
    [min[0], (y0 + y1) / 2, z],
    [max[0], (y0 + y1) / 2, z],
    [0, 1, 0],
    1,
    0.022,
    STEEL,
  );
  cube(o, [min[0], y0, z - 0.02], [max[0], y0 + 0.12, z + 0.02], TRIM, 0.005);
};

/** A plinth filling the box b: a dark foot, a white column, a dark cap at its top, a statue on it (eagle.ts, ram.ts). */
const plinth = (o: Out, { min, max }: Brush) => {
  const [x, z, top] = [(min[0] + max[0]) / 2, (min[2] + max[2]) / 2, max[1]];
  cube(o, [min[0], 0, min[2]], [max[0], 0.22, max[2]], TRIM, 0.03);
  cube(o, [x - 0.75, 0.22, z - 0.75], [x + 0.75, top - 0.12, z + 0.75], SNOW, 0.04);
  cube(o, [min[0] + 0.1, top - 0.12, min[2] + 0.1], [max[0] - 0.1, top, max[2] - 0.1], TRIM, 0.03);
};

/** The big crate as a dark machine: a bevelled case, grilles, a lit band round it. */
const machine = (o: Out, { min, max }: Brush) => {
  cube(o, [min[0] + 0.05, 0, min[2] + 0.05], [max[0] - 0.05, max[1], max[2] - 0.05], TRIM, 0.08);
  const [cx, cz] = [(min[0] + max[0]) / 2, (min[2] + max[2]) / 2];
  for (let i = 0; i < 6; i++) {
    const y = 0.4 + i * 0.12;
    face(
      o,
      [
        [min[0] + 0.035, y, cz - 0.7],
        [min[0] + 0.035, y, cz + 0.7],
        [min[0] + 0.035, y + 0.05, cz + 0.7],
        [min[0] + 0.035, y + 0.05, cz - 0.7],
      ],
      INK,
      [cx, y, cz],
    );
  }
  lit(o, 1.3, () => {
    const y = max[1] - 0.45;
    const [a, b, c, d]: Vec3[] = [
      [min[0] + 0.03, y, min[2] + 0.03],
      [max[0] - 0.03, y, min[2] + 0.03],
      [max[0] - 0.03, y, max[2] - 0.03],
      [min[0] + 0.03, y, max[2] - 0.03],
    ];
    const up = (p: Vec3): Vec3 => [p[0], p[1] + 0.06, p[2]];
    for (const [p, q] of [
      [a, b],
      [b, c],
      [c, d],
      [d, a],
    ]) {
      face(o, [p, q, up(q), up(p)], CYAN, [cx, y, cz]);
    }
  });
};

/** Dark grey pilasters between the hall's upper windows, from the floor to its strip of light, but over a mouth. */
const pilasters = (o: Out) => {
  for (const { k, j, at, sign, panes, mc, mw } of walls()) {
    const row = panes.filter(([, y]) => y > 4);
    for (let w = 0; w + 1 < row.length; w++) {
      const c = (row[w][0] + row[w + 1][0]) / 2;
      if (Math.abs(c - mc) < mw + 0.3) {
        continue;
      }
      const [lo, hi] = [
        [0, 0, 0],
        [0, TOP - 0.6, 0],
      ];
      [lo[j], hi[j]] = [C[j] + c - 0.18, C[j] + c + 0.18];
      panel(o, k, at - sign * 0.025, lo, hi, TRIM);
    }
  }
};

/** The hall's railings, eagles, machine, stairs, console and pilasters, red's half. */
export const statues = (o: Out) => {
  pilasters(o);
  inside(o, () => {
    PARAPETS.forEach(b => railing(o, b));
    plinth(o, CRATES[0]);
    plinth(o, CRATES[1]);
    machine(o, CRATES[2]);
    gangway(o);
  });
  const { min, max } = CONSOLE_BOX;
  desk(o, 2, max[2], 1, min[0], max[0], min[1], max[2] - min[2] - 0.02);
};
