// The chase camera of a rover: behind and above it along the driver's look, trailing it on a
// spring, never under the ground nor through a brush. Pure, no DOM, unit-tested.
import { ground } from '../shared/relief';
import { ROVER } from '../shared/rover';
import type { Rover } from '../shared/types';
import { ray } from '../shared/world';
import type { World } from '../shared/world';
import type { Vec3 } from './mesh';
import { damp } from './spring';

export const CHASE = {
  /** The pivot above the rover's centre, the camera behind it along the look, and above that line: metres. */
  UP: 1.6,
  BACK: 6.5,
  RISE: 0.6,
  /** The spring the pivot trails the rover on, and the one the camera backs out on after a wall pulled it in (1 / s). */
  W: 16,
  OUT: 5,
  /** The camera is a ball of this radius for the ground and the brushes. */
  PAD: 0.3,
  /** Seconds from the eye to the chase view, and back. */
  BLEND: 0.3,
  /** The look's pitch at the wheel: down onto the rover, up no further than the camera stays over flat ground. */
  LO: -1,
  HI: 0.3,
  /** Degrees of field of view added at the top speed, and how fast they come (1 / s). */
  FOV: 10,
  FOV_W: 4,
} as const;

/** What a frame is drawn from. */
export interface Shot {
  at: Vec3;
  pitch: number;
  /** Degrees added to the field of view, by the rover's speed. */
  fov: number;
  /** 0 at the eye to 1 in the chase view, eased. */
  k: number;
}

export interface Chase {
  /**
   * Advances dt seconds. `seated` while the own player drives `r`; after he gets out, `r` is still
   * the rover he left until `k` is back to 0. `eye` and `tilt` are the first-person camera and its
   * pitch, `yaw` and `pitch` the look.
   */
  frame(
    r: Rover | undefined,
    seated: boolean,
    eye: Vec3,
    tilt: number,
    yaw: number,
    pitch: number,
    dt: number,
  ): Shot;
}

/** A rover that moved this far (m) in a frame was put somewhere else. */
const LEAP = 10;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** The look's pitch as the chase camera takes it. */
export const chasePitch = (pitch: number): number => clamp(pitch, CHASE.LO, CHASE.HI);

export const createChase = (world: World): Chase => {
  /** The rover's centre as trailed: x, its speed, y, its speed, z, its speed. Empty on foot. */
  let s: number[] = [];
  /** The rover's centre at the last frame. */
  let was: Vec3 = [0, 0, 0];
  /** The camera's distance from the pivot and its speed, and the field of view's. */
  let far = [-1, 0];
  const fov = [0, 0];
  let k = 0;

  /** From a toward b, stopped PAD short of the ground and the brushes. */
  const reach = (a: Vec3, b: Vec3): [dir: Vec3, len: number, free: number] => {
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const len = Math.hypot(d[0], d[1], d[2]);
    if (!len) {
      return [[0, 1, 0], 0, 0];
    }
    const dir = d.map(c => c / len) as Vec3;
    return [dir, len, ray(world, a, dir, len, CHASE.PAD)];
  };

  return {
    frame(r, seated, eye, tilt, yaw, pitch, dt) {
      k = clamp(k + (seated && r ? dt : -dt) / CHASE.BLEND, 0, 1);
      if (!r || !k) {
        s = [];
        fov[0] = fov[1] = 0;
        return { at: eye, pitch: tilt, fov: 0, k: 0 };
      }
      const c: Vec3 = [r.x, r.y, r.z];
      // A rover parked again, or another one: no trail across the map.
      if (!s.length || Math.hypot(r.x - was[0], r.y - was[1], r.z - was[2]) > LEAP) {
        s = [r.x, 0, r.y, 0, r.z, 0];
        was = c;
        far = [-1, 0];
      }
      // The spring follows the rover's way from the last frame to this one, not its end alone: the
      // trail is the same length at any frame rate (2 v / W behind at a steady v).
      const soft = c.map((v, i) => {
        const u = dt > 0 ? (v - was[i]) / dt : 0;
        const lag = (2 * u) / CHASE.W;
        const z = [s[i * 2] - was[i] + lag, s[i * 2 + 1] - u];
        damp(z, 0, 0, CHASE.W, dt);
        s[i * 2 + 1] = z[1] + u;
        return (s[i * 2] = v + z[0] - lag);
      }) as Vec3;
      was = c;
      // The pivot, no further from the rover than what is over it lets it.
      const [up, , top] = reach(c, [soft[0], soft[1] + CHASE.UP, soft[2]]);
      const pivot = c.map((v, i) => v + up[i] * top) as Vec3;
      const p = chasePitch(pitch);
      const cp = Math.cos(p);
      const [dir, len, free] = reach(pivot, [
        pivot[0] + Math.sin(yaw) * cp * CHASE.BACK,
        pivot[1] - Math.sin(p) * CHASE.BACK + CHASE.RISE,
        pivot[2] + Math.cos(yaw) * cp * CHASE.BACK,
      ]);
      // Pulled in at once, let out softly.
      if (far[0] < 0 || free <= far[0]) {
        far = [free, 0];
      } else {
        damp(far, 0, free, CHASE.OUT, dt);
      }
      const at = pivot.map((v, i) => v + dir[i] * Math.min(far[0], len)) as Vec3;
      at[1] = Math.max(at[1], ground(world, at[0], at[2]) + CHASE.PAD);
      const wide = damp(
        fov,
        0,
        CHASE.FOV * clamp(Math.hypot(r.vx, r.vz) / ROVER.VMAX, 0, 1),
        CHASE.FOV_W,
        dt,
      );
      const e = k * k * (3 - 2 * k);
      return {
        at: at.map((v, i) => eye[i] + (v - eye[i]) * e) as Vec3,
        pitch: p + (tilt - p) * (1 - e),
        fov: wide * e,
        k: e,
      };
    },
  };
};
