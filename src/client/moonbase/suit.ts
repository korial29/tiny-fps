// The spacesuit on its stand by the second module's airlock (docs/MOON.md): rounded limbs with
// joint rings, a hard upper torso with its chest unit, the life support pack, gloves, boots and a
// helmet with a gold visor, on a round lit stand.
import { capsule, dress, place, segment } from '../mesh';
import { lit } from '../brick';
import type { Vec3 } from '../mesh';
import type { Out } from '../verts';
import { bevel } from './round';
import { AMBER, CYAN, GREEN, GREY, INK, IRON, RED, SNOW } from './constants';

/** Maps (u along the stand, y up from its foot, w out from its back) to the world. */
type Frame = (u: number, y: number, w: number) => Vec3;

const BALL = dress(capsule(0, [1, 1], 8, [1, 1]), [1, 1, 1]);
const LIMB = dress(capsule(1, [1, 1], 8, [0, 0]), [1, 1, 1]);
const DISC = dress(capsule(1, [1, 1], 12, [0, 0]), [1, 1, 1]);
/** The suit's fabric, a warm white, its seams and the visor's gold. */
const CLOTH = [0.9, 0.89, 0.86];
const GOLD = [0.85, 0.58, 0.18];
const STRIPE = [0.8, 0.16, 0.12];

/** The button() of props.ts: a round light at (u, v) on the face at w. */
type Button = (
  u: number,
  v: number,
  r: number,
  w: number,
  rgb: number[],
  k?: number,
  halo?: boolean,
) => void;

export const suit = (o: Out, P: Frame, button: Button) => {
  const [a0, a1] = [P(0, 0, 0), P(1, 0, 0)];
  /** The stand's u axis in the world: limbs' cross-sections are scaled along it. */
  const side: Vec3 = [a1[0] - a0[0], 0, a1[2] - a0[2]];
  const b1 = P(0, 0, 1);
  const axes: Vec3[] = [side, [0, 1, 0], [b1[0] - a0[0], 0, b1[2] - a0[2]]];
  const ball = (u: number, y: number, w: number, r: number, rgb: number[]) =>
    place(o, BALL, P(u, y, w), axes, [0, 0, 0], r, rgb);
  /** A limb from a to b (u, y, w), r its radius. */
  const tube = (
    a: number[],
    b: number[],
    r: number | [number, number],
    rgb: number[],
    mesh = LIMB,
  ) => segment(o, mesh, P(a[0], a[1], a[2]), P(b[0], b[1], b[2]), side, 1, r, rgb);
  /** A rounded limb: a tube with a ball at each end. */
  const limb = (a: number[], b: number[], r: number, rgb: number[], mesh = LIMB) => {
    tube(a, b, r, rgb, mesh);
    if (mesh == LIMB) {
      ball(a[0], a[1], a[2], r, rgb);
      ball(b[0], b[1], b[2], r, rgb);
    }
  };
  const mid = 0.5;
  const w = 0.52;
  // The stand: a dark round plinth with a lit ring round its top, and the pole at the back.
  limb([mid, 0, w], [mid, 0.07, w], 0.46, INK, DISC);
  lit(o, 1.5, () => limb([mid, 0.07, w], [mid, 0.075, w], 0.44, CYAN, DISC));
  limb([mid, 0.075, w], [mid, 0.08, w], 0.41, INK, DISC);
  limb([mid, 0.08, 0.1], [mid, 1.55, 0.1], 0.03, IRON);
  limb([mid, 1.4, 0.1], [mid, 1.4, 0.3], 0.025, IRON);
  const y0 = 0.08;
  for (const s of [-1, 1]) {
    const u = mid + s * 0.11;
    // Boot: a sole and a rounded toe-cap, then the gaiter.
    bevel(o, P(u - 0.065, y0, w - 0.1), P(u + 0.065, y0 + 0.04, w + 0.17), INK, 0.015);
    limb([u, y0 + 0.08, w - 0.05], [u, y0 + 0.08, w + 0.12], 0.07, GREY);
    limb([u, y0 + 0.08, w - 0.03], [u, y0 + 0.2, w - 0.02], 0.075, GREY);
    // Shin, knee ring, thigh, the knee a little forward.
    limb([u, y0 + 0.22, w - 0.02], [u, y0 + 0.5, w + 0.02], 0.075, CLOTH);
    limb([u, y0 + 0.48, w + 0.015], [u, y0 + 0.52, w + 0.02], 0.082, IRON, DISC);
    limb([u, y0 + 0.52, w + 0.02], [u + s * 0.01, y0 + 0.84, w - 0.01], 0.088, CLOTH);
    limb([u, y0 + 0.6, w + 0.02], [u, y0 + 0.63, w + 0.02], 0.091, STRIPE, DISC);
  }
  // Hips and the waist ring.
  limb([mid - 0.14, y0 + 0.86, w], [mid + 0.14, y0 + 0.86, w], 0.11, CLOTH);
  limb([mid, y0 + 0.92, w], [mid, y0 + 0.97, w], 0.17, IRON, DISC);
  // The hard upper torso, rounded, wider than deep, and the pack behind it.
  tube([mid, y0 + 0.97, w], [mid, y0 + 1.42, w], [0.2, 0.15], SNOW);
  place(o, BALL, P(mid, y0 + 1.36, w), axes, [0, 0, 0], [0.2, 0.14, 0.16], SNOW);
  bevel(o, P(mid - 0.2, y0 + 0.98, w - 0.36), P(mid + 0.2, y0 + 1.48, w - 0.13), GREY, 0.05);
  bevel(o, P(mid - 0.17, y0 + 1.46, w - 0.33), P(mid + 0.17, y0 + 1.52, w - 0.16), SNOW, 0.02);
  // The chest unit: a dark box with its lights.
  bevel(o, P(mid - 0.1, y0 + 1.06, w + 0.12), P(mid + 0.1, y0 + 1.18, w + 0.2), IRON, 0.015);
  button(mid - 0.05, y0 + 1.12, 0.014, w + 0.2, GREEN, 1.6, false);
  button(mid, y0 + 1.12, 0.014, w + 0.2, AMBER, 1.6, false);
  button(mid + 0.05, y0 + 1.12, 0.014, w + 0.2, RED, 1.6, false);
  for (const s of [-1, 1]) {
    const u = mid + s * 0.27;
    // Shoulder joint, upper arm with its stripe, elbow ring, forearm bent forward, glove.
    ball(mid + s * 0.22, y0 + 1.38, w, 0.095, CLOTH);
    limb([mid + s * 0.23, y0 + 1.34, w], [u, y0 + 1.08, w + 0.01], 0.068, CLOTH);
    limb([mid + s * 0.245, y0 + 1.25, w], [mid + s * 0.25, y0 + 1.22, w], 0.072, STRIPE, DISC);
    ball(u, y0 + 1.07, w + 0.01, 0.07, IRON);
    limb([u, y0 + 1.06, w + 0.02], [u - s * 0.02, y0 + 0.86, w + 0.12], 0.06, CLOTH);
    limb(
      [u - s * 0.02, y0 + 0.86, w + 0.12],
      [u - s * 0.02, y0 + 0.84, w + 0.13],
      0.064,
      IRON,
      DISC,
    );
    ball(u - s * 0.025, y0 + 0.79, w + 0.15, 0.058, GREY);
  }
  // Neck ring, helmet shell and the gold visor bulging out of its front.
  limb([mid, y0 + 1.47, w], [mid, y0 + 1.52, w], 0.12, IRON, DISC);
  ball(mid, y0 + 1.66, w, 0.16, SNOW);
  lit(o, 0.5, () => ball(mid, y0 + 1.65, w + 0.05, 0.118, GOLD));
  limb([mid - 0.1, y0 + 1.79, w + 0.02], [mid + 0.1, y0 + 1.79, w + 0.02], 0.022, SNOW);
  lit(o, 1.4, () => {
    ball(mid - 0.1, y0 + 1.75, w + 0.1, 0.018, [1, 0.95, 0.8]);
    ball(mid + 0.1, y0 + 1.75, w + 0.1, 0.018, [1, 0.95, 0.8]);
  });
};
