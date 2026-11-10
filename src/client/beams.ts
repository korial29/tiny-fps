// What the weapons light up: the plasma balls, each a blue-white core in a soft halo with a short
// trail, a blue flash at the muzzle of a shot, a splash of light and sparks where a ball bursts,
// the bolts and sparks of the katana's shock, the katana's arcs of energy, and the rail gun's lightning, a new shape each frame. Everything turns to face the camera and is
// unlit and above 1, so that the bloom makes it glow. No DOM, no GL.
import { BOLT as ROVER_BOLT } from '../shared/constants';
import { CUT } from '../shared/types';
import { LIGHT } from './lights';
import type { Light } from './lights';
import type { Vec3 } from './mesh';

/** A ball as drawn this frame: its centre, its unit direction, and the metres of trail behind it. */
export interface Orb {
  p: Vec3;
  d: Vec3;
  tail: number;
  /** Its strength, 1 to CHARGE_MAX: a charged ball is bigger. Absent reads 1. */
  power?: number;
  /** An arc of energy, not a ball: the CUT that threw it (Ball.arc). */
  arc?: number;
}

/** Seconds a muzzle flash, a splash and a spark last. */
export const FLASH = 0.06;
export const SPLASH = 0.16;
const SPARK = 0.22;
/** Sparks to a burst, and kept at most. */
const SPARKS = 12;
const MAX = 16;
/** Seconds a bolt lasts, bolts kept at most, and the sparks of a shock. */
const BOLT = 0.05;
const BOLTS = 24;
const SHOCK_SPARKS = 10;
/** The rail gun's lightning: [halo, core] half widths and colours, and its metres per kink. */
const ZAP: [number, number[]][] = [
  [0.035, [0.45, 0.3, 1.5]],
  [0.009, [1.6, 1.3, 3]],
];
const KINK = 0.6;
/** Balls that light what they pass, the nearest first. */
const LIT = 4;

interface Spark {
  p: Vec3;
  v: Vec3;
  age: number;
  /** A laser rifle's: red. */
  red?: boolean;
}
/** A flash at a muzzle or a splash at a burst: where, how old, and which. */
interface Glow {
  p: Vec3;
  age: number;
  /** The own muzzle's: it follows the muzzle. */
  own?: boolean;
  splash?: boolean;
  /** How charged the shot was, 0 to 1: orange and bigger as it goes up. */
  hot?: number;
}
/** A jagged bolt: two segments, a to m to b. */
interface Bolt {
  a: Vec3;
  m: Vec3;
  b: Vec3;
  age: number;
}

export interface Tracer {
  /** A shot's flash at the muzzle `a`; `own` for the player's, which stays on its muzzle; `hot` how charged it was, 0 to 1. */
  flash(a: Vec3, own?: boolean, hot?: number): void;
  /** The muzzles charging this frame and how far, 0 to 1: an orange light swelling at each. */
  charging(list: { p: Vec3; k: number }[]): void;
  /** The rail guns' bolts this frame, each from its muzzle `a` to where it ends `b`: jagged, with a branch, sparks at the end. */
  lightning(list: { a: Vec3; b: Vec3 }[]): void;
  /** A ball burst at `at`: a splash of light and a spray of sparks; a laser rifle's, `red`, bigger and fiercer. */
  burst(at: Vec3, red?: boolean): void;
  /** The balls to draw this frame. */
  orbs(list: Orb[]): void;
  /** The katana's shock at `at`: a burst of sparks and bolts. */
  shock(at: Vec3): void;
  /** One frame of the crackle around a shocked runner whose middle is `at`: a few bolts, flickering. */
  crackle(at: Vec3): void;
  /** One spark out of `at`, up and a little aside: a cut limb's stump spitting. */
  spit(at: Vec3): void;
  /** Where the own muzzle is now: its flash stays there, so that a kick of the view does not leave it behind. */
  mount(a: Vec3): void;
  /** Ages everything by dt seconds and drops what is over. */
  update(dt: number): void;
  /** Appends the balls, the flashes, the bolts and the sparks, turned to the camera at `eye`. */
  draw(out: number[], eye: Vec3): void;
  /** The lights of the flashes, the splashes, the bolts and the nearest balls, for gather(). */
  lights(): Light[];
}

/** The katana's bolts: [halo, core] widths in metres and colours, and the lift of the core. */
const RIBBONS: [number, number[], number][] = [
  [0.022, [0.4, 0.15, 1.3], 0],
  [0.007, [0.7, 1.7, 2.2], 0.02],
];
/** A ball's halo and core: radius, colour, lift toward the eye; its trail is as wide as each at the head. */
const BALL: [number, number[], number][] = [
  [0.22, [0.2, 0.45, 1.6], 0],
  [0.08, [2, 2.6, 3.6], 0.04],
];
/** The same in red, for the laser rifle's balls (power 0) and their flash (hot below 0). */
const RED = [
  [1.6, 0.12, 0.08],
  [2.8, 0.9, 0.6],
];
/** The same in green, for a rover's laser bolts (power BOLT). */
const GREEN = [
  [0.1, 1.5, 0.22],
  [0.9, 3.2, 1.2],
];
/** The same in orange, for a charged ball, a charged flash and a charging muzzle. */
const HOT = [
  [1.1, 0.26, 0.04],
  [1.5, 0.42, 0.06],
];
/** Ball's colour `k` of the way (0 to 1) from cyan to orange. */
const tint = (rgb: number[], i: number, k: number) => rgb.map((c, j) => c + (HOT[i][j] - c) * k);

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
/**
 * What glows is drawn at its size times this: beyond 5 m it grows with the distance (at most 2.5
 * times), so that it stays a few pixels; nearer it may shrink down to `lo`, so that a ball or a
 * flash at the own muzzle does not fill the view.
 */
const far = (eye: Vec3, c: Vec3, lo: number) =>
  Math.min(Math.max(Math.hypot(...sub(eye, c)) / 5, lo), 2.5);

/**
 * A flat ribbon along a to b, of half width w at a and wb at b, its width turned across the view
 * from eye and lifted toward it by `lift`.
 */
const ribbon = (
  out: number[],
  a: Vec3,
  b: Vec3,
  w: number,
  rgb: number[],
  eye: Vec3,
  lift: number,
  wb = w,
  lo = 1,
) => {
  const d = sub(b, a);
  let s = cross(d, sub(a, eye));
  if (Math.hypot(...s) < 1e-6 * Math.hypot(...d)) {
    s = cross(d, [0, 1, 0]);
  }
  s = norm(s);
  const [p, q, r, t] = [
    [a, w],
    [a, -w],
    [b, -wb],
    [b, wb],
  ].map(([c, k]) => {
    const to = norm(sub(eye, c as Vec3));
    const wide = (k as number) * far(eye, c as Vec3, lo);
    return (c as Vec3).map((v, i) => v + s[i] * wide + to[i] * lift) as Vec3;
  });
  for (const v of [p, q, r, p, r, t]) {
    vert(out, v, rgb);
  }
};

/** A disc of radius r round c facing the eye, lifted toward it, as a fan of n triangles. */
const disc = (
  out: number[],
  c: Vec3,
  r: number,
  rgb: number[],
  eye: Vec3,
  lift = 0,
  n = 8,
  lo = 0.1,
) => {
  const to = sub(c, eye);
  const s = norm(cross(to, [0, 1, 0]));
  const u = norm(cross(s, to));
  const k = r * far(eye, c, lo);
  const l = norm(to).map((v, i) => c[i] - v * lift) as Vec3;
  const rim = (i: number): Vec3 => {
    const [x, y] = [Math.cos((i * 2 * Math.PI) / n) * k, Math.sin((i * 2 * Math.PI) / n) * k];
    return [0, 1, 2].map(j => l[j] + s[j] * x + u[j] * y) as Vec3;
  };
  for (let i = 0; i < n; i++) {
    for (const v of [l, rim(i), rim(i + 1)]) {
      vert(out, v, rgb);
    }
  }
};

/** The arc of energy's crescent: its half span (m), the radians it bends round, its tilt off level, and its glow and core. */
const [CRESCENT, BOW, TILT] = [0.8, 1.2, 0.6];
const WAVE: [number, number[]][] = [
  [0.1, [0.15, 0.7, 1.6]],
  [0.035, [1.4, 2.6, 3]],
];

/**
 * An arc of energy at `c` flying along `d`, thrown by the cut `cut`: a crescent across its flight,
 * tilted the way the blade came down (from the top left for ARC_L), bowed out the way the blade
 * went and its tips bent back, thick in the middle, with a fainter one trailing.
 */
const crescent = (out: number[], c: Vec3, d: Vec3, cut: number, eye: Vec3) => {
  const r = norm(cross(d, [0, 1, 0]));
  const u = cross(r, d);
  const t = cut == CUT.ARC_L ? -TILT : TILT;
  const ax = r.map((v, i) => v * Math.cos(t) + u[i] * Math.sin(t)) as Vec3;
  // Across the flight and square to the span, toward the bottom of the swing.
  const bow = cross(ax, d).map(v => (cut == CUT.ARC_L ? v : -v)) as Vec3;
  const N = 6;
  for (const [back, k] of [
    [0, 1],
    [0.35, 0.55],
  ]) {
    const at = (j: number): Vec3 => {
      const a = (j / N) * BOW;
      return c.map(
        (v, i) =>
          v +
          (ax[i] * Math.sin(a) - bow[i] * (1 - Math.cos(a)) * 0.6) * CRESCENT * k -
          d[i] * ((1 - Math.cos(a)) * CRESCENT * 0.5 + back),
      ) as Vec3;
    };
    for (let j = -N; j < N; j++) {
      const w = (n: number) => 1 - (Math.abs(n) / N) ** 2 * 0.85;
      WAVE.forEach(([h, rgb], i) =>
        ribbon(
          out,
          at(j),
          at(j + 1),
          h * k * w(j),
          rgb.map(v => v * k),
          eye,
          0.02 * i,
          h * k * w(j + 1),
        ),
      );
    }
  }
};

export const createTracer = (): Tracer => {
  let glows: Glow[] = [];
  let sparks: Spark[] = [];
  let bolts: Bolt[] = [];
  let balls: Orb[] = [];
  let zaps: { a: Vec3; b: Vec3 }[] = [];
  let hot: { p: Vec3; k: number }[] = [];
  /** The eye of the last frame drawn: the balls nearest to it light the scene. */
  let seen: Vec3 = [0, 0, 0];
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
  /** n sparks from `at`, at `speed` m/s each way and a little up. */
  const spray = (at: Vec3, n: number, speed: number, red?: boolean) => {
    for (let i = 0; i < n; i++) {
      sparks.push({ p: at, v: [rnd() * speed, rnd() * speed + 1.5, rnd() * speed], age: 0, red });
    }
    sparks = sparks.slice(-MAX * SPARKS);
  };

  return {
    flash(a, own, k = 0) {
      glows = [...glows, { p: a, age: 0, own, hot: k }].slice(-MAX);
    },
    charging(list) {
      hot = list;
    },
    lightning(list) {
      zaps = list;
      list.forEach(({ b }) => rnd() > 0.4 && spray(b, 2, 3));
    },
    burst(at, red) {
      glows = [...glows, { p: at, age: 0, splash: true, hot: red ? -0.6 : 0 }].slice(-MAX);
      spray(at, red ? 2 * SPARKS : SPARKS, red ? 7 : 4, red);
    },
    orbs(list) {
      balls = list;
    },
    shock(at) {
      spray(at, SHOCK_SPARKS, 4);
      for (let i = 0; i < SHOCK_SPARKS; i += 2) {
        bolt(at, 0.6);
      }
    },
    crackle(at) {
      for (let i = 0; i < 2; i++) {
        if (rnd() > 0) {
          bolt([at[0] + rnd() * 0.4, at[1] + rnd() * 0.7, at[2] + rnd() * 0.4], 0.35);
        }
      }
    },
    spit(at) {
      sparks.push({ p: at, v: [rnd(), rnd() + 2, rnd()], age: 0 });
    },
    mount(a) {
      glows.forEach(g => g.own && (g.p = a));
    },
    update(dt) {
      for (const x of [...glows, ...sparks, ...bolts]) {
        x.age += dt;
      }
      glows = glows.filter(g => g.age < (g.splash ? SPLASH : FLASH));
      sparks = sparks.filter(s => s.age < SPARK);
      bolts = bolts.filter(b => b.age < BOLT);
      for (const s of sparks) {
        s.v[1] -= 9 * dt;
        s.p = s.p.map((v, i) => v + s.v[i] * dt) as Vec3;
      }
    },
    draw(out, eye) {
      seen = eye;
      for (const { p, d, tail, power = 1, arc } of balls) {
        if (arc) {
          crescent(out, p, d, arc, eye);
          continue;
        }
        // A rover's bolt is a streak: four times the trail.
        const end = p.map((v, i) => v - d[i] * tail * (power === ROVER_BOLT ? 4 : 1)) as Vec3;
        // A charged ball swells, up to twice the size at the full charge, and turns orange; the
        // laser rifle's (power 0) is red and smaller.
        const bolt = power === ROVER_BOLT;
        const big = bolt ? 0.8 : power ? 1 + 0.25 * (power - 1) : 0.7;
        BALL.forEach(([r, c, lift], i) => {
          const rgb = bolt ? GREEN[i] : power ? tint(c, i, Math.min(1, (power - 1) / 2)) : RED[i];
          disc(out, p, r * big, rgb, eye, lift);
          if (tail > 0.01) {
            ribbon(out, p, end, r * 0.5 * big, rgb, eye, lift, 0, 0.1);
          }
        });
      }
      // A charging muzzle: an orange light swelling to 6 cm and flickering, its own size even
      // at the own muzzle, a hand's length from the eye.
      for (const { p, k } of hot) {
        const f = 0.8 + 0.2 * rnd();
        HOT.forEach((rgb, i) =>
          disc(
            out,
            p,
            (i ? 0.012 + 0.018 * k : 0.02 + 0.04 * k) * f,
            rgb.map(c => c * (0.5 + 0.5 * k)),
            eye,
            0.01 * i,
            8,
            1,
          ),
        );
      }
      for (const { p, age, splash, hot: h = 0 } of glows) {
        // A flash shrinks; a splash swells as it fades. A charged one is orange and bigger, a
        // laser rifle's red and bigger.
        const k = 1 - age / (splash ? SPLASH : FLASH);
        BALL.forEach(([r, rgb, lift], i) =>
          disc(
            out,
            p,
            (splash ? r * (3 - 2 * k) : r * 0.7 * k) * (1 + Math.abs(h)),
            (h < 0 ? RED[i] : tint(rgb, i, h)).map(c => c * (0.4 + 0.6 * k)),
            eye,
            lift,
          ),
        );
      }
      for (const { a, b } of zaps) {
        // Kinks every KINK metres or so, thrown across by a tenth of that, the ends held; a branch
        // leaves a kink and forks off for three more.
        const d = sub(b, a);
        const l = Math.hypot(...d);
        const n = Math.min(Math.max(Math.ceil(l / KINK), 4), 40);
        const off = (p: Vec3, k: number): Vec3 =>
          p.map(v => v + rnd() * k * Math.min(l, 4) * 0.04) as Vec3;
        const line = [a];
        for (let i = 1; i < n; i++) {
          line.push(off(a.map((v, j) => v + (d[j] * i) / n) as Vec3, 1));
        }
        line.push(b);
        const from = Math.floor((0.3 + 0.4 * Math.abs(rnd())) * n);
        const fork = [line[from]];
        for (let i = 1; i <= 3; i++) {
          fork.push(off(fork[i - 1].map((v, j) => v + (d[j] * 0.8) / n) as Vec3, 1.5));
        }
        for (const [path, k] of [
          [line, 1],
          [fork, 0.5],
        ] as [Vec3[], number][]) {
          for (let i = 1; i < path.length; i++) {
            // Thinner near the eye, so that the own bolt does not fill the view.
            ZAP.forEach(([w, rgb], z) =>
              ribbon(out, path[i - 1], path[i], w * k, rgb, eye, 0.01 * z, w * k, 0.35),
            );
          }
        }
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
      for (const { p, age, red } of sparks) {
        const k = 1 - age / SPARK;
        disc(out, p, 0.022 * k, red ? RED[1] : [1.4 * k + 0.4, 2.2 * k + 0.3, 3], eye, 0, 4);
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
      const dist = (o: Orb) => Math.hypot(...sub(o.p, seen));
      return [
        ...bolts.slice(-2).map(b => point(b.m, 3, 0.8 * (1 - b.age / BOLT), [0.3, 0.7, 1.3])),
        ...zaps.slice(0, 2).map(z => point(z.b, 6, 1.6, [0.7, 0.5, 1.8])),
        ...glows
          .slice(-4)
          .map(g =>
            g.splash
              ? point(
                  g.p,
                  7,
                  2 * (1 - g.age / SPLASH),
                  (g.hot! < 0 ? RED[0] : [0.35, 0.7, 1.6]) as Vec3,
                )
              : point(g.p, 6, 1.3 * (1 - g.age / FLASH), [0.25, 0.55, 1.6]),
          ),
        ...[...balls]
          .sort((a, b) => dist(a) - dist(b))
          .slice(0, LIT)
          .map(o =>
            (o.power ?? 1) > 1
              ? point(o.p, 6, 1.5, [1.4, 0.55, 0.15])
              : point(o.p, 4, 1, o.power === 0 ? [1.4, 0.15, 0.1] : [0.25, 0.5, 1.4]),
          ),
        ...hot.slice(0, 2).map(({ p, k }) => point(p, 2 + 3 * k, 0.4 + 1.2 * k, [1.4, 0.55, 0.15])),
      ];
    },
  };
};
