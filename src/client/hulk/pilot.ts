import { STILL } from '../../shared/physics';
import { MODE } from '../../shared/types';
import type { PlayerState } from '../../shared/types';
import { JOINT as J, PARENT, axis, mul, solve } from '../rig';
import type { Vec3 } from '../mesh';
import { createRunner, soldier } from '../soldier';
import { ink, o, off } from './common';
import { ball, slab, turn } from './shapes';

// ---------------------------------------------------------------------------------------------
// The captain (the user, 2026-11-27: a dead pilot in the captain's seat, the marine's body
// without its armour): still strapped in the left seat, sat as a rover's rider sits, slumped
// forward and toward the window, the head on the chest. His cap lies on the floor behind the
// seat. Posed once and baked into the hulk.

/** His shirt, white; navy cap, its black peak and gold badge. */
const SHIRT = [0.8, 0.81, 0.83];
const NAVY = ink([0.05, 0.06, 0.1]);
const SHOE = ink([0.03, 0.03, 0.035]);
const GOLD = ink([0.55, 0.42, 0.12]);

const F = [1, 0, 0];
const U = [0, 1, 0];
const S = [0, 0, 1];

/** How far over the seat point the rider's pose sits on its cushion (gait.test.ts' CUSHION). */
const CUSHION = 0.13;
/** A sixtieth of a second: a second of them settles the gait's springs. */
const DT = 1 / 60;

/** The captain, seated with the middle of his seat's cushion at (x, y, z) (y the cushion's top), facing +x. */
export const captain = (x: number, y: number, z: number) => {
  const p: PlayerState = {
    id: 1,
    x,
    y: y - CUSHION,
    z,
    vy: 0,
    // Yaw zero faces -z: -π/2 faces +x, the nose.
    yaw: -Math.PI / 2,
    pitch: -0.6,
    ground: false,
    ...STILL,
    mode: MODE.RIDE,
    ammo: 0,
    fists: true,
  };
  const r = createRunner(p, undefined, 0, undefined, true);
  for (let i = 0; i < 60; i++) {
    r.gait.update(p, DT);
  }
  const pose = r.gait.pose();
  const rot = pose.rot.slice();
  const bend = (j: number, a: Vec3, t: number) => (rot[j] = mul(rot[j], axis(a, t)));
  // Slumped forward and to his left, the window's side, held only by the harness; the head
  // fallen on the chest and rolled over.
  bend(J.SPINE, [1, 0, 0], -0.4);
  bend(J.CHEST, [1, 0, 0], -0.35);
  bend(J.CHEST, [0, 0, 1], 0.22);
  bend(J.NECK, [1, 0, 0], -0.6);
  bend(J.HEAD, [1, 0, 0], -0.5);
  bend(J.HEAD, [0, 0, 1], 0.5);
  // The right arm limp over the armrest, by the pedestal: the upper arm out over it, the forearm
  // and the hand hanging straight down. Each set in the world, then brought into its parent's frame.
  const hang = (j: number, out: number) => {
    const [x, y, z, w] = solve({ ...pose, rot }).rot[PARENT[j]];
    rot[j] = mul([-x, -y, -z, w], mul(axis([0, 1, 0], pose.yaw), axis([0, 0, 1], out)));
  };
  hang(J.ARM_R, 0.5);
  hang(J.FOREARM_R, 0.05);
  hang(J.HAND_R, 0);
  const still = { ...pose, rot };
  r.gait = { ...r.gait, pose: () => still };
  const from = o.length;
  soldier(o, r, SHIRT, 1, false, false);
  // Without the glow of the spare battery in his pouch (pouch.ts): the dead show no light.
  const kept = [];
  for (let i = from; i < o.length; i += 3 * STRIDE) {
    if (o[i + 8] != GLOW && o[i + STRIDE + 8] != GLOW && o[i + 2 * STRIDE + 8] != GLOW) {
      kept.push(...o.slice(i, i + 3 * STRIDE));
    }
  }
  o.length = from;
  o.push(...kept);
};

/** Floats a vertex, and the layer of an unlit glow (put() in common.ts). */
const STRIDE = 10;
const GLOW = -2;

/** The captain's cap on the floor at (x, y, z), turned `t` round the vertical: its domed crown, the black peak rounded at its front, the round badge. */
export const cap = (x: number, y: number, z: number, t: number) => {
  const ax = turn([F, U, S], U, t);
  const c = [x, y, z];
  ball(c, ax, [0.13, 0.09, 0.12], NAVY, 6, 12);
  const flat = [ax[0], ax[2], ax[1]];
  slab(c, flat, [0.06, -0.1, 0], [0.2, 0.1, 0.015], [0, 0.07, 0.07, 0], SHOE, SHOE, 3);
  ball(off(off(c, ax[0], 0.095), U, 0.06), [ax[1], ax[0], ax[2]], [0.02, 0.005, 0.02], GOLD, 2, 8);
};
