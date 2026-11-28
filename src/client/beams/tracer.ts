// What the weapons light up: the plasma balls, each a blue-white core in a soft halo with a short
// trail, a blue flash at the muzzle of a shot, a splash of light and sparks where a ball bursts,
// the bolts and sparks of the katana's shock, the katana's arcs of energy, and the rail gun's lightning, a new shape each frame. Everything turns to face the camera and is
// unlit and above 1, so that the bloom makes it glow, but the blood of a glory kill, dark. No DOM, no GL.
import {
  DISK,
  DISK_RETURN,
  HARPOON,
  NADE,
  NADE_R,
  PLASMA_SPEED,
  BOLT as ROVER_BOLT,
} from '../../shared/constants';
import { MELT, MELTS, drawMelt, melt } from '../melt';
import type { Melt } from '../melt';
import { LIGHT } from '../lights';
import type { Light } from '../lights';
import type { Vec3 } from '../mesh';
import {
  FLASH,
  SPLASH,
  SPARK,
  BOOM,
  TESLA,
  EMBER,
  IMPACT,
  IMPACT_FLASH,
  DUST_PUFFS,
  DUST,
  STEEL_SPARKS,
  GORE,
  BLOOD,
  EMBERS,
  FIRE,
  PUFFS,
  BLAZE,
  SPARKS,
  MAX,
  SPLASH_WIDE,
  BURST_SPARKS,
  BURST_SPEED,
  BOLT,
  BOLTS,
  SHOCK_SPARKS,
  ZAP,
  KINK,
  LIT,
  CANNON_TRAIL,
  DISC_TRAIL,
  DISC_GLOW,
  DISC_SPIN,
  LASER,
  RIBBONS,
  BALL,
  RED,
  GREEN,
  HOT,
  tint,
  RAY,
  RAYS,
  SKY,
  SPREAD,
  BORE,
} from './constants';
import type { Orb, Spark, Glow, Bolt, Tracer } from './types';
import { sub, norm, vert, spun, far, ribbon, disc, crescent } from './geometry';

export const createTracer = (): Tracer => {
  let glows: Glow[] = [];
  let sparks: Spark[] = [];
  let bolts: Bolt[] = [];
  let balls: Orb[] = [];
  let zaps: { a: Vec3; b: Vec3 }[] = [];
  let hot: { p: Vec3; k: number }[] = [];
  let rays: { p: Vec3; age: number; from?: Vec3 }[] = [];
  let lasers: { a: Vec3; b: Vec3; age: number }[] = [];
  /** The marks of molten metal that bursts leave on the faces they hit. */
  let melts: Melt[] = [];
  /** Seconds since the tracer was made: the discs' spin. */
  let clock = 0;
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
  const spray = (at: Vec3, n: number, speed: number, red?: boolean, steel?: boolean) => {
    for (let i = 0; i < n; i++) {
      sparks.push({
        p: at,
        v: [rnd() * speed, rnd() * speed + 1.5, rnd() * speed],
        age: 0,
        red,
        steel,
      });
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
    burst(at, red, big, face) {
      glows = [...glows, { p: at, age: 0, splash: true, fine: !big, hot: red ? -0.6 : 0 }].slice(
        -MAX,
      );
      if (big) {
        spray(at, 2 * SPARKS, 7, red);
        return;
      }
      spray(at, BURST_SPARKS[+!!red], BURST_SPEED[+!!red], red);
      if (face) {
        melts = [...melts, melt(face.p, face.n, rnd)].slice(-MELTS);
      }
    },
    impact(at) {
      const puffs = Array.from({ length: DUST_PUFFS }, (): Vec3 => [
        rnd() * 0.07,
        rnd() * 0.05 + 0.03,
        rnd() * 0.07,
      ]);
      glows = [...glows, { p: at, age: 0, impact: true, puffs }].slice(-MAX);
      spray(at, STEEL_SPARKS, 7, false, true);
    },
    blast(at, size = 1) {
      const puffs = Array.from({ length: PUFFS }, (): Vec3 => [
        rnd() * 0.7,
        rnd() * 0.5 + 0.2,
        rnd() * 0.7,
      ]);
      glows = [...glows, { p: at, age: 0, boom: true, puffs, size }].slice(-MAX);
      for (let i = 0; i < EMBERS; i++) {
        sparks.push({
          p: at,
          v: [rnd() * 9 * size, (rnd() * 7 + 5) * size, rnd() * 9 * size],
          age: 0,
          hot: true,
        });
      }
      sparks = sparks.slice(-MAX * SPARKS);
    },
    ring(at, r) {
      glows = [...glows, { p: at, age: 0, boom: true, ring: true, size: r }].slice(-MAX);
    },
    tesla(at, r) {
      glows = [...glows, { p: at, age: 0, tesla: true, size: r }].slice(-MAX);
    },
    arc(a, b, wide = 3) {
      const l = Math.hypot(...sub(b, a));
      const m = a.map((v, i) => (v + b[i]) / 2 + rnd() * l * 0.3) as Vec3;
      // The fork: from the kink, half as long, its own way.
      const f = m.map(v => v + rnd() * l * 0.4) as Vec3;
      const n = m.map((v, i) => (v + f[i]) / 2 + rnd() * l * 0.12) as Vec3;
      bolts = [...bolts, { a, m, b, age: 0, wide }, { a: m, m: n, b: f, age: 0, wide }].slice(
        -BOLTS,
      );
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
    gore(at, n, speed = 2) {
      for (let i = 0; i < n; i++) {
        const v: Vec3 = [rnd() * speed, rnd() * speed + speed * 0.8, rnd() * speed];
        sparks.push({ p: at, v, age: 0, blood: true });
      }
      sparks = sparks.slice(-MAX * SPARKS);
    },
    laser(a, b) {
      lasers.push({ a, b, age: 0 });
    },
    strike(at, from) {
      rays.push({ p: at, age: 0, from });
    },
    mount(a) {
      glows.forEach(g => g.own && (g.p = a));
    },
    update(dt) {
      clock += dt;
      for (const x of [...glows, ...sparks, ...bolts, ...rays, ...lasers, ...melts]) {
        x.age += dt;
      }
      // A cannon's ball that has got to its end bursts there.
      for (const l of lasers) {
        if (l.age * PLASMA_SPEED >= Math.hypot(...sub(l.b, l.a))) {
          glows = [...glows, { p: l.b, age: 0, splash: true, hot: -0.6 }].slice(-MAX);
          spray(l.b, 2 * SPARKS, 7, true);
        }
      }
      lasers = lasers.filter(l => l.age * PLASMA_SPEED < Math.hypot(...sub(l.b, l.a)));
      rays = rays.filter(r => r.age < RAY);
      melts = melts.filter(m => m.age < MELT);
      glows = glows.filter(
        g =>
          g.age < (g.impact ? IMPACT : g.tesla ? TESLA : g.boom ? BOOM : g.splash ? SPLASH : FLASH),
      );
      sparks = sparks.filter(s => s.age < (s.hot ? EMBER : s.blood ? GORE : SPARK));
      bolts = bolts.filter(b => b.age < BOLT);
      for (const s of sparks) {
        s.v[1] -= 9 * dt;
        s.p = s.p.map((v, i) => v + s.v[i] * dt) as Vec3;
      }
    },
    solids(out) {
      for (const { p, d, power } of balls) {
        if (power === DISK || power === DISK_RETURN) {
          spun(out, p, d, clock * DISC_SPIN);
        }
      }
    },
    draw(out, eye) {
      seen = eye;
      for (const { a, b, age } of lasers) {
        const d = norm(sub(b, a));
        const len = Math.hypot(...sub(b, a));
        const flown = Math.min(age * PLASMA_SPEED, len);
        const p = a.map((v, i) => v + d[i] * flown) as Vec3;
        const end = a.map((v, i) => v + d[i] * Math.max(flown - CANNON_TRAIL, 0)) as Vec3;
        BALL.forEach(([r, , lift], i) => {
          disc(out, p, r, RED[i], eye, lift);
          ribbon(out, p, end, r * 0.5, RED[i], eye, lift, 0, 0.1);
        });
      }
      for (const { p, age, from } of rays) {
        // Snapped on, flickering, thinning out.
        const k =
          Math.min(1, age / 0.06) * Math.sqrt(1 - age / RAY) * (0.8 + 0.2 * Math.sin(age * 90));
        for (let j = 0; j < RAYS; j++) {
          const a = (j * 2 * Math.PI) / RAYS + p[0] + p[2];
          const [c, r] = from ? [from, BORE] : [[p[0], p[1] + SKY, p[2]], SPREAD];
          const top: Vec3 = [c[0] + Math.cos(a) * r, c[1], c[2] + Math.sin(a) * r];
          LASER.forEach(([w, rgb], i) =>
            ribbon(
              out,
              top,
              p,
              w * k,
              rgb.map(c => c * k),
              eye,
              0.02 * i,
            ),
          );
        }
        LASER.forEach(([w, rgb], i) =>
          disc(
            out,
            [p[0], p[1] + 0.9, p[2]],
            w * 2.5 * k,
            rgb.map(c => c * k),
            eye,
            0.03 * i,
            16,
          ),
        );
      }
      for (const { p, d, tail, power = 1, arc } of balls) {
        if (arc) {
          crescent(out, p, d, arc, eye);
          continue;
        }
        if (power === NADE) {
          // A grenade: a small hot core in an orange glow, a thin trail of it behind.
          HOT.forEach((rgb, i) => {
            disc(out, p, i ? 0.035 : 0.09, rgb, eye, 0.02 * i);
            ribbon(
              out,
              p,
              sub(p, d.map(c => c * tail) as Vec3),
              i ? 0.012 : 0.03,
              rgb,
              eye,
              0.02 * i,
              0,
              0.1,
            );
          });
          continue;
        }
        if (power === HARPOON) {
          // A narrow bronze shaft with a bright point, rather than a round plasma bolt.
          const back = p.map((v, i) => v - d[i] * Math.max(tail, 0.28)) as Vec3;
          ribbon(out, p, back, 0.018, [0.62, 0.38, 0.18], eye, 0.015, 0.004, 0.1);
          disc(out, p, 0.025, [2.4, 1.55, 0.7], eye, 0.025, 8);
          continue;
        }
        if (power === DISK || power === DISK_RETURN) {
          // The armour's disc (the user, 2026-11-23), spinning nearly flat and banked into its
          // flight, a blue trail behind it.
          const back = p.map((v, i) => v - d[i] * Math.max(tail * DISC_TRAIL, 0.3)) as Vec3;
          DISC_GLOW.forEach(([w, rgb], i) => ribbon(out, p, back, w, rgb, eye, 0.02 * i, 0, 0.1));
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
      for (const { p, age, size = 1 } of glows.filter(g => g.ring)) {
        // The shock wave: a band a tenth of its radius wide, out fast then slower, dimming.
        const k = age / BOOM;
        const [r, c] = [size * Math.sqrt(k), BLAZE[1].map(v => v * (1 - k))];
        const at = (i: number, q: number): Vec3 => [
          p[0] + Math.cos((i * Math.PI) / 12) * q,
          p[1],
          p[2] + Math.sin((i * Math.PI) / 12) * q,
        ];
        for (let i = 0; i < 24; i++) {
          const [a, b, d, e] = [at(i, r), at(i + 1, r), at(i + 1, r * 0.9), at(i, r * 0.9)];
          for (const v of [a, b, d, a, d, e]) {
            vert(out, v, c);
          }
        }
      }
      for (const { p, age, size = 1 } of glows.filter(g => g.tesla)) {
        // Out to its radius in a third of its time, a jagged loop just off the floor, and a few bolts
        // from the chest out to it, a new shape each frame.
        const k = age / TESLA;
        const [r, f] = [size * Math.min(1, Math.sqrt(3 * k)), 1 - k];
        const at = (a: number, q: number, h: number): Vec3 => [
          p[0] + Math.cos(a) * q,
          p[1] + h,
          p[2] + Math.sin(a) * q,
        ];
        const zig = (line: Vec3[], w: number) => {
          for (let i = 1; i < line.length; i++) {
            ZAP.forEach(([h, rgb], z) =>
              ribbon(out, line[i - 1], line[i], h * w * f, rgb, eye, 0.01 * z, h * w * f, 0.35),
            );
          }
        };
        const loop = Array.from({ length: 41 }, (_, i) =>
          at((i * Math.PI) / 20, r, 0.15 + 0.2 * Math.abs(rnd())),
        );
        loop[40] = loop[0];
        zig(loop, 1.6);
        for (let j = 0; j < 5; j++) {
          const a = rnd() * Math.PI;
          zig(
            [0, 1, 2, 3, 4].map(i => at(a + (i % 4 && rnd() * 0.2), (r * i) / 4, 1 - 0.2 * i)),
            0.8,
          );
        }
      }
      for (const { p, age, puffs = [], size = 1 } of glows.filter(g => g.boom && !g.ring)) {
        // The fireball, at its true size: out to FIRE of NADE_R in a quarter of its time, then it
        // shrinks away, white-hot inside orange, with a few puffs of the orange round it.
        const k = age / BOOM;
        const r =
          (size * FIRE * NADE_R * (k < 0.25 ? Math.sqrt(4 * k) : (1 - k) / 0.75)) / far(eye, p, 1);
        puffs.forEach(d =>
          disc(
            out,
            p.map((c, i) => c + d[i] * r * far(eye, p, 1)) as Vec3,
            0.55 * r,
            BLAZE[0],
            eye,
            0,
            8,
            1,
          ),
        );
        BLAZE.forEach((rgb, i) => disc(out, p, r * (1 - 0.3 * i), rgb, eye, 0.05 * (i + 1), 16, 1));
      }
      for (const { p, age, puffs = [] } of glows.filter(g => g.impact)) {
        // The dust swells fast, then slower, and shrinks away at its end; the flash before it.
        const t = age / IMPACT;
        puffs.forEach((o, i) =>
          disc(
            out,
            p.map((v, j) => v + o[j] * (1 + 4 * t)) as Vec3,
            (0.06 + 0.16 * Math.sqrt(t)) * (1 - t ** 3) * (1 - 0.05 * i),
            DUST.map(c => c * (1 - 0.3 * t) * (1 - 0.04 * i)),
            eye,
            0.01 * i,
            10,
          ),
        );
        if (age < IMPACT_FLASH) {
          const k = 1 - age / IMPACT_FLASH;
          disc(out, p, 0.1 + 0.16 * k, [3.2 * k + 0.4, 2.6 * k + 0.3, 1.8 * k], eye, 0.08, 12);
        }
      }
      for (const { p, age, splash, fine, hot: h = 0 } of glows.filter(
        g => !g.boom && !g.tesla && !g.impact,
      )) {
        // A flash shrinks; a splash swells a little as it fades. A charged one is orange and bigger,
        // a laser rifle's red.
        const k = 1 - age / (splash ? SPLASH : FLASH);
        BALL.forEach(([r, rgb, lift], i) =>
          disc(
            out,
            p,
            fine
              ? r * SPLASH_WIDE[+(h < 0)] * (1.6 - 0.6 * k)
              : (splash ? r * (3 - 2 * k) : r * 0.7 * k) * (1 + Math.abs(h)),
            (h < 0 ? RED[i] : tint(rgb, i, h)).map(c => c * (0.4 + 0.6 * k)),
            eye,
            lift,
          ),
        );
      }
      for (const m of melts) {
        drawMelt(out, m);
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
      for (const { a, m, b, age, wide } of bolts) {
        const k = (1 - age / BOLT) * (wide ? wide * far(eye, m, 1) : 1);
        for (const [p, q] of [
          [a, m],
          [m, b],
        ]) {
          RIBBONS.forEach(([w, rgb, lift]) => ribbon(out, p, q, w * 0.5 * k, rgb, eye, lift));
        }
      }
      for (const { p, age, red, hot: ember, blood, steel } of sparks) {
        if (blood) {
          disc(out, p, 0.05 * (1 - (0.5 * age) / GORE), BLOOD, eye, 0, 5);
          continue;
        }
        const k = 1 - age / (ember ? EMBER : SPARK);
        disc(
          out,
          p,
          (ember ? 0.06 : steel ? 0.03 : 0.022) * k,
          ember
            ? [3 * k + 0.6, 1.4 * k, 0.2 * k]
            : steel
              ? [3 * k + 0.8, 1.3 * k + 0.3, 0.3 * k]
              : red
                ? RED[1]
                : [1.4 * k + 0.4, 2.2 * k + 0.3, 3],
          eye,
          0,
          4,
        );
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
            g.impact
              ? point(g.p, 4, 2 * Math.max(0, 1 - g.age / (3 * IMPACT_FLASH)), [1.6, 1.3, 0.9])
              : g.tesla
                ? point(g.p, 5, 1 - g.age / TESLA, [0.6, 0.5, 1.8])
                : g.boom
                  ? point(
                      g.p,
                      4 * NADE_R * (g.ring ? 1 : (g.size ?? 1)),
                      6 * (1 - g.age / BOOM),
                      [1.6, 0.8, 0.3],
                    )
                  : g.splash
                    ? point(
                        g.p,
                        g.fine ? 3 : 7,
                        (g.fine ? 1.2 : 2) * (1 - g.age / SPLASH),
                        (g.hot! < 0 ? RED[0] : [0.35, 0.7, 1.6]) as Vec3,
                      )
                    : point(g.p, 6, 1.3 * (1 - g.age / FLASH), [0.25, 0.55, 1.6]),
          ),
        ...[...balls]
          .sort((a, b) => dist(a) - dist(b))
          .slice(0, LIT)
          .map(o =>
            o.power === HARPOON
              ? point(o.p, 4, 1.2, [1.4, 0.55, 0.18])
              : o.power === DISK || o.power === DISK_RETURN
                ? point(o.p, 5, 1.4, [1.4, 0.7, 0.25])
                : (o.power ?? 1) > 1
                  ? point(o.p, o.power === NADE ? 3 : 6, 1.5, [1.4, 0.55, 0.15])
                  : point(o.p, 4, 1, o.power === 0 ? [1.4, 0.15, 0.1] : [0.25, 0.5, 1.4]),
          ),
        ...hot.slice(0, 2).map(({ p, k }) => point(p, 2 + 3 * k, 0.4 + 1.2 * k, [1.4, 0.55, 0.15])),
        ...rays
          .slice(-3)
          .map(r =>
            point([r.p[0], r.p[1] + 1, r.p[2]], 14, 5 * (1 - r.age / RAY), [1.8, 0.3, 0.15]),
          ),
      ];
    },
  };
};
