// Procedural monsters: boxes and one lathe, in the renderer's vertex format. Pure functions of the
// pose, no state, no DOM. A monster's (x, y, z) is the bottom of its body.
import { BULLET_R, FLYER_H, FLYER_R, WALKER_H } from '../shared/constants';
import { TAU } from '../shared/physics';
import type { Bullet, Monster } from '../shared/types';
import { lathe } from './gun';
import { basis, dress, place, pushBox } from './mesh';
import type { Vec3 } from './mesh';

/** Seconds a walker's blow takes. */
export const SWING = 0.3;
/** Limb phase per metre walked: a full stride every 1.75 m. */
export const GAIT = 3.6;

/** Flat colours, shared with the gibs. Eyes are the unlit layer: they glow in the dark. */
export const COLOR = {
  body: [0.2, 0.17, 0.19],
  arm: [0.3, 0.2, 0.18],
  leg: [0.13, 0.12, 0.15],
  head: [0.32, 0.24, 0.22],
  shell: [0.26, 0.14, 0.22],
  fin: [0.42, 0.2, 0.2],
  calm: [0.6, 0.05, 0.04],
  chase: [1, 0.3, 0.15],
  blob: [1, 0.3, 0.05],
  core: [1, 0.8, 0.4],
};

/** What a monster of each MONSTER kind bursts into. */
export const CHUNKS = [
  [COLOR.body, COLOR.arm, COLOR.leg, COLOR.head, COLOR.chase],
  [COLOR.shell, COLOR.fin, COLOR.shell, COLOR.chase],
];

const eyes = (chase: boolean) => (chase ? COLOR.chase : COLOR.calm);

/** Local (right, up, forward) of a monster, to the world: forward is forward(yaw). */
const at = ({ x, y, z, yaw }: Monster, r: number, u: number, f: number): Vec3 => {
  const [s, c] = [Math.sin(yaw), Math.cos(yaw)];
  return [x + r * c - f * s, y + u, z - r * s - f * c];
};

/**
 * A box hanging from `hip`, swung forward by `angle` radians about the monster's right axis, like
 * a pendulum.
 */
const limb = (
  out: number[],
  hip: Vec3,
  yaw: number,
  angle: number,
  half: Vec3,
  color: number[],
) => {
  const box: number[] = [];
  pushBox(box, [0, -half[1], 0], half, 0, color);
  place(out, box, hip, basis(yaw, angle), [0, 0, 0], 1);
};

/** Arm angle during a blow, `s` in (0, 1] the share of SWING elapsed: wind up, then strike. */
export const strike = (s: number) =>
  s < 0.25 ? -0.8 * Math.sin(s * 4 * Math.PI) : 2 * Math.sin(((s - 0.25) * Math.PI) / 0.75);

/**
 * Appends a walker: `walked` is the distance it has covered (the limbs swing with it, so a
 * standing one is still), `blow` the share of SWING elapsed, 0 when not swinging.
 */
export const walker = (out: number[], m: Monster, walked: number, blow: number) => {
  const swing = Math.sin(walked * GAIT) * 0.6;
  const hips = WALKER_H * 0.44;
  const shoulders = WALKER_H * 0.8;
  const [left, right] = [-1, 1].map(side => at(m, side * 0.16, hips, 0));
  limb(out, left, m.yaw, swing, [0.09, hips / 2, 0.09], COLOR.leg);
  limb(out, right, m.yaw, -swing, [0.09, hips / 2, 0.09], COLOR.leg);
  limb(out, at(m, -0.35, shoulders, 0), m.yaw, -swing * 0.8, [0.07, 0.34, 0.07], COLOR.arm);
  limb(
    out,
    at(m, 0.35, shoulders, 0),
    m.yaw,
    swing * 0.8 + (blow > 0 ? strike(blow) : 0),
    [0.07, 0.34, 0.07],
    COLOR.arm,
  );
  pushBox(out, at(m, 0, hips + 0.35, 0), [0.26, 0.35, 0.16], m.yaw, COLOR.body);
  const head = at(m, 0, WALKER_H - 0.15, 0);
  pushBox(out, head, [0.15, 0.15, 0.15], m.yaw, COLOR.head);
  const glow = m.chase ? 0.04 : 0.03;
  for (const side of [-1, 1]) {
    const eye = at(m, side * 0.075, WALKER_H - 0.11, 0.15);
    pushBox(out, eye, [glow, glow * 0.7, 0.02], m.yaw, eyes(m.chase), -2);
  }
};

/** The flyer's pod, upright: its length runs from the underside up. */
const SHELL = dress(
  lathe(
    [
      [0, 0],
      [0.18, 0.06],
      [FLYER_R, 0.32],
      [FLYER_R * 0.93, 0.5],
      [0.22, 0.78],
      [0, FLYER_H],
    ],
    8,
  ),
  COLOR.shell,
);

/** Appends a flyer at time t (seconds): it bobs on a slow sine and its fins spin. */
export const flyer = (out: number[], m: Monster, t: number) => {
  const bob = Math.sin(t * 2 + m.id) * 0.06;
  const base: Vec3 = [m.x, m.y + bob, m.z];
  place(out, SHELL, base, basis(0, Math.PI / 2), [0, 0, 0], 1);
  for (let i = 0; i < 4; i++) {
    const a = t * 1.5 + (i * TAU) / 4;
    const fin: Vec3 = [m.x + Math.cos(a) * 0.4, base[1] + 0.35, m.z + Math.sin(a) * 0.4];
    pushBox(out, fin, [0.16, 0.03, 0.04], -a, COLOR.fin);
  }
  const eye = at({ ...m, y: base[1] }, 0, FLYER_H * 0.45, FLYER_R * 0.9);
  const glow = m.chase ? 1.3 : 1;
  pushBox(out, eye, [0.1 * glow, 0.07 * glow, 0.05], m.yaw, eyes(m.chase), -2);
};

/**
 * Appends a bullet: a glowing blob with a short tail behind it when `dir` (unit, its heading) is
 * known.
 */
export const bullet = (out: number[], b: Bullet, dir?: Vec3) => {
  const p: Vec3 = [b.x, b.y, b.z];
  pushBox(out, p, [BULLET_R * 0.8, BULLET_R * 0.8, BULLET_R * 0.8], 0, COLOR.blob, -2);
  pushBox(out, p, [BULLET_R * 0.5, BULLET_R * 0.5, BULLET_R * 0.5], Math.PI / 4, COLOR.core, -2);
  if (dir) {
    for (const k of [1, 2]) {
      const h = BULLET_R * (1 - k * 0.3);
      pushBox(out, p.map((x, i) => x - dir[i] * k * 0.2) as Vec3, [h, h, h], 0, COLOR.blob, -2);
    }
  }
};
