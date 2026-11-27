// The rover's body: the nose, the tub, the power unit, the hoops, the seats, the dish and the guns.
import { GUNS } from '../../shared/rover';
import { GLOW, glow } from '../flag';
import { STRIDE, add, aim, dress, place, smooth } from '../mesh';
import type { Vec3 } from '../mesh';
import { A, ALU, DARK, GOLD, LAMP, LENS, SCREEN, STEEL, TAIL, TOWER, WHITE } from './constants';
import { LINK, P, TUBE, loft, panel, rod, section } from './mesh';

/** The body in its own frame at a level of detail: what keeps its colours, and what takes the team's, white. */
export const body = (level: number): [number[], number[]] => {
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
