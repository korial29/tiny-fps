// The gun as the client lives it: what a change in the numbers of a player's state means. The own
// shots (from the live steps of the predictor) kick the look and the camera and launch their balls
// at once; a change of `shots` flashes the muzzle and plays the shot, for the own player and the
// others; a ball's burst splashes and zaps where it is; the own `hits`, health and
// ammo play the hit sound, the hurt and the pickups and feed the HUD. The katana's side: the start of
// a swing (a change of `swing` or `cut`) plays the swish, the own cut's strike tick punches the
// camera, drawing or sheathing it plays the shing, a hit of the own player with the katana in hand
// adds the zap, and a runner shocked by it crackles. No DOM.
import { CUTS, GUN_RANGE, MAX_PITCH, RECOIL, TICK_HZ } from '../shared/constants';
import { eyeHeight } from '../shared/physics';
import { KEY } from '../shared/types';
import type { PlayerState } from '../shared/types';
import { ray } from '../shared/world';
import type { World } from '../shared/world';
import type { Audio } from './audio';
import type { Balls } from './balls';
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
  /** One live step of the own player, its state before and after: the recoil and the kick of each shot it fired, the swish and the punch of a cut. */
  step(a?: PlayerState, b?: PlayerState): void;
  /** One frame at `now` (ms): the balls, the flashes and the sounds of what changed since the last one, and the HUD. */
  frame(
    v: View | undefined,
    me: PlayerState | undefined,
    others: PlayerState[],
    keys: number,
    dt: number,
    now?: number,
  ): void;
}

/** Shots between two states of a player, a u8 counter that wraps. */
export const fired = (a?: PlayerState, b?: PlayerState): number =>
  a && b ? (b.shots - a.shots) & 255 : 0;

/** What the katana's sounds read of a player: the swing, the cut and whether it is in hand. */
type Blade = Pick<PlayerState, 'swing' | 'cut' | 'wield' | 'blade'>;

/**
 * The CUT of a swing that started between two states of a player, or -1: `swing` jumped up (it
 * only counts down), or the cut changed under a running one.
 */
export const swung = (a?: Blade, b?: Blade): number =>
  a && b && (b.swing ?? 0) > 0 && ((b.swing ?? 0) > (a.swing ?? 0) || (b.cut ?? 0) != (a.cut ?? 0))
    ? (b.cut ?? 0)
    : -1;

/** Whether the step from a to b is the strike of its cut: `swing` went down through the strike tick (CUTS). */
export const struck = (a?: Blade, b?: Blade): boolean => {
  const { ticks, strike } = CUTS[b?.cut ?? 0];
  return !!a && !!b && (a.swing ?? 0) > ticks - strike && (b.swing ?? 0) <= ticks - strike;
};

/** The swish of a cut, by CUT: higher and quieter for a thrust, lower and fuller for a slash. */
const SWISH = { rate: [1.3, 1.05, 0.95, 0.8], gain: [0.6, 0.8, 0.8, 1] };

export const createCombat = (
  world: World,
  audio: Pick<Audio, 'play'>,
  hud: Pick<Hud, 'vitals' | 'hit' | 'down'>,
  fx: Pick<Effects, 'fire' | 'cut' | 'wound' | 'lie'>,
  tracer: Pick<Tracer, 'flash' | 'burst' | 'orbs' | 'update' | 'mount' | 'crackle'>,
  ctl: { pitch: number },
  balls: Pick<Balls, 'fire' | 'frame'>,
): Combat => {
  /** The own player after each live step that fired, since the last frame. */
  let pending: PlayerState[] = [];
  let before: PlayerState | undefined;
  let held = false;
  let seq = 0;
  /** The `shots` of each other player at the last frame, and what the katana reads of him. */
  const seen = new Map<number, number>();
  const blades = new Map<number, Blade>();
  /** The own cuts started in the live steps since the last frame. */
  let cuts: number[] = [];
  /** A little off the pitch each time, so that a burst does not drone. */
  const rate = () => 0.94 + 0.12 * ((seq++ * 0.618) % 1);
  const laser = (at?: Vec3) => audio.play(SOUND.LASER, at, at ? 0.7 : 0.5, rate());
  /** The muzzle of a runner's gun, as he fires at what he looks at. */
  const gun = (p: PlayerState) => tip(...aimed(p, focus(p, world)[0]));
  const swish = (c: number, at?: Vec3) => audio.play(SOUND.SWISH, at, SWISH.gain[c], SWISH.rate[c]);
  /** The shing of the katana coming into the hand or leaving it (not when it is lost). */
  const shing = (was: Blade, now: Blade, at?: Vec3) =>
    !!was.wield != !!now.wield &&
    (now.wield || now.blade) &&
    audio.play(SOUND.SHING, at, 0.6, now.wield ? 1 : 0.85);

  return {
    step(a, b) {
      const n = fired(a, b);
      if (n && b) {
        pending.push({ ...b });
      }
      for (let i = 0; i < n; i++) {
        ctl.pitch = Math.min(MAX_PITCH, ctl.pitch + RECOIL);
        fx.fire();
      }
      const c = swung(a, b);
      if (c >= 0) {
        cuts.push(c);
      }
      if (b && struck(a, b)) {
        fx.cut(b.cut ?? 0);
      }
    },

    frame(v, me, others, keys, dt, now = 0) {
      tracer.update(dt);
      if (me) {
        const was = before;
        if (was && me.hits != was.hits) {
          audio.play(SOUND.HIT);
          hud.hit();
          if (me.wield) {
            audio.play(SOUND.ZAP);
          }
        }
        if (was) {
          shing(was, me);
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
        hud.vitals(me.hp, me.ammo, !!me.blade, !!me.wield);
        cuts.forEach(c => swish(c));
        hud.down(fx.lie, me.down / TICK_HZ);
        before = { ...me };
      } else {
        before = undefined;
      }
      let from: Vec3 | undefined;
      if (v) {
        // The own shots: a flash on the muzzle, and their balls, which leave it.
        const [r, u, f] = basis(v.yaw, v.drawn);
        const m = v.muzzle;
        from = [0, 1, 2].map(i => v.cam[i] + r[i] * m[0] + u[i] * m[1] + f[i] * m[2]) as Vec3;
        tracer.mount(from);
        for (const p of pending) {
          balls.fire(p, now);
          tracer.flash(from, true);
          laser();
        }
      }
      pending = [];
      cuts = [];
      for (const p of others) {
        const was = seen.get(p.id);
        const at: Vec3 = [p.x, p.y + eyeHeight(p), p.z];
        if (was !== undefined && p.shots != was) {
          tracer.flash(gun(p));
          laser(at);
        }
        seen.set(p.id, p.shots);
        const old = blades.get(p.id);
        const c = swung(old, p);
        if (c >= 0) {
          swish(c, at);
        }
        if (old) {
          shing(old, p, at);
        }
        blades.set(p.id, { swing: p.swing, cut: p.cut, wield: p.wield, blade: p.blade });
        if (p.zap && p.stun > 0) {
          tracer.crackle([p.x, p.y + 1, p.z]);
        }
      }
      for (const id of seen.keys()) {
        if (!others.some(p => p.id == id)) {
          seen.delete(id);
          blades.delete(id);
        }
      }
      const { orbs, bursts } = balls.frame(now, id => {
        const p = others.find(q => q.id == id);
        return id == me?.id ? from : p && gun(p);
      });
      tracer.orbs(orbs);
      for (const at of bursts) {
        tracer.burst(at);
        audio.play(SOUND.SPLASH, at);
      }
    },
  };
};
