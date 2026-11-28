// Blue's statues (the user, 2026-11-27, on a picture of a stylised silver falcon): on each plinth by
// the hall's door, the falcon as an emblem standing on edge, in relief on both faces of a dark
// plate, its pieces of polished silver parted by dark grooves. In profile, its head toward the door:
// a level top from the wing over the head to the heavy hooked beak, a big eye of blue gem high by
// the beak's root with a dark stroke falling back from it, the wing behind the head as bars stacked
// without gaps, the dark plate bare under the beak, four spiral curls at the neck, five long feathers
// slanting down the breast and a column of scales beside them. Drawn in red's frame and mirrored into
// blue's hall (furnishing()); over the plinth, not collided. banner.ts draws the same emblem flat.
import { CRATES } from '../../shared/moonbase';
import type { Brush } from '../../shared/world';
import { lit } from '../brick';
import type { Out } from '../verts';
import { inside } from './kit';
import { sculpt } from './sculpt';

export const PLATE = [0.1, 0.105, 0.13];
const SILVER = [0.66, 0.68, 0.76];
export const BRIGHT = [0.84, 0.86, 0.93];
export const GEM = [0.15, 0.35, 1];

/** The picture's pixels to metres: u along the profile (toward the beak), y up from the emblem's foot. */
const U = (px: number) => (px - 262) / 245;
const Y = (py: number) => 1.95 - ((py - 128) * 1.75) / 342;
const metres = (px: number[][]) => px.map(([x, y]) => [U(x), Y(y)]);

/** A piece of the emblem: its outline (u, y in metres, convex), how far proud of the plate's middle, its colour. */
export type Piece = { at: number[][]; d: number; rgb: number[] };

/** The emblem's pieces, back to front: the plate, the wings, the head, the beak and its hook, the breast's feathers. */
export const EAGLE: Piece[] = (() => {
  const out: Piece[] = [];
  const add = (px: number[][], d: number, rgb: number[]) => out.push({ at: metres(px), d, rgb });
  // The plate stands out a margin past every piece on each side (the user, 2026-11-28).
  add(
    [
      [6, 114],
      [522, 114],
      [522, 432],
      [480, 486],
      [250, 486],
      [94, 434],
      [6, 292],
    ],
    0.05,
    PLATE,
  );
  // The wings: bars stacked with a hairline between them behind the head (their outer ends on a
  // slant).
  const GAP = 1.5;
  for (let k = 0; k < 7; k++) {
    const [t, b] = [130 + k * 24.3, 130 + (k + 1) * 24.3 - GAP];
    const left = (py: number) => 20 + ((py - 130) * 75) / 170;
    add(
      [
        [left(t), t],
        [195, t],
        [195, b],
        [left(b), b],
      ],
      0.068,
      k & 1 ? SILVER : BRIGHT,
    );
  }
  // Nothing under the beak: the dark plate shows there, so the beak reads (the user, 2026-11-28).
  // The head, its top level with the wing's, the beak running on from it, heavy, and its hook.
  add(
    [
      [185, 132],
      [440, 132],
      [450, 212],
      [360, 252],
      [280, 286],
      [200, 300],
    ],
    0.085,
    SILVER,
  );
  add(
    [
      [430, 132],
      [496, 134],
      [508, 168],
      [500, 196],
      [468, 202],
      [430, 210],
    ],
    0.095,
    BRIGHT,
  );
  add(
    [
      [474, 192],
      [507, 168],
      [496, 206],
      [480, 228],
    ],
    0.095,
    BRIGHT,
  );
  // The breast: five long feathers side by side, slanting down toward the beak's side, pointed.
  for (let i = 0; i < 5; i++) {
    const x0 = 200 + i * 46;
    add(
      [
        [x0, 300],
        [x0 + 45, 300],
        [x0 + 45 + 52, 445],
        [x0 + 22 + 56, 470],
        [x0 + 52, 445],
      ],
      0.085,
      i & 1 ? SILVER : BRIGHT,
    );
  }
  return out;
})();

/** The eye's middle and its half sizes, u and y, in metres. */
export const EYE = [U(334), Y(180.5), 0.12, 0.06];
/** The four curls at the neck, their middles (u, y in metres). */
export const CURLS = [205, 240, 275, 310].map(x => [U(x), Y(292)]);
/** The cheek's ridge along the head's lower edge, and the eye's dark strokes, as lines (u, y in metres). */
export const RIDGE = metres([
  [450, 212],
  [360, 252],
  [280, 286],
  [200, 300],
]);
export const STROKES = [
  metres([
    [300, 196],
    [250, 262],
  ]),
  metres([
    [296, 182],
    [215, 178],
  ]),
];

const eagle = (o: Out, box: Brush, dir: number) => {
  const { ball, limb, loft } = sculpt(o, box);
  const at = (u: number, y: number, b: number) => [dir * u, y, b];
  // The stand on the plinth, then each piece in relief on both faces.
  loft(
    [-0.06, 0.06].map(b => [
      [-0.3, 0, b],
      [0.3, 0, b],
      [0.3, 0.3, b],
      [-0.3, 0.3, b],
    ]),
    () => PLATE,
  );
  for (const { at: outline, d, rgb } of EAGLE) {
    loft(
      [-d, d].map(b => outline.map(([u, y]) => at(u, y, b))),
      () => rgb,
    );
  }
  for (const s of [-1, 1]) {
    const b = s * 0.095;
    for (let i = 0; i + 1 < RIDGE.length; i++) {
      limb(at(RIDGE[i][0], RIDGE[i][1], b), at(RIDGE[i + 1][0], RIDGE[i + 1][1], b), 0.02, BRIGHT);
    }
    // The beak's root, a groove across.
    limb(at(U(430), Y(136), s * 0.1), at(U(428), Y(208), s * 0.1), 0.012, PLATE);
    // The eye, high by the beak's root: a dark almond, the gem in it, a brow over it, and the dark
    // strokes falling back and down from it.
    const [eu, ey, ew, eh] = EYE;
    ball(dir * (eu - 0.008), ey, s * 0.09, [ew + 0.04, eh + 0.025, 0.02], PLATE);
    lit(o, 1.7, () => ball(dir * eu, ey, s * 0.1, [ew, eh, 0.018], GEM));
    limb(at(U(285), Y(160), b), at(U(395), Y(154), b), 0.02, BRIGHT);
    for (const [p, q] of STROKES) {
      limb(at(p[0], p[1], b), at(q[0], q[1], b), 0.015, PLATE);
    }
    // The four curls at the neck: a disc, a dark ring in it and a boss.
    for (const [u, y] of CURLS) {
      limb(at(u, y, s * 0.09), at(u, y, s * 0.115), 0.055, BRIGHT);
      limb(at(u, y, s * 0.115), at(u, y, s * 0.12), 0.035, PLATE);
      ball(dir * (u + 0.012), y + 0.004, s * 0.122, [0.018, 0.018, 0.01], BRIGHT, true);
    }
  }
  // The scales: arches in three columns beside the feathers.
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 3; c++) {
      for (const s of [-1, 1]) {
        ball(
          dir * U(118 + c * 28),
          Y(318 + r * 30),
          s * 0.06,
          [0.05, 0.06, 0.022],
          c & 1 ? SILVER : BRIGHT,
          true,
        );
      }
    }
  }
};

/** The eagles on the two plinths by the door, in red's frame (furnishing() mirrors them into blue's hall), facing each other across the way in. */
export const eagles = (o: Out) =>
  inside(o, () => {
    eagle(o, CRATES[0], 1);
    eagle(o, CRATES[1], -1);
  });
