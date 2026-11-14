// A vehicle's damage as it is seen and heard (the user, 2026-11-12): electric arcs at fixed places
// on the hull, more of them as its health falls; the explosion at 0; the wreck, charred and
// slumped, which falls apart over its last second; the fresh vehicle shimmering in on its spawn.
// Everything is read off the vehicles' health and wreck time as the snapshots give them: nothing
// else comes over the wire. No DOM, no GL.
import { TICK_HZ, VEHICLE } from '../shared/constants';
import { gravity } from '../shared/physics';
import type { Rover } from '../shared/types';
import type { World } from '../shared/world';
import { STRIDE, basis } from './mesh';
import type { Vec3 } from './mesh';
import { SOUND } from './sfx';
import { room } from './verts';
import type { Out } from './verts';

/**
 * Where a hull arcs, right of the vehicle's centre, above it and ahead of it, each on the model: a
 * rover's (the four wheels' arms, the nose, the rear deck, the two lasers, the dashboard, the roll
 * bar's corners, behind the seats), then a ship's (the nose's tip and top, the cockpit's frame, the
 * engines' intakes and nozzles, the wing tips, the spine, a cannon).
 */
export const ANCHORS: [Vec3[], Vec3[]] = [
  [
    [-0.61, -0.45, 1.21],
    [0.61, -0.45, 1.21],
    [-0.61, -0.45, -1.29],
    [0.61, -0.45, -1.29],
    [0.1, -0.13, 1.98],
    [0.33, 0.12, -1.51],
    [-1.05, 0.23, 0.6],
    [1.05, 0.23, 0.6],
    [-0.45, 0.18, 0.9],
    [-0.52, 1.1, -0.57],
    [0.52, 1.1, -0.57],
    [0.34, 0.44, -1.08],
  ],
  [
    [0, -0.14, 8.1],
    [0.09, 0.32, 4.9],
    [-0.57, 0.64, 1.5],
    [0.57, 0.64, 1.5],
    [-1.71, 0.2, -1.35],
    [1.39, 0.2, -1.35],
    [-1.55, 0.3, -6],
    [1.55, 0.3, -6],
    [-3.9, -0.15, -3.38],
    [3.9, -0.15, -3.38],
    [-0.3, 0.72, -4.05],
    [-2.67, -0.2, -0.9],
  ],
];
/** The places that arc, by health: none whole, one or two down to 7, about half to 4, nearly all under. */
const LIVE = [0, 11, 10, 9, 6, 5, 4, 2, 1, 1, 0];
/** The arcs of a fresh wreck, which die out before it falls apart. */
const DYING = 8;
/** Ticks a vehicle parked afresh takes to shimmer in: a drawn vehicle's `wreck` counts them below 0. */
export const SHIMMER = 30;
/** A wreck's soot (the share of its colour left), and how far it sags: metres down, radians of roll and of nose down; a ship more, its legs gone. */
const SOOT = 0.14;
const SAG = [
  [0.22, 0.09, 0.05],
  [0.55, 0.14, 0.05],
];
/** Metres round an arcing place the hull is scorched, and the share of its colour left at the place. */
const SCORCH = [0.7, 0.25];
/** The colours a piece glows in as it falls apart, and as it shimmers in. */
const EMBER = [3, 1.1, 0.2];
const GLINT = [0.5, 1.5, 2.4];
/** Arcs' time slots a second, the chance a place arcs in one, its bolt's length in metres (from, and up to as much more) and its width in katana bolts; a ship's are BIG times that. */
const SLOTS = 30;
const CHANCE = 0.4;
const SPAN = [0.45, 0.6];
const WIDE = 3;
const BIG = 1.8;
/** Debris thrown by an explosion, kept at most, and puffs of smoke kept at most. */
const BITS = 36;
const MAX_BITS = 144;
const MAX_PUFFS = 160;
/** Metres from an explosion at which the camera no longer shakes. */
const QUAKE = 40;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
/** In [0, 1), from an integer: the same on every client. */
const hash = (n: number): number => {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};

/** How many places of the hull arc: by its health while it is whole, dying out on a wreck. */
export const arcs = (r: Pick<Rover, 'hp' | 'wreck'>): number => {
  const w = r.wreck ?? 0;
  return w
    ? clamp(Math.ceil((DYING * (w - VEHICLE.FADE)) / (VEHICLE.WRECK - VEHICLE.FADE)), 0, DYING)
    : LIVE[clamp(Math.round(r.hp ?? VEHICLE.HP), 0, VEHICLE.HP)];
};

/** The order vehicle `k` of the map's lights its places in: its own, the same on every client. */
export const order = (k: number): number[] =>
  ANCHORS[0].map((_, i) => i).sort((a, b) => hash(k * 31 + a) - hash(k * 31 + b));

/** The vehicle as it is drawn: a wreck sags on its wheels or its belly. */
export const pose = (r: Rover): Rover => {
  if (!((r.wreck ?? 0) > 0)) {
    return r;
  }
  const [down, roll, nose] = SAG[+!!r.ship];
  return { ...r, y: r.y - down, roll: r.roll + roll, pitch: r.pitch - nose };
};

/** The places of vehicle `k` that arc now, in the world: the first arcs() of its order(), on its pose(). */
export const spots = (r: Rover, k: number): Vec3[] => {
  const q = pose(r);
  const [R, U, F] = basis(q.yaw, q.pitch, q.roll);
  return order(k)
    .slice(0, arcs(r))
    .map(i => {
      const [x, y, a] = ANCHORS[+!!r.ship][i];
      return [
        q.x + R[0] * x + U[0] * y + F[0] * a,
        q.y + R[1] * x + U[1] * y + F[1] * a,
        q.z + R[2] * x + U[2] * y + F[2] * a,
      ];
    });
};

/**
 * The bolts of vehicle `k` in the time slot `slot` (SLOTS a second): each from a place of spots()
 * to a point a short way off it, there in CHANCE of the slots. A function of the three alone.
 */
export const sparking = (r: Rover, k: number, slot: number): [Vec3, Vec3][] =>
  spots(r, k).flatMap((a, j) => {
    const n = (k * 7919 + order(k)[j] * 131 + slot) | 0;
    if (hash(n) >= CHANCE) {
      return [];
    }
    const l = (SPAN[0] + SPAN[1] * hash(n + 1)) * (r.ship ? BIG : 1);
    const d = [2, 3, 4].map(i => hash(n + i) * 2 - 1);
    const m = Math.hypot(...d) || 1;
    return [[a, a.map((v, i) => v + (d[i] / m) * l) as Vec3]];
  });

/**
 * Takes the triangles of `out` from `from` on apart, `p` of the way (0 whole, 1 gone): each shrinks
 * onto its middle in its own time, glows `rgb` meanwhile and sinks `fall` metres.
 */
const crumble = (
  out: Out,
  from: number,
  p: number,
  seed: number,
  rgb: number[],
  fall: number,
): void => {
  const buf = room(out, 0);
  for (let i = from, t = 0; i + 3 * STRIDE <= out.length; i += 3 * STRIDE, t++) {
    const k = clamp((p - 0.7 * hash(seed * 977 + t)) / 0.3, 0, 1);
    if (!k) {
      continue;
    }
    const c = [0, 1, 2].map(a => (buf[i + a] + buf[i + STRIDE + a] + buf[i + 2 * STRIDE + a]) / 3);
    for (let v = i; v < i + 3 * STRIDE; v += STRIDE) {
      for (let a = 0; a < 3; a++) {
        buf[v + a] = c[a] + (buf[v + a] - c[a]) * (1 - k);
      }
      buf[v + 1] -= fall * k * k;
      [buf[v + 6], buf[v + 7], buf[v + 9]] = rgb.map(x => x * (1 - 0.5 * k));
      buf[v + 8] = -2;
    }
  }
};

/**
 * The damage on the model of vehicle `k`, its vertices in `out` from `from` on. Hurt, its hull is
 * scorched round the places that arc. A wreck is soot all over and nothing on it glows; over its
 * last VEHICLE.FADE ticks it falls apart into embers. One just parked afresh (`wreck` below 0)
 * shimmers in.
 */
export const char = (out: Out, from: number, r: Rover, k = 0): void => {
  const buf = room(out, 0);
  const w = r.wreck ?? 0;
  if (w < 0) {
    crumble(out, from, clamp(-w / SHIMMER, 0, 1), k + 1, GLINT, 0);
    return;
  }
  if (!w) {
    const at = (r.hp ?? VEHICLE.HP) < VEHICLE.HP ? spots(r, k) : [];
    for (let i = from; at.length && i < out.length; i += STRIDE) {
      if (buf[i + 8] <= -2) {
        continue;
      }
      const d = Math.min(
        ...at.map(([x, y, z]) => Math.hypot(buf[i] - x, buf[i + 1] - y, buf[i + 2] - z)),
      );
      if (d < SCORCH[0]) {
        const s = SCORCH[1] + (1 - SCORCH[1]) * (d / SCORCH[0]) ** 2;
        [buf[i + 6], buf[i + 7], buf[i + 9]] = [buf[i + 6] * s, buf[i + 7] * s, buf[i + 9] * s];
      }
    }
    return;
  }
  for (let i = from; i < out.length; i += STRIDE) {
    // Glass stays glass (layer -3: its opacity is in green).
    if (buf[i + 8] != -3) {
      [buf[i + 6], buf[i + 7], buf[i + 9]] = [buf[i + 6], buf[i + 7], buf[i + 9]].map(
        c => Math.min(c, 1) * SOOT,
      );
      buf[i + 8] = -1;
    }
  }
  if (w < VEHICLE.FADE) {
    crumble(out, from, 1 - w / VEHICLE.FADE, k + 1, EMBER, r.ship ? 1.2 : 0.7);
  }
};

/** A piece of debris: where, its speed, its turns a second, its age and its life, its size, the floor it lies on. */
interface Bit {
  p: Vec3;
  v: Vec3;
  spin: number;
  age: number;
  life: number;
  size: number;
  floor: number;
}
/** A puff of smoke: where, its speed, its age and its life. */
interface Puff {
  p: Vec3;
  v: Vec3;
  age: number;
  life: number;
}

/** A ball of radius 1 in eight faces, smooth: a puff of smoke (layer -3, its opacity in green). */
const BALL: number[] = [];
for (const [sx, sy, sz] of [
  [1, 1, 1],
  [-1, 1, -1],
  [1, -1, -1],
  [-1, -1, 1],
  [-1, 1, 1],
  [1, 1, -1],
  [1, -1, 1],
  [-1, -1, -1],
]) {
  // Wound to face out.
  const tri = [
    [sx, 0, 0],
    [0, sy, 0],
    [0, 0, sz],
  ];
  for (const p of sx * sy * sz > 0 ? tri : tri.reverse()) {
    BALL.push(...p, ...p, 0.12, 1, -3, 0.12);
  }
}
/** A shard: four corners, four flat faces. */
const SHARD: Vec3[] = [
  [1, 0, -0.5],
  [-1, 0, -0.5],
  [0, 0, 1],
  [0, 0.9, 0],
];

/** What plays a vehicle's damage: the tracer's bolts, fireballs and sparks, the sounds, the camera's shake. */
export interface Stage {
  tracer: {
    arc(a: Vec3, b: Vec3, wide?: number): void;
    blast(at: Vec3, size?: number): void;
    ring(at: Vec3, r: number): void;
    spit(at: Vec3): void;
  };
  audio: { play(id: number, at?: Vec3, gain?: number, rate?: number): void };
  fx: { quake(k: number): void };
}

export interface Wrecks {
  /**
   * One frame over the map's vehicles as the predictor gives them: plays what happened since the
   * last (a hull hit, an explosion, a wreck falling apart), lets the hurt ones arc and smoke, and
   * returns them as they are drawn: a wreck's time eased between the wire's steps, a vehicle just
   * parked afresh with its shimmer's ticks below 0. `eye` is where the shake is felt from.
   */
  frame(rovers: Rover[], dt: number, eye?: Vec3): Rover[];
  /** Appends the debris and the smoke. */
  draw(out: Out): void;
  /** Debris and puffs in flight. */
  readonly count: number;
}

export const createWrecks = (world: World, { tracer, audio, fx }: Stage): Wrecks => {
  /** Each vehicle as last framed, its wreck time eased, its shimmer's ticks left, the seconds to its next crackle. */
  let was: Rover[] = [];
  const eased: number[] = [];
  const fresh: number[] = [];
  const hush: number[] = [];
  let bits: Bit[] = [];
  let puffs: Puff[] = [];
  /** Fireballs still to come: seconds left, where, how big. */
  let fuses: [left: number, at: Vec3, size: number][] = [];
  let clock = 0;
  let seed = 11;
  /** In [0, 1): the same run every time. */
  const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const along = (r: Rover, a: number): Vec3 => {
    const F = basis(r.yaw, r.pitch, r.roll)[2];
    return [r.x + F[0] * a, r.y + F[1] * a, r.z + F[2] * a];
  };
  const smoke = (p: Vec3, up: number) => {
    const a = rnd() * 6.283;
    puffs.push({
      p: [...p],
      v: [Math.cos(a) * 0.5, up * (0.6 + 0.4 * rnd()), Math.sin(a) * 0.5],
      age: 0,
      life: 1 + 0.6 * rnd(),
    });
    puffs = puffs.slice(-MAX_PUFFS);
  };

  /** The vehicle blows up: a flash and a fireball, two more along its hull, a ring on the ground, debris. */
  const explode = (r: Rover, eye?: Vec3) => {
    const big = r.ship ? 1.4 : 1;
    const at: Vec3 = [r.x, r.y, r.z];
    const half = r.ship ? 4.2 : 1.2;
    tracer.blast(at, 2.2 * big);
    tracer.ring([r.x, r.y - (r.ship ? 1.2 : 1), r.z], 9 * big);
    fuses.push([0.12, along(r, half), 1.4 * big], [0.27, along(r, -half), 1.6 * big]);
    audio.play(SOUND.WRECK, at, 2.4, r.ship ? 0.85 : 1);
    audio.play(SOUND.BLAST, at, 1.6, 0.35);
    for (let i = 0; i < BITS; i++) {
      const [a, s] = [rnd() * 6.283, (3 + 9 * rnd()) * big];
      bits.push({
        p: [r.x + (rnd() - 0.5) * half, r.y + rnd() * 0.6, r.z + (rnd() - 0.5) * half],
        v: [r.vx * 0.5 + Math.cos(a) * s, 4 + 7 * rnd(), r.vz * 0.5 + Math.sin(a) * s],
        spin: 2 + 6 * rnd(),
        age: 0,
        life: 2.5 + 2 * rnd(),
        size: (0.08 + 0.2 * rnd()) * big,
        floor: r.y - (r.ship ? 1.3 : 1.1),
      });
    }
    bits = bits.slice(-MAX_BITS);
    const d = eye ? Math.hypot(r.x - eye[0], r.y - eye[1], r.z - eye[2]) : Infinity;
    fx.quake(Math.max(0, 1 - d / QUAKE) * 1.5);
  };

  return {
    frame(rovers, dt, eye) {
      const slot = Math.floor(clock * SLOTS);
      clock += dt;
      const tick = Math.floor(clock * SLOTS) !== slot;
      const g = gravity(world);
      for (const f of fuses) {
        f[0] -= dt;
        if (f[0] <= 0) {
          tracer.blast(f[1], f[2]);
          audio.play(SOUND.BLAST, f[1], 1.2, 0.45);
        }
      }
      fuses = fuses.filter(f => f[0] > 0);
      for (const b of bits) {
        b.age += dt;
        if (b.p[1] > b.floor || b.v[1] > 0) {
          b.v[1] -= g * dt;
          b.p = b.p.map((c, i) => c + b.v[i] * dt) as Vec3;
          if (b.p[1] <= b.floor) {
            [b.p[1], b.v] = [b.floor, [0, 0, 0]];
          }
        }
      }
      bits = bits.filter(b => b.age < b.life);
      for (const p of puffs) {
        // Smoke rises and slows; it does not fall.
        p.age += dt;
        p.v = p.v.map(c => c * Math.max(0, 1 - 0.8 * dt)) as Vec3;
        p.p = p.p.map((c, i) => c + p.v[i] * dt) as Vec3;
      }
      puffs = puffs.filter(p => p.age < p.life);

      const drawn = rovers.map((r, k) => {
        const old = was[k];
        const [w, ow] = [r.wreck ?? 0, old?.wreck ?? 0];
        const at: Vec3 = [r.x, r.y, r.z];
        if (old && w && !ow) {
          explode(r, eye);
        } else if (old && !w && ow) {
          fresh[k] = SHIMMER;
        } else if (old && !w && (r.hp ?? VEHICLE.HP) < (old.hp ?? VEHICLE.HP)) {
          // A hit on the hull: a clang and a few sparks off a place that arcs.
          audio.play(SOUND.HULL, at, 1, 0.9 + 0.2 * rnd());
          const from = spots(r, k).at(-1) ?? at;
          for (let i = 0; i < 4; i++) {
            tracer.spit(from);
          }
        }
        // The wire counts a wreck's time in fours: between two steps it runs on at the tick's rate.
        if (w) {
          const e = eased[k];
          eased[k] =
            e === undefined || Math.abs(e - w) > 8 ? w : clamp(e - dt * TICK_HZ, w - 3.99, w);
          if (e !== undefined && eased[k] < VEHICLE.FADE && e >= VEHICLE.FADE) {
            audio.play(SOUND.CRUMBLE, at, 1.3);
          }
        } else {
          delete eased[k];
        }
        fresh[k] = Math.max(0, (fresh[k] ?? 0) - dt * TICK_HZ);
        const shown: Rover = w
          ? { ...r, wreck: eased[k] }
          : fresh[k]
            ? { ...r, wreck: -fresh[k] }
            : r;

        // The arcs, in their slots; their crackle, now and then; a spark or two; smoke when it is bad.
        hush[k] = (hush[k] ?? 0) - dt;
        const live = tick ? sparking(shown, k, slot + 1) : [];
        for (const [a, b] of live) {
          tracer.arc(a, b, WIDE * (r.ship ? BIG : 1));
          if (rnd() < 0.3) {
            tracer.spit(a);
          }
        }
        if (live.length && hush[k] <= 0) {
          audio.play(SOUND.ARC, at, 0.3 + 0.06 * live.length, 0.8 + 0.5 * rnd());
          hush[k] = 0.15 + 0.3 * rnd();
        }
        const top: Vec3 = [r.x, r.y + (r.ship ? 0.6 : 0.3), r.z];
        if (w > VEHICLE.FADE) {
          if (rnd() < 12 * dt) {
            smoke(top, 2.4);
          }
        } else if (w > 0) {
          // Falling apart: sparks off it all along.
          for (let i = 0; i < 2; i++) {
            const far = (rnd() - 0.5) * (r.ship ? 12 : 3.4);
            tracer.spit(along(pose(r), far));
          }
        } else if ((r.hp ?? VEHICLE.HP) <= 3 && rnd() < 4 * dt) {
          smoke(spots(r, k)[0] ?? top, 2.2);
        }
        return shown;
      });
      was = rovers.map(r => ({ ...r }));
      return drawn;
    },
    draw(out) {
      for (const { p, spin, age, life, size } of bits) {
        // Still or turning, then shrinking away over its last half second.
        const s = size * Math.min(1, (life - age) / 0.5);
        const [c, sn] = [Math.cos(spin * age), Math.sin(spin * age)];
        const q = SHARD.map(([x, y, z]): Vec3 => [
          p[0] + (x * c - z * sn) * s,
          p[1] + y * s,
          p[2] + (x * sn + z * c) * s,
        ]);
        for (const [a, b, d] of [
          [0, 1, 3],
          [1, 2, 3],
          [2, 0, 3],
          [1, 0, 2],
        ]) {
          const [u, v] = [b, d].map(j => q[j].map((x, i) => x - q[a][i]));
          const n = [
            u[1] * v[2] - u[2] * v[1],
            u[2] * v[0] - u[0] * v[2],
            u[0] * v[1] - u[1] * v[0],
          ];
          const l = Math.hypot(...n) || 1;
          for (const j of [a, b, d]) {
            out.push(...q[j], n[0] / l, n[1] / l, n[2] / l, 0.05, 0.05, -1, 0.06);
          }
        }
      }
      for (const { p, age, life } of puffs) {
        const k = age / life;
        const s = 0.22 + 0.7 * k;
        for (let i = 0; i < BALL.length; i += STRIDE) {
          out.push(
            p[0] + BALL[i] * s,
            p[1] + BALL[i + 1] * s,
            p[2] + BALL[i + 2] * s,
            BALL[i + 3],
            BALL[i + 4],
            BALL[i + 5],
            BALL[i + 6],
            (1 - k * k) * 0.8,
            -3,
            BALL[i + 9],
          );
        }
      }
    },
    get count() {
      return bits.length + puffs.length;
    },
  };
};
