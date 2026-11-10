import { describe, expect, it, vi } from 'vitest';
import { duo } from '../../test/teams';
import { forward, spawn } from '../shared/physics';
import { ROVER, seat, wheels } from '../shared/rover';
import { NOBODY, TEX } from '../shared/types';
import type { Rover } from '../shared/types';
import { build } from '../shared/world';
import type { Brush, World } from '../shared/world';
import { GLOW } from './flag';
import { SHINE, STRIDE, basis } from './mesh';
import type { Vec3 } from './mesh';
import type * as Mesh from './mesh';
import { SEATS, contacts, grips, headlights, rolled, rover, springs } from './rover';

// The shapes are counted: a level of detail builds its meshes once.
vi.mock('./mesh', async original => {
  const m = await original<typeof Mesh>();
  return { ...m, smooth: vi.fn(m.smooth) };
});

const { A, B, WR, L0, CMAX } = ROVER;
const slab = (min: Vec3, max: Vec3): Brush => ({ min, max, top: TEX.STONE, side: TEX.STONE });
const world = (...more: Brush[]): World =>
  build({
    brushes: [slab([-100, -5, -100], [100, 0, 100]), ...more],
    teams: duo([[0, 0, 0, 0]]),
    floor: -20,
    sun: { dir: [0, 1, 0], color: [1, 1, 1] },
    sky: [
      [0, 0, 1],
      [1, 1, 1],
    ],
  });
const flat = world();
/** A floor 0.3 m higher under the right wheels of a rover at the origin that looks to -z. */
const kerb = world(slab([0.5, -5, -10], [10, 0.3, 10]));

const TEAM = [0.9, 0.2, 0.1];
/** The body's height over a flat floor with every spring squeezed by c. */
const over = (c: number) => WR + L0 - c;
/** At rest on the flat: the springs carry it 8 cm in. */
const REST = over(0.08);
const state = (o: Partial<Rover> = {}): Rover => ({
  x: 0,
  y: REST,
  z: 0,
  vx: 0,
  vy: 0,
  vz: 0,
  yaw: 0,
  pitch: 0,
  roll: 0,
  wy: 0,
  wp: 0,
  wr: 0,
  steer: 0,
  driver: NOBODY,
  rider: NOBODY,
  ...o,
});
const make = (o: Partial<Rover> = {}, lod = 2, spin = 0, w = flat, rgb = TEAM) => {
  const out: number[] = [];
  rover(out, state(o), w, spin, rgb, lod);
  return out;
};
const count = (v: number[]) => v.length / STRIDE;
const at = (v: number[], i: number): Vec3 => [v[i * STRIDE], v[i * STRIDE + 1], v[i * STRIDE + 2]];
const all = (v: number[]) => Array.from({ length: count(v) }, (_, i) => i);
const colour = (v: number[], i: number) => [
  v[i * STRIDE + 6],
  v[i * STRIDE + 7],
  v[i * STRIDE + 9],
];
const layer = (v: number[], i: number) => v[i * STRIDE + 8];
const is = (v: number[], i: number, rgb: number[], k = 1) =>
  colour(v, i).every((c, j) => Math.abs(c - rgb[j] * k) < 1e-9);
const mean = (ps: Vec3[]): Vec3 =>
  ps
    .reduce((m, p) => [m[0] + p[0], m[1] + p[1], m[2] + p[2]], [0, 0, 0])
    .map(x => x / ps.length) as Vec3;
const dist = (p: Vec3, q: Vec3) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

/** The vertices that a turn of the wheels moves: the wheels'. */
const rolling = (o: Partial<Rover> = {}, lod = 2, w = flat) => {
  const [a, b] = [make(o, lod, 0, w), make(o, lod, 1, w)];
  return new Set(all(a).filter(i => dist(at(a, i), at(b, i)) > 1e-9));
};
/** The middle of each wheel, front left, front right, rear left, rear right: its contact, WR up. */
const hubs = (o: Partial<Rover> = {}, w = flat) =>
  contacts(state(o), w).map(([x, y, z]): Vec3 => [x, y + WR, z]);
/** The wheel (0 to 3, as hubs) a point is by: at rest and looking to -z, by its quarter. */
const corner = (p: Vec3) => (p[2] < 0 ? 0 : 2) + (p[0] > 0 ? 1 : 0);
const LAMP = [1, 0.95, 0.8];
const TAIL = [1, 0.1, 0.06];

describe('rover', () => {
  for (const lod of [0, 1, 2]) {
    it(`is whole triangles of finite numbers with unit normals at level ${lod}, at rest and thrown about`, () => {
      for (const v of [
        make({}, lod),
        make({ yaw: 2.3, pitch: 0.4, roll: -0.3, steer: 0.5, y: 0.7 }, lod, 1.3, kerb),
        make({ y: 9, pitch: -0.8, roll: 0.9, steer: -0.55 }, lod, -40),
      ]) {
        expect(v.length % (3 * STRIDE)).toBe(0);
        expect(v.every(Number.isFinite)).toBe(true);
        for (const i of all(v)) {
          expect(Math.hypot(v[i * STRIDE + 3], v[i * STRIDE + 4], v[i * STRIDE + 5])).toBeCloseTo(
            1,
            4,
          );
        }
      }
    });
  }

  it('stays within 400 vertices far, 1,200 mid and 3,500 near, and any level past 2 is the near one', () => {
    const [far, mid, near] = [0, 1, 2].map(lod => count(make({}, lod)));
    expect(far).toBeLessThanOrEqual(400);
    expect(mid).toBeLessThanOrEqual(1200);
    expect(near).toBeLessThanOrEqual(3500);
    expect(far).toBeLessThan(mid);
    expect(mid).toBeLessThan(near);
    // The detail is spent: a model a third the size would not be this one.
    expect(far).toBeGreaterThan(250);
    expect(near).toBeGreaterThan(2500);
    expect(make({}, 5)).toEqual(make({}, 2));
  });

  it('is built once a level: the same call gives the same vertices, and no shape is made again', async () => {
    for (const lod of [0, 1, 2]) {
      expect(make({}, lod)).toEqual(make({}, lod));
    }
    // A fresh copy of the module, and of the shapes it counts.
    vi.resetModules();
    const made = vi.mocked((await import('./mesh')).smooth).mock.calls;
    const fresh = await import('./rover');
    const draw = (lod: number, o: Partial<Rover> = {}) => {
      const out: number[] = [];
      fresh.rover(out, state(o), kerb, 2, [0, 0, 1], lod);
      return out;
    };
    let before = made.length;
    for (const lod of [0, 1, 2]) {
      draw(lod);
      // The first of a level builds its shapes.
      expect(made.length).toBeGreaterThan(before);
      before = made.length;
    }
    for (const lod of [0, 1, 2, 7]) {
      draw(lod, { x: 4, yaw: 1, pitch: 0.2, steer: 0.3, y: 0.8 });
    }
    expect(made.length).toBe(before);
    expect(draw(2)).toEqual(make({}, 2, 2, kerb, [0, 0, 1]));
  });

  it('follows the state’s place: every vertex moves with x and z on the flat, and with y in the air', () => {
    const base = make();
    const moved = make({ x: 7, z: -3 });
    for (const i of all(base)) {
      const [p, q] = [at(base, i), at(moved, i)];
      expect(q[0] - p[0]).toBeCloseTo(7, 9);
      expect(q[1] - p[1]).toBeCloseTo(0, 9);
      expect(q[2] - p[2]).toBeCloseTo(-3, 9);
    }
    const [low, high] = [make({ y: 5 }), make({ y: 7.5 })];
    for (const i of all(low)) {
      expect(at(high, i)[1] - at(low, i)[1]).toBeCloseTo(2.5, 9);
    }
  });

  it('follows the yaw: the nose, with its headlights, points along forward(yaw)', () => {
    const base = make();
    for (const yaw of [Math.PI / 2, 4]) {
      const turned = make({ yaw });
      const [c, s] = [Math.cos(yaw), Math.sin(yaw)];
      for (const i of all(base)) {
        const [p, q] = [at(base, i), at(turned, i)];
        expect(q[0]).toBeCloseTo(p[0] * c + p[2] * s, 9);
        expect(q[1]).toBeCloseTo(p[1], 9);
        expect(q[2]).toBeCloseTo(-p[0] * s + p[2] * c, 9);
      }
      const [fx, fz] = forward(yaw);
      const lamps = mean(
        all(turned)
          .filter(i => is(turned, i, LAMP, GLOW))
          .map(i => at(turned, i)),
      );
      // On the nose, about two metres ahead of the middle.
      expect(lamps[0] * fx + lamps[2] * fz).toBeGreaterThan(1.9);
      expect(Math.abs(lamps[0] * fz - lamps[2] * fx)).toBeLessThan(1e-6);
    }
  });

  it('tilts as the state says: the nose up for a positive pitch, the right side down for a positive roll', () => {
    // In the air, where no spring moves: only the tilt differs.
    const level = make({ y: 9 });
    const wheels = rolling({ y: 9 });
    const fixed = all(level).filter(i => !wheels.has(i));
    const up = make({ y: 9, pitch: 0.3 });
    const lean = make({ y: 9, roll: 0.3 });
    const [R, U, F] = basis(0, 0.3, 0);
    const [R2, U2, F2] = basis(0, 0, 0.3);
    for (const i of fixed) {
      const p = at(level, i);
      // Right, up and ahead of the middle.
      const [x, y, a] = [p[0], p[1] - 9, -p[2]];
      const want = (r: Vec3, u: Vec3, f: Vec3, k: number) => x * r[k] + y * u[k] + a * f[k];
      [0, 1, 2].forEach(k => {
        expect(at(up, i)[k] - (k == 1 ? 9 : 0)).toBeCloseTo(want(R, U, F, k), 9);
        expect(at(lean, i)[k] - (k == 1 ? 9 : 0)).toBeCloseTo(want(R2, U2, F2, k), 9);
      });
    }
    const height = (v: number[], rgb: number[]) =>
      mean(
        all(v)
          .filter(i => is(v, i, rgb, GLOW))
          .map(i => at(v, i)),
      )[1];
    // The headlights rise and the tail lamps sink.
    expect(height(up, LAMP)).toBeGreaterThan(height(level, LAMP) + 0.5);
    expect(height(up, TAIL)).toBeLessThan(height(level, TAIL) - 0.5);
    // The right headlight sinks and the left one rises, and the wheels with them.
    const [l0, r0] = headlights(state({ y: 9 }));
    const [l1, r1] = headlights(state({ y: 9, roll: 0.3 }));
    expect(r1[1]).toBeLessThan(r0[1] - 0.1);
    expect(l1[1]).toBeGreaterThan(l0[1] + 0.1);
    const [fl, fr] = hubs({ y: 9, roll: 0.3 });
    expect(fr[1]).toBeLessThan(fl[1] - 0.4);
    const [f, , b] = hubs({ y: 9, pitch: 0.3 });
    expect(f[1]).toBeGreaterThan(b[1] + 0.6);
  });

  describe('the springs', () => {
    it('are squeezed as the simulation says: by the floor under each wheel, between 0 and CMAX', () => {
      for (const c of [0.05, 0.2, 0.45]) {
        springs(state({ y: over(c) }), flat).forEach(s => expect(s).toBeCloseTo(c, 9));
      }
      // Hanging in the air, and pressed past the stop.
      expect(springs(state({ y: 4 }), flat)).toEqual([0, 0, 0, 0]);
      expect(springs(state({ y: over(0.7) }), flat)).toEqual([CMAX, CMAX, CMAX, CMAX]);
      // Over nothing at all.
      expect(springs(state({ x: 500 }), flat)).toEqual([0, 0, 0, 0]);
      // A floor 0.3 m up under the right wheels squeezes them 0.3 m more.
      const [fl, fr, rl, rr] = springs(state({ y: over(0.1) }), kerb);
      [fl, rl].forEach(s => expect(s).toBeCloseTo(0.1, 9));
      [fr, rr].forEach(s => expect(s).toBeCloseTo(0.4, 9));
      // Nose up: the front wheels hang lower. Right side down: the right ones are squeezed.
      const [f, , r] = springs(state({ y: over(0.25), pitch: 0.1 }), flat);
      expect(r - f).toBeCloseTo(2 * A * Math.sin(0.1), 9);
      const [left, right] = springs(state({ y: over(0.25), roll: 0.1 }), flat);
      expect(right - left).toBeCloseTo(2 * B * Math.sin(0.1), 9);
    });

    it('carry the wheels: each stays on its floor while the body sinks on it, lower against the body when the spring is let out', () => {
      const wheels = rolling();
      const [out, mid, sunk] = [0.02, 0.2, 0.45].map(c => make({ y: over(c) }));
      for (const i of all(out)) {
        const [p, q, r] = [at(out, i), at(mid, i), at(sunk, i)];
        if (wheels.has(i)) {
          // On the ground whatever the body does.
          expect(q[1]).toBeCloseTo(p[1], 9);
          expect(r[1]).toBeCloseTo(p[1], 9);
        }
      }
      // The body itself came down by as much as the springs gave.
      const lamp = (v: number[]) =>
        mean(
          all(v)
            .filter(i => is(v, i, LAMP, GLOW))
            .map(i => at(v, i)),
        );
      expect(lamp(out)[1] - lamp(sunk)[1]).toBeCloseTo(0.43, 9);
      // The tyres stand on the floor, within the height of a tread.
      for (const v of [out, mid, sunk]) {
        const low = Math.min(...[...wheels].map(i => at(v, i)[1]));
        expect(low).toBeGreaterThan(-0.04);
        expect(low).toBeLessThan(0.04);
      }
    });

    it('lift a wheel that stands on a kerb, and leave the others', () => {
      const wheels = [...rolling({ y: over(0.1) }, 2, kerb)];
      const v = make({ y: over(0.1) }, 2, 0, kerb);
      const top = [0, 1, 2, 3].map(c =>
        Math.max(...wheels.filter(i => corner(at(v, i)) == c).map(i => at(v, i)[1])),
      );
      expect(top[1] - top[0]).toBeCloseTo(0.3, 9);
      expect(top[3] - top[2]).toBeCloseTo(0.3, 9);
      const c = contacts(state({ y: over(0.1) }), kerb);
      const round = (x: number) => Math.round(x * 1e9) / 1e9 + 0;
      expect(c.map(p => round(p[1]))).toEqual([0, 0.3, 0, 0.3]);
      // Front left, front right, rear left, rear right, under the hubs.
      expect(c.map(p => [round(p[0]), round(p[2])])).toEqual([
        [-B, -A],
        [B, -A],
        [-B, A],
        [B, A],
      ]);
    });

    it('show in the coil-overs: a damper is as long as its spring lets it, shorter on the squeezed side', () => {
      // The dark bands between the team's are the springs' alone.
      const band = TEAM.map(c => c * 0.15);
      const coils = (v: number[], c: number) =>
        all(v)
          .filter(i => is(v, i, band) && corner(at(v, i)) == c)
          .map(i => at(v, i));
      const tall = (ps: Vec3[]) => {
        expect(ps.length).toBeGreaterThan(20);
        return Math.max(...ps.map(p => p[1])) - Math.min(...ps.map(p => p[1]));
      };
      const [out, mid, sunk] = [0.02, 0.2, 0.45].map(c => make({ y: over(c) }));
      for (const c of [0, 1, 2, 3]) {
        const [a, b, d] = [out, mid, sunk].map(v => tall(coils(v, c)));
        expect(a).toBeGreaterThan(b + 0.05);
        expect(b).toBeGreaterThan(d + 0.05);
      }
      // On a kerb the right side's are the short ones.
      const v = make({ y: over(0.1) }, 2, 0, kerb);
      expect(tall(coils(v, 1))).toBeLessThan(tall(coils(v, 0)) - 0.08);
      expect(tall(coils(v, 3))).toBeLessThan(tall(coils(v, 2)) - 0.08);
      // The wishbones follow the hub down from the body.
      const wheels = rolling();
      const reach = (w: number[], c: number) =>
        Math.min(
          ...all(w)
            .filter(i => !wheels.has(i))
            .map(i => at(w, i)[1]),
        ) - over(c);
      expect(reach(out, 0.02)).toBeLessThan(reach(sunk, 0.45) - 0.2);
    });
  });

  it('turns the front wheels with `steer`, to the right when positive, and not the rear ones', () => {
    const wheels = [...rolling()];
    const [straight, right, left] = [0, 0.5, -0.5].map(steer => make({ steer }));
    const centres = hubs();
    for (const c of [0, 1, 2, 3]) {
      const mine = wheels.filter(i => corner(at(straight, i)) == c);
      expect(mine.length).toBeGreaterThan(300);
      /** How far right of its hub the front of the wheel is. */
      const toe = (v: number[]) =>
        mean(mine.filter(i => at(straight, i)[2] < centres[c][2] - 0.3).map(i => at(v, i)))[0] -
        centres[c][0];
      if (c < 2) {
        expect(Math.abs(toe(straight))).toBeLessThan(0.02);
        expect(toe(right)).toBeGreaterThan(0.12);
        expect(toe(left)).toBeLessThan(-0.12);
        // About the hub: no vertex leaves the wheel's sphere.
        for (const i of mine) {
          expect(dist(at(right, i), centres[c])).toBeCloseTo(dist(at(straight, i), centres[c]), 9);
        }
      } else {
        for (const i of mine) {
          expect(at(right, i)).toEqual(at(straight, i));
        }
      }
    }
  });

  it('turns the yoke in the driver’s hands with the wheels, and nothing else of the body', () => {
    const wheels = rolling();
    const [straight, right] = [0, 0.4].map(steer => make({ steer }));
    const moved = all(straight).filter(
      i => !wheels.has(i) && dist(at(straight, i), at(right, i)) > 1e-9,
    );
    // The yoke, in front of the left seat; and what hangs on the front hubs.
    const yoke = moved.filter(i => at(straight, i)[2] > -1 && Math.abs(at(straight, i)[0]) < 0.7);
    expect(yoke.length).toBeGreaterThan(30);
    for (const i of yoke) {
      const [x, y, z] = at(straight, i);
      expect(x).toBeLessThan(-0.2);
      expect(y - REST).toBeGreaterThan(0.1);
      expect(-z).toBeGreaterThan(0.5);
      expect(-z).toBeLessThan(0.95);
    }
    for (const i of moved.filter(i => !yoke.includes(i))) {
      // The front fenders, over their wheels.
      expect(-at(straight, i)[2]).toBeGreaterThan(A - 0.7);
      expect(Math.abs(at(straight, i)[0])).toBeGreaterThan(B - 0.3);
    }
    // The right grip goes down for a turn to the right.
    const grip = yoke.reduce((m, i) => (at(straight, i)[0] > at(straight, m)[0] ? i : m));
    expect(at(right, grip)[1]).toBeLessThan(at(straight, grip)[1] - 0.05);
  });

  it('rolls the wheels with `spin`, their tops forward, and nothing else', () => {
    const wheels = [...rolling()];
    const base = make();
    // Four wheels, a quarter of the moving vertices each, all within a wheel of a hub.
    const centres = hubs();
    for (const c of [0, 1, 2, 3]) {
      expect(wheels.filter(i => corner(at(base, i)) == c).length).toBeGreaterThan(
        wheels.length / 4 - 20,
      );
    }
    const turned = make({}, 2, 0.2);
    for (const i of wheels) {
      const hub = centres[corner(at(base, i))];
      expect(dist(at(base, i), hub)).toBeLessThan(WR + 0.06);
      // About the axle: the same distance from the hub, the same place across.
      expect(dist(at(turned, i), hub)).toBeCloseTo(dist(at(base, i), hub), 9);
      expect(at(turned, i)[0]).toBeCloseTo(at(base, i)[0], 9);
      // What was on top went forward (-z), what was under came back.
      if (at(base, i)[1] > hub[1] + 0.3) {
        expect(at(turned, i)[2]).toBeLessThan(at(base, i)[2]);
      }
      if (at(base, i)[1] < hub[1] - 0.3) {
        expect(at(turned, i)[2]).toBeGreaterThan(at(base, i)[2]);
      }
    }
    // A whole turn is no turn.
    const whole = make({}, 2, 2 * Math.PI);
    for (const i of wheels) {
      expect(dist(at(whole, i), at(base, i))).toBeLessThan(1e-9);
    }
    // The wheels are most of what rolls, and the far and the mid ones roll too.
    expect(wheels.length).toBeGreaterThan(1200);
    expect(rolling({}, 0).size).toBeGreaterThan(150);
    expect(rolling({}, 1).size).toBeGreaterThan(500);
  });

  it('wears the team’s colour: the fenders over the four wheels, the bonnet’s stripe, and a light on the whip', () => {
    for (const lod of [0, 1, 2]) {
      const v = make({}, lod);
      const red = all(v).filter(i => layer(v, i) == -1 && is(v, i, TEAM));
      expect(red.length).toBeGreaterThanOrEqual(30);
      // Over each wheel, and on the nose.
      for (const [x, z] of [
        [-B, -A],
        [B, -A],
        [-B, A],
        [B, A],
      ]) {
        expect(red.some(i => Math.hypot(at(v, i)[0] - x, at(v, i)[2] - z) < 0.4)).toBe(true);
      }
      expect(red.some(i => Math.abs(at(v, i)[0]) < 0.15 && at(v, i)[2] < -1.5)).toBe(true);
      // Another team, another colour, on the same vertices, and nothing else changes.
      const blue = make({}, lod, 0, flat, [0.1, 0.3, 0.9]);
      for (const i of all(v)) {
        expect(at(blue, i)).toEqual(at(v, i));
        const dyed =
          red.includes(i) ||
          is(v, i, TEAM, GLOW) ||
          is(
            v,
            i,
            TEAM.map(c => c * 0.15),
          );
        if (!dyed) {
          expect(colour(blue, i)).toEqual(colour(v, i));
        }
      }
      for (const i of red) {
        expect(colour(blue, i)).toEqual([0.1, 0.3, 0.9]);
      }
    }
    const near = make();
    const light = all(near).filter(i => layer(near, i) == -2 && is(near, i, TEAM, GLOW));
    expect(light.length).toBeGreaterThan(0);
    // High over the tail.
    for (const i of light) {
      expect(at(near, i)[1] - REST).toBeGreaterThan(1.5);
      expect(at(near, i)[2]).toBeGreaterThan(1.9);
    }
  });

  it('has headlights and tail lamps that glow, where headlights() says, and foil that shines', () => {
    for (const lod of [0, 1, 2]) {
      for (const o of [{}, { yaw: 1.2, pitch: 0.3, roll: -0.2, y: 6, x: 3 }]) {
        const v = make(o, lod);
        const lamps = all(v).filter(i => is(v, i, LAMP, GLOW));
        expect(lamps.length).toBeGreaterThanOrEqual(12);
        lamps.forEach(i => expect(layer(v, i)).toBe(-2));
        const [left, right] = headlights(state(o));
        expect(dist(left, right)).toBeCloseTo(1, 9);
        // Each lens is round its point.
        for (const p of [left, right]) {
          const lens = lamps.map(i => at(v, i)).filter(q => dist(p, q) < 0.2);
          expect(lens.length).toBe(lamps.length / 2);
          expect(dist(mean(lens), p)).toBeLessThan(1e-9);
        }
        const tail = all(v).filter(i => is(v, i, TAIL, GLOW));
        expect(tail.length).toBeGreaterThanOrEqual(6);
        tail.forEach(i => expect(layer(v, i)).toBe(-2));
      }
      // At rest: the lenses ahead, left then right; the tail lamps behind.
      const [left, right] = headlights(state());
      expect(left[0]).toBeCloseTo(-0.5, 9);
      expect(right[0]).toBeCloseTo(0.5, 9);
      expect(left[2]).toBeLessThan(-2);
      const v = make({}, lod);
      expect(
        mean(
          all(v)
            .filter(i => is(v, i, TAIL, GLOW))
            .map(i => at(v, i)),
        )[2],
      ).toBeGreaterThan(1.8);
      expect(all(v).some(i => layer(v, i) == SHINE)).toBe(true);
    }
  });

  it('keeps its belly off the ground: at rest nothing but the wheels goes below the bottom of the hubs, and on the stops nothing else touches', () => {
    for (const lod of [0, 1, 2]) {
      const wheels = rolling({}, lod);
      const rest = make({}, lod);
      const [hub] = hubs();
      expect(hub[1]).toBeCloseTo(WR, 9);
      for (const i of all(rest)) {
        if (!wheels.has(i)) {
          expect(at(rest, i)[1]).toBeGreaterThan(hub[1] - 0.25);
        }
      }
      const sunk = make({ y: over(CMAX) }, lod);
      for (const i of all(sunk)) {
        if (!wheels.has(i)) {
          expect(at(sunk, i)[1]).toBeGreaterThan(0.08);
        }
      }
    }
  });

  it('leaves the seats’ space empty: the room of a seated body where the simulation puts the players, on a cushion, before a back', () => {
    const p = spawn(1, flat, 0);
    for (const lod of [1, 2]) {
      const v = make({}, lod);
      // What a surface is tried at: its corners, the middles of its sides and its middle.
      const tried: Vec3[] = [];
      for (let i = 0; i < count(v); i += 3) {
        const [a, b, c] = [0, 1, 2].map(k => at(v, i + k));
        tried.push(a, b, c, mean([a, b]), mean([b, c]), mean([c, a]), mean([a, b, c]));
      }
      for (const s of [0, 1] as const) {
        seat(p, state(), s);
        // Right of the seat, over the feet, ahead.
        const rel = tried.map(([x, y, z]): Vec3 => [x - p.x, y - p.y, p.z - z]);
        const inside = (w: number, y0: number, y1: number, a0: number, a1: number) =>
          rel.filter(([x, y, a]) => Math.abs(x) < w && y > y0 && y < y1 && a > a0 && a < a1).length;
        // The trunk and the head, then the legs out to the pedals.
        expect(inside(0.2, 0.17, 1.3, -0.2, 0.25)).toBe(0);
        expect(inside(0.15, -0.02, 0.4, 0.25, 0.7)).toBe(0);
        // A cushion just under, a back just behind.
        expect(inside(0.2, 0.05, 0.17, -0.2, 0.15)).toBeGreaterThan(0);
        expect(inside(0.2, 0.3, 0.9, -0.55, -0.25)).toBeGreaterThan(0);
      }
      // The driver sits on the left.
      seat(p, state(), 0);
      expect(p.x).toBeLessThan(0);
    }
  });

  it('is its own buggy: an open top under a roll hoop, wheels out at the corners wider than the body, a dish on one side', () => {
    const v = make();
    const wheels = rolling();
    const fixed = all(v).filter(i => !wheels.has(i));
    const ys = fixed.map(i => at(v, i)[1] - REST);
    // The hoop stands over a seated head (0.8 m over the middle), with a dish and a whip above it.
    const hoop = fixed.filter(i => Math.abs(at(v, i)[2] - 0.6) < 0.15 && at(v, i)[1] - REST > 0.9);
    expect(hoop.length).toBeGreaterThan(20);
    expect(Math.max(...ys)).toBeGreaterThan(1.5);
    // Nothing closes the cockpit from above between the dash and the hoop.
    const roof = fixed.filter(i => {
      const [x, y, z] = at(v, i);
      return Math.abs(x) < 0.4 && z > -0.5 && z < 0.3 && y - REST > 0.7;
    });
    expect(roof).toEqual([]);
    // The tyres are the widest and the longest of it, bar the bumper's lamps.
    const wide = Math.max(...[...wheels].map(i => Math.abs(at(v, i)[0])));
    expect(wide).toBeGreaterThan(B + 0.1);
    expect(
      Math.max(...fixed.filter(i => Math.abs(at(v, i)[2]) < 0.6).map(i => Math.abs(at(v, i)[0]))),
    ).toBeLessThan(wide);
    // Within the length of the simulation's body, 4.4 m, bar the aerials.
    for (const i of fixed.filter(i => at(v, i)[1] - REST < 0.9)) {
      expect(Math.abs(at(v, i)[2])).toBeLessThan(2.25);
    }
  });
});

describe('the simulation in the model', () => {
  it("squeezes the springs as the simulation's wheels() does, tilted and on a kerb too", () => {
    for (const o of [
      {},
      { y: 0.8 },
      { y: 3 },
      { pitch: 0.4, roll: -0.3, yaw: 1 },
      { x: 0.2 },
      { x: -0.4, roll: 0.8, y: 1.7 },
    ]) {
      for (const w of [flat, kerb]) {
        expect(springs(state(o), w)).toEqual(wheels(state(o), w).map(k => k[3]));
      }
    }
  });

  it('knows the seats where seat() puts the players: the driver on the left, the feet 0.35 m under the centre', () => {
    const p = spawn(1, flat, 0);
    ([0, 1] as const).forEach(s => {
      seat(p, state({ x: 3, y: 2, z: -4, yaw: 0 }), s);
      [p.x - 3, p.y - 2, -4 - p.z].forEach((v, i) => expect(v).toBeCloseTo(SEATS[s][i], 6));
    });
    expect(SEATS[0][0]).toBeLessThan(0);
    expect(SEATS[1][0]).toBeGreaterThan(0);
    expect(SEATS[0][1]).toBeCloseTo(-0.35, 6);
  });

  it("puts the driver's hands on the yoke's grips, which go round with the wheels", () => {
    for (const steer of [0, 0.4, -0.5]) {
      const wheels = rolling();
      const [a, b] = [make({ steer: 0 }), make({ steer: 0.45 })];
      const v = make({ steer });
      // The yoke: what the steering moves in front of the left seat, and of it the dark grips at the bar's ends.
      const yoke = all(a).filter(
        i =>
          !wheels.has(i) &&
          dist(at(a, i), at(b, i)) > 1e-9 &&
          at(a, i)[2] > -1 &&
          Math.abs(at(a, i)[0]) < 0.7,
      );
      const dark = yoke.filter(i => colour(v, i)[0] < 0.15);
      expect(dark.length).toBeGreaterThan(10);
      const seat0: Vec3 = [SEATS[0][0], REST + SEATS[0][1], -SEATS[0][2]];
      const hands = grips(steer).map(([x, y, f]): Vec3 => [
        seat0[0] + x,
        seat0[1] + y,
        seat0[2] - f,
      ]);
      // Each grip's vertices are round its hand, and each hand has a grip.
      for (const h of hands) {
        const near = dark.filter(i => dist(at(v, i), h) < 0.1);
        expect(near.length).toBeGreaterThan(5);
        expect(dist(mean(near.map(i => at(v, i))), h)).toBeLessThan(0.035);
      }
      expect(dark.every(i => hands.some(h => dist(at(v, i), h) < 0.1))).toBe(true);
    }
    // A turn to the right: the right hand goes down, the left one up.
    const [l, r] = grips(0.4);
    expect(r[1]).toBeLessThan(grips(0)[1][1] - 0.05);
    expect(l[1]).toBeGreaterThan(grips(0)[0][1] + 0.05);
  });

  it('rolls the wheels by the way gone along the nose over their radius: back in reverse, nothing sideways, nothing when put back', () => {
    const r = state({ x: 10, z: 10, yaw: Math.PI / 2 });
    // The nose looks to -x.
    expect(rolled(11, 10, r)).toBeCloseTo(1 / WR, 9);
    expect(rolled(9.5, 10, r)).toBeCloseTo(-0.5 / WR, 9);
    expect(rolled(10, 12, r)).toBeCloseTo(0, 9);
    expect(rolled(11, 13, r)).toBeCloseTo(1 / WR, 9);
    expect(rolled(10 + 30, 10, r)).toBe(0);
  });
});
