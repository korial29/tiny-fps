// The moon's spaceship, drawn (the simulation is shared/ship.ts): a single-seat strike fighter of
// the game's own design. A long, slender nose that tapers straight to a sensor tip, close to half
// the ship; the cockpit set well back behind it under a low canopy of flat panes in a frame, which
// runs into a spine; an engine against each flank of the hull's back, a wide cowl and a thinner
// exhaust; two wings out from under them, swept back and drooping; a laser cannon under each wing,
// missiles further out, two canted fins on the hull's back and the stripes in the team's colour; three legs
// it stands on, folded away in flight. Near by the hull shows what it is made of: grooves at the
// nose's joints and along its sides, a trench of pipes under the cockpit, an open bay of pipes
// and units in the back, ribs and pipes on the exhausts. A pure function of the ship's state: no
// state, no DOM. The rigid parts are built once a level of detail in the ship's frame (x right, y
// up, -z the nose, the origin at the centre) and placed each frame; the legs, the flames, the
// missiles left and the lights are added after them.
import { NOBODY } from '../shared/types';
import type { Rover } from '../shared/types';
import { COCKPIT, PODS, SHIP, SHIP_GUNS } from '../shared/ship';
import { glow } from './flag';
import { SHINE, STRIDE, add, basis, dress, mix, place, smooth, sub } from './mesh';
import type { Vec3 } from './mesh';
import { LINK, P, TUBE, grips, panel, rod } from './rover';

const WHITE = [0.8, 0.81, 0.84];
const PALE = [0.66, 0.67, 0.71];
const GREY = [0.46, 0.48, 0.52];
const LINE = [0.3, 0.31, 0.34];
const DARK = [0.08, 0.085, 0.1];
const FRAME = [0.17, 0.18, 0.2];
const GUNMETAL = [0.2, 0.21, 0.24, SHINE];
const COPPER = [0.55, 0.33, 0.18, SHINE];
/** The circuits' tracks: grey, discreet on the white hull and the pale wings. */
const TRACK = [0.52, 0.53, 0.57];
const FLAME = [1, 0.55, 0.2];
const CORE = [0.55, 0.8, 1];
const TEAM = [1, 1, 1];
/** The canopy's panes near by: see-through (the smoke's layer: a grey, its opacity, the layer, its blue), the pilot behind them. */
const PANE = [0.05, 0.95, 0.13];
/** Far away: dark polished glass, nothing behind it. */
const GLASS = [0.05, 0.09, 0.14, SHINE];

/**
 * The ship's lines, metres ahead of the centre: the nose's tip and where its sensor starts, the
 * foot of the windscreen (the nose ends there), the canopy's two arches, where the spine ends, and
 * the tail.
 */
export const HULL = {
  TIP: 7.7,
  SENSOR: 7.15,
  SCREEN: 1.5,
  ARCH: [0.35, -1.3],
  SPINE: -3.3,
  TAIL: -6.5,
};
/** The canopy's roof at its two arches: half its width and its height. */
const ROOF = [
  [0.3, 1.2],
  [0.34, 1.25],
];
/** The hull across, from the tail to the tip: metres ahead, half the width, the top and the keel. */
const STATIONS = [
  [HULL.TAIL, 0.5, 0.36, -0.34],
  [-5.2, 1, 0.62, -0.74],
  [HULL.ARCH[1], 1.1, 0.62, -0.9],
  [HULL.SCREEN, 0.95, 0.6, -0.86],
  [HULL.SENSOR, 0.3, 0.12, -0.42],
  [HULL.TIP, 0.2, 0.04, -0.35],
];
/** The top's flat is this share of the width: the cockpit opens in it. */
const FLAT = 0.6;

/** An engine against each flank of the hull: right of the centre, above it, and its intake's lip and its nozzle ahead of it. */
export const ENGINE = { X: 1.55, Y: 0.3, R: 0.56, LIP: -1.3, NOZZLE: -6.3 };
/** The engines' nozzles: right of the centre, above it, ahead of it. */
export const NOZZLES: Vec3[] = [-1, 1].map(s => [s * ENGINE.X, ENGINE.Y, ENGINE.NOZZLE]);
/** A wing's sections, at the hull, at the cannon and at the tip: right, the leading and the trailing edge ahead, the top and the bottom. */
export const WING = [
  [0.9, -2.7, -5.3, 0.14, -0.12],
  [2.6, -2.6, -5.5, 0.12, -0.1],
  [6.4, -4.9, -6.1, -0.7, -0.78],
];
/** The feet of the three legs it stands on: right of the centre, under it, ahead of it. */
export const FEET: Vec3[] = [
  [0, -SHIP.DROP, 3.4],
  [-1.9, -SHIP.DROP, -3.7],
  [1.9, -SHIP.DROP, -3.7],
];
/** Where each leg hangs from, and where its foot lies folded. */
const HIPS: Vec3[] = [
  [0, -0.55, 3.1],
  [-1.6, -0.08, -3.5],
  [1.6, -0.08, -3.5],
];
const STOWED: Vec3[] = [
  [0, -0.5, 2.1],
  [-1.6, -0.06, -4.6],
  [1.6, -0.06, -4.6],
];
/** The navigation lights: red on the port tip, green on the starboard one, a strobe on the spine. */
export const LIGHTS: Vec3[] = [
  [-6.4, -0.74, -5.5],
  [6.4, -0.74, -5.5],
  [0, 0.82, -3.1],
];
/** The vertices a ship takes at most, legs down and everything aboard, by level of detail (0 far to 2 near). */
export const BUDGET = [1400, 2400, 5000];

/** The ship's own frame for place(): model space as it is. */
const SELF: Vec3[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, -1],
];
const O: Vec3 = [0, 0, 0];

/** The hull across `a` ahead: half its width, its top and its keel, between two stations. */
const across = (a: number): number[] => {
  const k = Math.max(
    1,
    STATIONS.findIndex(s => s[0] >= a),
  );
  const [p, q] = [STATIONS[k - 1], STATIONS[k]];
  const t = (a - p[0]) / (q[0] - p[0]);
  return [1, 2, 3].map(i => p[i] + (q[i] - p[i]) * t);
};

/** The hull's ring `a` ahead, from the top's left edge round by the right: the flat top, the shoulders, the sides, the chines and the keel. */
const ring = (a: number): Vec3[] => {
  const [w, t, b] = across(a);
  const h = t - b;
  return [
    P(-FLAT * w, t, a),
    P(FLAT * w, t, a),
    P(w, t - 0.3 * h, a),
    P(w, b + 0.35 * h, a),
    P(0.55 * w, b, a),
    P(-0.55 * w, b, a),
    P(-w, b + 0.35 * h, a),
    P(-w, t - 0.3 * h, a),
  ];
};
/** The cockpit's sill `a` ahead, on the side `s`: the edge of the hull's top. */
const sill = (a: number, s: number): Vec3 => {
  const [w, t] = across(a);
  return P(s * FLAT * w, t, a);
};
/** The canopy's arch `i` (0 the front one): the sill, the roof's two edges, the sill. */
const arch = (i: number): Vec3[] => {
  const a = HULL.ARCH[i];
  const [w, y] = ROOF[i];
  return [sill(a, -1), P(-w, y, a), P(w, y, a), sill(a, 1)];
};

const mean = (ps: Vec3[]): Vec3 => ps.reduce(add).map(v => v / ps.length) as Vec3;

/** A skin between two rings of as many corners: each side in its colour of `cols` (none: left open), facing away from the middle. */
const skin = (o: number[], a: Vec3[], b: Vec3[], cols: (number[] | undefined)[]) => {
  const mid = mean([...a, ...b]);
  a.forEach((p, i) => {
    const j = (i + 1) % a.length;
    const c = cols[i % cols.length];
    if (c) {
      panel(o, [p, a[j], b[j], b[i]], c, sub(mean([p, a[j], b[j], b[i]]), mid));
    }
  });
};
/** A flat slab between two quads of four corners (front top, back top, back bottom, front bottom), closed at both. */
const slab = (o: number[], a: Vec3[], b: Vec3[], cols: number[][], ends = cols[2]) => {
  const mid = mean([...a, ...b]);
  skin(o, a, b, cols);
  panel(o, a, ends, sub(mean(a), mid));
  panel(o, b, ends, sub(mean(b), mid));
};
/** A wing's section `k` on the side `s`, as a slab takes it. */
const wing = (k: number, s: number): Vec3[] => {
  const [x, le, te, top, low] = WING[k];
  return [P(s * x, top, le), P(s * x, top, te), P(s * x, low, te), P(s * x, low, le)];
};
/** A flat patch laid just over the top of the slab between the sections a and b: `u` along it (0 at a), `v` back from the leading edge. */
const patch = (o: number[], a: Vec3[], b: Vec3[], uv: number[][], rgb: number[]) =>
  panel(
    o,
    uv.map(([u, v]) => {
      const p = mix(mix(a[0], a[1], v), mix(b[0], b[1], v), u);
      return [p[0], p[1] + 0.015, p[2]] as Vec3;
    }),
    rgb,
    [0, 1, 0],
  );

/** A unit cone, its tip at the origin, widening to radius 1 one unit ahead (-z): a flame. */
const CONE = dress(
  smooth(
    [
      [0, 0],
      [1, 1],
    ],
    8,
  ),
  [1, 1, 1],
);
/** A small glowing bead: a navigation light. */
const BEAD = dress(
  smooth(
    [
      [0, -0.12],
      [0.12, 0],
      [0, 0.12],
    ],
    6,
  ),
  [1, 1, 1],
);

/** The body in its own frame at a level of detail: what keeps its colours, and what takes the team's, white. */
const build = (lod: number): [number[], number[]] => {
  const [o, t]: number[][] = [[], []];
  const { TIP, SENSOR, SCREEN, ARCH, SPINE, TAIL } = HULL;
  const open = lod > 0;
  const HULL_COLS = [WHITE, WHITE, WHITE, GREY, DARK, GREY, WHITE, WHITE];

  // The hull, from the tail to the tip: white on top and the sides, grey chines, a dark keel; open
  // over the cockpit; a groove across the nose at each of its panels' joints near by; the sensor's
  // dark tip.
  const cuts =
    lod > 1
      ? [TAIL, -5.2, -3.2, -3.16, ARCH[1], SCREEN, 3.3, 3.34, 5.2, 5.24, SENSOR, TIP]
      : [TAIL, -5.2, ARCH[1], SCREEN, SENSOR, TIP];
  cuts.slice(1).forEach((b, k) => {
    const a = cuts[k];
    const cols =
      a >= SENSOR
        ? [GUNMETAL]
        : b - a < 0.1
          ? [LINE]
          : open && a == ARCH[1]
            ? [undefined, ...HULL_COLS.slice(1)]
            : HULL_COLS;
    skin(o, ring(a), ring(b), cols);
  });
  panel(o, ring(TAIL), DARK, [0, 0, 1]);
  panel(o, ring(TAIL).slice(4), DARK, [0, 0, 1]);
  panel(
    o,
    [0, 1, 2, 7].map(i => ring(TAIL)[i]),
    DARK,
    [0, 0, 1],
  );
  panel(
    o,
    [2, 3, 6, 7].map(i => ring(TAIL)[i]),
    DARK,
    [0, 0, 1],
  );
  const tip = ring(TIP);
  panel(o, [tip[0], tip[1], tip[2], tip[7]], DARK, [0, 0, -1]);
  panel(o, [tip[2], tip[3], tip[6], tip[7]], DARK, [0, 0, -1]);
  panel(o, [tip[3], tip[4], tip[5], tip[6]], DARK, [0, 0, -1]);
  if (lod) {
    // The sensor's probe.
    rod(o, LINK, P(0, -0.16, TIP - 0.1), P(0, -0.16, TIP + 0.4), 0.025, GUNMETAL);
  }
  // The team's band round the nose behind the sensor, and its stripe along the top.
  skin(
    t,
    ring(SENSOR - 0.55).map(p => [p[0] * 1.02, p[1] * 1.02 + 0.004, p[2]] as Vec3),
    ring(SENSOR - 0.2).map(p => [p[0] * 1.02, p[1] * 1.02 + 0.003, p[2]] as Vec3),
    [TEAM, TEAM, TEAM, undefined, undefined, undefined, TEAM, TEAM],
  );
  const stripe = (a: number, w: number): Vec3 => P(w, across(a)[1] + 0.012, a);
  panel(
    t,
    [stripe(2.1, -0.16), stripe(2.1, 0.16), stripe(4.9, 0.09), stripe(4.9, -0.09)],
    TEAM,
    [0, 1, 0],
  );

  // The canopy: a raked windscreen, a pane each side of it, a window each side and the roof, in a
  // frame of struts; behind it the spine runs down to the hull's back.
  const [front, rear] = [arch(0), arch(1)];
  const foot = [sill(SCREEN, -1), sill(SCREEN, 1)];
  const glass = open ? PANE : GLASS;
  const pane = (ps: Vec3[]) => {
    const from = o.length;
    panel(o, ps, glass, sub(mean(ps), P(0, 0.4, -0.3)));
    if (open) {
      // The smoke's layer has its opacity where a colour has its green.
      for (let i = from; i < o.length; i += STRIDE) {
        o[i + 8] = -3;
      }
    }
  };
  pane([foot[0], foot[1], front[2], front[1]]);
  pane([front[1], front[2], rear[2], rear[1]]);
  for (const s of [0, 1]) {
    const [l, u] = s ? [3, 2] : [0, 1];
    pane([foot[s], front[u], front[l]]);
    pane([front[l], front[u], rear[u], rear[l]]);
  }
  if (open) {
    const tube = lod > 1 ? TUBE : LINK;
    const strut = (a: Vec3, b: Vec3, r = 0.035) => rod(o, tube, a, b, r, FRAME);
    strut(foot[0], foot[1]);
    strut(front[1], front[2]);
    strut(rear[1], rear[2], 0.045);
    for (const s of [0, 1]) {
      const [l, u] = s ? [3, 2] : [0, 1];
      strut(foot[s], front[u]);
      strut(front[l], front[u], 0.04);
      strut(rear[l], rear[u], 0.045);
      strut(front[u], rear[u]);
      strut(foot[s], front[l], 0.03);
      strut(front[l], rear[l], 0.03);
    }
    // The cockpit: a dark tub, the seat's back and its headrest, the panel under the windscreen.
    const y = COCKPIT[1] - 0.03;
    const half = 0.5;
    const tub = [
      P(-half, y, SCREEN - 0.5),
      P(half, y, SCREEN - 0.5),
      P(half, y, ARCH[1]),
      P(-half, y, ARCH[1]),
    ];
    panel(o, tub, DARK, [0, 1, 0]);
    for (const s of [0, 1]) {
      const x = s ? 1 : -1;
      panel(o, [sill(SCREEN, x), sill(ARCH[1], x), tub[s ? 2 : 3], tub[s]], DARK, [-x, 0, 0]);
    }
    panel(o, [foot[0], foot[1], tub[1], tub[0]], DARK, [0, 0.5, 1]);
    panel(o, [rear[0], rear[3], tub[2], tub[3]], DARK, [0, 0, -1]);
    panel(o, rear, FRAME, [0, 0, -1]);
    const back = COCKPIT[2] - 0.4;
    slab(
      o,
      [
        P(-0.24, y + 0.85, back),
        P(-0.24, y + 0.85, back - 0.1),
        P(-0.24, y, back - 0.02),
        P(-0.24, y, back + 0.08),
      ],
      [
        P(0.24, y + 0.85, back),
        P(0.24, y + 0.85, back - 0.1),
        P(0.24, y, back - 0.02),
        P(0.24, y, back + 0.08),
      ],
      [GREY, LINE, LINE, GREY],
    );
    if (lod > 1) {
      slab(
        o,
        [
          P(-0.13, y + 1.0, back - 0.02),
          P(-0.13, y + 1.0, back - 0.12),
          P(-0.13, y + 0.85, back - 0.12),
          P(-0.13, y + 0.85, back - 0.02),
        ],
        [
          P(0.13, y + 1.0, back - 0.02),
          P(0.13, y + 1.0, back - 0.12),
          P(0.13, y + 0.85, back - 0.12),
          P(0.13, y + 0.85, back - 0.02),
        ],
        [LINE, LINE, LINE, LINE],
      );
      // The panel's hood and its two screens, lit; the yoke where the pilot's hands hold it.
      const hood = [
        P(-0.4, 0.56, SCREEN - 0.3),
        P(0.4, 0.56, SCREEN - 0.3),
        P(0.4, 0.2, SCREEN - 0.6),
        P(-0.4, 0.2, SCREEN - 0.6),
      ];
      panel(o, hood, FRAME, [0, 0.4, -1]);
      const from = o.length;
      for (const x of [-0.17, 0.17]) {
        panel(
          o,
          [
            P(x - 0.12, 0.5, SCREEN - 0.36),
            P(x + 0.12, 0.5, SCREEN - 0.36),
            P(x + 0.12, 0.28, SCREEN - 0.55),
            P(x - 0.12, 0.28, SCREEN - 0.55),
          ],
          [0.25, 0.8, 0.9],
          [0, 0.4, -1],
        );
      }
      glow(o, from, 1.2);
      const [l, r] = grips(0).map(g => P(COCKPIT[0] + g[0], COCKPIT[1] + g[1], COCKPIT[2] + g[2]));
      rod(o, LINK, l, r, 0.02, GUNMETAL);
      rod(o, LINK, mix(l, r, 0.5), P(0, y + 0.1, COCKPIT[2] + 0.75), 0.022, FRAME);
    }
  }
  // The spine: from the canopy's rear arch down to the hull's back, a stripe along its top.
  const end = [
    P(-0.34, 0, SPINE),
    P(-0.1, 0.14, SPINE),
    P(0.1, 0.14, SPINE),
    P(0.34, 0, SPINE),
  ].map(p => [p[0], p[1] + across(SPINE)[1], p[2]] as Vec3);
  skin(o, rear, end, [WHITE, PALE, WHITE, undefined]);
  panel(o, end, GREY, [0, 0, 1]);
  const lift = (p: Vec3): Vec3 => [p[0] * 0.7, p[1] + 0.012, p[2]];
  panel(
    t,
    [
      mix(rear[1], end[1], 0.12),
      mix(rear[2], end[2], 0.12),
      mix(rear[2], end[2], 0.8),
      mix(rear[1], end[1], 0.8),
    ].map(lift),
    TEAM,
    [0, 1, 0],
  );

  if (lod > 1) {
    // What the hull leaves bare, near by. Behind the spine, an open bay in the back: pipes along
    // it, two units across it, a tank.
    const deck = (a: number) => across(a)[1];
    const bay = [-3.45, -6.1];
    const lay = (x: number, a: number, up = 0.008): Vec3 => P(x, deck(a) + up, a);
    panel(
      o,
      [lay(-0.52, bay[0]), lay(0.52, bay[0]), lay(0.34, bay[1]), lay(-0.34, bay[1])],
      DARK,
      [0, 1, 0],
    );
    for (const [x, r, rgb] of [
      [-0.36, 0.045, COPPER],
      [-0.22, 0.03, GUNMETAL],
      [0.12, 0.03, GUNMETAL],
      [0.24, 0.05, COPPER],
      [0.38, 0.025, GUNMETAL],
    ] as [number, number, number[]][]) {
      rod(o, LINK, lay(x, bay[0] - 0.1, r + 0.01), lay(x * 0.7, bay[1] + 0.15, r + 0.01), r, rgb);
    }
    for (const [a, w, h] of [
      [-4.05, 0.3, 0.1],
      [-5.15, 0.22, 0.13],
    ]) {
      slab(
        o,
        [lay(-w, a, h), lay(-w, a - 0.35, h), lay(-w, a - 0.35), lay(-w, a)],
        [lay(w, a, h), lay(w, a - 0.35, h), lay(w, a - 0.35), lay(w, a)],
        [GREY, LINE, LINE, LINE],
      );
    }
    rod(o, TUBE, lay(-0.08, -4.55, 0.1), lay(-0.08, -5.05, 0.1), 0.09, PALE);
    // A trench along each flank under the cockpit, two pipes in it; a groove along each side of
    // the nose, and two vents on its top.
    for (const s of [-1, 1]) {
      /** On the hull's side `a` ahead: `v` down it (0 the shoulder, 1 the chine), `out` proud of it. */
      const flank = (a: number, v: number, out = 0.008): Vec3 => {
        const q = ring(a);
        const p = mix(q[s > 0 ? 2 : 7], q[s > 0 ? 3 : 6], v);
        return [p[0] + s * out, p[1], p[2]];
      };
      panel(o, [flank(1.2, 0.3), flank(-1.15, 0.3), flank(-1.15, 0.8), flank(1.2, 0.8)], DARK, [
        s,
        0,
        0,
      ]);
      rod(o, LINK, flank(1.15, 0.45, 0.05), flank(-1.1, 0.45, 0.05), 0.04, COPPER);
      rod(o, LINK, flank(1.15, 0.67, 0.04), flank(-1.1, 0.67, 0.04), 0.028, GUNMETAL);
      for (const a of [0.6, -0.5]) {
        rod(o, LINK, flank(a, 0.32, 0.05), flank(a, 0.78, 0.05), 0.022, GREY);
      }
      panel(
        o,
        [flank(1.9, 0.42), flank(SENSOR - 0.7, 0.42), flank(SENSOR - 0.7, 0.58), flank(1.9, 0.58)],
        LINE,
        [s, 0, 0],
      );
      panel(
        o,
        [
          P(s * 0.12, deck(2.75) + 0.008, 2.75),
          P(s * 0.34, deck(2.75) + 0.008, 2.75),
          P(s * 0.3, deck(1.95) + 0.008, 1.95),
          P(s * 0.12, deck(1.95) + 0.008, 1.95),
        ],
        DARK,
        [0, 1, 0],
      );
      // Circuits: thin tracks with a pad at their end, laid on the nose's top and on the wing, in
      // a grey a little darker than the hull: seen near by, not from afar.
      const wingY = (x: number) =>
        x < WING[1][0]
          ? WING[0][3] + ((x - WING[0][0]) / (WING[1][0] - WING[0][0])) * (WING[1][3] - WING[0][3])
          : WING[1][3] + ((x - WING[1][0]) / (WING[2][0] - WING[1][0])) * (WING[2][3] - WING[1][3]);
      const onNose = (a: number, x: number): Vec3 => P(s * x, deck(a) + 0.012, a);
      const onWing = (a: number, x: number): Vec3 => P(s * x, wingY(x) + 0.012, a);
      const track = (on: (a: number, x: number) => Vec3, path: number[][], w = 0.022) => {
        path.slice(1).forEach(([a1, x1], k) => {
          const [a0, x0] = path[k];
          const l = Math.hypot(a1 - a0, x1 - x0);
          const [na, nx] = [(-(x1 - x0) / l) * w, ((a1 - a0) / l) * w];
          panel(
            o,
            [
              on(a0 + na, x0 + nx),
              on(a1 + na, x1 + nx),
              on(a1 - na, x1 - nx),
              on(a0 - na, x0 - nx),
            ],
            TRACK,
            [0, 1, 0],
          );
        });
        const [a, x] = path[path.length - 1];
        const d = 2.6 * w;
        panel(
          o,
          [on(a - d, x - d), on(a + d, x - d), on(a + d, x + d), on(a - d, x + d)],
          TRACK,
          [0, 1, 0],
        );
      };
      track(onNose, [
        [3, 0.38],
        [3.6, 0.38],
        [3.8, 0.28],
        [4.6, 0.28],
      ]);
      track(onNose, [
        [4, 0.34],
        [4.3, 0.34],
      ]);
      track(onNose, [
        [3.05, 0.31],
        [3.45, 0.31],
        [3.55, 0.24],
      ]);
      track(onNose, [
        [5.35, 0.2],
        [6.2, 0.2],
        [6.35, 0.14],
      ]);
      track(onNose, [
        [5.5, 0.26],
        [5.9, 0.26],
      ]);
      track(onWing, [
        [-3.2, 2.9],
        [-4.6, 2.9],
        [-4.9, 3.2],
        [-4.9, 3.9],
      ]);
      track(onWing, [
        [-3.6, 3.3],
        [-4.2, 3.3],
        [-4.2, 3.9],
      ]);
      track(onWing, [
        [-3.4, 3.9],
        [-3.4, 3.5],
      ]);
      track(onWing, [
        [-5.2, 3.1],
        [-5.2, 3.7],
        [-5.35, 3.85],
      ]);
      track(onWing, [
        [-4.6, 5.1],
        [-5.4, 5.1],
        [-5.6, 5.3],
        [-5.6, 5.7],
      ]);
      track(onWing, [
        [-4.8, 5.4],
        [-5.2, 5.4],
      ]);
      // Pipes: one along the nose under each shoulder with a branch down, one along the foot of
      // the spine, three along each engine's cowl.
      rod(o, LINK, flank(1.7, 0.2, 0.03), flank(4.4, 0.2, 0.03), 0.022, COPPER);
      rod(o, LINK, flank(2.6, 0.2, 0.03), flank(2.6, 0.75, 0.03), 0.018, GUNMETAL);
      rod(o, LINK, flank(3.7, 0.2, 0.03), flank(3.7, 0.75, 0.03), 0.018, GUNMETAL);
      const [foot0, foot1] = [rear[s > 0 ? 3 : 0], end[s > 0 ? 3 : 0]];
      rod(
        o,
        LINK,
        add(mix(foot0, foot1, 0.06), [s * 0.03, 0.03, 0]),
        add(mix(foot0, foot1, 0.94), [s * 0.03, 0.03, 0]),
        0.028,
        GUNMETAL,
      );
      for (const [deg, a0, a1, rgb] of [
        [50, -1.9, -3.2, COPPER],
        [75, -2.2, -3.3, GUNMETAL],
        [125, -1.9, -2.9, GUNMETAL],
      ] as [number, number, number, number[]][]) {
        const [c, u] = [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];
        const r = ENGINE.R + 0.012;
        rod(
          o,
          LINK,
          P(s * (ENGINE.X + c * r), ENGINE.Y + u * r, a0),
          P(s * (ENGINE.X + c * r), ENGINE.Y + u * r, a1),
          0.02,
          rgb,
        );
      }
    }
    // The tail: a cluster of ducts.
    for (const [x, y] of [
      [-0.2, 0.1],
      [0.2, 0.1],
      [0, -0.12],
    ]) {
      rod(o, TUBE, P(x, y, TAIL + 0.05), P(x, y, TAIL - 0.22), 0.11, GUNMETAL);
    }
  }
  const sides = [6, 8, 12][lod];
  const { X, Y, R, LIP, NOZZLE } = ENGINE;
  const len = LIP - NOZZLE;
  for (const s of [-1, 1]) {
    // A wing: level from the hull out to the cannon, then swept back and drooping to the tip.
    const [root, mid, end] = [0, 1, 2].map(k => wing(k, s));
    const cols = [PALE, DARK, GREY, WHITE];
    slab(o, root, mid, cols);
    slab(o, mid, end, cols, GREY);
    // The team's stripe across the outer wing, and its tip.
    patch(
      t,
      mid,
      end,
      [
        [0.42, 0.08],
        [0.6, 0.08],
        [0.6, 0.9],
        [0.42, 0.9],
      ],
      TEAM,
    );
    patch(
      t,
      mid,
      end,
      [
        [0.9, 0],
        [1, 0],
        [1, 1],
        [0.9, 1],
      ],
      TEAM,
    );
    // The engine against the hull's flank: a wide cowl, the team's ring behind its lip, a dark
    // intake, deep, with the turbine's spinner out of its middle; behind the cowl a thinner exhaust with two dark ribs and a pipe along
    // it, and a dark nozzle.
    const lathe = (profile: [number, number][], rgb: number[], into = o, k = 1) =>
      place(into, dress(smooth(profile, sides), rgb), P(s * X, Y, NOZZLE), SELF, O, k);
    lathe(
      lod > 1
        ? [
            [R * 0.66, 0],
            [R * 0.6, 0.3],
            [R * 0.6, 2.5],
            [R, 2.9],
            [R, len - 0.45],
            [R * 0.8, len],
          ]
        : [
            [R * 0.62, 0],
            [R * 0.6, 2.5],
            [R, 2.9],
            [R, len - 0.5],
            [R * 0.8, len],
          ],
      PALE,
    );
    if (lod) {
      lathe(
        [
          [R * 0.96, len - 0.95],
          [R * 0.955, len - 0.5],
        ],
        TEAM,
        t,
        1.03,
      );
      // The turbine's spinner, well out of the intake's mouth.
      lathe(
        [
          [R * 0.4, len - 0.6],
          [R * 0.34, len - 0.05],
          [0, len + 0.6],
        ],
        GREY,
      );
    }
    lathe(
      [
        [0, len - 0.8],
        [R * 0.8, len - 0.02],
      ],
      DARK,
    );
    if (lod) {
      lathe(
        [
          [R * 0.6, 0.02],
          [0, 0.3],
        ],
        DARK,
      );
    }
    if (lod > 1) {
      for (const l of [0.9, 1.7]) {
        lathe(
          [
            [R * 0.68, l],
            [R * 0.68, l + 0.14],
          ],
          LINE,
        );
      }
      for (const [dx, r] of [
        [0.2, 0.035],
        [-0.12, 0.025],
      ]) {
        rod(
          o,
          LINK,
          P(s * (X + dx), Y + R * 0.62, NOZZLE + 0.35),
          P(s * (X + dx), Y + R * 0.62, NOZZLE + 2.75),
          r,
          dx > 0 ? COPPER : GUNMETAL,
        );
      }
    }
    // A fin on the hull's back, at the edge of its deck, swept back and canted out, in the team's colour.
    const fin = (x: number, y: number, a: number, w: number): Vec3 => P(s * x + w, y, a);
    const foot = (a: number) => across(a)[1] - 0.04;
    slab(
      t,
      [
        fin(0.56, foot(-3.5), -3.5, 0.05),
        fin(0.5, foot(-5.6), -5.6, 0.05),
        fin(0.5, foot(-5.6), -5.6, -0.05),
        fin(0.56, foot(-3.5), -3.5, -0.05),
      ],
      [
        fin(1.25, 2.4, -5.3, 0.03),
        fin(1.25, 2.4, -6.4, 0.03),
        fin(1.25, 2.4, -6.4, -0.03),
        fin(1.25, 2.4, -5.3, -0.03),
      ],
      [TEAM],
      TEAM,
    );
    // The laser cannon slung under the wing: its housing in the leading edge, the barrel, the muzzle.
    const [gx, gy, ga] = SHIP_GUNS[+(s > 0)];
    rod(o, lod ? TUBE : LINK, P(gx, gy, -3.7), P(gx, gy, -1.75), 0.17, GREY);
    rod(o, lod ? TUBE : LINK, P(gx, gy, -1.8), P(gx, gy, ga), 0.065, GUNMETAL);
    if (lod) {
      panel(
        o,
        [0, 1, 2, 3].map(k =>
          P(gx + 0.17 * Math.cos(k * 1.571), gy + 0.17 * Math.sin(k * 1.571), -1.75),
        ),
        DARK,
        [0, 0, -1],
      );
      rod(o, TUBE, P(gx, gy, ga - 0.22), P(gx, gy, ga), 0.095, GUNMETAL);
    }
    // The missiles' rail under the wing, on its pylon.
    const [px, py, pa] = PODS[+(s > 0)];
    if (lod) {
      rod(o, LINK, P(px, py + 0.18, pa - 1.6), P(px, py + 0.18, pa + 0.4), 0.05, DARK);
      rod(o, LINK, P(px, py + 0.18, pa - 0.6), P(px, py + 0.5, pa - 0.9), 0.05, DARK);
    }
  }
  return [o, t];
};

const kits: [number[], number[]][] = [];

/** The ship's frame in the world: where a point right, up and ahead of its centre is, and its axes. */
const frame = (r: Rover): [(p: number[]) => Vec3, Vec3[]] => {
  const axes = basis(r.yaw, r.pitch, r.roll);
  const [R, U, F] = axes;
  return [
    ([x, y, a]) => [
      r.x + R[0] * x + U[0] * y + F[0] * a,
      r.y + R[1] * x + U[1] * y + F[1] * a,
      r.z + R[2] * x + U[2] * y + F[2] * a,
    ],
    axes,
  ];
};

/** How hard the engines burn, 0 to 1: idling with a pilot, up with the speed; out without one. */
export const burn = (r: Rover): number =>
  r.driver === NOBODY || r.wreck
    ? 0
    : 0.3 + 0.7 * Math.min(1, Math.hypot(r.vx, r.vy, r.vz) / (SHIP.VMAX * SHIP.BOOST));

/** How far out the legs are, 0 folded to 1 down: down with nobody aboard and at a crawl, folded by 12 m/s. */
export const legs = (r: Rover): number =>
  r.driver === NOBODY ? 1 : Math.min(1, Math.max(0, 1 - (Math.hypot(r.vx, r.vy, r.vz) - 3) / 9));

/**
 * Appends the ship as the state has it, unless it is gone (`wreck`), at the level of detail `lod`
 * (0 far to 2 near): the hull pitched and banked, the stripes and fins in `rgb` (the team's colour,
 * 0 to 1), its legs down or folding, the missiles it has left under the wings, the flames of its
 * engines and its navigation lights. `t` is the time in seconds, for the strobe.
 */
export const craft = (out: number[], r: Rover, rgb: number[], t: number, lod = 2): void => {
  if (r.wreck) {
    return;
  }
  const kit = (kits[Math.min(lod, 2)] ??= build(Math.min(lod, 2)));
  const [to, axes] = frame(r);
  const at: Vec3 = [r.x, r.y, r.z];
  place(out, kit[0], at, axes, O, 1);
  place(out, kit[1], at, axes, O, 1, rgb);
  // The legs: a strut from the hip to the foot and a shoe under it, swung back into the hull as they fold.
  const g = legs(r);
  if (g > 0.02) {
    FEET.forEach((f, i) => {
      const e = g * g * (3 - 2 * g);
      const foot = mix(STOWED[i], f, e);
      const ankle: Vec3 = [foot[0], foot[1] + 0.09, foot[2]];
      rod(out, lod ? TUBE : LINK, to(HIPS[i]), to(ankle), 0.055, GREY);
      rod(
        out,
        TUBE,
        to([ankle[0], ankle[1], ankle[2] - 0.28]),
        to([ankle[0], ankle[1], ankle[2] + 0.28]),
        0.09,
        FRAME,
      );
      if (lod > 1) {
        const knee = mix(HIPS[i], ankle, 0.55);
        rod(out, LINK, to([HIPS[i][0], HIPS[i][1], HIPS[i][2] - 0.7]), to(knee), 0.03, FRAME);
      }
    });
  }
  // The missiles left, inner ones first: white bodies with a red tip.
  for (let k = 0; k < (r.nades ?? 0); k++) {
    const [px, py, pa] = PODS[k % 2];
    const x = px + (k < 2 ? 0 : Math.sign(px) * 0.55);
    rod(out, lod ? TUBE : LINK, to([x, py, pa - 1.8]), to([x, py, pa + 0.3]), 0.13, WHITE);
    if (lod) {
      rod(out, LINK, to([x, py, pa + 0.3]), to([x, py, pa + 0.7]), 0.09, [0.85, 0.15, 0.1]);
    }
  }
  // The flames: a glowing cone back from each nozzle, longer and brighter as it burns.
  const k = burn(r);
  if (k > 0) {
    const L = 0.6 + 2.8 * k;
    for (const [x, y, a] of NOZZLES) {
      const from = out.length;
      place(out, CONE, to([x, y, a + 0.25 - L]), axes, O, [0.34, 0.34, L], FLAME);
      if (lod > 1) {
        place(out, CONE, to([x, y, a + 0.25 - 0.55 * L]), axes, O, [0.2, 0.2, 0.55 * L], CORE);
      }
      glow(out, from, 1 + 2 * k);
    }
  }
  // Red to port, green to starboard, a white strobe on the spine.
  const lights: [number[], number][] = [
    [[1, 0.1, 0.05], 2],
    [[0.1, 1, 0.3], 2],
    [[1, 1, 1], (t * 1.4) % 1 < 0.12 ? 3 : 0],
  ];
  lights.forEach(([c, n], i) => {
    if (n) {
      const from = out.length;
      place(out, BEAD, to(LIGHTS[i]), axes, O, 1, c);
      glow(out, from, n);
    }
  });
};
