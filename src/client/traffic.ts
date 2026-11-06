// The cars of the street: a few dozen, deterministic from the clock alone (the wall clock, so every
// client sees the same ones), with no state. Each axis of roads has its own green: during it a car
// hops from the stop line before one crossing to the one before the next, with an ease, and waits
// there while the other axis has its green, so no two cars ever meet at a crossing. Cars keep
// their lane and their order; at the end of a road a car is carried back to its start, out in the
// haze.
import type { WorldDef } from '../shared/world';
import { glow, tri } from './flag';
import { place } from './mesh';
import type { Vec3 } from './mesh';
import { PITCH, ROAD, STREET, grid } from './street';
import { hash } from './textures';

/** How much bigger than a real car (4.4 m) the cars are drawn: they are seen from 100 m up. */
const SIZE = 1.3;
/** Cars on the street. */
export const CARS = 64;
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
/** Beyond this distance a car is not drawn, beyond NEAR_CAR it has no cabin. */
const FAR = 260;
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

/** The cars of a world: CARS of the lanes' places, taken in the order of a hash, always the same. */
export const cars = (def: WorldDef): Car[] => {
  const { xs, zs } = grid(def);
  /** The two roads each side of the play area: the traffic stays round it, where it is seen. */
  const near = (lines: number[]) => lines.slice(lines.length / 2 - 2, lines.length / 2 + 2);
  const all: Car[] = [];
  for (const [axis, lines, cross] of [
    [0, xs, zs],
    [1, zs, xs],
  ] as const) {
    for (const at of near(lines)) {
      for (const d of [1, -1] as const) {
        const stops = d > 0 ? near(cross) : near(cross).reverse();
        stops.forEach((_, cell) =>
          Array.from({ length: SLOTS }, (_, slot) =>
            all.push({ axis, at, d, stops, cell, slot, paint: 0 }),
          ),
        );
      }
    }
  }
  return all
    .map((c, i) => [hash(i, c.cell, 3), c, hash(i, 1, 4)] as const)
    .sort((a, b) => a[0] - b[0])
    .slice(0, CARS)
    .map(([, c, p]) => ({ ...c, paint: Math.floor(p * PAINT.length) }));
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
 * time t. At most CARS of them, each BODY + CABIN + LAMPS vertices (the cabin only up to NEAR_CAR).
 */
export const traffic = (def: WorldDef) => {
  const list = cars(def);
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
      const at: Vec3 = [x, STREET + 0.12, z];
      place(out, BODY, at, axes, [0, 0, 0], SIZE * size, PAINT[car.paint]);
      if (far < NEAR_CAR ** 2) {
        place(out, CABIN, at, axes, [0, 0, 0], SIZE * size, PAINT[car.paint]);
      }
      place(out, LAMPS, at, axes, [0, 0, 0], SIZE * size);
    }
  };
};
