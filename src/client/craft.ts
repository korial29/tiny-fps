// The moon's spaceship, drawn (the simulation is shared/ship.ts): a single-seat fighter of its own
// design. A faceted white hull with a dark glass canopy, delta wings with a laser cannon at each
// root and missiles slung under them, two canted fins and the stripes in the team's colour, twin
// engines whose flames grow with the speed, and two skids it rests on. A pure function of the
// ship's state: no state, no DOM. The rigid parts are built once in the ship's frame (x right, y
// up, -z the nose, the origin at the centre) and placed each frame; the flames, the missiles left
// and the lights are added after them.
import { NOBODY } from '../shared/types';
import type { Rover } from '../shared/types';
import { COCKPIT, PODS, SHIP, SHIP_GUNS } from '../shared/ship';
import { glow } from './flag';
import { SHINE, STRIDE, basis, dress, place, smooth } from './mesh';
import type { Vec3 } from './mesh';
import { LINK, P, TUBE, loft, panel, rod } from './rover';

const WHITE = [0.8, 0.81, 0.84];
const GREY = [0.46, 0.48, 0.52];
const DARK = [0.08, 0.085, 0.1];
const GLASS = [0.05, 0.09, 0.14, SHINE];
const GUNMETAL = [0.2, 0.21, 0.24, SHINE];
const FLAME = [1, 0.55, 0.2];
const CORE = [0.55, 0.8, 1];

/** A ring across the hull `a` ahead: its top (half the width), the chines (the widest) and the keel. */
const ring = (a: number, w: number, top: number, chine: number, keel: number): Vec3[] => [
  P(-0.55 * w, top, a),
  P(0.55 * w, top, a),
  P(w, chine, a),
  P(0.6 * w, keel, a),
  P(-0.6 * w, keel, a),
  P(-w, chine, a),
];

/** The hull's rings from the tail to the nose's tip. */
const RINGS = [
  ring(-6.6, 0.9, 0.6, 0, -0.5),
  ring(-4.5, 1.35, 0.95, 0.05, -0.8),
  ring(-1, 1.5, 0.95, 0, -0.85),
  ring(2, 1.25, 0.85, -0.05, -0.75),
  ring(4.5, 0.75, 0.45, -0.1, -0.5),
  ring(6.6, 0.2, 0.05, -0.15, -0.25),
  ring(7.4, 0.02, -0.1, -0.12, -0.14),
];

/** The ship's own frame for place(): model space as it is. */
const SELF: Vec3[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, -1],
];

/** A flat slab between two quads of four corners (front top, back top, back bottom, front bottom). */
const slab = (o: number[], a: Vec3[], b: Vec3[], cols: number[][]) =>
  loft(o, a, b, cols, cols[2], cols[2]);

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

/** The engines' nozzles: right of the centre, above it, ahead of it (the back of each nacelle). */
export const NOZZLES: Vec3[] = [
  [-1, 0.05, -7.1],
  [1, 0.05, -7.1],
];

/** The body in its own frame: what keeps its colours, and what takes the team's, white. */
const build = (): [number[], number[]] => {
  const [o, t]: number[][] = [[], []];
  // The hull: white on top and the shoulders, grey under the chines, dark on the keel.
  RINGS.slice(1).forEach((b, k) =>
    loft(o, RINGS[k], b, [WHITE, WHITE, GREY, DARK, GREY, WHITE], k ? undefined : DARK),
  );
  // The canopy: a glass bubble over the cockpit, half sunk in the hull's top.
  const glass = o.length;
  place(
    o,
    dress(
      smooth(
        [
          [0, 0],
          [0.75, 0.5],
          [1, 1.6],
          [0.8, 2.8],
          [0, 3.7],
        ],
        10,
      ),
      [1, 1, 1],
    ),
    P(0, 0.8, COCKPIT[2] - 2),
    SELF,
    [0, 0, 0],
    [0.62, 0.55, 1],
    GLASS,
  );
  for (let i = glass; i < o.length; i += STRIDE) {
    o[i + 8] = SHINE;
  }
  for (const s of [-1, 1]) {
    // A delta wing from the hull's side, swept back, thin, a little drooped.
    slab(
      o,
      [
        P(s * 1.3, -0.15, 1.6),
        P(s * 1.3, -0.15, -4.6),
        P(s * 1.3, -0.45, -4.6),
        P(s * 1.3, -0.45, 1.6),
      ],
      [
        P(s * 6.4, -0.38, -3.2),
        P(s * 6.4, -0.38, -5),
        P(s * 6.4, -0.48, -5),
        P(s * 6.4, -0.48, -3.2),
      ],
      [GREY, DARK, GREY, WHITE],
    );
    // The team's stripe along the wing's top, near its tip.
    panel(
      t,
      [
        P(s * 4.4, -0.27, -1.8),
        P(s * 5.6, -0.33, -2.7),
        P(s * 5.6, -0.33, -3.6),
        P(s * 4.4, -0.27, -3.6),
      ],
      [1, 1, 1],
      [0, 1, 0],
    );
    // A fin over each engine, canted out, in the team's colour.
    slab(
      t,
      [
        P(s * 0.95, 0.85, -3.4),
        P(s * 0.95, 0.85, -6.4),
        P(s * 0.85, 0.85, -6.4),
        P(s * 0.85, 0.85, -3.4),
      ],
      [
        P(s * 1.75, 2.7, -5.5),
        P(s * 1.75, 2.7, -6.9),
        P(s * 1.65, 2.7, -6.9),
        P(s * 1.65, 2.7, -5.5),
      ],
      [[1, 1, 1]],
    );
    // An engine's nacelle along the hull's flank, a dark nozzle at its back.
    place(
      o,
      dress(
        smooth(
          [
            [0.42, 0],
            [0.6, 0.4],
            [0.62, 3],
            [0.4, 4.2],
          ],
          10,
        ),
        [0.3, 0.31, 0.34],
      ),
      P(s * 1, 0.05, -7.1),
      SELF,
      [0, 0, 0],
      1,
    );
    panel(
      o,
      [0, 1, 2, 3].map(k =>
        P(s * 1 + 0.36 * Math.cos(k * 1.571), 0.05 + 0.36 * Math.sin(k * 1.571), -7.08),
      ),
      DARK,
      [0, 0, 1],
    );
    // A laser cannon at the wing's root: a barrel and its housing.
    const [gx, gy, ga] = SHIP_GUNS[+(s > 0)];
    rod(o, TUBE, P(gx, gy, -1.4), P(gx, gy, ga + 0.6), 0.1, GUNMETAL);
    rod(o, TUBE, P(gx, gy, -1.4), P(gx, gy, 0.4), 0.22, GREY);
    // The missiles' rail under the wing.
    const [px, py] = PODS[+(s > 0)];
    rod(o, LINK, P(px, py + 0.18, -1.6), P(px, py + 0.18, 1.2), 0.06, DARK);
    // A skid with two struts: the ship rests on it.
    rod(
      o,
      TUBE,
      P(s * 1.15, -SHIP.DROP + 0.08, -3.6),
      P(s * 1.15, -SHIP.DROP + 0.08, 3.4),
      0.08,
      GREY,
    );
    for (const a of [-2.6, 2.2]) {
      rod(o, LINK, P(s * 0.75, -0.65, a), P(s * 1.15, -SHIP.DROP + 0.1, a), 0.06, DARK);
    }
  }
  // The team's stripe over the nose.
  panel(
    t,
    [P(-0.25, 0.71, 4), P(0.25, 0.71, 4), P(0.1, 0.32, 5.3), P(-0.1, 0.32, 5.3)],
    [1, 1, 1],
    [0, 1, 0],
  );
  return [o, t];
};

let kit: [number[], number[]] | undefined;

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

/**
 * Appends the ship as the state has it, unless it is gone (`wreck`): the hull pitched and banked,
 * the stripes and fins in `rgb` (the team's colour, 0 to 1), the missiles it has left under the
 * wings, the flames of its engines and its navigation lights. `t` is the time in seconds, for the
 * lights' blink.
 */
export const craft = (out: number[], r: Rover, rgb: number[], t: number): void => {
  if (r.wreck) {
    return;
  }
  kit ??= build();
  const [to, axes] = frame(r);
  const at: Vec3 = [r.x, r.y, r.z];
  const O: Vec3 = [0, 0, 0];
  place(out, kit[0], at, axes, O, 1);
  place(out, kit[1], at, axes, O, 1, rgb);
  // The missiles left, inner ones first: white bodies with a red tip.
  for (let k = 0; k < (r.nades ?? 0); k++) {
    const [px, py] = PODS[k % 2];
    const x = px + (k < 2 ? 0 : Math.sign(px) * 0.55);
    rod(out, TUBE, to([x, py, -1.3]), to([x, py, 0.8]), 0.13, WHITE);
    rod(out, LINK, to([x, py, 0.8]), to([x, py, 1.2]), 0.09, [0.85, 0.15, 0.1]);
  }
  // The flames: a glowing cone back from each nozzle, longer and brighter as it burns.
  const k = burn(r);
  if (k > 0) {
    const L = 0.6 + 2.8 * k;
    for (const [x, y, a] of NOZZLES) {
      const from = out.length;
      place(out, CONE, to([x, y, a - L]), axes, O, [0.4, 0.4, L], FLAME);
      place(out, CONE, to([x, y, a - 0.55 * L]), axes, O, [0.22, 0.22, 0.55 * L], CORE);
      glow(out, from, 1 + 2 * k);
    }
  }
  // Red to port, green to starboard, a white strobe on the tail.
  const lights: [number[], number[], number][] = [
    [[-6.4, -0.43, -4.1], [1, 0.1, 0.05], 2],
    [[6.4, -0.43, -4.1], [0.1, 1, 0.3], 2],
    [[0, 0.62, -6.7], [1, 1, 1], (t * 1.4) % 1 < 0.12 ? 3 : 0],
  ];
  for (const [p, c, g] of lights) {
    if (g) {
      const from = out.length;
      place(out, BEAD, to(p), axes, O, 1, c);
      glow(out, from, g);
    }
  }
};
