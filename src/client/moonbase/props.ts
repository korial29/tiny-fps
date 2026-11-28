// The moon base's furniture and fittings (docs/MOON.md), red's half: the kit's pieces and the hall's dressing.
import { HEAD, KIND, KIT, MODULES, MOUTHS, TUBES } from '../../shared/moonbase';
import { segment, solid } from '../mesh';
import { box, face, lit } from '../brick';
import type { Vec3 } from '../mesh';
import type { Out } from '../verts';
import {
  AMBER,
  BLUISH,
  CX,
  CYAN,
  CZ,
  FRAME,
  GREEN,
  GREY,
  INK,
  IRON,
  LAMP,
  LINTELS,
  MAUVE,
  RED,
  SNOW,
} from './constants';
import { inside, panel } from './kit';
import { bevel, ring } from './round';
import { station } from './console';
import { samples } from './samples';
import { suit } from './suit';
import { corridors } from './corridor';
import { desks } from './desk';
import { statues } from './statue';

/** What a halo fades to at its rim: about the dark face it lies on, as drawn indoors. */
const UP_Y: Vec3 = [0, 1, 0];
const DUSK = [0.035, 0.037, 0.045];
/** A lit cap's middle: its colour times k, a third of the way to white. */
const hot = (rgb: number[], k: number) => rgb.map(v => (v + (1 - v) / 3) * k);

/**
 * Draws a piece of kit, (kind, x0, z0, x1, z1, y0, y1, the way its front looks: 0 +x, 1 +z, 2 -x,
 * 3 -z), in its own frame: u along it from its start, y up from its foot, w out from its back.
 */
export const piece = (o: Out, [kind, x0, z0, x1, z1, y0, y1, f]: number[]) => {
  const k = f & 1 ? 2 : 0;
  const [lo, hi] = [
    [x0, y0, z0],
    [x1, y1, z1],
  ];
  const s = f < 2 ? 1 : -1;
  const P = (u: number, y: number, w: number): Vec3 => {
    const p: Vec3 = [0, y0 + y, 0];
    p[k] = (s > 0 ? lo[k] : hi[k]) + s * w;
    p[2 - k] = lo[2 - k] + u;
    return p;
  };
  const [L, D, H] = [hi[2 - k] - lo[2 - k], hi[k] - lo[k], y1 - y0];
  /** A box from (u, y, w) to (u, y, w). */
  const c = (a: number[], b: number[], rgb: number[]) => {
    const [p, q] = [P(a[0], a[1], a[2]), P(b[0], b[1], b[2])];
    box(
      o,
      p.map((v, i) => Math.min(v, q[i])) as Vec3,
      p.map((v, i) => Math.max(v, q[i])) as Vec3,
      rgb,
    );
  };
  /** c() with its edges bevelled `e` deep. */
  const cb = (a: number[], b: number[], rgb: number[], e = 0.025) => {
    const [p, q] = [P(a[0], a[1], a[2]), P(b[0], b[1], b[2])];
    bevel(
      o,
      p.map((v, i) => Math.min(v, q[i])) as Vec3,
      p.map((v, i) => Math.max(v, q[i])) as Vec3,
      rgb,
      e,
    );
  };
  // The face's axes: along u, up, and across so that a ring() on them faces front.
  const U: Vec3 = [0, 0, 0];
  U[2 - k] = (k ? 1 : -1) * s;
  const Y: Vec3 = [0, 1, 0];
  /**
   * A round light at (u, v) on the face at w, r its radius: a cap lit n times its colour and hotter
   * in the middle; with `halo` its glow spread on the dark face round it.
   * With `half`, a bar with round ends reaching `half` either side of (u, v) along u.
   */
  const button = (
    u: number,
    v: number,
    r: number,
    w: number,
    rgb: number[],
    n = 1.6,
    halo = true,
    sides = 8,
    half = 0,
  ) => {
    ring(
      o,
      P(u, v, w + 0.004),
      U,
      Y,
      [0, r],
      hot(rgb, n * 1.4),
      rgb.map(x => x * n),
      sides,
      half,
    );
    if (halo) {
      ring(
        o,
        P(u, v, w + 0.001),
        U,
        Y,
        [r, r * 3],
        rgb.map(x => x * 0.45),
        DUSK,
        sides,
        half,
      );
    }
  };
  /** A glowing pane facing front at w, k times its colour. */
  const g = (u0: number, v0: number, u1: number, v1: number, w: number, rgb: number[], n = 1) =>
    lit(o, n, () =>
      face(o, [P(u0, v0, w), P(u1, v0, w), P(u1, v1, w), P(u0, v1, w)], rgb, P(u0, v0, w - 1)),
    );
  /** A screen: a dark case, a lit pane and lines of text, `rgb` its light. */
  const screen = (u0: number, v0: number, u1: number, v1: number, w: number, rgb: number[]) => {
    cb([u0, v0, w - 0.06], [u1, v1, w], INK, 0.025);
    g(u0 + 0.04, v0 + 0.04, u1 - 0.04, v1 - 0.04, w + 0.005, rgb, 0.45);
    for (let l = 0; v1 - v0 > 0.3 && l < 4; l++) {
      const v = v1 - 0.12 - l * ((v1 - v0 - 0.16) / 4);
      g(
        u0 + 0.08,
        v - 0.025,
        u0 + 0.08 + (u1 - u0 - 0.16) * (0.4 + 0.15 * ((u0 * 7 + l) % 4)),
        v,
        w + 0.01,
        rgb,
        1.1,
      );
    }
  };
  if (kind == KIND.CONSOLE) {
    station(o, (x0 + x1) / 2, (z0 + z1) / 2, y0, (f * Math.PI) / 2);
    return;
  }
  inside(o, () => {
    if (kind == KIND.BENCH) {
      cb([0, H - 0.06, 0], [L, H, D], SNOW, 0.03);
      cb([0.05, 0, 0], [L - 0.05, H - 0.06, D - 0.06], GREY, 0.04);
      for (let u = 1.1; u < L - 0.5; u += 1.1) {
        c([u - 0.01, 0.1, D - 0.06], [u + 0.01, H - 0.1, D - 0.05], INK);
      }
      for (let i = 0; i < 4; i++) {
        const u = 1.4 + i * 2.75;
        c([u - 0.05, H, 0.16], [u + 0.05, H + 0.22, 0.22], INK);
        screen(u - 0.45, H + 0.2, u + 0.45, H + 0.75, 0.28, [CYAN, GREEN, AMBER, CYAN][i]);
        c([u - 0.3, H, 0.45], [u + 0.3, H + 0.025, 0.65], IRON);
        // Sample jars by the screens.
        const jar = solid(2, 1, [1, 1], [0, 0]);
        segment(
          o,
          jar,
          P(u + 0.76, H, 0.26),
          P(u + 0.76, H + 0.2, 0.26),
          [1, 0, 0],
          1,
          0.055,
          [GREEN, BLUISH, AMBER, MAUVE][i],
        );
      }
    } else if (kind == KIND.RACKS) {
      // Three cabinets of twelve units, each a dark face with a row of status lights.
      cb([0, 0, 0], [L, H, D], INK, 0.05);
      for (let n = 0; n < 3; n++) {
        const a = 0.1 + n * 1.63;
        for (let r = 0; r < 12; r++) {
          const y = 0.25 + r * 0.2;
          g(a, y, a + 1.43, y + 0.16, D + 0.01, IRON, 0.25);
          for (let d = 0; d < 5; d++) {
            const led = [GREEN, AMBER, GREEN, CYAN, RED, null][(n * 7 + r * 5 + d * 3) % 6];
            if (led) {
              button(a + 0.12 + d * 0.08, y + 0.08, 0.017, D + 0.011, led, 1.9, false, 6);
            }
          }
        }
        g(a, H - 0.4, a + 1.43, H - 0.34, D + 0.01, CYAN, 0.9);
      }
    } else if (kind == KIND.SCOPE) {
      // On its pier, aimed up at the shell; a finder alongside.
      c([0.2, 0, 0.2], [1, 0.1, 1], INK);
      cb([0.45, 0.1, 0.45], [0.75, 0.85, 0.75], SNOW, 0.04);
      button(0.6, 0.6, 0.035, 0.75, GREEN, 1.8, false);
      cb([0.35, 0.85, 0.35], [0.85, 1.05, 0.85], IRON, 0.04);
      const [a, b] = [P(0.6, 0.9, 0.2), P(1.4, 2.8, 2.1)];
      segment(o, solid(2, 1, [1, 1], [0, 0]), a, b, [1, 0, 0], 1, 0.2, SNOW);
      segment(
        o,
        solid(2, 1, [1, 1], [0, 0]),
        P(1.3, 2.56, 1.86),
        P(1.42, 2.83, 2.13),
        [1, 0, 0],
        1,
        0.24,
        INK,
      );
      segment(
        o,
        solid(2, 1, [1, 1], [0, 0]),
        P(0.86, 1.4, 0.6),
        P(1.2, 2.2, 1.4),
        [1, 0, 0],
        1,
        0.05,
        IRON,
      );
    } else if (kind == KIND.ANALYSER) {
      cb([0, 0, 0], [L, 0.9, D], SNOW, 0.04);
      cb([0, 0.9, 0], [L, H, 0.5], SNOW, 0.04);
      screen(0.12, 0.92, 0.95, 1.26, 0.56, GREEN);
      // The sample chamber: a lit window, a row of buttons, the drawers' seams.
      cb([1.1, 0.9, 0.55], [1.88, 1.18, 1.1], IRON, 0.03);
      g(1.16, 0.95, 1.82, 1.13, 1.105, MAUVE, 1.3);
      // The buttons on a dark strip, so that their glow shows round them.
      cb([0.08, 0.68, D - 0.01], [0.9, 0.86, D + 0.015], INK, 0.012);
      for (let i = 0; i < 6; i++) {
        button(0.185 + i * 0.125, 0.77, 0.025, D + 0.015, [AMBER, GREEN, CYAN][i % 3]);
      }
      for (const y of [0.3, 0.6]) {
        c([0.05, y, D], [L - 0.05, y + 0.015, D + 0.005], INK);
      }
    } else if (kind == KIND.PLANTS) {
      // Three shelves of samples (moonbase/samples.ts) in a frame.
      for (const u of [0, L / 2 - 0.03, L - 0.06]) {
        cb([u, 0, 0], [u + 0.06, H, D], IRON, 0.02);
      }
      cb([0, H - 0.04, 0], [L, H, D], SNOW, 0.015);
      const ys = [0.3, 0.9, 1.5];
      for (const y of ys) {
        cb([0, y, 0], [L, y + 0.04, D], SNOW, 0.015);
      }
      samples(o, P, L, D, ys, H - 0.04);
    } else if (kind == KIND.LOCKERS) {
      cb([0, 0, 0], [L, H, D], BLUISH, 0.04);
      for (let i = 0; i < 6; i++) {
        const u = i * 0.8;
        if (i) {
          c([u - 0.01, 0.05, D], [u + 0.01, H - 0.05, D + 0.01], INK);
        }
        for (let v = 0; v < 3; v++) {
          c([u + 0.2, 1.7 + v * 0.08, D], [u + 0.6, 1.73 + v * 0.08, D + 0.01], INK);
        }
        cb([u + 0.64, 0.95, D], [u + 0.68, 1.2, D + 0.04], GREY, 0.015);
        button(u + 0.4, 1.53, 0.025, D + 0.008, AMBER, 1.3, false, 12, 0.07);
      }
    } else if (kind == KIND.SUIT) {
      suit(o, P, button);
    } else {
      // A panel on a wall: a plate, a display in its bezel, round buttons glowing on a dark inset,
      // a bar of light under them.
      cb([0, 0, 0], [L, H, 0.05], IRON, 0.03);
      cb([0.08, 0.3, 0.03], [L * 0.6 + 0.02, H - 0.08, 0.07], INK, 0.02);
      g(0.12, 0.34, L * 0.6 - 0.02, H - 0.12, 0.071, CYAN, 0.5);
      cb([L * 0.64, 0.3, 0.03], [L - 0.08, H - 0.08, 0.07], INK, 0.02);
      for (let i = 0; i < 12; i++) {
        const [u, v] = [L * 0.64 + 0.15 + (i % 3) * 0.24, 0.42 + Math.floor(i / 3) * 0.23];
        button(u, v, 0.04, 0.07, [GREEN, AMBER, RED, CYAN][(i + Math.floor(i / 3)) % 4]);
      }
      cb([0.1, 0.09, 0.03], [L - 0.1, 0.21, 0.06], INK, 0.015);
      button(L / 2, 0.15, 0.03, 0.06, AMBER, 1.4, false, 12, L / 2 - 0.2);
    }
  });
};
/** Panels on the hall's short walls, where no window is: both sides of each alcove, the door's way in, behind the console. */
const PANELS = [
  [-1, 96.2, 242.65, 98.6, 242.7, 1, 2.3, 3],
  [-1, 96.2, 229.3, 98.6, 229.35, 1, 2.3, 1],
  [-1, 61.4, 242.65, 63.8, 242.7, 1, 2.3, 3],
  [-1, 61.4, 229.3, 63.8, 229.35, 1, 2.3, 1],
  [-1, 73.3, 252.4, 73.35, 255.4, 4.3, 5.5, 0],
  [-1, 86.65, 252.4, 86.7, 255.4, 4.3, 5.5, 2],
  [-1, 73.3, 216.6, 73.35, 219.6, 1, 2.3, 0],
  [-1, 86.65, 216.6, 86.7, 219.6, 1, 2.3, 2],
];

/**
 * The dressing of the base, red's half: the lab kit on its ghosts, panels on the walls, a sign over
 * the door, cables under the east deck, the corridors in the tubes (corridor.ts), hazard
 * stripes and a beacon over each airlock.
 */
export const dressing = (o: Out) => {
  [...KIT, ...PANELS].forEach(p => piece(o, p));
  const [, mz] = MOUTHS[0];
  const z = CZ + mz + 0.03;
  // The sign: a dark plate, a lit rim, two lines of letters.
  panel(o, 2, z, [CX - 3, 3.4, 0], [CX + 3, 4.3, 0], FRAME);
  for (const y of [3.42, 4.22]) {
    panel(o, 2, z + 0.01, [CX - 2.95, y, 0], [CX + 2.95, y + 0.05, 0], LAMP);
  }
  for (let i = 0; i < 9; i++) {
    const x = CX - 2.6 + i * 0.6;
    panel(o, 2, z + 0.01, [x, 3.9, 0], [x + 0.45, 4.1, 0], [0.9, 0.95, 1]);
    panel(o, 2, z + 0.01, [x + 0.05, 3.6, 0], [x + 0.3 + 0.1 * (i % 2), 3.7, 0], CYAN);
  }
  // Cables under the east deck, from the racks.
  for (const [x, w] of [
    [CX + 16.6, 0.3],
    [CX + 17.1, 0.15],
  ]) {
    inside(o, () => box(o, [x, 2.94, CZ - 6.7], [x + w, 3.06, CZ + 6.7], INK));
  }
  // Along each tube: the corridor's frames, panels, lights and pipes; round the hall, the desks.
  corridors(o);
  desks(o);
  statues(o);
  // Over each airlock, inside: amber and black stripes on the lintel, a red beacon above.
  for (const l of LINTELS) {
    const k = l.max[0] - l.min[0] < 1 ? 0 : 2;
    const [m] = MODULES.filter(
      ({ min, max }) =>
        min[0] <= l.min[0] && l.max[0] <= max[0] && min[2] <= l.min[2] && l.max[2] <= max[2],
    );
    const into = (m.min[k] + m.max[k]) / 2 > l.min[k] ? 1 : -1;
    const at = (into > 0 ? l.max[k] : l.min[k]) + into * 0.02;
    const [c0, c1] = [l.min[2 - k], l.max[2 - k]];
    // Only the airlocks: a door to a tube touches it.
    if (
      TUBES.some(t => [0, 2].every(a => t.min[a] <= l.max[a] + 0.01 && l.min[a] - 0.01 <= t.max[a]))
    ) {
      continue;
    }
    for (let i = 0; c0 + i * 0.3 < c1; i++) {
      const [p, q] = [
        [0, HEAD + 0.05, 0],
        [0, HEAD + 0.35, 0],
      ];
      [p[2 - k], q[2 - k]] = [c0 + i * 0.3, Math.min(c0 + i * 0.3 + 0.15, c1)];
      panel(o, k, at, p, q, AMBER);
      [p[2 - k], q[2 - k]] = [q[2 - k], Math.min(c0 + i * 0.3 + 0.3, c1)];
      panel(o, k, at, p, q, INK);
    }
    const mid = (c0 + c1) / 2;
    // The beacon: round, on a dark rim.
    const [c, a]: Vec3[] = [
      [0, 3.32, 0],
      [0, 0, 0],
    ];
    [c[k], c[2 - k], a[2 - k]] = [at, mid, (k ? 1 : -1) * into];
    ring(o, c, a, UP_Y, [0.12, 0.17], DUSK, DUSK, 14);
    c[k] += into * 0.003;
    ring(
      o,
      c,
      a,
      UP_Y,
      [0, 0.12],
      hot(RED, 2.2),
      RED.map(x => x * 1.6),
      14,
    );
  }
};
