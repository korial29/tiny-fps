import { ENGINES, HULL as SHAPE } from '../../shared/beach';
import { TEAM_TINT } from '../../shared/map';
import { hash, noise } from '../../shared/relief';
import { TEX } from '../../shared/types';
import { dress, smooth } from '../mesh';
import { DULL, HEM, HULL, TARP } from '../paint';
import type { V } from './types';
import {
  tex,
  ink,
  MID,
  WHITE,
  SKIN,
  GIRDER,
  PLATE,
  SOOT,
  IRON,
  STRIPE,
  GLASS,
  DOWN,
  sm,
  sub,
  unit,
  mid,
  off,
  QUAD,
  face,
  loft,
  box,
  bar,
  teeth,
  prism,
  stand,
} from './common';
import { coat, BELL } from './hull';

// ---------------------------------------------------------------------------------------------
// The debris and the camps.

/** The containers' brushed steel and their ribs, brushed upright, bright: the shader's steel shines (SPEC). */
// Dull steel: the shader's DULL variant of STEEL, barely shiny.
const [CASE, RIB] = [0.85, 0.7].map(k => tex(TEX.STEEL + DULL, k, 1, true));
/** The crates' corner battens, paler than their planks, the grain up them. */
const BATTEN = tex(TEX.WOOD, 1.35, 1, true);
/** The tents' poles: weathered wood, the grain up them, a plank's width across. */
const POLE = tex(TEX.WOOD, 1.1, 0.5, true);

/** A wheel lying along -z from its hub's back: 0.6 m in radius, 1 m wide. */
export const WHEEL = dress(
  smooth(
    [
      [0, 0.1],
      [0.3, 0.1],
      [0.36, 0],
      [0.52, 0],
      [0.6, 0.15],
      [0.6, 0.85],
      [0.52, 1],
      [0.36, 1],
      [0.3, 0.9],
      [0, 0.9],
    ],
    12,
  ),
  [0.05, 0.05, 0.055],
);

/** The fallen engine's nacelle, its tail at the origin: 19 m to the intake's lip, dark inside it and scorched toward the bell. */
export const POD = coat(
  smooth(
    [
      [0, 0],
      [1.5, 0],
      [2.1, 2.5],
      [2.2, 4],
      [2.7, 6.5],
      [2.75, 12.5],
      [2.45, 17.5],
      [2.1, 19],
      [1.75, 19.1],
      [1.5, 17.6],
      [0, 17.4],
    ],
    16,
  ),
  SKIN,
  p =>
    Math.hypot(p[0], p[1]) < 1.7 && p[2] < -16
      ? 0.05
      : (0.12 + 0.88 * sm((-p[2] - 5 - 3 * noise(p[0], p[1] * 2 - p[2] / 2, 61)) / 5)) *
        (0.55 + 0.45 * sm((p[1] + 2.2) / 1.6)),
);

/** A line of points [across, up] carried to (x + across, y + up, z), then its mirror across x. */
export const arch = (pts: number[][], x: number, y: number, z: number) =>
  [...pts, ...pts.map(([h, v]) => [-h, v]).reverse()].map(([h, v]) => [x + h, y + v, z]);

/** Each kind of piece, drawn on its box: `t` its tint in the map, `s` 1 in red's half and -1 in blue's. */
export const KIND: Record<
  string,
  (p: { min: V; max: V }, t: V | undefined, s: number, d?: number) => void
> = {
  // Skin lying flat or afloat, its edge torn; or a slab of it standing in the sand, its stringers on one face.
  panel: ({ min: a, max: b }, _t, s) => {
    const k = 0.55 + 0.45 * hash(a[0], a[2], 51);
    const paint = ink(WHITE.c, k, HULL);
    const thin = b[0] - a[0] < 1 ? 0 : b[2] - a[2] < 1 ? 2 : -1;
    if (thin >= 0) {
      box(a, b, paint, IRON);
      const [p, q] = [a.slice(), b.slice()];
      p[1] = q[1] = b[1];
      p[thin] = q[thin] = (a[thin] + b[thin]) / 2;
      teeth(p, q, [0, 0.4, 0], 9, SKIN, 0.3);
      for (const y of [0.5, 1.1, 1.7]) {
        const [e, f] = [a.slice(), b.slice()];
        e[1] = f[1] = b[1] - y;
        e[thin] = f[thin] = (s > 0 ? a : b)[thin] - s * 0.04;
        bar(e, f, 0.08, IRON);
      }
      return;
    }
    box(a, b, GIRDER, paint);
    const rim = [0, 1, 3, 2, 0].map(i => [i & 1 ? b[0] : a[0], b[1], i & 2 ? b[2] : a[2]]);
    rim.slice(1).forEach((q, i) => {
      const out = sub(mid(rim[i], q), [(a[0] + b[0]) / 2, b[1], (a[2] + b[2]) / 2]);
      teeth(rim[i], q, [Math.sign(out[0]) * 0.35, -0.12, Math.sign(out[2]) * 0.35], 4, SKIN, 0.35);
    });
    if (k > 0.75) {
      face(
        QUAD.map(i => [a[0] + (i & 1 ? 1.1 : 0.7), b[1] + 0.02, i & 2 ? b[2] : a[2]]),
        ink(STRIPE),
        DOWN,
        k,
      );
    }
  },
  // A cargo container: corrugated sides, door bars on one end.
  // A shipping case of brushed steel, shiny (the user, 2026-11-26): ribbed sides, two iron lock bars.
  container: ({ min: a, max: b }) => {
    box(a, b, CASE);
    const long = b[0] - a[0] > b[2] - a[2] ? 0 : 2;
    for (let u = a[long] + 0.3; u < b[long] - 0.2; u += 0.6) {
      const [p, q] = [a.map(v => v - 0.05), b.map(v => v + 0.05)];
      [p[long], q[long], p[1], q[1]] = [u, u + 0.3, a[1], b[1] - 0.15];
      box(p, q, RIB);
    }
    for (const u of [0.35, 0.65]) {
      const e = off(a, sub(b, a), u);
      [e[long], e[1]] = [a[long] - 0.04, a[1]];
      bar(e, [e[0], b[1] - 0.1, e[2]], 0.08, IRON);
    }
  },
  // A supply case: planks, two straps, the lid in the team's colour on those that carry its long guns.
  crate: ({ min: a, max: b }, t) => {
    if (b[1] - a[1] > 1.2) {
      // A locker fallen from a bulkhead, its doors' seams.
      box(a, b, tex(TEX.STEEL, 0.75));
      for (const u of [0.33, 0.66]) {
        const x = a[0] + (b[0] - a[0]) * u;
        box([x - 0.02, a[1] + 0.1, a[2] - 0.01], [x + 0.02, b[1] - 0.1, b[2] + 0.01], SOOT);
      }
      return;
    }
    box(a, b, tex(TEX.WOOD), t && ink(t, 0.75));
    // A batten of paler wood down each corner, the grain up it: its two outer faces and its top
    // only (box()'s skip: the faces x-, x+, y-, y+, z-, z+ are bits 0 to 5).
    for (const i of QUAD) {
      const [x, z] = [i & 1 ? b[0] - 0.09 : a[0] - 0.01, i & 2 ? b[2] - 0.09 : a[2] - 0.01];
      box(
        [x, a[1], z],
        [x + 0.1, b[1] + 0.01, z + 0.1],
        BATTEN,
        BATTEN,
        55 ^ (1 << (i & 1)) ^ (i & 2 ? 32 : 16),
      );
    }
    for (const u of [0.25, 0.75]) {
      const z = a[2] + (b[2] - a[2]) * u;
      box([a[0] - 0.02, a[1], z - 0.1], [b[0] + 0.02, b[1] + 0.02, z + 0.1], IRON);
    }
  },
  // The flag's step: a hatch cover in the team's colour.
  dais: ({ min: a, max: b }, t = STRIPE) => {
    box(a, b, GIRDER, ink(t, 0.6));
    face(
      QUAD.map(i => [
        i & 1 ? b[0] - 0.5 : a[0] + 0.5,
        b[1] + 0.02,
        i & 2 ? b[2] - 0.5 : a[2] + 0.5,
      ]),
      ink(t, 0.95),
      DOWN,
    );
  },
  // A tarpaulin sagging between its four poles, lit on both faces, torn (the user, 2026-11-26):
  // two holes through it, their edges ragged, and strips hanging from its long edges. The poles
  // are rough wood, the grain up them.
  shelter: ({ min: a, max: b }, t) => {
    if (!t) {
      box(a, b, POLE);
      return;
    }
    const [I, J] = [6, 4];
    const at = (i: number, j: number, d: number) => [
      a[0] + ((b[0] - a[0]) * i) / I,
      b[1] - d - 0.3 * Math.sin((Math.PI * i) / I) * Math.sin((Math.PI * j) / J),
      a[2] + ((b[2] - a[2]) * j) / J,
    ];
    // Whole: the shader tears its holes and frays its hems (paint.ts TARP_GLSL). Each face twice,
    // one lit from each side; a hem, HEM deep, hangs down each long edge.
    for (let i = 0; i < I; i++) {
      for (let j = 0; j <= J; j++) {
        for (const d of [0, 0.03]) {
          const [p, q] = [at(i, j, d), at(i + 1, j, d)];
          const m = ink(t, i & 1 ? 0.7 : 0.8, TARP);
          if (j < J) {
            face([p, q, at(i + 1, j + 1, d), at(i, j + 1, d)], m, [a[0], d ? 99 : -99, a[2]]);
          }
          if (j % J < 1) {
            face([p, q, off(q, DOWN, HEM / 99), off(p, DOWN, HEM / 99)], m, [
              a[0],
              a[1],
              d ? 99 : -99,
            ]);
          }
        }
      }
    }
  },
  // The landing gear: its strut's housing, cut at the corners, and the bogie's three wheels on their beam.
  gear: ({ min: a, max: b }, t) => {
    if (t) {
      prism(a, b, 0.4, ink(t, 0.7), ink(t, 0.55));
      prism([a[0], b[1] - 0.9, a[2]], [b[0], b[1] - 0.6, b[2]], 0.4, IRON, undefined, 0.04);
      return;
    }
    const z = (a[2] + b[2]) / 2;
    for (let i = 0; i < 3; i++) {
      stand(WHEEL, [a[0] + 0.7 + i * 1.5, b[1] - 0.6, b[2]], [0, 0, -1], [1, 1, b[2] - a[2]]);
    }
    box([a[0] + 0.3, b[1] - 0.8, z - 0.2], [b[0] - 0.3, b[1] - 0.4, z + 0.2], GIRDER);
  },
  // The engine torn off its pylon, lying askew on the sand: a faired nacelle, its intake's lip, its bell, the pylon's stub on its back, scorched. Drawn whole from its first strip.
  fallen: ({ max: b }, t, s) => {
    if (!t) {
      return;
    }
    const [x, z, , l, skew] = ENGINES[0];
    const f = unit([1, 0, s * skew]);
    const at = [x, b[1] - 2.2, MID + s * (z - MID)];
    stand(POD, off(at, f, -l / 2), f, [0.84, 0.8, 1]);
    stand(
      BELL,
      off(at, f, -l / 2 + 0.3),
      f.map(v => -v),
      [1.15, 1.15, 1.15],
    );
    const stub = [-1, 3.5].map(u => off(off(at, f, u), [0, 2.1, 0]));
    const lean = [-f[2] * 0.5, 1.1, f[0] * 0.5];
    loft(
      stub,
      stub.map(p => off(p, lean)),
      () => IRON,
      at,
    );
    teeth(off(stub[0], lean), off(stub[1], lean), lean, 6, SKIN, 0.16, at);
  },
  // A rail through a break of a wing: a beam deeper than the wing it carries, its flanges proud.
  rail: ({ min: a, max: b }) => {
    box([a[0] + 0.14, a[1], a[2]], [b[0] - 0.14, b[1], b[2]], GIRDER);
    for (const y of [a[1], b[1] - 0.07]) {
      box([a[0], y, a[2]], [b[0], y + 0.07, b[2]], GIRDER, GIRDER, 0);
    }
  },
  // The engine in the lagoon, awash: its housing, and at each end its fan.
  engine: ({ min: a, max: b }, t = STRIPE) => {
    const x = (a[0] + b[0]) / 2;
    const shell = (z: number) =>
      arch(
        [
          [2.5, -5],
          [2.5, -0.4],
          [2.1, 0],
        ],
        x,
        b[1],
        z,
      );
    const c = [x, b[1] - 2.5, (a[2] + b[2]) / 2];
    const k = shell(0).map((_, j) => 0.45 + 0.4 * hash(j, 3, 62));
    loft(shell(a[2]), shell(b[2]), j => (j == 2 ? ink(t, 0.6) : SKIN), c, k);
    for (const [z, d] of [
      [a[2], -1],
      [b[2], 1],
    ]) {
      face(shell(z), SOOT, c);
      const at = (r: number, w: number, out: number) => [
        x + r * Math.cos(w),
        c[1] + r * Math.sin(w),
        z + d * out,
      ];
      const step = Math.PI / 7;
      for (let i = 0; i < 14; i++) {
        const w = i * step;
        face(
          [
            at(0.5, w, 0.2),
            at(2.25, w - 0.1, 0.22),
            at(2.25, w + 0.22, 0.05),
            at(0.5, w + 0.3, 0.08),
          ],
          ink([0.42, 0.43, 0.46]),
          c,
        );
        face([at(0, 0, 0.3), at(0.55, w, 0.1), at(0.55, w + step, 0.1)], IRON, c);
        face(
          [at(2.3, w, 0.04), at(2.3, w + step, 0.04), at(2.48, w + step, 0.04), at(2.48, w, 0.04)],
          PLATE,
          c,
        );
      }
    }
  },
  // The escape pod: its corners cut, its foot scorched, a band in the team's colour, the hatch open toward the flag, its parachute on the sand behind.
  pod: ({ min: a, max: b }, _t, s) => {
    const team = TEAM_TINT[s > 0 ? 0 : 1];
    const g = a[1] + 0.5;
    const c = mid(a, b);
    const [x, z] = [c[0], (s > 0 ? a[2] : b[2]) - s * 0.04];
    prism(a, b, 0.42, SKIN, ink(WHITE.c, 0.8, HULL), 0, [0.5, 1]);
    prism(a, [b[0], g + 0.8, b[2]], 0.42, SOOT, undefined, 0.04);
    prism([a[0], g + 2, a[2]], [b[0], g + 2.4, b[2]], 0.42, ink(team, 0.8), undefined, 0.03);
    face(
      QUAD.map(i => [x + (i & 1 ? 0.65 : -0.65), g + (i & 2 ? 1.95 : 0), z]),
      SOOT,
      c,
    );
    for (const u of [-0.7, 0.7]) {
      bar([x + u, g, z], [x + u, g + 2, z], 0.1, IRON);
      face(
        QUAD.map(i => [
          x + 3.03 * Math.sign(u),
          g + (i & 2 ? 1.7 : 1.2),
          c[2] + (i & 1 ? 0.3 : -0.3),
        ]),
        GLASS,
        c,
      );
    }
    bar([x - 0.7, g + 2, z], [x + 0.7, g + 2, z], 0.1, IRON);
    box([x + 1, g - 0.1, z - s * 2.6 - 0.95], [x + 2.3, g + 0.1, z - s * 2.6 + 0.95], SKIN);
    const hub = [x, g + 0.28, c[2] + s * 7];
    const rim = (i: number) => {
      const r = 3 + 1.3 * hash(i % 14, s, 71);
      return [
        x + r * Math.cos((i * Math.PI) / 7),
        g + 0.03 + 0.2 * hash(i % 14, s, 72),
        hub[2] + r * Math.sin((i * Math.PI) / 7),
      ];
    };
    for (let i = 0; i < 14; i++) {
      face([hub, rim(i), rim(i + 1)], ink(i & 1 ? STRIPE : [0.8, 0.8, 0.76], 0.9), DOWN);
    }
  },
  // A heap of wreckage across a gap, broken end to broken end: plates of skin leaning on a dark
  // core on both faces, their tops torn, a deck plate on top; a broken end's lowest floor crushed
  // shut (`jam`, d = 0): the same plates across it, on the face toward the gap.
  heap: ({ min: a, max: b }, t = STRIPE, _s = 1, d = 0) => {
    const [o, u] = d ? [0, 2] : [2, 0];
    box(a, b, IRON, d ? IRON : ink(t, 0.55));
    const n = Math.round((b[u] - a[u]) / 1.6);
    for (const e of d ? [d] : [-1, 1]) {
      const w = (e < 0 ? a : b)[o];
      for (let i = 0; i < n; i++) {
        const h = (k: number) => hash(i, w * 7 + k, 41);
        const q = (j: number, y: number, out: number): V => {
          const p = [0, y, 0];
          p[u] = a[u] + ((b[u] - a[u]) * (i + j)) / n;
          p[o] = w + e * out;
          return p;
        };
        const top = b[1] - 0.15 - 0.5 * h(3);
        const out = 0.12 + 0.12 * h(4);
        const l = [
          q(0.05, a[1], out),
          q(0.95, a[1], out),
          q(0.95, top, 0.02),
          q(0.05, top - 0.2 * h(6), 0.02),
        ];
        const c = q(0.5, top / 2, -9);
        face(l, h(5) > 0.45 ? SKIN : PLATE, c, [0.75, 0.75, 1, 1]);
        teeth(l[3], l[2], [0, 0.35, 0], 3, PLATE, 0.9, c);
      }
    }
  },
  // A frame fallen at a broken end, two girders of it on the sand and a rib still standing against the hull.
  frame: ({ min: a, max: b }, _t, s) => {
    box([a[0] + 0.2, a[1], a[2]], [b[0] - 0.2, b[1], b[2]], IRON);
    box([a[0], b[1] - 0.16, a[2]], b, GIRDER, GIRDER, 0);
    box([a[0], b[1] - 0.8, a[2]], [b[0], b[1] - 0.64, b[2]], GIRDER, GIRDER, 0);
    const z = (a[2] + b[2]) / 2;
    bar([a[0] + 0.14, b[1], z - s * 0.7], [a[0] + 0.14, b[1] + 3.4, z + s * 0.6], 0.26, GIRDER);
  },
};
KIND.float = KIND.raft = KIND.panel;
// A jam faces the gap: +x at a section's east end.
KIND.jam = (p, t, s) => KIND.heap(p, t, s, SHAPE.sections.some(e => e[1] == p.max[0]) ? 1 : -1);

/** The kinds of the camps: the rest is debris. */
export const CAMP = ['pod', 'dais', 'crate', 'shelter'];
/** The kinds no sand lies against: afloat, or cloth, or the flag's step, or drawn off their boxes. */
export const BARE = ['shelter', 'float', 'raft', 'engine', 'dais', 'fallen', 'rail'];
