import { describe, expect, it } from 'vitest';
import { BEACH, EDGE, FRAME, HULL, ROCKS, TRUNKS, ZED, blockOf, walked } from '../shared/beach';
import { rockMid } from '../shared/moon';
import { TEX } from '../shared/types';
import type { WorldDef } from '../shared/world';
import { jungle, parts } from './jungle';
import { STRIDE } from './mesh';

const made = parts(BEACH);
const count = (v: number[]) => v.length / STRIDE;
/** Every palm as drawn near (Decor.groves), and as drawn far. */
const near = (p = made) => [...p.groves.values()].flatMap(g => g.near);
const far = (p = made) => [...p.groves.values()].flatMap(g => g.far);
/** Whether a vertex is on a palm of TRUNKS or its twin, the row the map collides with. */
const onTrunk = (v: number[]) =>
  TRUNKS.some(([x, z]) => [z, ZED - z].some(t => Math.hypot(v[0] - x, v[2] - t) < 1));
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
  const { reach } = blockOf(s, R, H);
  const mid = g + rockMid(H);
  return rocks.filter(v => {
    const [dx, dy, dz] = [v[0] - x, v[1] - mid, (twin ? ZED - v[2] : v[2]) - z];
    const d = Math.hypot(dx, dy, dz);
    return d < 3 * R && Math.abs(d - reach([dx / d, dy / d, dz / d])) < 1e-6;
  }).length;
};

describe('jungle', () => {
  it('is the same every time: whole triangles of finite numbers, their normals unit', () => {
    // Counted in plain loops: a million vertices, one expect each, took seconds.
    const [v, w] = [jungle(BEACH), jungle(BEACH)];
    expect(w.length).toBe(v.length);
    expect(v.length % (3 * STRIDE)).toBe(0);
    let [differ, odd] = [0, 0];
    for (let i = 0; i < v.length; i++) {
      differ += +(v[i] !== w[i]);
      odd += +!Number.isFinite(v[i]);
    }
    let skew = 0;
    for (let i = 0; i < v.length; i += STRIDE) {
      skew += +(Math.abs(Math.hypot(v[i + 3], v[i + 4], v[i + 5]) - 1) > 1e-5);
    }
    expect([differ, odd, skew]).toEqual([0, 0, 0]);
    const rest = Object.entries(made).filter(([k]) => k != 'groves');
    expect(v.length).toBe(rest.reduce((n, [, p]) => n + (p as number[]).length, near().length));
  });

  it('keeps each part within its share of the level', () => {
    expect(count(made.rocks)).toBeLessThan(45_500);
    // The palms near and far (each tile drawn in one of the two, render.ts), the undergrowth
    // near only (Decor.grass): what a frame draws of them is bounded by the distances, not these.
    expect(count(near())).toBeLessThan(250_000);
    expect(count(far())).toBeLessThan(85_000);
    expect(count(made.brush)).toBeLessThan(880_000);
    expect(count(made.canopy)).toBeLessThan(76_000);
    expect(count(made.snags)).toBeLessThan(11_000);
    expect(count(jungle(BEACH))).toBeLessThan(1_260_000);
  });

  it('draws each palm twice, near and far, the far one cheaper and as tall, both in its tile', () => {
    for (const g of made.groves.values()) {
      expect(g.near.length).toBeGreaterThan(g.far.length);
      expect(g.far.length).toBeGreaterThan(0);
      const top = (v: number[]) => Math.max(...verts(v).map(p => p[1]));
      expect(Math.abs(top(g.near) - top(g.far))).toBeLessThan(1);
      // The feet in the tile: its middle within half a tile and the fronds' reach of each point.
      for (const v of [...verts(g.near), ...verts(g.far)]) {
        expect(Math.abs(v[0] - g.x)).toBeLessThan(8 + 9);
        expect(Math.abs(v[2] - g.z)).toBeLessThan(8 + 9);
      }
    }
  });

  it('draws every rock of ROCKS and its twin on the form the map collides with, in granite', () => {
    const rocks = verts(made.rocks);
    expect(rocks.every(v => v[8] === TEX.ROCK)).toBe(true);
    for (const r of ROCKS) {
      for (const twin of [RED, BLUE]) {
        // A sphere of 320 triangles, each corner written with its triangle, less what is under the sand (most of a low block).
        expect(onForm(rocks, r, walked(r[0], r[1]), twin)).toBeGreaterThan(r[2] < 5 ? 300 : 500);
      }
    }
  });

  it('stands a palm on every trunk of TRUNKS and its twin, upright as high as a runner', () => {
    const palms = verts(near());
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
    for (const part of [near(), made.brush, made.canopy]) {
      const low = verts(part).filter(v => open(v) && v[1] < 3 && !onTrunk(v));
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
    const wall = verts(made.canopy).filter(v => v[1] > 6);
    for (let z = 4; z < ZED; z += 4) {
      // Round the nose the fire took the wall: the hull closes the view there, and the forest further in.
      const back = Math.abs(z - ZED / 2) < 30 ? 30 : 12;
      expect(wall.some(v => v[0] < FRAME.east + back && Math.abs(v[2] - z) < 2)).toBe(true);
    }
  });

  it('is broken and burnt where the ship ended: stumps past the wall, ash ahead of the nose, green again further out', () => {
    const [tip, mid] = [HULL.sections[2][1], ZED / 2];
    const snags = verts(made.snags);
    expect(snags.length).toBeGreaterThan(1_500);
    // Drawn only: past the ghost wall, round the nose, charred wood and dry fronds.
    expect(Math.min(...snags.map(v => v[0]))).toBeGreaterThan(EDGE.east);
    expect(snags.every(v => Math.abs(v[2] - mid) < 40 && v[0] < tip + 35)).toBe(true);
    expect(snags.every(v => v[6] >= v[7] && v[7] < 0.14)).toBe(true);
    // Snapped off at different heights: low stumps and trunks still standing.
    const tops = snags.map(v => v[1] - walked(v[0], v[2]));
    expect(Math.max(...tops)).toBeGreaterThan(4);
    expect(tops.filter(y => y < 1.5).length).toBeGreaterThan(snags.length / 3);
    // Before the nose nothing stands: the mass of leaves is down on the ground, the trees and the undergrowth gone.
    for (const part of [near(), made.brush, made.canopy]) {
      const left = verts(part).filter(v => Math.hypot(v[0] - tip - 4, v[2] - mid) < 8);
      expect(left.every(v => v[1] < walked(v[0], v[2]) + 0.2)).toBe(true);
    }
    // Burnt there, green 60 m along the beach.
    const leaves = (z: number) =>
      verts(made.canopy).filter(v => Math.hypot(v[0] - tip - 4, v[2] - z) < 8);
    expect(leaves(mid).length).toBeGreaterThan(10);
    expect(leaves(mid).every(v => v[6] > v[7])).toBe(true);
    expect(leaves(mid + 60).every(v => v[7] > v[6])).toBe(true);
    // The first row is collision: every palm of it still stands (the test above), singed at most.
  });

  it('stands on the relief where there is one', () => {
    const sloped = parts(SLOPE);
    const palms = verts(near(sloped));
    for (const [x, z, r] of TRUNKS) {
      const foot = palms.filter(v => Math.hypot(v[0] - x, v[2] - z) < 1.2 * r);
      // The lowest ring is square to a trunk that already leans a hair: within 2 cm of the ground.
      expect(Math.abs(Math.min(...foot.map(v => v[1])) - 0.03 * x)).toBeLessThan(0.02);
    }
    const rocks = verts(sloped.rocks);
    for (const r of ROCKS) {
      for (const twin of [RED, BLUE]) {
        expect(onForm(rocks, r, 0.03 * r[0], twin)).toBeGreaterThan(r[2] < 5 ? 300 : 500);
      }
    }
  });

  it('reads the lists when called: a trunk the map moves is drawn where it stands', () => {
    const was = TRUNKS[0][0];
    TRUNKS[0][0] = was + 1.5;
    try {
      const [, z] = TRUNKS[0];
      const foot = verts(near(parts(BEACH))).filter(
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
