import { describe, expect, it } from 'vitest';
import { HIGHLINE, ROOFTOPS } from '../shared/map';
import { TEX } from '../shared/types';
import { build } from '../shared/world';
import { MAX_TINTS, city, palette } from './render';
import { skyline } from './skyline';
import { ROAD, STREET, grid } from './street';

const towers = skyline(ROOFTOPS);
/** The play area: the box over the footprints of the brushes. */
const area = [0, 2].map(a => [
  Math.min(...ROOFTOPS.brushes.map(b => b.min[a])),
  Math.max(...ROOFTOPS.brushes.map(b => b.max[a])),
]);

describe('skyline', () => {
  it('is a city of towers, a few dozen of them, and not an empty list', () => {
    expect(towers.length).toBeGreaterThanOrEqual(20);
    expect(towers.length).toBeLessThan(120);
  });

  it('stands outside the play area: no tower touches the box over the brushes, with room to spare', () => {
    for (const t of towers) {
      const apart = [0, 2].map((a, i) => Math.max(area[i][0] - t.max[a], t.min[a] - area[i][1]));
      expect(Math.max(...apart)).toBeGreaterThan(10);
    }
  });

  it('is well formed: min under max, textures that exist, tints that are colours', () => {
    const ids: number[] = Object.values(TEX);
    for (const t of towers) {
      for (let a = 0; a < 3; a++) {
        expect(t.min[a]).toBeLessThan(t.max[a]);
      }
      expect(ids).toContain(t.top);
      expect(ids).toContain(t.side);
      expect(t.tint?.every(c => c >= 0 && c <= 1) ?? true).toBe(true);
    }
  });

  it('stands on the street, and in the blocks between the roads: none on a road', () => {
    for (const def of [ROOFTOPS, HIGHLINE]) {
      const { xs, zs } = grid(def);
      const all = skyline(def);
      for (const t of all) {
        // A tower goes down to the street, a cap stands on a tower.
        expect(
          t.tint
            ? all.some(
                o =>
                  !o.tint && o.max[1] == t.min[1] && o.min[0] <= t.min[0] && o.max[0] >= t.max[0],
              )
            : t.min[1] == STREET,
        ).toBe(true);
        const roads = [...xs.map(x => [x, 0, 2] as const), ...zs.map(z => [z, 2, 0] as const)];
        for (const [at, a] of roads) {
          expect(t.max[a] <= at - ROAD / 2 || t.min[a] >= at + ROAD / 2).toBe(true);
        }
      }
    }
  });

  it('keeps the tops below the lowest roof round the play area, so no tower rises over the course next to it', () => {
    const roof = Math.min(...ROOFTOPS.brushes.map(b => b.max[1]));
    for (const t of towers) {
      const apart = [0, 2].map((a, i) => Math.max(area[i][0] - t.max[a], t.min[a] - area[i][1], 0));
      if (Math.hypot(...apart) < 40) {
        expect(t.max[1]).toBeLessThan(roof);
      }
    }
  });

  it('is the same every time', () => {
    expect(skyline(ROOFTOPS)).toEqual(towers);
  });

  it('is not in the physics world: build() sees the brushes of the map alone', () => {
    const world = build(ROOFTOPS);
    expect(world.def.brushes).toHaveLength(ROOFTOPS.brushes.length);
    const indices = new Set([...world.grid.values()].flat());
    expect(Math.max(...indices)).toBe(ROOFTOPS.brushes.length - 1);
    // The renderer's copy has them, the original is untouched.
    expect(city(world).def.brushes).toHaveLength(ROOFTOPS.brushes.length + towers.length);
    expect(world.def.brushes).toHaveLength(ROOFTOPS.brushes.length);
  });

  it('has glass and concrete facades, some coloured caps, and towers of many heights', () => {
    const sides = new Set(towers.map(t => t.side));
    expect(sides).toContain(TEX.GLASS);
    expect(sides).toContain(TEX.CONCRETE);
    expect(towers.filter(t => t.tint).length).toBeGreaterThanOrEqual(3);
    expect(new Set(towers.map(t => Math.round(t.max[1]))).size).toBeGreaterThanOrEqual(15);
  });

  it('keeps its tints within the shader palette, with the map', () => {
    expect(palette(city(build(ROOFTOPS))).length).toBeLessThanOrEqual(MAX_TINTS);
  });

  it('follows the play area of another map, and still stays outside it', () => {
    const def = {
      ...ROOFTOPS,
      brushes: [{ min: [100, -30, 100], max: [110, 0, 120], top: 0, side: 0 }],
    };
    for (const t of skyline(def as never)) {
      const [cx, cz] = [(t.min[0] + t.max[0]) / 2, (t.min[2] + t.max[2]) / 2];
      expect(Math.hypot(cx - 105, cz - 110)).toBeGreaterThan(45);
    }
  });
});
