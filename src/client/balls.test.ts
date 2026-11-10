import { describe, expect, it } from 'vitest';
import {
  EYE,
  GRAVITY,
  GUN_RANGE,
  INTERP_DELAY,
  NADE,
  NADE_COOL,
  PLASMA_R,
  PLASMA_SPEED,
  TICK_HZ,
} from '../shared/constants';
import { STILL } from '../shared/physics';
import { fly, launch, lob, toss } from '../shared/plasma';
import type { Ball, PlayerState } from '../shared/types';
import { build } from '../shared/world';
import { CATCH, TRAIL, createBalls } from './balls';
import type { Vec3 } from './mesh';

/** A roof, and a wall across z = -20. */
const WORLD = build({
  brushes: [
    { min: [-50, -30, -50], max: [50, 0, 50], top: 0, side: 0 },
    { min: [-50, 0, -21], max: [50, 8, -20], top: 0, side: 0 },
  ],
  teams: [
    { base: [0, 0, 0], spawns: [[0, 0, 0, 0]] },
    { base: [0, 0, 0], spawns: [[0, 0, 0, 0]] },
  ],
  floor: -25,
  sun: { dir: [0, 1, 0], color: [1, 1, 1] },
  sky: [
    [0, 0, 1],
    [1, 1, 1],
  ],
});

/** The own player (id 1) at the origin looking along -z, after a step that fired his shot `shots`. */
const me = (o: Partial<PlayerState> = {}): PlayerState => ({
  id: 1,
  x: 0,
  y: 0,
  z: 0,
  vy: 0,
  yaw: 0,
  pitch: 0,
  ground: true,
  ...STILL,
  shots: 7,
  ...o,
});
const MUZZLE: Vec3 = [0.2, 1.4, -0.5];
const muzzle = () => MUZZLE;
/** Metres a ball flies in `ms`. */
const flown = (ms: number) => (PLASMA_SPEED * ms) / 1000;
const near = (a: Vec3, b: Vec3, d = 1e-6) => Math.hypot(...a.map((v, i) => v - b[i])) < d;

describe('an own ball', () => {
  it('is drawn at once out of the muzzle, and joins the line from the eye in CATCH seconds', () => {
    const b = createBalls(WORLD);
    b.fire(me(), 1000);
    const first = b.frame(1000, muzzle);
    expect(first.orbs).toHaveLength(1);
    expect(first.orbs[0].p).toEqual(MUZZLE);
    expect(first.orbs[0].d).toEqual([expect.closeTo(0, 9), 0, -1]);
    expect(first.orbs[0].tail).toBe(0);
    // Half way through the catch it is between the muzzle and the line.
    const mid = b.frame(1000 + (CATCH * 1000) / 2, muzzle).orbs[0].p;
    expect(mid[0]).toBeGreaterThan(0);
    expect(mid[0]).toBeLessThan(MUZZLE[0]);
    // Then on the line, PLASMA_SPEED out, with its trail.
    const t = 1000 + CATCH * 1000 + 50;
    const [o] = b.frame(t, muzzle).orbs;
    expect(o.p).toEqual([expect.closeTo(0, 9), expect.closeTo(EYE, 9), -flown(t - 1000)]);
    expect(o.tail).toBe(TRAIL);
  });

  it('bursts on the wall where the host’s ball does, once, and is then gone', () => {
    const b = createBalls(WORLD);
    b.fire(me(), 0);
    const host = launch(me());
    fly(WORLD, host, GUN_RANGE, []);
    expect(host.burst).toBe(true);
    // Just short of the wall: still flying.
    const wall = (20 - PLASMA_R) / PLASMA_SPEED;
    expect(b.frame(wall * 1000 - 5, muzzle)).toMatchObject({ bursts: [] });
    const { orbs, bursts } = b.frame(wall * 1000 + 5, muzzle);
    expect(orbs).toEqual([]);
    expect(bursts).toHaveLength(1);
    expect(near(bursts[0][0], [host.x, host.y, host.z])).toBe(true);
    expect(b.frame(2000, muzzle)).toEqual({ orbs: [], bursts: [] });
  });

  it('goes out of sight at GUN_RANGE with no burst in the open', () => {
    const b = createBalls(WORLD);
    b.fire(me({ yaw: Math.PI }), 0);
    expect(b.frame(1000, muzzle).orbs).toHaveLength(1);
    const end = (GUN_RANGE / PLASMA_SPEED) * 1000;
    expect(b.frame(end + 1, muzzle)).toEqual({ orbs: [], bursts: [] });
  });

  it('takes from the host only where it burst: its flight is the own one', () => {
    const b = createBalls(WORLD);
    b.fire(me(), 0);
    const ball = (z: number, burst = false): Ball => ({
      id: 7,
      by: 1,
      x: 0,
      y: EYE,
      z,
      dx: 0,
      dy: 0,
      dz: -1,
      burst,
    });
    // The host's copy is ahead (the lag): it is not drawn.
    b.snapshot([ball(-6)], 1, 50);
    expect(b.frame(100, muzzle).orbs).toHaveLength(1);
    // It burst on a body at 8 m: the own ball bursts there when it gets there.
    b.snapshot([ball(-8, true)], 1, 120);
    const at = (8 / PLASMA_SPEED) * 1000;
    expect(b.frame(at - 5, muzzle).bursts).toEqual([]);
    expect(b.frame(at + 5, muzzle).bursts).toEqual([[[0, EYE, -8], 1]]);
    // A burst behind it ends it at once.
    b.fire(me({ shots: 8 }), 1000);
    b.frame(1300, muzzle);
    b.snapshot([{ ...ball(-2, true), id: 8 }], 1, 1310);
    expect(b.frame(1320, muzzle)).toEqual({ orbs: [], bursts: [[[0, EYE, -2], 1]] });
  });

  it('is not burst twice: the host’s word of a burst it already had changes nothing', () => {
    const b = createBalls(WORLD);
    b.fire(me(), 0);
    expect(b.frame(1000, muzzle).bursts).toHaveLength(1);
    const late: Ball = { id: 7, by: 1, x: 0, y: EYE, z: -19.88, dx: 0, dy: 0, dz: -1, burst: true };
    b.snapshot([{ ...late, burst: false }], 1, 1010);
    b.snapshot([late], 1, 1050);
    for (const t of [1100, 1200, 1300]) {
      expect(b.frame(t, muzzle)).toEqual({ orbs: [], bursts: [] });
    }
  });
});

describe('the others’ balls', () => {
  const ball = (o: Partial<Ball> = {}): Ball => ({
    id: 3,
    by: 2,
    x: 10,
    y: 1.6,
    z: 0,
    dx: -1,
    dy: 0,
    dz: 0,
    burst: false,
    ...o,
  });

  it('are drawn INTERP_DELAY late, from the shooter’s muzzle, then flying on from the last place sent', () => {
    const b = createBalls(WORLD);
    const gun: Vec3 = [10.3, 1.4, 0.2];
    const where = (id: number) => (id == 2 ? gun : undefined);
    b.snapshot([ball()], 1, 1000);
    expect(b.frame(1000 + INTERP_DELAY - 1, where).orbs).toEqual([]);
    expect(b.frame(1000 + INTERP_DELAY, where).orbs[0].p).toEqual(gun);
    // On its line once caught, at the speed, from where the snapshot put it then.
    const t = 1000 + INTERP_DELAY + CATCH * 1000 + 20;
    const p = b.frame(t, where).orbs[0].p;
    expect(p).toEqual([expect.closeTo(10 - flown(t - INTERP_DELAY - 1000), 9), 1.6, 0]);
    // A new snapshot puts it right: the line goes on from there.
    b.snapshot([ball({ x: 8, z: 0.1 })], 1, 1050);
    const q = b.frame(t, where).orbs[0].p;
    expect(q[0]).toBeCloseTo(8 - flown(t - INTERP_DELAY - 1050), 9);
    expect(q[2]).toBeCloseTo(0.1, 9);
  });

  it('burst where the host says, when they get there as drawn, and at the latest at its time', () => {
    const b = createBalls(WORLD);
    b.snapshot([ball()], 1, 1000);
    b.snapshot([ball({ x: 9, burst: true })], 1, 1033);
    // As drawn, it reaches x = 9 25 ms after it was at 10.
    const at = 1000 + INTERP_DELAY + 25;
    expect(b.frame(at - 2, muzzle).bursts).toEqual([]);
    expect(b.frame(at + 2, muzzle)).toEqual({ orbs: [], bursts: [[[9, 1.6, 0], 1]] });
    // One first seen burst (fired and burst between two snapshots) bursts once, at its time.
    b.snapshot([ball({ id: 4, x: 3, burst: true })], 1, 2000);
    expect(b.frame(2000 + INTERP_DELAY - 1, muzzle)).toEqual({ orbs: [], bursts: [] });
    expect(b.frame(2000 + INTERP_DELAY, muzzle)).toEqual({ orbs: [], bursts: [[[3, 1.6, 0], 1]] });
    expect(b.frame(2200, muzzle)).toEqual({ orbs: [], bursts: [] });
  });

  it('are gone with no burst when the host stops sending them', () => {
    const b = createBalls(WORLD);
    b.snapshot([ball()], 1, 1000);
    b.snapshot([], 1, 1033);
    expect(b.frame(1033 + INTERP_DELAY - 1, muzzle).orbs).toHaveLength(1);
    expect(b.frame(1033 + INTERP_DELAY, muzzle)).toEqual({ orbs: [], bursts: [] });
  });

  it('take a ball of the own id the client does not know as anyone’s: after a reload, say', () => {
    const b = createBalls(WORLD);
    b.snapshot([ball({ by: 1 })], 1, 1000);
    expect(b.frame(1000 + INTERP_DELAY, muzzle).orbs).toHaveLength(1);
  });
});

describe('a grenade', () => {
  /** The own player after the step that launched a grenade, looking up a little. */
  const lobber = (o: Partial<PlayerState> = {}) =>
    me({ rifled: true, rifle: 100, lob: NADE_COOL, pitch: 0.3, ...o });
  const TICK = 1000 / TICK_HZ;

  it('of the own player flies the ticks the host’s toss() gives it, and bursts where the host’s does', () => {
    const b = createBalls(WORLD);
    b.fire(lobber(), 0);
    const host = lob(lobber());
    const path: Vec3[] = [];
    while (!host.burst) {
      toss(WORLD, host, []);
      path.push([host.x, host.y, host.z]);
    }
    // On the wall, a ball's radius off it.
    expect(path.at(-1)![2]).toBeGreaterThanOrEqual(-20);
    expect(path.at(-1)![2]).toBeLessThan(-20 + PLASMA_R + 1e-3);
    expect(b.frame(0, muzzle).orbs[0].p).toEqual(MUZZLE);
    for (const k of [10, 17, 25]) {
      const [o] = b.frame(k * TICK, muzzle).orbs;
      expect(o.power).toBe(NADE);
      expect(near(o.p, path[k - 1], 1e-3), `tick ${k}`).toBe(true);
    }
    // It falls: its direction dips from one tick to a later one.
    const dy = [10, 25].map(k => b.frame(k * TICK + 1, muzzle).orbs[0].d[1]);
    expect(dy[1]).toBeLessThan(dy[0]);
    const { orbs, bursts } = b.frame(path.length * TICK + 1, muzzle);
    expect(orbs).toEqual([]);
    expect(bursts).toEqual([[path.at(-1), NADE]]);
    // Once: the host's word of the burst does not burst it again.
    b.snapshot([{ ...host, burst: true }], 1, path.length * TICK + 20);
    expect(b.frame(path.length * TICK + 200, muzzle)).toEqual({ orbs: [], bursts: [] });
  });

  it('of the own player bursts short, where the host says it met a body', () => {
    const b = createBalls(WORLD);
    b.fire(lobber(), 0);
    const host = lob(lobber());
    for (let k = 0; k < 12; k++) {
      toss(WORLD, host, []);
    }
    const at: Vec3 = [host.x, host.y, host.z];
    b.snapshot([{ ...host, burst: true }], 1, 5 * TICK);
    expect(b.frame(10 * TICK, muzzle).bursts).toEqual([]);
    const { orbs, bursts } = b.frame(14 * TICK, muzzle);
    expect(orbs).toEqual([]);
    expect(bursts).toEqual([[at, NADE]]);
  });

  it('of another player arcs on from the last snapshot under gravity, and bursts where the host says', () => {
    const b = createBalls(WORLD);
    const d: Vec3 = [0, 0.6, -0.8];
    const ball: Ball = {
      id: 3,
      by: 2,
      x: 1,
      y: 2,
      z: -3,
      dx: d[0],
      dy: d[1],
      dz: d[2],
      burst: false,
      power: NADE,
      v: 30,
    };
    b.snapshot([ball], 1, 1000);
    // Drawn INTERP_DELAY late: 0.2 s after the place of the snapshot.
    expect(b.frame(1000 + INTERP_DELAY, muzzle).orbs).toHaveLength(1);
    const [o] = b.frame(1000 + INTERP_DELAY + 200 + CATCH * 1000, muzzle).orbs;
    const t = 0.2 + CATCH;
    expect(o.power).toBe(NADE);
    expect(near(o.p, [1, 2 + 18 * t - 0.5 * GRAVITY * t * t, -3 - 24 * t], 1e-6)).toBe(true);
    expect(o.d[1]).toBeLessThan(d[1]);
    const at: Vec3 = [1, 0.12, -12];
    b.snapshot([{ ...ball, x: at[0], y: at[1], z: at[2], burst: true }], 1, 1500);
    expect(b.frame(1500 + INTERP_DELAY - 1, muzzle).bursts).toEqual([]);
    expect(b.frame(1500 + INTERP_DELAY, muzzle)).toEqual({ orbs: [], bursts: [[at, NADE]] });
  });
});
