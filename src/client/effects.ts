// Camera and gun feel, fed each frame: head bob, roll, shake, gun kick, barrel spin, muzzle flash
// and impact sparks; and what the host reports of the monsters: gibs, explosions, smoke, blows, the
// red hurt tint; and the dust motes around the own eye. No DOM, times in seconds, unit-tested.
import { EYE, INTERP_DELAY, RANGE } from '../shared/constants';
import { blocked, sectorAt } from '../shared/level';
import { TAU } from '../shared/physics';
import { EVENT, KEY } from '../shared/types';
import type { Bullet, GameEvent, Level, Monster, PlayerState, Shot } from '../shared/types';
import { CHUNKS, SWING } from './monsters';
import type { Vec3 } from './mesh';

export interface Spark {
  p: Vec3;
  v: Vec3;
  /** Seconds left. */
  life: number;
  /** Flat colour, orange when absent. */
  c?: number[];
}

/** A chunk of a dead monster: it flies, lands on the floor below, then shrinks away. */
export interface Gib {
  p: Vec3;
  v: Vec3;
  yaw: number;
  /** Half the side of its cube, metres. */
  size: number;
  c: number[];
  /** Seconds left. */
  life: number;
  /** Floor height under it, as of the last sector it was in. */
  floor: number;
  /** Landed for good. */
  rest: boolean;
}

/** An explosion: a glow of radius r at its biggest, t seconds old. */
export interface Blast {
  p: Vec3;
  r: number;
  t: number;
}

/** A puff of smoke: it rises and drifts, swells, then shrinks away over `life` seconds. */
export interface Puff {
  p: Vec3;
  v: Vec3;
  /** Half the side of its cube at its biggest, metres. */
  r: number;
  yaw: number;
  /** Age and lifetime, seconds. */
  t: number;
  life: number;
}

/** What the client keeps of each monster it has drawn. */
export interface Walker {
  x: number;
  z: number;
  /** Distance covered, metres: the limbs swing with it. */
  walked: number;
  kind: number;
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
  gibs: Gib[];
  blasts: Blast[];
  smoke: Puff[];
  /** Dust motes, x y z each, in a box around the own eye; `lit` says which the flashlight shows. */
  motes: Float32Array;
  /** Seconds of the red hurt tint left. */
  hurt: number;
  /** Seconds left of the fade of a picked-up item's colour, and that colour (0 to 1 each). */
  gain: number;
  gainC: number[];
  /** 0 to 1: how far the camera has sunk and tilted since the own player died; the gun hides. */
  dead: number;
  /** Seconds of blow left at each monster, by id. */
  swings: Map<number, number>;
  /** Every monster seen so far, by id. Ids are bounded, so it is too. */
  herd: Map<number, Walker>;
  /** Unit heading of each bullet in flight, by id, once it has moved. */
  aim: Map<number, Vec3>;
  /**
   * Advances dt seconds: the own player (eased, undefined before the first snapshot), the held
   * keys and whether the own player is dead.
   */
  update(me: PlayerState | undefined, keys: number, dt: number, dead?: boolean): void;
  /** The own health dropped: the red tint. */
  hit(): void;
  /** An item of colour c was picked up near the own player: its colour fades over the screen. */
  pickup(c: number[]): void;
  /** A new level: drops every effect of the old one, and lets gibs land on the new `lvl`. */
  reset(lvl: Level): void;
  /**
   * A shot, from the shooter's eye; own ones kick the camera and the gun. No sparks with
   * `sparks` false: a shot that hit the viewer would burst them inside the camera.
   */
  shot(s: Shot, from: Vec3, own: boolean, sparks?: boolean): void;
  /** The monsters and bullets drawn this frame: how far each walked, which way each bullet flies. */
  track(monsters: Monster[], bullets: Bullet[]): void;
  /** A host event, once delayed to line up with the drawn monsters; `you` is the own player id. */
  event(e: GameEvent, you: number): void;
}

const FLASH = 0.05;
const LIFE = 0.3;
const MAX_SPARKS = 96;
const MAX_GIBS = 64;
const MAX_BLASTS = 12;
const MAX_SMOKE = 40;
/** Motes, and the half sides of the box they live in: they wrap round it as the eye moves. */
export const MOTES = 128;
const BOX = [5, 1.6, 5];
/** The flashlight as the motes see it: a cone of cos(25°), this long, metres. */
const CONE = Math.cos(0.436);
const REACH = 6;
export const BLAST = 0.3;
/** Seconds the hit vignette and the pickup fade take to go out. */
export const HURT = 0.45;
export const GAIN = 0.4;
/** Seconds the camera takes to sink, the roll it ends at, and the eye height it ends at. */
const SINK = 0.5;
const TILT = 0.9;
const LOW = 0.3;
/** Gibs fall faster than players: they are small. */
const GIB_G = 14;
/** Seconds of velocity a spark's streak spans. */
export const TRAIL = 0.04;
/** Bob phase per metre walked, and its amplitude in metres. */
const STRIDE = 4.4;
const BOB = 0.035;
const ROLL = 0.03;
const SPIN_MAX = 30;

/** Half the side of an explosion's glow: it swells fast, then shrinks to nothing as it ends. */
export const glow = ({ r, t }: Blast) => {
  const u = t / BLAST;
  return u < 1 ? r * Math.sqrt(u) * (1 - u * u * u) : 0;
};

/** Half the side of a puff of smoke: it starts at a third, swells for half its life, then shrinks to nothing. */
export const puff = ({ r, t, life }: Puff) => {
  const u = t / life;
  return r * (0.3 + 0.7 * Math.min(1, u * 2)) * Math.min(1, (1 - u) / 0.3);
};

/** How opaque a puff of smoke is, 0 to 1: it comes in over a tenth of its life, then thins out to nothing. */
export const fade = ({ t, life }: Puff) => {
  const u = t / life;
  return 0.85 * Math.min(1, u * 10) * (1 - u);
};

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
  let q: { t: number; v: T }[] = [];
  return {
    /** Forgets what is held: it belongs to a level that is gone. */
    clear() {
      q = [];
    },
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

/** rand in [0, 1): injectable so the tests are exact. The level lets gibs land and bounce off walls. */
export const createEffects = (rand = Math.random, level?: Level): Effects => {
  let lvl = level;
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
  /** Previous position of each bullet, to find its heading. */
  let flown = new Map<number, Vec3>();
  const spark = (p: Vec3, v: Vec3, life: number, c?: number[]) => {
    if (fx.sparks.length < MAX_SPARKS) {
      fx.sparks.push({ p, v, life, c });
    }
  };
  const burst = (p: Vec3, n: number, speed: number, c?: number[]) => {
    for (let i = 0; i < n; i++) {
      const [a, up] = [rand() * TAU, r2()];
      const k = Math.sqrt(1 - up * up) * speed * (0.5 + rand() * 0.5);
      spark(p, [Math.cos(a) * k, up * speed, Math.sin(a) * k], LIFE * (0.6 + rand() * 0.4), c);
    }
  };
  const puffs = (p: Vec3, n: number, r: number) => {
    for (let i = 0; i < n; i++) {
      fx.smoke.push({
        p: p.map(x => x + r2() * 0.3) as Vec3,
        v: [r2() * 0.5, 0.5 + rand() * 0.7, r2() * 0.5],
        r: r * (0.7 + rand() * 0.6),
        yaw: rand() * TAU,
        t: 0,
        life: 1.5 + rand(),
      });
    }
    fx.smoke.splice(0, fx.smoke.length - MAX_SMOKE);
  };
  const blast = (p: Vec3, r: number) => {
    fx.blasts.push({ p, r, t: 0 });
    fx.blasts.splice(0, fx.blasts.length - MAX_BLASTS);
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
    gibs: [],
    blasts: [],
    smoke: [],
    motes: new Float32Array(MOTES * 3),
    hurt: 0,
    gain: 0,
    gainC: [1, 1, 1],
    dead: 0,
    swings: new Map(),
    herd: new Map(),
    aim: new Map(),

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
      for (const [id, t] of fx.swings) {
        if (t > dt) {
          fx.swings.set(id, t - dt);
        } else {
          fx.swings.delete(id);
        }
      }
      for (const b of fx.blasts) {
        b.t += dt;
      }
      fx.blasts = fx.blasts.filter(b => b.t < BLAST);
      for (const g of fx.gibs) {
        g.life -= dt;
        if (!g.rest) {
          fall(g, dt);
        }
      }
      fx.gibs = fx.gibs.filter(g => g.life > 0);
      for (const { p, v } of fx.smoke) {
        p.forEach((x, i) => (p[i] = x + v[i] * dt));
        p[1] = Math.min(p[1], lvl?.map.sectors[sectorAt(lvl, p[0], p[2])]?.ceil ?? Infinity);
      }
      for (const s of fx.smoke) {
        s.t += dt;
      }
      fx.smoke = fx.smoke.filter(s => s.t < s.life);
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

    reset(next) {
      lvl = next;
      fx.sparks = [];
      fx.gibs = [];
      fx.blasts = [];
      fx.smoke = [];
      fresh = true;
      fx.flashes.clear();
      fx.swings.clear();
      fx.herd.clear();
      fx.aim.clear();
      flown.clear();
      fx.hurt = fx.gain = fx.flash = 0;
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

    track(monsters, bullets) {
      for (const { id, kind, x, z } of monsters) {
        const w = fx.herd.get(id);
        // A respawn (a jump of metres) does not make the limbs run.
        const d = w ? Math.hypot(x - w.x, z - w.z) : 0;
        fx.herd.set(id, { x, z, kind, walked: (w?.walked ?? 0) + (d < 1 ? d : 0) });
      }
      const seen = new Map<number, Vec3>();
      for (const { id, x, y, z } of bullets) {
        const [p, q] = [flown.get(id), [x, y, z] as Vec3];
        const d = p ? Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) : 0;
        if (p && d > 1e-4) {
          fx.aim.set(id, q.map((v, i) => (v - p[i]) / d) as Vec3);
        }
        seen.set(id, q);
      }
      flown = seen;
      for (const id of fx.aim.keys()) {
        if (!seen.has(id)) {
          fx.aim.delete(id);
        }
      }
    },

    event({ type, id, x, y, z }, you) {
      const p: Vec3 = [x, y, z];
      if (type == EVENT.DIE) {
        const chunks = CHUNKS[fx.herd.get(id)?.kind ?? 0] ?? CHUNKS[0];
        const n = 10 + Math.floor(rand() * 7);
        for (let i = 0; i < n; i++) {
          const a = rand() * TAU;
          const k = 1.5 + rand() * 3.5;
          fx.gibs.push({
            p: [x, y + r2() * 0.3, z],
            v: [Math.cos(a) * k, 2 + rand() * 4, Math.sin(a) * k],
            yaw: rand() * TAU,
            size: 0.05 + rand() * 0.08,
            c: chunks[Math.floor(rand() * chunks.length)],
            life: 2 + rand(),
            floor: lvl?.map.sectors[sectorAt(lvl, x, z)]?.floor ?? y,
            rest: false,
          });
        }
        fx.gibs.splice(0, fx.gibs.length - MAX_GIBS);
        blast(p, 0.6);
        burst(p, 14, 5);
        puffs(p, 6 + Math.floor(rand() * 3), 0.3);
      } else if (type == EVENT.BOOM) {
        blast(p, 0.25);
        burst(p, 8, 3);
        puffs(p, 3, 0.15);
      } else if (type == EVENT.HURT) {
        // Sparks at the viewer's own eye would burst inside the camera: its health drop tints.
        if (id != you) {
          burst(p, 8, 3, [1, 0.12, 0.08]);
        }
      } else if (type == EVENT.SWING) {
        fx.swings.set(id, SWING);
      }
    },
  };

  /** One step of a flying gib: gravity, a bounce off walls, a landing on the floor below. */
  const fall = (g: Gib, dt: number) => {
    g.v[1] -= GIB_G * dt;
    const to = g.p.map((x, i) => x + g.v[i] * dt) as Vec3;
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
    if (to[1] <= g.floor + g.size) {
      to[1] = g.floor + g.size;
      // The first fall bounces a little, the next ones lie still.
      if (g.v[1] < -3) {
        g.v = [g.v[0] * 0.5, -g.v[1] * 0.3, g.v[2] * 0.5];
      } else {
        g.v = [0, 0, 0];
        g.rest = true;
      }
    }
    g.p = to;
  };
  return fx;
};
