import { describe, expect, it } from 'vitest';
import { duo } from '../../test/teams';
import { spawn } from './physics';
import { ROVER, board, drive, leave, park, ride, seat } from './rover';
import { KEY, MODE, NOBODY, TEX } from './types';
import type { Input } from './types';
import { build } from './world';
import type { Spawn, World } from './world';

const world = (rovers?: Spawn[]): World =>
  build({
    brushes: [{ min: [-100, -5, -100], max: [100, 0, 100], top: TEX.STONE, side: TEX.STONE }],
    teams: duo([[0, 0, 0, 0]]),
    floor: -20,
    sun: { dir: [0, 1, 0], color: [1, 1, 1] },
    sky: [
      [0, 0, 1],
      [1, 1, 1],
    ],
    rovers,
  });
const yard = world([
  [10, 0, 5, 0],
  [-30, 0, 40, Math.PI / 2],
]);
const input = (keys: number, yaw = 0): Input => ({ seq: 0, keys, yaw, pitch: 0 });

describe('park', () => {
  it('puts the rovers of the map on their spawns, at rest, nobody aboard', () => {
    const [a, b] = park(yard);
    expect([a.x, a.y, a.z]).toEqual([10, Math.fround(ROVER.WR + ROVER.L0), 5]);
    expect(a.yaw).toBe(0);
    expect(b.yaw).toBe(Math.fround(Math.PI / 2));
    expect([a.vx, a.vy, a.vz, a.pitch, a.roll, a.wy, a.wp, a.wr, a.steer]).toEqual(
      Array(9).fill(0),
    );
    expect([a.driver, a.rider, b.driver, b.rider]).toEqual(Array(4).fill(NOBODY));
  });

  it('has none on a map without rovers', () => {
    expect(park(world())).toEqual([]);
  });
});

describe('the seats', () => {
  it("take a player aboard: he rides, on his seat, at the rover's speed", () => {
    const [r] = park(yard);
    Object.assign(r, { vx: 3, vy: 1, vz: -2 });
    const p = { ...spawn(4, yard, 0), edge: 2 };
    board(p, r, 0);
    expect(r.driver).toBe(4);
    expect(r.rider).toBe(NOBODY);
    expect(p.mode).toBe(MODE.RIDE);
    expect([p.t, p.edge]).toEqual([0, 0]);
    expect([p.vx, p.vy, p.vz]).toEqual([3, 1, -2]);
    // The driver sits on the left of a nose that points to -z, the rider on the right.
    expect(p.x).toBeLessThan(r.x);
    const q = spawn(5, yard, 0);
    board(q, r, 1);
    expect(r.rider).toBe(5);
    expect(q.x).toBeGreaterThan(r.x);
    expect(q.y).toBe(p.y);
    expect(Math.hypot(q.x - r.x, q.z - r.z)).toBeLessThan(ROVER.RB);
  });

  it('follow the rover', () => {
    const [r] = park(yard);
    const p = spawn(1, yard, 0);
    board(p, r, 1);
    const [dx, dy, dz] = [p.x - r.x, p.y - r.y, p.z - r.z];
    Object.assign(r, { x: 40, y: 6, z: -12 });
    seat(p, r, 1);
    expect(p.x - r.x).toBeCloseTo(dx, 5);
    expect(p.y - r.y).toBeCloseTo(dy, 5);
    expect(p.z - r.z).toBeCloseTo(dz, 5);
  });

  it('are freed by who gets out, in the air', () => {
    const [r] = park(yard);
    const p = spawn(1, yard, 0);
    board(p, r, 0);
    leave(p, r, 0, yard);
    expect(r.driver).toBe(NOBODY);
    expect(p.mode).toBe(MODE.AIR);
  });
});

describe('ride', () => {
  it('keeps the driver on his seat, unarmed, until a press of USE', () => {
    const [r] = park(yard);
    const p = spawn(1, yard, 0);
    board(p, r, 0);
    expect(ride(p, r, input(KEY.FORWARD | KEY.FIRE), yard, 0)).toBe(false);
    expect(p.mode).toBe(MODE.RIDE);
    expect(r.driver).toBe(1);
    expect(p.shots).toBe(0);
    // Held from before he sat: not a press.
    p.held = KEY.USE;
    ride(p, r, input(KEY.USE), yard, 0);
    expect(r.driver).toBe(1);
    ride(p, r, input(0), yard, 0);
    ride(p, r, input(KEY.USE), yard, 0);
    expect(r.driver).toBe(NOBODY);
    expect(p.mode).toBe(MODE.AIR);
  });
});

describe('drive', () => {
  it('tells when the rover is under the kill floor', () => {
    const [r] = park(yard);
    expect(drive(r, undefined, yard)).toBe(false);
    r.y = -21;
    expect(drive(r, input(0), yard)).toBe(true);
  });
});
