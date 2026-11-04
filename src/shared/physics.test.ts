import { describe, expect, it } from 'vitest';
import {
  EYE,
  FIRE_EVERY,
  FIRE_SLOW,
  GRAVITY,
  JUMP_SPEED,
  MAX_PITCH,
  PLAYER_H,
  PLAYER_R,
  RUN_SPEED,
  TICK_HZ,
} from './constants';
import { bar, compile, sectorAt } from './level';
import { HALL } from './map';
import { fly, forward, move, spawn } from './physics';
import { ITEM, KEY, PHASE, TEX } from './types';
import type { Input, Level, MapDef, PlayerState, Sector } from './types';

const lvl = compile(HALL);
const { FORWARD, BACK, LEFT, RIGHT, JUMP, FIRE } = KEY;

// Yaws: forward(yaw) = (-sin, -cos), so these face -z, +x, +z and -x.
const NORTH = 0;
const EAST = (3 * Math.PI) / 2;
const SOUTH = Math.PI;
const WEST = Math.PI / 2;

/** A standing player on the floor of the sector under (x, z). */
const at = (x: number, z: number, level: Level = lvl): PlayerState => ({
  id: 0,
  x,
  y: level.map.sectors[sectorAt(level, x, z)].floor,
  z,
  vy: 0,
  yaw: 0,
  pitch: 0,
  ground: true,
  cool: 0,
});

/** Runs n steps of the same keys; `each` sees the state after every step. */
const run = (
  p: PlayerState,
  keys: number,
  n: number,
  yaw = p.yaw,
  each?: (k: number) => void,
  level: Level = lvl,
): void => {
  for (let k = 0; k < n; k++) {
    move(p, { seq: k, keys, yaw, pitch: 0 }, level);
    each?.(k);
  }
};

const sector = (pts: [number, number][], floor: number, ceil = 5): Sector => ({
  pts,
  floor,
  ceil,
  ft: TEX.TILE,
  wt: TEX.BRICK,
  ct: TEX.STONE,
});

/** A 10 m room (x 0 to 10) and a 10 m room beside it, the second one `step` higher. */
const stepped = (step: number): Level =>
  compile({
    sectors: [
      sector(
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
        ],
        1,
      ),
      sector(
        [
          [10, 0],
          [20, 0],
          [20, 10],
          [10, 10],
        ],
        1 + step,
      ),
    ],
    spawns: [[5, 5, 0]],
  });

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
    const p = at(2, 8);
    run(p, FORWARD, TICK_HZ, EAST);
    expect(p.x).toBeCloseTo(2 + RUN_SPEED);
    expect(p.z).toBeCloseTo(8);

    run(p, RIGHT, TICK_HZ, EAST);
    expect(p.z).toBeCloseTo(8 + RUN_SPEED);
    run(p, LEFT, TICK_HZ, EAST);
    run(p, BACK, TICK_HZ, EAST);
    expect(p.x).toBeCloseTo(2);
    expect(p.z).toBeCloseTo(8);
    expect(p.y).toBe(1);
    expect(p.ground).toBe(true);
  });

  it('moves along the facing whatever the yaw', () => {
    const p = at(12, 8);
    run(p, FORWARD, 30, WEST);
    expect(p.x).toBeCloseTo(12 - RUN_SPEED / 2);
    expect(p.z).toBeCloseTo(8);
  });

  it('is no faster on a diagonal, and stands still on opposite keys', () => {
    const p = at(4, 12);
    run(p, FORWARD | RIGHT, 30, NORTH);
    expect(Math.hypot(p.x - 4, p.z - 12)).toBeCloseTo(RUN_SPEED / 2);
    expect(p.x).toBeGreaterThan(4);
    expect(p.z).toBeLessThan(12);

    const q = at(4, 12);
    run(q, FORWARD | BACK | LEFT | RIGHT, 10);
    expect([q.x, q.z]).toEqual([4, 12]);
  });

  it('normalises yaw into [0, 2π) and clamps pitch', () => {
    const p = at(8, 8);
    const i: Input = { seq: 0, keys: 0, yaw: -0.5, pitch: 9 };
    move(p, i, lvl);
    expect(p.yaw).toBeCloseTo(2 * Math.PI - 0.5);
    expect(p.pitch).toBe(MAX_PITCH);
    move(p, { ...i, yaw: 7, pitch: -9 }, lvl);
    expect(p.yaw).toBeCloseTo(7 - 2 * Math.PI);
    expect(p.pitch).toBe(-MAX_PITCH);
  });

  it('is deterministic, and a standing player stays put', () => {
    const a = at(5, 5);
    const b = at(5, 5);
    for (let k = 0; k < 300; k++) {
      const i = { seq: k, keys: (k * 7) % 32, yaw: k * 0.05, pitch: 0.1 };
      move(a, i, lvl);
      move(b, i, lvl);
    }
    expect(a).toEqual(b);

    const c = at(8, 8);
    run(c, 0, 120);
    expect(c).toMatchObject({ x: 8, y: 1, z: 8, vy: 0, ground: true });
  });
});

describe('move: walls', () => {
  it('stops against a wall and slides along it', () => {
    const p = at(8, 8);
    run(p, FORWARD, 200, WEST);
    expect([p.x, p.z]).toEqual([Math.fround(PLAYER_R), 8]);

    // Towards -z and +x at once: z stops at the north wall, x keeps going at the rest of the speed.
    const q = at(2, 8);
    run(q, FORWARD, 100, -0.6);
    expect(q.z).toBeCloseTo(PLAYER_R);
    const x = q.x;
    run(q, FORWARD, 30, -0.6);
    expect(q.z).toBeCloseTo(PLAYER_R);
    expect(q.x - x).toBeCloseTo(0.5 * Math.sin(0.6) * RUN_SPEED);
  });

  it('slides round a convex corner: the jamb of the corridor, entering at an angle', () => {
    // From (12, 2) towards the doorway of the corridor, aiming a little inside the jamb (16, 6).
    const p = at(12, 2);
    run(p, FORWARD, 80, (5 * Math.PI) / 4 - 0.05, () => {
      expect(Math.hypot(p.x - 16, p.z - 6)).toBeGreaterThanOrEqual(p.x < 16 ? PLAYER_R - 1e-6 : 0);
    });
    expect(sectorAt(lvl, p.x, p.z)).not.toBe(0);
    expect(p.x).toBeGreaterThan(17);

    // A mirror run at the other jamb (16, 10), from the south.
    const q = at(12, 14);
    run(q, FORWARD, 80, (7 * Math.PI) / 4 + 0.05);
    expect(q.x).toBeGreaterThan(17);
    expect(q.z).toBeLessThan(10);
  });

  it('pushes a player standing on a wall back inside', () => {
    const p = at(8, 8);
    p.x = 0;
    run(p, 0, 1);
    expect([p.x, p.z]).toEqual([Math.fround(PLAYER_R), 8]);
  });

  it('is stopped by the jamb when it aims into the wall beside the doorway', () => {
    const p = at(12, 3);
    run(p, FORWARD, 100, EAST);
    expect(p.x).toBeCloseTo(16 - PLAYER_R);
    expect(p.z).toBeCloseTo(3);
  });

  it('never gets stuck on a collinear split point inside a straight wall', () => {
    // East wall x = 10 in two pieces, split at z = 4; the player leans into it along its length.
    const wall = compile({
      sectors: [
        sector(
          [
            [0, 0],
            [10, 0],
            [10, 4],
            [10, 10],
            [0, 10],
          ],
          1,
        ),
      ],
      spawns: [[5, 5, 0]],
    });
    for (const [z0, yaw, dz] of [
      [0.6, SOUTH + 0.2, 1],
      [9.4, NORTH - 0.2, -1],
    ] as const) {
      const p = at(9, z0, wall);
      let last = p.z;
      run(
        p,
        FORWARD,
        70,
        yaw,
        () => {
          // The same stride every step, before, on and after the split point.
          expect((p.z - last) * dz).toBeCloseTo(
            RUN_SPEED / TICK_HZ / Math.hypot(1, Math.tan(0.2)),
            3,
          );
          expect(p.x).toBeLessThanOrEqual(10 - PLAYER_R + 1e-6);
          last = p.z;
        },
        wall,
      );
    }
    // The doorway side of HALL: along room 0's east wall up to the jamb, no stall either.
    const q = at(15, 1);
    let last = q.z;
    run(q, FORWARD, 40, SOUTH + 0.2, () => {
      expect(q.z - last).toBeGreaterThan(0.09);
      last = q.z;
    });
  });

  it('never ends up inside a wall, in the corners either', () => {
    for (const [x, z] of [
      [1, 1],
      [15, 15],
      [15, 1],
      [22, 15],
    ]) {
      for (let a = 0; a < 16; a++) {
        const p = at(x, z);
        run(p, FORWARD | (a % 2 ? LEFT : 0), 300, (a * Math.PI) / 8, () => {
          expect(sectorAt(lvl, p.x, p.z)).toBeGreaterThanOrEqual(0);
        });
      }
    }
  });
});

describe('move: heights', () => {
  it('walks up the stairs without a jump, 0.4 m at a time, and down again', () => {
    const p = at(30, 14.5);
    let y = p.y;
    run(p, FORWARD, 80, SOUTH, () => {
      expect(p.y).toBeGreaterThanOrEqual(y);
      y = p.y;
    });
    // Past the stairs (z 16 to 19), on the balcony (floor 2.6).
    expect(p.z).toBeGreaterThan(20);
    expect(p).toMatchObject({ y: Math.fround(2.6), ground: true });

    run(p, FORWARD, 80, NORTH);
    expect(p.z).toBeLessThan(15);
    expect(p).toMatchObject({ y: 1, ground: true });
    expect(sectorAt(lvl, p.x, p.z)).toBe(5);
  });

  it('climbs a step of STEP_H at once, and needs a jump for a higher one', () => {
    const low = stepped(0.5);
    const p = at(6, 5, low);
    run(p, FORWARD, 60, EAST, undefined, low);
    expect(p).toMatchObject({ y: 1.5, ground: true });
    expect(p.x).toBeGreaterThan(10);

    const high = stepped(1);
    const q = at(6, 5, high);
    run(q, FORWARD, 80, EAST, undefined, high);
    expect(q.x).toBeCloseTo(10 - PLAYER_R);
    expect(q.y).toBe(1);

    // A jump clears it: the feet are within STEP_H of the floor when they reach the edge.
    const r = at(7, 5, high);
    run(r, FORWARD | JUMP, 1, EAST, undefined, high);
    run(r, FORWARD, 50, EAST, undefined, high);
    expect(r.x).toBeGreaterThan(10);
    expect(r).toMatchObject({ y: 2, ground: true });
  });

  it('cannot reach the balcony from the hall floor except by the stairs', () => {
    // Beside the stairs the south wall of the hall is solid, and the balcony floor is 1.6 m up.
    const p = at(24, 14);
    run(p, FORWARD, 100, SOUTH);
    expect(p.z).toBeCloseTo(16 - PLAYER_R);
    expect(p.y).toBe(1);
    run(p, FORWARD | JUMP, 60, SOUTH);
    expect(p.z).toBeCloseTo(16 - PLAYER_R);
    expect(sectorAt(lvl, p.x, p.z)).toBe(5);
  });

  it('walks into the low corridor and out of it, and the hall is tall', () => {
    const p = at(10, 8);
    run(p, FORWARD, 90, EAST, () => {
      expect(p.y).toBe(1);
    });
    expect(sectorAt(lvl, p.x, p.z)).toBe(1);
    run(p, FORWARD, 60, EAST);
    expect(sectorAt(lvl, p.x, p.z)).toBe(3);
    expect(p.y).toBe(1);
  });

  it('falls into the lava pit, can jump out of it, but cannot walk out', () => {
    const p = at(24, 8);
    run(p, FORWARD, 12, EAST);
    expect(p.ground).toBe(true);
    // The circle leaves the floor at x = 26 + PLAYER_R: from there it is a fall.
    run(p, FORWARD, 12, EAST);
    expect(p.ground).toBe(false);
    run(p, FORWARD, 30, EAST);
    expect(sectorAt(lvl, p.x, p.z)).toBe(6);
    expect(p).toMatchObject({ y: 0, ground: true });

    // Walking at the far wall of the pit: stays down, pressed against it.
    run(p, FORWARD, 100, EAST);
    expect(p.x).toBeCloseTo(30 - PLAYER_R);
    expect(p).toMatchObject({ y: 0, ground: true });

    // 1 m up with a jump of 1.2 m: out, onto the hall floor.
    run(p, FORWARD | JUMP, 10, EAST);
    run(p, FORWARD, 40, EAST);
    expect(p.x).toBeGreaterThan(30);
    expect(p).toMatchObject({ y: 1, ground: true });
  });

  it('bumps its head under the corridor ceiling when jumping', () => {
    const p = at(18, 8);
    let top = 0;
    move(p, { seq: 0, keys: JUMP, yaw: 0, pitch: 0 }, lvl);
    run(p, 0, 60, 0, () => {
      top = Math.max(top, p.y);
    });
    // The feet go no higher than 3.5 - PLAYER_H = 1.7 m, and the head stops: no float up there.
    expect(Math.max(top, p.y)).toBeCloseTo(3.5 - PLAYER_H);
    expect(p).toMatchObject({ y: 1, ground: true });

    // A jump in the tall hall is free.
    const q = at(22, 8);
    let high = 0;
    move(q, { seq: 0, keys: JUMP, yaw: 0, pitch: 0 }, lvl);
    run(q, 0, 60, 0, () => (high = Math.max(high, q.y)));
    expect(high).toBeCloseTo(1 + (JUMP_SPEED * JUMP_SPEED) / (2 * GRAVITY), 3);
  });

  it('cannot jump into the corridor with the head above its mouth', () => {
    const p = at(14, 8);
    move(p, { seq: 0, keys: JUMP | FORWARD, yaw: EAST, pitch: 0 }, lvl);
    let held = 0;
    run(p, FORWARD, 30, EAST, () => {
      // While the head would be above 3.5 m the mouth (x = 16) is a wall.
      if (p.y + PLAYER_H > 3.5) {
        held = Math.max(held, p.x);
      }
    });
    expect(held).toBeLessThanOrEqual(16 - PLAYER_R + 1e-6);
    run(p, FORWARD, 40, EAST);
    expect(p.x).toBeGreaterThan(17);
  });

  it('jumps up to v² / 2g, only from the ground, and lands', () => {
    const p = at(8, 8);
    let top = 0;
    let air = 0;
    move(p, { seq: 0, keys: JUMP, yaw: 0, pitch: 0 }, lvl);
    run(p, 0, 60, 0, () => {
      top = Math.max(top, p.y);
      air += +!p.ground;
    });
    expect(top - 1).toBeCloseTo((JUMP_SPEED * JUMP_SPEED) / (2 * GRAVITY), 3);
    // Up and down take 2 v / g seconds, 0.7 s = 42 steps (the first one counted above).
    expect(air).toBeGreaterThanOrEqual(40);
    expect(air).toBeLessThanOrEqual(42);
    expect(p).toMatchObject({ y: 1, vy: 0, ground: true });

    // No second jump in the air.
    const q = at(8, 8);
    move(q, { seq: 0, keys: JUMP, yaw: 0, pitch: 0 }, lvl);
    expect(q.ground).toBe(false);
    const vy = q.vy;
    move(q, { seq: 1, keys: JUMP, yaw: 0, pitch: 0 }, lvl);
    expect(q.vy).toBeCloseTo(vy - GRAVITY / TICK_HZ);
  });

  it('keeps its x and z moving in the air', () => {
    const p = at(4, 14);
    run(p, JUMP | FORWARD, 20, NORTH);
    expect(p.z).toBeCloseTo(14 - 2);
    expect(p.y).toBeGreaterThan(1.5);
  });

  it('stays on the floor when its y is a millimetre low, as after the wire', () => {
    for (const [x, z, y] of [
      [8, 8, 1],
      [30, 18.5, 2.2],
      [30, 22, 2.6],
    ]) {
      const p: PlayerState = { ...at(x, z), y: y - 0.0012 };
      run(p, 0, 5);
      expect(p.y).toBe(Math.fround(y));
      expect([p.x, p.z]).toEqual([x, z]);
      run(p, FORWARD, 20, EAST);
      expect(p.y).toBe(Math.fround(y));
    }
  });
});

describe('move: a long walk', () => {
  it('never ends up outside every sector, nor sinks into a floor, over a long random walk', () => {
    const floors = HALL.sectors.map(s => s.floor);
    const seen = new Set<number>();
    for (const [seed, x, z] of [
      [1, 4, 4],
      [2, 12, 12],
      [3, 22, 8],
      [4, 30, 14],
      [5, 26, 22],
    ]) {
      let s = seed;
      const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
      const p = at(x, z);
      let keys = 0;
      let yaw = 0;
      let turn = 0;
      for (let k = 0; k < 6000; k++) {
        if (k % 20 === 0) {
          keys =
            (rnd() < 0.8 ? FORWARD : 0) |
            (rnd() < 0.2 ? LEFT : 0) |
            (rnd() < 0.2 ? RIGHT : 0) |
            (rnd() < 0.15 ? JUMP : 0);
          turn = (rnd() - 0.5) * 0.12;
        }
        yaw += turn;
        move(p, { seq: k, keys, yaw, pitch: 0 }, lvl);
        const i = sectorAt(lvl, p.x, p.z);
        expect(i).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeGreaterThanOrEqual(Math.min(...floors) - 1e-9);
        seen.add(i);
      }
    }
    // The walk really went places.
    expect(seen.size).toBeGreaterThanOrEqual(5);
  }, 30_000);
});

describe('float32 state', () => {
  it('leaves x, y, z and vy on float32 values after every step, in the air and on the ground', () => {
    const p = at(4, 14);
    const f32 = (v: number) => v === Math.fround(v);
    let air = 0;
    for (let k = 0; k < 200; k++) {
      // Jump now and then, wander with a yaw that is not a round number.
      const keys = FORWARD | (k % 3 === 0 ? RIGHT : 0) | (k % 40 < 3 ? JUMP : 0);
      move(p, { seq: k, keys, yaw: 0.37 + k * 0.021, pitch: 0 }, lvl);
      air += +!p.ground;
      expect([p.x, p.y, p.z, p.vy].map(f32)).toEqual([true, true, true, true]);
    }
    expect(air).toBeGreaterThan(10);
  });

  it('is the same state on a copy rebuilt from float32 values (what the snapshot carries)', () => {
    const a = at(4, 14);
    const input = (k: number): Input => ({ seq: k, keys: FORWARD | JUMP, yaw: 0.3 * k, pitch: 0 });
    for (let k = 0; k < 50; k++) {
      move(a, input(k), lvl);
      const b = {
        ...a,
        x: new Float32Array([a.x])[0],
        y: new Float32Array([a.y])[0],
        z: new Float32Array([a.z])[0],
        vy: new Float32Array([a.vy])[0],
      };
      expect(b).toEqual(a);
      const [u, v] = [{ ...a }, { ...b }];
      move(u, input(k + 1), lvl);
      move(v, input(k + 1), lvl);
      expect(v).toEqual(u);
    }
  });
});

describe('spawn', () => {
  it('stands on the floor of its sector at the point, facing its yaw, modulo the count', () => {
    const [x, z, yaw] = HALL.spawns[1];
    const p = spawn(7, lvl, 1);
    expect(p).toEqual({ id: 7, x, y: 1, z, vy: 0, yaw, pitch: 0, ground: true, cool: 0 });
    expect(spawn(7, lvl, 1 + HALL.spawns.length)).toEqual(p);
    expect(spawn(7, lvl, -1)).toEqual(spawn(7, lvl, HALL.spawns.length - 1));
  });

  it('uses the floor height whatever the sector', () => {
    const map: MapDef = { ...HALL, spawns: [[28, 22, 0]] };
    expect(spawn(0, compile(map), 0).y).toBe(Math.fround(2.6));
  });

  it('puts every HALL spawn clear of the walls and at rest', () => {
    for (let n = 0; n < HALL.spawns.length; n++) {
      const p = spawn(0, lvl, n);
      const q = { ...p };
      move(q, { seq: 0, keys: 0, yaw: p.yaw, pitch: 0 }, lvl);
      expect(q).toEqual(p);
      expect(p.yaw).toBeGreaterThanOrEqual(0);
      expect(p.yaw).toBeLessThan(2 * Math.PI);
    }
  });

  it('keeps the eye inside the walls', () => {
    expect(EYE).toBeLessThan(PLAYER_H);
  });
});

describe('chaingun', () => {
  const step = (p: PlayerState, keys: number) =>
    move(p, { seq: 0, keys, yaw: NORTH, pitch: 0 }, lvl);

  it('fires on the first step, then every FIRE_EVERY steps while the trigger is held', () => {
    const p = at(8, 8);
    const fired: number[] = [];
    for (let k = 0; k < 4 * FIRE_EVERY + 1; k++) {
      if (step(p, FIRE)) {
        fired.push(k);
      }
    }
    expect(fired).toEqual([0, 1, 2, 3, 4].map(n => n * FIRE_EVERY));
  });

  it('counts the cooldown down from FIRE_EVERY, and never below 0', () => {
    const p = at(8, 8);
    step(p, FIRE);
    expect(p.cool).toBe(FIRE_EVERY);
    step(p, 0);
    expect(p.cool).toBe(FIRE_EVERY - 1);
    for (let k = 0; k < 2 * FIRE_EVERY; k++) {
      step(p, 0);
    }
    expect(p.cool).toBe(0);
  });

  it('does not fire without the trigger, and a released trigger keeps the cooldown', () => {
    const p = at(8, 8);
    expect(step(p, FORWARD)).toBe(false);
    expect(step(p, FIRE)).toBe(true);
    // Tapping again inside the cooldown does not fire, after it does.
    for (let k = 1; k < FIRE_EVERY; k++) {
      expect(step(p, k % 2 ? 0 : FIRE)).toBe(false);
    }
    expect(step(p, FIRE)).toBe(true);
  });

  it('slows the run down by FIRE_SLOW while the trigger is held', () => {
    const [a, b] = [at(4, 8), at(4, 8)];
    run(a, FORWARD, 10, EAST);
    run(b, FORWARD | FIRE, 10, EAST);
    expect(b.x - 4).toBeCloseTo((a.x - 4) * FIRE_SLOW, 4);
    // Diagonals stay no faster.
    const c = at(4, 8);
    run(c, FORWARD | RIGHT | FIRE, 10, EAST);
    expect(Math.hypot(c.x - 4, c.z - 8)).toBeCloseTo((RUN_SPEED / TICK_HZ) * 10 * FIRE_SLOW, 4);
  });
});

describe('barred sectors', () => {
  const room = (x0: number, x1: number): [number, number][] => [
    [x0, 0],
    [x1, 0],
    [x1, 10],
    [x0, 10],
  ];
  /** Two 10 m rooms side by side, joined along their whole wall. */
  const twin = (over: Partial<MapDef>): Level =>
    compile({
      sectors: [sector(room(0, 10), 0), sector(room(10, 20), 0)],
      spawns: [[5, 5, 0]],
      ...over,
    });
  const RED = 1 << ITEM.KEY_RED;
  const stand = (level: Level, x: number): PlayerState => ({ ...at(x, 5, level), y: 0 });

  it('stops a walker at the edge of a gate until its key is held', () => {
    const gate = twin({ gates: [{ sector: 1, key: ITEM.KEY_RED }] });
    const p = stand(gate, 5);
    run(p, FORWARD, 100, EAST, undefined, gate);
    expect([p.x, p.z]).toEqual([Math.fround(10 - PLAYER_R), 5]);
    // The same run once the team holds the key goes through.
    bar(gate, RED, PHASE.HUNT);
    run(p, FORWARD, 100, EAST, undefined, gate);
    expect(p.x).toBeGreaterThan(13);
    // A key of another colour opens nothing.
    const other = twin({ gates: [{ sector: 1, key: ITEM.KEY_BLUE }] });
    bar(other, RED, PHASE.HUNT);
    const q = stand(other, 5);
    run(q, FORWARD, 100, EAST, undefined, other);
    expect(q.x).toBeCloseTo(10 - PLAYER_R);
  });

  it('slides along the wall of a gate', () => {
    const gate = twin({ gates: [{ sector: 1, key: ITEM.KEY_RED }] });
    const p = stand(gate, 5);
    // Diagonally into the gate: x stops, z keeps moving.
    run(p, FORWARD, 80, EAST - 0.5, undefined, gate);
    expect(p.x).toBeCloseTo(10 - PLAYER_R);
    expect(p.z).toBeGreaterThan(8);
  });

  it('keeps everybody out of the exit until RETURN, but lets a player in it walk out', () => {
    const exit = twin({ exit: 0 });
    expect(exit.barred).toEqual(new Set([0]));
    const p = stand(exit, 5);
    // Standing in the exit it moves freely, and walks out into the next room.
    run(p, FORWARD, 30, WEST, undefined, exit);
    expect(p.x).toBeCloseTo(5 - 3);
    run(p, FORWARD, 150, EAST, undefined, exit);
    expect(p.x).toBeGreaterThan(14);
    // Back at the exit it is shut, from the room beside it.
    run(p, FORWARD, 100, WEST, undefined, exit);
    expect(p.x).toBeCloseTo(10 + PLAYER_R);
    bar(exit, 0, PHASE.RETURN);
    run(p, FORWARD, 100, WEST, undefined, exit);
    expect(p.x).toBeLessThan(5);
  });

  it('keeps a flyer out as well', () => {
    const gate = twin({ gates: [{ sector: 1, key: ITEM.KEY_RED }] });
    const f = { x: 5, y: 1.2, z: 5 };
    for (let k = 0; k < 100; k++) {
      fly(f, 0.05, 0, 0, gate);
    }
    expect(f.x).toBeCloseTo(10 - 0.45);
    bar(gate, RED, PHASE.HUNT);
    for (let k = 0; k < 100; k++) {
      fly(f, 0.05, 0, 0, gate);
    }
    expect(f.x).toBeGreaterThan(14);
  });

  it('does not count the floor behind a gate: no step up onto it', () => {
    // Behind the gate the floor is a high step: a barred gate must not lift the player either.
    const gate = twin({
      sectors: [sector(room(0, 10), 0), sector(room(10, 20), 0.3)],
      gates: [{ sector: 1, key: ITEM.KEY_RED }],
    });
    const p = stand(gate, 9.5);
    run(p, 0, 5, EAST, undefined, gate);
    expect(p.y).toBe(0);
  });
});
