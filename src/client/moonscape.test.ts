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
const pitted = (p: number[]) =>
  p[8] === TEX.STONE && loose(p) && p[1] > 0.01 && Math.abs(p[2] - 140) > 16;
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
    // The arena's own relief is 16,000 more, the rille's rock and rim 30,000, the boulders 100,000 (512 triangles a big one).
    expect(verts.length).toBeGreaterThan(330000);
    expect(verts.length).toBeLessThan(380000);
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
    // The band of the lips, 8 m behind each, is ravine()'s: its two long sides and its two ends, in 4 m steps.
    expect(lips).toBe(2 * 40 + 2 * 8);
    expect(rim).toBeGreaterThan(100);
  });

  /** The lip's collision edge on red's side at x, from the centre line. */
  const edge = (x: number) => 8 + LIP[Math.min(Math.floor(x), 159)];
  /** The ground drawn behind the lips, both sides: stone, in the band, off the lattice's rows. */
  const rimmed = verts.filter(
    p =>
      p[8] === TEX.STONE &&
      p[0] >= 0 &&
      p[0] <= 160 &&
      Math.abs(p[2] - 140) < 16 &&
      Math.abs(p[2] - 140) > 1.5,
  );

  it('draws the ground to a rim that follows the lip: over every brush edge, never more than a step past it', () => {
    expect(rimmed.length).toBeGreaterThan(2 * 160 * 2);
    let [short, past] = [0, 0];
    for (const side of [1, -1]) {
      for (let x = 0; x <= 160; x++) {
        // The rim at x: the drawn ground's nearest point to the centre line.
        const zs = rimmed
          .filter(p => p[0] === x && side * (p[2] - 140) > 0)
          .map(p => side * (p[2] - 140));
        expect(zs.length, `x ${x}`).toBeGreaterThan(0);
        const rim = Math.min(...zs);
        // Against the brushes each side of this x: the ground is drawn under both edges.
        const [a, b] = [edge(Math.max(x - 1, 0)), edge(x)];
        short = Math.max(short, rim - Math.min(a, b));
        past = Math.max(past, Math.max(a, b) - rim);
      }
    }
    // Never short of a brush's edge (a body never stands on nothing drawn), at most 0.5 m and the
    // rim's 0.12 m of jitter past it; 3 m at the four steps of the closing ends, drawn as steps.
    expect(short).toBeLessThanOrEqual(1e-9);
    expect(past).toBeGreaterThan(0.3);
    expect(past).toBeLessThanOrEqual(3 + 1e-9);
    let slack = 0;
    for (const side of [1, -1]) {
      for (let x = 9; x <= 151; x++) {
        const rim = Math.min(
          ...rimmed
            .filter(p => p[0] === x && side * (p[2] - 140) > 0)
            .map(p => side * (p[2] - 140)),
        );
        slack = Math.max(slack, Math.max(edge(x - 1), edge(x)) - rim);
      }
    }
    expect(slack).toBeLessThanOrEqual(0.62 + 1e-9);
    // It meets the lattice 8 m behind the straight lip at the ground's own height, a mound's crest included.
    for (const p of rimmed) {
      expect(p[1]).toBeCloseTo(Math.max(at(p[0], 140 + Math.max(Math.abs(p[2] - 140), 8)), 0), 9);
      expect([p[6], p[7]]).toEqual([p[0], p[2]]);
    }
    expect(rimmed.some(p => p[1] > 2.9)).toBe(true);
  });

  it('carves the walls under the rim in basalt: an overhang, buttresses, three strata, scree, a dark bottom', () => {
    const rock = verts.filter(
      p =>
        p[8] === TEX.ROCK &&
        p[0] >= 0 &&
        p[0] <= 160 &&
        Math.abs(p[2] - 140) < 16.2 &&
        p[1] < -0.5 &&
        p[1] > -30.5 &&
        Math.abs(p[4]) < 0.999,
    );
    expect(rock.length).toBeGreaterThan(10000);
    // Under the rim the wall is back from it, then out again with depth: more at the bottom than the top.
    const out = (p: number[]) => edge(p[0]) - Math.abs(p[2] - 140);
    const row = (y: number) =>
      rock.filter(p => p[1] === y && p[0] > 9 && p[0] < 151 && p[0] % 1 === 0);
    for (const [y, lo, hi] of [
      [-0.6, -0.9, 0.5],
      [-7, -0.1, 1.7],
      [-22, 1.5, 4.3],
    ]) {
      const d = row(y).map(out);
      expect(d.length, `row ${y}`).toBeGreaterThan(200);
      expect(Math.min(...d)).toBeGreaterThan(lo);
      expect(Math.max(...d)).toBeLessThan(hi);
    }
    // Buttresses: at 14 m down some of it stands a metre further out than the rest.
    const d = row(-14).map(out);
    expect(Math.max(...d) - Math.min(...d)).toBeGreaterThan(0.8);
    // Strata: lighter at the top, a darker band under each ledge.
    const tone = (y0: number, y1: number) => {
      const l = rock.filter(p => p[1] <= y0 && p[1] >= y1).map(p => p[9]);
      return l.reduce((a, v) => a + v, 0) / l.length;
    };
    expect(tone(-0.6, -3)).toBeGreaterThan(tone(-7.4, -14) * 1.4);
    expect(tone(-7.4, -14)).toBeGreaterThan(tone(-22, -30) * 1.4);
    // A bottom 30 m down, dark, with a seam that glows.
    const deep = verts.filter(p => inArena(p) && p[1] < -29);
    expect(deep.some(p => p[8] === -2)).toBe(true);
    expect(deep.filter(p => p[8] === -1).every(p => p[6] + p[7] + p[9] < 0.1)).toBe(true);
  });

  /** The boxes a player can touch with a rock drawn on them: x0, z0, x1, z1, the ground and the top. */
  const boxes = [
    ...[1, -1].flatMap(side =>
      [
        ...LAYOUT.stones.map(([x, z, w, d, h]) => [
          x,
          z,
          x + w,
          z + d,
          at(x + w / 2, z + d / 2),
          at(x + w / 2, z + d / 2) + h,
        ]),
        ...LAYOUT.boulders.map(([x, z, r]) => [
          x - 0.6 * r,
          z - 0.6 * r,
          x + 0.6 * r,
          z + 0.6 * r,
          at(x, z),
          at(x, z) + 0.75 * r,
        ]),
      ].map(([x0, z0, x1, z1, g, top]) =>
        side > 0 ? [x0, z0, x1, z1, g, top] : [x0, 280 - z1, x1, 280 - z0, g, top],
      ),
    ),
    ...LAYOUT.rocks.map(([x, z, r]) => [
      x - 0.6 * r,
      z - 0.6 * r,
      x + 0.6 * r,
      z + 0.6 * r,
      at(x, z),
      at(x, z) + 0.6 * r,
    ]),
    ...LAYOUT.pillars.map(([x0, z0, x1, z1, y]) => [x0, z0, x1, z1, -14, y]),
  ];
  const basalt = verts.filter(p => p[8] === TEX.ROCK && reach(relief, p[0], p[2]) < 1);

  it('cuts each rock a player gets near from 128 or 512 triangles, the ones up the crater wall from far fewer', () => {
    const count = ([x0, z0, x1, z1]: number[]) =>
      basalt.filter(
        p =>
          p[0] > x0 - 0.31 &&
          p[0] < x1 + 0.31 &&
          p[2] > z0 - 0.31 &&
          p[2] < z1 + 0.31 &&
          p[1] > -17,
      ).length / 3;
    // The field's stones, alone on the floor: 512 each (130 before, 70 before that).
    for (const [x, z, w, d] of LAYOUT.stones) {
      expect(count([x, z, x + w, z + d])).toBeGreaterThanOrEqual(480);
    }
    // No box has under 100, and most of the big ones have 512.
    const counts = boxes.map(count);
    expect(Math.min(...counts)).toBeGreaterThanOrEqual(100);
    expect(counts.filter(n => n >= 480).length).toBeGreaterThan(30);
    const far = verts.filter(p => p[8] === TEX.ROCK && reach(relief, p[0], p[2]) > 1.02);
    expect(far.length / 3 / 90).toBeLessThan(70);
    expect(far.length / 3 / 90).toBeGreaterThan(30);
  });

  it('fits every rock to its box: no more than 0.3 m out of a side, never over the top, no corner bare by more than 0.3 m at mid-height', () => {
    // Every point of basalt above the ground, off the rille's walls and the stones on its rim, is by a box.
    const loose = basalt.filter(
      p =>
        p[1] > 0.4 &&
        !(Math.abs(p[2] - 140) < 16.9 && p[0] >= -1 && p[0] <= 161 && p[1] < 3.6) &&
        !boxes.some(
          ([x0, z0, x1, z1, , top]) =>
            p[0] > x0 - 0.3001 &&
            p[0] < x1 + 0.3001 &&
            p[2] > z0 - 0.3001 &&
            p[2] < z1 + 0.3001 &&
            p[1] < top + 1e-6,
        ),
    );
    expect(loose.map(p => p.slice(0, 3))).toEqual([]);
    // The drawn surface, sampled: each triangle's corners, the middles of its sides and its own.
    const surface: number[][] = [];
    for (let i = 0; i < basalt.length; i += 3) {
      const [a, b, c] = [basalt[i], basalt[i + 1], basalt[i + 2]];
      const mix = (...l: number[][]) =>
        [0, 1, 2].map(k => l.reduce((t, p) => t + p[k], 0) / l.length);
      surface.push(a, b, c, mix(a, b), mix(b, c), mix(c, a), mix(a, b, c));
    }
    // Each box's four upright edges and the middles of its sides, over the ground: basalt within 0.3 m (sideways) of each.
    let worst = 0;
    for (const [x0, z0, x1, z1, g, top] of boxes) {
      const band = surface.filter(
        p =>
          p[0] > x0 - 0.5 &&
          p[0] < x1 + 0.5 &&
          p[2] > z0 - 0.5 &&
          p[2] < z1 + 0.5 &&
          p[1] > g &&
          p[1] < g + 0.8 * (top - g),
      );
      for (const [cx, cz] of [
        [x0, z0],
        [x1, z0],
        [x0, z1],
        [x1, z1],
        [(x0 + x1) / 2, z0],
        [(x0 + x1) / 2, z1],
        [x0, (z0 + z1) / 2],
        [x1, (z0 + z1) / 2],
      ]) {
        const near = Math.min(...band.map(p => Math.hypot(p[0] - cx, p[2] - cz)));
        worst = Math.max(worst, near);
        expect(near, `box ${x0}, ${z0}`).toBeLessThan(0.3);
      }
    }
    expect(worst).toBeGreaterThan(0.1);
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

  it('is 378,165 vertices, the four static rovers no longer among them', () => {
    expect(verts.length).toBe(378165);
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
