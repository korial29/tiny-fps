import { describe, expect, it } from 'vitest';
import { HIGHLINE } from './map';
import { MOON } from './moon';
import { PASS, funnel, locate, navOf, path } from './nav';
import { leap } from './routes';
import type { Vec3 } from './nav';
import { TEX } from './types';
import { build } from './world';
import type { Brush, WorldDef } from './world';

/** The points of a map a bot must stand on: spawns, bases, racks, packs, armours. */
const points = (def: WorldDef): Vec3[] => [
  ...def.teams.flatMap(t => [
    ...t.spawns.map(([x, y, z]): Vec3 => [x, y, z]),
    t.base,
    ...[t.rack, t.blade, t.rail, t.rifle].filter((p): p is Vec3 => !!p),
  ]),
  ...(def.packs ?? []),
  ...(def.ammo ?? []),
  ...(def.vests ?? []),
];

describe('nav: the mesh', () => {
  for (const def of [HIGHLINE, MOON]) {
    it(`puts every spawn, base, rack and pack of ${def.name} on a floor`, () => {
      const w = build(def);
      const nav = navOf(w);
      for (const p of points(def)) {
        const [i, at] = locate(nav, w, p);
        expect(i, `${p}`).toBeGreaterThanOrEqual(0);
        expect(Math.abs(at[1] - p[1]), `${p}`).toBeLessThan(0.6);
      }
    });
  }

  it('builds a map in well under a second', () => {
    for (const def of [HIGHLINE, MOON]) {
      const t = performance.now();
      const nav = navOf(build(def));
      expect(performance.now() - t).toBeLessThan(1000);
      expect(nav.polys.length).toBeGreaterThan(50);
    }
  });

  it('keeps a body off a wall and walks up a step, drops off a box and jumps back onto it', () => {
    const slab: Brush = { min: [-20, -1, -20], max: [20, 0, 20], top: TEX.TILE, side: TEX.TILE };
    const wall: Brush = { min: [-1, 0, -20], max: [1, 3, 5], top: TEX.TILE, side: TEX.TILE };
    const step: Brush = { min: [5, 0, -2], max: [8, 0.4, 2], top: TEX.TILE, side: TEX.TILE };
    const box: Brush = { min: [-8, 0, 10], max: [-4, 1.2, 14], top: TEX.TILE, side: TEX.TILE };
    const w = build({
      brushes: [slab, wall, step, box],
      teams: [
        { base: [0, 0, 18], spawns: [[0, 0, 18, 0]] },
        { base: [0, 0, -18], spawns: [[0, 0, -18, 0]] },
      ],
      floor: -10,
      sun: { dir: [0, 1, 0], color: [1, 1, 1] },
      sky: [
        [0, 0, 1],
        [1, 1, 1],
      ],
    });
    const nav = navOf(w);
    // Nothing stands within a body's radius of the wall.
    for (const p of nav.polys.filter(p => p.y === 0)) {
      const [x0, z0, x1, z1] = p.q;
      expect(x1 <= -1.4 || x0 >= 1.4 || z0 >= 5.4 || z1 <= -20 + 1e-9).toBe(true);
    }
    const [s] = locate(nav, w, [6.5, 0.4, 0]);
    const [b] = locate(nav, w, [-6, 1.2, 12]);
    expect(nav.polys[s].y).toBe(0.4);
    expect(nav.out[s].some(e => e.pass === PASS.WALK)).toBe(true);
    expect(nav.out[b].every(e => e.pass === PASS.DROP)).toBe(true);
    expect(nav.out.some(es => es.some(e => e.to === b && e.pass === PASS.HOP))).toBe(true);
    // From one side of the wall to the other: round its end, not through it.
    const way = path(nav, w, [-5, 0, -10], [5, 0, -10]);
    expect(way.some(st => st.to[2] > 5)).toBe(true);
    expect(way.at(-1)!.to).toEqual([5, 0, -10]);
  });
});

describe('nav: the funnel', () => {
  it('goes straight down a corridor and round the inside of a bend', () => {
    // Up +z through two portals in line: straight.
    expect(
      funnel(
        [0, 0],
        [
          [
            [-1, 2],
            [1, 2],
          ],
          [
            [-1, 4],
            [1, 4],
          ],
        ],
        [0, 6],
      ),
    ).toEqual([[0, 6]]);
    // Up +z then right (+x): the corner is the portal's right end, bent round.
    const ps = funnel(
      [0, 0],
      [
        [
          [-1, 4],
          [1, 4],
        ],
        [
          [1, 6],
          [1, 4],
        ],
      ],
      [5, 5],
    );
    expect(ps).toEqual([
      [1, 4],
      [5, 5],
    ]);
  });
});

describe('nav: a jump’s run-in', () => {
  it('comes at a take-off along the jump’s way, never from across a gap behind it', () => {
    const top = (z0: number, z1: number): Brush => ({
      min: [-5, -1, z0],
      max: [5, 0, z1],
      top: TEX.TILE,
      side: TEX.TILE,
    });
    // The take-off's roof (z 0 to 2), a gap behind it, a roof past the gap, the far roof ahead.
    const w = build({
      brushes: [top(0, 2), top(3, 20), top(-12, -5)],
      teams: [
        { base: [0, 0, 10], spawns: [[0, 0, 10, 0]] },
        { base: [0, 0, -8], spawns: [[0, 0, -8, 0]] },
      ],
      floor: -10,
      sun: { dir: [0, 1, 0], color: [1, 1, 1] },
      sky: [
        [0, 0, 1],
        [1, 1, 1],
      ],
    });
    const nav = navOf(w);
    const [i] = locate(nav, w, [0, 0, 0.5]);
    const [j] = locate(nav, w, [0, 0, -8]);
    nav.out[i].push({
      to: j,
      from: [0, 0, 0.5],
      end: [0, 0, -8],
      legs: [leap([0, 0.5], [0, -8], 0, { sprint: false })],
      route: -1,
      cost: 1,
    });
    // Standing beside the take-off: its run-in would be 3 m back, over the gap.
    const way = path(nav, w, [4, 0, 1], [0, 0, -8]);
    const before = way.slice(
      0,
      way.findIndex(st => st.leg),
    );
    expect(before.length).toBeGreaterThan(0);
    expect(before.every(st => st.to[2] <= 2)).toBe(true);
  });
});
