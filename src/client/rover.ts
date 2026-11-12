// The moon's rover, drawn (the simulation is shared/rover.ts): an open two-seat buggy of its own
// design. White panels and gold foil on a tube frame, a low wedge of a nose under a shock hoop, a
// roll hoop behind the seats with a dish on its corner and a whip at the tail, and four wire-mesh
// wheels with zigzag treads far out at the corners, each on a wishbone and a long coil-over, under
// a fender in the team's colour. A pure function of the rover's state and the world: no state, no
// DOM. The rigid parts are built once per level of detail in the body's frame (x right, y up, -z
// the nose, the origin at the body's centre) and placed each frame; the wishbones and the dampers
// are stretched between their ends.
import { TAU, forward } from '../shared/physics';
import { GUNS, ROVER, seat, wheels } from '../shared/rover';
import type { PlayerState, Rover } from '../shared/types';
import type { World } from '../shared/world';
import { GLOW, glow, tri } from './flag';
import {
  SHINE,
  STRIDE,
  add,
  aim,
  basis,
  dot,
  dress,
  mix,
  place,
  segment,
  smooth,
  sub,
} from './mesh';
import type { Vec3 } from './mesh';
import { char, pose } from './wreck';

const { A, B, WR, L0 } = ROVER;
/** The wheels, front left, front right, rear left, rear right: metres along the nose and to the right. */
const AT = [
  [A, -B],
  [A, B],
  [-A, -B],
  [-A, B],
];

const WHITE = [0.74, 0.75, 0.78];
const ALU = [0.5, 0.52, 0.56];
const STEEL = [0.24, 0.25, 0.28];
const DARK = [0.09, 0.095, 0.11];
/** Foil: the fourth number is the layer, polished. */
const GOLD = [0.9, 0.62, 0.17, SHINE];
const MESH = [0.4, 0.41, 0.44];
const LAMP = [1, 0.95, 0.8];
const TAIL = [1, 0.1, 0.06];
const SCREEN = [0.3, 0.8, 1];

/** The carcass of a tyre and the top of its treads, either side of WR; half its width. */
const CARCASS = WR - 0.025;
const TREAD = WR + 0.025;
const HALF = 0.15;
/** The fender's radius, over the treads. */
const FENDER = WR + 0.1;
/** Where the wishbones and the damper hold the hub carrier, inboard of the wheel's middle; the damper's top; its body's length. */
const CARRIER = B - 0.2;
const TOWER: [number, number] = [0.46, 0.42];
const DAMPER = 0.42;
/** The headlights' lenses and the steering yoke's hub: right, up, ahead. */
const LENS: Vec3 = [0.5, -0.2, 2.1];
const YOKE: Vec3 = [-0.45, 0.3, 0.6];
/** The yoke turns this many times the front wheels' angle. */
const GEAR = 2.5;

/** A point of the body's frame: metres right, up and ahead of the centre. */
export const P = (x: number, y: number, a: number): Vec3 => [x, y, -a];

/** A flat polygon of three or four corners facing `to`; a fourth number of the colour is its layer. */
export const panel = (o: number[], [a, b, c, d]: Vec3[], rgb: number[], to: Vec3) => {
  const [u, v] = [sub(b, a), sub(c, a)];
  const back =
    dot([u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], to) < 0;
  const from = o.length;
  tri(o, a, back ? c : b, back ? b : c, rgb);
  if (d) {
    tri(o, a, back ? d : c, back ? c : d, rgb);
  }
  for (let i = from + 8; rgb[3] && i < o.length; i += STRIDE) {
    o[i] = rgb[3];
  }
};

/** A skin between two rings of as many corners, each side (in `cols`, in the rings' order) facing away from the middle, and a cap on either ring. */
export const loft = (
  o: number[],
  a: Vec3[],
  b: Vec3[],
  cols: number[][],
  capA?: number[],
  capB?: number[],
) => {
  const all = [...a, ...b];
  const mid = all.reduce(add).map(v => v / all.length) as Vec3;
  const face = (p: Vec3[], rgb: number[]) => panel(o, p, rgb, sub(mix(p[0], p[2], 0.5), mid));
  a.forEach((p, i) => {
    const j = (i + 1) % a.length;
    face([p, a[j], b[j], b[i]], cols[i % cols.length]);
  });
  if (capA) {
    face(a, capA);
  }
  if (capB) {
    face(b, capB);
  }
};

/** A section across the body `a` ahead: its top (half width, height) and its bottom, as top left, top right, bottom right, bottom left. */
const section = (a: number, wt: number, yt: number, wb: number, yb: number): Vec3[] => [
  P(-wt, yt, a),
  P(wt, yt, a),
  P(wb, yb, a),
  P(-wb, yb, a),
];

/** A unit tube along -z, open at both ends, white: stretched between two points by segment(). */
const pipe = (sides: number) =>
  dress(
    smooth(
      [
        [1, 0],
        [1, 1],
      ],
      sides,
    ),
    [1, 1, 1],
  );
/** A thin tube has three sides, a thick one four near by. */
export const LINK = pipe(3);
export const TUBE = pipe(4);

/** A tube from a to b, r thick. */
export const rod = (o: number[], tube: number[], a: Vec3, b: Vec3, r: number, rgb: number[]) => {
  const d = sub(b, a);
  segment(o, tube, a, b, Math.abs(d[1]) > Math.abs(d[0]) ? [1, 0, 0] : [0, 1, 0], 1, r, rgb);
};

/**
 * A wheel about the x axis, its outer face toward +x: the wire-mesh tyre, a dished hub with a gold
 * cap, and near by a zigzag of raised treads, one a facet.
 */
const wheel = (level: number): number[] => {
  const sides = [6, 8, 12][level];
  const v = [
    ...dress(
      smooth(
        level
          ? [
              [0.3, -HALF + 0.02],
              [CARCASS, -HALF],
              [CARCASS, HALF],
              [0.3, HALF - 0.02],
            ]
          : [
              [CARCASS, -HALF],
              [CARCASS, HALF],
            ],
        sides,
      ),
      MESH,
    ),
    ...dress(
      smooth(
        level
          ? [
              [0.33, HALF - 0.022],
              [0.1, 0.06],
            ]
          : [
              [CARCASS, HALF],
              [0, 0.1],
            ],
        6,
      ),
      level ? ALU : STEEL,
    ),
    ...(level > 1
      ? [
          ...dress(
            smooth(
              [
                [0.1, 0.06],
                [0, 0.13],
              ],
              6,
            ),
            GOLD,
          ),
          ...dress(
            smooth(
              [
                [0, -0.07],
                [0.33, 0.022 - HALF],
              ],
              6,
            ),
            STEEL,
          ),
        ]
      : []),
  ];
  for (let i = 0; i < v.length; i += STRIDE) {
    const n = i / STRIDE / 6;
    // The sidewalls are dark, and every other sector of the hub: its spokes.
    if (level && (n < sides || (n >= 2 * sides && n < 3 * sides + 6 && (n < 3 * sides || n & 1)))) {
      [v[i + 6], v[i + 7], v[i + 9]] = STEEL;
    }
    // smooth() revolves about -z: turned a quarter, its length runs along +x.
    [v[i], v[i + 2], v[i + 3], v[i + 5]] = [-v[i + 2], v[i], -v[i + 5], v[i + 3]];
  }
  if (level > 1) {
    const at = (l: number, t: number, r: number): Vec3 => [l, r * Math.cos(t), r * Math.sin(t)];
    for (let i = 0; i < sides; i++) {
      // Over the middle of a facet, slanted one way then the other.
      const t = ((i + 0.5) * TAU) / sides;
      const k = i % 2 ? 0.09 : -0.09;
      const [p, q] = [at(-HALF - 0.01, t - k, TREAD), at(HALF + 0.01, t + k, TREAD)];
      for (const e of [-0.12, 0.12]) {
        panel(
          v,
          [
            p,
            q,
            at(HALF + 0.01, t + k + e, CARCASS - 0.03),
            at(-HALF - 0.01, t - k + e, CARCASS - 0.03),
          ],
          DARK,
          at(0, t + e, 1),
        );
      }
    }
  }
  return v;
};

/** A fender over a wheel about the x axis, white: an arc of `n` plates over the top. */
const fender = (n: number): number[] => {
  const v: number[] = [];
  const span = n > 1 ? 0.9 : 0.6;
  for (let i = 0; i < n; i++) {
    const [p, q] = [i, i + 1].map(k => span * ((2 * k) / n - 1));
    const at = (l: number, t: number, r = FENDER): Vec3 => [l, r * Math.cos(t), -r * Math.sin(t)];
    const [l0, l1] = [-HALF - 0.01, HALF + 0.05];
    panel(v, [at(l0, p), at(l1, p), at(l1, q), at(l0, q)], [1, 1, 1], [0, 1, 0]);
    // A lip down its outer edge, near by.
    if (n > 2) {
      panel(
        v,
        [at(l1, p), at(l1, q), at(l1, q, FENDER - 0.09), at(l1, p, FENDER - 0.09)],
        [1, 1, 1],
        [1, 0, 0],
      );
    }
  }
  return v;
};

/**
 * The steering yoke, its hub at the origin and its column running on along -z: a bar with a grip
 * at each end.
 */
const yoke = (): number[] => {
  const v: number[] = [];
  rod(v, LINK, [0, 0, 0], [0, 0, -0.32], 0.022, STEEL);
  rod(v, LINK, [-0.17, 0, 0], [0.17, 0, 0], 0.02, STEEL);
  for (const x of [-0.17, 0.17]) {
    rod(v, LINK, [x, -0.02, 0], [x, 0.1, 0.03], 0.026, DARK);
  }
  return v;
};

/** The body in its own frame at a level of detail: what keeps its colours, and what takes the team's, white. */
const body = (level: number): [number[], number[]] => {
  const [o, t]: number[][] = [[], []];
  const near = level > 1;
  const bar = (a: Vec3, b: Vec3, r = 0.04, rgb = ALU) =>
    rod(o, near && r > 0.035 ? TUBE : LINK, a, b, r, rgb);
  const lit = (rgb: number[], k: number, draw: () => void, to = o) => {
    const from = to.length;
    draw();
    for (let i = from; i < to.length; i += STRIDE) {
      [to[i + 6], to[i + 7], to[i + 9]] = rgb;
    }
    glow(to, from, k);
  };

  // The nose: a wedge from the dash down to the bumper, white on top, foil on its flanks.
  const dash = section(0.9, 0.56, 0.28, 0.56, -0.45);
  loft(
    o,
    dash,
    section(2, 0.3, -0.14, 0.24, -0.32),
    [WHITE, GOLD, DARK, GOLD],
    near ? DARK : undefined,
    DARK,
  );
  // The team's stripe down the bonnet.
  panel(
    t,
    [P(-0.14, 0.29, 0.93), P(0.14, 0.29, 0.93), P(0.1, -0.13, 1.98), P(-0.1, -0.13, 1.98)],
    [1, 1, 1],
    [0, 1, 0],
  );

  // The tub: a floor, a low sill each side rising to the dash, the bulkhead behind the seats.
  panel(
    o,
    [P(-0.72, -0.44, -0.55), P(0.72, -0.44, -0.55), P(0.72, -0.44, 0.6), P(-0.72, -0.44, 0.6)],
    STEEL,
    [0, 1, 0],
  );
  if (near) {
    panel(
      o,
      [P(-0.72, -0.44, 0.6), P(0.72, -0.44, 0.6), P(0.56, -0.44, 0.9), P(-0.56, -0.44, 0.9)],
      STEEL,
      [0, 1, 0],
    );
  }
  for (const s of [-1, 1]) {
    panel(
      o,
      [
        P(s * 0.7, -0.47, -0.55),
        P(s * 0.7, -0.47, 0.6),
        P(s * 0.76, -0.02, 0.6),
        P(s * 0.76, -0.02, -0.55),
      ],
      WHITE,
      [s, 0, 0],
    );
    if (level) {
      panel(
        o,
        [
          P(s * 0.7, -0.47, 0.6),
          P(s * 0.56, -0.45, 0.9),
          P(s * 0.56, 0.28, 0.9),
          P(s * 0.76, -0.02, 0.6),
        ],
        WHITE,
        [s, 0, 0],
      );
    }
  }
  if (level) {
    panel(
      o,
      [P(-0.72, -0.44, -0.55), P(0.72, -0.44, -0.55), P(0.6, 0.32, -0.55), P(-0.6, 0.32, -0.55)],
      WHITE,
      [0, 0, -1],
    );
  }

  // The power unit behind: a foil box under a white radiator, the tail lamps on its end.
  loft(
    o,
    section(-0.55, 0.55, 0.2, 0.5, -0.45),
    section(-1.9, 0.42, 0.08, 0.36, -0.3),
    [WHITE, GOLD, DARK, GOLD],
    undefined,
    DARK,
  );
  for (const s of level ? [-1, 1] : [0]) {
    const [x0, x1] = level ? [s * 0.18, s * 0.38] : [-0.38, 0.38];
    lit(TAIL, GLOW, () =>
      panel(
        o,
        [P(x0, -0.04, -1.905), P(x1, -0.04, -1.905), P(x1, 0.04, -1.905), P(x0, 0.04, -1.905)],
        [1, 1, 1],
        [0, 0, 1],
      ),
    );
  }

  // The roll hoop behind the seats, braced back to the rear shock hoop.
  const hoop = [-1, 1].map(s => [P(s * 0.74, -0.02, -0.5), P(s * 0.52, 1.1, -0.62)]);
  hoop.forEach(([foot, top]) => bar(foot, top, 0.05));
  bar(hoop[0][1], hoop[1][1], 0.05);
  const rear = [-1, 1].map(s => P(s * TOWER[0], TOWER[1], -A));
  const front = [-1, 1].map(s => P(s * TOWER[0], TOWER[1], A));
  if (level) {
    hoop.forEach(([, top], i) => bar(top, rear[i]));
  }

  // The headlights, on the ends of the bumper.
  for (const s of [-1, 1]) {
    const at = P(s * LENS[0], LENS[1], LENS[2]);
    if (near) {
      // A housing, and the lens: its last ring.
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
          [1, 1, 1],
          [0, 0, -1],
        ),
      );
    }
  }
  if (!level) {
    return [o, t];
  }

  // The seats, the driver's on the left: a cushion and a reclined back in a white shell.
  for (const x of [-0.45, 0.45]) {
    const pad = (a: number, y: number, back: number) => [
      P(x - 0.21, y, a),
      P(x + 0.21, y, a),
      P(x + 0.21, y, a - back),
      P(x - 0.21, y, a - back),
    ];
    panel(o, pad(0.3, -0.22, 0.52), DARK, [0, 1, 0]);
    const [low, high] = [pad(-0.2, -0.22, 0.08), pad(-0.34, 0.62, 0.07)];
    if (near) {
      panel(
        o,
        [...pad(0.3, -0.44, 0).slice(0, 2), ...pad(0.3, -0.22, 0).slice(2)],
        DARK,
        [0, 0, -1],
      );
      loft(o, low, high, [DARK, WHITE, WHITE, WHITE], undefined, WHITE);
    } else {
      panel(o, [low[0], low[1], high[1], high[0]], DARK, [0, 0, -1]);
    }
  }

  // The dish on the hoop's right corner, looking up and back, and the whip at the tail with the team's light.
  const mast = P(0.56, 1.44, -0.66);
  const sky: Vec3 = [0.36, 0.84, 0.4];
  bar(hoop[1][1], mast, 0.02);
  const from = o.length;
  place(
    o,
    dress(
      smooth(
        [
          [0, 0],
          [0.3, 0.1],
        ],
        8,
      ),
      WHITE,
    ),
    mast,
    aim(sky.map(v => v / Math.hypot(...sky)) as Vec3, [1, 0, 0]),
    [0, 0, 0],
    1,
  );
  // Lit on its hollow side.
  for (let i = from + 3; i < o.length; i += STRIDE) {
    [o[i], o[i + 1], o[i + 2]] = [-o[i], -o[i + 1], -o[i + 2]];
  }
  if (!near) {
    return [o, t];
  }
  const tip = P(-0.44, 1.7, -2.12);
  bar(P(-0.4, 0.1, -1.9), tip, 0.012, STEEL);
  lit(
    [1, 1, 1],
    GLOW,
    () =>
      place(
        t,
        dress(
          smooth(
            [
              [0, -1],
              [1, 0],
              [0, 1],
            ],
            4,
          ),
          [1, 1, 1],
        ),
        tip,
        aim([0, 1, 0], [1, 0, 0]),
        [0, 0, 0],
        0.045,
      ),
    t,
  );

  // The frame: a shock hoop over each axle, the nose's cage down to the bumper, the sills, the tail.
  for (const [towers, a] of [
    [front, A],
    [rear, -A],
  ] as [Vec3[], number][]) {
    bar(towers[0], towers[1]);
    towers.forEach((top, i) => bar(P((i * 2 - 1) * 0.4, a > 0 ? 0.02 : 0.1, a), top));
  }
  const bumper = [-1, 1].map(s => P(s * 0.3, -0.24, 2.04));
  bar(P(-LENS[0], -0.3, 2.04), P(LENS[0], -0.3, 2.04), 0.045);
  for (const i of [0, 1]) {
    const s = i * 2 - 1;
    const sill = P(s * 0.75, -0.02, 0.6);
    const cowl = P(s * 0.56, 0.28, 0.9);
    bar(cowl, front[i], 0.03);
    bar(front[i], bumper[i], 0.03);
    bar(hoop[i][0], sill, 0.03);
    bar(sill, cowl, 0.03);
    bar(rear[i], P(s * 0.4, 0.1, -1.9), 0.03);
  }
  // A laser along each side, on its pod: a dark barrel on two clamps, its mouth glowing green (GUNS, shared/rover.ts).
  for (const [x, y, a] of GUNS) {
    bar(P(x, y, a - 1.1), P(x, y, a - 0.06), 0.065, [0.16, 0.17, 0.2]);
    bar(P(x, y, a - 1.2), P(x, y, a - 1.1), 0.085, ALU);
    for (const at of [a - 0.85, a - 0.35]) {
      bar(P(x * 0.8, y - 0.14, at), P(x, y, at), 0.03);
    }
    lit([0.2, 1, 0.35], GLOW, () => bar(P(x, y, a - 0.06), P(x, y, a), 0.05, [0.2, 1, 0.35]));
  }
  // A foil pod along each sill, between the wheels.
  for (const s of [-1, 1]) {
    const cut = (a: number) => [P(s * 0.74, -0.2, a), P(s * 0.93, -0.24, a), P(s * 0.9, -0.48, a)];
    const [p, q] = [cut(-0.5), cut(0.42)];
    panel(o, [p[0], p[1], q[1], q[0]], GOLD, [0, 1, 0]);
    panel(o, [p[1], p[2], q[2], q[1]], GOLD, [s, 0, 0]);
    panel(o, [...q, P(s * 0.7, -0.48, 0.42)], GOLD, [0, 0, -1]);
  }
  // On the deck: a crate under a lid in the team's colour, and the radiator's slats.
  const crate = (y: number) => [
    P(-0.34, y, -0.62),
    P(0.34, y, -0.62),
    P(0.34, y, -1.08),
    P(-0.34, y, -1.08),
  ];
  loft(o, crate(0.15), crate(0.44), [WHITE]);
  panel(t, crate(0.44), [1, 1, 1], [0, 1, 0]);
  for (const a of [-1.42, -1.6]) {
    const y = 0.21 + (a + 0.55) * 0.089;
    panel(
      o,
      [P(-0.34, y, a), P(0.34, y, a), P(0.33, y - 0.008, a - 0.09), P(-0.33, y - 0.008, a - 0.09)],
      DARK,
      [0, 1, 0],
    );
  }
  // The instruments, lit, in front of the driver.
  lit(SCREEN, 1.5, () =>
    panel(
      o,
      [P(-0.6, 0.08, 0.895), P(-0.3, 0.08, 0.895), P(-0.3, 0.22, 0.895), P(-0.6, 0.22, 0.895)],
      [1, 1, 1],
      [0, 0, 1],
    ),
  );
  return [o, t];
};

interface Kit {
  level: number;
  body: number[];
  team: number[];
  wheel: number[];
  fender: number[];
  yoke: number[];
  coil: number[];
}

const kits = new Map<number, Kit>();

const kit = (lod: number): Kit => {
  const level = Math.max(0, Math.min(lod, 2)) | 0;
  let k = kits.get(level);
  if (!k) {
    // The spring: bands of the team's colour and dark, which close up as it is squeezed.
    const coil = dress(
      smooth(
        [0, 1, 2, 3, 4].map(i => [1, i / 4]),
        3,
      ),
      [1, 1, 1],
    );
    for (let i = 0; i < coil.length; i += STRIDE) {
      if (Math.floor(i / (18 * STRIDE)) % 2) {
        [coil[i + 6], coil[i + 7], coil[i + 9]] = [0.15, 0.15, 0.15];
      }
    }
    const [b, team] = body(level);
    k = {
      level,
      body: b,
      team,
      wheel: wheel(level),
      fender: fender(level + 1),
      yoke: level > 1 ? yoke() : [],
      coil,
    };
    kits.set(level, k);
  }
  return k;
};

/**
 * How far each wheel's spring is squeezed, metres in 0..CMAX, in AT's order: the simulation's own
 * (wheels() in shared/rover.ts), from the state and the world alone. 0 is a wheel hanging in the air.
 */
export const springs = (r: Rover, w: World): number[] => wheels(r, w).map(k => k[3]);

/**
 * The seats, driver then rider, as the simulation has them (seat()): metres right of the body's
 * centre, above it (the feet of who sits) and ahead of it.
 */
export const SEATS: Vec3[] = ([0, 1] as const).map(s => {
  const p = {} as PlayerState;
  seat(p, { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0 } as Rover, s);
  return [p.x, p.y, -p.z];
});

/**
 * The middles of the yoke's two grips, left then right, with the front wheels turned by `steer`:
 * metres right of, above and ahead of the driver's seat point, in the body's frame.
 */
export const grips = (steer: number): Vec3[] => {
  // The column runs down and ahead; the bar turns about it.
  const l = Math.hypot(0.14, 0.28);
  const [fy, fa] = [-0.14 / l, 0.28 / l];
  const [c, s] = [Math.cos(steer * GEAR), Math.sin(steer * GEAR)];
  return [-1, 1].map(k => {
    // Along the bar (x right, then up across the column), to the middle of a grip.
    const [x, u] = [k * 0.17 * c + 0.04 * s, 0.04 * c - k * 0.17 * s];
    return [
      YOKE[0] + x - SEATS[0][0],
      YOKE[1] + u * fa - SEATS[0][1],
      YOKE[2] - u * fy - 0.013 - SEATS[0][2],
    ] as Vec3;
  });
};

/** Radians a wreck's wheels lean in by at the top. */
const SPLAY = 0.3;
/** Metres a rover moves in a frame, at the least, when it is put back on its spawn: its wheels do not turn for it. */
const PUT_BACK = 5;

/**
 * Radians the wheels roll as the rover goes from (x, z) to where it is now: the distance along its
 * nose over the wheel's radius, negative in reverse. Sliding sideways turns nothing.
 */
export const rolled = (x: number, z: number, r: Rover): number => {
  const [fx, fz] = forward(r.yaw);
  const [dx, dz] = [r.x - x, r.z - z];
  return dx * dx + dz * dz > PUT_BACK * PUT_BACK ? 0 : (dx * fx + dz * fz) / WR;
};

/** The rover's frame in the world: where a point right, up and ahead of its centre is, and its axes. */
const frame = (r: Rover): [(x: number, y: number, a: number) => Vec3, Vec3[]] => {
  const axes = basis(r.yaw, r.pitch, r.roll);
  const [R, U, F] = axes;
  return [
    (x, y, a) => [
      r.x + R[0] * x + U[0] * y + F[0] * a,
      r.y + R[1] * x + U[1] * y + F[1] * a,
      r.z + R[2] * x + U[2] * y + F[2] * a,
    ],
    axes,
  ];
};

/** The middle of each headlight's lens in the world, left then right: they shine along basis(yaw, pitch, roll)[2]. */
export const headlights = (r: Rover): Vec3[] => {
  const [to] = frame(r);
  return [-1, 1].map(s => to(s * LENS[0], LENS[1], LENS[2]));
};

/** Where each tyre meets the ground, in AT's order: under its hub. A wheel in the air (springs() gives 0) has none: this is then the bottom of its tyre. */
export const contacts = (r: Rover, w: World): Vec3[] => {
  const [to] = frame(r);
  return springs(r, w).map((c, i) => {
    const [x, y, z] = to(AT[i][1], c - L0, AT[i][0]);
    return [x, y - WR, z];
  });
};

/**
 * Appends the rover at level of detail `lod` (0 far, 1 mid, 2 and up near: the caller picks the
 * distances) as the state has it: the body pitched and rolled, each wheel on its spring over the
 * world's floor, turned by `spin` radians (the distance driven over WR) and the front pair by
 * `steer`, the wishbones and the coil-overs following, the yoke turning with the wheels. `rgb` is
 * the team's colour (0 to 1): the fenders, the bonnet's stripe, the springs and the whip's light.
 * Its damage shows (wreck.ts, `n` its index among the map's vehicles): scorched where it arcs; a
 * wreck sagged on splayed wheels, charred, falling apart at the end.
 */
export const rover = (
  out: number[],
  state: Rover,
  w: World,
  spin: number,
  rgb: number[],
  lod: number,
  n = 0,
): void => {
  const k = kit(lod);
  const start = out.length;
  const r = pose(state);
  // A wreck's wheels lean in at the top.
  const [cc, sc] = r === state ? [1, 0] : [Math.cos(SPLAY), Math.sin(SPLAY)];
  const [to, axes] = frame(r);
  const [R, U, F] = axes;
  const at: Vec3 = [r.x, r.y, r.z];
  const O: Vec3 = [0, 0, 0];
  place(out, k.body, at, axes, O, 1);
  place(out, k.team, at, axes, O, 1, rgb);
  if (k.yoke.length) {
    const [x, y, f] = aim(
      to(0, -0.14, 0.28).map((v, i) => (v - at[i]) / Math.hypot(0.14, 0.28)) as Vec3,
      R,
    );
    const [c, s] = [Math.cos(r.steer * GEAR), Math.sin(r.steer * GEAR)];
    place(
      out,
      k.yoke,
      to(...YOKE),
      [x.map((v, i) => v * c - y[i] * s) as Vec3, y.map((v, i) => v * c + x[i] * s) as Vec3, f],
      O,
      1,
    );
  }
  const [cs, ss] = [Math.cos(spin), Math.sin(spin)];
  springs(r, w).forEach((c, i) => {
    const [a, b] = AT[i];
    const s = Math.sign(b);
    const h = c - L0;
    const hub = to(b, h, a);
    // The front wheels turn about the body's up, then every wheel rolls about its own axle.
    const [ct, st] = a > 0 ? [Math.cos(r.steer) * s, Math.sin(r.steer) * s] : [s, 0];
    const flat = R.map((v, j) => v * ct - F[j] * st) as Vec3;
    const ahead = F.map((v, j) => v * ct + R[j] * st) as Vec3;
    const right = flat.map((v, j) => v * cc + U[j] * sc) as Vec3;
    const up = U.map((v, j) => v * cc - flat[j] * sc) as Vec3;
    place(
      out,
      k.wheel,
      hub,
      [
        right,
        up.map((v, j) => v * cs + ahead[j] * ss * s) as Vec3,
        ahead.map((v, j) => v * cs - up[j] * ss * s) as Vec3,
      ],
      O,
      1,
    );
    place(out, k.fender, hub, [flat, U, ahead], O, 1, rgb);
    if (!k.level) {
      return;
    }
    const foot = to(s * (CARRIER - 0.08), h - 0.11, a);
    const top = to(s * TOWER[0], TOWER[1], a);
    const low = to(s * CARRIER, h - 0.13, a);
    if (k.level < 2) {
      segment(out, LINK, to(s * 0.36, -0.42, a), low, U, 1, 0.04, STEEL);
      segment(out, LINK, top, foot, F, 1, 0.06, STEEL);
      return;
    }
    for (const e of [-0.26, 0.26]) {
      segment(out, LINK, to(s * 0.36, -0.42, a + e), low, U, 1, 0.03, STEEL);
    }
    const high = to(s * CARRIER, h + 0.13, a);
    segment(out, LINK, to(s * 0.4, -0.12, a), high, U, 1, 0.025, STEEL);
    // The coil-over: a body of a fixed length from the tower, and the spring from its middle to the wishbone.
    const d = sub(foot, top);
    const l = Math.hypot(...d);
    const along = (m: number) => add(top, d.map(v => (v * m) / l) as Vec3);
    segment(out, TUBE, top, along(DAMPER), F, 1, 0.05, STEEL);
    segment(out, k.coil, along(DAMPER - 0.14), foot, F, 1, 0.075, rgb);
  });
  char(out, start, state, n);
};
