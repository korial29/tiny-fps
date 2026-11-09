// The cars of the street: a few dozen round the play area and more on the grid out in the haze, deterministic from the clock alone (the wall clock, so every
// client sees the same ones), with no state. Each axis of roads has its own green: during it a car
// hops from the stop line before one crossing to the one before the next, with an ease, and waits
// there while the other axis has its green, so no two cars ever meet at a crossing. Cars keep
// their lane and their order; at the end of a road a car is carried back to its start, out in the
// haze.
import type { WorldDef } from '../shared/world';
import { glow, tri } from './flag';
import { place } from './mesh';
import type { Vec3 } from './mesh';
import { FAR as CITY, MARKS, PITCH, ROAD, STREET, grid, scale } from './street';
import { hash } from './textures';

/** How much bigger than a real car (4.4 m) the cars are drawn: they are seen from 100 m up. */
const SIZE = 1.3;
/** Cars on the roads round the play area, and on the rest of the grid out to MARKS, fewer to the kilometre. */
export const CARS = 64;
export const FAR_CARS = 160;
/** Crossings a lane of the far grid is cut into: each piece has its own cars, carried back to its start. */
const PIECE = 4;
/** Seconds of a cycle, of one axis' green (the other's starts half a cycle later), and between the starts of two cars of a queue. */
export const CYCLE = 16;
const GREEN = 6.5;
const LAG = 0.4;
/** Cars in a queue at most. */
const SLOTS = 3;
/** Metres from a crossing's centre to the bumper of the first car waiting, between the cars of a queue, and a car's length. */
export const STOP = ROAD / 2 + 4;
export const GAP = 8;
export const LENGTH = 4.4 * SIZE;
/** Metres from the middle of the road to the middle of a lane. */
const LANE = ROAD / 4;
/** Beyond this distance a car is not drawn (the haze has it), beyond LIT it has no lamps, beyond NEAR_CAR no cabin. */
const FAR = MARKS + 60;
const LIT = 260;
const NEAR_CAR = 90;
/** Taxi yellow, white, black, red, blue, grey. */
const PAINT = [
  [0.95, 0.62, 0.03],
  [0.9, 0.9, 0.88],
  [0.04, 0.04, 0.045],
  [0.7, 0.05, 0.06],
  [0.08, 0.22, 0.7],
  [0.5, 0.52, 0.55],
];

/** One car: its lane, and its place in the queue it starts in. */
export interface Car {
  /** 0 on a road along z (constant x), 1 along x. */
  axis: 0 | 1;
  /** The road's x or z, and the way along its axis the lane goes: 1 or -1. */
  at: number;
  d: 1 | -1;
  /** The crossings of the lane, in the order it drives them. */
  stops: number[];
  /** The crossing it waits before at time 0, and its place in that queue (0 is first). */
  cell: number;
  slot: number;
  paint: number;
}

/** CARS of the lanes' places of a list, taken in the order of a hash, always the same. */
const pick = (all: Car[], n: number, seed: number) =>
  all
    .map((c, i) => [hash(i, c.cell, seed), c, hash(i, 1, seed + 1)] as const)
    .sort((a, b) => a[0] - b[0])
    .slice(0, n)
    .map(([, c, p]) => ({ ...c, paint: Math.floor(p * PAINT.length) }));

/**
 * The cars of a world: CARS on the four roads round the play area, between their four crossings;
 * then FAR_CARS on the far grid's other lanes, each cut into pieces of PIECE crossings, so a car
 * shrinking away at the end of one piece is where the next one's grow from. Always the same.
 */
export const cars = (def: WorldDef): Car[] => {
  const { xs, zs } = grid(def);
  const far = grid(def, CITY);
  /** The two roads each side of the play area: the traffic stays round it, where it is seen. */
  const near = (lines: number[]) => lines.slice(lines.length / 2 - 2, lines.length / 2 + 2);
  const [cx, cz] = [(far.box[0] + far.box[1]) / 2, (far.box[2] + far.box[3]) / 2];
  const [inner, outer]: Car[][] = [[], []];
  const lane = (to: Car[], axis: 0 | 1, at: number, d: 1 | -1, stops: number[]) =>
    stops.forEach((_, cell) =>
      Array.from({ length: SLOTS }, (_, slot) =>
        to.push({ axis, at, d, stops, cell, slot, paint: 0 }),
      ),
    );
  for (const [axis, lines, cross, all, wide] of [
    [0, xs, zs, far.xs, far.zs],
    [1, zs, xs, far.zs, far.xs],
  ] as const) {
    const mid = near(cross);
    // The far grid's crossings in pieces outward from the near four, a short end joined to the piece before it.
    const lo = wide.indexOf(mid[0]);
    const pieces = [mid];
    for (const side of [wide.slice(0, lo).reverse(), wide.slice(lo + mid.length)]) {
      const run: number[][] = [];
      for (let i = 0; i < side.length; i += PIECE) {
        run.push(side.slice(i, i + PIECE));
      }
      if (run.length > 1 && run[run.length - 1].length < 2) {
        run[run.length - 2].push(...run.pop()!);
      }
      pieces.push(...run.map(p => [...p].sort((a, b) => a - b)));
    }
    for (const at of all) {
      for (const d of [1, -1] as const) {
        for (const piece of pieces) {
          const stops = d > 0 ? piece : [...piece].reverse();
          const along = (piece[0] + piece[piece.length - 1]) / 2 - (axis ? cx : cz);
          if (piece == mid && near(lines).includes(at)) {
            lane(inner, axis, at, d, stops);
          } else if (Math.hypot(along, at - (axis ? cz : cx)) < MARKS) {
            lane(outer, axis, at, d, stops);
          }
        }
      }
    }
  }
  return [...pick(inner, CARS, 3), ...pick(outer, FAR_CARS, 5)];
};

/** The way a car faces: x and z. */
export const facing = ({ axis, d }: Car): [number, number] => (axis ? [d, 0] : [0, d]);

/** Where a car's centre is at time t, seconds: x and z, and its size, 0 to 1: it shrinks away on its last hop and grows back on its first, so the end of its road is not seen. */
export const carAt = (car: Car, t: number): [number, number, number] => {
  const { axis, at, d, stops, cell, slot } = car;
  const s = t - (axis * CYCLE) / 2;
  const n = Math.floor(s / CYCLE);
  const k = Math.min(Math.max((s - n * CYCLE - slot * LAG) / (GREEN - (SLOTS - 1) * LAG), 0), 1);
  const m = (((cell + n) % stops.length) + stops.length) % stops.length;
  const wait = (i: number) => stops[i] - d * (STOP + LENGTH / 2 + slot * GAP);
  const from = wait(m);
  const e = k * k * (3 - 2 * k);
  const along = from + ((m + 1 < stops.length ? wait(m + 1) : from + d * PITCH) - from) * e;
  const size = m + 1 == stops.length ? 1 - e : m ? 1 : e;
  return axis ? [along, at + d * LANE, size] : [at - d * LANE, along, size];
};

/** A flat polygon of 4 corners, wound as given. */
const quad = (out: number[], [a, b, c, d]: Vec3[], rgb: number[]) => {
  tri(out, a, b, c, rgb);
  tri(out, a, c, d, rgb);
};

/** A box tapering from the footprint `b` at y0 to `t` at y1 ([x0, x1, z0, z1] each): four sides and the top, wound outward. */
const hull = (
  out: number[],
  y0: number,
  y1: number,
  b: number[],
  t: number[],
  side: number[],
  roof: number[],
) => {
  const ring = ([x0, x1, z0, z1]: number[], y: number): Vec3[] => [
    [x0, y, z0],
    [x1, y, z0],
    [x1, y, z1],
    [x0, y, z1],
  ];
  const [lo, hi] = [ring(b, y0), ring(t, y1)];
  lo.forEach((p, i) => {
    const j = (i + 1) % 4;
    quad(out, [lo[j], p, hi[i], hi[j]], side);
  });
  quad(out, [hi[0], hi[3], hi[2], hi[1]], roof);
};

/** The car in model space (x right, y up, the front toward -z), white where the paint goes: the body, the cabin, the lamps. */
const [BODY, CABIN, LAMPS] = (() => {
  const [body, cabin, lamps] = [[], [], []] as number[][];
  const glass = [0.1, 0.13, 0.17];
  hull(body, 0.25, 0.85, [-0.95, 0.95, -2.2, 2.2], [-0.9, 0.9, -2.05, 2.05], [1, 1, 1], [1, 1, 1]);
  hull(cabin, 0.85, 1.4, [-0.82, 0.82, -0.6, 1.5], [-0.7, 0.7, -0.15, 1.05], glass, [1, 1, 1]);
  // A lamp is two small squares: on the end of the car, and on the top of the bonnet, which the sky sees.
  for (const [z, rgb] of [
    [-1, [1, 0.95, 0.75]],
    [1, [1, 0.08, 0.05]],
  ] as [number, number[]][]) {
    for (const x of [-0.6, 0.6]) {
      const from = lamps.length;
      const [e, f] = [z * 2.2, z * 2.1];
      const ends: Vec3[] = [
        [x + 0.3, 0.5, e],
        [x - 0.3, 0.5, e],
        [x - 0.3, 0.68, e],
        [x + 0.3, 0.68, e],
      ];
      quad(lamps, z < 0 ? ends : ends.reverse(), rgb);
      const top: Vec3[] = [
        [x - 0.3, 0.86, f],
        [x - 0.3, 0.86, f - z * 0.25],
        [x + 0.3, 0.86, f - z * 0.25],
        [x + 0.3, 0.86, f],
      ];
      quad(lamps, z < 0 ? top : top.reverse(), rgb);
      glow(lamps, from, 2.5);
    }
  }
  return [body, cabin, lamps];
})();
export const MODEL = { body: BODY, cabin: CABIN, lamps: LAMPS };

/**
 * The drawer of a world's traffic: appends the cars in view (in front of the camera, within FAR) at
 * time t, each BODY + CABIN + LAMPS vertices, the cabin only up to NEAR_CAR and the lamps up to LIT.
 */
export const traffic = (def: WorldDef) => {
  const list = cars(def);
  const k = scale(def);
  return (out: number[], eye: Vec3, fwd: Vec3, t: number) => {
    for (const car of list) {
      const [x, z, size] = carAt(car, t);
      const to = [x - eye[0], STREET - eye[1], z - eye[2]];
      const far = to[0] ** 2 + to[1] ** 2 + to[2] ** 2;
      if (
        size < 0.05 ||
        far > FAR ** 2 ||
        to[0] * fwd[0] + to[1] * fwd[1] + to[2] * fwd[2] < -LENGTH
      ) {
        continue;
      }
      const [fx, fz] = facing(car);
      const axes: Vec3[] = [
        [-fz, 0, fx],
        [0, 1, 0],
        [fx, 0, fz],
      ];
      // On the asphalt, which is raised with the distance (street.ts).
      const at: Vec3 = [x, STREET + 0.12 * k(x, z) ** 2, z];
      place(out, BODY, at, axes, [0, 0, 0], SIZE * size, PAINT[car.paint]);
      if (far < NEAR_CAR ** 2) {
        place(out, CABIN, at, axes, [0, 0, 0], SIZE * size, PAINT[car.paint]);
      }
      if (far < LIT ** 2) {
        place(out, LAMPS, at, axes, [0, 0, 0], SIZE * size);
      }
    }
  };
};
