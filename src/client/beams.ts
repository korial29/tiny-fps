// The laser shots on screen: each a bright cyan-violet ribbon from the muzzle to where the shot
// ended, thinning to nothing in LIFE seconds, with a flash of light at the muzzle and, when a wall
// stopped it, a few sparks and a glow where it hit. Ribbons turn to face the camera. No DOM, no GL.
import { LIGHT } from './lights';
import type { Light } from './lights';
import type { Vec3 } from './mesh';

/** Seconds a beam lasts, and a flash of light and a spark. */
export const LIFE = 0.08;
const FLASH = 0.06;
const SPARK = 0.22;
/** Sparks to an impact. */
const SPARKS = 7;
/** Beams kept at most: the oldest goes. */
const MAX = 16;
/** Seconds a bolt lasts, bolts kept at most, and the sparks of a shock. */
const BOLT = 0.05;
const BOLTS = 24;
const SHOCK_SPARKS = 10;

/** One shot: from `a` to `b`, `age` seconds old; `hit` when a wall stopped it. */
interface Beam {
  a: Vec3;
  b: Vec3;
  age: number;
  hit: boolean;
  /** The own player's: its start follows the muzzle. */
  own: boolean;
}
interface Spark {
  p: Vec3;
  v: Vec3;
  age: number;
}
/** A jagged bolt: two segments, a to m to b. */
interface Bolt {
  a: Vec3;
  m: Vec3;
  b: Vec3;
  age: number;
}

export interface Tracer {
  /** A shot from `a` to `b`; `hit` when it ended on a wall, which sparks; `own` for the player's, which stays on its muzzle. */
  shoot(a: Vec3, b: Vec3, hit: boolean, own?: boolean): void;
  /** The katana's shock at `at`: a burst of sparks and bolts. */
  shock(at: Vec3): void;
  /** One frame of the crackle around a shocked runner whose middle is `at`: a few bolts, flickering. */
  crackle(at: Vec3): void;
  /** Where the own muzzle is now: the own beams start there, so that a kick of the view does not swing them. */
  mount(a: Vec3): void;
  /** Ages everything by dt seconds and drops what is over. */
  update(dt: number): void;
  /** Appends the ribbons and the sparks, turned to the camera at `eye`. */
  draw(out: number[], eye: Vec3): void;
  /** The lights of the flashes at the muzzles and the impacts, for gather(). */
  lights(): Light[];
  /** The beams alive now. */
  readonly count: number;
}

/** [halo, core] widths in metres and colours: unlit and above 1, so that the bloom picks them up. */
const RIBBONS: [number, number[], number][] = [
  [0.022, [0.4, 0.15, 1.3], 0],
  [0.007, [0.7, 1.7, 2.2], 0.02],
];

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const vert = (out: number[], p: Vec3, [r, g, b]: number[]) => out.push(...p, 0, 1, 0, r, g, -2, b);

/** A flat ribbon of half width w along a to b, its width turned across the view from eye. */
const ribbon = (
  out: number[],
  a: Vec3,
  b: Vec3,
  w: number,
  rgb: number[],
  eye: Vec3,
  lift: number,
) => {
  const d = sub(b, a);
  let s = cross(d, sub(a, eye));
  if (Math.hypot(...s) < 1e-6 * Math.hypot(...d)) {
    s = cross(d, [0, 1, 0]);
  }
  s = norm(s);
  const [p, q, r, t] = [
    [a, 1],
    [a, -1],
    [b, -1],
    [b, 1],
  ].map(([c, k]) => {
    // Toward the eye by `lift`, so that the core is not lost in the halo.
    const to = norm(sub(eye, c as Vec3));
    // Beyond 5 m the ribbon grows with the distance, so that it stays a line of pixels, not a hair.
    const wide = w * Math.min(Math.max(Math.hypot(...sub(eye, c as Vec3)) / 5, 1), 2.5);
    return (c as Vec3).map((v, i) => v + s[i] * wide * (k as number) + to[i] * lift) as Vec3;
  });
  for (const v of [p, q, r, p, r, t]) {
    vert(out, v, rgb);
  }
};

export const createTracer = (): Tracer => {
  let beams: Beam[] = [];
  let sparks: Spark[] = [];
  let bolts: Bolt[] = [];
  let seed = 7;
  /** A number in [-1, 1) from a small generator: the same run draws the same sparks. */
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;

  /** A bolt of about `len` metres from `p`, any way. */
  const bolt = (p: Vec3, len: number) => {
    const d = [rnd(), rnd(), rnd()].map(v => v * len) as Vec3;
    const b = [0, 1, 2].map(i => p[i] + d[i]) as Vec3;
    const m = [0, 1, 2].map(i => p[i] + d[i] / 2 + rnd() * len * 0.3) as Vec3;
    bolts = [...bolts, { a: p, m, b, age: 0 }].slice(-BOLTS);
  };

  return {
    shock(at) {
      for (let i = 0; i < SHOCK_SPARKS; i++) {
        sparks.push({ p: at, v: [rnd() * 4, rnd() * 3 + 1, rnd() * 4], age: 0 });
        if (i % 2 == 0) {
          bolt(at, 0.6);
        }
      }
      sparks = sparks.slice(-MAX * SPARKS);
    },
    crackle(at) {
      for (let i = 0; i < 2; i++) {
        if (rnd() > 0) {
          bolt([at[0] + rnd() * 0.4, at[1] + rnd() * 0.7, at[2] + rnd() * 0.4], 0.35);
        }
      }
    },
    mount(a) {
      beams.forEach(b => b.own && (b.a = a));
    },
    shoot(a, b, hit, own = false) {
      beams.push({ a, b, age: 0, hit, own });
      beams = beams.slice(-MAX);
      if (hit) {
        const d = norm(sub(a, b));
        for (let i = 0; i < SPARKS; i++) {
          sparks.push({
            p: b,
            v: [0, 1, 2].map(k => d[k] * 3 + rnd() * 3 + (k == 1 ? 2 : 0)) as Vec3,
            age: 0,
          });
        }
        sparks = sparks.slice(-MAX * SPARKS);
      }
    },
    update(dt) {
      for (const x of [...beams, ...sparks, ...bolts]) {
        x.age += dt;
      }
      beams = beams.filter(b => b.age < LIFE);
      sparks = sparks.filter(s => s.age < SPARK);
      bolts = bolts.filter(b => b.age < BOLT);
      for (const s of sparks) {
        s.v[1] -= 9 * dt;
        s.p = s.p.map((v, i) => v + s.v[i] * dt) as Vec3;
      }
    },
    draw(out, eye) {
      for (const { a, b, age } of beams) {
        // Thinner and a little dimmer as it goes: nothing is blended, so it can only shrink.
        const k = 1 - age / LIFE;
        RIBBONS.forEach(([w, rgb, lift]) =>
          ribbon(
            out,
            a,
            b,
            w * k ** 0.7,
            rgb.map(c => c * (0.6 + 0.4 * k)),
            eye,
            lift,
          ),
        );
      }
      for (const { a, m, b, age } of bolts) {
        const k = 1 - age / BOLT;
        for (const [p, q] of [
          [a, m],
          [m, b],
        ]) {
          RIBBONS.forEach(([w, rgb, lift]) => ribbon(out, p, q, w * 0.5 * k, rgb, eye, lift));
        }
      }
      for (const { p, age } of sparks) {
        const k = 1 - age / SPARK;
        const s = norm(cross(sub(p, eye), [0, 1, 0]));
        const u = norm(cross(s, sub(p, eye)));
        const [x, y] = [0.022 * k, 0.022 * k];
        const c = (a: number, b: number): Vec3 => [
          p[0] + s[0] * a + u[0] * b,
          p[1] + s[1] * a + u[1] * b,
          p[2] + s[2] * a + u[2] * b,
        ];
        for (const v of [c(-x, 0), c(0, y), c(x, 0), c(-x, 0), c(x, 0), c(0, -y)]) {
          vert(out, v, [1.4 * k + 0.4, 2.2 * k + 0.3, 3]);
        }
      }
    },
    lights() {
      const point = (p: Vec3, range: number, k: number, rgb: Vec3): Light => ({
        kind: LIGHT.POINT,
        p,
        d: [0, -1, 0],
        cone: 0,
        range,
        color: rgb.map(c => c * k) as Vec3,
        shadow: false,
      });
      const arcs = bolts
        .slice(-2)
        .map(b => point(b.m, 3, 0.8 * (1 - b.age / BOLT), [0.3, 0.7, 1.3]));
      const flashes = beams
        .filter(b => b.age < FLASH)
        .slice(-3)
        .flatMap(b => {
          const k = 1 - b.age / FLASH;
          return [
            point(b.a, 6, 1.3 * k, [0.35, 0.8, 1.5]),
            ...(b.hit ? [point(b.b, 3.5, 0.9 * k, [0.3, 0.7, 1.3])] : []),
          ];
        });
      return [...arcs, ...flashes];
    },
    get count() {
      return beams.length;
    },
  };
};
