import { describe, expect, it } from 'vitest';
import { Sim, EAST, WEST } from '../../test/pilot';
import { duo } from '../../test/teams';
import { move, spawn } from './physics';
import { hash as textureHash } from '../client/textures';
import { bound, ground, hash, noise, raise, trace } from './relief';
import type { ReliefDef } from './relief';
import { KEY, MODE, TEX } from './types';
import { build, hidden, ray } from './world';
import type { World } from './world';

/** Flat up to x = 20, then a slope of 1 in 2 toward +x; the hole is a 10 m square on a slab. */
const SLOPE: ReliefDef = {
  hole: [0, 0, 10, 10],
  bound: [0, 0, 100, 60],
  cell: 4,
  at: x => (x > 20 ? (x - 20) / 2 : 0),
};
const world = (relief?: ReliefDef): World =>
  build({
    brushes: [{ min: [0, -5, 0], max: [10, 0, 10], top: TEX.STONE, side: TEX.STONE }],
    teams: duo([[16, 0, 5, 0]]),
    floor: -50,
    sun: { dir: [0, 1, 0], color: [1, 1, 1] },
    sky: [
      [0, 0, 1],
      [1, 1, 1],
    ],
    relief,
  });
const hills = world(SLOPE);

describe('hash and noise', () => {
  it("hashes as the textures' hash does, on integers alone", () => {
    for (const [x, y, s] of [
      [0, 0, 0],
      [1, 2, 3],
      [-7, 40, 9],
      [123456, -654321, 77],
    ]) {
      expect(hash(x, y, s)).toBe(textureHash(x, y, s));
      expect(hash(x, y, s)).toBeGreaterThanOrEqual(0);
      expect(hash(x, y, s)).toBeLessThan(1);
    }
    // Pinned: any engine gives these bits.
    expect(hash(1, 2, 3)).toBe(0.4897682995069772);
  });

  it('is the hash on the lattice points, smooth between them and flat across a lattice line', () => {
    expect(noise(3, -2, 5)).toBe(hash(3, -2, 5));
    const [a, b] = [hash(3, 4, 1), hash(4, 4, 1)];
    expect(noise(3.5, 4, 1)).toBeCloseTo((a + b) / 2, 12);
    // No crease where a map is folded along a lattice line: the same just before and after it.
    expect(noise(3.3, 4 - 1e-4, 1)).toBeCloseTo(noise(3.3, 4 + 1e-4, 1), 6);
    expect(Math.abs(noise(3.3, 4.4, 1) - noise(3.3, 4.4002, 1))).toBeGreaterThan(1e-6);
  });
});

describe('raise', () => {
  it('builds the lattice of a definition once', () => {
    expect(raise(SLOPE)).toBe(raise(SLOPE));
    expect(raise({ ...SLOPE })).not.toBe(raise(SLOPE));
    expect(hills.relief).toBe(raise(SLOPE));
  });

  it('lays nodes over the whole bound, a cell apart, and knows the highest', () => {
    const r = raise(SLOPE);
    expect([r.x0, r.z0, r.cell]).toEqual([-100, -60, 4]);
    expect([r.nx, r.nz]).toEqual([51, 31]);
    expect(r.h.length).toBe(51 * 31);
    expect(r.h[30]).toBe(0);
    expect(r.h[50]).toBe(40);
    expect(r.top).toBe(40);
  });
});

describe('ground', () => {
  it('is absent in a world without relief', () => {
    expect(ground(world(), 50, 5)).toBe(-Infinity);
  });

  it('is absent inside the hole and there on its edge', () => {
    expect(ground(hills, 5, 5)).toBe(-Infinity);
    expect(ground(hills, 10, 5)).toBe(0);
    expect(ground(hills, 0, 0)).toBe(0);
  });

  it('is the plane of the lattice triangle over the point', () => {
    expect(ground(hills, 15, 30)).toBe(0);
    expect(ground(hills, 30, 30)).toBe(5);
    expect(ground(hills, 41.5, -17.25)).toBe(10.75);
    // One square with one corner up: the split runs from (0, 0) to (4, 4).
    const peak = world({ ...SLOPE, at: (x, z) => (x === 40 && z === 20 ? 4 : 0) });
    expect(ground(peak, 40, 20)).toBe(4);
    expect(ground(peak, 38, 18)).toBe(2);
    expect(ground(peak, 38, 20)).toBe(2);
    expect(ground(peak, 40, 18)).toBe(2);
    // Across the other diagonal the two corners are down, and so is the line between them.
    expect(ground(peak, 42, 18)).toBe(0);
    expect(ground(peak, 43, 21)).toBe(1);
  });

  it('is absent in a pit and on its edge, so two pits side by side are one', () => {
    const w = world({
      ...SLOPE,
      pits: [
        [20, 20, 24, 28],
        [24, 20, 28, 24],
      ],
    });
    expect(w.relief!.box).toEqual([20, 20, 28, 28]);
    for (const [x, z] of [
      [22, 24],
      [24, 22],
      [20, 20],
      [28, 24],
      [26, 20.5],
    ]) {
      expect(ground(w, x, z), `${x}, ${z}`).toBe(-Infinity);
    }
    // Beside them, and in the corner the two leave, the ground is there.
    expect(ground(w, 19.9, 24)).toBe(0);
    expect(ground(w, 26, 26)).toBeCloseTo(3, 9);
    expect(ground(w, 30, 22)).toBe(5);
    expect(hills.relief!.pits).toEqual([]);
    expect(ground(hills, 22, 24)).toBe(1);
  });

  it('holds the edge height past the lattice', () => {
    expect(ground(hills, 500, 0)).toBe(40);
    expect(ground(hills, -500, 900)).toBe(0);
  });
});

describe('bound', () => {
  it('leaves a body inside the ellipse alone', () => {
    const p = { x: 60, z: 20, vx: 5, vz: 5 };
    bound(p, hills);
    expect(p).toEqual({ x: 60, z: 20, vx: 5, vz: 5 });
  });

  it('puts a body back on the ellipse and takes its speed out of it', () => {
    const p = { x: 120, z: 0, vx: 8, vz: 3 };
    bound(p, hills);
    expect(p.x).toBeCloseTo(100, 9);
    expect(p.z).toBe(0);
    expect(p.vx).toBeCloseTo(0, 9);
    expect(p.vz).toBe(3);
    const q = { x: 80, z: 80, vx: -2, vz: -2 };
    bound(q, hills);
    expect((q.x / 100) ** 2 + (q.z / 60) ** 2).toBeCloseTo(1, 9);
    // Already on its way back in: the speed is kept.
    expect([q.vx, q.vz]).toEqual([-2, -2]);
  });

  it('does nothing in a world without relief', () => {
    const p = { x: 1e4, z: 0, vx: 1, vz: 0 };
    bound(p, world());
    expect(p.x).toBe(1e4);
  });
});

describe('trace and ray', () => {
  it('stops a ray on the slope', () => {
    // Level at 5 m up: the slope reaches 5 m at x = 30.
    const t = ray(hills, [12, 5, 30], [1, 0, 0], 100);
    expect(t).toBeGreaterThan(17.9);
    expect(t).toBeLessThanOrEqual(18);
    expect(hidden(hills, [12, 5, 30], [60, 5, 30])).toBe(true);
  });

  it('lets a ray over the ground go by, and one above every node is not marched', () => {
    expect(ray(hills, [12, 5, 30], [1, 0, 0], 10)).toBe(10);
    expect(hidden(hills, [12, 5, 30], [26, 5, 30])).toBe(false);
    expect(trace(hills, [12, 41, 30], [1, 0, 0], 300)).toBe(300);
  });

  it('hits at 0 from under the ground, and straight down at the height', () => {
    expect(ray(hills, [40, 2, 30], [1, 0, 0], 50)).toBe(0);
    expect(ray(hills, [40, 30, 30], [0, -1, 0], 50)).toBe(20);
    expect(ray(hills, [40, 30, 30], [0, 1, 0], 50)).toBe(50);
  });

  it('carries a sphere: the ground is that much higher', () => {
    const t = ray(hills, [12, 5, 30], [1, 0, 0], 100, 1);
    expect(t).toBeGreaterThan(15.9);
    expect(t).toBeLessThanOrEqual(16);
  });

  it('skips the hole: a ray that stays over it takes no sample, one that leaves it or crosses it still lands', () => {
    // Slopes on both sides of the slab, 1 in 2 from x = 20 and from x = -10.
    const def = {
      ...SLOPE,
      at: (x: number) => (x > 20 ? (x - 20) / 2 : x < -10 ? (-10 - x) / 2 : 0),
    };
    const w = world(def);
    let reads = 0;
    const counted: World = {
      ...w,
      get relief() {
        reads++;
        return w.relief;
      },
    };
    // From over the slab to over the slab: the one read is trace()'s own.
    expect(trace(counted, [1, 3, 5], [1, 0, 0], 8)).toBe(8);
    expect(trace(counted, [9, 3, 1], [-0.6, 0, 0.8], 9)).toBe(9);
    expect(reads).toBe(2);
    // Out of the hole at x = 10, onto the slope at x = 26.
    const out = trace(counted, [1, 3, 5], [1, 0, 0], 100);
    expect(out).toBeGreaterThan(24.9);
    expect(out).toBeLessThanOrEqual(25);
    expect(reads).toBeGreaterThan(10);
    // From one side, over the hole, onto the other: 5 m up at x = -20.
    const across = ray(w, [25, 5, 5], [-1, 0, 0], 100);
    expect(across).toBeGreaterThan(44.9);
    expect(across).toBeLessThanOrEqual(45);
    // Under the ground past the hole: stopped where the ray leaves the hole.
    expect(trace(w, [5, 3, 5], [0.8, -0.6, 0], 100)).toBe(6.25);
  });

  it('keeps the brushes first', () => {
    // Down onto the slab in the hole: no ground there, the slab's top stops it.
    expect(ray(hills, [5, 3, 5], [0, -1, 0], 50)).toBe(3);
    expect(ray(world(), [12, 5, 30], [1, 0, 0], 100)).toBe(100);
  });
});

describe('a runner on the relief', () => {
  it('walks up and down the slope on the ground, never in the air', () => {
    const s = new Sim(spawn(0, hills, 0), hills);
    s.p.z = 30;
    for (const [yaw, ticks] of [
      [EAST, 240],
      [WEST, 200],
    ]) {
      for (let n = 0; n < ticks; n++) {
        s.step(KEY.FORWARD | KEY.SPRINT, yaw);
        expect(s.p.mode).toBe(MODE.GROUND);
        expect(s.p.y).toBeCloseTo(ground(hills, s.p.x, s.p.z), 4);
      }
    }
    expect(s.p.x).toBeLessThan(40);
    expect(s.ev).toBe(0);
  });

  it('stands on the ground wherever he is put, never in it', () => {
    const p = { ...spawn(0, hills, 0), x: 60, y: 3, z: 30 };
    move(p, { seq: 0, keys: 0, yaw: 0, pitch: 0 }, hills);
    expect(p.y).toBe(20);
  });

  it('stops at the bound', () => {
    const s = new Sim(spawn(0, hills, 0), hills);
    s.p.z = 30;
    for (let n = 0; n < 900; n++) {
      s.step(KEY.FORWARD | KEY.SPRINT, EAST);
    }
    const k = (s.p.x / 100) ** 2 + (s.p.z / 60) ** 2;
    expect(k).toBeGreaterThan(0.999);
    expect(k).toBeLessThan(1.001);
  });
});
