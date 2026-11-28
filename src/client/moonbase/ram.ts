// Red's statues (the user, 2026-11-27, on a picture of a ram's skull in armour): on each plinth by
// the hall's door, a ram's head of dark steel plates, its eyes glowing red, a ridge down its face,
// brown ribbed horns curled round, before a dark shield with steel slats along its lower edges.
// Over the plinth, not collided.
import { CRATES } from '../../shared/moonbase';
import type { Brush } from '../../shared/world';
import { capsule, dress } from '../mesh';
import { lit } from '../brick';
import type { Out } from '../verts';
import { INK, RED } from './constants';
import { inside } from './kit';
import { sculpt } from './sculpt';

const HORN = dress(capsule(1, [1, 1], 8, [0, 0]), [1, 1, 1]);
export const [STEEL, PLATE, EDGE] = [
  [0.3, 0.3, 0.33],
  [0.24, 0.24, 0.27],
  [0.46, 0.47, 0.5],
];
export const SHIELD = [0.14, 0.14, 0.16];
export const HORNS = [
  [0.34, 0.22, 0.12],
  [0.28, 0.18, 0.1],
];
const RIB = [0.18, 0.12, 0.07];

/** The mask's outlines from the crown to the chin: height, half width, front, back, how far forward. */
export const MASK = [
  [1.62, 0.18, 0.1, 0.18, -0.02],
  [1.46, 0.27, 0.2, 0.24, 0],
  [1.22, 0.3, 0.26, 0.25, 0.02],
  [1.0, 0.24, 0.25, 0.22, 0.05],
  [0.78, 0.17, 0.26, 0.17, 0.1],
  [0.58, 0.13, 0.25, 0.12, 0.14],
  [0.48, 0.09, 0.18, 0.09, 0.15],
];

/** The shield's outline (a, y in metres): wide at the horns, pointed below. */
export const OUTLINE = [
  [0, 1.85],
  [0.55, 1.7],
  [0.95, 1.25],
  [0.9, 0.95],
  [0.15, 0.22],
  [-0.15, 0.22],
  [-0.9, 0.95],
  [-0.95, 1.25],
  [-0.55, 1.7],
];
/** The horns' pieces along them, and the point t (0 at the crown, 1 at the tip) of the one on side s, (a, y, b). */
export const HORN_N = 22;
export const horn = (s: number, t: number) => {
  const th = Math.PI * (0.8 - 1.75 * t);
  const R = 0.4 * (1 - 0.6 * t);
  return [s * (0.62 + R * Math.cos(th)), 1.15 + R * Math.sin(th), -0.05 + 0.32 * t];
};
/** The horn's radius at piece i. */
export const hornR = (i: number) => 0.12 * (1 - 0.72 * (i / HORN_N)) + 0.022;

const ram = (o: Out, b: Brush) => {
  const { ball, limb, both, loft } = sculpt(o, b);
  // The shield behind: a plate 6 cm thick, wide at the horns, pointed below.
  loft(
    [-0.36, -0.3].map(z => OUTLINE.map(([a, y]) => [a, y, z])),
    () => SHIELD,
  );
  // Its rim, and steel slats across its two lower edges.
  for (let i = 0; i < OUTLINE.length; i++) {
    const [p, q] = [OUTLINE[i], OUTLINE[(i + 1) % OUTLINE.length]];
    limb([p[0], p[1], -0.29], [q[0], q[1], -0.29], 0.025, EDGE);
  }
  for (const s of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const t = 0.12 + (0.76 * i) / 5;
      const [a, y] = [s * (0.9 - 0.75 * t), 0.95 - 0.73 * t];
      // Across the edge, inward: the edge runs (-0.75 s, -0.73), its normal (0.73 s, -0.75) out.
      limb(
        [a - 0.73 * s * 0.16, y + 0.75 * 0.16, -0.27],
        [a - 0.73 * s * 0.02, y + 0.75 * 0.02, -0.27],
        0.022,
        EDGE,
      );
    }
  }
  // The mount under the head.
  loft(
    [0, 0.5].map(y => [
      [-0.16, y, -0.28],
      [-0.12, y, 0.08],
      [0.12, y, 0.08],
      [0.16, y, -0.28],
    ]),
    () => PLATE,
  );
  // The mask: eight facets round each outline, the front ones lighter, a keel down the middle.
  loft(
    MASK.map(([y, w, f, k, off]) => [
      [-w, y, off - k],
      [-w, y, off + 0.3 * f],
      [-0.6 * w, y, off + 0.8 * f],
      [0, y, off + f],
      [0.6 * w, y, off + 0.8 * f],
      [w, y, off + 0.3 * f],
      [w, y, off - k],
      [0, y, off - k - 0.05],
    ]),
    (side, ring) => (side == 2 || side == 3 ? STEEL : (side + ring) & 1 ? PLATE : STEEL),
  );
  for (let r = 0; r + 1 < MASK.length - 1; r++) {
    const [p, q] = [MASK[r], MASK[r + 1]];
    limb([0, p[0], p[4] + p[2] + 0.005], [0, q[0], q[4] + q[2] + 0.005], 0.022, EDGE);
  }
  for (const s of [-1, 1]) {
    // A brow over each eye, angled down to the middle; a dark socket, a red eye glowing in it.
    both(
      [
        [s * 0.04, 1.17, 0.31],
        [s * 0.31, 1.25, 0.2],
        [s * 0.31, 1.15, 0.21],
        [s * 0.06, 1.08, 0.31],
      ],
      EDGE,
    );
    ball(s * 0.14, 1.02, 0.235, [0.085, 0.065, 0.03], INK, true);
    lit(o, 1.8, () => ball(s * 0.14, 1.025, 0.25, [0.055, 0.042, 0.025], RED));
    // A cheek plate down to the muzzle, a nostril at its end.
    both(
      [
        [s * 0.2, 0.95, 0.26],
        [s * 0.12, 0.62, 0.38],
        [s * 0.08, 0.62, 0.395],
        [s * 0.12, 0.95, 0.29],
      ],
      PLATE,
    );
    ball(s * 0.05, 0.56, 0.385, [0.028, 0.02, 0.012], INK, true);
    // The horn: from the crown, out and over, down and forward, curling in by the cheek, ribbed.
    for (let i = 0; i < HORN_N; i++) {
      const [p, q] = [horn(s, i / HORN_N), horn(s, (i + 1) / HORN_N)];
      const r = hornR(i);
      limb(p, q, r, HORNS[i & 1], HORN);
      limb(
        q,
        q.map((v, j) => v + (q[j] - p[j]) * 0.15),
        r * 1.08,
        RIB,
        HORN,
      );
    }
  }
};

/** The rams on red's two plinths by the door. */
export const rams = (o: Out) => inside(o, () => [CRATES[0], CRATES[1]].forEach(b => ram(o, b)));
