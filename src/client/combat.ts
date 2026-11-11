// The gun as the client lives it: what a change in the numbers of a player's state means. The own
// shots (from the live steps of the predictor) kick the look and the camera and launch their balls
// at once; a change of `shots` flashes the muzzle and plays the shot, for the own player and the
// others; a ball's burst splashes and zaps where it is; the own `hits`, health and
// ammo play the hit sound, the hurt and the pickups and feed the HUD. The katana's side: the start of
// a swing (a change of `swing` or `cut`) plays the swish, the own cut's strike tick punches the
// camera, drawing or sheathing it plays the shing, a hit of the own player with the katana in hand
// adds the zap, and a runner shocked by it crackles. A grenade of the rifle's launcher thumps out
// of it, and its burst is a fireball that shakes the view of who stands near. No DOM.
import {
  CHARGE_MAX,
  CHARGE_TAP,
  CHARGE_TICKS,
  GUN_RANGE,
  MAX_PITCH,
  NADE,
  NADE_R,
  RECOIL,
  TICK_HZ,
  PUNCH,
} from '../shared/constants';
import { swingOf } from '../shared/blade';
import { powerOf } from '../shared/gun';
import { eyeHeight } from '../shared/physics';
import { lobbed } from '../shared/plasma';
import { CUT, KEY, MODE } from '../shared/types';
import type { PlayerState } from '../shared/types';
import { beam } from '../shared/rail';
import { ray } from '../shared/world';
import type { World } from '../shared/world';
import type { Audio, Loop } from './audio';
import type { Balls } from './balls';
import type { Tracer } from './beams';
import type { Effects } from './effects';
import {
  CUES,
  NADE_MUZZLE,
  RIFLE_MUZZLE,
  aimed,
  charge,
  firsts,
  focus,
  kindOf,
  pressAt,
  swapOf,
  tip,
} from './gun';
import type { Hud } from './hud';
import { basis } from './mesh';
import type { Vec3 } from './mesh';
import { SOUND } from './sfx';

/** The sound of each cue of a swap (CUES): the gun's, then the rail gun's. */
const RELOADS = [
  [SOUND.EJECT, SOUND.CLICK],
  [SOUND.POP, SOUND.SCREW, SOUND.SCREW, SOUND.SCREW],
];

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
type Blade = Pick<
  PlayerState,
  | 'swing'
  | 'cut'
  | 'wield'
  | 'blade'
  | 'heavy'
  | 'down'
  | 'railed'
  | 'ammo'
  | 'reload'
  | 'rifled'
  | 'hot'
>;

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
  // With no blade the swing is a punch.
  const { ticks, strike } = b && !b.blade ? PUNCH : swingOf(b ?? {});
  return !!a && !!b && (a.swing ?? 0) > ticks - strike && (b.swing ?? 0) <= ticks - strike;
};

/** Seconds between two buzzes of a saber lock, and two crackles of a rail gun's bolt. */
const BUZZ = 0.16;
const CRACKLE = 0.09;
/** A bolt's buzz goes up and down 1.6 times a second, by 35 % of its pitch either way. */
const WAIL = [1.6, 0.35];

/** A heavy release's swish is told by its cut plus this. */
const HEAVY_CUE = 8;
/** The swish of a cut, by CUT: higher and quieter for a thrust, lower and fuller for a slash. */
const SWISH = { rate: [1.3, 1.05, 0.95, 0.8], gain: [0.6, 0.8, 0.8, 1] };

export const createCombat = (
  world: World,
  audio: Pick<Audio, 'play'> & Partial<Pick<Audio, 'loop'>>,
  hud: Pick<Hud, 'vitals' | 'hit' | 'down'>,
  fx: Pick<Effects, 'fire' | 'cut' | 'wound' | 'lie' | 'quake'>,
  tracer: Pick<
    Tracer,
    'flash' | 'burst' | 'blast' | 'orbs' | 'update' | 'mount' | 'crackle' | 'charging' | 'lightning'
  >,
  ctl: { pitch: number },
  balls: Pick<Balls, 'fire' | 'frame'>,
  /** The muzzle of a runner's long gun as last drawn, from his feet (Renderer.muzzle()). */
  drawn?: (id: number) => Vec3 | undefined,
): Combat => {
  /** The own player after each live step that fired, since the last frame. */
  let pending: PlayerState[] = [];
  let before: PlayerState | undefined;
  let held = false;
  let seq = 0;
  /** Seconds since the last buzz of the saber locks. */
  let buzz = 0;
  /** The `shots` of each other player at the last frame, and what the katana reads of him. */
  const seen = new Map<number, number>();
  const blades = new Map<number, Blade>();
  /** The own cuts started in the live steps since the last frame. */
  let cuts: number[] = [];
  /** A little off the pitch each time, so that a burst does not drone. */
  const rate = () => 0.94 + 0.12 * ((seq++ * 0.618) % 1);
  /** A shot; a charged one (`power` over 1) deeper and louder, with the long blast under it. */
  const laser = (at?: Vec3, power = 1) => {
    audio.play(
      SOUND.LASER,
      at,
      (at ? 0.7 : 0.5) * (1 + 0.15 * (power - 1)),
      rate() * (1 - 0.1 * (power - 1)),
    );
    if (power > 1) {
      audio.play(SOUND.BLAST, at, (at ? 0.5 : 0.35) * (0.4 + 0.15 * power), 1.2 - 0.06 * power);
    }
  };
  /** How charged a shot of `power` is, 0 to 1. */
  const heat = (power = 1) => (power - 1) / (CHARGE_MAX - 1);
  /** How far a charge of `ticks` has gone past a tap, 0 to 1. */
  const filled = (ticks = 0) =>
    Math.min(1, Math.max(0, (ticks - CHARGE_TAP) / (CHARGE_TICKS - CHARGE_TAP)));
  /** Each other player's charge at the last frame: the strength of his next shot. */
  const charges = new Map<number, number>();
  /** The muzzle of a runner's gun (his rail gun's in hand), as he fires at what he looks at. */
  const gun = (p: PlayerState): Vec3 => {
    // A long gun is shouldered, which only the drawn runner knows (soldier.ts).
    const d = p.railed || p.rifled ? drawn?.(p.id) : undefined;
    return d
      ? [p.x + d[0], p.y + d[1], p.z + d[2]]
      : tip(...aimed(p, focus(p, world)[0]), kindOf(p));
  };
  /** Where the rail gun's bolt of `p` ends: the wall his look meets, or its range. */
  const end = (p: PlayerState): Vec3 => {
    const { o, d, t } = beam(world, p);
    return [0, 1, 2].map(i => o[i] + d[i] * t) as Vec3;
  };
  /** A laser rifle's shot of `p` from `from`, heard at `at` (the own when not given): a red flash and its punch. Its ball is the snapshot's, or the own launched now. */
  const lase = (p: PlayerState, from: Vec3, now: number, at?: Vec3) => {
    if (!at) {
      balls.fire(p, now);
    }
    tracer.flash(from, !at, -1);
    audio.play(SOUND.LASE, at, at ? 0.5 : 0.4, rate());
  };
  /** A grenade leaves the launcher of `p` at `from`, heard at `at` (the own when not given): an orange flash and a hollow thump. */
  const thump = (p: PlayerState, from: Vec3, now: number, at?: Vec3) => {
    if (!at) {
      balls.fire(p, now);
    }
    tracer.flash(from, !at, 1);
    audio.play(SOUND.TACKLE, at, at ? 0.9 : 0.7, 0.55);
    audio.play(SOUND.DASH, at, at ? 0.5 : 0.35, 0.7);
  };
  /** The own rail gun's hum and its bolt's buzz, started when it is first in hand. */
  let hum: Loop | undefined;
  let buzzing: Loop | undefined;
  let charging: Loop | undefined;
  /** The pitch of a bolt's buzz at `now` (ms): up and down WAIL[0] times a second, by WAIL[1] either way. */
  const wail = (now: number) => 1 + WAIL[1] * Math.sin(2 * Math.PI * WAIL[0] * (now / 1000));
  /** Seconds to the next crackle of each other player's bolt. */
  const crackles = new Map<number, number>();
  /**
   * The bolt of `p` this frame, from `from`. An other's, at `at`, crackles every CRACKLE seconds, up
   * and down in pitch as the own buzz goes; the own is the buzz.
   */
  const zap = (
    list: { a: Vec3; b: Vec3 }[],
    p: PlayerState,
    from: Vec3,
    dt: number,
    now: number,
    at?: Vec3,
  ) => {
    list.push({ a: from, b: end(p) });
    if (!at) {
      return;
    }
    const left = (crackles.get(p.id) ?? 0) - dt;
    crackles.set(p.id, left > 0 ? left : CRACKLE);
    if (left <= 0) {
      audio.play(SOUND.RAIL, at, 0.7, wail(now));
    }
  };
  /** The swish of the cut `c`, at `at`; a heavy release's (c + HEAVY_CUE) louder and much deeper. */
  const swish = (c: number, at?: Vec3) => {
    const [k, heavy] = [c % HEAVY_CUE, c >= HEAVY_CUE];
    audio.play(
      SOUND.SWISH,
      at,
      SWISH.gain[k] * (heavy ? 1.5 : 1),
      SWISH.rate[k] * (heavy ? 0.55 : 1),
    );
  };
  /** The weapon in the hand of `p`: 0 the gun, 1 the katana, 2 the rail gun, -1 none. */
  const inHand = (p: Blade) =>
    p.down ? -1 : p.wield ? 1 : p.rifled ? 3 : p.railed ? 2 : p.ammo >= 0 ? 0 : -1;
  /** Whether the weapon in a player's hand has just come to it for the first time (firsts()). */
  const fresh = firsts();
  /** Sounds to play later: when (ms), which, where, and how loud and fast. */
  const later: [number, number, Vec3 | undefined, number, number][] = [];
  let clock = 0;
  /** Plays `id` now, or once the thumb or the finger presses the button of a weapon taken for the first time, `first` its kind. */
  const boot = (id: number, at: Vec3 | undefined, g: number, r: number, first: number) =>
    first < 0
      ? audio.play(id, at, g, r)
      : later.push([clock + 1000 * pressAt(first), id, at, g, r]);
  /** The sounds of a swap as it passes its cues (CUES), the boot of a gun that comes to hand or whose swap is done, and the hiss of an overheating, at `at`. */
  const reloads = (was: Blade, now: Blade, at?: Vec3, first = -1) => {
    const [a, b, r] = [swapOf(was), swapOf(now), +!!now.railed];
    // The click of the slap home loud (the user, 2026-11-09).
    CUES[r].forEach((c, i) => a < c && b >= c && audio.play(RELOADS[r][i], at, !r && i ? 1 : 0.7));
    const h = inHand(now);
    if (h != 1 && h >= 0 && (inHand(was) != h || (a >= 0 && b < 0))) {
      boot(SOUND.BOOT, at, 0.5, r ? 1.4 : 1, first);
    }
    // The rail gun overheating hisses.
    if (now.hot && !was.hot) {
      audio.play(SOUND.HISS, at, 0.8);
    }
  };
  /** The shing of the katana coming into the hand or leaving it (not when it is lost). */
  const shing = (was: Blade, now: Blade, at?: Vec3, first = -1) =>
    !!was.wield != !!now.wield &&
    (now.wield || now.blade) &&
    (now.wield ? boot(SOUND.IGNITE, at, 0.6, 1, first) : audio.play(SOUND.SHING, at, 0.6, 0.85));

  return {
    step(a, b) {
      const n = fired(a, b);
      if (n && b) {
        pending.push({ ...b });
      }
      for (let i = 0; i < n; i++) {
        // A charged shot kicks the look up to 3.4 times as far; the laser rifle's, 20 a second, a third as far.
        // A grenade bucks the rifle in the left hand as hard as a half charge.
        const nade = !!b && lobbed(b);
        const k = nade ? 2 : b?.rifled ? 0.3 : 1 + 0.6 * ((b?.power ?? 1) - 1);
        ctl.pitch = Math.min(MAX_PITCH, ctl.pitch + RECOIL * k);
        fx.fire(nade ? 3 : b?.power);
      }
      const c = swung(a, b);
      if (c >= 0) {
        cuts.push(c + (b?.heavy ? HEAVY_CUE : 0));
      }
      if (b && struck(a, b)) {
        fx.cut(b.cut ?? 0);
        // The ARC cut throws its arc of energy at its strike.
        if (b.cut == CUT.ARC_L || b.cut == CUT.ARC_R) {
          pending.push({ ...b });
        }
      }
    },

    frame(v, me, others, keys, dt, now = 0) {
      clock = now;
      // The boots waiting for their press.
      for (let i = later.length; i--;) {
        const [t, id, at, g, r] = later[i];
        if (now >= t) {
          audio.play(id, at, g, r);
          later.splice(i, 1);
        }
      }
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
        const f = fresh(me) ? inHand(me) : -1;
        if (was) {
          shing(was, me, undefined, f);
          reloads(was, me, undefined, f);
        }
        if (was && me.hp < was.hp) {
          audio.play(me.down && !was.down ? SOUND.DOWN : SOUND.HURT);
          fx.wound();
        } else if (was && me.hp > was.hp && !was.down) {
          audio.play(SOUND.PACK);
        }
        if (
          was &&
          (((was.ammo < 0 || me.ammo > was.ammo) && me.ammo >= 0) ||
            (me.rail ?? -1) > (was.rail ?? -1))
        ) {
          audio.play(SOUND.GUN);
        }
        const trigger = !!(keys & KEY.FIRE);
        if (trigger && !held && (me.railed ? me.rail : me.ammo) == 0 && !me.down) {
          audio.play(SOUND.DRY);
        }
        held = trigger;
        // A soft hum while the rail gun is in hand; while its bolt goes out, an electric buzz
        // over it, its pitch going up and down.
        if (me.railed || hum) {
          hum ??= audio.loop?.(SOUND.HUM);
          buzzing ??= audio.loop?.(SOUND.BUZZ);
          const on = me.railed && !me.down;
          hum?.set(on ? 0.18 : 0, 1);
          buzzing?.set(on && me.zapping ? 0.55 : 0, wail(now));
        }
        // The plasma gun charging (the user, 2026-11-09): a whine past a tap, rising with the
        // charge, louder as it fills.
        if (me.ammo >= 0 || charging) {
          charging ??= audio.loop?.(SOUND.CHARGE);
          const c = me.wield || me.down || (me.charge ?? 0) < CHARGE_TAP ? -1 : filled(me.charge);
          charging?.set(c < 0 ? 0 : 0.2 + 0.25 * c, 0.8 + 1.2 * Math.max(c, 0));
        }
        const rail = me.rail ?? -1;
        hud.vitals(
          me.hp,
          me.ammo,
          !!me.blade,
          !!me.wield,
          rail < 0 ? -1 : charge(rail),
          !!me.railed,
          me.rifled ? (me.clip ?? 0) : me.railed ? charge(me.cap ?? 0) : (me.mag ?? 0),
          !!me.reload,
          me.rifle ?? -1,
          !!me.rifled,
          me.nades ?? 0,
        );
        cuts.forEach(c => swish(c));
        hud.down(fx.lie, me.down / TICK_HZ);
        before = { ...me };
      } else {
        before = undefined;
        hum?.set(0, 1);
        buzzing?.set(0, 1);
        charging?.set(0, 1);
      }
      let from: Vec3 | undefined;
      if (v) {
        // The own shots: a flash on the muzzle, and their balls, which leave it.
        const [r, u, f] = basis(v.yaw, v.drawn);
        const m = v.muzzle;
        from = [0, 1, 2].map(i => v.cam[i] + r[i] * m[0] + u[i] * m[1] + f[i] * m[2]) as Vec3;
        tracer.mount(from);
        for (const p of pending) {
          if (p.wield) {
            balls.fire(p, now);
            continue;
          }
          if (lobbed(p)) {
            // The launcher's mouth, under and behind the rifle's.
            const [dy, dz] = [NADE_MUZZLE[1] - RIFLE_MUZZLE[1], RIFLE_MUZZLE[2] - NADE_MUZZLE[2]];
            thump(p, from.map((c, i) => c + u[i] * dy + f[i] * dz) as Vec3, now);
            continue;
          }
          if (p.rifled) {
            lase(p, from, now);
            continue;
          }
          balls.fire(p, now);
          tracer.flash(from, true, heat(p.power));
          laser(undefined, p.power);
        }
      }
      // The muzzles charging: the own, and every other gun in hand.
      const hot: { p: Vec3; k: number }[] = [];
      if (from && me && !me.wield && (me.charge ?? 0) >= CHARGE_TAP) {
        hot.push({ p: from, k: filled(me.charge) });
      }
      pending = [];
      cuts = [];
      // The rail guns' bolts: the own from its muzzle, the others' from theirs.
      const zaps: { a: Vec3; b: Vec3 }[] = [];
      if (from && me?.zapping) {
        zap(zaps, me, from, dt, now);
      }
      for (const p of others) {
        const was = seen.get(p.id);
        const at: Vec3 = [p.x, p.y + eyeHeight(p), p.z];
        if (p.zapping) {
          zap(zaps, p, gun(p), dt, now, at);
        }
        if (was !== undefined && p.shots != was && lobbed(p)) {
          thump(p, gun(p), now, at);
        } else if (was !== undefined && p.shots != was && p.rifled) {
          lase(p, gun(p), now, at);
        } else if (was !== undefined && p.shots != was) {
          // His charge at the last frame gives the strength of the shot.
          const c = charges.get(p.id) ?? 0;
          const power = c >= CHARGE_TAP ? Math.min(powerOf(c), CHARGE_MAX) : 1;
          tracer.flash(gun(p), false, heat(power));
          laser(at, power);
        }
        seen.set(p.id, p.shots);
        charges.set(p.id, p.charge ?? 0);
        if ((p.charge ?? 0) >= CHARGE_TAP && p.ammo >= 0 && !p.wield && !p.down) {
          hot.push({ p: gun(p), k: filled(p.charge) });
        }
        const old = blades.get(p.id);
        const c = swung(old, p);
        if (c >= 0) {
          swish(c + (p.heavy ? HEAVY_CUE : 0), at);
        }
        const f = fresh(p) ? inHand(p) : -1;
        if (old) {
          shing(old, p, at, f);
          reloads(old, p, at, f);
        }
        blades.set(p.id, {
          swing: p.swing,
          cut: p.cut,
          wield: p.wield,
          blade: p.blade,
          heavy: p.heavy,
          down: p.down,
          railed: p.railed,
          ammo: p.ammo,
          reload: p.reload,
          rifled: p.rifled,
        });
        // A runner drained by the rail gun's bolt, or shocked by the katana, crackles.
        if ((p.zap && p.stun > 0) || p.slow) {
          tracer.crackle([p.x, p.y + 1, p.z]);
        }
      }
      tracer.charging(hot);
      tracer.lightning(zaps);
      // Each saber lock, once: sparks where the blades cross, between the two, and a buzz.
      buzz += dt;
      const all = me ? [me, ...others] : others;
      for (const p of all) {
        const f = p.lock ? all.find(q => q.id === p.foe) : undefined;
        if (f && (p.id < f.id || !f.lock)) {
          const at: Vec3 = [(p.x + f.x) / 2, (p.y + f.y) / 2 + 1.45, (p.z + f.z) / 2];
          tracer.crackle(at);
          if (buzz > BUZZ) {
            audio.play(SOUND.ZAP, at, 0.35, 0.8 + 0.4 * ((seq++ * 0.618) % 1));
          }
        }
      }
      buzz = buzz > BUZZ ? 0 : buzz;
      for (const id of seen.keys()) {
        if (!others.some(p => p.id == id)) {
          seen.delete(id);
          blades.delete(id);
          charges.delete(id);
        }
      }
      const { orbs, bursts } = balls.frame(now, id => {
        const p = id == me?.id ? me : others.find(q => q.id == id);
        // Seated, his balls are his rover's bolts: they leave from its lasers, where they are.
        return !p || p.mode === MODE.RIDE ? undefined : p === me ? from : gun(p);
      });
      tracer.orbs(orbs);
      // The laser rifle's (power 0) burst red, with a deeper, louder thud.
      for (const [at, k] of bursts) {
        if (k === NADE) {
          // A grenade: a fireball, a deep blast, and the view shaken within three radii of it.
          tracer.blast(at);
          audio.play(SOUND.BLAST, at, 1.6, 0.45);
          audio.play(SOUND.TACKLE, at, 1.4, 0.4);
          audio.play(SOUND.SPLASH, at, 1.2, 0.35);
          const d = me ? Math.hypot(at[0] - me.x, at[1] - me.y - 1, at[2] - me.z) : Infinity;
          fx.quake(Math.max(0, 1 - d / (3 * NADE_R)));
          continue;
        }
        tracer.burst(at, !k);
        audio.play(SOUND.SPLASH, at, k ? 1 : 1.3, k ? 1 : 0.6);
      }
    },
  };
};
