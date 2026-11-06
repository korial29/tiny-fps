// The gun as the client lives it: what a change in the numbers of a player's state means. The own
// shots (from the live steps of the predictor) kick the look and the camera; a change of `shots`
// draws a beam and plays the laser, for the own player and the others; the own `hits`, health and
// ammo play the hit sound, the hurt and the pickups and feed the HUD. No DOM.
import { GUN_RANGE, MAX_PITCH, RECOIL, TICK_HZ } from '../shared/constants';
import { eyeHeight } from '../shared/physics';
import { KEY } from '../shared/types';
import type { PlayerState } from '../shared/types';
import { ray } from '../shared/world';
import type { World } from '../shared/world';
import type { Audio } from './audio';
import type { Tracer } from './beams';
import type { Effects } from './effects';
import { aimed, focus, tip } from './gun';
import type { Hud } from './hud';
import { basis } from './mesh';
import type { Vec3 } from './mesh';
import { SOUND } from './sfx';

/** What the frame draws from: the own eye and the camera (the eye plus the shake), the look, the own muzzle in the camera's space. */
export interface View {
  eye: Vec3;
  cam: Vec3;
  yaw: number;
  pitch: number;
  /** The pitch the camera draws at: the look plus the shake. */
  drawn: number;
  /** The own muzzle (the emitter) in the camera's space. */
  muzzle: Vec3;
  /** Where the look ray ends, from sight(): the beam goes there. */
  end: Vec3;
  hit: boolean;
}

/**
 * Where the own shots end: the first wall along the look ray from the eye, or the range. `local` is
 * that point in the camera's space (right, up, forward), which is turned by the drawn pitch, so
 * that the gun can point at it.
 */
export const sight = (
  world: World,
  eye: Vec3,
  cam: Vec3,
  yaw: number,
  pitch: number,
  drawn: number,
): { end: Vec3; hit: boolean; local: Vec3 } => {
  const look = basis(yaw, pitch)[2];
  const d = ray(world, eye, look, GUN_RANGE);
  const end = [0, 1, 2].map(i => eye[i] + look[i] * d) as Vec3;
  return {
    end,
    hit: d < GUN_RANGE,
    local: basis(yaw, drawn).map(
      a => (end[0] - cam[0]) * a[0] + (end[1] - cam[1]) * a[1] + (end[2] - cam[2]) * a[2],
    ) as Vec3,
  };
};

export interface Combat {
  /** One live step of the own player, its state before and after: the recoil and the kick of each shot it fired. */
  step(a?: PlayerState, b?: PlayerState): void;
  /** One frame: the beams and the sounds of what changed since the last one, and the HUD. */
  frame(
    v: View | undefined,
    me: PlayerState | undefined,
    others: PlayerState[],
    keys: number,
    dt: number,
  ): void;
}

/** Shots between two states of a player, a u8 counter that wraps. */
export const fired = (a?: PlayerState, b?: PlayerState): number =>
  a && b ? (b.shots - a.shots) & 255 : 0;

/** Beams drawn for one change at most: a long gap in the snapshots is not a burst. */
const BURST = 3;

export const createCombat = (
  world: World,
  audio: Pick<Audio, 'play'>,
  hud: Pick<Hud, 'vitals' | 'hit' | 'down'>,
  fx: Pick<Effects, 'fire' | 'wound' | 'lie'>,
  tracer: Pick<Tracer, 'shoot' | 'update' | 'mount'>,
  ctl: { pitch: number },
): Combat => {
  /** Own shots fired in the live steps since the last frame. */
  let pending = 0;
  let before: PlayerState | undefined;
  let held = false;
  let seq = 0;
  /** The `shots` of each other player at the last frame. */
  const seen = new Map<number, number>();
  /** A little off the pitch each time, so that a burst does not drone. */
  const rate = () => 0.94 + 0.12 * ((seq++ * 0.618) % 1);
  const laser = (at?: Vec3) => audio.play(SOUND.LASER, at, at ? 0.7 : 0.5, rate());

  return {
    step(a, b) {
      const n = fired(a, b);
      pending += n;
      for (let i = 0; i < n; i++) {
        ctl.pitch = Math.min(MAX_PITCH, ctl.pitch + RECOIL);
        fx.fire();
      }
    },

    frame(v, me, others, keys, dt) {
      tracer.update(dt);
      if (me) {
        const was = before;
        if (was && me.hits != was.hits) {
          audio.play(SOUND.HIT);
          hud.hit();
        }
        if (was && me.hp < was.hp) {
          audio.play(me.down && !was.down ? SOUND.DOWN : SOUND.HURT);
          fx.wound();
        } else if (was && me.hp > was.hp && !was.down) {
          audio.play(SOUND.PACK);
        }
        if (was && (was.ammo < 0 || me.ammo > was.ammo) && me.ammo >= 0) {
          audio.play(SOUND.GUN);
        }
        const trigger = !!(keys & KEY.FIRE);
        if (trigger && !held && me.ammo == 0 && !me.down) {
          audio.play(SOUND.DRY);
        }
        held = trigger;
        hud.vitals(me.hp, me.ammo);
        hud.down(fx.lie, me.down / TICK_HZ);
        before = { ...me };
      } else {
        before = undefined;
      }
      if (v) {
        // The shots of the own player: out of the muzzle, to where the look ray ends.
        const [r, u, f] = basis(v.yaw, v.drawn);
        const m = v.muzzle;
        const from: Vec3 = [0, 1, 2].map(
          i => v.cam[i] + r[i] * m[0] + u[i] * m[1] + f[i] * m[2],
        ) as Vec3;
        tracer.mount(from);
        for (; pending > 0; pending--) {
          tracer.shoot(from, v.end, v.hit, true);
          laser();
        }
      }
      pending = 0;
      for (const p of others) {
        const was = seen.get(p.id);
        const n = Math.min(was === undefined ? 0 : (p.shots - was) & 255, BURST);
        const [to, hit] = focus(p, world);
        const [grip, ax] = aimed(p, to);
        for (let i = 0; i < n; i++) {
          tracer.shoot(tip(grip, ax), to, hit);
          laser([p.x, p.y + eyeHeight(p), p.z]);
        }
        seen.set(p.id, p.shots);
      }
      for (const id of seen.keys()) {
        if (!others.some(p => p.id == id)) {
          seen.delete(id);
        }
      }
    },
  };
};
