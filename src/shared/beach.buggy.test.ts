import { describe, expect, it } from 'vitest';
import { BEACH, CAMP, ZED, walked } from './beach';
import { TICK_HZ } from './constants';
import { forward } from './physics';
import { ROVER, drive, park } from './rover';
import { KEY } from './types';
import type { Input } from './types';
import { build } from './world';

// Landfall's buggies (the user, 2026-11-27: a buggy for each camp): the rover's chassis, parked
// at each camp. The model is the client's (src/client/buggy/).
const world = build(BEACH);
const input = (keys: number, yaw = 0): Input => ({ seq: 0, keys, yaw, pitch: 0 });
const { A, B, WR } = ROVER;

describe("LANDFALL's buggies", () => {
  it('parks one a camp, twins across the centre line, each nose toward the other camp', () => {
    const [red, blue] = BEACH.rovers!;
    expect(BEACH.rovers).toHaveLength(2);
    expect(blue[0]).toBe(red[0]);
    expect(blue[2]).toBe(ZED - red[2]);
    // Red's camp is at the far end (z 209..229): its nose looks to -z, blue's to +z.
    expect(red[2]).toBeGreaterThan(ZED / 2);
    expect(forward(red[3])[1]).toBeCloseTo(-1, 9);
    expect(forward(blue[3])[1]).toBeCloseTo(1, 9);
  });

  it('stands on the camp’s level sand under every wheel, and stays put when nobody drives it', () => {
    for (const [x, , z] of BEACH.rovers!) {
      for (const [dx, dz] of [
        [-B, -A],
        [B, -A],
        [-B, A],
        [B, A],
      ]) {
        expect(walked(x + dx, z + dz)).toBeCloseTo(CAMP, 5);
      }
    }
    const cars = park(world);
    expect(cars).toHaveLength(2);
    for (const r of cars) {
      const [x, z] = [r.x, r.z];
      for (let t = 0; t < 3 * TICK_HZ; t++) {
        drive(r, undefined, world, cars);
      }
      expect(Math.hypot(r.x - x, r.z - z)).toBeLessThan(0.05);
      expect(Math.abs(r.pitch)).toBeLessThan(0.02);
      expect(Math.abs(r.roll)).toBeLessThan(0.02);
      // On its wheels, on the sand.
      expect(r.y).toBeGreaterThan(CAMP + WR);
    }
  });

  it('drives off toward the wreck at full throttle: 20 m and more in 4 s on the sand', () => {
    const cars = park(world);
    const r = cars[0];
    const z = r.z;
    for (let t = 0; t < 4 * TICK_HZ; t++) {
      drive(r, input(KEY.FORWARD, r.yaw), world, cars);
    }
    expect(z - r.z).toBeGreaterThan(20);
  });

  it("drives up red's wing from the sand onto the fairing's ledge, over the breaks and never under them (the user, 2026-11-27)", () => {
    for (const [x, throttle] of [
      [54.5, 1],
      [56.5, 1],
      [55, 0.5],
    ]) {
      const cars = park(world);
      const r = cars[0];
      Object.assign(r, { x, z: 192, y: walked(x, 192) + ROVER.L0 + WR, yaw: 0 });
      let low = Infinity;
      for (let t = 0; t < 8 * TICK_HZ && r.z > 138; t++) {
        drive(r, input(t % 2 < 2 * throttle ? KEY.FORWARD : 0), world, cars);
        if (r.z > 148 && r.z < 165) {
          low = Math.min(low, r.y - walked(r.x, r.z));
        }
      }
      // Up on the wing's middle, metres over the sand; a fall into a break would roll it under.
      expect(low, `from x ${x}`).toBeGreaterThan(2);
      expect(r.z, `from x ${x}`).toBeLessThanOrEqual(138);
      expect(r.y, `from x ${x}`).toBeGreaterThan(8.5);
    }
  });
});
