import { describe, expect, it } from 'vitest';
import { duo } from '../../test/teams';
import { GRAB_MAX } from '../shared/constants';
import { ROOFTOPS } from '../shared/map';
import { TEX } from '../shared/types';
import type { Brush, WorldDef } from '../shared/world';
import { STRIDE } from './mesh';
import { uses, vision, zones } from './vision';

const box = (min: number[], max: number[]): Brush =>
  ({ min, max, top: TEX.CONCRETE, side: TEX.CONCRETE }) as Brush;
/** A roof at y = 0 under the given brushes, and the world around them. */
const worldOf = (...brushes: Brush[]): WorldDef => ({
  brushes: [box([-50, -30, -50], [50, 0, 50]), ...brushes],
  teams: duo([[0, 0, 0, 0]]),
  floor: -25,
  sun: { dir: [0, 1, 0], color: [1, 1, 1] },
  sky: [
    [0, 0, 1],
    [1, 1, 1],
  ],
});
const on = (def: WorldDef, i = 1) => uses(def, def.brushes[i]);

describe('uses: ledges and boxes', () => {
  it('bands every top edge of a box at grab height standing on a roof', () => {
    const def = worldOf(box([0, 0, 0], [4, 1.5, 4]));
    expect(on(def).lips).toHaveLength(4);
    expect(on(def).beam).toBe(false);
    expect(on(def).stripes).toEqual([]);
  });

  it('bands a box right up to the top of the grab range, and not above', () => {
    expect(on(worldOf(box([0, 0, 0], [4, GRAB_MAX, 4]))).lips).toHaveLength(4);
    expect(on(worldOf(box([0, 0, 0], [4, GRAB_MAX + 0.3, 4]))).lips).toEqual([]);
  });

  it("does not band a tall wall's top, nor a step a runner walks up", () => {
    expect(on(worldOf(box([0, 0, 0], [4, 6.5, 4]))).lips).toEqual([]);
    expect(on(worldOf(box([0, 0, 0], [4, 0.4, 4]))).lips).toEqual([]);
  });

  it('bands only the edges that fall to the lower ground: a lip against a taller brush is not one', () => {
    const def = worldOf(box([0, 0, 0], [4, 1.5, 4]), box([4, 0, 0], [8, 6, 4]));
    expect(on(def).lips).toEqual([
      [0, 0],
      [2, 0],
      [2, 1],
    ]);
  });

  it('measures the drop to the highest top beside the edge, not to the street', () => {
    // 2.7 m over the street, but only 1.5 m over the step it stands on.
    const step = box([-3, 0, -3], [7, 1.2, 7]);
    expect(on(worldOf(step, box([0, 1.2, 0], [4, 2.7, 4])), 2).lips).toHaveLength(4);
    expect(on(worldOf(box([0, 0, 0], [4, 2.7, 4]))).lips).toEqual([]);
    // On the side of a 1.2 m step the box is only 0.3 m up: walked, not grabbed.
    const next = worldOf(box([0, 0, 0], [4, 1.5, 4]), box([4, 0, 0], [8, 1.2, 4]));
    expect(on(next).lips).toEqual([
      [0, 0],
      [2, 0],
      [2, 1],
    ]);
  });

  it('does not band the edge of a roof over the void: a drop to nothing is not a ledge', () => {
    const def = { ...worldOf(), brushes: [box([0, -30, 0], [10, 0, 10])] };
    expect(on(def, 0).lips).toEqual([]);
  });

  it('does not band a lip shorter than a runner can use: the side of a step', () => {
    expect(on(worldOf(box([0, 0, 0], [2, 1.2, 1]))).lips).toEqual([
      [2, 0],
      [2, 1],
    ]);
  });

  it('bands the south face of C above B on ROOFTOPS and not the roofs over the chasms', () => {
    const [a, b, c] = [0, 1, 2].map(i => on(ROOFTOPS, i));
    expect(c.lips).toEqual([[2, 1]]);
    expect(a.lips).toEqual([]);
    expect(b.lips).toEqual([]);
  });
});

describe('uses: pipes and beams', () => {
  it('marks a narrow brush, lying or standing: a beam, a pipe, a pole', () => {
    expect(on(worldOf(box([0, 0, 0], [0.5, 0.4, 10]))).beam).toBe(true);
    expect(on(worldOf(box([0, 0, 0], [12, 0.45, 0.45]))).beam).toBe(true);
    expect(on(worldOf(box([0, 0, 0], [0.5, 4, 0.5]))).beam).toBe(true);
  });

  it('does not mark a crate, a slab or a stair', () => {
    expect(on(worldOf(box([0, 0, 0], [0.5, 0.5, 0.5]))).beam).toBe(false);
    expect(on(worldOf(box([0, 0, 0], [10, 0.4, 8]))).beam).toBe(false);
    expect(on(worldOf(box([0, 0, 0], [2, 0.8, 1]))).beam).toBe(false);
  });

  it('is red all over a beam, and gives it no band', () => {
    const def = worldOf(box([0, 0, 0], [0.5, 0.4, 10]));
    expect(on(def).lips).toEqual([]);
    expect(vision(def).length / STRIDE).toBe(5 * 6);
  });
});

describe('uses: walls to run along', () => {
  const wall = (len: number, height = 6.5) => worldOf(box([0, 0, 0], [1, height, len]));

  it('stripes both faces of a long free-standing wall', () => {
    expect(on(wall(26)).stripes).toEqual([
      [0, 0],
      [0, 1],
    ]);
  });

  it('stripes by length: a short wall gets none', () => {
    expect(on(wall(8)).stripes).toHaveLength(2);
    expect(on(wall(7)).stripes).toEqual([]);
  });

  it('stripes by height: a low long wall is a box to climb, not a wall to run', () => {
    expect(on(wall(26, 2)).stripes).toEqual([]);
  });

  it('stripes no building: the facade of a roof is not a wall to run along', () => {
    const def = worldOf();
    expect(uses(def, def.brushes[0]).stripes).toEqual([]);
  });

  it('stripes the long wall of ROOFTOPS and not the lintel, the platform or the ledges', () => {
    const striped = ROOFTOPS.brushes.filter((_, i) => on(ROOFTOPS, i).stripes.length);
    expect(striped.map(b => b.min)).toEqual([[36, 8, 22]]);
  });

  it('puts the stripe at hand height, 1.2 to 1.45 m over the foot of the wall', () => {
    const def = wall(26);
    const v = vision(def);
    const ys = Array.from({ length: v.length / STRIDE }, (_, i) => v[i * STRIDE + 1]);
    expect(Math.min(...ys)).toBeCloseTo(1.2);
    expect(Math.max(...ys)).toBeCloseTo(1.45);
  });
});

describe('vision', () => {
  /** The vertices of a list in the map's format. */
  const verts = (v: number[]) =>
    Array.from({ length: v.length / STRIDE }, (_, i) => v.slice(i * STRIDE, (i + 1) * STRIDE));

  it('is whole triangles, red, with unit normals', () => {
    const v = verts(vision(ROOFTOPS));
    expect(v.length).toBeGreaterThan(0);
    expect(v.length % 3).toBe(0);
    for (const [, , , nx, ny, nz, r, g, , b] of v) {
      expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1);
      expect(r).toBeGreaterThan(g * 4);
      expect(r).toBeGreaterThan(b * 4);
    }
  });

  it('glows on the bands and stripes (layer -2) and is lit on the pipes (layer -1)', () => {
    expect(new Set(verts(vision(worldOf(box([0, 0, 0], [4, 1.5, 4])))).map(v => v[8]))).toEqual(
      new Set([-2]),
    );
    expect(new Set(verts(vision(worldOf(box([0, 0, 0], [0.5, 4, 0.5])))).map(v => v[8]))).toEqual(
      new Set([-1]),
    );
  });

  it('lays the band a hair above the top and in front of the face, never inside the brush', () => {
    const def = worldOf(box([0, 0, 0], [4, 1.5, 4]));
    for (const [x, y, z] of verts(vision(def))) {
      const inside = x > 0 && x < 4 && z > 0 && z < 4 && y < 1.5;
      expect(inside).toBe(false);
      expect(y).toBeLessThanOrEqual(1.5 + 0.02);
      expect(y).toBeGreaterThanOrEqual(1.5 - 0.2);
    }
  });

  it('does not paint everything red: a minority of the brushes of ROOFTOPS carry any', () => {
    const marked = ROOFTOPS.brushes.filter((_, i) => {
      const u = on(ROOFTOPS, i);
      return u.beam || u.lips.length || u.stripes.length;
    });
    expect(marked.length).toBeGreaterThan(5);
    expect(marked.length).toBeLessThan(ROOFTOPS.brushes.length * 0.7);
  });

  it('is nothing on a world of tall roofs', () => {
    expect(vision(worldOf(box([0, 0, 0], [4, 4, 4])))).toEqual([]);
  });
});

describe('zones', () => {
  it('paints a square around each base, in its team colour, just over the roof', () => {
    const v = zones(ROOFTOPS);
    expect(v.length / STRIDE).toBe(2 * 5 * 6);
    const [red, blue] = [v.slice(0, 5 * 6 * STRIDE), v.slice(5 * 6 * STRIDE)];
    for (const [paint, [bx, by, bz], tint] of [
      [red, ROOFTOPS.teams[0].base, 0],
      [blue, ROOFTOPS.teams[1].base, 2],
    ] as const) {
      for (let i = 0; i < paint.length; i += STRIDE) {
        expect(Math.abs(paint[i] - bx)).toBeLessThanOrEqual(4.2 + 1e-6);
        expect(Math.abs(paint[i + 2] - bz)).toBeLessThanOrEqual(4.2 + 1e-6);
        expect(paint[i + 1] - by).toBeLessThan(0.05);
        expect(paint[i + 1] - by).toBeGreaterThan(0);
        // The strongest channel is the team's: red for red, blue for blue.
        expect(paint[i + (tint ? 9 : 6)]).toBeGreaterThanOrEqual(paint[i + (tint ? 6 : 9)]);
      }
    }
  });
});
