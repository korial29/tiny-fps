// Camera and gun feel, fed each frame: head bob, roll, shake, gun kick, barrel spin, muzzle flash,
// shell casings and impact sparks, the red hurt tint, and the dust motes around the own eye. No
// DOM, times in seconds, unit-tested.
import { EYE, INTERP_DELAY, RANGE } from '../shared/constants';
import { blocked, sectorAt } from '../shared/level';
import { TAU } from '../shared/physics';
import { KEY } from '../shared/types';
import type { Level, PlayerState, Shot } from '../shared/types';
import { cross } from './mesh';
import type { Vec3 } from './mesh';

export interface Spark {
  p: Vec3;
  v: Vec3;
  /** Seconds left. */
  life: number;
  /** Flat colour, orange when absent. */
  c?: number[];
}

/** What `fall` moves: a position, a velocity, the half height it rests on, the floor under it. */
interface Body {
  p: Vec3;
  v: Vec3;
  size: number;
  /** Floor height under it, as of the last sector it was in. */
  floor: number;
  /** Landed for good. */
  rest: boolean;
}

/**
 * A brass shell casing: it tumbles end over end (`tilt` is its angle to the floor, about the
 * horizontal axis across `yaw`), bounces on the floor below, lies still, then shrinks away. A
 * free slot has `life` 0 or less; `size` is its radius, its half length is 2.8 times that.
 */
export interface Casing extends Body {
  yaw: number;
  tilt: number;
  /** Tumble, radians a second. */
  spin: number;
  /** Seconds left. */
  life: number;
  /** Ejected by the own gun: the rest are the others', smaller and few. */
  own: boolean;
}

/** What the renderer and the camera read; update and shot move it. */
export interface Effects {
  /** Vertical eye offset, metres. */
  bob: number;
  /** Radians, positive leans right (strafing right). */
  roll: number;
  /** Camera yaw and pitch jitter, radians. */
  shakeYaw: number;
  shakePitch: number;
  /** Recoil, 1 at a shot down to 0. */
  kick: number;
  /** Barrel angle, radians. */
  spin: number;
  /** Seconds of own muzzle flash left. */
  flash: number;
  /** Seconds of flash left at each other shooter, by player id. */
  flashes: Map<number, number>;
  sparks: Spark[];
  /** A fixed pool: the live ones have `life` above 0. */
  casings: Casing[];
  /** Dust motes, x y z each, in a box around the own eye; `lit` says which the flashlight shows. */
  motes: Float32Array;
  /** Seconds of the red hurt tint left. */
  hurt: number;
  /** Seconds left of the fade of a picked-up item's colour, and that colour (0 to 1 each). */
  gain: number;
  gainC: number[];
  /** 0 to 1: how far the camera has sunk and tilted since the own player died; the gun hides. */
  dead: number;
  /**
   * Advances dt seconds: the own player (eased, undefined before the first snapshot), the held
   * keys and whether the own player is dead.
   */
  update(me: PlayerState | undefined, keys: number, dt: number, dead?: boolean): void;
  /** The own health dropped: the red tint. */
  hit(): void;
  /** An item of colour c was picked up near the own player: its colour fades over the screen. */
  pickup(c: number[]): void;
  /**
   * A shot, from the shooter's eye; own ones kick the camera and the gun. Each ejects a casing to
   * the right of the view. No sparks with `sparks` false: a shot that hit the viewer would burst
   * them inside the camera.
   */
  shot(s: Shot, from: Vec3, own: boolean, sparks?: boolean): void;
}

const FLASH = 0.05;
const LIFE = 0.3;
const MAX_SPARKS = 96;
const MAX_CASINGS = 32;
/** Of those, the ones the others' guns may hold at once. */
const MAX_REMOTE = 8;
/** Motes, and the half sides of the box they live in: they wrap round it as the eye moves. */
export const MOTES = 128;
const BOX = [5, 1.6, 5];
/** The flashlight as the motes see it: a cone of cos(25°), this long, metres. */
const CONE = Math.cos(0.436);
const REACH = 6;
/** Seconds the hit vignette and the pickup fade take to go out. */
export const HURT = 0.45;
export const GAIN = 0.4;
/** Seconds the camera takes to sink, the roll it ends at, and the eye height it ends at. */
const SINK = 0.5;
const TILT = 0.9;
const LOW = 0.3;
/** Seconds of velocity a spark's streak spans. */
export const TRAIL = 0.04;
/** Bob phase per metre walked, and its amplitude in metres. */
const STRIDE = 4.4;
const BOB = 0.035;
const ROLL = 0.03;
const SPIN_MAX = 30;

/**
 * The motes the own flashlight shows, from the eye along the unit view direction f: x, y, z and a
 * brightness in (0, 1] each, fuller near the axis and the eye. None while the own player is dead.
 */
export const lit = (fx: Effects, eye: Vec3, f: Vec3) => {
  const out: number[] = [];
  for (let i = 0; i < fx.motes.length && !fx.dead; i += 3) {
    const d = [0, 1, 2].map(a => fx.motes[i + a] - eye[a]);
    const r = Math.hypot(...d);
    const c = (d[0] * f[0] + d[1] * f[1] + d[2] * f[2]) / r;
    if (r < REACH && c > CONE) {
      out.push(...d.map((x, a) => eye[a] + x), ((c - CONE) / (1 - CONE)) * (1 - r / REACH));
    }
  }
  return out;
};

/**
 * Holds what the host reported at `now` for INTERP_DELAY ms, so it fires in step with the others,
 * who are drawn that far in the past. Keeps at most `max`: a hidden tab does not grow it.
 */
export const createDelay = <T>(max = 64) => {
  const q: { t: number; v: T }[] = [];
  return {
    push(items: T[], now: number) {
      q.push(...items.map(v => ({ t: now, v })));
      q.splice(0, q.length - max);
    },
    /** What is due at `now`, oldest first. */
    due(now: number): T[] {
      const n = q.findIndex(({ t }) => t + INTERP_DELAY > now);
      return q.splice(0, n < 0 ? q.length : n).map(({ v }) => v);
    },
  };
};

/** rand in [0, 1): injectable so the tests are exact. The level lets casings land and bounce off walls. */
export const createEffects = (rand = Math.random, level?: Level): Effects => {
  const lvl = level;
  let phase = 0;
  /** 0 to 1: how much of the bob shows, so stopping does not snap the eye. */
  let amt = 0;
  let shake = 0;
  let lean = 0;
  let rate = 0;
  let clock = 0;
  /** The motes are scattered at the next update: first one, or a new level. */
  let fresh = true;
  const drift = new Float32Array(MOTES * 3);
  let last: PlayerState | undefined;
  const r2 = () => rand() * 2 - 1;
  const spark = (p: Vec3, v: Vec3, life: number, c?: number[]) => {
    if (fx.sparks.length < MAX_SPARKS) {
      fx.sparks.push({ p, v, life, c });
    }
  };

  const fx: Effects = {
    bob: 0,
    roll: 0,
    shakeYaw: 0,
    shakePitch: 0,
    kick: 0,
    spin: 0,
    flash: 0,
    flashes: new Map(),
    sparks: [],
    // The rest of a casing's fields are set when it is ejected.
    casings: Array.from({ length: MAX_CASINGS }, () => ({
      p: [0, 0, 0],
      v: [0, 0, 0],
      life: 0,
      rest: true,
      own: false,
    })) as Casing[],
    motes: new Float32Array(MOTES * 3),
    hurt: 0,
    gain: 0,
    gainC: [1, 1, 1],
    dead: 0,

    update(me, keys, dt, dead = false) {
      const ease = Math.min(1, dt * 10);
      // Distance on the floor, a respawn (a jump of metres) excepted.
      const d = me && last?.ground && me.ground ? Math.hypot(me.x - last.x, me.z - last.z) : 0;
      if (d < 1) {
        phase += d * STRIDE;
      }
      amt += ((d > 0.5 * dt && d < 1 ? 1 : 0) - amt) * ease;
      last = me;
      fx.dead = Math.max(0, Math.min(1, fx.dead + (dead ? dt : -dt) / SINK));
      const sink = fx.dead * fx.dead * (3 - 2 * fx.dead);
      fx.bob = Math.sin(phase) * BOB * amt - sink * (EYE - LOW);

      const strafe = +!!(keys & KEY.RIGHT) - +!!(keys & KEY.LEFT);
      lean += (strafe * ROLL - lean) * Math.min(1, dt * 8);
      fx.roll = lean + sink * TILT;

      shake *= Math.exp(-dt * 12);
      fx.shakeYaw = r2() * shake;
      fx.shakePitch = r2() * shake;
      fx.kick *= Math.exp(-dt * 18);
      fx.flash = Math.max(0, fx.flash - dt);
      for (const [id, t] of fx.flashes) {
        if (t > dt) {
          fx.flashes.set(id, t - dt);
        } else {
          fx.flashes.delete(id);
        }
      }

      rate = Math.max(0, Math.min(SPIN_MAX, rate + (keys & KEY.FIRE ? 60 : -25) * dt));
      fx.spin = (fx.spin + rate * dt) % TAU;

      for (const s of fx.sparks) {
        s.v[1] -= 9.8 * dt;
        s.p = s.p.map((x, i) => x + s.v[i] * dt) as Vec3;
        s.life -= dt;
      }
      fx.sparks = fx.sparks.filter(s => s.life > 0);

      fx.hurt = Math.max(0, fx.hurt - dt);
      fx.gain = Math.max(0, fx.gain - dt);
      for (const c of fx.casings) {
        c.life -= dt;
        if (c.life > 0 && !c.rest) {
          c.tilt += c.spin * dt;
          if (fall(c, dt, 9.8, 1.2, 0.4, 0.6)) {
            c.spin *= 0.5;
          }
          // Lying still, it lies flat.
          c.tilt *= +!c.rest;
        }
      }
      if (me) {
        clock += dt;
        fx.motes.forEach((m, i) => {
          const [a, h] = [i % 3, BOX[i % 3]];
          const o = a == 1 ? me.y + EYE : a ? me.z : me.x;
          drift[i] = fresh ? r2() * 0.1 : drift[i];
          const x = fresh ? o + r2() * h : m + (drift[i] + Math.sin(clock * 0.8 + i) * 0.05) * dt;
          fx.motes[i] = o + ((((x - o + h) % (2 * h)) + 2 * h) % (2 * h)) - h;
        });
        fresh = false;
      }
    },

    hit() {
      fx.hurt = HURT;
    },

    pickup(c) {
      [fx.gain, fx.gainC] = [GAIN, c];
    },

    shot(s, from, own, sparks = true) {
      if (own) {
        fx.kick = 1;
        fx.flash = FLASH;
        shake = 0.012;
      } else {
        fx.flashes.set(s.id, FLASH);
      }
      const at: Vec3 = [s.x, s.y, s.z];
      eject(from, at, own);
      const back = from.map((x, i) => x - at[i]);
      const len = Math.hypot(...back);
      // A shot that reached RANGE hit nothing near.
      if (sparks && len > 0 && len < RANGE - 0.01) {
        for (let i = 0; i < 4; i++) {
          const v = back.map(x => (x / len) * (2 + rand() * 2) + r2()) as Vec3;
          v[1] += 1;
          spark(at, v, LIFE * (0.6 + rand() * 0.4));
        }
      }
    },
  };

  /** Where a step ends, so `fall` allocates nothing. */
  const to: Vec3 = [0, 0, 0];
  /**
   * One step of a falling body: gravity `grav`, a bounce off walls, a landing on the floor below.
   * It bounces off the floor while it lands faster than `hop` (keeping `bounce` of the speed up
   * and `keep` of the speed along), else it lies still. Says whether it touched the floor.
   */
  const fall = (g: Body, dt: number, grav: number, hop: number, bounce: number, keep: number) => {
    g.v[1] -= grav * dt;
    g.p.forEach((x, i) => (to[i] = x + g.v[i] * dt));
    if (lvl && blocked(lvl, g.p, to)) {
      g.v[0] *= -0.3;
      g.v[2] *= -0.3;
      [to[0], to[2]] = [g.p[0], g.p[2]];
    }
    const s = lvl?.map.sectors[sectorAt(lvl, to[0], to[2])];
    g.floor = s?.floor ?? g.floor;
    if (s && to[1] > s.ceil - g.size) {
      to[1] = s.ceil - g.size;
      g.v[1] = Math.min(g.v[1], 0) * 0.3;
    }
    const hit = to[1] <= g.floor + g.size;
    if (hit) {
      to[1] = g.floor + g.size;
      if (g.v[1] < -hop) {
        [g.v[0], g.v[1], g.v[2]] = [g.v[0] * keep, -g.v[1] * bounce, g.v[2] * keep];
      } else {
        g.v.fill(0);
        g.rest = true;
      }
    }
    to.forEach((x, i) => (g.p[i] = x));
    return hit;
  };
  /**
   * A casing flies out of the gun's port, to the right of the view: `from` is the shooter's eye, `at`
   * where the shot stopped, which gives the view direction. The own gun may take the slot of the
   * casing nearest to vanishing; the others' only take a free one, and at most MAX_REMOTE of them.
   */
  const eject = (from: Vec3, at: Vec3, own: boolean) => {
    let [pick, remote] = [fx.casings[0], 0];
    for (const c of fx.casings) {
      remote += +(c.life > 0 && !c.own);
      pick = c.life < pick.life ? c : pick;
    }
    if (!own && (pick.life > 0 || remote >= MAX_REMOTE)) {
      return;
    }
    const n = Math.hypot(...at.map((x, i) => x - from[i])) || 1;
    const d = at.map((x, i) => (x - from[i]) / n) as Vec3;
    const h = Math.hypot(d[0], d[2]) || 1;
    const right: Vec3 = [-d[2] / h, 0, d[0] / h];
    const up = cross(right, d);
    // The port: at the own gun, down and right of the eye; at the others', at their hand.
    const port = own ? [0.32, -0.22, 0.62] : [0.3, -0.45, 0.3];
    const [out, rise, drift] = [0.9 + rand() * 0.8, 1 + rand(), rand() * 0.6 - 0.3];
    for (let i = 0; i < 3; i++) {
      pick.p[i] = from[i] + right[i] * port[0] + up[i] * port[1] + d[i] * port[2];
      pick.v[i] = right[i] * out + up[i] * rise + d[i] * drift;
    }
    // Against a wall the port is outside it: eject from the eye, and the wall does the rest.
    if (lvl && blocked(lvl, from, pick.p)) {
      from.forEach((x, i) => (pick.p[i] = x));
    }
    Object.assign(pick, {
      yaw: rand() * TAU,
      tilt: rand() * TAU,
      spin: (rand() < 0.5 ? -1 : 1) * (15 + rand() * 20),
      size: own ? 0.01 : 0.006,
      life: 3 + rand(),
      floor: lvl?.map.sectors[sectorAt(lvl, pick.p[0], pick.p[2])]?.floor ?? from[1] - EYE,
      rest: false,
      own,
    });
  };
  return fx;
};
