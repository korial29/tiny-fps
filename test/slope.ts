// Test helper: grounds that are not flat, for the rover. A relief with no hole, flat at y = 0 where
// its `at` says nothing else, the brushes standing on it; and a rover driven on it step by step.
import { onWire } from '../src/shared/protocol';
import { drive, park, wheels } from '../src/shared/rover';
import { KEY, TEX } from '../src/shared/types';
import type { Rover } from '../src/shared/types';
import { build } from '../src/shared/world';
import type { Brush, Spawn, World } from '../src/shared/world';
import type { ReliefDef } from '../src/shared/relief';
import { duo } from './teams';

type Vec3 = [number, number, number];
export const box = (min: Vec3, max: Vec3): Brush => ({ min, max, top: TEX.STONE, side: TEX.STONE });

/** The rise of a slope of `deg` degrees over one metre. */
export const rise = (deg: number): number => Math.tan((deg * Math.PI) / 180);

/** A world of relief alone, bounded 300 m round the origin: the moon's half gravity unless told. */
export const land = (
  at: ReliefDef['at'] = () => 0,
  brushes: Brush[] = [],
  gravity = 0.5,
  rovers?: Spawn[],
): World =>
  build({
    brushes,
    teams: duo([[0, 0, 0, 0]]),
    floor: -20,
    sun: { dir: [0, 1, 0], color: [1, 1, 1] },
    sky: [
      [0, 0, 1],
      [1, 1, 1],
    ],
    gravity,
    relief: { hole: [0, 0, 0, 0], bound: [0, 0, 300, 300], cell: 4, at },
    rovers,
  });

/** A ramp of `deg` degrees up toward +x, from x = 40 to x = 60, 16 m wide, and a drop behind it. */
export const ramp =
  (deg: number): ReliefDef['at'] =>
  (x, z) =>
    x >= 40 && x <= 60 && z >= -8 && z <= 8 ? (x - 40) * rise(deg) : 0;

/** A hillside of `deg` degrees up toward +x, from x = 20 on. */
export const hill =
  (deg: number): ReliefDef['at'] =>
  x =>
    x > 20 ? (x - 20) * rise(deg) : 0;

/** A rover of world `w` put down on (x, z), its nose to `yaw`, and left `settle` steps to sit on its springs. */
export const rover = (w: World, x: number, z: number, yaw = 0, settle = 60): Rover => {
  const y = Math.max(0, w.def.relief ? w.def.relief.at(x, z) : 0);
  const [r] = park({ ...w, def: { ...w.def, rovers: [[x, y, z, yaw]] } });
  rest(r, w, settle);
  return r;
};

/** `n` steps with nobody at the wheel. */
export const rest = (r: Rover, w: World, n: number): void => {
  for (let k = 0; k < n; k++) {
    drive(r, undefined, w);
  }
};

/** `n` steps with the keys held and the look at `yaw`, as the wire rounds them. Returns whether it fell. */
export const run = (r: Rover, w: World, n: number, keys = 0, yaw = r.yaw): boolean => {
  const i = onWire({ seq: 0, keys, yaw, pitch: 0 });
  let fell = false;
  for (let k = 0; k < n; k++) {
    fell = drive(r, i, w) || fell;
  }
  return fell;
};

/** The speed along the nose and to its right, and the whole speed on the floor plane. */
export const speeds = (r: Rover): { along: number; across: number; all: number } => {
  const [fx, fz] = [-Math.sin(r.yaw), -Math.cos(r.yaw)];
  return {
    along: r.vx * fx + r.vz * fz,
    across: r.vz * fx - r.vx * fz,
    all: Math.sqrt(r.vx * r.vx + r.vz * r.vz),
  };
};

/** Full throttle straight on until the rover does `v` m/s. Returns the steps it took. */
export const upTo = (r: Rover, w: World, v: number): number => {
  let n = 0;
  while (speeds(r).along < v && n < 1200) {
    run(r, w, 1, KEY.FORWARD);
    n++;
  }
  return n;
};

/** Whether no wheel is on a floor. */
export const flying = (r: Rover, w: World): boolean => wheels(r, w).every(([, , , c]) => c === 0);

/** The angle from the nose to `yaw`, in (-π, π]: positive to the left. */
export const off = (r: Rover, yaw: number): number =>
  Math.atan2(Math.sin(yaw - r.yaw), Math.cos(yaw - r.yaw));
