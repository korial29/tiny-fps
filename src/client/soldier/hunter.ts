import type { PlayerState } from '../../shared/types';
import {
  CANNON_FOLD,
  CANNON_HINGE,
  HUNTER_REST,
  folded,
  hunterRig,
  hunterWristEnds,
} from '../hunter';
import type { HunterPiece } from '../hunter';
import { STRIDE, add, sub } from '../mesh';
import type { Vec3 } from '../mesh';
import { JOINT as J, axis, mul, slerp, turn } from '../rig';
import type { Quat } from '../rig';
import { ID, ORIGIN, mesh } from '../store';
import { room } from '../verts';
import type { Out } from '../verts';

export type HunterLod = 0 | 1;
export const hunterTrail = hunterWristEnds().map(p => sub(p, HUNTER_REST[J.FOREARM_R]));
/** The far level leaves out the dreadlocks and the visor grille. */
export const hunterPieces = (lod: HunterLod) =>
  hunterRig(lod, name => lod === 0 && (name.startsWith('Dreads') || name === 'Visor grille'));
/** Each piece's key in the store, made once: a Hunter has some forty pieces a frame. */
const hunterKeys = new WeakMap<HunterPiece, string>();
export const hunterKey = (lod: HunterLod, piece: HunterPiece) => {
  let key = hunterKeys.get(piece);
  if (!key) {
    hunterKeys.set(
      piece,
      (key = `hunter ${lod} ${piece.joint} ${+piece.thin} ${+piece.harpoon} ${+piece.cannon} ${+piece.disc} ${piece.strip?.i ?? ''}`),
    );
  }
  return key;
};
/**
 * The shoulder cannon's hinge and turn on a Hunter whose chest is at `chest` turned by `q`: stowed
 * (k 0) it lies back along the shoulder, CANNON_FOLD about the hinge from the chest's frame; out
 * (k 1) it points along his look.
 */
export const cannonOf = (
  chest: Vec3,
  q: Quat,
  p: Pick<PlayerState, 'yaw' | 'pitch'>,
  k: number,
): [Vec3, Quat] => {
  const hinge = add(chest, turn(q, sub(CANNON_HINGE, HUNTER_REST[J.CHEST])));
  const stowed = mul(q, axis([1, 0, 0], CANNON_FOLD));
  const look = mul(axis([0, 1, 0], p.yaw), axis([1, 0, 0], p.pitch));
  return [hinge, slerp(stowed, look, folded(k))];
};
/**
 * The Hunter with all he finds on the racks carried and nothing in hand (`fists`: he has none, so
 * no weapon is out): what his pictures on the menus show. In play his weapons are drawn on him
 * only once he has found them.
 */
export const HUNTER_GEAR = { ammo: 12, mag: 1, rail: 0, cap: 15, rifle: 0, side: 60, fists: true };

/** The Hunter's joints this frame (hunterPose()), reused. */
export const hunterAt: Vec3[] = [];

let hunterWarmed = false;

/** Build and index the Hunter models before they can be drawn during a match. */
export const warmHunter = () => hunterSteps().forEach(step => step());

/** warmHunter() a level at a time, a step each (render.ts warmSteps()): some 150 ms each on an M2. */
export const hunterSteps = (): (() => void)[] =>
  hunterWarmed
    ? []
    : [
        ...([0, 1] as const).map(lod => () => {
          for (const piece of hunterPieces(lod).pieces) {
            mesh(hunterKey(lod, piece), o => placeHunterPart(o, piece.vertices, ORIGIN, ID));
          }
        }),
        () => {
          hunterWarmed = true;
        },
      ];

/** Places a part of the Hunter's complete rest-pose model at the player's feet and heading. */
export const placeHunterPart = (out: Out, vertices: number[], at: Vec3, q: Quat): void => {
  const dst = room(out, vertices.length);
  let w = out.length;
  const [qx, qy, qz, qw] = q;
  const [ax, ay, az] = at;
  for (let i = 0; i < vertices.length; i += STRIDE) {
    const x = vertices[i],
      y = vertices[i + 1],
      z = vertices[i + 2],
      tx = 2 * (qy * z - qz * y),
      ty = 2 * (qz * x - qx * z),
      tz = 2 * (qx * y - qy * x);
    dst[w++] = ax + x + qw * tx + qy * tz - qz * ty;
    dst[w++] = ay + y + qw * ty + qz * tx - qx * tz;
    dst[w++] = az + z + qw * tz + qx * ty - qy * tx;
    const nx = vertices[i + 3],
      ny = vertices[i + 4],
      nz = vertices[i + 5],
      ntx = 2 * (qy * nz - qz * ny),
      nty = 2 * (qz * nx - qx * nz),
      ntz = 2 * (qx * ny - qy * nx);
    dst[w++] = nx + qw * ntx + qy * ntz - qz * nty;
    dst[w++] = ny + qw * nty + qz * ntx - qx * ntz;
    dst[w++] = nz + qw * ntz + qx * nty - qy * ntx;
    dst[w++] = vertices[i + 6];
    dst[w++] = vertices[i + 7];
    dst[w++] = vertices[i + 8];
    dst[w++] = vertices[i + 9];
  }
  out.length = w;
};
