import { describe, expect, it } from 'vitest';
import { HIGHLINE, ROOFTOPS } from '../shared/map';
import { TEX } from '../shared/types';
import { build } from '../shared/world';
import { MAX_TINTS, city, palette } from './render';
import { STRIDE } from './mesh';
import { skyline, trees } from './skyline';
import { MARKS, ROAD, STREET, grid } from './street';

const city_ = skyline(ROOFTOPS);
/** The lawns are the flat ones, half a metre at most. */
const flat = (b: { min: number[]; max: number[] }) => b.max[1] - b.min[1] <= 0.5;
const towers = city_.filter(b => !flat(b));
const lawns = city_.filter(flat);
/** The play area: the box over the footprints of the brushes. */
const area = [0, 2].map(a => [
  Math.min(...ROOFTOPS.brushes.map(b => b.min[a])),
  Math.max(...ROOFTOPS.brushes.map(b => b.max[a])),
]);

describe('skyline', () => {
  it('is a city of towers, a few dozen near the play area, and a few hundred out to the horizon', () => {
    const { reach } = grid(ROOFTOPS);
    const [cx, cz] = [(area[0][0] + area[0][1]) / 2, (area[1][0] + area[1][1]) / 2];
    const near = towers.filter(
      t => Math.hypot((t.min[0] + t.max[0]) / 2 - cx, (t.min[2] + t.max[2]) / 2 - cz) < reach,
    );
    expect(near.length).toBeGreaterThanOrEqual(20);
    expect(near.length).toBeLessThan(120);
    expect(towers.length).toBeLessThan(500);
  });

  it('carries the city on to the horizon all round: towers out past 600 m in every direction, inside the far clip', () => {
    for (const def of [ROOFTOPS, HIGHLINE]) {
      const { box } = grid(def);
      const [cx, cz] = [(box[0] + box[1]) / 2, (box[2] + box[3]) / 2];
      const far = skyline(def).map(t => {
        const [x, z] = [(t.min[0] + t.max[0]) / 2 - cx, (t.min[2] + t.max[2]) / 2 - cz];
        return { t, d: Math.hypot(x, z), a: Math.atan2(z, x) };
      });
      for (let k = 0; k < 8; k++) {
        const sector = far.filter(f => Math.floor(((f.a + Math.PI) / (2 * Math.PI)) * 8) % 8 === k);
        expect(sector.some(f => f.d > 600)).toBe(true);
      }
      // The farthest corner of every one is inside the far clip (900 m) from the centre, where the haze has all but hidden it.
      for (const { t } of far) {
        const corner = Math.max(
          ...[t.min[0], t.max[0]].flatMap(x =>
            [t.min[2], t.max[2]].map(z => Math.hypot(x - cx, z - cz)),
          ),
        );
        expect(corner).toBeLessThan(900);
      }
      // Further out, taller: the tops rise out of the haze row after row.
      const mean = (lo: number, hi: number) => {
        const tops = far.filter(f => f.d >= lo && f.d < hi && f.t.max[1] - f.t.min[1] > 0.5);
        return tops.reduce((s, f) => s + f.t.max[1], 0) / tops.length;
      };
      expect(mean(600, 900)).toBeGreaterThan(mean(300, 450) + 15);
    }
  });

  it('stands outside the play area: no tower touches the box over the brushes, with room to spare', () => {
    for (const t of city_) {
      const apart = [0, 2].map((a, i) => Math.max(area[i][0] - t.max[a], t.min[a] - area[i][1]));
      expect(Math.max(...apart)).toBeGreaterThan(10);
    }
  });

  it('is well formed: min under max, textures that exist, tints that are colours', () => {
    const ids: number[] = Object.values(TEX);
    for (const t of city_) {
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
        // A tower and a lawn go down to the street, a cap stands on a tower.
        expect(
          t.min[1] > STREET
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
    expect(skyline(ROOFTOPS)).toEqual(city_);
  });

  it('is not in the physics world: build() sees the brushes of the map alone', () => {
    const world = build(ROOFTOPS);
    expect(world.def.brushes).toHaveLength(ROOFTOPS.brushes.length);
    const indices = new Set([...world.grid.values()].flat());
    expect(Math.max(...indices)).toBe(ROOFTOPS.brushes.length - 1);
    // The renderer's copy has them, the original is untouched.
    expect(city(world).def.brushes).toHaveLength(ROOFTOPS.brushes.length + city_.length);
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

describe('the lawns', () => {
  it('green some of the lots: flat, green, on the street, with a walk round them', () => {
    expect(lawns.length).toBeGreaterThanOrEqual(10);
    expect(lawns.length / (lawns.length + towers.length)).toBeLessThan(0.6);
    for (const l of lawns) {
      expect(l.min[1]).toBe(STREET);
      const [r, g, b] = l.tint!;
      expect(g).toBeGreaterThan(Math.max(r, b));
      expect(Math.min(l.max[0] - l.min[0], l.max[2] - l.min[2])).toBeGreaterThan(10);
    }
  });

  it('lie under a tower or alone in an empty lot, never on top of another lawn', () => {
    for (const [i, a] of lawns.entries()) {
      for (const b of lawns.slice(i + 1)) {
        const apart = [0, 2].some(k => a.max[k] <= b.min[k] || b.max[k] <= a.min[k]);
        expect(apart).toBe(true);
      }
    }
  });
});

describe('the parks', () => {
  /** The lawns no tower stands on: the parks, whole blocks and empty lots. */
  const parks = (def: typeof ROOFTOPS) => {
    const all = skyline(def);
    return all.filter(
      l =>
        flat(l) &&
        !all.some(
          t =>
            !flat(t) &&
            t.min[0] < l.max[0] &&
            t.max[0] > l.min[0] &&
            t.min[2] < l.max[2] &&
            t.max[2] > l.min[2],
        ),
    );
  };
  /** The positions of the trees' vertices. */
  const stands = (def: typeof ROOFTOPS) => {
    const v = trees(def);
    return Array.from({ length: v.length / STRIDE }, (_, i) => v.slice(i * STRIDE, i * STRIDE + 3));
  };

  it('takes the place of some towers: whole blocks of lawn near the play area and out to the horizon', () => {
    for (const def of [ROOFTOPS, HIGHLINE]) {
      const { box, reach } = grid(def);
      const [cx, cz] = [(box[0] + box[1]) / 2, (box[2] + box[3]) / 2];
      const big = parks(def).filter(l => l.max[0] - l.min[0] > 45 && l.max[2] - l.min[2] > 45);
      const d = big.map(l =>
        Math.hypot((l.min[0] + l.max[0]) / 2 - cx, (l.min[2] + l.max[2]) / 2 - cz),
      );
      expect(d.filter(x => x < reach).length).toBeGreaterThanOrEqual(2);
      expect(d.filter(x => x > reach && x < MARKS).length).toBeGreaterThanOrEqual(10);
    }
  });

  it('grows tall trees on the parks alone, out to MARKS: each standing on a park, up to 15 to 25 m', () => {
    for (const def of [ROOFTOPS, HIGHLINE]) {
      const v = trees(def);
      expect(v.length % (3 * STRIDE)).toBe(0);
      expect(v.every(Number.isFinite)).toBe(true);
      // A few hundred trees, at about 30 triangles each near and 24 far.
      expect(v.length / STRIDE).toBeGreaterThan(20000);
      expect(v.length / STRIDE).toBeLessThan(90000);
      const pts = stands(def);
      const lots = parks(def);
      const { box } = grid(def);
      const [cx, cz] = [(box[0] + box[1]) / 2, (box[2] + box[3]) / 2];
      for (const [x, y, z] of pts) {
        // Over a park, crown and all, within a few metres of its edge; no higher than 25 m off the turf.
        expect(
          lots.some(
            l => x > l.min[0] - 4 && x < l.max[0] + 4 && z > l.min[2] - 4 && z < l.max[2] + 4,
          ),
        ).toBe(true);
        expect(y).toBeGreaterThanOrEqual(STREET);
        expect(y).toBeLessThan(STREET + 25);
        expect(Math.hypot(x - cx, z - cz)).toBeLessThan(MARKS + 10);
      }
      expect(Math.max(...pts.map(p => p[1]))).toBeGreaterThan(STREET + 20);
      // Green crowns, brown trunks: no colour of the paint is out of 0..1.
      for (let i = 0; i < v.length; i += STRIDE) {
        expect([v[i + 6], v[i + 7], v[i + 9]].every(c => c >= 0 && c <= 1)).toBe(true);
        expect(v[i + 8]).toBe(-1);
      }
    }
  });

  it('is the same every time', () => {
    expect(trees(ROOFTOPS)).toEqual(trees(ROOFTOPS));
  });
});
