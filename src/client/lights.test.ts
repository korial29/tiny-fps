import { describe, expect, it } from 'vitest';
import { bar, compile, sectorAt } from '../shared/level';
import { HALL } from '../shared/map';
import { PHASE, TEX } from '../shared/types';
import type { MapDef, PlayerState } from '../shared/types';
import { createEffects } from './effects';
import { LIGHT, MAX_LIGHTS, gather, lava } from './lights';
import type { Scene } from './lights';
import { basis } from './mesh';

const lvl = compile(HALL);
const EYE: [number, number, number] = [8, 1.6, 8];
const player = (id: number, x: number, yaw = 0): PlayerState => ({
  id,
  x,
  y: 0,
  z: 8,
  vy: 0,
  yaw,
  pitch: 0,
  ground: true,
  cool: 0,
});
const scene = (over: Partial<Scene> = {}): Scene => ({
  eye: EYE,
  yaw: 0,
  pitch: 0,
  dead: false,
  others: [],
  fx: createEffects(),
  lvl,
  t: 0,
  ...over,
});
/** The scene with the exit open, or barred (the goal still to find). */
const open = (o: Partial<Scene> = {}) => {
  bar(lvl, 0, PHASE.RETURN);
  return scene(o);
};
const closed = (o: Partial<Scene> = {}) => {
  bar(lvl, 0, PHASE.HUNT);
  return scene(o);
};
/** No exit, no goal: only the lights a test asks for. */
const bare = (o: Partial<Scene> = {}) =>
  scene({ lvl: { ...lvl, map: { ...HALL, exit: undefined, goal: undefined } }, ...o });
const dist = (a: number[], b: number[]) => Math.hypot(...a.map((v, i) => v - b[i]));
const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0);

describe('own flashlight', () => {
  it('is first, a shadowed spot along the view, just below and right of the eye', () => {
    const [a] = gather(bare({ yaw: 1, pitch: 0.4 }));
    const [right, up, fwd] = basis(1, 0.4);
    const off = a.p.map((v, i) => v - EYE[i]);
    expect(a.kind).toBe(LIGHT.SPOT);
    expect(a.shadow).toBe(true);
    expect(a.d).toEqual(fwd);
    expect(dist(a.p, EYE)).toBeLessThan(0.5);
    expect(dot(off, right)).toBeGreaterThan(0);
    expect(dot(off, up)).toBeLessThan(0);
  });

  it('looks toward -z at yaw 0 and pitch 0', () => {
    expect(gather(bare())[0].d).toEqual([-0, 0, -1]);
  });

  it('is gone when dead, the muzzle flash with it', () => {
    const fx = createEffects();
    fx.flash = 0.05;
    expect(gather(bare({ dead: true, fx }))).toEqual([]);
  });

  it('lights alone in a bare scene', () => {
    expect(gather(bare())).toHaveLength(1);
  });
});

describe('own muzzle flash', () => {
  it('shows only while fx.flash runs, a bright shadowed spot ahead of the eye', () => {
    const fx = createEffects();
    expect(gather(bare({ fx }))).toHaveLength(1);
    fx.flash = 0.05;
    const [, m, ...more] = gather(bare({ fx }));
    expect(more).toHaveLength(0);
    expect(m.kind).toBe(LIGHT.SPOT);
    expect(m.shadow).toBe(true);
    expect(m.p[2]).toBeLessThan(8 - 0.5);
    expect(m.color[0]).toBeGreaterThan(1);
  });
});

describe('other players', () => {
  const spots = (others: PlayerState[]) =>
    gather(bare({ others }))
      .filter(l => l.kind == LIGHT.SPOT)
      .slice(1);

  it('each carry a flashlight from just ahead of their eye along their view', () => {
    const [s] = spots([player(1, 3, Math.PI)]);
    // Facing +z: 0.35 m ahead, clear of the head box (0.17 m half side).
    expect(s.p[0]).toBeCloseTo(3);
    expect(s.p[1]).toBeCloseTo(1.6);
    expect(s.p[2]).toBeCloseTo(8.35);
    expect(s.d[2]).toBeCloseTo(1);
  });

  it('shadows the two nearest, not a third', () => {
    const ls = spots([player(1, 2), player(2, 4), player(3, 6)]);
    expect(ls.filter(l => l.shadow).map(l => l.p[0])).toEqual([6, 4]);
    expect(ls.find(l => !l.shadow)?.p[0]).toBe(2);
  });

  it('light a point at the gun while they shoot', () => {
    const fx = createEffects();
    const points = (s: Scene) => gather(s).filter(l => l.kind == LIGHT.POINT);
    expect(points(bare({ others: [player(1, 3)] }))).toHaveLength(0);
    fx.flashes.set(1, 0.05);
    const [p, ...more] = points(bare({ others: [player(1, 3)], fx }));
    expect(more).toHaveLength(0);
    expect(dist(p.p, [3, 1.25, 8])).toBeLessThan(1.5);
  });
});

describe('hit light', () => {
  it('shows only while hurt, red, at the eye', () => {
    const fx = createEffects();
    expect(gather(bare({ fx }))).toHaveLength(1);
    fx.hit();
    const [, h] = gather(bare({ fx }));
    expect(h.kind).toBe(LIGHT.POINT);
    expect(h.color[0]).toBeGreaterThan(h.color[1] * 5);
    expect(dist(h.p, EYE)).toBeLessThan(1);
  });
});

describe('exit and goal', () => {
  const doorways = lvl.edges.filter(e => e.front == 0 && e.back >= 0);
  const goal = HALL.goal ?? [0, 0];

  it('light each doorway of the exit sector once it is open, half a metre inside', () => {
    const [, ...ls] = gather(open());
    expect(doorways.length).toBeGreaterThan(0);
    expect(ls).toHaveLength(doorways.length);
    for (const l of ls) {
      expect(l.kind).toBe(LIGHT.POINT);
      expect(l.color[1]).toBeGreaterThan(l.color[0]);
      expect(sectorAt(lvl, l.p[0], l.p[2])).toBe(0);
      const mid = doorways.map(e => dist([(e.ax + e.bx) / 2, (e.az + e.bz) / 2], [l.p[0], l.p[2]]));
      expect(Math.min(...mid)).toBeCloseTo(0.5);
    }
  });

  it('pulse', () => {
    expect(gather(open({ t: 0.4 }))[1].color).not.toEqual(gather(open())[1].color);
  });

  it('light a cyan pulse above the goal while the exit is barred, not the doorways', () => {
    const [, ...ls] = gather(closed());
    const floor = HALL.sectors[sectorAt(lvl, goal[0], goal[1])].floor;
    expect(ls).toHaveLength(1);
    expect([ls[0].p[0], ls[0].p[2]]).toEqual(goal);
    expect(ls[0].p[1]).toBeGreaterThan(floor);
    expect(ls[0].color[2]).toBeGreaterThan(ls[0].color[0]);
    expect(gather(closed({ t: 0.4 }))[1].color).not.toEqual(ls[0].color);
  });

  it('drop the goal once the exit is open', () => {
    expect(gather(open()).some(l => l.p[0] == goal[0] && l.p[2] == goal[1])).toBe(false);
  });
});

describe('cap', () => {
  it('keeps the own lights, then the nearest of the rest', () => {
    const fx = createEffects();
    fx.flash = 0.05;
    const others = Array.from({ length: 20 }, (_, i) => player(i + 1, 20 + i));
    const ls = gather(bare({ fx, others }));
    const rest = ls.slice(2).map(l => dist(l.p, EYE));
    expect(ls).toHaveLength(MAX_LIGHTS);
    expect(ls[0].shadow && ls[1].shadow).toBe(true);
    expect(ls[1].color[0]).toBeGreaterThan(1);
    expect(rest).toEqual([...rest].sort((a, b) => a - b));
    expect(Math.max(...ls.map(l => l.p[0]))).toBeLessThan(20 + MAX_LIGHTS);
  });
});

describe('lava', () => {
  /** n lava pools 2 m square, 3 m apart along x at z 0..2, floor at 0.4: centres at 1, 4, 7, ... */
  const pools = (n: number, over: Partial<MapDef['sectors'][number]> = {}) =>
    compile({
      sectors: Array.from({ length: n }, (_, i) => ({
        pts: [
          [3 * i, 0],
          [3 * i + 2, 0],
          [3 * i + 2, 2],
          [3 * i, 2],
        ],
        floor: 0.4,
        ceil: 6,
        ft: TEX.LAVA,
        wt: TEX.STONE,
        ct: TEX.STONE,
        ...over,
      })),
      spawns: [[1, 1, 0]],
    } as MapDef);
  const at = (x: number, lv = pools(1), o: Partial<Scene> = {}) =>
    scene({ lvl: lv, eye: [x, 1.6, 1], ...o });
  const lit = (s: Scene) => gather(s).filter(l => l.kind == LIGHT.POINT);

  it('lights nothing where there is no lava, or none near the eye', () => {
    expect(lava(pools(1, { ft: TEX.TILE }))).toEqual([]);
    expect(lit(at(1, pools(1, { ft: TEX.TILE })))).toHaveLength(0);
    expect(lit(at(40))).toHaveLength(0);
    expect(gather(bare())).toHaveLength(1);
  });

  it('puts a warm point light above the middle of a pool near the eye', () => {
    const [l, ...more] = lit(at(-3));
    expect(more).toHaveLength(0);
    expect(l.shadow).toBe(false);
    expect([l.p[0], l.p[2]]).toEqual([1, 1]);
    expect(l.p[1]).toBeGreaterThan(0.4);
    expect(l.p[1]).toBeLessThan(0.4 + 3);
    expect(l.color[0]).toBeGreaterThan(l.color[1] * 2);
    expect(l.color[1]).toBeGreaterThan(l.color[2]);
    // Its reach grows with the pool: 2 m square is small, a 14 x 10 pit is wide.
    const big = compile({
      sectors: [
        {
          ...pools(1).map.sectors[0],
          pts: [
            [0, 0],
            [14, 0],
            [14, 10],
            [0, 10],
          ],
        },
      ],
      spawns: [[1, 1, 0]],
    } as MapDef);
    expect(lava(big)[0].range).toBeGreaterThan(l.range * 1.5);
    expect(lava(big)[0].p).toEqual([7, 2.4, 5]);
  });

  it('breathes and flickers with the time, out of step from pool to pool', () => {
    const lv = pools(2);
    const colors = [0, 0.05, 0.4, 1.3].map(t => lit(at(2.5, lv, { t })).map(l => l.color[0]));
    expect(new Set(colors.map(c => c[0])).size).toBe(4);
    expect(colors.every(c => c[0] > 0.8 && c[0] < 2.5)).toBe(true);
    expect(colors[0][0]).not.toBeCloseTo(colors[0][1]);
  });

  it('goes nearest-first with the other lights, and at most four pools', () => {
    // Eye at x 11.5 sees pools at 1.5, 1.5, 4.5, 4.5, 7.5, 7.5 m: six in reach, four kept.
    const ls = lit(at(11.5, pools(8)));
    expect(ls).toHaveLength(4);
    const d = ls.map(l => dist(l.p, [11.5, 1.6, 1]));
    expect(d).toEqual([...d].sort((a, b) => a - b));
    expect(Math.max(...d)).toBeLessThan(4.6 * 1.5);
    const others = [player(1, 9)];
    const all = gather(at(11.5, pools(8), { others })).slice(1);
    const ds = all.map(l => dist(l.p, [11.5, 1.6, 1]));
    expect(ds).toEqual([...ds].sort((a, b) => a - b));
  });

  it('never pushes out the own flashlight or muzzle flash', () => {
    const fx = createEffects();
    fx.flash = 0.05;
    const others = Array.from({ length: 20 }, (_, i) => player(i + 1, 12 + i));
    const ls = gather(at(11.5, pools(8), { fx, others }));
    expect(ls).toHaveLength(MAX_LIGHTS);
    expect(ls[0].kind).toBe(LIGHT.SPOT);
    expect(ls[1].kind).toBe(LIGHT.SPOT);
    expect(ls[1].color[0]).toBeGreaterThan(2.5);
    expect(ls[0].shadow && ls[1].shadow).toBe(true);
  });

  it('derives its pools once per level object', () => {
    const lv = pools(3);
    const first = lava(lv);
    expect(first).toHaveLength(3);
    gather(at(4, lv));
    expect(lava(lv)).toBe(first);
    expect(lava({ ...lv })).not.toBe(first);
  });
});
