import { describe, expect, it } from 'vitest';
import { bar, compile } from './level';
import { HALL } from './map';
import { trace } from './trace';
import { ITEM, PHASE, TEX } from './types';

const lvl = compile(HALL);
type Vec3 = [number, number, number];
/** The longest ray these tests cast, metres. */
const RANGE = 100;

/** Unit vector along (x, y, z). */
const unit = (x: number, y: number, z: number): Vec3 => {
  const n = Math.hypot(x, y, z);
  return [x / n, y / n, z / n];
};

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

describe('barred sectors', () => {
  const room = (x0: number, x1: number): [number, number][] => [
    [x0, 0],
    [x1, 0],
    [x1, 10],
    [x0, 10],
  ];
  const sector = (x0: number, x1: number) => ({
    pts: room(x0, x1),
    floor: 0,
    ceil: 4,
    ft: TEX.TILE,
    wt: TEX.BRICK,
    ct: TEX.STONE,
  });
  /** Three rooms in a row, the middle one a gate: bars are bars, you see through them. */
  const gated = compile({
    sectors: [sector(0, 10), sector(10, 14), sector(14, 24)],
    spawns: [[5, 5, 0]],
    gates: [{ sector: 1, key: ITEM.KEY_RED }],
  });

  it('lets a ray fly through a barred gate to the far wall, as through an open one', () => {
    const from: Vec3 = [2, 1.6, 5];
    expect(gated.barred.has(1)).toBe(true);
    const shut = trace(gated, from, [1, 0, 0], RANGE);
    expect(shut).toBeCloseTo(22);
    bar(gated, 1 << ITEM.KEY_RED, PHASE.HUNT);
    expect(gated.barred.has(1)).toBe(false);
    expect(trace(gated, from, [1, 0, 0], RANGE)).toBe(shut);
    bar(gated, 0, PHASE.HUNT);
  });
});
