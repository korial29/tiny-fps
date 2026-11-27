// The rover placed in the world: its kit per level of detail, the wheels on their springs, the
// wishbones and coil-overs stretched between their ends, the yoke turning, the damage shown.
import { forward } from '../../shared/physics';
import { ROVER, seat, wheels } from '../../shared/rover';
import type { PlayerState, Rover } from '../../shared/types';
import type { World } from '../../shared/world';
import { STRIDE, add, aim, basis, dress, place, segment, smooth, sub } from '../mesh';
import type { Vec3 } from '../mesh';
import type { Out } from '../verts';
import { char, pose } from '../wreck';
import { AT, CARRIER, DAMPER, GEAR, LENS, STEEL, TOWER, YOKE } from './constants';
import { body } from './body';
import { LINK, TUBE } from './mesh';
import { fender, wheel, yoke } from './parts';

const { WR, L0 } = ROVER;

interface Kit {
  level: number;
  body: number[];
  team: number[];
  wheel: number[];
  fender: number[];
  yoke: number[];
  coil: number[];
}

const kits = new Map<number, Kit>();

const kit = (lod: number): Kit => {
  const level = Math.max(0, Math.min(lod, 2)) | 0;
  let k = kits.get(level);
  if (!k) {
    // The spring: bands of the team's colour and dark, which close up as it is squeezed.
    const coil = dress(
      smooth(
        [0, 1, 2, 3, 4].map(i => [1, i / 4]),
        3,
      ),
      [1, 1, 1],
    );
    for (let i = 0; i < coil.length; i += STRIDE) {
      if (Math.floor(i / (18 * STRIDE)) % 2) {
        [coil[i + 6], coil[i + 7], coil[i + 9]] = [0.15, 0.15, 0.15];
      }
    }
    const [b, team] = body(level);
    k = {
      level,
      body: b,
      team,
      wheel: wheel(level),
      fender: fender(level + 1),
      yoke: level > 1 ? yoke() : [],
      coil,
    };
    kits.set(level, k);
  }
  return k;
};

/**
 * How far each wheel's spring is squeezed, metres in 0..CMAX, in AT's order: the simulation's own
 * (wheels() in shared/rover.ts), from the state and the world alone. 0 is a wheel hanging in the air.
 */
export const springs = (r: Rover, w: World): number[] => wheels(r, w).map(k => k[3]);

/**
 * The seats, driver then rider, as the simulation has them (seat()): metres right of the body's
 * centre, above it (the feet of who sits) and ahead of it.
 */
export const SEATS: Vec3[] = ([0, 1] as const).map(s => {
  const p = {} as PlayerState;
  seat(p, { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0 } as Rover, s);
  return [p.x, p.y, -p.z];
});

/**
 * The middles of the yoke's two grips, left then right, with the front wheels turned by `steer`:
 * metres right of, above and ahead of the driver's seat point, in the body's frame.
 */
export const grips = (steer: number): Vec3[] => {
  // The column runs down and ahead; the bar turns about it.
  const l = Math.hypot(0.14, 0.28);
  const [fy, fa] = [-0.14 / l, 0.28 / l];
  const [c, s] = [Math.cos(steer * GEAR), Math.sin(steer * GEAR)];
  return [-1, 1].map(k => {
    // Along the bar (x right, then up across the column), to the middle of a grip.
    const [x, u] = [k * 0.17 * c + 0.04 * s, 0.04 * c - k * 0.17 * s];
    return [
      YOKE[0] + x - SEATS[0][0],
      YOKE[1] + u * fa - SEATS[0][1],
      YOKE[2] - u * fy - 0.013 - SEATS[0][2],
    ] as Vec3;
  });
};

/** Radians a wreck's wheels lean in by at the top. */
const SPLAY = 0.3;
/** Metres a rover moves in a frame, at the least, when it is put back on its spawn: its wheels do not turn for it. */
const PUT_BACK = 5;

/**
 * Radians the wheels roll as the rover goes from (x, z) to where it is now: the distance along its
 * nose over the wheel's radius, negative in reverse. Sliding sideways turns nothing.
 */
export const rolled = (x: number, z: number, r: Rover): number => {
  const [fx, fz] = forward(r.yaw);
  const [dx, dz] = [r.x - x, r.z - z];
  return dx * dx + dz * dz > PUT_BACK * PUT_BACK ? 0 : (dx * fx + dz * fz) / WR;
};

/** The rover's frame in the world: where a point right, up and ahead of its centre is, and its axes. */
const frame = (r: Rover): [(x: number, y: number, a: number) => Vec3, Vec3[]] => {
  const axes = basis(r.yaw, r.pitch, r.roll);
  const [R, U, F] = axes;
  return [
    (x, y, a) => [
      r.x + R[0] * x + U[0] * y + F[0] * a,
      r.y + R[1] * x + U[1] * y + F[1] * a,
      r.z + R[2] * x + U[2] * y + F[2] * a,
    ],
    axes,
  ];
};

/** The middle of each headlight's lens in the world, left then right: they shine along basis(yaw, pitch, roll)[2]. */
export const headlights = (r: Rover): Vec3[] => {
  const [to] = frame(r);
  return [-1, 1].map(s => to(s * LENS[0], LENS[1], LENS[2]));
};

/** Where each tyre meets the ground, in AT's order: under its hub. A wheel in the air (springs() gives 0) has none: this is then the bottom of its tyre. */
export const contacts = (r: Rover, w: World): Vec3[] => {
  const [to] = frame(r);
  return springs(r, w).map((c, i) => {
    const [x, y, z] = to(AT[i][1], c - L0, AT[i][0]);
    return [x, y - WR, z];
  });
};

/**
 * Appends the rover at level of detail `lod` (0 far, 1 mid, 2 and up near: the caller picks the
 * distances) as the state has it: the body pitched and rolled, each wheel on its spring over the
 * world's floor, turned by `spin` radians (the distance driven over WR) and the front pair by
 * `steer`, the wishbones and the coil-overs following, the yoke turning with the wheels. `rgb` is
 * the team's colour (0 to 1): the fenders, the bonnet's stripe, the springs and the whip's light.
 * Its damage shows (wreck.ts, `n` its index among the map's vehicles): scorched where it arcs; a
 * wreck sagged on splayed wheels, charred, falling apart at the end.
 */
export const rover = (
  out: Out,
  state: Rover,
  w: World,
  spin: number,
  rgb: number[],
  lod: number,
  n = 0,
): void => {
  const k = kit(lod);
  const start = out.length;
  const r = pose(state);
  // A wreck's wheels lean in at the top.
  const [cc, sc] = r === state ? [1, 0] : [Math.cos(SPLAY), Math.sin(SPLAY)];
  const [to, axes] = frame(r);
  const [R, U, F] = axes;
  const at: Vec3 = [r.x, r.y, r.z];
  const O: Vec3 = [0, 0, 0];
  place(out, k.body, at, axes, O, 1);
  place(out, k.team, at, axes, O, 1, rgb);
  if (k.yoke.length) {
    const [x, y, f] = aim(
      to(0, -0.14, 0.28).map((v, i) => (v - at[i]) / Math.hypot(0.14, 0.28)) as Vec3,
      R,
    );
    const [c, s] = [Math.cos(r.steer * GEAR), Math.sin(r.steer * GEAR)];
    place(
      out,
      k.yoke,
      to(...YOKE),
      [x.map((v, i) => v * c - y[i] * s) as Vec3, y.map((v, i) => v * c + x[i] * s) as Vec3, f],
      O,
      1,
    );
  }
  const [cs, ss] = [Math.cos(spin), Math.sin(spin)];
  springs(r, w).forEach((c, i) => {
    const [a, b] = AT[i];
    const s = Math.sign(b);
    const h = c - L0;
    const hub = to(b, h, a);
    // The front wheels turn about the body's up, then every wheel rolls about its own axle.
    const [ct, st] = a > 0 ? [Math.cos(r.steer) * s, Math.sin(r.steer) * s] : [s, 0];
    const flat = R.map((v, j) => v * ct - F[j] * st) as Vec3;
    const ahead = F.map((v, j) => v * ct + R[j] * st) as Vec3;
    const right = flat.map((v, j) => v * cc + U[j] * sc) as Vec3;
    const up = U.map((v, j) => v * cc - flat[j] * sc) as Vec3;
    place(
      out,
      k.wheel,
      hub,
      [
        right,
        up.map((v, j) => v * cs + ahead[j] * ss * s) as Vec3,
        ahead.map((v, j) => v * cs - up[j] * ss * s) as Vec3,
      ],
      O,
      1,
    );
    place(out, k.fender, hub, [flat, U, ahead], O, 1, rgb);
    if (!k.level) {
      return;
    }
    const foot = to(s * (CARRIER - 0.08), h - 0.11, a);
    const top = to(s * TOWER[0], TOWER[1], a);
    const low = to(s * CARRIER, h - 0.13, a);
    if (k.level < 2) {
      segment(out, LINK, to(s * 0.36, -0.42, a), low, U, 1, 0.04, STEEL);
      segment(out, LINK, top, foot, F, 1, 0.06, STEEL);
      return;
    }
    for (const e of [-0.26, 0.26]) {
      segment(out, LINK, to(s * 0.36, -0.42, a + e), low, U, 1, 0.03, STEEL);
    }
    const high = to(s * CARRIER, h + 0.13, a);
    segment(out, LINK, to(s * 0.4, -0.12, a), high, U, 1, 0.025, STEEL);
    // The coil-over: a body of a fixed length from the tower, and the spring from its middle to the wishbone.
    const d = sub(foot, top);
    const l = Math.hypot(...d);
    const along = (m: number) => add(top, d.map(v => (v * m) / l) as Vec3);
    segment(out, TUBE, top, along(DAMPER), F, 1, 0.05, STEEL);
    segment(out, k.coil, along(DAMPER - 0.14), foot, F, 1, 0.075, rgb);
  });
  char(out, start, state, n);
};
