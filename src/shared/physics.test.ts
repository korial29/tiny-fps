import { describe, expect, it } from 'vitest';
import {
  EYE,
  GRAVITY,
  JUMP_SPEED,
  MAX_PITCH,
  PLAYER_H,
  PLAYER_R,
  RUN_SPEED,
  TICK_HZ,
} from './constants';
import { YARD } from './map';
import { forward, move, spawn } from './physics';
import { KEY } from './types';
import type { Input, PlayerState } from './types';

const at = (x: number, z: number, yaw = 0): PlayerState => ({
  id: 0,
  x,
  y: 0,
  z,
  vy: 0,
  yaw,
  pitch: 0,
  ground: true,
});

/** Runs n steps of the same keys; `each` sees the state after every step. */
const run = (p: PlayerState, keys: number, n: number, yaw = p.yaw, each?: () => void): void => {
  for (let k = 0; k < n; k++) {
    move(p, { seq: k, keys, yaw, pitch: 0 }, YARD);
    each?.();
  }
};

const { FORWARD, BACK, LEFT, RIGHT, JUMP } = KEY;
const { w: W, d: D } = YARD;

describe('forward', () => {
  it('looks toward -z at yaw 0 and toward -x a quarter turn on', () => {
    expect(forward(0)[0]).toBeCloseTo(0);
    expect(forward(0)[1]).toBeCloseTo(-1);
    expect(forward(Math.PI / 2)[0]).toBeCloseTo(-1);
    expect(forward(Math.PI / 2)[1]).toBeCloseTo(0);
  });
});

describe('move: on the floor', () => {
  it('runs at RUN_SPEED along the facing, and strafes and backs off', () => {
    const p = at(20, 38);
    run(p, FORWARD, TICK_HZ);
    expect(p.z).toBeCloseTo(38 - RUN_SPEED);
    expect(p.x).toBeCloseTo(20);

    run(p, RIGHT, TICK_HZ);
    expect(p.x).toBeCloseTo(20 + RUN_SPEED);
    run(p, LEFT, TICK_HZ);
    run(p, BACK, TICK_HZ);
    expect(p.x).toBeCloseTo(20);
    expect(p.z).toBeCloseTo(38);
    expect(p.y).toBe(0);
    expect(p.ground).toBe(true);
  });

  it('moves along the facing whatever the yaw', () => {
    const p = at(30, 20);
    run(p, FORWARD, 30, Math.PI / 2);
    expect(p.x).toBeCloseTo(30 - RUN_SPEED / 2);
    expect(p.z).toBeCloseTo(20);
  });

  it('is no faster on a diagonal, and stands still on opposite keys', () => {
    const p = at(20, 38);
    run(p, FORWARD | RIGHT, TICK_HZ);
    expect(Math.hypot(p.x - 20, p.z - 38)).toBeCloseTo(RUN_SPEED);
    expect(p.x).toBeGreaterThan(20);
    expect(p.z).toBeLessThan(38);

    const q = at(20, 38);
    run(q, FORWARD | BACK | LEFT | RIGHT, 10);
    expect([q.x, q.z]).toEqual([20, 38]);
  });

  it('normalises yaw into [0, 2π) and clamps pitch', () => {
    const p = at(20, 20);
    const i: Input = { seq: 0, keys: 0, yaw: -0.5, pitch: 9 };
    move(p, i, YARD);
    expect(p.yaw).toBeCloseTo(2 * Math.PI - 0.5);
    expect(p.pitch).toBe(MAX_PITCH);
    move(p, { ...i, yaw: 7, pitch: -9 }, YARD);
    expect(p.yaw).toBeCloseTo(7 - 2 * Math.PI);
    expect(p.pitch).toBe(-MAX_PITCH);
  });

  it('is deterministic', () => {
    const a = at(5, 5);
    const b = at(5, 5);
    for (let k = 0; k < 300; k++) {
      const i = { seq: k, keys: (k * 7) % 32, yaw: k * 0.05, pitch: 0.1 };
      move(a, i, YARD);
      move(b, i, YARD);
    }
    expect(a).toEqual(b);
  });
});

describe('move: collisions', () => {
  it('cannot leave the yard, whatever the direction', () => {
    for (const [x, z] of [YARD.spawns[0], YARD.spawns[3], [20, 20]]) {
      for (let a = 0; a < 16; a++) {
        const p = at(x, z);
        run(p, FORWARD | (a % 2 ? LEFT : 0), 900, (a * Math.PI) / 8, () => {
          expect(p.x).toBeGreaterThanOrEqual(PLAYER_R - 1e-6);
          expect(p.x).toBeLessThanOrEqual(W - PLAYER_R + 1e-6);
          expect(p.z).toBeGreaterThanOrEqual(PLAYER_R - 1e-6);
          expect(p.z).toBeLessThanOrEqual(D - PLAYER_R + 1e-6);
        });
      }
    }
  });

  it('stops against a wall and slides along it', () => {
    const p = at(15, 38);
    run(p, FORWARD, 400);
    expect([p.x, p.z]).toEqual([15, PLAYER_R]);

    // Towards -x and +z at once: x stops at the west wall, z keeps going.
    const q = at(5, 10);
    run(q, FORWARD, 60, Math.PI / 2 + 0.6);
    expect(q.x).toBeCloseTo(PLAYER_R);
    const z = q.z;
    run(q, FORWARD, 60, Math.PI / 2 + 0.6);
    expect(q.x).toBeCloseTo(PLAYER_R);
    expect(q.z - z).toBeCloseTo(Math.sin(0.6) * RUN_SPEED);
  });

  it('reaches the corner of the yard instead of sticking before it', () => {
    const p = at(5, 5);
    run(p, FORWARD, 300, Math.PI / 4);
    expect(p.x).toBeCloseTo(PLAYER_R);
    expect(p.z).toBeCloseTo(PLAYER_R);
  });

  it('is blocked by a pillar and slides round its corner', () => {
    // Straight at the middle of the west face of the pillar [10, 12]².
    const p = at(5, 11);
    run(p, FORWARD, 120, (3 * Math.PI) / 2);
    expect(p.x).toBeCloseTo(10 - PLAYER_R);
    expect(p.z).toBeCloseTo(11);

    // Nearly diagonal at its corner: the player slides round it and gets past. (Dead on the
    // diagonal the push is exactly opposed to the move, like a ball on a hilltop: steer or strafe.)
    const q = at(5, 5);
    run(q, FORWARD, 100, (5 * Math.PI) / 4 + 0.05);
    expect(q.x).toBeGreaterThan(12);
    expect(q.z).toBeLessThan(10);
  });

  it('never ends up inside a box', () => {
    const p = at(5, 5);
    for (let k = 0; k < 2000; k++) {
      move(
        p,
        { seq: k, keys: FORWARD | (k % 90 < 45 ? LEFT : RIGHT), yaw: k * 0.013, pitch: 0 },
        YARD,
      );
      for (const b of YARD.boxes) {
        if (p.y < b.y1 - 0.01 && p.y + PLAYER_H > b.y0) {
          const dx = p.x - Math.min(Math.max(p.x, b.x0), b.x1);
          const dz = p.z - Math.min(Math.max(p.z, b.z0), b.z1);
          expect(Math.hypot(dx, dz)).toBeGreaterThanOrEqual(PLAYER_R - 1e-5);
        }
      }
    }
  });
});

describe('move: vertical', () => {
  it('jumps only from the ground, up to v² / 2g, and lands', () => {
    const p = at(15, 38);
    let top = 0;
    let air = 0;
    move(p, { seq: 0, keys: JUMP, yaw: 0, pitch: 0 }, YARD);
    run(p, 0, 60, 0, () => {
      top = Math.max(top, p.y);
      air += +!p.ground;
    });
    expect(top).toBeCloseTo((JUMP_SPEED * JUMP_SPEED) / (2 * GRAVITY), 3);
    // Up and down take 2 v / g seconds, 0.7 s = 42 steps (the first one counted above).
    expect(air).toBeGreaterThanOrEqual(40);
    expect(air).toBeLessThanOrEqual(42);
    expect(p).toMatchObject({ y: 0, vy: 0, ground: true });

    // No second jump in the air.
    const q = at(15, 38);
    move(q, { seq: 0, keys: JUMP, yaw: 0, pitch: 0 }, YARD);
    expect(q.ground).toBe(false);
    const vy = q.vy;
    move(q, { seq: 1, keys: JUMP, yaw: 0, pitch: 0 }, YARD);
    expect(q.vy).toBeCloseTo(vy - GRAVITY / TICK_HZ);
  });

  it('keeps its x and z moving in the air', () => {
    const p = at(15, 38);
    run(p, JUMP | FORWARD, 20);
    expect(p.z).toBeCloseTo(38 - 2);
    expect(p.y).toBeGreaterThan(0.5);
  });

  it('walks on the floor without a jump but not onto the platform', () => {
    const p = at(20, 30);
    run(p, FORWARD, 200);
    expect(p.z).toBeCloseTo(23 + PLAYER_R);
    expect(p.y).toBe(0);
  });

  it('lands on the platform after a jump, and walks over it', () => {
    const p = at(20, 25);
    // Jump forward from the edge, keep walking: lands on top, stays up, walks across.
    run(p, FORWARD | JUMP, 20);
    run(p, FORWARD, 20);
    expect(p.y).toBeCloseTo(0.8);
    expect(p.ground).toBe(true);
    expect(p.z).toBeLessThan(23);
    run(p, FORWARD, 40, 0, () => {
      expect(p.y).toBeCloseTo(0.8, 6);
      expect(p.ground).toBe(true);
    });
    expect(p.z).toBeLessThan(20);
    // Off the far edge: falls back to the floor.
    run(p, FORWARD, 40);
    expect(p.z).toBeLessThan(17);
    expect(p).toMatchObject({ y: 0, ground: true });
  });

  it('stays on the platform when its y is a millimetre low, as after the wire', () => {
    const p: PlayerState = { ...at(20, 20), y: 0.8 - 0.0012, ground: true };
    run(p, 0, 5);
    expect(p.y).toBeCloseTo(0.8, 9);
    expect([p.x, p.z]).toEqual([20, 20]);
    run(p, FORWARD | RIGHT, 20);
    expect(p.y).toBeCloseTo(0.8, 9);
  });

  it('bumps its head on a box bottom', () => {
    const map = {
      ...YARD,
      boxes: [{ x0: 10, y0: 2, z0: 10, x1: 14, y1: 3, z1: 14 }],
    };
    const p = at(12, 12);
    let top = 0;
    for (let k = 0; k < 60; k++) {
      move(p, { seq: k, keys: k ? 0 : JUMP, yaw: 0, pitch: 0 }, map);
      top = Math.max(top, p.y);
    }
    // The feet go no higher than 2 - PLAYER_H = 0.2 m, then fall back.
    expect(top).toBeCloseTo(2 - PLAYER_H);
    expect(p.ground).toBe(true);
  });
});

describe('spawn', () => {
  it('stands on the floor at the point, facing its yaw, modulo the count', () => {
    const [x, z, yaw] = YARD.spawns[1];
    const p = spawn(7, YARD, 1);
    expect(p).toEqual({ id: 7, x, y: 0, z, vy: 0, yaw, pitch: 0, ground: true });
    expect(spawn(7, YARD, 1 + YARD.spawns.length)).toEqual(p);
    expect(spawn(7, YARD, -1)).toEqual(spawn(7, YARD, YARD.spawns.length - 1));
  });

  it('puts every yard spawn clear of the boxes', () => {
    for (let n = 0; n < YARD.spawns.length; n++) {
      const p = spawn(0, YARD, n);
      const q = { ...p };
      move(q, { seq: 0, keys: 0, yaw: p.yaw, pitch: 0 }, YARD);
      expect([q.x, q.z]).toEqual([p.x, p.z]);
      expect(p.yaw).toBeGreaterThanOrEqual(0);
      expect(p.yaw).toBeLessThan(2 * Math.PI);
    }
  });

  it('keeps the eye inside the walls', () => {
    expect(EYE).toBeLessThan(PLAYER_H);
  });
});
