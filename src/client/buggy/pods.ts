// Landfall's buggy, its side pods (the user, 2026-11-27: more than a plain box), in the body's
// frame (rover/mesh.ts P()): the team's colour in `t`, the rest in `o`.
import type { Vec3 } from '../mesh';
import { LINK, P, TUBE, panel, rod } from '../rover';
import { DARK, EDGE, FOOT, POD_Y, ROUNDEL, SIDE, STEEL, WHITE } from './constants';

/** Appends both pods at a level of detail (0 far, 1 mid, 2 near). */
export const pods = (o: number[], t: number[], level: number): void => {
  const near = level > 1;
  // The pods (the user, 2026-11-27: more than a plain box): their top dips between the hoops
  // where the crew climbs in, their sides lean in toward the floor, a dark coaming along the top,
  // a dark rocker strip low down, a step tube between the wheels and a white roundel on the door.
  const edge: [number, number][] = level ? EDGE : [EDGE[0], EDGE[EDGE.length - 1]];
  for (const s of [-1, 1]) {
    for (let j = 0; j + 1 < edge.length; j++) {
      const [[a0, y0], [a1, y1]] = [edge[j], edge[j + 1]];
      const side = [
        P(s * FOOT, -0.47, a0),
        P(s * FOOT, -0.47, a1),
        P(s * SIDE, y1, a1),
        P(s * SIDE, y0, a0),
      ];
      panel(t, side, WHITE, [s, 0.2, 0]);
      panel(
        t,
        [side[3], side[2], P(s * (SIDE - 0.1), y1, a1), P(s * (SIDE - 0.1), y0, a0)],
        WHITE,
        [0, 1, 0],
      );
      if (near) {
        const inner = [
          P(s * (SIDE - 0.1), -0.44, a0),
          P(s * (SIDE - 0.1), -0.44, a1),
          P(s * (SIDE - 0.1), y1, a1),
          P(s * (SIDE - 0.1), y0, a0),
        ];
        panel(o, inner, DARK, [-s, 0, 0]);
      }
      if (level) {
        rod(
          o,
          LINK,
          P(s * (SIDE - 0.04), y0 + 0.025, a0),
          P(s * (SIDE - 0.04), y1 + 0.025, a1),
          0.035,
          DARK,
        );
      }
    }
    panel(
      t,
      [
        P(s * FOOT, -0.47, -0.62),
        P(s * SIDE, POD_Y, -0.62),
        P(s * (SIDE - 0.1), POD_Y, -0.62),
        P(s * (FOOT - 0.1), -0.47, -0.62),
      ],
      WHITE,
      [0, 0, 1],
    );
    if (!level) {
      continue;
    }
    // The rocker strip, just proud of the leaning side.
    const lean = (y: number, top: number) =>
      FOOT + ((SIDE - FOOT) * (y + 0.47)) / (top + 0.47) + 0.008;
    panel(
      o,
      [
        P(s * lean(-0.47, POD_Y), -0.47, -0.62),
        P(s * lean(-0.47, POD_Y), -0.47, 0.8),
        P(s * lean(-0.35, POD_Y), -0.35, 0.8),
        P(s * lean(-0.35, POD_Y), -0.35, -0.62),
      ],
      DARK,
      [s, 0, 0],
    );
    // The step tube between the wheels, on two brackets.
    const step = s * (SIDE + 0.08);
    rod(o, near ? TUBE : LINK, P(step, -0.38, -0.5), P(step, -0.38, 0.62), 0.04, STEEL);
    if (!near) {
      continue;
    }
    for (const a of [-0.4, 0.5]) {
      rod(o, LINK, P(s * FOOT, -0.42, a), P(step, -0.38, a), 0.03, STEEL);
    }
    // The roundel on the door: an octagon on the leaning side, under the dip.
    const [ra, ry, rr] = [0.07, -0.26, 0.13];
    const rim = Array.from({ length: 8 }, (_, k): Vec3 => {
      const q = ((k + 0.5) * Math.PI) / 4;
      const y = ry + rr * Math.sin(q);
      return P(s * lean(y, EDGE[2][1]), y, ra + rr * Math.cos(q));
    });
    const mid = P(s * lean(ry, EDGE[2][1]), ry, ra);
    rim.forEach((p, k) => panel(o, [mid, p, rim[(k + 1) % 8]], ROUNDEL, [s, 0, 0]));
  }
};
