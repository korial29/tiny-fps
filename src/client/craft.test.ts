import { describe, expect, it } from 'vitest';
import { seat } from '../shared/rover';
import { COCKPIT, PODS, SHIP, SHIP_GUNS, point } from '../shared/ship';
import { NOBODY } from '../shared/types';
import type { PlayerState, Rover } from '../shared/types';
import { BUDGET, ENGINE, FEET, HULL, LIGHTS, NOZZLES, WING, burn, craft, legs } from './craft';
import { SHINE, STRIDE } from './mesh';
import type { Vec3 } from './mesh';

const TEAM = [0.9, 0.2, 0.1];
const OTHER = [0.1, 0.3, 0.9];
/** A ship at the origin, its nose to -z: a point `a` ahead of its centre is at z = -a. */
const state = (o: Partial<Rover> = {}): Rover => ({
  x: 0,
  y: 0,
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
  ship: true,
  hp: SHIP.HP,
  wreck: 0,
  nades: 0,
  ...o,
});
/** The same with a pilot, at `v` m/s along its nose. */
const flown = (v = 0, o: Partial<Rover> = {}) => state({ driver: 1, vz: -v, ...o });
const make = (r = state(), lod = 2, rgb = TEAM, t = 0.5) => {
  const out: number[] = [];
  craft(out, r, rgb, t, lod);
  return out;
};
const count = (v: number[]) => v.length / STRIDE;
const all = (v: number[]) => Array.from({ length: count(v) }, (_, i) => i);
/** A vertex in the ship's frame: right of the centre, above it, ahead of it. */
const at = (v: number[], i: number): Vec3 => [v[i * STRIDE], v[i * STRIDE + 1], -v[i * STRIDE + 2]];
const colour = (v: number[], i: number) => [
  v[i * STRIDE + 6],
  v[i * STRIDE + 7],
  v[i * STRIDE + 9],
];
const layer = (v: number[], i: number) => v[i * STRIDE + 8];
const is = (v: number[], i: number, rgb: number[], k = 1) =>
  colour(v, i).every((c, j) => Math.abs(c - rgb[j] * k) < 1e-6);
const dist = (p: number[], q: number[]) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
/** The canopy's panes: see-through near by (the smoke's layer). */
const panes = (v: number[]) => all(v).filter(i => layer(v, i) == -3);
/** What glows (layer -2). */
const lit = (v: number[]) => all(v).filter(i => layer(v, i) == -2);
const span = (xs: number[]) => [Math.min(...xs), Math.max(...xs)];
const FRAME = [0.17, 0.18, 0.2];
const GUNMETAL = [0.2, 0.21, 0.24];

describe('craft', () => {
  for (const lod of [0, 1, 2]) {
    it(`is whole triangles of finite numbers with unit normals at level ${lod}, parked and thrown about`, () => {
      for (const v of [
        make(state({ nades: 4 }), lod),
        make(flown(30, { yaw: 2.3, pitch: 0.4, roll: -0.3, y: 40, nades: 2 }), lod),
        make(flown(5, { pitch: -1.1, roll: 0.8, y: 9 }), lod),
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

  it('stays within 1,400 vertices far, 2,300 mid and 4,600 near with everything aboard, and any level past 2 is the near one', () => {
    const full = flown(4, { nades: SHIP.MISSILES });
    const [far, mid, near] = [0, 1, 2].map(lod => count(make(full, lod, TEAM, 0)));
    expect(BUDGET).toEqual([1400, 2300, 4600]);
    [far, mid, near].forEach((n, lod) => expect(n).toBeLessThanOrEqual(BUDGET[lod]));
    expect(far).toBeLessThan(mid);
    expect(mid).toBeLessThan(near);
    // The detail is spent: a model half the size would not be this one.
    expect(far).toBeGreaterThan(700);
    expect(near).toBeGreaterThan(2400);
    expect(make(full, 5)).toEqual(make(full, 2));
  });

  it('is the same vertices for the same state, carried rigidly by the yaw, the pitch and the bank', () => {
    // The hull, the flames and the lights; the missiles and the legs are tubes laid from end to end.
    const r = flown(20, { x: 5, y: 30, z: -7, yaw: 1.1, pitch: 0.5, roll: -0.6 });
    expect(make(r)).toEqual(make(r));
    const [flat, turned] = [make(flown(20)), make(r)];
    expect(count(turned)).toBe(count(flat));
    for (const i of all(flat).filter(k => k % 37 == 0)) {
      const [b, u, a] = at(flat, i);
      const p = point(r, b, u, a);
      expect(
        dist(p, [turned[i * STRIDE], turned[i * STRIDE + 1], turned[i * STRIDE + 2]]),
      ).toBeLessThan(1e-4);
    }
  });

  it('is nothing once it is a wreck', () => {
    expect(make(state({ wreck: 30 }))).toEqual([]);
  });

  it('has a long nose: close to half the ship from the tip to the foot of the windscreen, slender and tapering all the way', () => {
    for (const lod of [0, 1, 2]) {
      const v = make(state(), lod);
      const [tail, tip] = span(all(v).map(i => at(v, i)[2]));
      const glass = lod
        ? panes(v)
        : all(v).filter(
            i =>
              layer(v, i) == SHINE &&
              at(v, i)[1] > 0.5 &&
              Math.abs(at(v, i)[0]) < 0.7 &&
              at(v, i)[2] < 2,
          );
      const screen = Math.max(...glass.map(i => at(v, i)[2]));
      expect(screen).toBeCloseTo(HULL.SCREEN, 5);
      const share = (tip - screen) / (tip - tail);
      expect(share).toBeGreaterThan(0.4);
      expect(share).toBeLessThan(0.5);
      // Tapering straight all the way: every point of it is inside a wedge from the windscreen's
      // foot (under a metre to a side) to a blunt tip a hand wide, 0 at the tip to 1 at the foot.
      // (In flight: parked, the nose leg hangs under it.)
      const up = make(flown(30), lod);
      const nose = all(up)
        .map(k => at(up, k))
        .filter(p => p[2] > screen + 0.01);
      for (const [x, y, a] of nose) {
        const u = Math.max(0, (HULL.TIP - a) / (HULL.TIP - screen));
        expect(Math.abs(x)).toBeLessThan(0.26 + 0.75 * u);
        expect(y).toBeLessThan(0.1 + 0.56 * u);
        expect(y).toBeGreaterThan(-0.38 - 0.51 * u);
      }
      // And fills it: as wide as the wedge at the foot, at the sensor and at the tip.
      const wide = (a: number) =>
        Math.max(
          ...all(v)
            .map(i => at(v, i))
            .filter(p => Math.abs(p[2] - a) < 1e-6)
            .map(p => Math.abs(p[0])),
        );
      expect(wide(screen)).toBeGreaterThan(0.9);
      expect(wide(HULL.SENSOR)).toBeCloseTo(0.3, 2);
      expect(wide(HULL.TIP)).toBeCloseTo(0.2, 2);
      // Nothing but the nose ahead of the windscreen: no wing, no engine, no gun out there.
      for (const i of all(v)) {
        const [x, , a] = at(v, i);
        if (a > screen + 0.01) {
          expect(Math.abs(x)).toBeLessThan(1);
        }
      }
    }
  });

  it('has its cockpit set back behind the nose, under a low canopy of six flat panes in a frame, the spine running on from it', () => {
    const v = make();
    const g = panes(v);
    // The windscreen, the roof and a window each side are quads, a pane each side of the windscreen a triangle.
    expect(g.length).toBe(4 * 6 + 2 * 3);
    const [tail, tip] = span(all(v).map(i => at(v, i)[2]));
    const [back, front] = span(g.map(i => at(v, i)[2]));
    expect([back, front]).toEqual([HULL.ARCH[1], HULL.SCREEN].map(a => expect.closeTo(a, 5)));
    // Behind the ship's middle, the whole nose ahead of it.
    expect((back + front) / 2).toBeLessThan((tail + tip) / 2);
    // Low: the roof is no more than 0.7 m over the hull's top, and well under the fins.
    const roof = Math.max(...g.map(i => at(v, i)[1]));
    const deck = Math.min(...g.map(i => at(v, i)[1]));
    expect(roof - deck).toBeLessThan(0.7);
    expect(roof - deck).toBeGreaterThan(0.5);
    // The frame: a dark strut along every edge of every pane.
    const struts = all(v)
      .filter(i => is(v, i, FRAME))
      .map(i => at(v, i));
    for (let k = 0; k < g.length; k += 3) {
      const tri = [0, 1, 2].map(j => at(v, g[k + j]));
      const sides = tri.map((p, j) => dist(p, tri[(j + 1) % 3]));
      tri.forEach((p, j) => {
        // The longest side of a quad's triangle is its diagonal: no edge.
        if (sides[j] < Math.max(...sides)) {
          for (const end of [p, tri[(j + 1) % 3]]) {
            expect(Math.min(...struts.map(q => dist(q, end)))).toBeLessThan(0.08);
          }
        }
      });
    }
    // The spine: the hull's back carries a ridge from the canopy's rear arch, lower and lower.
    const ridge = (a: number) =>
      Math.max(
        ...all(v)
          .map(i => at(v, i))
          .filter(p => Math.abs(p[2] - a) < 0.6 && Math.abs(p[0]) < 0.4)
          .map(p => p[1]),
      );
    expect(ridge(-1.4)).toBeGreaterThan(1.1);
    expect(ridge(HULL.SPINE - 0.7)).toBeLessThan(0.85);
    expect(ridge(HULL.SPINE - 0.7)).toBeGreaterThan(0.6);
    // Far away the panes are dark polished glass, with no frame and no cockpit behind them.
    const far = make(state(), 0);
    expect(panes(far)).toEqual([]);
    expect(all(far).filter(i => is(far, i, FRAME) && at(far, i)[1] > 0.5)).toEqual([]);
    expect(
      all(far).filter(i => layer(far, i) == SHINE && at(far, i)[1] > 1).length,
    ).toBeGreaterThan(0);
  });

  it('seats the pilot where the simulation puts him: on the tub floor, his head under the roof, a seat at his back', () => {
    const v = make();
    const p = {} as PlayerState;
    seat(p, state(), 0);
    const feet: Vec3 = [p.x, p.y, -p.z];
    expect(feet).toEqual(COCKPIT.map(c => expect.closeTo(c, 6)));
    const g = panes(v).map(i => at(v, i));
    const [back, front] = span(g.map(q => q[2]));
    // His helmet, 1.1 m over the seat point and a little behind it, and his feet 0.6 m ahead of it.
    expect(feet[2] - 0.3).toBeGreaterThan(back);
    expect(feet[2] + 0.75).toBeLessThan(front);
    expect(feet[1] + 1.1).toBeLessThan(Math.max(...g.map(q => q[1])));
    // His eyes are over the sill: he sees out, and is seen.
    expect(feet[1] + 0.75).toBeGreaterThan(Math.min(...g.map(q => q[1])));
    // The floor is just under him, and nothing of the ship's is where he sits.
    const body = all(v).map(i => at(v, i));
    const under = body.filter(
      q => dist([q[0], 0, q[2]], [0, 0, feet[2]]) < 0.6 && q[1] < feet[1] + 0.01,
    );
    expect(Math.max(...under.map(q => q[1]))).toBeCloseTo(feet[1] - 0.03, 5);
    expect(
      body.filter(
        q =>
          Math.abs(q[0]) < 0.2 &&
          q[1] > feet[1] + 0.15 &&
          q[1] < feet[1] + 0.9 &&
          Math.abs(q[2] - feet[2] + 0.05) < 0.2,
      ),
    ).toEqual([]);
    // The seat's back, right behind his.
    expect(
      body.some(
        q =>
          Math.abs(q[0]) < 0.25 &&
          q[1] > feet[1] + 0.8 &&
          q[2] < feet[2] - 0.35 &&
          q[2] > feet[2] - 0.6,
      ),
    ).toBe(true);
  });

  it('has two engines and no more, one against each flank of the hull, their flames out with nobody aboard and longer with the speed', () => {
    expect(NOZZLES).toEqual([
      [-ENGINE.X, ENGINE.Y, ENGINE.NOZZLE],
      [ENGINE.X, ENGINE.Y, ENGINE.NOZZLE],
    ]);
    const FLAME = [1, 0.55, 0.2];
    const flames = (r: Rover) => {
      const v = make(r, 2, TEAM, 0.5);
      return all(v)
        .filter(
          i =>
            layer(v, i) == -2 &&
            colour(v, i)[0] > colour(v, i)[2] * 2 &&
            at(v, i)[2] < ENGINE.NOZZLE + 0.3,
        )
        .filter(i => is(v, i, FLAME, colour(v, i)[0]))
        .map(i => at(v, i));
    };
    expect(flames(state())).toEqual([]);
    expect(burn(state())).toBe(0);
    const [idle, fast] = [flames(flown(0)), flames(flown(SHIP.VMAX * SHIP.BOOST))];
    for (const f of [idle, fast]) {
      // Every flame is behind one nozzle or the other, as many behind each.
      const side = [-1, 1].map(s =>
        f.filter(p => Math.hypot(p[0] - s * ENGINE.X, p[1] - ENGINE.Y) < 0.4),
      );
      expect(side[0].length).toBeGreaterThan(0);
      expect(side[0].length).toBe(side[1].length);
      expect(side[0].length + side[1].length).toBe(f.length);
    }
    const reach = (f: Vec3[]) => ENGINE.NOZZLE - Math.min(...f.map(p => p[2]));
    expect(reach(idle)).toBeGreaterThan(0.8);
    expect(reach(fast)).toBeGreaterThan(reach(idle) + 1.5);
    expect(burn(flown(0))).toBeCloseTo(0.3);
    expect(burn(flown(SHIP.VMAX * SHIP.BOOST * 2))).toBe(1);
    // The nacelles themselves: round bodies about the two axes, and nothing round anywhere else off the hull.
    for (const lod of [0, 1, 2]) {
      const v = make(state(), lod);
      const tubes = all(v)
        .map(i => at(v, i))
        .filter(
          p =>
            p[2] < ENGINE.LIP &&
            p[2] > ENGINE.NOZZLE &&
            Math.abs(Math.hypot(Math.abs(p[0]) - ENGINE.X, p[1] - ENGINE.Y) - ENGINE.R) < 1e-6,
        );
      expect(tubes.filter(p => p[0] < 0).length).toBeGreaterThan(20);
      expect(tubes.filter(p => p[0] < 0).length).toBe(tubes.filter(p => p[0] > 0).length);
    }
  });

  it('has two wings and no more: one thin sheet a side, swept back and drooping past the engine', () => {
    expect(WING.length).toBe(3);
    for (const lod of [0, 1, 2]) {
      const v = make(state(), lod, TEAM, 0);
      // Past the engines and their fins, 4 m out: the wing alone, and its tip's light.
      const out = all(v)
        .map(i => at(v, i))
        .filter(p => Math.abs(p[0]) > 4);
      for (const s of [-1, 1]) {
        const w = out.filter(p => p[0] * s > 0);
        expect(w.length).toBeGreaterThan(0);
        // One sheet: at any distance out, top to bottom is a hand's width, not two wings one over the other.
        for (const x of [4.2, 5, 5.8, 6.3]) {
          const ys = w.filter(p => Math.abs(Math.abs(p[0]) - x) < 0.45).map(p => p[1]);
          expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(0.32);
        }
        // Out to the tip and its light.
        const reach = Math.max(...w.map(p => Math.abs(p[0])));
        expect(reach).toBeGreaterThanOrEqual(WING[2][0]);
        expect(reach).toBeLessThan(WING[2][0] + 0.15);
      }
      expect(out.filter(p => p[0] < 0).length).toBe(out.filter(p => p[0] > 0).length);
    }
    const [, mid, tip] = WING;
    // Swept back: the tip's leading edge is well behind the engine's. Drooping: the tip is lower, clear of the floor.
    expect(tip[1]).toBeLessThan(mid[1] - 2);
    expect(tip[3]).toBeLessThan(mid[4] - 0.4);
    expect(tip[4]).toBeGreaterThan(-SHIP.DROP + 0.4);
    // Mirrored: the port side is the starboard one (but a three-sided rod, which is not its own image).
    const v = make();
    const key = (p: Vec3) => p.map(c => c.toFixed(3)).join();
    const port = new Set(
      all(v)
        .map(i => at(v, i))
        .filter(p => p[0] < -1.3)
        .map(p => key([-p[0], p[1], p[2]])),
    );
    const star = all(v)
      .map(i => at(v, i))
      .filter(p => p[0] > 1.3);
    expect(star.filter(p => !port.has(key(p))).length).toBeLessThan(star.length * 0.06);
  });

  it('has a cannon whose muzzle is where the simulation fires from, and the missiles it has left on the pods', () => {
    for (const lod of [0, 1, 2]) {
      const v = make(state(), lod);
      const body = all(v).map(i => at(v, i));
      for (const m of SHIP_GUNS) {
        const barrel = all(v).filter(
          i => is(v, i, GUNMETAL) && Math.hypot(at(v, i)[0] - m[0], at(v, i)[1] - m[1]) < 0.15,
        );
        expect(barrel.length).toBeGreaterThan(0);
        // The barrel ends at the muzzle, and nothing of the ship's is in the way of the bolt.
        expect(Math.max(...barrel.map(i => at(v, i)[2]))).toBeCloseTo(m[2], 1);
        expect(
          body.filter(p => p[2] > m[2] + 0.05 && Math.hypot(p[0] - m[0], p[1] - m[1]) < 0.3),
        ).toEqual([]);
      }
      const key = (p: Vec3) => p.map(c => c.toFixed(4)).join();
      const loads = [0, 1, 2, 3, 4].map(n => {
        const w = make(state({ nades: n }), lod);
        return all(w).map(i => at(w, i));
      });
      /** What the n-th missile adds. */
      const added = (n: number) => {
        const had = new Set(loads[n - 1].map(key));
        return loads[n].filter(p => !had.has(key(p)));
      };
      // The first two hang right under the pods, the next two outboard of them.
      PODS.forEach((pod, k) => {
        const ps = added(k + 1);
        expect(ps.length).toBeGreaterThan(0);
        for (const p of ps) {
          expect(Math.hypot(p[0] - pod[0], p[1] - pod[1])).toBeLessThan(0.2);
        }
        const [tail, nose] = span(ps.map(p => p[2]));
        expect(tail).toBeLessThan(pod[2]);
        expect(nose).toBeGreaterThan(pod[2]);
      });
      for (const n of [3, 4]) {
        expect(added(n).length).toBeGreaterThan(0);
        for (const p of added(n)) {
          expect(Math.abs(p[0])).toBeGreaterThan(Math.abs(PODS[1][0]) + 0.3);
        }
      }
    }
  });

  it('stands on three legs when parked, nothing under their feet, and folds them away in flight', () => {
    expect(FEET.map(f => f[1])).toEqual([-SHIP.DROP, -SHIP.DROP, -SHIP.DROP]);
    // A nose leg and two main ones behind the middle, either side.
    expect(FEET[0][0]).toBe(0);
    expect(FEET[0][2]).toBeGreaterThan(2);
    expect(FEET[1]).toEqual([-FEET[2][0], FEET[2][1], FEET[2][2]]);
    expect(FEET[2][2]).toBeLessThan(-2);
    for (const lod of [0, 1, 2]) {
      const v = make(state({ nades: 4 }), lod);
      const body = all(v).map(i => at(v, i));
      // The lowest of it is the feet, on the pad: the hull's bottom as the simulation has it.
      expect(Math.min(...body.map(p => p[1]))).toBeCloseTo(-SHIP.DROP, 2);
      const low = body.filter(p => p[1] < -SHIP.DROP + 0.05);
      for (const f of FEET) {
        expect(low.some(p => Math.hypot(p[0] - f[0], p[2] - f[2]) < 0.35)).toBe(true);
      }
      for (const p of low) {
        expect(Math.min(...FEET.map(f => Math.hypot(p[0] - f[0], p[2] - f[2])))).toBeLessThan(0.35);
      }
      // The rest is well clear of the pad: the wing tips, the missiles, the cannons.
      const rest = body.filter(p => FEET.every(f => Math.hypot(p[0] - f[0], p[2] - f[2]) > 0.8));
      expect(Math.min(...rest.map(p => p[1]))).toBeGreaterThan(-SHIP.DROP + 0.35);
      // In flight they are gone: fewer vertices, and nothing lower than the wing tips and the missiles.
      const up = make(flown(30, { nades: 4 }), lod, TEAM, 0);
      const fly = all(up)
        .map(i => at(up, i))
        .filter(p => p[2] > ENGINE.NOZZLE);
      expect(Math.min(...fly.map(p => p[1]))).toBeGreaterThan(-0.95);
    }
    expect(legs(state())).toBe(1);
    expect(legs(state({ vx: 40 }))).toBe(1);
    expect(legs(flown(0))).toBe(1);
    expect(legs(flown(3))).toBe(1);
    expect(legs(flown(7.5))).toBeCloseTo(0.5);
    expect(legs(flown(12))).toBe(0);
    expect(legs(flown(60))).toBe(0);
    // Half folded, the feet are on their way up.
    const half = make(flown(7.5), 2, TEAM, 0);
    const lowest = Math.min(
      ...all(half)
        .map(i => at(half, i))
        .filter(p => p[2] > ENGINE.NOZZLE)
        .map(p => p[1]),
    );
    expect(lowest).toBeGreaterThan(-SHIP.DROP + 0.2);
    expect(lowest).toBeLessThan(-0.8);
  });

  it("wears the team's colour on its fins, its stripes and its engines' rings, and nowhere else", () => {
    for (const lod of [0, 1, 2]) {
      const [red, blue] = [make(state(), lod, TEAM), make(state(), lod, OTHER)];
      expect(count(red)).toBe(count(blue));
      const team = all(red).filter(i => is(red, i, TEAM));
      expect(team.length).toBeGreaterThan(100);
      for (const i of all(red)) {
        expect(is(blue, i, OTHER)).toBe(team.includes(i));
        if (!team.includes(i)) {
          expect(colour(blue, i)).toEqual(colour(red, i));
        }
        expect(at(blue, i)).toEqual(at(red, i));
      }
      const ps = team.map(i => at(red, i));
      // The fins stand on the hull's back, canted out; the nose has its band and its stripe; the wings theirs.
      expect(Math.max(...ps.map(p => p[1]))).toBeGreaterThan(2.2);
      expect(ps.some(p => p[2] > 6)).toBe(true);
      expect(ps.some(p => Math.abs(p[0]) > 5.5)).toBe(true);
      const top = ps.filter(p => p[1] > 2.2);
      expect(top.every(p => Math.abs(p[0]) > 1 && Math.abs(p[0]) < ENGINE.X)).toBe(true);
      // They stand on the hull's back, not on the engines: their feet are on its deck.
      const feet = ps.filter(p => p[2] < -3.4 && p[2] > -5.7 && p[1] < 0.7 && p[1] > 0.5);
      expect(feet.length).toBeGreaterThan(0);
      expect(feet.every(p => Math.abs(p[0]) < 0.65)).toBe(true);
    }
  });

  it('shows a red light on the port tip, a green one on the starboard tip, and a white strobe on the spine', () => {
    const lights = (t: number) => {
      const v = make(state(), 2, TEAM, t);
      return lit(v)
        .filter(i => at(v, i)[2] < 0)
        .map(i => [at(v, i), colour(v, i)]);
    };
    const on = lights(0.02);
    const off = lights(0.5);
    const by = (ls: number[][][], k: number) => ls.filter(([p]) => dist(p, LIGHTS[k]) < 0.2);
    for (const ls of [on, off]) {
      expect(by(ls, 0).length).toBeGreaterThan(0);
      expect(by(ls, 1).length).toBeGreaterThan(0);
      by(ls, 0).forEach(([, c]) => expect(c[0]).toBeGreaterThan(c[1] * 5));
      by(ls, 1).forEach(([, c]) => expect(c[1]).toBeGreaterThan(c[0] * 5));
    }
    expect(LIGHTS[0][0]).toBeLessThan(0);
    expect(by(on, 2).length).toBeGreaterThan(0);
    by(on, 2).forEach(([, c]) => expect(c).toEqual([3, 3, 3]));
    expect(by(off, 2)).toEqual([]);
    expect(on.length - by(on, 2).length).toBe(off.length);
  });
});
