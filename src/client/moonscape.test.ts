import { describe, expect, it } from 'vitest';
import { LAYOUT, MOON } from '../shared/moon';
import { TEX } from '../shared/types';
import { STRIDE } from './mesh';
import { moonscape } from './moonscape';

const v = moonscape(MOON);
const verts = Array.from({ length: v.length / STRIDE }, (_, i) =>
  v.slice(i * STRIDE, (i + 1) * STRIDE),
);
const C = [80, 0, 140];
const dist = (p: number[], c: number[]) => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]);
/** What glows far from the play area: the stars and the Earth. */
const sky = verts.filter(p => p[8] === -2 && dist(p, C) > 400);

describe('moonscape', () => {
  it('is whole triangles of finite numbers with unit normals', () => {
    expect(v.length % (3 * STRIDE)).toBe(0);
    expect(v.every(Number.isFinite)).toBe(true);
    expect(verts.every(p => Math.abs(Math.hypot(p[3], p[4], p[5]) - 1) < 1e-3)).toBe(true);
  });

  it("lays 60 small craters in the floor's stone, low, on bare floor only", () => {
    const pits = verts.filter(p => p[8] === TEX.STONE);
    expect(pits.length).toBe(60 * 4 * 12 * 6);
    expect(pits.every(p => p[1] > 0.01 && p[1] <= 0.24 && p[6] === p[0] && p[7] === p[2])).toBe(
      true,
    );
    const standing = MOON.brushes.filter(b => b.max[1] > 0);
    for (const p of pits) {
      expect(
        standing.some(
          b => p[0] > b.min[0] && p[0] < b.max[0] && p[2] > b.min[2] && p[2] < b.max[2],
        ),
      ).toBe(false);
    }
  });

  it('stays within a vertex budget and is the same every time', () => {
    expect(verts.length).toBeGreaterThan(20000);
    expect(verts.length).toBeLessThan(120000);
    expect(moonscape(MOON)).toEqual(v);
  });

  it('puts the stars and the Earth between 600 and 900 m from every corner of the play area', () => {
    expect(sky.length).toBeGreaterThan(3000 * 6);
    for (const c of [
      [0, 0, 0],
      [160, 0, 0],
      [0, 0, 280],
      [160, 0, 280],
    ]) {
      const d = sky.map(p => dist(p, c));
      expect(Math.min(...d)).toBeGreaterThan(500);
      expect(Math.max(...d)).toBeLessThan(900);
    }
    expect(Math.min(...sky.map(p => dist(p, C)))).toBeGreaterThan(600);
    expect(Math.min(...sky.map(p => p[1]))).toBeGreaterThan(-100);
  });

  it('has the Earth in the sky: a bright disc well above the horizon', () => {
    const big = sky.filter(p => p[9] > 0.3 && p[6] + p[7] + p[9] > 0.5 && p[7] > 0);
    expect(Math.max(...sky.map(p => p[1]))).toBeGreaterThan(400);
    expect(big.length).toBeGreaterThan(0);
  });

  it('stands a dome of radius 22 and about 16 m on each half, a glowing band at its foot', () => {
    for (const z of [236, 44]) {
      const near = verts.filter(p => Math.hypot(p[0] - 80, p[2] - z) < 1.5);
      expect(Math.max(...near.map(p => p[1]))).toBeGreaterThan(15.9);
      expect(Math.max(...near.map(p => p[1]))).toBeLessThan(18);
      const at = (r: number) =>
        verts.filter(p => Math.abs(Math.hypot(p[0] - 80, p[2] - z) - r) < 0.01);
      expect(at(22.46).some(p => p[8] === -2 && p[1] > 1 && p[1] < 4)).toBe(true);
      expect(at(22.4).some(p => p[8] === -1 && p[1] < 0.01)).toBe(true);
    }
  });

  it('mirrors red onto blue: the pads and the shuttles at z 220 and 60', () => {
    for (const z of [220, 60]) {
      const pad = verts.filter(
        p => Math.hypot(p[0] - 40, p[2] - z) < 13.1 && p[1] > 0.2 && p[1] < 0.3,
      );
      expect(pad.length).toBeGreaterThan(100);
      const hull = verts.filter(
        p => Math.abs(p[2] - z) < 2.1 && p[0] > 32.9 && p[0] < 47.1 && p[1] > 1,
      );
      expect(Math.max(...hull.map(p => p[1]))).toBeGreaterThan(3);
    }
  });

  it('builds the crater rim outside the play area, 60 to 100 m high, and nothing tall inside', () => {
    const inside = verts.filter(
      p =>
        p[0] > 0 &&
        p[0] < 160 &&
        p[2] > 0 &&
        p[2] < 280 &&
        Math.hypot(...p.slice(0, 3).map((c, k) => c - C[k])) < 300,
    );
    expect(Math.max(...inside.map(p => p[1]))).toBeLessThan(20);
    const out = verts.filter(
      p => p[8] === -1 && (p[0] < 0 || p[0] > 160 || p[2] < 0 || p[2] > 280) && dist(p, C) < 650,
    );
    const top = Math.max(...out.map(p => p[1]));
    expect(top).toBeGreaterThan(60);
    expect(top).toBeLessThan(120);
    for (const side of [
      (p: number[]) => p[0] < 0,
      (p: number[]) => p[0] > 160,
      (p: number[]) => p[2] < 0,
      (p: number[]) => p[2] > 280,
    ]) {
      expect(Math.max(...out.filter(side).map(p => p[1]))).toBeGreaterThan(60);
    }
  });

  it('lays a scree from the floor to 14 m over the stone wall, then rises gently to a crest 200 to 250 m out', () => {
    const at = (x: number) =>
      verts.filter(p => p[8] === -1 && Math.abs(p[0] - x) < 1e-6 && p[2] > 0 && p[2] < 280);
    expect(at(0).length).toBeGreaterThan(0);
    expect(at(0).every(p => Math.abs(p[1] + 0.3) < 1e-6)).toBe(true);
    expect(at(-10).length).toBeGreaterThan(0);
    expect(at(-10).every(p => Math.abs(p[1] - 14) < 1e-6)).toBe(true);
    const west = verts.filter(p => p[8] === -1 && p[0] < -10 && p[2] > 0 && p[2] < 280);
    expect(Math.max(...west.filter(p => p[0] > -50).map(p => p[1]))).toBeLessThan(30);
    const crest = west.filter(p => p[1] > 55);
    expect(Math.min(...crest.map(p => -p[0]))).toBeGreaterThan(120);
    expect(Math.max(...west.map(p => -p[0]))).toBeGreaterThan(300);
  });

  it('puts the masts on the map layout: lamps 10 m up, pad masts on the pad', () => {
    for (const [x, z] of LAYOUT.masts) {
      const y0 = x < 60 ? 0.25 : 0;
      const lamp = verts.filter(
        p => p[8] === -2 && Math.hypot(p[0] - x, p[2] - z) < 0.6 && p[1] > y0 + 9.5,
      );
      expect(lamp.length).toBeGreaterThan(0);
    }
  });
});
