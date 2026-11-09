import { describe, expect, it } from 'vitest';
import { HIGHLINE, ROOFTOPS } from '../shared/map';
import { build } from '../shared/world';
import type { WorldDef } from '../shared/world';
import { STRIDE } from './mesh';
import { city, level, scenery } from './render';
import { skyline } from './skyline';
import { FAR, MARKS, PITCH, ROAD, STREET, area, deepen, grid, scale, street } from './street';

const MAPS: [string, WorldDef][] = [
  ['HIGHLINE', HIGHLINE],
  ['ROOFTOPS', ROOFTOPS],
];
const h = ROAD / 2;
/** The quads of a street() list: [x0, z0, x1, z1, y, r, g, b], one per 6 vertices. */
const quads = (v: number[]) =>
  Array.from({ length: v.length / (6 * STRIDE) }, (_, q) => {
    const at = (i: number) => v.slice((q * 6 + i) * STRIDE, (q * 6 + i + 1) * STRIDE);
    const [a, c] = [at(0), at(2)];
    return {
      min: [Math.min(a[0], c[0]), Math.min(a[2], c[2])],
      max: [Math.max(a[0], c[0]), Math.max(a[2], c[2])],
      y: a[1],
      normal: a.slice(3, 6),
      layer: a[8],
      rgb: [a[6], a[7], a[9]],
    };
  });

describe.each(MAPS)('the street of %s', (_, def) => {
  const { box, xs, zs } = grid(def);
  const everything = [...def.brushes, ...skyline(def)];

  it('is a grid of roads round the play area, derived from its bounds: two hug it, the others follow every PITCH', () => {
    expect(box).toEqual(area(def));
    for (const [lines, lo, hi] of [
      [xs, box[0], box[1]],
      [zs, box[2], box[3]],
    ] as const) {
      expect([...lines]).toEqual([...lines].sort((a, b) => a - b));
      const k = lines.length / 2;
      expect(lines.length % 2).toBe(0);
      expect(lines[k - 1]).toBe(lo - 10 - h);
      expect(lines[k]).toBe(hi + 10 + h);
      for (let i = 1; i < k; i++) {
        expect(lines[k - 1 - i]).toBe(lines[k - i] - PITCH);
        expect(lines[k + i]).toBe(lines[k + i - 1] + PITCH);
      }
      expect(lines.length).toBeGreaterThanOrEqual(4);
    }
  });

  it('has roads between the buildings, none inside them: no road strip touches a brush or a tower', () => {
    const [z0, z1] = [zs[0] - h, zs[zs.length - 1] + h];
    const [x0, x1] = [xs[0] - h, xs[xs.length - 1] + h];
    const strips = [
      ...xs.map(x => ({ min: [x - h, z0], max: [x + h, z1] })),
      ...zs.map(z => ({ min: [x0, z - h], max: [x1, z + h] })),
    ];
    for (const s of strips) {
      for (const b of everything) {
        const apart =
          b.min[0] >= s.max[0] ||
          b.max[0] <= s.min[0] ||
          b.min[2] >= s.max[1] ||
          b.max[2] <= s.min[1];
        expect(apart).toBe(true);
      }
    }
  });

  it('puts no marking on a building: every stripe of paint is outside every footprint', () => {
    const paint = quads(street(def)).filter(q => q.y > STREET + 0.2 && q.rgb[0] > 0.4);
    expect(paint.length).toBeGreaterThan(100);
    const on = paint.flatMap(q =>
      everything.filter(
        b =>
          b.min[0] < q.max[0] && b.max[0] > q.min[0] && b.min[2] < q.max[1] && b.max[2] > q.min[1],
      ),
    );
    expect(on).toEqual([]);
  });

  it('has the markings: a dashed yellow centre line, white edge lines, and crosswalks at every crossing', () => {
    const q = quads(street(def));
    const yellow = q.filter(s => s.rgb[2] < 0.2 && s.rgb[0] > 0.8);
    const white = q.filter(s => s.rgb.every(c => c > 0.75));
    // Dashes are 4 m long with 5 m between them, centred on the road: yellow, 0.4 m wide on the near
    // grid; farther out as much bigger as the street's scale there, up to MARKS / 300 times.
    const k = scale(def);
    const [x0, x1, z0, z1] = [xs[0], xs[xs.length - 1], zs[0], zs[zs.length - 1]];
    expect(yellow.length).toBeGreaterThan(100);
    let near = 0;
    for (const s of yellow) {
      const [w, l] = [s.max[0] - s.min[0], s.max[1] - s.min[1]].sort((a, b) => a - b);
      expect(l / w).toBeCloseTo(10);
      expect(w).toBeGreaterThanOrEqual(0.4 - 1e-6);
      expect(w).toBeLessThanOrEqual((0.4 * MARKS) / 300 + 1e-6);
      const [x, z] = [(s.min[0] + s.max[0]) / 2, (s.min[1] + s.max[1]) / 2];
      if (x > x0 && x < x1 && z > z0 && z < z1 && k(x, z) == 1) {
        expect(w).toBeCloseTo(0.4);
        near++;
      }
    }
    expect(near).toBeGreaterThan(50);
    // Four crosswalks of ROAD / 2 bars at each of the crossings, and two edge lines a stretch.
    const crossings = xs.length * zs.length;
    const bars = q.filter(s => {
      const [dx, dz] = [s.max[0] - s.min[0], s.max[1] - s.min[1]];
      return s.rgb.every(c => c > 0.75) && Math.min(dx, dz) == 1 && Math.max(dx, dz) == 3;
    });
    expect(bars).toHaveLength(crossings * 4 * h);
    expect(white.length).toBeGreaterThan(bars.length);
    // A crossing is crossed on its own tarmac: the bars stay in the road.
    for (const b of bars) {
      const inX = xs.some(x => b.min[0] >= x - h && b.max[0] <= x + h);
      const inZ = zs.some(z => b.min[1] >= z - h && b.max[1] <= z + h);
      expect(inX || inZ).toBe(true);
    }
  });

  it('carries the grid on to FAR: every far road paved end to end, no tower on it, its markings out to MARKS', () => {
    const far = grid(def, FAR);
    const q = quads(street(def));
    const tar = q.filter(s => s.rgb[0] < 0.1 && s.y > STREET + 0.1);
    const [lo, hi] = [far.zs[0] - h, far.zs[far.zs.length - 1] + h];
    for (const x of far.xs) {
      // The pieces of asphalt along this road cover it from one end of the far grid to the other.
      const along = tar
        .filter(s => Math.abs(s.min[0] - (x - h)) < 1e-6 && Math.abs(s.max[0] - (x + h)) < 1e-6)
        .map(s => [s.min[1], s.max[1]])
        .sort((a, b) => a[0] - b[0]);
      expect(along[0][0]).toBeCloseTo(lo, 6);
      expect(along[along.length - 1][1]).toBeCloseTo(hi, 6);
      along.slice(1).forEach(([a], i) => expect(a).toBeLessThanOrEqual(along[i][1] + 1e-6));
    }
    expect(Math.max(...far.xs.map(Math.abs), ...far.zs.map(Math.abs))).toBeGreaterThan(600);
    // No tower stands on a far road.
    const towers = skyline(def).filter(t => t.max[1] - t.min[1] > 0.5);
    for (const [lines, a] of [
      [far.xs, 0],
      [far.zs, 2],
    ] as const) {
      const on = towers.filter(t => lines.some(c => t.max[a] > c - h && t.min[a] < c + h));
      expect(on).toEqual([]);
    }
    // The markings go on past the near grid to MARKS from the centre, where the haze has them, and
    // no farther (a piece of a road or a crosswalk reaches past by its length at most).
    const [cx, cz] = [(box[0] + box[1]) / 2, (box[2] + box[3]) / 2];
    const paint = q.filter(s => s.rgb[0] > 0.4);
    const from = paint.map(s =>
      Math.hypot((s.min[0] + s.max[0]) / 2 - cx, (s.min[1] + s.max[1]) / 2 - cz),
    );
    expect(Math.max(...from)).toBeGreaterThan(MARKS - PITCH);
    expect(Math.max(...from)).toBeLessThan(MARKS + PITCH / 2);
    // Past the near grid a crosswalk is one band of the bars' mean colour, across the road.
    const bands = paint.filter(s => {
      const [w, l] = [s.max[0] - s.min[0], s.max[1] - s.min[1]].sort((a, b) => a - b);
      return w == 3 && l == ROAD;
    });
    expect(bands.length).toBeGreaterThan(100);
    for (const b of bands) {
      expect(b.rgb[0]).toBeCloseTo((0.8 + 0.09) / 2);
    }
  });

  it('keeps the paint over the asphalt under it by more than the depth buffer can tell apart, seen from any roof', () => {
    const q = quads(street(def));
    const tar = q.filter(s => s.rgb[0] < 0.1 && s.y > STREET + 0.1);
    const paint = q.filter(s => s.y > STREET + 0.2 && s.rgb[0] > 0.4);
    const corners = [0, 1].flatMap(i => [2, 3].map(j => [box[i], box[j]]));
    let worst = Infinity;
    for (const s of paint) {
      const [x, z] = [(s.min[0] + s.max[0]) / 2, (s.min[1] + s.max[1]) / 2];
      const under = tar.filter(
        t => t.min[0] <= x && t.max[0] >= x && t.min[1] <= z && t.max[1] >= z,
      );
      expect(under.length).toBeGreaterThan(0);
      // The step of a 24-bit depth buffer with the near clip at 0.1 m, from the farthest corner of the play area.
      const d = Math.max(...corners.map(([a, b]) => Math.hypot(x - a, z - b)));
      const step = d ** 2 / (0.1 * 2 ** 24);
      for (const t of under) {
        worst = Math.min(worst, (s.y - t.y) / step);
      }
    }
    expect(worst).toBeGreaterThan(1);
  });

  it('is flat, lit paint of whole triangles, on the street: faces up, at most a little over a metre above it', () => {
    const v = street(def);
    expect(v.length % (3 * STRIDE)).toBe(0);
    for (const q of quads(v)) {
      expect(q.normal).toEqual([0, 1, 0]);
      expect(q.layer).toBe(-1);
      expect(q.y).toBeGreaterThanOrEqual(STREET);
      expect(q.y).toBeLessThan(STREET + 0.24 * (MARKS / 300) ** 2 + 1e-6);
      expect(q.rgb.every(c => c >= 0 && c <= 1)).toBe(true);
    }
  });

  it('is the same for every client: nothing random, nothing read from the clock', () => {
    expect(street(def)).toEqual(street(def));
    expect(grid(def)).toEqual(grid(def));
    expect(skyline(def)).toEqual(skyline(def));
  });
});

describe('the buildings down to the street', () => {
  it('goes down to the street for every brush that went down to the floor, and touches no other', () => {
    for (const [, def] of MAPS) {
      const down = deepen(def);
      expect(down).toHaveLength(def.brushes.length);
      let deep = 0;
      def.brushes.forEach((b, i) => {
        if (b.min[1] <= def.floor) {
          deep++;
          expect(down[i].min[1]).toBe(STREET);
          expect(down[i].min[0]).toBe(b.min[0]);
          expect(down[i].max).toEqual(b.max);
          expect(down[i].top).toBe(b.top);
        } else {
          expect(down[i]).toBe(b);
        }
      });
      expect(deep).toBeGreaterThan(5);
    }
  });

  it('puts the street about 100 m under the roofs and far under the kill floor', () => {
    expect(STREET).toBeLessThan(HIGHLINE.floor - 40);
    const roofs = HIGHLINE.brushes.filter(b => b.min[1] <= HIGHLINE.floor).map(b => b.max[1]);
    expect(Math.min(...roofs) - STREET).toBeGreaterThan(90);
    expect(Math.max(...roofs) - STREET).toBeLessThan(115);
  });

  it('floats nothing: every building and tower of the drawn city reaches the street, and its sides are built down to it', () => {
    for (const [, def] of MAPS) {
      const world = build(def);
      const drawn = city(world).def.brushes;
      def.brushes.forEach((b, i) => {
        if (b.min[1] <= def.floor) {
          expect(drawn[i].min[1]).toBe(STREET);
        }
      });
      const towers = drawn.slice(def.brushes.length);
      expect(towers.length).toBeGreaterThan(20);
      expect(towers.filter(t => !t.tint).every(t => t.min[1] == STREET)).toBe(true);
      const ys = level(city(world)).filter((_, i) => i % STRIDE == 1);
      expect(Math.min(...ys)).toBe(STREET);
      expect(ys.filter(y => y == STREET).length).toBeGreaterThan(200);
    }
  });

  it('is only drawn: the physics world is as it was, the kill floor and the grid with it', () => {
    for (const [, def] of MAPS) {
      const world = build(def);
      const [brushes, grid0, floor] = [
        structuredClone(def.brushes),
        new Map(world.grid),
        def.floor,
      ];
      const drawn = city(world);
      scenery(world);
      expect(world.def.brushes).toBe(def.brushes);
      expect(world.def.brushes).toEqual(brushes);
      expect(world.def.floor).toBe(floor);
      expect(world.grid).toEqual(grid0);
      // The world the physics reads has no brush under the kill floor but the buildings' own, which it never
      // reaches: nothing of the street is in it.
      expect(Math.min(...world.def.brushes.map(b => b.min[1]))).toBeGreaterThan(STREET);
      expect(drawn.grid).toBe(world.grid);
      expect(drawn.def.brushes.length).toBeGreaterThan(def.brushes.length);
      expect(drawn.def.floor).toBe(def.floor);
    }
  });
});
