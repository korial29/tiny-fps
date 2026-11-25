import { describe, expect, it } from 'vitest';
import { BEACH, FRAME, ZED } from '../shared/beach';
import { HIGHLINE } from '../shared/map';
import { MAPS } from '../shared/maps';
import { ground, noise } from '../shared/relief';
import { build } from '../shared/world';
import type { WorldDef } from '../shared/world';
import { STRIDE } from './mesh';
import { FRAG, fragOf, scenery } from './render';
import { LIFT, SAND, SEA, lagoon, shore } from './shore';

/** The beach of docs/BEACH.md as a relief: the bed 3 m down at the sea's edge, the sand 2.5 m up at the trees, a little rough. */
const at = (x: number, z: number) =>
  (x < 0
    ? -3 + x / 10
    : x < FRAME.shore
      ? (3 * (x - FRAME.shore)) / FRAME.shore
      : (2.5 * Math.min(x - FRAME.shore, 60)) / 60) +
  (x > 34 ? 0.3 * (noise(x / 9, z / 9, 3) - 0.5) : 0);
const SLOPED: WorldDef = {
  ...BEACH,
  brushes: BEACH.brushes.filter(b => b.min[1] > -30),
  relief: { hole: [0, 0, 0, 0], bound: [55, 100, 95, 160], cell: 4, at },
};

/** The triangles of `v` on the layer `layer`, each as its three corners (x, y, z, c.x). */
const triangles = (v: number[], layer: number) => {
  const out: number[][][] = [];
  for (let i = 0; i < v.length; i += 3 * STRIDE) {
    if (v[i + 8] === layer) {
      out.push([0, 1, 2].map(k => [0, 1, 2, 6].map(m => v[i + k * STRIDE + m])));
    }
  }
  return out;
};

/** The value `m` (1 the height, 3 c.x) of the triangles of `tris` over (x, z): one for each that covers it. */
const over = (tris: number[][][], x: number, z: number, m: number) =>
  tris.flatMap(([a, b, c]) => {
    const det = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
    const u = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / det;
    const v = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / det;
    return u >= 0 && v >= 0 && u + v <= 1 ? [u * a[m] + v * b[m] + (1 - u - v) * c[m]] : [];
  });

/** Points all over the play area, off the lattice's lines. */
const POINTS = Array.from({ length: 150 }, (_, i) => [
  FRAME.sea + 0.37 + ((i * 7.31) % (FRAME.east - FRAME.sea - 1)),
  0.53 + ((i * 13.77) % (ZED - 1)),
]);

describe('the shore', () => {
  it('draws the sand on the triangles that are walked on', () => {
    const world = build(SLOPED);
    const sand = triangles(shore(SLOPED), SAND);
    for (const [x, z] of POINTS) {
      const ys = over(sand, x, z, 1);
      // One sheet at the height of the ground, no hole: two triangles only where the point is on their edge.
      expect(ys.length).toBeGreaterThan(0);
      for (const y of ys) {
        expect(y).toBeCloseTo(ground(world, x, z), 5);
      }
    }
  });

  it('lays the sea over the bed, each vertex knowing how deep it is', () => {
    const world = build(SLOPED);
    const sea = triangles(lagoon(SLOPED), SEA);
    expect(sea.every(t => t.every(p => p[1] === FRAME.water + LIFT))).toBe(true);
    for (const [x, z] of POINTS) {
      const ds = over(sea, x, z, 3);
      // Over all of the bed; a square of the waterline reaches over dry sand, the depth under 0 there.
      expect(ds.length).toBeGreaterThan(ground(world, x, z) < FRAME.water ? 0 : -1);
      for (const d of ds) {
        expect(d).toBeCloseTo(FRAME.water + LIFT - ground(world, x, z), 5);
      }
    }
    // No sea over the dry sand by the trees.
    expect(over(sea, FRAME.trees, ZED / 2 + 40, 3)).toHaveLength(0);
  });

  it('goes on past the play area, to the far clip, the bed falling out to sea', () => {
    for (const def of [SLOPED, BEACH]) {
      const v = shore(def).concat(lagoon(def));
      const [xs, zs] = [0, 2].map(m => v.filter((_, i) => i % STRIDE === m));
      expect(Math.min(...xs)).toBeLessThan(FRAME.sea - 1000);
      expect(Math.max(...xs)).toBeGreaterThan(FRAME.east + 1000);
      expect(Math.min(...zs)).toBeLessThan(-1000);
      expect(Math.max(...zs)).toBeGreaterThan(ZED + 1000);
      expect(v.every(Number.isFinite)).toBe(true);
    }
    const sand = triangles(shore(SLOPED), SAND);
    expect(over(sand, FRAME.sea - 300, ZED / 2, 1)[0]).toBeLessThan(-20);
    // The beach carries on north and south: dry sand past the headland.
    expect(over(sand, FRAME.trees - 10, ZED + 300, 1)[0]).toBeGreaterThan(1);
  });

  it('keeps under the flat slab while the map has no relief', () => {
    const flat = { ...BEACH, relief: undefined };
    const sand = triangles(shore(flat), SAND);
    expect(sand.length).toBeGreaterThan(0);
    expect(sand.every(t => t.every(p => p[1] < FRAME.water && p[1] > FRAME.water - 0.1))).toBe(
      true,
    );
    // Sea from the open water to the waterline, none over the strand.
    const sea = triangles(lagoon(flat), SEA);
    expect(over(sea, FRAME.sea + 5, ZED / 2, 3)[0]).toBeGreaterThan(1);
    expect(over(sea, FRAME.shore + 15, ZED / 2, 3)).toHaveLength(0);
  });

  it('stays a small share of the level', () => {
    for (const def of [SLOPED, BEACH]) {
      const n = (shore(def).length + lagoon(def).length) / STRIDE;
      expect(Number.isInteger(n / 3)).toBe(true);
      expect(n).toBeLessThan(60_000);
    }
    // Built once for a map.
    expect(shore(SLOPED)).toBe(shore(SLOPED));
  });

  it('ends the scenery with the sea, which the renderer draws apart', () => {
    const v = scenery(build(SLOPED));
    const sea = lagoon(SLOPED);
    expect(v.slice(-sea.length)).toEqual(sea);
    // Nothing else on the sea's layer: only that range is blended.
    expect(v.slice(0, -sea.length).filter((_, i) => i % STRIDE === 8)).not.toContain(SEA);
  });
});

describe("the beach's shader", () => {
  it('is compiled only into the land of the beach', () => {
    expect(fragOf(BEACH, 'LAND')).toContain('\n#define BEACH\n');
    expect(fragOf(BEACH, 'FLESH')).not.toContain('#define BEACH');
    expect(fragOf(HIGHLINE, 'LAND')).not.toContain('#define BEACH');
    expect(fragOf(MAPS.tranquility, 'LAND')).not.toContain('#define BEACH');
  });

  it('has none of the moon, relief or not', () => {
    expect(fragOf(BEACH)).not.toContain('#define MOON');
    expect(fragOf(SLOPED)).not.toContain('#define MOON');
    expect(fragOf(MAPS.tranquility)).toContain('#define MOON');
  });

  it('keeps every line of it under BEACH', () => {
    const rest = FRAG.replace(/#ifdef BEACH\n[\s\S]*?#endif\n/g, '');
    for (const word of ['T*.55', 'bw', 'Z>1.5', 'L<-4.5', `${SAND}`]) {
      expect(rest).not.toContain(word);
    }
    // The sea is told from the rest by its layer, which the depth passes leave out.
    expect(SEA).toBeLessThan(-4.5);
    expect(FRAG).toContain(`abs(L-(${SAND}))`);
  });
});
