import { describe, expect, it } from 'vitest';
import { GRAVITY, JUMP_SPEED, PLAYER_H, PLAYER_R, STEP_H } from './constants';
import { ROOFTOPS } from './map';
import { move, spawn } from './physics';
import { KEY, TEX } from './types';
import type { PlayerState } from './types';
import { build } from './world';

const world = build(ROOFTOPS);
const { brushes, spawns } = ROOFTOPS;
/** The highest a jump lifts the feet. */
const APEX = JUMP_SPEED ** 2 / (2 * GRAVITY);

/** Whether the brush meets the open box of the standing cylinder at (x, z) from y to y + h. */
const meets = (b: (typeof brushes)[number], x: number, y: number, z: number, h: number) =>
  b.min[0] < x + PLAYER_R &&
  b.max[0] > x - PLAYER_R &&
  b.min[2] < z + PLAYER_R &&
  b.max[2] > z - PLAYER_R &&
  b.min[1] < y + h &&
  b.max[1] > y + 1e-6;

describe('ROOFTOPS', () => {
  it('is named for the title screen', () => {
    expect(ROOFTOPS.name).toBe('Rooftops');
  });

  it('has brushes with min below max on every axis, and textures that exist', () => {
    expect(brushes.length).toBeGreaterThan(20);
    const tex: number[] = Object.values(TEX);
    for (const [i, b] of brushes.entries()) {
      for (let a = 0; a < 3; a++) {
        expect(b.min[a], `brush ${i}, axis ${a}`).toBeLessThan(b.max[a]);
      }
      expect(tex).toContain(b.top);
      expect(tex).toContain(b.side);
      expect(b.tint?.every(c => c >= 0 && c <= 1) ?? true).toBe(true);
    }
  });

  it('keeps brushes out of each other: touching is fine, overlapping is not', () => {
    for (const [i, a] of brushes.entries()) {
      for (const [j, b] of brushes.entries()) {
        const overlap = [0, 1, 2].every(
          k => a.min[k] < b.max[k] - 1e-9 && b.min[k] < a.max[k] - 1e-9,
        );
        expect(i === j || !overlap, `brushes ${i} and ${j}`).toBe(true);
      }
    }
  });

  it('puts every spawn on a top, with room above it, outside every brush, clear of the others', () => {
    expect(spawns.length).toBeGreaterThanOrEqual(8);
    for (const [n, [x, y, z]] of spawns.entries()) {
      const under = brushes.filter(
        b => b.min[0] < x && x < b.max[0] && b.min[2] < z && z < b.max[2],
      );
      expect(
        under.some(b => b.max[1] === y),
        `spawn ${n}: a top at ${y}`,
      ).toBe(true);
      // A whole body stands there: nothing within the cylinder's box from the feet up to the head.
      expect(
        brushes.some(b => meets(b, x, y, z, PLAYER_H)),
        `spawn ${n}: room`,
      ).toBe(false);
      for (const [m, [u, , v]] of spawns.entries()) {
        expect(m === n || Math.hypot(u - x, v - z) >= 2, `spawns ${n} and ${m}`).toBe(true);
      }
      // Standing, not falling, and well above the kill floor.
      const p = spawn(0, world, n);
      move(p, { seq: 0, keys: 0, yaw: p.yaw, pitch: 0 }, world);
      expect(p).toEqual(spawn(0, world, n));
      expect(y).toBeGreaterThan(ROOFTOPS.floor + 20);
    }
  });

  it('has a kill floor well below every roof, a unit sun above the horizon and a sky', () => {
    const lowest = Math.min(...brushes.map(b => b.max[1]));
    expect(ROOFTOPS.floor).toBeLessThan(lowest - 20);
    const { dir, color } = ROOFTOPS.sun;
    expect(Math.hypot(...dir)).toBeCloseTo(1, 6);
    expect(dir[1]).toBeGreaterThan(0.3);
    expect(dir[1]).toBeLessThan(0.9);
    expect(Math.max(...color)).toBeGreaterThan(1);
    const [zenith, horizon] = ROOFTOPS.sky;
    // Blue overhead, paler at the horizon.
    expect(zenith[2]).toBeGreaterThan(zenith[0]);
    expect(Math.min(...horizon)).toBeGreaterThan(Math.min(...zenith));
    // A light haze.
    expect(ROOFTOPS.fog![3]).toBeGreaterThan(0);
    expect(ROOFTOPS.fog![3]).toBeLessThanOrEqual(0.02);
  });

  describe('walked with the real physics', () => {
    /**
     * Steers the player toward (x, z) with the forward key, jumping on every step when `jump`,
     * until within a step of it or `max` steps; then lets it settle to the ground.
     */
    const go = (p: PlayerState, [x, z]: [number, number], jump = false, max = 600) => {
      for (let k = 0; k < max; k++) {
        const [dx, dz] = [x - p.x, z - p.z];
        if (Math.hypot(dx, dz) < 0.1) {
          break;
        }
        const keys = KEY.FORWARD | (jump ? KEY.JUMP : 0);
        move(p, { seq: k, keys, yaw: Math.atan2(-dx, -dz), pitch: 0 }, world);
      }
      for (let k = 0; k < 120 && !p.ground; k++) {
        move(p, { seq: k, keys: 0, yaw: p.yaw, pitch: 0 }, world);
      }
    };
    /** A run of legs: walk to each point, the ones marked `true` hopping all the way. */
    const route = (p: PlayerState, legs: ([number, number] | [number, number, true])[]) =>
      legs.forEach(([x, z, jump]) => go(p, [x, z], jump));
    const on = (p: PlayerState, y: number, [x0, z0, x1, z1]: number[]) =>
      p.ground && p.y === Math.fround(y) && p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1;

    it('crosses the 2.5 m gap from the start roof to the next one with a jump', () => {
      const p = spawn(0, world, 2);
      route(p, [
        [16, 72],
        [16, 56.6],
        [16, 50, true],
      ]);
      expect(on(p, 10, [4, 36, 24, 53.5])).toBe(true);
    });

    /**
     * Holds the keys until the player is put back at a spawn (feet jump up by over 5 m), at most
     * `max` steps. Returns the lowest feet height seen, and whether it respawned.
     */
    const fall = (p: PlayerState, keys: number, yaw: number, max = 800) => {
      let low = Infinity;
      for (let k = 0; k < max; k++) {
        const y = p.y;
        move(p, { seq: k, keys, yaw, pitch: 0 }, world);
        low = Math.min(low, p.y);
        if (p.y > y + 5) {
          return { low, respawned: true };
        }
      }
      return { low, respawned: false };
    };

    it('does not cross it with a walk: it falls and respawns at the spawn of its id', () => {
      const p = spawn(0, world, 2);
      go(p, [16, 60]);
      const r = fall(p, KEY.FORWARD, 0);
      expect(r.respawned).toBe(true);
      expect(r.low).toBeLessThan(ROOFTOPS.floor + 1);
      expect(p).toMatchObject({ ...spawn(0, world, 0), yaw: 0 });
    });

    it('climbs the stair onto the platform, passing 0.4 m steps, and walks under it', () => {
      const p = spawn(0, world, 2);
      route(p, [
        [16, 72],
        [16, 56.6],
        [16, 50, true],
        [13, 53.2],
      ]);
      let top = 0;
      for (let k = 0; k < 240 && p.z > 39.6; k++) {
        const [dx, dz] = [13 - p.x, 39.6 - p.z];
        move(p, { seq: k, keys: KEY.FORWARD, yaw: Math.atan2(-dx, -dz), pitch: 0 }, world);
        top = Math.max(top, p.y);
      }
      expect(on(p, 12.6, [9, 39, 19, 47])).toBe(true);
      expect(top).toBe(Math.fround(12.6));

      // Under it: the same roof, 2.2 m clear, and a jump bumps the head.
      const q = spawn(0, world, 2);
      route(q, [
        [16, 72],
        [16, 56.6],
        [16, 50, true],
        [16, 43],
      ]);
      expect(on(q, 10, [9, 39, 19, 47])).toBe(true);
      let high = 0;
      move(q, { seq: 0, keys: KEY.JUMP, yaw: 0, pitch: 0 }, world);
      for (let k = 0; k < 60; k++) {
        move(q, { seq: k, keys: 0, yaw: 0, pitch: 0 }, world);
        high = Math.max(high, q.y);
      }
      expect(high).toBeCloseTo(12.2 - PLAYER_H, 3);
    });

    it('crosses the 3 m gap from the platform to the high roof, then drops to the east roof', () => {
      const p = spawn(0, world, 2);
      route(p, [
        [16, 72],
        [16, 56.6],
        [16, 50, true],
        [13, 53.2],
        [13, 39.6],
        [13, 32, true],
      ]);
      expect(on(p, 12.4, [4, 20, 24, 36])).toBe(true);
      // Over the pipe lying along it (a 0.45 m step), to the east edge, and a jump down 4.4 m.
      route(p, [
        [16, 25],
        [23.4, 25],
        [31, 25, true],
      ]);
      expect(on(p, 8, [27, 20, 47, 50])).toBe(true);
    });

    it('goes round the wall and the lintel, and over the beam to the far roof', () => {
      const p = spawn(0, world, 2);
      route(p, [
        [16, 72],
        [16, 56.6],
        [16, 50, true],
        [13, 53.2],
        [13, 39.6],
        [13, 32, true],
        [16, 25],
        [23.4, 25],
        [31, 25, true],
        // The 1 m way round the lintel, then east past the end of the wall, then the beam.
        [27.3, 26],
        [27.3, 49],
        [41.75, 49.2],
        [41.75, 62],
      ]);
      expect(on(p, 8, [27, 60, 47, 76])).toBe(true);
    });

    it('cannot cross the 8 m gap to the north roof: it falls and respawns', () => {
      const p = spawn(0, world, 2);
      route(p, [
        [16, 72],
        [16, 56.6],
        [16, 50, true],
        [13, 53.2],
        [13, 39.6],
        [13, 32, true],
        [14, 21],
      ]);
      expect(p.y).toBe(Math.fround(12.4));
      // Hopping north from the edge: the first jump lands in the gap, and the far side is a wall.
      const r = fall(p, KEY.FORWARD | KEY.JUMP, 0);
      expect(r.respawned).toBe(true);
      expect(r.low).toBeLessThan(ROOFTOPS.floor + 1);
      expect(p).toMatchObject({ y: 10, ground: true });
    });

    it('stops at the lintel: a 1.2 m low gap is too low to walk under yet', () => {
      const p = spawn(0, world, 2);
      route(p, [
        [16, 72],
        [16, 56.6],
        [16, 50, true],
        [13, 53.2],
        [13, 39.6],
        [13, 32, true],
        [16, 25],
        [23.4, 25],
        [31, 25, true],
        [29, 26],
        [29, 45],
      ]);
      expect(p.z).toBeCloseTo(44 - PLAYER_R, 2);
      expect(p.y).toBe(8);
      expect(9.2 - 8).toBeLessThan(PLAYER_H);
    });

    it('keeps its ledges, 1.5 to 2.5 m high, out of reach of a jump', () => {
      // Each: where to run from, which way (yaw), the floor under the player and the top.
      const ledges: [from: [number, number], yaw: number, floor: number, top: number][] = [
        [[32, 22], Math.PI, 8, 10],
        [[42, 24], Math.PI, 8, 10.2],
        [[16, 40.5], 0, 10, 12.4],
      ];
      for (const [[x, z], yaw, floor, top] of ledges) {
        expect(top - floor).toBeGreaterThanOrEqual(1.5);
        expect(top - floor).toBeLessThanOrEqual(2.5);
        expect(top - floor).toBeGreaterThan(APEX + STEP_H);
        const p: PlayerState = { ...spawn(0, world, 0), x, y: floor, z };
        let high = 0;
        for (let k = 0; k < 200; k++) {
          move(p, { seq: k, keys: KEY.FORWARD | KEY.JUMP, yaw, pitch: 0 }, world);
          high = Math.max(high, p.y);
        }
        expect(high - floor, `ledge ${top}`).toBeLessThan(APEX + 1e-3);
      }
    });

    it('has a long wall, a stretch of floor beside it, and a pipe and poles as narrow boxes', () => {
      const wall = brushes.find(
        b => b.max[1] - b.min[1] > 6 && b.max[0] - b.min[0] <= 2 && b.max[2] - b.min[2] > 20,
      )!;
      expect(wall).toBeDefined();
      // Over 4 m clear above the roof it stands on, and 9 m of floor to run on beside it.
      expect(wall.max[1] - 8).toBeGreaterThan(4);
      const beside = brushes.find(b => b.max[1] === 8 && b.min[0] <= wall.min[0] - 9)!;
      expect(beside).toBeDefined();
      const narrow = brushes.filter(b => b.max[0] - b.min[0] < 1 || b.max[2] - b.min[2] < 1);
      expect(narrow.length).toBeGreaterThanOrEqual(4);
    });
  });
});
