import { describe, expect, it } from 'vitest';
import { EYE, MAX_PITCH, PLAYER_H, RANGE, SPREAD } from './constants';
import { compile } from './level';
import { HALL } from './map';
import { aim, body, fire, trace } from './shoot';
import { TEX } from './types';
import type { MapDef, PlayerState } from './types';

const lvl = compile(HALL);
type Vec3 = [number, number, number];

/** Unit vector along (x, y, z). */
const unit = (x: number, y: number, z: number): Vec3 => {
  const n = Math.hypot(x, y, z);
  return [x / n, y / n, z / n];
};
const angle = (a: Vec3, b: Vec3): number =>
  Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));

// Yaws: forward(yaw) = (-sin, -cos): these face -z, +x, +z and -x.
const NORTH = 0;
const EAST = (3 * Math.PI) / 2;
const SOUTH = Math.PI;
const WEST = Math.PI / 2;

describe('aim', () => {
  const view = (yaw: number, pitch: number): Vec3 => [
    -Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    -Math.cos(yaw) * Math.cos(pitch),
  ];

  it('is a unit vector within SPREAD of the view, for every yaw, pitch and seq', () => {
    let worst = 0;
    for (let seq = 0; seq < 2000; seq++) {
      const [yaw, pitch] = [seq * 0.37, Math.sin(seq) * MAX_PITCH];
      const d = aim(yaw, pitch, seq);
      expect(Math.hypot(...d)).toBeCloseTo(1, 12);
      worst = Math.max(worst, angle(d, view(yaw, pitch)));
    }
    expect(worst).toBeLessThanOrEqual(SPREAD);
    // The whole cone is used.
    expect(worst).toBeGreaterThan(SPREAD * 0.95);
  });

  it('looks toward -z at yaw 0, +x at 3π/2, and up for a positive pitch', () => {
    const near = (d: Vec3, v: Vec3) => expect(angle(d, v)).toBeLessThanOrEqual(SPREAD);
    near(aim(NORTH, 0, 5), [0, 0, -1]);
    near(aim(EAST, 0, 5), [1, 0, 0]);
    near(aim(SOUTH, 0, 5), [0, 0, 1]);
    near(aim(WEST, 0, 5), [-1, 0, 0]);
    expect(aim(NORTH, 1, 5)[1]).toBeGreaterThan(0.8);
  });

  it('depends on seq alone: same inputs, same direction; other seqs, other directions', () => {
    expect(aim(1, 0.3, 77)).toEqual(aim(1, 0.3, 77));
    const seen = new Set(Array.from({ length: 200 }, (_, seq) => aim(0, 0, seq).join()));
    expect(seen.size).toBe(200);
  });

  it('turns every way: left and right, up and down', () => {
    const sides = new Set<string>();
    for (let seq = 0; seq < 200; seq++) {
      const d = aim(NORTH, 0, seq);
      sides.add(`${Math.sign(d[0])}${Math.sign(d[1])}`);
    }
    expect([...sides].sort()).toEqual(['-1-1', '-11', '1-1', '11']);
  });
});

describe('trace', () => {
  const from = (x: number, y: number, z: number, d: Vec3, max = RANGE) =>
    trace(lvl, [x, y, z], d, max);

  it('runs the corridor and the hall end to end: portals at eye height do not stop it', () => {
    // Start room, corridor, west hall, lava pit, east hall: the wall at x = 36.
    expect(from(8, 1.6, 8, [1, 0, 0])).toBeCloseTo(28);
  });

  it('stops at a wall, and at max', () => {
    expect(from(8, 1.6, 8, [-1, 0, 0])).toBeCloseTo(8);
    expect(from(8, 1.6, 8, [0, 0, 1])).toBeCloseTo(8);
    expect(from(8, 1.6, 8, [1, 0, 0], 3)).toBe(3);
    // Diagonal into a corner of the start room.
    expect(from(8, 1.6, 8, unit(-1, 0, -1))).toBeCloseTo(8 * Math.SQRT2);
  });

  it('stops at the ceiling and the floor, straight and slanted', () => {
    expect(from(8, 2, 8, [0, 1, 0])).toBeCloseTo(3);
    expect(from(8, 2, 8, [0, -1, 0])).toBeCloseTo(1);
    // Pit floor at 0, a ray down from over the pit.
    expect(from(28, 1.6, 8, [0, -1, 0])).toBeCloseTo(1.6);
    const d = unit(1, 0.5, 0);
    // Start room ceiling 5: 3 m of climb from y = 2 at slope 0.5 is 6 m of run.
    expect(from(8, 2, 8, d)).toBeCloseTo(6 / d[0]);
    const f = unit(1, -0.5, 0);
    // Start room floor at 1: 1 m of fall at slope 0.5.
    expect(from(8, 2, 8, f)).toBeCloseTo(1 / Math.abs(f[1]));
  });

  it('is stopped by the corridor ceiling below the portal opening, passes under it', () => {
    // The corridor ceiling is 3.5 (start room: 5). Slope 0.3: y = 4.0 at the mouth, x = 16.
    expect(from(8, 1.6, 8, unit(1, 0.3, 0))).toBeCloseTo(8 * Math.hypot(1, 0.3));
    // Slope 0.2: y = 3.2 at the mouth, in; it meets the 3.5 ceiling inside, at x = 17.5.
    expect(from(8, 1.6, 8, unit(1, 0.2, 0))).toBeCloseTo(9.5 * Math.hypot(1, 0.2));
    // Slope 0.1 stays under the ceiling all the way, and clears the hall to its wall.
    expect(from(8, 1.6, 8, unit(1, 0.1, 0))).toBeCloseTo(28 * Math.hypot(1, 0.1));
  });

  it('is stopped by a portal whose floor is above the crossing, in the corridor sill', () => {
    // Down into the sill from the start room is the same floor: a ray under 1 m is the floor.
    const d = unit(1, -0.1, 0);
    // Starts 0.5 above the floor: 5 m of run to the floor, inside the start room.
    expect(from(8, 1.5, 8, d)).toBeCloseTo(5 * Math.hypot(1, 0.1));
  });

  it('is stopped by the lava pit walls: the pit side is a step face', () => {
    // From the west hall (floor 1) down over the pit lip: y = 1.2 at x = 26 passes, the pit floor
    // is at 0 and its east side faces a floor at 1: at x = 30 the ray is at y = 0.4, below it.
    const d = unit(1, -0.2, 0);
    expect(from(24, 1.6, 8, d)).toBeCloseTo(6 * Math.hypot(1, 0.2));
    // Level with the hall floor skimming over the pit: y = 1.05 all along, nothing stops it.
    expect(from(24, 1.05, 8, [1, 0, 0])).toBeCloseTo(12);
    // Below the lip from the pit: faces the step at once.
    expect(from(28, 0.5, 8, [1, 0, 0])).toBeCloseTo(2);
  });

  it('is stopped by the stairs step faces, not by the next ones when it clears them', () => {
    // South hall (floor 1) to the stairs (1.4, 1.8, 2.2, balcony 2.6), heading +z at x = 30.
    expect(from(30, 1.2, 14, [0, 0, 1])).toBeCloseTo(2);
    expect(from(30, 1.5, 14, [0, 0, 1])).toBeCloseTo(3);
    expect(from(30, 2, 14, [0, 0, 1])).toBeCloseTo(4);
    expect(from(30, 2.4, 14, [0, 0, 1])).toBeCloseTo(5);
    // Over every step, then the balcony wall at z = 26.
    expect(from(30, 2.7, 14, [0, 0, 1])).toBeCloseTo(12);
    // From the balcony back down the stairs, falling 0.4 per metre: the risers face away, the ray
    // passes over them and ends on the hall floor, at z = 14.5.
    expect(from(30, 3.2, 20, unit(0, -0.4, -1))).toBeCloseTo(5.5 * Math.hypot(1, 0.4));
  });

  it('stops on a wall that runs along a collinear split', () => {
    // The start room east wall is split at z = 6 and 10; z = 12 is plain wall, z = 8 the portal.
    expect(from(8, 1.6, 12, [1, 0, 0])).toBeCloseTo(8);
    expect(from(8, 1.6, 4, [1, 0, 0])).toBeCloseTo(8);
  });

  it('survives a ray through a vertex and along an edge', () => {
    // 0.8, 0.6 from (8.8, 1.2) crosses x = 16 at z = 6: the vertex of the wall and the portal.
    const vertex = from(8.8, 1.6, 1.2, [0.8, 0, 0.6]);
    expect(vertex).toBeGreaterThanOrEqual(9 - 1e-6);
    expect(vertex).toBeLessThanOrEqual(RANGE);
    // Along the corridor south wall line, z = 6.
    const along = from(8, 1.6, 6, [1, 0, 0]);
    expect(along).toBeGreaterThan(0);
    expect(along).toBeLessThanOrEqual(RANGE);
    // Straight up and straight down on an edge.
    expect(from(16, 2, 6, [0, 1, 0])).toBeGreaterThan(0);
  });

  it('starts in sector 0 from outside the map, and ends within max', () => {
    const t = from(-5, 1.6, 8, [1, 0, 0]);
    expect(t).toBeGreaterThanOrEqual(0);
    expect(t).toBeLessThanOrEqual(RANGE);
  });
});

describe('fire', () => {
  const player = (
    id: number,
    x: number,
    y: number,
    z: number,
    yaw = 0,
    pitch = 0,
  ): PlayerState => ({
    id,
    x,
    y,
    z,
    vy: 0,
    yaw,
    pitch,
    ground: true,
    cool: 0,
  });
  // 6 m of room: a spread of SPREAD is at most 0.12 m off the line.
  const shooter = player(0, 4, 1, 8, EAST);

  it('hits the side of a cylinder on the line, and stops where it enters', () => {
    const s = fire(lvl, shooter, 3, [player(1, 10, 1, 8)].map(body));
    expect(s).toMatchObject({ id: 0, hit: 1 });
    expect(s.x).toBeCloseTo(10 - 0.4, 1);
    // The spread moves the point by at most 6 m x SPREAD.
    expect(Math.abs(s.y - (1 + EYE))).toBeLessThanOrEqual(6 * SPREAD);
    expect(Math.abs(s.z - 8)).toBeLessThanOrEqual(6 * SPREAD);
  });

  it('misses a cylinder beside the line, and ends on the wall', () => {
    const s = fire(lvl, shooter, 3, [player(1, 10, 1, 9)].map(body));
    expect(s.hit).toBe(-1);
    expect(s.x).toBeCloseTo(36, 0);
  });

  it('shoots over a head and under a pair of feet', () => {
    // Eye at 2.6: a target standing at 1 holds it, one whose head is 2.4 high is under the line,
    // one whose feet are at 3 is over it.
    expect(fire(lvl, shooter, 3, [player(1, 10, 1, 8)].map(body)).hit).toBe(1);
    expect(fire(lvl, shooter, 3, [player(1, 10, 0.6, 8)].map(body)).hit).toBe(-1);
    expect(fire(lvl, shooter, 3, [player(1, 10, 3, 8)].map(body)).hit).toBe(-1);
  });

  it('enters through the top cap when shooting down onto a head', () => {
    const above = player(0, 4, 2, 8, NORTH, -MAX_PITCH);
    // Eye at 3.6 looking almost straight down at a target 0.05 m ahead: the head top is at 2.8.
    const s = fire(lvl, above, 3, [player(1, 4, 1, 7.95)].map(body));
    expect(s.hit).toBe(1);
    expect(s.y).toBeCloseTo(1 + PLAYER_H, 1);
  });

  it('enters through the bottom cap when shooting up at feet over the eye', () => {
    const below = player(0, 4, 1, 8, NORTH, MAX_PITCH);
    // Eye at 2.6 looking almost straight up at a target standing at 3.2.
    const s = fire(lvl, below, 3, [player(1, 4, 3.2, 7.95)].map(body));
    expect(s.hit).toBe(1);
    expect(s.y).toBeCloseTo(3.2, 1);
  });

  it('does not see through walls', () => {
    const west = player(0, 4, 1, 8, WEST);
    const s = fire(lvl, west, 3, [player(1, -3, 1, 8)].map(body));
    expect(s.hit).toBe(-1);
    expect(s.x).toBeCloseTo(0, 0);
    // Nor through a step face or a low ceiling.
    expect(
      fire(lvl, player(0, 30, 1, 13, SOUTH, -0.05), 3, [player(1, 30, 2.6, 22)].map(body)).hit,
    ).toBe(-1);
  });

  it('never hits the shooter, and takes the nearest of several targets', () => {
    expect(fire(lvl, shooter, 3, [shooter, player(1, 10, 1, 8)].map(body)).hit).toBe(1);
    expect(fire(lvl, shooter, 3, [player(2, 14, 1, 8), shooter].map(body)).hit).toBe(2);
    expect(fire(lvl, shooter, 3, [player(2, 14, 1, 8), player(1, 8, 1, 8)].map(body)).hit).toBe(1);
    expect(fire(lvl, shooter, 3, [player(1, 8, 1, 8), player(2, 14, 1, 8)].map(body)).hit).toBe(1);
  });

  it('shoots from the eye along aim(), with the same spread the client rolls', () => {
    for (const seq of [0, 1, 99, 65535]) {
      const d = aim(shooter.yaw, shooter.pitch, seq);
      const s = fire(lvl, { ...shooter, id: 5 }, seq, []);
      expect(unit(s.x - 4, s.y - (1 + EYE), s.z - 8)).toEqual(d.map(v => expect.closeTo(v, 9)));
      expect(s.id).toBe(5);
    }
  });

  it('reaches RANGE and no further', () => {
    const map: MapDef = {
      spawns: [[0, 0, 0]],
      sectors: [
        {
          pts: [
            [-300, 0],
            [300, 0],
            [300, 20],
            [-300, 20],
          ],
          floor: -100,
          ceil: 100,
          ft: TEX.TILE,
          wt: TEX.BRICK,
          ct: TEX.STONE,
        },
      ],
    };
    const big = compile(map);
    const far = player(0, -150, 0, 10, EAST);
    // The spread is up to 2 m wide at 100 m: take a seq that hardly turns.
    const seq = Array.from({ length: 5000 }, (_, k) => k).find(
      k => angle(aim(EAST, 0, k), [1, 0, 0]) < 0.001,
    )!;
    expect(fire(big, far, seq, [player(1, -150 + RANGE - 1, 0, 10)].map(body)).hit).toBe(1);
    const miss = fire(big, far, seq, [player(1, -150 + RANGE + 2, 0, 10)].map(body));
    expect(miss.hit).toBe(-1);
    expect(Math.hypot(miss.x + 150, miss.z - 10)).toBeCloseTo(RANGE, 0);
  });
});
