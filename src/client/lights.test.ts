import { describe, expect, it } from 'vitest';
import { bar, compile, sectorAt } from '../shared/level';
import { HALL } from '../shared/map';
import { PHASE } from '../shared/types';
import type { PlayerState } from '../shared/types';
import { BLAST, createEffects, glow } from './effects';
import { LIGHT, MAX_LIGHTS, gather } from './lights';
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
  bullets: [],
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

  it('each carry a flashlight from their eye along their view', () => {
    const [s] = spots([player(1, 3, Math.PI)]);
    expect(s.p).toEqual([3, 1.6, 8]);
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

describe('blasts', () => {
  const lit = (t: number) => {
    const fx = createEffects();
    fx.blasts.push({ p: [9, 1, 9], r: 0.6, t });
    return gather(bare({ fx })).filter(l => l.kind == LIGHT.POINT);
  };
  const g = (t: number) => glow({ p: [0, 0, 0], r: 0.6, t });

  it('follow glow() and are gone when it is', () => {
    expect(lit(0.05)[0].color[0] / lit(0.2)[0].color[0]).toBeCloseTo(g(0.05) / g(0.2));
    expect(lit(0.05)[0].p).toEqual([9, 1, 9]);
    expect(lit(BLAST)).toHaveLength(0);
    expect(lit(0)).toHaveLength(0);
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

describe('monster bullets', () => {
  it('glow, for the nearest few only', () => {
    const bullets = Array.from({ length: 8 }, (_, i) => ({ id: i, x: 8, y: 1, z: 8 - i }));
    const [, ...b] = gather(bare({ bullets }));
    expect(b.map(l => l.p[2])).toEqual([8, 7, 6, 5]);
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
    const bullets = [{ id: 99, x: 8, y: 1, z: 9 }];
    const ls = gather(bare({ fx, others, bullets }));
    const rest = ls.slice(2).map(l => dist(l.p, EYE));
    expect(ls).toHaveLength(MAX_LIGHTS);
    expect(ls[0].shadow && ls[1].shadow).toBe(true);
    expect(ls[1].color[0]).toBeGreaterThan(1);
    expect(rest).toEqual([...rest].sort((a, b) => a - b));
    expect(ls.some(l => l.p[1] == 1)).toBe(true);
    expect(Math.max(...ls.map(l => l.p[0]))).toBeLessThan(20 + MAX_LIGHTS);
  });
});
