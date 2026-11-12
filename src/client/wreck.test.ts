// A vehicle's damage as it is drawn and heard (wreck.ts): the arcs by health, the wreck, the
// explosion, the vehicle parked afresh.
import { describe, expect, it, vi } from 'vitest';
import { duo } from '../../test/teams';
import { TICK_HZ, VEHICLE } from '../shared/constants';
import { ROVER } from '../shared/rover';
import { SHIP } from '../shared/ship';
import { NOBODY, TEX } from '../shared/types';
import type { Rover } from '../shared/types';
import { build } from '../shared/world';
import { craft } from './craft';
import { STRIDE } from './mesh';
import type { Vec3 } from './mesh';
import { rover } from './rover';
import { SOUND } from './sfx';
import { ANCHORS, SHIMMER, arcs, char, createWrecks, order, pose, sparking, spots } from './wreck';

const flat = build({
  brushes: [{ min: [-100, -5, -100], max: [100, 0, 100], top: TEX.STONE, side: TEX.STONE }],
  teams: duo([[0, 0, 0, 0]]),
  floor: -20,
  sun: { dir: [0, 1, 0], color: [1, 1, 1] },
  sky: [
    [0, 0, 1],
    [1, 1, 1],
  ],
});
const TEAM = [0.9, 0.2, 0.1];
const state = (o: Partial<Rover> = {}): Rover => ({
  x: 0,
  y: o.ship ? SHIP.DROP : ROVER.WR + ROVER.L0 - 0.08,
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
  hp: VEHICLE.HP,
  wreck: 0,
  ...o,
});
const ship = (o: Partial<Rover> = {}) => state({ ship: true, nades: 0, ...o });
/** The model as drawn: a rover's or a ship's, vehicle `k` of the map. */
const model = (r: Rover, k = 0): number[] => {
  const out: number[] = [];
  if (r.ship) {
    craft(out, r, TEAM, 0.5, 2, k);
  } else {
    rover(out, r, flat, 0, TEAM, 2, k);
  }
  return out;
};
const verts = (v: number[]) =>
  Array.from({ length: v.length / STRIDE }, (_, i) => v.slice(i * STRIDE, (i + 1) * STRIDE));
const lit = (v: number[]) => verts(v).filter(x => x[8] === -2);
/** The area of every triangle, summed. */
const area = (v: number[]) => {
  let sum = 0;
  for (let i = 0; i + 3 * STRIDE <= v.length; i += 3 * STRIDE) {
    const [a, b, c] = [0, 1, 2].map(k => [0, 1, 2].map(j => v[i + k * STRIDE + j]));
    const [u, w] = [b, c].map(p => p.map((x, j) => x - a[j]));
    sum +=
      Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]) /
      2;
  }
  return sum;
};

describe('the arcs of a damaged hull', () => {
  it('are none at full health, one or two down to 7, about half down to 4, nearly all under', () => {
    const n = Array.from({ length: 11 }, (_, hp) => arcs({ hp, wreck: 0 }));
    expect(n[10]).toBe(0);
    for (const hp of [9, 8, 7]) {
      expect([1, 2]).toContain(n[hp]);
    }
    for (const hp of [6, 5, 4]) {
      expect(n[hp]).toBeGreaterThanOrEqual(4);
      expect(n[hp]).toBeLessThanOrEqual(7);
    }
    for (const hp of [3, 2, 1]) {
      expect(n[hp]).toBeGreaterThanOrEqual(9);
      expect(n[hp]).toBeLessThanOrEqual(ANCHORS[0].length);
    }
    // More as the health falls, never fewer.
    for (let hp = 1; hp < 10; hp++) {
      expect(n[hp]).toBeGreaterThanOrEqual(n[hp + 1]);
    }
    // A state that says nothing is whole.
    expect(arcs({})).toBe(0);
  });

  it('die out on a wreck before it falls apart', () => {
    expect(arcs({ hp: 0, wreck: VEHICLE.WRECK })).toBeGreaterThan(4);
    expect(arcs({ hp: 0, wreck: VEHICLE.WRECK / 2 })).toBeLessThan(
      arcs({ hp: 0, wreck: VEHICLE.WRECK }),
    );
    expect(arcs({ hp: 0, wreck: VEHICLE.FADE })).toBe(0);
    expect(arcs({ hp: 0, wreck: 1 })).toBe(0);
  });

  it('sit at a dozen fixed places of each vehicle, on its hull', () => {
    expect(ANCHORS.map(a => a.length)).toEqual([12, 12]);
    for (const r of [state({ hp: 1 }), ship({ hp: 1 })]) {
      const v = verts(model(state({ ship: r.ship, nades: r.nades })));
      // Every place, whatever the order: within a hand of the model's surface.
      const all = { ...r, hp: 1 };
      const at = order(0)
        .map((_, j) => spots(all, 0)[j])
        .filter(Boolean);
      expect(at).toHaveLength(arcs(all));
      for (const p of ANCHORS[+!!r.ship]) {
        const d = Math.min(
          ...v.map(x => Math.hypot(x[0] - p[0], x[1] - (r.y + p[1]), x[2] + p[2])),
        );
        expect([p, d < 0.3]).toEqual([p, true]);
      }
    }
  });

  it('are the same for the same vehicle and health, its own for each vehicle, and grow place by place', () => {
    for (const r of [state(), ship()]) {
      for (let hp = 1; hp <= 9; hp++) {
        const a = spots({ ...r, hp }, 3);
        expect(a).toEqual(spots({ ...r, hp }, 3));
        expect(a).toHaveLength(arcs({ hp }));
        // What arced at more health still does.
        expect(a.slice(0, arcs({ hp: hp + 1 }))).toEqual(spots({ ...r, hp: hp + 1 }, 3));
      }
    }
    expect(order(0)).not.toEqual(order(1));
    expect([...order(5)].sort((a, b) => a - b)).toEqual(ANCHORS[0].map((_, i) => i));
    // They follow the hull where it is and as it is turned.
    const moved = spots(state({ hp: 1, x: 10, z: -4, yaw: 1.2 }), 0);
    const home = spots(state({ hp: 1 }), 0);
    moved.forEach((p, i) => {
      expect(Math.hypot(p[0] - 10, p[2] + 4)).toBeCloseTo(Math.hypot(home[i][0], home[i][2]), 5);
    });
  });

  it('are short bolts from their places, flickering: the same in the same slot, there in some slots only', () => {
    const r = state({ hp: 2 });
    const at = spots(r, 1);
    let [bolts, lone] = [0, 0];
    for (let slot = 0; slot < 300; slot++) {
      const b = sparking(r, 1, slot);
      expect(b).toEqual(sparking(r, 1, slot));
      bolts += b.length;
      lone += +(b.length < at.length);
      for (const [from, to] of b) {
        expect(at).toContainEqual(from);
        const l = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
        expect(l).toBeGreaterThan(0.4);
        expect(l).toBeLessThan(1.1);
      }
    }
    // Each place arcs in about four slots of ten.
    expect(bolts / (300 * at.length)).toBeGreaterThan(0.3);
    expect(bolts / (300 * at.length)).toBeLessThan(0.5);
    expect(lone).toBeGreaterThan(250);
    expect(sparking(state(), 1, 7)).toEqual([]);
    // A ship's are longer.
    const far = sparking(ship({ hp: 1 }), 0, 3).map(([a, b]) =>
      Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]),
    );
    expect(Math.max(...far)).toBeGreaterThan(1.1);
  });

  it('scorch the hull round them, and nowhere on a whole vehicle', () => {
    const whole = model(state());
    expect(model(state({ hp: 10 }))).toEqual(whole);
    const hurt = model(state({ hp: 4 }), 0);
    expect(hurt).toHaveLength(whole.length);
    const darker = verts(hurt).filter((x, i) => x[6] < whole[i * STRIDE + 6] - 1e-6);
    expect(darker.length).toBeGreaterThan(20);
    const at = spots(state({ hp: 4 }), 0);
    for (const x of darker) {
      expect(
        Math.min(...at.map(p => Math.hypot(x[0] - p[0], x[1] - p[1], x[2] - p[2]))),
      ).toBeLessThan(0.71);
    }
    // No vertex moved.
    expect(
      verts(hurt).every((x, i) => x[0] === whole[i * STRIDE] && x[1] === whole[i * STRIDE + 1]),
    ).toBe(true);
  });
});

describe('a wreck', () => {
  it('is the rover charred, sagged on splayed wheels, with no light on it', () => {
    const [whole, wreck] = [model(state()), model(state({ hp: 0, wreck: 200 }))];
    expect(wreck).toHaveLength(whole.length);
    expect(lit(whole).length).toBeGreaterThan(0);
    expect(lit(wreck)).toEqual([]);
    const dark = verts(wreck).filter(x => x[8] !== -3);
    expect(Math.max(...dark.flatMap(x => [x[6], x[7], x[9]]))).toBeLessThan(0.2);
    const y = (v: number[]) => verts(v).reduce((s, x) => s + x[1], 0) / (v.length / STRIDE);
    expect(y(wreck)).toBeLessThan(y(whole) - 0.05);
    // pose() is what sags it: lower, rolled, the nose down; a whole one is left alone.
    const r = state({ hp: 0, wreck: 200 });
    expect(pose(state())).toEqual(state());
    expect(pose(r).y).toBeLessThan(r.y - 0.1);
    expect(pose(r).roll).toBeGreaterThan(0.05);
    expect(pose(ship({ hp: 0, wreck: 200 })).y).toBeLessThan(SHIP.DROP - 0.4);
  });

  it('falls apart over its last VEHICLE.FADE ticks into embers, and is gone at the end', () => {
    for (const make of [state, ship]) {
      const left = [200, VEHICLE.FADE + 1, 45, 30, 15, 0.01].map(wreck =>
        area(model(make({ hp: 0, wreck }))),
      );
      expect(left[1]).toBeCloseTo(left[0], 6);
      for (let k = 2; k < left.length; k++) {
        expect(left[k]).toBeLessThan(left[k - 1]);
      }
      expect(left[5]).toBeLessThan(0.01 * left[0]);
      expect(lit(model(make({ hp: 0, wreck: 30 }))).length).toBeGreaterThan(50);
    }
  });

  it('shimmers in when it is parked afresh: nothing at first, whole SHIMMER ticks later', () => {
    const whole = model(state());
    const left = [SHIMMER, 20, 10, 0.01].map(t => area(model(state({ wreck: -t }))));
    expect(left[0]).toBeLessThan(0.01 * area(whole));
    for (let k = 1; k < left.length; k++) {
      expect(left[k]).toBeGreaterThan(left[k - 1]);
    }
    expect(left[3]).toBeCloseTo(area(whole), 3);
    // char() leaves a whole vehicle's vertices alone.
    const copy = [...whole];
    char(copy, 0, state(), 0);
    expect(copy).toEqual(whole);
  });
});

describe('createWrecks', () => {
  const stage = () => {
    const tracer = { arc: vi.fn(), blast: vi.fn(), ring: vi.fn(), spit: vi.fn() };
    const audio = { play: vi.fn() };
    const fx = { quake: vi.fn() };
    const wrecks = createWrecks(flat, { tracer, audio, fx });
    const heard = (id: number) => audio.play.mock.calls.filter(c => c[0] === id);
    /** `n` frames of a sixtieth of a second over the same vehicles. */
    const run = (rovers: Rover[], n = 1, eye?: Vec3) => {
      let out: Rover[] = [];
      for (let k = 0; k < n; k++) {
        out = wrecks.frame(rovers, 1 / TICK_HZ, eye);
      }
      return out;
    };
    return { tracer, audio, fx, wrecks, heard, run };
  };

  it('is silent and draws nothing over whole vehicles', () => {
    const s = stage();
    const r = [state(), ship({ x: 30 })];
    expect(s.run(r, 120)).toEqual(r);
    expect(s.audio.play).not.toHaveBeenCalled();
    expect(s.tracer.arc).not.toHaveBeenCalled();
    const out: number[] = [];
    s.wrecks.draw(out);
    expect(out).toEqual([]);
    expect(s.wrecks.count).toBe(0);
  });

  it('plays a hit on the hull once when its health falls, with sparks, at the vehicle', () => {
    const s = stage();
    s.run([state({ x: 5 })], 3);
    s.run([state({ x: 5, hp: 9 })], 1);
    expect(s.heard(SOUND.HULL)).toHaveLength(1);
    expect(s.heard(SOUND.HULL)[0][1]).toEqual([5, state().y, 0]);
    expect(s.tracer.spit.mock.calls.length).toBeGreaterThanOrEqual(4);
    s.run([state({ x: 5, hp: 9 })], 30);
    expect(s.heard(SOUND.HULL)).toHaveLength(1);
    s.run([state({ x: 5, hp: 7 })], 1);
    expect(s.heard(SOUND.HULL)).toHaveLength(2);
    // Health coming back (parked afresh) is no hit.
    s.run([state({ x: 5 })], 5);
    expect(s.heard(SOUND.HULL)).toHaveLength(2);
  });

  it('arcs a hurt hull at its places, more bolts the lower its health, and crackles there now and then', () => {
    const count = (hp: number) => {
      const s = stage();
      s.run([state({ hp })], 300);
      const at = spots(state({ hp }), 0);
      for (const [from] of s.tracer.arc.mock.calls) {
        expect(at).toContainEqual(from);
      }
      return [s.tracer.arc.mock.calls.length, s.heard(SOUND.ARC).length];
    };
    const [few, some, many] = [8, 5, 2].map(count);
    expect(few[0]).toBeGreaterThan(20);
    expect(some[0]).toBeGreaterThan(2 * few[0]);
    expect(many[0]).toBeGreaterThan(1.5 * some[0]);
    // A crackle is heard several times in five seconds, never on every bolt.
    for (const [bolts, crackles] of [few, some, many]) {
      expect(crackles).toBeGreaterThan(5);
      expect(crackles).toBeLessThan(40);
      expect(crackles).toBeLessThan(bolts);
    }
    expect(count(10)).toEqual([0, 0]);
  });

  it('blows up once when the wreck appears: fireballs, a ring, a boom, debris, and a shake that fades with the distance', () => {
    const s = stage();
    s.run([state({ x: 5, hp: 2 })], 2);
    const wreck = state({ x: 5, hp: 0, wreck: VEHICLE.WRECK });
    s.run([wreck], 1, [5, 1, 10]);
    expect(s.heard(SOUND.WRECK)).toHaveLength(1);
    expect(s.heard(SOUND.WRECK)[0][1]).toEqual([5, wreck.y, 0]);
    // No hull hit on top of it.
    expect(s.heard(SOUND.HULL)).toHaveLength(0);
    expect(s.tracer.blast).toHaveBeenCalledTimes(1);
    expect(s.tracer.blast.mock.calls[0][1]).toBeGreaterThan(1.5);
    expect(s.tracer.ring).toHaveBeenCalledTimes(1);
    expect(s.fx.quake).toHaveBeenCalledTimes(1);
    const near = s.fx.quake.mock.calls[0][0];
    expect(near).toBeGreaterThan(0.5);
    expect(s.wrecks.count).toBeGreaterThanOrEqual(30);
    // Two more fireballs along the hull within a third of a second, and no second boom.
    s.run([{ ...wreck, wreck: VEHICLE.WRECK - 20 }], 20);
    expect(s.tracer.blast).toHaveBeenCalledTimes(3);
    expect(s.heard(SOUND.WRECK)).toHaveLength(1);
    expect(s.fx.quake).toHaveBeenCalledTimes(1);
    // The debris and the smoke are drawn: finite vertices, whole triangles.
    const out: number[] = [];
    s.wrecks.draw(out);
    expect(out.length).toBeGreaterThan(30 * 12 * STRIDE - 1);
    expect(out.length % (3 * STRIDE)).toBe(0);
    expect(out.every(Number.isFinite)).toBe(true);
    // Far away: no shake.
    const t = stage();
    t.run([state({ hp: 2 })], 2);
    t.run([state({ hp: 0, wreck: VEHICLE.WRECK })], 1, [0, 1, 80]);
    expect(t.fx.quake.mock.calls[0][0]).toBe(0);
    // A ship's is bigger.
    const u = stage();
    u.run([ship({ hp: 2 })], 2);
    u.run([ship({ hp: 0, wreck: VEHICLE.WRECK })], 1);
    expect(u.tracer.blast.mock.calls[0][1]).toBeGreaterThan(s.tracer.blast.mock.calls[0][1]);
  });

  it('smokes while it lies there, eases the wire’s steps of four, and crumbles once over its last second', () => {
    const s = stage();
    s.run([state({ hp: 1 })], 2);
    let shown: Rover[] = [];
    const seen: number[] = [];
    // The host's wreck time as the wire gives it: in fours, rounded up, one tick a frame.
    for (let left = VEHICLE.WRECK; left > 0; left--) {
      shown = s.run([state({ hp: 0, wreck: 4 * Math.ceil(left / 4) })], 1);
      seen.push(shown[0].wreck!);
      if (left === VEHICLE.WRECK - 60) {
        expect(s.wrecks.count).toBeGreaterThan(30);
        expect(s.heard(SOUND.CRUMBLE)).toHaveLength(0);
      }
    }
    // Drawn, its time runs down by about a tick a frame, never up, never by a step of four.
    for (let k = 1; k < seen.length; k++) {
      expect(seen[k]).toBeLessThanOrEqual(seen[k - 1]);
      expect(seen[k - 1] - seen[k]).toBeLessThan(2.5);
    }
    expect(seen.at(-1)).toBeLessThan(4);
    expect(s.heard(SOUND.CRUMBLE)).toHaveLength(1);
    expect(s.heard(SOUND.WRECK)).toHaveLength(1);
  });

  it('smokes over the wreck: puffs that rise and slow, never fall, and thin out as they go', () => {
    const s = stage();
    const wreck = state({ hp: 0, wreck: 200 });
    // No explosion first: its debris is not smoke.
    s.run([wreck], 4 * TICK_HZ);
    const out: number[] = [];
    s.wrecks.draw(out);
    const smoke = verts(out).filter(x => x[8] === -3);
    expect(smoke.length).toBeGreaterThan(10 * 24);
    expect(smoke.length).toBe(out.length / STRIDE);
    // All of it over the hull's middle, up to a few metres.
    const ys = smoke.map(x => x[1]);
    expect(Math.min(...ys)).toBeGreaterThan(wreck.y - 0.5);
    expect(Math.max(...ys)).toBeGreaterThan(wreck.y + 1.5);
    expect(Math.max(...ys)).toBeLessThan(wreck.y + 6);
    // See-through, the highest (the oldest) the thinnest.
    const top = smoke.reduce((a, x) => (x[1] > a[1] ? x : a));
    const low = smoke.reduce((a, x) => (x[1] < a[1] ? x : a));
    expect(top[7]).toBeLessThan(low[7]);
    expect(Math.max(...smoke.map(x => x[7]))).toBeLessThanOrEqual(0.8);
  });

  it('shimmers the vehicle in when it is parked afresh, without a sound of damage', () => {
    const s = stage();
    s.run([state({ hp: 0, wreck: 8 })], 2);
    const calls = s.audio.play.mock.calls.length;
    const [first] = s.run([state()], 1);
    expect(first.wreck).toBeLessThan(0);
    expect(first.wreck).toBeGreaterThanOrEqual(-SHIMMER);
    const [later] = s.run([state()], SHIMMER + 2);
    expect(later.wreck).toBe(0);
    expect(s.audio.play.mock.calls.length).toBe(calls);
    expect(s.heard(SOUND.HULL)).toHaveLength(0);
  });
});
