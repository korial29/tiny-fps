import { describe, expect, it } from 'vitest';
import { BEACH, FRAME, ROCKS, TRUNKS, ZED, walked } from '../shared/beach';
import { rockMid, rockOf } from '../shared/moon';
import { TEX } from '../shared/types';
import type { WorldDef } from '../shared/world';
import { jungle, parts } from './jungle';
import { STRIDE } from './mesh';

const made = parts(BEACH);
const count = (v: number[]) => v.length / STRIDE;
/** A part's vertices, one array each. */
const verts = (v: number[]) =>
  Array.from({ length: count(v) }, (_, i) => v.slice(i * STRIDE, (i + 1) * STRIDE));
/** A slope to stand things on: the ground is at 0.03 x, exactly on the lattice's planes. */
const SLOPE: WorldDef = {
  ...BEACH,
  relief: { hole: [0, 0, 0, 0], bound: [55, 100, 300, 300], cell: 4, at: x => 0.03 * x },
};
const [RED, BLUE] = [false, true];

/** How many vertices of `rocks` lie on the form of the rock [x, z, R, H, seed] standing on the ground at g, or on its twin's. */
const onForm = (rocks: number[][], [x, z, R, H, s]: number[], g: number, twin: boolean) => {
  const { reach } = rockOf(s, R, H);
  const mid = g + rockMid(H);
  return rocks.filter(v => {
    const [dx, dy, dz] = [v[0] - x, v[1] - mid, (twin ? ZED - v[2] : v[2]) - z];
    const d = Math.hypot(dx, dy, dz);
    return d < 3 * R && Math.abs(d - reach([dx / d, dy / d, dz / d])) < 1e-6;
  }).length;
};

describe('jungle', () => {
  it('is the same every time: whole triangles of finite numbers, their normals unit', () => {
    const v = jungle(BEACH);
    expect(v).toEqual(jungle(BEACH));
    expect(v.length % (3 * STRIDE)).toBe(0);
    expect(v.every(Number.isFinite)).toBe(true);
    for (let i = 0; i < v.length; i += STRIDE) {
      expect(Math.hypot(v[i + 3], v[i + 4], v[i + 5])).toBeCloseTo(1, 5);
    }
    expect(v.length).toBe(Object.values(made).reduce((n, p) => n + p.length, 0));
  });

  it('keeps each part within its share of the level: under 150,000 vertices in all', () => {
    expect(count(made.rocks)).toBeLessThan(53_000);
    expect(count(made.palms)).toBeLessThan(32_000);
    expect(count(made.forest)).toBeLessThan(33_000);
    expect(count(made.brush)).toBeLessThan(21_000);
    expect(count(made.canopy)).toBeLessThan(12_500);
    expect(count(jungle(BEACH))).toBeLessThan(150_000);
  });

  it('draws every rock of ROCKS and its twin on the form the map collides with, in basalt', () => {
    const rocks = verts(made.rocks);
    expect(rocks.every(v => v[8] === TEX.ROCK)).toBe(true);
    for (const r of ROCKS) {
      for (const twin of [RED, BLUE]) {
        // A sphere of 320 triangles at least, each corner written with its triangle, less what is under the sand.
        expect(onForm(rocks, r, walked(r[0], r[1]), twin)).toBeGreaterThan(500);
      }
    }
  });

  it('stands a palm on every trunk of TRUNKS and its twin, upright as high as a runner', () => {
    const palms = verts(made.palms);
    for (const [x, z0, r] of TRUNKS) {
      for (const z of [z0, ZED - z0]) {
        // Each foot is on its own ground: the sand rises to the trees.
        const g = walked(x, z);
        const near = palms.filter(v => Math.hypot(v[0] - x, v[2] - z) < 1 && v[1] < g + 1.9);
        const off = near.map(v => Math.hypot(v[0] - x, v[2] - z));
        const foot = near.filter(v => v[1] < g + 0.02).map(v => Math.hypot(v[0] - x, v[2] - z));
        expect(foot.length).toBeGreaterThanOrEqual(5);
        // Its foot is the map's circle, a little inside it; no part of the trunk a body meets is far out of it.
        expect(Math.min(...foot)).toBeGreaterThan(0.85 * r);
        expect(Math.max(...foot)).toBeLessThanOrEqual(r);
        expect(Math.max(...off)).toBeLessThan(r + 0.12);
        // And it goes up: a crown over ten times a runner's reach.
        expect(
          Math.max(...palms.filter(v => Math.hypot(v[0] - x, v[2] - z) < 6).map(v => v[1])),
        ).toBeGreaterThan(g + 8);
      }
    }
  });

  it('leaves the sand clear: what is only drawn is behind the first trunks and past the headlands', () => {
    const open = (v: number[]) => v[2] > 20 && v[2] < ZED - 20;
    for (const part of [made.forest, made.brush, made.canopy]) {
      const low = verts(part).filter(v => open(v) && v[1] < 3);
      expect(Math.min(...low.map(v => v[0]))).toBeGreaterThan(FRAME.trees);
    }
    expect(verts(made.rocks).filter(v => open(v) && v[0] > 5).length).toBe(0);
    // The forest goes on well past the last ground walked, and round behind both headlands.
    const far = verts(made.canopy);
    expect(Math.max(...far.map(v => v[0]))).toBeGreaterThan(FRAME.east + 80);
    expect(Math.min(...far.map(v => v[2]))).toBeLessThan(-60);
    expect(Math.max(...far.map(v => v[2]))).toBeGreaterThan(ZED + 60);
  });

  it('closes the view from the sand: a wall of leaves over a runner behind the first row, no gap along it', () => {
    const wall = verts(made.canopy).filter(v => v[0] < FRAME.east + 12 && v[1] > 6);
    for (let z = 4; z < ZED; z += 4) {
      expect(wall.some(v => Math.abs(v[2] - z) < 2)).toBe(true);
    }
  });

  it('stands on the relief where there is one', () => {
    const sloped = parts(SLOPE);
    const palms = verts(sloped.palms);
    for (const [x, z, r] of TRUNKS) {
      const foot = palms.filter(v => Math.hypot(v[0] - x, v[2] - z) < 1.2 * r);
      // The lowest ring is square to a trunk that already leans a hair: within 2 cm of the ground.
      expect(Math.abs(Math.min(...foot.map(v => v[1])) - 0.03 * x)).toBeLessThan(0.02);
    }
    const rocks = verts(sloped.rocks);
    for (const r of ROCKS) {
      for (const twin of [RED, BLUE]) {
        expect(onForm(rocks, r, 0.03 * r[0], twin)).toBeGreaterThan(500);
      }
    }
  });

  it('reads the lists when called: a trunk the map moves is drawn where it stands', () => {
    const was = TRUNKS[0][0];
    TRUNKS[0][0] = was + 1.5;
    try {
      const [, z] = TRUNKS[0];
      const foot = verts(parts(BEACH).palms).filter(
        v =>
          v[1] < walked(was + 1.5, z) + 0.02 &&
          Math.abs(v[2] - z) < 0.5 &&
          Math.abs(v[0] - was - 1.5) < 0.5,
      );
      expect(foot.length).toBeGreaterThanOrEqual(5);
    } finally {
      TRUNKS[0][0] = was;
    }
  });
});
