// The banners by each base's main door (the user, 2026-11-27): two either side of the dome's door,
// hung off its drum from a crossbar on brackets, stiff as there is no wind, in the team's colour
// with a gilt edge and a pointed foot, the team's emblem on them flat (red's ram, blue's eagle),
// each turned toward the door. Outdoors, with their true normals; drawn only, 0.25 m off the wall.
import { capsule, dress, place, segment } from '../mesh';
import { face, lit } from '../brick';
import type { Vec3 } from '../mesh';
import type { Out } from '../verts';
import { CX, CZ, R } from './constants';
import { BRIGHT, CURLS, EAGLE, EYE, GEM, PLATE, STROKES } from './eagle';
import {
  EDGE,
  HORNS,
  HORN_N,
  MASK,
  OUTLINE,
  PLATE as RAM_PLATE,
  SHIELD,
  STEEL,
  horn,
  hornR,
} from './ram';

const ROD = dress(capsule(1, [1, 1], 6, [0, 0]), [1, 1, 1]);
const KNOB = dress(capsule(0, [1, 1], 6, [1, 1]), [1, 1, 1]);
const GILT = [0.72, 0.56, 0.22];
const IRON = [0.16, 0.16, 0.18];
const EYES = [1, 0.12, 0.08];
/** How far along the drum from the door's middle each banner hangs, and how far off the drum. */
const [ASIDE, OFF] = [5.5, 0.25];
/** The emblem's scale on the cloth, and the height of its foot. */
const [K, FOOT] = [0.85, 2.4];

/**
 * Draws the two banners of a team before red's door (the drum's south side; blue's is red's
 * mirror), `cloth` its colour and `emblem` drawing on it through `on`: (u across, toward the
 * door; v up from the ground; how far out from the cloth) to the world.
 */
const banners = (
  o: Out,
  cloth: number[],
  emblem: (on: (u: number, v: number, off: number) => Vec3) => void,
) => {
  for (const side of [-1, 1]) {
    const th = side * Math.asin(ASIDE / R);
    const n: Vec3 = [Math.sin(th), 0, -Math.cos(th)];
    const t: Vec3 = [Math.cos(th), 0, Math.sin(th)];
    const at = (u: number, v: number, off: number): Vec3 => {
      const r = R + OFF + off;
      return [CX + n[0] * r + t[0] * u, v, CZ + n[2] * r + t[2] * u];
    };
    const behind = (v: number) => at(0, v, -1);
    // Toward the door: the one west of it (side -1) reads to +x along t.
    const on = (u: number, v: number, off: number) => at(-side * u, v, off);
    const flat = (pts: number[][], off: number, rgb: number[]) =>
      face(
        o,
        pts.map(([u, v]) => on(u, v, off)),
        rgb,
        behind(2.5),
      );
    // The gilt edge, the cloth inside it, and its back.
    const outline = [
      [-1, 4.6],
      [1, 4.6],
      [1, 1.5],
      [0, 1.0],
      [-1, 1.5],
    ];
    flat(outline, 0, GILT);
    face(
      o,
      outline.map(([u, v]) => on(u, v, -0.002)),
      cloth.map(c => c * 0.6),
      on(0, 2.5, 1),
    );
    flat(
      [
        [-0.92, 4.52],
        [0.92, 4.52],
        [0.92, 1.55],
        [0, 1.1],
        [-0.92, 1.55],
      ],
      0.004,
      cloth,
    );
    emblem(on);
    // The crossbar with its gilt knobs, and the brackets back to the drum.
    segment(o, ROD, at(-1.15, 4.66, 0), at(1.15, 4.66, 0), [0, 1, 0], 1, 0.035, IRON);
    for (const u of [-1.15, 1.15]) {
      place(
        o,
        KNOB,
        at(u, 4.66, 0),
        [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
        ],
        [0, 0, 0],
        0.06,
        GILT,
      );
    }
    for (const u of [-0.85, 0.85]) {
      segment(o, ROD, at(u, 4.66, 0), at(u, 4.66, -OFF), [0, 1, 0], 1, 0.025, IRON);
    }
  }
};

/** A point of an emblem (u, y over its foot) on the cloth. */
const em = (on: (u: number, v: number, off: number) => Vec3, u: number, y: number, off: number) =>
  on(u * K, FOOT + (y - 0.2) * K, off);
/** A flat piece of an emblem, wound to face out. */
const piece = (
  o: Out,
  on: (u: number, v: number, off: number) => Vec3,
  pts: number[][],
  off: number,
  rgb: number[],
) =>
  face(
    o,
    pts.map(([u, y]) => em(on, u, y, off)),
    rgb,
    on(0, 2.5, -1),
  );
/** A diamond round (u, y), w and h its half sizes. */
const diamond = (u: number, y: number, w: number, h: number) => [
  [u - w, y],
  [u, y + h],
  [u + w, y],
  [u, y - h],
];
/** A strip from p to q, w its half width. */
const strip = (p: number[], q: number[], w: number) => {
  const [dx, dy] = [q[0] - p[0], q[1] - p[1]];
  const l = Math.hypot(dx, dy) || 1;
  const [nx, ny] = [(-dy / l) * w, (dx / l) * w];
  return [
    [p[0] - nx, p[1] - ny],
    [q[0] - nx, q[1] - ny],
    [q[0] + nx, q[1] + ny],
    [p[0] + nx, p[1] + ny],
  ];
};

/** Red's banners: the ram's head before its dark shield, the horns curled round, the eyes red. */
export const ramBanners = (o: Out) =>
  banners(o, [0.8, 0.08, 0.06], on => {
    const f = (pts: number[][], off: number, rgb: number[]) => piece(o, on, pts, off, rgb);
    f(
      OUTLINE.map(([a, y]) => [a * 1.05, 1.03 + (y - 1.03) * 1.05]),
      0.008,
      EDGE,
    );
    f(OUTLINE, 0.01, SHIELD);
    for (const s of [-1, 1]) {
      for (let i = 0; i < HORN_N; i++) {
        const [p, q] = [horn(s, i / HORN_N), horn(s, (i + 1.15) / HORN_N)];
        f(
          strip(p, q, hornR(i)),
          0.012 + 0.0002 * i,
          HORNS[i & 1].map(c => c * 1.8),
        );
      }
    }
    f(
      [...MASK.map(([y, w]) => [-w, y]), ...[...MASK].reverse().map(([y, w]) => [w, y])],
      0.018,
      STEEL,
    );
    f(strip([0, 1.6], [0, 0.55], 0.025), 0.02, EDGE);
    for (const s of [-1, 1]) {
      f(
        [
          [s * 0.04, 1.17],
          [s * 0.31, 1.25],
          [s * 0.31, 1.15],
          [s * 0.06, 1.08],
        ],
        0.02,
        EDGE,
      );
      f(
        [
          [s * 0.2, 0.95],
          [s * 0.12, 0.62],
          [s * 0.08, 0.62],
          [s * 0.12, 0.95],
        ],
        0.02,
        RAM_PLATE,
      );
      f(diamond(s * 0.14, 1.02, 0.085, 0.06), 0.021, [0.03, 0.03, 0.035]);
      lit(o, 1.8, () => f(diamond(s * 0.14, 1.025, 0.06, 0.04), 0.022, EYES));
      f(diamond(s * 0.05, 0.56, 0.028, 0.02), 0.021, [0.03, 0.03, 0.035]);
    }
  });

/** Blue's banners, drawn before red's door for furnishing() to mirror: the falcon in profile, its eye of blue gem. */
export const eagleBanners = (o: Out) =>
  banners(o, [0.05, 0.12, 0.5], on => {
    const f = (pts: number[][], off: number, rgb: number[]) => piece(o, on, pts, off, rgb);
    EAGLE.forEach(({ at, rgb }, i) => f(at, 0.008 + 0.001 * i, rgb));
    for (const [p, q] of STROKES) {
      f(strip(p, q, 0.015), 0.04, PLATE);
    }
    const [eu, ey, ew, eh] = EYE;
    f(diamond(eu, ey, ew + 0.04, eh + 0.025), 0.04, PLATE);
    lit(o, 1.7, () => f(diamond(eu, ey, ew, eh), 0.041, GEM));
    for (const [u, y] of CURLS) {
      f(diamond(u, y, 0.05, 0.05), 0.04, BRIGHT);
      f(diamond(u, y, 0.025, 0.025), 0.041, PLATE);
    }
  });
