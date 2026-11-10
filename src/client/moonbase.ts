// What is drawn of the moon base (docs/MOON.md), red's half: the dome and its windows, the hall in
// it, the tubes, the modules' windows and what lights their insides, on the boxes of
// shared/moonbase.ts. moonscape.ts calls moonbase() and mirrors it for blue: it imports this file,
// never the other way, so the helpers both use are here.
import {
  BASE,
  DOME,
  FIT,
  HALL,
  HEAD,
  KIND,
  KIT,
  MODULES,
  MOUTHS,
  ROOM,
  TUBES,
  WALL,
} from '../shared/moonbase';
import { ZED } from '../shared/moon';
import { TAU } from '../shared/physics';
import { TEX } from '../shared/types';
import type { Brush, WorldDef } from '../shared/world';
import { glow, tri } from './flag';
import { STRIDE, dot, dress, place, segment, smooth, solid, sub } from './mesh';
import type { Vec3 } from './mesh';

const PAINT = [0.8, 0.82, 0.86];
const DARK = [0.35, 0.36, 0.4];
/** A model whose length runs up (y): the frame place() takes. */
export const UP: Vec3[] = [
  [1, 0, 0],
  [0, 0, 1],
  [0, 1, 0],
];

export const cross = (u: Vec3, v: Vec3): Vec3 => [
  u[1] * v[2] - u[2] * v[1],
  u[2] * v[0] - u[0] * v[2],
  u[0] * v[1] - u[1] * v[0],
];
/** A convex polygon of one colour, wound so that it faces away from `away` when given. */
export const face = (o: number[], p: Vec3[], rgb: number[], away?: Vec3) => {
  const n = cross(sub(p[1], p[0]), sub(p[2], p[0]));
  const q = away && dot(n, sub(p[0], away)) < 0 ? [...p].reverse() : p;
  for (let k = 1; k < q.length - 1; k++) {
    tri(o, q[0], q[k], q[k + 1], rgb);
  }
};
/** A box of one colour between two corners, its faces outward. */
export const box = (o: number[], lo: Vec3, hi: Vec3, rgb: number[]) => {
  const mid = lo.map((v, i) => (v + hi[i]) / 2) as Vec3;
  const p = (i: number): Vec3 => [
    i & 1 ? hi[0] : lo[0],
    i & 2 ? hi[1] : lo[1],
    i & 4 ? hi[2] : lo[2],
  ];
  for (const f of [
    [0, 1, 3, 2],
    [4, 5, 7, 6],
    [0, 1, 5, 4],
    [2, 3, 7, 6],
    [0, 2, 6, 4],
    [1, 3, 7, 5],
  ]) {
    face(o, f.map(p), rgb, mid);
  }
};
/** Carries a model's vertices to (x, y, z), turned by `yaw` about y. */
export const put = (o: number[], v: number[], [x, y, z]: Vec3, yaw = 0) => {
  const [c, s] = [Math.cos(yaw), Math.sin(yaw)];
  for (let i = 0; i < v.length; i += STRIDE) {
    o.push(
      x + c * v[i] + s * v[i + 2],
      y + v[i + 1],
      z - s * v[i] + c * v[i + 2],
      c * v[i + 3] + s * v[i + 5],
      v[i + 4],
      c * v[i + 5] - s * v[i + 3],
      ...v.slice(i + 6, i + 10),
    );
  }
};
/** What `make` adds to `o` glows, k times its colour. */
export const lit = (o: number[], k: number, make: () => void) => {
  const from = o.length;
  make();
  glow(o, from, k);
};

/** The beams over the doorways of the modules. */
export const LINTELS = BASE.filter(b => b.min[1] === HEAD && b.max[1] === ROOM);
const [CX, CZ] = DOME;
const C = [CX, 0, CZ];
const R = 22.4;
/** The hall's walls are drawn this high, where a ledge closes them against the inner shell: over a double jump from the mezzanine. */
const TOP = 8;
/**
 * The normal of what is drawn indoors, whichever way it faces: up and away from the sun (east,
 * low), in both halves. The sun's shadow map is 64 m wide, so a true normal would be sunlit seen
 * from across the hall; with this one a texture takes the sky's ambient only. It leans off all
 * three axes: the shader's relief needs a normal out of the face's plane.
 */
export const INDOORS = [-0.6, 0.6, 0.53];
/** Texture axes of a face flat on x, y and z: world metres, as the brushes'. */
const UV = [
  [2, 1],
  [0, 2],
  [0, 1],
];
/** Lamps, the windows' glass seen from inside, their frames. */
const LAMP = [1.25, 1.3, 1.4];
const GLASS = [0.56, 0.48, 0.28];
const FRAME = [0.04, 0.04, 0.05];
const { CONCRETE, METAL, PAINT: WHITE } = TEX;

/** A quad indoors: textured, `l` its light (under 2), or glowing in an rgb. */
const quad = (o: number[], p: Vec3[], c: number | number[], l = 1, [u, v] = UV[1]) => {
  for (const i of [0, 1, 2, 0, 2, 3]) {
    o.push(...p[i], ...INDOORS);
    if (typeof c == 'number') {
      o.push(p[i][u], p[i][v], c, l);
    } else {
      o.push(c[0], c[1], -2, c[2]);
    }
  }
};
/** quad() on the face of the box lo..hi that is flat on the axis k, moved to `at`. */
const panel = (
  o: number[],
  k: number,
  at: number,
  lo: number[],
  hi: number[],
  c: number | number[],
  l?: number,
) =>
  quad(
    o,
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ].map(([i, j]) => {
      const v: Vec3 = [0, 0, 0];
      const [p, q] = [(k + 1) % 3, (k + 2) % 3];
      [v[k], v[p], v[q]] = [at, (i ? hi : lo)[p], (j ? hi : lo)[q]];
      return v;
    }),
    c,
    l,
    UV[k],
  );
/** A box indoors, as a brush: its top in the top texture, the rest in the side one, each face lit by where it looks; `tint` twice the palette index of its tint. */
const block = (o: number[], { min, max, top, side }: Brush, tint = 0) => {
  for (let k = 0; k < 3; k++) {
    panel(o, k, min[k], min, max, side, tint + (k == 1 ? 0.4 : 1.25 - 0.15 * k));
    panel(o, k, max[k], min, max, k == 1 ? top : side, tint + (k == 1 ? 1.85 : 1.25 - 0.15 * k));
  }
};

/**
 * What `make` adds, moved indoors: the indoor normal, and a flat colour shaded by where its face
 * looked, brighter since it takes the ambient only (about what the textured walls get).
 */
const inside = (o: number[], make: () => void) => {
  const from = o.length;
  make();
  for (let i = from; i < o.length; i += STRIDE) {
    if (o[i + 8] == -1) {
      const k = 2.2 * (0.72 + 0.28 * o[i + 4] - 0.12 * Math.abs(o[i + 3]));
      o[i + 6] *= k;
      o[i + 7] *= k;
      o[i + 9] *= k;
    }
    [o[i + 3], o[i + 4], o[i + 5]] = INDOORS;
  }
};

/** Flat colours of the kit. */
const [SNOW, GREY, IRON, INK, BLUISH, SOIL] = [
  [0.86, 0.87, 0.9],
  [0.55, 0.57, 0.6],
  [0.32, 0.33, 0.36],
  [0.07, 0.075, 0.085],
  [0.42, 0.52, 0.66],
  [0.2, 0.13, 0.08],
];
/** Glows: screens, status lights, grow lights. */
const [CYAN, GREEN, AMBER, RED, MAUVE, PINK] = [
  [0.3, 0.8, 1],
  [0.35, 1, 0.5],
  [1, 0.7, 0.25],
  [1, 0.2, 0.15],
  [0.7, 0.35, 1],
  [1, 0.35, 0.85],
];

/**
 * Draws a piece of kit, (kind, x0, z0, x1, z1, y0, y1, the way its front looks: 0 +x, 1 +z, 2 -x,
 * 3 -z), in its own frame: u along it from its start, y up from its foot, w out from its back.
 */
const piece = (o: number[], [kind, x0, z0, x1, z1, y0, y1, f]: number[]) => {
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
const dressing = (o: number[]) => {
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
/** A lit frame just inside a doorway h high from c0 to c1, in the plane of the axis k at `at`. */
const frame = (o: number[], k: number, at: number, c0: number, c1: number, h: number) => {
  for (const [a, b, y0] of [
    [c0, c0 + 0.1, 0],
    [c1 - 0.1, c1, 0],
    [c0, c1, h - 0.1],
  ]) {
    // From a to b on x and on z: the panel reads the one across.
    panel(o, k, at, [a, y0, a], [b, h, b], LAMP);
  }
};

/**
 * A white wall indoors in the plane of the axis k at `at`, along the other one from s to t and up
 * to y, `l` its light, open at each door (from, to, height).
 */
const lining = (
  o: number[],
  k: number,
  at: number,
  s: number,
  t: number,
  y: number,
  l: number,
  doors: number[][] = [],
) => {
  [...doors, [t, t, 0]].forEach(([d0, d1, h], i) => {
    const [lo, hi] = [
      [0, 0, 0],
      [0, y, 0],
    ];
    [lo[2 - k], hi[2 - k]] = [i ? doors[i - 1][1] : s, d0];
    panel(o, k, at, lo, hi, WHITE, l);
    if (d1 > d0) {
      [lo[1], lo[2 - k], hi[2 - k]] = [h, d0, d1];
      panel(o, k, at, lo, hi, WHITE, l);
    }
  });
};

/** The openings of the drawn drum, as angles about the centre and a height: the door, and the tubes' boxes where they come through. */
const GAPS = [
  [-TAU / 4 - Math.asin(MOUTHS[0][2] / R), -TAU / 4 + Math.asin(MOUTHS[0][2] / R), MOUTHS[0][3]],
  [-Math.acos((TUBES[1].min[0] - CX) / R), Math.asin((TUBES[0].max[2] - CZ) / R), MOUTHS[1][3]],
];

/** The dome: a drum with a band of windows under a hemisphere (radius 22, top at 17), open at the door and at the tubes; a lit portal at the door. */
const dome = (o: number[]) => {
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
    lit(o, 0.56, () => face(o, pane(0.6, 1.7, 2.7, 0.07), [1, 0.85, 0.5], [CX, 2.2, CZ]));
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

/**
 * The hall in the dome, all drawn here (shared/moonbase.ts collides with it as ghosts): its floor,
 * its stepped wall with windows and a strip of light, the mouths through the wall, the ledge that
 * closes the wall against the shell, the shell from inside with a lamp at its top, and what stands
 * in it.
 */
const hall = (o: number[]) => {
  const rects = [...HALL, ...HALL.map(([a, b]) => [b, a]).reverse()];
  for (const [c, d] of rects) {
    panel(o, 1, 0.02, [CX - c, 0, CZ - d], [CX + c, 0, CZ + d], CONCRETE, 1.85);
  }
  // The wall's corners, round the centre: a quarter, then its mirrors.
  const qd = rects.flatMap(([c, d], i) => [
    [c, d],
    ...(rects[i + 1] ? [[rects[i + 1][0], d]] : []),
  ]);
  const loop = [
    ...qd,
    ...qd.map(([x, z]) => [-x, z]).reverse(),
    ...qd.map(([x, z]) => [-x, -z]),
    ...qd.map(([x, z]) => [x, -z]).reverse(),
  ];
  loop.forEach((p, i) => {
    const n = loop[(i + 1) % loop.length];
    // The wall stands in the plane of the axis k at `at` and runs along j from s to t.
    const k = p[0] == n[0] ? 0 : 2;
    const j = 2 - k;
    const [at, sign] = [C[k] + p[k / 2], Math.sign(p[k / 2])];
    const [s, t] = [p[j / 2], n[j / 2]].sort((a, b) => a - b);
    const m = MOUTHS.find(m => m[k / 2] == p[k / 2] && m[j / 2] > s && m[j / 2] < t);
    const [mc, mw, mh, md] = m ? [m[j / 2], m[2], m[3], m[4]] : [s, 0, 0, 0];
    /** A piece of it from a to b, `off` proud. */
    const put = (
      a: number,
      b: number,
      y0: number,
      y1: number,
      c: number | number[],
      l = 0,
      off = 0,
    ) => {
      const [lo, hi] = [
        [0, y0, 0],
        [0, y1, 0],
      ];
      [lo[j], hi[j]] = [C[j] + a, C[j] + b];
      panel(o, k, at - sign * off, lo, hi, c, l);
    };
    lining(o, k, at, C[j] + s, C[j] + t, TOP, 1.7, m && [[C[j] + mc - mw, C[j] + mc + mw, mh]]);
    put(s, t, 0, 0.25, FRAME, 0, 0.02);
    put(s, t, TOP - 0.6, TOP - 0.4, LAMP, 0, 0.03);
    // Windows on the long faces, a row for the floor and one for the mezzanine.
    const count = t - s > 6 ? Math.floor((t - s) / 2.4) : 0;
    for (let w = 0; w < count; w++) {
      const c = s + ((t - s) * (w + 0.5)) / count;
      for (const y of [1.5, 4.9]) {
        if (y > mh || Math.abs(c - mc) > mw + 0.8) {
          put(c - 0.72, c + 0.72, y, y + 1.4, FRAME, 0, 0.02);
          put(c - 0.6, c + 0.6, y + 0.2, y + 1.2, GLASS, 0, 0.04);
        }
      }
    }
    // The ledge, out to the inner shell.
    const pieces = Math.ceil((t - s) / 4.2);
    for (let w = 0; w < pieces; w++) {
      const corner = (f: number, out: number): Vec3 => {
        const v: Vec3 = [0, TOP, 0];
        [v[k], v[j]] = [p[k / 2], s + ((t - s) * f) / pieces];
        const r = out ? 21.55 / Math.hypot(v[0], v[2]) : 1;
        return [CX + v[0] * r, TOP, CZ + v[2] * r];
      };
      quad(o, [corner(w, 0), corner(w + 1, 0), corner(w + 1, 1), corner(w, 1)], CONCRETE, 1);
    }
    if (m) {
      // The way through the wall: its sides, its ceiling and its floor, and a lit frame.
      const [lo, hi] = [
        [0, 0, 0],
        [0, mh, 0],
      ];
      [lo[k], hi[k]] = [at, at + sign * md].sort((a, b) => a - b);
      [lo[j], hi[j]] = [C[j] + mc - mw, C[j] + mc + mw];
      panel(o, j, lo[j], lo, hi, WHITE, 1.4);
      panel(o, j, hi[j], lo, hi, WHITE, 1.4);
      panel(o, 1, mh, lo, hi, WHITE, 0.9);
      panel(o, 1, 0.02, lo, hi, CONCRETE, 1.85);
      frame(o, k, at - sign * 0.03, lo[j], hi[j], mh);
    }
  });
  // The shell from inside: six rings of flat panels from the ledge to the top, darker toward it, and
  // a round lamp under the top. A flat colour: a texture's relief needs a normal out of the facet.
  const [M, RINGS, A] = [32, 6, Math.asin((TOP - 5) / 11.7)];
  const at = (i: number, s: number): Vec3 => {
    const [a, t] = [A + ((TAU / 4 - A) * s) / RINGS, (i * TAU) / M];
    const r = (R - 0.3) * Math.cos(a);
    return [CX + r * Math.cos(t), 5 + 11.7 * Math.sin(a), CZ + r * Math.sin(t)];
  };
  for (let s = 0; s < RINGS; s++) {
    for (let i = 0; i < M; i++) {
      const g = 0.31 - 0.028 * s - 0.018 * ((i + s) & 1);
      quad(o, [at(i, s), at(i + 1, s), at(i + 1, s + 1), at(i, s + 1)], [g, g, g * 1.06]);
    }
  }
  for (let i = 0; i < 16; i += 2) {
    const rim = (n: number): Vec3 => [
      CX + 3 * Math.cos((n * TAU) / 16),
      16.2,
      CZ + 3 * Math.sin((n * TAU) / 16),
    ];
    quad(o, [[CX, 16.2, CZ], rim(i), rim(i + 1), rim(i + 2)], LAMP);
  }
  FIT.forEach(b => block(o, b));
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
const tubes = (o: number[]) =>
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
const modules = (o: number[]) => {
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
        lit(o, 0.5, () => face(o, pane(0.6, 2.7, 3.7, 0.04), [0.9, 0.95, 1], mid));
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

/** Red's half of the base: the dome, its hall, the tubes and the modules, a metal floor in the last two, a lit frame in each of their doorways. */
export const moonbase = (o: number[]): void => {
  dome(o);
  hall(o);
  tubes(o);
  modules(o);
  for (const { min, max } of [...MODULES, ...TUBES]) {
    panel(o, 1, 0.02, min, max, METAL, 1.99);
  }
  for (const { min, max } of LINTELS) {
    const k = max[0] - min[0] < 1 ? 0 : 2;
    for (const at of [min[k] - 0.02, max[k] + 0.02]) {
      frame(o, k, at, min[2 - k], max[2 - k], min[1]);
    }
  }
};

/**
 * The base's furnishing, both halves, which render.ts draws beside the scenery: the flags' daises
 * (the ghosts with a team tint, shared/moon.ts) as the hall's fittings but in their tint, `keys`
 * being the renderer's palette, then the dressing of red's half and its mirror for blue.
 */
export const furnishing = ({ brushes }: WorldDef, keys: string[]): number[] => {
  const o: number[] = [];
  for (const b of brushes) {
    if (b.ghost && b.tint) {
      block(o, b, 2 * Math.max(0, keys.indexOf(`${b.tint}`)));
    }
  }
  const red: number[] = [];
  dressing(red);
  for (const v of red) {
    o.push(v);
  }
  // Blue's: z becomes ZED - z, the normals follow, the triangles keep their front.
  for (let t = 0; t < red.length; t += 3 * STRIDE) {
    for (const k of [0, 2, 1]) {
      const i = t + k * STRIDE;
      o.push(
        red[i],
        red[i + 1],
        ZED - red[i + 2],
        red[i + 3],
        red[i + 4],
        -red[i + 5],
        ...red.slice(i + 6, i + 10),
      );
    }
  }
  return o;
};
