// The moon base's shell (docs/MOON.md), red's half: the dome and its windows, the tubes, the modules.
import { HEAD, MODULES, MOUTHS, ROOM, TUBES, WALL } from '../../shared/moonbase';
import { TAU } from '../../shared/physics';
import { STRIDE, dress, place, segment, smooth } from '../mesh';
import { UP, box, face, lit } from '../brick';
import { glaze } from '../glass/glaze';
import type { Vec3 } from '../mesh';
import type { Out } from '../verts';
import { CX, CZ, DARK, FRAME, LAMP, LINTELS, PAINT, R, WHITE } from './constants';
import { lining, panel, quad } from './kit';

/** The openings of the drawn drum, as angles about the centre and a height: the door, and the tubes' boxes where they come through. */
export const GAPS = [
  [-TAU / 4 - Math.asin(MOUTHS[0][2] / R), -TAU / 4 + Math.asin(MOUTHS[0][2] / R), MOUTHS[0][3]],
  [-Math.acos((TUBES[1].min[0] - CX) / R), Math.asin((TUBES[0].max[2] - CZ) / R), MOUTHS[1][3]],
];

/** The dome: a drum with a band of windows under a hemisphere (radius 22, top at 17), open at the door and at the tubes; a lit portal at the door. */
export const dome = (o: Out) => {
  const N = 48;
  const arc = Array.from({ length: 9 }, (_, j): [number, number] => {
    const a = ((j + 1) / 10) * (TAU / 4);
    return [R * Math.cos(a), 5 + 12 * Math.sin(a)];
  });
  const v: number[] = [];
  place(
    v,
    dress(smooth([[R, 0], [R, 5], ...arc, [0, 17]], N), PAINT),
    [CX, 0, CZ],
    UP,
    [0, 0, 0],
    1,
  );
  // The drum's quads that a gap crosses go; narrower ones stand beside it and over it.
  const grid = (t: number, up: number) => ((up ? Math.ceil : Math.floor)((t * N) / TAU) * TAU) / N;
  for (let i = 0; i < v.length; i += 3 * STRIDE) {
    const [a, b, c] = [i, i + STRIDE, i + 2 * STRIDE];
    const t = Math.atan2(v[a + 2] + v[b + 2] + v[c + 2] - 3 * CZ, v[a] + v[b] + v[c] - 3 * CX);
    if (
      Math.max(v[a + 1], v[b + 1], v[c + 1]) > 5.01 ||
      !GAPS.some(([g0, g1]) => t > grid(g0, 0) && t < grid(g1, 1))
    ) {
      for (let j = i; j < i + 3 * STRIDE; j++) {
        o.push(v[j]);
      }
    }
  }
  const at = (t: number, y: number) => [
    CX + R * Math.cos(t),
    y,
    CZ + R * Math.sin(t),
    Math.cos(t),
    0,
    Math.sin(t),
    PAINT[0],
    PAINT[1],
    -1,
    PAINT[2],
  ];
  for (const [g0, g1, h] of GAPS) {
    const cuts = [grid(g0, 0), g0];
    for (let n = Math.ceil((g0 * N) / TAU); (n * TAU) / N < g1; n++) {
      cuts.push((n * TAU) / N);
    }
    cuts.push(g1, grid(g1, 1));
    cuts.slice(1).forEach((t1, i) => {
      const t0 = cuts[i];
      const y = i && i < cuts.length - 2 ? h : 0;
      o.push(...at(t0, y), ...at(t1, y), ...at(t1, 5), ...at(t0, y), ...at(t1, 5), ...at(t0, 5));
    });
  }
  // 70 panes of 1.2 x 1 m, each in a dark frame, but in the gaps.
  const p = (t: number, y: number, e: number): Vec3 => [
    CX + (R + e) * Math.cos(t),
    y,
    CZ + (R + e) * Math.sin(t),
  ];
  for (let i = 0; i < 70; i++) {
    const t = (i * TAU) / 70;
    const s = t > TAU / 2 ? t - TAU : t;
    if (GAPS.some(([g0, g1]) => s > g0 - 0.04 && s < g1 + 0.04)) {
      continue;
    }
    const pane = (w: number, y0: number, y1: number, e: number) =>
      [
        [-w, y0],
        [w, y0],
        [w, y1],
        [-w, y1],
      ].map(([a, y]) => p(t + a / R, y, e));
    face(o, pane(0.72, 1.5, 2.9, 0.04), [0.06, 0.06, 0.08], [CX, 2.2, CZ]);
    const from = o.length;
    lit(o, 0.56, () => face(o, pane(0.6, 1.7, 2.7, 0.07), [1, 0.85, 0.5], [CX, 2.2, CZ]));
    glaze(o, from, p(t, 2.2, 0.07), [Math.cos(t), 0, Math.sin(t)], 0.6, 0.25);
  }
  // The portal: two posts and a beam proud of the drum round the door, a lit strip on each.
  const [, mz, w, h, d] = MOUTHS[0];
  const z = CZ + mz - d;
  for (const [x0, x1, y0] of [
    [-w - 0.3, -w - 0.02, 0],
    [w + 0.02, w + 0.3, 0],
    [-w - 0.3, w + 0.3, h],
  ]) {
    box(o, [CX + x0, y0, z - 0.1], [CX + x1, h + 0.3, z + 0.5], DARK);
    panel(o, 2, z - 0.12, [CX + x0 + 0.09, y0 + 0.09, 0], [CX + x1 - 0.09, h + 0.21, 0], LAMP);
  }
};

/** The upper two thirds of a tube's round: the rest would show inside its corridor. */
const upper = (v: number[]) =>
  v.filter((_, i) => {
    const t = i - (i % (3 * STRIDE));
    return Math.max(v[t], v[t + STRIDE], v[t + 2 * STRIDE]) > -0.49;
  });
const TUBE = upper(
  dress(
    smooth(
      [
        [1, 0],
        [1, 1],
      ],
      12,
    ),
    PAINT,
  ),
);
const RIB = upper(
  dress(
    smooth(
      [
        [1.06, 0],
        [1.06, 0.3],
      ],
      12,
    ),
    DARK,
  ),
);

/** A rounded tube over each tube of the map, from its module to where the two meet, with a rib every 5 m; inside, white walls and a ceiling with a strip of light. */
export const tubes = (o: Out) =>
  TUBES.forEach(({ min, max }, n) => {
    const k = n ? 2 : 0;
    const [a0, b0, mid] = [min[k], n ? TUBES[0].min[2] : max[k], (min[2 - k] + max[2 - k]) / 2];
    const at = (t: number): Vec3 => (k ? [mid, 1.75, t] : [t, 1.75, mid]);
    const w = (max[2 - k] - min[2 - k]) / 2 + 0.1;
    segment(o, TUBE, at(a0), at(b0), [0, 1, 0], 1, [1.75, w]);
    for (let d = 5; d < b0 - a0 - 1; d += 5) {
      segment(o, RIB, at(a0 + d), at(a0 + d + 0.3), [0, 1, 0], 0.3, [1.75, w]);
    }
    // The wall of the first runs on across the end of the second.
    lining(o, 2 - k, min[2 - k] + WALL + 0.02, a0, b0, HEAD, 1.4);
    lining(o, 2 - k, max[2 - k] - WALL - 0.02, n ? a0 : TUBES[1].min[0], b0, HEAD, 1.4);
    panel(o, 1, HEAD - 0.01, min, max, WHITE, 0.9);
    const [lo, hi] = [[...min], [...max]];
    [lo[2 - k], hi[2 - k]] = [mid - 0.15, mid + 0.15];
    panel(o, 1, HEAD - 0.02, lo, hi, LAMP);
  });

/** The strips of windows on the long faces of the two modules, outside and inside, but over a doorway; three lamps under each roof. */
export const modules = (o: Out) => {
  for (const { min, max } of MODULES) {
    const mid: Vec3 = [(min[0] + max[0]) / 2, 2.5, (min[2] + max[2]) / 2];
    for (const s of [-1, 1]) {
      const z = s > 0 ? max[2] : min[2];
      for (let k = 0; k < 7; k++) {
        const x = min[0] + 1 + 2 * k;
        if (
          LINTELS.some(
            l => Math.abs(l.min[2] - z) < 1 && x + 0.72 > l.min[0] && x - 0.72 < l.max[0],
          )
        ) {
          continue;
        }
        const pane = (w: number, y0: number, y1: number, e: number): Vec3[] =>
          [
            [-w, y0],
            [w, y0],
            [w, y1],
            [-w, y1],
          ].map(([a, y]) => [x + a, y, z + s * e]);
        face(o, pane(0.72, 2.6, 3.8, 0.02), [0.06, 0.06, 0.08], mid);
        const from = o.length;
        lit(o, 0.5, () => face(o, pane(0.6, 2.7, 3.7, 0.04), [0.9, 0.95, 1], mid));
        glaze(o, from, [x, 3.2, z + s * 0.04], [0, 0, s], 0.6, 0.25);
        quad(o, pane(0.56, 2.6, 3.8, -WALL - 0.04), FRAME);
        quad(o, pane(0.46, 2.7, 3.7, -WALL - 0.06), [0.45, 0.48, 0.5]);
      }
    }
    // Inside: white walls open at the doorways, a ceiling and three lamps under it.
    for (const k of [0, 2]) {
      for (const [at, e] of [
        [min[k], WALL + 0.02],
        [max[k] - WALL, -0.02],
      ]) {
        lining(
          o,
          k,
          at + e,
          min[2 - k] + WALL,
          max[2 - k] - WALL,
          ROOM,
          1.5,
          LINTELS.filter(l => Math.abs(l.min[k] - at) < 0.01).map(l => [
            l.min[2 - k],
            l.max[2 - k],
            HEAD,
          ]),
        );
      }
    }
    panel(o, 1, ROOM - 0.01, min, max, WHITE, 0.9);
    for (let k = 0; k < 3; k++) {
      const x = min[0] + ((max[0] - min[0]) * (k + 0.5)) / 3;
      panel(o, 1, ROOM - 0.02, [x - 1.2, 0, mid[2] - 0.3], [x + 1.2, 0, mid[2] + 0.3], LAMP);
    }
  }
};
