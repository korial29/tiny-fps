// Landfall's buggy, its body (the user, 2026-11-27: a buggy for each camp): an open dune buggy on
// the rover's chassis (shared/rover.ts), so the seats, the guns, the suspension's towers and the
// headlights stand where the rover's do. Wider than the rover, out to its wheels' inner faces
// (the user, 2026-11-27). A tall bonnet rounded on its top edges and down to the grille at its
// front (horizontal bars), side pods, both in the team's colour, a simple mudguard over each wheel
// as the moon's rover has (wheel.ts), a tube roll cage over the seats with a light bar on its front
// hoop, a bare engine behind with its air filters and exhaust, the spare tyre upright behind the
// seats, and a whip with a pennant. Blocked out in Blender first, then written here: x right, y
// up, -z the nose, the origin at the body's centre.
import { GUNS } from '../../shared/rover';
import { GLOW, glow } from '../flag';
import { STRIDE, add, dress, smooth } from '../mesh';
import type { Vec3 } from '../mesh';
import { A, LENS, LINK, P, TOWER, TUBE, loft, panel, rod, section } from '../rover';
import {
  CAGE,
  DARK,
  DIALS,
  ENGINE,
  LAMP,
  POD_Y,
  SEAT,
  SIDE,
  STEEL,
  TAIL,
  WHITE,
} from './constants';
import { pods } from './pods';
import { RIM, RUBBER } from './wheel';

/** How far back from the grille the bonnet's top starts to slope down to it, and how far down (the user, 2026-11-27: a steep slope at the front). */
const NOSE_A = 0.9;
const NOSE_D = 0.38;
/** The bonnet's half width, and its top at the dash and at the grille: low (the user, 2026-11-27: half as tall, then a little taller), just over the pods' top. */
const BONNET = 0.62;
const [TOP0, TOP1] = [0.16, 0.14];
/** The rounding of the bonnet's top edges (the user, 2026-11-27: light on the sides, strong at the front). */
const ROUND = 0.07;
/**
 * The bonnet's ring at `a` ahead, its top `y`: straight sides, the top's edges quarter rounds of
 * ROUND in `n` steps. Left foot, the left round up, the right round down, right foot.
 */
const hood = (a: number, y: number, n: number): Vec3[] => {
  const arc = Array.from({ length: n + 1 }, (_, k) => {
    const t = (k * Math.PI) / (2 * n);
    return [BONNET - ROUND + ROUND * Math.cos(t), y - ROUND + ROUND * Math.sin(t)];
  });
  return [[-BONNET, -0.4], ...arc.map(([x, h]) => [-x, h]), ...arc.reverse(), [BONNET, -0.4]].map(
    ([x, h]) => P(x, h, a),
  );
};

/** The body in its own frame at a level of detail: what keeps its colours, and what takes the team's, white. */
export const body = (level: number): [number[], number[]] => {
  const [o, t]: number[][] = [[], []];
  const near = level > 1;
  const bar = (a: Vec3, b: Vec3, r = 0.04, rgb = CAGE) =>
    rod(o, near && r > 0.035 ? TUBE : LINK, a, b, r, rgb);
  const lit = (rgb: number[], k: number, draw: () => void, to = o) => {
    const from = to.length;
    draw();
    for (let i = from; i < to.length; i += STRIDE) {
      [to[i + 6], to[i + 7], to[i + 9]] = rgb;
    }
    glow(to, from, k);
  };

  // The bonnet in the team's colour, the grille on its front dark behind horizontal bars.
  const n = [2, 3, 5][level];
  // Flat from the dash, then down a quarter ellipse to the grille, NOSE_A long and NOSE_D down.
  const rings = [
    hood(0.85, TOP0, n),
    ...Array.from({ length: n + 1 }, (_, k) => {
      const q = (k * Math.PI) / (2 * n);
      return hood(1.95 - NOSE_A + NOSE_A * Math.sin(q), TOP1 - NOSE_D * (1 - Math.cos(q)), n);
    }),
  ];
  for (let k = 0; k + 1 < rings.length; k++) {
    loft(t, rings[k], rings[k + 1], [WHITE]);
  }
  const front = rings[rings.length - 1];
  // The grille up to where the rounds begin, then the bonnet's front between them.
  const g = front.map(p => add(p, [0, 0, -0.005]));
  const z = g.length - 1;
  panel(o, [g[0], g[z], g[z - 1], g[1]], DARK, [0, 0, -1]);
  for (let k = 0; k < n; k++) {
    panel(t, [g[1 + k], g[z - 1 - k], g[z - 2 - k], g[2 + k]], WHITE, [0, 0, -1]);
  }
  // The dash, facing the driver: across the body up to the pods' top, then up to the bonnet's.
  panel(
    o,
    [P(-SIDE, -0.45, 0.85), P(SIDE, -0.45, 0.85), P(SIDE, POD_Y, 0.85), P(-SIDE, POD_Y, 0.85)],
    DARK,
    [0, 0, 1],
  );
  panel(
    o,
    [
      P(-BONNET, POD_Y, 0.85),
      P(BONNET, POD_Y, 0.85),
      P(BONNET - ROUND, TOP0, 0.85),
      P(ROUND - BONNET, TOP0, 0.85),
    ],
    DARK,
    [0, 0, 1],
  );

  // The floor, and a pod down each side in the team's colour.
  panel(
    o,
    [P(-SIDE, -0.44, -0.6), P(SIDE, -0.44, -0.6), P(SIDE, -0.44, 0.85), P(-SIDE, -0.44, 0.85)],
    STEEL,
    [0, 1, 0],
  );
  pods(o, t, level);

  // The engine behind the seats, bare, the tail lamps on its end.
  loft(
    o,
    section(-0.55, 0.5, 0.2, 0.5, -0.45),
    section(-1.55, 0.45, 0.15, 0.45, -0.4),
    [ENGINE, STEEL, DARK, STEEL],
    undefined,
    DARK,
  );
  for (const s of [-1, 1]) {
    lit(TAIL, GLOW, () =>
      panel(
        o,
        [
          P(s * 0.2, -0.05, -1.555),
          P(s * 0.36, -0.05, -1.555),
          P(s * 0.36, 0.05, -1.555),
          P(s * 0.2, 0.05, -1.555),
        ],
        WHITE,
        [0, 0, 1],
      ),
    );
  }

  // The roll cage: the main hoop behind the seats, the front hoop over the dash, the rails between
  // their tops, braces back to the engine's corners and down to the nose's, the bumper.
  const hoop = (foot: Vec3, shoulder: Vec3, top: Vec3) => {
    const m = (p: Vec3): Vec3 => [-p[0], p[1], p[2]];
    bar(foot, shoulder, 0.045);
    bar(shoulder, top, 0.045);
    bar(m(foot), m(shoulder), 0.045);
    bar(m(shoulder), m(top), 0.045);
    bar(top, m(top), 0.045);
  };
  const [mainS, mainT] = [P(0.86, 0.85, -0.55), P(0.68, 1.15, -0.6)];
  const [frontS, frontT] = [P(0.82, 0.72, 0.74), P(0.64, 1.05, 0.64)];
  hoop(P(SIDE - 0.04, 0.1, -0.5), mainS, mainT);
  hoop(P(SIDE - 0.04, POD_Y, 0.78), frontS, frontT);
  for (const s of [-1, 1]) {
    bar(P(s * mainT[0], mainT[1], -mainT[2]), P(s * frontT[0], frontT[1], -frontT[2]), 0.04);
    bar(P(s * mainS[0], mainS[1], -mainS[2]), P(s * 0.44, 0.15, -1.55), 0.04);
    bar(P(s * frontS[0], frontS[1], -frontS[2]), P(s * (BONNET + 0.03), 0.05, 1.5), 0.04);
  }
  // A flat steel bumper, as wide as the body.
  bar(P(-SIDE + 0.1, -0.3, 2.06), P(SIDE - 0.1, -0.3, 2.06), 0.07, STEEL);

  // The headlights, on the ends of the bumper.
  for (const s of [-1, 1]) {
    const at = P(s * LENS[0], LENS[1], LENS[2]);
    if (near) {
      o.push(
        ...dress(
          smooth(
            [
              [0.085, -0.13],
              [0.095, 0],
              [0, 0],
            ],
            6,
            at,
          ),
          STEEL,
        ),
      );
      const lens = o.length - 18 * STRIDE;
      for (let i = lens; i < o.length; i += STRIDE) {
        [o[i + 6], o[i + 7], o[i + 9]] = LAMP;
      }
      glow(o, lens, GLOW);
    } else {
      lit(LAMP, GLOW, () =>
        panel(
          o,
          [
            add(at, [-0.09, -0.09, 0]),
            add(at, [0.09, -0.09, 0]),
            add(at, [0.09, 0.09, 0]),
            add(at, [-0.09, 0.09, 0]),
          ],
          WHITE,
          [0, 0, -1],
        ),
      );
    }
  }
  if (!level) {
    return [o, t];
  }

  // The seats, the driver's on the left: a cushion and an upright back.
  for (const x of [-0.45, 0.45]) {
    const pad = (a: number, y: number, back: number) => [
      P(x - 0.21, y, a),
      P(x + 0.21, y, a),
      P(x + 0.21, y, a - back),
      P(x - 0.21, y, a - back),
    ];
    panel(o, pad(0.3, -0.22, 0.52), SEAT, [0, 1, 0]);
    const [low, high] = [pad(-0.2, -0.22, 0.08), pad(-0.3, 0.68, 0.07)];
    if (near) {
      panel(
        o,
        [...pad(0.3, -0.44, 0).slice(0, 2), ...pad(0.3, -0.22, 0).slice(2)],
        SEAT,
        [0, 0, -1],
      );
      loft(o, low, high, [SEAT, DARK, DARK, DARK], undefined, SEAT);
    } else {
      panel(o, [low[0], low[1], high[1], high[0]], SEAT, [0, 0, -1]);
    }
  }

  // The spare tyre upright behind the seats, its rim toward the tail.
  const spare = P(0, 0.62, -0.82);
  o.push(
    ...dress(
      smooth(
        [
          [0.27, -0.13],
          [0.42, -0.12],
          [0.42, 0.12],
          [0.27, 0.13],
        ],
        level > 1 ? 12 : 8,
        spare,
      ),
      RUBBER,
    ),
    ...dress(
      smooth(
        [
          [0, -0.08],
          [0.27, -0.13],
        ],
        6,
        spare,
      ),
      RIM,
    ),
  );

  // The light bar on the front hoop, its lamps ahead.
  const lamps = (a: number) => [
    P(-0.5, 1.13, a),
    P(0.5, 1.13, a),
    P(0.5, 1.03, a),
    P(-0.5, 1.03, a),
  ];
  loft(o, lamps(0.58), lamps(0.67), [DARK], DARK);
  for (const x of near ? [-0.39, -0.13, 0.13, 0.39] : [0]) {
    const w = near ? 0.08 : 0.46;
    lit(LAMP, GLOW, () =>
      panel(
        o,
        [
          P(x - w, 1.04, 0.675),
          P(x + w, 1.04, 0.675),
          P(x + w, 1.12, 0.675),
          P(x - w, 1.12, 0.675),
        ],
        WHITE,
        [0, 0, -1],
      ),
    );
  }

  // The towers the dampers hang from (rover/draw.ts): braced across over the engine; at the front,
  // two posts standing out of the low bonnet.
  for (const a of [A, -A]) {
    const towers = [-1, 1].map(s => P(s * TOWER[0], TOWER[1], a));
    if (a < 0) {
      bar(towers[0], towers[1], 0.04, STEEL);
    }
    towers.forEach((top, i) =>
      bar(P((i * 2 - 1) * 0.4, a > 0 ? -0.05 : 0.12, a), top, 0.04, STEEL),
    );
  }
  if (!near) {
    return [o, t];
  }

  // A door bar each side, the cage's cross brace, its diagonal.
  for (const s of [-1, 1]) {
    bar(P(s * (SIDE - 0.04), 0.4, -0.52), P(s * (SIDE - 0.06), 0.45, 0.8), 0.035);
  }
  bar(P(-0.86, 0.85, -0.55), P(0.68, 1.15, -0.6), 0.035);

  // The grille's bars, across.
  for (const y of [-0.36]) {
    bar(P(0.06 - BONNET, y, 1.96), P(BONNET - 0.06, y, 1.96), 0.018, STEEL);
  }

  // The air filters and the exhaust on the engine.
  for (const x of [-0.3, 0.3]) {
    bar(P(x, 0.17, -1.25), P(x, 0.36, -1.25), 0.09, STEEL);
    bar(P(x, 0.36, -1.25), P(x, 0.38, -1.25), 0.095, DARK);
  }
  bar(P(0.36, -0.1, -1.45), P(0.42, 0.2, -1.75), 0.05, STEEL);

  // A laser along each side, as the rover's (GUNS, shared/rover.ts): a dark barrel on two clamps, its mouth glowing green.
  for (const [x, y, a] of GUNS) {
    bar(P(x, y, a - 1.1), P(x, y, a - 0.06), 0.065, [0.16, 0.17, 0.2]);
    bar(P(x, y, a - 1.2), P(x, y, a - 1.1), 0.085, STEEL);
    for (const at of [a - 0.85, a - 0.35]) {
      bar(P(x * 0.7, y - 0.14, at), P(x, y, at), 0.03, STEEL);
    }
    lit([0.2, 1, 0.35], GLOW, () => bar(P(x, y, a - 0.06), P(x, y, a), 0.05, [0.2, 1, 0.35]));
  }

  // The dials in front of the driver.
  lit(DIALS, 1.5, () =>
    panel(
      o,
      [P(-0.6, -0.08, 0.845), P(-0.3, -0.08, 0.845), P(-0.3, 0.04, 0.845), P(-0.6, 0.04, 0.845)],
      WHITE,
      [0, 0, 1],
    ),
  );

  // The whip at the tail, its pennant in the team's colour.
  const tip = P(-0.62, 2.4, -1.62);
  bar(P(-0.6, 0.15, -1.5), tip, 0.012, STEEL);
  for (const s of [-1, 1]) {
    panel(t, [tip, P(-0.62, 2.12, -1.62), P(-0.62, 2.27, -2.05)], WHITE, [s, 0, 0]);
  }
  return [o, t];
};
