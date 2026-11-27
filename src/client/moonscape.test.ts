import { describe, expect, it } from 'vitest';
import { empty, reach } from '../../test/relief';
import { STEP_H } from '../shared/constants';
import { LAYOUT, MOON, PYLONS, rockMid, rockOf } from '../shared/moon';
import { NX, NZ, S, gap, mask } from '../shared/moon/rift';
import { ground } from '../shared/relief';
import { TEX } from '../shared/types';
import { build } from '../shared/world';
import { STRIDE } from './mesh';
import { PEBBLES, RANGES, RANGE_COLS, SKY, heavens, moonscape, strewn } from './moonscape';
import { rifted } from './moonscape/rift';
import { FAR } from './render';

// The scenery as render.ts draws it: the stars and the Earth last.
const v = moonscape(MOON).concat(heavens());
const verts = Array.from({ length: v.length / STRIDE }, (_, i) =>
  v.slice(i * STRIDE, (i + 1) * STRIDE),
);
const C = [80, 0, 140];
const dist = (p: number[], c: number[]) => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]);
/** The ranges on the horizon: what glows with a level normal. */
const far = verts.filter(p => p[8] === -2 && p[4] === 0 && dist(p, C) > 550);
const ranges = new Set(far);
/** What else glows far from the crater: the stars and the Earth. */
const sky = new Set(verts.filter(p => p[8] === -2 && dist(p, C) > 600 && !ranges.has(p)));
/** The highest and the lowest of a long list. */
const hi = (l: number[]) => l.reduce((a, v) => Math.max(a, v), -Infinity);
const lo = (l: number[]) => l.reduce((a, v) => Math.min(a, v), Infinity);
const world = build(MOON);
const relief = world.relief!;
const { at } = MOON.relief!;
const inArena = (p: number[]) => p[0] > 0 && p[0] < 160 && p[2] > 0 && p[2] < 280;
/** Metres from the arena, 0 in it. */
const off = (p: number[]) =>
  Math.hypot(Math.max(-p[0], 0, p[0] - 160), Math.max(-p[2], 0, p[2] - 280));
/** Off the lattice in the arena: a small crater's vertex, or a spur's top at the rille's end. */
const loose = (p: number[]) =>
  p[0] >= 0 && p[0] <= 160 && p[2] > 0 && p[2] < 280 && (p[0] % 4 !== 0 || p[2] % 4 !== 0);
/** The lattice's height at (x, z), voids or none: what ground() reads off them. */
const lattice = (x: number, z: number) => {
  const r = relief;
  const [u, v] = [(x - r.x0) / r.cell, (z - r.z0) / r.cell];
  const [i, j] = [Math.floor(u), Math.floor(v)];
  const [fu, fv] = [u - i, v - j];
  const n = i + j * r.nx;
  const [a, b, c, d] = [r.h[n], r.h[n + 1], r.h[n + r.nx], r.h[n + r.nx + 1]];
  return fu >= fv ? a + (b - a) * fu + (d - b) * fv : a + (c - a) * fv + (d - c) * fu;
};
/** On a lattice square the rift draws, its sides included. */
const inRift = (p: number[]) =>
  [-0.01, 0.01].some(a =>
    [-0.01, 0.01].some(b => rifted(4 * Math.floor((p[0] + a) / 4), 4 * Math.floor((p[2] + b) / 4))),
  );
/** The small craters' vertices: in the floor's stone, off the lattice, over the floor, off the rift. */
const pitted = (p: number[]) =>
  p[8] === TEX.STONE && loose(p) && p[1] > 0.01 && Math.abs(p[2] - 140) > 16 && !inRift(p);
/** The relief as drawn: the stone triangles that face up, on the lattice or past the bound (the rims' bands of detail are off whole metres). */
const land: number[][][] = [];
for (let i = 0; i < verts.length; i += 3) {
  const t = verts.slice(i, i + 3);
  // (Not the rift's own, merged over a level square: its middle is on a square the rift draws.)
  const [cx, cz] = [0, 2].map(k => (t[0][k] + t[1][k] + t[2][k]) / 3);
  if (
    t.every(p => p[8] === TEX.STONE && p[4] > 0 && !loose(p) && p[0] % 1 === 0 && p[2] % 1 === 0) &&
    !rifted(4 * Math.floor(cx / 4), 4 * Math.floor(cz / 4))
  ) {
    land.push(t);
  }
}

describe('moonscape', () => {
  it('is whole triangles of finite numbers with unit normals', () => {
    expect(v.length % (3 * STRIDE)).toBe(0);
    expect(v.every(Number.isFinite)).toBe(true);
    expect(verts.every(p => Math.abs(Math.hypot(p[3], p[4], p[5]) - 1) < 1e-3)).toBe(true);
  });

  it("lays 72 small craters in the floor's stone, low, on bare floor only", () => {
    const pits = verts.filter(pitted);
    expect(pits.length).toBe(72 * 4 * 12 * 6);
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
    // The craters' stones and twelve small craters more are 12,600: then the rims' bands of detail 33,000 and the pits 10,000 (gone since): the cap went from 380,000 to 440,000.
    // The ranges on the horizon are 28,800: the cap went to 470,000. The rocks were 117,000; the pebbles are 98,000 and the sixteen boulders 22,000.
    expect(verts.length).toBeLessThan(470000);
    expect(moonscape(MOON).concat(heavens())).toEqual(v);
  });

  it('puts the Earth 800 m off, past everything else drawn (the stars are the sky shader’s)', () => {
    // 28 rings of 64 cells, the middle one a fan of triangles.
    expect(sky.size).toBe(27 * 64 * 6 + 64 * 3);
    const d = [...sky].map(p => dist(p, C));
    expect(lo(d)).toBeGreaterThan(SKY - 5);
    expect(hi(d)).toBeLessThan(SKY + 5);
    // The crater wall is drawn to 1.65 of the bound: no star in front of it from inside.
    const rest = verts.filter(p => !sky.has(p) && !ranges.has(p)).map(p => dist(p, C));
    expect(hi(rest)).toBeGreaterThan(500);
    expect(hi(rest)).toBeLessThan(SKY - 100);
    // Nor in front of a range.
    expect(hi(far.map(p => dist(p, C)))).toBeLessThan(SKY - 15);
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

  it('mirrors red onto blue: the pads at z 220 and 60, with no ship drawn in the scenery (craft.ts draws it)', () => {
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
        p => Math.abs(p[2] - z) < 2.1 && p[0] > 32.9 && p[0] < 47.1 && p[1] > 1 && p[1] < 20,
      );
      expect(hull).toEqual([]);
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
        expect(i % 1 || j % 1, `${p.slice(0, 3)}`).toBe(0);
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
        if (
          corners.every(c => reach(relief, c[0], c[1]) <= 1) &&
          !empty(relief, x, z) &&
          !rifted(x, z)
        ) {
          squares++;
          expect(drawn.has(`${3 * x + 2 * cell},${3 * z + cell}`), `${x}, ${z}`).toBe(true);
          expect(drawn.has(`${3 * x + cell},${3 * z + 2 * cell}`), `${x}, ${z}`).toBe(true);
        }
      }
    }
    // (Less the rift's squares, which it draws itself.)
    expect(squares).toBeGreaterThan(20000);
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
        // A side with one triangle: the edge of the rift's squares (the rift draws them), or where the wall is down on the plain.
        const ends = key.split('|').map(e => e.split(',').map(Number));
        const out = ends.every(([x, z]) => reach(relief, x, z) >= 1.65);
        const lip = ends.every(
          ([x, z]) =>
            x >= 0 && x <= 160 && Math.abs(z - 140) <= NZ * S && x % 4 === 0 && z % 4 === 0,
        );
        expect(out || lip, key).toBe(true);
        rim += out ? 1 : 0;
        lips += lip ? 1 : 0;
      }
    }
    expect(lips).toBeGreaterThan(2 * 40);
    expect(rim).toBeGreaterThan(100);
  });

  /** The rift's ground: stone facing up, on its squares, off the lattice's own nodes. */
  const riftGround: number[][][] = [];
  for (let k = 0; k < verts.length; k += 3) {
    const t = [verts[k], verts[k + 1], verts[k + 2]];
    if (
      t.every(p => p[8] === TEX.STONE && p[4] > 0.3 && inRift(p) && Math.abs(p[2] - 140) <= NZ * S)
    ) {
      riftGround.push(t);
    }
  }
  /** Whether a triangle covers (x, z), and its height there. */
  const over = (t: number[][], x: number, z: number) => {
    const [a, b, c] = t;
    const d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
    const u = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / d;
    const v = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / d;
    return u >= -1e-9 && v >= -1e-9 && u + v <= 1 + 1e-9
      ? u * a[1] + v * b[1] + (1 - u - v) * c[1]
      : NaN;
  };
  /** The rift's triangles by the cells their boxes touch. */
  const byCell = new Map<number, number[][][]>();
  for (const t of riftGround) {
    const [x0, x1] = [Math.min(...t.map(p => p[0])), Math.max(...t.map(p => p[0]))];
    const [z0, z1] = [Math.min(...t.map(p => p[2])), Math.max(...t.map(p => p[2]))];
    for (let i = Math.floor(x0 / S); i <= Math.floor(x1 / S); i++) {
      for (let j = Math.floor(z0 / S); j <= Math.floor(z1 / S); j++) {
        const k = i * 4096 + j;
        byCell.set(k, [...(byCell.get(k) ?? []), t]);
      }
    }
  }
  const cover = (x: number, z: number) =>
    (byCell.get(Math.floor(x / S) * 4096 + Math.floor(z / S)) ?? [])
      .map(t => over(t, x, z))
      .filter(Number.isFinite);

  it("draws the rift's ground over every brush it has and over no open cell but a chamfer's corner, at the ground's own height", () => {
    expect(riftGround.length).toBeGreaterThan(1000);
    let [closed, open] = [0, 0];
    for (let j = 0; j < NZ; j++) {
      for (let i = 0; i < NX; i++) {
        const corners = Math.max(...[0, 1, 2, 3].map(k => ((mask(i, j) >> k) & 1) * 1));
        if (!gap(i, j) && !corners) {
          continue;
        }
        for (const side of [1, -1]) {
          // Off the cell's middle by a quarter: inside a chamfer's triangle if any.
          for (const [a, b] of [
            [0.25, 0.25],
            [0.75, 0.75],
            [0.25, 0.75],
            [0.75, 0.25],
          ]) {
            const [x, z] = [(i + a) * S, 140 + side * (j + b) * S];
            const h = cover(x, z);
            if (!gap(i, j)) {
              closed++;
              expect(h.length, `${x}, ${z}`).toBeGreaterThan(0);
              expect(Math.abs(h[0] - Math.max(ground(world, x, z), 0)), `${x}, ${z}`).toBeLessThan(
                0.05,
              );
            } else if ((mask(i, j) & 15) === 15) {
              open++;
              expect(h, `${x}, ${z}`).toEqual([]);
            }
          }
        }
      }
    }
    expect(closed).toBeGreaterThan(4000);
    expect(open).toBeGreaterThan(20000);
  }, 60_000);

  it("drops basalt walls from the rift's edges to a dark bottom, darker with depth; a pillar under each pylon", () => {
    const rock = verts.filter(
      p =>
        p[8] === TEX.ROCK &&
        p[0] >= 0 &&
        p[0] <= 160 &&
        Math.abs(p[2] - 140) < NZ * S &&
        p[1] < -0.5 &&
        Math.abs(p[4]) < 0.999,
    );
    expect(rock.length).toBeGreaterThan(10000);
    // Out to the long cracks' ends, 60 m from the line and more, both sides.
    for (const side of [1, -1]) {
      expect(rock.some(p => side * (p[2] - 140) > 60 && p[1] === -30)).toBe(true);
    }
    const tone = (y0: number, y1: number) => {
      const l = rock.filter(p => p[1] <= y0 && p[1] >= y1).map(p => p[9]);
      return l.reduce((a, v) => a + v, 0) / l.length;
    };
    expect(tone(-3, -5)).toBeGreaterThan(tone(-29, -30.5) * 1.5);
    // A pillar under each pylon, both sides: basalt round its top.
    for (const [x, z, h, y] of PYLONS) {
      for (const zc of [140 + z, 140 - z]) {
        expect(
          verts.some(
            p =>
              p[8] === TEX.ROCK &&
              Math.abs(p[0] - x) < h + 0.3 &&
              Math.abs(p[2] - zc) < h + 0.3 &&
              Math.abs(p[1] - y) < 0.3,
          ),
          `pylon at ${x}, ${zc}`,
        ).toBe(true);
      }
    }
    // A bottom 30 m down, dark, with a seam that glows.
    const deep = verts.filter(p => inArena(p) && p[1] < -29);
    expect(deep.some(p => p[8] === -2)).toBe(true);
    expect(deep.filter(p => p[8] === -1).every(p => p[6] + p[7] + p[9] < 0.2)).toBe(true);
  });

  const basalt = verts.filter(p => p[8] === TEX.ROCK && reach(relief, p[0], p[2]) < 1);
  /** The pebbles, both sides, and the basalt's triangles. */
  const stones = strewn(MOON);
  const chips: number[][][] = [];
  for (let k = 0; k < verts.length; k += 3) {
    if (verts[k][8] === TEX.ROCK) {
      chips.push([verts[k], verts[k + 1], verts[k + 2]]);
    }
  }

  /** Red's rocks and their mirrors: where each is, its radius and height. */
  const rocks = LAYOUT.crags.flatMap(c => [c, { ...c, at: [c.at[0], c.at[1], 280 - c.at[2]] }]);
  /** The triangles of a rock: each point on its form. */
  const mesh = ({ at: [x, g, z], R, H, s }: (typeof rocks)[0]) => {
    const { reach: form } = rockOf(s, R, H);
    const mid = [x, g + rockMid(H), z];
    return chips
      .filter(
        t =>
          Math.hypot(t[0][0] - x, t[0][2] - z) < 1.5 * R &&
          t.every(q => {
            const v = [q[0] - mid[0], q[1] - mid[1], q[2] - mid[2]];
            const l = Math.hypot(...v);
            return Math.abs(l - form(v.map(u => u / l) as [number, number, number])) < 1e-3;
          }),
      )
      .flat();
  };
  /** The basalt drawn within a rock's radius of its middle, over its foot. */
  const of = ({ at: [x, g, z], R }: (typeof rocks)[0]) =>
    basalt.filter(p => Math.hypot(p[0] - x, p[2] - z) < 1.35 * R && p[1] > g - 0.5);

  it('draws each rock a player gets near from 180, 320 or 720 triangles less what is under the ground, the ones up the crater wall from far fewer', () => {
    for (const c of rocks) {
      const n = of(c).length / 3;
      expect(n, `rock at ${c.at}`).toBeGreaterThanOrEqual(c.R < 1.5 ? 70 : c.R < 2.5 ? 130 : 300);
    }
    expect(rocks.filter(c => c.R >= 2.5).length).toBeGreaterThanOrEqual(8);
  });

  it('draws a rock smooth and round: one normal a point, turning little from a triangle to the next, no sliver, no flat face, no box', () => {
    for (const c of rocks.filter((r, k) => r.R >= 1.5 && k % 2 === 0)) {
      const g = c.at[1];
      const own = mesh(c);
      expect(own.length / 3, `rock at ${c.at}`).toBeGreaterThanOrEqual(c.R < 2.5 ? 130 : 300);
      // Smooth: a point has one normal, whichever triangle it is in.
      const normals = new Map<string, string>();
      for (const p of own) {
        const key = p
          .slice(0, 3)
          .map(v => v.toFixed(4))
          .join();
        const n = p
          .slice(3, 6)
          .map(v => v.toFixed(4))
          .join();
        expect(normals.get(key) ?? n).toBe(n);
        normals.set(key, n);
      }
      let [slivers, turned, area] = [0, 0, 0];
      const faces: { n: number[]; a: number }[] = [];
      for (let k = 0; k < own.length; k += 3) {
        const [a, b, d] = [own[k], own[k + 1], own[k + 2]];
        const e = [
          [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
          [d[0] - b[0], d[1] - b[1], d[2] - b[2]],
          [a[0] - d[0], a[1] - d[1], a[2] - d[2]],
        ].map(v => Math.hypot(...v));
        // No sliver: the longest side under three times the shortest.
        slivers += Math.max(...e) > 3 * Math.min(...e) ? 1 : 0;
        // The three normals of a triangle within 40 degrees of each other: no crease.
        const dot = (u: number[], v: number[]) => u[3] * v[3] + u[4] * v[4] + u[5] * v[5];
        turned +=
          Math.min(dot(a, b), dot(b, d), dot(d, a)) < Math.cos((40 * Math.PI) / 180) ? 1 : 0;
        const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
        const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        const l = Math.hypot(...n);
        faces.push({ n: n.map(q => q / l), a: l / 2 });
        area += l / 2;
      }
      expect(slivers / (own.length / 3), `rock at ${c.at}`).toBeLessThan(0.1);
      expect(turned / (own.length / 3), `rock at ${c.at}`).toBeLessThan(0.1);
      // No flat face: no direction that a fifth of its surface faces within 8 degrees.
      for (const f of faces.filter((_, k) => k % 7 === 0)) {
        const share =
          faces
            .filter(
              q =>
                q.n[0] * f.n[0] + q.n[1] * f.n[1] + q.n[2] * f.n[2] > Math.cos((8 * Math.PI) / 180),
            )
            .reduce((t, q) => t + q.a, 0) / area;
        expect(share, `rock at ${c.at}`).toBeLessThan(0.2);
      }
      // Not level on top: under a third of it is within 0.15 m of the highest point.
      const top = hi(own.map(p => p[1]));
      expect(top - g).toBeGreaterThan(0.9 * c.H);
      expect(own.filter(p => p[1] > top - 0.15).length / own.length).toBeLessThan(0.33);
      // Darker at the foot.
      const tone = (l: number[][]) => l.reduce((t, p) => t + p[9], 0) / l.length;
      expect(tone(own.filter(p => p[1] < g + 0.1 * c.H))).toBeLessThan(
        0.85 * tone(own.filter(p => p[1] > g + 0.5 * c.H)),
      );
    }
  });

  it('draws what stops a body: no box of a rock over 0.15 m out of its drawn triangles at body height', () => {
    // The mesh is inside the form by what its flat triangles cut off: the boxes are 7 cm out of the form at most.
    for (const c of rocks.filter((r, k) => r.R >= 1.5 && k % 2 === 0)) {
      const [x, g, z] = c.at;
      const drawnOf = mesh(c);
      // How far the drawn rock goes from its axis on 24 bearings at three heights: its furthest point within 0.2 m of the height and 8 degrees of the bearing.
      for (let i = 0; i < 24; i++) {
        const [dx, dz] = [Math.cos((i * Math.PI) / 12), Math.sin((i * Math.PI) / 12)];
        for (const up of [0.4, 1, 1.6].filter(u => u < 0.6 * c.H)) {
          const near = drawnOf.filter(p => {
            const [ux, uz] = [p[0] - x, p[2] - z];
            const d = Math.hypot(ux, uz);
            return Math.abs(p[1] - g - up) < 0.25 && d > 0 && (ux * dx + uz * dz) / d > 0.99;
          });
          if (!near.length) {
            continue;
          }
          const drawn = hi(near.map(p => Math.hypot(p[0] - x, p[2] - z)));
          const boxes = hi(
            c.parts
              .filter(q => g + up > q[1] && g + up < q[4])
              .map(q => {
                let [t0, t1] = [0, 1e9];
                for (const [o, d, a, b] of [
                  [x, dx, q[0], q[3]],
                  [c.at[2], dz, q[2], q[5]],
                ]) {
                  const [u, v] = [(a - o) / d, (b - o) / d];
                  [t0, t1] = [Math.max(t0, Math.min(u, v)), Math.min(t1, Math.max(u, v))];
                }
                return t1 >= t0 ? t1 : 0;
              }),
          );
          expect(boxes - drawn, `rock at ${c.at}, bearing ${i}, ${up} m up`).toBeLessThan(0.15);
        }
      }
    }
  });

  it('draws no other rock: nothing of basalt stands over half a metre on the floor but the sixteen boulders, the stepping stones and the pylons, and nothing up the wall', () => {
    const tall = basalt.filter(
      p =>
        p[1] > ground(world, p[0], p[2]) + STEP_H &&
        Math.abs(p[2] - 140) > 17 &&
        !rocks.some(c => Math.hypot(p[0] - c.at[0], p[2] - c.at[2]) < 1.4 * c.R) &&
        // Nor the rift's walls, under its ground, nor a pylon's head.
        !(inRift(p) && p[1] < Math.max(lattice(p[0], p[2]), 0) + 0.01) &&
        !PYLONS.some(
          ([x, z, h]) =>
            Math.abs(p[0] - x) < h + 0.3 && Math.abs(Math.abs(p[2] - 140) - z) < h + 0.3,
        ),
    );
    expect(tall).toEqual([]);
    expect(rocks).toHaveLength(16);
    expect(verts.filter(p => p[8] === TEX.ROCK && reach(relief, p[0], p[2]) > 1.02)).toEqual([]);
  });

  it('draws each pebble as a smooth cap of 6, 15 or 45 triangles on the ground: its size across, darker than the regolith, darker still at its foot', () => {
    expect(stones.length).toBeGreaterThan(2400);
    // By where it is: the triangles whose three points are within its width of it.
    const grid = new Map<string, number[][][]>();
    for (const t of chips) {
      const k = `${Math.floor(t[0][0])},${Math.floor(t[0][2])}`;
      grid.set(k, [...(grid.get(k) ?? []), t]);
    }
    const seen = [0, 0, 0];
    for (const [x, y, z, size] of stones.filter((_, k) => k % 3 === 0)) {
      const wide = PEBBLES[size] * 1.12;
      const near: number[][][] = [];
      for (const u of [-1, 0, 1]) {
        for (const v of [-1, 0, 1]) {
          near.push(...(grid.get(`${Math.floor(x) + u},${Math.floor(z) + v}`) ?? []));
        }
      }
      const own = near.filter(t =>
        t.every(p => Math.hypot(p[0] - x, p[2] - z) < 0.6 * wide + 1e-6),
      );
      // Alone there, or with a smaller one on it: its own triangles at least.
      expect(own.length, `pebble at ${x}, ${z}`).toBeGreaterThanOrEqual([6, 15, 45][size]);
      if (own.length !== [6, 15, 45][size]) {
        continue;
      }
      seen[size]++;
      const ys = own.flat().map(p => p[1]);
      // Half sunk: its rim under the ground, its top over it, by less than its width and less than a step.
      expect(lo(ys)).toBeLessThan(y - 0.005);
      expect(hi(ys)).toBeGreaterThan(y + 0.25 * PEBBLES[size]);
      expect(hi(ys)).toBeLessThan(y + Math.min(0.8 * wide, STEP_H));
      const across = hi(own.flat().map(p => Math.hypot(p[0] - x, p[2] - z)));
      expect(2 * across).toBeGreaterThan(0.6 * PEBBLES[size]);
      // Smooth: a point has one normal. Darker than the ground (1), darkest at the foot.
      const normals = new Map<string, string>();
      for (const p of own.flat()) {
        const key = p
          .slice(0, 3)
          .map(v => v.toFixed(5))
          .join();
        const n = p
          .slice(3, 6)
          .map(v => v.toFixed(4))
          .join();
        expect(normals.get(key) ?? n).toBe(n);
        normals.set(key, n);
      }
      const tone = own.flat().map(p => p[9]);
      expect(hi(tone)).toBeLessThan(0.68);
      expect(lo(tone)).toBeLessThan(0.75 * hi(tone));
    }
    expect(seen.every(n => n > 20)).toBe(true);
  });

  /** The bands of detail on the rims: stone facing up, off whole metres, outside the arena. */
  const band = verts.filter(
    p => p[8] === TEX.STONE && p[4] > 0.99 && (p[0] % 1 !== 0 || p[2] % 1 !== 0) && off(p) > 0,
  );

  it('lays a band of detail on the rim of every crater of 12 m and more: on the relief, 3 to 26 cm proud, the crest raised, light and broken', () => {
    expect(band.length).toBeGreaterThan(25000);
    for (const p of band) {
      const up = p[1] - ground(world, p[0], p[2]);
      expect(up).toBeGreaterThan(0.03);
      expect(up).toBeLessThan(0.26);
    }
    for (const [x, z, r] of LAYOUT.bowls.filter(b => b[2] >= 12)) {
      const ring = band.filter(p => Math.abs(Math.hypot(p[0] - x, p[2] - z) / r - 1) < 0.35);
      // All round: on each of sixteen bearings.
      const turns = new Set(
        ring.map(p => Math.floor((Math.atan2(p[2] - z, p[0] - x) / Math.PI + 1) * 8) % 16),
      );
      expect(turns.size, `crater at ${x}, ${z}`).toBe(16);
      // The crest: the lightest points, standing 10 to 25 cm proud, not all at one height; the inner ring dark.
      const crest = ring.filter(p => p[9] > 1.2).map(p => p[1] - ground(world, p[0], p[2]));
      expect(crest.length).toBeGreaterThan(r);
      expect(Math.min(...crest)).toBeGreaterThan(0.09);
      expect(Math.max(...crest) - Math.min(...crest)).toBeGreaterThan(0.08);
      expect(ring.some(p => p[9] < 0.8)).toBe(true);
    }
    // None on a crater under 12 m.
    for (const [x, z, r] of LAYOUT.bowls.filter(b => b[2] < 12)) {
      const near = LAYOUT.bowls.some(
        b => b[2] >= 12 && Math.hypot(b[0] - x, b[1] - z) < 1.5 * b[2] + r,
      );
      expect(near || !band.some(p => Math.hypot(p[0] - x, p[2] - z) < 0.7 * r)).toBe(true);
    }
  }, 60_000);

  it("breaks the small craters' rims: no two bearings of a lip at one distance or height", () => {
    const pits = verts.filter(pitted);
    // The lips: the highest points of each crater.
    const heights = new Set(pits.filter(p => p[1] > 0.1).map(p => p[1].toFixed(3)));
    expect(heights.size).toBeGreaterThan(100);
    expect(Math.max(...pits.map(p => p[1]))).toBeLessThanOrEqual(0.24);
  });

  it('dresses each crater of 12 m and more: pebbles on its crest and thrown out round it, lighter rays on the ground round it', () => {
    const big = LAYOUT.bowls.filter(b => b[2] >= 12);
    expect(big.length).toBeGreaterThan(15);
    let [crest, near] = [0, 0];
    for (const [x, z, r] of big) {
      const q = stones.map(p => Math.hypot(p[0] - x, p[2] - z) / r);
      crest += q.filter(v => v > 0.9 && v < 1.12).length;
      near += q.filter(v => v >= 1.15 && v < 2.5).length;
    }
    expect(crest).toBeGreaterThan(80);
    expect(near).toBeGreaterThan(120);
    // Rays: round the deep twins, between 1.2 and 2.2 of the radius, some of the ground is 0.1 lighter and more than the rest, and most is not.
    for (const [x, z, r] of big.filter(b => b[3] > 0.25 && b[1] !== 140)) {
      const ring = land
        .flat()
        .filter(p => {
          const d = Math.hypot(p[0] - x, p[2] - z) / r;
          return d > 1.2 && d < 2.2;
        })
        .map(p => p[9] - Math.min(Math.max(1 + p[1] / 60, 0.78), 1.2));
      const lit = ring.filter(v => v > 0.1).length / ring.length;
      expect(lit).toBeGreaterThan(0.05);
      expect(lit).toBeLessThan(0.5);
    }
  }, 60_000);

  it("stands the dishes, the ramps' lamps and the wreck on the relief", () => {
    const by = (x: number, z: number, r: number) =>
      verts.filter(p => p[8] !== TEX.STONE && Math.hypot(p[0] - x, p[2] - z) < r);
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
    // On the floor of the Bowl.
    const up = hull.filter(p => p[8] === -1).map(p => p[1] - at(x, z));
    expect(Math.max(...up)).toBeGreaterThan(3);
    expect(Math.max(...up)).toBeLessThan(8);
  });

  it('puts the masts on the map layout: lamps 10 m up', () => {
    for (const [x, z] of LAYOUT.masts) {
      const lamp = verts.filter(
        p => p[8] === -2 && Math.hypot(p[0] - x, p[2] - z) < 0.6 && p[1] > 9.5,
      );
      expect(lamp.length).toBeGreaterThan(0);
    }
  });
});

describe('moonscape, the small relief', () => {
  it("draws ripples finer than the lattice: off the level patches the ground's normals lean by a hash, up to 5 degrees; on them not at all", () => {
    const inside = land.flat().filter(p => reach(relief, p[0], p[2]) < 0.9);
    // What the heights alone would give, 4 m each side.
    const plain = (p: number[]) => {
      const n = [
        at(p[0] - 4, p[2]) - at(p[0] + 4, p[2]),
        8,
        at(p[0], p[2] - 4) - at(p[0], p[2] + 4),
      ];
      const l = Math.hypot(...n);
      return n.map(v => v / l);
    };
    const turn = (p: number[]) => {
      const n = plain(p);
      return (Math.acos(Math.min(p[3] * n[0] + p[4] * n[1] + p[5] * n[2], 1)) * 180) / Math.PI;
    };
    const flat = inside.filter(
      p =>
        p[1] === 0 &&
        at(p[0] - 4, p[2]) === 0 &&
        at(p[0] + 4, p[2]) === 0 &&
        at(p[0], p[2] - 4) === 0 &&
        at(p[0], p[2] + 4) === 0,
    );
    expect(flat.length).toBeGreaterThan(3000);
    expect(flat.every(p => p[4] === 1)).toBe(true);
    const open = inside.filter(p => p[1] !== 0).filter((_, k) => k % 7 === 0);
    const turns = open.map(turn);
    expect(hi(turns)).toBeLessThan(7.5);
    expect(turns.filter(t => t > 1).length / turns.length).toBeGreaterThan(0.6);
  });

  it('adds no vertex for it: the cap stays at 470,000', () => {
    expect(verts.length).toBeLessThan(470000);
  });
});

describe('moonscape, the horizon', () => {
  const [cx, cz, ba, bb] = relief.bound;
  const deg = (r: number) => (r * 180) / Math.PI;
  /** The highest a set of triangles stands on each degree of bearing from an eye, in degrees over the level; -90 where none does. */
  const skyline = (tris: number[][][], eye: number[]) => {
    const top = new Array<number>(360).fill(-90);
    for (const t of tris) {
      for (let k = 0; k < 3; k++) {
        const [p, q] = [t[k], t[(k + 1) % 3]];
        const [a, b] = [p, q].map(v => deg(Math.atan2(v[2] - eye[2], v[0] - eye[0])));
        // Turned the short way round.
        const d = ((b - a + 540) % 360) - 180;
        for (let g = Math.ceil(Math.min(a, a + d)); g <= Math.max(a, a + d); g++) {
          const [c, n] = [Math.cos((g * Math.PI) / 180), Math.sin((g * Math.PI) / 180)];
          const den = (q[0] - p[0]) * n - (q[2] - p[2]) * c;
          const f = Math.abs(den) < 1e-9 ? 0 : ((eye[0] - p[0]) * n - (eye[2] - p[2]) * c) / den;
          if (f < -1e-9 || f > 1 + 1e-9) {
            continue;
          }
          const at = [0, 1, 2].map(j => p[j] + f * (q[j] - p[j]));
          const e = deg(Math.atan2(at[1] - eye[1], Math.hypot(at[0] - eye[0], at[2] - eye[2])));
          top[(g + 720) % 360] = Math.max(top[(g + 720) % 360], e);
        }
      }
    }
    return top;
  };
  /** The crater wall as drawn: the relief past the bound. */
  const wall = land.filter(t => t.every(p => reach(relief, p[0], p[2]) > 0.98));
  const mounts: number[][][] = [];
  for (let k = 0; k < far.length; k += 3) {
    mounts.push(far.slice(k, k + 3));
  }
  /** A player's eyes: at the middle of the play area, and four places half way to the bound. */
  const eyes = [
    [0, 0],
    [0.55, 0],
    [-0.55, 0],
    [0, 0.55],
    [0, -0.55],
  ].map(([u, v]) => {
    const [x, z] = [cx + u * ba, cz + v * bb];
    const g = ground(world, x, z);
    return [x, (Number.isFinite(g) ? g : 0) + 1.7, z];
  });

  it('has no tooth on the crater wall: from the middle and half way to the bound its skyline turns by under 0.6 degrees a degree of bearing', () => {
    expect(wall.length).toBeGreaterThan(1500);
    for (const eye of eyes) {
      const top = skyline(wall, eye);
      expect(lo(top)).toBeGreaterThan(1);
      let [worst, peaks] = [0, 0];
      for (let g = 0; g < 360; g++) {
        const [a, b, c] = [top[(g + 359) % 360], top[g], top[(g + 1) % 360]];
        worst = Math.max(worst, Math.abs(a - 2 * b + c));
        // A summit over both its neighbours by a tenth of a degree: a tooth, if there are many.
        peaks += b > a + 0.1 && b > c + 0.1 ? 1 : 0;
      }
      expect(worst, `from ${eye}`).toBeLessThan(0.6);
      expect(peaks, `from ${eye}`).toBeLessThan(10);
    }
  });

  it('stands three ranges all round the horizon, past the wall and inside the stars, low: over the wall here and there', () => {
    expect(far.length).toBe(RANGE_COLS * 6 * RANGES.reduce((t, r) => t + r[2], 0));
    // Past where the wall is down on the plain, and nearer than the stars.
    expect(lo(far.map(p => reach(relief, p[0], p[2])))).toBeGreaterThan(1.65);
    expect(hi(far.map(p => dist(p, C)))).toBeLessThan(SKY - 15);
    // Their feet under the level: no gap under them.
    expect(lo(far.map(p => p[1]))).toBeLessThan(-20);
    const top = skyline(mounts, eyes[0]);
    const rim = skyline(wall, eyes[0]);
    // Low (the user, 2026-11-12: more discreet): over the wall from the middle on a bearing in three
    // and more, never more than 5 degrees over it.
    expect(top.filter((e, g) => e > rim[g] + 0.3).length).toBeGreaterThan(120);
    expect(Math.max(...top.map((e, g) => e - rim[g]))).toBeLessThan(5);
    // Half way to the bound: over the wall on some bearings still (the near wall is the tallest thing there).
    for (const eye of eyes.slice(1)) {
      const [t, r] = [skyline(mounts, eye), skyline(wall, eye)];
      // (From the floor of the Bowl, 10 m down, on 39.)
      expect(t.filter((e, g) => e > r[g] + 0.3).length, `from ${eye}`).toBeGreaterThan(36);
    }
    // Massifs and passes: the highest crest twice the lowest and more.
    expect(hi(top) / lo(top)).toBeGreaterThan(2);
    // Nearer, darker: the first range's mean grey under the last's in the shade, and each lit where it looks at the sun.
    const mean = (l: number[]) => l.reduce((a, v) => a + v, 0) / l.length;
    const of = (k: number, pick: (p: number[]) => boolean) =>
      mean(
        far
          .filter(
            p => Math.abs(Math.hypot(p[0] - C[0], p[2] - C[2]) - RANGES[k][0]) < 70 && pick(p),
          )
          .map(p => p[6]),
      );
    const [east, west] = [(p: number[]) => p[0] > C[0] + 500, (p: number[]) => p[0] < C[0] - 500];
    expect(of(0, east)).toBeLessThan(of(2, east));
    expect(of(0, west)).toBeGreaterThan(3 * of(0, east));
    expect(hi(far.map(p => p[6]))).toBeLessThan(0.45);
  });

  it('draws a fine skyline: a point every three quarters of a degree on each range', () => {
    for (const [R] of RANGES) {
      const crest = far.filter(p => Math.abs(Math.hypot(p[0] - C[0], p[2] - C[2]) - R) < 1e-6);
      const turn = [
        ...new Set(crest.map(p => deg(Math.atan2(p[2] - C[2], p[0] - C[0])).toFixed(3))),
      ]
        .map(Number)
        .sort((a, b) => a - b);
      expect(turn).toHaveLength(RANGE_COLS);
      turn.forEach((a, k) =>
        expect((turn[(k + 1) % turn.length] - a + 360) % 360).toBeLessThan(0.76),
      );
    }
  });

  it('keeps the ranges low: under 32 degrees from anywhere on the bound, 18 from the middle, and never on the Earth', () => {
    const earth = [...sky].filter(p => Math.abs(p[3]) + Math.abs(p[5]) > 0 && p[1] > 400);
    const rim = Array.from({ length: 36 }, (_, i) => {
      const [x, z] = [cx + 0.99 * ba * Math.cos(i / 5.73), cz + 0.99 * bb * Math.sin(i / 5.73)];
      return [x, at(x, z) + 1.7, z];
    });
    expect(hi(skyline(mounts, eyes[0]))).toBeLessThan(18);
    for (const eye of [eyes[0], ...rim]) {
      const top = skyline(mounts, eye);
      expect(hi(top), `from ${eye}`).toBeLessThan(32);
      // The Earth's disc from here: its lowest point over the level, and its bearings.
      const disc = [...sky].filter(
        p => dist(p, [C[0] + 0.3 * SKY, 0.62 * SKY, C[2] - 0.75 * SKY]) < 70,
      );
      expect(disc.length).toBeGreaterThan(1000);
      const low = lo(
        disc.map(p => deg(Math.atan2(p[1] - eye[1], Math.hypot(p[0] - eye[0], p[2] - eye[2])))),
      );
      const turn = disc.map(p => Math.round(deg(Math.atan2(p[2] - eye[2], p[0] - eye[0]))));
      for (const g of new Set(turn)) {
        expect(top[(g + 720) % 360], `from ${eye}, bearing ${g}`).toBeLessThan(low - 3);
      }
    }
    expect(earth.length).toBeGreaterThan(0);
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

  it('is 467,151 vertices, the four static rovers, the two shuttles, the masts of the pads and the 3000 stars no longer among them', () => {
    expect(verts.length).toBe(467151);
  });

  it("keeps the small craters 6 m clear of the map's own rover spawns, wherever they are", () => {
    const pits = verts.filter(pitted);
    const near = (list: number[][], x: number, z: number) =>
      list.filter(p => Math.hypot(p[0] - x, p[2] - z) < 2).length;
    for (const [x, , z] of MOON.rovers!) {
      expect(near(pits, x, z)).toBe(0);
    }
    // Park one on a crater of today's map: the crater goes, and there are still 72.
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
    expect(moonscape({ ...MOON, rovers: undefined }).length).toBe(v.length - heavens().length);
  });
});
