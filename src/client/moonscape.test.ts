import { describe, expect, it } from 'vitest';
import { empty, reach } from '../../test/relief';
import { STEP_H } from '../shared/constants';
import { LAYOUT, LIP, MOON, PIT_FLOOR, PIT_R, PIT_S, rockMid, rockOf } from '../shared/moon';
import { ground } from '../shared/relief';
import { TEX } from '../shared/types';
import { build } from '../shared/world';
import { STRIDE } from './mesh';
import { PEBBLES, RANGES, RANGE_COLS, SKY, heavens, moonscape, strewn } from './moonscape';
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
/** The small craters' vertices: in the floor's stone, off the lattice, over the floor. */
const pitted = (p: number[]) =>
  p[8] === TEX.STONE && loose(p) && p[1] > 0.01 && Math.abs(p[2] - 140) > 16;
/** In a pit's square of terrace, which pits() draws: not on its edge. */
const inPit = (p: number[]) =>
  LAYOUT.pits.some(q => Math.abs(p[0] - q.x) < PIT_S && Math.abs(p[2] - q.z) < PIT_S);
/** The relief as drawn: the stone triangles that face up, on the lattice or past the bound (the rims' bands of detail are off whole metres). */
const land: number[][][] = [];
for (let i = 0; i < verts.length; i += 3) {
  const t = verts.slice(i, i + 3);
  const mid = [0, 1, 2].map(k => (t[0][k] + t[1][k] + t[2][k]) / 3);
  if (
    !inPit(mid) &&
    t.every(p => p[8] === TEX.STONE && p[4] > 0 && !loose(p) && p[0] % 1 === 0 && p[2] % 1 === 0)
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
    // The craters' stones and twelve small craters more are 12,600: then the rims' bands of detail 33,000 and the pits 10,000: the cap went from 380,000 to 440,000.
    // The ranges on the horizon are 28,800: the cap went to 470,000. The rocks were 117,000; the pebbles are 98,000 and the sixteen boulders 22,000.
    expect(verts.length).toBeLessThan(470000);
    expect(moonscape(MOON).concat(heavens())).toEqual(v);
  });

  it('puts the stars and the Earth on a dome of 800 m, past everything else drawn', () => {
    expect(sky.size).toBeGreaterThan(3000 * 6);
    const d = [...sky].map(p => dist(p, C));
    expect(lo(d)).toBeGreaterThan(SKY - 5);
    expect(hi(d)).toBeLessThan(SKY + 5);
    expect(lo([...sky].map(p => p[1]))).toBeGreaterThan(-100);
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
          !inPit([x + 2, 0, z + 2])
        ) {
          squares++;
          expect(drawn.has(`${3 * x + 2 * cell},${3 * z + cell}`), `${x}, ${z}`).toBe(true);
          expect(drawn.has(`${3 * x + cell},${3 * z + 2 * cell}`), `${x}, ${z}`).toBe(true);
        }
      }
    }
    expect(squares).toBeGreaterThan(20400);
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
        // Or the edge of a pit's square of terrace.
        const pit = ends.every(([x, z]) =>
          LAYOUT.pits.some(q => Math.max(Math.abs(x - q.x), Math.abs(z - q.z)) === PIT_S),
        );
        expect(out || lip || pit, key).toBe(true);
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

  it("draws no other rock: nothing of basalt stands over half a metre on the floor but the sixteen boulders, the pits' blocks and the stepping stones, and nothing up the wall", () => {
    const tall = basalt.filter(
      p =>
        p[1] > ground(world, p[0], p[2]) + STEP_H &&
        Math.abs(p[2] - 140) > 17 &&
        !LAYOUT.pits.some(q => Math.hypot(p[0] - q.x, p[2] - q.z) < PIT_R + 4) &&
        !rocks.some(c => Math.hypot(p[0] - c.at[0], p[2] - c.at[2]) < 1.4 * c.R),
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

  /** The bands of detail on the rims: stone facing up, off whole metres, outside the arena and the pits. */
  const band = verts.filter(
    p =>
      p[8] === TEX.STONE &&
      p[4] > 0.99 &&
      (p[0] % 1 !== 0 || p[2] % 1 !== 0) &&
      !inPit(p) &&
      off(p) > 0,
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

  it('draws each pit: its terrace to the void with a dark lip, rock walls down to a floor 13 m and more under it, the steps, blocks round the edge', () => {
    for (const p of LAYOUT.pits) {
      const here = verts.filter(
        v => Math.abs(v[0] - p.x) <= PIT_S && Math.abs(v[2] - p.z) <= PIT_S,
      );
      const terrace = here.filter(v => v[8] === TEX.STONE && Math.abs(v[1] - p.level) < 1e-9);
      expect(terrace.length).toBeGreaterThan(200);
      // Drawn up to the void all round, never short of it, and darker by it.
      for (const [z0, z1, a, b] of p.rows) {
        const row = terrace.filter(v => v[2] >= z0 && v[2] <= z1);
        expect(Math.min(...row.filter(v => v[0] > p.x).map(v => v[0] - p.x))).toBeLessThanOrEqual(
          b + 1e-9,
        );
        expect(Math.min(...row.filter(v => v[0] < p.x).map(v => p.x - v[0]))).toBeLessThanOrEqual(
          a + 1e-9,
        );
      }
      const lip = terrace.filter(v => Math.hypot(v[0] - p.x, v[2] - p.z) < PIT_R + 1);
      expect(Math.max(...lip.map(v => v[9]))).toBeLessThan(0.8);
      expect(terrace.some(v => v[9] > 0.99)).toBe(true);
      // The walls: basalt from the terrace to the floor.
      const wall = here.filter(
        v => v[8] === TEX.ROCK && Math.abs(v[4]) < 0.9 && v[1] < p.level - 0.5 && v[0] < p.x,
      );
      expect(wall.length).toBeGreaterThan(300);
      expect(Math.min(...wall.map(v => v[1]))).toBe(PIT_FLOOR);
      // The floor, dark, and the steps on it: basalt at six heights and more up the east side.
      const floor = here.filter(v => v[8] === TEX.STONE && v[1] === PIT_FLOOR);
      expect(floor).toHaveLength(6);
      expect(floor.every(v => v[9] < 0.6)).toBe(true);
      const steps = here.filter(
        v =>
          v[8] === TEX.ROCK &&
          Math.abs(v[2] - p.z) < 1.3 &&
          v[0] > p.x &&
          v[0] < p.x + p.rows[PIT_R][3] - 0.4 &&
          v[1] > PIT_FLOOR + 0.5,
      );
      expect(new Set(steps.map(v => Math.round(v[1]))).size).toBeGreaterThanOrEqual(5);
      // Blocks round the edge: basalt standing on the terrace within 3 m of the void.
      const blocks = verts.filter(
        v =>
          v[8] === TEX.ROCK &&
          v[1] > p.level + 0.15 &&
          v[1] < p.level + 1 &&
          Math.abs(Math.hypot(v[0] - p.x, v[2] - p.z) - PIT_R - 1.6) < 1.2,
      );
      // Twenty triangles each.
      expect(blocks.length / 60).toBeGreaterThan(6);
    }
  });

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
    // On the floor of the Bowl's pit.
    const up = hull.filter(p => p[8] === -1).map(p => p[1] - PIT_FLOOR);
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
      expect(t.filter((e, g) => e > r[g] + 0.3).length, `from ${eye}`).toBeGreaterThan(40);
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

  it('is 467,055 vertices, the four static rovers, the two shuttles and the masts of the pads no longer among them', () => {
    expect(verts.length).toBe(467055);
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
