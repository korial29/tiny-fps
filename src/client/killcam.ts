// The camera of a glory kill (the user, 2026-11-16): out of the killer's head, it watches the two
// from the side, turning slowly round them, while the xenomorph holds and eats its prey or the
// katana's beheaded foe flies back, then comes back to the eye. Pure, no DOM, unit-tested.
import { GLORY_TICKS, TICK_HZ } from '../shared/constants';
import { ground } from '../shared/relief';
import { ray } from '../shared/world';
import type { World } from '../shared/world';
import type { Vec3 } from './mesh';

export const KILLCAM = {
  /** The pivot over the two's feet, the camera back from it on the floor plane and up over it: metres. */
  UP: 1.1,
  BACK: 3.4,
  RISE: 1.1,
  /** The camera's side angle from behind the killer at the start (rad), and the turn it makes over SPAN. */
  FROM: 1.15,
  SWEEP: 0.8,
  /** Seconds the turn takes: a xenomorph's lock and the hold after the kill. */
  SPAN: GLORY_TICKS / TICK_HZ + 1.1,
  /** Seconds the camera stays after the kill: the head eaten, or the body thrown back. */
  HOLD: 1.1,
  /** Seconds from the eye to the side, and back. */
  BLEND: 0.25,
  /** The camera is a ball of this radius for the ground and the brushes. */
  PAD: 0.3,
} as const;

/**
 * Whether the xenomorph's vision (grey-blue world, glowing enemies) is on with the kill camera `k`
 * of the way out: it is its eyes', so out of its head the world and the prey keep their colours
 * (the user, 2026-11-16), from halfway out.
 */
export const sees = (xeno: boolean, k: number): boolean => xeno && k < 0.5;

/** What a frame is drawn from. */
export interface Kill {
  at: Vec3;
  yaw: number;
  pitch: number;
  /** 0 at the eye to 1 out of it, eased. */
  k: number;
}

export interface KillCam {
  /**
   * Advances dt seconds. `pair` is the killer's feet and the victim's while the kill is shown,
   * undefined after; `yaw` is the killer's look, `eye` the first-person camera.
   */
  frame(pair: [Vec3, Vec3] | undefined, yaw: number, eye: Vec3, dt: number): Kill;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
const ease = (u: number) => u * u * (3 - 2 * u);

export const createKillCam = (world: World): KillCam => {
  let k = 0;
  /** Seconds into the shot, the killer's look at its start and the side it watches from (±1). */
  let t = 0;
  let base = 0;
  let side = 0;
  /** The last frame's pivot and camera: the way back to the eye keeps them. */
  let pivot: Vec3 = [0, 0, 0];
  let cam: Vec3 = [0, 0, 0];

  /** The room from `o` along the floor-plane angle `a` and up to the camera, PAD short of a brush. */
  const room = (o: Vec3, a: number, back: number): [Vec3, number] => {
    const d: Vec3 = [Math.sin(a) * back, KILLCAM.RISE, Math.cos(a) * back];
    const len = Math.hypot(d[0], d[1], d[2]);
    const dir = d.map(c => c / len) as Vec3;
    return [dir, Math.min(len, ray(world, o, dir, len, KILLCAM.PAD))];
  };

  return {
    frame(pair, yaw, eye, dt) {
      k = clamp(k + (pair ? dt : -dt) / KILLCAM.BLEND, 0, 1);
      if (!k) {
        side = 0;
        return { at: eye, yaw, pitch: 0, k: 0 };
      }
      if (pair) {
        // Far enough to keep both in the view as the katana's foe flies off.
        const apart = Math.hypot(pair[1][0] - pair[0][0], pair[1][2] - pair[0][2]);
        const back = Math.max(KILLCAM.BACK, apart + 1.5);
        pivot = [0, 1, 2].map(i => (pair[0][i] + pair[1][i]) / 2) as Vec3;
        pivot[1] += KILLCAM.UP;
        // A new shot: from the side with more room, behind the killer's shoulder.
        if (!side) {
          [t, base] = [0, yaw];
          side =
            room(pivot, yaw + KILLCAM.FROM, back)[1] >= room(pivot, yaw - KILLCAM.FROM, back)[1]
              ? 1
              : -1;
        }
        t += dt;
        const a =
          base + side * (KILLCAM.FROM + KILLCAM.SWEEP * ease(Math.min(t / KILLCAM.SPAN, 1)));
        const [dir, len] = room(pivot, a, back);
        cam = pivot.map((v, i) => v + dir[i] * len) as Vec3;
        cam[1] = Math.max(cam[1], ground(world, cam[0], cam[2]) + KILLCAM.PAD);
      }
      const d = pivot.map((v, i) => v - cam[i]);
      const flat = Math.hypot(d[0], d[2]);
      const e = ease(k);
      return {
        at: eye.map((v, i) => v + (cam[i] - v) * e) as Vec3,
        // Looking at the pivot: forward(yaw) is (-sin yaw, -cos yaw).
        yaw: Math.atan2(-d[0], -d[2]),
        pitch: Math.atan2(d[1], flat || 1),
        k: e,
      };
    },
  };
};
