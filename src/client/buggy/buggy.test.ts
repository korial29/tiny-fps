import { describe, expect, it } from 'vitest';
import { duo } from '../../../test/teams';
import { spawn } from '../../shared/physics';
import { ROVER, seat } from '../../shared/rover';
import { NOBODY, TEX } from '../../shared/types';
import type { Rover } from '../../shared/types';
import { build } from '../../shared/world';
import type { Brush, World } from '../../shared/world';
import { GLOW } from '../flag';
import { STRIDE } from '../mesh';
import type { Vec3 } from '../mesh';
import { MOON_LOOK, contacts, rover } from '../rover';
import { BUGGY } from '.';

const { A, B, WR, L0, CMAX } = ROVER;
const slab = (min: Vec3, max: Vec3): Brush => ({ min, max, top: TEX.STONE, side: TEX.STONE });
const flat: World = build({
  brushes: [slab([-100, -5, -100], [100, 0, 100])],
  teams: duo([[0, 0, 0, 0]]),
  floor: -20,
  sun: { dir: [0, 1, 0], color: [1, 1, 1] },
  sky: [
    [0, 0, 1],
    [1, 1, 1],
  ],
});
const TEAM = [0.9, 0.2, 0.1];
const over = (c: number) => WR + L0 - c;
const REST = over(0.08);
const state = (o: Partial<Rover> = {}): Rover => ({
  x: 0,
  y: REST,
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
  driver: NOBODY,
  rider: NOBODY,
  ...o,
});
const make = (o: Partial<Rover> = {}, lod = 2, spin = 0, rgb = TEAM, look = BUGGY) => {
  const out: number[] = [];
  rover(out, state(o), flat, spin, rgb, lod, 0, look);
  return out;
};
const count = (v: number[]) => v.length / STRIDE;
const at = (v: number[], i: number): Vec3 => [v[i * STRIDE], v[i * STRIDE + 1], v[i * STRIDE + 2]];
const all = (v: number[]) => Array.from({ length: count(v) }, (_, i) => i);
const colour = (v: number[], i: number) => [
  v[i * STRIDE + 6],
  v[i * STRIDE + 7],
  v[i * STRIDE + 9],
];
const is = (v: number[], i: number, rgb: number[], k = 1) =>
  colour(v, i).every((c, j) => Math.abs(c - rgb[j] * k) < 1e-9);
const mean = (ps: Vec3[]): Vec3 =>
  ps
    .reduce((m, p) => [m[0] + p[0], m[1] + p[1], m[2] + p[2]], [0, 0, 0])
    .map(x => x / ps.length) as Vec3;
const dist = (p: Vec3, q: Vec3) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
/** The vertices a turn of the wheels moves: the wheels'. */
const rolling = (lod = 2) => {
  const [a, b] = [make({}, lod, 0), make({}, lod, 1)];
  return new Set(all(a).filter(i => dist(at(a, i), at(b, i)) > 1e-9));
};
/** The team's vertices: those another team's colour changes. */
const dyed = (lod = 2) => {
  const [a, b] = [make({}, lod), make({}, lod, 0, [0.1, 0.3, 0.9])];
  return all(a).filter(i => colour(a, i).some((c, j) => c !== colour(b, i)[j]));
};

describe("Landfall's buggy", () => {
  for (const lod of [0, 1, 2]) {
    it(`is whole triangles of finite numbers with unit normals at level ${lod}, at rest and thrown about`, () => {
      for (const v of [
        make({}, lod),
        make({ yaw: 2.3, pitch: 0.4, roll: -0.3, steer: 0.5, y: 0.7 }, lod, 1.3),
        make({ y: 9, pitch: -0.8, roll: 0.9, steer: -0.55 }, lod, -40),
      ]) {
        expect(v.length % (3 * STRIDE)).toBe(0);
        expect(v.every(Number.isFinite)).toBe(true);
        for (const i of all(v)) {
          const n = Math.hypot(v[i * STRIDE + 3], v[i * STRIDE + 4], v[i * STRIDE + 5]);
          expect(n).toBeCloseTo(1, 4);
        }
      }
    });
  }

  it('stays within 1,000 vertices far, 3,000 mid and 6,000 near, and any level past 2 is the near one', () => {
    const [far, mid, near] = [0, 1, 2].map(lod => count(make({}, lod)));
    expect(far).toBeLessThanOrEqual(1000);
    expect(mid).toBeLessThanOrEqual(3000);
    expect(near).toBeLessThanOrEqual(6000);
    expect(far).toBeLessThan(mid);
    expect(mid).toBeLessThan(near);
    expect(make({}, 5)).toEqual(make({}, 2));
  });

  it("is a look of its own and leaves the moon's rover as it was", () => {
    for (const lod of [0, 1, 2]) {
      const moon: number[] = [];
      rover(moon, state(), flat, 0, TEAM, lod, 0, MOON_LOOK);
      const plain: number[] = [];
      rover(plain, state(), flat, 0, TEAM, lod);
      expect(plain).toEqual(moon);
      expect(make({}, lod)).not.toEqual(moon);
    }
  });

  it('keeps its belly off the ground: at rest nothing but the wheels goes below the bottom of the hubs, and on the stops nothing else touches', () => {
    for (const lod of [0, 1, 2]) {
      const wheels = rolling(lod);
      const rest = make({}, lod);
      const hub = contacts(state(), flat)[0][1] + WR;
      for (const i of all(rest)) {
        if (!wheels.has(i)) {
          expect(at(rest, i)[1]).toBeGreaterThan(hub - 0.25);
        }
      }
      const sunk = make({ y: over(CMAX) }, lod);
      for (const i of all(sunk)) {
        if (!wheels.has(i)) {
          expect(at(sunk, i)[1]).toBeGreaterThan(0.08);
        }
      }
    }
  });

  it('leaves the seats’ space empty: the room of a seated body where the simulation puts the players', () => {
    const p = spawn(1, flat, 0);
    for (const lod of [1, 2]) {
      const v = make({}, lod);
      const tried: Vec3[] = [];
      for (let i = 0; i < count(v); i += 3) {
        const [a, b, c] = [0, 1, 2].map(k => at(v, i + k));
        tried.push(a, b, c, mean([a, b]), mean([b, c]), mean([c, a]), mean([a, b, c]));
      }
      for (const s of [0, 1] as const) {
        seat(p, state(), s);
        const rel = tried.map(([x, y, z]): Vec3 => [x - p.x, y - p.y, p.z - z]);
        const inside = (w: number, y0: number, y1: number, a0: number, a1: number) =>
          rel.filter(([x, y, a]) => Math.abs(x) < w && y > y0 && y < y1 && a > a0 && a < a1).length;
        // The trunk and the head, then the legs out to the pedals; a cushion under, a back behind.
        expect(inside(0.2, 0.17, 1.3, -0.2, 0.25)).toBe(0);
        expect(inside(0.15, -0.02, 0.4, 0.25, 0.7)).toBe(0);
        expect(inside(0.2, 0.05, 0.17, -0.2, 0.15)).toBeGreaterThan(0);
        expect(inside(0.2, 0.3, 0.9, -0.55, -0.25)).toBeGreaterThan(0);
      }
    }
  });

  it('wears the team’s colour on its bonnet, its pods, a mudguard over each wheel and the whip’s pennant', () => {
    for (const lod of [0, 1, 2]) {
      const v = make({}, lod);
      const team = dyed(lod).filter(i => is(v, i, TEAM));
      for (const [x, z] of [
        [-B, -A],
        [B, -A],
        [-B, A],
        [B, A],
      ]) {
        expect(team.some(i => Math.hypot(at(v, i)[0] - x, at(v, i)[2] - z) < 0.5)).toBe(true);
      }
      // The bonnet ahead, the pods down the sides between the wheels.
      expect(team.some(i => Math.abs(at(v, i)[0]) < 0.7 && at(v, i)[2] < -1.5)).toBe(true);
      expect(team.some(i => Math.abs(at(v, i)[0]) > 0.85 && Math.abs(at(v, i)[2]) < 0.7)).toBe(
        true,
      );
    }
    const near = make();
    expect(
      dyed().some(i => is(near, i, TEAM) && at(near, i)[1] - REST > 1.5 && at(near, i)[2] > 1.9),
    ).toBe(true);
    expect(all(near).some(i => is(near, i, [1, 0.95, 0.8], GLOW))).toBe(true);
  });

  it('is wide, its pods out to 0.9 m, and its bonnet slopes down to the grille (the user, 2026-11-27)', () => {
    const v = make();
    const pods = dyed().filter(i => Math.abs(at(v, i)[2]) < 0.7 && at(v, i)[1] - REST < 0.2);
    expect(Math.max(...pods.map(i => Math.abs(at(v, i)[0])))).toBeGreaterThan(0.9);
    // The bonnet's top (between the mudguards): high behind, much lower at the grille.
    const top = (z0: number, z1: number) =>
      Math.max(
        ...dyed()
          .filter(i => Math.abs(at(v, i)[0]) < 0.7 && at(v, i)[2] < z0 && at(v, i)[2] > z1)
          .map(i => at(v, i)[1] - REST),
      );
    expect(top(-0.9, -1.1) - top(-1.85, -2)).toBeGreaterThan(0.25);
  });
});
