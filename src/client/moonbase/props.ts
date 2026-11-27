// The moon base's furniture and fittings (docs/MOON.md), red's half: the kit's pieces and the hall's dressing.
import { HEAD, KIND, KIT, MODULES, MOUTHS, TUBES, WALL } from '../../shared/moonbase';
import { place, segment, solid } from '../mesh';
import { UP, box, face, lit } from '../brick';
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
  PINK,
  RED,
  SNOW,
  SOIL,
} from './constants';
import { inside, panel } from './kit';

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
  /** A glowing pane facing front at w, k times its colour. */
  const g = (u0: number, v0: number, u1: number, v1: number, w: number, rgb: number[], n = 1) =>
    lit(o, n, () =>
      face(o, [P(u0, v0, w), P(u1, v0, w), P(u1, v1, w), P(u0, v1, w)], rgb, P(u0, v0, w - 1)),
    );
  /** A screen: a dark case, a lit pane and lines of text, `rgb` its light. */
  const screen = (u0: number, v0: number, u1: number, v1: number, w: number, rgb: number[]) => {
    c([u0, v0, w - 0.06], [u1, v1, w], INK);
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
  inside(o, () => {
    if (kind == KIND.BENCH) {
      c([0, H - 0.06, 0], [L, H, D], SNOW);
      c([0.05, 0, 0], [L - 0.05, H - 0.06, D - 0.06], GREY);
      for (let u = 1.1; u < L - 0.5; u += 1.1) {
        c([u - 0.01, 0.1, D - 0.06], [u + 0.01, H - 0.1, D - 0.05], INK);
      }
      for (let i = 0; i < 4; i++) {
        const u = 1.4 + i * 2.75;
        c([u - 0.05, H, 0.16], [u + 0.05, H + 0.22, 0.22], INK);
        screen(u - 0.45, H + 0.2, u + 0.45, H + 0.75, 0.28, [CYAN, GREEN, AMBER, CYAN][i]);
        c([u - 0.3, H, 0.45], [u + 0.3, H + 0.025, 0.65], IRON);
        // Sample jars by the screens.
        c([u + 0.7, H, 0.2], [u + 0.82, H + 0.2, 0.32], [GREEN, BLUISH, AMBER, MAUVE][i]);
      }
    } else if (kind == KIND.SAMPLES) {
      c([0, H - 0.05, 0], [L, H, D], IRON);
      c([0.15, 0.18, 0.15], [L - 0.15, 0.22, D - 0.15], INK);
      for (const u of [0.1, L - 0.2]) {
        for (const w of [0.1, D - 0.2]) {
          c([u, 0, w], [u + 0.1, H - 0.05, w + 0.1], INK);
        }
      }
      // Four cases on lit bases, a rock in each: the glass is only its frame.
      for (let i = 0; i < 4; i++) {
        const u = 0.25 + i * 1.2;
        c([u, H, 0.3], [u + 0.9, H + 0.07, 1.2], INK);
        g(u + 0.05, H + 0.015, u + 0.85, H + 0.055, 1.205, CYAN, 1.2);
        const t = 0.16 + 0.07 * (i % 3);
        c([u + 0.28, H + 0.07, 0.55], [u + 0.62, H + 0.07 + t, 0.95], [0.4 + 0.05 * i, 0.38, 0.35]);
        for (const [a, b] of [
          [0, 0.3],
          [0.88, 0.3],
          [0, 1.18],
          [0.88, 1.18],
        ]) {
          c([u + a, H + 0.07, b], [u + a + 0.02, H + 0.55, b + 0.02], GREY);
        }
        c([u, H + 0.53, 0.3], [u + 0.9, H + 0.55, 1.2], [0.5, 0.6, 0.66]);
      }
    } else if (kind == KIND.RACKS) {
      // Three cabinets of twelve units, each a dark face with a row of status lights.
      c([0, 0, 0], [L, H, D], INK);
      for (let n = 0; n < 3; n++) {
        const a = 0.1 + n * 1.63;
        for (let r = 0; r < 12; r++) {
          const y = 0.25 + r * 0.2;
          g(a, y, a + 1.43, y + 0.16, D + 0.01, IRON, 0.25);
          for (let d = 0; d < 5; d++) {
            const led = [GREEN, AMBER, GREEN, CYAN, RED, null][(n * 7 + r * 5 + d * 3) % 6];
            if (led) {
              g(a + 0.1 + d * 0.08, y + 0.06, a + 0.14 + d * 0.08, y + 0.1, D + 0.015, led, 1.6);
            }
          }
        }
        g(a, H - 0.4, a + 1.43, H - 0.34, D + 0.01, CYAN, 0.9);
      }
    } else if (kind == KIND.SCOPE) {
      // On its pier, aimed up at the shell; a finder alongside.
      c([0.2, 0, 0.2], [1, 0.1, 1], INK);
      c([0.45, 0.1, 0.45], [0.75, 0.85, 0.75], SNOW);
      g(0.52, 0.55, 0.68, 0.65, 0.755, GREEN, 1.4);
      c([0.35, 0.85, 0.35], [0.85, 1.05, 0.85], IRON);
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
      c([0, 0, 0], [L, 0.9, D], SNOW);
      c([0, 0.9, 0], [L, H, 0.5], SNOW);
      screen(0.12, 0.92, 0.95, 1.26, 0.56, GREEN);
      // The sample chamber: a lit window, a row of buttons, the drawers' seams.
      c([1.1, 0.9, 0.55], [1.88, 1.18, 1.1], IRON);
      g(1.16, 0.95, 1.82, 1.13, 1.105, MAUVE, 1.3);
      for (let i = 0; i < 6; i++) {
        g(0.15 + i * 0.12, 0.74, 0.22 + i * 0.12, 0.8, D + 0.005, [AMBER, GREEN, CYAN][i % 3], 1.4);
      }
      for (const y of [0.3, 0.6]) {
        c([0.05, y, D], [L - 0.05, y + 0.015, D + 0.005], INK);
      }
    } else if (kind == KIND.PLANTS) {
      // Three shelves of troughs under grow lights, in a frame.
      for (const u of [0, L / 2 - 0.03, L - 0.06]) {
        c([u, 0, 0], [u + 0.06, H, D], IRON);
      }
      c([0, H - 0.04, 0], [L, H, D], SNOW);
      for (const y of [0.3, 0.9, 1.5]) {
        c([0, y, 0], [L, y + 0.04, D], SNOW);
        c([0.1, y + 0.04, 0.12], [L - 0.1, y + 0.18, D - 0.12], SOIL);
        for (let u = 0.25; u < L - 0.15; u += 0.4) {
          const h = 0.12 + 0.06 * ((u * 10 + y * 3) % 3);
          c(
            [u - 0.1, y + 0.18, 0.2],
            [u + 0.1, y + 0.18 + h, D - 0.2],
            (u * 10) % 2 < 1 ? [0.18, 0.5, 0.16] : [0.3, 0.62, 0.2],
          );
        }
        lit(o, 1.1, () => c([0.1, y + 0.53, 0.3], [L - 0.1, y + 0.56, D - 0.3], PINK));
      }
    } else if (kind == KIND.LOCKERS) {
      c([0, 0, 0], [L, H, D], BLUISH);
      for (let i = 0; i < 6; i++) {
        const u = i * 0.8;
        if (i) {
          c([u - 0.01, 0.05, D], [u + 0.01, H - 0.05, D + 0.01], INK);
        }
        for (let v = 0; v < 3; v++) {
          c([u + 0.2, 1.7 + v * 0.08, D], [u + 0.6, 1.73 + v * 0.08, D + 0.01], INK);
        }
        c([u + 0.64, 0.95, D], [u + 0.68, 1.2, D + 0.04], GREY);
        g(u + 0.3, 1.5, u + 0.5, 1.56, D + 0.012, AMBER, 0.8);
      }
    } else if (kind == KIND.SUIT) {
      // On a stand: a pole at its back, boots, legs, the life support pack, arms and the helmet.
      c([0.1, 0, 0.1], [0.9, 0.06, 0.9], INK);
      c([0.47, 0.06, 0.06], [0.53, 1.7, 0.14], IRON);
      for (const u of [0.27, 0.54]) {
        c([u - 0.02, 0.06, 0.36], [u + 0.21, 0.22, 0.68], IRON);
        c([u, 0.22, 0.4], [u + 0.19, 0.95, 0.62], SNOW);
      }
      c([0.22, 0.95, 0.32], [0.78, 1.58, 0.7], SNOW);
      c([0.25, 1.0, 0.14], [0.75, 1.62, 0.32], GREY);
      for (const u of [0.08, 0.78]) {
        c([u, 1.0, 0.4], [u + 0.14, 1.54, 0.6], SNOW);
        c([u, 0.88, 0.4], [u + 0.14, 1.0, 0.6], IRON);
      }
      g(0.34, 1.3, 0.5, 1.42, 0.705, CYAN, 1);
      g(0.56, 1.34, 0.64, 1.42, 0.705, RED, 1.2);
      place(o, solid(2, 0, [1, 1]), P(0.5, 1.8, 0.5), UP, [0, 0, 0], 0.21, SNOW);
      g(0.38, 1.74, 0.62, 1.88, 0.715, AMBER, 0.7);
    } else {
      // A panel on a wall: a plate, a display, a grid of buttons, a strip of light.
      c([0, 0, 0], [L, H, 0.05], IRON);
      g(0.1, 0.35, L * 0.6, H - 0.1, 0.055, CYAN, 0.5);
      for (let i = 0; i < 12; i++) {
        g(
          L * 0.66 + (i % 3) * 0.2,
          0.4 + (i >> 2) * 0.25,
          L * 0.66 + (i % 3) * 0.2 + 0.1,
          0.5 + (i >> 2) * 0.25,
          0.055,
          [GREEN, AMBER, RED, CYAN][i % 4],
          1.3,
        );
      }
      g(0.1, 0.1, L - 0.1, 0.18, 0.055, AMBER, 0.9);
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
 * the door, cables under the east deck, cable trays and status lights along the tubes, hazard
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
  // Along each tube: a tray at 2 m on a wall, a status light every 5 m.
  TUBES.forEach(({ min, max }, n) => {
    const k = n ? 2 : 0;
    const [a0, b0] = [min[k], n ? TUBES[0].min[2] : max[k]];
    const at = min[2 - k] + WALL;
    const lo = [0, 2, 0];
    const hi = [0, 2.1, 0];
    [lo[k], hi[k], lo[2 - k], hi[2 - k]] = [a0, b0, at, at + 0.12];
    inside(o, () => box(o, lo as Vec3, hi as Vec3, INK));
    for (let d = a0 + 2.5; d < b0 - 1; d += 5) {
      const [p, q] = [
        [0, 1.3, 0],
        [0, 1.5, 0],
      ];
      [p[k], q[k]] = [d - 0.2, d + 0.2];
      panel(o, 2 - k, at + 0.03, p, q, GREEN);
    }
  });
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
    const [p, q] = [
      [0, 3.2, 0],
      [0, 3.45, 0],
    ];
    [p[2 - k], q[2 - k]] = [mid - 0.15, mid + 0.15];
    panel(o, k, at, p, q, RED);
  }
};
