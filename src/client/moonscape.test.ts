import { describe, expect, it } from 'vitest';
import { reach } from '../../test/relief';
import { LAYOUT, MOON } from '../shared/moon';
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
/** The relief as drawn: the stone triangles that face up, outside the arena. */
const land: number[][][] = [];
for (let i = 0; i < verts.length; i += 3) {
  const t = verts.slice(i, i + 3);
  if (t.every(p => p[8] === TEX.STONE && p[4] > 0 && !inArena(p))) {
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
    const pits = verts.filter(p => p[8] === TEX.STONE && inArena(p));
    expect(pits.length).toBe(60 * 4 * 12 * 6);
    expect(pits.every(p => p[1] > 0.01 && p[1] <= 0.24 && p[6] === p[0] && p[7] === p[2])).toBe(
      true,
    );
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
    // Drawn whole in every pass, with no culling: the lattice inside the bound is most of it.
    expect(verts.length).toBeGreaterThan(150000);
    expect(verts.length).toBeLessThan(240000);
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
      const hull = verts.filter(
        p => Math.abs(p[2] - z) < 2.1 && p[0] > 32.9 && p[0] < 47.1 && p[1] > 1,
      );
      expect(Math.max(...hull.map(p => p[1]))).toBeGreaterThan(3);
    }
  });

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
    // Every square inside the bound and outside the arena is there, as its two triangles.
    let squares = 0;
    for (let x = x0; x < x0 + (nx - 1) * cell; x += cell) {
      for (let z = z0; z < z0 + (relief.nz - 1) * cell; z += cell) {
        const corners = [0, 1, 2, 3].map(k => [x + (k & 1) * cell, z + (k >> 1) * cell]);
        if (
          corners.every(c => reach(relief, c[0], c[1]) <= 1) &&
          !(x >= 0 && x < 160 && z >= 0 && z < 280)
        ) {
          squares++;
          expect(drawn.has(`${3 * x + 2 * cell},${3 * z + cell}`), `${x}, ${z}`).toBe(true);
          expect(drawn.has(`${3 * x + cell},${3 * z + 2 * cell}`), `${x}, ${z}`).toBe(true);
        }
      }
    }
    expect(squares).toBeGreaterThan(17000);
    expect(drawn.size).toBeGreaterThanOrEqual(2 * squares);
  });

  it('leaves the arena to its brushes and closes the relief with no open edge but round it and at the far side of the wall', () => {
    expect(land.some(t => t.some(inArena))).toBe(false);
    const edges = new Map<string, number>();
    for (const t of land) {
      for (let k = 0; k < 3; k++) {
        const [a, b] = [t[k], t[(k + 1) % 3]].map(p => `${p[0]},${p[2]},${p[1]}`).sort();
        edges.set(`${a}|${b}`, (edges.get(`${a}|${b}`) ?? 0) + 1);
      }
    }
    let [rim, hole] = [0, 0];
    for (const [key, n] of edges) {
      expect(n, key).toBeLessThanOrEqual(2);
      if (n === 1) {
        // A side with one triangle: the arena's edge, or where the wall is down on the plain.
        const ends = key.split('|').map(e => e.split(',').map(Number));
        const out = ends.every(([x, z]) => reach(relief, x, z) >= 1.65);
        const edge = ends.every(
          ([x, z, y]) => y === 0 && x >= 0 && x <= 160 && z >= 0 && z <= 280 && !inArena([x, y, z]),
        );
        expect(out || edge, key).toBe(true);
        rim += out ? 1 : 0;
        hole += edge ? 1 : 0;
      }
    }
    // The arena's 880 m of edge in 4 m steps.
    expect(hole).toBe(220);
    expect(rim).toBeGreaterThan(100);
  });

  it("walls the two ends of the rille under the ground's edge", () => {
    for (const [x, n] of [
      [0, 1],
      [160, -1],
    ]) {
      const wall = verts.filter(p => p[8] === TEX.STONE && p[0] === x && p[3] === n);
      expect(wall).toHaveLength(6);
      expect([...new Set(wall.map(p => `${p[2]},${p[1]}`))].sort()).toEqual(
        ['132,-30', '132,0', '148,-30', '148,0'].sort(),
      );
    }
  });

  it('raises the crater wall past the bound to a crest of 60 to 100 m all round, down on the plain behind it, and nothing as high inside', () => {
    const inside = verts.filter(p => reach(relief, p[0], p[2]) <= 1 && !sky.has(p));
    expect(hi(inside.map(p => p[1]))).toBeLessThan(30);
    expect(lo(land.flat().map(p => p[1]))).toBeGreaterThan(-15);
    const wall = land.flat().filter(p => reach(relief, p[0], p[2]) > 1);
    // Twelve sectors round the middle: a crest in each.
    for (let s = 0; s < 12; s++) {
      const top = hi(
        wall
          .filter(p => Math.floor((Math.atan2(p[2] - 140, p[0] - 80) / Math.PI + 1) * 6) % 12 === s)
          .map(p => p[1]),
      );
      expect(top, `sector ${s}`).toBeGreaterThan(60);
      expect(top).toBeLessThan(100);
    }
    const foot = wall.filter(p => reach(relief, p[0], p[2]) >= 1.65);
    expect(foot.length).toBeGreaterThan(100);
    // Level but for what is left of the hills.
    expect(foot.every(p => Math.abs(p[1]) < 4)).toBe(true);
  });

  it("stands the boulders, the dishes, the ramps' lamps and the wreck on the relief", () => {
    const by = (x: number, z: number, r: number) =>
      verts.filter(p => p[8] !== TEX.STONE && Math.hypot(p[0] - x, p[2] - z) < r);
    for (const [x, z, r] of LAYOUT.rocks) {
      const ys = by(x, z, 1.5 * r).map(p => p[1]);
      expect(ys.length).toBeGreaterThanOrEqual(96);
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
