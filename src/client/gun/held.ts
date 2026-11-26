// The gun in the hand: how it is drawn and aimed from a player state.
import { GUN_RANGE, RAIL_CAP } from '../../shared/constants';
import { eyeHeight } from '../../shared/physics';
import type { PlayerState } from '../../shared/types';
import { ray } from '../../shared/world';
import type { World } from '../../shared/world';
import { STRIDE, add, basis, dim as dimmed, dot, place, sub, unit } from '../mesh';
import type { Vec3 } from '../mesh';
import { drop } from '../drops';
import type { Quat } from '../rig';
import { room } from '../verts';
import type { Out } from '../verts';
import { ID, ORIGIN, mesh } from '../store';
import type { Pieces } from '../store';
import { WELL_HOLE, battery, capsule, cell } from './ammo';
import { lcd, readout, scope, smoke } from './display';
import { hunterGun, kindOf } from './kinds';
import { clamp } from './loft';
import { EMBER } from './paint';
import { RAIL_MUZZLE, SLOTS, axisY, insulators, railgun } from './railgun';
import {
  BROUGHT,
  RAIL_RELEASE,
  RELEASE,
  arc,
  axes,
  button,
  grip,
  loadFrame,
  swapped,
  swaps,
} from './reload';
import { RIFLE_MUZZLE, rifle } from './rifle';
import { MUZZLE, REAR, gun } from './sidearm';

/**
 * How a gun is drawn beyond its place: its glow from 0 (off) to 1, the swap under way (0 to 1, -1
 * none), whether its battery or capsule holds any, how far the gun's counter has faded in (0 dark,
 * 1 lit) and whether the rifle's digits show; for the rail gun the level of its three cells (the
 * one in use, then the two in reserve), its heat (0 to 1) and whether it overheated.
 */
export interface Lit {
  /** The frame's pieces of the store: the gun's body, lit, goes there (store.ts). */
  list?: Pieces;
  /** The gun in the Hunter's bronze (hunterGun()): his pistol. */
  skin?: boolean;
  light?: number;
  swap?: number;
  empty?: boolean;
  screen?: number;
  digits?: boolean;
  cells?: number[];
  heat?: number;
  hot?: boolean;
  /** The laser rifle's grenades left, shown under its rounds; none shown when absent. */
  nades?: number;
  /** How far the thumb has its button in, 0 to 1. */
  press?: number;
  /** How far the rail gun's capsule is turned on (radians, tune()). */
  tune?: number;
  /**
   * The player whose gun it is, the floor under him and his speed: the spent battery, cell or
   * capsule is thrown out to fall there as the swap passes RELEASE (drops.ts).
   */
  id?: number;
  floor?: number;
  vel?: Vec3;
  /** Where the hand holds the new battery or cell while it brings it from the pouch (its foot and axes, as loadFrame()). */
  carry?: [Vec3, Vec3[]];
}

/** The levels of the rail gun's three cells for `p` (0 to 1): the capsule in use, then what it carries beside, a capsule's worth to each. */
export const cellsOf = (p: Pick<PlayerState, 'rail' | 'cap'>): number[] => {
  const [c, r] = [p.cap ?? 0, Math.max(0, (p.rail ?? 0) - (p.cap ?? 0))];
  return [c, r, r - RAIL_CAP].map(v => clamp(v / RAIL_CAP));
};

/**
 * Appends the gun (the rail gun or the laser rifle by `kind`, the rail gun's spark at the time `t`) held in the hand at `pos`
 * with the world rotation `q`, `k` times its size about the grip, with the ammo on its back when
 * given, and the charge gauge at `level`; its battery (capsule) where the swap has it, its glow and
 * its counter dimmed with `light`, and the spark only when it is all on.
 */
export const held = (
  out: Out,
  pos: Vec3,
  q: Quat,
  lod: number,
  k = 1,
  ammo?: number,
  level = 0,
  kind: boolean | number = 0,
  t = 0,
  {
    light = 1,
    swap = -1,
    empty = false,
    screen = 1,
    digits = true,
    cells = [1, 1, 1],
    heat = 0,
    hot = false,
    press = 0,
    tune = 0,
    nades,
    id,
    floor,
    vel = [0, 0, 0],
    carry,
    list,
    skin = false,
  }: Lit = {},
) => {
  const [at, ax] = [grip(pos, q, kind), axes(q, kind)];
  const w = kindOf(kind);
  const rail = w == 2;
  const d = 0.08 + 0.92 * light;
  const from = out.length;
  // The spent one thrown out as the swap passes its release, once for each player.
  const rel = rail ? RAIL_RELEASE : RELEASE;
  if (id !== undefined) {
    const was = swaps.get(id) ?? -1;
    swaps.set(id, swap);
    if (was >= 0 && was < rel && swap >= rel) {
      const [foot, fax] = loadFrame(at, ax, w, rel - 1e-4, k, 0, tune);
      // Out of the grip or the well and ahead, in sight as it falls; the capsule up off its socket.
      const o = rail ? fax[2].map(v => 2.4 * v) : [0, -0.6, 0];
      drop(
        rail ? capsule(1, 0) : [battery, cell, capsule, cell][w](1),
        foot,
        fax,
        [0, 1, 2].map(i => vel[i] + o[i] + (rail ? 0.8 : 1.2) * ax[2][i] + 0.2 * ax[0][i]) as Vec3,
        fax[0].map(v => (rail ? 9 : 5) * v) as Vec3,
        floor ?? foot[1] - 1.2,
      );
    }
  }
  // The rail gun's cell in use shows its level: none as the old one goes, full as the new one comes.
  // Between its release and BROUGHT the battery is the drop's and then the hand's (`carry`).
  const away = swap >= rel && swap < (rail ? 0.42 : BROUGHT);
  const seat = away ? (rail ? undefined : carry) : loadFrame(at, ax, w, swap, k, 0, tune);
  if (seat) {
    place(
      out,
      rail
        ? capsule(lod, swap < 0 ? cells[0] : +(swap > 0.42))
        : [battery, cell, capsule, cell][w](lod),
      ...seat,
      [0, 0, 0],
      k,
    );
  }
  dimmed(out, from, empty && !rail ? 0.08 : 1);
  // Overheated, the cells flicker red and smoke rises off the coils (smoke()); no spark idles
  // between the electrodes. The counter stays steady (the user, 2026-11-09).
  const blink = hot && t * 9 - Math.floor(t * 9) < 0.5;
  if (rail) {
    for (const i of [1, 2]) {
      place(
        out,
        capsule(lod, cells[i]),
        ...loadFrame(at, ax, w, -1, k, i),
        [0, 0, 0],
        k * SLOTS[i][5],
      );
    }
    const a = room(out, 0);
    for (let i = from + 8; blink && i < out.length; i += STRIDE) {
      if (a[i] == -2) {
        [a[i - 2], a[i - 1], a[i + 1]] = EMBER;
      }
    }
    place(out, insulators(lod, heat), at, ax, [0, 0, 0], k);
    if (hot) {
      smoke(out, at, ax, k, t);
    }
  }
  // The gun's body, lit: made once into the store and placed there (store.ts). The Hunter's
  // pistol is the gun in his skin.
  const bronze = !w && skin;
  const model = bronze ? hunterGun(lod) : [gun, gun, railgun, rifle][w](lod);
  if (list && d == 1) {
    list.push({
      m: mesh(`gun ${w} ${lod}${bronze ? ' hunter' : ''}`, o =>
        place(o, model, ORIGIN, axes(ID, w), [0, 0, 0], 1),
      ),
      q,
      t: at,
      k,
      // The Hunter's pistol is drawn worn: the shader scuffs it (pistol.ts).
      w: bronze && 3,
    });
  } else {
    place(out, model, at, ax, [0, 0, 0], k);
  }
  if (rail && light > 0.98 && swap < 0 && !hot) {
    place(out, arc(t), at, ax, [0, 0, 0], k);
  }
  if (ammo !== undefined && w == 3) {
    place(out, scope(ammo, digits && light > 0.5, nades), at, ax, [0, 0, 0], k);
  } else if (ammo !== undefined && rail && light > 0.3) {
    place(out, lcd(ammo), at, ax, [0, 0, 0], k);
  }
  dimmed(out, from, d);
  // Through a swap of the gun, the dark hole of its battery's seat under the grip while the battery
  // is out of it (the user, 2026-11-09); the battery covers it home.
  if (!w && swap >= 0 && swapped(swap, 0)[0] > 0) {
    place(out, WELL_HOLE, ...loadFrame(at, ax, 0, -1, k), [0, 0, 0], k);
  }
  // The button that switches it on; the rail gun is switched on by its capsule (tune()).
  if (!rail) {
    const knob: number[] = [];
    button(knob, w, press, light, w == 3 || bronze ? [1, 0.25, 0.15] : [0.25, 0.9, 1]);
    place(out, knob, at, ax, [0, 0, 0], k);
  }
  // The gun's counter fades in on its own, with the boot sound, without the gun's flicker (the user, 2026-11-09).
  if (ammo !== undefined && w < 2) {
    const c = out.length;
    place(out, readout(ammo, level, true, bronze), at, ax, [0, 0, 0], k);
    dimmed(out, c, screen);
  }
};

/** The muzzle of a gun (the rail gun's or the rifle's by `kind`) whose grip is at `at` and whose axes are [right, up, forward]. */
export const tip = (at: Vec3, [, u, f]: Vec3[], kind: boolean | number = 0): Vec3 => {
  const m = [MUZZLE, MUZZLE, RAIL_MUZZLE, RIFLE_MUZZLE][kindOf(kind)];
  return [0, 1, 2].map(i => at[i] + u[i] * m[1] - f[i] * m[2]) as Vec3;
};

/** How far the model's long axis (REAR to MUZZLE) points below the gun's own forward, radians. */
const SAG = Math.atan2(REAR[1] - MUZZLE[1], REAR[2] - MUZZLE[2]);

/**
 * The axes [right, up, forward] of a gun held with its grip at `at` so that its long axis, from the
 * back of the body to the emitter, points at `to`: the beam leaves the emitter along it. `side` is
 * where the right axis points, `up` where up is. The emitter is off the grip, so the axes are found
 * in three rounds.
 */
export const pointed = (at: Vec3, to: Vec3, side: Vec3, up: Vec3, sag = SAG): Vec3[] => {
  const scale = (v: Vec3, k: number): Vec3 => [v[0] * k, v[1] * k, v[2] * k];
  let ax: Vec3[] = [side, up, unit(sub(to, at))];
  for (let k = 0; k < 3; k++) {
    const d = unit(sub(to, k ? tip(at, ax) : at));
    // Right and up as near `side` and `up` as they can be, across d: no cross product, so the
    // handedness of the space does not matter (the camera's space is a mirror of the world's).
    const r = unit(sub(side, scale(d, dot(side, d))));
    const u = unit(sub(sub(up, scale(d, dot(up, d))), scale(r, dot(up, r))));
    // The long axis dips below the gun's forward: turned about r, so that it lies along d.
    const [s, c] = [Math.sin(sag), Math.cos(sag)];
    ax = [r, add(scale(u, c), scale(d, -s)), add(scale(d, c), scale(u, s))];
  }
  return ax;
};

/** The middle of the butt plate of the rail gun and of the laser rifle, in model space: what the shoulder takes. */
export const BUTTS: Vec3[] = [
  [0, axisY(-0.392) - 0.045, 0.392],
  [0, 0.036, 0.336],
];

/**
 * A long gun (`kind` 2 the rail gun, 3 the rifle) shouldered: its grip and its axes [right, up,
 * forward] when its butt plate is at `butt` and its barrel points at `to`. The rail gun's barrel
 * lies on the gun's long axis, the rifle's is level in its model.
 */
export const shouldered = (
  butt: Vec3,
  to: Vec3,
  side: Vec3,
  up: Vec3,
  kind: number,
): [Vec3, Vec3[]] => {
  const b = BUTTS[kind - 2];
  let at = butt;
  let ax: Vec3[] = [];
  for (let k = 0; k < 2; k++) {
    ax = pointed(at, to, side, up, kind == 3 ? 0 : SAG);
    at = butt.map((v, i) => v - ax[1][i] * b[1] + ax[2][i] * b[2]) as Vec3;
  }
  return [at, ax];
};

/** Where a runner's shots end: the first wall along its look from the eye, or the range. */
export const focus = (p: PlayerState, world: World): [Vec3, boolean] => {
  const eye: Vec3 = [p.x, p.y + eyeHeight(p), p.z];
  const f = basis(p.yaw, p.pitch)[2];
  const d = ray(world, eye, f, GUN_RANGE);
  return [[0, 1, 2].map(i => eye[i] + f[i] * d) as Vec3, d < GUN_RANGE];
};

/**
 * Where a runner holds the gun when it fires at `to`: the grip, a little right of and below the eye,
 * and the gun's axes. The rail gun, in both hands like a rifle, is nearer the chest, so that the
 * left hand reaches its front grip.
 */
export const aimed = (p: PlayerState, to: Vec3): [Vec3, Vec3[]] => {
  const [r, u, f] = basis(p.yaw, p.pitch);
  const eye: Vec3 = [p.x, p.y + eyeHeight(p), p.z];
  const [x, y, z] = p.railed || p.rifled ? [0.12, 0.2, 0.28] : [0.2, 0.17, 0.42];
  const grip = [0, 1, 2].map(i => eye[i] + r[i] * x - u[i] * y + f[i] * z) as Vec3;
  return [grip, pointed(grip, to, r, u)];
};
