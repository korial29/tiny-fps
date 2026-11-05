import { describe, expect, it } from 'vitest';
import { GRAVITY, JUMP_SPEED, PLAYER_R, STEP_H } from './constants';
import { compile, sectorAt } from './level';
import { ROOF } from './map';
import { move, spawn } from './physics';
import { KEY } from './types';
import type { PlayerState } from './types';

const lvl = compile(ROOF);
const { sectors } = ROOF;
/** The highest a jump lifts the feet. */
const APEX = JUMP_SPEED ** 2 / (2 * GRAVITY);
/** Twice the area of a sector, positive when its corners run counter-clockwise. */
const area = ({ pts }: (typeof sectors)[number]) =>
  pts.reduce((sum, [x, z], i) => {
    const [nx, nz] = pts[(i + 1) % pts.length];
    return sum + (x * nz - nx * z);
  }, 0);

/** Sectors reached from the spawns, crossing a portal when the floor beyond is at most `rise` higher. */
const reach = (rise: number) => {
  const seen = new Set(ROOF.spawns.map(([x, z]) => sectorAt(lvl, x, z)));
  const todo = [...seen];
  while (todo.length) {
    const s = todo.pop()!;
    for (const e of lvl.edges) {
      if (e.front === s && e.back >= 0 && !seen.has(e.back)) {
        if (sectors[e.back].floor - sectors[s].floor <= rise) {
          seen.add(e.back);
          todo.push(e.back);
        }
      }
    }
  }
  return seen;
};
const heights = (seen: Set<number>) => new Set([...seen].map(s => sectors[s].floor));

describe('ROOF', () => {
  it('is named for the title screen, with a sky for a ceiling', () => {
    expect(ROOF.name).toBe('Rooftops');
    for (const s of sectors) {
      expect(s.ceil - s.floor).toBeGreaterThan(100);
    }
  });

  it('is a 40 x 40 m rooftop: counter-clockwise cells that tile it with no overlap', () => {
    expect(sectors.every(s => area(s) > 0)).toBe(true);
    expect(sectors.reduce((sum, s) => sum + area(s) / 2, 0)).toBeCloseTo(40 * 40);
    const xs = sectors.flatMap(s => s.pts.map(p => p[0]));
    const zs = sectors.flatMap(s => s.pts.map(p => p[1]));
    expect([Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)]).toEqual([
      0, 40, 0, 40,
    ]);
  });

  it('is shut by a wall on its edge, and by nothing else', () => {
    const walls = lvl.edges.filter(e => e.back < 0);
    expect(walls.length).toBeGreaterThan(0);
    for (const { ax, az, bx, bz } of walls) {
      const [x, z] = [(ax + bx) / 2, (az + bz) / 2];
      expect([x, z].some(v => v === 0 || v === 40)).toBe(true);
    }
    // Every other edge joins two cells.
    expect(lvl.edges.filter(e => e.back >= 0).length % 2).toBe(0);
  });

  it('puts every spawn on the deck, clear of the others and of the walls', () => {
    expect(ROOF.spawns.length).toBeGreaterThanOrEqual(4);
    for (const [x, z] of ROOF.spawns) {
      expect(sectors[sectorAt(lvl, x, z)].floor).toBe(0);
      expect(Math.min(x, z, 40 - x, 40 - z)).toBeGreaterThan(1.2 + PLAYER_R);
      for (const [u, v] of ROOF.spawns) {
        if (u !== x || v !== z) {
          expect(Math.hypot(u - x, v - z)).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });

  it('has a platform reached on foot by steps of at most STEP_H', () => {
    expect(heights(reach(STEP_H))).toContain(1.6);
    const steps = [...new Set(sectors.map(s => s.floor))].sort((a, b) => a - b);
    for (const [lo, hi] of [
      [0, 0.4],
      [0.4, 0.8],
      [0.8, 1.2],
      [1.2, 1.6],
    ]) {
      expect(steps).toContain(lo);
      expect(hi - lo).toBeLessThanOrEqual(STEP_H);
    }
  });

  it('keeps the crate for a jump, and the block out of reach of one', () => {
    expect(heights(reach(STEP_H))).not.toContain(2);
    expect(APEX).toBeGreaterThan(1);
    expect(heights(reach(APEX - 0.05))).toContain(1);
    expect(heights(reach(APEX - 0.05))).not.toContain(2);
  });

  it('lets a player run from a spawn up the steps onto the platform, then off its far edge', () => {
    const p: PlayerState = spawn(0, lvl, 5);
    let top = 0;
    for (let k = 0; k < 300; k++) {
      move(p, { seq: k, keys: KEY.FORWARD, yaw: 0, pitch: 0 }, lvl);
      top = Math.max(top, p.y);
    }
    expect(top).toBeCloseTo(1.6);
    // Stepped down onto the parapet and stopped by its wall.
    expect(p.y).toBeCloseTo(1);
    expect(p.z).toBeCloseTo(PLAYER_R, 2);
  });

  it('stops a player at the crate, and a jump puts them on it', () => {
    /** Runs east (+x) from the foot of the crate (x 7 to 9, 1 m high) for 12 steps, jumping first or not. */
    const run = (jump: boolean) => {
      const p: PlayerState = { ...spawn(0, lvl, 0), x: 7 - PLAYER_R, z: 17 };
      for (let k = 0; k < 60; k++) {
        const keys = (k < 12 ? KEY.FORWARD : 0) | (jump && k === 0 ? KEY.JUMP : 0);
        move(p, { seq: k, keys, yaw: (3 * Math.PI) / 2, pitch: 0 }, lvl);
      }
      return p;
    };
    expect(run(false)).toMatchObject({ x: expect.closeTo(7 - PLAYER_R, 2), y: 0 });
    expect(run(true)).toMatchObject({ y: 1, ground: true });
    expect(run(true).x).toBeGreaterThan(7);
  });
});
