// The tubes' insides as corridors (docs/MOON.md, the user's picture of 2026-11-27): a frame with
// cut upper corners every BAY, and in each bay between them a panel of lit slots on one wall, a
// dark panel with a red light on the other, lamp slats on the ceiling, a grating in the floor and
// two pipes along the ceiling's edge. Drawn only: the frames stand 0.2 m proud of the walls.
import { TUBES, HEAD, WALL } from '../../shared/moonbase';
import { capsule, dress, segment } from '../mesh';
import { face, lit } from '../brick';
import type { Vec3 } from '../mesh';
import type { Out } from '../verts';
import { INK, IRON, RED, TRIM } from './constants';
import { inside } from './kit';
import { ring } from './round';

/** A bay's length, the frames' thickness along the tube, how far they stand in, their cut corner. */
const [BAY, THICK, IN, CUT] = [3.5, 0.3, 0.18, 0.7];
const FRAME = TRIM;
const RIM = TRIM.map(v => v * 0.8);
const PIPE = dress(capsule(1, [1, 1], 8, [0, 0]), [1, 1, 1]);
const SLOT = [1, 1, 1];
const DUSK = [0.035, 0.037, 0.045];

export const corridors = (o: Out) =>
  TUBES.forEach(({ min, max }, n) => {
    const k = n ? 2 : 0;
    const j = 2 - k;
    const [a0, b0] = [min[k], n ? TUBES[0].min[2] : max[k]];
    const [w0, w1] = [min[j] + WALL, max[j] - WALL];
    const H = HEAD;
    /** The point t along the tube, y up, s across it. */
    const L = (t: number, y: number, s: number): Vec3 => {
      const p: Vec3 = [0, y, 0];
      p[k] = t;
      p[j] = s;
      return p;
    };
    const mid = (w0 + w1) / 2;
    // The frames: the wall side of their outline and the inner side, paired point for point.
    const outer = [
      [w0, 0],
      [w0, 1.9],
      [w0, H],
      [w0 + CUT, H],
      [w1 - CUT, H],
      [w1, H],
      [w1, 1.9],
      [w1, 0],
    ];
    const inner = [
      [w0 + IN, 0],
      [w0 + IN, 1.9],
      [w0 + CUT, H - IN],
      [w0 + CUT, H - IN],
      [w1 - CUT, H - IN],
      [w1 - CUT, H - IN],
      [w1 - IN, 1.9],
      [w1 - IN, 0],
    ];
    const frames: number[] = [];
    for (let t = a0 + BAY / 2; t < b0 - 1; t += BAY) {
      frames.push(t);
    }
    inside(o, () => {
      for (const t of frames) {
        const c = L(t, H / 2, mid);
        for (const e of [-THICK / 2, THICK / 2]) {
          for (let i = 0; i + 1 < outer.length; i++) {
            const q = [outer[i], outer[i + 1], inner[i + 1], inner[i]].map(([s, y]) =>
              L(t + e, y, s),
            );
            face(o, q, FRAME, c);
          }
        }
        for (let i = 0; i + 1 < inner.length; i++) {
          const [p, q] = [inner[i], inner[i + 1]];
          if (p[0] == q[0] && p[1] == q[1]) {
            continue;
          }
          const wall = L(
            t,
            (outer[i][1] + outer[i + 1][1]) / 2,
            (outer[i][0] + outer[i + 1][0]) / 2,
          );
          face(
            o,
            [
              L(t - THICK / 2, p[1], p[0]),
              L(t + THICK / 2, p[1], p[0]),
              L(t + THICK / 2, q[1], q[0]),
              L(t - THICK / 2, q[1], q[0]),
            ],
            RIM,
            wall,
          );
        }
      }
      // The pipes along the ceiling's edge, through the frames.
      for (const [s, y, r] of [
        [w0 + 0.32, H - 0.12, 0.075],
        [w0 + 0.52, H - 0.1, 0.05],
      ]) {
        segment(o, PIPE, L(a0, y, s), L(b0, y, s), [0, 1, 0], 1, r, IRON);
      }
    });
    // In each bay: the wall panels, the lamp slats, the grating.
    for (let b = 0; b + 1 < frames.length; b++) {
      const t = (frames[b] + frames[b + 1]) / 2;
      const [lightAt, darkAt] = b & 1 ? [w1, w0] : [w0, w1];
      const out = (w: number) => (w == w0 ? 1 : -1);
      // A dark plate with two columns of lit slots, on one wall.
      const so = out(lightAt);
      inside(o, () => {
        const q = [
          L(t - 0.45, 0.45, lightAt + so * 0.03),
          L(t + 0.45, 0.45, lightAt + so * 0.03),
          L(t + 0.45, 2.05, lightAt + so * 0.03),
          L(t - 0.45, 2.05, lightAt + so * 0.03),
        ];
        face(o, q, INK, L(t, 1.2, lightAt - so));
      });
      inside(o, () =>
        lit(o, 1.25, () => {
          for (const c of [-0.2, 0.2]) {
            for (let r = 0; r < 7; r++) {
              const y = 0.6 + r * 0.2;
              const z = lightAt + so * 0.036;
              face(
                o,
                [
                  L(t + c - 0.14, y, z),
                  L(t + c + 0.14, y, z),
                  L(t + c + 0.14, y + 0.09, z),
                  L(t + c - 0.14, y + 0.09, z),
                ],
                SLOT,
                L(t, 1.2, lightAt - so),
              );
            }
          }
        }),
      );
      // A recessed dark grey panel on the other, a red light beside it.
      const sd = out(darkAt);
      inside(o, () => {
        const z = darkAt + sd * 0.03;
        face(
          o,
          [L(t - 0.76, 0.04, z), L(t + 0.56, 0.04, z), L(t + 0.56, 2.16, z), L(t - 0.76, 2.16, z)],
          FRAME,
          L(t, 1, darkAt - sd),
        );
        const z1 = darkAt + sd * 0.034;
        face(
          o,
          [L(t - 0.7, 0.1, z1), L(t + 0.5, 0.1, z1), L(t + 0.5, 2.1, z1), L(t - 0.7, 2.1, z1)],
          [0.13, 0.14, 0.17],
          L(t, 1, darkAt - sd),
        );
        for (const y of [0.8, 1.5]) {
          const z2 = darkAt + sd * 0.038;
          face(
            o,
            [
              L(t - 0.62, y, z2),
              L(t + 0.42, y, z2),
              L(t + 0.42, y + 0.025, z2),
              L(t - 0.62, y + 0.025, z2),
            ],
            INK,
            L(t, 1, darkAt - sd),
          );
        }
      });
      // ring() faces along across x up: across turned so that it faces into the tube.
      const across: Vec3 = [0, 0, 0];
      across[k] = (k ? -1 : 1) * sd;
      const c = L(t + 0.8, 1.3, darkAt + sd * 0.036);
      ring(
        o,
        c,
        across,
        [0, 1, 0],
        [0.035, 0.1],
        RED.map(v => v * 0.5),
        DUSK,
        12,
      );
      ring(
        o,
        L(t + 0.8, 1.3, darkAt + sd * 0.04),
        across,
        [0, 1, 0],
        [0, 0.035],
        [2, 0.9, 0.8],
        RED.map(v => v * 1.6),
        12,
      );
      // Three lamp slats across the ceiling.
      inside(o, () =>
        lit(o, 1.2, () => {
          for (const d of [-0.3, 0, 0.3]) {
            face(
              o,
              [
                L(t + d - 0.08, H - 0.015, mid - 0.45),
                L(t + d + 0.08, H - 0.015, mid - 0.45),
                L(t + d + 0.08, H - 0.015, mid + 0.45),
                L(t + d - 0.08, H - 0.015, mid + 0.45),
              ],
              [1.1, 1.15, 1.25],
              L(t, H + 1, mid),
            );
          }
        }),
      );
      // A grating in the floor: a dark plate crossed by bars.
      inside(o, () => {
        const y = 0.03;
        face(
          o,
          [
            L(t - 0.8, y, mid - 0.6),
            L(t + 0.8, y, mid - 0.6),
            L(t + 0.8, y, mid + 0.6),
            L(t - 0.8, y, mid + 0.6),
          ],
          [0.09, 0.095, 0.11],
          L(t, -1, mid),
        );
        for (let d = -0.72; d <= 0.73; d += 0.12) {
          face(
            o,
            [
              L(t + d - 0.02, y + 0.004, mid - 0.56),
              L(t + d + 0.02, y + 0.004, mid - 0.56),
              L(t + d + 0.02, y + 0.004, mid + 0.56),
              L(t + d - 0.02, y + 0.004, mid + 0.56),
            ],
            [0.34, 0.35, 0.38],
            L(t, -1, mid),
          );
        }
      });
    }
  });
