import { describe, expect, it, vi } from 'vitest';
import { STILL } from '../shared/physics';
import { LIMB, TEX } from '../shared/types';
import type { PlayerState } from '../shared/types';
import { build } from '../shared/world';
import { fall, ground, sever } from './limbs';
import { STRIDE } from './mesh';
import { rest, solve, turn } from './rig';
import { body, cut } from './skin';
import { animate, soldier } from './soldier';
import type { Runner } from './soldier';

const DT = 1 / 60;
const LIMBS = [LIMB.HEAD, LIMB.ARM_L, LIMB.ARM_R, LIMB.LEG_L, LIMB.LEG_R];
const man = (o: Partial<PlayerState> = {}): PlayerState => ({
  id: 1,
  x: 5,
  y: 1,
  z: -3,
  vy: 0,
  yaw: 0,
  pitch: 0,
  ground: true,
  ...STILL,
  ...o,
});
const tracer = () => ({ shock: vi.fn(), spit: vi.fn() });

/** A runner standing for a second, then down with `limb` cut off for `n` frames. */
const felled = (limb: number, n: number, t = tracer(), o: Partial<PlayerState> = {}) => {
  const book = new Map<number, Runner>();
  for (let i = 0; i < 60; i++) {
    animate(book, [man(o)], DT, undefined, t);
  }
  for (let i = 0; i < n; i++) {
    animate(book, [man({ ...o, down: 300 - i, hp: 0, lost: limb })], DT, undefined, t);
  }
  return book;
};
const drawn = (r: Runner, lod = 1) => {
  const v: number[] = [];
  soldier(v, r, [0.1, 0.8, 0.2], lod);
  return v;
};
const ys = (v: number[]) => v.filter((_, i) => i % STRIDE == 1);

describe('a limb cut off', () => {
  it('draws the body without the limb and the limb as a piece, both faces glowing', () => {
    for (const limb of LIMBS) {
      const r = felled(limb, 1).get(1)!;
      expect(r.cut?.limb).toBe(limb);
      const v = drawn(r);
      const [rest, piece] = cut(1, limb);
      expect(v.length / STRIDE).toBe(rest.t.length + piece.t.length);
      expect(v.filter((x, i) => i % STRIDE == 8 && x == -2).length).toBeGreaterThan(20);
    }
  });

  it('leaves in the pose of the cut, the two faces together, then flies off', () => {
    const r = felled(LIMB.ARM_R, 1).get(1)!;
    const stump = r.cut!.at;
    drawn(r);
    // The stump's face on the body is where the piece's face started.
    expect(Math.hypot(...r.cut!.at.map((x, i) => x - stump[i]))).toBeLessThan(0.05);
    const at = [...r.cut!.p];
    for (let i = 0; i < 12; i++) {
      fall(r.cut!, DT, () => -10);
    }
    expect(r.cut!.p[1]).toBeGreaterThan(at[1]);
    // Out to the runner's right (+x at yaw 0).
    expect(r.cut!.p[0]).toBeGreaterThan(at[0] + 0.1);
  });

  it('bursts in sparks at the cut, and the stump spits for about a second', () => {
    const t = tracer();
    felled(LIMB.HEAD, 120, t);
    expect(t.shock).toHaveBeenCalledTimes(1);
    expect(t.spit.mock.calls.length).toBeGreaterThan(6);
    expect(t.spit.mock.calls.length).toBeLessThan(20);
    const n = t.spit.mock.calls.length;
    felled(LIMB.HEAD, 240, t);
    expect(t.spit.mock.calls.length - n).toBe(n);
  });

  it('falls, bounces and comes to rest on the floor, lying down', () => {
    for (const limb of LIMBS) {
      const c = sever(limb, solve(rest([0, 1, 0])), man({ y: 1 }));
      let top = 0;
      let lowest = 9;
      for (let i = 0; i < 240; i++) {
        fall(c, DT, () => 1);
        top = Math.max(top, c.p[1]);
        lowest = Math.min(lowest, ...c.pts.map(p => c.p[1] + turn(c.q, p)[1]));
      }
      expect(top).toBeGreaterThan(1.3);
      expect(lowest).toBeGreaterThan(0.99);
      expect(Math.hypot(...c.v)).toBeLessThan(0.05);
      expect(Math.hypot(...c.w)).toBeLessThan(0.3);
      expect(Math.min(...c.pts.map(p => c.p[1] + turn(c.q, p)[1]))).toBeCloseTo(1, 3);
      // An arm or a leg lies along the roof, not on its end.
      if (limb != LIMB.HEAD) {
        expect(Math.abs(turn(c.q, c.long)[1])).toBeLessThan(0.3);
      }
      // Within a couple of metres of where it was cut.
      expect(Math.hypot(c.p[0], c.p[2])).toBeLessThan(2.5);
    }
  });

  it('lands on the roof under it in the world, and falls on past its edge', () => {
    const world = build({
      brushes: [{ min: [-2, 0, -2], max: [2, 3, 2], top: TEX.TILE, side: TEX.BRICK }],
      teams: [
        { base: [0, 0, 0], spawns: [[0, 0, 0, 0]] },
        { base: [0, 0, 0], spawns: [[0, 0, 0, 0]] },
      ],
      floor: -20,
      sun: { dir: [0, 1, 0], color: [1, 1, 1] },
      sky: [
        [0, 0, 0],
        [0, 0, 0],
      ],
    });
    const floor = ground(world, 3);
    expect(floor(0, 4, 0)).toBeCloseTo(3, 5);
    expect(floor(5, 4, 0)).toBe(-Infinity);
    const c = sever(LIMB.LEG_L, solve(rest([0, 3, 0])), man({ x: 0, y: 3, z: 0 }));
    for (let i = 0; i < 240; i++) {
      fall(c, DT, floor);
    }
    expect(Math.min(...c.pts.map(p => c.p[1] + turn(c.q, p)[1]))).toBeCloseTo(3, 2);
    // Cut at the edge, the left leg goes over it (-x at yaw 0).
    const off = sever(LIMB.LEG_L, solve(rest([-1.9, 3, 0])), man({ x: -1.9, y: 3, z: 0 }));
    for (let i = 0; i < 120; i++) {
      fall(off, DT, floor);
    }
    expect(off.p[1]).toBeLessThan(-5);
  });

  it('sinks with the body for its last half second', () => {
    const book = felled(LIMB.LEG_R, 200);
    const r = book.get(1)!;
    const before = Math.min(...ys(drawn(r).slice(-cut(1, LIMB.LEG_R)[1].t.length * STRIDE)));
    animate(book, [man({ down: 1, hp: 0, lost: LIMB.LEG_R })], DT);
    const after = Math.min(...ys(drawn(r).slice(-cut(1, LIMB.LEG_R)[1].t.length * STRIDE)));
    expect(before - after).toBeGreaterThan(0.4);
  });

  it('shows a runner first seen down lying by its limb, with no sparks', () => {
    const t = tracer();
    const book = new Map<number, Runner>();
    animate(book, [man({ down: 200, hp: 0, lost: LIMB.ARM_L })], DT, undefined, t);
    const c = book.get(1)!.cut!;
    expect(c.limb).toBe(LIMB.ARM_L);
    expect(Math.hypot(...c.v)).toBeLessThan(0.05);
    expect(Math.min(...c.pts.map(p => c.p[1] + turn(c.q, p)[1]))).toBeCloseTo(1, 2);
    expect(t.shock).not.toHaveBeenCalled();
    expect(t.spit).not.toHaveBeenCalled();
  });

  it('is forgotten when the runner is up again or leaves, and never made by a shot', () => {
    const book = felled(LIMB.HEAD, 30);
    animate(book, [man({ down: 0 })], DT);
    expect(book.get(1)!.cut).toBeUndefined();
    expect(drawn(book.get(1)!).length / STRIDE).toBe(body(1).t.length);
    const gone = felled(LIMB.HEAD, 30);
    animate(gone, [], DT);
    expect(gone.size).toBe(0);
    const shot = felled(LIMB.NONE, 30);
    expect(shot.get(1)!.cut).toBeUndefined();
  });
});
