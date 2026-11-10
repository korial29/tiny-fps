import { describe, expect, it } from 'vitest';
import { box, land, rise } from '../../test/slope';
import { ground } from '../shared/relief';
import { ROVER } from '../shared/rover';
import { NOBODY } from '../shared/types';
import type { Rover } from '../shared/types';
import type { World } from '../shared/world';
import { CHASE, chasePitch, createChase } from './chase';
import type { Chase, Shot } from './chase';
import type { Vec3 } from './mesh';

const DT = 1 / 60;
const EYE: Vec3 = [-0.45, 2.4, 0.1];
const car = (over: Partial<Rover> = {}): Rover => ({
  x: 0,
  y: 1.1,
  z: 0,
  vx: 0,
  vy: 0,
  vz: 0,
  yaw: 0,
  pitch: 0,
  roll: 0,
  wy: 0,
  wp: 0,
  wr: 0,
  steer: 0,
  driver: 1,
  rider: NOBODY,
  ...over,
});
/** `n` frames at the wheel of r, looking along yaw and pitch: the last shot. */
const sit = (c: Chase, r: Rover, yaw = 0, pitch = 0, n = 60, dt = DT): Shot => {
  let s!: Shot;
  for (let k = 0; k < n; k++) {
    s = c.frame(r, true, EYE, pitch, yaw, pitch, dt);
  }
  return s;
};
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const pivot = (r: Rover): Vec3 => [r.x, r.y + CHASE.UP, r.z];
const FULL = Math.hypot(CHASE.BACK, CHASE.RISE);
/** The camera's distance from the pivot at a look pitch, with nothing in the way. */
const reach = (p: number) =>
  Math.hypot(Math.cos(p) * CHASE.BACK, CHASE.RISE - Math.sin(p) * CHASE.BACK);

describe('the chase camera on open ground', () => {
  const w = land();

  it.each([
    [0, [0, 0, 1]],
    [Math.PI / 2, [1, 0, 0]],
    [Math.PI, [0, 0, -1]],
  ])('sits behind the look (yaw %f), BACK away from the pivot and RISE over it', (yaw, back) => {
    const r = car();
    const s = sit(createChase(w), r, yaw);
    const p = pivot(r);
    back.forEach((b, i) =>
      expect(s.at[i]).toBeCloseTo(p[i] + b * CHASE.BACK + +(i == 1) * CHASE.RISE, 5),
    );
    expect(dist(s.at, p)).toBeCloseTo(FULL, 5);
    expect([s.pitch, s.k]).toEqual([0, 1]);
  });

  it('goes up over the rover as the look goes down, and keeps the look within its range', () => {
    const r = car();
    const level = sit(createChase(w), r);
    const down = sit(createChase(w), r, 0, -0.8);
    expect(down.at[1]).toBeGreaterThan(level.at[1] + 3);
    expect(down.pitch).toBeCloseTo(-0.8);
    expect(sit(createChase(w), r, 0, -1.5).pitch).toBe(CHASE.LO);
    expect(sit(createChase(w), r, 0, 1.5).pitch).toBe(CHASE.HI);
    expect([chasePitch(-2), chasePitch(0.1), chasePitch(2)]).toEqual([CHASE.LO, 0.1, CHASE.HI]);
    // At the highest look the camera is still over flat ground.
    expect(sit(createChase(w), r, 0, CHASE.HI).at[1]).toBeGreaterThan(0.8);
  });

  it('widens the field of view with the speed, up to the top speed, and not at rest', () => {
    expect(sit(createChase(w), car(), 0, 0, 120).fov).toBe(0);
    const half = sit(createChase(w), car({ vz: -ROVER.VMAX / 2 }), 0, 0, 240).fov;
    const top = sit(createChase(w), car({ vz: -ROVER.VMAX }), 0, 0, 240).fov;
    expect(half).toBeCloseTo(CHASE.FOV / 2, 2);
    expect(top).toBeCloseTo(CHASE.FOV, 2);
    expect(sit(createChase(w), car({ vz: -60 }), 0, 0, 240).fov).toBeCloseTo(CHASE.FOV, 2);
    // It comes on, not all at once.
    const c = createChase(w);
    sit(c, car(), 0, 0, 30);
    const first = sit(c, car({ vz: -ROVER.VMAX }), 0, 0, 1).fov;
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(1);
  });
});

describe('the chase camera against the world', () => {
  it('is pulled in front of a wall behind the rover, and let back out once past it', () => {
    const w = land(() => 0, [box([-10, 0, 3], [10, 12, 4])]);
    const c = createChase(w);
    const r = car();
    const s = sit(c, r);
    expect(s.at[2]).toBeLessThanOrEqual(3 - CHASE.PAD + 1e-6);
    expect(s.at[2]).toBeGreaterThan(2);
    // Driven 20 m on: the next frame is no further out than a step of the spring, then all the way.
    const far = car({ z: -20 });
    sit(c, far, 0, 0, 240);
    const out = sit(c, far, 0, 0, 240);
    expect(dist(out.at, pivot(far))).toBeCloseTo(FULL, 3);
  });

  it('comes in at once when a wall cuts the view, and backs out softly', () => {
    const w = land(() => 0, [box([-10, 0, 13], [10, 12, 14])]);
    const c = createChase(w);
    sit(c, car());
    // The rover is suddenly 10 m back, right in front of the wall: the camera is not behind it.
    const near = car({ z: 10 });
    for (let k = 0; k < 30; k++) {
      expect(sit(c, near, 0, 0, 1).at[2]).toBeLessThanOrEqual(13 - CHASE.PAD + 1e-6);
    }
    const c2 = createChase(w);
    sit(c2, near);
    const tight = dist(sit(c2, near).at, pivot(near));
    const one = dist(sit(c2, car({ z: 10, x: 0 }), Math.PI, 0, 1).at, pivot(near));
    // Turned to look at the wall, the room behind is free: it eases out.
    expect(one).toBeLessThan(tight + 0.6);
    expect(dist(sit(c2, near, Math.PI, 0, 240).at, pivot(near))).toBeCloseTo(FULL, 3);
  });

  it('is pulled in by a slope behind it, and stays over the ground', () => {
    const w = land(x => (x > 4 ? (x - 4) * rise(35) : 0));
    const r = car();
    const s = sit(createChase(w), r, Math.PI / 2, CHASE.HI);
    expect(dist(s.at, pivot(r))).toBeLessThan(reach(CHASE.HI) - 0.3);
    expect(s.at[0]).toBeGreaterThan(3);
    expect(s.at[1]).toBeGreaterThanOrEqual(ground(w, s.at[0], s.at[2]) + CHASE.PAD - 1e-6);
    // The same look on the flat: all the way out.
    const flat = sit(createChase(land()), r, Math.PI / 2, CHASE.HI);
    expect(dist(flat.at, pivot(r))).toBeCloseTo(reach(CHASE.HI), 5);
  });

  it('never ends under the ground or in a brush, whatever the look, on rough ground', () => {
    const bumps = (x: number, z: number) =>
      2 + 1.5 * Math.sin(x / 5) * Math.cos(z / 7) + (x > 30 ? (x - 30) * 0.7 : 0);
    const walls = [box([-6, 0, 8], [6, 9, 9]), box([12, 0, -20], [13, 9, 20])];
    const w: World = land(bumps, walls);
    let n = 0;
    for (let k = 0; k < 400; k++) {
      const [x, z] = [((k * 37) % 50) - 10, ((k * 53) % 60) - 30];
      const r = car({ x, z, y: ground(w, x, z) + 1.1 });
      const c = createChase(w);
      const s = sit(c, r, k * 0.71, CHASE.LO + ((k * 0.13) % 1) * (CHASE.HI - CHASE.LO), 20);
      expect(s.at[1]).toBeGreaterThanOrEqual(ground(w, s.at[0], s.at[2]) + CHASE.PAD - 1e-6);
      for (const b of walls) {
        const inside = [0, 1, 2].every(i => s.at[i] > b.min[i] && s.at[i] < b.max[i]);
        expect(inside).toBe(false);
      }
      n += +(dist(s.at, pivot(r)) < reach(s.pitch) - 0.01);
    }
    // The sweep did meet the ground and the walls.
    expect(n).toBeGreaterThan(20);
  });

  it('keeps the pivot under a roof over the rover', () => {
    const w = land(() => 0, [box([-4, 2, -4], [4, 3, 4])]);
    const s = sit(createChase(w), car({ y: 1.1 }), 0, -0.2);
    expect(s.at[1]).toBeLessThan(2 - CHASE.PAD + 1e-6);
  });
});

describe('the chase camera in time', () => {
  const w = land();

  it('eases after the rover when it jumps a metre, and gets there', () => {
    const c = createChase(w);
    const a = sit(c, car());
    const up = car({ y: 2.1 });
    const b = sit(c, up, 0, 0, 1);
    expect(b.at[1] - a.at[1]).toBeGreaterThan(0);
    expect(b.at[1] - a.at[1]).toBeLessThan(0.1);
    let last = b.at[1];
    for (let k = 0; k < 30; k++) {
      const y = sit(c, up, 0, 0, 1).at[1];
      // Always toward it, never past it.
      expect(y).toBeGreaterThanOrEqual(last);
      expect(y).toBeLessThanOrEqual(a.at[1] + 1 + 1e-9);
      last = y;
    }
    expect(sit(c, up, 0, 0, 60).at[1]).toBeCloseTo(a.at[1] + 1, 3);
  });

  it('trails a rover at speed, by the same length at any frame rate', () => {
    const gap = (dt: number) => {
      const c = createChase(w);
      const r = car();
      let s!: Shot;
      for (let t = 0; t < 3 - 1e-9; t += dt) {
        r.z -= 20 * dt;
        s = c.frame(r, true, EYE, 0, 0, 0, dt);
      }
      return s.at[2] - r.z;
    };
    const [a, b, d] = [gap(1 / 60), gap(1 / 30), gap(1 / 144)];
    // Behind by BACK and the spring's lag, 2 v / W.
    expect(a).toBeCloseTo(CHASE.BACK + (2 * 20) / CHASE.W, 6);
    expect(b).toBeCloseTo(a, 6);
    expect(d).toBeCloseTo(a, 6);
  });

  it('blends from the eye when boarding, in BLEND seconds, and back to it on the way out', () => {
    const c = createChase(w);
    const r = car();
    expect(c.frame(r, false, EYE, 0.1, 0, 0, DT)).toEqual({ at: EYE, pitch: 0.1, fov: 0, k: 0 });
    const full = sit(createChase(w), r).at;
    const first = c.frame(r, true, EYE, 0.1, 0, 0, DT);
    expect(first.k).toBeGreaterThan(0);
    expect(dist(first.at, EYE)).toBeLessThan(0.1);
    let [was, k] = [dist(first.at, EYE), first.k];
    const n = Math.round(CHASE.BLEND / DT);
    for (let i = 1; i < n + 1; i++) {
      const s = c.frame(r, true, EYE, 0.1, 0, 0, DT);
      expect(s.k).toBeGreaterThanOrEqual(k);
      expect(dist(s.at, EYE)).toBeGreaterThanOrEqual(was);
      [was, k] = [dist(s.at, EYE), s.k];
    }
    expect(k).toBe(1);
    const there = c.frame(r, true, EYE, 0.1, 0, 0, DT);
    there.at.forEach((v, i) => expect(v).toBeCloseTo(full[i], 5));
    expect(there.pitch).toBe(0);
    // Out: the rover he left still gives the view to blend from.
    const half = sit(
      { frame: (...a) => c.frame(a[0], false, a[2], 0.1, a[4], a[5], a[6]) },
      r,
      0,
      0,
      n / 2,
    );
    expect(half.k).toBeGreaterThan(0.2);
    expect(half.k).toBeLessThan(0.8);
    expect(dist(half.at, EYE)).toBeLessThan(dist(full, EYE));
    expect(half.pitch).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      c.frame(r, false, EYE, 0.1, 0, 0, DT);
    }
    expect(c.frame(r, false, EYE, 0.1, 0, 0, DT)).toEqual({ at: EYE, pitch: 0.1, fov: 0, k: 0 });
    // With no rover at all, the eye.
    expect(c.frame(undefined, true, EYE, 0.1, 0, 0, DT).k).toBe(0);
  });

  it('starts again at the next rover: no trail from the one left', () => {
    const c = createChase(w);
    sit(c, car());
    for (let i = 0; i < 30; i++) {
      c.frame(car(), false, EYE, 0, 0, 0, DT);
    }
    const next = car({ x: 200 });
    const s = sit(c, next);
    expect(s.at[0]).toBeCloseTo(200, 5);
  });
});
