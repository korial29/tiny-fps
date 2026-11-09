// The street, far under the roofs: a grid of roads round the play area, derived from its bounds, with
// the paving, the asphalt and the markings as flat lit quads. The play area is one block of the grid,
// whose gaps are paved. Drawn only: the physics never sees it. skyline.ts stands towers in the other
// blocks, traffic.ts drives cars on the roads.
import type { Brush, WorldDef } from '../shared/world';
import { face } from './vision';

/** The ground of the city, metres: about 100 m under the roofs. */
export const STREET = -80;
/** The asphalt's width, and the distance between two roads' centres. */
export const ROAD = 16;
export const PITCH = 72;
/** The paving between the play area and its first road. */
const PLAZA = 10;
/** How far the near grid reaches past the circle round the play area, metres: its crossings have crosswalks of bars. */
const REACH = 150;
/**
 * How far from the centre the city goes on, metres, inside the far clip (900 m): the grid carried
 * on, its markings out to MARKS, and a tower to a block (skyline.ts).
 */
export const FAR = 820;
/** The crosswalks at a crossing: a stripe across the road, and its depth. */
const ZEBRA = 3;
/** The pavement round a building, metres. */
const WALK = 3;

const [PAVE, ASPHALT, WHITE, YELLOW] = [
  [0.3, 0.3, 0.29],
  [0.09, 0.09, 0.1],
  [0.8, 0.8, 0.78],
  [0.85, 0.62, 0.08],
];
/** A crosswalk seen from afar: its bars cover half the road, so half white, half asphalt. */
const BAND = WHITE.map((v, i) => (v + ASPHALT[i]) / 2);

/** The box of the play area over the brushes: [x0, x1, z0, z1]. */
export const area = ({ brushes }: WorldDef) =>
  [0, 2].flatMap(a => [
    Math.min(...brushes.map(b => b.min[a])),
    Math.max(...brushes.map(b => b.max[a])),
  ]);

/**
 * The road grid: the x of each road that runs along z (`xs`) and the z of each that runs along x
 * (`zs`), sorted. Two roads hug the play area at PLAZA from its box and the rest follow every PITCH
 * out to `reach` from its centre, so no road crosses a building and every road crosses every other.
 * `out` is how far past the circle round the play area it goes: REACH for the roads that are drawn.
 */
export const grid = (def: WorldDef, out = REACH) => {
  const box = area(def);
  const reach = Math.hypot(box[1] - box[0], box[3] - box[2]) / 2 + out;
  const lines = (lo: number, hi: number) => {
    const out: number[] = [];
    for (let k = 0; (hi - lo) / 2 + PLAZA + ROAD / 2 + k * PITCH <= reach; k++) {
      out.push(lo - PLAZA - ROAD / 2 - k * PITCH, hi + PLAZA + ROAD / 2 + k * PITCH);
    }
    return out.sort((a, b) => a - b);
  };
  return { box, reach, xs: lines(box[0], box[1]), zs: lines(box[2], box[3]) };
};

/** The brushes as they are drawn: the buildings, which go down to the floor, go on down to the street. */
export const deepen = ({ brushes, floor }: WorldDef): Brush[] =>
  brushes.map(b => (b.min[1] <= floor ? { ...b, min: [b.min[0], STREET, b.min[2]] } : b));

/** Past this distance from the centre the markings are drawn wider, longer and higher, metres: they keep a pixel, and their depth over the asphalt. */
export const SCALE = 300;
/**
 * How far from the centre the markings and the traffic go, metres: past it the haze leaves a
 * twentieth of them, so they fade into it instead of ending.
 */
export const MARKS = 640;

/**
 * How much the street's paint is scaled at (x, z): 1 to SCALE from the centre, then in proportion
 * to the distance, up to MARKS. Widths and lengths go as it, lifts over the street as its square:
 * the depth buffer's step grows as the square of the distance.
 */
export const scale = (def: WorldDef) => {
  const box = area(def);
  const [cx, cz] = [(box[0] + box[1]) / 2, (box[2] + box[3]) / 2];
  return (x: number, z: number) =>
    Math.min(Math.max(Math.hypot(x - cx, z - cz) / SCALE, 1), MARKS / SCALE);
};

/**
 * The paving, the asphalt of every road of the grid out to FAR, a piece between two crossings and a
 * square at each; within MARKS the lane markings, and at each crossing its crosswalks: bars on the
 * near grid, past it one band of their mean colour (the bars would be under a pixel).
 */
export const street = (def: WorldDef): number[] => {
  const { box, xs, zs } = grid(def);
  const far = grid(def, FAR);
  const k = scale(def);
  const out: number[] = [];
  const rect = (x0: number, z0: number, x1: number, z1: number, lift: number, rgb: number[]) =>
    face(out, [x0, STREET + lift, z0], [x1, STREET + lift, z1], 1, 1, -1, rgb);
  const [cx, cz] = [(box[0] + box[1]) / 2, (box[2] + box[3]) / 2];
  rect(cx - 1e3, cz - 1e3, cx + 1e3, cz + 1e3, 0, PAVE);
  // The play area is one block: asphalt in its gaps, paved a few metres round each building.
  rect(box[0], box[2], box[1], box[3], 0.12, ASPHALT);
  for (const { min, max } of def.brushes) {
    if (min[1] <= def.floor) {
      rect(min[0] - WALK, min[2] - WALK, max[0] + WALK, max[2] + WALK, 0.3, PAVE);
    }
  }
  const h = ROAD / 2;
  const mark = (x: number, z: number) => Math.hypot(x - cx, z - cz) < MARKS;
  for (const [a, lines, cross, mine, theirs] of [
    [0, far.xs, far.zs, xs, zs],
    [1, far.zs, far.xs, zs, xs],
  ] as const) {
    for (const c of lines) {
      /** A strip of the road: `l` across from its centre line, `s` along it. */
      const put = (l0: number, l1: number, s0: number, s1: number, lift: number, rgb: number[]) =>
        a ? rect(s0, c + l0, s1, c + l1, lift, rgb) : rect(c + l0, s0, c + l1, s1, lift, rgb);
      /** The scale at a point `s` along the road. */
      const at = (s: number) => (a ? k(s, c) : k(c, s));
      const xz = (s: number): [number, number] => (a ? [s, c] : [c, s]);
      cross.forEach((s, i) => {
        // The crossing's square once, from the roads along z.
        if (!a) {
          put(-h, h, s - h, s + h, 0.12 * at(s) ** 2, ASPHALT);
        }
        if (mark(...xz(s))) {
          for (const e of [-1, 1]) {
            // On the piece of road it lies on, over that piece's asphalt.
            const next = cross[i + e];
            if (next === undefined) {
              continue;
            }
            const lift = 0.24 * at((s + next) / 2) ** 2;
            if (mine.includes(c) && theirs.includes(s)) {
              for (let j = 0; j < h; j++) {
                put(2 * j - h + 0.5, 2 * j - h + 1.5, s + e * h, s + e * (h + ZEBRA), lift, WHITE);
              }
            } else {
              put(-h, h, s + e * h, s + e * (h + ZEBRA), lift, BAND);
            }
          }
        }
        if (i + 1 == cross.length) {
          return;
        }
        const mid = (s + cross[i + 1]) / 2;
        const m = at(mid);
        put(-h, h, s + h, cross[i + 1] - h, 0.12 * m ** 2, ASPHALT);
        const [from, to] = [s + h + ZEBRA, cross[i + 1] - h - ZEBRA];
        if (to > from && mark(...xz(mid))) {
          const [w, lift] = [0.4 * m, 0.24 * m ** 2];
          put(0.4 - h, 0.4 - h + w, from, to, lift, WHITE);
          put(h - 0.4 - w, h - 0.4, from, to, lift, WHITE);
          for (let p = from + 2 * m; p + 4 * m < to; p += 9 * m) {
            put(-w / 2, w / 2, p, p + 4 * m, lift, YELLOW);
          }
        }
      });
    }
  }
  return out;
};
