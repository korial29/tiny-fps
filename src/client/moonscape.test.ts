import { describe, expect, it } from 'vitest';
import { empty, reach } from '../../test/relief';
import { LAYOUT, LIP, MOON } from '../shared/moon';
import { ground } from '../shared/relief';
import { TEX } from '../shared/types';
import { build } from '../shared/world';
import { STRIDE } from './mesh';
import { SKY, moonscape } from './moonscape';
import { FAR } from './render';

const v = moonscape(MOON);
const verts = Array.from({ length: v.length / STRIDE }, (_, i) =>
  v.slice(i * STRIDE, (i + 1) * STRIDE),
);
const C = [80, 0, 140];
const dist = (p: number[], c: number[]) => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]);
/** What glows far from the crater: the stars and the Earth. */
const sky = new Set(verts.filter(p => p[8] === -2 && dist(p, C) > 600));
/** The highest and the lowest of a long list. */
const hi = (l: number[]) => l.reduce((a, v) => Math.max(a, v), -Infinity);
const lo = (l: number[]) => l.reduce((a, v) => Math.min(a, v), Infinity);
const world = build(MOON);
const relief = world.relief!;
const { at } = MOON.relief!;
const inArena = (p: number[]) => p[0] > 0 && p[0] < 160 && p[2] > 0 && p[2] < 280;
/** Off the lattice in the arena: a small crater's vertex, or a spur's top at the rille's end. */
const loose = (p: number[]) =>
  p[0] >= 0 && p[0] <= 160 && p[2] > 0 && p[2] < 280 && (p[0] % 4 !== 0 || p[2] % 4 !== 0);
/** The small craters' vertices: in the floor's stone, off the lattice, over the floor. */
const pitted = (p: number[]) => p[8] === TEX.STONE && loose(p) && p[1] > 0.01;
/** The relief as drawn: the stone triangles that face up, on the lattice or past the bound. */
const land: number[][][] = [];
for (let i = 0; i < verts.length; i += 3) {
  const t = verts.slice(i, i + 3);
  if (t.every(p => p[8] === TEX.STONE && p[4] > 0 && !loose(p))) {
    land.push(t);
  }
}

describe('moonscape', () => {
  it('is whole triangles of finite numbers with unit normals', () => {
    expect(v.length % (3 * STRIDE)).toBe(0);
    expect(v.every(Number.isFinite)).toBe(true);
    expect(verts.every(p => Math.abs(Math.hypot(p[3], p[4], p[5]) - 1) < 1e-3)).toBe(true);
  });

  it("lays 60 small craters in the floor's stone, low, on bare floor only", () => {
    const pits = verts.filter(pitted);
    expect(pits.length).toBe(60 * 4 * 12 * 6);
    expect(pits.every(p => p[1] > 0.01 && p[1] <= 0.24 && p[6] === p[0] && p[7] === p[2])).toBe(
      true,
    );
    // On the level: the relief is flat under each.
    expect(pits.every(p => ground(world, p[0], p[2]) === 0)).toBe(true);
    const standing = MOON.brushes.filter(b => b.max[1] > 0);
    for (const p of pits) {
      expect(
        standing.some(
          b => p[0] > b.min[0] && p[0] < b.max[0] && p[2] > b.min[2] && p[2] < b.max[2],
        ),
      ).toBe(false);
    }
  });

  it('stays within a vertex budget and is the same every time', () => {
    // Drawn whole in every pass, with no culling: the lattice inside the bound is most of it, the
    // faceted boulders about 20,000, the outside of the two bases (moonhull.ts) 17,952.
    // The arena's own relief is 16,000 more, the rille's rock 12,000, the finer boulders 26,000.
    expect(verts.length).toBeGreaterThan(280000);
    expect(verts.length).toBeLessThan(320000);
    expect(moonscape(MOON)).toEqual(v);
  });

  it('puts the stars and the Earth on a dome of 800 m, past everything else drawn', () => {
    expect(sky.size).toBeGreaterThan(3000 * 6);
    const d = [...sky].map(p => dist(p, C));
    expect(lo(d)).toBeGreaterThan(SKY - 5);
    expect(hi(d)).toBeLessThan(SKY + 5);
    expect(lo([...sky].map(p => p[1]))).toBeGreaterThan(-100);
    // The crater wall is drawn to 1.65 of the bound: no star in front of it from inside.
    const rest = verts.filter(p => !sky.has(p)).map(p => dist(p, C));
    expect(hi(rest)).toBeGreaterThan(500);
    expect(hi(rest)).toBeLessThan(SKY - 100);
  });

  it('draws nothing beyond the far plane, from anywhere on the bound', () => {
    // The farthest a camera gets: on the bound, from the lowest ground to a rover's jump off the wall.
    const eyes = Array.from({ length: 144 }, (_, i) => [
      80 + 300 * Math.cos(i),
      i & 1 ? 45 : -15,
      140 + 360 * Math.sin(i),
    ]);
    let far = 0;
    for (const p of verts) {
      for (const e of eyes) {
        far = Math.max(far, (p[0] - e[0]) ** 2 + (p[1] - e[1]) ** 2 + (p[2] - e[2]) ** 2);
      }
    }
    expect(Math.sqrt(far)).toBeLessThan(FAR);
    expect(Math.sqrt(far)).toBeGreaterThan(SKY + 300);
  });

  it('has the Earth in the sky: a bright disc well above the horizon', () => {
    const big = [...sky].filter(p => p[9] > 0.3 && p[6] + p[7] + p[9] > 0.5 && p[7] > 0);
    expect(hi([...sky].map(p => p[1]))).toBeGreaterThan(400);
    expect(big.length).toBeGreaterThan(0);
  });

  it('mirrors red onto blue: the pads and the shuttles at z 220 and 60', () => {
    for (const z of [220, 60]) {
      const pad = verts.filter(
        p => Math.hypot(p[0] - 40, p[2] - z) < 13.1 && p[1] > 0.2 && p[1] < 0.3,
      );
      expect(pad.length).toBeGreaterThan(100);
      // Above the pad's metal brush (top 0.25), not level with it: no z-fighting.
      expect(
        Math.min(...pad.filter(p => Math.hypot(p[0] - 40, p[2] - z) < 12).map(p => p[1])),
      ).toBeGreaterThan(0.26);
      const hull = verts.filter(
        p => Math.abs(p[2] - z) < 2.1 && p[0] > 32.9 && p[0] < 47.1 && p[1] > 1,
      );
      expect(Math.max(...hull.map(p => p[1]))).toBeGreaterThan(3);
    }
  });

  // Every triangle of the terrain against the lattice: seconds on a slow runner.
  it("draws the lattice's own triangles inside the bound, split as ground() splits them", () => {
    const { x0, z0, nx, cell, h } = relief;
    const drawn = new Set<string>();
    for (const t of land.filter(t => t.every(p => reach(relief, p[0], p[2]) <= 1))) {
      for (const p of t) {
        // A node, at its height, with the floor's stone laid in metres.
        const [i, j] = [(p[0] - x0) / cell, (p[2] - z0) / cell];
        expect(i % 1 || j % 1).toBe(0);
        expect(p[1]).toBe(h[i + j * nx]);
        expect([p[6], p[7]]).toEqual([p[0], p[2]]);
      }
      // Its plane is the ground's: at its middle and near each corner.
      for (const w of [
        [1, 1, 1],
        [8, 1, 1],
        [1, 8, 1],
        [1, 1, 8],
      ]) {
        const [x, y, z] = [0, 1, 2].map(
          k => (t[0][k] * w[0] + t[1][k] * w[1] + t[2][k] * w[2]) / (w[0] + w[1] + w[2]),
        );
        expect(Math.abs(y - ground(world, x, z))).toBeLessThan(1e-6);
      }
      drawn.add(`${t[0][0] + t[1][0] + t[2][0]},${t[0][2] + t[1][2] + t[2][2]}`);
    }
    // Every square inside the bound with ground is there, as its two triangles: the arena's too.
    let squares = 0;
    for (let x = x0; x < x0 + (nx - 1) * cell; x += cell) {
      for (let z = z0; z < z0 + (relief.nz - 1) * cell; z += cell) {
        const corners = [0, 1, 2, 3].map(k => [x + (k & 1) * cell, z + (k >> 1) * cell]);
        if (corners.every(c => reach(relief, c[0], c[1]) <= 1) && !empty(relief, x, z)) {
          squares++;
          expect(drawn.has(`${3 * x + 2 * cell},${3 * z + cell}`), `${x}, ${z}`).toBe(true);
          expect(drawn.has(`${3 * x + cell},${3 * z + 2 * cell}`), `${x}, ${z}`).toBe(true);
        }
      }
    }
    expect(squares).toBeGreaterThan(20500);
    expect(drawn.size).toBeGreaterThanOrEqual(2 * squares);
  }, 30_000);

  it('closes the relief with no open edge but along the lips of the rille and at the far side of the wall', () => {
    const edges = new Map<string, number>();
    for (const t of land) {
      for (let k = 0; k < 3; k++) {
        const [a, b] = [t[k], t[(k + 1) % 3]].map(p => `${p[0]},${p[2]},${p[1]}`).sort();
        edges.set(`${a}|${b}`, (edges.get(`${a}|${b}`) ?? 0) + 1);
      }
    }
    let [rim, lips] = [0, 0];
    for (const [key, n] of edges) {
      expect(n, key).toBeLessThanOrEqual(2);
      if (n === 1) {
        // A side with one triangle: a lip of the rille, notches included, or where the wall is down on the plain.
        const ends = key.split('|').map(e => e.split(',').map(Number));
        const out = ends.every(([x, z]) => reach(relief, x, z) >= 1.65);
        const lip = ends.every(
          ([x, z]) =>
            x >= 0 &&
            x <= 160 &&
            Math.abs(z - 140) <= 16 &&
            (Math.abs(z - 140) >= 8 || x === 0 || x === 160),
        );
        expect(out || lip, key).toBe(true);
        rim += out ? 1 : 0;
        lips += lip ? 1 : 0;
      }
    }
    // Both lips, 160 m in 4 m steps, a side for each cell a notch is deeper than the next, and the rille's two ends.
    const deep = [...LIP, 0].map(n => Math.max(n, 0));
    const sides = deep.reduce((a, n, c) => a + Math.abs(n - (deep[c - 1] ?? 0)), 0);
    expect(lips).toBe(2 * (40 + sides) + 8);
    expect(rim).toBeGreaterThan(100);
  });

  it('carves the rille in rock that follows its brushes: within 0.3 m of them above the kill floor, never inside', () => {
    // The basalt by the rille, without the boulders that stand near it.
    const stones = [
      ...LAYOUT.stones.map(([x, z, w, d]) => [x + w / 2, z + d / 2, w + d]),
      ...LAYOUT.boulders.map(([x, z, r]) => [x, z, 2 * r]),
    ];
    const rock = verts.filter(
      p =>
        p[8] === TEX.ROCK &&
        p[0] > -1 &&
        p[0] < 161 &&
        Math.abs(p[2] - 140) < 17 &&
        p[1] <= 3 &&
        !stones.some(
          ([x, z, r]) => Math.hypot(p[0] - x, Math.abs(p[2] - 140) - Math.abs(z - 140)) < r,
        ),
    );
    const solid = MOON.brushes.filter(b => b.ghost && b.min[1] <= -30);
    /** How far (x, z) is from the rock the brushes make at depth y: under 0 inside it. */
    const gap = (x: number, y: number, z: number) =>
      Math.min(
        ...solid
          .filter(b => b.max[1] >= y)
          .map(b => {
            const [dx, dz] = [
              Math.max(b.min[0] - x, x - b.max[0]),
              Math.max(b.min[2] - z, z - b.max[2]),
            ];
            return dx <= 0 && dz <= 0
              ? Math.max(dx, dz)
              : Math.hypot(Math.max(dx, 0), Math.max(dz, 0));
          }),
      );
    const walls = rock.filter(p => p[1] <= 0 && p[1] >= -20 && Math.abs(p[4]) < 0.9);
    expect(walls.length).toBeGreaterThan(8000);
    let rough = 0;
    for (const p of walls) {
      const d = gap(p[0], p[1], p[2]);
      expect(d, `${p.slice(0, 3)}`).toBeGreaterThan(-1e-6);
      expect(d).toBeLessThan(0.3 + 1e-6);
      rough += d > 0.05 ? 1 : 0;
    }
    // Not flat faces: most of the points below the lip stand out of the brush.
    expect(rough / walls.length).toBeGreaterThan(0.3);
    // The top row is the ground's edge: on the lip, at the ground's height, a mound's crest included.
    const top = rock.filter(p => Math.abs(p[4]) < 0.9 && p[1] > 0.5);
    expect(top.length).toBeGreaterThan(20);
    for (const p of top) {
      expect(Math.abs(Math.abs(p[2] - 140) - 8)).toBe(0);
      expect(p[1]).toBeCloseTo(at(p[0], p[2]), 9);
    }
    // And it is not a ruled line: the walls stand at six distances from the centre line.
    expect(
      new Set(walls.filter(p => p[1] === 0).map(p => Math.abs(p[2] - 140))).size,
    ).toBeGreaterThan(5);
    // A bottom 30 m down, dark, with a seam that glows.
    const deep = verts.filter(p => inArena(p) && p[1] < -29);
    expect(deep.some(p => p[8] === -2)).toBe(true);
    expect(deep.filter(p => p[8] === -1).every(p => p[6] + p[7] + p[9] < 0.1)).toBe(true);
  });

  it('cuts the rocks a player gets near in more facets than the ones up the crater wall', () => {
    const count = (x: number, z: number, r: number) =>
      verts.filter(p => p[8] === TEX.ROCK && Math.hypot(p[0] - x, p[2] - z) < r).length / 3;
    // About 70 triangles a rock before; near 130 now for the ones in the arena and the boulder field.
    for (const [x, z, w, d] of LAYOUT.stones) {
      expect(count(x + w / 2, z + d / 2, 0.4 * Math.min(w, d))).toBeGreaterThan(0);
    }
    const near = verts.filter(
      p => p[8] === TEX.ROCK && reach(relief, p[0], p[2]) < 1 && p[1] > -20,
    );
    const far = verts.filter(p => p[8] === TEX.ROCK && reach(relief, p[0], p[2]) > 1.02);
    const rocks = 2 * (LAYOUT.stones.length + LAYOUT.boulders.length) + LAYOUT.rocks.length;
    const walls = verts.filter(
      p =>
        p[8] === TEX.ROCK &&
        Math.abs(p[2] - 140) < 17 &&
        inArena(p) &&
        Math.abs(p[4]) < 0.9 &&
        p[1] <= 3,
    ).length;
    expect((near.length - walls) / 3 / rocks).toBeGreaterThan(95);
    expect(far.length / 3 / 90).toBeLessThan(70);
    console.log('near', (near.length - walls) / 3 / rocks, 'far', far.length / 3 / 90);
    expect(far.length / 3 / 90).toBeGreaterThan(30);
  });

  it("stands the boulders, the dishes, the ramps' lamps and the wreck on the relief", () => {
    const by = (x: number, z: number, r: number) =>
      verts.filter(p => p[8] !== TEX.STONE && Math.hypot(p[0] - x, p[2] - z) < r);
    for (const [x, z, r] of LAYOUT.rocks) {
      const ys = by(x, z, 1.5 * r).map(p => p[1]);
      // A faceted block: twenty triangles and more.
      expect(ys.length).toBeGreaterThanOrEqual(60);
      expect(Math.min(...ys)).toBeLessThan(at(x, z));
      expect(Math.max(...ys)).toBeGreaterThan(at(x, z) + 0.4 * r);
    }
    const lamp = (x: number, z: number, up: number) =>
      by(x, z, 0.6).filter(p => p[8] === -2 && Math.abs(p[1] - at(x, z) - up) < 0.6).length;
    for (const [x, z] of LAYOUT.dishes) {
      expect(lamp(x, z, 6.4)).toBeGreaterThan(0);
      expect(by(x, z, 3.5).filter(p => p[8] === -1).length).toBeGreaterThan(100);
    }
    for (const [x, z, ax, az] of LAYOUT.ramps) {
      expect(lamp(x + 8 * az, z - 8 * ax, 2.6)).toBeGreaterThan(0);
      expect(lamp(x - 8 * az, z + 8 * ax, 2.6)).toBeGreaterThan(0);
    }
    const [x, z] = LAYOUT.wreck;
    const hull = by(x, z, 9);
    expect(hull.length).toBeGreaterThan(200);
    expect(Math.max(...hull.map(p => p[1]))).toBeGreaterThan(at(x, z) + 3);
    expect(Math.max(...hull.map(p => p[1]))).toBeLessThan(at(x, z) + 8);
  });

  it('puts the masts on the map layout: lamps 10 m up, pad masts on the pad', () => {
    for (const [x, z] of LAYOUT.masts) {
      const y0 = x < 60 ? 0.25 : 0;
      const lamp = verts.filter(
        p => p[8] === -2 && Math.hypot(p[0] - x, p[2] - z) < 0.6 && p[1] > y0 + 9.5,
      );
      expect(lamp.length).toBeGreaterThan(0);
    }
  });
});

describe('moonscape and the rovers', () => {
  /** What is drawn in the arena that is not its stone floor's craters, the relief or the sky. */
  const things = verts.filter(p => p[8] !== TEX.STONE && inArena(p));

  it('draws no rover: where the map parks them the ground is bare, the renderer draws them there', () => {
    expect(MOON.rovers).toHaveLength(4);
    for (const [x, , z] of MOON.rovers!) {
      expect(things.filter(p => Math.hypot(p[0] - x, p[2] - z) < 2.5 && p[1] < 3)).toHaveLength(0);
    }
    // A sanity check of the probe: the same one finds the masts.
    const [mx, mz] = LAYOUT.masts[0];
    expect(things.some(p => Math.hypot(p[0] - mx, p[2] - mz) < 2.5 && p[1] < 3)).toBe(true);
  });

  it('is 307,341 vertices, the four static rovers no longer among them', () => {
    expect(verts.length).toBe(307341);
  });

  it("keeps the small craters 6 m clear of the map's own rover spawns, wherever they are", () => {
    const pits = verts.filter(pitted);
    const near = (list: number[][], x: number, z: number) =>
      list.filter(p => Math.hypot(p[0] - x, p[2] - z) < 2).length;
    for (const [x, , z] of MOON.rovers!) {
      expect(near(pits, x, z)).toBe(0);
    }
    // Park one on a crater of today's map: the crater goes, and there are still 60.
    const [x, , z] = pits[0];
    expect(near(pits, x, z)).toBeGreaterThan(0);
    const moved = moonscape({ ...MOON, rovers: [[x, 0, z, 0]] });
    const again: number[][] = [];
    for (let i = 0; i < moved.length; i += STRIDE) {
      const p = moved.slice(i, i + STRIDE);
      if (pitted(p)) {
        again.push(p);
      }
    }
    expect(near(again, x, z)).toBe(0);
    expect(again.length).toBe(pits.length);
    // And none is kept away from where no rover is parked any more.
    expect(moonscape({ ...MOON, rovers: undefined }).length).toBe(v.length);
  });
});
