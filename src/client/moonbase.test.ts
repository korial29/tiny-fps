import { describe, expect, it } from 'vitest';
import { MOON, ZED } from '../shared/moon';
import { BASE, HALL, MOUTHS } from '../shared/moonbase';
import { TEX } from '../shared/types';
import { build } from '../shared/world';
import { STRIDE } from './mesh';
import { INDOORS, moonbase } from './moonbase';
import { moonscape } from './moonscape';
import { scenery } from './render';
import { uses } from './vision';

const v = moonscape(MOON);
const verts = Array.from({ length: v.length / STRIDE }, (_, i) =>
  v.slice(i * STRIDE, (i + 1) * STRIDE),
);
/** The drawn dome: its radius at a height. */
const shell = (y: number) => (y < 5 ? 22.4 : 22.4 * Math.sqrt(1 - ((y - 5) / 12) ** 2));
/** What is drawn indoors: it carries the indoor normal, mirrored in blue's half. */
const indoors = (p: number[]) =>
  p[3] === INDOORS[0] && p[4] === INDOORS[1] && Math.abs(p[5]) === INDOORS[2];

describe('moonbase', () => {
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

  it('draws the hall in each dome: a floor, white walls up to 8 m, the shell from inside and a lamp under its top', () => {
    for (const z of [236, 44]) {
      const r = (p: number[]) => Math.hypot(p[0] - 80, p[2] - z);
      const mine = verts.filter(p => indoors(p) && r(p) < 22.2);
      // The floor, a finger over the regolith, out to the walls of the hall.
      const floor = mine.filter(p => p[8] === TEX.CONCRETE && p[1] === 0.02);
      expect(Math.max(...floor.map(p => Math.abs(p[0] - 80)))).toBeCloseTo(HALL[0][0], 9);
      expect(Math.max(...floor.map(p => Math.abs(p[2] - z)))).toBeCloseTo(HALL[0][0], 9);
      // The walls, from the floor to 8 m, on the hall's sides.
      const walls = mine.filter(p => p[8] === TEX.PAINT && r(p) > 17);
      expect(Math.min(...walls.map(p => p[1]))).toBe(0);
      expect(Math.max(...walls.map(p => p[1]))).toBe(8);
      expect(walls.some(p => Math.abs(Math.abs(p[0] - 80) - HALL[0][0]) < 1e-9 && p[1] === 8)).toBe(
        true,
      );
      // The shell: 6 rings of 32 panels from 8 m up, inside the outer one, and a lamp of 16 sides.
      const inner = mine.filter(p => p[8] === -2 && p[1] > 7.99 && p[1] !== 16.2);
      expect(inner).toHaveLength(6 * 32 * 6);
      expect(Math.max(...inner.map(p => p[1]))).toBeGreaterThan(16.5);
      expect(inner.every(p => r(p) < shell(p[1]) - 0.2 || p[1] > 16.5)).toBe(true);
      // And it clears the hall's walls where they end: a ledge joins the two.
      expect(Math.min(...inner.filter(p => p[1] < 8.01).map(r))).toBeGreaterThan(
        Math.max(...HALL.map(([a, b]) => Math.hypot(a, b))),
      );
      expect(mine.filter(p => p[1] === 16.2 && r(p) < 3.01)).toHaveLength(16 * 3);
    }
  });

  it('lights nothing indoors with the sun: every surface drawn there faces up and away from it, off every axis', () => {
    const inside = verts.filter(indoors);
    expect(inside.length).toBeGreaterThan(7000);
    expect(Math.hypot(...INDOORS)).toBeCloseTo(1, 3);
    expect(Math.min(...INDOORS.map(Math.abs))).toBeGreaterThan(0.5);
    const [x, y, z] = MOON.sun.dir;
    for (const s of [1, -1]) {
      expect(INDOORS[0] * x + INDOORS[1] * y + s * INDOORS[2] * z).toBeLessThan(-0.1);
    }
  });

  it('opens the drum at the door and at the tubes: no pane of its 70 windows stands there', () => {
    const [, mz, w] = MOUTHS[0];
    for (const [z, s] of [
      [236, 1],
      [44, -1],
    ]) {
      const panes = verts.filter(
        p => p[8] === -2 && Math.abs(Math.hypot(p[0] - 80, p[2] - z) - 22.47) < 0.02,
      );
      // 2 at the door and 3 at the tubes are gone.
      expect(panes).toHaveLength(65 * 6);
      expect(panes.some(p => Math.abs(p[0] - 80) < w + 0.2 && s * (p[2] - z) < mz)).toBe(false);
    }
  });

  it('stays within its vertices: under 5000 more a half than the closed base', () => {
    const o: number[] = [];
    moonbase(o);
    expect(o.length % (3 * STRIDE)).toBe(0);
    expect(o.length / STRIDE).toBeGreaterThan(4704 + 3000);
    expect(o.length / STRIDE).toBeLessThan(4704 + 5000);
  });

  it("gets none of the runner's red on the walls of the modules and the tubes: only on the crates and where a module roof stands over a tube", () => {
    const solid = BASE.filter(b => !b.ghost);
    const thin = solid.filter(
      b => Math.min(b.max[0] - b.min[0], b.max[2] - b.min[2]) < 0.41 && b.max[1] - b.min[1] > 2,
    );
    expect(thin.length).toBe(18);
    for (const b of solid) {
      const { beam, lips, stripes } = uses(MOON, b);
      expect(beam).toBe(false);
      expect(stripes).toEqual([]);
      expect(lips.length === 0 || !!b.tint || b.max[1] === 5, `${b.min} to ${b.max}`).toBe(true);
    }
  });
});

describe('moonbase, the doorways as drawn', () => {
  const all = scenery(build(MOON));
  type P = [number, number, number];
  /** The triangles round each base: three corners each. */
  const tris: P[][] = [];
  for (let i = 0; i < all.length; i += 3 * STRIDE) {
    const t = [0, 1, 2].map((k): P => {
      const j = i + k * STRIDE;
      return [all[j], all[j + 1], all[j + 2]];
    });
    if (t.every(p => p[0] > 55 && p[0] < 128 && Math.abs(Math.abs(p[2] - ZED / 2) - 87) < 37)) {
      tris.push(t);
    }
  }
  const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a: P, b: P): P => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const dot = (a: P, b: P) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  /** Whether a triangle crosses the segment from a to b (Möller and Trumbore). */
  const crossed = (a: P, b: P) => {
    const d = sub(b, a);
    return tris.some(([p, q, r]) => {
      const [e, f] = [sub(q, p), sub(r, p)];
      const h = cross(d, f);
      const det = dot(e, h);
      if (Math.abs(det) < 1e-12) {
        return false;
      }
      const s = sub(a, p);
      const u = dot(s, h) / det;
      const g = cross(s, e);
      const w = dot(d, g) / det;
      const t = dot(f, g) / det;
      return u >= 0 && w >= 0 && u + w <= 1 && t >= 0 && t <= 1;
    });
  };
  /** Lines of sight in red's base, each (x, y, z) to (x, y, z), tried in blue's too. */
  const clear = (lines: number[][]) => {
    for (const [x0, y0, z0, x1, y1, z1] of lines) {
      for (const m of [(z: number) => z, (z: number) => ZED - z]) {
        expect(crossed([x0, y0, m(z0)], [x1, y1, m(z1)]), `${x0}, ${y0}, ${z0}`).toBe(false);
      }
    }
  };
  const HEIGHTS = [0.4, 1.3, 2.2];

  it('keeps enough of the scene to mean it: a line through the wall of the dome is crossed', () => {
    expect(tris.length).toBeGreaterThan(5000);
    expect(crossed([70, 1.5, 211.5], [70, 1.5, 219])).toBe(true);
    expect(crossed([80, 3.2, 211.5], [80, 3.2, 219])).toBe(true);
    expect(crossed([70, 1.5, ZED - 211.5], [70, 1.5, ZED - 219])).toBe(true);
  });

  it('draws no wall across the door of the dome, from the flag pad to the hall', () => {
    clear([78.6, 80, 81.4].flatMap(x => HEIGHTS.map(y => [x, y, 211.5, x, y, 219])));
  });

  it("draws no wall across the tubes' mouth, the first tube and the door of its module, from the hall to the module", () => {
    clear([224.2, 225.2, 226.2].flatMap(z => HEIGHTS.map(y => [94.5, y, z, 113, y, z])));
  });

  it('draws no wall across the second tube and the door of its module, from where the tubes meet to the module', () => {
    clear([99, 100, 101].flatMap(x => HEIGHTS.map(y => [x, y, 225, x, y, 202])));
  });

  it('draws no wall across the airlocks', () => {
    clear([
      ...[117.2, 118, 118.8].flatMap(x => HEIGHTS.map(y => [x, y, 228, x, y, 232])),
      ...[102.2, 103, 103.8].flatMap(x => HEIGHTS.map(y => [x, y, 198, x, y, 194])),
    ]);
  });

  it("keeps the tubes' round and their ribs out of the corridors: nothing from wall to wall near the floor", () => {
    clear([
      ...[104, 107.15].flatMap(x => [0.3, 0.7].map(y => [x, y, 223.8, x, y, 226.6])),
      ...[210, 214.15].flatMap(z => [0.3, 0.7].map(y => [98.6, y, z, 101.4, y, z])),
    ]);
  });
});
