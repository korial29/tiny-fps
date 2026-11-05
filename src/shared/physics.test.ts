import { describe, expect, it } from 'vitest';
import { duo } from '../../test/teams';
import {
  EYE,
  GRAVITY,
  LOW_EYE,
  LOW_H,
  JUMP_SPEED,
  MAX_PITCH,
  PLAYER_H,
  PLAYER_R,
  RUN_SPEED,
  STEP_H,
  TICK_HZ,
} from './constants';
import { STILL, eyeHeight, forward, heightOf, move, speedOf, spawn } from './physics';
import { EV, KEY, MODE, TEX } from './types';
import type { Input, PlayerState } from './types';
import { build } from './world';
import type { Brush, Spawn, World } from './world';

const { FORWARD, BACK, LEFT, RIGHT, JUMP } = KEY;

// Yaws: forward(yaw) = (-sin, -cos), so these face -z, +x, +z and -x.
const NORTH = 0;
const EAST = (3 * Math.PI) / 2;
const SOUTH = Math.PI;
const WEST = Math.PI / 2;
/** The highest a jump lifts the feet. */
const APEX = JUMP_SPEED ** 2 / (2 * GRAVITY);

type Vec3 = [number, number, number];
const box = (min: Vec3, max: Vec3): Brush => ({ min, max, top: TEX.TILE, side: TEX.BRICK });
const world = (
  brushes: Brush[],
  floor = -50,
  spawns: Spawn[] = [[0, 0, 0, 0]],
  blue?: Spawn[],
): World =>
  build({
    brushes,
    teams: duo(spawns, blue),
    floor,
    sun: { dir: [0, 1, 0], color: [1, 1, 1] },
    sky: [
      [0, 0, 1],
      [1, 1, 1],
    ],
  });

/**
 * A test yard, each feature on its own stretch of a ground whose top is y = 0 (x -100 to 300,
 * z -100 to 100). Positions are noted at each use.
 */
const GROUND = box([-100, -5, -100], [300, 0, 100]);
const yard = world([
  GROUND,
  // A wall along z at x = 10, 5 m high.
  box([10, -5, -50], [11, 5, 50]),
  // Boxes along x, 4 m long (x), tops 0.5 (a step), 1 (a hop), 1.5 (a jump), 2.5 (out of reach).
  box([20, -5, -5], [24, 0.5, 5]),
  box([30, -5, -5], [34, 1, 5]),
  box([40, -5, -5], [44, 1.5, 5]),
  box([45, -5, -5], [49, 2.5, 5]),
  // Two neighbours, tops 0.2 and 0.4.
  box([50, -5, -5], [52, 0.2, 5]),
  box([52, -5, -5], [54, 0.4, 5]),
  // An overhang: a slab 2.2 m up (a clear 2.2 m under it), and a bar 1.5 m up.
  box([60, 2.2, -5], [70, 2.6, 5]),
  box([75, 1.5, -5], [80, 2, 5]),
  // A roof 5 m up, to fall from.
  box([90, -5, -5], [100, 5, 5]),
  // A pillar, z 0 to 4, to run round.
  box([100, -5, 10], [104, 3, 14]),
  // A wall along z made of two boxes meeting at z = 0, at x = 200.
  box([200, -5, -50], [201, 5, 0]),
  box([200, -5, 0], [201, 5, 50]),
  // A wall as thin as a sheet, at x = 250.
  box([250, -5, -50], [250.05, 5, 50]),
]);

/** A standing player on the ground (y 0) at (x, z). */
const at = (x: number, z: number, y = 0): PlayerState => ({
  id: 0,
  x,
  y,
  z,
  vy: 0,
  yaw: 0,
  pitch: 0,
  ground: true,
  ...STILL,
});

/**
 * Runs n steps of the same keys; `each` sees the state after every step. A held JUMP is a tap on
 * every step that starts on a floor: the player hops, and never double-jumps (`hold` keeps it down).
 */
const run = (
  p: PlayerState,
  keys: number,
  n: number,
  yaw = p.yaw,
  each?: (k: number) => void,
  w: World = yard,
  hold = false,
): void => {
  for (let k = 0; k < n; k++) {
    const tap = hold || p.ground ? keys : keys & ~JUMP;
    move(p, { seq: k, keys: tap, yaw, pitch: 0 }, w);
    each?.(k);
  }
};

/** The player already running at RUN_SPEED along the facing, as after a second of it. */
const cruising = (p: PlayerState, yaw: number, speed = RUN_SPEED): PlayerState => {
  const [fx, fz] = forward(yaw);
  return Object.assign(p, { yaw, vx: Math.fround(fx * speed), vz: Math.fround(fz * speed) });
};

describe('forward', () => {
  it('looks toward -z at yaw 0 and toward -x a quarter turn on', () => {
    expect(forward(0)[0]).toBeCloseTo(0);
    expect(forward(0)[1]).toBeCloseTo(-1);
    expect(forward(Math.PI / 2)[0]).toBeCloseTo(-1);
    expect(forward(Math.PI / 2)[1]).toBeCloseTo(0);
  });
});

describe('move: on the ground', () => {
  it('speeds up to RUN_SPEED along the facing in a fraction of a second, and runs at it', () => {
    const p = at(-20, 8);
    run(p, FORWARD, 3, EAST);
    expect(speedOf(p)).toBeGreaterThan(1);
    expect(speedOf(p)).toBeLessThan(RUN_SPEED);
    run(p, FORWARD, 12, EAST);
    expect(speedOf(p)).toBeCloseTo(RUN_SPEED, 4);
    const x = p.x;
    run(p, FORWARD, TICK_HZ, EAST);
    expect(p.x - x).toBeCloseTo(RUN_SPEED);
    expect(p.z).toBeCloseTo(8);
  });

  it('strafes and backs off at the same speed, and stops within a fraction of a second', () => {
    const p = cruising(at(-20, 8), EAST);
    run(p, RIGHT, 15, EAST);
    expect(speedOf(p)).toBeCloseTo(RUN_SPEED, 4);
    expect(p.vz).toBeCloseTo(RUN_SPEED, 4);
    expect(p.vx).toBeCloseTo(0, 4);
    run(p, BACK, 15, EAST);
    expect(p.vx).toBeCloseTo(-RUN_SPEED, 4);
    run(p, LEFT, 15, EAST);
    expect(p.vz).toBeCloseTo(-RUN_SPEED, 4);
    // No key: friction stops it in under 0.2 s, and it stays stopped.
    run(p, 0, 11, EAST);
    expect(speedOf(p)).toBe(0);
    const [x, z] = [p.x, p.z];
    run(p, 0, 10, EAST);
    expect([p.x, p.z]).toEqual([x, z]);
    expect(p.y).toBe(0);
    expect(p.ground).toBe(true);
  });

  it('moves along the facing whatever the yaw', () => {
    const p = cruising(at(-12, 8), WEST);
    run(p, FORWARD, 30, WEST);
    expect(p.x).toBeCloseTo(-12 - RUN_SPEED / 2);
    expect(p.z).toBeCloseTo(8);
  });

  it('is no faster on a diagonal, and stands still on opposite keys', () => {
    const p = at(-4, 12);
    run(p, FORWARD | RIGHT, 30, NORTH);
    expect(speedOf(p)).toBeCloseTo(RUN_SPEED, 4);
    expect(p.vx).toBeGreaterThan(0);
    expect(p.vz).toBeLessThan(0);
    expect(p.vx).toBeCloseTo(-p.vz, 4);

    const q = at(-4, 12);
    run(q, FORWARD | BACK | LEFT | RIGHT, 10);
    expect([q.x, q.z]).toEqual([-4, 12]);
  });

  it('normalises yaw into [0, 2π) and clamps pitch', () => {
    const p = at(-8, 8);
    const i: Input = { seq: 0, keys: 0, yaw: -0.5, pitch: 9 };
    move(p, i, yard);
    expect(p.yaw).toBeCloseTo(2 * Math.PI - 0.5);
    expect(p.pitch).toBe(MAX_PITCH);
    move(p, { ...i, yaw: 7, pitch: -9 }, yard);
    expect(p.yaw).toBeCloseTo(7 - 2 * Math.PI);
    expect(p.pitch).toBe(-MAX_PITCH);
  });

  it('is deterministic, and a standing player stays put', () => {
    const a = at(-5, 5);
    const b = at(-5, 5);
    for (let k = 0; k < 300; k++) {
      const i = { seq: k, keys: (k * 7) % 256, yaw: k * 0.05, pitch: 0.1 };
      move(a, i, yard);
      move(b, i, yard);
    }
    expect(a).toEqual(b);

    const c = at(-8, 8);
    run(c, 0, 120);
    expect(c).toMatchObject({ x: -8, y: 0, z: 8, vy: 0, ground: true });
  });
});

describe('move: sides', () => {
  it('stops against a side and slides along it', () => {
    const p = at(2, 8);
    run(p, FORWARD, 200, EAST);
    expect([p.x, p.z]).toEqual([Math.fround(10 - PLAYER_R), 8]);

    // Toward +x and -z at once: x stops at the wall, z keeps going at the rest of the speed.
    const q = cruising(at(2, 8), EAST + 0.6);
    run(q, FORWARD, 100, EAST + 0.6);
    expect(q.x).toBeCloseTo(10 - PLAYER_R);
    const z = q.z;
    run(q, FORWARD, 30, EAST + 0.6);
    expect(q.x).toBeCloseTo(10 - PLAYER_R);
    expect(z - q.z).toBeCloseTo(0.5 * Math.sin(0.6) * RUN_SPEED);
  });

  it('is stopped from the other side too, and by a box as by a wall', () => {
    const p = at(15, 8);
    run(p, FORWARD, 200, WEST);
    expect(p.x).toBeCloseTo(11 + PLAYER_R);
    // The side of the 5 m roof at x = 90.
    const q = at(85, 0);
    run(q, FORWARD, 100, EAST);
    expect(q.x).toBeCloseTo(90 - PLAYER_R);
  });

  it('slides round a convex corner, never nearer than PLAYER_R to the box', () => {
    // Running east at the pillar's corner (100, 10), 0.3 m outside it: the circle grazes it.
    const p = at(96, 9.7);
    run(p, FORWARD, 200, EAST, () => {
      const [dx, dz] = [Math.max(100 - p.x, 0, p.x - 104), Math.max(10 - p.z, 0, p.z - 14)];
      expect(Math.hypot(dx, dz)).toBeGreaterThanOrEqual(PLAYER_R - 1e-6);
    });
    // Pushed off the corner toward -z, and on past the pillar.
    expect(p.x).toBeGreaterThan(110);
    expect(p.z).toBeLessThan(10 - PLAYER_R + 1e-3);
    expect(p.z).toBeGreaterThan(10 - 2 * PLAYER_R);

    // The same corner, heading in at an angle: it rounds it.
    const q = cruising(at(97, 8), EAST - 0.45);
    run(q, FORWARD, 200, EAST - 0.45);
    expect(q.x).toBeGreaterThan(110);
  });

  it('pushes a player standing in a side back out', () => {
    const p = at(8, 8);
    p.x = 10.2;
    run(p, 0, 1);
    expect([p.x, p.z]).toEqual([Math.fround(10 - PLAYER_R), 8]);
    // Even with the centre well inside a box: out by the nearest side.
    const q = at(8, 8);
    q.x = 10.9;
    run(q, 0, 1);
    expect(q.x).toBeCloseTo(11 + PLAYER_R);
  });

  it('never gets stuck on the seam between two boxes of one flat wall', () => {
    for (const [z0, yaw, dz] of [
      [-3, SOUTH + 0.2, 1],
      [3, NORTH - 0.2, -1],
    ] as const) {
      const p = cruising(at(199, z0), yaw);
      let last = p.z;
      run(p, FORWARD, 70, yaw, () => {
        // The same stride every step, before, on and after the seam.
        expect((p.z - last) * dz).toBeCloseTo(
          RUN_SPEED / TICK_HZ / Math.hypot(1, Math.tan(0.2)),
          3,
        );
        expect(p.x).toBeLessThanOrEqual(200 - PLAYER_R + 1e-4);
        last = p.z;
      });
    }
  });

  it('never ends up inside a box, in a corner either', () => {
    // An L of two walls: x = 120 from z 0 to 20, and z = 20 from x 120 to 140.
    const l = world([
      GROUND,
      box([119, -5, 0], [120, 5, 21]),
      box([120, -5, 20], [140, 5, 21]),
      box([130, -5, 0], [131, 5, 10]),
    ]);
    for (const [x, z] of [
      [121, 19],
      [125, 15],
      [135, 12],
    ]) {
      for (let a = 0; a < 16; a++) {
        const p = at(x, z);
        run(
          p,
          FORWARD | (a % 2 ? LEFT : 0),
          300,
          (a * Math.PI) / 8,
          () => {
            for (const b of l.def.brushes.slice(1)) {
              expect(p.x > b.min[0] && p.x < b.max[0] && p.z > b.min[2] && p.z < b.max[2]).toBe(
                false,
              );
            }
          },
          l,
        );
      }
    }
  });

  it('cannot tunnel through a wall as thin as a sheet, at any angle', () => {
    for (let a = 0; a < 32; a++) {
      const p = at(246, a - 16);
      // Facing within a quarter turn of +x, with a strafe on half of the runs.
      run(p, FORWARD | (a % 2 ? RIGHT : 0), 200, EAST + (a - 16) * 0.05);
      expect(p.x).toBeLessThan(250 - PLAYER_R + 1e-4);
    }
  });
});

describe('move: heights', () => {
  it('climbs a top of STEP_H at once, and needs a jump for a higher one', () => {
    const p = at(15, 0);
    run(p, FORWARD, 60, EAST);
    expect(p).toMatchObject({ y: STEP_H, ground: true });
    expect(p.x).toBeGreaterThan(20.5);
    // And off its far side, back to the ground.
    run(p, FORWARD, 60, EAST);
    expect(p).toMatchObject({ y: 0, ground: true });
    expect(p.x).toBeGreaterThan(24 + PLAYER_R);

    const q = at(25, 0);
    run(q, FORWARD, 80, EAST);
    expect(q.x).toBeCloseTo(30 - PLAYER_R);
    expect(q.y).toBe(0);

    // A jump clears it: the feet are within STEP_H of the top when they reach the edge.
    const r = cruising(at(27, 0), EAST);
    run(r, FORWARD | JUMP, 1, EAST);
    run(r, FORWARD, 50, EAST);
    expect(r.x).toBeGreaterThan(30);
    expect(r).toMatchObject({ y: 1, ground: true });
  });

  it('jumps onto a box up to about APEX + STEP_H', () => {
    // A top 2.5 high is past a plain jump; the hands catch its edge instead (see the ledge tests).
    const p = cruising(at(37, 0), EAST);
    run(p, FORWARD | JUMP, 1, EAST);
    run(p, FORWARD, 50, EAST);
    expect(p).toMatchObject({ y: 1.5, ground: true });
    expect(APEX + STEP_H).toBeLessThan(2.5);
  });

  it('lands on the highest top under the circle', () => {
    // Over the seam of tops 0.2 and 0.4 (x = 52): the higher one holds.
    const p = at(52, 0, 3);
    p.ground = false;
    run(p, 0, 60);
    expect(p).toMatchObject({ y: Math.fround(0.4), ground: true });
    // Only the lower one under the circle: 51.6 + 0.4 just reaches x = 52.
    const q = at(51.6, 0, 3);
    q.ground = false;
    run(q, 0, 60);
    expect(q.y).toBe(Math.fround(0.2));
    const r = at(51.7, 0, 3);
    r.ground = false;
    run(r, 0, 60);
    expect(r.y).toBe(Math.fround(0.4));
    // Walking from the low one onto the high one is a step of 0.2.
    const s = at(50.5, 0, 0.2);
    run(s, FORWARD, 30, EAST);
    expect(s).toMatchObject({ y: Math.fround(0.4), ground: true });
  });

  it('stands on a top when its y is a millimetre low, as after the wire', () => {
    for (const [x, z, y] of [
      [-8, 8, 0],
      [53, 0, 0.4],
      [51, 0, 0.2],
    ]) {
      const p: PlayerState = { ...at(x, z), y: y - 0.0012 };
      run(p, 0, 5);
      expect(p.y).toBe(Math.fround(y));
      expect([p.x, p.z]).toEqual([x, z]);
      run(p, FORWARD, 5, NORTH);
      expect(p.y).toBe(Math.fround(y));
    }
  });

  it('bumps its head on a bottom when jumping, in place', () => {
    const p = at(65, 0);
    let top = 0;
    let bumped = false;
    move(p, { seq: 0, keys: JUMP, yaw: 0, pitch: 0 }, yard);
    run(p, 0, 60, 0, () => {
      top = Math.max(top, p.y);
      bumped ||= p.vy <= 0 && p.y > 2.2 - PLAYER_H - 0.05 && !p.ground;
    });
    // The feet go no higher than 2.2 - PLAYER_H = 0.4 m: no float up there.
    expect(Math.max(top, p.y)).toBeCloseTo(2.2 - PLAYER_H);
    expect(bumped).toBe(true);
    expect(p).toMatchObject({ y: 0, vy: 0, ground: true });
    // Out in the open the same jump reaches APEX.
    const q = at(-20, 0);
    let high = 0;
    move(q, { seq: 0, keys: JUMP, yaw: 0, pitch: 0 }, yard);
    run(q, 0, 60, 0, () => (high = Math.max(high, q.y)));
    expect(high).toBeCloseTo(APEX, 3);
  });

  it('walks under an overhang, whatever is above, and not under a bar too low for the head', () => {
    const p = at(55, 0);
    let under = 0;
    run(p, FORWARD, 160, EAST, () => {
      expect(p.y).toBe(0);
      under += +(p.x > 60 && p.x < 70);
    });
    // 10 m of slab at 6 m/s is 100 steps, and out the other side.
    expect(under).toBeGreaterThanOrEqual(95);
    expect(p.x).toBeGreaterThan(70);
    // The bar at x 75 to 80 is 1.5 m up: the head is in it.
    const q = at(72, 0);
    run(q, FORWARD, 60, EAST);
    expect(q.x).toBeCloseTo(75 - PLAYER_R);
    expect(q.y).toBe(0);
  });

  it('cannot jump through a bottom whatever the speed it comes from', () => {
    // From 3 m above the ground up under the slab: the head meets it, the feet stop at 0.4.
    const p = at(65, 0, 0);
    p.vy = 30;
    p.ground = false;
    let top = 0;
    run(p, 0, 30, 0, () => (top = Math.max(top, p.y)));
    expect(top).toBeLessThanOrEqual(2.2 - PLAYER_H + 1e-6);
  });

  it('walks off a roof and falls to the ground, and cannot jump up its side', () => {
    const p = at(95, 0, 5);
    run(p, FORWARD, 40, EAST);
    expect(p).toMatchObject({ y: 5, ground: true });
    // The circle leaves the roof at x = 100 + PLAYER_R: from there it is a fall.
    run(p, FORWARD, 20, EAST);
    expect(p.ground).toBe(false);
    run(p, FORWARD, 60, EAST);
    expect(p).toMatchObject({ y: 0, ground: true });
    expect(p.x).toBeGreaterThan(100 + PLAYER_R);

    // Back at the foot of the side, 5 m up: a wall.
    const q = at(105, 0);
    let top = 0;
    run(q, FORWARD | JUMP, 100, WEST, () => (top = Math.max(top, q.y)));
    expect(q.x).toBeCloseTo(100 + PLAYER_R);
    // Hopping against it, the feet never rise above a hop.
    expect(top).toBeCloseTo(APEX, 3);
  });

  it('jumps up to v² / 2g, only from the ground, and lands', () => {
    const p = at(-8, 8);
    let top = 0;
    let air = 0;
    move(p, { seq: 0, keys: JUMP, yaw: 0, pitch: 0 }, yard);
    run(p, 0, 60, 0, () => {
      top = Math.max(top, p.y);
      air += +!p.ground;
    });
    expect(top).toBeCloseTo(APEX, 3);
    // Up and down take 2 v / g seconds, 0.7 s = 42 steps (the first one counted above).
    expect(air).toBeGreaterThanOrEqual(40);
    expect(air).toBeLessThanOrEqual(42);
    expect(p).toMatchObject({ y: 0, vy: 0, ground: true });

    // Holding the key is not a press: no jump again in the air.
    const q = at(-8, 8);
    move(q, { seq: 0, keys: JUMP, yaw: 0, pitch: 0 }, yard);
    expect(q.ground).toBe(false);
    const vy = q.vy;
    move(q, { seq: 1, keys: JUMP, yaw: 0, pitch: 0 }, yard);
    expect(q.vy).toBeCloseTo(vy - GRAVITY / TICK_HZ);
  });

  it('keeps its x and z moving in the air', () => {
    const p = cruising(at(-4, 14), NORTH);
    run(p, JUMP | FORWARD, 20, NORTH);
    expect(p.z).toBeCloseTo(14 - 2);
    expect(p.y).toBeGreaterThan(0.5);
  });

  it('cannot fall through a top however fast it comes, a sheet included', () => {
    const sheet = world([box([-5, -0.05, -5], [5, 0, 5])], -200);
    for (const [vy, y] of [
      [-10, 20],
      [-60, 100],
      [-120, 400],
    ]) {
      const p = at(0, 0, y);
      p.vy = vy;
      p.ground = false;
      run(p, 0, 400, 0, undefined, sheet);
      expect(p, `vy ${vy}`).toMatchObject({ y: 0, ground: true });
    }
  });
});

describe('move: falling off the world', () => {
  const spawns: Spawn[] = [
    [0, 0, 0, 0],
    [3, 0, 3, 1],
    [-3, 0, -3, 2],
  ];
  // A 10 m island, with the kill floor 20 m below it.
  const island = world([box([-5, -5, -5], [5, 0, 5])], -20, spawns);

  it('puts the player back at the spawn of its id, standing, once under the kill floor', () => {
    for (const id of [0, 1, 2, 4]) {
      const p = { ...at(4, 0), id };
      let low = 0;
      let respawned = -1;
      run(
        p,
        FORWARD,
        120,
        EAST,
        k => {
          low = Math.min(low, p.y);
          if (respawned < 0 && p.y === 0 && p.ground && p.x < 4) {
            respawned = k;
          }
        },
        island,
      );
      // About 1.8 s of falling at most to go 20 m, then a spawn.
      expect(respawned, `id ${id}`).toBeGreaterThan(30);
      expect(low).toBeGreaterThan(-22);
    }
  });

  it('lands on the exact spawn point, with its look angles from the input', () => {
    const p = { ...at(4, 0), id: 1 };
    p.vy = -10;
    p.y = -19.99;
    p.ground = false;
    move(p, { seq: 0, keys: 0, yaw: 1, pitch: 0.2 }, island);
    expect(p).toMatchObject({ x: 3, y: 0, z: 3, vy: 0, ground: true, pitch: 0.2 });
    expect(p.yaw).toBeCloseTo(1);
  });

  it('picks the spawn from the id alone: the same on the host and the client, modulo the count', () => {
    const land = (id: number) => {
      const p = { ...at(0, 0, -19.99), id, vy: -10, ground: false };
      move(p, { seq: 0, keys: 0, yaw: 0, pitch: 0 }, island);
      return [p.x, p.z];
    };
    expect(land(0)).toEqual([0, 0]);
    expect(land(1)).toEqual([3, 3]);
    expect(land(2)).toEqual([-3, -3]);
    expect(land(3)).toEqual([0, 0]);
    expect(land(1)).toEqual(land(1));
  });

  it('does not respawn above the kill floor, however far from any top', () => {
    const p = at(100, 0, 3);
    p.ground = false;
    move(p, { seq: 0, keys: 0, yaw: 0, pitch: 0 }, island);
    expect(p.y).toBeLessThan(3);
    expect(p.x).toBe(100);
  });
});

describe('move: a long walk', () => {
  it('never ends up inside a box, over a long random walk across the yard', () => {
    const solid = (p: PlayerState) =>
      yard.def.brushes.some(
        b =>
          p.x > b.min[0] &&
          p.x < b.max[0] &&
          p.z > b.min[2] &&
          p.z < b.max[2] &&
          p.y > b.min[1] + 1e-3 &&
          p.y < b.max[1] - 1e-3,
      );
    let high = 0;
    for (const [seed, x, z] of [
      [1, 4, 4],
      [2, 25, 0],
      [3, 55, 3],
      [4, 96, 0],
      [5, 98, 12],
      [6, 197, -6],
    ]) {
      let s = seed;
      const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
      const p = at(x, z, x === 96 ? 5 : 0);
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
        move(p, { seq: k, keys, yaw, pitch: 0 }, yard);
        // The yard ends at z = ±100: a walk that gets there has seen what it can.
        if (Math.abs(p.z) > 98) {
          break;
        }
        expect(solid(p), `seed ${seed}, step ${k}`).toBe(false);
        expect(p.y).toBeGreaterThanOrEqual(-1e-9);
        high = Math.max(high, p.y);
      }
    }
    expect(high).toBeGreaterThan(1);
  }, 30_000);
});

describe('float32 state', () => {
  it('leaves x, y, z and vy on float32 values after every step, in the air and on the ground', () => {
    const p = at(-4, 14);
    const f32 = (v: number) => v === Math.fround(v);
    let air = 0;
    for (let k = 0; k < 200; k++) {
      // Jump now and then, wander with a yaw that is not a round number.
      const keys = FORWARD | (k % 3 === 0 ? RIGHT : 0) | (k % 40 < 3 ? JUMP : 0);
      move(p, { seq: k, keys, yaw: 0.37 + k * 0.021, pitch: 0 }, yard);
      air += +!p.ground;
      expect([p.x, p.y, p.z, p.vy].map(f32)).toEqual([true, true, true, true]);
    }
    expect(air).toBeGreaterThan(10);
  });

  it('is the same state on a copy rebuilt from float32 values (what the snapshot carries)', () => {
    const a = at(-4, 14);
    const input = (k: number): Input => ({ seq: k, keys: FORWARD | JUMP, yaw: 0.3 * k, pitch: 0 });
    for (let k = 0; k < 50; k++) {
      move(a, input(k), yard);
      const b = {
        ...a,
        x: new Float32Array([a.x])[0],
        y: new Float32Array([a.y])[0],
        z: new Float32Array([a.z])[0],
        vy: new Float32Array([a.vy])[0],
      };
      expect(b).toEqual(a);
      const [u, v] = [{ ...a }, { ...b }];
      move(u, input(k + 1), yard);
      move(v, input(k + 1), yard);
      expect(v).toEqual(u);
    }
  });
});

describe('spawn', () => {
  const w = world([GROUND], -50, [
    [1.1, 0, 2.2, 0],
    [3, 4.5, 4, 2.5],
  ]);

  it('stands at the point, at its height, facing its yaw, modulo the count', () => {
    const p = spawn(7, w, 1);
    expect(p).toEqual({
      id: 7,
      x: 3,
      y: 4.5,
      z: 4,
      vy: 0,
      yaw: 2.5,
      pitch: 0,
      ground: true,
      ...STILL,
    });
    expect(spawn(7, w, 1 + w.def.teams[0].spawns.length)).toEqual(p);
    expect(spawn(7, w, -1)).toEqual(spawn(7, w, w.def.teams[0].spawns.length - 1));
  });

  it('holds float32 values', () => {
    const p = spawn(0, w, 0);
    expect([p.x, p.y, p.z]).toEqual([Math.fround(1.1), 0, Math.fround(2.2)]);
  });

  it('keeps the eye inside the body', () => {
    expect(EYE).toBeLessThan(PLAYER_H);
  });
});

describe('time in the mode', () => {
  it('counts the ticks since the mode began, and saturates at 255', () => {
    const p = at(-8, 8);
    move(p, { seq: 0, keys: 0, yaw: 0, pitch: 0 }, yard);
    expect(p.t).toBe(1);
    run(p, 0, 400);
    expect(p.t).toBe(255);
    run(p, JUMP, 1);
    expect([p.mode, p.t]).toEqual([MODE.AIR, 0]);
    run(p, 0, 1);
    expect(p.t).toBe(1);
  });

  it('knows the height of the body and of the eye in each mode', () => {
    for (const mode of Object.values(MODE)) {
      const low = mode === MODE.SLIDE || mode === MODE.CROUCH;
      expect([heightOf({ mode }), eyeHeight({ mode })]).toEqual(
        low ? [LOW_H, LOW_EYE] : [PLAYER_H, EYE],
      );
    }
    expect(LOW_H).toBeCloseTo(PLAYER_H / 2, 1);
    expect(LOW_EYE).toBeLessThan(LOW_H);
  });
});

describe('landing', () => {
  it('reports the speed of a landing, and no landing for a step down', () => {
    const p = at(-8, 8, 5);
    p.mode = MODE.AIR;
    p.ground = false;
    p.coyote = 0;
    run(p, 0, 80);
    // 5 m under g: sqrt(2 g h) = 14.1 m/s, give or take a step.
    expect(p.mode).toBe(MODE.GROUND);
    let landed = 0;
    let fall = 0;
    const q = at(-8, 8, 5);
    Object.assign(q, { mode: MODE.AIR, ground: false, coyote: 0 });
    run(q, 0, 80, 0, () => {
      landed += q.ev & EV.LAND ? 1 : 0;
      fall = Math.max(fall, q.fall);
    });
    expect(landed).toBe(1);
    expect(fall).toBeGreaterThan(13);
    expect(fall).toBeLessThan(15);
    // Down the stair of the yard (0.2 and 0.4 steps): a walk, not a fall.
    const s = cruising(at(53.5, 0, 0.4), EAST);
    let air = 0;
    run(s, FORWARD, 30, EAST, () => {
      air += s.mode === MODE.AIR ? 1 : 0;
    });
    expect(air).toBe(0);
    expect(s.y).toBe(0);
  });
});
