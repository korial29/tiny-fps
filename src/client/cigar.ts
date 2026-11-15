// The man's cigarillo (the user, 2026-11-14): thin, half smoked, clenched in the corner of his
// mouth, pointing out and a little down, a band near the lips, grey ash and a glowing ember. Carried by the head
// joint like the ninja's guard (mask.ts): made once on the man's head at rest.
import { JOINT as J, turn } from './rig';
import type { Quat } from './rig';
import { STRIDE, aim, dress, place, smooth, unit } from './mesh';
import type { Vec3 } from './mesh';
import { lipLine } from './features';
import { bindOf, onHead } from './skin';
import { room } from './verts';
import type { Out } from './verts';

/** Where the lips hold it, metres across from the mouth's middle (to his right), and the way it points. */
export const HOLD_X = 0.013;
const AXIS = unit([0.28, -0.14, -0.95]);
/** What is left of it out of the mouth, half smoked, and its radius. */
export const [LEN, R] = [0.05, 0.0042];
const [LEAF, BAND, ASH] = [
  [0.24, 0.13, 0.06],
  [0.55, 0.12, 0.08],
  [0.36, 0.35, 0.34],
];
/** The ember: unlit (layer -2), it blooms. */
export const EMBER = [2.2, 0.32, 0.05];

/** The cigarillo on the head at rest: close (`fine`, banded, round), or a plain one of four sides. */
const make = (fine: boolean): number[] => {
  const sides = fine ? 10 : 4;
  const y = lipLine(HOLD_X) - 0.0008;
  // Its mouth end a few millimetres behind the lips.
  const at: Vec3 = [HOLD_X, y, onHead(HOLD_X, y) + 0.004];
  const frame = aim(AXIS, [0, 1, 0]);
  const out: number[] = [];
  const parts: [[number, number][], number[]][] = fine
    ? [
        [
          [
            [0, -0.003],
            [R * 0.8, -0.003],
            [R * 0.95, 0],
            [R, 0.007],
          ],
          LEAF,
        ],
        [
          [
            [R, 0.007],
            [R * 1.08, 0.0073],
            [R * 1.08, 0.0112],
            [R, 0.0115],
          ],
          BAND,
        ],
        [
          [
            [R, 0.0115],
            [R, 0.025],
            [R, LEN - 0.009],
          ],
          LEAF,
        ],
        [
          [
            [R, LEN - 0.009],
            [R * 0.96, LEN - 0.004],
            [R * 0.84, LEN],
          ],
          ASH,
        ],
        [
          [
            [R * 0.84, LEN],
            [R * 0.45, LEN + 0.001],
            [0, LEN + 0.0013],
          ],
          EMBER,
        ],
      ]
    : [
        [
          [
            [0, -0.003],
            [R * 0.85, -0.003],
            [R, LEN - 0.009],
          ],
          LEAF,
        ],
        [
          [
            [R, LEN - 0.009],
            [R * 0.84, LEN],
          ],
          ASH,
        ],
        [
          [
            [R * 0.84, LEN],
            [0, LEN + 0.0013],
          ],
          EMBER,
        ],
      ];
  for (const [profile, colour] of parts) {
    const from = out.length;
    place(out, dress(smooth(profile, sides), colour), at, frame, [0, 0, 0], 1);
    if (colour == EMBER) {
      for (let i = from; i < out.length; i += STRIDE) {
        out[i + 8] = -2;
      }
    }
  }
  return out;
};

const made: number[][] = [];

/** Appends the cigar on the head joint at `at` turned by `q` (see solve()); `fine`: a close runner's. */
export const cigar = (out: Out, at: Vec3, q: Quat, fine = true) => {
  const m = (made[+fine] ??= make(fine));
  const o = bindOf(0)[J.HEAD];
  let w = out.length;
  const dst = room(out, m.length);
  for (let i = 0; i < m.length; i += STRIDE, w += STRIDE) {
    const p = turn(q, [m[i] - o[0], m[i + 1] - o[1], m[i + 2] - o[2]]);
    const n = turn(q, [m[i + 3], m[i + 4], m[i + 5]]);
    for (let c = 0; c < 3; c++) {
      dst[w + c] = at[c] + p[c];
      dst[w + 3 + c] = n[c];
    }
    for (let c = 6; c < STRIDE; c++) {
      dst[w + c] = m[i + c];
    }
  }
  out.length = w;
};
